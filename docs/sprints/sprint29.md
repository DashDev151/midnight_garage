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

- [x] Content: schema v2 + template set + tunables (margin, labor rate, callout fee, arrival
  weights).
- [x] Sim: payout derivation, generation cadence, multi-task `isServiceWorkDone`, tier
  gating; Dexie bump + migration + golden saves (offer shape changes).
- [x] Game: offer cards (task list, payout, deadline), completion modal copy.
- [x] Bots + tests per DoD; Exit. Balance re-run is explicitly the orchestrator's step (not run
  by this implementation pass - see Exit).

## User-only tasks

- [ ] Write or edit template flavor text where wanted (content JSON); playtest tier-1 opening
  hours of a new game.

## Exit

**Status: implemented, full gate green. Balance harness NOT re-run by this pass (explicit
instruction - orchestrator owns interpretation of the days-to-`local` shift); see the last
subsection below for what to check.**

### Reuse vs. new (confirms the design's own reuse analysis held)

Reused unchanged: the active-job lifecycle (accept/arrival/deadline/`resolveServiceJob`
payout+reputation/give-up), Sprints 26-28's repair/install sub-part vocabulary and staged-work +
labor-slot execution layer (a service job's tasks resolve through the exact same
`repair-zone`/`install-part` `Job`s and `carPartId` addressing the player already uses on owned
cars - no new job kind), reputation tiers + `GRADE_REPUTATION_MULTIPLIER`, the parts catalog +
`partFitsCar`/banded repair-cost formula as payout inputs. Genuinely new: template schema v2
(`tasks` list replacing single `work`), the derived-payout formula + its profitability invariant,
and daily bell-curve generation replacing the weekly dump. No second job system was stood up.

### Template set (17 total, `packages/content/data/serviceJobTemplates.json`)

| Tier | Count | Templates |
| --- | --- | --- |
| 1 (`unknown`) | 4 | tyres-and-pads-service, coilover-install, cooling-system-service, electrics-once-over |
| 2 (`local`) | 5 | clutch-swap, suspension-refresh, small-bodywork-touchup, put-her-in-a-ditch, shaken-prep |
| 3 (`known`) | 4 | gearbox-rebuild, differential-upgrade, full-respray, interior-retrim |
| 4 (`respected`) | 4 | forced-induction-conversion, race-turbo-upgrade, engine-internals-rebuild, full-restoration |

Old `serviceJobs.json` archived unchanged at `packages/content/archive/serviceJobs.json` (same
convention as `hidden-issues.json`).

### Payout formula wiring

`payout = round((taskCostYen + laborSlots * laborRateYen) * margin + calloutFeeYen)`
(`serviceJobs.ts`'s `deriveServiceJobPayoutYen` + `serviceJobCostBreakdown`):
`taskCostYen` sums a repair task's banded-steps cost (`gradesBetween(currentBand, targetBand) *
stepCostYen`, 0 for an already-satisfied or scrap part) and an install task's *median* fitting
catalog price at (preferring exactly, falling back to at-least) `minGrade`; `laborSlots` assumes
base level-1 repair speed regardless of the shop's real equipment (a market rate for "wrench
time," not tied to how fast the player personally works); `margin` rolls uniform in
`[marginMin, marginMax]` = `[1.20, 1.45]`; `laborRateYen` = ¥6,000/slot, `calloutFeeYen` = ¥5,000
(all four in `economy.json`'s new `serviceJobs` block, alongside `dailyOfferCountWeights =
[0.05, 0.22, 0.42, 0.23, 0.08]`).

### Profitability invariant - PASSED

`packages/sim/tests/serviceJobPayout.test.ts`: for every one of the 17 templates x all 10 roster
models x 4 starting bands (`poor`/`worn`/`fine`/`scrap`) = 680 combinations, the worst payout roll
(`margin = marginMin`) covers the player's independently-computed minimum achievable cost by at
least 1.15x. Holds structurally, not by luck: a repair task's cost is identical on both sides of
the comparison (no player choice), so its coverage ratio reduces to `marginMin` itself (1.20) plus
positive labor/callout headroom; an install task's true cheapest option (searched over the full
"grade >= minGrade" set) is never above the payout formula's own median-of-the-narrowest-tier
basis (a subset's median can't be below the full set's minimum) - see that function's doc comment
for the full argument. Representative numbers (`marginMin`/`marginMax` worst/best, typical-margin
median gross profit = payout minus taskCost, worn starting condition, honda-city-e-aa unless
noted):

- `tyres-and-pads-service` (tier 1): taskCost ¥22,000, payout ¥60,200-¥71,700 (2.74x worst-case
  coverage).
- `coilover-install` (tier 1): taskCost ¥69,000, payout ¥95,000-¥113,750 (1.38x).
- `forced-induction-conversion` (tier 4): taskCost ¥212,500, payout ¥267,200-¥321,825 (1.26x).
- `race-turbo-upgrade` (tier 4): taskCost ¥540,000, payout ¥660,200-¥796,700 (1.22x) - the
  guaranteed-loss shape from note 5 (a big-ticket install underpaying the cheapest fitting part)
  is exactly what this number rules out: even the worst roll on the single priciest template
  still clears cost by a real margin.
- Median gross profit by tier (typical margin, worn start, across all 17 x 10 = 40-50 samples per
  tier): tier 1 ¥35,375; tier 2 ¥45,575; tier 3 ¥63,325; tier 4 ¥188,450 - profit scales with tier
  as intended, tier 4's jump reflecting forced-induction/engine-internals material costs.

(Numbers computed via a disposable scratch script against the real `deriveServiceJobPayoutYen`,
not hand-derived - not committed, per the clean-codebase rule; reproducible from the test file's
own fixtures.)

### Dexie v17 -> v18 migration

`SAVE_VERSION` 17 -> 18. `ServiceJobSchema.work` (`{kind, componentId}`) -> `tasks:
ServiceJobTask[]`, plus a new required `deadlineDays`. Two populations, treated differently per
the sprint doc's own explicit call:

- **`activeServiceJobs` (in-flight, accepted) - KEPT, migrated.** Each entry's old `work` maps to
  a ONE-task list (`GROUP_TO_REPRESENTATIVE_PART`, a hardcoded historical table mirroring
  `OLD_GROUP_TO_NEW_PARTS`'s own v15->v16 precedent): `kind: 'repair'` -> `{action: 'repair',
  carPartId: <representative part for that group>, targetBand: 'mint'}`; `kind: 'install'` ->
  `{action: 'install', carPartId: <representative part>, minGrade: 'stock'}` (the most permissive
  floor, since the old model had no grade requirement at all). Already-rolled `payoutYen` and
  `dueOnDay` are left untouched (never re-derived, per the sprint doc's instruction).
  `deadlineDays` is backfilled from the real `dueOnDay - arrivesOnDay` gap when both are known
  numbers, or a flat 7-day historical fallback otherwise (cosmetic only - `dueOnDay` itself is
  already fixed either way, so this never changes when an in-flight job is actually due).
- **`serviceJobOffers` (not yet accepted) - DROPPED.** Offers refresh daily under the new cadence
  and represent no player commitment, so guessing a representative task list for each one is pure
  downside (a wrong guess could misrepresent the board) for no real benefit (the board refills
  correctly within a day or two either way).

Four new tests in `saveCodec.test.ts`'s `v17 -> v18 migration` describe block cover: an in-flight
repair job's `work` -> one-task mapping (deadlineDays reconstructed from the real gap), an
in-flight install job's mapping (stock floor, deadlineDays falls back to 7 since `arrivesOnDay`
was null), offers dropped, and a current-schema multi-task job round-tripping exactly. The
pre-existing v15->v16 describe block's old "remaps a ServiceJobWork componentId" assertion was
replaced with one confirming the SAME fixture's offer is now dropped by the later v17->v18 step
(it's no longer observable mid-chain through the public `decodeSave` API).

### Bots

`serviceGrinderStrategy` keeps its "never touches the parts market" identity - now filters to
templates whose task list is repair-ONLY (was: `work.kind === 'repair'`), working every task via
the new shared `bots/serviceJobHelpers.ts`. `competentPolicyStrategy` (the days-to-`local`
measurement probe) now accepts and works ANY multi-task offer (repair+install mixed), the
"well-rounded operator" its own doc comment claims. Both gate acceptance on
`expectedProfitPerLaborSlot(offer, context) >= MIN_PROFIT_PER_LABOR_SLOT_YEN` (¥3,000/slot, a
deliberately modest floor since the invariant above already guarantees real margin on every
offer) and on owning (or same-tick affording) every repair task's group equipment.

**A real bug found and fixed along the way, not a design change:** wiring
`queueServiceJobTasks` initially copied `investor.ts`'s "predict this tick's `partInstanceId`"
pattern for install jobs. That pattern is structurally broken - `advanceDay` resolves `createJobs`
(step 1) before `buyParts` (step 1b), so a job created the same tick as the purchase it depends on
always fails `installFitGate` (the part isn't in inventory yet). Measured impact before the fix:
a seed-1 100-day `competentPolicyStrategy` career ended at 0 reputation points, `unknown` tier,
-¥184,659 cash (repeatedly buying parts that never got installed). Fixed in
`serviceJobHelpers.ts` by splitting buy and install across two different ticks (buy this tick if
nothing fitting is owned yet; install a LATER tick once the purchase is genuinely present in
`state.partInventory`). Same seed-1 career after the fix: 150 reputation points, `respected` tier,
+¥132,185 cash, 18 service jobs completed vs. 1 failed. `investor.ts` itself has the identical
latent bug and was deliberately left untouched (out of this sprint's file scope) - flagged in
`TODO.md`'s Open engineering section for a future fix + balance-harness re-measurement of
Investor's payback-curve numbers, which were measured against the broken behavior all along.

### Golden hashes

None re-pinned. This sprint has no golden-master seed-hash test (`hashState.test.ts` covers
unrelated state); the Dexie golden-save assertions are the four new v17->v18 tests plus the
existing suite, all passing against real encode/decode round-trips, not pinned hash literals.

### Final gate (all green)

- `pnpm typecheck` - clean across content/sim/game.
- `pnpm lint` - clean, no findings.
- `pnpm format` - clean (7 files needed `format:fix` mid-sprint for the new/changed files; verified
  clean afterward).
- `pnpm test` - **699/699 passing** across 69 files (content 33, sim 411 incl. the new
  profitability invariant + rewritten `serviceJobs.test.ts`, game 255 incl. rewritten
  `gameStore.jobs.test.ts`).
- `pnpm test:coverage` - thresholds cleared (statements 88.71% / branches 77.52% / functions
  90.62% / lines 92.59%, all above the 80/65/78/82 gate).
- `pnpm build` - succeeds.

### Left for the orchestrator

- **`pnpm balance:run` + `python -m balance.cli check`, not run by this pass** (explicit
  instruction). The days-to-`local` invariant (competent-policy-probe-driven) will almost
  certainly shift from Sprint 25's measured p50=30 - direction unknown in advance: the daily
  cadence should offer MORE total jobs over a career than the old weekly-4 dump, but tier gating
  now blocks big-reputation install jobs (tier 4) until `respected`, where the old ungated system
  let SOME install offers appear earlier. Whether the net effect speeds up or slows down the
  `local` climb is an empirical question for the real harness, not something to guess from the
  unit-level numbers above.
- Whether `MIN_PROFIT_PER_LABOR_SLOT_YEN` (¥3,000, both bots) needs retuning once real balance
  numbers exist - currently a deliberately conservative floor, not derived from measurement.
- The `investor.ts` predicted-`partInstanceId` bug (see Bots section above) - fix + re-measure
  Investor's payback-curve numbers, tracked in `TODO.md`.
- User-only: write/edit template flavor text, playtest a new game's tier-1 opening hours.

### Balance verification (orchestrator-run: `pnpm balance:run` + `check`)

Sprint 29 is a clear economic win, and after one maintainer-approved band retune all hard
invariants PASS. Key deltas vs Sprint 27/28 (which were balance-identical):

| Strategy (day100 median cash) | Sprint 27/28 | Sprint 29 |
| --- | --- | --- |
| service-grinder (grinds jobs) | Y41,582 | Y726,579 |
| competent-policy (the probe) | -Y32,244 | +Y250,110 |
| Flipper / buyout share / sanity floor / auction tails | (stable) | (stable) |

Service jobs went from guaranteed-loss to genuinely profitable (the sprint's entire goal), and
the fixed competent-policy `partInstanceId` bug turned its career from red to solidly positive.
`investor` stays at -Y96,296: it carries the identical, untouched latent bug (out of this
sprint's file scope, tracked in TODO.md), so its number will move only when that is fixed.

**Days-to-`local` invariant: retuned, maintainer-approved.** As predicted it shifted, p50 dropped
16 -> 11 (the working v2 system plus the bot fix accrue reputation faster). The Sprint-23 `[15,35]`
floor was calibrated against the old (and partly broken) probe, so it is stale, not a regression.
Per the maintainer's call, `DAYS_TO_LOCAL_BAND` floor lowered 15 -> 10 in `invariants.py` (ceiling
kept at 35); p50=11 now PASSES with the guard still catching a trivial (<10-day) or grindy (>35)
pace. `report.md` re-rendered against this data.

**Open (flagged, not blocking):** `MIN_PROFIT_PER_LABOR_SLOT_YEN` (Y3,000) is a conservative,
un-measured bot floor; the `investor.ts` twin bug; and the deeper Sprint 27 cheap-car-restoration
tuning question all remain for the maintainer's later tuning pass.
