# Sprint 207: a job prices the labour it demands

**Status: APPROVED (fix arc wave 1, playtest notes 2026-08-16, S2-1).**

**The finding:** a rolled "repair cams and timing" job paid Y14,705. Cams are an
engine-assembly member behind three external blockers; the true chain (blocker
removals, engine pull, bench repair, refit) costs 30 labour points with the machine
line and 58 without - about 72 per cent of a day's 80-point bar - of which the payout
formula counted only the repair climb plus one flat install figure. Teardown is
priced at zero by explicit omission (serviceJobs.ts:240-243).

**Levers (directive 22 as amended, behaviour-first):** the felt behaviour is that a
job's pay tracks the time it eats: a deep job that consumes most of a day pays like a
day's work, and a five-minute bolt-on pays like one. `laborRateYen` (Y6,000 per slot)
is already the canonical wrench-time price - the staff-wage invariant benchmarks
against it - and stays the single rate. No new rate constant is introduced; the change
is that ALL the labour a job demands now flows through the one rate that exists.
Guard re-pin carries this statement.

## Reuse analysis (directive 16)

**Reused:** every cost primitive already exists and is simply composed:
`occupiedBlockers` (per-slot, jobs.ts), `externalBlockersFor` (assembly-level,
assemblies.ts), `removeAssemblyLaborSlotsFor` / `refitAssemblyLaborSlotsFor`,
`removeLaborSlotsFor` / `installLaborSlotsFor` / `refitLaborSlotsFor`,
`planPartRepair` (the climb), `machineLaborMultiplier` (per gated step);
`deriveServiceJobPayoutYen` keeps its shape (cost + labour x rate x margin + callout)
and only its labour input changes; the career harness measures the result.

**New:** one sim function, `taskLaborChain(state|car, carPartId, targetBand, context)`,
returning the summed labour of: external-blocker removals, the removal (assembly pull
where the part is a member, plain removal otherwise), the repair climb (or install for
a buy-new task), the refit, and the blocker refits - each step at its own machine
multiplier. Nothing else is new.

## Tasks

- A1. `taskLaborChain` in sim, unit-tested against the hand-computed cams case
  (30 points machine-owned, 58 machine-less) and a shallow case (a bolt-on with no
  blockers costs what it always did).
- A2. `serviceJobCostBreakdown` reads it; payout prices the full chain at the
  machine-less rate the job actually faces at generation time (a customer pays for the
  shop they walked into, not a hypothetical equipped one).
- A3. The job offer shows the labour it will take alongside the payout, so the player
  can judge the trade before accepting - same figures idiom as every other control.
- A4. Guard re-pin with the felt-behaviour statement; the smoke career replays; the
  career report shows payout-per-labour-slot by job so the spread is visible.
- A5. Radial job GENERATION respects depth: a day-one shop rolls mostly shallow tasks,
  with deep teardowns appearing as rarer, visibly better-paying work. (One weighting,
  chosen behaviour-first: deep jobs should read as a prize, not a trap.)

## Definition of done

- The cams-class job pays in proportion to its chain; the shallow job is unchanged
  within rounding.
- No second labour rate exists anywhere; the invariant still holds.
- Offers disclose labour before acceptance.
- Narrowest tests once; the pre-push gate is the evidence.

## Exit

**Implemented 2026-08-16. All green.**

- `taskLaborChain` (new, packages/sim) composes the existing primitives into a priced
  breakdown per task; unit tests derive the cams expectation from content (30 points
  machine-owned, 58 machine-less) rather than pinning stale constants.
- Payouts price the chain at the shop's real machine state:
  the cams-class job moved Y18,216 to Y47,952 machine-less (Y28,128 with the line);
  the brake service moved Y9,602 to Y12,434. `laborRateYen` 6,000 remains the single
  rate; the staff-wage invariant still anchors to it.
- Offers disclose "about N labour" beside the payout, read from the same breakdown.
- Generation weights tasks by chain depth (`deepTaskWeightDecay` 0.65): deep
  teardowns land at roughly one offer in four or five. Felt statement recorded with
  the guard re-pin: a deep job is a prize you occasionally get offered, not the
  median phone call; when it comes, it pays like the day it eats.
- `generateDailyServiceJobOffers` takes the real `GameState`; smoke career and
  economy guard re-pinned (case (a): the payouts themselves changed).

**Evidence:** covered by the same full-suite run as Sprint 206's Exit (228 files /
4,684 tests, 0 failures; typecheck clean). The pre-push gate re-verifies at push.
