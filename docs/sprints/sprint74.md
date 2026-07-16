# Sprint 74 - Diagnosis II: the inspection visit, the tests, and knowing

**Source:** `docs/design/diagnosis-spec.md` v2. Depends on Sprint 73 (symptomatic cars exist and
are fear-priced; the player cannot yet act on them). This sprint ships the verbs: the yard visit
with its hour, the owned-car workup, and uninstall-reveals-truth.

**For the implementing agent:** verify every cited symbol before editing; STOP if missing. No em
dashes. British English in all player copy.

## Confirmed current state (after Sprint 73)

- `CarInstance.symptoms[].remainingCauseIds` exists and never narrows; `apparentBandByPartId`
  exists; `apparentViewOf`, `sheetGuideValueYen`, `expectedTrueValueYen` live in
  `packages/sim/src/diagnosis.ts`; `economy.diagnosis` carries `visitMinutes: 60` and
  `travelFeeYenByTier`, unconsumed.
- Labour is spent via `laborSlotsSpentToday` (`content/gameState.ts:186`, reset at
  `advanceDay.ts:421`); cash via sim resolvers; day-scoped state resets in `advanceDay`.
- Lot cards render symptom lines + open cause lists (Sprint 73 decision 7).
- Uninstall (Sprint 71) charges class labour through `resolveRemovePart` and is the designated
  reveal site (`component-hierarchy-spec.md`).
- Auction tiers: `local-yard, regional, premium, collector-network`
  (`AUCTION_TIER_MIN_REPUTATION`, `constants.ts:108-113`); lots carry their tier.
- Modal/overlay convention: `SaleCompleteModal.vue` (the canonical copy); day-end via
  `game.endDay()` (`gameStore.ts:2591-2605`).

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- The labour-slot economy (a visit and a workup are 1-slot actions on the existing counter).
- Sprint 73's content: tests, partitions, result copy; nothing new is authored here.
- `AuctionScreen.vue`'s per-tier lot grouping: the visit panel lives inside the existing screen,
  no new route.
- `advanceDay`'s day-boundary reset for the visit state.
- Sprint 71's `resolveRemovePart` as the bench-truth reveal site.
- The day-log + `DayReport` surfaces for reveal moments.

**New mechanisms:**

1. `GameState.inspectionVisit` day-state and the three verbs (`beginInspectionVisit`,
   `runDiagnosticTest`, `resolveOwnedWorkup`).
2. Knowledge narrowing (partition intersection) and the reveal-on-removal rule.
3. The player-estimate line and the known-vs-apparent display rule on the car page.

## Decisions

1. **Visit state.** `GameState.inspectionVisit: { tier: AuctionTier, minutesLeft: number } |
   null` (default null). `beginInspectionVisit(state, tier, context)`: requires 1 free labour
   slot, `cashYen >= travelFeeYenByTier[tier]`, at least one live lot at that tier, and no
   visit already active today at any tier with minutes left (one active visit at a time;
   starting a new one forfeits the old remainder after a confirm). Spends the slot and the fee,
   sets `minutesLeft = visitMinutes`. Cleared unconditionally in `advanceDay` (before day-log
   assembly). New day-log kind `inspection-visit`.
2. **Running a test.** `runDiagnosticTest(state, lotId, symptomIndex, testId, context)`: legal
   only when a visit is active for the lot's tier, `minutesLeft >= test.minutes`, the test
   applies to that symptom, and it has not already been run on that symptom instance (track
   `runTestIds: string[]` on the car's symptom entry; add the field, default `[]`). Effect:
   decrement minutes; compute the partition group containing `trueCauseId`; set
   `remainingCauseIds` to its intersection with that group. Deterministic, no RNG. Returns the
   group's authored result copy for the UI. Knowledge lives on the CAR, so it rides home on
   purchase and dies with a lost lot, both for free.
3. **The owned-car workup.** `resolveOwnedWorkup(state, carInstanceId, context)`: owned cars
   only, 1 labour slot, no fee, no clock; every symptom's `remainingCauseIds` collapses to
   `[trueCauseId]`. Day-log kind `car-workup`. (This is also the bench-only disambiguator for
   `wont-idle`.)
4. **Uninstall reveals truth.** In `resolveRemovePart`, after a successful removal of part P on
   an owned car: for each symptom, if the true cause targets P, collapse `remainingCauseIds`
   to `[trueCauseId]`; otherwise remove from `remainingCauseIds` every cause targeting P. The
   removed instance's band is the true band (it always was); the day-log removal entry gains
   the reveal line when a collapse happened ("Opened it up: <cause label>."). No extra labour:
   the teardown already cost it.
5. **What the player sees, one rule.** A part's DISPLAYED band is the true band when (a) the
   car is honest, (b) no remaining cause targets that part, or (c) exactly one cause remains
   for every symptom targeting it; otherwise the APPARENT band with a "?" suffix chip. Encode
   as `displayedBandFor(car, partId): { band: ConditionBand, uncertain: boolean }` in
   `diagnosis.ts`; both the lot cause list and `CarDetailScreen` part rows use it. Repair cost
   previews on an uncertain part show a range: best = apparent-band plan, worst = worst
   remaining cause's band plan.
6. **Player estimate.** Once ANY test has run on a lot (or any symptom is resolved), the lot
   card shows a second line under the guide: "your estimate: ¥X" where X =
   `marketValueYen(apparent view with each symptom's remaining causes collapsed to their
   reweighted expectation)`: implement `playerEstimateYen(car, model, state, context)` in
   `diagnosis.ts` (reweight = original weights renormalised over `remainingCauseIds`; resolved
   symptom = its true cause applied exactly). No fear premium in the player's own number.
7. **Visit UI, inside `AuctionScreen.vue`.** A per-tier header button "Inspect here (1 slot +
   ¥fee)" (disabled with reason when gated); while active, a fixed panel shows "At the yard:
   Xm left" and each symptomatic lot's cause checklist gains test buttons labelled
   "<Test name> (Xm)". Result copy renders inline under the symptom line, and eliminated
   causes strike through (the `ServiceTaskList` done-styling idiom). Two-step confirm when
   starting a second visit with minutes still left. `data-test` attributes:
   `inspect-visit-<tier>`, `run-test-<lotId>-<symptomIndex>-<testId>`.
8. **Car page.** Owned symptomatic car: symptom block with the same checklist, a "Full workup
   (1 slot)" button (`data-test="car-workup"`), and uncertainty chips per decision 5. No yard
   tests on owned cars (the workup supersedes them).
9. `SAVE_VERSION` 33 -> 34 (`runTestIds` field), no migration.

## Tasks

**Claude:**

1. State + schema: `inspectionVisit` on `GameState`, `runTestIds` on the symptom entry; codec
   roundtrip test; `SAVE_VERSION` 34.
2. Sim verbs in `diagnosis.ts`: `beginInspectionVisit`, `runDiagnosticTest`,
   `resolveOwnedWorkup`, `displayedBandFor`, `playerEstimateYen`, per decisions 1-3, 5-6; the
   `advanceDay` clear; day-log kinds `inspection-visit`, `car-workup` + formatters.
3. The reveal-on-removal rule in `resolveRemovePart` per decision 4 (+ its log line).
4. Store: expose visit state, gate reasons, test dispatch, estimate + displayed-band fields on
   `LotDetail` and the car detail view-model.
5. UI per decisions 7-8 in `AuctionScreen.vue` and `CarDetailScreen.vue`; all copy British; no
   decorative Unicode; HelpHint copy must not use gate/staged/dev (copyGuard).
6. Tests: visit gating (slot, fee, tier, one-at-a-time, day reset); minutes accounting; test
   legality (applicability, repeats, minutes); partition narrowing to hand-computed sets for
   every symptom-test pair in the Sprint 73 tables; workup collapse; reveal-on-removal both
   branches; `displayedBandFor` truth table; estimate reweighting on a hand-computed fixture;
   rival ceilings unchanged by any knowledge action (extend the Sprint 73 blindness test);
   component tests for the visit panel and the workup button following
   `AuctionScreen.test.ts` patterns (`data-test` selectors, store-state assertions).
7. Golden re-pins with comment; full gate; Exit.

**User-only (maintainer):**

- First feel-playtest of the hour (is 60 minutes / these test costs the right pressure?): the
  numbers are content, tune freely afterwards.

## Definition of done

- The yard visit exists exactly as specced (1 slot + tiered fee, one hour, per-test minutes, no
  bulk action, dies at day end); tests narrow knowledge deterministically and their result copy
  renders; a lost inspected lot's spent slot is simply spent.
- The owned workup and uninstall-reveal both collapse knowledge; the bench-only ambiguity
  (`wont-idle`) is resolvable only by those two routes.
- One display rule (`displayedBandFor`) governs every band the player sees; uncertain parts
  show ranges; the player estimate line appears once knowledge exists and reweights correctly.
- Rivals remain provably blind. `SAVE_VERSION` 34; full gate green; goldens re-pinned.

## Exit

**Built, in full.** All seven tasks landed.

- **Task 1 (state + schema):** `CarSymptomSchema` gained `runTestIds` (default `[]`); `GameState`
  gained `inspectionVisit: InspectionVisitSchema.nullable().default(null)`; `DayLogEntry` gained
  `revealedCauseId` on `part-removed` (optional) and two new kinds, `inspection-visit`/
  `car-workup`. `SAVE_VERSION` 33 -> 34, additive-only (directive 19 - no migration). Codec
  roundtrip tests added for both new fields and a real pre-v34-shape decode.
- **Task 2 (sim verbs, `diagnosis.ts`):** `beginInspectionVisit`, `runDiagnosticTest`,
  `resolveOwnedWorkup` (the three day-state verbs, decisions 1-3); `displayedBandFor` (decision
  5's one display rule) and `worstRemainingBandFor` (the repair-range's worst end);
  `playerEstimateYen` (decision 6, no fear premium, reweights over `remainingCauseIds`);
  `revealOnRemoval` (decision 4). `advanceDay`'s day-boundary tick unconditionally clears
  `inspectionVisit`. Two new day-log formatters. `symptomDiscountYen` (Sprint 73) refactored to
  accept an optional `causesFor` selector so `playerEstimateYen` reuses it instead of a second
  weighted-mean implementation.
- **Task 3 (reveal-on-removal wiring):** `resolveRemovePart`'s owned-car branch calls
  `revealOnRemoval` and threads `revealedCauseId` onto the `part-removed` log entry only when a
  collapse actually happened.
- **Task 4 (store):** `LotDetail.symptoms` extended to the full decision-7 shape
  (`symptomIndex`/`resolved`/`causes[].eliminated`/`tests[].alreadyRun`) and `LotDetail
  .playerEstimateYen` wired (null until any test has run or any symptom has resolved).
  `CarDetail` gained the matching `symptoms`/`workupGateReason` fields for the owned-car page.
  `CarPartRowView.uncertain` wired through `displayedBandFor`. Store exposes `inspectionVisit`,
  `inspectionVisitGateReason`, `travelFeeYenFor`, and three action wrappers
  (`beginInspectionVisit`, `runDiagnosticTest`, `resolveOwnedWorkup`) around the sim verbs.
- **Task 5 (UI):** `AuctionScreen.vue` - a per-tier "Inspect here (1 slot + fee)" header button
  (disabled-with-reason, two-step confirm when it would forfeit an active visit elsewhere), the
  fixed "At the yard: Xm left" panel, per-symptom test buttons (`<Test name> (Xm)`, disabled with
  reason once already run/wrong tier/not enough minutes), inline result-copy, eliminated-cause
  strikethrough, and the player-estimate line. `CarDetailScreen.vue` - a symptom panel (same
  checklist, no test buttons) with a "Full workup (1 slot)" button, and a "?" uncertainty chip on
  any still-open symptomatic part row. All copy British; no decorative Unicode; no HelpHint touched
  by this sprint's copy.
- **Task 6 (tests):** 65 new sim tests (`diagnosis.test.ts`, 7 -> 72) covering every verb's gating,
  minutes accounting, the exhaustive partition-narrowing check (all 12 real symptom-test pairs x
  every possible true cause - 24 generated cases against real content), `resolveOwnedWorkup`,
  `revealOnRemoval`'s both branches plus its already-resolved no-op, the full `displayedBandFor`
  truth table, `worstRemainingBandFor`, and `playerEstimateYen`'s reweighting (full-weight,
  narrowed-to-one, and no-fear-premium cases). 2 new tests in `jobs.test.ts` proving
  `resolveRemovePart` actually reaches `revealOnRemoval` (both branches, via the log's
  `revealedCauseId`). 2 new tests in `advanceDay.test.ts` for the day-boundary reset. 10 new
  component tests (4 in `AuctionScreen.test.ts` for the visit button/panel/test-run/already-run
  gate; 6 in `CarDetailScreen.test.ts` for the symptom panel/workup button/uncertainty chip/gate
  reason). Sim suite 692 -> 761; game suite 483 -> 493.

**Deviations, with why:**

1. **`lotSymptomViews` renamed to `symptomChecklistForCar` and reused for the owned-car page**
   (beyond the doc's own per-screen framing). The checklist shape (`symptomIndex`/`line`/
   `resolved`/`causes`/`tests`) is identical whether the car is a lot or owned - decision 8 asks
   for "the same checklist" on the car page verbatim, so building it twice would have been the
   exact duplicate-mechanism directive 16 exists to prevent. The owned-car view simply never
   renders the `tests` array (no yard tests on an owned car, decision 8) - the data is honest and
   complete either way, only the UI chooses not to show test buttons there.
2. **`inspectionVisitGateReason` and `ownedWorkupGateReason` factored as separate pure predicates**
   in `diagnosis.ts`, mirroring `removeBlockReason`'s established reuse shape (jobs.ts) - not asked
   for by name in the doc, but the doc's own task 4 says "gate reasons" (plural) and this codebase
   already has a standing idiom for "the UI's proactive why-not, sharing one gate with the verb
   that enforces it" (`naToTurboConversionBlocked`/`removeBlockReason`). `beginInspectionVisit`/
   `resolveOwnedWorkup` now delegate to these predicates instead of duplicating the gate logic
   inline, so there is exactly one gate per verb, not two.
3. **Decision 5's repair-cost-preview RANGE (`nextPartStepRange`, wired into the per-part `+`
   button's tooltip via `partStepTitle`) is implemented in full but is currently unreachable
   through real content, and this is disclosed rather than hidden.** Every one of Sprint 73's 8
   symptoms targets a `bolt-on` or `buried` part (`headValvetrain`, `internals`, `gearbox`,
   `dampers`, `antiRollBars`, `steering`, `brakePadsDiscs`, `brakeCalipersLines`, `cooling`,
   `camsTiming`, `intake`, `fuelSystem`, `ignitionEcu`, `block` - confirmed against
   `parts-taxonomy.json`), and Sprint 71's bench-only rule already excludes every non-surface part
   from the on-car repair preview entirely (`planGroupRepair`, `bands.ts`) - so no shipped symptom
   ever produces an uncertain SURFACE part with a live on-car "+" button to show a range on. The
   "?" uncertainty chip (the other half of decision 5) IS reachable and IS tested, since it renders
   for any uncertain part regardless of depth class. The range mechanism is real, correct (reuses
   the exact plan-diff arithmetic `nextRepairStep` already uses, just against a band-overridden
   car), and forward-compatible - it activates automatically the moment a future symptom targets a
   surface part (`panels`/`paint`/`underbody`/`aero`/`seats`/`dashGauges`). Tested only on its
   reachable branch (`nextPartStepRange` returns `null` for the ordinary case); the "real range"
   branch has no automated test because constructing it requires content the game does not ship -
   noted here rather than silently left uncovered.
4. **Directive 17 case (a) statements** - three of my own new tests asserted something false about
   the codebase, not about the implementation; all three were fixed by correcting the test, not
   the code:
   - `inspectionVisitGateReason`'s "no-lots" test assumed a fresh `createInitialGameState` starts
     with an empty auction board; it actually seeds a real starter catalog (Sprint 10). Fixed by
     explicitly clearing `activeAuctionLots` in that one fixture.
   - An `AuctionScreen.test.ts` assertion assumed `titleCaseFromSlug('head-gasket')` produces
     "Head Gasket"; the existing (pre-Sprint-74) utility only capitalises the first word ("Head
     gasket"). Fixed the expected string.
   - A `CarDetailScreen.test.ts` assertion assumed an uncertain `headValvetrain` would offer an
     on-car repair-step button; `headValvetrain` is `buried` (Sprint 71), so it never gets one
     regardless of any symptom. Fixed by asserting the button's absence instead (a real,
     informative assertion) and moving the range-mechanism check to its one reachable case (see
     deviation 3).
5. **No golden-hash re-pin this task.** Everything in this session's remaining work (store, UI,
   tests) is additive and non-RNG - the two re-pins this sprint needed (`inspectionVisit`/
   `runTestIds` shape additions) were already made and documented during task 1/2's own work,
   before this Exit was written. Re-confirmed clean by running the full `advanceDay.test.ts` golden
   suite after every subsequent change in this session.

**Not done:** nothing from the task list was skipped. Decision 5's range mechanism is implemented
but currently dormant against real content (deviation 3) - not a gap in this sprint's own scope,
since the mechanism itself is complete and correct.

**Gate:** `pnpm typecheck` (content/sim/game) clean; `pnpm lint` clean; `pnpm format` clean;
`pnpm test:coverage` - 1309/1309 tests passed across 89 files, coverage 89.52% statements / 79.42%
branches / 92.29% functions / 93.37% lines (all four above the ratchet floor); `pnpm build` clean
(pre-existing >500kB main-chunk warning, unrelated to this sprint).
