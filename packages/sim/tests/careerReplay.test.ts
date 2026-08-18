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
// Every day's hash carries the counter-minted part-instance ids
// (`GameState.partInstanceCounter`; the script's day-1 express purchase
// mints `part-0`) and the chain-priced service-job offers
// (`taskLaborChain`), so any change to either moves the whole sequence.
// `smoke.script.json`'s own two `kind: 'hash'` checkpoints (days 1 and 10)
// move with this array. Re-derived from a real run.
//
// Re-pinned for sprint208.md (the body bay): `GameState` gains
// `bodyBayCarId`, seeded `null` by `createInitialGameState` from day one -
// present on every day's snapshot, so every hash in the sequence moves even
// though the script never touches the body pipeline itself. No behaviour
// this script exercises changed; only the state shape did.
//
// Re-pinned for sprint210.md task A2: the newsstand owner leaves
// `serviceJobCustomerNames.json`'s Tier 3 pool (promoted to a named Tier 2
// character, community-jobs.md), which shortens the pool `rng.pick` draws
// customer names from. This script's own day-1 radial offer (rejected at
// `svc-1-0`) draws from that same pool, so every subsequent RNG-derived draw
// in the run shifts and the whole hash sequence moves - the pool losing one
// entry, not a behavioural change. `smoke.script.json`'s own two `kind:
// 'hash'` checkpoints (days 1 and 10) move with this array.
//
// Re-pinned for sprint212.md task A (the assembly refit set figure):
// `energy.actionPoints.refitAssembly` 0 -> 6 re-prices every chain-priced
// service-job offer touching an assembly member (`taskLaborChain`), which
// moves days 4-8's hashes (the script's later-day service-job offers); days
// 1-3 and 9-10 are unaffected since no offer generated on those days prices
// an assembly member's refit. Re-derived from a real run, never hand-guessed.
//
// Re-pinned for sprint213.md (the flip economy): every lever the sprint
// moved - the per-tier `marketRepairDiscount`, the new excellence premium,
// the affinity/quality curve, tier-1 `energyPerBandStepByToolTier`, and both
// `laborRateYen`/`calloutFeeYen` - reprices every valuation and every
// chain-priced service-job offer the script's day-1 board draws (the buyout,
// the declined radial offer, every later day's own offers), so the whole
// sequence moves. No behaviour this script exercises changed in kind, only
// in the yen and point figures it now prices at. Re-derived from a real run,
// never hand-guessed. `smoke.script.json`'s own two `kind: 'hash'`
// checkpoints (days 1 and 10) move with this array.
//
// Re-pinned for sprint215.md (the knowledge model): `CarInstance` gains
// `verifiedSlots`, seeded at every acquisition, and generation gains the
// hidden non-stock roll (task E), one extra `rng.next()` draw per generated
// car regardless of outcome - the whole sequence moves even though the
// script's own actions are unchanged. No behaviour this script exercises
// changed in kind. Re-derived from a real run, never hand-guessed.
// `smoke.script.json`'s own two `kind: 'hash'` checkpoints (days 1 and 10)
// move with this array.
//
// Re-pinned for sprint216.md (latents and the fearful room): `CarSymptom`
// gains `latent`, and generation gains the independent latent roll (task A),
// one to three extra `rng.next()` draws per generated car depending on how
// many latents land - the whole sequence moves even though the script's own
// actions are unchanged. The room's own sheet price also moved to the
// fear-biased chain-priced formula (task C), reshaping every guide-value-
// derived figure the script's buyout and offers touch. No behaviour this
// script exercises changed in kind. Re-derived from a real run, never
// hand-guessed. `smoke.script.json`'s own three checkpoints (the two
// `kind: 'hash'` on days 1 and 10, and `kind: 'cashAtMost'` on day 7, whose
// pinned ceiling moved with the day-7 cash figure) move with this array.
//
// Re-pinned for sprint218.md (workshop tests and symptom service jobs): the
// daily service-job offer draw now also considers a resolveSymptom template,
// which changes which templates are eligible and how the weighted draw
// consumes the shared RNG stream regardless of whether one is ever picked -
// the whole sequence moves even though the script's own actions are
// unchanged. No behaviour this script exercises changed in kind. Re-derived
// from a real run, never hand-guessed. `smoke.script.json`'s own `kind:
// 'hash'` checkpoints (days 1 and 10) move with this array.
const EXPECTED_HASHES_BY_DAY = [
  'a434d010',
  '19a2f795',
  'cb9a564c',
  'd8d05b62',
  '30795823',
  '0d57fd20',
  '44d4c9c6',
  '3806c7b8',
  'b5149d2a',
  'cd004c23',
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

  it('replays playClockPaused/playClockResumed as pure no-ops (dev-only playtest-clock instrumentation)', () => {
    const withClockEvents = CareerScriptSchema.parse({
      ...SMOKE_SCRIPT,
      name: 'playtest-clock-events',
      days: [
        {
          day: 1,
          events: [
            { type: 'playClockPaused', payload: { activeMs: 1000 } },
            { type: 'playClockResumed', payload: { activeMs: 1000 } },
          ],
          checkpoints: [],
        },
      ],
    })
    const idle = CareerScriptSchema.parse({
      ...SMOKE_SCRIPT,
      name: 'playtest-clock-idle',
      days: [{ day: 1, events: [], checkpoints: [] }],
    })

    const withEvents = replayCareerScript(withClockEvents, CONTEXT)
    const withoutEvents = replayCareerScript(idle, CONTEXT)

    expect(withEvents.finalState).toEqual(withoutEvents.finalState)
    expect(withEvents.dayLogs).toEqual(withoutEvents.dayLogs)
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
