# The turbo price lever: blast radius and alternatives

**Status: MEASUREMENT, DECIDED. Historical record of how task 9 was closed.** This closed out
Sprint 168's halted task 9 (`docs/sprints/sprint168.md`, "Task 9: halted, with the numbers"). Every
figure below was produced by running the shipped code against the shipped content, with the
candidate lever applied in memory only. No shipped code, content, lever or test was touched at the
time, and the probe that produced the sim-side figures was deleted. **Option B (Option R,
redistribute) was taken and shipped in commit `b214520`**: `parts.json` now carries the section 3.3
table exactly and no price moved. The "today" column throughout describes the pre-`b214520`
catalogue.

**The question.** Raising the catalogue's power fractions to the authored ladder
(`machining-performance-table.md`) breaks `partPricing.test.ts`. The proposed fix is raising
`gradeFactors.forcedInduction` (sport 2.93 to 4.2, race 6.5 to 9.3). What does that reach, and is it
the right answer?

**The answer, in one line: no. The proposed lever makes the probe it was proposed for six times
worse, no price lever of any value can satisfy that probe under the corrected ladder, and a
redistribution of the same approved totals clears all four bounds with no price movement at all.**

---

## 0. Reconstructing the halt

Sprint 168's "shape-preserving variant" column is reproduced exactly here, which confirms the
reconstruction before anything is built on it. The construction is: per-slot **race** figures as
authored; **street** and **sport** keep each slot's own current street/race and sport/race ratio,
rescaled onto the new race figure; each grade row then normalised to the ladder total (16/30/45,
21/40/60, 40/80/130), with `forcedInduction` excluded from the two NA totals because it is a
conversion.

| probe | bound | today | authored uniform | **corrected ladder** | sprint 168 reported |
| --- | ---: | ---: | ---: | ---: | ---: |
| value per yen, above parity | 1.35 | 1.335 | 1.446 | **1.376** (8 cases) | 1.376 |
| value per yen, below parity | 0.50 | 0.717 | 0.408 | **0.656** (0 cases) | 0.656 |
| cross-slot power-per-yen lead | 0.25 | 0.180 | 1.135 | **0.258** (4 cases) | 0.258 |
| `forcedInduction` price tracks power | 0.005 | 0.003 | 0.777 | **0.094** | 0.094 |

**Correction to the brief: three probes fail on the corrected ladder, not one.** The brief names
only the `forcedInduction` one, and it is right to: the other two are 1.9 and 3.2 per cent
overshoots of ceilings that are themselves pinned just above a measured maximum, so they are re-pin
housekeeping. The `forcedInduction` probe misses by **19 times its bound**, which is a different
kind of failure. The 8 within-slot cases are `block`/lazy-na/street and `internals`/high-strung-na/
street across all four classes; the 4 lead cases are `camsTiming` over `headValvetrain` at
high-strung-na/street across all four classes.

---

## Part 1: every consumer of a forced-induction SKU's price

The lever moves **8 of the 16 `forcedInduction` SKUs**: the sport and race rows, on all four fitment
classes. Stock and street are untouched because their grade factors do not move.

| grade | entry | everyday | enthusiast | flagship | moves? |
| --- | ---: | ---: | ---: | ---: | :---: |
| stock (x1.0) | Y12,600 | Y14,400 | Y36,000 | Y81,000 | no |
| street (x1.3) | Y16,400 | Y18,700 | Y46,800 | Y105,300 | no |
| sport (x2.93 to x4.2) | Y36,900 to Y52,900 | Y42,200 to Y60,500 | Y105,500 to Y151,200 | Y237,300 to Y340,200 | **+43.4%** |
| race (x6.5 to x9.3) | Y81,900 to Y117,200 | Y93,600 to Y133,900 | Y234,000 to Y334,800 | Y526,500 to Y753,300 | **+43.1%** |

### 1a. The resolution chain

| step | file | symbol |
| --- | --- | --- |
| lever | `packages/content/data/partPricing.json:54-59` | `gradeFactors.forcedInduction` |
| ladder pick | `packages/content/src/partPricing.ts:138-143` | `gradeFactorsFor`, keyed on `carPartId` |
| formula | `packages/content/src/partPricing.ts:171-192` | `resolvePartPriceYen` |
| catalogue | `packages/content/src/data.ts:84-86` | `PARTS` |

No forced-induction SKU carries a `priceBasisPartId`, and `overrides` is `{}`, so all 16 resolve
from the formula.

### 1b. Does not move (verified, not assumed)

| consumer | file | why |
| --- | --- | --- |
| `stockReplacementPriceYenByClass` | `packages/content/src/data.ts:96-118` | `stockReplacementPricesByClass` filters `grade === 'stock'`. It is the only writer. The stock turbo SKU does not move. |
| `costWeightedBandFactor` | `packages/sim/src/bands.ts:282-302` | its weights ARE `stockReplacementPriceYenByClass` and its factors are `bandFactor`. **The function's signature does not take `partsById` at all**, so it is structurally incapable of seeing a sport or race SKU's price. |
| **the lemon threshold** | `packages/sim/src/carCondition.ts:48-63` | reads `costWeightedBandFactor` plus a scrap/missing check. Nothing else. See Part 2.1. |
| `scrapValueYen` | `packages/sim/src/bands.ts:129-137` | stock-replacement basis only |
| `resolveScrapPart` | `packages/sim/src/parts.ts:247-279` | via `scrapValueYen` |
| missing-slot term of the restoration bill | `packages/sim/src/bands.ts:230, 269` | stock-replacement basis |
| `machiningPremiumYenOf` | `packages/sim/src/machining.ts:162-170` | `economy.machining.operations` covers only `headValvetrain`, `block`, `internals`, `camsTiming`. **There is no forced-induction operation**, so the count is always 0 and the premium is always 0 on a turbo. |
| **auction lot generation** | `packages/sim/src/auctions.ts:904-916` | `forcedInduction` is special-cased BEFORE the missing and aftermarket rolls: it is always a stock instance or `null`. **No generated car ever carries a street, sport or race turbo.** Confirmed empirically at 5,200 cars: 3,200 stock, 0 aftermarket, 2,000 legitimately absent. |
| the Law 2 bill softener | `packages/sim/src/auctions.ts:1056-1140` | prices generated cars, whose turbo is stock |
| auction anchor and buyout | `packages/sim/src/bidding.ts:90, 220` | generated lots only |
| every balance and donor probe | `packages/sim/src/balanceProbes.ts:188-213, 618-674` | probe cars are all-stock |
| the plays ranking | `packages/sim/src/plays.ts` | only ever run over generated lots |
| the Investor bot | `packages/sim/src/bots/investor.ts:146-152` | takes the cheapest fitting SKU, always the stock one |
| `saveCodec` id and grade maps | `packages/game/src/save/saveCodec.ts:850, 1128` | identity only |
| `docs/carstats/` | all five files | zero yen figures in the whole folder; every turbo mention is PS, weight or authenticity |

### 1c. Moves

| consumer | file | what moves |
| --- | --- | --- |
| `costToBandYen` / `costToMintYen` | `packages/sim/src/bands.ts:87-103, 72-80` | `gradesBetween x repairStepFraction x partPriceYen` on a fitted non-mint turbo |
| `carCostToBandYen`, `carCostToMintYen`, `groupCostToMintYen` | `packages/sim/src/bands.ts:196-273` | the whole-car and engine-group restoration bill |
| `planPartRepair`, `planGroupRepair`, `planReconditionPart` | `packages/sim/src/bands.ts:364-473`, `jobs.ts:1238-1279` | every repair and recondition quote |
| **`usedPartSaleValueYen`** | `packages/sim/src/bands.ts:117-125` | the parts-bin counter price and every part-out yield |
| `resolveSellPart` | `packages/sim/src/parts.ts:300-331` | via `machinedPartPriceYen` then `usedPartSaleValueYen` |
| **`installedPartsValueYen`** | `packages/sim/src/marketValue.ts:238-256` | a fitted sport/race turbo is non-stock, so its full price enters the premium |
| **`marketValueYen`** | `packages/sim/src/marketValue.ts:317-345` | both ways: premium up, restoration bill up |
| every downstream price | `selling.ts:677-706`, `valuation.ts:197-255`, `diagnosis.ts:100-909` | offers, asking price, buyer valuation, diagnosis pricing |
| `resolveBuyPart` (both routes), `resolvePartDeliveries` | `packages/sim/src/parts.ts:104-225` | the shop till, and the price locked into a delivery |
| car and job ledgers | `jobs.ts:326-347`, `stagedWork.ts:369-373`, `assemblies.ts:168-178` | `partsYen` postings |
| the weekly cost sheet | `packages/content/src/cashLedger.ts:47-101`, `CostSheetScreen.vue:52-73` | magnitude of the `stock` and `income` buckets |
| **service-job cost basis and payout** | `packages/sim/src/serviceJobs.ts:342-415` | `serviceJobCostBreakdown` takes the median of the fitting SKUs; `deriveServiceJobPayoutYen` scales with it |
| **two turbo service-job templates** | `packages/content/data/serviceJobTemplates.json:110-151` | `race-turbo-upgrade` (`minGrade: race`) and `forced-induction-conversion` (`minGrade: sport`) |
| **`street-power-street-manners` payout and budget cap** | `packages/content/data/storyMissions.json` | derived, not authored freely. See Part 2.5. |
| `evaluateBudgetCap`, `evaluateTasteMatch` | `packages/sim/src/requirements.ts:152-218` | mission budget arithmetic; taste match is a ratio of two differently-weighted values, so it does not cancel |
| the service-job bot | `packages/sim/src/bots/serviceJobHelpers.ts:189-199` | grade-gated, so it buys the sport or race turbo |
| the shop, cart and bin UI | `PartsMarketScreen.vue:267-449`, `gameStore.ts:4098-4271`, `PartCard.vue:75, 194` | price tags, sort order, cart totals, sell tags, recondition steps |

### 1d. Not on the brief's list, found anyway

1. **`resolvePartDeliveries`** (`parts.ts:212`) locks the purchase price onto the instance, so a
   standard order carries the old price for its whole delivery window.
2. **`assemblies.ts:168-178`** posts parts spend to the active service job's ledger, so it reaches
   service-job net profit at `serviceJobs.ts:1048, 1088`.
3. **`exportCareers.ts:181`** writes `tools/balance/data/*.csv`, so the Python balance report shifts
   on every path that moves. Suspended under directive 21 either way.
4. **A pre-existing inconsistency, unrelated to this lever and inert for turbos.**
   `gameStore.ts:4103` `sellValueForPart` prices off bare `part.priceYen`, while the resolver it
   mirrors (`parts.ts:313-317`) prices off `machinedPartPriceYen`. The bin button under-quotes a
   machined block, head, internals or cams. Worth a line in `TODO.md`; nothing to do with turbos,
   since no machining operation targets one.

### 1e. Tests and gates that must move in the same change

| # | file | what |
| --- | --- | --- |
| 1 | `packages/content/tests/economyApprovalGate.test.ts:1639-1649` | the sha256 pin on `partPricing.json`. This is the approval gate; `parts.json` is hashed by nothing. |
| 2 | `packages/content/tests/partPricing.test.ts:271-278` | pins the ladder `{1, 1.3, 2.93, 6.5}` exactly |
| 3 | `packages/content/tests/partPricing.test.ts:446-472` | acceptance 2a, the flat-spread probe |
| 4 | `packages/content/tests/partPricing.test.ts:474-493` | pins the measured spread `0.0031746` |
| 5 | `packages/content/tests/partPricing.test.ts:400-425` | pins `1.334961` and "39 of 288 above parity" |
| 6 | `packages/content/tests/partPricing.test.ts:372-398` | 24 generated per-case names for `forcedInduction` |
| 7 | `packages/sim/tests/storyMissionProbes.test.ts:498-499` | the tuner taste-match pin and `payoutYenFor(probeCostYen)` |
| 8 | `packages/content/tests/economyApprovalGate.test.ts:1669` | `street-power-street-manners: { payoutYen 1494000, budgetCapYen 1494000 }` |

Items 5 and 6 move under **any** fraction change, including Option R. Items 1 to 4, 7 and 8 move
only if a price moves.

Verified to hold either way: the grade and class monotonicity tests, the price floor, the brake
cliff, the empty-overrides test, `integrity.test.ts:273-283`, `marketValue.test.ts:233-235`,
`valueModelProbes.test.ts:995-1111` (asserts a negative margin, which only deepens), and
`serviceJobPayout.test.ts:53-106` (a structural ratio: both sides scale with the same SKU).
**No test anywhere pins an absolute yen figure for a sport or race turbo.**

---

## Part 2: measured deltas of the price lever

Lever measured: `gradeFactors.forcedInduction` sport 2.93 to 4.2, race 6.5 to 9.3, applied through
the real `resolvePartPriceYen` with every other sheet value untouched.

### 2.1 The lemon threshold: nothing moves, and it cannot

**Sample: 5,200 real generated cars** (26 shipped models x 200 seeds, through
`generateAuctionCarInstance` at year 1995).

| sale quality | before | after | changed |
| --- | ---: | ---: | ---: |
| lemon | 2,151 | 2,151 | 0 |
| neutral | 3,048 | 3,048 | 0 |
| clean | 1 | 1 | 0 |
| concours | 0 | 0 | 0 |

`costWeightedBandFactor` distribution, 0.05 buckets, `lemonMaxAverageBandFactor` = 0.45:

| bucket | 0.20 | 0.25 | 0.30 | 0.35 | 0.40 | **0.45** | 0.50 | 0.55 | 0.60 | 0.65 | 0.70 | 0.75 | 0.80 | 0.85 | 0.90 | 0.95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cars | 1 | 11 | 29 | 116 | 192 | 167 | 270 | 445 | 441 | 569 | 669 | 741 | 624 | 577 | 339 | 9 |

The distribution is **byte-identical before and after**, and so is every car's outcome. This is not
a sampling result, it is structural: `costWeightedBandFactor`'s signature is
`(car, model, partsTaxonomyById, economy)`. It never receives `partsById`, its weights are
`stockReplacementPriceYenByClass` (stock-grade SKUs only, which do not move) and its factors are
`bandFactor`. **The lever cannot reach the lemon threshold through any path.** The sample confirms
the proof rather than substituting for it.

The same holds for the clean and concours arms: the band floor reads bands, and
`authenticityPercentOf` reads taxonomy weights, grades and machining. Neither reads a price.

### 2.2 What a full race turbo build costs

| class | eight race power slots, before | after | delta | turbo's share of the build |
| --- | ---: | ---: | ---: | --- |
| entry | Y306,200 | Y341,500 | +Y35,300 | 26.7% to 34.3% |
| everyday | Y349,800 | Y390,100 | +Y40,300 | 26.8% to 34.3% |
| enthusiast | Y874,700 | Y975,500 | +Y100,800 | 26.8% to 34.3% |
| flagship | Y1,968,100 | Y2,194,900 | +Y226,800 | 26.8% to 34.3% |

Climbing rung by rung (street, then sport, then race) rather than buying race outright:

| class | before | after | delta |
| --- | ---: | ---: | ---: |
| entry | Y586,300 | Y637,600 | +Y51,300 |
| everyday | Y669,900 | Y728,500 | +Y58,600 |
| enthusiast | Y1,675,000 | Y1,821,500 | +Y146,500 |
| flagship | Y3,768,700 | Y4,098,400 | +Y329,700 |

### 2.3 What a car carrying a race turbo is worth

Measured through `marketValueYen` on controlled builds (`carWithGrades`), heat 100, all 16 shipped
forced-induction models. The per-class figure is identical across models in a class because the
delta is `foundationFactor x aftermarketReturn x retention x deltaPrice` minus
`marketRepairDiscount x deltaBill`, none of which is model-specific.

| class | lone race turbo, mint | lone race turbo, worn | full race build, mint | full race build, worn |
| --- | ---: | ---: | ---: | ---: |
| entry | +Y8,293 | +Y3,124 | +Y7,782 | +Y2,740 |
| everyday | +Y18,936 | +Y11,646 | +Y17,768 | +Y10,657 |
| enthusiast | +Y71,046 | +Y49,339 | +Y66,664 | +Y45,490 |
| flagship | +Y177,616 | +Y126,822 | +Y166,662 | +Y117,114 |

As a fraction of the car: +5.5% on a 180SX with a full race build (mint), +6.1% on a Supra RZ with a
lone race turbo, +2.3% on an Alto Works.

**The one direction worth flagging: on a car with a failed foundation the lever makes it worth
LESS.** Sampled generated cars carrying a fitted worn race turbo read **-3.06%** (180SX), **-3.14%**
(City Turbo II) and **-1.50%** (S13). `foundationFactor` withholds the premium while the restoration
bill deduction still applies at `marketRepairDiscount` 1.3. The magnitude:

| class | extra bill on a fine/worn/poor race turbo | extra value deduction (x1.3) |
| --- | --- | --- |
| entry | Y3,530 / Y7,060 / Y10,590 | Y4,589 / Y9,178 / Y13,767 |
| everyday | Y4,030 / Y8,060 / Y12,090 | Y5,239 / Y10,478 / Y15,717 |
| enthusiast | Y10,080 / Y20,160 / Y30,240 | Y13,104 / Y26,208 / Y39,312 |
| flagship | Y22,680 / Y45,360 / Y68,040 | Y29,484 / Y58,968 / Y88,452 |

### 2.4 Part-out yields

`usedPartSaleValueYen`, one race turbo over the counter:

| class | mint | fine | worn | poor |
| --- | --- | --- | --- | --- |
| entry | Y24,570 to Y35,160 | Y18,428 to Y26,370 | Y13,514 to Y19,338 | Y2,457 to Y3,516 |
| everyday | Y28,080 to Y40,170 | Y21,060 to Y30,128 | Y15,444 to Y22,094 | Y2,808 to Y4,017 |
| enthusiast | Y70,200 to Y100,440 | Y52,650 to Y75,330 | Y38,610 to Y55,242 | Y7,020 to Y10,044 |
| flagship | Y157,950 to Y225,990 | Y118,463 to Y169,493 | Y86,873 to Y124,295 | Y15,795 to Y22,599 |

Every figure is +43.1%. Because a generated car never carries an aftermarket turbo,
`computeDonorBalanceProbe` and the whole part-out-versus-sell-whole comparison for **bought** cars
are unaffected; only a turbo the player fitted and then removed reaches this table.

### 2.5 Missions and service jobs

**`street-power-street-manners` is the one authored payout that moves.** Its payout and budget cap
are `ceil1000(1.3 x probeCostYen)` (`storyMissionProbes.test.ts:53`), and the probe build fits an
enthusiast **sport** turbo. Measured through the same three terms the probe uses:

| | purchase | repair | parts | probe cost | derived payout and cap |
| --- | ---: | ---: | ---: | ---: | ---: |
| before | Y468,600 | Y70,640 | Y609,300 | Y1,148,540 | **Y1,494,000** (matches the authored value exactly) |
| after | Y468,600 | Y70,640 | Y655,000 | Y1,194,240 | **Y1,553,000** |

That is **+Y59,000, +3.95%**, on a mission payout. Directive 22 gates it by name. No other mission
references a turbo.

**Two service-job templates** carry a turbo requirement: `race-turbo-upgrade` (`minGrade: race`) and
`forced-induction-conversion` (`minGrade: sport`). Their payouts derive at runtime from
`serviceJobCostBreakdown`'s median-of-fitting-SKUs basis, so the payout rises with the cost and the
margin ratio is structurally preserved. The **absolute** payouts still rise about 43 per cent on the
part term, which is a mission-payout movement in substance even though no authored number changes.

### 2.6 Progression pacing

The earnings unit is `computeRosterBalanceProbe`'s `sensibleFlipMarginYen`, the real sim's own
answer to "what does one car actually clear when played the way the economy asks".

| class | n | median flip margin | race build before | after | cars to fund it, before to after |
| --- | ---: | ---: | ---: | ---: | --- |
| entry | 7 | Y53,338 | Y306,200 | Y341,500 | 5.7 to **6.4** |
| everyday | 8 | Y146,922 | Y349,800 | Y390,100 | 2.4 to **2.7** |
| enthusiast | 9 | Y240,684 | Y874,700 | Y975,500 | 3.6 to **4.1** |
| flagship | 2 | Y910,701 | Y1,968,100 | Y2,194,900 | 2.2 to **2.4** |

Climbing rung by rung instead: enthusiast 7.0 to **7.6** cars, flagship 4.1 to **4.5**.

**Reading:** the pacing cost is real but modest, between a quarter and two-thirds of an extra car per
build. It is not the reason to reject the lever. The reason is Part 3.

---

## Part 3: is raising the price the right answer?

### 3.1 The proposed lever does not fix the probe it was proposed for

| ladder on the corrected fractions | FI price-tracking spread | bound |
| --- | ---: | ---: |
| shipped `{1, 1.3, 2.93, 6.5}` | 0.094 | 0.005 |
| **proposed `{1, 1.3, 4.2, 9.3}`** | **0.566** | 0.005 |

It is **six times worse**. The arithmetic: the corrected ladder raises the forced turbo's street
figure by 56 per cent (7.0 to 10.93), its sport by 49 per cent (15.8 to 23.59) and its race by 43
per cent (35 to 50). The proposed lever raises sport and race by 43 per cent each and leaves street
at 1.30, so it aligns the one rung that was already closest and pulls the other two apart.

### 3.2 No price lever of any value can fix it either

`gradeFactors.forcedInduction` is **one sheet entry serving all three engine characters at once**.
Probe 4 asks that `priceYen / powerFraction` be flat across street, sport and race, which is only
possible if the street/race and sport/race POWER ratios are the same on every character. So the
achievable spread has a floor set by the fractions alone, whatever the prices are. Measured by
sweeping the street and sport factors over a 0.0005 grid, against the real rounded catalogue:

| fraction table | street/race ratios (hs, lazy, forced) | sport/race ratios | best possible spread, any ladder | the ladder that achieves it |
| --- | --- | --- | ---: | --- |
| today (shipped) | 0.200 / 0.200 / 0.200 | 0.450 / 0.450 / 0.451 | 0.32% | `{1, 1.30, 2.928, 6.5}` |
| authored uniform rescale | 0.355 / 0.350 / 0.308 | 0.665 / 0.668 / 0.616 | **7.53%** | `{1, 2.152, 4.040, 6.5}` |
| **corrected ladder** | 0.200 / 0.200 / **0.219** | 0.450 / 0.450 / **0.472** | **4.72%** | `{1, 1.359, 2.932, 6.5}` |
| **Option R (below)** | 0.200 / 0.200 / 0.200 | 0.450 / 0.450 / 0.450 | **0.12%** | `{1, 1.30, 2.925, 6.5}` |

Against a 0.5 per cent bound. **The best any price ladder can do on the corrected fractions is 4.72
per cent, nine times the bound**, and the shipped ladder already scores 9.44 per cent, so at most
half the residue is even addressable by price. The rest is a property of the fractions and nothing
in `partPricing.json` can reach it.

Two details worth the maintainer's eye. First, the best-possible ladder for the corrected table
**leaves the race factor at 6.5 and raises the STREET one by 4.5 per cent** (1.30 to 1.359), which
is the opposite direction and the opposite rung to the proposal, and it still fails. Second, on the
authored uniform rescale the floor is 7.53 per cent, so that table was never satisfiable by price
either. Raising the price is not a worse fix. It is not a fix.

### 3.3 Option R: the redistribution that needs no price lever

**A distribution exists, it is small, and it clears all four bounds with room.**

The only structural constraint is that `forcedInduction`'s column sit at its own price ladder's
ratios, 1.3/6.5 = 0.200 and 2.93/6.5 = 0.45077, on every character. On the two NA characters it
already does. On `forced`, the corrected ladder pushed it to 0.219 and 0.472 purely because the
street and sport rows were renormalised to hit the 40 and 80 totals **after** the turbo had been
scaled. Pinning the turbo first and letting the other seven slots absorb the slack fixes it: move
**0.93 points of street power and 1.05 points of sport power off the turbo onto the other seven
slots**. The race row is untouched.

| slot | hs street | hs sport | hs race | lazy street | lazy sport | lazy race | forced street | forced sport | forced race |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `forcedInduction` | 4.0 | 9.0 | 20.0 | 5.6 | 12.6 | 28.0 | 10.0 | 22.5 | 50.0 |
| `ignitionEcu` | 0.5 | 1.6 | 3.0 | 0.7 | 2.7 | 5.0 | 5.6 | 19.5 | 33.0 |
| `exhaust` | 1.8 | 3.1 | 4.0 | 2.5 | 4.6 | 6.0 | 10.1 | 15.3 | 18.0 |
| `headValvetrain` | 3.7 | 6.5 | 9.0 | 4.3 | 7.9 | 11.0 | 4.1 | 6.4 | 8.0 |
| `intake` | 0.5 | 0.8 | 1.0 | 1.5 | 2.5 | 3.0 | 4.7 | 6.4 | 7.0 |
| `camsTiming` | 2.8 | 6.9 | 11.0 | 3.9 | 8.9 | 14.0 | 2.3 | 4.3 | 6.0 |
| `internals` | 1.6 | 2.6 | 4.0 | 2.0 | 3.2 | 5.0 | 1.6 | 2.8 | 4.0 |
| `block` | 5.1 | 8.5 | 13.0 | 6.1 | 10.2 | 16.0 | 1.6 | 2.8 | 4.0 |
| **fitted total** | **16.0** | **30.0** | **45.0** | **21.0** | **40.0** | **60.0** | **40.0** | **80.0** | **130.0** |

Three decimal places, the precision `parts.json` already uses. Every ladder total is met exactly.

**What Option R preserves, unchanged from the maintainer's approval:**

- Every **race** figure, on all three characters, exactly as the performance table authored it.
  13/4/9/11/1/4/3/20, 16/5/11/14/3/6/5/28, 4/4/8/6/7/18/33/50.
- Every ladder total: x1.450, x1.600, x2.300 at race, and the street and sport rungs at x1.160 /
  x1.300, x1.210 / x1.400, x1.400 / x1.800.
- The design shape. The turbo, the ECU and the exhaust still carry **101 of the forced 130** at
  race, and the block still carries 4.
- The NA conversion rows (4.0/9.0/20.0 and 5.6/12.6/28.0), which the authored uniform rescale would
  have moved and which `proportionalPower.test.ts` pins as its own separate figures.

**What Option R changes from the performance table:** the per-slot street and sport SPLIT only. The
table derived those as a uniform rescale of race (`street = race x 16/45`, and so on), which was a
convenience rather than a design statement, and it is what puts every slot on the same grade shape
and therefore breaks the price ladders that were derived to track different ones.

**Measured, all four probes:**

| probe | bound | today | corrected ladder | **Option R** |
| --- | ---: | ---: | ---: | ---: |
| value per yen, above parity | 1.35 | 1.335 | 1.376 (8 breach) | **1.137** (0) |
| value per yen, below parity | 0.50 | 0.717 | 0.656 (0) | **0.641** (0) |
| cross-slot power-per-yen lead | 0.25 | 0.180 | 0.258 (4 breach) | **0.141** (0) |
| `forcedInduction` price tracks power | 0.005 | 0.003 | 0.094 | **0.003** |

Option R is better than the SHIPPED catalogue on two of the four. Values for re-pinning
`partPricing.test.ts`'s measured-maximum assertions: max 1.137295, 87 of 288 above parity, min
0.640772, max lead 0.140741 (`entry/high-strung-na/race`, `camsTiming` over `headValvetrain`), FI
spread 0.0029709.

**What Option R costs.** The street and sport figures on the two NA characters move more than a pure
turbo fix would require, because the same construction is applied uniformly rather than as a set of
hand nudges. The largest single move against today's catalogue is `block`/high-strung-na/street,
4.0 to 5.1 points, and `intake`/high-strung-na/street drops 1.2 to 0.5. A hand-tuned variant that
touches only `forcedInduction`/forced plus three NA nudges also clears every bound; it was measured
(1.345 / 0.636 / 0.200 / 0.003) but needs four decimal places to hold its totals, so the table above
is the shippable form.

**What Option R does NOT avoid.** It is still a fraction change, so it still needs the maintainer's
signature under directive 22, and it still moves everything task 9 was always going to move: every
power pin in `proportionalPower.test.ts`, the five caps, lap times on modified cars, and the two
`advanceDay` golden hashes if any generated car carries a modified power slot. What it avoids is the
**economy**: no price, no bill, no value, no mission payout, no approval-gate hash.

### 3.4 Both

Not measurable as an improvement, because 3.2 shows the price side has nothing to contribute. Once
the fractions are redistributed to Option R, the shipped ladder tracks them at 0.003 and any price
move strictly worsens the probe. A price move would only be worth discussing as a separate,
independently motivated decision (for example, "a race turbo should simply cost more") and it would
then need its own signature, its own mission re-derivation and its own re-pin of the flat-spread
bound.

---

## The options

| option | what it costs | what it breaks | what needs signing |
| --- | --- | --- | --- |
| **A. Raise the price** (`gradeFactors.forcedInduction` sport 4.2, race 9.3) | Race build +Y35,300 to +Y226,800 per class; a quarter to two-thirds of an extra car per build; part-out and counter values +43%; a car with a race turbo worth +2.3% to +6.1%, or **-1.5% to -3.1% if its foundation has failed** | **Does not fix the probe: 0.094 becomes 0.566.** Re-derives the `street-power-street-manners` payout and cap Y1,494,000 to Y1,553,000. Moves two service-job payouts. Breaks 8 tests and gates including the `partPricing.json` approval hash | `gradeFactors.forcedInduction` sport and race; a mission payout and budget cap (directive 22, by name); the approval-gate re-pin |
| **A'. Any other price ladder** | as above, in some other magnitude | **Also cannot fix it.** The best any single ladder can achieve on the corrected fractions is 4.72% against a 0.5% bound (and it gets there by raising the STREET factor 4.5%, leaving race alone) | not worth pursuing |
| **B. Option R, redistribute** | Street and sport per-slot splits move from the performance table's uniform rescale. Largest single move 1.1 points (`block`/hs/street). No yen changes anywhere | Nothing in the economy. Re-pins `partPricing.test.ts`'s three measured-maximum assertions and its 24 generated case names, which any fraction change does anyway | the street and sport rows of `machining-performance-table.md`'s three per-slot tables (directive 22). **No economy lever, no mission payout, no `partPricing.json` change, no approval-gate hash** |
| **C. Both** | A plus B | Nothing extra, but nothing gained: after B the shipped ladder tracks at 0.003 and any price move makes it worse | both signatures, for no measured benefit |
| **D. Loosen the flat-spread bound** | Nothing in yen | The bound exists to stop the exact defect the ECU once shipped. At 0.094 it would have to widen 19-fold, which retires the guard rather than passing it | a decision to retire acceptance 2a |

## Recommendation

**Option B.** The reason is 3.2, not preference: the price lever cannot satisfy the probe at any
value, because one `gradeFactors` entry has to serve three engine characters and the corrected
fractions give it three different shapes to track. The redistribution removes the cause instead, and
it does so while preserving every number the maintainer actually signed (all three race rows, all
nine ladder totals, the 101-of-130 shape, the NA conversion rows), clearing all four bounds with
room, and scoring better than the shipped catalogue on two of them.

It also leaves the economy entirely alone. Under Option A the blast radius reaches a story mission's
payout, two service-job payouts, every repair quote and guide value on a turbo car, the parts bin,
the cost sheet and the approval-gate hash. Under Option B not one yen moves, because no resolved
price changes at all.

The one thing Option B needs is a signature on the street and sport rows of the performance table's
per-slot figures. That is a smaller ask than Option A's, and it is the ask that actually closes
task 9.
