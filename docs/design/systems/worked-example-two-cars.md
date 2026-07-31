# Two cars, end to end, generated from the shipped sim

This document is **generated**, not written: every number in it comes from executing the shipped resolvers in `packages/sim`, once, on a fixed seed. Nothing here is a hand-recomputed formula. Regenerate it with:

```
WORKED_EXAMPLE_WRITE=1 pnpm test packages/sim/tests/workedExample.test.ts
```

(PowerShell: `$env:WORKED_EXAMPLE_WRITE=1; pnpm test packages/sim/tests/workedExample.test.ts`.)

## Plain language, first

The shop opens with ¥300,000. It buys a rough 1993 Suzuki Wagon R (CT21S) for ¥114,017, spends ¥36,940 putting it right and dressing it up, and sells it on day 6 for ¥199,359. It then buys a tidy 1989 Nissan Silvia (S13) for ¥247,505, spends ¥61,120 on it, and sells that on day 12 for ¥494,311. Rent takes ¥20,000 over the same 12 days regardless of what the shop does. The till finishes at ¥514,088: **¥214,088 made in 12 days**, out of two cars and no other income at all.

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
| Paid (auction reserve) | ¥114,017 | ¥247,505 |
| Desk buyout would have been | ¥190,029 | ¥412,508 |
| Rung 1 - as bought | ¥190,029 | ¥414,035 |
| Rung 2 - repaired | ¥209,824 | ¥475,512 |
| Rung 3 - modified | ¥216,403 | ¥492,840 |
| Repair charges (`repairYen`) | ¥7,280 | ¥18,600 |
| Parts (`partsYen`) | ¥24,660 | ¥33,020 |
| Listing fees (`listingFeesYen`) | ¥0 | ¥1,500 |
| Sold for | ¥199,359 | ¥494,311 |
| **Net (ledger)** | **¥53,402** | **¥193,686** |
| Labour spent (energy points) | 121 | 219 |
| Days owned | 5 | 6 |

**Fixed overheads, held out of both margins.** Rent is a function of bays owned, not of any one car: ¥20,000 a week at 1 service, 3 parking and 2 forecourt bays, charged on `calendar.rentDayOfWeek`. Over this run it took ¥20,000. That is what the week costs whatever the shop does with it, and it is never subtracted from a car's margin above.

## Car A: Suzuki Wagon R (CT21S)

**Tier** entry - **culture** Kei - **1993, 23,588 km** - lot `worked-car-a-26`, generated at seed `26`.

**Why this car.** The cheapest thing a day-one shop can reach, and bought rough: entry tier, Kei culture, ¥230,000 of book value. Its tier expects only `worn`, its `beyondDiscount` is 0.4 and its `aftermarketReturn` is 0.3 - so it is the car the economy pays you to fix and charges you to modify.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥190,029 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥114,017 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥190,029 |
| Attendance fee (local-yard) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥114,017** |

The realised price of a live-room win lands **somewhere between ¥114,017 and ¥190,029**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥76,012 more.

It arrived carrying somebody else's parts: `camsTiming` Raiden Sport Cams (sport, worn), `antiRollBars` Kumo Sport Sway Bars (sport, worn), `steering` Kitsune Sport Rack (sport, poor). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 2 | Repair labour charges | Bench recondition: brakeCalipersLines to worn | -¥630 |
| day 2 | Repair labour charges | Bench recondition: intake to worn | -¥250 |
| day 2 | Repair labour charges | Bench recondition: exhaust to worn | -¥560 |
| day 2 | Repair labour charges | Bench recondition: fuelSystem to worn | -¥250 |
| day 2 | Repair labour charges | Bench recondition: driveline to worn | -¥420 |
| day 3 | Repair labour charges | Bench recondition: springs to worn | -¥250 |
| day 3 | Repair labour charges | Bench recondition: steering to worn | -¥620 |
| day 3 | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥1,820 |
| day 3 | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥360 |
| day 1 | Body-pipeline materials | Body pipeline fillAndSand on chassis | -¥1,900 |
| day 1 | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 |
| day 1 | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 |
| day 1 | Parts | Part ordered standard: shitbox-stock-brake-pads-discs | -¥2,100 |
| day 3 | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 |
| day 3 | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 |
| day 3 | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 |
| day 3 | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 |
| day 3 | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 |

Work spend, all categories: **¥36,940**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **121 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 3 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |

A machine-shop hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from: hiring the engine crane for a day can pull four engines, so it belongs to no single one of them.

### 3. The value ladder

#### Rung 1: As bought (day 1, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥24,960 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥24,900 |
| Stage C coherence discount | `coherence` | -¥5,640 |
| Stage D aftermarket premium | `aftermarket` | ¥4,029 |
| **Total (`marketValueYen`)** |  | **¥190,029** |

Restoration bill still owed to the `worn` band the tier expects: ¥19,200.

#### Rung 2: Repaired (day 3, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥8,359 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥26,180 |
| Stage C coherence discount | `coherence` | -¥6,091 |
| Stage D aftermarket premium | `aftermarket` | ¥8,954 |
| **Total (`marketValueYen`)** |  | **¥209,824** |

Restoration bill still owed to the `worn` band the tier expects: ¥6,430.

#### Rung 3: Modified (day 3, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥8,359 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥25,084 |
| Stage C coherence discount | `coherence` | -¥6,123 |
| Stage D aftermarket premium | `aftermarket` | ¥14,469 |
| **Total (`marketValueYen`)** |  | **¥216,403** |

Restoration bill still owed to the `worn` band the tier expects: ¥6,430.

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
| `block` | poor | assembly-gated (engineAssembly): worked only through the engine line |
| `seats` | poor | signature slot: needs the interior line hired |

Remaining bill to the expected band: **¥6,430**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `shopFront` |
| Listing fee | ¥0 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 3 days |
| Buyer archetype | `kei-specialist` |
| Buyer taste (through the channel ceiling) | 1.0000 |
| Offer quality fraction drawn | 0.9212 |
| **Final `priceYen`** | **¥199,359** |

#### The same car, the same buyer, every channel

| Channel | Fee | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | 1.00 | no | 1.0000 | ¥216,403 | - |
| `freeAdsPaper` | ¥1,500 | 1.05 | no | 1.0332 | ¥223,593 | ¥5,690 |
| `tunerMagazine` | ¥12,000 | 1.17 | yes | 1.0651 | ¥230,501 | ¥2,098 |
| `tradeNetwork` | ¥0 | n/a (flat `priceBand`) | no | n/a | ¥216,403 | ¥0 |
| `weekendMeet` | ¥3,000 | 1.17 | yes | 1.0651 | ¥230,501 | ¥11,098 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥114,017 |
| `repairYen` | ¥7,280 |
| `partsYen` | ¥24,660 |
| `listingFeesYen` | ¥0 |
| Sale `priceYen` | ¥199,359 |
| **Net** | **¥53,402** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥5,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥48,402** to the bank.

## Car B: Nissan Silvia (S13)

**Tier** everyday - **culture** Drift - **1989, 71,594 km** - lot `worked-car-b-9`, generated at seed `9`.

**Why this car.** Everything the Wagon R is not, and bought tidy rather than rough: everyday tier, Drift culture, ¥500,000 of book value. Its tier expects `fine`, its `beyondDiscount` is 0.8 and its `aftermarketReturn` is 0.6, so a coherent build gets twice the credit it would on the kei, and the tuner/racer/stancer crowd it draws will pay for it.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥412,508 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥247,505 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥412,508 |
| Attendance fee (regional) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥247,505** |

The realised price of a live-room win lands **somewhere between ¥247,505 and ¥412,508**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥165,003 more.

It arrived carrying somebody else's part: `brakePadsDiscs` Shuriken Sport Pads & Discs (sport, fine). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 7 | Repair labour charges | Bench recondition: brakeCalipersLines to fine | -¥720 |
| day 8 | Repair labour charges | Bench recondition: intake to fine | -¥290 |
| day 8 | Repair labour charges | Bench recondition: exhaust to fine | -¥1,280 |
| day 8 | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥900 |
| day 8 | Repair labour charges | Bench recondition: cooling to fine | -¥220 |
| day 9 | Repair labour charges | Bench recondition: dampers to fine | -¥1,280 |
| day 9 | Repair labour charges | Bench recondition: springs to fine | -¥290 |
| day 9 | Repair labour charges | Bench recondition: antiRollBars to fine | -¥190 |
| day 9 | Repair labour charges | Bench recondition: steering to fine | -¥350 |
| day 9 | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥4,160 |
| day 10 | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥840 |
| day 6 | Body-pipeline materials | Body pipeline polish on chassis | -¥800 |
| day 6 | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 |
| day 6 | Body-pipeline materials | Body pipeline fillAndSand on roof | -¥1,900 |
| day 6 | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 |
| day 6 | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 |
| day 6 | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 |
| day 6 | Body-pipeline materials | Body pipeline prime on right | -¥1,200 |
| day 6 | Body-pipeline materials | Body pipeline paint on right | -¥2,500 |
| day 7 | Body-pipeline materials | Body pipeline polish on right | -¥800 |
| day 7 | Parts | Part ordered standard: stock-tyres | -¥3,500 |
| day 10 | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 |
| day 10 | Parts | Part ordered standard: suiko-street-radiator | -¥2,900 |
| day 10 | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 |
| day 10 | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 |
| day 10 | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 |
| day 8 | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 |
| day 9 | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 |

Work spend, all categories: **¥59,620**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **219 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 8 | `wheels` | ¥3,000 | mounting a fresh tyre onto the rim on the bench |
| day 9 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |

A machine-shop hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from: hiring the engine crane for a day can pull four engines, so it belongs to no single one of them.

### 3. The value ladder

#### Rung 1: As bought (day 6, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥52,299 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥20,600 |
| Stage D aftermarket premium | `aftermarket` | ¥1,426 |
| **Total (`marketValueYen`)** |  | **¥414,035** |

Restoration bill still owed to the `fine` band the tier expects: ¥40,230.

#### Rung 2: Repaired (day 10, market heat 105%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Market heat | `heat` | ¥24,275 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥8,359 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥29,080 |
| Stage D aftermarket premium | `aftermarket` | ¥3,168 |
| **Total (`marketValueYen`)** |  | **¥475,512** |

Restoration bill still owed to the `fine` band the tier expects: ¥6,430.

#### Rung 3: Modified (day 11, market heat 105%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Market heat | `heat` | ¥24,275 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥8,359 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥27,592 |
| Stage D aftermarket premium | `aftermarket` | ¥19,008 |
| **Total (`marketValueYen`)** |  | **¥492,840** |

Restoration bill still owed to the `fine` band the tier expects: ¥6,430.

#### What decides the aftermarket premium

| Rung | Support headline | coherenceFactor | retentionFor | foundationFactor | aftermarketReturn | installedPartsValueYen | Credited premium |
|---|---|---|---|---|---|---|---|
| As bought | 1.000 | 1.000 | 1.100 | 0.45 | 0.60 | ¥5,280 | ¥1,426 |
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
| Offer quality fraction drawn | 0.9552 |
| **Final `priceYen`** | **¥494,311** |

#### The same car, the same buyer, every channel

| Channel | Fee | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | 1.00 | no | 1.0000 | ¥492,840 | - |
| `freeAdsPaper` | ¥1,500 | 1.05 | no | 1.0500 | ¥517,482 | ¥23,142 |
| `tunerMagazine` | ¥12,000 | 1.17 | yes | 1.1312 | ¥557,503 | ¥52,663 |
| `tradeNetwork` | ¥0 | n/a (flat `priceBand`) | no | n/a | ¥492,840 | ¥0 |
| `weekendMeet` | ¥3,000 | 1.17 | yes | 1.1312 | ¥557,503 | ¥61,663 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥247,505 |
| `repairYen` | ¥18,600 |
| `partsYen` | ¥33,020 |
| `listingFeesYen` | ¥1,500 |
| Sale `priceYen` | ¥494,311 |
| **Net** | **¥193,686** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥8,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥185,686** to the bank.

## Staleness: what happens if it does not sell straight away

A side branch off Nissan Silvia (S13)'s listing snapshot: the same listing, the same seeds, walked 45 days without taking anything. Nothing here touches the career the ledger above reconciles - it is a hypothetical run of the same state.

| Day | `offersSeen` at the draw | Buyer | Quality fraction | Offer |
|---|---|---|---|---|
| 12 | 0 | `stancer` | 0.9552 | ¥494,311 |
| 13 | 1 | `kei-specialist` | 0.9839 | ¥509,132 |
| 15 | 2 | `stancer` | 0.8314 | ¥447,180 |
| 16 | 3 | `kei-specialist` | 0.9242 | ¥497,084 |
| 18 | 4 | `racer` | 0.9089 | ¥488,860 |
| 22 | 5 | `stancer` | 0.8440 | ¥462,571 |
| 23 | 6 | `kei-specialist` | 0.8600 | ¥471,339 |
| 25 | 7 | `first-timer` | 0.8813 | ¥483,040 |
| 26 | 8 | `stancer` | 0.8600 | ¥471,339 |
| 28 | 9 | `stancer` | 0.8600 | ¥471,339 |
| 30 | 10 | `stancer` | 0.8600 | ¥475,723 |
| 31 | 11 | `tuner` | 0.8732 | ¥483,006 |
| 32 | 12 | `kei-specialist` | 0.8600 | ¥475,723 |
| 34 | 13 | `stancer` | 0.8600 | ¥475,723 |
| 36 | 14 | `tuner` | 0.8521 | ¥475,723 |
| 38 | 15 | `racer` | 0.8600 | ¥480,107 |
| 39 | 16 | `tuner` | 0.8703 | ¥485,865 |
| 43 | 17 | `stancer` | 0.9353 | ¥503,072 |
| 45 | 18 | `stancer` | 0.8600 | ¥462,571 |
| 48 | 19 | `stancer` | 0.8600 | ¥462,571 |
| 50 | 20 | `racer` | 0.8852 | ¥462,571 |

21 offers in 45 days. First offer **¥494,311** (day 12); best offer **¥509,132** (day 13). Holding out for the best one seen is worth **¥14,821** - and costs ¥120,000 of rent over the same stretch, plus a forecourt slot that could have held another car.

**Is there ever a point in not taking the first offer?** On these numbers, no. The quality fraction decays with `offersSeen` exactly as `qualityMeanFor` says it should (`qualityFresh` 0.96 down toward `qualityFloor` 0.86), so the OFFER side of the equation only ever gets worse. What moves the price up again is a different buyer walking in, not a better offer from the same one: the spread between archetypes on this car is far wider than the whole staleness decay. Waiting is therefore a bet on WHO turns up, at a known cost of ¥2,667 a day in rent alone, and the bet does not pay.

## The whole cash ledger

Every yen that moved, in order. This is the list the reconciliation test sums.

| Day | Scope | Category | Item | Yen | Balance |
|---|---|---|---|---|---|
| - | - | - | Opening cash | - | ¥300,000 |
| 1 | car-a | Acquisition | Hammer won on lot worked-car-a-26 | -¥114,017 | ¥185,983 |
| 1 | car-a | Body-pipeline materials | Body pipeline fillAndSand on chassis | -¥1,900 | ¥184,083 |
| 1 | car-a | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 | ¥182,883 |
| 1 | car-a | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 | ¥180,883 |
| 1 | car-a | Parts | Part ordered standard: shitbox-stock-brake-pads-discs | -¥2,100 | ¥178,783 |
| 2 | car-a | Repair labour charges | Bench recondition: brakeCalipersLines to worn | -¥630 | ¥178,153 |
| 2 | car-a | Repair labour charges | Bench recondition: intake to worn | -¥250 | ¥177,903 |
| 2 | car-a | Repair labour charges | Bench recondition: exhaust to worn | -¥560 | ¥177,343 |
| 2 | car-a | Repair labour charges | Bench recondition: fuelSystem to worn | -¥250 | ¥177,093 |
| 2 | car-a | Repair labour charges | Bench recondition: driveline to worn | -¥420 | ¥176,673 |
| 3 | car-a | Repair labour charges | Bench recondition: springs to worn | -¥250 | ¥176,423 |
| 3 | car-a | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 | ¥171,423 |
| 3 | car-a | Repair labour charges | Bench recondition: steering to worn | -¥620 | ¥170,803 |
| 3 | car-a | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥1,820 | ¥168,983 |
| 3 | car-a | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥360 | ¥168,623 |
| 3 | car-a | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 | ¥163,453 |
| 3 | car-a | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 | ¥155,423 |
| 3 | car-a | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 | ¥151,793 |
| 3 | car-a | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 | ¥149,043 |
| 6 | car-a | Sale proceeds | Car sold: car-worked-car-a-26 | ¥199,359 | ¥348,402 |
| 6 | car-b | Acquisition | Hammer won on lot worked-car-b-9 | -¥247,505 | ¥100,897 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on chassis | -¥800 | ¥100,097 |
| 6 | car-b | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 | ¥98,897 |
| 6 | car-b | Body-pipeline materials | Body pipeline fillAndSand on roof | -¥1,900 | ¥96,997 |
| 6 | car-b | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 | ¥94,497 |
| 6 | car-b | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 | ¥92,597 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 | ¥91,797 |
| 6 | car-b | Body-pipeline materials | Body pipeline prime on right | -¥1,200 | ¥90,597 |
| 6 | car-b | Body-pipeline materials | Body pipeline paint on right | -¥2,500 | ¥88,097 |
| 7 | car-b | Body-pipeline materials | Body pipeline polish on right | -¥800 | ¥87,297 |
| 7 | car-b | Repair labour charges | Bench recondition: brakeCalipersLines to fine | -¥720 | ¥86,577 |
| 7 | car-b | Parts | Part ordered standard: stock-tyres | -¥3,500 | ¥83,077 |
| 7 | shop | Rent | Weekly rent | -¥20,000 | ¥63,077 |
| 8 | car-b | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 | ¥60,077 |
| 8 | car-b | Repair labour charges | Bench recondition: intake to fine | -¥290 | ¥59,787 |
| 8 | car-b | Repair labour charges | Bench recondition: exhaust to fine | -¥1,280 | ¥58,507 |
| 8 | car-b | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥900 | ¥57,607 |
| 8 | car-b | Repair labour charges | Bench recondition: cooling to fine | -¥220 | ¥57,387 |
| 9 | car-b | Repair labour charges | Bench recondition: dampers to fine | -¥1,280 | ¥56,107 |
| 9 | car-b | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 | ¥51,107 |
| 9 | car-b | Repair labour charges | Bench recondition: springs to fine | -¥290 | ¥50,817 |
| 9 | car-b | Repair labour charges | Bench recondition: antiRollBars to fine | -¥190 | ¥50,627 |
| 9 | car-b | Repair labour charges | Bench recondition: steering to fine | -¥350 | ¥50,277 |
| 9 | car-b | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥4,160 | ¥46,117 |
| 10 | car-b | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥840 | ¥45,277 |
| 10 | car-b | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 | ¥41,577 |
| 10 | car-b | Parts | Part ordered standard: suiko-street-radiator | -¥2,900 | ¥38,677 |
| 10 | car-b | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 | ¥34,977 |
| 10 | car-b | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 | ¥26,677 |
| 10 | car-b | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 | ¥21,277 |
| 11 | car-b | Listing fee | Listing fee (freeAdsPaper) | -¥1,500 | ¥19,777 |
| 12 | car-b | Sale proceeds | Car sold: car-worked-car-b-9 | ¥494,311 | ¥514,088 |

## Reconciliation

| Check | Yen |
|---|---|
| Opening cash | ¥300,000 |
| Sum of every ledger line above | ¥214,088 |
| **Closing cash, from the sim** | **¥514,088** |
| Difference | ¥0 |

The same total, decomposed the other way:

| Component | Yen |
|---|---|
| Suzuki Wagon R (CT21S) net (car ledger) | ¥53,402 |
| Nissan Silvia (S13) net (car ledger) | ¥193,686 |
| Rent | -¥20,000 |
| Machine-shop hire (running cost, not on any car ledger) | -¥13,000 |
| **Change in cash** | **¥214,088** |

Both identities are asserted to the yen, with no tolerance, in `packages/sim/tests/workedExample.test.ts`. The harness additionally refuses to continue if any single scripted step moves cash it cannot name, so an incomplete ledger fails loudly rather than balancing by accident.
