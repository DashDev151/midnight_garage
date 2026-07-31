# Two cars, end to end, generated from the shipped sim

This document is **generated**, not written: every number in it comes from executing the shipped resolvers in `packages/sim`, once, on a fixed seed. Nothing here is a hand-recomputed formula. Regenerate it with:

```
WORKED_EXAMPLE_WRITE=1 pnpm test packages/sim/tests/workedExample.test.ts
```

(PowerShell: `$env:WORKED_EXAMPLE_WRITE=1; pnpm test packages/sim/tests/workedExample.test.ts`.)

## Plain language, first

The shop opens with ¥300,000. It buys a rough 1993 Suzuki Wagon R (CT21S) for ¥102,565, spends ¥48,210 putting it right and dressing it up, and sells it on day 6 for ¥204,639. It then buys a tidy 1989 Nissan Silvia (S13) for ¥246,716, spends ¥52,950 on it, and sells that on day 12 for ¥460,964. Rent takes ¥20,000 over the same 12 days regardless of what the shop does. The till finishes at ¥495,162: **¥195,162 made in 12 days**, out of two cars and no other income at all.

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
| Paid (auction reserve) | ¥102,565 | ¥246,716 |
| Desk buyout would have been | ¥170,941 | ¥411,193 |
| Rung 1 - as bought | ¥170,941 | ¥412,476 |
| Rung 2 - repaired | ¥211,750 | ¥468,688 |
| Rung 3 - modified | ¥217,797 | ¥486,016 |
| Repair charges (`repairYen`) | ¥10,480 | ¥10,500 |
| Parts (`partsYen`) | ¥29,730 | ¥32,950 |
| Listing fees (`listingFeesYen`) | ¥0 | ¥1,500 |
| Sold for | ¥204,639 | ¥460,964 |
| **Net (ledger)** | **¥61,864** | **¥169,298** |
| Labour spent (energy points) | 197 | 197 |
| Days owned | 5 | 6 |

**Fixed overheads, held out of both margins.** Rent is a function of bays owned, not of any one car: ¥20,000 a week at 1 service, 3 parking and 2 forecourt bays, charged on `calendar.rentDayOfWeek`. Over this run it took ¥20,000. That is what the week costs whatever the shop does with it, and it is never subtracted from a car's margin above.

## Car A: Suzuki Wagon R (CT21S)

**Tier** entry - **culture** Kei - **1993, 23,588 km** - lot `worked-car-a-26`, generated at seed `26`.

**Why this car.** The cheapest thing a day-one shop can reach, and bought rough: entry tier, Kei culture, ¥230,000 of book value. Its tier expects only `worn`, its `beyondDiscount` is 0.4 and its `aftermarketReturn` is 0.3 - so it is the car the economy pays you to fix and charges you to modify.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥170,941 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥102,565 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥170,941 |
| Attendance fee (local-yard) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥102,565** |

The realised price of a live-room win lands **somewhere between ¥102,565 and ¥170,941**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥68,376 more.

It arrived carrying somebody else's parts: `camsTiming` Raiden Sport Cams (sport, worn), `antiRollBars` Kumo Sport Sway Bars (sport, worn), `steering` Kitsune Sport Rack (sport, worn). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 2 | Repair labour charges | Bench recondition: brakeCalipersLines to fine | -¥630 |
| day 2 | Repair labour charges | Bench recondition: rims to fine | -¥480 |
| day 3 | Repair labour charges | Bench recondition: intake to fine | -¥250 |
| day 3 | Repair labour charges | Bench recondition: exhaust to fine | -¥560 |
| day 3 | Repair labour charges | Bench recondition: fuelSystem to fine | -¥250 |
| day 3 | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥390 |
| day 3 | Repair labour charges | Bench recondition: cooling to fine | -¥200 |
| day 4 | Repair labour charges | Bench recondition: driveline to fine | -¥420 |
| day 4 | Repair labour charges | Bench recondition: dampers to fine | -¥560 |
| day 4 | Repair labour charges | Bench recondition: springs to fine | -¥250 |
| day 4 | Repair labour charges | Bench recondition: antiRollBars to fine | -¥340 |
| day 4 | Repair labour charges | Bench recondition: steering to fine | -¥620 |
| day 4 | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥1,820 |
| day 4 | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥360 |
| day 1 | Body-pipeline materials | Body pipeline polish on boot | -¥800 |
| day 1 | Body-pipeline materials | Body pipeline polish on right | -¥800 |
| day 1 | Body-pipeline materials | Body pipeline polish on roof | -¥800 |
| day 1 | Body-pipeline materials | Body pipeline fillAndSand on chassis | -¥1,900 |
| day 1 | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 |
| day 1 | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 |
| day 1 | Body-pipeline materials | Body pipeline polish on chassis | -¥800 |
| day 1 | Parts | Part ordered standard: shitbox-stock-brake-pads-discs | -¥2,100 |
| day 2 | Parts | Part ordered standard: shitbox-stock-tyres | -¥3,100 |
| day 5 | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 |
| day 5 | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 |
| day 5 | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 |
| day 5 | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 |
| day 3 | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 |
| day 4 | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 |

Work spend, all categories: **¥48,210**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **197 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 3 | `wheels` | ¥3,000 | mounting a fresh tyre onto the rim on the bench |
| day 4 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |

A machine-shop hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from: hiring the engine crane for a day can pull four engines, so it belongs to no single one of them.

### 3. The value ladder

#### Rung 1: As bought (day 1, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥59,163 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥10,364 |
| Stage C coherence discount | `coherence` | -¥5,061 |
| Stage D aftermarket premium | `aftermarket` | ¥4,029 |
| **Total (`marketValueYen`)** |  | **¥170,941** |

Restoration bill still owed to the `fine` band the tier expects: ¥45,510.

#### Rung 2: Repaired (day 5, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥16,471 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥16,084 |
| Stage C coherence discount | `coherence` | -¥6,149 |
| Stage D aftermarket premium | `aftermarket` | ¥8,954 |
| **Total (`marketValueYen`)** |  | **¥211,750** |

Restoration bill still owed to the `fine` band the tier expects: ¥12,670.

#### Rung 3: Modified (day 5, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥16,471 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥15,536 |
| Stage C coherence discount | `coherence` | -¥6,165 |
| Stage D aftermarket premium | `aftermarket` | ¥14,469 |
| **Total (`marketValueYen`)** |  | **¥217,797** |

Restoration bill still owed to the `fine` band the tier expects: ¥12,670.

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
| `block` | worn | assembly-gated (engineAssembly): worked only through the engine line |
| `internals` | worn | assembly-gated (engineAssembly): worked only through the engine line |
| `headValvetrain` | worn | assembly-gated (engineAssembly): worked only through the engine line |
| `camsTiming` | worn | assembly-gated (engineAssembly): worked only through the engine line |
| `seats` | worn | signature slot: needs the interior line hired |
| `dashGauges` | worn | signature slot: needs the interior line hired |

Remaining bill to the expected band: **¥12,670**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `shopFront` |
| Listing fee | ¥0 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 1 day |
| Buyer archetype | `first-timer` |
| Buyer taste (through the channel ceiling) | 1.0000 |
| Offer quality fraction drawn | 0.9396 |
| **Final `priceYen`** | **¥204,639** |

#### The same car, the same buyer, every channel

| Channel | Fee | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | 1.00 | no | 1.0000 | ¥217,797 | - |
| `freeAdsPaper` | ¥1,500 | 1.05 | no | 1.0500 | ¥228,687 | ¥9,390 |
| `tunerMagazine` | ¥12,000 | 1.17 | yes | 1.1485 | ¥250,139 | ¥20,342 |
| `tradeNetwork` | ¥0 | n/a (flat `priceBand`) | no | n/a | ¥217,797 | ¥0 |
| `weekendMeet` | ¥3,000 | 1.17 | yes | 1.1485 | ¥250,139 | ¥29,342 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥102,565 |
| `repairYen` | ¥10,480 |
| `partsYen` | ¥29,730 |
| `listingFeesYen` | ¥0 |
| Sale `priceYen` | ¥204,639 |
| **Net** | **¥61,864** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥8,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥53,864** to the bank.

## Car B: Nissan Silvia (S13)

**Tier** everyday - **culture** Drift - **1989, 71,594 km** - lot `worked-car-b-9`, generated at seed `9`.

**Why this car.** Everything the Wagon R is not, and bought tidy rather than rough: everyday tier, Drift culture, ¥500,000 of book value. Its tier expects `fine`, its `beyondDiscount` is 0.8 and its `aftermarketReturn` is 0.6, so a coherent build gets twice the credit it would on the kei, and the tuner/racer/stancer crowd it draws will pay for it.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥411,193 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥246,716 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥411,193 |
| Attendance fee (regional) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥246,716** |

The realised price of a live-room win lands **somewhere between ¥246,716 and ¥411,193**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥164,477 more.

It arrived carrying somebody else's part: `brakePadsDiscs` Shuriken Sport Pads & Discs (sport, worn). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 6 | Repair labour charges | Bench recondition: brakeCalipersLines to fine | -¥720 |
| day 7 | Repair labour charges | Bench recondition: rims to fine | -¥540 |
| day 8 | Repair labour charges | Bench recondition: intake to fine | -¥290 |
| day 8 | Repair labour charges | Bench recondition: exhaust to fine | -¥1,280 |
| day 8 | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥450 |
| day 8 | Repair labour charges | Bench recondition: cooling to fine | -¥220 |
| day 8 | Repair labour charges | Bench recondition: driveline to fine | -¥480 |
| day 9 | Repair labour charges | Bench recondition: dampers to fine | -¥640 |
| day 9 | Repair labour charges | Bench recondition: springs to fine | -¥290 |
| day 9 | Repair labour charges | Bench recondition: antiRollBars to fine | -¥190 |
| day 9 | Repair labour charges | Bench recondition: steering to fine | -¥350 |
| day 9 | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥2,080 |
| day 9 | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥420 |
| day 6 | Body-pipeline materials | Body pipeline polish on right | -¥800 |
| day 6 | Body-pipeline materials | Body pipeline polish on chassis | -¥800 |
| day 6 | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 |
| day 6 | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 |
| day 6 | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 |
| day 6 | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 |
| day 7 | Parts | Part ordered standard: stock-tyres | -¥3,500 |
| day 10 | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 |
| day 10 | Parts | Part ordered standard: suiko-street-radiator | -¥2,900 |
| day 10 | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 |
| day 10 | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 |
| day 10 | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 |
| day 8 | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 |
| day 9 | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 |

Work spend, all categories: **¥51,450**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **197 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

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
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥54,080 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥22,120 |
| Stage D aftermarket premium | `aftermarket` | ¥3,168 |
| **Total (`marketValueYen`)** |  | **¥412,476** |

Restoration bill still owed to the `fine` band the tier expects: ¥41,600.

#### Rung 2: Repaired (day 10, market heat 105%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Market heat | `heat` | ¥24,275 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥13,663 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥30,600 |
| Stage D aftermarket premium | `aftermarket` | ¥3,168 |
| **Total (`marketValueYen`)** |  | **¥468,688** |

Restoration bill still owed to the `fine` band the tier expects: ¥10,510.

#### Rung 3: Modified (day 11, market heat 105%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Market heat | `heat` | ¥24,275 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥13,663 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥29,112 |
| Stage D aftermarket premium | `aftermarket` | ¥19,008 |
| **Total (`marketValueYen`)** |  | **¥486,016** |

Restoration bill still owed to the `fine` band the tier expects: ¥10,510.

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
| `internals` | worn | assembly-gated (engineAssembly): worked only through the engine line |
| `headValvetrain` | worn | assembly-gated (engineAssembly): worked only through the engine line |
| `camsTiming` | worn | assembly-gated (engineAssembly): worked only through the engine line |
| `forcedInduction` | worn | not reached by this run |
| `brakePadsDiscs` | worn | replace-only aftermarket part, kept: its premium is worth more than its share of the bill |
| `seats` | worn | signature slot: needs the interior line hired |
| `dashGauges` | worn | signature slot: needs the interior line hired |

Remaining bill to the expected band: **¥10,510**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `freeAdsPaper` |
| Listing fee | ¥1,500 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 1 day |
| Buyer archetype | `first-timer` |
| Buyer taste (through the channel ceiling) | 1.0500 |
| Offer quality fraction drawn | 0.9033 |
| **Final `priceYen`** | **¥460,964** |

#### The same car, the same buyer, every channel

| Channel | Fee | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | 1.00 | no | 1.0000 | ¥486,016 | - |
| `freeAdsPaper` | ¥1,500 | 1.05 | no | 1.0500 | ¥510,317 | ¥22,801 |
| `tunerMagazine` | ¥12,000 | 1.17 | yes | 1.1669 | ¥567,115 | ¥69,099 |
| `tradeNetwork` | ¥0 | n/a (flat `priceBand`) | no | n/a | ¥486,016 | ¥0 |
| `weekendMeet` | ¥3,000 | 1.17 | yes | 1.1669 | ¥567,115 | ¥78,099 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥246,716 |
| `repairYen` | ¥10,500 |
| `partsYen` | ¥32,950 |
| `listingFeesYen` | ¥1,500 |
| Sale `priceYen` | ¥460,964 |
| **Net** | **¥169,298** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥8,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥161,298** to the bank.

## Staleness: what happens if it does not sell straight away

A side branch off Nissan Silvia (S13)'s listing snapshot: the same listing, the same seeds, walked 45 days without taking anything. Nothing here touches the career the ledger above reconciles - it is a hypothetical run of the same state.

| Day | `offersSeen` at the draw | Buyer | Quality fraction | Offer |
|---|---|---|---|---|
| 12 | 0 | `first-timer` | 0.9033 | ¥460,964 |
| 13 | 1 | `tuner` | 0.9411 | ¥480,246 |
| 15 | 2 | `tuner` | 0.8906 | ¥472,624 |
| 16 | 3 | `first-timer` | 0.8999 | ¥477,565 |
| 20 | 4 | `stancer` | 0.8600 | ¥456,409 |
| 21 | 5 | `first-timer` | 0.9142 | ¥485,172 |
| 23 | 6 | `tuner` | 0.8600 | ¥465,177 |
| 24 | 7 | `kei-specialist` | 0.8600 | ¥465,177 |
| 25 | 8 | `stancer` | 0.8728 | ¥472,111 |
| 26 | 9 | `racer` | 0.8605 | ¥463,449 |
| 32 | 10 | `racer` | 0.8600 | ¥467,530 |
| 34 | 11 | `tuner` | 0.8960 | ¥489,216 |
| 36 | 12 | `tuner` | 0.8520 | ¥469,561 |
| 37 | 13 | `first-timer` | 0.8600 | ¥473,945 |
| 38 | 14 | `stancer` | 0.8600 | ¥473,945 |
| 39 | 15 | `stancer` | 0.8600 | ¥473,945 |
| 40 | 16 | `stancer` | 0.8600 | ¥473,945 |
| 42 | 17 | `first-timer` | 0.8745 | ¥481,922 |
| 43 | 18 | `kei-specialist` | 0.8862 | ¥488,400 |
| 48 | 19 | `racer` | 0.8600 | ¥471,895 |
| 49 | 20 | `tuner` | 0.8600 | ¥473,945 |
| 50 | 21 | `racer` | 0.9221 | ¥501,308 |
| 53 | 22 | `first-timer` | 0.9280 | ¥506,674 |
| 55 | 23 | `first-timer` | 0.9608 | ¥524,583 |

24 offers in 45 days. First offer **¥460,964** (day 12); best offer **¥524,583** (day 55). Holding out for the best one seen is worth **¥63,619** - and costs ¥120,000 of rent over the same stretch, plus a forecourt slot that could have held another car.

**Is there ever a point in not taking the first offer?** On these numbers, no. The quality fraction decays with `offersSeen` exactly as `qualityMeanFor` says it should (`qualityFresh` 0.96 down toward `qualityFloor` 0.86), so the OFFER side of the equation only ever gets worse. What moves the price up again is a different buyer walking in, not a better offer from the same one: the spread between archetypes on this car is far wider than the whole staleness decay. Waiting is therefore a bet on WHO turns up, at a known cost of ¥2,667 a day in rent alone, and the bet does not pay.

## The whole cash ledger

Every yen that moved, in order. This is the list the reconciliation test sums.

| Day | Scope | Category | Item | Yen | Balance |
|---|---|---|---|---|---|
| - | - | - | Opening cash | - | ¥300,000 |
| 1 | car-a | Acquisition | Hammer won on lot worked-car-a-26 | -¥102,565 | ¥197,435 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on boot | -¥800 | ¥196,635 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on right | -¥800 | ¥195,835 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on roof | -¥800 | ¥195,035 |
| 1 | car-a | Body-pipeline materials | Body pipeline fillAndSand on chassis | -¥1,900 | ¥193,135 |
| 1 | car-a | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 | ¥191,935 |
| 1 | car-a | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 | ¥189,935 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on chassis | -¥800 | ¥189,135 |
| 1 | car-a | Parts | Part ordered standard: shitbox-stock-brake-pads-discs | -¥2,100 | ¥187,035 |
| 2 | car-a | Repair labour charges | Bench recondition: brakeCalipersLines to fine | -¥630 | ¥186,405 |
| 2 | car-a | Repair labour charges | Bench recondition: rims to fine | -¥480 | ¥185,925 |
| 2 | car-a | Parts | Part ordered standard: shitbox-stock-tyres | -¥3,100 | ¥182,825 |
| 3 | car-a | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 | ¥179,825 |
| 3 | car-a | Repair labour charges | Bench recondition: intake to fine | -¥250 | ¥179,575 |
| 3 | car-a | Repair labour charges | Bench recondition: exhaust to fine | -¥560 | ¥179,015 |
| 3 | car-a | Repair labour charges | Bench recondition: fuelSystem to fine | -¥250 | ¥178,765 |
| 3 | car-a | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥390 | ¥178,375 |
| 3 | car-a | Repair labour charges | Bench recondition: cooling to fine | -¥200 | ¥178,175 |
| 4 | car-a | Repair labour charges | Bench recondition: driveline to fine | -¥420 | ¥177,755 |
| 4 | car-a | Repair labour charges | Bench recondition: dampers to fine | -¥560 | ¥177,195 |
| 4 | car-a | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 | ¥172,195 |
| 4 | car-a | Repair labour charges | Bench recondition: springs to fine | -¥250 | ¥171,945 |
| 4 | car-a | Repair labour charges | Bench recondition: antiRollBars to fine | -¥340 | ¥171,605 |
| 4 | car-a | Repair labour charges | Bench recondition: steering to fine | -¥620 | ¥170,985 |
| 4 | car-a | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥1,820 | ¥169,165 |
| 4 | car-a | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥360 | ¥168,805 |
| 5 | car-a | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 | ¥163,635 |
| 5 | car-a | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 | ¥155,605 |
| 5 | car-a | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 | ¥151,975 |
| 5 | car-a | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 | ¥149,225 |
| 6 | car-a | Sale proceeds | Car sold: car-worked-car-a-26 | ¥204,639 | ¥353,864 |
| 6 | car-b | Acquisition | Hammer won on lot worked-car-b-9 | -¥246,716 | ¥107,148 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on right | -¥800 | ¥106,348 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on chassis | -¥800 | ¥105,548 |
| 6 | car-b | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 | ¥104,348 |
| 6 | car-b | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 | ¥101,848 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 | ¥101,048 |
| 6 | car-b | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 | ¥99,148 |
| 6 | car-b | Repair labour charges | Bench recondition: brakeCalipersLines to fine | -¥720 | ¥98,428 |
| 7 | car-b | Repair labour charges | Bench recondition: rims to fine | -¥540 | ¥97,888 |
| 7 | car-b | Parts | Part ordered standard: stock-tyres | -¥3,500 | ¥94,388 |
| 7 | shop | Rent | Weekly rent | -¥20,000 | ¥74,388 |
| 8 | car-b | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 | ¥71,388 |
| 8 | car-b | Repair labour charges | Bench recondition: intake to fine | -¥290 | ¥71,098 |
| 8 | car-b | Repair labour charges | Bench recondition: exhaust to fine | -¥1,280 | ¥69,818 |
| 8 | car-b | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥450 | ¥69,368 |
| 8 | car-b | Repair labour charges | Bench recondition: cooling to fine | -¥220 | ¥69,148 |
| 8 | car-b | Repair labour charges | Bench recondition: driveline to fine | -¥480 | ¥68,668 |
| 9 | car-b | Repair labour charges | Bench recondition: dampers to fine | -¥640 | ¥68,028 |
| 9 | car-b | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 | ¥63,028 |
| 9 | car-b | Repair labour charges | Bench recondition: springs to fine | -¥290 | ¥62,738 |
| 9 | car-b | Repair labour charges | Bench recondition: antiRollBars to fine | -¥190 | ¥62,548 |
| 9 | car-b | Repair labour charges | Bench recondition: steering to fine | -¥350 | ¥62,198 |
| 9 | car-b | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥2,080 | ¥60,118 |
| 9 | car-b | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥420 | ¥59,698 |
| 10 | car-b | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 | ¥55,998 |
| 10 | car-b | Parts | Part ordered standard: suiko-street-radiator | -¥2,900 | ¥53,098 |
| 10 | car-b | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 | ¥49,398 |
| 10 | car-b | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 | ¥41,098 |
| 10 | car-b | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 | ¥35,698 |
| 11 | car-b | Listing fee | Listing fee (freeAdsPaper) | -¥1,500 | ¥34,198 |
| 12 | car-b | Sale proceeds | Car sold: car-worked-car-b-9 | ¥460,964 | ¥495,162 |

## Reconciliation

| Check | Yen |
|---|---|
| Opening cash | ¥300,000 |
| Sum of every ledger line above | ¥195,162 |
| **Closing cash, from the sim** | **¥495,162** |
| Difference | ¥0 |

The same total, decomposed the other way:

| Component | Yen |
|---|---|
| Suzuki Wagon R (CT21S) net (car ledger) | ¥61,864 |
| Nissan Silvia (S13) net (car ledger) | ¥169,298 |
| Rent | -¥20,000 |
| Machine-shop hire (running cost, not on any car ledger) | -¥16,000 |
| **Change in cash** | **¥195,162** |

Both identities are asserted to the yen, with no tolerance, in `packages/sim/tests/workedExample.test.ts`. The harness additionally refuses to continue if any single scripted step moves cash it cannot name, so an incomplete ledger fails loudly rather than balancing by accident.
