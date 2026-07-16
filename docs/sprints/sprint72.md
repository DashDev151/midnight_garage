# Sprint 72 - Outcome-based service jobs and the shared Requirement module

**Source:** `docs/design/component-hierarchy-spec.md` §"Jobs become outcome-based" (maintainer
scoping notes 2026-07-15). Depends on Sprints 70 (provenance) and 71 (teardown). Story missions
(Sprints 76-78) consume the module built here.

**For the implementing agent:** verify every cited symbol before editing; STOP if missing. No em
dashes. British English in all player copy.

## Confirmed current state (code discovery, 2026-07-15)

- Tasks are actions: `ServiceJobTaskSchema` (`packages/content/src/serviceJob.ts:64` region) is
  `repair { carPartId, targetBand, minToolTier }` or `install { carPartId, minGrade,
  minToolTier }`.
- `isServiceTaskDone(car, task, partsById, baselineInstalledPartIds?)` (`serviceJobs.ts:799`):
  repair done when band reaches target OR the slot is scrap/empty (a hole this sprint closes);
  install done when the slot holds `minGrade`+ AND the instance id differs from
  `baselineInstalledPartIds[carPartId]`.
- `ServiceJob.baselineInstalledPartIds` (`serviceJob.ts:97-141`) exists only for that install
  check since Sprint 70 removed its ownership role. It dies here.
- Payout: `deriveServiceJobPayoutYen(tasks, car, model, context, marginRoll)`
  (`serviceJobs.ts:393`) = `round((taskCostYen + laborSlots * laborRateYen) * marginRoll +
  calloutFeeYen)`; breakdown from `serviceJobCostBreakdown` (`serviceJobs.ts:331`); Law 4 floor
  documented `serviceJobs.ts:376-391`, tested in `serviceJobPayout.test.ts:108`.
- Close-out: `resolveServiceJob` (`serviceJobs.ts:966`); customer-part release now runs through
  `provenance.ts` (Sprint 70). Tool deficit: `taskToolDeficit` (`serviceJobs.ts:40`).
- Task list UI: `ServiceTaskList.vue` renders `ServiceJobTaskView[]` built in `gameStore.ts`
  (`serviceJobOfferViews` at 770-822 and the active-job views).
- Templates: `serviceJobTemplates.json` (`ServiceJobTypeSchema`), e.g. `cooling-system-service`
  with a repair task `{ carPartId: cooling, targetBand: fine, minToolTier: 1 }`.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- The entire offer stream, acceptance, deadline, expiry, grading-to-reputation, and specialty
  machinery: untouched. Only WHAT a task means changes.
- `provenance.ts` (Sprint 70) for the customer-part return rule.
- `serviceJobCostBreakdown`/`deriveServiceJobPayoutYen`: extended, not replaced.
- `ServiceTaskList.vue`: unchanged; the store builds new labels.
- Sprint 71's `economy.teardown` labour values price the chains.

**New mechanisms:**

1. `packages/sim/src/requirements.ts`: the shared predicate module (story missions add their
   primitives to it in Sprint 76).
2. Outcome task shape + template conversion.
3. The customer-part return-at-close-out rule and its receipt line.

## Decisions

1. **The `Requirement` module.** `requirements.ts` exports a discriminated-union
   `RequirementSpec` and one evaluator
   `evaluateRequirement(spec, car, ledger, day, context): { pass: boolean, label: string,
   actual: string, required: string }`. This sprint ships one primitive:
   `slotCondition { carPartId, minBand, minGrade? }`: pass when the slot holds an installed
   part with `band >= minBand` AND (if `minGrade` present) catalog `grade >= minGrade`.
   Empty or scrap-band slots always FAIL (closes the "or empty" hole; directive 17 case (a)
   for any test pinning the old behaviour: the implementation intentionally changed what is
   correct).
2. **Task conversion is mechanical.** `repair { carPartId, targetBand }` becomes
   `slotCondition { carPartId, minBand: targetBand }`. `install { carPartId, minGrade }`
   becomes `slotCondition { carPartId, minBand: 'fine', minGrade }` (the band floor stops a
   scrap race part satisfying an upgrade job). `minToolTier` stays on the task wrapper for
   `taskToolDeficit`, unchanged. Convert every entry in `serviceJobTemplates.json`; keep ids
   and flavour pools.
3. **`isServiceTaskDone` becomes a one-liner** over `evaluateRequirement`; the
   `baselineInstalledPartIds` parameter and the `ServiceJob` field are DELETED (schema +
   `serviceJobs.ts` + any codec mention). `SAVE_VERSION` 31 -> 32, no migration (directive 19).
4. **Any route counts.** Re-fitting the customer's own repaired part, fitting a bought one, or
   fitting one pulled from a donor all satisfy the predicate. The old "customer's own pulled
   part never counts" rule dies with the baseline (it existed to police install-task gaming;
   the band+grade floor now does that job honestly).
5. **Customer parts go home.** At `resolveServiceJob` close-out, every `partInventory` entry
   with `isCustomerOriginPart(part, job)` leaves inventory with the car; the job result view
   and `JobCompleteModal` list them ("Returned with the car: ..."); new day-log kind
   `service-parts-returned`. (Sprint 70 already blocks selling them mid-job.)
6. **Payouts price the teardown.** `serviceJobCostBreakdown` adds, per outcome task on a
   non-surface slot: `removeSlots + installSlots` for the slot itself PLUS `2 x (sum of the
   blockedBy chain's remove+install slots)` when the chain must be opened (blockers are
   removed and refitted). Bench repair slots continue to come from `planPartRepair`. The Law 4
   floor test (`serviceJobPayout.test.ts:108`) must hold on the NEW minimum-cost route; the
   wage-law probes in `coherence.ts`/`valueModelProbes.test.ts` are recomputed (directive 17
   case (a): the economy intentionally changed; state it).
7. **Task labels.** Store-built `ServiceJobTaskView.label` becomes outcome-phrased:
   `"<Part display name> must be <band>"` / `"<Part display name>: <grade> or better, fitted
   and fine"`. British spelling; `describeLogEntry` untouched except new kinds.

## Tasks

**Claude:**

1. `packages/sim/src/requirements.ts` with `RequirementSpec`, `evaluateRequirement`, and the
   `slotCondition` primitive per decision 1; unit tests per branch (band pass/fail, grade
   pass/fail, empty, scrap).
2. Content: convert `ServiceJobTaskSchema` to the outcome shape (keep `minToolTier`); convert
   every template in `serviceJobTemplates.json` per decision 2; update `schemas.test.ts` /
   `integrity.test.ts` guards that reference the old shape.
3. Rewrite `isServiceTaskDone` over the module; delete `baselineInstalledPartIds` everywhere
   (schema, generation at `serviceJobs.ts:644` region, close-out, codec); bump `SAVE_VERSION`
   to 32.
4. Close-out return rule per decision 5: sim change in `resolveServiceJob`, result-view field,
   `JobCompleteModal` line, `service-parts-returned` log kind + formatter.
5. Payout: extend `serviceJobCostBreakdown` per decision 6; recompute and re-pin the Law 4
   floor test and wage probes with directive-17 statements; re-pin goldens with comment.
6. Store: outcome labels per decision 7 in `serviceJobOfferViews` and active-job views;
   `ServiceTaskList.vue` needs no change.
7. Tests: an end-to-end job satisfied via each of the three routes (repair-and-refit / buy-new /
   donor-pulled part); customer parts returned and listed at close-out; a deep-slot job's
   payout covers the full chain at the worst margin roll (the Law 4 floor, on the new totals).
8. Full gate + Exit.

**User-only (maintainer):**

- None.

## Definition of done

- Every service-job task is an end-state predicate through `requirements.ts`; any route
  satisfies it; empty/scrap slots never do.
- `baselineInstalledPartIds` no longer exists anywhere; customer-origin parts return at
  close-out with a receipt line.
- Deep-slot job payouts price the full teardown chain and the Law 4 floor holds on the new
  totals; wage probes recomputed and disclosed.
- `SAVE_VERSION` 32, no migration; full gate green; goldens re-pinned.

## Exit

**Built, matching the decisions above:**

1. `packages/content/src/requirement.ts`: `RequirementSpecSchema` (discriminated union on `kind`,
   one variant `slotCondition { carPartId, minBand, minGrade? }`) per decision 1.
   `packages/sim/src/requirements.ts`: `evaluateRequirement(spec, car, ledger, day, context)` -
   an empty or scrap-band slot always fails; otherwise band + (if set) grade, both "at least."
   `ledger`/`day` are threaded through unused this sprint (Sprint 76's story-mission primitives
   will need them) - `void`-ed rather than dropped, so the signature doesn't change twice.
2. `ServiceJobTaskSchema` collapsed to `{ requirement: RequirementSpec, minToolTier }` (content);
   all 30 templates in `serviceJobTemplates.json` converted mechanically per decision 2
   (`repair {carPartId, targetBand}` -> `slotCondition {carPartId, minBand: targetBand}`;
   `install {carPartId, minGrade}` -> `slotCondition {carPartId, minBand: 'fine', minGrade}`).
   `ServiceJobSchema` lost `baselineInstalledPartIds` entirely (schema, `serviceJobs.ts`
   generation, completion, and close-out, `saveCodec.ts`). `SAVE_VERSION` 31 -> 32; directive 19
   covers the deletion itself, no migration needed for that half.
3. `isServiceTaskDone` is now a one-liner over `evaluateRequirement`; decision 4 ("any route
   counts") is enforced structurally, not by a special case - there is no more instance-identity
   input to check. `forceTasksOutstanding`/`serviceJobCostBreakdown` updated to the new shape;
   decision 1's "empty/scrap never counts as done" closed a real hole (see the cost-breakdown
   correction below).
4. Close-out return rule (decision 5): `resolveServiceJob` computes `returnedParts` via the
   existing `partsOriginatingFromCar` (Sprint 70) BEFORE reconciliation, builds display-name
   strings (ids can't be looked up after the instances leave `partInventory` in the same step),
   and emits a new `service-parts-returned` day-log entry on BOTH the paid and failed branches.
   `ServiceJobResultView.returnedParts` (store), `JobCompleteModal.vue`'s "Returned with the car"
   line, and `dayLogFormat.ts`'s formatter all wired through.
5. Payout (decision 6): new `teardownChainLaborSlots` (own remove+install slots, plus 2x the
   `blockedBy` chain's remove+install slots when non-empty) prices a non-surface task's teardown
   overhead in `serviceJobCostBreakdown`, on top of whichever route (bench-repair or buy-new) the
   task actually takes.
6. Store labels (decision 7): `taskLabel` in `gameStore.ts` is outcome-phrased - `"<Part> must be
   <band>"` for a band-only task, `"<Part>: <grade> or better, fitted and fine"` for a
   grade-requirement task. `ServiceTaskList.vue` needed no template change.
7. Task 7's three test requirements: a new `serviceJobs.test.ts` describe block runs a real
   `resolveServiceJob` end to end through each of the three legitimate routes (repair-and-refit,
   buy-new, donor-pulled), asserting completion + payout are identical and that only the
   customer's own displaced original ever returns (a donor-pulled part's own origin traces to the
   DONOR car, not this job's car, so it correctly never reconciles out); a dedicated deep-slot test
   in `serviceJobPayout.test.ts` uses the real `engine-internals-rebuild` template (`internals` and
   `headValvetrain`, both buried with real `blockedBy` chains) to prove the teardown premium is
   actually live (labour strictly exceeds the bare install-only baseline) and that the Law 4 floor
   still clears on the new totals.

**A genuine, necessary code fix beyond the schema change itself:** `saveCodec.ts`'s pre-existing
`migrateServiceJobToTasks` (the v17 -> v18 migration) hardcoded the OLD `{action, carPartId,
targetBand/minGrade}` shape as its own literal output. Since no later migration reshapes `tasks`
again, and the schema no longer accepts that shape at all, an ancient pre-v18 save would fail to
decode even after every prior migration step succeeded. Directive 19 exempts a NEW field from
needing a migration; it does not exempt an EXISTING migration's own output from staying valid
against the schema it feeds into - fixed by having the function emit the current
`{requirement: {kind: 'slotCondition', ...}}` shape directly.

**A design correction found while writing tests, fixed before it shipped (not a directive-17 case,
since it never reached committed code):** the first draft of `serviceJobCostBreakdown` kept an
`if (!installed && !minGrade) continue` skip inherited unreflectively from the pre-Sprint-72 code,
where a scrap/missing band-only task was safe to price at 0 because `forceTasksOutstanding`
guaranteed it could never reach this function for real content. Decision 1 retires that guarantee -
both states are now genuinely outstanding, priced-replacement work - so the skip was deleted and
both states now fall through to the buy-new route, matching a grade-requirement task's existing
handling exactly.

**The Law 6 wage-probe finding (decision 6's "recompute the wage-law probes," surfaced and
resolved with maintainer direction, not decided unilaterally):** recomputing `computeModelCoherence`
with the full teardown chain (first pass: reusing `teardownChainLaborSlots` per part, unchanged
from the service-job formula) flipped the rare-tier direction correctly (`sensibleFlipMarginYen`
now genuinely below `flipMarginYen`, Sprint 71's disclosed gap closed as designed) but ALSO drove
`honda-city-e-aa`/`suzuki-wagon-r-ct21s` to a large NEGATIVE `wageMarginYen` (-Y43,582). Root cause:
this model's taxonomy has several buried parts sharing common blockers (`intake` blocks `block`,
`headValvetrain`, AND `forcedInduction`), and pricing every needed part's teardown chain
independently double-, triple-, quadruple-counted a shared blocker's own remove+install labour once
per dependent part - correct for a customer service job (each task is billed as its own line item,
decision 6's explicit design), but wrong for this probe's "restore the WHOLE car in one pass"
scope, where a real mechanic pulls a shared blocker once. Fixed (maintainer-approved, "Dedupe
shared blockers in the wage probe only"): `computeModelCoherence` now keeps its own per-restoration
teardown ledger (a `Set<CarPartId>` of parts already charged, own-repair passes first, then
blocker-only passes for anything not already covered) rather than reusing
`serviceJobCostBreakdown`'s per-task helper; `serviceJobCostBreakdown` itself is UNTOUCHED - real
templates never stack overlapping non-surface tasks, so no customer quote changes. The dedup fix
roughly halved the shitbox deficit (-Y43,582 -> -Y20,725) but did not eliminate it: the residual is
a genuine economic fact, not a counting bug - a shitbox's `repairGainYen` scales with its cheap
parts' prices while the teardown labour needed to reach the tier's expectation band is value-blind,
so honestly priced, the labour now costs more in rent-during-repair than the repair is worth.
Maintainer-approved resolution ("Disclose shitbox as a known gap, gate the rest"): the three
wage-law tests in `valueModelProbes.test.ts` are split so common/uncommon/rare stay hard-gated (all
clear a large positive margin) and the shitbox tier is measured and pinned as a disclosed,
non-gated finding; `invariants.py`'s Law 6 check and `report.py`'s prose are split the same way,
confirmed against a real `pnpm balance:run` + `python -m balance.cli check` + `python -m balance.cli
report` run (not assumed). New `TODO.md` entry under "Open balance/economy questions" for the
maintainer's eventual tuning call (soften the teardown premium, raise `marketRepairDiscount`, or
accept the gap).

**Directive 17 statements for every existing test this sprint touched** (all case (a) - the
implementation intentionally changed what's correct; the two genuine code fixes above are NOT test
changes and are called out separately):

- `packages/content/tests/integrity.test.ts`: the group-membership check reads
  `task.requirement.carPartId`; "no repair task ever targets scrap" is now "no requirement's
  minBand is ever scrap" (no more action discriminant to narrow on); the "no service-job template
  addresses a non-repairable part via a repair task" guard is DELETED outright - decision 1 means
  ANY route (including a replacement) can now satisfy a band-only task on a non-repairable part, so
  the premise the guard checked no longer exists.
- `packages/sim/tests/serviceJobs.test.ts`: every `task.action`/`task.carPartId`/`task.targetBand`/
  `task.minGrade` reference converted to `task.requirement.X`; the `forceTasksOutstanding` describe
  block dropped its `.action` narrowing (scrap/missing are now genuinely-outstanding-without-
  forcing, not force-filled, since `isServiceTaskDone` already reads them as not-done); the
  cost-breakdown tests for a scrap/missing band-only slot were inverted from "contributes nothing"
  to "now prices a replacement" (one kept `laborSlots` at exactly 0, since `panels` is a
  SURFACE-class part and surface installs cost 0 labour by Sprint 71's own economy - only the cash
  side changed for that specific part); the ENTIRE "install completion is baseline-gated (Sprint
  61)" describe block is replaced by "any route counts (Sprint 72 decision 4)," asserting the
  OPPOSITE of the retired behaviour (re-fitting the customer's own repaired original now counts).
- `packages/sim/tests/facilities.test.ts` / `jobs.test.ts` / `parts.test.ts` / `provenance.test.ts`
  / `serviceJobPayout.test.ts`: every `ServiceJob` task fixture converted to the requirement shape;
  every `baselineInstalledPartIds` field removed from fixtures (the field no longer exists on the
  schema). `serviceJobPayout.test.ts`'s `playerMinCostYen`/`worstCaseParts` helpers rewritten to
  read `task.requirement` and to route scrap/missing/non-repairable through the buy-new floor like
  a grade-requirement task always does, matching the cost-breakdown correction above.
- `packages/game/src/stores/gameStore.jobs.test.ts`: `isServiceTaskDone` now needs a real
  `SimContext`, not a bare `partsById` map - the file builds its own context via `buildSimContext`,
  mirroring the store's own construction, rather than threading the store's internal context out;
  `findUnfinishedRepairOffer`'s "is this a repair-shaped task" check changed from
  `t.action === 'repair'` to `!t.requirement.minGrade` (a band-only task, the same predicate
  `isServiceTaskDone` itself uses).
- `packages/game/src/components/JobCompleteModal.test.ts`: every `lastJobResult` fixture gained
  `returnedParts: []`; two new tests cover the receipt line's presence and its absence.
- `packages/game/src/components/PartCard.test.ts` / `gameStore.garage.test.ts` /
  `EndDayButton.test.ts`: mechanical - `baselineInstalledPartIds` removed / task literal converted.
- `packages/game/src/save/saveCodec.test.ts`: every `ServiceJob` task fixture (round-trip tests,
  migration-expectation assertions, and the pre-v28/pre-v29 customerJobId-remap fixture that
  incidentally carries a task list) converted to the requirement shape; six `SAVE_VERSION`
  sanity-canary assertions (some inline, two their own dedicated `it()`, one duplicated by an
  earlier sprint) updated from 31 to 32, matching this file's own established per-bump pattern (see
  the Sprint-39/42 canary's own doc comment). The two tests exercising
  `baselineInstalledPartIds` directly (a pre-v30 save decoding with an empty baseline; a v30 job
  round-tripping a captured baseline) are DELETED, not converted - the mechanism itself is retired,
  not merely the assertion.

**Golden-master hashes: checked, not re-pinned.** Both `advanceDay.test.ts` hashes (`edd4dc35`,
`79f49596`) pass unchanged even though `ServiceJobTaskSchema`'s shape changed - confirmed by
actually running the full sim suite, not assumed from Sprint 71's precedent: neither golden
career's captured hash point has an active or offered service job on its books at the moment of
hashing, so the schema change is invisible to those two specific runs.

**Disclosed, not silently patched - flagged for explicit maintainer attention:**

1. **The Law 6 shitbox gap above** (`honda-city-e-aa`/`suzuki-wagon-r-ct21s`, `wageMarginYen`
   -Y20,725, 0.39x rent) - a real economic fact this sprint's honest teardown pricing surfaced, not
   a bug. `TODO.md` carries the maintainer's eventual tuning call.
2. **`competent-policy`'s Sprint-71 stall (TODO.md standing-concerns item 6) still fails
   `balance.cli check`'s Days-to-`local` invariant** on this sprint's fresh harness run - unrelated
   to Sprint 72 (root cause is the bot's on-car-only repair path, already tracked in the
   bot-harness-rework entry), re-confirmed rather than re-litigated here.

**Not done / deferred:** nothing from this sprint's own scope - `requirements.ts` is deliberately
minimal (one primitive, `slotCondition`) since Sprint 76's story missions are the ones that add
more; consuming the shared module for story-build commissions is out of scope until that sprint.

**Gate:** `pnpm typecheck` / `pnpm lint` / `pnpm format` / `pnpm test:coverage` (1197 tests, 86
files, all green; coverage 89.36/79.69/92.01/93.21 stmts/branch/funcs/lines against the 80/65/78/82
thresholds) / `pnpm build` all green. Balance harness run for real (`pnpm balance:run` + `python -m
balance.cli check` + `python -m balance.cli report`): the only hard-gate failure is the
already-disclosed, unrelated `competent-policy` Days-to-`local` stall (item 2 above); the Law 6
split resolves cleanly with the shitbox tier disclosed, not gated.
