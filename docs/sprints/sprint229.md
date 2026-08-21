# Sprint 229: the bench screens

**Status:** Complete, ready for review. Not committed.
**Arc:** `repair-refactor-arc.md` sprint 6 of 9. Depends on 225 (engine), 226 (routes),
228 (purchase page).
**Scope:** game package. The three bench screens: shadow board, bench surface, step strip,
slog affordance. On-car work (trolley) is sprint 230.

## Reuse analysis (directive 16)

New mechanisms: `BenchScreen.vue` and its three child components (`ShadowBoard`,
`BenchSurface`, `StepStrip`). Reused: the sim's `repairJobCards` /
`resolveRepairStep` / `resolvePlaceOnBench` / `resolveTakeOffBench` (225) do ALL the
thinking - the screen renders their output and forwards clicks; `WarehouseDrawer` remains
the one inventory surface (it gains one button); `GarageScreen`'s station-tile pattern
routes to the benches; `BandChip` renders grades; the diegetic-UI law and the existing
panel idiom style it; component tests follow the repo's real-store mounting idiom. The
old `WorkbenchPanel`/`WorkStationTray` are left unreachable (deleted in 231, per arc
rule 11).

## Locked design

### Route and entry

- New route: path `/bench/:benchId`, name `bench`, lazy `BenchScreen.vue`, param typed to
  the three bench ids; invalid id redirects to `garage`.
- `GarageScreen` work-stations list: the "Workbench" tile is REPLACED by three tiles
  (locked labels): "Engine bench", "Chassis bench", "Body & trim corner"
  (`station-open-bench-{benchId}` data-tests), each a RouterLink to the bench route.
  The machine-shop and body-shop tiles are untouched.

### Store surface (gameStore)

- Actions (thin wrappers on the 225 resolvers, instant, same pattern as `removePart`):
  `placeOnBench(partInstanceId)`, `takeOffBench(partInstanceId)`,
  `runRepairStep(target: RepairTarget, kind: RepairJobKind)`.
- Getter `benchView(benchId)` returning everything the screen renders (no logic in the
  component): `{ bench displayName; zones: per zone, tools with { id, label, tier,
  state: 'owned' | 'outline' | 'hired' | 'room' } ; roomOpen: boolean; surface:
  Array<{ instanceId, partId, label, band, cards: RepairJobCard[] }> }`. Tool state:
  `'owned'` when the covering level reaches the tool's tier, `'hired'` when it hangs on
  today's hire, `'room'` for shop tools with the shop owned, `'outline'` otherwise.
- Getter `warehouseBenchTargets(partInstanceId)` -> bench id or null (repairable,
  not body-pipeline, not already placed).

### Screen anatomy (top to bottom)

1. **Shadow board** (`ShadowBoard.vue`, `data-test="shadow-board"`): five zone groups in
   fixed order clean / fit / cut / join / measure (locked headings: "Clean", "Fit",
   "Cut", "Join", "Measure"). Each tool is a fixed-size chip (`bench-tool-{toolId}`):
   owned = solid chip; outline = dashed border + muted label; hired = solid chip with a
   small "hired" tag (`bench-tool-tag-{toolId}`, locked text "hired"); room = solid chip
   in a visually separated "The room" strip below the board
   (`data-test="bench-room-strip"`), rendered only when the covering shop is owned.
   Tools NEVER move or reorder (the sprint 220 law generalised: the board is a fixed
   layout; state changes only restyle chips in place).
2. **Bench surface** (`BenchSurface.vue`, `data-test="bench-surface"`): one row per part
   from `benchView.surface` (`bench-part-{instanceId}`): part label, `BandChip`,
   "Back to the warehouse" button (`bench-return-{instanceId}`) calling `takeOffBench`.
   Clicking a row selects it (component-local `selectedInstanceId`); empty surface shows
   (locked copy, `data-test="bench-empty"`): "Nothing on the bench. Bring a part over
   from the warehouse."
3. **Job tabs + step strip** for the selected part:
   - Tabs (`bench-job-{kind}`): one per card from `cards`, label = "Service" /
     "Rebuild" / "Restore" + target `BandChip`. Disabled (greyed, not hidden) when
     `offered` is false or route is `'locked'`, with the card's refusal as tooltip text:
     locked copy "needs the {shop displayName}" for `'needs-shop'`, "needs the
     {line machine name}" for `'needs-machine'`, "already there" for
     `'at-or-above-target'`. Default selected tab: the kind with `stepsDone > 0` if any,
     else the first offered kind in service/rebuild/restore order.
   - Step strip (`StepStrip.vue`, `data-test="step-strip"`): the recipe steps in order,
     each (`step-{index}`) showing the tool label + copy line; states: done (ticked),
     current (highlighted), waiting (greyed). The energy figure for the current step
     (`step-energy`) shows "{n} energy", with "x3, no proper tool" appended when
     slogged (locked copy).
4. **Execution wiring**: the CURRENT step's tool chip on the board glows
   (`bench-tool-glow` class on the chip). Clicking it calls
   `runRepairStep({ kind: 'loose', partInstanceId }, selectedKind)`. Clicking any
   NON-glowing tool triggers a 200ms CSS shake on that chip and nothing else (spec 7.2
   rule 4; respect `prefers-reduced-motion`: no shake, no penalty either way). If the
   current step is slogged, the board chip is an outline and a stand-in chip renders on
   the surface below it (`bench-slog-{toolId}`, amber glow, locked label "make do"):
   clicking THAT runs the step. Refusals surface as a one-line note under the strip
   (`bench-refusal`): locked copy per reason: `no-energy` "Not enough left in the day.";
   `no-cash` "The parts bill wants {yen} you don't have."; `needs-machine` "Needs the
   {machine}. No way round a weld."; `needs-shop` "That grade of work needs the {shop}."
5. **Completion**: on `'completed'`, the part row's BandChip updates in place (the store
   is the source of truth; no local animation state persists).

### WarehouseDrawer addition

Browse-mode rows for eligible parts (per `warehouseBenchTargets`) gain one button
(`bench-send-{instanceId}`, locked label "To the bench") calling `placeOnBench`. A part
on a bench is excluded from the browse list (it is on the bench surface instead) - filter
exactly where `workbenchPartId` is filtered today.

## Tasks

1. Route + garage tiles.
2. Store actions and getters as specified.
3. The three components + screen, exactly per the locked anatomy (all data-tests and copy
   as written; no additions).
4. WarehouseDrawer button + browse filter.
5. Tests, new `BenchScreen.test.ts` (repo mounting idiom): board renders all five zones
   and every tool of the bench with correct states at tier 1 / tier 2 / hired / shop;
   room strip only with shop; surface add/return round-trip via store; tab default rules
   (in-progress wins, else first offered); glowing tool advances the step and the strip
   ticks; non-glowing click mutates nothing; slog stand-in appears exactly when the
   route slogs and runs the step at x3 energy (assert via store energy delta); each
   refusal renders its locked copy; empty-surface copy. Plus WarehouseDrawer test cases
   for the new button and filter.

## Checks

`BenchScreen.test.ts` and the WarehouseDrawer test file individually; one
`pnpm test --project game` sweep at the end.

## Exit

All five tasks landed. The three benches are real rooms with their own route, their own
board of tools and their own surface; the workbench tile and its in-place panel are gone
from the garage. Every rule the screen shows is the store's or the sim's: `benchView`
decides a chip's state, `repairJobCards` decides which jobs a part is offered and what
each step costs, and the screen picks which part and which job are in front of the player
and forwards the click. `WorkbenchPanel.vue` and `WorkStationTray.vue` are left in the
tree, unreachable from the garage, for sprint 231 to delete (arc rule 11).

One thing landed outside the sprint's declared scope, and it is the first thing to read:
the two new bench moves needed session events, in content and in sim, or a recorded
career could not be replayed. Deviation 1 below has the whole of it.

### Files landed

New:

- `packages/game/src/screens/BenchScreen.vue`: the screen. Reads the bench off the route,
  holds the two component-local picks the doc sanctions (`selectedInstanceId`, and the
  player's own job-tab pick over the default), words the store's answers into the locked
  copy, and forwards the run-step click.
- `packages/game/src/components/ShadowBoard.vue`: the fixed board and the room strip.
- `packages/game/src/components/BenchSurface.vue`: one row per part on the bench.
- `packages/game/src/components/StepStrip.vue`: the selected job's steps and its energy
  line.
- `packages/game/src/screens/BenchScreen.test.ts`: 9 tests (see Tests below).

Modified:

- `packages/game/src/stores/gameStore.ts`: `benchView`, `warehouseBenchTargets`,
  `placeOnBench`, `takeOffBench`, `runRepairStep`, plus the `BenchToolView` /
  `BenchZoneView` / `BenchSurfacePartView` / `BenchView` types and the private
  `groupsForBench` / `benchToolState` helpers. All five are exported from the store.
- `packages/game/src/router/index.ts`: the `bench` route.
- `packages/game/src/screens/GarageScreen.vue`: three bench doors in place of the
  workbench tile, its panel, its drop zone and its status line. `StationId` is now the
  single literal `'machine'` and the `?open=` query narrows with it.
- `packages/game/src/screens/GarageScreen.test.ts`: the three workbench cases replaced by
  two (the bench doors and their route targets; the old tile and panel proven absent), and
  the station-drag case retargeted at the machine card. 32 tests in the file.
- `packages/game/src/components/WarehouseDrawer.vue`: the "To the bench" control and the
  browse-list exclusion.
- `packages/game/src/components/WarehouseDrawer.test.ts`: a four-case
  `sending a part to the bench` describe. 15 tests in the file.
- `packages/content/src/sessionEvent.ts`, `packages/sim/src/careerReplay.ts`: deviation 1.

### Route

`path: '/bench/:benchId'`, `name: 'bench'`, lazy `import('../screens/BenchScreen.vue')`.
One route for all three benches. The param is not typed at the route; `BenchScreen`
checks it against `BenchIdSchema.options` and a bench the content does not carry
`router.replace`s to `garage` (deviation 3).

### Store surface

| Symbol | Shape |
| --- | --- |
| `benchView(benchId)` | `BenchView \| null`: `{ displayName, zones, roomOpen, surface }` |
| `warehouseBenchTargets(partInstanceId)` | `BenchId \| null` |
| `placeOnBench(partInstanceId)` | `boolean` |
| `takeOffBench(partInstanceId)` | `boolean` |
| `runRepairStep(target, kind)` | `RepairStepOutcome` |

`zones` is `BenchZoneSchema.options` in order, each with its tools in content order (tier
1, then tier 2, then the room's), every tool carrying `{ id, label, tier, state }`.
`benchToolState` is the whole of the state rule: a shop tool reads `room` once the room is
bought and `outline` otherwise; a tier 1 or 2 tool reads `owned` once the best of the
bench's covering lines reaches its tier, `hired` while one of them rides the day's hire,
and `outline` otherwise. A bench is shared (the chassis bench answers to drivetrain,
suspension and wheels), so the board takes the best level across its groups and the room
opens if any of them is covered. `surface` carries `repairJobCards`' output untouched.

### Components and their data-tests

`ShadowBoard.vue`

| data-test | What |
| --- | --- |
| `shadow-board` | the board proper, five zone groups in fixed order |
| `bench-tool-{toolId}` | one chip, on the board or in the room strip |
| `bench-tool-tag-{toolId}` | the "hired" tag, only in the `hired` state |
| `bench-slog-{toolId}` | the stand-in, only when the current step slogs |
| `bench-room-strip` | the room's own tools, only when `roomOpen` |

State reads off classes rather than data-tests, and the tests assert them by name:
`bench-tool-owned`, `bench-tool-outline`, `bench-tool-hired`, `bench-tool-room`,
`bench-tool-glow`, `bench-tool-shake`.

`BenchSurface.vue`: `bench-surface`, `bench-part-{instanceId}`,
`bench-return-{instanceId}`, `bench-empty`.

`StepStrip.vue`: `step-strip`, `step-{index}`, `step-energy`.

`BenchScreen.vue`: `bench-job-{kind}` (the tab, `job-tab-on` when selected, `disabled`
when the card is not offered or its route is locked), `bench-refusal`.

`GarageScreen.vue`: `station-open-bench-{benchId}`, three of them, each a `RouterLink`.

`WarehouseDrawer.vue`: `bench-send-{instanceId}`.

### Copy as shipped

Every string below is the doc's, to the character.

- Zone headings: "Clean", "Fit", "Cut", "Join", "Measure". Room strip heading: "The room".
- Hired tag: "hired". Slog stand-in: "make do".
- Empty surface: "Nothing on the bench. Bring a part over from the warehouse."
- Surface row control: "Back to the warehouse". Warehouse control: "To the bench".
- Job tabs: "Service", "Rebuild", "Restore", each with its target `BandChip`.
- Energy: "{n} energy", and "{n} energy x3, no proper tool" when the step slogs.
- Tab tooltips: "needs the {shop displayName}", "needs the {machine name}",
  "already there".
- Refusals: "Not enough left in the day."; "The parts bill wants {yen} you don't have.";
  "Needs the {machine}. No way round a weld."; "That grade of work needs the {shop}."
- The three garage tiles read their labels from `workbench.json`, so they are "Engine
  bench", "Chassis bench" and "Body & trim corner" without a second copy of the strings.

No control, confirm step or line of copy was added beyond this list.

### Tests

`BenchScreen.test.ts`, 9 tests, on the engine bench (the one board that puts tier 1, tier
2 and shop tools all in reach), with `block` and `exhaust` as the fixtures:

1. all five zones in fixed order with the locked headings, every board tool of the bench
   in content order and nothing else, and the four chip states walked in one mount:
   tier 1 owned and tier 2 outline on a fresh game, tier 2 `hired` with its tag after
   `hireToolLine('engine')`, `owned` with the tag gone after the rung is bought, and the
   hot tank at `room` once the machine shop is.
2. the room strip is absent until the covering shop is owned, then carries exactly the
   bench's shop tools.
3. surface round trip: empty copy, `placeOnBench`, the row and its band, the return
   button, back to empty, and the part still in `partInventory` (a bench is a location,
   never a second inventory).
4. tab defaults: a `worn` block refuses Service, so Rebuild defaults (proving "first
   OFFERED", not "first"); a `poor` block defaults to Service; stepping Rebuild through
   the store makes the in-progress job win.
5. the glowing chip advances the step, the strip ticks to the next one and the glow moves
   with it, and the last step climbs the part's band in place.
6. clicking a non-glowing chip leaves `gameState` identically the same object.
7. the slog stand-in appears exactly when the route slogs, the board chip stays an
   outline and does not glow, and clicking the stand-in spends
   `energyPerStepPoints * slogMultiplier`, asserted as a store energy delta.
8. refusals: `no-energy` and `no-cash` asserted as rendered copy; `needs-shop` and
   `needs-machine` asserted at the store (see Coverage).
9. the locked empty-surface copy.

`WarehouseDrawer.test.ts`, four new cases: the button appears for a repairable damper and
routes it to `chassis-bench`, clicking it moves the part and drops it from the browse
list; no button for a body-pipeline carrier; no button for a replace-only clutch; a part
already on a bench is excluded from the browse list entirely, not merely its button.

`GarageScreen.test.ts`: the three doors carry `{ name: 'bench', params: { benchId } }` and
their content labels; the old tile, status and panel are all absent and "Workbench" no
longer appears anywhere on the screen.

### Coverage

`pnpm test --project game --coverage`, per file. Repo thresholds are statements 80,
branches 65, functions 78, lines 82.

| File | Stmts | Branch | Funcs | Lines |
| --- | --- | --- | --- | --- |
| `BenchScreen.vue` (new) | 84.82 | 71.60 | 97.14 | 90.58 |
| `ShadowBoard.vue` (new) | 93.61 | 94.73 | 89.47 | 92.68 |
| `BenchSurface.vue` (new) | 100 | 100 | 100 | 100 |
| `StepStrip.vue` (new) | 100 | 100 | 100 | 100 |
| `WarehouseDrawer.vue` (modified) | 80.74 | 80.95 | 72.13 | 83.94 |
| `GarageScreen.vue` (modified) | 76.85 | 67.47 | 73.77 | 77.01 |

All four new files clear every threshold. `BenchSurface.vue` and `StepStrip.vue` do not
appear in the text table at all, because it skips files at 100 on every metric; their
figures above are read off `coverage/lcov.info` (`LF`/`LH` 8/8, `FNF`/`FNH` 3/3,
`BRF`/`BRH` 2/2 for each).

The two modified files sit below thresholds on some metrics and did before this sprint:
`WarehouseDrawer.vue` on functions (72.13 against 78), `GarageScreen.vue` on statements,
functions and lines. The gate is project-wide rather than per-file and the game project
runs 88.03 / 78.70 / 90.01 / 91.80, so nothing here fails; recorded so it is visible
rather than discovered later. `GarageScreen.vue` lost code this sprint rather than gaining
it, so its figure is a smaller denominator over the same untested drag-and-drop and
overlay paths, not new untested work.

What is NOT tested, named rather than left to be found:

- `BenchScreen.vue` lines 209 to 213: the `needs-machine` and `needs-shop` refusal notes
  as RENDERED copy. Both reasons are asserted at the store instead, using the exact call
  `onRunStep` makes. See Open below: they are currently unreachable through the screen.
- `BenchScreen.vue` lines 124 to 125 and 114: the locked-route tab tooltips ("needs the
  {shop}" / "needs the {machine}") and `machineLabelFor`, unreachable for the same
  reason.
- `BenchScreen.vue` line 121: the empty-tooltip fallthrough for an unoffered card whose
  refusal is neither `needs-shop` nor `at-or-above-target`.
- `ShadowBoard.vue` lines 106 to 107: the shake timer's expiry. The shake is asserted to
  start; nothing asserts the chip comes back to rest 200ms later (no fake timers).
- `ShadowBoard.vue` line 159: clicking a chip in the room strip. Room chips are never the
  current step's tool on any shipped recipe reachable from a bench, so a click on one can
  only shake.

### Evidence

Each command run once, and every one of them shown raw.

`pnpm typecheck` (run under the directive 20 carve-out: `sessionEvent.ts` gains two
exported union members and `careerReplay.ts` two cases, which reshapes an exported symbol):

```text
$ pnpm -r --if-present typecheck
Scope: 3 of 4 workspace projects
packages/content typecheck$ tsc --noEmit
packages/content typecheck: Done
packages/sim typecheck$ tsc --noEmit
packages/sim typecheck: Done
packages/game typecheck$ vue-tsc --noEmit
packages/game typecheck: Done
```

`pnpm test --project game --coverage`:

```text
 Test Files  92 passed (92)
      Tests  1351 passed (1351)

=============================== Coverage summary ===============================
Statements   : 88.03% ( 6010/6827 )
Branches     : 78.7% ( 4413/5607 )
Functions    : 90.01% ( 1748/1942 )
Lines        : 91.8% ( 5232/5699 )
================================================================================
```

`pnpm test packages/sim/tests/advanceDay.test.ts packages/sim/tests/careerReplay.test.ts`:

```text
 Test Files  2 passed (2)
      Tests  23 passed (23)
```

Both golden masters are GREEN and no hash was re-pinned, which is the expected result for
a UI sprint. Deviation 1 touches sim, but it only adds two cases to `applySessionEvent`'s
switch: no existing event's effect changes, and neither new event appears in any scripted
career, so no hash could move.

`pnpm test --project content` (run because deviation 1 touches `packages/content/src`):

```text
 Test Files  32 passed (32)
      Tests  649 passed (649)
```

The pre-push hook is the full gate (directive 20) and was not pre-empted: lint, format and
the cross-project coverage run are its job. Note that the coverage figures above are the
game project alone, which is a different denominator from `pnpm test:coverage`.

### Deviations from the doc, with reasons

1. **Session events for the two bench moves, in content and sim.** The doc scopes this
   sprint to the game package. `sessionEventCoverage.test.ts` failed on the first sweep
   with `expected [ 'placeOnBench', 'takeOffBench' ] to deeply equal []`. Directive 17,
   which case: it caught a real defect, not stale behaviour. Both actions mutate
   `GameState`, both of their predecessors (`placeOnStation`, `takeFromStation`) log, and
   a loose `repair-step` refuses with `needs-bench` unless the part is laid out, so a
   dropped bench move takes every step after it with it and a recorded session diverges
   from its replay silently. Fixed rather than allowlisted, at the cost of three files
   outside the game package's edge:
   `packages/content/src/sessionEvent.ts` gains `placeOnBench` and `takeOffBench`
   variants, both `{ partInstanceId }` (neither names a bench: a part goes to whichever
   bench its group belongs to and comes off whichever holds it);
   `packages/sim/src/careerReplay.ts` gains the two matching cases, which the exhaustive
   switch made a compile error until they were there; and the two store actions log. Both
   resolvers refuse as silent no-ops returning the state they were given, so neither
   replay case needs a gate check, unlike the two station cases above them.
2. **`BenchScreen.vue` calls `energyPlanFor` (sim) directly** rather than reading an
   energy figure off a store getter. The doc's `benchView` contract does not carry one,
   and the step strip needs the current step's cost to word "{n} energy". It is the sim's
   own plan, not a figure computed in the component, but it is a sim call from a `.vue`
   and it is the one place this screen reaches past the store. If it should move,
   `benchView`'s `cards` entry is where the per-step energy belongs.
3. **The route param is not typed at the route.** The doc asks for "param typed to the
   three bench ids; invalid id redirects to `garage`". The check landed in the screen
   instead: `benchId` tests the raw param against `BenchIdSchema.options`, `view` is null
   for anything else, and an immediate watcher `router.replace`s to `garage`. One rule in
   one place, and it also covers a bench id that is valid in the enum but missing from
   content.
4. **`shopNameForBench` lives in the screen.** Three of the locked strings name the
   covering shop, and `benchView` does not carry its name. The screen finds it by walking
   `TOOL_SHOPS` for the shop covering any of the bench's groups. Same note as deviation 2:
   the natural home is `BenchView`.
5. **The step strip does not render done steps.** The doc's step states are "done
   (ticked), current (highlighted), waiting (greyed)". A `RepairJobCard` carries only the
   steps STILL TO WORK, so there is nothing to tick: the strip renders the current step
   highlighted and the rest greyed, and numbers rows by the recipe's own index
   (`stepsDone + offset`) so `step-2` is the third step of the job whether or not the two
   before it are on show. Test 5 asserts exactly that, watching `step-0` disappear as
   `step-1` becomes current. Rendering ticked steps would mean widening the card, which is
   sim surface and sprint 225's.
6. **"To the bench" is its own row, not a button inside the part card.** The doc says
   browse rows "gain one button". `PartCard.vue` is shared with fit mode and with the
   parts market, so a button inside it would have meant a new prop on a component three
   screens use. The control renders as a sibling `<li>` immediately under its card,
   emitted from the same `v-for`, so it reads as part of the row.
7. **The browse-list exclusion is a new filter, not an existing one extended.** The doc
   says to filter "exactly where `workbenchPartId` is filtered today". Nothing filters it
   today: `pickableParts` returns every owned part and the station occupant is shown with
   a whereabouts marker rather than hidden. The drawer now gathers the three benches'
   surfaces via `benchView` and filters `browseEntries` against that set, so the
   membership rule is still only stated once, in the sim.
8. **The refusal note and the energy line render as empty elements when there is nothing
   to say**, each holding a `min-height` of one line. A note that appears and disappears
   would shift the strip under the player's cursor between clicks.

### Open

- **The `needs-machine` and `needs-shop` refusal copy cannot currently be seen.** Both
  strings are shipped exactly as locked and both are correct, but no click in the mounted
  screen reaches either, which is why they are the coverage gap above. `needs-shop` is
  refused at the CARD level, so the tab can never be selected without owning the shop, at
  which point no step is locked. `needs-machine` needs a `requiresMachine` step whose tool
  hangs on the same bench the part is laid out on, and no shipped recipe has one:
  `exhaust`'s Rebuild borrows the body corner's MIG while the part sits on the engine
  bench, so no chip for it renders there, and `chassis`'s Rebuild would qualify but
  `chassis` cannot be a loose bench part. Sprint 230's on-car work may make the second
  reachable, since an installed part is worked where it sits. Flagged rather than acted
  on: the copy is locked and removing it is not this sprint's call.
- The four items from deviations 2 and 4 (`energyPlanFor` and `shopNameForBench` in the
  screen) are the only logic left in a `.vue` on this screen. Both would move behind
  `benchView` in one edit if that is wanted.
