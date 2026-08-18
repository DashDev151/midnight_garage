# Sprint 211: the body shop tells the truth

**Status: APPROVED (playability pass, playtest notes 2026-08-16 session 3).** Covers
S3-2, S3-3, S3-4, S3-5, S3-7 (UI half), S3-9, S3-10, S3-13, S3-14, S3-15. The sim
half of S3-7 (interior/aero bay re-home) and all of S3-11/S3-12 are Sprint 212.

## Root causes (verified by investigation, 2026-08-16)

- S3-7: `BodyShopScreen.onWorkshopSelect` only handles `'zone'` clicks; a part click
  is a silent no-op, the stale zone stays selected, and no region ever shows a
  selected state, so "Take it off" fired at the skirts while the player looked at
  the dash.
- S3-13: the Warehouse's `sectionFilter` survives its own option disappearing (last
  part of a section leaves the shelf), filtering everything out while the select
  renders blank; the tab badge counts unfiltered.
- S3-14: zones have no representation in the Warehouse fit machinery
  (`WarehouseFitContext` is hard-typed to `CarPartId`), so panel fitting grew a
  bespoke per-SKU button block.

## Tasks

- A. **Selection integrity (S3-7 UI).** `WorkshopViews` regions get a real selected
  state; `BodyShopScreen` handles part clicks (dock or clearly refuse, never
  silently hold the old target); "Take it off" can only ever fire at the thing the
  panel is showing.
- B. **Structure and paint are different facts (S3-3, S3-15).** The zone panel and
  the diagram chips carry both: the metal/structure band AND the finish position
  (bare / prepped / primed / painted / polished), with the remaining pipeline steps
  listed as a short checklist. A beaten-straight bare panel reads "straight, bare
  metal", never Mint. Mint appears only when structure and finish are both done.
- C. **Refusals speak (S3-5).** Every disabled pipeline control states its reason on
  the surface (caption idiom, not title-only): missing material names the material,
  wrong-order names the step, off-bay names the bay.
- D. **Panels fit like everything else (S3-14).** `WarehouseFitContext` gains a zone
  variant; the Warehouse fit mode filters panel SKUs for that zone and resolves
  through `installPanel`; zone regions become drop targets via a zone drop-zone map;
  the bespoke per-SKU button block dies.
- E. **Removal says what it is for (S3-4).** The zone panel's "Take it off" carries
  the one-line purpose (replacement or harvest); ruled: no repair requires removal.
- F. **The garage reads as pairs (S3-2).** The garage screen groups Service bays +
  Workbench/Machine as one cluster and Body bay + Body shop door as the other, so
  the pairing is visible at a glance. Layout/grouping only; no new mechanics.
- G. **Warehouse QoL (S3-9, S3-10, S3-13).** Pin-open toggle (top right; a pinned
  drawer does not auto-tuck on drag, it stays put while targets beneath remain
  reachable via its drop rail); a condition slicer (scrap/poor/worn/fine/mint); the
  stale section filter resets when its option disappears and the badge/count agree.

## Definition of done

- No click can act on a target the player is not looking at; selection is visible.
- A zone's structure and finish state, and its remaining steps, are legible at a
  glance; bare metal never reads Mint.
- Every refused body action says why, on screen.
- One fit flow for every part in the game, panels included.
- Warehouse: pinnable, condition-sliceable, never lies about its count.
- `pnpm typecheck` if signatures move; narrowest tests once; pre-push is the gate.

## Exit

**Implemented 2026-08-17; lead mesh pass wired `installBlockedReason` onto the fit
controls once Sprint 212's getter landed. All green.**

Selection is visible and can never act on a hidden target (part clicks dock a real
panel); zones carry structure band AND finish position with a remaining-steps
checklist, and plain Mint means both done; every disabled body control captions its
reason; panels fit through the one Warehouse flow (zone fit context, zone drop
zones) and the bespoke SKU buttons are gone; removal states its purpose; the garage
reads as two clusters; the Warehouse gained pin-open, a condition slicer, an honest
n/m count, and the stale section filter resets itself. The agent caught its own
emoji slip before reporting (directive 2 held).

**Evidence:** merged tree 230 files / 4,758 tests green, typecheck clean; lead copy
pass over the new captions: no edits needed. Pre-push re-verifies at push.
