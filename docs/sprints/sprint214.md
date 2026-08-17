# Sprint 214: the build sheet (EXPERIMENTAL, dev branch)

**Status: APPROVED AS AN EXPERIMENT (maintainer, 2026-08-17): built on branch
`dev/build-sheet`, tested by playtest, promoted to main only if it earns it.**
Stage 1 of the repair-loop engagement design (playtest note S3-D2, S3-8, S3-15
integration); stages 2 and 3 (while-you're-in-there discoveries, the first-start
ceremony) wait until the sheet has been felt.

## What it is

A per-car diegetic clipboard: the plan for the build, made once, worked off, and
priced live. One artefact answering three needs:

- **The plan (the fun):** the player marks, per slot/zone, the intent: repair to a
  target band, fit a specific part, or leave it. Planning is the decision layer the
  loop currently lacks.
- **The shopping list (S3-8):** planned parts not yet owned appear as the to-buy
  list, readable from the parts market (a "on the sheet" marker on catalogue rows).
  No new system: the sheet reads the same catalogue/inventory the market does.
- **The ledger of the flip (S3-15, 213's legibility):** the sheet totals, live:
  parts still to buy, labour still to spend (chain-priced), spend so far, the
  car's projected sale value when the plan completes (the existing value model run
  against the planned end-state), the expectation band marker ("pays to fine; past
  that is passion"), and the headline **yen-per-labour-point of the remaining
  plan**, beside the radial wage for comparison.

## Reuse analysis (directive 16)

**Reused:** `taskLaborChain` for every labour figure; `marketValueYen` against a
hypothetical end-state for the projection; the value ledger's presentation idiom;
the Warehouse fit flow and catalogue reads for the shopping list; the existing
per-slot band/target machinery for plan entries; the cost-sheet visual idiom for
the sheet itself. **New:** the plan state (per-car, in `GameState`, Dexie bump),
one sheet panel component, the market's "on the sheet" marker, and the projection
function composing existing pieces.

## Tasks

- A. Plan state: `carBuildPlans` on `GameState` (per car: entries keyed by slot or
  zone, each `{ target }`), plus store actions to set/clear entries. Save bump.
- B. The sheet panel: on the car page (and readable in the body shop), cost-sheet
  visual idiom, entries with tick-off state derived (an entry completes itself when
  the car state meets it - never hand-ticked), totals and projections as above.
- C. The market marker: catalogue rows matching an unmet plan entry carry a small
  "on the sheet" tag; the sheet lists unbought parts with a link into the market.
- D. The projection: planned end-state value via the real model, remaining labour
  via the chain, ¥/point headline vs the wage line, expectation-band marker.
- E. Tests for plan state, self-ticking, projections matching the real model, and
  the marker.

## Definition of done

- A plan can be made, is priced live, ticks itself off, and its projection matches
  what the sale actually yields within the model's own terms.
- The shopping list works from both ends (sheet and market).
- All on `dev/build-sheet`; main untouched; the branch carries its own full-suite
  green before handover.
