# The sale-value arc, measured

Every number on this page was produced by running the shipped sim at the stated seed and sample
size. Nothing here is a hand-recomputed formula. Generated from a throwaway probe; the seeds are
quoted per section so any figure can be reproduced.

## 1. What a car looks like at each auction room

100 lots per seed, seeds 101/202/303/404/505/606/707/808/909/1010, 1000 lots per room, `generateAuctionCatalog` at game year 1995. "Below expectation" counts
installed parts whose band is under `expectationForCar(model).band` for that lot's own car;
a part at or above the band earns nothing when repaired and is not counted. The bill is
`carCostToBandYen(..., expectation.band)` and the profit is that bill times
`marketRepairDiscount - 1` (1.3 - 1 = 0.30).

| room | lots | mean age | mean km | below p25 | below median | below p75 | under 3 below | mean poor parts | median bill | median repair profit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `local-yard` | 1000 | 5.3 | 44,913 | 7 | 18 | 26 | 1.8% | 7.32 | ¥37,650 | ¥11,295 |
| `regional` | 1000 | 3.9 | 32,566 | 5 | 14 | 26 | 3.9% | 5.27 | ¥35,855 | ¥10,757 |
| `premium` | 1000 | 2.8 | 23,279 | 5 | 13 | 25 | 5.5% | 2.97 | ¥46,690 | ¥14,007 |
| `collector-network` | 1000 | 2.8 | 23,722 | 12 | 22 | 28 | 3.3% | 1.91 | ¥107,715 | ¥32,315 |

The rooms do not differ only in price. They differ in what the market expects of the car, which is
why the collector network's bill is triple the local yard's: seven lots in ten there are flagships,
and a flagship's expected band is `mint` rather than `fine`.

| room | entry | everyday | enthusiast | flagship | lots expecting mint | mean symptoms |
| --- | --- | --- | --- | --- | --- | --- |
| `local-yard` | 68% | 30% | 2% | 0% | 0% | 0.61 |
| `regional` | 25% | 45% | 26% | 4% | 4% | 0.59 |
| `premium` | 3% | 17% | 56% | 24% | 24% | 0.50 |
| `collector-network` | 0% | 3% | 28% | 70% | 70% | 0.43 |

## 2. Authenticity is now a fact about the car

Every row is `computeDerivedStats(...).authenticity` on a real shipped car built through the real
parts catalogue (`carWithGrades`, the model's own fitment class). Sale quality is
`saleQualityFor(saleReputationDeltaFor(...))`, the shipped concours gate:
`concoursSaleMinAuthenticityPercent` = 85, and every part must also be mint.

| build | Nissan Skyline GT-R (BNR32) auth | sale quality | Nissan Silvia (S13) auth | sale quality |
| --- | --- | --- | --- | --- |
| All stock, all mint | 100 | concours | 100 | concours |
| All stock, all fine | 85 | clean | 85 | clean |
| New consumables only (tyres, pads, clutch) | 100 | concours | 100 | concours |
| Wheels only | 93 | concours | 93 | concours |
| Bodykit only | 90 | concours | 90 | concours |
| Bodykit and wheels | 83 | clean | 83 | clean |
| Block swap only | 82 | clean | 82 | clean |
| Seats, dash and wheels | 88 | concours | 88 | concours |
| Full engine swap (10 engine slots) | 58 | clean | 58 | clean |
| Full engine swap plus kit and wheels | 41 | clean | 41 | clean |

What the 85 bar buys in practice: authenticity is a weighted count over the taxonomy's own
`statWeights.authenticity` column, which sums to exactly 100 across the 29 slots. So a concours
car may give up at most 15 points of originality. The prices, per slot:

| slot | authenticity points | still concours alone? |
| --- | --- | --- |
| `block` | 18 | NO |
| `bodywork` | 11 | yes |
| `paint` | 11 | yes |
| `aero` | 10 | yes |
| `internals` | 8 | yes |
| `rims` | 7 | yes |
| `headValvetrain` | 6 | yes |
| `gearbox` | 6 | yes |
| `camsTiming` | 4 | yes |
| `seats` | 4 | yes |
| `forcedInduction` | 3 | yes |
| `springs` | 2 | yes |
| `intake` | 1 | yes |
| `exhaust` | 1 | yes |
| `ignitionEcu` | 1 | yes |
| `differential` | 1 | yes |
| `chassis` | 1 | yes |
| `dampers` | 1 | yes |
| `steering` | 1 | yes |
| `brakeCalipersLines` | 1 | yes |
| `underbody` | 1 | yes |
| `dashGauges` | 1 | yes |

## 3. Style is an axis a car can climb

`stylePercentOf`: `styleRaw = styleBase + (styleCeiling - styleBase) * reach`, where
`reach = min(1, fitted / 66)`, then scaled by the car's own
style condition factor. Every car below is all-mint, so the condition factor is exactly 1 and stock
reads exactly `styleBase`. Buyer style targets: stancer 65, hobbyist 55, collector 50, tuner 45, first-timer 20, racer 10. The two "clears" columns list only the four real bars (stancer 65, hobbyist 55, collector 50, tuner 45); the first-timer's 20 and the racer's 10 are near-free, cleared
stock by all but 1 of the 26 shipped cars.

**The Toyota 2000GT is not in shipped content.** `cars.json` carries 26 cars and the 2000GT is
not one of them; it exists only in the roster CSV and the design docs. The highest-style shipped
car, the RX-7 FD3S, stands in for it below, and the Wagon R is the plain canvas.

| car | tier | styleBase | styleCeiling | stock, mint | street kit and wheels | fully built | clears stock | clears built |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Suzuki Wagon R (CT21S) | entry | 16 | 44 | 16 | 22 | 44 | none | none |
| Toyota Carina (AT150) | entry | 20 | 60 | 20 | 28 | 60 | none | hobbyist, collector, tuner |
| Nissan Cefiro (A31) | everyday | 40 | 90 | 40 | 50 | 90 | none | stancer, hobbyist, collector, tuner |
| Honda Civic SiR-II (EG6) | everyday | 45 | 92 | 45 | 54 | 92 | tuner | stancer, hobbyist, collector, tuner |
| Nissan Silvia (S13) | everyday | 64 | 95 | 64 | 70 | 95 | hobbyist, collector, tuner | stancer, hobbyist, collector, tuner |
| Toyota Supra RZ (JZA80) | flagship | 74 | 95 | 74 | 78 | 95 | stancer, hobbyist, collector, tuner | stancer, hobbyist, collector, tuner |
| Mazda RX-7 (FD3S) | enthusiast | 82 | 96 | 82 | 85 | 96 | stancer, hobbyist, collector, tuner | stancer, hobbyist, collector, tuner |
| Toyota Sera (EXY10) | entry | 59 | 68 | 59 | 61 | 68 | hobbyist, collector, tuner | stancer, hobbyist, collector, tuner |

The "street kit and wheels" column is a street lip kit plus street alloys, 13 points against a
saturation of 66, so it buys just under a fifth of every car's own gap.

The "fully built" column is the 10-slot dress below, worth 88 style points against a saturation
point of 66. It therefore saturates `reach` at 1 and every car lands
exactly on its own `styleCeiling`, which is the shape of the design: a car's ceiling is the car's,
not the parts bin's. Fitted loudest-first, three of these parts buy half a car's gap, five buy four
fifths, and the last of it takes seven; no three slots can finish a car between them, which is what
the flattening was for.

| slot | grade | SKU resolved | style points |
| --- | --- | --- | --- |
| `aero` | race | FRP Race Aero Kit | 18 |
| `rims` | race | Ronin Race Forged Wheels | 14 |
| `seats` | race | Zashiki Race Bucket Seats | 10 |
| `dampers` | race | Tanuki N1 Coilovers | 8 |
| `dashGauges` | race | Sokudo Digital Race Dash | 8 |
| `exhaust` | race | Suzaku Race Header Kit | 7 |
| `springs` | race | Enzan Race Springs | 7 |
| `brakeCalipersLines` | race | Shuriken Race Caliper Kit | 6 |
| `tyres` | race | Tsume Race Slicks | 6 |
| `intake` | race | Fubuki Velocity Stack Kit | 4 |

## 4. A car has a history and a story

400 cars per pattern, seeds 0..399, all of them Nissan Silvia (S13), generated through the real
`generateAuctionCarInstance` with the pattern forced by setting every damage grade's
`patternWeightsByGrade` row to that one pattern. Band steps are `mint` index minus the part's own
band index, summed per group; the three body-derived slots are excluded here because their damage is
carried by the zone table below instead.

Mean band steps by taxonomy group, with each pattern's own multiple of the flat `garaged`
baseline in brackets. The total budget is fixed by the car's history grade, so a pattern
REDISTRIBUTES steps rather than adding them: the totals across this table run 42.62 to 45.10, a
spread of 1.058, while the widest single group moves 1.53x.

The pattern reaches the parts through THREE consumers and the first of them carries most of it:
the condition roll takes its group's offset (`patternConditionOffsets`, sized by
`partsGeneration.patternConditionSwingPercent`), the damage budget spends against its group row,
and the symptom draw weights each candidate by where its causes sit. The offset is the load-bearing
one because the budget is only about a fifth of a car's band steps.

| pattern | engine | drivetrain | suspension | wheels | body | interior |
| --- | --- | --- | --- | --- | --- | --- |
| `garaged` | 15.99 | 8.62 | 10.15 | 3.88 | 1.89 | 3.83 |
| `neglected-commuter` | 17.70 (1.11x) | 7.60 (0.88x) | 10.68 (1.05x) | 4.05 (1.04x) | 1.76 (0.93x) | 2.81 (0.73x) |
| `frontal-collision` | 18.76 (1.17x) | 6.41 (0.74x) | 9.39 (0.93x) | 3.12 (0.80x) | 2.38 (1.26x) | 2.56 (0.67x) |
| `drifted` | 14.48 (0.91x) | 9.67 (1.12x) | 11.84 (1.17x) | 4.71 (1.21x) | 1.57 (0.83x) | 2.53 (0.66x) |
| `grenade` | 24.38 (1.53x) | 7.43 (0.86x) | 7.19 (0.71x) | 2.50 (0.64x) | 1.29 (0.68x) | 2.31 (0.60x) |

Mean body-zone severity (metal + surface + finish, higher is worse). This is where the
concentration is loud:

| pattern | bonnet | boot | left | right | roof |
| --- | --- | --- | --- | --- | --- |
| `garaged` | 3.16 | 3.29 | 3.21 | 3.02 | 3.06 |
| `neglected-commuter` | 3.33 | 3.28 | 2.91 | 2.70 | 3.25 |
| `frontal-collision` | 4.71 | 2.84 | 3.66 | 3.65 | 2.17 |
| `drifted` | 2.34 | 4.05 | 3.51 | 3.46 | 2.04 |
| `grenade` | 3.06 | 3.21 | 3.12 | 2.90 | 2.94 |

The symptom draw reads the same pattern (`symptomDrawWeight`, bias
0.6). A symptom is classified by the taxonomy
group its own highest-weight causes sit in. Share of cars carrying at least one such symptom:

| pattern | any symptom | engine | drivetrain | suspension | wheels | body | interior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `garaged` | 53.0% | 29.0% | 5.3% | 15.8% | 3.0% | 2.0% | 4.0% |
| `neglected-commuter` | 52.5% | 29.0% | 4.3% | 16.8% | 3.3% | 1.3% | 3.8% |
| `frontal-collision` | 53.3% | 31.5% | 4.0% | 13.0% | 2.3% | 4.0% | 3.8% |
| `drifted` | 52.8% | 24.0% | 7.2% | 19.5% | 4.3% | 1.3% | 2.8% |
| `grenade` | 52.3% | 37.8% | 4.8% | 6.5% | 0.8% | 1.8% | 4.5% |

The question the design asks directly, front end against drivetrain. Front end here is a symptom
whose causes are dominated by `body` or `suspension`; drivetrain is `drivetrain` or
`wheels`:

| pattern | front-end symptom | driveline symptom | ratio |
| --- | --- | --- | --- |
| `garaged` | 17.8% | 8.3% | 2.15 |
| `neglected-commuter` | 18.0% | 7.5% | 2.40 |
| `frontal-collision` | 17.0% | 6.3% | 2.72 |
| `drifted` | 20.8% | 11.5% | 1.80 |
| `grenade` | 8.3% | 5.5% | 1.50 |

Two cars from different seeds (108 and 1), each the most
characteristic example of its own pattern in the sample.

**The two slot-by-slot listings below, and the symptom tables under them, predate the condition
offset** and were not re-measured with it. Their shape is still the claim (a shunted car's front
end against a drifted car's driveline); their individual bands are one generation behind. The
group and zone tables above are current.

### A shunted car, in full

Generation seed 108. Nissan Silvia (S13), 1990, 35,895 km, history `rough`, pattern `frontal-collision`. Expected band
`fine`; bill to that band ¥57,110; market value
¥428,487.

| slot | group | band | grade |
| --- | --- | --- | --- |
| `block` | engine | worn | stock |
| `internals` | engine | worn | stock |
| `headValvetrain` | engine | fine | stock |
| `camsTiming` | engine | worn | stock |
| `intake` | engine | worn | stock |
| `exhaust` | engine | fine | stock |
| `fuelSystem` | engine | worn | stock |
| `ignitionEcu` | engine | worn | stock |
| `cooling` | engine | worn | stock |
| `forcedInduction` | engine | worn | stock |
| `gearbox` | drivetrain | EMPTY | - |
| `clutch` | drivetrain | worn | stock |
| `differential` | drivetrain | worn | stock |
| `driveline` | drivetrain | worn | stock |
| `chassis` | drivetrain | poor | stock |
| `dampers` | suspension | poor | stock |
| `springs` | suspension | worn | stock |
| `antiRollBars` | suspension | poor | stock |
| `steering` | suspension | poor | stock |
| `brakePadsDiscs` | suspension | worn | sport |
| `brakeCalipersLines` | suspension | worn | stock |
| `rims` | wheels | worn | stock |
| `tyres` | wheels | fine | stock |
| `bodywork` | body | poor | stock |
| `paint` | body | poor | stock |
| `underbody` | body | poor | stock |
| `aero` | body | poor | race |
| `seats` | interior | fine | stock |
| `dashGauges` | interior | worn | stock |

Body zones (metal / surface / finish severity, 0 is perfect):

| zone | metal | surface | finish | primed |
| --- | --- | --- | --- | --- |
| `bonnet` | 3 | 2 | 3 | no |
| `boot` | 1 | 0 | 1 | no |
| `left` | 0 | 1 | 2 | no |
| `right` | 0 | 1 | 2 | no |
| `roof` | 0 | 0 | 0 | no |
| `chassis` | 3 | 2 | 1 | no |

Symptoms it came with:

| symptom | dominant cause group | causes still open |
| --- | --- | --- |
| `tick-at-idle` | engine | 4 |


### A drifted car, in full

Generation seed 1. Nissan Silvia (S13), 1991, 12,117 km, history `rough`, pattern `drifted`. Expected band
`fine`; bill to that band ¥25,440; market value
¥476,782.

| slot | group | band | grade |
| --- | --- | --- | --- |
| `block` | engine | fine | stock |
| `internals` | engine | poor | stock |
| `headValvetrain` | engine | worn | stock |
| `camsTiming` | engine | fine | stock |
| `intake` | engine | worn | stock |
| `exhaust` | engine | fine | street |
| `fuelSystem` | engine | fine | stock |
| `ignitionEcu` | engine | worn | stock |
| `cooling` | engine | fine | stock |
| `forcedInduction` | engine | fine | stock |
| `gearbox` | drivetrain | fine | stock |
| `clutch` | drivetrain | fine | stock |
| `differential` | drivetrain | fine | stock |
| `driveline` | drivetrain | worn | stock |
| `chassis` | drivetrain | worn | stock |
| `dampers` | suspension | fine | stock |
| `springs` | suspension | worn | stock |
| `antiRollBars` | suspension | fine | stock |
| `steering` | suspension | worn | stock |
| `brakePadsDiscs` | suspension | fine | sport |
| `brakeCalipersLines` | suspension | fine | stock |
| `rims` | wheels | poor | stock |
| `tyres` | wheels | worn | stock |
| `bodywork` | body | poor | stock |
| `paint` | body | poor | stock |
| `underbody` | body | worn | stock |
| `aero` | body | worn | stock |
| `seats` | interior | fine | stock |
| `dashGauges` | interior | fine | stock |

Body zones (metal / surface / finish severity, 0 is perfect):

| zone | metal | surface | finish | primed |
| --- | --- | --- | --- | --- |
| `bonnet` | 1 | 1 | 2 | no |
| `boot` | 3 | 2 | 3 | no |
| `left` | 2 | 1 | 1 | no |
| `right` | 1 | 0 | 1 | no |
| `roof` | 0 | 0 | 0 | no |
| `chassis` | 0 | 0 | 2 | no |

Symptoms it came with:

| symptom | dominant cause group | causes still open |
| --- | --- | --- |
| `oil-pressure-flutter` | interior | 4 |


## 5. A channel is a buyer base

Both cars are all-mint, built through the real catalogue, at heat 100 and reputation tier
`local`. "Buyer drawn" is `likelyChannelBuyer` (the deterministic mode of the real
draw's own distribution); taste is `channelBuyerTaste`; channel price is
`valuateCarForBuyerViaChannel`. "Net at a fresh offer" is that price times
`qualityMeanFor(0)` = 0.96, less the listing fee that was paid up
front. The trade network has no persona at all and prices a flat band around plain
`marketValueYen`; the mid-band is shown.

Price is not the whole story, so read these tables with the channels' own terms alongside them:

| channel | matched buyers only | draw cadence | needs a forecourt slot |
| --- | --- | --- | --- |
| `shopFront` | no | daily, factor 0.7 | yes |
| `freeAdsPaper` | no | daily, factor varies by rarity | yes |
| `tunerMagazine` | yes, taste under 1 draws nothing at all | daily, factor 0.6 | yes |
| `tradeNetwork` | no | daily, factor 3 | no |
| `weekendMeet` | yes, taste under 1 draws nothing at all | one draw per meet day | yes |

### Suzuki Alto Works (HA21S) (entry, a kei, lightly dressed)

Power 64 PS, handling 20, style 47, reliability
91, authenticity 79. Taste-free market value ¥405,709.

| channel | buyer drawn | why they are in the pool | taste | ceiling | fee | channel price | net at a fresh offer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `shopFront` | first-timer | stated (1) | 1.0000 | 1.00 | ¥0 | ¥405,709 | ¥389,481 |
| `freeAdsPaper` | first-timer | stated (1) | 1.0500 | 1.05 | ¥1,500 | ¥425,994 | ¥407,454 |
| `tunerMagazine` | tuner | pool widening only | 1.0456 | 1.17 | ¥12,000 | ¥424,219 | ¥395,250 |
| `tradeNetwork` | the trade | n/a | n/a | n/a | ¥0 | ¥399,623 | ¥399,623 |
| `weekendMeet` | stancer | pool widening only | 1.1002 | 1.17 | ¥3,000 | ¥446,348 | ¥425,494 |

Best channel for this car on price: `weekendMeet`. How well the car actually matches each archetype (`tasteMatchFor`, the raw 0 to 1 score
before any channel band is applied), against whether that archetype has any stated interest in this
league of car at all:

| archetype | stated interest in this tier | taste match |
| --- | --- | --- |
| collector | none, reachable only by pool widening | 0.880 |
| tuner | none, reachable only by pool widening | 0.571 |
| stancer | none, reachable only by pool widening | 0.759 |
| racer | none, reachable only by pool widening | 0.461 |
| first-timer | 1 | 0.940 |
| hobbyist | 1 | 0.821 |

### Mazda RX-7 (FD3S) (enthusiast, an enthusiast car with a supported power build)

Power 335 PS, handling 51, style 90, reliability
63, authenticity 78. Taste-free market value ¥1,565,860.

| channel | buyer drawn | why they are in the pool | taste | ceiling | fee | channel price | net at a fresh offer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `shopFront` | tuner | stated (0.6) | 1.0000 | 1.00 | ¥0 | ¥1,606,538 | ¥1,542,276 |
| `freeAdsPaper` | first-timer | pool widening only | 1.0500 | 1.05 | ¥1,500 | ¥1,644,153 | ¥1,576,887 |
| `tunerMagazine` | tuner | stated (0.6) | 1.1645 | 1.17 | ¥12,000 | ¥1,870,810 | ¥1,783,978 |
| `tradeNetwork` | the trade | n/a | n/a | n/a | ¥0 | ¥1,542,372 | ¥1,542,372 |
| `weekendMeet` | stancer | stated (0.5) | 1.1700 | 1.17 | ¥3,000 | ¥1,927,244 | ¥1,847,154 |

Best channel for this car on price: `weekendMeet`. How well the car actually matches each archetype (`tasteMatchFor`, the raw 0 to 1 score
before any channel band is applied), against whether that archetype has any stated interest in this
league of car at all:

| archetype | stated interest in this tier | taste match |
| --- | --- | --- |
| collector | 0.3 | 0.858 |
| tuner | 0.6 | 0.981 |
| stancer | 0.5 | 1.000 |
| racer | 0.6 | 0.887 |
| first-timer | none, reachable only by pool widening | 0.751 |
| hobbyist | none, reachable only by pool widening | 0.867 |

## 6. A week of running the shop

Every week of the shipped two-car worked example (`runWorkedExample`, career seed
1995), read straight off `state.financeLedger` - the same accumulator the in-game
cost sheet renders. The last two columns are the reconciliation: `netCashYen(week)` =
income minus the four out-buckets, against the shop's real bank balance at the two week boundaries,
taken from the run's own cash trail.

| week | income | on cars | stock | running | investment | net | cash actually moved | identity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ¥194,314 | ¥336,820 | ¥23,160 | ¥23,000 | ¥0 | -¥188,666 | -¥188,666 | holds |
| 2 | ¥400,489 | ¥30,100 | ¥32,820 | ¥8,000 | ¥0 | ¥329,569 | ¥329,569 | holds |

The run covers days 1 to 14, which is 2 weeks at
7 days each. Starting cash ¥300,000, closing cash
¥440,903, weekly rent at the new-game bay count ¥20,000.
Rent lands once a week on day 7 of the week, which is why the running
line differs between the two rows.

## 7. The core loop, end to end

One car, bought at auction and repaired as far as a day-one shop's tier-1 tools reach, then FORKED:
one copy is listed and sold as repaired, the other has a build fitted first and is then listed and
sold. Both forks start from the identical post-repair `GameState`, so the only difference between
the two rows is the build. Every figure is the sim's own `CarLedger` at the moment of sale, and
the sale is a real drawn offer accepted through `resolveSellViaWalkIn`, not a modelled price.

### Suzuki Wagon R (CT21S) (entry, local-yard rooms, generation seed 26)

A 1993 car with 23,588 km. The room's anchor was
¥200,987; reserve ¥120,592, buyout ¥200,987; it was bought at the
reserve. At purchase its bill to the expected band (`fine`) was
¥27,540 and its market value ¥199,550. Repair target
`fine`. Machine-shop hire over the repair: ¥3,000 (a shop running
cost, never on the car's ledger).

| route | auction | repair | parts | listing fee | sold for | net | buyer | days held |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| repair-only | -¥120,592 | -¥9,160 | -¥3,580 | ¥0 | ¥188,160 | ¥54,828 | racer | 6 |
| modified | -¥120,592 | -¥9,160 | -¥21,380 | ¥0 | ¥194,314 | ¥43,182 | racer | 6 |

Taste-free market value along the way, so the two routes can be compared at one instant:

| route | value at listing | value on the day it sold | heat that day | sold for | sold / value |
| --- | --- | --- | --- | --- | --- |
| repair-only | ¥218,752 | ¥218,752 | 100% | ¥188,160 | 0.860 |
| modified | ¥225,094 | ¥225,094 | 100% | ¥194,314 | 0.863 |

This tier's `aftermarketReturn` is 0.3 and its `beyondDiscount`
0.4. Fitting 4 parts cost
¥21,380, lifted the taste-free value at listing by
¥6,342, and changed the net by
-¥11,646.

What a day-one shop could not reach: ¥8,800 of the original
¥27,540 bill was still outstanding at listing.
¥8,800 of that is body-zone work, which is priced off the zone
table rather than off a part's band, so it can be outstanding even when `bodywork`, `paint` and
`underbody` all read at the expected band. The rest sits on these slots:

| slot | band left at | why |
| --- | --- | --- |
| none | - | every part reached the band; the remainder is body-zone work |

### Nissan Silvia (S13) (everyday, regional rooms, generation seed 9)

A 1989 car with 71,594 km. The room's anchor was
¥324,446; reserve ¥194,668, buyout ¥324,446; it was bought at the
reserve. At purchase its bill to the expected band (`fine`) was
¥115,640 and its market value ¥324,446. Repair target
`fine`. Machine-shop hire over the repair: ¥8,000 (a shop running
cost, never on the car's ledger).

| route | auction | repair | parts | listing fee | sold for | net | buyer | days held |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| repair-only | -¥194,668 | -¥41,000 | -¥11,720 | ¥0 | ¥333,704 | ¥86,316 | stancer | 6 |
| modified | -¥194,668 | -¥41,000 | -¥32,820 | ¥0 | ¥406,223 | ¥137,735 | racer | 8 |

Taste-free market value along the way, so the two routes can be compared at one instant:

| route | value at listing | value on the day it sold | heat that day | sold for | sold / value |
| --- | --- | --- | --- | --- | --- |
| repair-only | ¥377,520 | ¥377,520 | 100% | ¥333,704 | 0.884 |
| modified | ¥384,458 | ¥408,733 | 105% | ¥406,223 | 0.994 |

This tier's `aftermarketReturn` is 0.6 and its `beyondDiscount`
0.8. Fitting 4 parts cost
¥32,820, lifted the taste-free value at listing by
¥6,938, and changed the net by
¥51,419.

What a day-one shop could not reach: ¥61,460 of the original
¥115,640 bill was still outstanding at listing.
¥0 of that is body-zone work, which is priced off the zone
table rather than off a part's band, so it can be outstanding even when `bodywork`, `paint` and
`underbody` all read at the expected band. The rest sits on these slots:

| slot | band left at | why |
| --- | --- | --- |
| `block` | poor | assembly-gated (engineAssembly) |
| `internals` | scrap | scrap: replace-only, a purchase not a repair |
| `headValvetrain` | poor | assembly-gated (engineAssembly) |
| `camsTiming` | poor | assembly-gated (engineAssembly) |
| `fuelSystem` | scrap | scrap: replace-only, a purchase not a repair |
| `ignitionEcu` | scrap | scrap: replace-only, a purchase not a repair |
| `forcedInduction` | poor | not reached by this run |
| `gearbox` | scrap | scrap: replace-only, a purchase not a repair |
| `driveline` | scrap | scrap: replace-only, a purchase not a repair |
| `brakePadsDiscs` | scrap | scrap: replace-only, a purchase not a repair |
| `seats` | poor | not reached by this run |
| `dashGauges` | scrap | scrap: replace-only, a purchase not a repair |

## What the measurement says that the story does not

These came out of the numbers above rather than out of the design. They are here because a finding
that something did not work is worth more than a clean table.

1. A lot with nothing worth doing to it barely exists. The highest "under 3 parts below the expected band" rate of the four rooms is 5.5% at `premium`. Every other room is lower. Whatever else the arc did, it did not leave the player buying finished cars.

2. Age does not separate the top two rooms at all: `premium` averages 2.8 years and `collector-network` 2.8. A collector room selling cars two to three years old is a roster artefact, not a design decision: the shipped 26-car roster is dense in early-90s cars, so at game year 1995 the expensive rooms draw near-new stock. It will move when the roster fills out, and nothing in the arc touches it.

3. The Toyota 2000GT the brief asked for is not in shipped content. `cars.json` carries 26 cars and the 2000GT is not one of them; it lives in the roster CSV and the design docs only. The RX-7 FD3S (styleBase 82) stands in as the roster's highest-style car.

4. 1 of the 26 shipped cars cannot clear ANY of the four real style bars even fully built, because its `styleCeiling` sits below the lowest of them (the tuner's 45): Suzuki Wagon R (CT21S), ceiling 44. That is a legitimate design position, but it means style is not an axis that car can climb into anybody's want list, only one it can climb within.

5. **FIXED, Sprint 158.** The style axis was short. Saturation was 60 points and the 3 race-grade parts carrying the most style (aero 30, rims 20, seats 18) already totalled 68, so 3 slots took any car to its own `styleCeiling` and every style point fitted after that was worth exactly nothing. The catalogue was the deeper half of it: 19 SKU families in 5 slots, with the loudest three holding 83 per cent of the points. Style now sits on 10 slots totalling 88 points, top three at 47.7 per cent, against a saturation of 66. Three parts buy half a car's gap, five buy four fifths, seven buy all of it.

6. **FIXED, Sprint 158, and the cause was not the one named here.** A damage pattern showed up far more strongly in the body zones (1.47x) than in the mechanical groups (1.26x). Shallow-first was NOT flattening it: measured stage by stage, the budget's own allocation already landed within a few points of the authored group weights. The pattern simply never reached the other 78 per cent of a car's band steps, which come from a per-part condition roll that had no reference to what happened to the car. The roll now takes the pattern's offset (`patternConditionOffsets`), the widest per-group shift is 1.53x against the zones' 1.49x, and total damage still varies only 1.058 across patterns.

7. On the Suzuki Alto Works (HA21S) (entry), `tuner` and `stancer` are the likeliest arrival on at least one channel despite having NO stated interest in this tier at all, reaching the car only through that channel's `poolWidening`. Meanwhile `hobbyist`, which does state a preference for this tier, is never the likeliest arrival anywhere. A channel's `buyerPoolWeights` currently outweigh a buyer's own stated tier interest. That matters most here: the arc added `hobbyist` specifically for this league of car, and on a kei it still never comes first.

8. On the Mazda RX-7 (FD3S) (enthusiast), `first-timer` is the likeliest arrival on at least one channel despite having NO stated interest in this tier at all, reaching the car only through that channel's `poolWidening`. Meanwhile `collector` and `racer`, which do state a preference for this tier, are never the likeliest arrival anywhere. A channel's `buyerPoolWeights` currently outweigh a buyer's own stated tier interest.

9. Modifying is not always the better route, and that is the arc working rather than failing: on the Suzuki Wagon R (CT21S) (entry, `aftermarketReturn` 0.3) the modified route netted -¥11,646 against repairing alone. The tier gradient in `aftermarketReturn` is doing exactly what it says on the tin: the economy pays you to fix a cheap car and charges you to modify one.
