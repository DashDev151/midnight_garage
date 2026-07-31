# Two cars, end to end, generated from the shipped sim

This document is **generated**, not written: every number in it comes from executing the shipped resolvers in `packages/sim`, once, on a fixed seed. Nothing here is a hand-recomputed formula. Regenerate it with:

```
WORKED_EXAMPLE_WRITE=1 pnpm test packages/sim/tests/workedExample.test.ts
```

(PowerShell: `$env:WORKED_EXAMPLE_WRITE=1; pnpm test packages/sim/tests/workedExample.test.ts`.)

## Plain language, first

The shop opens with ¥300,000. It buys a rough 1993 Suzuki Wagon R (CT21S) for ¥127,527, spends ¥28,380 putting it right and dressing it up, and sells it on day 4 for ¥205,473. It then buys a tidy 1989 Nissan Silvia (S13) for ¥203,652, spends ¥94,200 on it, and sells that on day 12 for ¥444,287. Rent takes ¥20,000 over the same 12 days regardless of what the shop does. The till finishes at ¥476,001: **¥176,001 made in 12 days**, out of two cars and no other income at all.

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
| Tier / culture | entry / kei | everyday / drift |
| Book value | ¥230,000 | ¥500,000 |
| Condition bought | rough | tidy |
| Paid (auction reserve) | ¥127,527 | ¥203,652 |
| Desk buyout would have been | ¥212,545 | ¥339,420 |
| Rung 1 - as bought | ¥212,545 | ¥340,809 |
| Rung 2 - repaired | ¥226,210 | ¥411,174 |
| Rung 3 - modified | ¥232,256 | ¥427,598 |
| Repair charges (`repairYen`) | ¥8,800 | ¥42,060 |
| Parts (`partsYen`) | ¥19,580 | ¥42,640 |
| Listing fees (`listingFeesYen`) | ¥0 | ¥1,500 |
| Sold for | ¥205,473 | ¥444,287 |
| **Net (ledger)** | **¥49,566** | **¥154,435** |
| Labour spent (energy points) | 72 | 320 |
| Days owned | 3 | 8 |

**Fixed overheads, held out of both margins.** Rent is a function of bays owned, not of any one car: ¥20,000 a week at 1 service, 3 parking and 2 forecourt bays, charged on `calendar.rentDayOfWeek`. Over this run it took ¥20,000. That is what the week costs whatever the shop does with it, and it is never subtracted from a car's margin above.

## Car A: Suzuki Wagon R (CT21S)

**Tier** entry - **culture** kei - **1993, 23,588 km** - lot `worked-car-a-26`, generated at seed `26`.

**Why this car.** The cheapest thing a day-one shop can reach, and bought rough: entry tier, Kei culture, ¥230,000 of book value. Its tier expects only `worn`, its `beyondDiscount` is 0.4 and its `aftermarketReturn` is 0.3 - so it is the car the economy pays you to fix and charges you to modify.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥212,545 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥127,527 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥212,545 |
| Attendance fee (local-yard) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥127,527** |

The realised price of a live-room win lands **somewhere between ¥127,527 and ¥212,545**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥85,018 more.

It arrived carrying somebody else's part: `camsTiming` Raiden Sport Cams (sport, fine). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 1 | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 |
| day 1 | Body-pipeline materials | Body pipeline polish on boot | -¥800 |
| day 1 | Body-pipeline materials | Body pipeline polish on right | -¥800 |
| day 1 | Body-pipeline materials | Body pipeline fillAndSand on roof | -¥1,900 |
| day 1 | Body-pipeline materials | Body pipeline prime on roof | -¥1,200 |
| day 1 | Body-pipeline materials | Body pipeline paint on roof | -¥2,500 |
| day 1 | Body-pipeline materials | Body pipeline polish on roof | -¥800 |
| day 1 | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 |
| day 1 | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 |
| day 1 | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 |
| day 1 | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 |

Work spend, all categories: **¥28,380**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **72 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

### 3. The value ladder

#### Rung 1: As bought (day 1, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥19,240 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥9,432 |
| Stage C coherence discount | `coherence` | -¥6,263 |
| Stage D aftermarket premium | `aftermarket` | ¥5,980 |
| **Total (`marketValueYen`)** |  | **¥212,545** |

Restoration bill still owed to the `fine` band the tier expects: ¥14,800.

#### Rung 2: Repaired (day 1, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | ¥0 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥14,592 |
| Stage C coherence discount | `coherence` | -¥6,678 |
| Stage D aftermarket premium | `aftermarket` | ¥5,980 |
| **Total (`marketValueYen`)** |  | **¥226,210** |

Restoration bill still owed to the `fine` band the tier expects: ¥0.

#### Rung 3: Modified (day 2, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | ¥0 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥14,044 |
| Stage C coherence discount | `coherence` | -¥6,694 |
| Stage D aftermarket premium | `aftermarket` | ¥11,494 |
| **Total (`marketValueYen`)** |  | **¥232,256** |

Restoration bill still owed to the `fine` band the tier expects: ¥0.

#### What decides the aftermarket premium

| Rung | Support headline | coherenceFactor | retentionFor | foundationFactor | aftermarketReturn | installedPartsValueYen | Credited premium |
|---|---|---|---|---|---|---|---|
| As bought | 0.861 | 0.916 | 1.033 | 1.00 | 0.30 | ¥19,932 | ¥5,980 |
| Repaired | 0.861 | 0.916 | 1.033 | 1.00 | 0.30 | ¥19,932 | ¥5,980 |
| Modified | 0.861 | 0.916 | 1.033 | 1.00 | 0.30 | ¥38,314 | ¥11,494 |

The credited premium is `foundationFactor x aftermarketReturn x installedPartsValueYen`, and `installedPartsValueYen` is itself every non-stock part's catalogue price times `retentionFor(coherenceFactor)`. All three gates multiply, so any one of them at zero takes the whole premium with it.

#### The build

| Slot | Part | Grade | List price | Paid | Express surcharge |
|---|---|---|---|---|---|
| `aero` | Mikoshi Lip Kit | street | ¥4,700 | ¥5,170 | ¥470 |
| `exhaust` | Suzaku Street Catback | street | ¥7,300 | ¥8,030 | ¥730 |
| `intake` | Fubuki Cold Air Intake Kit | street | ¥3,300 | ¥3,630 | ¥330 |
| `cooling` | Suiko Sport Radiator | street | ¥2,500 | ¥2,750 | ¥250 |

Parts total ¥19,580; the ladder above credits ¥5,514 of it back into the car's value.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `shopFront` |
| Listing fee | ¥0 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 2 days |
| Buyer archetype | `kei-specialist` |
| Buyer taste (through the channel ceiling) | 1.0000 |
| Offer quality fraction drawn | 0.8847 |
| **Final `priceYen`** | **¥205,473** |

#### The same car, the same buyer, every channel

| Channel | Fee | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | 1.00 | no | 1.0000 | ¥232,256 | - |
| `freeAdsPaper` | ¥1,500 | 1.05 | no | 1.0321 | ¥239,722 | ¥5,966 |
| `tunerMagazine` | ¥12,000 | 1.17 | yes | 1.0638 | ¥247,084 | ¥2,828 |
| `tradeNetwork` | ¥0 | n/a (flat `priceBand`) | no | n/a | ¥232,256 | ¥0 |
| `weekendMeet` | ¥3,000 | 1.17 | yes | 1.0638 | ¥247,084 | ¥11,828 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥127,527 |
| `repairYen` | ¥8,800 |
| `partsYen` | ¥19,580 |
| `listingFeesYen` | ¥0 |
| Sale `priceYen` | ¥205,473 |
| **Net** | **¥49,566** |

## Car B: Nissan Silvia (S13)

**Tier** everyday - **culture** drift - **1989, 71,594 km** - lot `worked-car-b-9`, generated at seed `9`.

**Why this car.** Everything the Wagon R is not, and bought tidy rather than rough: everyday tier, Drift culture, ¥500,000 of book value. Its tier expects `fine`, its `beyondDiscount` is 0.8 and its `aftermarketReturn` is 0.6, so a coherent build gets twice the credit it would on the kei, and the tuner/racer/stancer crowd it draws will pay for it.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥339,420 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥203,652 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥339,420 |
| Attendance fee (regional) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥203,652** |

The realised price of a live-room win lands **somewhere between ¥203,652 and ¥339,420**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥135,768 more.

It arrived carrying somebody else's part: `brakePadsDiscs` Shuriken Sport Pads & Discs (sport, poor). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 7 | Repair labour charges | Bench recondition: rims to fine | -¥1,080 |
| day 8 | Repair labour charges | Bench recondition: intake to fine | -¥580 |
| day 8 | Repair labour charges | Bench recondition: exhaust to fine | -¥1,280 |
| day 8 | Repair labour charges | Bench recondition: fuelSystem to fine | -¥580 |
| day 9 | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥900 |
| day 9 | Repair labour charges | Bench recondition: driveline to fine | -¥960 |
| day 9 | Repair labour charges | Bench recondition: dampers to fine | -¥1,280 |
| day 9 | Repair labour charges | Bench recondition: springs to fine | -¥580 |
| day 10 | Repair labour charges | Bench recondition: steering to fine | -¥700 |
| day 10 | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥4,160 |
| day 4 | Body-pipeline materials | Body pipeline fillAndSand on boot | -¥1,900 |
| day 4 | Body-pipeline materials | Body pipeline fillAndSand on chassis | -¥1,900 |
| day 4 | Body-pipeline materials | Body pipeline fillAndSand on bonnet | -¥1,900 |
| day 4 | Body-pipeline materials | Body pipeline prime on boot | -¥1,200 |
| day 4 | Body-pipeline materials | Body pipeline fillAndSand on left | -¥1,900 |
| day 4 | Body-pipeline materials | Body pipeline fillAndSand on roof | -¥1,900 |
| day 4 | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 |
| day 5 | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 |
| day 5 | Body-pipeline materials | Body pipeline paint on boot | -¥2,500 |
| day 5 | Body-pipeline materials | Body pipeline prime on left | -¥1,200 |
| day 5 | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 |
| day 5 | Body-pipeline materials | Body pipeline prime on roof | -¥1,200 |
| day 5 | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 |
| day 5 | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 |
| day 5 | Body-pipeline materials | Body pipeline polish on boot | -¥800 |
| day 5 | Body-pipeline materials | Body pipeline paint on left | -¥2,500 |
| day 5 | Body-pipeline materials | Body pipeline prime on right | -¥1,200 |
| day 5 | Body-pipeline materials | Body pipeline paint on roof | -¥2,500 |
| day 5 | Body-pipeline materials | Body pipeline polish on chassis | -¥800 |
| day 6 | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 |
| day 6 | Body-pipeline materials | Body pipeline polish on left | -¥800 |
| day 6 | Body-pipeline materials | Body pipeline paint on right | -¥2,500 |
| day 6 | Body-pipeline materials | Body pipeline polish on roof | -¥800 |
| day 6 | Body-pipeline materials | Body pipeline polish on right | -¥800 |
| day 6 | Parts | Part ordered standard: stock-brake-calipers-lines | -¥7,200 |
| day 7 | Parts | Part ordered standard: stock-tyres | -¥3,500 |
| day 10 | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 |
| day 10 | Parts | Part ordered standard: suiko-street-radiator | -¥2,900 |
| day 10 | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 |
| day 10 | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 |
| day 10 | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 |
| day 8 | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 |
| day 9 | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 |

Work spend, all categories: **¥92,700**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **320 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 8 | `wheels` | ¥3,000 | mounting a fresh tyre onto the rim on the bench |
| day 9 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |

A machine-shop hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from: hiring the engine crane for a day can pull four engines, so it belongs to no single one of them.

### 3. The value ladder

#### Rung 1: As bought (day 4, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥132,886 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥12,288 |
| Stage D aftermarket premium | `aftermarket` | ¥475 |
| **Total (`marketValueYen`)** |  | **¥340,809** |

Restoration bill still owed to the `fine` band the tier expects: ¥102,220.

#### Rung 2: Repaired (day 10, market heat 102%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Market heat | `heat` | ¥9,710 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥55,822 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥29,648 |
| Stage D aftermarket premium | `aftermarket` | ¥1,426 |
| **Total (`marketValueYen`)** |  | **¥411,174** |

Restoration bill still owed to the `fine` band the tier expects: ¥42,940.

#### Rung 3: Modified (day 11, market heat 102%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Market heat | `heat` | ¥9,710 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥47,502 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥28,672 |
| Stage D aftermarket premium | `aftermarket` | ¥8,554 |
| **Total (`marketValueYen`)** |  | **¥427,598** |

Restoration bill still owed to the `fine` band the tier expects: ¥36,540.

#### What decides the aftermarket premium

| Rung | Support headline | coherenceFactor | retentionFor | foundationFactor | aftermarketReturn | installedPartsValueYen | Credited premium |
|---|---|---|---|---|---|---|---|
| As bought | 1.000 | 1.000 | 1.100 | 0.15 | 0.60 | ¥5,280 | ¥475 |
| Repaired | 1.000 | 1.000 | 1.100 | 0.45 | 0.60 | ¥5,280 | ¥1,426 |
| Modified | 0.940 | 1.000 | 1.100 | 0.45 | 0.60 | ¥31,680 | ¥8,554 |

The credited premium is `foundationFactor x aftermarketReturn x installedPartsValueYen`, and `installedPartsValueYen` is itself every non-stock part's catalogue price times `retentionFor(coherenceFactor)`. All three gates multiply, so any one of them at zero takes the whole premium with it.

#### The build

| Slot | Part | Grade | List price | Paid | Express surcharge |
|---|---|---|---|---|---|
| `fuelSystem` | Koi Fuel Dynamics Street Injector Kit | street | ¥3,700 | ¥3,700 | - |
| `cooling` | Suiko Sport Radiator | street | ¥2,900 | ¥2,900 | - |
| `intake` | Fubuki Cold Air Intake Kit | street | ¥3,700 | ¥3,700 | - |
| `exhaust` | Suzaku Street Catback | street | ¥8,300 | ¥8,300 | - |
| `aero` | Mikoshi Lip Kit | street | ¥5,400 | ¥5,400 | - |

Parts total ¥24,000; the ladder above credits ¥7,128 of it back into the car's value.

#### What the shop could not reach

| Slot | Band | Why it stayed there |
|---|---|---|
| `block` | poor | assembly-gated (engineAssembly): worked only through the engine line |
| `internals` | poor | assembly-gated (engineAssembly): worked only through the engine line |
| `headValvetrain` | poor | assembly-gated (engineAssembly): worked only through the engine line |
| `camsTiming` | poor | assembly-gated (engineAssembly): worked only through the engine line |
| `cooling` | scrap | scrap: replace-only |
| `forcedInduction` | scrap | scrap: replace-only |
| `clutch` | scrap | scrap: replace-only |
| `antiRollBars` | scrap | scrap: replace-only |
| `brakePadsDiscs` | poor | replace-only aftermarket part, kept: its premium is worth more than its share of the bill |
| `seats` | poor | signature slot: needs the interior line hired |
| `dashGauges` | poor | signature slot: needs the interior line hired |

Remaining bill to the expected band: **¥42,940**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `freeAdsPaper` |
| Listing fee | ¥1,500 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 1 day |
| Buyer archetype | `kei-specialist` |
| Buyer taste (through the channel ceiling) | 1.0500 |
| Offer quality fraction drawn | 0.9896 |
| **Final `priceYen`** | **¥444,287** |

#### The same car, the same buyer, every channel

| Channel | Fee | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | 1.00 | no | 1.0000 | ¥427,598 | - |
| `freeAdsPaper` | ¥1,500 | 1.05 | no | 1.0500 | ¥448,978 | ¥19,880 |
| `tunerMagazine` | ¥12,000 | 1.17 | yes | 1.1278 | ¥482,240 | ¥42,642 |
| `tradeNetwork` | ¥0 | n/a (flat `priceBand`) | no | n/a | ¥427,598 | ¥0 |
| `weekendMeet` | ¥3,000 | 1.17 | yes | 1.1278 | ¥482,240 | ¥51,642 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥203,652 |
| `repairYen` | ¥42,060 |
| `partsYen` | ¥42,640 |
| `listingFeesYen` | ¥1,500 |
| Sale `priceYen` | ¥444,287 |
| **Net** | **¥154,435** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥8,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥146,435** to the bank.

## Staleness: what happens if it does not sell straight away

A side branch off Nissan Silvia (S13)'s listing snapshot: the same listing, the same seeds, walked 45 days without taking anything. Nothing here touches the career the ledger above reconciles - it is a hypothetical run of the same state.

| Day | `offersSeen` at the draw | Buyer | Quality fraction | Offer |
|---|---|---|---|---|
| 12 | 0 | `kei-specialist` | 0.9896 | ¥444,287 |
| 13 | 1 | `tuner` | 0.8936 | ¥401,209 |
| 14 | 2 | `tuner` | 0.9534 | ¥428,040 |
| 15 | 3 | `first-timer` | 0.9052 | ¥415,640 |
| 17 | 4 | `first-timer` | 0.9439 | ¥433,399 |
| 19 | 5 | `first-timer` | 0.9027 | ¥414,479 |
| 24 | 6 | `stancer` | 0.8906 | ¥422,573 |
| 25 | 7 | `tuner` | 0.8631 | ¥409,496 |
| 29 | 8 | `racer` | 0.8419 | ¥398,637 |
| 30 | 9 | `racer` | 0.8600 | ¥407,202 |
| 32 | 10 | `tuner` | 0.8600 | ¥416,809 |
| 33 | 11 | `stancer` | 0.8680 | ¥420,705 |
| 34 | 12 | `first-timer` | 0.8665 | ¥419,969 |
| 35 | 13 | `first-timer` | 0.9150 | ¥443,472 |
| 37 | 14 | `first-timer` | 0.8600 | ¥421,194 |
| 39 | 15 | `kei-specialist` | 0.8600 | ¥421,194 |
| 42 | 16 | `racer` | 0.8896 | ¥425,671 |
| 47 | 17 | `kei-specialist` | 0.8716 | ¥426,892 |
| 48 | 18 | `stancer` | 0.8709 | ¥426,556 |
| 50 | 19 | `stancer` | 0.8690 | ¥421,194 |
| 52 | 20 | `kei-specialist` | 0.8750 | ¥424,089 |
| 53 | 21 | `stancer` | 0.9280 | ¥449,753 |

22 offers in 45 days. First offer **¥444,287** (day 12); best offer **¥449,753** (day 53). Holding out for the best one seen is worth **¥5,466** - and costs ¥120,000 of rent over the same stretch, plus a forecourt slot that could have held another car.

**Is there ever a point in not taking the first offer?** On these numbers, no. The quality fraction decays with `offersSeen` exactly as `qualityMeanFor` says it should (`qualityFresh` 0.96 down toward `qualityFloor` 0.86), so the OFFER side of the equation only ever gets worse. What moves the price up again is a different buyer walking in, not a better offer from the same one: the spread between archetypes on this car is far wider than the whole staleness decay. Waiting is therefore a bet on WHO turns up, at a known cost of ¥2,667 a day in rent alone, and the bet does not pay.

## The whole cash ledger

Every yen that moved, in order. This is the list the reconciliation test sums.

| Day | Scope | Category | Item | Yen | Balance |
|---|---|---|---|---|---|
| - | - | - | Opening cash | - | ¥300,000 |
| 1 | car-a | Acquisition | Hammer won on lot worked-car-a-26 | -¥127,527 | ¥172,473 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 | ¥171,673 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on boot | -¥800 | ¥170,873 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on right | -¥800 | ¥170,073 |
| 1 | car-a | Body-pipeline materials | Body pipeline fillAndSand on roof | -¥1,900 | ¥168,173 |
| 1 | car-a | Body-pipeline materials | Body pipeline prime on roof | -¥1,200 | ¥166,973 |
| 1 | car-a | Body-pipeline materials | Body pipeline paint on roof | -¥2,500 | ¥164,473 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on roof | -¥800 | ¥163,673 |
| 1 | car-a | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 | ¥158,503 |
| 1 | car-a | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 | ¥150,473 |
| 1 | car-a | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 | ¥146,843 |
| 1 | car-a | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 | ¥144,093 |
| 4 | car-a | Sale proceeds | Car sold: car-worked-car-a-26 | ¥205,473 | ¥349,566 |
| 4 | car-b | Acquisition | Hammer won on lot worked-car-b-9 | -¥203,652 | ¥145,914 |
| 4 | car-b | Body-pipeline materials | Body pipeline fillAndSand on boot | -¥1,900 | ¥144,014 |
| 4 | car-b | Body-pipeline materials | Body pipeline fillAndSand on chassis | -¥1,900 | ¥142,114 |
| 4 | car-b | Body-pipeline materials | Body pipeline fillAndSand on bonnet | -¥1,900 | ¥140,214 |
| 4 | car-b | Body-pipeline materials | Body pipeline prime on boot | -¥1,200 | ¥139,014 |
| 4 | car-b | Body-pipeline materials | Body pipeline fillAndSand on left | -¥1,900 | ¥137,114 |
| 4 | car-b | Body-pipeline materials | Body pipeline fillAndSand on roof | -¥1,900 | ¥135,214 |
| 4 | car-b | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 | ¥134,014 |
| 5 | car-b | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 | ¥132,814 |
| 5 | car-b | Body-pipeline materials | Body pipeline paint on boot | -¥2,500 | ¥130,314 |
| 5 | car-b | Body-pipeline materials | Body pipeline prime on left | -¥1,200 | ¥129,114 |
| 5 | car-b | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 | ¥127,214 |
| 5 | car-b | Body-pipeline materials | Body pipeline prime on roof | -¥1,200 | ¥126,014 |
| 5 | car-b | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 | ¥124,014 |
| 5 | car-b | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 | ¥121,514 |
| 5 | car-b | Body-pipeline materials | Body pipeline polish on boot | -¥800 | ¥120,714 |
| 5 | car-b | Body-pipeline materials | Body pipeline paint on left | -¥2,500 | ¥118,214 |
| 5 | car-b | Body-pipeline materials | Body pipeline prime on right | -¥1,200 | ¥117,014 |
| 5 | car-b | Body-pipeline materials | Body pipeline paint on roof | -¥2,500 | ¥114,514 |
| 5 | car-b | Body-pipeline materials | Body pipeline polish on chassis | -¥800 | ¥113,714 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 | ¥112,914 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on left | -¥800 | ¥112,114 |
| 6 | car-b | Body-pipeline materials | Body pipeline paint on right | -¥2,500 | ¥109,614 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on roof | -¥800 | ¥108,814 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on right | -¥800 | ¥108,014 |
| 6 | car-b | Parts | Part ordered standard: stock-brake-calipers-lines | -¥7,200 | ¥100,814 |
| 7 | car-b | Repair labour charges | Bench recondition: rims to fine | -¥1,080 | ¥99,734 |
| 7 | car-b | Parts | Part ordered standard: stock-tyres | -¥3,500 | ¥96,234 |
| 7 | shop | Rent | Weekly rent | -¥20,000 | ¥76,234 |
| 8 | car-b | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 | ¥73,234 |
| 8 | car-b | Repair labour charges | Bench recondition: intake to fine | -¥580 | ¥72,654 |
| 8 | car-b | Repair labour charges | Bench recondition: exhaust to fine | -¥1,280 | ¥71,374 |
| 8 | car-b | Repair labour charges | Bench recondition: fuelSystem to fine | -¥580 | ¥70,794 |
| 9 | car-b | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥900 | ¥69,894 |
| 9 | car-b | Repair labour charges | Bench recondition: driveline to fine | -¥960 | ¥68,934 |
| 9 | car-b | Repair labour charges | Bench recondition: dampers to fine | -¥1,280 | ¥67,654 |
| 9 | car-b | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 | ¥62,654 |
| 9 | car-b | Repair labour charges | Bench recondition: springs to fine | -¥580 | ¥62,074 |
| 10 | car-b | Repair labour charges | Bench recondition: steering to fine | -¥700 | ¥61,374 |
| 10 | car-b | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥4,160 | ¥57,214 |
| 10 | car-b | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 | ¥53,514 |
| 10 | car-b | Parts | Part ordered standard: suiko-street-radiator | -¥2,900 | ¥50,614 |
| 10 | car-b | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 | ¥46,914 |
| 10 | car-b | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 | ¥38,614 |
| 10 | car-b | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 | ¥33,214 |
| 11 | car-b | Listing fee | Listing fee (freeAdsPaper) | -¥1,500 | ¥31,714 |
| 12 | car-b | Sale proceeds | Car sold: car-worked-car-b-9 | ¥444,287 | ¥476,001 |

## Reconciliation

| Check | Yen |
|---|---|
| Opening cash | ¥300,000 |
| Sum of every ledger line above | ¥176,001 |
| **Closing cash, from the sim** | **¥476,001** |
| Difference | ¥0 |

The same total, decomposed the other way:

| Component | Yen |
|---|---|
| Suzuki Wagon R (CT21S) net (car ledger) | ¥49,566 |
| Nissan Silvia (S13) net (car ledger) | ¥154,435 |
| Rent | -¥20,000 |
| Machine-shop hire (running cost, not on any car ledger) | -¥8,000 |
| **Change in cash** | **¥176,001** |

Both identities are asserted to the yen, with no tolerance, in `packages/sim/tests/workedExample.test.ts`. The harness additionally refuses to continue if any single scripted step moves cash it cannot name, so an incomplete ledger fails loudly rather than balancing by accident.
