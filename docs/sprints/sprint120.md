# Sprint 120: The views (workshop rework, phase 2)

**Source design:** `docs/design/workshop-rework.md` (FINAL, maintainer-approved 2026-07-23).
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
drag-and-drop doctrine and diegetic-UI law from `docs/design/art-catalogue.md`.

## Tasks

- T1: the representative body schematic component, six regions on the art, zone state
  rendered on the region (severity glyphs, colour). Click targets are regions ON the art; a
  removed or empty region can never occlude another (the ghost-tile bug class dies
  structurally, playtest item 4).
- T2: the engine bay and underside views for the mechanical and chassis surfaces, replacing
  the corresponding tile sections.
- T3: retire the tile grid and `PartsDiagram`'s stacked hit-areas once the views carry every
  interaction the grid carried.
- T4: placeholder art pass conforming to the art bible's palette and pixel discipline;
  finished art is a separate, later concern.

## Definition of done

- [ ] Every workshop interaction reachable through the three views; the tile grid is gone.
- [ ] No region can occlude another regardless of part state.
- [ ] Placeholder art within the art bible's constraints.

## Exit

(To be filled from real check output when the sprint completes. Do not pre-fill.)
