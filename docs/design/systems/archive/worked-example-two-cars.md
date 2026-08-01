# Two cars, end to end, generated from the shipped sim

This document is **generated**, not written: every number in it comes from executing the shipped resolvers in `packages/sim`, once, on a fixed seed. Nothing here is a hand-recomputed formula. Regenerate it with:

```
WORKED_EXAMPLE_WRITE=1 pnpm test packages/sim/tests/workedExample.test.ts
```

(PowerShell: `$env:WORKED_EXAMPLE_WRITE=1; pnpm test packages/sim/tests/workedExample.test.ts`.)

## Plain language, first

The shop opens with ¥300,000. It buys a rough 1993 Suzuki Wagon R (CT21S) for ¥120,523, spends ¥34,960 putting it right and dressing it up, and sells it on day 5 for ¥215,644. It then buys a tidy 1989 Nissan Silvia (S13) for ¥197,432, spends ¥83,900 on it, and sells that on day 12 for ¥413,448. Rent takes ¥20,000 over the same 12 days regardless of what the shop does. The till finishes at ¥472,277: **¥172,277 made in 12 days**, out of two cars and no other income at all.

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

- **Suzuki Wagon R (CT21S)** came up carrying a symptom; the run buys and repairs it exactly as it would any other car, with no diagnosis played. A symptomatic lot prices through `sheetGuideValueYen` rather than `marketValueYen`, off the car as the room SEES it, which adds a negative `fear` line to the room ledger and puts a diagnosis game on top. Its guide value therefore does not match its own first value rung, and the gap is the diagnosis game rather than a discrepancy.
- The opening auction catalogue and the day-1 service-job board are cleared before the run starts, so the two scripted lots are the only lots and no service job, story mission or staff retainer can pay into the till by accident. The test asserts all three streams stayed empty.
- Both cars are settled at the **auction reserve**, the bottom of the band a live room can produce. Each car section prices the desk buyout alongside it.
- The shop never books the engine, drivetrain or body machine-shop hires, so buried engine internals, the gearbox and welding are all out of reach. What that leaves behind is itemised per car.

## Headline

|  | Suzuki Wagon R (CT21S) | Nissan Silvia (S13) |
|---|---|---|
| Tier / culture | entry / kei | everyday / drift |
| Book value | ¥230,000 | ¥500,000 |
| Condition bought | rough | tidy |
| Paid (auction reserve) | ¥120,523 | ¥197,432 |
| Desk buyout would have been | ¥200,871 | ¥329,054 |
| Rung 1 - as bought | ¥199,434 | ¥329,054 |
| Rung 2 - repaired | ¥218,168 | ¥407,157 |
| Rung 3 - modified | ¥221,359 | ¥410,557 |
| Repair charges (`repairYen`) | ¥8,800 | ¥41,000 |
| Parts (`partsYen`) | ¥23,160 | ¥33,400 |
| Listing fees (`listingFeesYen`) | ¥0 | ¥1,500 |
| Sold for | ¥215,644 | ¥413,448 |
| **Net (ledger)** | **¥63,161** | **¥140,116** |
| Labour spent (energy points) | 67 | 327 |
| Days owned | 4 | 7 |

**Fixed overheads, held out of both margins.** Rent is a function of bays owned, not of any one car: ¥20,000 a week at 1 service, 3 parking and 2 forecourt bays, charged on `calendar.rentDayOfWeek`. Over this run it took ¥20,000. That is what the week costs whatever the shop does with it, and it is never subtracted from a car's margin above.

## Car A: Suzuki Wagon R (CT21S)

**Tier** entry - **culture** kei - **1993, 23,588 km** - lot `worked-car-a-26`, generated at seed `26`.

**Why this car.** The cheapest thing a day-one shop can reach, and bought rough: entry tier, Kei culture, ¥230,000 of book value. Its tier expects only `worn`, its `beyondDiscount` is 0.4 and its `aftermarketReturn` is 0.3 - so it is the car the economy pays you to fix and charges you to modify.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥200,871 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥120,523 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥200,871 |
| Attendance fee (local-yard) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥120,523** |

The realised price of a live-room win lands **somewhere between ¥120,523 and ¥200,871**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥80,348 more.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 1 | Repair labour charges | Bench recondition of car-worked-car-a-26-part-rims | -¥480 |
| day 1 | Body-pipeline materials | Body pipeline fillAndSand on bonnet | -¥1,900 |
| day 1 | Body-pipeline materials | Body pipeline polish on boot | -¥800 |
| day 1 | Body-pipeline materials | Body pipeline polish on left | -¥800 |
| day 1 | Body-pipeline materials | Body pipeline polish on right | -¥800 |
| day 1 | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 |
| day 1 | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 |
| day 1 | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 |
| day 1 | Parts | Part ordered standard: shitbox-stock-tyres | -¥3,100 |
| day 2 | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 |
| day 2 | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 |
| day 2 | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 |
| day 2 | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 |
| day 2 | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 |

Work spend, all categories: **¥34,960**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **67 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 2 | `wheels` | ¥3,000 | mounting a fresh tyre onto the rim on the bench |

A machine-shop hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from: hiring the engine crane for a day can pull four engines, so it belongs to no single one of them.

### 3. The value ladder

#### Rung 1: As bought (day 1, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥35,334 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥6,732 |
| **Total (`marketValueYen`)** |  | **¥199,434** |

Restoration bill still owed to the `fine` band the tier expects: ¥27,180.

#### Rung 2: Repaired (day 2, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥11,440 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥11,892 |
| **Total (`marketValueYen`)** |  | **¥218,168** |

Restoration bill still owed to the `fine` band the tier expects: ¥8,800.

#### Rung 3: Modified (day 2, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥11,440 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥11,344 |
| Stage D aftermarket premium | `aftermarket` | ¥2,643 |
| **Total (`marketValueYen`)** |  | **¥221,359** |

Restoration bill still owed to the `fine` band the tier expects: ¥8,800.

#### What decides the aftermarket premium

| Rung | Support headline | coherenceFactor | retentionFor | foundationFactor | aftermarketReturn | installedPartsValueYen | Credited premium |
|---|---|---|---|---|---|---|---|
| As bought | 1.000 | 1.000 | 1.100 | 0.45 | 0.30 | ¥0 | ¥0 |
| Repaired | 1.000 | 1.000 | 1.100 | 0.45 | 0.30 | ¥0 | ¥0 |
| Modified | 0.980 | 1.000 | 1.100 | 0.45 | 0.30 | ¥19,580 | ¥2,643 |

The credited premium is `foundationFactor x aftermarketReturn x installedPartsValueYen`, and `installedPartsValueYen` is itself every non-stock part's catalogue price times `retentionFor(coherenceFactor)`. All three gates multiply, so any one of them at zero takes the whole premium with it.

#### The build

| Slot | Part | Grade | List price | Paid | Express surcharge |
|---|---|---|---|---|---|
| `aero` | Mikoshi Lip Kit | street | ¥4,700 | ¥5,170 | ¥470 |
| `exhaust` | Suzaku Street Catback | street | ¥7,300 | ¥8,030 | ¥730 |
| `intake` | Fubuki Cold Air Intake Kit | street | ¥3,300 | ¥3,630 | ¥330 |
| `cooling` | Suiko Sport Radiator | street | ¥2,500 | ¥2,750 | ¥250 |

Parts total ¥19,580; the ladder above credits ¥2,643 of it back into the car's value.

#### What the shop could not reach

| Slot | Band | Why it stayed there |
|---|---|---|
| `panels` | poor | body pipeline capped: metal is labour-only and welding needs the body line |
| `paint` | poor | body pipeline capped: metal is labour-only and welding needs the body line |
| `underbody` | poor | body pipeline capped: metal is labour-only and welding needs the body line |

Remaining bill to the expected band: **¥8,800**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `shopFront` |
| Listing fee | ¥0 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 3 days |
| Buyer archetype | `tuner` |
| Buyer taste (through the channel ceiling) | 0.9742 |
| Offer quality fraction drawn | 1.0000 |
| **Final `priceYen`** | **¥215,644** |

#### The same car, every channel, and who each one brings

| Channel | Fee | Who it draws | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | First-timer | 1.00 | no | 1.0000 | ¥221,359 | - |
| `freeAdsPaper` | ¥1,500 | First-timer | 1.05 | no | 1.0500 | ¥232,427 | ¥9,568 |
| `tunerMagazine` | ¥12,000 | Tuner | 1.17 | yes | 0.9938 | ¥219,987 | -¥13,372 |
| `tradeNetwork` | ¥0 | the trade | n/a (flat `priceBand`) | no | n/a | ¥221,359 | ¥0 |
| `weekendMeet` | ¥3,000 | Hobbyist | 1.17 | yes | 1.0610 | ¥234,857 | ¥10,498 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥120,523 |
| `repairYen` | ¥8,800 |
| `partsYen` | ¥23,160 |
| `listingFeesYen` | ¥0 |
| Sale `priceYen` | ¥215,644 |
| **Net** | **¥63,161** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥3,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥60,161** to the bank.

## Car B: Nissan Silvia (S13)

**Tier** everyday - **culture** drift - **1989, 71,594 km** - lot `worked-car-b-9`, generated at seed `9`.

**Why this car.** Everything the Wagon R is not, and bought tidy rather than rough: everyday tier, Drift culture, ¥500,000 of book value. Its tier expects `fine`, its `beyondDiscount` is 0.8 and its `aftermarketReturn` is 0.6, so a coherent build gets twice the credit it would on the kei, and the tuner/racer/stancer crowd it draws will pay for it.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥329,054 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥197,432 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥329,054 |
| Attendance fee (regional) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥197,432** |

The realised price of a live-room win lands **somewhere between ¥197,432 and ¥329,054**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥131,622 more.

It arrived carrying somebody else's parts: `cooling` Suiko Track Radiator Kit (sport, poor), `brakePadsDiscs` Shuriken Sport Pads & Discs (sport, scrap). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 7 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-brakeCalipersLines | -¥1,440 |
| day 7 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-rims | -¥1,080 |
| day 8 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-intake | -¥580 |
| day 8 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-exhaust | -¥1,280 |
| day 8 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-fuelSystem | -¥580 |
| day 9 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-cooling | -¥900 |
| day 9 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-dampers | -¥1,280 |
| day 9 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-springs | -¥580 |
| day 9 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-antiRollBars | -¥380 |
| day 10 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-steering | -¥700 |
| day 10 | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥4,160 |
| day 10 | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥840 |
| day 5 | Body-pipeline materials | Body pipeline fillAndSand on bonnet | -¥1,900 |
| day 5 | Body-pipeline materials | Body pipeline fillAndSand on boot | -¥1,900 |
| day 5 | Body-pipeline materials | Body pipeline fillAndSand on roof | -¥1,900 |
| day 5 | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 |
| day 5 | Body-pipeline materials | Body pipeline prime on boot | -¥1,200 |
| day 5 | Body-pipeline materials | Body pipeline fillAndSand on left | -¥1,900 |
| day 5 | Body-pipeline materials | Body pipeline prime on roof | -¥1,200 |
| day 5 | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 |
| day 6 | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 |
| day 6 | Body-pipeline materials | Body pipeline paint on boot | -¥2,500 |
| day 6 | Body-pipeline materials | Body pipeline prime on left | -¥1,200 |
| day 6 | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 |
| day 6 | Body-pipeline materials | Body pipeline paint on roof | -¥2,500 |
| day 6 | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 |
| day 6 | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 |
| day 6 | Body-pipeline materials | Body pipeline polish on boot | -¥800 |
| day 6 | Body-pipeline materials | Body pipeline paint on left | -¥2,500 |
| day 6 | Body-pipeline materials | Body pipeline prime on right | -¥1,200 |
| day 6 | Body-pipeline materials | Body pipeline polish on roof | -¥800 |
| day 6 | Body-pipeline materials | Body pipeline polish on chassis | -¥800 |
| day 7 | Body-pipeline materials | Body pipeline polish on left | -¥800 |
| day 7 | Body-pipeline materials | Body pipeline paint on right | -¥2,500 |
| day 7 | Body-pipeline materials | Body pipeline polish on right | -¥800 |
| day 7 | Parts | Part ordered standard: stock-tyres | -¥3,500 |
| day 10 | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 |
| day 10 | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 |
| day 10 | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 |
| day 10 | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 |
| day 8 | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 |
| day 9 | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 |

Work spend, all categories: **¥82,400**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **327 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 8 | `wheels` | ¥3,000 | mounting a fresh tyre onto the rim on the bench |
| day 9 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |

A machine-shop hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from: hiring the engine crane for a day can pull four engines, so it belongs to no single one of them.

### 3. The value ladder

#### Rung 1: As bought (day 5, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥145,340 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥11,560 |
| Stage D aftermarket premium | `aftermarket` | ¥446 |
| **Total (`marketValueYen`)** |  | **¥329,054** |

Restoration bill still owed to the `fine` band the tier expects: ¥111,800.

#### Rung 2: Repaired (day 10, market heat 105%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Market heat | `heat` | ¥24,275 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥74,152 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥28,920 |
| Stage D aftermarket premium | `aftermarket` | ¥446 |
| **Total (`marketValueYen`)** |  | **¥407,157** |

Restoration bill still owed to the `fine` band the tier expects: ¥57,040.

#### Rung 3: Modified (day 11, market heat 105%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Market heat | `heat` | ¥24,275 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥74,152 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥27,608 |
| Stage D aftermarket premium | `aftermarket` | ¥2,534 |
| **Total (`marketValueYen`)** |  | **¥410,557** |

Restoration bill still owed to the `fine` band the tier expects: ¥57,040.

#### What decides the aftermarket premium

| Rung | Support headline | coherenceFactor | retentionFor | foundationFactor | aftermarketReturn | installedPartsValueYen | Credited premium |
|---|---|---|---|---|---|---|---|
| As bought | 1.000 | 1.000 | 1.100 | 0.15 | 0.60 | ¥4,950 | ¥446 |
| Repaired | 1.000 | 1.000 | 1.100 | 0.15 | 0.60 | ¥4,950 | ¥446 |
| Modified | 0.940 | 1.000 | 1.100 | 0.15 | 0.60 | ¥28,160 | ¥2,534 |

The credited premium is `foundationFactor x aftermarketReturn x installedPartsValueYen`, and `installedPartsValueYen` is itself every non-stock part's catalogue price times `retentionFor(coherenceFactor)`. All three gates multiply, so any one of them at zero takes the whole premium with it.

#### The build

| Slot | Part | Grade | List price | Paid | Express surcharge |
|---|---|---|---|---|---|
| `fuelSystem` | Koi Fuel Dynamics Street Injector Kit | street | ¥3,700 | ¥3,700 | - |
| `intake` | Fubuki Cold Air Intake Kit | street | ¥3,700 | ¥3,700 | - |
| `exhaust` | Suzaku Street Catback | street | ¥8,300 | ¥8,300 | - |
| `aero` | Mikoshi Lip Kit | street | ¥5,400 | ¥5,400 | - |

Parts total ¥21,100; the ladder above credits ¥2,088 of it back into the car's value.

#### What the shop could not reach

| Slot | Band | Why it stayed there |
|---|---|---|
| `block` | poor | assembly-gated (engineAssembly): worked only through the engine line |
| `internals` | scrap | scrap: replace-only |
| `headValvetrain` | poor | assembly-gated (engineAssembly): worked only through the engine line |
| `camsTiming` | poor | assembly-gated (engineAssembly): worked only through the engine line |
| `ignitionEcu` | scrap | scrap: replace-only |
| `forcedInduction` | poor | not reached by this run |
| `gearbox` | scrap | scrap: replace-only |
| `driveline` | scrap | scrap: replace-only |
| `brakePadsDiscs` | scrap | scrap: replace-only |
| `seats` | poor | signature slot: needs the interior line hired |
| `dashGauges` | poor | signature slot: needs the interior line hired |

Remaining bill to the expected band: **¥57,040**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `freeAdsPaper` |
| Listing fee | ¥1,500 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 1 day |
| Buyer archetype | `hobbyist` |
| Buyer taste (through the channel ceiling) | 1.0500 |
| Offer quality fraction drawn | 0.9591 |
| **Final `priceYen`** | **¥413,448** |

#### The same car, every channel, and who each one brings

| Channel | Fee | Who it draws | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | Hobbyist | 1.00 | no | 1.0000 | ¥410,557 | - |
| `freeAdsPaper` | ¥1,500 | First-timer | 1.05 | no | 1.0500 | ¥431,085 | ¥19,028 |
| `tunerMagazine` | ¥12,000 | Tuner | 1.17 | yes | 1.0979 | ¥450,747 | ¥28,190 |
| `tradeNetwork` | ¥0 | the trade | n/a (flat `priceBand`) | no | n/a | ¥410,557 | ¥0 |
| `weekendMeet` | ¥3,000 | Shakotan | 1.17 | yes | 1.1312 | ¥464,424 | ¥50,867 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥197,432 |
| `repairYen` | ¥41,000 |
| `partsYen` | ¥33,400 |
| `listingFeesYen` | ¥1,500 |
| Sale `priceYen` | ¥413,448 |
| **Net** | **¥140,116** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥8,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥132,116** to the bank.

## Staleness: what happens if it does not sell straight away

A side branch off Nissan Silvia (S13)'s listing snapshot: the same listing, the same seeds, walked 45 days without taking anything. Nothing here touches the career the ledger above reconciles - it is a hypothetical run of the same state.

| Day | `offersSeen` at the draw | Buyer | Quality fraction | Offer |
|---|---|---|---|---|
| 12 | 0 | `hobbyist` | 0.9591 | ¥413,448 |
| 13 | 1 | `hobbyist` | 0.9509 | ¥409,904 |
| 14 | 2 | `first-timer` | 0.8845 | ¥381,300 |
| 15 | 3 | `hobbyist` | 0.8644 | ¥390,271 |
| 18 | 4 | `first-timer` | 0.9304 | ¥420,033 |
| 21 | 5 | `hobbyist` | 0.8918 | ¥402,640 |
| 22 | 6 | `tuner` | 0.8959 | ¥413,617 |
| 25 | 7 | `first-timer` | 0.8743 | ¥403,630 |
| 28 | 8 | `hobbyist` | 0.8600 | ¥397,037 |
| 29 | 9 | `hobbyist` | 0.8506 | ¥397,037 |
| 30 | 10 | `hobbyist` | 0.8600 | ¥401,421 |
| 33 | 11 | `first-timer` | 0.8972 | ¥418,799 |
| 34 | 12 | `racer` | 0.9514 | ¥432,743 |
| 36 | 13 | `collector` | 0.8507 | ¥401,421 |
| 38 | 14 | `collector` | 0.8600 | ¥405,806 |
| 40 | 15 | `tuner` | 0.8667 | ¥408,961 |
| 42 | 16 | `first-timer` | 0.8600 | ¥405,806 |
| 43 | 17 | `first-timer` | 0.8663 | ¥408,760 |
| 46 | 18 | `first-timer` | 0.9189 | ¥433,580 |
| 47 | 19 | `hobbyist` | 0.8600 | ¥405,806 |
| 48 | 20 | `first-timer` | 0.8640 | ¥407,711 |
| 49 | 21 | `collector` | 0.8879 | ¥418,983 |
| 53 | 22 | `stancer` | 0.8600 | ¥401,421 |

23 offers in 45 days. First offer **¥413,448** (day 12); best offer **¥433,580** (day 46). Holding out for the best one seen is worth **¥20,132** - and costs ¥120,000 of rent over the same stretch, plus a forecourt slot that could have held another car.

**Is there ever a point in not taking the first offer?** On these numbers, no. The quality fraction decays with `offersSeen` exactly as `qualityMeanFor` says it should (`qualityFresh` 0.96 down toward `qualityFloor` 0.86), so the OFFER side of the equation only ever gets worse. What moves the price up again is a different buyer walking in, not a better offer from the same one: the spread between archetypes on this car is far wider than the whole staleness decay. Waiting is therefore a bet on WHO turns up, at a known cost of ¥2,667 a day in rent alone, and the bet does not pay.

## The whole cash ledger

Every yen that moved, in order. This is the list the reconciliation test sums.

| Day | Scope | Category | Item | Yen | Balance |
|---|---|---|---|---|---|
| - | - | - | Opening cash | - | ¥300,000 |
| 1 | car-a | Acquisition | Hammer won on lot worked-car-a-26 | -¥120,523 | ¥179,477 |
| 1 | car-a | Body-pipeline materials | Body pipeline fillAndSand on bonnet | -¥1,900 | ¥177,577 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on boot | -¥800 | ¥176,777 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on left | -¥800 | ¥175,977 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on right | -¥800 | ¥175,177 |
| 1 | car-a | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 | ¥173,977 |
| 1 | car-a | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 | ¥171,477 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 | ¥170,677 |
| 1 | car-a | Repair labour charges | Bench recondition of car-worked-car-a-26-part-rims | -¥480 | ¥170,197 |
| 1 | car-a | Parts | Part ordered standard: shitbox-stock-tyres | -¥3,100 | ¥167,097 |
| 2 | car-a | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 | ¥164,097 |
| 2 | car-a | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 | ¥158,927 |
| 2 | car-a | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 | ¥150,897 |
| 2 | car-a | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 | ¥147,267 |
| 2 | car-a | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 | ¥144,517 |
| 5 | car-a | Sale proceeds | Car sold: car-worked-car-a-26 | ¥215,644 | ¥360,161 |
| 5 | car-b | Acquisition | Hammer won on lot worked-car-b-9 | -¥197,432 | ¥162,729 |
| 5 | car-b | Body-pipeline materials | Body pipeline fillAndSand on bonnet | -¥1,900 | ¥160,829 |
| 5 | car-b | Body-pipeline materials | Body pipeline fillAndSand on boot | -¥1,900 | ¥158,929 |
| 5 | car-b | Body-pipeline materials | Body pipeline fillAndSand on roof | -¥1,900 | ¥157,029 |
| 5 | car-b | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 | ¥155,829 |
| 5 | car-b | Body-pipeline materials | Body pipeline prime on boot | -¥1,200 | ¥154,629 |
| 5 | car-b | Body-pipeline materials | Body pipeline fillAndSand on left | -¥1,900 | ¥152,729 |
| 5 | car-b | Body-pipeline materials | Body pipeline prime on roof | -¥1,200 | ¥151,529 |
| 5 | car-b | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 | ¥150,329 |
| 6 | car-b | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 | ¥147,829 |
| 6 | car-b | Body-pipeline materials | Body pipeline paint on boot | -¥2,500 | ¥145,329 |
| 6 | car-b | Body-pipeline materials | Body pipeline prime on left | -¥1,200 | ¥144,129 |
| 6 | car-b | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 | ¥142,229 |
| 6 | car-b | Body-pipeline materials | Body pipeline paint on roof | -¥2,500 | ¥139,729 |
| 6 | car-b | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 | ¥137,729 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 | ¥136,929 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on boot | -¥800 | ¥136,129 |
| 6 | car-b | Body-pipeline materials | Body pipeline paint on left | -¥2,500 | ¥133,629 |
| 6 | car-b | Body-pipeline materials | Body pipeline prime on right | -¥1,200 | ¥132,429 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on roof | -¥800 | ¥131,629 |
| 6 | car-b | Body-pipeline materials | Body pipeline polish on chassis | -¥800 | ¥130,829 |
| 7 | car-b | Body-pipeline materials | Body pipeline polish on left | -¥800 | ¥130,029 |
| 7 | car-b | Body-pipeline materials | Body pipeline paint on right | -¥2,500 | ¥127,529 |
| 7 | car-b | Body-pipeline materials | Body pipeline polish on right | -¥800 | ¥126,729 |
| 7 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-brakeCalipersLines | -¥1,440 | ¥125,289 |
| 7 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-rims | -¥1,080 | ¥124,209 |
| 7 | car-b | Parts | Part ordered standard: stock-tyres | -¥3,500 | ¥120,709 |
| 7 | shop | Rent | Weekly rent | -¥20,000 | ¥100,709 |
| 8 | car-b | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 | ¥97,709 |
| 8 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-intake | -¥580 | ¥97,129 |
| 8 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-exhaust | -¥1,280 | ¥95,849 |
| 8 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-fuelSystem | -¥580 | ¥95,269 |
| 9 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-cooling | -¥900 | ¥94,369 |
| 9 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-dampers | -¥1,280 | ¥93,089 |
| 9 | car-b | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 | ¥88,089 |
| 9 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-springs | -¥580 | ¥87,509 |
| 9 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-antiRollBars | -¥380 | ¥87,129 |
| 10 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-steering | -¥700 | ¥86,429 |
| 10 | car-b | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥4,160 | ¥82,269 |
| 10 | car-b | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥840 | ¥81,429 |
| 10 | car-b | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 | ¥77,729 |
| 10 | car-b | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 | ¥74,029 |
| 10 | car-b | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 | ¥65,729 |
| 10 | car-b | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 | ¥60,329 |
| 11 | car-b | Listing fee | Listing fee (freeAdsPaper) | -¥1,500 | ¥58,829 |
| 12 | car-b | Sale proceeds | Car sold: car-worked-car-b-9 | ¥413,448 | ¥472,277 |

## Reconciliation

| Check | Yen |
|---|---|
| Opening cash | ¥300,000 |
| Sum of every ledger line above | ¥172,277 |
| **Closing cash, from the sim** | **¥472,277** |
| Difference | ¥0 |

The same total, decomposed the other way:

| Component | Yen |
|---|---|
| Suzuki Wagon R (CT21S) net (car ledger) | ¥63,161 |
| Nissan Silvia (S13) net (car ledger) | ¥140,116 |
| Rent | -¥20,000 |
| Machine-shop hire (running cost, not on any car ledger) | -¥11,000 |
| **Change in cash** | **¥172,277** |

Both identities are asserted to the yen, with no tolerance, in `packages/sim/tests/workedExample.test.ts`. The harness additionally refuses to continue if any single scripted step moves cash it cannot name, so an incomplete ledger fails loudly rather than balancing by accident.
