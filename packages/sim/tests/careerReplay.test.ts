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
//
// Re-pinned for the evidence-frozen-at-acquisition fix (knowledge-and-
// diagnosis.md rulings-ledger item 14): `CarInstance` gains
// `acquisitionEvidenceDelta`, set on the script's day-1 buyout and present
// on every subsequent day's snapshot - the whole sequence moves even though
// the script never repairs or resells the car (so no actual estimate or
// price this script exercises changed value, only the state shape gained
// the new field). Re-derived from a real run, never hand-guessed.
// `smoke.script.json`'s own two `kind: 'hash'` checkpoints (days 1 and 10)
// move with this array; the day-7 `cashAtMost` ceiling is unchanged, since
// no cash movement in this script is priced off the knowledge model.
//
// Re-pinned for metalwork ruining the paint over it: beating, welding or
// filling a zone now bares its finish, and the repair-bill walker prices
// the resulting repaint chain into a zone-model body carrier's cost. The
// day-1 buyout car's body carries metal damage under otherwise intact paint
// on several panels, so its guide value - and so the buyout price struck
// for it - reads correctly lower, moving the whole sequence from day one
// even though the script never touches the body pipeline itself. Re-derived
// from a real run, never hand-guessed. `smoke.script.json`'s own three
// checkpoints (the two `kind: 'hash'` on days 1 and 10, and `kind:
// 'cashAtMost'` on day 7, whose pinned ceiling moved with the day-7 cash
// figure - less was spent on the buyout, so more cash remains) move with
// this array.
//
// Re-pinned for the repair job engine's two new state fields: `GameState`
// gains `benchParts` and `lift`, both seeded empty by
// `createInitialGameState` and present on every day's snapshot, so the whole
// sequence moves even though the script never places a part on a bench or
// buys a lift. A pure SHAPE change, measured rather than assumed: strip the
// two new keys back out of the day-1 and day-10 states and their hashes are
// exactly the previous `d1fd027b` and `e61c3d6f`, so no roll, cash figure or
// derived stat moved. `smoke.script.json`'s own two `kind: 'hash'`
// checkpoints (days 1 and 10) move with this array; the day-7 `cashAtMost`
// ceiling, the day-10 `carsOwned` count and the day-10 `reputationTier` are
// all unchanged and still pass, which is the proof the old repair path is
// untouched. Re-derived from a real run, never hand-guessed.
//
// Re-pinned for the access-and-hire rework, and exactly two things move the
// sequence. First, `GameState` loses `machineListing` and
// `nextMachineListingDay` outright, so both keys leave every day's snapshot.
// Second, `energy.actionPoints.benchFitMember` 0 -> 2 puts a real cost on
// fitting an assembly member, and the room's chain-priced sheet walks that
// same labour chain, so the day-1 buyout of `lot-1-local-yard-0` (a '88 Honda
// Today) is struck at 44,364 -> 43,704 yen. The script's other two money
// events are unmoved to the yen (the express `stock-block` at 28,160 and its
// resale at 7,680), so cash runs 660 yen richer from day 1 onward and
// `smoke.script.json`'s day-7 `cashAtMost` ceiling moves 215,156 -> 215,816
// with it. Measured rather than assumed: re-add the two keys as `null` and
// price a member fit at 0 points again, and all ten hashes are exactly the
// previous sequence and day-7 cash is exactly 215,156. That equality also
// proves the third candidate cause moves nothing here - `advanceDay` losing
// its classifieds step consumed no rng in this career, since reputation
// never leaves `unknown` (the day-10 checkpoint still asserts it) and the
// roll never had an eligible rung to draw from. The day-10 `carsOwned` count
// and `reputationTier` are unchanged and still pass. Re-derived from a real
// run, never hand-guessed.
//
// Re-pinned for the re-based quote, and the whole CASH movement is one
// number: the day-1 buyout of `lot-1-local-yard-0` is struck at 43,704 ->
// 38,410 yen. Two causes move it, and they pull opposite ways. Pricing a
// symptom candidate's fix through the job model (the smallest job that
// reaches `fine`, its banded parts bill and its full labour chain) costs
// MORE than the band climb it replaced, so the room's fear-priced discount
// grows and the lot is struck 6,181 yen cheaper; naming a day's tool hire
// only where a welding or machining step forces one then gives 887 of that
// back. The script's other two money events are unmoved to the yen (the
// express `stock-block` at 28,160 and its resale at 7,680), so cash runs
// 5,294 yen richer from day 1 onward: 241,110 through day 4, 221,110 from
// the day-5 rent, 201,110 after day 10's. `smoke.script.json`'s day-7
// `cashAtMost` ceiling is re-derived from that run, 215,816 -> 221,110,
// which is 215,816 + 5,294 exactly. The hash carries more than the cash:
// the day's service-job board is state too, and both which templates are
// offerable (the band decides it now, not a tool tier) and what each offer
// quotes have moved. This career rejects its one offer, so none of that
// reaches the till. Measured rather than assumed: restore
// the superseded "any tier 2 step names a day" rule and the sequence is
// exactly `2bfb5ee5 44a5d784 175882ec d4ccde3e cc8ce89d 362d2785 e176b191
// 8b891810 c364ea16 ba296922` with the buyout at 37,523 and day-7 cash at
// 221,997, which is the first step on its own. The day-10 `carsOwned`
// count and `reputationTier` are unchanged and still pass. Re-derived from
// a real run, never hand-guessed.
// Re-pinned for a body task's labour, and nothing else moves. The two
// zone-derived carriers have no bench recipe, so a quote priced their work at
// nothing; a body task's labour is now the body pipeline's own stages
// (`bodyPartRepairLabourPoints`, walked off the same `planZoneRepair` the
// carrier's money bill uses) at `energy.bodyStagePoints`. That reprices only
// the `small-bodywork-touchup` offers this career's board draws. Day 1 is
// UNCHANGED at `2042bc88` because day 1's board holds one offer and it is a
// `coilover-install`; the first body offer lands on day 2 (16,384 -> 20,147)
// and the sequence moves from there. Not one yen reaches the till - this
// career rejects its only offer and never takes a commission - so cash is
// 241,110 through day 4, 221,110 from the day-5 rent and 201,110 after day
// 10's, exactly as before, and the day-7 `cashAtMost` ceiling, the day-10
// `carsOwned` count and the day-10 `reputationTier` are all unchanged and
// still pass. Every non-body offer on every day is unmoved to the yen.
// Measured rather than assumed: price a body carrier's repair at its (absent)
// bench recipe again and the sequence is exactly the previous `2042bc88
// 4f9e8fa5 19b41f44 e02f7782 5d20a23a 093a0210 405678ac 8f8c87ff d55ce832
// b33ac3c9` with day-7 cash at 221,110. `advanceDay.test.ts`'s own two
// goldens are unmoved for the same reason day 1 is: its 30-day master board
// ends on a single `stand-owner-service-job` offer, whose tasks are
// `ignitionEcu` and `fuelSystem`. `smoke.script.json`'s day-10 `kind: 'hash'`
// checkpoint moves with this array; its day-1 one does not. Re-derived from a
// real run, never hand-guessed.
//
// Re-pinned for the buried-access rig day's retirement, and the whole CASH
// movement is again one number: the day-1 buyout of `lot-1-local-yard-0` is
// struck at 38,410 -> 51,005 yen, so the career runs 12,595 POORER from day 1
// onward (228,515 through day 4, 208,515 from the day-5 rent, 188,515 after day
// 10's) and `smoke.script.json`'s day-7 `cashAtMost` ceiling is re-derived from
// that run at 208,515 - the run's own figure with zero slack, tightened rather
// than loosened. Reaching a buried slot no longer names a day's tool hire,
// because nobody is forced to buy one: `accessRoute` (jobs.ts) works a buried
// slot by hand at `toolHire.slogMultiplier` energy for no yen, so only a
// welding or machining step forces a day (`forcedHireDayFor`, repairJobs.ts).
// That fee was reaching a VALUATION through `candidateFixCostYen`, so the
// room's fear-priced deduction on this car's `crunch-into-second` falls 32,446
// -> 19,851 (-12,595) and the sheet's guide value rises by exactly that, which
// is the buyout to the yen. The script's other two money events are unmoved
// (the express `stock-block` at 28,160 and its resale at 7,680). Measured
// rather than assumed: restore the retired buried-access day and the sequence
// is exactly the previous `2042bc88 27ad3fe5 82e2ed78 38ec039e 931eab6e
// a908c340 fa88344c ba101ab6 3cc7d5bb 282726da` with the buyout at 38,410 and
// day-7 cash at 221,110, so nothing else in this career moved. The day-10
// `carsOwned` count and `reputationTier` are unchanged and still pass, and
// `advanceDay.test.ts`'s own two goldens do not move at all: neither script
// prices a symptom candidate or quotes a buy-new task on a buried slot.
// Re-derived from a real run, never hand-guessed.
const EXPECTED_HASHES_BY_DAY = [
  'a571205c',
  '595fb5a5',
  '1931ba90',
  '92edcc5e',
  'db22c8e2',
  '1c38e664',
  '3e041c28',
  'c9fb84fa',
  '2fcec9a3',
  'bebb9bf9',
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
