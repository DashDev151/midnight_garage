# Sprint 220: The body shop tells the truth and the buttons stop moving

**Status:** Complete. Committed and pushed in `2c299e8` (2026-08-19).
**Trigger:** Day-6 playtest. Maintainer verdict on the body shop: unusable. Cannot see a
panel's real condition (reports mint while unpainted), cannot see the repair stage, buttons
appear and move, no guidance on the next action, silent no-op clicks, and stripPrep presented
as part of the ladder caused repeated strip/prime cycles on the skirts (4 primer uses burnt
where 1 was needed).

## Goal

Rebuild the body shop action surface end to end around three rules set by the maintainer:

1. A SIMPLE per-panel status summary: metal status, prep status, paint status.
2. A rigid PIPELINE of five fixed buttons in fixed positions that never move:
   Beat/Weld, Fill and Sand, Prime, Paint, Polish. Sequential, hard-gated: a step that is
   not next is disabled with its blocker named; a step that is not needed says so.
3. The player always sees what to do next, per panel and for the body as a whole.

## Definition of done

- Selecting any zone shows a three-row status summary (metal / prep / paint) derived from
  the real zone fields, with paint state never hidden behind a structure-only band.
- The five pipeline buttons render in the same grid positions for every zone and every
  state. Exactly one is enabled at a time (the next step); completed steps show as done;
  not-applicable steps say why; locked steps name their prerequisite; out-of-stock steps
  name the missing tin with an inline buy control.
- stripPrep is out of the pipeline row: a separate fixed "Strip back" control, captioned as
  respray preparation, enabled only on a primed or painted zone.
- Panel off / fit panel are a separate fixed row.
- The zone diagram no longer shows a lone condition band per zone in the body view; it
  shows a three-segment metal/prep/paint indicator.
- A fixed whole-body header shows the two real carrier bands (bodywork, paint), panels
  finished count, and the next panel to work.
- No sim behaviour change, no economy lever change. Component tests cover the step state
  machine and the summary rows.

## Reuse analysis (directive 16)

**Existing mechanisms reused (no new sim mechanics):**
- Zone state fields: `metal`, `surface`, `finish`, `primed`, `colour`, `panelMissing`,
  `panelGrade` (`packages/content/src/carInstance.ts:125-174`). Untouched.
- `zoneNextStep` (`packages/sim/src/bodyPipeline.ts:282`): the single source of the next
  required stage. The pipeline row's enabled step IS this function's answer.
- `pipelineActionPlan` (gameStore) for per-button cost/labour figures and refusal reasons;
  `PIPELINE_REFUSAL_CAPTIONS` caption idiom (sprint 211) for blocker text.
- Store actions unchanged: `pipelineStage`, `paintZone`, `removePanel`, warehouse fit flow,
  `buyConsumableTin` / `buyPaintTin` (parts market actions, called inline).
- Carrier bands `car.parts.bodywork` / `car.parts.paint` via `applyDerivedBodyBands` for
  the whole-body header. Untouched.
- `zoneSeverity.ts` as the home for display derivation; `zoneFinishPosition`,
  `unpaintedPanelsText` retired into the new model rather than duplicated.
- Layout idioms: the workbench action-row verb+figures pattern, the pinned-bar figures
  grid (EconomyBenchScreen), `WorkshopViews` as the selection surface.

**Genuinely new (all display-layer):**
- `zonePipelineSteps(zone, ...)`: pure helper mapping zone state to five step models
  (done / next / locked / not-needed) plus strip-back and panel-row state.
- `zoneStatusRows(zone, factoryColour)`: pure helper producing the three summary rows.
- Three-segment zone indicator in `WorkshopViews` body view, replacing BandChip+finish tag
  there.
- Inline buy-a-tin control in the refusal caption slot (reuses existing buy actions).

## The step state machine (the whole design, exactly)

Global gate: `panelMissing` or `metal === 4` locks the entire pipeline row; the status
strip carries "No panel fitted" / "Beyond repair: needs a replacement panel" and the Fit
control in the panel row is the only path forward.

Metal zone step states (trim zones: Beat/Weld and Fill and Sand render "Not needed: trim
panel"; the rest identical):

| Step | DONE when | NEXT when | LOCKED (caption) |
|---|---|---|---|
| Beat/Weld (label Weld iff `metal === 3`) | `metal === 0` ("Straight") | `metal` 1-3 | never (always first) |
| Fill and Sand | `surface === 0` | `metal === 0 && surface > 0` | `metal > 0` ("After the metalwork") |
| Prime | `primed` or `finish < 3` ("Sealed under paint" when painted) | `metal === 0 && surface === 0 && !primed && finish === 3` | ("After fill and sand") |
| Paint | `finish < 3` | `primed` | `!primed` ("After primer") |
| Polish | `finish === 0` ("Showroom") | `finish` 1-2 | `finish === 3` ("After paint") |

Exactly one step is NEXT for any reachable state. The guidance line above the row reads
"Next: {step} ({materials} yen, {n} labour)" from the same model, or "This panel is done."
Tool-tier polish floor (tier below 3 cannot pass finish 1) surfaces through the existing
plan refusal caption in the fixed caption slot, never by hiding the button.

Status rows:
- METAL: missing / beyond repair / crumpled (weld) / dented (beat) / straight; trim: "Trim
  panel: no metalwork".
- PREP: rough (needs fill and sand) / bare metal (needs primer) / primed / sealed under
  paint.
- PAINT: unpainted / painted {colour}, dull / painted {colour} / polished {colour},
  showroom; appends "(not the factory {colour})" when off-factory.

Paint colour: a fixed swatch row directly under the pipeline, rendered only while Paint is
the next step slot's concern (the row keeps its reserved space so nothing shifts). Factory
colour always listed first, greyed with price and inline Buy when not on the shelf; owned
tins follow, grouped by finish; grade auto-derivation unchanged. The Paint button reads
"Paint {selected colour}".

Panel row (fixed): [Take it off] [Fit a panel] [Strip back]. Take-off/Fit enable by panel
presence (the other disabled, never removed). Strip back enabled when `primed || finish < 3`,
caption "Strips to bare metal for a respray or colour change".

Whole-body header (fixed): bodywork band chip, paint band chip, "{n} of 9 panels
finished", "Next panel: {zone}" (first binding zone, else first zone with steps left).

## Tasks

- [x] **A (helpers):** `zonePipelineSteps` + `zoneStatusRows` in
  `packages/game/src/utils/zoneSeverity.ts`, built on `zoneNextStep` and the zone fields;
  unit tests over the full state table above, including trim zones, panel-missing,
  beyond-repair, respray (post strip-back) and the one-NEXT invariant.
- [x] **B (screen):** rewrite the zone branch of `BodyShopScreen.vue`: status strip,
  guidance line, rigid five-button grid with fixed figure and caption slots, panel row,
  swatch row, inline buy-tin control, whole-body header. Fixed grid dimensions; no
  conditional removal of controls, only state changes. Component tests.
- [x] **C (diagram):** three-segment metal/prep/paint indicator per zone in
  `WorkshopViews.vue` body view (trim zones grey the metal segment), replacing the band
  chip + finish tag pair there. Other views untouched. Tests.
- [x] **D (verify):** narrow test runs for touched files once; `pnpm typecheck` once
  (WorkshopViews prop surface changes qualify under the directive-20 carve-out).

## Out of scope

Sim and economy: none of `bodyPipeline.ts`, stage costs, consumable prices move. The
repair-resume band trap found in the same playtest (workbench repair, not body shop) is a
separate defect, recorded in sprint193 triage.

## Exit

All four tasks landed; no sim file or economy value moved. Files: `zoneSeverity.ts`
(+`zonePipelineSteps`, `zoneStatusRows`, `zoneSegments`), `BodyShopScreen.vue` (zone branch
rebuilt), `WorkshopViews.vue` (zone regions), plus their three test files.

Evidence: `zoneSeverity.test.ts` 50 passed (includes the Cartesian at-most-one-next
invariant over every enumerable zone state, cross-checked against `zoneNextStep`);
`BodyShopScreen.test.ts` 45 passed; `WorkshopViews.test.ts` 15 passed; `pnpm typecheck`
clean across all three projects (carve-out run: import and export surfaces moved).

Implementation decisions of record, made without maintainer ruling (all display-layer):
1. The step model derives its single "next" from the sim's `zoneNextStep` by construction
   rather than transcribing the doc's per-row conditions, which read independently could
   double-mark unreachable states.
2. Paint is select-then-commit: swatches only pick a colour; the fixed Paint button
   dispatches. The old click-a-tin-to-paint idiom is retired (its tests updated,
   directive 17 case a).
3. stripPrep is out of the ladder as "Strip back" in the panel row, captioned as respray
   preparation: the day-6 skirts strip/prime cycling is the failure this kills.
4. Out-of-stock steps offer an inline "Buy a tin" control (reuses the parts-market store
   actions; paint defaults to a small tin, no size picker in this room).
5. Labour exhaustion now also disables take-off and strip back, closing the same
   silent-no-op class the sprint was triggered by.
6. The factory colour is always the first swatch, greyed with price and buy control when
   not owned; unowned non-factory tins remain absent rather than enumerated.

Deliberately unchanged: `zoneConditionBand` (sim) still reads structure only; every UI
surface that showed it alone now shows the three-axis truth instead. `CarDetailScreen`'s
docked zone panel still uses the older why-chips idiom (its zone regions in the shared
diagram get the new segments); aligning it is follow-up work, not started.
