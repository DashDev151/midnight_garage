# Sprint 41 - The repair/replace economy: tier-scaled costs and true consumables

**Source:** `docs/playtest-notes-2026-07-13.md` items 3 and 6, maintainer decisions 3 and 4.
Goal: restoration costs that scale with the car's class (a kei car's wear is cheap to fix, a
Supra's is not), replace-only consumables (tyres, brake pads, clutch), a value formula that stops
collapsing every cheap worn car to its floor, and a readable condition panel.

**The measured problem (triage 2026-07-13):** full to-mint bill Y1,048,000 on a uniformly worn car
(Y1,572,000 poor) vs a roster of Y180k-Y4.2M book: 5.8x the cheapest car's book, 0.72x median,
0.25x the dearest. Value formula (`clean - 1.2 x bill`, floored at `0.1 x clean`) therefore floors
every cheap worn car (the playtest's "70k car" was a floored EG6, book Y650k). Every yen input is
flat across a 23x value range - structural, not a tuning nudge.

## Reuse analysis (directive 16)

**New mechanisms:**

- `partsCostFactorByTier` (content map, car tier -> multiplier) applied to repair step costs.
- `repairable: boolean` on the parts taxonomy; replace-only bill/UI/plan semantics.
- Template conversions (repair tasks on consumables become install tasks).

**Existing mechanisms that MUST be reused (no parallel formulas):**

- `bands.ts` is the ONE cost pipeline (`planPartRepair`, `costToMintYen`, `carCostToMintYen`,
  `groupCostToMintYen`): the tier factor threads through these existing functions as a parameter;
  no second bill implementation anywhere.
- `canRepair` (`bands.ts:46-48`) is the ONE repairability predicate - extend it with the taxonomy
  entry; every consumer (planners, UI, bots via `planGroupRepair`) inherits the flag for free.
- `serviceJobCostBreakdown` / `deriveServiceJobPayoutYen` derive payouts from the same cost
  pipeline - payouts auto-scale with the factor, structurally preserving the Sprint 29
  profitability invariant. No payout-side edits.
- `instanceBaseValueYen` (`marketValue.ts:75-88`) keeps its exact shape - only `hassleFactor` /
  `floorFraction` values move (content law: both already live in `economy.json`).
- Sprint 28's per-part Replace drawer is the replace-only parts' entire "fix me" flow - no new UI
  flow, the repair row simply gives way to the existing Replace CTA.
- The balance harness + hard invariants are the safety gate; `integrity.test.ts` is where the new
  content invariants live.

## Decisions

### 1. Tier-scaled repair costs (maintainer decision 3)

- `economy.json` gains `restoration.partsCostFactorByTier`: first-pass values
  `{ shitbox: 0.12, common: 0.35, uncommon: 0.8, rare: 1.3 }` (all four roster tiers must be
  present - schema-enforced record over the tier enum). Explicitly maintainer-tuning bait.
- The factor applies to REPAIR step costs only: `planPartRepair` cost becomes
  `grades x stepCostYen x factor` (rounded); `costToMintYen`'s repairable branch likewise.
- Replacement components stay FLAT: `scrap` parts, missing slots, and replace-only consumables
  price at un-scaled `stockReplacementPriceYen` (a gearbox costs what a gearbox costs at the parts
  market - and the catalog stays flat, so the bill stays honest about what filling a slot really
  costs). Deliberate texture: on a cheap car, wear is cheap to fix; a missing or seized major part
  still totals it. That is the intended fiction, not a gap.
- Threading: `planPartRepair`/`planGroupRepair`/`costToMintYen`/`carCostToMintYen`/
  `groupCostToMintYen` gain a factor (or model/economy) parameter; every caller passes the real
  car's model tier factor. Compile errors are the checklist of call sites (sim, gameStore views,
  bots' shared helpers).

### 2. Replace-only consumables (maintainer decision 4)

- Taxonomy: `repairable: z.boolean().default(true)`; set `false` for exactly `tyres`,
  `brakePadsDiscs`, `clutch`.
- `canRepair(band, entry)`: `band !== 'scrap' && entry.repairable`. Planners (`planPartRepair`,
  `planGroupRepair`) skip non-repairable parts exactly as they skip scrap today; bots inherit this
  through `planGroupRepair` with zero strategy edits.
- Bill semantics for a non-repairable part: band below `fine` -> flat `stockReplacementPriceYen`;
  `fine`/`mint` -> 0 (nearly-new consumables do not discount value; document the deliberate wrinkle
  that fine and mint consumables value identically).
- UI: for non-repairable parts the per-part repair row is hidden and the existing Replace CTA is
  the action; PartCard's recondition control is hidden for non-repairable loose parts (you cannot
  bench-recondition a tyre).
- Content integrity test: no service-job template may contain a `repair` task addressing a
  non-repairable `carPartId` (permanent guard).
- Template conversions: every existing repair task on tyres/brakePadsDiscs/clutch becomes an
  `install` task (`minGrade: 'stock'` unless the template's intent is clearly higher). Sprint 40's
  generation forcing already handles install-task collisions by clearing the slot, so "fit new
  tyres" jobs arrive with the slot genuinely empty (fiction: the old set is not worth keeping).

### 3. Value-formula retune

First pass: `hassleFactor` 1.2 -> 0.8, `floorFraction` 0.1 -> 0.15. With scaled bills this stops
the floor dominating cheap cars (sanity math: fully-worn City bill ~Y126k at 0.12 factor; value
~Y79k on Y180k clean instead of the floor). `AUCTION_RESERVE_PRICE_FRACTION` unchanged. Final
numbers are the harness sanity run + the maintainer's next playtest, not this sprint's job to
perfect (per standing instruction: clean and nothing obviously wrong; deep tuning later).

### 4. Condition panel readability (item 3's first half)

CarDetailScreen components column: groups sorted worst-first; parts at `fine`/`mint` collapsed
behind a "+N parts in good order" toggle per group; per-group bill line (existing
`groupCostToMintYen`, now scaled); one total-bill line. Reuse existing `BandChip`/row components -
this is layout and filtering, not new components.

## Tasks

1. Content: taxonomy `repairable` flag + data edits; `restoration.partsCostFactorByTier` in
   economy schema + json; template conversions; integrity tests (factor map covers every tier; no
   repair task on non-repairable parts).
2. Sim: `canRepair` extension; factor threading through the bands.ts pipeline and all callers;
   value retune values.
3. Game: replace-only UI behavior (repair row -> Replace CTA; recondition hidden); condition-panel
   readability pass; test updates.
4. Verification: full gate; balance harness run - hard invariants must pass, informational numbers
   disclosed in Exit with a worn-bill-vs-book table for City/EG6/AE86/Supra; golden hashes
   re-pinned (repair costs change cash flows, so they will move).
5. Docs: retire the two TODO.md items this supersedes (model-independent restoration costs;
   stepCostYen not scaling with part value - the tier factor + replace-only model is the answer to
   both); update this doc's Exit.

## Definition of done

- Worn-car restoration bill lands in a sane fraction of book value across all four tiers (target
  band ~0.3-0.9x book for a uniformly worn example; exact values disclosed, not force-passed).
- Tyres/pads/clutch cannot be repaired anywhere (planner, UI, bench) - only replaced.
- No service-job template addresses a repair to a non-repairable part (guard test).
- Balance harness hard invariants pass; payout profitability invariant still structurally holds.
- Condition panel: worst-first, good parts collapsed, scaled bills visible.

## Exit

(filled at completion)
