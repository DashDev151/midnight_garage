# The Economy Bible

*Canonical rules for all economy design in Midnight Garage. Locked with the maintainer
2026-07-14 during the Economy Rebuild arc (Sprints 53-55), triggered by a playtest that found the
core repair loop paying a net loss on the exact play it should reward. Every sprint, feature, or
tuning change that touches car value, repair cost, or parts pricing MUST be checked against this
document before implementation. Deviating from it is a bug, not a creative choice. Amendments
require explicit maintainer approval recorded here with a date. No em dashes anywhere in this file
or anything derived from it (CLAUDE.md directive 15).*

## The fantasy is the spec

You find a wreck nobody wants, you make it good, you sell it for more than you put in. **Repairing
a car and improving its condition must almost always be profitable.** Every economy formula is
judged against that sentence. A formula that makes the core loop a trap, however well-intentioned
its individual pieces, is a bug, not a balance choice.

Deliberate anti-realism, stated openly: in 1995 reality a worn-out kei car IS a write-off, not
worth fixing. The game's fantasy is profitable restoration regardless of where a car starts. The
economy serves the fantasy, not the other way around.

## The diagnosis that produced this document (2026-07-14)

A maintainer playtest bought a Y3,868 shitbox (Honda City E (AA), 1983, 116,226 km, every group
`poor`), spent Y45,000 on real triage repairs and consumable replacement, and watched the car's
guide value not move at all - net Y41,133 in the red. Four stacked causes, all traced to live code
at the time:

1. **A flat, tier-blind parts catalog priced against a 23x car-value ladder.** One global parts
   price list served every car regardless of value tier, so a cheap car's full restoration bill
   could run 2-4x its own restored ceiling - not an edge case, the norm for the cheapest tier.
2. **A silent regression collapsed the value floor 4.4x** (`floorFraction` 0.22 quietly became
   `scrapValueFraction` 0.05 during a formula rewrite, with no re-tune discussion). A damaged car's
   guide value sat pinned to a near-zero floor through the first ~Y55,000-95,000 of repair spend,
   producing exactly zero visible feedback for real work.
3. **A guaranteed-loss zone even without the floor.** Above a threshold, the value formula
   discounted every repair yen at a 60% loss rate - structurally negative return on the majority
   of any damaged car's repair range.
4. **No trap guard at generation.** The auction rolled per-part condition with zero check against
   whether the resulting car could ever be restored profitably - value-trap lots were the norm,
   not the exception, at the only tier a new player can afford.

Full arithmetic trace: `docs/sprints/sprint53.md`'s Diagnosis section (this bible condenses it;
that sprint doc is the historical record).

## The four laws

1. **Repair margin (Law 1).** The marginal value returned per repair yen is >= 1 at every
   reachable state of every car - first-pass 1.2 (buyers pay a premium for done-ness; the hassle
   premium is the flipper's edge). No zone anywhere with slope < 1. *Litmus: can a maintainer point
   to any car, any damage state, where spending a repair yen returns less than a yen of value? If
   yes, the formula is wrong, not the maintainer's play.* (Sprint 54.)
2. **No value traps (Law 2).** Every car the game generates satisfies `worstCaseBill <=
   maxBillFraction x cleanValue` (first-pass 0.7) - buy at reserve, fully restore, sell at guide
   clears a positive margin on every generatable lot. Enforced at generation and as a closed-form
   invariant over the whole roster, forever. *Litmus: pick any lot ever generated - is full
   restoration mathematically capable of turning a profit?* (Sprint 54, guarded forever by
   Sprint 55.)
3. **Proportionate parts (Law 3).** Parts and repair costs scale with the car's fitment class, and
   cross-class arbitrage is physically impossible (a part that doesn't fit doesn't install) - so
   "brake pads cost twice the car" cannot exist by construction, not by tuning. *Litmus: does any
   single part's price approach or exceed a car it could plausibly be bolted to?* (Sprint 53.)
4. **One ledger, derived (Law 4).** Every yen number in the game is either a named anchor in one
   content sheet or a pure function of one; cross-price coherence is machine-checked on every
   change, not eyeballed. *Litmus: if two prices drifted apart, would a test catch it before a
   playtest does?* (Sprint 55.)

## Fitment classes (Sprint 53)

Four classes, deliberately identical to the existing roster tiers so every car already carries one
with zero mapping cost: `shitbox`, `common`, `uncommon`, `rare` (code identifiers; `gaisha`/`legend`
fold into `rare` until the roster grows past PoC scope and earns a real mapping). Player-facing
copy never shows a raw tier id - it uses the diegetic class names:

| Code | Player-facing name |
|---|---|
| `shitbox` | Kei & Compact |
| `common` | Family |
| `uncommon` | Sports |
| `rare` | Grand Touring |

Every component slot ships as four real, separately named catalog SKUs per quality grade (16 SKUs
per slot: 4 classes x 4 grades - stock/street/sport/race) - real, distinct store entries, never a
single part with a runtime price switch. Exactly one class's four SKUs fit any given car; the
install gate refuses a mismatch outright, sim-side, so there is no path around it. The existing
116-part catalog (pre-Sprint-53) is kept, unchanged in id, as the `common` class's SKUs - both to
preserve every historical save-migration test that resolves those exact ids, and because their
prices already sit at what the class system calls the baseline (`common` class factor = 1.0).

**Naming convention:** a SKU's `id`/`brand`/`name`/`grade` describe the part itself, identical
across all four classes of the same part+grade (e.g. `brand: "Hagane", name: "Stroker Kit"` is the
same string whether it's the kei, family, sports, or GT version) - the class lives in the SKU's own
`fitmentClass` field, not baked into the name string. The UI prefixes the diegetic class label at
render time ("Kei & Compact Hagane Stroker Kit"), so renaming a class ("Sports" -> "Performance")
or adding a fifth class later is a one-line content edit, never a 116-string rewrite.

## The centralised pricing sheet (Sprint 53)

Every SKU's price resolves at content-load time, not at authoring time, from `partPricing.json`:

    priceYen = override[skuId] ?? round100(baseCostYen[carPartId] x classFactor[class]
                                            x gradeFactor[grade] x globalFactor)

- `baseCostYen`: one number per part TYPE (29 entries, one per `CarPartId`) - what a stock-grade
  version of that part type costs at the `common`/family baseline. Extracted directly from the
  pre-Sprint-53 catalog's existing stock prices, so `common`-class stock prices are unchanged.
- `classFactors` (first-pass, tuning bait): `{shitbox: 0.25, common: 1.0, uncommon: 1.6, rare: 2.5}`.
- `gradeFactors` (first-pass, fitted to the pre-existing catalog's own ratios, tuning bait):
  `{stock: 1.0, street: 1.3, sport: 2.0, race: 2.8}`.
- `globalFactor`: one whole-market volume lever, starts at 1.0.
- `overrides`: a sparse `skuId -> priceYen` map that wins outright over the formula. Ships EMPTY;
  every entry is a deliberate, individually-justified maintainer decision, and Sprint 55's
  coherence report lists every active override plus flags any that drifts far from its derived
  price, so the list can never silently rot into a second hand-typed catalog.

**The tuning grammar this buys** (the whole reason this sheet exists): "everything's too
expensive" moves `globalFactor`; "brake pads specifically" moves one `baseCostYen` entry; "kei
parts too cheap" moves one class factor; "race parts should cost more" moves one grade factor;
"this one specific part is wrong" gets one override line. A whole-market rebalance is a handful of
multiplications, never a mass content edit.

A part-type's flat, un-classed **stock-replacement price** (what fills a genuinely empty or
scrapped slot) derives the same way, per class: it is simply that class's own stock-grade SKU
price - never a separately hand-authored number, so it can never drift from the catalog it
describes.

## The anchor inventory (Sprint 55 audit table)

Every yen number in content is either a hand-authored anchor below, or derived from one - the
`economy.json` top-level key set is machine-checked against this table
(`packages/content/tests/schemas.test.ts`'s "economy.json top-level anchors match the bible audit
table" - a new top-level field added to `economy.json` without a matching row here, or vice versa,
fails that test outright, rather than silently drifting).

**Hand-authored anchors** (change these and everything downstream recomputes):

| Anchor | Lives in | What it feeds |
|---|---|---|
| `bookValueYen` per model | `cars.json` | Clean value, and therefore every price in the game |
| `baseCostYen` / `classFactors` / `gradeFactors` / `globalFactor` / `overrides` | `partPricing.json` | Every catalog SKU's `priceYen`, every taxonomy entry's per-class stock-replacement price |
| `STARTING_CASH_YEN`, `WEEKLY_RENT_YEN`, `DOUBLE_PARKING_FINE_YEN` | `economy.json` | Career solvency pacing |
| `AUCTION_RESERVE_PRICE_FRACTION`, `AUCTION_BUYOUT_PREMIUM`, `AUCTION_WHOLESALE_FRACTION`, `AUCTION_BID_INCREMENT_FRACTION`, `AUCTION_QUIET_DAYS_TO_HAMMER`, `AUCTION_LOTS_PER_TIER`, `AUCTION_DURATION_*`, `AUCTION_FLASH_CHANCE`, `AUCTION_LONG_CHANCE_UNCOMMON_RARE`, `AUCTION_TRAVEL_FEE_YEN`, `AUCTION_DAILY_SPAWN_RATE`, `auctionInterest.*` | `economy.json` | The whole auction reserve/buyout/contestation model (`bidding.ts`, `auctions.ts`) |
| `restoration.repairStepFraction` | `economy.json` | Every repair-cost formula (`bands.ts`'s `costToMintYen` family) |
| `valuation.mileageFactorCurve`, `valuation.marketRepairDiscount` (Law 1), `valuation.partsRetention`, `valuation.genuinePeriodMultiplier`, `valuation.tasteSpread`, `valuation.walkAwaySpread` | `economy.json` | `marketValue.ts`'s guide-value formula |
| `marketPressure.*` | `economy.json` | Weekly market-heat drift (`marketHeat.ts`) |
| `statFormulas.*` | `economy.json` | Derived car stats (`derivedStats.ts`) and buyer taste normalization |
| `bands.bandFactors`, `bands.migrationThresholds`, `bands.scrapValueFraction` | `economy.json` | The condition-band model and its save-migration mapping |
| `partsGeneration.*` including `maxBillFraction` (Law 2) | `economy.json` | Car generation (`auctions.ts`'s `generateAuctionCarInstance`/`enforceMaxBillFraction`) |
| `reputation.*` | `economy.json` | Clean/concours sale-quality bars and bonuses |
| `serviceJobs.marginMin`/`marginMax`/`laborRateYen`/`calloutFeeYen`/`dailyOfferCountWeights`/`offerCountCapByDay` | `economy.json` | Service-job payout derivation (Law 4's payout-sanity check) |
| `selling.*` including `offerSpread` | `economy.json` | Walk-in sale offers |
| `toolCeilings.*`, `specialty.*`, `machineListings.*` | `economy.json` | Progression-bible mechanics (out of this bible's scope, listed for completeness) |
| `coherence.maxConsumablesShareOfBookValue` (Law 3) | `economy.json` | The roster-coherence consumables-share check |

**Derived** (never edit directly; edit the anchor that feeds them):

- Every SKU's `priceYen` and every taxonomy entry's per-class stock-replacement price (Sprint 53) -
  `resolvePartPriceYen`/`data.ts`.
- Repair/restoration bills (`bands.ts`'s `costToMintYen` family) - a fraction of the INSTALLED
  part's own resolved price, never the host car's identity (Sprint 44's anti-arbitrage law,
  preserved).
- Guide/market value (`marketValue.ts`) - clean value minus a repair-margin-scaled bill discount
  (Sprint 54).
- Auction reserve, buyout premium, service-job payouts - all fractions or margins over guide value
  or task cost, never independently authored.
- The roster-coherence table below (Sprint 55) - every column is a live call into the real sim
  functions (`coherence.ts`), never a hand-computed number.

**Per-SKU price overrides** (`partPricing.json`'s `overrides` map): ships EMPTY. Any future entry
is a deliberate, individually-justified maintainer decision; the balance report's roster-coherence
section is the place a drifted override would first become visible (no override is active as of
Sprint 55, so there is nothing yet to flag - the machinery is proactive, not reactive).

## The roster-coherence machine check (Sprint 55, Law 4 fully in force)

`packages/sim/src/coherence.ts`'s `computeRosterCoherence` derives, per roster model, by calling
the real sim functions directly (never re-deriving their math):

- **Clean value** and the **worst plausible restoration bill** a car of this model could carry
  AFTER the Law 2 generation guard has softened it (`enforceMaxBillFraction`, stress-tested against
  every real slot at `scrap`, at the roster's worst reachable mileage).
- **Bill-to-clean ratio** - must stay `<= partsGeneration.maxBillFraction` for every model (Law 2).
- **Flip margin** - buy at reserve off the worst-bill lot's own damaged guide value, pay the worst
  bill to fully restore, sell at guide (= clean value, Law 1's structural ceiling); must stay
  positive for every model (Law 1).
- **Consumables share** - the full tyres+brakePadsDiscs+clutch replacement cost at the model's own
  class, as a fraction of book value; must stay under `coherence.maxConsumablesShareOfBookValue`
  (Law 3's direct "brake pads vs car price" guard).

All four render as a per-model table in `tools/balance/report.md` (`pnpm balance:run` then
`python -m balance.cli report`) and hard-gate `python -m balance.cli check`
(`tools/balance/src/balance/invariants.py`) - a maintainer can eyeball the whole roster's economy on
one page, and a regression fails the build, not just a playtest. A fifth check (payout sanity, Law
4) confirms `serviceJobs.marginMin` still clears the profitability invariant's required coverage;
the full per-template/per-model proof remains `packages/sim/tests/serviceJobPayout.test.ts`
(Sprint 29), already gated in the standard test suite - this sprint's check is the one-line
structural confirmation, not a re-derivation.

This closes Law 4: every anchor is named, every derived number is a live function call, and a
maintainer or CI run can catch a coherence drift before a playtest does.

## Amendment log

- 2026-07-14: document created; Law 3 and the fitment-class/pricing-sheet system implemented
  (Sprint 53). Laws 1 and 2 designed, implementation pending (Sprint 54). Law 4's full machine-
  checked audit designed, implementation pending (Sprint 55).
- 2026-07-14: Laws 1 and 2 implemented (Sprint 54). `marketValueYen` now discounts the SAME
  mint-referenced bill the player sees ("restoration bill remaining") at one flat rate,
  `valuation.marketRepairDiscount` (1.2) - the two-slope premium, the separate fine-referenced
  `carValuationBillYen`, and `mintGapWeight` all retired. `partsGeneration.maxBillFraction`
  (0.7) is the generation-time guard `auctions.ts` softens every rolled car against, so Law 2
  holds for every generatable lot, not just as a formula property. Four acceptance-probe
  families added to `packages/sim/tests/valueModelProbes.test.ts`: the Honda City probe (the
  exact playtest regression), a full-restore-per-tier probe, a no-free-lunch probe, and a
  ceiling probe proving a fully restored car is worth exactly clean value, never more.
- 2026-07-14: Law 4 implemented (Sprint 55), closing the Economy Rebuild arc. The anchor
  inventory above is now a complete audit table, machine-checked against `economy.json`'s real
  top-level key set (`packages/content/tests/schemas.test.ts`). `computeRosterCoherence`
  (`packages/sim/src/coherence.ts`) derives four closed-form facts per roster model by calling
  the real Law 1/Law 2 sim functions directly - bill-to-clean ratio, flip margin, and
  consumables share all render as a per-model table in `tools/balance/report.md` and hard-gate
  `python -m balance.cli check`; a fifth check confirms the service-job payout margin floor
  still clears its profitability invariant. A new `coherence.maxConsumablesShareOfBookValue`
  (0.15) anchor is the content-tunable cap Law 3's consumables check gates against. The sprint's
  own retune pass (decision 3), applied once the re-measured auction/walk-in numbers under the
  new laws showed a real problem: `AUCTION_WHOLESALE_FRACTION` 0.85 -> 0.75 (the historical
  84%-steal fire sale had flipped into a 36.1%-frenzy problem once Sprint 54's gentler value law
  raised anchorValueYen enough that the unchanged contestation rules overshot it) and
  `selling.offerSpread` `[0.82, 1.12]` -> `[0.90, 1.08]` (closing the tail risk where a bad
  walk-in roll could erase the worst-case flip margin the Law 2 guard still permits, without
  breaking Sprint 54's no-free-lunch invariant). Book values and the mileage-curve floor stayed
  untouched - the coherence table showed no model out of line at either. Full before/after
  harness numbers in `docs/sprints/sprint55.md`'s Exit.
