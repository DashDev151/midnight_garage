# Sprint 230: the job card, the trolley, and the on-car flow

**Status:** Complete, ready for review. Not committed.
**Arc:** `repair-refactor-arc.md` sprint 7 of 9. Depends on 229.
**Scope:** game package. CarDetailScreen's repair surface is replaced: job card panel
(spec 8), in-situ Service and fixed-surface work via the tool trolley (spec 7.3), the
hire-day refit warning, tyre-fit captions, and the day-log lines for the new events. After
this sprint the player never touches the old repair path; 231 deletes it.

## Reuse analysis (directive 16)

New mechanisms: `JobCardPanel.vue` and `ToolTrolley.vue`. Reused: `repairJobCards` /
`resolveRepairStep` (225) power everything; `StepStrip` (229) is reused unchanged for
on-car steps; `WorkshopViews` remains the selection surface and is untouched; the
remove/fit/blockedBy flows keep their buttons and store actions; `dayLogFormat`'s
aggregation idiom (the body-materials pattern) formats step spam into per-part lines.

## Locked design

### JobCardPanel.vue (used by CarDetailScreen and BenchScreen)

Props: `cards: RepairJobCard[]`, `removalEnergyPoints` handling included. Renders the
spec-8 price list, one line per card (`job-card-{kind}`): job name ("Service" /
"Rebuild" / "Restore"), target `BandChip`, all-in figures (`job-card-cost-{kind}`):
"{energy} energy · {yen}" where energy = `energyPoints + removalEnergyPoints` and yen =
`partsYen + hireFeeYen`, and the tool-status chip (`job-card-route-{kind}`, locked
labels): own -> "own" (green token), hired-today -> "hired today" (green token),
hire -> "hire {fee}" (yellow token), slog -> "slog x3" (amber token), locked -> the
short reason ("needs the {shop}" / "needs the {machine}", grey token). NOTHING in the
panel is clickable; it renders no buttons (spec 8). BenchScreen swaps its 229 tab-row
cost display for this panel above the tabs (tabs remain the selector).

### CarDetailScreen surgery

- The per-part action panel's repair section (the `repair-part-{partId}` buttons, the
  `repair-ceiling-{partId}` caption, the `assist-fee-repair-{partId}` note, and the
  repair branch of `continueJob`) is REMOVED and replaced by:
  1. `JobCardPanel` for the selected part (always shown for repairable parts).
  2. For jobs runnable ON THE CAR - Service on any installed part, plus Rebuild/Restore
     on `removable: false` parts (chassis) - the 229 job tabs + `StepStrip` render under
     the panel, and the **tool trolley** renders beside them.
- `ToolTrolley.vue` (`data-test="tool-trolley"`): the DISTINCT tools of the selected
  job's remaining steps, as chips in step order (`trolley-tool-{toolId}`), current step's
  tool glowing; click semantics, shake, slog stand-in (`trolley-slog-{toolId}`), refusal
  notes and locked copy IDENTICAL to the bench board (229 section 4) - same component
  patterns, target `{ kind: 'installed', carInstanceId, carPartId }`. Header line
  (locked): "The trolley's out. Tools go back when the job's done."
- Removal flow additions:
  - When a buried part's removal route is `'hired'` (rig hired, not owned), the existing
    remove button gains a caption (`refit-warning-{partId}`, locked copy): "Refitting
    will need the {machine name} again."
  - When the route is `'slog'`, the 226 note already covers it (triple labour copy).
- The `remove-machine-note`/`assembly-machine-note` captions keep their 226 copy.
- Tyre fitting (WarehouseDrawer bench-fit note): when the wheels line is absent and
  unhired, the existing `bench-machine-note` renders (locked copy): "By hand with
  levers: triple the labour." Otherwise no note.
- Body pipeline surfaces, zone panel, sale/finance panels: untouched.

### Day log (dayLogFormat.ts)

- `repair-step` entries are AGGREGATED per car+part+kind in `classifyDayReport` (the
  body-materials-used pattern): "{Part label}, {car}: {n} steps of the {service /
  rebuild / restore}". Loose parts use the part label alone.
- `repair-job-completed` (locked): "Serviced the {part} to worn" / "Rebuilt the {part}
  to fine" / "Restored the {part} to mint", with ", {car}" appended for installed
  targets.
- The old `part-reconditioned` branch stays until 231.

## Tasks

1. `JobCardPanel.vue` + BenchScreen adoption.
2. CarDetailScreen surgery exactly as listed (remove old surfaces, add panel + tabs +
   strip + trolley).
3. `ToolTrolley.vue`.
4. Refit warning + tyre caption.
5. Day-log branches + aggregation.
6. Tests:
   - `JobCardPanel.test.ts`: five route chips render their locked labels/figures; panel
     contains zero buttons; all-in figures sum energy + removal and parts + hire.
   - CarDetailScreen tests: old repair data-tests are GONE (assert absence of
     `repair-part-*`); job cards render for a selected part; chassis shows tabs for all
     three jobs on-car; a buried part shows Service on-car and its Rebuild card routes
     `'needs-bench'` disabled; trolley glows/advances/refuses like the bench (mirror the
     229 cases against an installed target); refit warning appears exactly when the rig
     is hired-not-owned; in-situ buried Service first step costs 4+6 (assert store energy
     delta).
   - dayLogFormat tests: aggregation line and the three completion lines.
7. `pnpm typecheck` once (store surface changes).

## Checks

The three test files individually; one `pnpm test --project game` sweep; `pnpm typecheck`.

## Exit

All seven tasks landed. The game package only: no sim source file was touched, and the two
content files that changed are schema and ledger additions the new day-log entries need
(`gameState.ts`'s two new `DayLogEntry` members and `cashLedger.ts` classifying them as
moving no money of their own). After this sprint nothing in the running game reaches the
old per-part on-car repair path; sprint 231 deletes it, and the readiness list at the foot
of this Exit is that sprint's deletion inventory.

### Files landed

New:

- `packages/game/src/components/JobCardPanel.vue`: the spec-8 price list, one `<li>` per
  card. Props `cards: RepairJobCard[]` and `shopName: string`. Data-tests
  `job-card-{kind}`, `job-card-cost-{kind}`, `job-card-route-{kind}`; route colour carried
  by `job-route-{route}` classes (own / hired-today green, hire yellow, slog violet, locked
  dim). Renders zero buttons, asserted.
- `packages/game/src/components/ToolTrolley.vue`: `tool-trolley`, one chip per DISTINCT
  tool of the selected job's remaining steps in step order (`trolley-tool-{toolId}`), the
  current step's chip glowing (`trolley-tool-glow`), a refused chip shaking for 200 ms
  (`trolley-tool-shake`), a sloggable step's proper tool left as a dashed outline
  (`trolley-tool-outline`) with the stand-in under it (`trolley-slog-{toolId}`). The chip
  row reserves the stand-in's height always, so one appearing moves nothing. Emits
  `run-step` and decides nothing else. `prefers-reduced-motion: reduce` drops all three
  animations and holds the glow and stand-in at their steady inset outline, so every state
  still reads by colour and border.
- `packages/game/src/utils/repairJobLabels.ts`: the words both repair surfaces use.
  `REPAIR_JOB_LABELS`, `RepairJobTabView`, `repairJobTabViews()`, `defaultRepairJobKind()`,
  `repairStepEnergyText()`, `repairStepRefusalText()`. Extracted out of BenchScreen so the
  bench board and the car say the same sentence about the same job rather than two copies
  drifting; this is what makes the doc's "IDENTICAL to the bench board" literal.
- `packages/game/src/components/JobCardPanel.test.ts`: 8 tests.

Modified:

- `packages/game/src/screens/CarDetailScreen.vue`: the surgery below.
- `packages/game/src/screens/BenchScreen.vue`: `JobCardPanel` mounted above the tab row, the
  `BandChip` dropped off the tab itself (the band is the card's to show), and its four local
  copy/selection helpers replaced by the `repairJobLabels.ts` imports. Net 95 lines removed
  for 0 behaviour change beyond the panel.
- `packages/game/src/components/WarehouseDrawer.test.ts`: 4 tests for the tyre caption.
- `packages/game/src/screens/BenchScreen.test.ts`: 1 test for the panel above the tabs.
- `packages/game/src/screens/CarDetailScreen.test.ts`: net +4 tests (98 to 102): 8 new in the
  job-card describe, 4 old repair tests rewritten onto the trolley, 3 deleted with the
  surfaces they asserted, 2 merged into one.
- `packages/game/src/utils/dayLogFormat.ts` / `.test.ts`: the two new branches and the
  aggregation, 3 new tests.
- `packages/game/src/stores/gameStore.ts`: four new getters, one behaviour change, one
  filter (below).
- `packages/content/src/gameState.ts`: `repair-step` and `repair-job-completed` added to
  `DayLogEntrySchema`, both carrying the job's own installed/loose split (exactly one of
  `carInstanceId`/`partInstanceId`).
- `packages/content/src/cashLedger.ts`: both new types listed as moving no money, with the
  reason (the whole parts bill is charged on the job's first step by `chargePartsBill`, so
  a per-step movement would double-charge the same yen).

### CarDetailScreen surgery: what came out

Removed from the per-part action panel, and asserted absent by the test "the old per-part
repair surfaces are gone from the panel entirely":

- `repair-part-{partId}` (the on-car click-per-rung repair button)
- `repair-ceiling-{partId}` (the tier-1 "your tools finish at fine" caption)
- `assist-fee-repair-{partId}` (the repair machine-labour note)
- `repair-reveal-{partId}` (both call sites: the fresh click and the Continue-repair branch)

Script symbols deleted with them: `nextPartStep`, `nextPartStepOrFallback`,
`uncertainStepLabel`, `partStepTitle`, `onRepairStepClick`, the `RepairAddress` interface,
`pendingRepairConfirm`, `sameRepairAddress`, `isPendingRepairConfirm`, `repairReveal`,
`armOrConfirmRepair`, `repairMachineNoteFor`, `repairCeilingCaptionFor`. Styles deleted:
`.reveal-confirm`, `.ceiling-caption`. `continueJob` lost its `repair-zone` branch and
`continueLabelAt` its `'Continue repair'` label; `jobFor` now matches only `install-part`
and `machine-part`, so the Continue control never speaks for a repair again.

Added in their place: `part-repair-panel` (the section, rendered whenever the store offers
cards), `JobCardPanel`, the three `car-job-{kind}` tabs, `StepStrip`, `ToolTrolley`, and
`car-repair-refusal`. Plus `refit-warning-{partId}` on the Remove affordance and
`continue-job-{partId}` on the Continue control (see deviation 1).

### Store changes

- `carPartJobCards(carId, carPartId)`: the sim's three cards for an installed slot, or `[]`
  when no card is worth offering at all (nothing repairable, or already at or above every
  target). A card refused `needs-bench` or `needs-shop` is still carried, which is the whole
  point of a price list.
- `repairEnergyPlan(target, kind)`: `energyPlanFor` behind the store, so BenchScreen stopped
  reaching into `game.gameState`/`game.context` for it and the car never learned to.
- `toolShopNameForGroup(group)`: the one thing a job card names rather than prices.
- `refitWarningFor(carId, carPartId)`: the locked caption, exactly when
  `accessRoute(...).route === 'hired'`.
- `carDetail().jobs` now filters the three repair kinds out (`REPAIR_JOB_KIND_SET`), so a
  repair job never appears in the Work list or under a Continue control. It is worked off
  its own card.
- `benchFitMachineNoteFor` switched from `machineLaborDisclosureText(...)`'s computed
  fee-and-slots sentence to the locked one-liner, and now returns `''` whenever the line is
  owned or hired for the day.

### The copy as shipped, verbatim

| Where | String |
| --- | --- |
| `ToolTrolley` header | `The trolley's out. Tools go back when the job's done.` |
| Trolley stand-in chip | `make do` |
| `refit-warning-{partId}` | `Refitting will need the {machine name} again.` |
| `bench-machine-note` / `bench-fit-gate-tyres` | `By hand with levers: triple the labour.` |
| Route: own | `own` |
| Route: hired today | `hired today` |
| Route: hire | `hire {fee}` |
| Route: slog | `slog x3` |
| Route: locked, shop | `needs the {shop}` |
| Route: locked, machine | `needs the {machine}` |
| Cost line | `{energy} energy · {yen}` |
| Refusal: no energy | `Not enough left in the day.` |
| Refusal: no cash | `The parts bill wants {yen} you don't have.` |
| Refusal: no machine | `Needs the {machine}. No way round a weld.` |
| Refusal: no shop | `That grade of work needs the {shop}.` |
| Day log, aggregated steps | `{Part label}, {car}: {n} steps of the {kind}` |
| Day log, completion | `Serviced / Rebuilt / Restored the {part} to {band}[, {car}]` |

The four refusal strings and the five route labels are the 229 bench strings unchanged; they
are now single-sourced in `repairJobLabels.ts` rather than written twice.

### Evidence

Each command run once.

- `pnpm test --project game`: **93 files, 1371 tests, all passing**, 41.90s.
- `pnpm typecheck`: clean. `packages/content` (`tsc --noEmit`) Done, `packages/sim`
  (`tsc --noEmit`) Done, `packages/game` (`vue-tsc --noEmit`) Done. Run because the store's
  exported surface changed and `NextRepairStepView` stopped being imported by a screen: the
  directive 20 carve-out's exact case, whole-program, every `.vue` template compiled.
- `pnpm test packages/sim/tests/advanceDay.test.ts packages/sim/tests/careerReplay.test.ts`:
  **2 files, 23 tests, all passing**, no hash re-pinned. Expected and required: this is a
  game-package sprint, the two content edits are additive schema members no scripted action
  emits, and neither golden script touches the job-card path.

New tests, 20 in total: `JobCardPanel.test.ts` 8; `CarDetailScreen.test.ts` net +4 (98 to
102); `WarehouseDrawer.test.ts` +4 (15 to 19); `dayLogFormat.test.ts` +3 (25 to 28);
`BenchScreen.test.ts` +1 (9 to 10).

One formatting pass, on evidence rather than as routine. Two lines in the new code read
wider than Prettier's print width, so `npx prettier --check` was run over the sprint's seven
touched source files: `dayLogFormat.ts`, `JobCardPanel.test.ts` and `repairJobLabels.ts`
failed and would have failed the pre-push gate. `npx prettier --write` on those three, then
`--check` clean. The diff is line-wrapping only. The two directly affected test files were
re-run after it and pass: `pnpm test packages/game/src/utils/dayLogFormat.test.ts
packages/game/src/components/JobCardPanel.test.ts` gives **2 files, 36 tests, all passing**,
which is the 28 and the 8 counted above.

The pre-push hook is the full gate (directive 20) and was not otherwise pre-empted: no
manual `lint`, no `test:coverage`, no `build`.

### Deviations from the doc, with reasons

1. **`repair-part-{partId}` was a shared selector, and the survivor needed a name.** The doc
   says remove the `repair-part-{partId}` buttons. That data-test was on TWO controls: the
   fresh repair button and the Continue control docked on a busy address. The repair one is
   gone; the Continue control (which still answers for installs and setups) kept its markup
   and took the honest name `continue-job-{partId}`. A renamed selector on a surviving
   control, not a new affordance.
2. **`JobCardPanel` takes a second prop, `shopName`.** The doc lists `cards` plus
   "`removalEnergyPoints` handling included". `removalEnergyPoints` is a field ON the card,
   so it needed no prop and is summed inside `costTextFor`. But the locked route label
   "needs the {shop}" names a shop the panel cannot derive from a card, and the alternative
   was a component reading content directly. The shop name is passed in, as BenchScreen
   already passes it to the same strings.
3. **On-car tabs are `car-job-{kind}`, not `bench-job-{kind}`.** The doc says the 229 tabs
   are reused. The component pattern, the view builder and every string are reused; the
   data-test is namespaced to the screen because both screens can be mounted in the same
   test run and `bench-job-service` must keep meaning the bench.
4. **The doc's "its Rebuild card routes `'needs-bench'`" names a refusal, not a route.**
   `'needs-bench'` is a `RepairJobCardRefusal`; the card's `route` is a separate field. The
   test asserts what the type system actually has: `rebuildCard.offered === false` and
   `rebuildCard.refusal === 'needs-bench'`, with the tab disabled.
5. **The 4+6 energy assertion reads the two economy keys rather than the literals.** The
   doc says "first step costs 4+6". The test asserts `energy.energyPerStepPoints` plus
   `energy.energyByClass.buried` (4 and 6 today), because a component test must never
   hard-code an economy figure. The sum asserted is the same 10.
6. **`refitWarningFor` is asserted at the store, not through the DOM.** Every
   `depthClass: 'buried'` taxonomy entry is also an assembly member, and the
   `refit-warning-{partId}` span is wired to the individual, non-assembly remove branch. No
   shipped part on any of the 94 cars can render it today: an assembly member takes the
   `remove-assembly-*` branch with its own `assembly-machine-note-{assemblyId}` caption
   instead. The caption and its gate are correct and wired as the doc specifies; the test
   asserts the real reachable logic at its store home rather than a DOM path nothing can
   take. Recorded here rather than silently, because it means the warning is currently
   built but unseen.
7. **`repairJobLabels.ts` is a new file the reuse analysis did not name.** The doc requires
   the on-car refusal and locked copy be IDENTICAL to the bench board. Re-declaring the
   strings in a second component would have made that a promise rather than a fact, so
   BenchScreen's own helpers were lifted into one module both screens import. Nothing new
   was invented; five existing helpers moved and BenchScreen shed 95 lines.
8. **Two content files changed in a game-package sprint.** `gameState.ts` and
   `cashLedger.ts`. Task 5 asks for day-log branches for `repair-step` and
   `repair-job-completed`; neither entry type existed on `DayLogEntrySchema`, so the branches
   had nothing to switch on. Both edits are additive schema members plus their ledger
   classification, and no sim source file was touched.

### Arc readiness for sprint 231

The state of the tree as of this Exit, verified by search, not recalled. The next sprint's
deletion list should be read against this rather than against its own locked list, which
predates the surgery and is wrong in four places (section B).

**A. Now unreachable from the UI.** Nothing the player can click reaches any of these.

*A1. A whole panel, orphaned.* `packages/game/src/components/WorkbenchPanel.vue` is imported
by nothing but `WorkbenchPanel.test.ts`. No route mounts it (`router/index.ts` has no
workshop route) and no screen imports it. It was orphaned by 229's BenchScreen; this sprint
confirms it. The entire loose-part recondition surface hangs off it alone, so deleting the
panel and its test strands nothing.

*A2. Store getters and actions with ZERO remaining production callers.* Line numbers are
`packages/game/src/stores/gameStore.ts`.

| Symbol | Defined | Exported | Everything that still references it |
| --- | --- | --- | --- |
| `repairCeilingCaption` | 2070 | 6051 | nothing; one doc-comment mention at `components/workshopViewLayout.ts:77` |
| `repairMachineNoteFor` | 3843 | 6091 | nothing; the same doc-comment mention |
| `nextPartStepRange` | 2008 | 6050 | one test only: `screens/CarDetailScreen.test.ts:2207-2211` |
| `repairRevealFor` | 4381 | 6174 | tests only: `stores/gameStore.knowledge.test.ts:153,160,170` |
| `benchRepairCeilingCaption` | 3232 | 6133 | the orphaned `WorkbenchPanel.vue:30`; doc mention at `screens/workshopFloor.ts:7` |
| `nextReconditionStep` | 2037 | 6207 | orphaned `WorkbenchPanel.vue:24`; `gameStore.garage.test.ts:323`, `gameStore.jobs.test.ts:180` |
| `reconditionPart` | 5040 | 6208 | orphaned `WorkbenchPanel.vue:85`; the same two test files |
| `reconditionQuoteFor` | 5017 | 6205 | reachable only through `nextReconditionStep`/`reconditionPart` |
| `reconditionRefusalFor` | 5028 | - | reachable only through the orphaned panel |
| `stationPart('workbench')` | 3172 | 6128 | the `'workbench'` argument is passed only by `WorkbenchPanel.vue:20`. Keep `stationPart` itself: `'machine'` is live at `GarageScreen.vue:62` and `WorkStationTray.vue:28` |

*A3. Day-log branch dead in practice.* `utils/dayLogFormat.ts:268`, the
`part-reconditioned` case. Its only producer is `reconditionPart`, which is A2-orphaned, so
it can go with the recondition path rather than waiting on anything. 231 already lists it.

*A4. Deleted this sprint, listed so the retirement sprint does not go looking.* The
CarDetailScreen data-tests and script symbols in "what came out" above are already gone from
the tree; `utils/repairStepLabels.ts` SURVIVES (see B1).

**B. Corrections to `sprint231.md`'s locked deletion list. Four items on it cannot be
deleted as written.**

*B1. `gameStore.repair()` is still live, and takes a chain with it.* `BodyShopScreen.vue`
has a real, mounted control: `data-test="part-repair"` at line 1339, handler
`onPartRepairClick` at 1008-1015, which calls
`game.repair(carId, componentId, step.targetBand, partId)` off
`game.nextRepairStep(...)` (line 1001) and labels itself with `repairStepText` (line 1005).
The body shop has no reveal, no ceiling caption and no machine note, so only these three
survive, but they keep alive, transitively:

- game: `repair()` (`gameStore.ts:4413`), `nextRepairStep()` (1984) and its shared helper
  (1930-1956), `utils/repairStepLabels.ts` `repairStepText`
- game: `CarDetailScreen.vue:545-556` `jobLine`'s `repair-zone` arm, because a body-shop
  repair job still lands in `detail.jobs` (the 230 filter at `gameStore.ts:2396-2398`
  excludes only the three NEW kinds). It has no Continue control on the car any more, but it
  is not stranded: a repeat click in the body shop continues the same job through
  `resolveJobLabor`.
- content: `JobKindSchema`'s `'repair-zone'`
- content: `economy.energy.energyPerBandStepByToolTier`, read at `gameStore.ts:4430`
- sim: `planGroupRepair`, `repairJobGate`, and `resolveJobLabor`'s repair-zone branch

So 231 must pick one: (a) also move the body shop's per-part repair onto
`repairJobCards`/`resolveRepairStep`, which is real added scope and a design question about
what a body-group part's job ladder should be; or (b) drop `repair`, `repair-zone`,
`repairJobGate`, `planGroupRepair` and `energyPerBandStepByToolTier` from the deletion list
and let them retire in 232 or later. **This is a scope decision for the maintainer.** Not
decided here.

*B2. `clampRepairTarget` cannot be deleted.* `marketValue.ts:265` reads it, outside the
repair path entirely. 231 lists it under `repairBandCeilingByTier`'s retirement.

*B3. `planPartRepair` / `planGroupRepair` / `repairCeilingForLevel` have non-UI callers that
survive UI retirement.* Every one needs re-basing or deleting in the same change:
`plays.ts:198,307`; `balanceProbes.ts:533,564`; `careerReplay.ts:280`;
`bots/bandHelpers.ts:88-92`; `bots/serviceJobHelpers.ts:144`; `advanceDay.ts:158`;
`jobs.ts:1064,1077,1660-1664`. `energyToClimb` (`bands.ts:449`) is the one clean case: its
only caller is `planPartRepair` at `bands.ts:513`.

*B4. `WorkStationTray.vue` SURVIVES.* 231 says verify by grep and delete if unused.
Verified: `MachineShopPanel.vue:13,120` mounts it as `station="machine"`. Only the
`station="workbench"` usage dies, with `WorkbenchPanel.vue`.

**C. One thing the maintainer should rule on, stated as fact rather than raised as alarm.**
`repairRevealFor` was the reveal-then-confirm gate that stopped an on-car repair charging a
price for a band the player had never been shown. It now has no UI caller. The job card
answers the same concern differently, not by omitting it: `repairJobCards` prices `partsYen`
off `subject.band`, which is the TRUE installed band (`repairJobs.ts:253`, used at 926 and
583), so the figure on the card IS the figure charged, and `resolveRepairStep` still runs
`verifyAndResolve` on the band write (`repairJobs.ts:1038`). What changed is the other half:
an unverified slot's true condition is now inferable from the price on its card, where the
reveal used to make showing it a deliberate, free first click. Whether that satisfies
`knowledge-and-diagnosis.md` section 1 is a design call, and this sprint did not make it.

**D. Small DRY debt this sprint introduced, worth folding into 231 or 232's sweep.**
`JobCardPanel.vue:27-31` declares a local `JOB_LABELS` identical to
`utils/repairJobLabels.ts:15-19`'s exported `REPAIR_JOB_LABELS`, and `JobCardPanel.vue:55`
`machineLabelFor` duplicates `repairJobLabels.ts:25`. Both are one-liners and both shipped in
this sprint; the panel should import them.

Nothing else is left open.
