# Sprint 218: workshop diagnosis and symptom service jobs

**Status: APPROVED.** Implements sections 7 and 8 of
`docs/design/systems/knowledge-and-diagnosis.md`. Depends on 215 (verification,
checklist) and 216 (weights); closes the knowledge arc and runs the arc's one
full-suite gate.

## Reuse analysis (directive 16)

**Reused:** the whole test machinery (partitions, resultCopy, unlockedBy):
workshop tests are the same schema with venue fields, never a second system; the
inspection-minutes clock for yard tests unchanged; labour resolution for
workshop test costs (the same pool every action spends); the service-job
system end to end (offer, accept, deadline, payout formula, handback) for the
new task kind; `taskLaborChain` for expected-cost payouts; Sprint 207's
weighted offer generation for rolling symptom jobs onto the board.

**New:** the venue split on tests, the workshop test content pass, the
`resolveSymptom` task kind, symptom-job generation.

## Tasks

### A. Test venues (spec section 7)

- A1. Schema: `venue: 'yard' | 'workshop'` on every test (existing tests become
  `yard`, zero behaviour change); workshop tests may carry `requiresToolTier
  { component, tier }`, `requiresVacatedSlot: CarPartId`, `laborPoints`.
- A2. Workshop tests run only on a car in the player's shop; they charge labour
  points; `requiresVacatedSlot` tests appear only while that slot is empty.
- A3. The symptom checklist lists tests filtered by venue and current
  availability, with each test's cost in its own currency (minutes at the yard,
  labour points in the shop) and its lock reason when unavailable (tool tier,
  vacated slot), in the standard caption idiom.

### B. Workshop test content (spec section 7 coverage commitment)

- B1. Content pass over every symptom: each gains at least one workshop path to
  a single cause that is cheaper in labour than opening its most expensive
  candidate. Worked example from the spec (leak-down splitting rings from head
  gasket at engine tool tier 2, 4 points) is the template.
- B2. Copy: workshop test result lines in the same voice as the yard set; lead
  copy pass before merge.

### C. Symptom service jobs (spec section 8)

- C1. Task kind `resolveSymptom { symptomId }` beside slot tasks in the
  service-job schemas. Generated jobs: customer car with one visible symptom,
  2-4 candidates, candidates' parts consistent with the car's rolled state.
- C2. Payout fixed at accept: `(sum of weight x chainFixCost) x marginRoll +
  calloutFee` (weighted mean by DESIGN: the customer pays the going quote; fear
  pricing is an auction phenomenon: spec section 8, decided).
- C3. Completion: symptom collapsed AND the true cause's part at fine or better.
  Failure/deadline semantics identical to existing jobs.
- C4. Offer generation: symptom jobs enter the daily roll with their own weight
  (content); the offer card shows the symptom line and the candidate count,
  never the answer.
- C5. The margin loop verified by test: opening in descending
  probability-per-labour order on a fixture job spends less than the payout's
  expected cost; the reverse order spends more. (The game never shows
  yen-per-point: ruling 11; the player reads weights and labour costs and
  decides.)

### D. Arc close

- D1. One full `pnpm test` for the whole knowledge arc; golden hashes re-derived
  once here rather than per-sprint where possible.
- D2. Arc summary appended to `knowledge-and-diagnosis.md`: values as shipped.

## Definition of done

- Every symptom is workshop-solvable per the coverage commitment; symptom jobs
  roll, pay expected cost, and reward order; yard flow untouched; full suite
  green; typecheck clean.

## Exit

**Status: DONE.** `pnpm typecheck` clean across content/sim/game. Arc gate
(`pnpm test`, whole monorepo): 235/235 files, 4842/4843 tests pass, 1 skipped
(the pre-existing golden-session skip, untouched) - zero red.

### Task A - test venues

- `packages/content/src/diagnosticTest.ts`: `DiagnosticTestSchema` gains
  `venue: 'yard' | 'workshop'` (defaults `'yard'`, so all 46 pre-sprint tests
  parse unchanged), `requiresToolTier { component, tier }`,
  `requiresVacatedSlot: CarPartId`, `laborPoints`, each optional and
  workshop-only by refinement. `minutes` stays required on every entry
  (unread for a workshop test) rather than becoming a conditional field, to
  avoid a second discriminated shape purely for one unused number on 17
  entries.
- `packages/sim/src/diagnosis.ts`: `runDiagnosticTest` refuses a
  workshop-venue test (`wrong-venue`) - the yard visit only ever offers yard
  tests. New `workshopTestGateReason`/`runWorkshopTest`: workable car only
  (`findWorkableCar` - owned or a service-job car), tool tier
  (`toolLevelsFor`), vacated slot (`car.parts[slot].installed === null`),
  and `laborPoints` against the same `energyMax`/`energySpentToday` pool
  every other shop action spends. A CONFIRMATION (collapse to one remaining
  cause) verifies the true cause's own slot via the existing
  `verifyAndResolve` (knowledge.ts) - one implementation, reused from the
  owned workup.
- `packages/game/src/stores/gameStore.ts`: `symptomChecklistForCar` gains a
  `venue: 'yard' | 'workshop'` parameter; the fork filters to that venue and,
  for `'workshop'`, adds `laborPoints`/`lockReason` per test
  (`workshopLockCaption`, the same "Needs X" idiom `testDisabledReason`/the
  garage's own labour captions already use). `carDetail()` passes
  `'workshop'`; `lotDetail()` keeps the `'yard'` default, zero behaviour
  change. New `runWorkshopTest`/`workshopTestGateReason` store actions.
- `packages/game/src/screens/CarDetailScreen.vue`: the diagnosis panel gains
  the workshop trail and test fork (mirrors `SymptomChecklist.vue`'s yard
  idiom, hand-rolled here since the owned-car panel was never built on that
  shared component); `onRunWorkshopTest`.
- `packages/content/src/sessionEvent.ts`: new `runWorkshopTest` session-event
  variant (replay coverage, `packages/sim/src/careerReplay.ts`).

### Task B - workshop test content

- `packages/content/data/diagnosticTests.json`: 17 new workshop-venue test
  registry entries, `laborPoints` 2-6, four carrying `requiresVacatedSlot`
  (`bearing-pan-check`/internals, `synchro-ring-inspect`/gearbox,
  `diff-bearing-preload-check`/differential,
  `timing-chain-stretch-gauge`/camsTiming) and eleven carrying
  `requiresToolTier` at tier 1 or 2 across all six tool lines.
- `packages/content/data/symptoms.json`: one new `TestApplication` per
  symptom (17 total). `smokes-on-startup`'s `leak-down` is the spec's own
  worked example verbatim (`unlockedBy: compression-test group 1`, engine
  tier 2, 4 labour); the other 16 are root tests, each isolating the one
  cause that no existing yard test isolates alone in its own partition
  group (verified per symptom against the shipped yard tree, not assumed) -
  the coverage commitment holds for every symptom, confirmed by a content
  script cross-checking all 17 (`node -e` sweep during implementation, not
  a shipped test file - `symptom.test.ts`'s existing partition-integrity
  check is the permanent guard).
- Copy: same terse, evidence-first Vimes voice as the yard set, British
  spelling, no em dashes.

### Task C - symptom service jobs

- `packages/content/src/serviceJob.ts`: `ServiceJobTaskSchema` is now
  `z.union([ServiceJobSlotTaskSchema, ServiceJobSymptomTaskSchema])` - a
  plain union, not `z.discriminatedUnion`, because a discriminated union's
  routing inspects the raw input's `kind` before any default fills it in,
  which broke every pre-sprint template (no `kind` field authored). A plain
  union tries each schema in turn and the two never share a required field,
  so routing is never ambiguous. `ServiceJobSlotTaskSchema` adds
  `kind: z.literal('slotCondition').default('slotCondition')` (existing
  content parses unchanged); new `ServiceJobSymptomTaskSchema = {kind:
  'resolveSymptom', symptomId}`.
- `packages/content/data/serviceJobTemplates.json`: one new tier-1 template,
  `mystery-fault` (placeholder `symptomId`, overwritten per generated
  offer), `deadlineDays: 5`, `baseReputation: 4`.
- `packages/content/src/economy.ts` / `economy.json`:
  `serviceJobs.symptomJobOfferWeight: 0.5` - felt behaviour recorded in
  `economyApprovalGate.test.ts`'s own ledger comment and re-pinned there
  (task C4's own named lever, per the sprint's approval).
- `packages/sim/src/auctions.ts`: new exported `applySpecificSymptom` -
  `applySymptoms`' own per-symptom body (`pickWeightedCause` +
  `applyCauseWithLawTwo`), factored out and reused rather than duplicated,
  for forcing one named symptom onto a customer car.
- `packages/sim/src/serviceJobs.ts`: new `deriveSymptomJobPayoutYen`
  (weighted MEAN of `candidateFixCostYen` over every candidate, margined and
  calloutFee-loaded exactly as `deriveServiceJobPayoutYen` - the same
  formula shape, the room's own fear pricing never enters a service-counter
  quote, per spec section 8, decided); `buildSymptomJobCar` (rolls a plain
  customer car, forces one eligible symptom - causes.length <= 4 - onto it,
  retries up to 5 times against a fresh roll on a Law 2 veto);
  `generateDailyServiceJobOffers` branches on `isSymptomTemplate` to use
  both. `isServiceTaskDone` dispatches to new `isSymptomTaskDone` (symptom
  collapsed AND the true cause's part at fine or better) for a
  `resolveSymptom` task. Every function that previously assumed
  `task.requirement` (`taskToolDeficit`, `serviceJobCostBreakdown`,
  `forceTasksOutstanding`, `installedTaskParts`, `taskChainDepth`,
  `taskGroup`) now dispatches on `task.kind`; bot policies
  (`serviceGrinder.ts`, `serviceJobHelpers.ts`) skip a `resolveSymptom` task
  outright (directive 21: the bots do not attempt the order-matters loop) and
  `expectedProfitPerLaborSlot` no longer reads an all-symptom task list as
  infinitely profitable.
- `packages/game/src/stores/gameStore.ts`: `taskLabel` renders a
  `resolveSymptom` task as the symptom's own `cardLine` plus its candidate
  count, e.g. "Clunks over bumps at the back. (4 possible causes)" - never
  the answer - feeding both the offer card and the accepted job's own task
  list through the one existing `ServiceJobTaskView` shape (no new UI
  component needed).
- **C5, measured** (`packages/sim/tests/resolveSymptomJob.test.ts`, fixture:
  `clunk-over-bumps`, true cause `tired-bushes`): payout ¥14,936 (margin
  1.265x the weighted-mean chain-priced cost pool + `calloutFeeYen`).
  Candidate costs: tired-bushes ¥5,060 (weight 35), blown-dampers ¥11,640
  (28), steering-play ¥7,890 (13), rotted-subframe-mount ¥18,200 (24).
  Descending probability-per-labour order opens tired-bushes first (best
  value on the board) and finds the true cause immediately: spend ¥5,060,
  well under the ¥14,936 payout. The reverse order opens
  rotted-subframe-mount, steering-play, and blown-dampers first, reaching
  tired-bushes last: spend ¥42,790, nearly 3x the payout. Same job, same
  payout, order alone is the difference between a strong profit and a real
  loss - the mechanic works as designed.

### Task D - arc close

- Golden hashes re-derived (a new template joining the daily service-job
  draw shifts the shared RNG stream regardless of whether it's ever picked):
  `packages/sim/tests/advanceDay.test.ts` (30-day career, acquisition-and-
  sale path), `packages/sim/tests/careerReplay.test.ts` +
  `packages/sim/src/careerScripts/smoke.script.json` (both `kind: 'hash'`
  checkpoints).
- `packages/sim/tests/diagnosisRouteProbes.test.ts` and
  `packages/sim/tests/diagnosis.test.ts`'s exhaustive symptom-test-cause
  sweep are both scoped to yard-venue tests only (case (a), directive 17):
  both predate the venue split and are specifically about the yard
  inspection tree's own shape (root shape, choice-everywhere, waste-and-
  signal, reading-pays, grenade budgets) - a workshop test is a different
  resource model they were never designed to reason about, and mixing it in
  broke invariants that were never about it. A new `runWorkshopTest /
  workshopTestGateReason against real content` block in `diagnosis.test.ts`
  covers the workshop path directly instead (the leak-down worked example
  end to end, plus the `requiresVacatedSlot` gate).
  `packages/sim/tests/serviceJobPayout.test.ts`'s profitability invariant is
  scoped to slot-condition templates (its own cost pipeline has nothing to
  say about a `resolveSymptom` template's separately-profitable formula,
  which `resolveSymptomJob.test.ts` covers instead).
  `packages/content/tests/economyApprovalGate.test.ts` re-pinned
  (`symptomJobOfferWeight`, felt behaviour recorded).
  `packages/content/tests/integrity.test.ts`'s flavour-line word-boundary
  check caught a real substring collision ("nobody" contains "body") in the
  `mystery-fault` template's own copy, corrected to "not one mechanic."
- Arc summary appended to `docs/design/systems/knowledge-and-diagnosis.md`.
