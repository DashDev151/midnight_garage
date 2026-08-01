# Two cars, end to end, generated from the shipped sim

This document is **generated**, not written: every number in it comes from executing the shipped resolvers in `packages/sim`, once, on a fixed seed. Nothing here is a hand-recomputed formula. Regenerate it with:

```
WORKED_EXAMPLE_WRITE=1 pnpm test packages/sim/tests/workedExample.test.ts
```

(PowerShell: `$env:WORKED_EXAMPLE_WRITE=1; pnpm test packages/sim/tests/workedExample.test.ts`.)

## Plain language, first

The shop opens with ¥300,000. It buys a rough 1993 Suzuki Wagon R (CT21S) for ¥120,592, spends ¥35,320 putting it right and dressing it up, and sells it on day 7 for ¥194,314. It then buys a tidy 1989 Nissan Silvia (S13) for ¥194,668, spends ¥83,320 on it, and sells that on day 14 for ¥400,489. Rent takes ¥20,000 over the same 14 days regardless of what the shop does. The till finishes at ¥440,903: **¥140,903 made in 14 days**, out of two cars and no other income at all.

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
| Paid (auction reserve) | ¥120,592 | ¥194,668 |
| Desk buyout would have been | ¥200,987 | ¥324,446 |
| Rung 1 - as bought | ¥199,550 | ¥324,446 |
| Rung 2 - repaired | ¥218,752 | ¥401,795 |
| Rung 3 - modified | ¥225,094 | ¥408,733 |
| Repair charges (`repairYen`) | ¥9,160 | ¥41,000 |
| Parts (`partsYen`) | ¥23,160 | ¥32,820 |
| Listing fees (`listingFeesYen`) | ¥0 | ¥1,500 |
| Sold for | ¥194,314 | ¥400,489 |
| **Net (ledger)** | **¥41,402** | **¥130,501** |
| Labour spent (energy points) | 72 | 312 |
| Days owned | 6 | 7 |

**Fixed overheads, held out of both margins.** Rent is a function of bays owned, not of any one car: ¥20,000 a week at 1 service, 3 parking and 2 forecourt bays, charged on `calendar.rentDayOfWeek`. Over this run it took ¥20,000. That is what the week costs whatever the shop does with it, and it is never subtracted from a car's margin above.

## Car A: Suzuki Wagon R (CT21S)

**Tier** entry - **culture** kei - **1993, 23,588 km** - lot `worked-car-a-26`, generated at seed `26`.

**Why this car.** The cheapest thing a day-one shop can reach, and bought rough: entry tier, Kei culture, ¥230,000 of book value. Its tier expects only `worn`, its `beyondDiscount` is 0.4 and its `aftermarketReturn` is 0.3 - so it is the car the economy pays you to fix and charges you to modify.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥200,987 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥120,592 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥200,987 |
| Attendance fee (local-yard) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥120,592** |

The realised price of a live-room win lands **somewhere between ¥120,592 and ¥200,987**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥80,395 more.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 1 | Repair labour charges | Bench recondition of car-worked-car-a-26-part-rims | -¥480 |
| day 2 | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥360 |
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

Work spend, all categories: **¥35,320**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **72 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

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
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥35,802 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥6,148 |
| **Total (`marketValueYen`)** |  | **¥199,550** |

Restoration bill still owed to the `fine` band the tier expects: ¥27,540.

#### Rung 2: Repaired (day 2, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥11,440 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥11,308 |
| **Total (`marketValueYen`)** |  | **¥218,752** |

Restoration bill still owed to the `fine` band the tier expects: ¥8,800.

#### Rung 3: Modified (day 2, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥11,440 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥10,840 |
| Stage D aftermarket premium | `aftermarket` | ¥5,874 |
| **Total (`marketValueYen`)** |  | **¥225,094** |

Restoration bill still owed to the `fine` band the tier expects: ¥8,800.

#### What decides the aftermarket premium

| Rung | Support headline | coherenceFactor | retentionFor | foundationFactor | aftermarketReturn | installedPartsValueYen | Credited premium |
|---|---|---|---|---|---|---|---|
| As bought | 1.000 | 1.000 | 1.100 | 0.45 | 0.30 | ¥0 | ¥0 |
| Repaired | 1.000 | 1.000 | 1.100 | 1.00 | 0.30 | ¥0 | ¥0 |
| Modified | 0.980 | 1.000 | 1.100 | 1.00 | 0.30 | ¥19,580 | ¥5,874 |

The credited premium is `foundationFactor x aftermarketReturn x installedPartsValueYen`, and `installedPartsValueYen` is itself every non-stock part's catalogue price times `retentionFor(coherenceFactor)`. All three gates multiply, so any one of them at zero takes the whole premium with it.

#### The build

| Slot | Part | Grade | List price | Paid | Express surcharge |
|---|---|---|---|---|---|
| `aero` | Mikoshi Lip Kit | street | ¥4,700 | ¥5,170 | ¥470 |
| `exhaust` | Suzaku Street Catback | street | ¥7,300 | ¥8,030 | ¥730 |
| `intake` | Fubuki Cold Air Intake Kit | street | ¥3,300 | ¥3,630 | ¥330 |
| `cooling` | Suiko Sport Radiator | street | ¥2,500 | ¥2,750 | ¥250 |

Parts total ¥19,580; the ladder above credits ¥5,874 of it back into the car's value.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `shopFront` |
| Listing fee | ¥0 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 5 days |
| Buyer archetype | `racer` |
| Buyer taste (through the channel ceiling) | 0.9766 |
| Offer quality fraction drawn | 0.8839 |
| **Final `priceYen`** | **¥194,314** |

#### The same car, every channel, and who each one brings

| Channel | Fee | Who it draws | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | First-timer | 1.00 | no | 1.0000 | ¥225,094 | - |
| `freeAdsPaper` | ¥1,500 | First-timer | 1.05 | no | 1.0500 | ¥236,349 | ¥9,755 |
| `tunerMagazine` | ¥12,000 | Tuner | 1.17 | yes | 0.9977 | ¥224,587 | -¥12,507 |
| `tradeNetwork` | ¥0 | the trade | n/a (flat `priceBand`) | no | n/a | ¥225,094 | ¥0 |
| `weekendMeet` | ¥3,000 | Kei Specialist | 1.17 | yes | 1.0652 | ¥239,769 | ¥11,675 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥120,592 |
| `repairYen` | ¥9,160 |
| `partsYen` | ¥23,160 |
| `listingFeesYen` | ¥0 |
| Sale `priceYen` | ¥194,314 |
| **Net** | **¥41,402** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥3,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥38,402** to the bank.

## Car B: Nissan Silvia (S13)

**Tier** everyday - **culture** drift - **1989, 71,594 km** - lot `worked-car-b-9`, generated at seed `9`.

**Why this car.** Everything the Wagon R is not, and bought tidy rather than rough: everyday tier, Drift culture, ¥500,000 of book value. Its tier expects `fine`, its `beyondDiscount` is 0.8 and its `aftermarketReturn` is 0.6, so a coherent build gets twice the credit it would on the kei, and the tuner/racer/stancer crowd it draws will pay for it.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥324,446 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥194,668 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥324,446 |
| Attendance fee (regional) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥194,668** |

The realised price of a live-room win lands **somewhere between ¥194,668 and ¥324,446**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥129,778 more.

It arrived carrying somebody else's parts: `cooling` Suiko Track Radiator Kit (sport, poor), `brakePadsDiscs` Shuriken Sport Pads & Discs (sport, scrap). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 9 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-brakeCalipersLines | -¥1,440 |
| day 9 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-rims | -¥1,080 |
| day 10 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-intake | -¥580 |
| day 10 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-exhaust | -¥1,280 |
| day 10 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-cooling | -¥900 |
| day 11 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-dampers | -¥1,280 |
| day 11 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-springs | -¥580 |
| day 11 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-antiRollBars | -¥380 |
| day 11 | Repair labour charges | Bench recondition of car-worked-car-b-9-part-steering | -¥700 |
| day 12 | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥4,160 |
| day 12 | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥840 |
| day 7 | Body-pipeline materials | Body pipeline fillAndSand on bonnet | -¥1,900 |
| day 7 | Body-pipeline materials | Body pipeline fillAndSand on boot | -¥1,900 |
| day 7 | Body-pipeline materials | Body pipeline fillAndSand on roof | -¥1,900 |
| day 7 | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 |
| day 7 | Body-pipeline materials | Body pipeline prime on boot | -¥1,200 |
| day 7 | Body-pipeline materials | Body pipeline fillAndSand on left | -¥1,900 |
| day 7 | Body-pipeline materials | Body pipeline prime on roof | -¥1,200 |
| day 7 | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 |
| day 8 | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 |
| day 8 | Body-pipeline materials | Body pipeline paint on boot | -¥2,500 |
| day 8 | Body-pipeline materials | Body pipeline prime on left | -¥1,200 |
| day 8 | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 |
| day 8 | Body-pipeline materials | Body pipeline paint on roof | -¥2,500 |
| day 8 | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 |
| day 8 | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 |
| day 8 | Body-pipeline materials | Body pipeline polish on boot | -¥800 |
| day 8 | Body-pipeline materials | Body pipeline paint on left | -¥2,500 |
| day 8 | Body-pipeline materials | Body pipeline prime on right | -¥1,200 |
| day 8 | Body-pipeline materials | Body pipeline polish on roof | -¥800 |
| day 8 | Body-pipeline materials | Body pipeline polish on chassis | -¥800 |
| day 9 | Body-pipeline materials | Body pipeline polish on left | -¥800 |
| day 9 | Body-pipeline materials | Body pipeline paint on right | -¥2,500 |
| day 9 | Body-pipeline materials | Body pipeline polish on right | -¥800 |
| day 9 | Parts | Part ordered standard: stock-tyres | -¥3,500 |
| day 12 | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 |
| day 12 | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 |
| day 12 | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 |
| day 12 | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 |
| day 10 | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 |
| day 11 | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 |

Work spend, all categories: **¥81,820**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **312 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 10 | `wheels` | ¥3,000 | mounting a fresh tyre onto the rim on the bench |
| day 11 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |

A machine-shop hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from: hiring the engine crane for a day can pull four engines, so it belongs to no single one of them.

### 3. The value ladder

#### Rung 1: As bought (day 7, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥150,332 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥11,176 |
| Stage D aftermarket premium | `aftermarket` | ¥446 |
| **Total (`marketValueYen`)** |  | **¥324,446** |

Restoration bill still owed to the `fine` band the tier expects: ¥115,640.

#### Rung 2: Repaired (day 12, market heat 105%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Market heat | `heat` | ¥24,275 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥79,898 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥28,536 |
| Stage D aftermarket premium | `aftermarket` | ¥446 |
| **Total (`marketValueYen`)** |  | **¥401,795** |

Restoration bill still owed to the `fine` band the tier expects: ¥61,460.

#### Rung 3: Modified (day 13, market heat 105%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥14,492 |
| Market heat | `heat` | ¥24,275 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥76,128 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥27,456 |
| Stage D aftermarket premium | `aftermarket` | ¥2,534 |
| **Total (`marketValueYen`)** |  | **¥408,733** |

Restoration bill still owed to the `fine` band the tier expects: ¥58,560.

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
| `fuelSystem` | scrap | scrap: replace-only |
| `ignitionEcu` | scrap | scrap: replace-only |
| `forcedInduction` | poor | not reached by this run |
| `gearbox` | scrap | scrap: replace-only |
| `driveline` | scrap | scrap: replace-only |
| `brakePadsDiscs` | scrap | scrap: replace-only |
| `seats` | poor | signature slot: needs the interior line hired |
| `dashGauges` | scrap | scrap: replace-only |

Remaining bill to the expected band: **¥61,460**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `freeAdsPaper` |
| Listing fee | ¥1,500 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 1 day |
| Buyer archetype | `first-timer` |
| Buyer taste (through the channel ceiling) | 1.0500 |
| Offer quality fraction drawn | 0.9332 |
| **Final `priceYen`** | **¥400,489** |

#### The same car, every channel, and who each one brings

| Channel | Fee | Who it draws | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | Kei Specialist | 1.00 | no | 1.0000 | ¥408,733 | - |
| `freeAdsPaper` | ¥1,500 | First-timer | 1.05 | no | 1.0500 | ¥429,170 | ¥18,937 |
| `tunerMagazine` | ¥12,000 | Tuner | 1.17 | yes | 1.0979 | ¥448,745 | ¥28,012 |
| `tradeNetwork` | ¥0 | the trade | n/a (flat `priceBand`) | no | n/a | ¥408,733 | ¥0 |
| `weekendMeet` | ¥3,000 | Shakotan | 1.17 | yes | 1.1273 | ¥460,775 | ¥49,042 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥194,668 |
| `repairYen` | ¥41,000 |
| `partsYen` | ¥32,820 |
| `listingFeesYen` | ¥1,500 |
| Sale `priceYen` | ¥400,489 |
| **Net** | **¥130,501** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥8,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥122,501** to the bank.

## Staleness: what happens if it does not sell straight away

A side branch off Nissan Silvia (S13)'s listing snapshot: the same listing, the same seeds, walked 45 days without taking anything. Nothing here touches the career the ledger above reconciles - it is a hypothetical run of the same state.

| Day | `offersSeen` at the draw | Buyer | Quality fraction | Offer |
|---|---|---|---|---|
| 14 | 0 | `first-timer` | 0.9332 | ¥400,489 |
| 15 | 1 | `kei-specialist` | 0.9061 | ¥407,337 |
| 16 | 2 | `first-timer` | 0.8600 | ¥386,622 |
| 17 | 3 | `collector` | 0.9444 | ¥424,581 |
| 18 | 4 | `first-timer` | 0.8986 | ¥403,959 |
| 21 | 5 | `tuner` | 0.9078 | ¥408,126 |
| 25 | 6 | `first-timer` | 0.8781 | ¥403,720 |
| 28 | 7 | `kei-specialist` | 0.8600 | ¥395,390 |
| 29 | 8 | `first-timer` | 0.8506 | ¥395,390 |
| 30 | 9 | `kei-specialist` | 0.8600 | ¥399,774 |
| 33 | 10 | `stancer` | 0.8768 | ¥407,595 |
| 34 | 11 | `racer` | 0.9521 | ¥431,296 |
| 36 | 12 | `collector` | 0.8507 | ¥399,774 |
| 37 | 13 | `first-timer` | 0.8790 | ¥413,103 |
| 38 | 14 | `collector` | 0.8600 | ¥404,159 |
| 40 | 15 | `tuner` | 0.8667 | ¥407,301 |
| 41 | 16 | `first-timer` | 0.8906 | ¥418,546 |
| 42 | 17 | `first-timer` | 0.8600 | ¥404,159 |
| 43 | 18 | `first-timer` | 0.8662 | ¥407,055 |
| 45 | 19 | `kei-specialist` | 0.8600 | ¥404,159 |
| 46 | 20 | `first-timer` | 0.9187 | ¥431,764 |
| 47 | 21 | `kei-specialist` | 0.8600 | ¥404,159 |
| 48 | 22 | `first-timer` | 0.8640 | ¥406,027 |
| 53 | 23 | `stancer` | 0.8600 | ¥399,774 |
| 58 | 24 | `kei-specialist` | 0.9155 | ¥402,230 |

25 offers in 45 days. First offer **¥400,489** (day 14); best offer **¥431,764** (day 46). Holding out for the best one seen is worth **¥31,275** - and costs ¥140,000 of rent over the same stretch, plus a forecourt slot that could have held another car.

**Is there ever a point in not taking the first offer?** On these numbers, no. The quality fraction decays with `offersSeen` exactly as `qualityMeanFor` says it should (`qualityFresh` 0.96 down toward `qualityFloor` 0.86), so the OFFER side of the equation only ever gets worse. What moves the price up again is a different buyer walking in, not a better offer from the same one: the spread between archetypes on this car is far wider than the whole staleness decay. Waiting is therefore a bet on WHO turns up, at a known cost of ¥3,111 a day in rent alone, and the bet does not pay.

## The whole cash ledger

Every yen that moved, in order. This is the list the reconciliation test sums.

| Day | Scope | Category | Item | Yen | Balance |
|---|---|---|---|---|---|
| - | - | - | Opening cash | - | ¥300,000 |
| 1 | car-a | Acquisition | Hammer won on lot worked-car-a-26 | -¥120,592 | ¥179,408 |
| 1 | car-a | Body-pipeline materials | Body pipeline fillAndSand on bonnet | -¥1,900 | ¥177,508 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on boot | -¥800 | ¥176,708 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on left | -¥800 | ¥175,908 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on right | -¥800 | ¥175,108 |
| 1 | car-a | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 | ¥173,908 |
| 1 | car-a | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 | ¥171,408 |
| 1 | car-a | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 | ¥170,608 |
| 1 | car-a | Repair labour charges | Bench recondition of car-worked-car-a-26-part-rims | -¥480 | ¥170,128 |
| 1 | car-a | Parts | Part ordered standard: shitbox-stock-tyres | -¥3,100 | ¥167,028 |
| 2 | car-a | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 | ¥164,028 |
| 2 | car-a | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥360 | ¥163,668 |
| 2 | car-a | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 | ¥158,498 |
| 2 | car-a | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 | ¥150,468 |
| 2 | car-a | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 | ¥146,838 |
| 2 | car-a | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 | ¥144,088 |
| 7 | car-a | Sale proceeds | Car sold: car-worked-car-a-26 | ¥194,314 | ¥338,402 |
| 7 | car-b | Acquisition | Hammer won on lot worked-car-b-9 | -¥194,668 | ¥143,734 |
| 7 | car-b | Body-pipeline materials | Body pipeline fillAndSand on bonnet | -¥1,900 | ¥141,834 |
| 7 | car-b | Body-pipeline materials | Body pipeline fillAndSand on boot | -¥1,900 | ¥139,934 |
| 7 | car-b | Body-pipeline materials | Body pipeline fillAndSand on roof | -¥1,900 | ¥138,034 |
| 7 | car-b | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 | ¥136,834 |
| 7 | car-b | Body-pipeline materials | Body pipeline prime on boot | -¥1,200 | ¥135,634 |
| 7 | car-b | Body-pipeline materials | Body pipeline fillAndSand on left | -¥1,900 | ¥133,734 |
| 7 | car-b | Body-pipeline materials | Body pipeline prime on roof | -¥1,200 | ¥132,534 |
| 7 | car-b | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 | ¥131,334 |
| 7 | shop | Rent | Weekly rent | -¥20,000 | ¥111,334 |
| 8 | car-b | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 | ¥108,834 |
| 8 | car-b | Body-pipeline materials | Body pipeline paint on boot | -¥2,500 | ¥106,334 |
| 8 | car-b | Body-pipeline materials | Body pipeline prime on left | -¥1,200 | ¥105,134 |
| 8 | car-b | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 | ¥103,234 |
| 8 | car-b | Body-pipeline materials | Body pipeline paint on roof | -¥2,500 | ¥100,734 |
| 8 | car-b | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 | ¥98,734 |
| 8 | car-b | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 | ¥97,934 |
| 8 | car-b | Body-pipeline materials | Body pipeline polish on boot | -¥800 | ¥97,134 |
| 8 | car-b | Body-pipeline materials | Body pipeline paint on left | -¥2,500 | ¥94,634 |
| 8 | car-b | Body-pipeline materials | Body pipeline prime on right | -¥1,200 | ¥93,434 |
| 8 | car-b | Body-pipeline materials | Body pipeline polish on roof | -¥800 | ¥92,634 |
| 8 | car-b | Body-pipeline materials | Body pipeline polish on chassis | -¥800 | ¥91,834 |
| 9 | car-b | Body-pipeline materials | Body pipeline polish on left | -¥800 | ¥91,034 |
| 9 | car-b | Body-pipeline materials | Body pipeline paint on right | -¥2,500 | ¥88,534 |
| 9 | car-b | Body-pipeline materials | Body pipeline polish on right | -¥800 | ¥87,734 |
| 9 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-brakeCalipersLines | -¥1,440 | ¥86,294 |
| 9 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-rims | -¥1,080 | ¥85,214 |
| 9 | car-b | Parts | Part ordered standard: stock-tyres | -¥3,500 | ¥81,714 |
| 10 | car-b | Machine-shop hire | Machine-shop hire for the day: wheels | -¥3,000 | ¥78,714 |
| 10 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-intake | -¥580 | ¥78,134 |
| 10 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-exhaust | -¥1,280 | ¥76,854 |
| 10 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-cooling | -¥900 | ¥75,954 |
| 11 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-dampers | -¥1,280 | ¥74,674 |
| 11 | car-b | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 | ¥69,674 |
| 11 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-springs | -¥580 | ¥69,094 |
| 11 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-antiRollBars | -¥380 | ¥68,714 |
| 11 | car-b | Repair labour charges | Bench recondition of car-worked-car-b-9-part-steering | -¥700 | ¥68,014 |
| 12 | car-b | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥4,160 | ¥63,854 |
| 12 | car-b | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥840 | ¥63,014 |
| 12 | car-b | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 | ¥59,314 |
| 12 | car-b | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 | ¥55,614 |
| 12 | car-b | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 | ¥47,314 |
| 12 | car-b | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 | ¥41,914 |
| 13 | car-b | Listing fee | Listing fee (freeAdsPaper) | -¥1,500 | ¥40,414 |
| 14 | car-b | Sale proceeds | Car sold: car-worked-car-b-9 | ¥400,489 | ¥440,903 |

## Reconciliation

| Check | Yen |
|---|---|
| Opening cash | ¥300,000 |
| Sum of every ledger line above | ¥140,903 |
| **Closing cash, from the sim** | **¥440,903** |
| Difference | ¥0 |

The same total, decomposed the other way:

| Component | Yen |
|---|---|
| Suzuki Wagon R (CT21S) net (car ledger) | ¥41,402 |
| Nissan Silvia (S13) net (car ledger) | ¥130,501 |
| Rent | -¥20,000 |
| Machine-shop hire (running cost, not on any car ledger) | -¥11,000 |
| **Change in cash** | **¥140,903** |

Both identities are asserted to the yen, with no tolerance, in `packages/sim/tests/workedExample.test.ts`. The harness additionally refuses to continue if any single scripted step moves cash it cannot name, so an incomplete ledger fails loudly rather than balancing by accident.
