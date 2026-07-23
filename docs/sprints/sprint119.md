# Sprint 119: The body model (workshop rework, phase 1b)

**Source design:** `docs/design/workshop-rework.md` (FINAL, maintainer-approved 2026-07-23).

**STATUS: LEVERS SIGNED (maintainer rulings in session, 2026-07-23). Implementation
authorised.** This is the sprint doc that carries phase 1's complete lever list per the
design's directive-22 obligation; the table below records each ruling. Sprint 118 covers
the levers that were signed earlier the same day (labour, fitting, daily hire) and ran
independently.

## Reuse analysis (directive 16)

**New mechanisms**

- Zone state on the car: six zones (bonnet, boot, left, right, roof, chassis), each carrying
  metal / surface / finish severities.
- The six-stage pipeline as new staged-action kinds on the existing staged-work machine.
- Materials: cheap consumable SKUs consumed by pipeline stages and billed into the stage cost.
- Band derivation: `panels` / `paint` / `underbody` bands computed from zone states
  (worst-governs) instead of stored directly.
- Zone panels as inventory-able parts (a `zoneId` on `PartInstance`).

**Existing mechanisms to reuse**

- The staged-work machine (`StagedActionSchema`, `confirmStagedWork`) hosts every pipeline
  stage; no parallel job system.
- The labour config lands in Sprint 118 (`energyPerBandStepByToolTier`, `energyByClass`);
  pipeline stages spend from the SAME keys. No new labour knobs exist in this sprint.
- The daily machine hire (Sprint 118) is the capability gate: hiring a line grants that
  line's full machinery for the day, so tool tiers are economics, not walls.
- The centralised pricing formula (`resolvePartPriceYen`, `packages/content/src/partPricing.ts:80`)
  prices zone panels; the band enum (`ConditionBandSchema`, mint/fine/worn/poor/scrap) is
  untouched.
- Part provenance: `resolveRemovePart`'s inventory push and `PartInstance` origin stamping
  carry panel harvesting; removal stays free.
- The core-loop floor (`enforceMinWorkBill`) extends to degrade zone states for the derived
  parts; the Law 2 drop rule and `maxBillFraction` ceiling operate on the derived bills.
- The seeded per-lot generation streams; the Dexie version bump (46 to 47), no migration
  (directive 19).

## The model

### Zone state

Each car carries six zones. Per zone:

- `metal`: 0 straight, 1 dinged, 2 dented, 3 rotten or bent.
- `surface`: 0 ready, 1 needs fill and sand, 2 raw.
- `finish`: 0 show, 1 tidy, 2 dull or scratched, 3 flaking or bare. On the chassis zone the
  finish layer is underseal.
- `panelMissing`: true when the zone's panel has been removed and not replaced (never true
  for chassis).
- `colour`: set at the paint stage; the car's original colour at generation.

### Derived bands (worst-governs)

Implementation form: a SINGLE-WRITER projection. One sim function derives the three body
bands from zone state and writes them onto the installed carrier parts; it runs at
generation and after every zone mutation, and nothing else may write those bands (direct
repair on the three parts refuses). Every downstream consumer (valuation, grading,
selling, coherence) keeps reading bands exactly as today. A consistency test asserts the
stored bands always equal a fresh derivation.

- Zone body score = max(metal, surface). `panels` band = the worst body score across the
  five panel zones, mapped 0 mint / 1 fine / 2 worn / 3 poor; any `panelMissing` zone forces
  scrap.
- `paint` band = the worst finish across the five panel zones, same mapping, then one step
  down if painted zones disagree on colour (the mismatch penalty).
- `underbody` band = max(metal, finish) on the chassis zone, same mapping.

### The pipeline (stage, prerequisite, consumes, result)

| Stage | Needs | Consumes | Result | Labour (in band-step units) |
|---|---|---|---|---|
| Strip/prep | nothing | nothing | finish to 3 (bare); required before metalwork or respray on that zone | 1 |
| Beat (hand tools) | metal 1-2 | nothing | metal down 1 per job; cannot clear metal 3 | 1 per point |
| Weld (body line) | metal any; chassis straightening also needs the body line | nothing | metal to 0 | 2 |
| Swap panel | a zone panel part in inventory; not chassis | the panel part | metal from the panel's band (mint 0 / fine 1 / worn 2 / poor 3); old panel to inventory | fitting (bolt-on class) |
| Fill and sand | metal 0 | filler + paper | surface to 0 | 1 |
| Prime | surface 0 | primer | ready to paint | 1 |
| Paint (colour chosen) | primed | paint tin (chassis: underseal) | finish to 2 with tier 1 tools, 1 with tier 2 or the body line hired | 1 |
| Polish | painted | polish | finish down 1; floor 1 with tier 1-2 tools, 0 with tier 3 or the body line hired | 1 |

One band-step unit = the Sprint 118 `energyPerBandStepByToolTier` value (5 / 4 / 3). Surface
generation at car creation: `surface = max(0, metal - 1)`, plus 1 (capped at 2) with
probability 0.2.

### Generation (seeded, per lot, per zone, independent rolls)

Weights are percentages over severity 0 / 1 / 2 / 3.

| Tier | metal | finish |
|---|---|---|
| shitbox | 20 / 35 / 30 / 15 | 5 / 25 / 40 / 30 |
| common | 40 / 35 / 20 / 5 | 15 / 40 / 30 / 15 |
| uncommon | 55 / 30 / 12 / 3 | 30 / 40 / 22 / 8 |
| rare | 65 / 25 / 8 / 2 | 40 / 38 / 17 / 5 |

The chassis zone rolls metal on the next-kinder tier's row (rare uses 75 / 20 / 4 / 1) so
rot stays era-true without flooding the yard with structural cases. The floor
(`minWorkBillFractionByTier`) gains zone degradation as a top-up candidate alongside
mechanical bands.

## SKU dispositions

Retired outright (`parts.json`, all four fitment-class entries each): Custom Two-Tone,
Sport Livery, Full Livery Wrap (premium finishes return in phase 3 as paint-stage
materials). DELISTED, not deleted: Stock Paint, Stock Underbody, Stock Panels stay in the
catalogue as the three value carriers' installed references (the whole band/bill/value
machinery reads the installed part's own SKU price), but the parts market never lists them
again; the purchasable body inventory is zone panels and materials.

Migrated into the widened kit family (the `aero` slot, display name "Aero and body kit";
the internal id does not change):

| SKU | Grade | New display name |
|---|---|---|
| frp-lightweight-panels | street | Lightweight Body Kit |
| Sport Panel Kit | sport | Sport Body Kit |
| Carbon Panel Kit | race | Carbon Body Kit |
| neon-doraku-underglow-kit | street | Underglow Kit (unchanged) |
| Sport Underbody Kit | sport | Skirt and Splitter Kit |
| Flat Floor Kit | race | Flat Floor Kit (unchanged) |

Migrated kits KEEP their current prices (maintainer ruling 2026-07-23: the family-base
repricing was rejected as too cheap, and body kits must never scale together with aero).
Mechanism: catalogue entries gain an optional `priceBasisPartId` (defaults to `carPartId`).
The migrated kits address the `aero` slot but price from their original bases
(`baseCostYen.panels` 28,000 for the three panel kits, `baseCostYen.underbody` 24,000 for
the three underbody kits), which after the stock-SKU retirements feed ONLY these kits: body
kits get their own independently tunable bases while `baseCostYen.aero` (18,000) tunes the
true aero rungs alone. Zone panels price from a new `zonePanel` basis (6,000) through the
same field. No per-SKU overrides; every migrated price is provably unchanged.
`missingSlotWeightByPart` entries for panels/paint/underbody retire (those parts are derived
now; only the kit slot can still generate missing, weight unchanged at 3).

Generation and the widened family: car generation keeps rolling ONE canonical kit SKU per
grade (Lip Kit street, GT Wing sport, Race Aero Kit race), exactly as the aero slot rolls
today; the migrated kits are market-purchasable alternatives only. Generated modified cars
wearing the migrated kits belong to a later modified-cars pass, recorded in `TODO.md`; the
generation maps stay one-SKU-per-grade in this sprint.

New zone-panel SKUs (stock grade only, per fitment class, priced via the pricing formula
with a new `baseCostYen.zonePanel`): Bonnet panel, Boot lid, Roof skin, Left panel set,
Right panel set. Harvesting: removing a zone panel yields a `PartInstance` with `zoneId`,
band from the zone's metal, origin stamped as usual.

## Materials (new content file, `materials.json`)

| id | Name | Price | Consumed by |
|---|---|---|---|
| filler | Body filler tin | 1,500 | fill and sand |
| paper | Sanding paper pack | 400 | fill and sand |
| primer | Primer tin | 1,200 | prime |
| paint | Paint tin | 2,500 | paint (panel zones) |
| underseal | Underseal tin | 2,000 | paint stage on chassis |
| polish | Polish tin | 800 | polish |

Materials are charged at point of use into the stage's cost line (the staged row shows the
breakdown); no pre-stocking in phase 1. They join the Law 3 consumables-share measurement.

## The complete lever table (SIGNED, maintainer rulings in session 2026-07-23)

| # | Lever | Signed value and ruling |
|---|---|---|
| L1 | Materials prices | the six prices in the materials table above, signed as STARTING values with the maintainer's concern recorded verbatim in substance ("they seem expensive for single use"): materials pricing is the first tuning target of the post-rework pass |
| L2 | `baseCostYen.zonePanel` (per zone, stock, times class factors) | 6,000 ("Fine") |
| L3 | Zone generation weight tables | the generation table above, chassis one row kinder, surface rule as stated ("Fine") |
| L4 | Derived-band mapping and mismatch penalty | 0 mint / 1 fine / 2 worn / 3 poor; missing panel = scrap; colour mismatch = one step down on paint |
| L5 | SKU dispositions | prices KEPT, repricing rejected ("Keep those seem a bit cheap"); body kits and aero individually tunable via `priceBasisPartId` per the dispositions section above |
| L6 | Stage-to-materials map and stage results by tool access | the pipeline table above |
| L7 | Law 3 extension | pipeline materials join the consumables-share measurement; if the probes breach 0.15 at these prices, the numbers come back to the maintainer, the thread ends |
| L8 | Pipeline labour | reuses `energyPerBandStepByToolTier` and the fitting class; NO new labour knobs |
| L9 | Labour in body bills | RULED: money only, like everywhere else. Body bills price materials + panels; labour stays the pacing currency and never appears in yen |

## Implementation hazard (found landing wave 1): zone panels must never masquerade as the slot's stock part

Zone-panel SKUs carry `carPartId: "panels"` and `grade: "stock"`, so any code that
resolves "the stock part for this slot" by the naive filter
`grade === 'stock' && fitmentClass === X` will pick one up: `Object.fromEntries` (last-wins)
silently, `.find` (first-wins) only if a zone panel sorts before the real stock panel. Wave 1
surfaced this through the golden-master career hash: a fixture's panels slot resolved to a
6,000-yen zone panel instead of the 28,000 stock panel, shifting a body repair's cost. Guard,
applied and required everywhere this pattern appears: add `&& part.zoneId == null`. Fixed in
`context.ts` (`indexStockPartsByCarPartId`), `parts.ts` (`partFitsCar`, so a zone panel can
never slot-fit a car or enter a service-job's fitting set), `data.ts`
(`stockReplacementPricesByClass`), the save codec's migration map, and the sim test fixture.
The golden hash returned to its pinned value, proving the wave was truly additive. WAVE 2 MUST
carry this guard into every new stock-part resolution it writes.

## Coherence obligations (closes the sprint)

- Law 2 and the full-restore probes re-derive against the pipeline bills (worst roll at
  these weights, restored through the cheapest yen path, still clears the ceiling and the
  margin).
- The core-loop floor probe passes with zone degradation as a top-up candidate.
- Law 3 passes with materials included, or the numbers go back to the maintainer.
- The economy approval gate re-pins once, in the same change, citing this doc's signed table.

## Tasks

- T1: content: zone/materials/pipeline schemas, `materials.json`, SKU dispositions in
  `parts.json` and `partPricing.json`, generation parameters into `economy.json`.
- T2: sim: zone state + generation + floor extension; derived-band functions; pipeline
  staged-action kinds in `confirmStagedWork`; harvesting; derived repair-bill functions
  replacing direct repair on panels/paint/underbody.
- T3: coherence: re-derived probes, updated Law 2/Law 3 inputs, regression tests for
  derivation, mismatch, harvesting, and the floor.
- T4: game: minimal UI adaptation, six zone rows under the body area with stage actions and
  the colour choice at paint; estimate/Confirm through the honest ledger; PartsMarket
  materials shelf and zone-panel listings.
- T5: `SAVE_VERSION` 46 to 47; old saves wipe (directive 19).

All player-facing copy in T4 is authored by the maintainer's reviewer (me), not by agents.

## Definition of done

- [x] Paint can never be removed (derived finish, no removable part); panels removed from a
      zone exist in inventory; every pipeline stage runs through staged work and the honest
      ledger.
- [x] `panels` / `paint` / `underbody` bands are derived (single-writer projection in
      `bodyPipeline.ts`), never stored independently; generation rolls zones and the floor
      holds through derived bills.
- [x] The aftermarket paint SKUs are retired; the kit family carries the migrated six at
      their own bases (prices unchanged); zone panels and materials are purchasable; the
      stock body carriers are delisted, not deleted.
- [x] All coherence obligations green, gate re-pinned once with citation.

## Exit

- [x] Lever table signed by the maintainer before any implementation agent launched (rulings
      recorded in the lever table above, in session).
- [x] Narrow checks run once, output recorded here. Final state:
      `pnpm test --project sim`: 57 files, 1417 tests passed.
      `pnpm test --project content`: 133 tests passed.
      `pnpm test --project game`: 57 files, 718 tests passed.
- [ ] Pre-push gate output cited at commit

Notes recorded at completion:

- Coherence re-derived and green at the signed values: Law 2 worst bill/clean 0.567
  (<= 0.60 ceiling), Law 3 consumables-with-materials 0.127 (<= 0.15), Law 1 flip margin
  positive on every model. Law 2 and the flip margin sit tighter than before the rework;
  flagged for the post-rework tuning pass, not touched (they pass at signed values).
- `the-showroom-standard` payout/budget bumped 1,200,000 -> 1,231,000 (maintainer choice,
  in session): its original figure was formula-derived from sport body-part grades that the
  rework retired; the honest replacement recipe re-derives to 1,231,000, so the payout was
  bumped to keep the mission formula-exact. Approval gate re-pinned; recorded in the economy
  bible amendment log.
- The golden-master career hash was re-pinned as an intentional change (case (a)): zone
  state now shapes every generated lot from day one, and the scripted day-1 body repair no
  longer touches the derived body parts.
- Twenty fixed-seed auction-room tests were re-derived (test-only): adding zone-rolling to
  generation advanced the seeded PRNG stream, shifting every downstream fixed-seed draw to a
  different but valid deterministic outcome; each was verified against the real component to
  still satisfy its structural invariant (price bounds, monotonic thinning, danger-marking).
- Deferred to `TODO.md`: teaching generation to roll the migrated body kits onto modified
  cars (the family now carries several SKUs per grade; generation still rolls one canonical
  kit per grade).
