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

### Files touched

Content:
- `packages/content/src/carPart.ts` - `repairable: z.boolean().default(true)` on `CarPartTaxonomyEntrySchema`.
- `packages/content/src/economy.ts` - new `restoration.partsCostFactorByTier` schema block (4 required keys).
- `packages/content/data/parts-taxonomy.json` - `repairable: false` on `tyres`, `brakePadsDiscs`, `clutch`.
- `packages/content/data/economy.json` - `restoration.partsCostFactorByTier`; `valuation.hassleFactor` 1.2 -> 0.8; `valuation.floorFraction` 0.1 -> 0.15.
- `packages/content/data/serviceJobTemplates.json` - 7 repair tasks across 6 templates converted to install tasks (`brake-pads-service`, `brake-system-overhaul`, `tyre-fit-and-balance`, `tyres-and-pads-service` x2, `staggered-setup`, `shaken-prep`, `show-fitment-program`).
- `packages/content/tests/integrity.test.ts` - 2 new guard tests (factor-map completeness against the roster; no repair task on a non-repairable part).
- `packages/content/tests/schemas.test.ts` - updated `hassleFactor`/`floorFraction` expectations; new `partsCostFactorByTier` assertion.

Sim:
- `packages/sim/src/bands.ts` - `canRepair(band, entry)` extended; new `restorationCostFactorForTier`; `costToMintYen`/`carCostToMintYen`/`groupCostToMintYen`/`planPartRepair`/`planGroupRepair` all gained a `factor`/`economy` parameter; new `worstRepairableBandInGroup` (coordinator fix).
- `packages/sim/src/jobs.ts` - `completeReconditionJob` now takes `context` (repairable lookup); `repairJobGate` resolves the real car's tier factor; `planReconditionPart` prices bench work at a documented neutral factor of 1 (no car to scale by).
- `packages/sim/src/stagedWork.ts` - `confirmStagedWork`'s repair branch resolves the car's tier factor.
- `packages/sim/src/serviceJobs.ts` - `serviceJobCostBreakdown`'s repair branch now calls `planPartRepair` directly (removed a second, hand-rolled cost formula) with the car model's resolved factor.
- `packages/sim/src/marketValue.ts` - `instanceBaseValueYen` passes `economy` into `carCostToMintYen`.
- `packages/sim/src/bots/bandHelpers.ts`, `bots/serviceJobHelpers.ts`, `bots/cautiousRestorer.ts` - all `planGroupRepair`/`carCostToMintYen` call sites resolve and pass the real car's tier factor.

Game:
- `packages/game/src/stores/gameStore.ts` - `CarPartRowView.repairable`; `CarDetail.groupBillYen`/`totalBillYen`; new `groupRepairFloorBand`/`isPartRepairable`; `repair()`/`lotDetail()`/`carDetail()` thread the resolved tier factor/economy.
- `packages/game/src/screens/CarDetailScreen.vue` - worst-first group ordering, fine/mint parts collapse behind a per-group "+N parts in good order" toggle, per-group and total bill lines, per-part repair row hidden for non-repairable parts, the group `BandPicker`'s `current-band` now uses `groupRepairFloorBand` instead of the raw (scrap-inclusive) display band.
- `packages/game/src/components/PartCard.vue` - recondition control hidden for a non-repairable loose part.

Tests (game): `packages/game/src/screens/CarDetailScreen.test.ts`, `packages/game/src/components/PartCard.test.ts`.

Tests (sim): `packages/sim/tests/bands.test.ts`, `packages/sim/tests/jobs.test.ts`, `packages/sim/tests/stagedWork.test.ts`, `packages/sim/tests/marketValue.test.ts`, `packages/sim/tests/serviceJobPayout.test.ts`, `packages/sim/tests/serviceJobs.test.ts` (the old cross-group two-repair-task fixture, `tyres-and-pads-service`, converted to install tasks this sprint - repointed at `suspension-refresh`, the remaining real two-repair-task template, with the one genuinely cross-group case moved onto `put-her-in-a-ditch`), `packages/sim/tests/restorationPacing.test.ts`, `packages/sim/tests/advanceDay.test.ts` (2 golden hashes re-pinned), `packages/sim/tests/bots/runCareer.test.ts` (2 statistical-probe tests newly needed the file's own established coverage-timeout idiom, `BOOTSTRAP_SAMPLE_TIMEOUT_MS`/`REPUTATION_SAMPLE_TIMEOUT_MS`, at 200/100 seeds each - Sprint 41's extra per-repair arithmetic tipped two already-borderline loops over vitest's 5s default under `pnpm test:coverage`'s v8 instrumentation).

### Verification (real output)

`pnpm typecheck` - clean (content, sim, game all `Done`).
`pnpm lint` - clean, exit 0.
`pnpm format` - clean after `pnpm format:fix` (Prettier reformatted the files this sprint touched).
`pnpm test` - 846/846 passed, 73/73 files.
`pnpm test:coverage` - 846/846 passed; thresholds cleared (gate: statements 80/branches 65/functions 78/lines 82):
  - Statements 90.57% (3699/4084), Branches 79.76% (2022/2535), Functions 90.94% (824/906), Lines 94.44% (3248/3439).
`pnpm build` - clean, `vite build` succeeds (974 modules transformed).

### Golden hash re-pins

Repair costs feed every career's cash flow, so both golden-master hashes in `packages/sim/tests/advanceDay.test.ts` moved. Every other assertion in that file (cash deltas via `planGroupRepair`'s own real plan, part installs, catalog refresh) still passes against the same scripted 30-day career and the same seeded acquisition-and-sale career, confirming the drift is cash-flow-only, not a logic break:
- `a scripted 30-day career reproduces an exact state hash`: `7a495efd` -> `ad88a86b`.
- `reproduces an exact state hash (deterministic acquisition->sale)`: `8c2d16c4` -> `7317802d`.

### Balance harness (`pnpm balance:run` + `python -m balance.cli check`)

All hard-gated invariants PASS:
- Days-to-`local` (competent-policy probe): p50 in [10, 35] -> **p50=13.0 days** (883/1000 seeds reached `local`).
- Buyout share of acquisitions < 30% -> **0.0%** (49,570 total acquisitions).
- Passive Grinder solvency: day100 median cash Y1,220,000.
- Flipper-vs-Passive separation: flipper Y319,648 vs passive Y1,220,000 (diff Y900,352).
- Sanity floor: no strategy catastrophic (passive Y1,220,000, flipper Y319,648, restorer Y78,453, balanced Y414,014, random Y175,954).

Informational (not gated), disclosed honestly per the standing "a changed number is not a regression" rule:
- Every non-passive strategy's day-100 median cash is still below Passive Grinder's (unchanged pattern from prior sprints - not this sprint's finding to fix).
- Flipper day-100 median (Y319,648) is still below its own Y1,500,000 starting cash (unchanged pattern).
- Auction win-price tails: steal 19.6% (target 10-25%, now IN band - was 84% before Sprint 30's tuning pass), mid 48.3% (target 50-100%, just under), frenzy 32.1% (target 5-15%, over) - the frenzy tail is the one now outside its target band; not investigated further here, per the standing instruction not to deep-tune this sprint.
- days-to-tier: `local` p10/p50/p90 = 10/13/27; `known` 27/37/54 (818/1000 reached); `respected` 57/64/80 (795/1000 reached).

Sprint 41's own change shows up mainly as CHEAPER repair costs at low tiers pulling every repair-dependent number (days-to-local, cash trajectories) in a favorable direction versus the pre-Sprint-41 numbers cited elsewhere in this repo's history - expected, since shitbox/common-tier repairs (the tiers most bot careers spend early game on) now cost 0.12x/0.35x of the old flat rate.

### Worn-bill-vs-book table (DoD's required disclosure)

Uniformly-worn (every part at `worn`, 2 grades to mint) restoration bill vs. book value, computed from the real content (`parts-taxonomy.json` + `economy.json`) for one car per roster tier:

| Car | Tier (factor) | Book value | Worn bill | Bill/book |
|---|---|---|---|---|
| Honda City E (AA) | shitbox (0.12) | Y180,000 | Y235,240 | **1.307x** |
| Honda Civic SiR-II (EG6) | common (0.35) | Y650,000 | Y465,700 | 0.716x |
| Toyota Sprinter Trueno (AE86) | uncommon (0.8) | Y1,400,000 | Y916,600 | 0.655x |
| Toyota Supra RZ (JZA80) | rare (1.3) | Y4,200,000 | Y1,417,600 | 0.338x |

EG6/AE86/Supra land inside or just under the DoD's ~0.3-0.9x target band. **The City overshoots it (1.307x)**, disclosed honestly rather than force-passed: the flat, unscaled non-repairable replacement bucket (tyres + brakePadsDiscs + clutch stock replacement = Y115,000, per decision 1's deliberate "a gearbox costs what a gearbox costs" design) is by itself already 64% of the City's Y180,000 book value, and no repair-cost tier factor touches it. This is the same structural texture the sprint's own decision 1 flags as intentional for MISSING/scrap parts ("a missing or seized major part still totals it") extended to a merely-worn car once three catalog-flat consumables are added in - genuinely maintainer-tuning bait (lower the 3 `stockReplacementPriceYen`s, or give `partsCostFactorByTier.shitbox` more headroom) rather than a bug in the implementation.

For comparison, the value formula's own output on the same uniformly-worn fixtures (heat 100, neutral mileage, `value = max(floorFraction x clean, clean - hassleFactor x bill)`): City Y27,000 (0.150x, floor-clamped - the shitbox tier is still floor-bound at these first-pass numbers), EG6 Y277,440 (0.427x - clearly off the floor now, directly answering the playtest's own EG6 "70k car" complaint), AE86 Y666,720 (0.476x), Supra Y3,065,920 (0.730x).

### Deviations from the spec / notable calls

- `restoration.partsCostFactorByTier` covers exactly the 4 roster tiers (not `RarityTier`'s full 6-value enum) per the spec's explicit instruction; `restorationCostFactorForTier` throws at runtime for `gaisha`/`legend` (no roster car uses them yet), guarded by a new content-integrity test rather than a silent default.
- A loose bench part (in-inventory recondition) has no car to resolve a tier factor from - `jobs.ts`'s `planReconditionPart` prices it at a documented neutral factor of 1, unaffected by which car it came from or might return to. This is a real, intentional divergence from on-car repair pricing (a shitbox-tier car's on-car repair is now genuinely cheaper than reconditioning the identical part on the bench) - covered by `jobs.test.ts`'s updated "reconditioning and on-car repair" test, which asserts labor still matches exactly while cash legitimately differs.
- `serviceJobCostBreakdown`'s repair-task branch was refactored to call `planPartRepair` directly instead of re-deriving `grades * stepCostYen` inline - a pre-existing small DRY violation (directive 16) this sprint's factor-threading made worth closing rather than duplicating the scaling logic a second time.
- Coordinator-added scope: the group `BandPicker`'s `current-band` bug (fed the scrap-inclusive display band, letting a group with a scrap part next to a merely-worn one offer a dead `poor` repair target) is fixed via a new `worstRepairableBandInGroup` (bands.ts) / `groupRepairFloorBand` (gameStore.ts) pair, with 3 new bands.ts unit tests and the existing `groupNeedsRepair` gate narrowed to match.
- `tests/serviceJobs.test.ts`'s `twoRepairType` fixture (previously `tyres-and-pads-service`) had to be repointed at `suspension-refresh` (the only remaining real 2-repair-task template) since its old source converted to 2 install tasks this sprint; the one test that specifically needed a CROSS-group 2-task fixture (the offer-rule's "two deficient groups" case) was moved onto `put-her-in-a-ditch` instead, and 5 accept-flow tests needed an explicit tier-2 tooling grant added (suspension-refresh is tier 2, tyres-and-pads-service was tier 1).
- `tests/bots/runCareer.test.ts`: 4 statistical-probe tests (200/100-seed loops) newly exceeded vitest's 5s default under `pnpm test:coverage`'s v8 instrumentation - this file already had one prior instance of exactly this class of fix (`PAID_WORK_SAMPLE_TIMEOUT_MS`, with its own doc comment); the same idiom (an explicit per-test timeout, not a looser assertion) was applied to the 4 newly-affected tests.

### Needs maintainer attention (playtest/tuning, not a defect)

- The worn-bill-vs-book overshoot on the shitbox tier (City 1.307x, above the ~0.3-0.9x target) - a first-pass constant, not a bug; the two obvious levers are lowering the 3 non-repairable `stockReplacementPriceYen`s or the `shitbox` factor's relative headroom against them.
- The auction frenzy tail (32.1%, target 5-15%) remains outside its informational band - unrelated to this sprint's changes (an open item from Sprint 30's tuning pass), not investigated further here per the "disclose, don't deep-tune" instruction.
- TODO.md's two retired items (below) are now closed by this sprint's tier-factor + replace-only model; everything else in TODO.md is untouched.
