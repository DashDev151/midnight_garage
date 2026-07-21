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

## The laws

The Economy Rebuild arc (Sprints 53-55) locked four laws; Sprint 60 added a fifth (the
foundation law) and Sprint 66 a sixth (the wage law), both by explicit maintainer approval.
Sprint 66 also amended Laws 1 and 5. See the Amendment log for all of it.

1. **Repair margin (Law 1).** *Amended Sprint 66 - see the Amendment log. The clause below is the
   law as it now stands; the pre-Sprint-66 text is kept in the log as history.*

   Every car has a **market expectation band** set by its tier (`valuation.expectationByTier`):
   the condition the market actually expects of that kind of car. The law has two clauses either
   side of it.

   - **Below the expectation band, the return is >= 1 at every reachable state of every car,
     absolutely and by construction** (`valuation.marketRepairDiscount`, first-pass 1.5 - buyers
     pay a premium for done-ness; the hassle premium is the flipper's edge). No zone anywhere with
     slope < 1. Making a car roadworthy always pays, on every tier, at every damage state. This is
     the original law, intact, over the range where it was ever really about protecting the player.
   - **Above the expectation band, the return is per-tier (`beyondDiscount`) and MAY fall below
     1 - deliberately.** It is not worth restoring a shitbox kei to mint; it IS worth building a
     sports car into something special. The point of diminishing return is higher on a better car.
     Above the line the player is knowingly spending on passion rather than investing.
   - **The legibility clause, which is part of the law and not a nicety:** work planned above the
     expectation band must be marked as passion spend on the car page, in the same breath as its
     cost. A value trap is one you cannot see. A disclosed, optional money-loser is a choice; an
     undisclosed one is the Sprint 47 bug wearing a new hat.

   `beyondDiscount <= marketRepairDiscount` is schema-enforced, so the second clause can only ever
   be gentler than the first, never steeper - which also keeps the (D, F) interlock (Law 2) safe
   rather than weakening it.

   *Litmus: can a maintainer point to any car, at any damage state BELOW its expectation band,
   where spending a repair yen returns less than a yen? If yes, the formula is wrong, not the
   maintainer's play. And above the band: does the car page tell the player they are spending for
   love rather than money? If not, the formula is fine but the screen is lying.* (Sprint 54,
   amended Sprint 66.)
2. **No value traps (Law 2).** Every car the game generates satisfies `worstCaseBill <=
   maxBillFraction x cleanValue` (0.6 since Sprint 66, formerly 0.7) - buy at reserve, fully
   restore, sell at guide clears a positive margin on every generatable lot. Enforced at
   generation and as a closed-form invariant over the whole roster, forever.
   **`marketRepairDiscount x maxBillFraction` must stay below 1** (0.90 today): above 1, the worst
   generatable car's value falls through the `scrapValueFraction` floor and this law's guarantee
   dies. The two move together or not at all. *Litmus: pick any lot ever generated - is full
   restoration mathematically capable of turning a profit?* (Sprint 54, guarded forever by
   Sprint 55, interlock recorded Sprint 66.)
3. **Proportionate parts (Law 3).** Parts and repair costs scale with the car's fitment class, and
   cross-class arbitrage is physically impossible (a part that doesn't fit doesn't install) - so
   "brake pads cost twice the car" cannot exist by construction, not by tuning. *Litmus: does any
   single part's price approach or exceed a car it could plausibly be bolted to?* (Sprint 53.)
4. **One ledger, derived (Law 4).** Every yen number in the game is either a named anchor in one
   content sheet or a pure function of one; cross-price coherence is machine-checked on every
   change, not eyeballed. *Litmus: if two prices drifted apart, would a test catch it before a
   playtest does?* (Sprint 55.)
5. **The foundation law (Law 5).** A car's aftermarket premium (the retained value of every
   installed street/sport/race part) is credited only in proportion to its worst FOUNDATIONAL
   part - safety and structure (brakes, tyres, steering, chassis, rust), not performance. One
   deathtrap element (a scrap brake, a missing tyre, a rusted-through underbody) withholds almost
   all of the premium, no matter how expensive the toys bolted on top are; the single worst
   foundational part governs, never an average (chrome can never buy back trust a real buyer
   would refuse). This gates ONLY the add-on premium - the base value (clean minus the
   restoration bill) is untouched, so Law 1 holds unchanged AND repairing a failed foundational
   part returns its own repair value PLUS the released premium (foundations first, then the toys
   count). The multiplier is never above 1, so the law only ever withholds, never inflates.
   *Litmus: does a build with an expensive engine but neglected brakes profit the same as a sound
   one? If yes, the formula is wrong.* (Sprint 60, amended Sprint 66.)

   *Amended Sprint 66 - see the Amendment log.* The premium is additionally scaled by a per-tier
   `aftermarketReturn` (`valuation.expectationByTier`) - the same diminishing-returns idea Law 1
   now carries, applied to the toys rather than the repairs. A race turbo on a kei returns a
   fraction of its cost; on a rare car it returns all of it. Two multipliers on one term, each
   answering a different question: `foundationFactor` asks *would a buyer trust this car at all*,
   `aftermarketReturn` asks *is this the kind of car anyone pays extra to modify*. Both are capped
   at 1 and both only ever withhold, so Law 5's "never inflates" property is unchanged.

   The maintainer's worked example this law exists to fix (2026-07-14): buy a cheap kei truck;
   leave the brakes stock and worn, the body peeling and rusted; but fit an expensive race turbo,
   a race engine, and the priciest cosmetics. Under the pre-Sprint-60 additive formula this build
   turned a real profit. Under Law 5 it loses money end to end - the parts were bought at full
   catalog price but credited at ~8% of it while the foundations stay neglected.

6. **The wage law (Law 6).** A day at the bench must out-earn a day of standing still. Stated
   checkably: for every roster model, `profit(buy -> repair -> sell) - profit(buy -> sell as-is)`
   exceeds the rent accrued over the labour days that repair takes - measured at the car's own
   **expectation band** (Law 1), never at mint, because mint is not the repair a sane player
   performs on a kei. Both plays start from the same purchase price, so the bidding discount is
   common to both and cancels; repair's advantage is exactly `(marketRepairDiscount - 1) x
   repairCost` on top of it. That product IS the wage: a repair's cash cost and the bill reduction
   it buys are identical by construction (both are `repairStepFraction x partPriceYen`), so the
   discount rate above 1 is the entire return. *Litmus: is a day at the bench worth more than a
   day doing nothing?* Hard-gated per model in `computeRosterCoherence`. (Sprint 66.)

   This is the law the 2026-07-15 playtest was actually asking for, and the one Law 1 (slope >= 1)
   was too weak to deliver: at the pre-Sprint-66 1.2, ten yen of work bought two yen of margin,
   which is what the maintainer felt as "I have done a lot of work and the projected profit barely
   moved". Law 1 held the whole time. It was simply never a promise worth anything.

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
| `energy.*` (`pointsPerLabour`, `basePoolPoints`, `energyPerGradeByTier`, `energyByClass`, `actionPoints.*`) | `economy.json` | The whole labour economy: the day's pool, repair/install labour, and every physical action's own labour figure (`actionPoints`, one key per action, zero = free at current tuning) - the single tuning location for labour costs |
| `AUCTION_RESERVE_PRICE_FRACTION`, `AUCTION_BUYOUT_PREMIUM`, `AUCTION_WHOLESALE_FRACTION`, `AUCTION_BID_INCREMENT_FRACTION`, `AUCTION_BID_INCREMENT_STEP_YEN`, `AUCTION_QUIET_DAYS_TO_HAMMER`, `AUCTION_LOTS_PER_TIER`, `AUCTION_DURATION_*`, `AUCTION_FLASH_CHANCE`, `AUCTION_LONG_CHANCE_UNCOMMON_RARE`, `AUCTION_TRAVEL_FEE_YEN`, `AUCTION_DAILY_SPAWN_RATE`, `auctionInterest.*` | `economy.json` | The whole auction reserve/buyout/contestation model (`bidding.ts`, `auctions.ts`) |
| `restoration.repairStepFraction` | `economy.json` | Every repair-cost formula (`bands.ts`'s `costToMintYen` family) |
| `valuation.mileageFactorCurve`, `valuation.marketRepairDiscount` (Law 1), `valuation.partsRetention`, `valuation.genuinePeriodMultiplier`, `valuation.tasteSpread`, `valuation.walkAwaySpread`, `valuation.foundation` (Law 5) | `economy.json` | `marketValue.ts`'s guide-value formula (`valuation.foundation` scales the aftermarket premium by the worst foundational part) |
| `marketPressure.*` | `economy.json` | Weekly market-heat drift (`marketHeat.ts`) |
| `statFormulas.*` | `economy.json` | Derived car stats (`derivedStats.ts`) and buyer taste normalization |
| `bands.bandFactors`, `bands.migrationThresholds`, `bands.scrapValueFraction` | `economy.json` | The condition-band model and its save-migration mapping |
| `partsGeneration.*` including `maxBillFraction` (Law 2) | `economy.json` | Car generation (`auctions.ts`'s `generateAuctionCarInstance`/`enforceMaxBillFraction`) |
| `reputation.*` | `economy.json` | Clean/concours sale-quality bars and bonuses |
| `serviceJobs.marginMin`/`marginMax`/`laborRateYen`/`calloutFeeYen`/`dailyOfferCountWeights`/`offerCountCapByDay` | `economy.json` | Service-job payout derivation (Law 4's payout-sanity check) |
| `selling.*` including `offerSpread` | `economy.json` | Walk-in sale offers |
| `toolCeilings.*`, `specialty.*`, `machineListings.*` | `economy.json` | Progression-bible mechanics (out of this bible's scope, listed for completeness) |
| `coherence.maxConsumablesShareOfBookValue` (Law 3) | `economy.json` | The roster-coherence consumables-share check |
| `teardown.removeSlotsByClass`/`installSlotsByClass`/`usedPartSaleFraction`/`donorBreakEvenBillRatio` | `economy.json` | The teardown game's uninstall/install labour, used-part sale haircut, and the donor break-even measurement (`coherence.ts`'s `computeDonorCoherence`) |
| `diagnosis.symptomChanceByTier`/`secondSymptomChance`/`maxSymptomsPerCar`/`visitMinutes`/`travelFeeYenByTier`/`saleRevealCopy` | `economy.json` | The odds-priced auction sheet (`diagnosis.ts`'s `sheetGuideValueYen`, the room-vs-player pricing law; `fearPremium` retired 2026-07-19, see the Amendment log), symptom generation (`auctions.ts`), and the sale-side reveal line (Sprint 75 decision 2, `selling.ts`'s `saleRevealLineFor`) |
| `lapModel.C`/`ratioExp`/`gripMult`/`courseId`/`courseName` | `economy.json` | The reference-lap requirement's pure time formula (`lapModel.ts`'s `lapTimeSecondsFor`) and the reference board's own model-computed rows |

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
- 2026-07-14: **Law 5 (the foundation law) added by explicit maintainer approval** (Sprint 60,
  playtest pass-2 item 18), graduating the "build coherence" TODO capture into a designed system.
  `marketValueYen` becomes `base + foundationFactor(car) x installedPartsValueYen` - the ONLY
  change is that the additive aftermarket premium is now scaled by the worst foundational part's
  factor (`marketValue.ts`'s new `foundationFactor`, a pure read over the car's own bands/missing
  state). New content anchor `valuation.foundation` (`parts`: tyres, brakePadsDiscs,
  brakeCalipersLines, steering, chassis, underbody; `factorByState`: missing 0.10, scrap 0.15,
  poor 0.45, worn-or-better 1.0), schema-enforced monotonic and capped at 1 (the law withholds,
  never inflates). The base term is untouched, so Law 1 holds unchanged and repairing a failed
  foundation returns EXTRA (its repair value plus the released premium). Verified: the
  maintainer's verbatim kei-truck build is now a permanent losing-money probe
  (`valueModelProbes.test.ts`), the "sound foundations recover the premium" and marginal-return
  behavior are proved in `marketValue.test.ts`, and the coherence table is arithmetically
  unchanged (its all-scrap-STOCK probe car carries zero premium, so the factor is inert on it -
  asserted directly). Balance harness re-run clean: all 9 hard gates pass, days-to-`local` p50
  unchanged. First-pass factor numbers are maintainer-tuning bait. Full detail in
  `docs/sprints/sprint60.md`'s Exit.
- 2026-07-15: **Law 6 (the wage law) added, and Laws 1 and 5 amended, by explicit maintainer
  approval** (Sprint 66, playtest pass-3 item 19). Approving `sprint66.md` carries Law 6; the
  Law 1/Law 5 amendments were approved separately and in terms ("Happy to make the amendment
  Carefully") after the maintainer read the diminishing-returns proposal in decision 7.

  *Law 6* answers the diagnosis that a repair returned exactly 20% of spend: `marketRepairDiscount`
  1.2 -> 1.5 with `partsGeneration.maxBillFraction` 0.7 -> 0.6 to hold the (D, F) interlock at
  0.90 < 1. **That interlock is now a law-level constraint, written here so no future sprint moves
  one without the other:** `marketRepairDiscount x maxBillFraction` must stay below 1, or the worst
  generatable car's value falls through the `scrapValueFraction` floor and Law 2's guarantee dies.
  It is why 1.2 could never simply be raised on its own.

  *Law 1's amendment* is a SCOPING, not a weakening. It was forced by measurement: with the wage
  law implemented and the coherence table read for the first time, restoring the worst generatable
  shitbox to mint returned Y26,170 for ~8 bench days, or 1.10x the rent it cost - against 7.34x for
  a rare car. The first reading ("repair labour is value-blind, so cheap cars pay badly") was filed
  as a disclosure and was wrong. The maintainer's correction: nobody should be taking a Honda City
  to mint in the first place. The model was fine; the TARGET BAND was the mistake, and the table
  was faithfully measuring an act no sane player would perform. Hence `valuation.expectationByTier`
  (band + `beyondDiscount` + `aftermarketReturn`), the bill split at the expectation band, and the
  two-slope base value. Law 1's guarantee survives intact below the band, where it was ever really
  about protecting the player; above it the return may fall under 1 deliberately, and the
  legibility clause is what keeps that a choice rather than a trap. `beyondDiscount <=
  marketRepairDiscount` is schema-enforced, so the interlock above is strengthened, never loosened.

  *Law 5's amendment* is the same idea on the premium term: a per-tier `aftermarketReturn` so a
  race turbo on a kei returns a fraction of its cost. The maintainer's framing, kept verbatim
  because it is the whole design: it is not financially worth building a shitbox kei into a mint
  show car "though it might still be fun", while on a sports car it genuinely is - the point of
  diminishing return is higher on a better car.
- 2026-07-20: **Repair reward toned down, the lemon penalty moved into content and sharpened, and
  the fault-ladder catastrophe principle established** (Sprint 105, the stakes economy).
  `valuation.marketRepairDiscount` 1.5 -> 1.3: fixing a below-expectation fault still returns more
  than it costs (Law 1's >= 1 guarantee is untouched, and 1.3 x `partsGeneration.maxBillFraction`
  0.6 = 0.78 keeps the (D, F) interlock comfortably under 1), just less, so repair profit no longer
  drowns out the buying spread and the reputation reward. The interlock ceiling forced one coupled
  edit: `valuation.expectationByTier.rare.beyondDiscount` 1.5 -> 1.3, since the schema requires
  `beyondDiscount <= marketRepairDiscount`; the rare tier's expectation band is already `mint`, so
  there is no above-band work to discount and the change is economically inert. The lemon
  reputation penalty leaves `sim/constants.ts` for `economy.json`'s `reputation` block (closing a
  content-law gap alongside the clean/concours bonuses already there) and sharpens from 5 to 8, so
  one lemon sale now undoes about four clean sales; its trigger bar `lemonMaxAverageBandFactor`
  (0.45) moves into the config with it. Fault ladders gain a catastrophe rung: eight symptoms now
  carry a rare, low-weight worst cause that sets an expensive or foundational part (block,
  internals, gearbox, differential, chassis) to the terminal `scrap` band instead of `poor`, so a
  doubt can hide a genuine write-off whose true worth collapses toward the `scrapValueFraction`
  floor. Catastrophes stay rare (weights ~12 to 18 per cent) and severity-blind (one card line per
  symptom), so inspection is the only way to tell a steal from a grenade. Golden masters and the
  formula-locked story-mission payout probes moved as intended (case (a)); the value-model, wage,
  and coherence probes were re-run and assessed. First-pass numbers, to settle in playtesting.
  Full detail in `docs/sprints/sprint105.md`'s Exit.

  All eight decision-7 numbers are first-pass tuning bait. Full detail and the measured
  before/after in `docs/sprints/sprint66.md`'s Exit.
- 2026-07-15: **`teardown.*` added as a new anchor group** (Sprint 71, the teardown game;
  maintainer pre-approved the whole component-hierarchy arc the same day). Not a new law - the
  four per-depth-class labour figures, the used-part sale haircut, and the donor break-even
  measurement threshold are all ordinary content anchors, added to the audit table above. The
  donor coherence probes (`coherence.ts`'s `computeDonorCoherence`) measure and disclose the
  whole-vs-parted crossover per roster model rather than hard-gating an exact number. Full detail
  in `docs/sprints/sprint71.md`'s Exit.
- 2026-07-16: **`diagnosis.*` added as a new anchor group** (Sprint 73, diagnosis I; maintainer
  pre-approved decision 5 the same day the arc was scoped, 2026-07-15). Not a new law - the
  fear-priced sheet value (`diagnosis.ts`'s `sheetGuideValueYen = apparentValue - fearPremium x
  (apparentValue - expectedTrueValue)`) is the maintainer's own pricing law ("the room prices the
  symptom, the player prices the cause") implemented as a seam on the existing `anchorValueYen`
  (`bidding.ts`), not a change to Law 1-6's own text. `fearPremium`/`symptomChanceByTier`/
  `secondSymptomChance`/`maxSymptomsPerCar`/`visitMinutes`/`travelFeeYenByTier` are ordinary
  content anchors, added to the audit table above. The blind-buy guardrail
  (`coherence.ts`'s `computeSymptomCoherence`) measures and discloses the per-symptom expected-
  value spread per tier rather than hard-gating an exact number, same treatment as the donor
  coherence probes above. Full detail in `docs/sprints/sprint73.md`'s Exit.
- 2026-07-16: **`lapModel.*` added as a new anchor group** (Sprint 77, story missions II; maintainer
  pre-approved the reference-lap board decision 2026-07-15). Not a new law - one pure, monotonic
  formula (`C x (curbWeightKg / power) ^ ratioExp x gripMult[tyreGrade]`) over the car's own current
  derived stats, ordinary content anchors added to the audit table above. Full detail in
  `docs/sprints/sprint77.md`'s Exit.
- 2026-07-19: **`diagnosis.fearPremium` RETIRED, and the ledger/two-number presentation law
  added** (Sprint 98, economy legibility stage 1; maintainer approval 2026-07-19: "agreed...
  this looks like a very good foundation. go ahead", full design in
  `docs/design/economy-legibility.md`). The sheet value is now exactly the cause-weighted
  expectation (`sheetGuideValueYen === expectedTrueValueYen` before any narrowing) - the
  weighted odds ARE the fear, and the premium multiplier added a constant with no behaviour
  of its own. Consequence, asserted in `packages/sim/tests/valueLedger.test.ts`: the room's
  number and the player's estimate are equal until knowledge diverges them, which states the
  room-vs-player pricing law in its cleanest form. Presentation law, new: every player-facing
  price derives from the shared value ledger (`packages/sim/src/valueLedger.ts`), whose line
  items provably sum to the engine's totals; surfaces show at most two prices, the room's
  number and the player's. `fearPremium` leaves the audit table with this entry. Full detail
  in `docs/sprints/sprint98.md`'s Exit.
- 2026-07-19: **the bid ladder halves** (maintainer tuning order ahead of the Sprint 99
  room-demo sitting: "our intervals are too large... drop it to like 5000Y, especially
  for the cheaper cars"). `AUCTION_BID_INCREMENT_FRACTION` 0.05 -> 0.025, and the
  ladder's floor/rounding granularity moves out of code into a new ordinary anchor,
  `AUCTION_BID_INCREMENT_STEP_YEN` (5000) - a kei's ladder now steps at exactly Y5,000.
  Not a law change; audit table updated.
- 2026-07-20: **every physical action's labour cost becomes a named anchor**
  (`energy.actionPoints.*`, maintainer order 2026-07-20: "EVERY action that the player
  can do has a potential labour cost... centralized in a single location... fully
  configurable"). Twelve keys, one per physical action; shipped defaults reproduce the
  prior behaviour exactly (workup 10, inspection visit 10, everything else 0), proven by
  the golden masters not moving. The free-removal rule becomes the shipped default of a
  knob rather than a structural fact; tuning any removal-family key above zero requires
  a tutorial-copy re-sweep in the same sitting (the walkthrough currently states that
  taking things apart is free). Not a law change; audit table updated.
