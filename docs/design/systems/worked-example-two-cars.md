# Two cars, end to end, generated from the shipped sim

This document is **generated**, not written: every number in it comes from executing the shipped resolvers in `packages/sim`, once, on a fixed seed. Nothing here is a hand-recomputed formula. Regenerate it with:

```
WORKED_EXAMPLE_WRITE=1 pnpm test packages/sim/tests/workedExample.test.ts
```

(PowerShell: `$env:WORKED_EXAMPLE_WRITE=1; pnpm test packages/sim/tests/workedExample.test.ts`.)

## Plain language, first

The shop opens with ¥300,000. It buys a rough 1993 Suzuki Wagon R (CT21S) for ¥112,379, spends ¥35,370 putting it right and dressing it up, and sells it on day 5 for ¥207,966. It then buys a tidy 1990 Nissan Silvia (S13) for ¥264,115, spends ¥44,910 on it, and sells that on day 9 for ¥470,469. Rent takes ¥20,000 over the same 9 days regardless of what the shop does. The till finishes at ¥501,661: **¥201,661 made in 9 days**, out of two cars and no other income at all.

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
| Paid (auction reserve) | ¥112,379 | ¥264,115 |
| Desk buyout would have been | ¥187,298 | ¥440,191 |
| Rung 1 - as bought | ¥187,298 | ¥441,718 |
| Rung 2 - repaired | ¥202,198 | ¥464,815 |
| Rung 3 - modified | ¥208,776 | ¥507,136 |
| Repair charges (`repairYen`) | ¥5,460 | ¥10,080 |
| Parts (`partsYen`) | ¥24,910 | ¥28,330 |
| Listing fees (`listingFeesYen`) | ¥0 | ¥1,500 |
| Sold for | ¥207,966 | ¥470,469 |
| **Net (ledger)** | **¥65,217** | **¥166,444** |
| Labour spent (energy points) | 114 | 169 |
| Days owned | 4 | 4 |

**Fixed overheads, held out of both margins.** Rent is a function of bays owned, not of any one car: ¥20,000 a week at 1 service, 3 parking and 2 forecourt bays, charged on `calendar.rentDayOfWeek`. Over this run it took ¥20,000. That is what the week costs whatever the shop does with it, and it is never subtracted from a car's margin above.

## Car A: Suzuki Wagon R (CT21S)

**Tier** entry - **culture** Kei - **1993, 23,588 km** - lot `worked-car-a-26`, generated at seed `26`.

**Why this car.** The cheapest thing a day-one shop can reach, and bought rough: entry tier, Kei culture, ¥230,000 of book value. Its tier expects only `worn`, its `beyondDiscount` is 0.4 and its `aftermarketReturn` is 0.3 - so it is the car the economy pays you to fix and charges you to modify.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥187,298 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥112,379 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥187,298 |
| Attendance fee (local-yard) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥112,379** |

The realised price of a live-room win lands **somewhere between ¥112,379 and ¥187,298**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥74,919 more.

It arrived carrying somebody else's parts: `camsTiming` Raiden Sport Cams (sport, poor), `antiRollBars` Kumo Sport Sway Bars (sport, poor), `steering` Kitsune Sport Rack (sport, poor). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 2 | Repair labour charges | Bench recondition: rims to worn | -¥480 |
| day 2 | Repair labour charges | Bench recondition: intake to worn | -¥250 |
| day 2 | Repair labour charges | Bench recondition: exhaust to worn | -¥560 |
| day 2 | Repair labour charges | Bench recondition: driveline to worn | -¥420 |
| day 2 | Repair labour charges | Bench recondition: dampers to worn | -¥560 |
| day 2 | Repair labour charges | Bench recondition: antiRollBars to worn | -¥340 |
| day 3 | Repair labour charges | Bench recondition: steering to worn | -¥620 |
| day 3 | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥360 |
| day 1 | Body-pipeline materials | Body pipeline fillAndSand on chassis | -¥1,900 |
| day 1 | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 |
| day 1 | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 |
| day 1 | Parts | Part ordered standard: shitbox-stock-brake-pads-discs | -¥2,100 |
| day 3 | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 |
| day 3 | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 |
| day 3 | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 |
| day 3 | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 |
| day 2 | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 |

Work spend, all categories: **¥35,370**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **114 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 2 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |

A machine-shop hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from: hiring the engine crane for a day can pull four engines, so it belongs to no single one of them.

### 3. The value ladder

#### Rung 1: As bought (day 1, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥30,498 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥22,176 |
| Stage C coherence discount | `coherence` | -¥5,557 |
| Stage D aftermarket premium | `aftermarket` | ¥4,029 |
| **Total (`marketValueYen`)** |  | **¥187,298** |

Restoration bill still owed to the `worn` band the tier expects: ¥23,460.

#### Rung 2: Repaired (day 3, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥18,941 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥23,456 |
| Stage C coherence discount | `coherence` | -¥5,859 |
| Stage D aftermarket premium | `aftermarket` | ¥8,954 |
| **Total (`marketValueYen`)** |  | **¥202,198** |

Restoration bill still owed to the `worn` band the tier expects: ¥14,570.

#### Rung 3: Modified (day 3, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥230,000 |
| Mileage curve | `mileage` | ¥11,500 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥18,941 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥22,360 |
| Stage C coherence discount | `coherence` | -¥5,892 |
| Stage D aftermarket premium | `aftermarket` | ¥14,469 |
| **Total (`marketValueYen`)** |  | **¥208,776** |

Restoration bill still owed to the `worn` band the tier expects: ¥14,570.

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
| `camsTiming` | poor | assembly-gated (engineAssembly): worked only through the engine line |
| `gearbox` | poor | assembly-gated (gearboxAssembly): worked only through the drivetrain line |
| `clutch` | poor | replace-only consumable |
| `differential` | poor | not reached by this run |
| `seats` | poor | signature slot: needs the interior line hired |

Remaining bill to the expected band: **¥14,570**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `shopFront` |
| Listing fee | ¥0 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 2 days |
| Buyer archetype | `first-timer` |
| Buyer taste (through the channel ceiling) | 1.0000 |
| Offer quality fraction drawn | 0.9961 |
| **Final `priceYen`** | **¥207,966** |

#### The same car, the same buyer, every channel

| Channel | Fee | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | 1.00 | no | 1.0000 | ¥208,776 | - |
| `freeAdsPaper` | ¥1,500 | 1.05 | no | 1.0500 | ¥219,215 | ¥8,939 |
| `tunerMagazine` | ¥12,000 | 1.17 | yes | 1.1019 | ¥230,053 | ¥9,277 |
| `tradeNetwork` | ¥0 | n/a (flat `priceBand`) | no | n/a | ¥208,776 | ¥0 |
| `weekendMeet` | ¥3,000 | 1.17 | yes | 1.1019 | ¥230,053 | ¥18,277 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥112,379 |
| `repairYen` | ¥5,460 |
| `partsYen` | ¥24,910 |
| `listingFeesYen` | ¥0 |
| Sale `priceYen` | ¥207,966 |
| **Net** | **¥65,217** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥5,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥60,217** to the bank.

## Car B: Nissan Silvia (S13)

**Tier** everyday - **culture** Drift - **1990, 60,098 km** - lot `worked-car-b-9`, generated at seed `9`.

**Why this car.** Everything the Wagon R is not, and bought tidy rather than rough: everyday tier, Drift culture, ¥500,000 of book value. Its tier expects `fine`, its `beyondDiscount` is 0.8 and its `aftermarketReturn` is 0.6, so a coherent build gets twice the credit it would on the kei, and the tuner/racer/stancer crowd it draws will pay for it.

### 1. Acquisition

| Figure | Function | Yen |
|---|---|---|
| Guide value (the anchor) | `anchorValueYen` | ¥440,191 |
| Auction reserve | `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION` (0.6) | ¥264,115 |
| Desk buyout | `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM` (1.0) | ¥440,191 |
| Attendance fee (regional) | `auctionRoom.attendanceFeeYenByTier` - live mechanism, currently zero for every tier | ¥0 |
| Inspection / travel fee | `diagnosis.travelFeeYenByTier` - a live mechanism (`beginInspectionVisit`), not used by this run | not paid |
| **Paid (this run)** | `settleAuctionHammer` at the reserve | **¥264,115** |

The realised price of a live-room win lands **somewhere between ¥264,115 and ¥440,191**, and the room decides where: its clearing draw is a fraction of this same anchor, floored at that same `AUCTION_RESERVE_PRICE_FRACTION`, which is the one seller floor the whole game prices against. This run settles the hammer at the reserve, which is the optimistic end of that band; every net figure below therefore also assumes the desk buyout would have cost ¥176,076 more.

It arrived carrying somebody else's part: `brakePadsDiscs` Shuriken Sport Pads & Discs (sport, fine). Generation fits up to `partsGeneration.maxAftermarketSlots` aftermarket slots per car, so a bought car can turn up with a half-finished build the market is already discounting.

### 2. The work

| Day | Category | Item | Yen |
|---|---|---|---|
| day 5 | Repair labour charges | Bench recondition: brakeCalipersLines to fine | -¥720 |
| day 6 | Repair labour charges | Bench recondition: rims to fine | -¥540 |
| day 6 | Repair labour charges | Bench recondition: intake to fine | -¥290 |
| day 6 | Repair labour charges | Bench recondition: exhaust to fine | -¥1,280 |
| day 6 | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥450 |
| day 6 | Repair labour charges | Bench recondition: cooling to fine | -¥220 |
| day 6 | Repair labour charges | Bench recondition: springs to fine | -¥290 |
| day 7 | Repair labour charges | Bench recondition: antiRollBars to fine | -¥190 |
| day 7 | Repair labour charges | Bench recondition: steering to fine | -¥350 |
| day 7 | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥2,080 |
| day 5 | Body-pipeline materials | Body pipeline polish on right | -¥800 |
| day 5 | Body-pipeline materials | Body pipeline polish on chassis | -¥800 |
| day 5 | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 |
| day 5 | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 |
| day 5 | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 |
| day 5 | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 |
| day 7 | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 |
| day 7 | Parts | Part ordered standard: suiko-street-radiator | -¥2,900 |
| day 7 | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 |
| day 7 | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 |
| day 7 | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 |
| day 7 | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 |

Work spend, all categories: **¥43,410**.

Labour is slots, not yen, and is never charged to the bank: this car consumed **169 energy points** out of a solo shop's `economy.energy.basePoolPoints` of 60 per day.

| Day | Line hired | Fee | What it unlocked |
|---|---|---|---|
| day 7 | `suspension` | ¥5,000 | fitting that group's signature slots (`machineShopAssist.signatureSlotsByGroup`) |

A machine-shop hire is a **daily** unlock and is charged to the day, never to the car (`resolveHireMachineLine`), so it never appears in the car ledger the net figure below is read from: hiring the engine crane for a day can pull four engines, so it belongs to no single one of them.

### 3. The value ladder

#### Rung 1: As bought (day 5, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥122 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥39,208 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥22,120 |
| Stage D aftermarket premium | `aftermarket` | ¥3,168 |
| **Total (`marketValueYen`)** |  | **¥441,718** |

Restoration bill still owed to the `fine` band the tier expects: ¥30,160.

#### Rung 2: Repaired (day 7, market heat 100%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥122 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥7,631 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥30,600 |
| Stage D aftermarket premium | `aftermarket` | ¥3,168 |
| **Total (`marketValueYen`)** |  | **¥464,815** |

Restoration bill still owed to the `fine` band the tier expects: ¥5,870.

#### Rung 3: Modified (day 8, market heat 105%)

| Line | id | Yen |
|---|---|---|
| Book value | `book` | ¥500,000 |
| Mileage curve | `mileage` | -¥122 |
| Market heat | `heat` | ¥24,993 |
| Restoration bill below the expected band (x marketRepairDiscount 1.3) | `wear` | -¥7,631 |
| Restoration bill above the expected band (x the tier beyondDiscount) | `polish` | -¥29,112 |
| Stage D aftermarket premium | `aftermarket` | ¥19,008 |
| **Total (`marketValueYen`)** |  | **¥507,136** |

Restoration bill still owed to the `fine` band the tier expects: ¥5,870.

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
| `seats` | worn | signature slot: needs the interior line hired |
| `dashGauges` | worn | signature slot: needs the interior line hired |

Remaining bill to the expected band: **¥5,870**. This is real, and the market is discounting it in every rung above.

### 4. The sale

| Figure | Value |
|---|---|
| Channel | `freeAdsPaper` |
| Listing fee | ¥1,500 |
| Forecourt slot | 1 of 2 taken while listed |
| Days listed before it sold | 1 day |
| Buyer archetype | `tuner` |
| Buyer taste (through the channel ceiling) | 1.0500 |
| Offer quality fraction drawn | 0.8835 |
| **Final `priceYen`** | **¥470,469** |

#### The same car, the same buyer, every channel

| Channel | Fee | tasteCeiling | Matched only | Buyer taste | Channel price | Price less fee vs shop front |
|---|---|---|---|---|---|---|
| `shopFront` | ¥0 | 1.00 | no | 1.0000 | ¥507,136 | - |
| `freeAdsPaper` | ¥1,500 | 1.05 | no | 1.0500 | ¥532,493 | ¥23,857 |
| `tunerMagazine` | ¥12,000 | 1.17 | yes | 1.1238 | ¥569,900 | ¥50,764 |
| `tradeNetwork` | ¥0 | n/a (flat `priceBand`) | no | n/a | ¥507,136 | ¥0 |
| `weekendMeet` | ¥3,000 | 1.17 | yes | 1.1238 | ¥569,900 | ¥59,764 |

### 5. Net, from the sim's own car ledger

| `CarLedger` field | Yen |
|---|---|
| `purchaseYen` | ¥264,115 |
| `repairYen` | ¥10,080 |
| `partsYen` | ¥28,330 |
| `listingFeesYen` | ¥1,500 |
| Sale `priceYen` | ¥470,469 |
| **Net** | **¥166,444** |

The car ledger carries the listing fee, because that fee was paid to advertise this car and nothing else. It does not carry the machine-shop hires (¥5,000): those are running costs, and a day's crane hire can pull four engines. Counting them anyway, this car returned **¥161,444** to the bank.

## Staleness: what happens if it does not sell straight away

A side branch off Nissan Silvia (S13)'s listing snapshot: the same listing, the same seeds, walked 45 days without taking anything. Nothing here touches the career the ledger above reconciles - it is a hypothetical run of the same state.

| Day | `offersSeen` at the draw | Buyer | Quality fraction | Offer |
|---|---|---|---|---|
| 9 | 0 | `tuner` | 0.8835 | ¥470,469 |
| 10 | 1 | `stancer` | 0.9057 | ¥482,280 |
| 13 | 2 | `racer` | 0.9231 | ¥490,615 |
| 14 | 3 | `kei-specialist` | 0.8680 | ¥462,215 |
| 15 | 4 | `first-timer` | 0.8485 | ¥469,627 |
| 20 | 5 | `tuner` | 0.9307 | ¥515,143 |
| 21 | 6 | `stancer` | 0.9155 | ¥506,727 |
| 22 | 7 | `stancer` | 0.8480 | ¥478,252 |
| 23 | 8 | `tuner` | 0.8600 | ¥485,027 |
| 24 | 9 | `first-timer` | 0.8696 | ¥490,433 |
| 26 | 10 | `kei-specialist` | 0.8600 | ¥485,027 |
| 28 | 11 | `stancer` | 0.8600 | ¥485,027 |
| 30 | 12 | `tuner` | 0.8783 | ¥499,967 |
| 31 | 13 | `first-timer` | 0.8600 | ¥489,541 |
| 33 | 14 | `kei-specialist` | 0.8600 | ¥489,541 |
| 34 | 15 | `stancer` | 0.8600 | ¥489,541 |
| 37 | 16 | `racer` | 0.8600 | ¥493,100 |
| 41 | 17 | `racer` | 0.8905 | ¥510,575 |
| 44 | 18 | `stancer` | 0.8713 | ¥500,562 |
| 48 | 19 | `racer` | 0.8600 | ¥493,100 |
| 52 | 20 | `tuner` | 0.9215 | ¥510,065 |

21 offers in 45 days. First offer **¥470,469** (day 9); best offer **¥515,143** (day 20). Holding out for the best one seen is worth **¥44,674** - and costs ¥120,000 of rent over the same stretch, plus a forecourt slot that could have held another car.

**Is there ever a point in not taking the first offer?** On these numbers, no. The quality fraction decays with `offersSeen` exactly as `qualityMeanFor` says it should (`qualityFresh` 0.96 down toward `qualityFloor` 0.86), so the OFFER side of the equation only ever gets worse. What moves the price up again is a different buyer walking in, not a better offer from the same one: the spread between archetypes on this car is far wider than the whole staleness decay. Waiting is therefore a bet on WHO turns up, at a known cost of ¥2,667 a day in rent alone, and the bet does not pay.

## The whole cash ledger

Every yen that moved, in order. This is the list the reconciliation test sums.

| Day | Scope | Category | Item | Yen | Balance |
|---|---|---|---|---|---|
| - | - | - | Opening cash | - | ¥300,000 |
| 1 | car-a | Acquisition | Hammer won on lot worked-car-a-26 | -¥112,379 | ¥187,621 |
| 1 | car-a | Body-pipeline materials | Body pipeline fillAndSand on chassis | -¥1,900 | ¥185,721 |
| 1 | car-a | Body-pipeline materials | Body pipeline prime on chassis | -¥1,200 | ¥184,521 |
| 1 | car-a | Body-pipeline materials | Body pipeline paint on chassis | -¥2,000 | ¥182,521 |
| 1 | car-a | Parts | Part ordered standard: shitbox-stock-brake-pads-discs | -¥2,100 | ¥180,421 |
| 2 | car-a | Repair labour charges | Bench recondition: rims to worn | -¥480 | ¥179,941 |
| 2 | car-a | Repair labour charges | Bench recondition: intake to worn | -¥250 | ¥179,691 |
| 2 | car-a | Repair labour charges | Bench recondition: exhaust to worn | -¥560 | ¥179,131 |
| 2 | car-a | Repair labour charges | Bench recondition: driveline to worn | -¥420 | ¥178,711 |
| 2 | car-a | Repair labour charges | Bench recondition: dampers to worn | -¥560 | ¥178,151 |
| 2 | car-a | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 | ¥173,151 |
| 2 | car-a | Repair labour charges | Bench recondition: antiRollBars to worn | -¥340 | ¥172,811 |
| 3 | car-a | Repair labour charges | Bench recondition: steering to worn | -¥620 | ¥172,191 |
| 3 | car-a | Repair labour charges | Repair charge on car-worked-car-a-26 | -¥360 | ¥171,831 |
| 3 | car-a | Parts | Part bought express: shitbox-mikoshi-lip-kit | -¥5,170 | ¥166,661 |
| 3 | car-a | Parts | Part bought express: shitbox-suzaku-street-catback | -¥8,030 | ¥158,631 |
| 3 | car-a | Parts | Part bought express: shitbox-fubuki-cold-air-kit | -¥3,630 | ¥155,001 |
| 3 | car-a | Parts | Part bought express: shitbox-suiko-street-radiator | -¥2,750 | ¥152,251 |
| 5 | car-a | Sale proceeds | Car sold: car-worked-car-a-26 | ¥207,966 | ¥360,217 |
| 5 | car-b | Acquisition | Hammer won on lot worked-car-b-9 | -¥264,115 | ¥96,102 |
| 5 | car-b | Body-pipeline materials | Body pipeline polish on right | -¥800 | ¥95,302 |
| 5 | car-b | Body-pipeline materials | Body pipeline polish on chassis | -¥800 | ¥94,502 |
| 5 | car-b | Body-pipeline materials | Body pipeline prime on bonnet | -¥1,200 | ¥93,302 |
| 5 | car-b | Body-pipeline materials | Body pipeline paint on bonnet | -¥2,500 | ¥90,802 |
| 5 | car-b | Body-pipeline materials | Body pipeline polish on bonnet | -¥800 | ¥90,002 |
| 5 | car-b | Body-pipeline materials | Body pipeline fillAndSand on right | -¥1,900 | ¥88,102 |
| 5 | car-b | Repair labour charges | Bench recondition: brakeCalipersLines to fine | -¥720 | ¥87,382 |
| 6 | car-b | Repair labour charges | Bench recondition: rims to fine | -¥540 | ¥86,842 |
| 6 | car-b | Repair labour charges | Bench recondition: intake to fine | -¥290 | ¥86,552 |
| 6 | car-b | Repair labour charges | Bench recondition: exhaust to fine | -¥1,280 | ¥85,272 |
| 6 | car-b | Repair labour charges | Bench recondition: ignitionEcu to fine | -¥450 | ¥84,822 |
| 6 | car-b | Repair labour charges | Bench recondition: cooling to fine | -¥220 | ¥84,602 |
| 6 | car-b | Repair labour charges | Bench recondition: springs to fine | -¥290 | ¥84,312 |
| 7 | car-b | Machine-shop hire | Machine-shop hire for the day: suspension | -¥5,000 | ¥79,312 |
| 7 | car-b | Repair labour charges | Bench recondition: antiRollBars to fine | -¥190 | ¥79,122 |
| 7 | car-b | Repair labour charges | Bench recondition: steering to fine | -¥350 | ¥78,772 |
| 7 | car-b | Repair labour charges | Repair charge on car-worked-car-b-9 | -¥2,080 | ¥76,692 |
| 7 | car-b | Parts | Part ordered standard: koi-street-injector-kit | -¥3,700 | ¥72,992 |
| 7 | car-b | Parts | Part ordered standard: suiko-street-radiator | -¥2,900 | ¥70,092 |
| 7 | car-b | Parts | Part ordered standard: fubuki-cold-air-kit | -¥3,700 | ¥66,392 |
| 7 | car-b | Parts | Part ordered standard: suzaku-street-catback | -¥8,300 | ¥58,092 |
| 7 | car-b | Parts | Part ordered standard: mikoshi-lip-kit | -¥5,400 | ¥52,692 |
| 7 | shop | Rent | Weekly rent | -¥20,000 | ¥32,692 |
| 8 | car-b | Listing fee | Listing fee (freeAdsPaper) | -¥1,500 | ¥31,192 |
| 9 | car-b | Sale proceeds | Car sold: car-worked-car-b-9 | ¥470,469 | ¥501,661 |

## Reconciliation

| Check | Yen |
|---|---|
| Opening cash | ¥300,000 |
| Sum of every ledger line above | ¥201,661 |
| **Closing cash, from the sim** | **¥501,661** |
| Difference | ¥0 |

The same total, decomposed the other way:

| Component | Yen |
|---|---|
| Suzuki Wagon R (CT21S) net (car ledger) | ¥65,217 |
| Nissan Silvia (S13) net (car ledger) | ¥166,444 |
| Rent | -¥20,000 |
| Machine-shop hire (running cost, not on any car ledger) | -¥10,000 |
| **Change in cash** | **¥201,661** |

Both identities are asserted to the yen, with no tolerance, in `packages/sim/tests/workedExample.test.ts`. The harness additionally refuses to continue if any single scripted step moves cash it cannot name, so an incomplete ledger fails loudly rather than balancing by accident.
