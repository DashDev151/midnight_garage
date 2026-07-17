# Sprint 84 - The manual page: the parts diagram v1

**For the implementing agent:** verify every cited symbol before editing; STOP if missing. No em
dashes. British English in player copy. Directives 20 and 21 in force: narrowest checks once,
the pre-push hook is the gate, no bot careers, no Python balance CLI, no full suites, no
coverage, no build. All new player-facing strings to the orchestrator's sweep before Exit.

## Confirmed current state (after Sprint 83)

The car part list is a flat list; the component hierarchy (`blockedBy`, 29 slots, max depth 2,
strictly linear) is invisible except as refusal text when an action is blocked. Maintainer
finding (2026-07-17): the player cannot intuitively see that the wheel comes off before the
brakes; text warnings are the wrong tool. Maintainer direction: build the simplistic diagram
now: each part a plain rectangle with its name, roughly placed in correct overlapped
orientation; the rendered-art version arrives later by swapping rectangles for hand-drawn glyphs
in the same layout. The depth chip idea is dropped (ruled out 2026-07-17): stacking makes it
redundant.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:** `parts-taxonomy.json`'s `blockedBy` and groups as the sole
source of structure (the diagram renders data, never re-encodes it); `displayedBandFor` and the
existing band colour conventions for each rectangle's state; the existing "?" unresolved-
diagnosis chip idiom; the CarDetail part list and all its actions, untouched, as the single
control surface; the art bible's palette and pixel discipline for borders and fills.

**New mechanisms:**

1. A hand-authored layout map (one entry per slot: zone, x/y/w/h, z) in the game package.
2. A `PartsDiagram` Vue component rendering the map as positioned rectangles.
3. A layout-coherence test asserting the map against the taxonomy.

## Decisions

1. **Occlusion is the mechanic.** The one visual rule: a part's rectangle physically overlaps
   every part it blocks, sitting above it in z-order. No arrows, no legends, no depth labels.
   With `blockedBy` capped at depth 2, no stack ever exceeds two overlaps.

2. **The layout map.** A single hand-authored constant (module in `packages/game/src`, one
   record per `carPartId`: zone, rect, z). Zones roughly a side-on shop view: engine bay
   (front third, the cooling-over-cams-over-intake-over-head-over-internals stack), the
   tunnel (gearbox/clutch/driveline under their blockers), the four-corner
   suspension/brake/wheel cluster (rims over tyres and brakes per the shipped taxonomy), shell
   around, cabin inset. Author it from the taxonomy, not from memory; where the taxonomy's
   blocking is coarser than reality, the taxonomy wins (the diagram must tell the truth the sim
   enforces, not a prettier lie).

3. **The layout-coherence test (the load-bearing piece).** For every `blockedBy` pair in the
   taxonomy: the blocker's rect intersects the blocked rect AND has the higher z. For every
   non-blocking pair in the same zone: overlap is forbidden unless one blocks the other
   (accidental overlaps would draw false dependencies). The test reads the live taxonomy, so a
   future `blockedBy` change fails the diagram until the drawing is made honest again: the
   Sprint 78 content-probe pattern applied to presentation.

4. **Rendering: DOM/CSS, not Pixi.** Absolutely positioned divs inside a fixed-aspect container
   (relative units, no page horizontal scroll), palette fills by condition band via the
   existing conventions. Empty slots (missing at purchase or pulled to the bench) are never
   gaps: every slot always renders at its layout position, absence shown as a ghost placeholder
   (dashed border, translucent fill, greyed part name) so the player sees something belongs
   there (maintainer direction 2026-07-17).
   Pixel-discipline borders per the art bible. No canvas: hover, focus, and the future
   accessibility pass come free, and glyph art can replace rectangle interiors later without
   touching layout or test.

5. **Interaction grammar (view, not control surface).** Hover (or keyboard focus): the part's
   name, band, grade, and "?" chip in a small fixed inspector line; every part sitting on top
   of it highlights, red-bordered if still fitted, dim if already off. Click: selects and
   scrolls to that part's row in the existing list, where all actions stay. No actions in the
   diagram in v1.

6. **Placement in CarDetailScreen.** The diagram sits above the part list, collapsible,
   default open on owned cars. The list remains the accessibility-complete surface.

7. **No sim, schema, content-data, or golden impact.** Pure presentation; goldens must not
   move. If anything forces a sim touch, STOP and report.

8. **Deferred, recorded:** glyph art per slot (maintainer's Aseprite work, drops into the same
   layout); per-model layout variants and the zoomed per-zone view (tier 3, IDEAS.md).

9. **Amendment (maintainer, 2026-07-17, after eyeballing): two levels, not one canvas.** The
   single 29-rectangle view was the right idea but too cluttered. The diagram becomes:

   - **Level 1 (default):** six group tiles (engine, drivetrain, suspension, wheels, body,
     interior) hand-authored as car regions on the same fixed-aspect canvas, front of car at
     left (`GROUP_TILE_LAYOUT`; tiles never overlap - a tile-map sanity test enforces it). Each
     tile shows the group display name (the shipped `componentDisplayNames` content, no new
     copy), the group's worst condition band as a BandChip-conventioned tint, the part count,
     and an aggregated "?" chip when any member has unresolved diagnosis. Hover/focus drives
     the inspector with those summaries plus, where the taxonomy has a cross-group edge, the
     outside-dependency hint "Parts here sit under: {other group name(s)}". Clicking a tile
     opens level 2 and never touches the list.
   - **Level 2:** the clicked group's member slots rendered from the UNCHANGED layout map,
     their bounding box scaled up to the canvas (the map and the layout-coherence test do not
     move). Any OUTSIDE blocker of a member renders as a visiting rectangle at its true
     overlap position - hatched, tagged with its home group name, hover-live, and red-flagged
     when fitted exactly like a native blocker. This is load-bearing: rims must appear in the
     suspension view on top of the brakes, and exhaust in the drivetrain view on top of the
     gearbox, or the split re-hides the mechanic. A back control ("< All groups", the existing
     back-link idiom) returns to level 1; the level resets to 1 when the screen shows a
     different car.
   - Interaction grammar otherwise unchanged: view not control surface; clicking a PART in
     level 2 selects the list row as before.

## Tasks

**Claude (agents, orchestrated):**

1. Layout map + `PartsDiagram` component + inspector line + list-selection wiring.
2. The layout-coherence test (decision 3) plus component tests (hover highlights blockers,
   empty/pulled states, click selects list row). Narrow runs only, once each.
3. Strings (panel title, inspector labels, empty-slot label) to
   `sprint84-strings-for-sweep.md` in the scratchpad; add the tier-3 line to IDEAS.md.
4. Fill the Exit; evidence is the eventual pre-push gate.

**Orchestrator (Fable):** sweep; layout taste review against a screenshot description; final
review; commit/push with maintainer approval.

**User-only (maintainer):** eyeball the diagram in `pnpm dev`; the glyph art pass, later, at
your leisure.

## Definition of done

- Every owned car renders the diagram; every `blockedBy` relationship is visible as physical
  overlap and provably honest (layout-coherence test green); hover explains any blocked part
  without a word of warning text; click lands on the list row. No golden movement. Strings
  swept. Exit filled.

## Exit

**Status: ready for review.** Implemented 2026-07-17.

### What landed

- **The hand-authored layout map** - `packages/game/src/components/partsDiagramLayout.ts`. One
  `DiagramSlot` (zone, x/y/w/h, z) per `CarPartId` in a 320x180 space (the art bible's 640x360
  logical stage, halved to a clean 16:9). Authored FROM `parts-taxonomy.json`'s live `blockedBy`
  data: the one visual rule (decision 1) is that a blocker's rectangle overlaps every part it
  blocks and sits above it in z. It carries only geometry - never the hierarchy itself.
- **`PartsDiagram.vue`** - DOM/CSS absolutely-positioned `<button>` rectangles inside a
  fixed-aspect container (percentage units, no page horizontal scroll). Band-coloured translucent
  fills via the same palette tokens `BandChip` authors; pixel-discipline 1px hard-edge borders (no
  bevels/shadows/radius). Hover/focus drives a fixed inspector line (name, band chip, grade, "?"
  chip) and highlights the parts stacked on top of the hovered one - **red when a blocker is still
  fitted, dim when already off** - straight from the taxonomy's `blockedBy`. Click emits `select`.
  It is a view: no actions.
- **Empty-slot ghosts (maintainer amendment to decision 4).** All 29 slots always render at their
  layout position; an empty slot (missing at purchase or pulled to the bench) is a ghost -
  dashed border, translucent fill, greyed name - never a gap. Hover on a ghost still works and the
  inspector reads its "empty" state; blocker highlighting is unchanged.
- **List-selection wiring** - `CarDetailScreen.vue`. The diagram sits above the Components list
  (decision 6), collapsible via `<details open>`, default open. `onDiagramSelect` expands the
  part's group, un-hides its condition-filter category so the row can't be filtered away, marks the
  row (`.diagram-selected`) and scrolls it into view. The list stays the accessibility-complete
  control surface.
- **The layout-coherence test (decision 3, the load-bearing piece)** -
  `partsDiagramLayout.test.ts`. Reads the LIVE taxonomy and asserts: rule A (every `blockedBy`
  pair overlaps, blocker on top / higher z), rule B (no two non-blocking parts in the same zone
  overlap), plus completeness and in-bounds. A future `blockedBy` change fails the diagram here
  until the drawing is made honest again.
- **Component tests** - `PartsDiagram.test.ts`: all 29 slots render; a pulled part is a ghost (not
  a gap); hover flags a fitted blocker as in-the-way and a pulled blocker as cleared; the inspector
  names the hovered part and click emits `select`.

### The layout (text rendering; zones and required overlaps)

Coordinate space 320x180, front of car at left. Shell parts (paint/panels/chassis/underbody/aero,
lowest z) are the backdrop the functional parts sit on; they overlap other zones cross-zone, which
the coherence test permits (rule B is same-zone only). The occlusion stacks the test enforces:

```text
  ENGINE (front third)                    CABIN            (shell = backdrop)
    cams > head > internals                seats | dash
      \                                  TUNNEL
       cooling  intake                    driveline ── over ── gearbox ── over ── clutch
         \  /  \                              \                   ^
          block  > forcedInduction         differential      exhaust (from block) drops over gearbox
         /  |  \
   intake exhaust cooling  all over block

  WHEEL CORNER (front wheel)      SUSPENSION (along the floor, no blocking)
      rims  over  tyres            dampers | springs | steering | antiRollBars
      rims  over  brakePadsDiscs
      rims  over  brakeCalipersLines
```

`>`/`over` = the left/upper part's rectangle overlaps and sits above the one it blocks. Verified: 29
slots, 15 blocking pairs (rule A), zero accidental same-zone overlaps (rule B).

### Tests run (directives 20/21: narrow, once each)

One `vitest run` over exactly the three touched files: `partsDiagramLayout.test.ts`,
`PartsDiagram.test.ts`, `CarDetailScreen.test.ts` - **3 files, 60 tests, all pass** (5.6s). No full
suite, no coverage, no build, no balance run. The full pre-push gate is the standing evidence.

### One existing test updated (directive 17, case a)

`CarDetailScreen.test.ts`'s "expanding a group..." test asserted a hidden row's name is absent from
the whole screen. The diagram now legitimately renders every part's name as a rectangle label, so
those three assertions were rescoped to the `.components` list (the surface the condition filter
actually governs) rather than the entire wrapper. Intent preserved, assertion made precise.

### No sim / schema / content-data / golden impact

Pure presentation. No file under `packages/sim` or `packages/content/data` was touched; the
taxonomy is read, never re-encoded. Nothing forced a sim touch (decision 7's STOP condition did not
trigger).

### Strings and deferrals

- **String sweep: passed, two revisions (orchestrator, 2026-07-17).** `EMPTY_LABEL` ("empty")
  approved as drafted; `PANEL_TITLE` revised to "The service diagram" and `INSPECT_PROMPT` to
  "Point at a part to see what it is and what sits on top of it." Applied at source, draft
  markers removed; no test pinned either string, and the affected test file was re-run once
  (`PartsDiagram.test.ts`: 5 tests, pass).
- **Layout taste review (orchestrator, 2026-07-17): approved as authored.**
- Tier-3 deferral (decision 8) recorded in `IDEAS.md`: per-model layout variants and the zoomed
  per-zone view. The glyph-art pass (Aseprite, dropped into the same layout) is the maintainer's,
  recorded here.

### Amendment implemented: the two-level rework (decision 9, 2026-07-17)

Everything above this point describes v1 (the single canvas) as built and swept; decision 9
reworked the same component in place. What changed:

- **`partsDiagramLayout.ts`**: added `GROUP_TILE_LAYOUT` (six disjoint tile rects, car regions,
  front at left) and its `TileRect` type. `PARTS_DIAGRAM_LAYOUT` and the coherence rules are
  untouched.
- **`PartsDiagram.vue`**: now two levels. Level 1 renders the six tiles - group display name
  (existing `componentDisplayNames` content), worst-band tint from `carDetail`'s own
  `groupBands` (one source with the list's headline chips), member part count from the
  taxonomy, aggregated "?" chip; tile hover/focus drives the inspector with those summaries
  plus the cross-group "Parts here sit under: {groups}" hint derived live from `blockedBy`.
  Level 2 scales the clicked group's member slots (bounding box of the unchanged layout-map
  rects, padded, aspect-fitted 16:9) and renders outside blockers as visiting rectangles at
  their true overlap positions: hatched over their band fill, tagged with the home group name,
  and participating in blocker highlighting (red when fitted, dim when off) identically to
  native blockers - rims sits over the brakes in the suspension view, exhaust over the gearbox
  in the drivetrain view. Back control returns to level 1; a different `carId` resets to
  level 1. Tile clicks never emit `select`; part clicks (members and visitors alike) still do.
- **Tests**: `partsDiagramLayout.test.ts` gained the tile-map sanity block (exactly six tiles,
  in bounds, pairwise disjoint); `PartsDiagram.test.ts` was rewritten for the two-level
  contract (directive 17 case (a): the redesign intentionally changed the behaviour) - tiles
  by default, tile summary + sits-under hint, tile-click navigation without select + back,
  the load-bearing visitor test (rims visits suspension, `blocker-fitted` red when fitted),
  pulled-visitor `blocker-clear` + pulled-member ghost, level-2 inspector + select, and reset
  on car change; `CarDetailScreen.test.ts`'s integration test now walks tile -> part and
  asserts the tile click alone does not touch the list.
- **Run (directives 20/21, once):** one `vitest run` over the same three files after the
  rework: **3 files, 65 tests, all pass** (4.7s).
- **Strings:** three amendment strings (`SITS_UNDER_PREFIX` - coordinator-specified wording,
  `BACK_LABEL` "< All groups", `TILE_PROMPT`) appended to the sweep file as round-2 drafts.
  **Round-2 sweep (orchestrator, 2026-07-17): passed, all three approved verbatim; draft
  markers removed at source.** The round-1 swept strings are unchanged.
- Still zero sim/schema/content-data/golden impact.

### Definition-of-done checklist

- [x] Every owned car renders the diagram (above the list, default open).
- [x] Every `blockedBy` relationship is visible as physical overlap and provably honest
      (layout-coherence test green).
- [x] Hover explains any blocked part (inspector line + blocker highlighting) without warning text.
- [x] Click lands on the list row.
- [x] Empty slots render as ghosts, never gaps (maintainer amendment).
- [x] Two-level rework (decision 9): tiles default, per-group zoom, visiting outside blockers
      at true overlap positions, back control, reset on car change; tile-map sanity test green.
- [x] No golden movement; no sim/schema/content-data change.
- [x] Strings swept, both rounds (round 1: passed, two revisions applied; round 2: passed,
      all approved verbatim); tier-3 line added to IDEAS.md.

### User-only (maintainer)

- Eyeball the diagram in `pnpm dev` on a couple of owned cars.
- The glyph-art pass, at your leisure, into the same layout.
