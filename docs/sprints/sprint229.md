# Sprint 229: the bench screens

**Status:** Planned
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

(Fill on completion.)
