# Two cars, end to end, generated from the shipped sim

This document is **generated**, not written: every number in it comes from executing the shipped resolvers in `packages/sim`, once, on a fixed seed. Nothing here is a hand-recomputed formula. Regenerate it with:

```
WORKED_EXAMPLE_WRITE=1 pnpm test packages/sim/tests/workedExample.test.ts
```

(PowerShell: `$env:WORKED_EXAMPLE_WRITE=1; pnpm test packages/sim/tests/workedExample.test.ts`.)

## Plain language, first

The shop opens with ¥300,000. It buys a rough 1993 Suzuki Wagon R (CT21S) for ¥122,265, spends ¥30,850 putting it right and dressing it up, and sells it on day 3 for ¥215,343. It then buys a tidy 1989 Nissan Silvia (S13) for ¥253,208, spends ¥59,410 on it, and sells that on day 8 for ¥490,397. Rent takes ¥20,000 over the same 8 days regardless of what the shop does. The till finishes at ¥520,007: **¥220,007 made in 8 days**, out of two cars and no other income at all.

## Seeds and assumptions

| Input | Value |
|---|---|
| Career seed | `1995` (also the base of every day's stream: `advanceDay` is called with `seed + day`) |
| Suzuki Wagon R (CT21S) lot generation seed | `26` |
| Nissan Silvia (S13) lot generation seed | `9` |
| Calendar year | 1995 (reputation `unknown`) |
| Starting cash | ¥300,000 |
| Bays | 1 service, 3 parking, 2 forecourt (the new-game counts; none bought) |
| Tools | tier 1 on all six lines; none upgraded |
| Staff | none hired |
| Reputation | `unknown` throughout |
| Weekly rent at these bays | ¥20,000 (`computeWeeklyRentYen`) |

Deliberate limits of this run, stated so nothing reads as a claim it is not:

- **Nissan Silvia (S13)** came up carrying a symptom; the run buys and repairs it exactly as it would any other car, with no diagnosis played. A symptomatic lot prices through `sheetGuideValueYen` rather than `marketValueYen`, off the car as the room SEES it, which adds a negative `fear` line to the room ledger and puts a diagnosis game on top. Its guide value therefore does not match its own first value rung, and the gap is the diagnosis game rather than a discrepancy.
- The opening auction catalogue and the day-1 service-job board are cleared before the run starts, so the two scripted lots are the only lots and no service job, story mission or staff retainer can pay into the till by accident. The test asserts all three streams stayed empty.
- Both cars are settled at the **auction reserve**, the bottom of the band a live room can produce. Each car section prices the desk buyout alongside it.
- The shop never books the engine, drivetrain or body machine-shop hires, so buried engine internals, the gearbox and welding are all out of reach. What that leaves behind is itemised per car.

## Headline

|  | Suzuki Wagon R (CT21S) | Nissan Silvia (S13) |
|---|---|---|
| Tier / culture | entry / Kei | everyday / Drift |
| Book value | ¥230,000 | ¥500,000 |
| Condition bought | rough | tidy |
| Paid (auction reserve) | ¥122,265 | ¥253,208 |
| Desk buyout would have been | ¥203,775 | ¥422,013 |
| Rung 1 - as bought | ¥203,775 | ¥423,540 |
| Rung 2 - repaired | ¥212,971 | ¥449,717 |
| Rung 3 - modified | ¥219,472 | ¥467,045 |
| Repair charges (`repairYen`) | ¥5,100 | ¥12,980 |
| Parts (`partsYen`) | ¥20,750 | ¥31,930 |
| Listing fees (`listingFeesYen`) | ¥0 | ¥1,500 |
| Sold for | ¥215,343 | ¥490,397 |
| **Net (ledger)** | **¥67,228** | **¥190,779** |
| Labour spent (energy points) | 72 | 179 |
| Days owned | 2 | 5 |

**Fixed overheads, held out of both margins.** Rent is a function of bays owned, not of any one car: ¥20,000 a week at 1 service, 3 parking and 2 forecourt bays, charged on `calendar.rentDayOfWeek`. Over this run it took ¥20,000. That is what the week costs whatever the shop does with it, and it is never subtracted from a car's margin above.

## Car A: Suzuki Wagon R (CT21S)

**Tier** entry - **culture** Kei - **1993, 23,588 km** - lot `worked-car-a-26`, generated at seed `26`.

**Why this car.** The cheapest thing a day-one shop can reach, and bought rough: entry tier, Kei culture, ¥230,000 of book value. Its tier expects only `worn`, its `beyondDiscount` is 0.4 and its `aftermarketReturn` is 0.3 - so it is the car the economy pays you to fix and charges you to modify.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥203,775 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥122,265 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥203,775 |
| Attendance fee (local-yard) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥122,265** |

The realised price of a live-room win lands **somewhere between ¥122,265 and ¥203,775**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥81,510 more.

It arrived carrying somebody else's parts: `camsTiming` Raiden Sport Cams (sport, fine), `antiRollBars` Kumo Sport Sway Bars (sport, worn), `steering` Kitsune Sport Rack (sport, worn). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 1 | Repair labour charges | Bench recondition: intake to worn | -¥250 |
| day 1 | Repair labour charges | Bench recondition: fuelSystem to worn | -¥250 |
| day 1 | Repair labour charges | Bench recondition: driveline to worn | -¥420 |
| day 1 | Repair labour charges | Bench recondition: springs to worn | -¥250 |
| day 1 | Body-pipeline materials | Body pipeline fillAndSand on chassis | -¥1,900 |
| day 1 | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 |
| day 1 | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 |
| day 1 | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 |
| day 1 | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 |
| day 1 | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 |
| day 1 | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 |
| day 1 | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 |

Work spend, all categories: **¥30,850**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **72 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 1 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |

A machine-shop hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from: hiring the engine crane for a day can pull four engines, so it belongs to no single one of them.

### 3. The value ladder

#### Rung 1: As bought (day 1, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥13,130 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥22,568 |
| Stage C coherence discount | `coherence` | -¥6,056 |
| Stage D aftermarket premium | `aftermarket` | ¥4,029 |
| **Total (`marketValueYen`)** |  | **¥203,775** |

Restoration bill still owed to the `worn` band the tier expects: ¥10,100.

#### Rung 2: Repaired (day 1, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥7,449 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥23,848 |
| Stage C coherence discount | `coherence` | -¥6,186 |
| Stage D aftermarket premium | `aftermarket` | ¥8,954 |
| **Total (`marketValueYen`)** |  | **¥212,971** |

Restoration bill still owed to the `worn` band the tier expects: ¥5,730.

#### Rung 3: Modified (day 2, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥7,449 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥22,832 |
| Stage C coherence discount | `coherence` | -¥6,216 |
| Stage D aftermarket premium | `aftermarket` | ¥14,469 |
| **Total (`marketValueYen`)** |  | **¥219,472** |

Restoration bill still owed to the `worn` band the tier expects: ¥5,730.

#### What decides the aftermarket premium

| Rung | Support headline | coherenceFactor | retentionFor | foundationFactor | aftermarketReturn | installedPartsValueYen | Credited premium |
|---|---|---|---|---|---|---|---|
| As bought | 0.861 | 0.916 | 1.033 | 0.45 | 0.30 | ¥29,846 | ¥4,029 |
| Repaired | 0.861 | 0.916 | 1.033 | 1.00 | 0.30 | ¥29,846 | ¥8,954 |
| Modified | 0.861 | 0.916 | 1.033 | 1.00 | 0.30 | ¥48,229 | ¥14,469 |

The credited premium is `foundationFactor x aftermarketReturn x installedPartsValueYen`, and `installedPartsValueYen` is itself every non-stock part's catalogue price times `retentionFor(coherenceFactor)`. All three gates multiply, so any one of them at zero takes the whole premium with it.

#### The build

| Slot | Part | Grade | List price | Paid | Express surcharge |
|---|---|---|---|---|---|
| `aero` | Mikoshi Lip Kit | street | ¥4,700 | ¥5,170 | ¥470 |
| `exhaust` | Suzaku Street Catback | street | ¥7,300 | ¥8,030 | ¥730 |
| `intake` | Fubuki Cold Air Intake Kit | street | ¥3,300 | ¥3,630 | ¥330 |
| `cooling` | Suiko Sport Radiator | street | ¥2,500 | ¥2,750 | ¥250 |

Parts total ¥19,580; the ladder above credits ¥5,515 of it back into the car's value.

#### What the shop could not reach

| Slot | Band | Why it stayed there |
|---|---|---|
| `gearbox` | poor | assembly-gated (gearboxAssembly): worked only through the drivetrain line |
| `panels` | poor | body pipeline capped: metal is labour-only and welding needs the body line |
| `paint` | poor | body pipeline capped: metal is labour-only and welding needs the body line |
| `seats` | poor | signature slot: needs the interior line hired |

Remaining bill to the expected band: **¥5,730**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `shopFront` |
| Listing fee | ¥0 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 1 day |
| Buyer archetype | `kei-specialist` |
| Buyer taste (through the channel ceiling) | 1.0000 |
| Offer quality fraction drawn | 0.9812 |
| **Final `priceYen`** | **¥215,343** |

#### The same car, the same buyer, every channel

| Channel | Fee | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | 1.00 | no | 1.0000 | ¥219,472 | - |
| `freeAdsPaper` | ¥1,500 | 1.05 | no | 1.0355 | ¥227,269 | ¥6,297 |
| `tunerMagazine` | ¥12,000 | 1.17 | yes | 1.0679 | ¥234,380 | ¥2,908 |
| `tradeNetwork` | ¥0 | n/a (flat `priceBand`) | no | n/a | ¥219,472 | ¥0 |
| `weekendMeet` | ¥3,000 | 1.17 | yes | 1.0679 | ¥234,380 | ¥11,908 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥122,265 |
| `repairYen` | ¥5,100 |
| `partsYen` | ¥20,750 |
| `listingFeesYen` | ¥0 |
| Sale `priceYen` | ¥215,343 |
| **Net** | **¥67,228** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥5,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥62,228** to the bank.

## Car B: Nissan Silvia (S13)

**Tier** everyday - **culture** Drift - **1989, 71,594 km** - lot `worked-car-b-9`, generated at seed `9`.

**Why this car.** Everything the Wagon R is not, and bought tidy rather than rough: everyday tier, Drift culture, ¥500,000 of book value. Its tier expects `fine`, its `beyondDiscount` is 0.8 and its `aftermarketReturn` is 0.6, so a coherent build gets twice the credit it would on the kei, and the tuner/racer/stancer crowd it draws will pay for it.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥422,013 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥253,208 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥422,013 |
| Attendance fee (regional) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥253,208** |

The realised price of a live-room win lands **somewhere between ¥253,208 and ¥422,013**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥168,805 more.

It arrived carrying somebody else's part: `brakePadsDiscs` Shuriken Sport Pads & Discs (sport, fine). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 4 | Repair labour charges | Bench recondition: brakeCalipersLines to fine | -¥720 |
| day 5 | Repair labour charges | Bench recondition: intake to fine | -¥290 |
| day 5 | Repair labour charges | Bench recondition: exhaust to fine | -¥1,280 |
| day 5 | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥450 |
| day 5 | Repair labour charges | Bench recondition: cooling to fine | -¥220 |
| day 5 | Repair labour charges | Bench recondition: dampers to fine | -¥640 |
| day 6 | Repair labour charges | Bench recondition: springs to fine | -¥290 |
| day 6 | Repair labour charges | Bench recondition: antiRollBars to fine | -¥190 |
| day 6 | Repair labour charges | Bench recondition: steering to fine | -¥350 |
| day 6 | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥2,080 |
| day 3 | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 |
| day 3 | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 |
| day 3 | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 |
| day 3 | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 |
| day 3 | Body-pipeline materials | Body pipeline prime on right | -¥1,200 |
| day 3 | Body-pipeline materials | Body pipeline paint on right | -¥2,500 |
| day 3 | Body-pipeline materials | Body pipeline polish on right | -¥800 |
| day 4 | Parts | Part ordered standard: stock-tyres | -¥3,500 |
| day 6 | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 |
| day 6 | Parts | Part ordered standard: suiko-street-radiator | -¥2,900 |
| day 6 | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 |
| day 6 | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 |
| day 6 | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 |
| day 5 | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 |
| day 5 | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 |
| day 6 | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 |

Work spend, all categories: **¥57,910**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **179 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 5 | `wheels` | ¥3,000 | mounting a fresh tyre onto the rim on the bench |
| day 5 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |
| day 6 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |

A machine-shop hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from: hiring the engine crane for a day can pull four engines, so it belongs to no single one of them.

### 3. The value ladder

#### Rung 1: As bought (day 3, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥40,456 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥24,680 |
| Stage D aftermarket premium | `aftermarket` | ¥3,168 |
| **Total (`marketValueYen`)** |  | **¥423,540** |

Restoration bill still owed to the `fine` band the tier expects: ¥31,120.

#### Rung 2: Repaired (day 6, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥8,359 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥30,600 |
| Stage D aftermarket premium | `aftermarket` | ¥3,168 |
| **Total (`marketValueYen`)** |  | **¥449,717** |

Restoration bill still owed to the `fine` band the tier expects: ¥6,430.

#### Rung 3: Modified (day 7, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥8,359 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥29,112 |
| Stage D aftermarket premium | `aftermarket` | ¥19,008 |
| **Total (`marketValueYen`)** |  | **¥467,045** |

Restoration bill still owed to the `fine` band the tier expects: ¥6,430.

#### What decides the aftermarket premium

| Rung | Support headline | coherenceFactor | retentionFor | foundationFactor | aftermarketReturn | installedPartsValueYen | Credited premium |
|---|---|---|---|---|---|---|---|
| As bought | 1.000 | 1.000 | 1.100 | 1.00 | 0.60 | ¥5,280 | ¥3,168 |
| Repaired | 1.000 | 1.000 | 1.100 | 1.00 | 0.60 | ¥5,280 | ¥3,168 |
| Modified | 0.940 | 1.000 | 1.100 | 1.00 | 0.60 | ¥31,680 | ¥19,008 |

The credited premium is `foundationFactor x aftermarketReturn x installedPartsValueYen`, and `installedPartsValueYen` is itself every non-stock part's catalogue price times `retentionFor(coherenceFactor)`. All three gates multiply, so any one of them at zero takes the whole premium with it.

#### The build

| Slot | Part | Grade | List price | Paid | Express surcharge |
|---|---|---|---|---|---|
| `fuelSystem` | Koi Fuel Dynamics Street Injector Kit | street | ¥3,700 | ¥3,700 | - |
| `cooling` | Suiko Sport Radiator | street | ¥2,900 | ¥2,900 | - |
| `intake` | Fubuki Cold Air Intake Kit | street | ¥3,700 | ¥3,700 | - |
| `exhaust` | Suzaku Street Catback | street | ¥8,300 | ¥8,300 | - |
| `aero` | Mikoshi Lip Kit | street | ¥5,400 | ¥5,400 | - |

Parts total ¥24,000; the ladder above credits ¥15,840 of it back into the car's value.

#### What the shop could not reach

| Slot | Band | Why it stayed there |
|---|---|---|
| `block` | worn | assembly-gated (engineAssembly): worked only through the engine line |
| `headValvetrain` | worn | assembly-gated (engineAssembly): worked only through the engine line |
| `forcedInduction` | worn | not reached by this run |
| `seats` | poor | signature slot: needs the interior line hired |
| `dashGauges` | worn | signature slot: needs the interior line hired |

Remaining bill to the expected band: **¥6,430**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `freeAdsPaper` |
| Listing fee | ¥1,500 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 1 day |
| Buyer archetype | `stancer` |
| Buyer taste (through the channel ceiling) | 1.0500 |
| Offer quality fraction drawn | 0.9506 |
| **Final `priceYen`** | **¥490,397** |

#### The same car, the same buyer, every channel

| Channel | Fee | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | 1.00 | no | 1.0000 | ¥491,320 | - |
| `freeAdsPaper` | ¥1,500 | 1.05 | no | 1.0500 | ¥515,886 | ¥23,066 |
| `tunerMagazine` | ¥12,000 | 1.17 | yes | 1.1312 | ¥555,783 | ¥52,463 |
| `tradeNetwork` | ¥0 | n/a (flat `priceBand`) | no | n/a | ¥491,320 | ¥0 |
| `weekendMeet` | ¥3,000 | 1.17 | yes | 1.1312 | ¥555,783 | ¥61,463 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥253,208 |
| `repairYen` | ¥12,980 |
| `partsYen` | ¥31,930 |
| `listingFeesYen` | ¥1,500 |
| Sale `priceYen` | ¥490,397 |
| **Net** | **¥190,779** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥13,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥177,779** to the bank.

## Staleness: what happens if it does not sell straight away

A side branch off Nissan Silvia (S13)'s listing snapshot: the same listing, the same seeds, walked 45 days without taking anything. Nothing here touches the career the ledger above reconciles - it is a hypothetical run of the same state.

| Day | `offersSeen` at the draw | Buyer | Quality fraction | Offer |
|---|---|---|---|---|
| 8 | 0 | `stancer` | 0.9506 | ¥490,397 |
| 9 | 1 | `first-timer` | 0.9906 | ¥511,032 |
| 10 | 2 | `first-timer` | 0.8793 | ¥453,597 |
| 11 | 3 | `racer` | 0.9608 | ¥495,654 |
| 14 | 4 | `kei-specialist` | 0.9449 | ¥487,484 |
| 15 | 5 | `stancer` | 0.8516 | ¥443,662 |
| 16 | 6 | `stancer` | 0.8950 | ¥466,296 |
| 19 | 7 | `first-timer` | 0.8600 | ¥448,046 |
| 25 | 8 | `stancer` | 0.8600 | ¥452,431 |
| 28 | 9 | `kei-specialist` | 0.9249 | ¥486,552 |
| 32 | 10 | `stancer` | 0.8611 | ¥461,767 |
| 33 | 11 | `tuner` | 0.8621 | ¥462,349 |
| 36 | 12 | `kei-specialist` | 0.8519 | ¥461,198 |
| 39 | 13 | `stancer` | 0.8600 | ¥465,583 |
| 40 | 14 | `kei-specialist` | 0.8600 | ¥465,583 |
| 41 | 15 | `first-timer` | 0.9232 | ¥499,821 |
| 44 | 16 | `first-timer` | 0.8628 | ¥467,080 |
| 45 | 17 | `tuner` | 0.8602 | ¥465,702 |
| 48 | 18 | `tuner` | 0.8600 | ¥465,583 |
| 51 | 19 | `tuner` | 0.8889 | ¥476,696 |

20 offers in 45 days. First offer **¥490,397** (day 8); best offer **¥511,032** (day 9). Holding out for the best one seen is worth **¥20,635** - and costs ¥140,000 of rent over the same stretch, plus a forecourt slot that could have held another car.

**Is there ever a point in not taking the first offer?** On these numbers, no. The quality fraction decays with `offersSeen` exactly as `qualityMeanFor` says it should (`qualityFresh` 0.96 down toward `qualityFloor` 0.86), so the OFFER side of the equation only ever gets worse. What moves the price up again is a different buyer walking in, not a better offer from the same one: the spread between archetypes on this car is far wider than the whole staleness decay. Waiting is therefore a bet on WHO turns up, at a known cost of ¥3,111 a day in rent alone, and the bet does not pay.

## The whole cash ledger

Every yen that moved, in order. This is the list the reconciliation test sums.

| Day | Scope | Category | Item | Yen | Balance |
|---|---|---|---|---|---|
| - | - | - | Opening cash | - | ¥300,000 |
| 1 | car-a | Acquisition | Hammer won on lot worked-car-a-26 | -¥122,265 | ¥177,735 |
| 1 | car-a | Body-pipeline materials | Body pipeline fillAndSand on chassis | -¥1,900 | ¥175,835 |
| 1 | car-a | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 | ¥174,635 |
| 1 | car-a | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 | ¥172,635 |
| 1 | car-a | Repair labour charges | Bench recondition: intake to worn | -¥250 | ¥172,385 |
| 1 | car-a | Repair labour charges | Bench recondition: fuelSystem to worn | -¥250 | ¥172,135 |
| 1 | car-a | Repair labour charges | Bench recondition: driveline to worn | -¥420 | ¥171,715 |
| 1 | car-a | Repair labour charges | Bench recondition: springs to worn | -¥250 | ¥171,465 |
| 1 | car-a | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 | ¥166,465 |
| 1 | car-a | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 | ¥161,295 |
| 1 | car-a | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 | ¥153,265 |
| 1 | car-a | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 | ¥149,635 |
| 1 | car-a | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 | ¥146,885 |
| 3 | car-a | Sale proceeds | Car sold: car-worked-car-a-26 | ¥215,343 | ¥362,228 |
| 3 | car-b | Acquisition | Hammer won on lot worked-car-b-9 | -¥253,208 | ¥109,020 |
| 3 | car-b | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 | ¥107,820 |
| 3 | car-b | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 | ¥105,320 |
| 3 | car-b | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 | ¥103,420 |
| 3 | car-b | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 | ¥102,620 |
| 3 | car-b | Body-pipeline materials | Body pipeline prime on right | -¥1,200 | ¥101,420 |
| 3 | car-b | Body-pipeline materials | Body pipeline paint on right | -¥2,500 | ¥98,920 |
| 3 | car-b | Body-pipeline materials | Body pipeline polish on right | -¥800 | ¥98,120 |
| 4 | car-b | Repair labour charges | Bench recondition: brakeCalipersLines to fine | -¥720 | ¥97,400 |
| 4 | car-b | Parts | Part ordered standard: stock-tyres | -¥3,500 | ¥93,900 |
| 5 | car-b | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 | ¥90,900 |
| 5 | car-b | Repair labour charges | Bench recondition: intake to fine | -¥290 | ¥90,610 |
| 5 | car-b | Repair labour charges | Bench recondition: exhaust to fine | -¥1,280 | ¥89,330 |
| 5 | car-b | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥450 | ¥88,880 |
| 5 | car-b | Repair labour charges | Bench recondition: cooling to fine | -¥220 | ¥88,660 |
| 5 | car-b | Repair labour charges | Bench recondition: dampers to fine | -¥640 | ¥88,020 |
| 5 | car-b | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 | ¥83,020 |
| 6 | car-b | Repair labour charges | Bench recondition: springs to fine | -¥290 | ¥82,730 |
| 6 | car-b | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 | ¥77,730 |
| 6 | car-b | Repair labour charges | Bench recondition: antiRollBars to fine | -¥190 | ¥77,540 |
| 6 | car-b | Repair labour charges | Bench recondition: steering to fine | -¥350 | ¥77,190 |
| 6 | car-b | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥2,080 | ¥75,110 |
| 6 | car-b | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 | ¥71,410 |
| 6 | car-b | Parts | Part ordered standard: suiko-street-radiator | -¥2,900 | ¥68,510 |
| 6 | car-b | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 | ¥64,810 |
| 6 | car-b | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 | ¥56,510 |
| 6 | car-b | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 | ¥51,110 |
| 7 | car-b | Listing fee | Listing fee (freeAdsPaper) | -¥1,500 | ¥49,610 |
| 7 | shop | Rent | Weekly rent | -¥20,000 | ¥29,610 |
| 8 | car-b | Sale proceeds | Car sold: car-worked-car-b-9 | ¥490,397 | ¥520,007 |

## Reconciliation

| Check | Yen |
|---|---|
| Opening cash | ¥300,000 |
| Sum of every ledger line above | ¥220,007 |
| **Closing cash, from the sim** | **¥520,007** |
| Difference | ¥0 |

The same total, decomposed the other way:

| Component | Yen |
|---|---|
| Suzuki Wagon R (CT21S) net (car ledger) | ¥67,228 |
| Nissan Silvia (S13) net (car ledger) | ¥190,779 |
| Rent | -¥20,000 |
| Machine-shop hire (running cost, not on any car ledger) | -¥18,000 |
| **Change in cash** | **¥220,007** |

Both identities are asserted to the yen, with no tolerance, in `packages/sim/tests/workedExample.test.ts`. The harness additionally refuses to continue if any single scripted step moves cash it cannot name, so an incomplete ledger fails loudly rather than balancing by accident.
