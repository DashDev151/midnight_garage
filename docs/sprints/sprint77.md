# Sprint 77 - Story missions II: the lap model, the reference board, and the mission flows

**Source:** `docs/design/story-builds-spec.md` v2 ("Grading transparency: the reference-lap
board", the grip-delta anchor ruling, synthetic reference times with the cost disclosed).
Depends on Sprint 76 (contract machine).

**For the implementing agent:** verify every cited symbol before editing; STOP if missing. No em
dashes. British English in all player copy.

## Confirmed current state (after Sprint 76)

- Missions run end to end in sim with placeholder content; the pinned offer card and Accept
  exist on `ServiceJobsScreen.vue`; `gradeMissionCar` returns per-requirement lines; no deliver
  UI, no lap primitive.
- `computeDerivedStats` outputs a PS-like `power`; `model.spec.curbWeightKg` and
  `model.spec.stockPowerPs` exist on every model (`carModel.ts:23`); tyres are the `tyres` slot
  and a fitted tyre's catalog entry carries `grade: stock|street|sport|race` (`parts.json`);
  there is NO grip concept in code (confirmed by discovery): the tyre grade IS the grip tier.
- Modal convention: `SaleCompleteModal.vue`; formatting: `formatYen` (`utils/formatYen.ts`).
- Naming guard (`naming.test.ts`) scans mission/persona copy since Sprint 76.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- `computeDerivedStats().power` and `model.spec.curbWeightKg`: the lap model's two continuous
  inputs; the fitted tyre SKU's `grade` is the third (discrete). No new stat axes.
- `requirements.ts`: `lapTimeCeiling` is one more primitive on the shared module.
- The Sprint 76 mission panel + `gradeMissionCar` lines: the deliver flow renders what the sim
  already returns.
- `SaleCompleteModal` shape for `MissionCompleteModal`; `formatYen`; the `[ ]` checklist idiom
  for grade lines.

**New mechanisms:**

1. `packages/sim/src/lapModel.ts`: one pure function + JSON coefficients.
2. `lapReferences.json`: the authored comparable pool + the grip anchor.
3. The board's straddling-selection rule (pure, deterministic).
4. The deliver flow UI (car picker, grade report, deliver) and `MissionCompleteModal`.

## Decisions

1. **The lap model** (one pure function, all coefficients in `economy.lapModel`):
   `lapTimeSecondsFor(car, model, context): number | null` =
   `round1(C x (curbWeightKg / power)^ratioExp x gripMult[tyreGrade])`, where `power` is the
   car's CURRENT derived power (condition and parts matter; that is the build game), and
   `tyreGrade` is the fitted tyre SKU's `grade`. Returns `null` (no time can be set) when the
   tyres slot is empty or scrap-band. Coefficients: `C: 42.5`, `ratioExp: 0.35`,
   `gripMult: { stock: 1.06, street: 1.00, sport: 0.94, race: 0.88 }`, `courseId:
   "kirifuri"`, `courseName: "Kirifuri Pass"` (one course in v1.0; the schema is
   course-keyed so a second course is content, not code). Monotonic and roughly separable by
   construction: more power always helps, less weight always helps, better tyres always help.
   Golden test pins hand-computed times, including: 130 PS / 940 kg / street = 84.9s and
   55 PS / 720 kg / stock = 110.5s (recompute exactly in the test, do not trust these to the
   decimal; the FORMULA is the contract).
2. **`lapTimeCeiling` primitive** in `requirements.ts`: `{ courseId, maxSeconds }`; fail with
   `actual: "no time set"` when the model returns null.
3. **The reference board content.** `content/src/lapReference.ts` + `lapReferences.json`:
   - The GRIP ANCHOR: one entry, `anchor: true`, "the magazine's long-termer", 150 PS /
     1000 kg, rendered once per tyre grade (four rows, the player reads the grade deltas off
     one identical car; the spec's ruling).
   - TWELVE pool entries: fictional, diegetic names (a shop car, a touge regular's car, a
     magazine feature car; NO real model/brand tokens; the naming guard scans this file),
     each `{ id, name, powerPs, weightKg, tyreGrade }` spanning roughly 70s to 110s when run
     through the model. Times are ALWAYS computed by the model at render (synthetic by
     ruling; never authored), so retuning coefficients retunes the board for free.
4. **Board selection rule** (pure, in `lapModel.ts`): given the player's candidate car, compute
   its (hidden) time; from pool entries of the SAME tyre grade pick the 2 nearest slower and 2
   nearest faster; pad from adjacent grades by nearest time when a side runs dry; always append
   the 4 anchor rows. No candidate car selected -> anchor rows + the 4 pool entries nearest the
   requirement's target time. THE PLAYER'S OWN PREDICTED TIME IS NEVER SHOWN, anywhere,
   including tests' UI assertions (the triangulation IS the game; only delivery grading reveals
   pass/fail).
5. **Deliver flow UI** (all inside the mission panel on `ServiceJobsScreen.vue`): an active
   mission shows the requirement checklist (labels only, no live pass/fail), a car picker over
   owned cars (`data-test="mission-pick-car"`), and "Show them the car"
   (`data-test="mission-grade"`) which renders `gradeMissionCar`'s lines as the `[ ]`/`[x]`
   checklist WITH actual-vs-required per line: grading is free, repeatable, and honest. When
   every line passes, "Hand it over" (`data-test="mission-deliver"`) calls
   `resolveDeliverMission` behind a two-step confirm (the car leaves for good).
   For missions with a `lapTimeCeiling`, the panel includes the reference board table (name,
   power, weight, tyres, time) per decision 4, with the anchor rows visually grouped.
6. **`MissionCompleteModal.vue`**: `SaleCompleteModal` pattern (global singleton in `App.vue`,
   store-driven `lastMissionResult`, Escape-chain wired): persona name, `deliveredCopy` (or
   `overdeliveredCopy` when the tip triggered), payout (+ tip line), reputation and specialty
   awards. Lapse surfaces need no modal: the day report + `mission-lapsed` log line carry
   `lapsedCopy`.
7. `economy.lapModel` joins the anchor list + bible audit table (pre-approved 2026-07-15). No
   save-schema change (mission state existed in 76; the board is stateless).

## Tasks

**Claude:**

1. `lapModel.ts` (`lapTimeSecondsFor`, `selectBoardRows`) + `economy.lapModel` + golden tests
   per decisions 1 and 4 (including determinism, monotonicity in each input, null-tyres, and a
   selection test on a hand-built pool).
2. `lapTimeCeiling` primitive + tests per decision 2.
3. `lapReferences.json` + schema + content guards (anchor uniqueness, 12 pool entries, name
   fields pass the naming guard, times-within-range assertion through the model).
4. Deliver flow per decision 5 (store: candidate selection, grade dispatch, deliver dispatch;
   screen: picker, checklist, board table) with component tests: grade lines render
   actual-vs-required; deliver disabled until pass; the player's own time never appears in the
   DOM (assert its absence explicitly); two-step confirm.
5. `MissionCompleteModal` per decision 6 + component tests (both copy branches).
6. Full gate; goldens re-pinned if any economy hash moved; Exit.

**User-only (maintainer):**

- Read the board in play and judge decision-4's curation (too solvable? cut pool entries; the
  spec's own fallback: "fewer comparables, not a more complex model").

## Definition of done

- One pure lap function with JSON coefficients and pinned goldens; lap requirement grades
  through the shared module; no time without tyres.
- The board renders anchor + straddling comparables with model-computed times; the player's own
  time is provably absent from the UI.
- A mission can be graded repeatedly for free with honest actual-vs-required lines and
  delivered behind a confirm; delivery pays, tips, awards, and removes the car; the modal
  speaks the persona's line.
- Full gate green.

## Exit

**Built, task by task:**

1. `packages/sim/src/lapModel.ts`: `lapTimeSecondsFor(car, model, context)` (decision 1's exact
   formula, `null` on an empty/scrap tyres slot) and `selectBoardRows(pool, anchor, candidate,
   noCandidateTargetSeconds, economy)` (decision 4's straddling rule: 2 nearest slower + 2 nearest
   faster at the candidate's own tyre grade, padded from the rest of the pool by nearest time when
   a side runs short; with no candidate, the 4 pool entries nearest the mission's own target time;
   the 4 anchor rows always appended). `economy.lapModel` added to `economy.ts`/`economy.json`
   (`C: 42.5`, `ratioExp: 0.35`, `gripMult` per grade, `courseId: "kirifuri"`) and to
   `schemas.test.ts`'s anchor-key list + `economy-bible.md`'s audit table and amendment log. 16
   tests in `packages/sim/tests/lapModel.test.ts`: two formula cross-checks (an independent
   restatement of the coefficients, not the doc's own rounded examples - see deviation 1), null-tyres
   (empty and scrap), determinism, three monotonicity tests (power/weight/tyre grade), and 6
   `selectBoardRows` tests (anchor rows always present, same-grade straddle, cross-grade padding,
   no-candidate nearest-4, the candidate's own time never in the output, determinism) plus 2 tests
   proving the real `lapReferences.json` content lands in the intended time range.
2. `lapTimeCeiling { courseId, maxSeconds }` added as the `RequirementSpecSchema`'s 8th member and
   `evaluateRequirement`'s 7th case; fails with `actual: "no time set"` when the model returns
   `null`. 4 tests in `requirements.test.ts` (pass, fail, no-tyres, no-model).
3. `content/src/lapReference.ts` (a discriminated `anchor: true/false` union - the anchor carries
   no `tyreGrade`, every pool entry must) + `data/lapReferences.json` (1 anchor, "the magazine's
   long-termer" at 150 PS/1000 kg, + 12 fictional pool entries, 3 per tyre grade). Content guards:
   `content/tests/lapReference.test.ts` (parse, exactly 1 anchor, exactly 12 pool entries, unique
   ids, anchor/pool field shape), `naming.test.ts` (+1 leak-guard test), `spellingGuard.test.ts`
   (+1 scanned field). `SimContext` gained `lapReferencePool`/`lapReferenceAnchor`
   (`buildSimContext`'s 17th trailing param), throwing at content-load time if the anchor is
   missing.
4. The deliver flow. `requirements.ts` gained an exported `requirementLabel(spec, context)` -
   every kind's `label`/`required` text factored out into one place, since none of it ever actually
   depended on the car (only `actual`/`pass` do) - every `evaluate*` function now calls it rather
   than recomputing its own copy (a DRY refactor, zero behaviour change, verified by the full
   `requirements.test.ts`/`missions.test.ts` suites passing unchanged). `gameStore.ts` gained
   `gradeMission`/`deliverMission`/`lapBoardRowsFor`/`missionCarOptions`, `activeStoryMissionView`
   extended with `requirementLines` (the label-only checklist) and `lapTimeCeiling`, and
   `lastMissionResult`/`dismissMissionResult`. `ServiceJobsScreen.vue`'s active-mission panel
   gained the requirement checklist (`[ ]`/`[x]`, actual-vs-required once graded), the car picker
   (`data-test="mission-pick-car"`), "Show them the car" (`data-test="mission-grade"`), the
   reference-lap table (`data-test="mission-lap-board"`, shown only when the mission has a
   `lapTimeCeiling`), and "Hand it over" (`data-test="mission-deliver"`) behind a two-step confirm
   matching `CarDetailScreen.vue`'s existing `scrapConfirming` idiom exactly. 6 new component tests
   in `ServiceJobsScreen.test.ts` (labels-only before grading, full lines after "Show them the
   car", grading resets on a car change, deliver absent until pass, the two-step confirm delivers
   and pays out, no board renders for a non-lap mission).
5. `packages/game/src/components/MissionCompleteModal.vue` - `SaleCompleteModal`'s exact shape and
   lifecycle (global singleton in `App.vue`, `lastMissionResult` ref, Escape-chain wired in).
   `result.copy` is already the right template (`overdeliveredCopy` vs `deliveredCopy`) picked by
   the store, never branched on here. 5 component tests in `MissionCompleteModal.test.ts` (no
   result renders nothing, plain delivery, tip line conditional, specialty line conditional,
   Continue dismisses).
6. Full workspace gate green (numbers below); no `SAVE_VERSION` bump (decision 7: the mission
   state schema is unchanged, the board is stateless) and no golden-hash re-pins needed (neither
   the lap model nor the new requirement kind touch `advanceDay`'s RNG sequence).

**Deviations, with why:**

1. Decision 1's two worked examples (130 PS/940 kg/street = 84.9s, 55 PS/720 kg/stock = 110.5s)
   were checked by hand against the published coefficients before writing any test. The first
   matches exactly; the second does not (a careful independent recomputation gives ~110.8s, not
   110.5s - a ~0.3s hand-arithmetic slip in the doc's own worked example). Handled exactly per the
   doc's own explicit instruction ("recompute exactly in the test, do not trust these to the
   decimal - the FORMULA is the contract"): `lapModel.test.ts` computes its expected values from an
   independent restatement of the SAME formula/coefficients, not by hardcoding either number, plus
   a generous `toBeCloseTo` sanity check against the first (exact) example only.
2. "The requirement checklist (labels only, no live pass/fail)" is implemented as a pull-based,
   non-reactive grade: the checklist shows labels only until "Show them the car" is clicked, then
   shows the real `gradeMissionCar` lines (actual-vs-required, pass) as a snapshot; picking a
   different car resets back to labels-only rather than re-grading automatically. This is a
   necessary interpretation, not spelled out further by the doc beyond naming the two buttons - the
   alternative reading (never show real values until delivery) would contradict decision 5's own
   next sentence, which requires "Show them the car" to render actual-vs-required.
3. Decision 4's "pad from adjacent grades by nearest time" is implemented as padding from ANY other
   grade, nearest by time (not restricted to the two grade-neighbours in the stock/street/sport/race
   order). The formula's own monotonicity means a grade-adjacent car naturally lands at a similar
   time anyway, so in practice this rarely differs from a strict adjacency reading; documented as a
   judgment call in `lapModel.ts`'s own doc comment.
4. End-to-end reference-board UI coverage is partial by content necessity: neither Sprint 76
   placeholder mission (`placeholder-a`/`placeholder-b`) carries a `lapTimeCeiling` requirement -
   Sprint 78 authors the real lap-time missions. `ServiceJobsScreen.test.ts` can therefore only
   prove the board's `v-if` gate correctly hides the table for a non-lap mission; full rendering
   (correct straddling rows, anchor grouping, the candidate's own time never appearing) is proven at
   the sim level (`lapModel.test.ts`) this sprint. True end-to-end coverage arrives once Sprint 78
   ships a real lap-time mission.

**Not done / user-only:**

- Decision 4's maintainer task ("read the board in play and judge the curation - too solvable? cut
  pool entries") is explicitly user-only and untouched here - I do not run `pnpm dev` myself
  (CLAUDE.md directive 12). To try the deliver flow: `pnpm dev`, End Day once to clear
  placeholder-a's gate, Accept it from the Service jobs board, dev-grant a car from the console,
  pick it, "Show them the car", "Hand it over" twice.
- Sprint 78's real campaign content (replacing both placeholders) and its real lap-time mission(s)
  - the first genuine end-to-end exercise of the reference board.

**Full gate:**

- `pnpm typecheck`: clean (content, sim, game).
- `pnpm lint`: clean.
- `pnpm format`: clean.
- `pnpm test:coverage`: 1444/1444 tests, 98 files. Coverage 89.29% statements / 79.3% branches /
  92.34% functions / 93.17% lines - all above the ratchet floors (80/65/78/82).
- `pnpm build`: clean.
- `pnpm balance:run` (900,000 rows, 9 strategies x 1000 careers x 100 days) +
  `python -m balance.cli check`: every hard-gated invariant passes except the ONE already-documented
  pre-existing failure - "Days-to-`local`, competent probe policy: p50=None (0/1000 seeds reached
  `local` within the career horizon)" - the Sprint 71 teardown-stall bug `TODO.md`'s standing bot-
  harness-rework entry (item 6) already tracks in full, unrelated to the lap model or the deliver
  flow (no bot in this harness ever accepts, grades, or delivers a story mission - that integration
  is unscoped for both Sprint 76 and this sprint). Every other check passes unchanged, including the
  informational disclosures from Sprints 72/75.
