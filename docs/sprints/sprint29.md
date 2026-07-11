# Sprint 29: Service-jobs framework v2: themed jobs, progression, derived payouts, daily cadence

*Source: maintainer playtest 2026-07-11 (`docs/playtest-notes-2026-07-11.md`, notes 3, 4, 5,
17-jobs-half). Status: **designed, ready to implement.** Depends on Sprints 26-28. Single
Sonnet implementation agent; read `CLAUDE.md` first; no em dashes.*

## Why (verified diagnosis)

Today's generator picks uniformly from single-action job types with authored flat
`payoutRangeYen`, blind to part prices (install-FI pays 110-150k against a 180k cheapest
turbo: a guaranteed loss), blind to progression (install jobs are never gated at all, so a
new game's first job can be a turbo install), and refreshed as a weekly 4-offer dump. Note 5
names the requirement: a framework where progression, task combinations, flavor, and profit
math are designed properties, not per-entry guesses.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse (Sprint 08's lesson applies: there is ONE job system):**

- The whole active-job lifecycle: accept (with Sprint 25's next-morning arrival), parking
  gate, deadline via `dueOnDay`, `resolveServiceJob` payout/reputation application, give-up
  penalty, `isServiceWorkDone` (extended to a task list). No second job system.
- Sub-part repair/replace actions (Sprints 26-28) as the vocabulary of tasks; the staged-work
  and labor-slot economy as the execution layer.
- Reputation tiers (Sprint 15/16) as the progression gate; `GRADE_REPUTATION_MULTIPLIER`
  for reward scaling.
- The parts catalog median prices and the sub-part repair-cost formula as payout inputs
  (this is what makes payouts derived instead of authored).
- The balance harness + serviceGrinder/competentPolicy bots to validate the economics.

**Genuinely new mechanisms:**

- Job template schema v2 in content: `{ id, tier (1-4), tasks: [{ carPartId, action:
  'repair' | 'install', targetBand?, minGrade? }], flavorPool, deadlineDays,
  baseReputation }` (repair tasks name the band to reach; install tasks name the minimum
  part grade).
- The payout formula (below) and its profitability invariant test.
- Daily offer arrival on a 0-4 bell curve, replacing the weekly dump.

## Design decisions (locked)

1. **Payout is computed, never authored:**
   `payout = round((sum(taskCost) + laborDays * laborRateYen) * margin + calloutFeeYen)`
   where `taskCost` for an install is the median catalog price of fitting parts at the
   required grade for that specific customer car, and for a repair is the banded cost:
   steps from the customer car's current band to the template's `targetBand`, times that
   part's `stepCostYen` (Sprint 26); `margin` rolls uniform in `[marginMin, marginMax]` (propose 1.20-1.45);
   `laborRateYen` and `calloutFeeYen` are content tunables. **Invariant (tested property):
   for every template x every eligible roster model, the WORST payout roll covers the
   player's minimum achievable cost by at least 1.15x.** This structurally retires note 5.
2. **Tiers gate offers by reputation:** tier 1 at `unknown` (tyres + pads, coilover install,
   cooling service, battery/electrics), tier 2 at `local` (clutch, dampers + springs, small
   bodywork), tier 3 at `known` (gearbox, differential, respray, retrim), tier 4 at
   `respected` (forced-induction conversions on NA customer cars, turbo or supercharger via
   the universal FI slot, engine internals rebuilds, themed restorations). A turbo install
   can never be the first job again.
3. **Themed multi-task templates** (12-20 across tiers, content-authored): e.g. "put her in a
   ditch" (repair panels + dampers + fit street tyres), "track day Friday" (brakePadsDiscs +
   dampers + cooling), "shaken prep", "tired commuter revival". Flavor pools are written per
   template so text always matches the work (keep the Sprint-era rule: flavor can never
   contradict `tasks`). Multi-task completion requires all tasks done; partial hand-back is
   the existing failure path. A repair task always targets a band above scrap (Sprint 26
   decision 5: scrap is unrepairable): a template whose premise implies a wrecked part (the
   ditch story is the obvious case) uses an `install` task on that part instead of `repair`,
   so the customer is effectively paying for a replacement, not a patch job.
4. **Cadence (note 17, jobs half):** per day, offer count ~ bell over 0-4 with weights
   `[0.05, 0.22, 0.42, 0.23, 0.08]` (content tunable), drawn from templates the player's
   reputation tier unlocks; equipment-aware filtering keeps the current 15%-hint mechanic for
   repair-kind tasks. Offers expire as today (10 days, tunable). Board pressure is the point:
   more offers than a solo wrench can take.
5. **Copy:** completion and offer copy built from display names and template strings; the
   Sprint 25 no-raw-ids test extends to job copy.

## Definition of Done

- Template schema + content set shipped; generator, acceptance, resolution, deadline paths
  all running on v2 with the profitability invariant test green across the full roster.
- Daily-cadence generation with tests (distribution shape via seeded draws, tier gating,
  equipment filtering).
- Bots updated to evaluate multi-task jobs (accept if expected profit per labor slot clears a
  threshold); balance run + invariant check re-run; job-economy numbers (median profit per
  tier) reported in Exit.
- Full gate green; old `serviceJobs.json` archived.

## Tasks (Claude-implementable)

- [ ] Content: schema v2 + template set + tunables (margin, labor rate, callout fee, arrival
  weights).
- [ ] Sim: payout derivation, generation cadence, multi-task `isServiceWorkDone`, tier
  gating; Dexie bump + migration + golden saves (offer shape changes).
- [ ] Game: offer cards (task list, payout, deadline), completion modal copy.
- [ ] Bots + balance re-run; tests per DoD; Exit.

## User-only tasks

- [ ] Write or edit template flavor text where wanted (content JSON); playtest tier-1 opening
  hours of a new game.

## Exit

*(Filled at implementation.)*
