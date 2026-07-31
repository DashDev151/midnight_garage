# Two cars, end to end, generated from the shipped sim

This document is **generated**, not written: every number in it comes from executing the shipped resolvers in `packages/sim`, once, on a fixed seed. Nothing here is a hand-recomputed formula. Regenerate it with:

```
WORKED_EXAMPLE_WRITE=1 pnpm test packages/sim/tests/workedExample.test.ts
```

(PowerShell: `$env:WORKED_EXAMPLE_WRITE=1; pnpm test packages/sim/tests/workedExample.test.ts`.)

## Plain language, first

The shop opens with ¥300,000. It buys a rough 1993 Suzuki Wagon R (CT21S) for ¥110,570, spends ¥45,030 putting it right and dressing it up, and sells it on day 7 for ¥205,577. It then buys a tidy 1990 Nissan Silvia (S13) for ¥263,954, spends ¥39,390 on it, and sells that on day 11 for ¥508,737. Rent takes ¥40,000 over the same 11 days regardless of what the shop does. The till finishes at ¥515,370: **¥215,370 made in 11 days**, out of two cars and no other income at all.

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

- Both lots came up **honest** (no symptoms). A symptomatic lot prices through `sheetGuideValueYen` instead, which adds a negative `fear` line to the room ledger and a diagnosis game on top. That is a different document.
- The opening auction catalogue and the day-1 service-job board are cleared before the run starts, so the two scripted lots are the only lots and no service job, story mission or staff retainer can pay into the till by accident. The test asserts all three streams stayed empty.
- Both cars are settled at the **auction reserve**, the bottom of the band a live room can produce. Each car section prices the desk buyout alongside it.
- The shop never hires the engine, drivetrain or body machine lines, so buried engine internals, the gearbox and welding are all out of reach. What that leaves behind is itemised per car.

## Headline

|  | Suzuki Wagon R (CT21S) | Nissan Silvia (S13) |
|---|---|---|
| Tier / culture | entry / Kei | everyday / Drift |
| Book value | ¥230,000 | ¥500,000 |
| Condition bought | rough | tidy |
| Paid (auction reserve) | ¥110,570 | ¥263,954 |
| Desk buyout would have been | ¥184,284 | ¥439,924 |
| Rung 1 - as bought | ¥184,284 | ¥439,924 |
| Rung 2 - repaired | ¥211,045 | ¥485,648 |
| Rung 3 - modified | ¥217,624 | ¥502,976 |
| Repair charges (`repairYen`) | ¥7,780 | ¥6,380 |
| Parts (`partsYen`) | ¥29,250 | ¥26,510 |
| Sold for | ¥205,577 | ¥508,737 |
| **Net (ledger)** | **¥57,977** | **¥211,893** |
| Labour spent (energy points) | 174 | 131 |
| Days owned | 6 | 4 |

**Fixed overheads, held out of both margins.** Rent is a function of bays owned, not of any one car: ¥20,000 a week at 1 service, 3 parking and 2 forecourt bays, charged on `calendar.rentDayOfWeek`. Over this run it took ¥40,000. That is what the week costs whatever the shop does with it, and it is never subtracted from a car's margin above.

## Car A: Suzuki Wagon R (CT21S)

**Tier** entry - **culture** Kei - **1993, 23,588 km** - lot `worked-car-a-26`, generated at seed `26`.

**Why this car.** The cheapest thing a day-one shop can reach, and bought rough: entry tier, Kei culture, ¥230,000 of book value. Its tier expects only `worn`, its `beyondDiscount` is 0.4 and its `aftermarketReturn` is 0.3 - so it is the car the economy pays you to fix and charges you to modify.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥184,284 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥110,570 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥184,284 |
| Attendance fee (local-yard) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥110,570** |

The realised price of a live-room win lands **somewhere between ¥110,570 and ¥184,284**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at the room's own `auctionRoom.reserveFraction` of 0.55. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥73,714 more.

It arrived carrying somebody else's parts: `camsTiming` Raiden Sport Cams (sport, poor), `antiRollBars` Kumo Sport Sway Bars (sport, poor), `steering` Kitsune Sport Rack (sport, poor). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 2 | Repair labour charges | Bench recondition: brakeCalipersLines to worn | -¥630 |
| day 3 | Repair labour charges | Bench recondition: intake to worn | -¥250 |
| day 3 | Repair labour charges | Bench recondition: exhaust to worn | -¥560 |
| day 3 | Repair labour charges | Bench recondition: fuelSystem to worn | -¥250 |
| day 3 | Repair labour charges | Bench recondition: ignitionEcu to worn | -¥390 |
| day 3 | Repair labour charges | Bench recondition: cooling to worn | -¥200 |
| day 3 | Repair labour charges | Bench recondition: driveline to worn | -¥420 |
| day 4 | Repair labour charges | Bench recondition: dampers to worn | -¥560 |
| day 4 | Repair labour charges | Bench recondition: springs to worn | -¥250 |
| day 4 | Repair labour charges | Bench recondition: antiRollBars to worn | -¥340 |
| day 4 | Repair labour charges | Bench recondition: steering to worn | -¥620 |
| day 4 | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥1,820 |
| day 4 | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥360 |
| day 1 | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 |
| day 1 | Body-pipeline materials | Body pipeline prime on right | -¥1,200 |
| day 1 | Body-pipeline materials | Body pipeline paint on right | -¥2,500 |
| day 1 | Parts | Part ordered standard: shitbox-stock-brake-pads-discs | -¥2,100 |
| day 2 | Parts | Part ordered standard: shitbox-stock-tyres | -¥3,100 |
| day 5 | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 |
| day 5 | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 |
| day 5 | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 |
| day 5 | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 |
| day 3 | Machine-line hire | Machine line hired for the day: wheels | -¥3,000 |
| day 4 | Machine-line hire | Machine line hired for the day: suspension | -¥5,000 |

Work spend, all categories: **¥45,030**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **174 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 3 | `wheels` | ¥3,000 | mounting a fresh tyre onto the rim on the bench |
| day 4 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |

A machine-line hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from.

### 3. The value ladder

#### Rung 1: As bought (day 1, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥30,771 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥25,008 |
| Stage C coherence discount | `coherence` | -¥5,466 |
| Stage D aftermarket premium | `aftermarket` | ¥4,029 |
| **Total (`marketValueYen`)** |  | **¥184,284** |

Restoration bill still owed to the `worn` band the tier expects: ¥23,670.

#### Rung 2: Repaired (day 5, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥7,553 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥25,728 |
| Stage C coherence discount | `coherence` | -¥6,128 |
| Stage D aftermarket premium | `aftermarket` | ¥8,954 |
| **Total (`marketValueYen`)** |  | **¥211,045** |

Restoration bill still owed to the `worn` band the tier expects: ¥5,810.

#### Rung 3: Modified (day 5, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥7,553 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥24,632 |
| Stage C coherence discount | `coherence` | -¥6,160 |
| Stage D aftermarket premium | `aftermarket` | ¥14,469 |
| **Total (`marketValueYen`)** |  | **¥217,624** |

Restoration bill still owed to the `worn` band the tier expects: ¥5,810.

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
| `headValvetrain` | poor | assembly-gated (engineAssembly): worked only through the engine line |
| `camsTiming` | poor | assembly-gated (engineAssembly): worked only through the engine line |
| `seats` | poor | signature slot: needs the interior line hired |
| `dashGauges` | poor | signature slot: needs the interior line hired |

Remaining bill to the expected band: **¥5,810**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `shopFront` |
| Listing fee | ¥0 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 2 days |
| Buyer archetype | `first-timer` |
| Buyer taste (through the channel ceiling) | 1.0000 |
| Offer quality fraction drawn | 0.9446 |
| **Final `priceYen`** | **¥205,577** |

#### The same car, the same buyer, every channel

| Channel | Fee | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | 1.00 | no | 1.0000 | ¥217,624 | - |
| `freeAdsPaper` | ¥1,500 | 1.05 | no | 1.0500 | ¥228,505 | ¥9,381 |
| `tunerMagazine` | ¥12,000 | 1.17 | yes | 1.1037 | ¥240,184 | ¥10,560 |
| `tradeNetwork` | ¥0 | n/a (flat `priceBand`) | no | n/a | ¥217,624 | ¥0 |
| `weekendMeet` | ¥3,000 | 1.17 | yes | 1.1037 | ¥240,184 | ¥19,560 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥110,570 |
| `repairYen` | ¥7,780 |
| `partsYen` | ¥29,250 |
| Sale `priceYen` | ¥205,577 |
| **Net** | **¥57,977** |

The car ledger does not carry the machine-line hires or the listing fee (¥8,000 between them): those are day costs, not car costs. Counting them, this car actually returned **¥49,977** to the bank.

## Car B: Nissan Silvia (S13)

**Tier** everyday - **culture** Drift - **1990, 60,098 km** - lot `worked-car-b-9`, generated at seed `9`.

**Why this car.** Everything the Wagon R is not, and bought tidy rather than rough: everyday tier, Drift culture, ¥500,000 of book value. Its tier expects `fine`, its `beyondDiscount` is 0.8 and its `aftermarketReturn` is 0.6, so a coherent build gets twice the credit it would on the kei, and the tuner/racer/stancer crowd it draws will pay for it.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥439,924 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥263,954 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥439,924 |
| Attendance fee (regional) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥263,954** |

The realised price of a live-room win lands **somewhere between ¥263,954 and ¥439,924**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at the room's own `auctionRoom.reserveFraction` of 0.55. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥175,970 more.

It arrived carrying somebody else's part: `brakePadsDiscs` Shuriken Sport Pads & Discs (sport, worn). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 7 | Repair labour charges | Bench recondition: brakeCalipersLines to fine | -¥720 |
| day 7 | Repair labour charges | Bench recondition: intake to fine | -¥290 |
| day 8 | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥450 |
| day 8 | Repair labour charges | Bench recondition: cooling to fine | -¥220 |
| day 8 | Repair labour charges | Bench recondition: springs to fine | -¥290 |
| day 8 | Repair labour charges | Bench recondition: antiRollBars to fine | -¥190 |
| day 8 | Repair labour charges | Bench recondition: steering to fine | -¥350 |
| day 8 | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥2,080 |
| day 7 | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 |
| day 7 | Body-pipeline materials | Body pipeline polish on boot | -¥800 |
| day 7 | Body-pipeline materials | Body pipeline polish on chassis | -¥800 |
| day 7 | Body-pipeline materials | Body pipeline fillAndSand on bonnet | -¥1,900 |
| day 9 | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 |
| day 9 | Parts | Part ordered standard: suiko-street-radiator | -¥2,900 |
| day 9 | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 |
| day 9 | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 |
| day 9 | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 |
| day 8 | Machine-line hire | Machine line hired for the day: suspension | -¥5,000 |

Work spend, all categories: **¥37,890**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **131 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 8 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |

A machine-line hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from.

### 3. The value ladder

#### Rung 1: As bought (day 7, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥122 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥41,002 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥22,120 |
| Stage D aftermarket premium | `aftermarket` | ¥3,168 |
| **Total (`marketValueYen`)** |  | **¥439,924** |

Restoration bill still owed to the `fine` band the tier expects: ¥31,540.

#### Rung 2: Repaired (day 9, market heat 105%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥122 |
| Market heat | `heat` | ¥24,993 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥11,791 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥30,600 |
| Stage D aftermarket premium | `aftermarket` | ¥3,168 |
| **Total (`marketValueYen`)** |  | **¥485,648** |

Restoration bill still owed to the `fine` band the tier expects: ¥9,070.

#### Rung 3: Modified (day 10, market heat 105%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥122 |
| Market heat | `heat` | ¥24,993 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥11,791 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥29,112 |
| Stage D aftermarket premium | `aftermarket` | ¥19,008 |
| **Total (`marketValueYen`)** |  | **¥502,976** |

Restoration bill still owed to the `fine` band the tier expects: ¥9,070.

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
| `camsTiming` | worn | assembly-gated (engineAssembly): worked only through the engine line |
| `forcedInduction` | worn | not reached by this run |
| `brakePadsDiscs` | worn | replace-only aftermarket part, kept: its premium is worth more than its share of the bill |
| `seats` | worn | signature slot: needs the interior line hired |
| `dashGauges` | worn | signature slot: needs the interior line hired |

Remaining bill to the expected band: **¥9,070**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `freeAdsPaper` |
| Listing fee | ¥1,500 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 1 day |
| Buyer archetype | `racer` |
| Buyer taste (through the channel ceiling) | 1.0445 |
| Offer quality fraction drawn | 0.9684 |
| **Final `priceYen`** | **¥508,737** |

#### The same car, the same buyer, every channel

| Channel | Fee | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | 1.00 | no | 1.0000 | ¥502,976 | - |
| `freeAdsPaper` | ¥1,500 | 1.05 | no | 1.0445 | ¥525,336 | ¥20,860 |
| `tunerMagazine` | ¥12,000 | 1.17 | yes | 1.0787 | ¥542,568 | ¥27,592 |
| `tradeNetwork` | ¥0 | n/a (flat `priceBand`) | no | n/a | ¥502,976 | ¥0 |
| `weekendMeet` | ¥3,000 | 1.17 | yes | 1.0787 | ¥542,568 | ¥36,592 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥263,954 |
| `repairYen` | ¥6,380 |
| `partsYen` | ¥26,510 |
| Sale `priceYen` | ¥508,737 |
| **Net** | **¥211,893** |

The car ledger does not carry the machine-line hires or the listing fee (¥6,500 between them): those are day costs, not car costs. Counting them, this car actually returned **¥205,393** to the bank.

## Staleness: what happens if it does not sell straight away

A side branch off Nissan Silvia (S13)'s listing snapshot: the same listing, the same seeds, walked 45 days without taking anything. Nothing here touches the career the ledger above reconciles - it is a hypothetical run of the same state.

| Day | `offersSeen` at the draw | Buyer | Quality fraction | Offer |
|---|---|---|---|---|
| 11 | 0 | `racer` | 0.9684 | ¥508,737 |
| 12 | 1 | `racer` | 0.9094 | ¥477,766 |
| 13 | 2 | `racer` | 0.9231 | ¥484,959 |
| 15 | 3 | `first-timer` | 0.8583 | ¥471,283 |
| 16 | 4 | `racer` | 0.9079 | ¥495,927 |
| 19 | 5 | `racer` | 0.8765 | ¥478,755 |
| 26 | 6 | `racer` | 0.8632 | ¥480,511 |
| 27 | 7 | `kei-specialist` | 0.9165 | ¥512,891 |
| 29 | 8 | `kei-specialist` | 0.8797 | ¥496,907 |
| 32 | 9 | `first-timer` | 0.9058 | ¥511,660 |
| 33 | 10 | `kei-specialist` | 0.9021 | ¥509,564 |
| 34 | 11 | `kei-specialist` | 0.8600 | ¥485,785 |
| 36 | 12 | `stancer` | 0.8521 | ¥454,297 |
| 37 | 13 | `first-timer` | 0.8790 | ¥501,150 |
| 39 | 14 | `first-timer` | 0.8768 | ¥499,879 |
| 40 | 15 | `stancer` | 0.8600 | ¥458,518 |
| 42 | 16 | `first-timer` | 0.8600 | ¥490,299 |
| 43 | 17 | `first-timer` | 0.8600 | ¥490,299 |
| 45 | 18 | `stancer` | 0.8600 | ¥458,518 |
| 46 | 19 | `tuner` | 0.8969 | ¥511,320 |
| 49 | 20 | `tuner` | 0.9534 | ¥543,555 |
| 50 | 21 | `racer` | 0.8943 | ¥502,506 |
| 54 | 22 | `tuner` | 0.8761 | ¥494,865 |

23 offers in 45 days. First offer **¥508,737** (day 11); best offer **¥543,555** (day 49). Holding out for the best one seen is worth **¥34,818** - and costs ¥120,000 of rent over the same stretch, plus a forecourt slot that could have held another car.

**Is there ever a point in not taking the first offer?** On these numbers, no. The quality fraction decays with `offersSeen` exactly as `qualityMeanFor` says it should (`qualityFresh` 0.96 down toward `qualityFloor` 0.86), so the OFFER side of the equation only ever gets worse. What moves the price up again is a different buyer walking in, not a better offer from the same one: the spread between archetypes on this car is far wider than the whole staleness decay. Waiting is therefore a bet on WHO turns up, at a known cost of ¥2,667 a day in rent alone, and the bet does not pay.

## The whole cash ledger

Every yen that moved, in order. This is the list the reconciliation test sums.

| Day | Scope | Category | Item | Yen | Balance |
|---|---|---|---|---|---|
| - | - | - | Opening cash | - | ¥300,000 |
| 1 | car-a | Acquisition | Hammer won on lot worked-car-a-26 | -¥110,570 | ¥189,430 |
| 1 | car-a | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 | ¥187,530 |
| 1 | car-a | Body-pipeline materials | Body pipeline prime on right | -¥1,200 | ¥186,330 |
| 1 | car-a | Body-pipeline materials | Body pipeline paint on right | -¥2,500 | ¥183,830 |
| 1 | car-a | Parts | Part ordered standard: shitbox-stock-brake-pads-discs | -¥2,100 | ¥181,730 |
| 1 | shop | Rent | Weekly rent | -¥20,000 | ¥161,730 |
| 2 | car-a | Repair labour charges | Bench recondition: brakeCalipersLines to worn | -¥630 | ¥161,100 |
| 2 | car-a | Parts | Part ordered standard: shitbox-stock-tyres | -¥3,100 | ¥158,000 |
| 3 | car-a | Machine-line hire | Machine line hired for the day: wheels | -¥3,000 | ¥155,000 |
| 3 | car-a | Repair labour charges | Bench recondition: intake to worn | -¥250 | ¥154,750 |
| 3 | car-a | Repair labour charges | Bench recondition: exhaust to worn | -¥560 | ¥154,190 |
| 3 | car-a | Repair labour charges | Bench recondition: fuelSystem to worn | -¥250 | ¥153,940 |
| 3 | car-a | Repair labour charges | Bench recondition: ignitionEcu to worn | -¥390 | ¥153,550 |
| 3 | car-a | Repair labour charges | Bench recondition: cooling to worn | -¥200 | ¥153,350 |
| 3 | car-a | Repair labour charges | Bench recondition: driveline to worn | -¥420 | ¥152,930 |
| 4 | car-a | Repair labour charges | Bench recondition: dampers to worn | -¥560 | ¥152,370 |
| 4 | car-a | Machine-line hire | Machine line hired for the day: suspension | -¥5,000 | ¥147,370 |
| 4 | car-a | Repair labour charges | Bench recondition: springs to worn | -¥250 | ¥147,120 |
| 4 | car-a | Repair labour charges | Bench recondition: antiRollBars to worn | -¥340 | ¥146,780 |
| 4 | car-a | Repair labour charges | Bench recondition: steering to worn | -¥620 | ¥146,160 |
| 4 | car-a | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥1,820 | ¥144,340 |
| 4 | car-a | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥360 | ¥143,980 |
| 5 | car-a | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 | ¥138,810 |
| 5 | car-a | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 | ¥130,780 |
| 5 | car-a | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 | ¥127,150 |
| 5 | car-a | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 | ¥124,400 |
| 7 | car-a | Sale proceeds | Car sold: car-worked-car-a-26 | ¥205,577 | ¥329,977 |
| 7 | car-b | Acquisition | Hammer won on lot worked-car-b-9 | -¥263,954 | ¥66,023 |
| 7 | car-b | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 | ¥65,223 |
| 7 | car-b | Body-pipeline materials | Body pipeline polish on boot | -¥800 | ¥64,423 |
| 7 | car-b | Body-pipeline materials | Body pipeline polish on chassis | -¥800 | ¥63,623 |
| 7 | car-b | Body-pipeline materials | Body pipeline fillAndSand on bonnet | -¥1,900 | ¥61,723 |
| 7 | car-b | Repair labour charges | Bench recondition: brakeCalipersLines to fine | -¥720 | ¥61,003 |
| 7 | car-b | Repair labour charges | Bench recondition: intake to fine | -¥290 | ¥60,713 |
| 8 | car-b | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥450 | ¥60,263 |
| 8 | car-b | Repair labour charges | Bench recondition: cooling to fine | -¥220 | ¥60,043 |
| 8 | car-b | Repair labour charges | Bench recondition: springs to fine | -¥290 | ¥59,753 |
| 8 | car-b | Machine-line hire | Machine line hired for the day: suspension | -¥5,000 | ¥54,753 |
| 8 | car-b | Repair labour charges | Bench recondition: antiRollBars to fine | -¥190 | ¥54,563 |
| 8 | car-b | Repair labour charges | Bench recondition: steering to fine | -¥350 | ¥54,213 |
| 8 | car-b | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥2,080 | ¥52,133 |
| 8 | shop | Rent | Weekly rent | -¥20,000 | ¥32,133 |
| 9 | car-b | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 | ¥28,433 |
| 9 | car-b | Parts | Part ordered standard: suiko-street-radiator | -¥2,900 | ¥25,533 |
| 9 | car-b | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 | ¥21,833 |
| 9 | car-b | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 | ¥13,533 |
| 9 | car-b | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 | ¥8,133 |
| 10 | car-b | Listing fee | Listing fee (freeAdsPaper) | -¥1,500 | ¥6,633 |
| 11 | car-b | Sale proceeds | Car sold: car-worked-car-b-9 | ¥508,737 | ¥515,370 |

## Reconciliation

| Check | Yen |
|---|---|
| Opening cash | ¥300,000 |
| Sum of every ledger line above | ¥215,370 |
| **Closing cash, from the sim** | **¥515,370** |
| Difference | ¥0 |

The same total, decomposed the other way:

| Component | Yen |
|---|---|
| Suzuki Wagon R (CT21S) net (car ledger) | ¥57,977 |
| Nissan Silvia (S13) net (car ledger) | ¥211,893 |
| Rent | -¥40,000 |
| Machine-line hire (day cost, not on any car ledger) | -¥13,000 |
| Listing fees (day cost, not on any car ledger) | -¥1,500 |
| **Change in cash** | **¥215,370** |

Both identities are asserted to the yen, with no tolerance, in `packages/sim/tests/workedExample.test.ts`. The harness additionally refuses to continue if any single scripted step moves cash it cannot name, so an incomplete ledger fails loudly rather than balancing by accident.
