# Sprint 44 - Constant part costs: revert tier scaling, derive repair from price

**Source:** maintainer rejection of Sprint 41's tier-scaled repair costs (2026-07-13, immediately
after Sprint 41 landed): "we should probably not be scaling component costs per car. They should
probably be constant... The first thing I want to do is just to start by reducing the cost of all
of the parts across the board." Plus the review finding that forced the rethink: the donor-car
repair arbitrage (host-car tier scaling + freely transferable parts = launder an expensive car's
worn parts through a kept shitbox at 0.12x). **Executes before Sprint 43** (tool wall), which is
unaffected.

**Maintainer decisions (2026-07-13, all locked):** costs are constant per component, never scaled
by the host car; all part prices cut across the board (anchor complaint: cheapest brake pads
Y20,000 while a whole car can hammer at Y18,000); repair cost is DERIVED - one global fraction of
the part's own price per grade - replacing the authored `stepCostYen` table entirely.

## Reuse analysis (directive 16)

**New mechanisms:**

- `restoration.repairStepFraction` (one global knob, economy.json) - repair cost per grade =
  `round(fraction x the installed part's own catalog priceYen)`.
- A full price rebase of the parts catalog (content values only).

**Existing mechanisms reused (and Sprint 41 pieces that STAY):**

- `bands.ts` remains the ONE cost pipeline; this sprint swaps its cost basis (authored step ->
  derived fraction-of-price) inside the same functions. No second formula anywhere.
- KEEP from Sprint 41: `repairable: false` consumables (tyres/pads/clutch) and all their UI/plan
  semantics, `canRepair(band, entry)`, the template conversions, the condition-panel readability
  pass, the group-picker repairable-floor fix, the DRY'd `serviceJobCostBreakdown`, both
  integrity-guard patterns.
- REVERT from Sprint 41: `restoration.partsCostFactorByTier` (schema + json + `restorationCostFactorForTier`
  + every factor parameter threaded through the pipeline and its callers). The bench-recondition
  `BENCH_REPAIR_COST_FACTOR = 1` special case dies with it - a part's repair price is intrinsic to
  the part, so bench and on-car price identically, coherently.
- Payout derivation (`deriveServiceJobPayoutYen`) and the 1.2x profitability floor are untouched -
  they consume the pipeline, so the rebase flows through automatically.
- Save law: no state shape change (all derived/content) - no Dexie bump. Golden hashes re-pin
  (cash flows change).

## Decisions

### 1. Derived repair cost (replaces stepCostYen)

- `economy.json`: `restoration.repairStepFraction: 0.15` (tuning bait; "repairs feel wrong
  globally" = move ONE number).
- Repair cost per grade = `round(repairStepFraction x catalogPart.priceYen)` where `catalogPart`
  is the INSTALLED instance's own catalog part - a race turbo repairs at race prices, a stock
  damper at stock prices, wherever the part sits and whoever owns the car. Worn -> mint (2
  grades) therefore costs ~30% of a new part: repair-vs-replace is a real decision on every slot.
- `stepCostYen` is DELETED from the taxonomy (schema + all 29 data entries). Anything else
  reading it re-derives: check `scrapValueYen` (if it read stepCostYen, re-base it on a fraction
  of `stockReplacementPriceYen`; disclose the choice).
- Labor is untouched: `slotsNeededToClimb(grades, toolTier)` as today.
- Bill composition per part (all flat, never host-scaled): repairable installed part below target
  -> grades x fraction x its own priceYen; scrap -> its stockReplacementPriceYen; missing slot ->
  stockReplacementPriceYen; non-repairable consumable below fine -> stockReplacementPriceYen, at
  fine/mint -> 0.

### 2. The across-the-board price rebase (content, maintainer-eyeballed)

Stock replacement prices (taxonomy `stockReplacementPriceYen` AND the matching `parts.json` stock
rows - they must stay equal; the existing integrity check enforces it). Aftermarket rows for each
slot scale PROPORTIONALLY with their stock sibling (grade markups preserved), so the whole
catalog moves together.

| Part | Old | New | | Part | Old | New |
|---|---|---|---|---|---|---|
| block | 350,000 | 160,000 | | dampers | 50,000 | 26,000 |
| internals | 220,000 | 90,000 | | springs | 25,000 | 14,000 |
| headValvetrain | 150,000 | 70,000 | | antiRollBars | 20,000 | 12,000 |
| camsTiming | 80,000 | 30,000 | | steering | 45,000 | 22,000 |
| intake | 35,000 | 15,000 | | brakePadsDiscs | 20,000 | 8,000 |
| exhaust | 45,000 | 25,000 | | brakeCalipersLines | 40,000 | 18,000 |
| fuelSystem | 40,000 | 18,000 | | rims | 55,000 | 30,000 |
| ignitionEcu | 45,000 | 20,000 | | tyres | 35,000 | 22,000 |
| cooling | 30,000 | 14,000 | | panels | 60,000 | 28,000 |
| forcedInduction | 180,000 | 90,000 | | paint | 80,000 | 40,000 |
| gearbox | 250,000 | 110,000 | | underbody | 50,000 | 24,000 |
| clutch | 60,000 | 28,000 | | aero | 40,000 | 18,000 |
| differential | 120,000 | 55,000 | | seats | 95,000 | 35,000 |
| driveline | 70,000 | 30,000 | | dashGauges | 30,000 | 12,000 |
| chassis | 300,000 | 130,000 | | | | |

Catalog sum 2,620,000 -> ~1,194,000. Resulting full uniformly-WORN bill at fraction 0.15:
~Y341k repair + Y58k consumable replacements = **~Y399k** (was Y1,048k), i.e. ~0.28x the median
car's book, ~0.09x the Supra's.

**Consequence stated openly (accepted):** a UNIFORMLY worn shitbox (City, book 180k) is still a
write-off at full restoration - that is intended fiction (a truly worn-out kei car IS a parts
car). The viable cheap-car play is triage: patch the worst groups to `fine` (one grade, only bad
groups - tens of thousands of yen), flip. A stock-parts expensive car is now CHEAP to restore
relative to its value; its gate is auction capital, and expensive restoration re-enters via
modded/pre-installed-aftermarket cars (existing TODO.md item). Repairing aftermarket parts is
properly expensive via decision 1.

### 3. Lift the bottom of the car market

The "whole car for Y18,000" hammer = value floor x 50% reserve compounding on floored cars. With
bills ~2.6x smaller, worn values rise off the floor organically; additionally `floorFraction`
0.15 -> 0.22 (first pass). `AUCTION_RESERVE_PRICE_FRACTION` stays 0.5. Disclose the resulting
p10 hammer prices from the harness's auctionWins data in Exit; further movement is playtest
tuning, not this sprint.

### 4. Cleanup

- TODO.md: retire the donor-car-arbitrage item (root cause removed) and rewrite the Sprint 41
  City-overshoot note if the new numbers change its framing (recompute the bill-vs-book table).
- sprint41.md gets a one-line pointer in its Exit: tier scaling superseded by Sprint 44 (do not
  rewrite history, just point forward).

## Tasks

1. Content: economy schema/json (`repairStepFraction`, remove `partsCostFactorByTier`,
   `floorFraction` 0.22); taxonomy schema/data (delete `stepCostYen`); parts.json full rebase
   (proportional per slot); integrity tests updated (drop factor-map guard, add: every stock row
   still equals its taxonomy price; repairStepFraction present and in (0,1)).
2. Sim: swap the pipeline's cost basis to derived-from-price; remove all factor threading and the
   bench special case; re-point scrapValueYen if needed.
3. Tests: derived-cost math (stock vs aftermarket part on the same slot repair differently; bench
   recondition equals on-car repair price for the same instance); update everything that asserted
   factor-scaled or stepCost-based numbers; golden re-pins documented.
4. Verification: full gate; balance harness (hard invariants must pass; disclose informational
   numbers + the new bill-vs-book table for City/EG6/AE86/Supra + auction p10 hammer); fill Exit.

## Definition of done

- No cost anywhere depends on the host car's identity/tier; the donor-car arbitrage is
  structurally impossible (same part = same repair price everywhere, bench included).
- stepCostYen no longer exists; repair costs derive from part prices via one knob.
- Cheapest consumables land under Y10k; the maintainer's pads-vs-whole-car inversion is gone.
- Harness hard invariants pass; payout profitability floor still structurally holds.

## Exit

(filled at completion)
