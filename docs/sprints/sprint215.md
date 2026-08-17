# Sprint 215: the knowledge model

**Status: APPROVED.** Implements sections 1, 9 and the work-as-test half of
section 7's base from `docs/design/systems/knowledge-and-diagnosis.md` (the design
of record; this doc does not restate it, it slices it). First sprint of the
knowledge arc; 216-218 depend on it.

## Reuse analysis (directive 16)

**Reused:** generation's true bands (already rolled; nothing about truth
changes); the mileage-factor curve's segments for `priorBand`; provenance tags
for the prior modifier; `BandChip` (gains an estimated variant, not a sibling);
the existing silent prune in diagnosis.ts (surfaced, not rewritten); the verdict
idiom for collapse lines; `taskLaborChain` for open-up costs on the checklist;
PartCard keep/harvest/sell for revealed non-stock parts; the repair quote
machinery (the reveal-then-confirm flow wraps it, never re-prices it).

**New:** `CarInstance.verifiedSlots`, the `knowledgePriors` content block, the
estimated chip rendering, the reveal-then-confirm click flow, elimination lines,
the non-stock surprise roll.

## Tasks

### A. State and priors

- A1. `verifiedSlots: CarPartId[]` on `CarInstance` (optional-field pattern;
  SAVE_VERSION bump, no migration). Seeded at acquisition: `depthClass:
  'surface'` slots + tyres + rims. Body zones/paint are outside the slot model
  and remain fully visible as today. Warehouse instances are always verified.
- A2. `knowledgePriors` in economy.json: the mileage-segment-to-band mapping and
  the provenance band modifiers (+1 garage-kept/one-owner, -1 crash/flood/
  abandoned; clamped poor..mint). `priorBand(car, slot, context)` in sim,
  deterministic, pure.
- A3. Dev-granted cars and the tutorial car verify everything (dev convenience
  and the tutorial's fixed script are not knowledge gameplay).

### B. Display

- B1. Estimated slots render `priorBand` on a visually distinct chip (hollow +
  "est."), on every surface that shows a slot band: workshop views, docked
  panels, assembly rows, day-log-adjacent readouts. Verified slots render as
  today.
- B2. The player's value estimate/ledger read estimated bands for unverified
  slots (one read path: the estimate function takes the knowledge view of the
  car, never raw truth).
- B3. No surface leaks truth for an unverified slot: guard test sweeping the
  store's view models.

### C. Verification events

- C1. Removal verifies the slot (single code path where `removePart`/assembly
  dismount land the part in inventory).
- C2. Repair-click on an unverified slot: reveal first (free); if truth equals
  estimate, the repair runs in the same click; else show corrected band + price
  and wait for one confirm. Applies to on-car repair and group repair entry
  points.
- C3. Diagnostic confirmation verifies the named slot; elimination never does
  (spec section 1's worked example is the test fixture).

### D. Work-as-test surfacing

- D1. On any verification, resolve open symptoms' candidates on that slot:
  collapse via the existing verdict idiom; elimination surfaced with the generic
  line "The {part} is clean. It wasn't that." (per-mode override field optional,
  empty for now).
- D2. The symptom checklist shows per candidate: weight % and open-up chain
  labour (both existing data), identical data pre-purchase and mid-repair (the
  test LIST differs by venue only from Sprint 218).

### E. Hidden non-stock parts (spec section 9)

- E1. Generation roll: 5% initial, culture/provenance weighted; one estimated
  slot's true instance is a non-stock SKU at a rolled band; display shows the
  expected stock part at prior until verified.
- E2. No new UI: reveal corrects name+band; PartCard controls already carry
  keep/harvest/sell.

### F. Tests and fallout

- F1. Unit: priors, seeding, every verification route, reveal-then-confirm both
  branches, elimination-verifies-nothing, non-stock reveal.
- F2. Directive 17 discipline: fixtures that read true bands through UI on
  unverified slots are case (a): verify in the fixture or assert the estimate.
  Golden hashes re-derive (state shape change).

## Definition of done

- No unverified slot's truth is readable anywhere; every verification route
  works and is tested; the repair flow never blocks, only confirms; collapse and
  elimination speak; non-stock surprises reveal through existing controls.
- `pnpm typecheck`; narrowest tests once; one full suite at arc end (218).
