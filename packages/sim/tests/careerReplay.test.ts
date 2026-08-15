import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  TOOL_LINES,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { replayCareerScript } from '../src/careerReplay'
import { CareerScriptSchema } from '../src/careerScript'
import { buildSimContext } from '../src/context'
import smokeScriptRaw from '../src/careerScripts/smoke.script.json'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
  TOOL_LINES,
  ECONOMY,
)

const SMOKE_SCRIPT = CareerScriptSchema.parse(smokeScriptRaw)

// Pinned by an actual run of the smoke script against seed 1's real day-1
// board (a buyout, a cart checkout, a part sale, a declined service-job
// offer and a tutorial-step acknowledgement on day 1, then idle days
// through two rent boundaries on days 5 and 10 - the five-day week,
// sprint204.md). Re-derive from a real run, never hand-guessed, exactly
// like `advanceDay.test.ts`'s own golden hashes.
//
// Days 5 onward move for the fashion wave retune (`WAVE_PERIOD_WEEKS`
// 24 -> 14, `WAVE_AMPLITUDE` 12 -> 22): the market-heat update at the day-5
// week boundary now reads a different point on a shorter, taller wave for
// every model, moving every day-5-and-later state; the first four days,
// before any week boundary fires, are untouched. Re-derived from a real
// run.
const EXPECTED_HASHES_BY_DAY = [
  '5b3e2cef',
  '81e79a0b',
  'c469febb',
  'ba7e2576',
  'e3e9fbeb',
  '640ee552',
  '23862460',
  'de24a6f2',
  '0e0e72fa',
  'a8049eed',
]

describe('replayCareerScript (Sprint 198 C1)', () => {
  it('replays the smoke script to the pinned per-day hash sequence', () => {
    const result = replayCareerScript(SMOKE_SCRIPT, CONTEXT)
    expect(result.hashesByDay).toEqual(EXPECTED_HASHES_BY_DAY)
    expect(result.finalState.day).toBe(SMOKE_SCRIPT.days.length + 1)
  })

  it('is deterministic: the same script and seed reproduce the same hash sequence', () => {
    const first = replayCareerScript(SMOKE_SCRIPT, CONTEXT)
    const second = replayCareerScript(SMOKE_SCRIPT, CONTEXT)
    expect(second.hashesByDay).toEqual(first.hashesByDay)
    expect(second.finalState).toEqual(first.finalState)
  })

  it('every checkpoint the smoke script declares passes', () => {
    const result = replayCareerScript(SMOKE_SCRIPT, CONTEXT)
    // C2: checkpoints disclose, they never hard-gate - this test asserts
    // the smoke script's own calibrated checkpoints hold, which is a
    // property of the fixture (and this replay), not a general rule the
    // runner itself enforces.
    const failed = result.checkpoints.filter((c) => !c.passed)
    expect(failed).toEqual([])
    expect(result.checkpoints.length).toBeGreaterThan(0)
  })

  it('reports a day-1 log that carries every event the script fired', () => {
    const result = replayCareerScript(SMOKE_SCRIPT, CONTEXT)
    const day1Types = result.dayLogs[0]?.map((entry) => entry.type)
    expect(day1Types).toContain('lot-bought-out')
    expect(day1Types).toContain('part-bought')
    expect(day1Types).toContain('part-sold')
  })

  it("reports the day-5 rent charge in that day's log, not folded into another day", () => {
    const result = replayCareerScript(SMOKE_SCRIPT, CONTEXT)
    const day5Types = result.dayLogs[4]?.map((entry) => entry.type)
    expect(day5Types).toContain('rent-paid')
  })

  it('throws when a script skips a day rather than silently reprocessing the wrong one', () => {
    const gappy = CareerScriptSchema.parse({
      ...SMOKE_SCRIPT,
      name: 'gappy',
      days: [
        { day: 1, events: [], checkpoints: [] },
        { day: 3, events: [], checkpoints: [] },
      ],
    })
    expect(() => replayCareerScript(gappy, CONTEXT)).toThrow(/expected day 2/)
  })

  // seed 1's real day-1 buyout car (`car-lot-1-local-yard-0`, a '88 Honda
  // Today JW1), discovered by running the resolvers the same way
  // smoke.script.json's own ids were found rather than invented. Every
  // engine slot machine-gated for `remove` (`block`, `internals`,
  // `headValvetrain`, `camsTiming`) is a member of `engineAssembly`, so it
  // comes off as a unit; the assembly's own external blockers - `intake`,
  // `exhaust`, `cooling`, none of them gated or assembly members themselves -
  // have to come off individually first.
  const CAR_ID = 'car-lot-1-local-yard-0'

  function engineRemovalScript(name: string, hireEngineLine: boolean) {
    return CareerScriptSchema.parse({
      ...SMOKE_SCRIPT,
      name,
      days: [
        {
          day: 1,
          events: [
            { type: 'buyout', payload: { lotId: 'lot-1-local-yard-0' } },
            ...(hireEngineLine
              ? [{ type: 'hireMachineLine' as const, payload: { group: 'engine' as const } }]
              : []),
            { type: 'removePart' as const, payload: { carId: CAR_ID, carPartId: 'intake' } },
            { type: 'removePart' as const, payload: { carId: CAR_ID, carPartId: 'exhaust' } },
            { type: 'removePart' as const, payload: { carId: CAR_ID, carPartId: 'cooling' } },
            {
              type: 'removeAssembly' as const,
              payload: { carId: CAR_ID, assemblyId: 'engineAssembly' },
            },
          ],
          checkpoints: [],
        },
      ],
    })
  }

  it("a machine hire preceding gated removal work changes the day's labour spend, reproducibly", () => {
    // A recording that hires the engine line before pulling the engine
    // assembly must replay at the same rate as the real session, not the 3x
    // machineless rate a missing session event would silently fall back to.
    // Two scripts that both hire reproduce the same spend; the one that
    // never hires spends more for the identical removal.
    const hiredFirst = replayCareerScript(engineRemovalScript('hired-first', true), CONTEXT)
    const hiredSecond = replayCareerScript(engineRemovalScript('hired-second', true), CONTEXT)
    const unhired = replayCareerScript(engineRemovalScript('unhired', false), CONTEXT)

    const hiredLabour = hiredFirst.snapshots[0]!.labourSlotsUsed
    const unhiredLabour = unhired.snapshots[0]!.labourSlotsUsed

    expect(hiredLabour).toBeGreaterThan(0)
    expect(hiredSecond.snapshots[0]!.labourSlotsUsed).toBe(hiredLabour)
    expect(unhiredLabour).toBeGreaterThan(hiredLabour)
  })
})
