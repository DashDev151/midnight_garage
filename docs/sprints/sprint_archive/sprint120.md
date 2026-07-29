# Sprint 120: The views (workshop rework, phase 2)

**Source design:** `docs/design/systems/workshop-rework.md` (FINAL, maintainer-approved 2026-07-23).
Opens after Sprint 119 exits. No economy levers; this sprint is interface only.

## Goal

Replace the tile grid with the three working views: the representative panel schematic (one
stylised, generously sized body diagram shared across all models, its six zones as click
regions), the engine bay (top-down), and the underside (on the lift). Placeholder art first;
the interaction model does not wait for finished art.

## Reuse analysis (directive 16)

**New mechanisms:** the three view drawings and their region hit-maps.

**Existing mechanisms to reuse:** the Sprint 119 zone model and stage actions (the views are
a presentation swap, zero sim change); the staged-work rows and honest ledger; the
drag-and-drop doctrine and diegetic-UI law from `docs/design/art/art-catalogue.md`.

Confirmed against the code before building: `stageAction`, `pipelineActionPlan`,
`unstagePipelineAction` and `confirmStagedWork` all already take a zone id and need nothing
new. **Zero sim change** stands. The existing pattern to copy is the house split of pure
layout module plus thin renderer (`partsDiagramLayout.ts` + `PartsDiagram.vue`, and
`utils/radar.ts` + `StatRadar.vue`), and the sprite rasteriser in `components/partSprites.ts`.

## Scope resolutions (design decisions taken in-session, 2026-07-26)

The source design names three views. Mapping the real taxonomy onto them exposed three gaps
that the design doc does not answer. None of them amends the doc; they are the implementation
choosing where a thing lives.

### R1. The interior group rides on the body schematic

The 29 parts split engine 10 / drivetrain 5 / suspension 6 / wheels 2 / body 4 / interior 2.
Engine, drivetrain, suspension and wheels map cleanly onto the engine bay and the underside;
body maps onto the schematic; **`seats` and `dashGauges` map onto nothing**, and T3 requires
the tile grid to be gone.

**Resolved: seats and dashGauges become cabin regions on the body schematic**, in a plan-view
cutaway. A fourth "cabin" view for two parts is not worth a drawing, and diegetically the
schematic is the car seen from outside, where the cabin is behind the glass. Rejected
alternative: keeping a vestigial interior tile, which would leave the tile grid half-alive and
fail the definition of done.

### R2. The chassis ZONE lives on the underside, not the schematic

`chassis` is overloaded: it is one of the six body zones (underbody metal and underseal, the
source of the derived `underbody` band) AND a `drivetrain`-group part. They are different
things at the same name, which is the taxonomy wart already logged in `TODO.md`.

**Resolved: the chassis zone region sits on the underside view** (it is what you see on the
lift), and the `chassis` part keeps its own separate region on the same view. The schematic
therefore carries the five PANEL zones only. This sprint does not touch the taxonomy.

### R3. The three derived carriers are not regions at all

`panels`, `paint` and `underbody` derive from zone state and already have no on-car actions
(`repairStepFor`, `repairCeilingCaption` and `repairGateReasonFor` all early-return for them).
Today clicking them docks an action panel with nothing on it, which is a dead end the tile
grid inherited.

**Resolved: they get no click region.** They are value carriers, so they read as a derived
band summary beside the schematic, not as work targets. Work happens on zones.

### The resulting region assignment (32 regions, no orphans, no overlaps)

| View | Zone regions | Part regions | Total |
| --- | --- | --- | --- |
| Body schematic | bonnet, boot, left, right, roof (5) | aero, seats, dashGauges (3) | 8 |
| Engine bay | - | the 10 engine parts | 10 |
| Underside | chassis (1) | drivetrain 5, suspension 6, wheels 2 (13) | 14 |

29 parts minus the 3 derived carriers, plus the 6 zones, is 32. Every one has exactly one home.

### R4. A region owns a SET of rects, and every rect is disjoint from every other

Several parts appear at more than one place on a car: brakes and suspension exist at four
corners, not one. Forcing one rect per region would either lie about the car or push the art
toward a single arbitrary corner. So a region is a set of rects, and the coherence test
asserts that **all rects across a view are pairwise disjoint regardless of owner**. That is
the property that kills the bug class, and unlike hit-testing it is provable without layout,
which matters because happy-dom does none (the existing `PartsDiagram` tests say so outright
and settle for asserting z-index values instead).

The placeholder geometry is deliberately coarse: banded rects that read as a car from above.
The multi-rect capability exists because the finished art will need it, not because the
placeholder does.

## The interaction model (R5): one selection surface, one action panel

The screen currently has TWO ways to reach work, and they do not resemble each other. Parts go
through the diagram into the docked action panel. Zones go through a separate unstyled
`body-zones-panel` section that sits below the whole action panel, so the flow is: scroll past
the diagram, find the zone row, click a stage button, scroll back to Planned work, Confirm.

**Resolved: the views select, the action panel acts, for parts and zones alike.** Clicking any
region docks the existing action panel, which grows a zone mode alongside its part mode. The
`body-zones-panel` section is deleted outright, not restyled. This is the DRY answer (one
staging surface, not two) and it removes a scroll-hunt the playtest already paid for.

It also retires the three live art-bible breaches, each by reusing something that already
exists rather than inventing a control:

| Today | Banned by | Replacement |
| --- | --- | --- |
| native `<select>` "Swap panel..." | 4.3, and 4.1's "never a dropdown" | **`ReplaceDrawer`**, the existing choose-a-replacement-part surface, filtered to that zone's panels. It already solves this exact problem for every other part. |
| bare `<input type="text">` for colour | 4.3 default browser widget | A row of paint chips. Colour is a small fixed set, so it is a swatch pick, not free text. Free text also let a player type a colour no tin exists for. |
| native `title=` tooltips for cost/labour | 4.3 "browser tooltips" | The action panel already shows cost and labour for part work. Zone stages use the same rows, so the tooltip has nothing left to say. |

Every stage control stays a real `<button>` underneath with keyboard focus and an ARIA name -
diegetic skin over standard semantics, per 4.1 - and each gets a pressed state, because
"if it cannot clunk, it does not ship."

### R6. The paint palette is new content, and it is not an economy lever

The colour swatches need a colour list, and none exists: `ZoneState.colour` is
`z.string().min(1).optional()` and the paint action takes any non-empty string, so phase 1
necessarily shipped free text. Free text also let a player type a colour no tin exists for.

`packages/content/data/paintColours.json` adds twelve era-plausible finishes (id, display name,
hex). **No prices, no weights, no stat effects** - it is a vocabulary, so directive 22 does not
bite and no gate re-pin is needed. Colour TASTE (a buyer persona caring what colour it is) is
Sprint 121's scope and is deliberately absent here.

Deliberately not manufacturer marketing names. The Naming Layer (engineering law 3) exists to
keep real brand strings swappable, and inventing a second flagged vocabulary for paint would be
scope creep; descriptive period names carry the same era without the problem.

The chassis zone gets NO swatches: its finish stage is underseal, and `applyPaintStage` already
colours it with the underseal shade rather than a chosen one. Swatches appear for panel zones
only.

The sim is untouched by this. The colour list constrains the UI's offer, not the action's
schema, so "zero sim change" still holds.

## The bug class this kills, precisely

`PartsDiagram`'s level-2 hit areas overlap **by design**: `partsDiagramLayout.ts` states the
rule ("a blocker's rectangle overlaps every part it blocks and sits above it in z") and
`partsDiagramLayout.test.ts` asserts it. Occlusion is how teardown order is communicated. The
cost is that a REMOVED part keeps its full pointer-events footprint and swallows clicks for
everything under it (playtest 2026-07-23, note 5: removed rims make the brakes unreachable).
The `FITTED_STACK_BONUS` z-shuffle is a mitigation, not a fix: two empty slots still fight.

Disjoint regions make it structurally impossible rather than defended against. `GROUP_TILE_LAYOUT`
already proves the pattern at level 1, where the bug has never occurred.

## Tasks

- T1: the representative body schematic component, eight regions on the art, zone state
  rendered on the region (severity glyphs, colour). Click targets are regions ON the art; a
  removed or empty region can never occlude another (the ghost-tile bug class dies
  structurally, playtest item 4).
- T2: the engine bay and underside views for the mechanical and chassis surfaces, replacing
  the corresponding tile sections.
- T3: retire the tile grid and `PartsDiagram`'s stacked hit-areas once the views carry every
  interaction the grid carried.
- T4: placeholder art pass conforming to the art bible's palette and pixel discipline;
  finished art is a separate, later concern.

### Implementation notes binding on T1-T4

- **Rasteriser reuse, not duplication.** `partSpriteDataUrl` is generic over "an array of
  equal-length strings" and is the right tool, but `PART_SPRITE_GRID`'s two-authored-sizes test
  (24x16 and 32x22) correctly forbids a view-sized grid from joining it. Extract the shared
  rasteriser and let a parallel view-sprite module use it. Do not copy it.
- **The art bible binds.** Palette from `style.css` tokens only, the same five-token discipline
  the part sprites already use; integer scaling; no anti-aliasing, no drop shadows, outlines in
  a dark warm tone rather than pure black.
- **Three live art-bible breaches get fixed on the way past.** The Sprint 119 zone panel ships
  a native `<select>`, a bare `<input type="text">` and native `title=` tooltips, all three
  banned by section 4.3. The views replace them.
- **The zone panel has zero tests today.** Every interaction the views absorb gets one.
- **Per-zone value preview** (`previewPlannedWork` skips pipeline actions, deferring to "the
  future representative-schematic views") is IN scope only if it falls out cheaply; it is not a
  definition-of-done item and it must not become a sim change.

## Definition of done

- [x] Every workshop interaction reachable through the three views; the tile grid is gone.
- [x] No region can occlude another regardless of part state.
- [x] Placeholder art within the art bible's constraints (see the T4 ruling in the Exit).

## Exit

**Status: ready for review. Not committed.**

### What shipped

`workshopViewLayout.ts` carries the geometry for 32 regions across three views, and its test proves
all 164 within-view rect pairs disjoint, derives the expected part set from `PARTS_TAXONOMY` at
runtime, and pins one-home-each for every part and zone. `WorkshopViews.vue` renders whichever view
is active from that data (one component, not three, since the views differ only in their region
sets). `CarDetailScreen.vue`'s docked action panel grew a zone mode, so parts and zones now stage
work through the same surface. `PartsDiagram.vue`, `partsDiagramLayout.ts` and both their tests are
deleted.

The rasteriser was extracted to `pixelRaster.ts` rather than copied, so the part sprites (which
survive on the docked panel, the bench strip and the parts market) and any future view art share one
implementation. `paintColours.json` adds twelve finishes as a vocabulary.

### The bug class is dead, structurally

The old level-2 hit areas overlapped by design, and a removed part's empty rectangle kept its full
pointer-events footprint, which is how a removed set of rims left the brakes behind them
unreachable. `FITTED_STACK_BONUS` was a z-order mitigation that still let two empty slots fight.
Disjoint regions make the failure unrepresentable: there is no stacking order to get wrong. **No
region button carries a z-index at all**, and a test asserts that across all three views, which is
the honest DOM-level proof available given happy-dom does no layout and cannot hit-test.

### Directive 17: one real regression, caught by an existing test

The `selectPart` helper and its 44 call sites were case (a), navigation only: the tile-then-slot path
no longer exists, so the helper now opens whichever view `WORKSHOP_VIEWS` says owns that part and
clicks the region. Every assertion in every caller is untouched. Three screen tests that asserted the
tile grid itself were also case (a), re-pointed at the same claim.

One was case (b). `WorkshopViews` shipped the word "staged" in a region's visible label and aria
text, and this screen has a standing test that no player-visible "staged" copy appears anywhere on
it. **The code was fixed, not the test**: the label reads "planned", matching the screen's own
vocabulary. That test earned its keep.

### T4: three backdrops, authored

I initially declined to generate these, reading the art bible's no-AI-assets law as absolute.
**Maintainer correction (2026-07-26): that law governs the SHIPPED product, not development
placeholders.** So they were drawn.

`workshopViewSprites.ts` carries one 80x45 template per view, on the same five-token palette the part
sprites use (imported, not redeclared) and through the same shared rasteriser. All three are plan
views with the front at screen-left, so the three read as one car from three angles: the body as
bonnet, screen, roof, cabin, boot with flanks and door shuts; the engine bay as radiator, block, cam
cover, manifolds and ancillaries; the underside as subframes, gearbox, propshaft, differential and
floor pan. Amber, the accent, is four pixels in total across all three.

They are backdrops only. The layer keeps `pointer-events: none` and `aria-hidden`, and a test now
pins it as the stage's FIRST element child, because with no z-index anywhere on the stage by law, DOM
order is the entire stacking story and a backdrop moved after the regions would sit over the hit map.

Two things learned that are worth not rediscovering. happy-dom has no canvas 2D context, so
`rasterise` returns an empty string under test and every view renders `url("")`; the tests therefore
assert the binding and the DOM order rather than pretending to verify a data URL. And the raster
cache is shared with the part sprites, so these keys are namespaced `workshopView:` to prevent a
collision. The three drawings were added to the existing launch-blocking placeholder-art item in
`TODO.md` rather than opening a second entry: same class of asset, same terms.

### Tutorial copy, swept personally

Three steps named "the service diagram", and the wheels step said "point at the wheels and click"
when wheels now live behind the Underside tab. All three reworded. The step triggers were traced
rather than assumed: no tutorial anchor pointed at a retired id, so nothing was mechanically broken,
but the wheels step's anchor resolves only once the wheels are selected, and the car screen's
fallback would have spotlit the service bay the player had already left. It now carries a chain,
deepest first: `remove-assembly-wheelAssembly`, then the tyres region, then the Underside tab, so the
spotlight walks the player through the view switch. The chain lives on the line rather than the step
because the step schema takes a single id, and because a later visible line should be able to
override it. The empty-panel copy was rewritten to point at the views.

### Checks

| Check | Result |
| --- | --- |
| `pnpm test --project content` | 18 files, **148 tests**, all pass |
| `pnpm test --project game` | 60 files, **735 tests**, all pass |
| `vue-tsc --noEmit` (game) | exit 0 |
| `eslint` on the changed screen and component | exit 0 |
| comment hygiene guard | green (it caught eight offences in this work; all reworded to state the invariant rather than its provenance) |

The pre-push gate is the sprint's real evidence per directive 20 and runs at commit; the above are
the narrow checks run while building. No economy lever moved, so the approval gate is untouched and
needs no re-pin.

### Carried forward, not fixed here

- **`CarDetail.groupIncomplete` is now orphaned.** `PartsDiagram` was its only consumer. Removing it
  means touching the store and its tests, which is wider than this sprint.
- **No selected-region highlight.** The old diagram painted a selected slot from a prop; the docked
  panel is currently the only feedback that a region is armed. Belongs with the art pass.
- **Per-zone value preview** stays deferred: `previewPlannedWork` still skips pipeline actions. It
  was explicitly not a definition-of-done item and would have been a sim change.
- **`chassis` remains in the `drivetrain` group.** The taxonomy wart is untouched and still logged in
  `TODO.md`; this sprint only decided which view draws it.
