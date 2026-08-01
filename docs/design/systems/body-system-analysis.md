# Body system analysis: swap versus repair, the cost of the collapse, and where bodykits go

Status: MEASUREMENT AND ANALYSIS. Nothing here is built. No shipped code, content or lever was
changed to produce it.

## Method

Every number in Parts 1 and 2 came from a throwaway Vitest probe that DROVE the shipped functions
rather than re-deriving their arithmetic: `planPipelineStage`, `planPaintStage`, `planSwapPanel`,
`zonePanelPart`, `bodyPartRepairBillYen`, `deriveBodyBands`, `usedPartSaleValueYen`,
`generateAuctionCarInstance`, and the real `ECONOMY`/`PARTS`/`CARS` content. The probe has been
deleted; it produced no artefacts in the repo. Parts 3 and 4 are code reads, cited by file and line.

Sample for Part 2: 2,600 cars, all 26 shipped models x 100 seeds, `generateAuctionCarInstance` at
game year 1995 with symptoms and missing slots enabled.

Two conventions used throughout:

- **Labour unit** = one `laborUnits` from a stage plan. Energy spent = `laborUnits x
  energyPerBandStepByToolTier[tier]`, so 5 / 4 / 3 points per unit at tool tier 1 / 2 / 3. A panel
  swap is not a band step: it costs `energyByClass['bolt-on']` = 3 points flat at every tier.
- A solo shop's day is `basePoolPoints` = **60 energy points** (`laborSlots.ts`).

## Reference numbers (shipped content, unchanged)

| Item | Value | Source |
|---|---|---|
| Filler tin + sanding paper (`fillAndSand`) | ¥1,900 | `materials.json` |
| Primer tin (`prime`) | ¥1,200 | `materials.json` |
| Paint tin (`paint`) | ¥2,500 | `materials.json` |
| Underseal tin (chassis `paint`) | ¥2,000 | `materials.json` |
| Polish tin (`polish`) | ¥800 | `materials.json` |
| Zone panel, entry / everyday / enthusiast / flagship | ¥800 / ¥1,000 / ¥2,400 / ¥5,400 | `partPricing.json` `zonePanel` 6,000 x classFactor |
| Whole-body materials maximum, every class | **¥31,200** | 5 zones x (1,900 + 1,200 + 2,500) + chassis (1,200 + 2,000) |
| Book value range of the shipped roster | ¥130,000 to ¥3,500,000 | `cars.json` |

The last two rows are the flat-materials defect stated as one number: the maximum body bill on a
¥130,000 Honda City and on a ¥3,500,000 BNR32 is the same ¥31,200.

Salvage on the old panel, `usedPartSaleValueYen(price, bandForSeverity(old metal))` at
`resaleBandFactors x usedPartSaleFraction` (0.3):

| Class | old metal 0 (mint) | 1 (fine) | 2 (worn) | 3 (poor) |
|---|---|---|---|---|
| entry | ¥240 | ¥180 | ¥132 | ¥24 |
| everyday | ¥300 | ¥225 | ¥165 | ¥30 |
| enthusiast | ¥720 | ¥540 | ¥396 | ¥72 |
| flagship | ¥1,620 | ¥1,215 | ¥891 | ¥162 |

---

# Part 1: swap versus repair

## 1.1 The pipeline is strictly sequential, and that decides most of the answer

Driving the real stage planners exposes a prerequisite chain that is not obvious from the stage list:

| Stage | Refuses unless | Consequence |
|---|---|---|
| `beat` | `1 <= metal <= 2` | **metal 3 cannot be beaten at all.** Only `weld` clears it. |
| `weld` | `metal >= 1` AND body line unlocked (tier 2 owned, or hired today) | metal 3 at tool tier 1 with no hire is **unfixable** |
| `fillAndSand` | `metal === 0` AND `surface > 0` | any fill forces the metal ALL the way down, whatever the target band tolerates |
| `prime` | `surface === 0` AND not already primed | any repaint forces a full fill, whatever the target band tolerates |
| `paint` | primed | achieves finish 1 (tier 2+) or finish 2 (tier 1) |
| `polish` | `finish < 3` and above the tier floor | floor is **1** unless `fullCapability` (tier 3 owned, or hired) |

Two structural results fall straight out:

1. **Finish 0 requires tool tier 3.** `paint` lands at 1 at best and `polish`'s floor is 1 below
   `fullCapability`. So a `mint` body is unreachable at tool tier 1 AND tool tier 2.
   `expectationByTier.flagship.band` is `mint`. **100% of flagship cars cannot have their body
   brought to their own tier's expectation at tool tier 1 or 2** (measured, Part 2 section 2.5).
2. **Touching paint forces the whole chain.** A zone at (metal 1, surface 1, finish 3) targeting
   `fine` does not need its metal or surface moved to satisfy the band, but it cannot be primed
   until surface is 0, and cannot be filled until metal is 0. So the "cheap repaint" costs a full
   strip-down every time.

## 1.2 The crossover is one comparison

When a repaint is due, both routes pay prime + paint (¥3,700) identically. Everything else cancels.
What is left is:

```
repair route yen  =  1,900 if surface > 0, else 0
swap route yen    =  panel price  -  salvage on the old panel
```

Panel beating is therefore the cheaper route **if and only if** `panel - salvage > ¥1,900`:

| Class | Panel | Salvage (poor..fine) | Net panel cost | vs ¥1,900 filler | Money verdict when a fill is due |
|---|---|---|---|---|---|
| entry | ¥800 | ¥24 to ¥180 | ¥620 to ¥776 | **cheaper** | SWAP |
| everyday | ¥1,000 | ¥30 to ¥225 | ¥775 to ¥970 | **cheaper** | SWAP |
| enthusiast | ¥2,400 | ¥72 to ¥540 | ¥1,860 to ¥2,328 | dearer by ¥104 to ¥428 | repair, barely |
| flagship | ¥5,400 | ¥162 to ¥1,215 | ¥4,185 to ¥5,238 | dearer by ¥2,285 to ¥3,338 | repair |

**On entry and everyday cars a brand-new replacement panel is cheaper than the tin of filler used to
repair the old one.**

## 1.3 Measured routes, target = fine (the expectation band for entry, everyday and enthusiast)

Zone written `metal|surface|finish`. "E" is energy points. Swap yen is net of salvage.

### entry (panel ¥800)

| Zone | Tier | Repair ¥ | Repair units | Repair E | Swap ¥ | Swap units | Swap E | Verdict |
|---|---|---|---|---|---|---|---|---|
| 2\|1\|0 | 1 | 0 | 1 | 5 | 5,168 | 3 | 18 | REPAIR (free) |
| 2\|1\|0 | 3 | 0 | 1 | 3 | 4,368 | 2 | 9 | REPAIR (free) |
| 0\|0\|3 | 1 | 4,500 | 3 | 15 | 5,060 | 3 | 18 | REPAIR by ¥560 |
| 0\|0\|3 | 3 | 3,700 | 2 | 6 | 4,260 | 2 | 9 | REPAIR by ¥560 |
| 0\|1\|3 | 1 | 6,400 | 4 | 20 | 5,060 | 3 | 18 | **SWAP dominates** (-¥1,340, -2 E) |
| 1\|1\|3 | 1 | 6,400 | 5 | 25 | 5,120 | 3 | 18 | **SWAP dominates** (-¥1,280, -7 E) |
| 2\|2\|3 | 1 | 6,400 | 6 | 30 | 5,168 | 3 | 18 | **SWAP dominates** (-¥1,232, -12 E) |
| 3\|2\|3 | 1 | IMPOSSIBLE | | | 5,276 | 3 | 18 | **SWAP ONLY** |
| 3\|2\|3 | 2 | 5,600 | 5 | 20 | 4,476 | 2 | 11 | **SWAP dominates** (-¥1,124, -9 E) |

### everyday (panel ¥1,000)

| Zone | Tier | Repair ¥ | Repair units | Repair E | Swap ¥ | Swap units | Swap E | Verdict |
|---|---|---|---|---|---|---|---|---|
| 2\|1\|0 | 1 | 0 | 1 | 5 | 5,335 | 3 | 18 | REPAIR (free) |
| 0\|0\|3 | 2 | 3,700 | 2 | 8 | 4,400 | 2 | 11 | REPAIR by ¥700 |
| 0\|1\|3 | 2 | 5,600 | 3 | 12 | 4,400 | 2 | 11 | **SWAP dominates** (-¥1,200, -1 E) |
| 1\|1\|3 | 2 | 5,600 | 4 | 16 | 4,475 | 2 | 11 | **SWAP dominates** (-¥1,125, -5 E) |
| 2\|2\|3 | 1 | 6,400 | 6 | 30 | 5,335 | 3 | 18 | **SWAP dominates** (-¥1,065, -12 E) |
| 3\|2\|3 | 1 | IMPOSSIBLE | | | 5,470 | 3 | 18 | **SWAP ONLY** |
| 3\|2\|3 | 3 | 5,600 | 5 | 15 | 4,670 | 2 | 9 | **SWAP dominates** (-¥930, -6 E) |

### enthusiast (panel ¥2,400)

| Zone | Tier | Repair ¥ | Repair units | Repair E | Swap ¥ | Swap units | Swap E | Verdict |
|---|---|---|---|---|---|---|---|---|
| 2\|1\|0 | 2 | 0 | 1 | 4 | 5,704 | 2 | 11 | REPAIR (free) |
| 0\|0\|3 | 2 | 3,700 | 2 | 8 | 5,380 | 2 | 11 | REPAIR by ¥1,680 |
| 0\|1\|3 | 2 | 5,600 | 3 | 12 | 5,380 | 2 | 11 | **SWAP dominates** (-¥220, -1 E) |
| 1\|1\|3 | 2 | 5,600 | 4 | 16 | 5,560 | 2 | 11 | **SWAP dominates** (-¥40, -5 E) |
| 2\|2\|3 | 2 | 5,600 | 5 | 20 | 5,704 | 2 | 11 | repair saves ¥104, costs 9 E |
| 3\|2\|3 | 1 | IMPOSSIBLE | | | 6,828 | 3 | 18 | **SWAP ONLY** |
| 3\|2\|3 | 2 | 5,600 | 5 | 20 | 6,028 | 2 | 11 | repair saves ¥428, costs 9 E |

### flagship (panel ¥5,400)

| Zone | Tier | Repair ¥ | Repair units | Repair E | Swap ¥ | Swap units | Swap E | Verdict |
|---|---|---|---|---|---|---|---|---|
| 0\|0\|3 | 2 | 3,700 | 2 | 8 | 7,480 | 2 | 11 | REPAIR by ¥3,780 |
| 0\|1\|3 | 2 | 5,600 | 3 | 12 | 7,480 | 2 | 11 | repair saves ¥1,880, costs 1 E |
| 1\|1\|3 | 2 | 5,600 | 4 | 16 | 7,885 | 2 | 11 | repair saves ¥2,285, costs 5 E |
| 2\|2\|3 | 2 | 5,600 | 5 | 20 | 8,209 | 2 | 11 | repair saves ¥2,609, costs 9 E |
| 3\|2\|3 | 1 | IMPOSSIBLE | | | 9,738 | 3 | 18 | **SWAP ONLY** |
| 3\|2\|3 | 2 | 5,600 | 5 | 20 | 8,938 | 2 | 11 | repair saves ¥3,338, costs 9 E |

## 1.4 Target = mint

Target `mint` on a zone requires all three axes at severity 0, so `polish` must reach floor 0, which
needs `fullCapability`.

| Tier | Reachable states (of 28 generation-reachable zone states) |
|---|---|
| 1 | 6 of 28. 22 of 28 are IMPOSSIBLE by BOTH routes. |
| 2 | 7 of 28. 21 of 28 are IMPOSSIBLE by BOTH routes. |
| 3 | 28 of 28. |

At tier 3, the same crossover applies: swap dominates 15 of 27 non-trivial states for entry and
everyday, 6 of 27 for enthusiast, and 0 for flagship.

## 1.5 The plain answer

**Panel beating is the better play in exactly three situations.**

1. **When the target band tolerates the leftover surface and finish.** Beat is ¥0 and 1 labour unit,
   so a metal-only defect (e.g. `2|1|0` targeting fine) is free work no swap can beat. This is the
   only case where repair wins outright, and it wins by ¥4,368 to ¥9,009 depending on class.
2. **When there is nothing to fill** (surface already 0 and only the finish is bad). Repair pays
   ¥3,700; swap pays ¥3,700 plus the panel. Repair wins by ¥560 / ¥700 / ¥1,680 / ¥3,780.
3. **On enthusiast and flagship cars once a fill IS due**, on the money axis only. On enthusiast the
   margin is ¥104 to ¥428, which is inside the noise of a single day's decision; on flagship it is
   ¥1,880 to ¥3,338, which is real.

**For entry and everyday cars there is no state at all in which beating a panel that needs filling
is the better play.** Swapping is cheaper in yen AND cheaper in energy, at every tool tier, on every
one of those states. Given that entry and everyday are 15 of the 26 shipped models and the whole of
the early game, the honest summary is: **for the cars a new player owns, the "beat it out" fantasy
the pipeline was built for is dominated by "bolt a new one on", and the game never tells them.**

Energy makes it worse, not better. Even where repair wins on money, it loses on energy in every case
where metal must move: the swap is a flat 3 points and beat/weld are 5 points per unit at tier 1. On
a flagship `3|2|3` at tier 2 the player pays 9 extra energy points (15% of a solo day) to save ¥3,338,
an implied ¥371 per energy point; on an enthusiast `2|2|3` at tier 1 they pay 12 extra points (20% of
a day) to save ¥104, an implied ¥9 per point. The game currently offers no way to see either number.

---

# Part 2: what the collapse actually costs

## 2.1 What "identical downstream" means, precisely

The derived triple `(panels, paint, underbody)` is what the following read, and it is ALL they read:

| Consumer | File | Reads |
|---|---|---|
| `costWeightedBandFactor` | `bands.ts:275` | `installed.band` only |
| `stocknessOf` / `authenticityPercentOf` | `derivedStats.ts:116,178` | `installed.band`, `part.grade` |
| `stylePercentOf` | `derivedStats.ts:220` | `installed.band` |
| `physicalConditionFactors` (aero) | `derivedStats.ts:262` | `installed.band` |
| `foundationFactor` | `marketValue.ts:255` | `underbody` band |
| auction grade, band chips, buyer expectation | various | `installed.band` |

The one consumer that does see zone detail is the restoration bill: `carCostToBandYen`
(`bands.ts:206`) routes the three carriers through `bodyPartRepairBillYen`, which counts zones. So
two cars with the same triple can still differ in `marketValueYen`. The sharpest measurement is
therefore cars that agree on the triple AND on the shipped bill: those are identical to the value
model in every respect, and to every display, and to every buyer.

## 2.2 How much hides behind one triple

2,600 generated cars. Distinct zone-state signatures observed behind a single (class, triple) key:

| Class and triple | n | Distinct zone signatures |
|---|---|---|
| entry, poor/poor/poor | 232 | 232 (every car distinct) |
| entry, worn/poor/poor | 153 | 153 |
| enthusiast, worn/worn/worn | 110 | 110 |
| everyday, worn/poor/worn | 134 | 102 |

## 2.3 Spread within a group that agrees on class + triple (bill free to vary)

True cost = the cheaper of the repair and swap routes per zone, summed over six zones, driven through
the shipped planners, at tool tier 3 (the only tier where every target is reachable). Sorted by
worst yen spread; groups with n >= 20.

| Class | Triple | n | Shipped bill min..max | Bill spread | True ¥ min/med/max | True ¥ spread | True units min/med/max | Unit spread |
|---|---|---|---|---|---|---|---|---|
| enthusiast | worn/poor/poor | 60 | 6,900..31,200 | 24,300 | 6,900 / 16,200 / 32,540 | **25,640** | 5 / 12 / 19 | 14 |
| flagship | fine/worn/fine | 34 | 5,600..23,600 | 18,000 | 6,400 / 19,400 / 28,400 | 22,000 | 7 / 15 / 21 | 14 |
| everyday | worn/worn/poor | 30 | 3,700..21,800 | 18,100 | 5,600 / 13,335 / 27,580 | 21,980 | 5 / 9 / 18 | 13 |
| enthusiast | worn/worn/worn | 110 | 3,700..19,900 | 16,200 | 3,700 / 10,600 / 25,600 | 21,900 | 4 / 7 / 22 | **18** |
| everyday | worn/poor/worn | 134 | 3,700..23,600 | 19,900 | 4,535 / 14,170 / 25,910 | 21,375 | 4 / 10 / 17 | 13 |
| entry | poor/poor/poor | 232 | 10,700..31,200 | 20,500 | 11,376 / 22,004 / 27,264 | 15,888 | 7 / 16 / 23 | 16 |

Read the first row plainly: **two enthusiast cars that both display panels `worn`, paint `poor`,
underbody `poor` can cost ¥6,900 or ¥32,540 to bring to their tier's expectation. That is 4.7x.**

## 2.4 Spread within a group that is truly identical downstream (class + triple + shipped bill all equal)

This is the number asked for. These cars produce the same `marketValueYen`, the same chips, the same
auction grade and the same buyer reaction.

| Class, triple, bill | n | True ¥ min/med/max | True ¥ spread | True units min/med/max | Unit spread |
|---|---|---|---|---|---|
| entry, poor/poor/poor, ¥20,000 | 11 | 16,520 / 18,420 / 22,004 | ¥5,484 | 11 / 14 / 20 | **9** |
| entry, poor/poor/poor, ¥18,100 | 25 | 15,744 / 17,596 / 20,620 | ¥4,876 | 10 / 13 / 18 | 8 |
| enthusiast, worn/poor/worn, ¥12,500 | 17 | 12,500 / 14,180 / 17,940 | ¥5,440 | 7 / 10 / 15 | 8 |
| enthusiast, worn/poor/worn, ¥10,600 | 17 | 10,600 / 14,180 / 16,260 | **¥5,660** | 7 / 10 / 12 | 5 |
| entry, worn/poor/poor, ¥19,900 | 10 | 18,668 / 21,236 / 23,136 | ¥4,468 | 11 / 14 / 18 | 7 |
| everyday, worn/worn/worn, ¥12,500 | 16 | 11,300 / 12,000 / 15,100 | ¥3,800 | 7 / 8 / 14 | 7 |

**Headline answers.**

| Question | Answer |
|---|---|
| Worst observed bill error between two cars the value model considers identical | **¥5,660** (enthusiast, worn/poor/worn, both billed ¥10,600: true cost ¥10,600 versus ¥16,260) |
| Worst observed labour error, same condition | **9 labour units = 27 energy points at tier 3 = 45% of a solo shop's day** (entry, poor/poor/poor, both billed ¥20,000: 11 units versus 20) |
| That same worst pair, in yen | ¥5,484 apart |
| Typical case (median group's spread, 157 groups with n >= 5) | **¥2,600 and 4 labour units (12 energy points, 20% of a day)** |
| Worst total unpriced metal inside one identical group | **4 to 13 severity points of dents, all billed at ¥0** (entry, poor/poor/poor, ¥27,400) |

The last row is the metal defect measured rather than asserted: inside one group of cars the game
treats as the same car at the same price, one has 4 severity points of beatable damage and another
has 13, and the bill charges ¥0 for both. Thirteen points of metal is roughly 13 beat operations,
65 energy points at tool tier 1, more than a whole day.

## 2.5 Two further defects the same run surfaced

**a. Flagship bodies cannot reach their own tier's expectation below tool tier 3.**

| Class | Expectation band | Cars that cannot reach it at tier 1 | at tier 2 |
|---|---|---|---|
| entry | fine | 6% | 0% |
| everyday | fine | 3% | 0% |
| enthusiast | fine | 3% | 0% |
| flagship | mint | **100%** | **100%** |

`expectationByTier.flagship.band` is `mint`; `polish` floors at finish 1 unless `fullCapability`.
The shipped flagships therefore have a body the market expects at `mint` and a workshop that
physically cannot produce `mint` until tool tier 3 is owned or the body line is hired for the day.
The non-flagship tier-1 failures are the separate `metal 3` case: beat refuses above metal 2 and
weld needs tier 2.

**b. The shipped bill is wrong in both directions, not just low.**

| Measure | Value |
|---|---|
| Cars where the true money cost exceeds the shipped bill | 1,450 of 2,600 (56%) |
| Delta, min / median / max | -¥6,592 / +¥676 / **+¥6,700** |

It understates by up to ¥6,700 (the bill assumes fill-and-sand alone where the real chain forces a
fill the target band did not require), and overstates by up to ¥6,592 (the bill prices a fill the
player would never do, because swapping the panel is cheaper).

## 2.6 Per class, the true body bill

At tool tier 3, to that class's own expectation band.

| Class | n | Target | True ¥ min/med/max | True units min/med/max | Shipped bill, median |
|---|---|---|---|---|---|
| entry | 700 | fine | 6,160 / 19,836 / 27,264 | 4 / 14 / 23 | 19,900 |
| everyday | 800 | fine | 0 / 12,500 / 27,655 | 0 / 9 / 20 | 12,500 |
| enthusiast | 900 | fine | 0 / 9,260 / 32,540 | 0 / 7 / 22 | 7,400 |
| flagship | 200 | mint | 6,400 / 21,300 / 34,100 | 7 / 16 / 26 | 16,700 |

Note the inversion the flat materials produce: the median body bill on an entry car (¥19,836 against
a ¥130,000 to ¥400,000 book value) is HIGHER than on an enthusiast car (¥9,260 against a much larger
book value), because entry cars roll worse zones and the tins cost the same either way. The body is
the one part of the economy where the shitbox costs more to fix than the hero car.

---

# Part 3: four structures

## Summary

| | Build cost | Fixes | Breaks | Must be re-derived |
|---|---|---|---|---|
| **A. Three carriers, fix the bill** | Small (one module, plus levers) | The ¥5,660 / 9-unit measured error; the flat-materials scaling; the unpriced metal | Nothing structurally; but it moves the economy | Generation's Law 2 bill guard; every economy probe; `expectationByTier` split |
| **B. Six per-zone carriers** | Very large (29 to 32 `CarPartId`s) | Location collapse only | The metal-versus-finish distinction, which is the collapse that actually matters | Authenticity weights (re-sum to 100 over 32 slots), style weights, 24 new stock SKUs, 6 pixel sprites, save version |
| **C. Zones become the parts, multi-axis condition** | Largest in the codebase | Everything | The one-band part model that the entire value, resale, display and physics layer speaks | The condition vocabulary itself |
| **D. Keep the structure, add identity** | Small (2 code changes, 1 guard test, 0 new SKUs) | Bodykits, authenticity, the style carrier, aero identity | Nothing measured | Nothing in the bill; the swap-panel resolver needs one change (Part 4) |

## A. Keep three carriers, fix the bill

**What it is.** Price metal in `panelsRepairBillYen` and `underbodyRepairBillYen`; make materials
scale with the car rather than being flat; optionally surface labour in the bill.

**What it fixes.** The whole of Part 2's measured error. Charging per-zone metal collapses the
9-labour-unit spread into a visible number; scaling materials off `stockReplacementPriceYenByClass`
or the class factor removes the ¥31,200-on-everything absurdity.

**What it breaks.** Nothing structural, but it is the single most lever-heavy option and every lever
is directive-22 gated:

| Lever | Why it moves | Consequence if unmanaged |
|---|---|---|
| new metal price per severity step | new | raises every rough car's bill |
| materials scaled by class | `materials.json` is flat today | changes entry-versus-flagship balance |
| `enforceMaxBillFraction` (Law 2 guard) | `hasZoneDegradeHeadroom` / `hasZoneImproveHeadroom` (`bodyPipeline.ts:242,263`) are defined as "the money field", and metal is deliberately excluded because it is free. Pricing metal makes metal a money field, and both helpers become wrong | generation stops softening the right cars |
| `marketRepairDiscount` 1.3 | every extra bill yen is deducted at 1.3x from clean value | a bigger body bill directly lowers rough-car values |
| `economyApprovalGate.test.ts` pin | guard test | re-pin in the same change as the recorded approval |

**What it does not fix.** Identity (no bodykit can ever be fitted), the collapse itself (a five-dent
car and a one-dent car still show the same band), the flagship-mint impossibility, or the inverted
colour-mismatch penalty.

## B. Six carriers, one per zone

**The band question is fatal, and it is the whole of the objection.** A zone has three axes. A
`CarPartId` has one band. So six per-zone carriers must collapse `max(metal, surface, finish)` into
one band each.

Today the collapse runs the other way: it keeps the AXIS and loses the LOCATION. `panels` asks "how
straight is the metal and the filler" and `paint` asks "how good is the finish", as two separate
questions, with separate weights:

| Slot | `statWeights.authenticity` | `statWeights.style` | `physicalWeights.aero` |
|---|---|---|---|
| `panels` | 11 | 2 | 1 |
| `paint` | 11 | 2 | 0 |
| `underbody` | 1 | 2 | 1 |

Those are the second and third heaviest authenticity weights in the whole 29-slot taxonomy (only
`block` at 18 is higher). Six per-zone carriers would make "straight but faded" and "shiny paint over
filler" the same band on the same slot, and the value model would lose the ability to distinguish
them at all. **B trades the collapse the game can live with for the collapse it cannot.**

**What breaks mechanically** (measured against the codebase, not estimated):

| Site | What it asserts | Hand edit? |
|---|---|---|
| `packages/content/src/tags.ts:54-90` | `CarPartIdSchema` z.enum, "the 29 real car parts" | yes |
| `packages/sim/tests/authenticity.test.ts:69-72` | `expect(PARTS_TAXONOMY).toHaveLength(29)`; `expect(TOTAL_WEIGHT).toBe(100)` | yes, and the authenticity column must be re-authored to sum to 100 across 32 slots |
| `packages/sim/tests/authenticity.test.ts:74-84` | pins `WEIGHT.paint` = 11, `WEIGHT.panels` = 11 individually | yes |
| `packages/game/src/components/workshopViewLayout.test.ts:29,116-127` | `DERIVED_CARRIERS = ['panels','paint','underbody']`; "covers every car part except the three derived carriers" | yes, plus new rectangles in `workshopViewLayout.ts:84-160` |
| `packages/game/src/components/partSprites.test.ts:19-25` | every `CarPartId` has a hand-drawn 24x16 or 32x22 pixel template | yes: 6 new sprites authored, 3 deleted |
| `packages/content/src/data.ts:88-120` | `stockReplacementPricesByClass` THROWS at content load for any `CarPartId` without a non-zone stock SKU in all 4 classes | yes: 24 new SKUs must land in the same commit as the enum |
| `packages/content/src/carInstance.ts:43-73` | `CarPartsSchema`, 29 explicit keys, IS the persisted parts shape | yes |
| `packages/content/src/partPricing.ts:18-48,56-60,91-121` | `ByCarPartIdPriceSchema`, `ByPriceBasisIdPriceSchema`, `ByCarPartIdGradeFactorsSchema`, all exhaustive | yes, 3 keys out and 6 in |
| `packages/content/src/economy.ts:19-49` | `ByCarPartIdWeightSchema` (`missingSlotWeightByPart`), exhaustive | yes |
| `packages/content/tests/schemas.test.ts:103,816-820`; `statWeightsCompleteness.test.ts:21`; `saveCodec.test.ts:699`; `PerformanceSandboxScreen.test.ts:140,192`; `integrity.test.ts:385` | count-of-29 and count-of-472 assertions | yes, all |
| `packages/game/src/save/saveCodec.ts:634,800-813,998-1005` | `SAVE_VERSION`, `OLD_GROUP_TO_PARTS`, `GROUP_TO_REPRESENTATIVE_PART` | yes |
| `ALL_CAR_PART_IDS` walks | **79 references across 34 files** | no hand edit, but every one is a behavioural blast site |

Plus a naming collision with no clean escape: `chassis` is already both a `CarPartId` (drivetrain
group) and a `ZoneId`, and `workshopViewLayout.ts:127-140` documents the two-`chassis`-region
workaround. A sixth carrier for the chassis zone forces that duplication into the type system.

## C. Zones become the parts, with multi-axis condition

**The honest option, and it is honest.** It is what the model actually is: six locations x three
physical axes.

**What it costs.** `ConditionBand` is the single most-shared vocabulary in the codebase.
`bandIndex`, `climbBand`, `degradeBand`, `bandFactor`, `costToBandYen`, `usedPartSaleValueYen`,
`resaleBandFactors`, `scrapValueYen`, `weightedBandFactorForStat`, `physicalConditionFactors`,
`foundationFactor`, the auction grade, the band chips, the tool-tier repair ceiling and every save
record all speak it. Growing the part model to a condition VECTOR means every one of those takes a
vector or a projection, and the projection is the collapse all over again.

**What it fixes.** Genuinely everything: the bill, the location, the axis, the swap, the identity.

**Why it is the wrong proportion.** Multi-axis condition would exist to serve 3 slots of 29. Every
other slot in the game is honestly one-dimensional: a clutch is worn or it is not. Building a second
condition model for the body means the body's needs set the vocabulary for the engine, and the sim's
simplest and most-tested primitive becomes its most complex, for one component group.

## D. Keep the structure, add identity

**Is it actually possible? Yes, and the blocking invariants are exactly two.**

**Invariant 1: the carriers are `removable: false`, so their slot is never empty, so install can
never fire.**

- `packages/content/data/parts-taxonomy.json`: `panels`, `paint`, `underbody` (and `chassis`) carry
  `removable: false`. Schema default is `true` (`carPart.ts:76`).
- `packages/sim/src/jobs.ts:586`: `if (!entry.removable) return { state, log: [], laborSlotsUsed: 0 }`
  in `resolveRemovePart`. `jobs.ts:688` returns `{ kind: 'not-removable' }` from the gate.
- `packages/sim/src/jobs.ts` `installFitGate`: `const slotEmpty = !!part && !car?.parts[part.carPartId]?.installed`,
  and `slotEmpty` is a conjunct of `fits`. A slot that can never be emptied can never be filled.

**Invariant 2: `applyDerivedBodyBands` reaches for the STOCK catalogue part when it finds a null
carrier slot.**

- `packages/sim/src/bodyPipeline.ts:140-157`: `const catalogPart = context.stockPartByCarPartId[fitmentClass]?.[carPartId]`,
  then it synthesises a fresh instance. Even a momentarily-emptied carrier is re-stocked on the next
  zone mutation, silently reverting a fitted kit to OEM.

**What asserts it in test:** `packages/content/tests/integrity.test.ts:336-350`, "the three derived
body value carriers carry a stock SKU only, one per fitment class, no aftermarket grades", asserting
`expect(atClass.map(p => p.grade)).toEqual(['stock'])`.

**What does NOT block it, checked rather than assumed:**

| Mechanism | Why it is already safe |
|---|---|
| `applyDerivedBodyBands` band write | `parts = { ...parts, [carPartId]: { installed: { ...installed, band } } }` (`bodyPipeline.ts:137`). It rewrites ONLY `band`. A non-stock `partId` survives every re-derivation, forever. |
| `partFitsCar` (`parts.ts:60-79`) | rejects `part.zoneId != null` only. A non-zone `panels` SKU passes group, class and tag checks unchanged. |
| `planGroupRepair`, `repairJobGate`, the UI repair affordances | all early-return on `isBodyDerivedPart` and stay correct: the band is still derived, a kit does not become repairable |
| `installedPartsValueYen` (`marketValue.ts:228`) | skips `grade === 'stock'`; a fitted kit is credited at `priceYen x retention` with no change |
| `stocknessOf` (`derivedStats.ts:116`) | reads `part.grade === 'stock'` per slot; a kit drops stockness by its weight with no change |
| `stylePercentOf` (`derivedStats.ts:220`) | sums `statModifiers.style x bandFactor(band)` over every installed part; a kit's style points enter `fitted` with no change |
| aftermarket-at-generation roll (`auctions.ts:730`) | already excludes body derived parts; that is a separate, deliberate choice and can stay |

So D needs: flip `removable` to `true` on the three carriers (or add a body-carrier-specific
replace path), teach `applyDerivedBodyBands`'s null-slot fallback to preserve the fitted SKU, retire
the stock-only guard, and fix the swap resolver (Part 4). That is it.

**What D fixes.** Everything about identity, and nothing about the bill. The identity hole is
measured below and it is large.

**What D leaves alone.** The ¥5,660 / 9-unit bill error stands untouched. D and A are orthogonal and
compose cleanly: D changes what a carrier HOLDS, A changes what the zone bill CHARGES. Neither
touches the other's code path.

---

# Part 4: bodykits, on the evidence

## 4.1 The current state of the aero slot, measured

Every aftermarket body product in the game is filed on `carPartId: 'aero'`. There are **9 non-stock
SKUs per fitment class, all competing for one slot**, and 6 of them are named for, and priced from,
a slot they do not address:

| SKU | Grade | `priceBasisPartId` | `aeroFunctional` | style | handling | Price, everyday |
|---|---|---|---|---|---|---|
| `mikoshi-lip-kit` | street | (aero) | **true** | 7 | 0 | ¥5,400 |
| `mikoshi-gt-wing` | sport | (aero) | **true** | 13 | 5 | ¥8,300 |
| `frp-race-aero` | race | (aero) | **true** | 18 | 15 | ¥12,500 |
| `frp-lightweight-panels` "Lightweight Body Kit" | street | **panels** | absent | 5 | 2 | ¥5,800 |
| `frp-sport-panel-kit` "Sport Body Kit" | sport | **panels** | absent | 9 | 3 | ¥9,000 |
| `frp-carbon-panel-kit` "Carbon Body Kit" | race | **panels** | absent | 12 | 5 | ¥13,400 |
| `neon-doraku-underglow-kit` | street | **underbody** | absent | 8 | 0 | ¥5,000 |
| `namazu-sport-underbody-kit` "Skirt and Splitter Kit" | sport | **underbody** | absent | 8 | 4 | ¥7,700 |
| `namazu-flatfloor-kit` "Flat Floor Kit" | race | **underbody** | absent | 6 | 9 | ¥11,500 |

Three consequences, all measured:

1. **The six misfiled kits occupy the aero slot without providing downforce.** `effectiveDownforce`
   (`performance.ts:416-428`) returns `aero.byGrade[part.grade]` only when `part.aeroFunctional`;
   otherwise it falls back to `factoryAeroOf`. So fitting a Carbon Body Kit displaces a GT wing and
   returns the car to factory downforce.
2. **A "Lightweight Body Kit" is not lighter.** No `aero`, `panels`, `paint` or `underbody` SKU
   carries `physicalModifiers` at all (schema `stats.ts:106-126` has `grip`, `braking`, `mass` and no
   aero key; 132 of 472 catalogue entries carry non-default `physicalModifiers` and none are in the
   body group).
3. **23 of the 100 authenticity weight is permanently pinned at "stock".** `panels` 11 + `paint` 11 +
   `underbody` 1. Since no non-stock SKU exists for any of the three, `stocknessOf`'s numerator
   contribution from them is fixed at maximum. A player cannot make a car read as less original
   through its panels, paint or underbody, however wide the arches get. The same three slots carry
   6 of the 14 `statWeights.style` weight and can only ever DRAG style down through condition, never
   contribute a point to `fitted`.

## 4.2 How many SKUs a coherent ladder needs, and on which slots

The split the catalogue already implies through its price bases is the right one; only the
`carPartId` disagrees with it.

| Slot | Role | Ladder | SKUs per class | Total |
|---|---|---|---|---|
| `aero` | **performance**: downforce, gated by `aeroFunctional` | stock, street lip, sport wing, race aero | 4 | 16 |
| `panels` | **identity**: bodywork shape, style points, stockness | stock, street lightweight, sport widebody, race carbon | 4 | 16 |
| `underbody` | **identity**: underside dress and floor | stock, street underglow, sport skirts, race flat floor | 4 | 16 |
| `paint` | **identity**: finish (respray, two-tone, pearl) | stock plus 3 finishes | 4 | 16 |

**Net new SKUs required for the first three: zero.** The six misfiled kits move back to the slot
they are already priced from, and their names, prices, brands and stat modifiers survive intact.
`aero` narrows from 3 SKUs per non-stock grade to 1, which is `integrity.test.ts:358-374` being
re-pointed rather than rewritten. `paint` is the only genuinely new authoring, and it is optional:
12 paint-finish SKUs were retired in the same change that created the derived carriers
(`integrity.test.ts:378-384` records the arithmetic), so the ladder already existed once.

Catalogue total after the re-address: **still 472 entries**, 24 of them re-addressed (6 SKUs x 4
fitment classes moving off `aero`), plus 12 if the paint finishes come back.

## 4.3 Trace: repairing a dented widebodied car

Assume `car.parts.panels.installed.partId = 'frp-sport-panel-kit'` (widebody), band derived as
always. Following the shipped code, step by step:

| Step | What happens | Verdict |
|---|---|---|
| 1. Damage arrives (symptom, generation, or a shunt) | `setZoneCarrierToAtLeastBand` (`bodyPipeline.ts:297`) writes `metal`/`finish` on `car.zoneState[zoneId]`. Zone state does not know or care what SKU sits on the carrier | **works** |
| 2. Band re-derives | `derivePanelsBand` reads `max(metal, surface)` across the five panel zones (`bodyPipeline.ts:54`). Unchanged | **works** |
| 3. Band is written back | `applyDerivedBodyBands` does `{ ...installed, band }` (`bodyPipeline.ts:137`). The widebody `partId` survives | **works** |
| 4. Player beats, welds, fills, primes, paints, polishes | Every stage is a pure zone operation (`planPipelineStage`, `planPaintStage`). None reads the carrier's SKU | **works** |
| 5. Money bill | `panelsRepairBillYen` charges the flat ¥1,900 filler per over-threshold zone (`bodyPipeline.ts:431`). A widebody costs exactly what steel costs to fill | **wrong, but it is the same flat-materials defect as everywhere else** |
| 6. Value | `installedPartsValueYen` credits the kit's ¥9,000 at retention; `stocknessOf` drops 11 of 100; `stylePercentOf` gains the kit's 9 style points into `fitted` | **works, and is the point of the change** |
| 7. **Player swaps a panel** | `resolvePipelineSwapPanelAction` (`stagedWork.ts:291`) resolves the NEW panel through the player's picked `PartInstance`, and the OLD panel through `zonePanelPart(context.partsById, zoneId, fitmentClass)` (`stagedWork.ts:320`), which finds the first `zoneId`-carrying, `grade === 'stock'` SKU. There is no widebody zone panel | **BREAKS** |

Step 7 in full: the player buys a ¥1,000 OEM steel bonnet, fits it to a widebodied car, and the game
harvests the removed widebody bonnet back into inventory AS AN OEM STEEL BONNET, because
`oldPanelCatalogPart` is the same `zonePanelPart` lookup. The kit's identity is laundered on both
ends of one operation, and the widebody carrier keeps reading `frp-sport-panel-kit` on a car that now
has one OEM steel panel bolted into it. The `installFitGate` never runs: the swap resolver has its
own check (`newPanelCatalogPart.zoneId !== action.zoneId`), so there is no existing gate to teach.

**So: the zone model still works for the whole repair pipeline. It breaks only at swap.** Three
fixes, in ascending coherence:

| Fix | Cost | Assessment |
|---|---|---|
| (a) Ship 20 zone-panel SKUs per kit family | 60 new SKUs for 3 kits, per the 5 zones x 4 classes matrix | clearly wrong |
| (b) Refuse the swap when the carrier holds a non-stock SKU, with a real reason ("nobody stocks a panel for that kit") | one gate, one copy string | acceptable, and diegetic |
| (c) Resolve the swap panel through the CARRIER'S own SKU, pricing it off the carrier's price rather than the `zonePanel` basis | one lookup change in `zonePanelPart`'s callers, plus a `zonePanel`-basis fraction | **coherent**: a widebody panel costs what a widebody panel should cost, and the harvested one is a widebody panel |

(c) also happens to make the Part 1 crossover self-correcting: a ¥13,400 carbon kit's zone panel
would cost far more than ¥1,900 of filler, so beating becomes correct on exactly the cars where
beating should be correct.

## 4.4 `aeroCeiling` versus `styleCeiling`

**`aeroCeiling` is now a real field, and this section's original claim that it was not is
superseded.** It was measured while the column existed only in
`docs/design/midnight-garage-roster.csv` and reached no code. Sprint 140 authored it for all 94
roster rows, made it required on `CarModelSchema`, and had `effectiveDownforce` scale its resolved
downforce coefficient by it, so the roster guard now has teeth on the column too.

**What that changed about the question below, and what it did not.** A bodykit still cannot move
`aeroCeiling`: the ceiling describes what a given car's body can be made to do and is authored per
car, not something a purchased part raises. What it does is scale what an aero SKU delivers once
fitted, which is why the same wing gains an FD over four seconds a lap and costs a Wagon R time.
The rest of this section's reading of the aero weights stands as measured.

What actually happens to aero, from the code:

```
physical.aero = (1 x Ca(panels.band) + 1 x Ca(underbody.band) + 3 x Ca(aero.band)) / 5
```

`Ca` is `statFormulas.condition.bandFactor.aero` = `{mint 1, fine 0.98, worn 0.93, poor 0.84,
scrap 0.68}` (`derivedStats.ts:262-280`), a deliberately gentle curve. `physical.aero` is spent in
exactly two places, both MULTIPLYING the downforce coefficient: `derivedStats.ts:541-548` (the
handling readout) and `performance.ts:830` (`downforceCoeff: aeroEffect.downforceCoeff * condition.aero`).

The downforce coefficient itself is a REPLACEMENT, not a scaling:
`effectiveDownforce` (`performance.ts:416-428`) returns `aero.byGrade[part.grade]` if and only if the
`aero` slot holds an `aeroFunctional` SKU, otherwise `factoryAeroOf(model)`.

| Question | Answer |
|---|---|
| What does a bodykit on `panels` do to aero? | It moves `physical.aero` by 1/5 of the gentle condition curve, and multiplies a downforce coefficient that is **0** for any car without an `aeroFunctional` wing. `0 x anything = 0`. **On most cars: literally nothing.** |
| Can a bodykit on `panels` raise the grip ceiling? | **No.** Only an `aeroFunctional` SKU in the `aero` slot can, via `aero.byGrade` (`stock {0,0}`, `street {0.1, 0.01}`, `sport {0.4, 0.04}`, `race {1.2, 0.09}`). This is consistent with the standing ruling that the grip ceiling is reached via aero. |
| What does a bodykit do to style? | `styleCeiling` is real and required on every car (`carModel.ts:134,148`, refined at `:248` so it cannot sit below `styleBase`). `stylePercentOf` (`derivedStats.ts:220`) computes `styleBase + (styleCeiling - styleBase) x min(1, fitted / 66)`, where `fitted` is the sum of `statModifiers.style x bandFactor(band)`. **A widebody on `panels` would put style points into `fitted` for the first time.** Today the three body carriers contribute 6 of the 14 `statWeights.style` CONDITION weight and can contribute zero to `fitted`: they are pure drag on style and never a source of it. |

**The clean split, which the price bases already assert and the `carPartId`s already violate:
`aero` is the PERFORMANCE slot (downforce, gated by `aeroFunctional`); `panels`, `underbody` and
`paint` are the IDENTITY slots (style points into `fitted`, and stockness).**

---

# Part 5: what a zone panel should cost

Status: MEASUREMENT ONLY, second probe (2026-08-01). No shipped code, content, lever or test was
changed to produce it. The probe was a temporary Vitest file that drove the shipped functions and has
been deleted.

## 5.0 Method

Every number below came from driving `generateAuctionCarInstance`, `enforceMaxBillFraction`,
`carCostToMintYen`, `cleanValueYen`, `marketValueYen`, `planPipelineStage`, `planPaintStage`,
`planSwapPanel` and `usedPartSaleValueYen` against **twelve re-priced catalogues**, each built through
the real `buildSimContext` with only the `zoneId`-carrying SKUs' `priceYen` replaced.

Prices were recomputed with the shipped formula (`resolvePartPriceYen`:
`round100(base x classFactor x gradeFactor x globalFactor)`) and the probe **asserts** that at 1x it
reproduces the shipped `priceYen` for all four classes before measuring anything else.

Sample: 26 shipped models x 60 seeds = **1,560 generated cars** per candidate, game year 1995,
symptoms and missing slots enabled, same seed sequence across every candidate so any difference is
attributable to the price alone.

Candidates. Six on the shipped class curve (`0.14 / 0.16 / 0.4 / 0.9`, a 6.43x span) at 1x, 2x, 3x,
5x, 10x, 20x of `baseCostYen.zonePanel` = 6,000; six more on two compressed curves, `comp25`
(`0.36 / 0.42 / 0.6 / 0.9`, 2.5x span) and `comp18` (`0.5 / 0.56 / 0.72 / 0.9`, 1.8x span), each at
2x, 3x and 5x.

Route costs use a Dijkstra over the real stage planners (state space is 4 metal x 3 surface x 4 finish
x primed), minimising yen first and energy second. It reproduces every figure in Part 1.3 exactly,
which is what qualifies it to be trusted on the rows Part 1 did not cover.

## 5.1 Law 2 does not bind: the answer is NO, at any price, on any class

**The repair bill never reads the panel price on a generated car.** `panelsRepairBillYen`
(`bodyPipeline.ts:431-449`) adds `panel.priceYen` inside exactly one branch, `if (zone.panelMissing)`;
every other zone contributes the flat `FILL_AND_SAND_COST_YEN`. And generation cannot produce a
missing panel:

| Writer | File | Can it set `panelMissing: true`? |
|---|---|---|
| `rollZoneStates` | `bodyPipeline.ts:209` | No. Hardcodes `panelMissing: false` on every zone of every car. |
| `degradeZoneCarrierOneStep` (damage budget) | `bodyPipeline.ts:340-360` | No. Moves `surface` or `finish` only, through `moneyFieldFor`. |
| `setZoneCarrierToAtLeastBand` (symptoms) | `bodyPipeline.ts:297-320` | No. Moves `metal` or `finish` only. |
| `improveZoneCarrierOneStep` (Law 2 softening) | `bodyPipeline.ts:371-394` | Clears it, never sets it. |
| The missing-slot roll | `auctions.ts:916-921` | Empties a `CarPartId` SLOT, never a zone. `missingSlotWeightByPart` is **0** for `panels`, `paint` and `underbody` (`economy.json:454-456`), and `applyDerivedBodyBands` re-fills an empty carrier slot anyway. |

Two further indexes close the last routes by which a zone panel price could reach a car's numbers:
`indexStockPartsByCarPartId` (`context.ts:189-192`) and `stockReplacementPricesByClass`
(`data.ts:99-105`) both filter `zoneId == null`, so no taxonomy weight, no scrap value and no
missing-slot replacement cost has ever read a zone panel's price.

Measured, rather than argued. 1,560 cars per candidate, compared car by car against the 1x baseline:

| Candidate | Panel entry / everyday / enthusiast / flagship | Cars with identical `zoneState` | Cars with identical bill | Mean body severity points |
|---|---|---|---|---|
| x1 shipped | 800 / 1,000 / 2,400 / 5,400 | 1560 / 1560 | 1560 / 1560 | 17.813 |
| x2 shipped | 1,700 / 1,900 / 4,800 / 10,800 | 1560 / 1560 | 1560 / 1560 | 17.813 |
| x3 shipped | 2,500 / 2,900 / 7,200 / 16,200 | 1560 / 1560 | 1560 / 1560 | 17.813 |
| x5 shipped | 4,200 / 4,800 / 12,000 / 27,000 | 1560 / 1560 | 1560 / 1560 | 17.813 |
| x10 shipped | 8,400 / 9,600 / 24,000 / 54,000 | 1560 / 1560 | 1560 / 1560 | 17.813 |
| x20 shipped | 16,800 / 19,200 / 48,000 / 108,000 | 1560 / 1560 | 1560 / 1560 | 17.813 |
| x2 comp25 | 4,300 / 5,000 / 7,200 / 10,800 | 1560 / 1560 | 1560 / 1560 | 17.813 |
| x2 comp18 | 6,000 / 6,700 / 8,600 / 10,800 | 1560 / 1560 | 1560 / 1560 | 17.813 |
| x3 comp25 | 6,500 / 7,600 / 10,800 / 16,200 | 1560 / 1560 | 1560 / 1560 | 17.813 |
| x3 comp18 | 9,000 / 10,100 / 13,000 / 16,200 | 1560 / 1560 | 1560 / 1560 | 17.813 |
| x5 comp25 | 10,800 / 12,600 / 18,000 / 27,000 | 1560 / 1560 | 1560 / 1560 | 17.813 |
| x5 comp18 | 15,000 / 16,800 / 21,600 / 27,000 | 1560 / 1560 | 1560 / 1560 | 17.813 |

**Zero band-steps of body damage are lost at any price up to 20x. The core-loop law is not exposed to
this lever at all.** The own goal the sweep was commissioned to look for does not exist.

### 5.1b How much Law 2 headroom there is, for the record

If a future change ever DID put panel money into the generated bill, this is the room it would have:

| Class | n | Median bill | Median cap (0.6 x clean) | Median slack | Cars within Y5,000 of the cap |
|---|---|---|---|---|---|
| entry | 420 | 65,840 | 144,900 | 82,481 | **57 (13.6%)** |
| everyday | 480 | 58,020 | 353,365 | 278,640 | 0 |
| enthusiast | 540 | 92,740 | 642,600 | 550,320 | 0 |
| flagship | 120 | 134,200 | 2,162,829 | 1,829,669 | 0 |

Only the entry class ever sits near its cap, and 13.6% of entry cars are inside Y5,000 of it.

### 5.1c The counterfactual, so the risk is bounded rather than merely absent

Forcing one missing bonnet onto each generated car and then running the real
`enforceMaxBillFraction` shows what WOULD happen if generation ever gained a strip-a-panel roll:

| Candidate | entry | everyday | enthusiast | flagship |
|---|---|---|---|---|
| x1 shipped | 93.3% survive | 100% | 100% | 100% |
| x5 shipped | 87.4% | 100% | 100% | 100% |
| x10 shipped | 85.2% | 100% | 100% | 100% |
| x20 shipped | **81.0%** | 100% | 100% | 100% |

Even in the counterfactual the exposure is confined to the entry class and costs at most 12
percentage points of survival across a 20x price move. Nothing outside entry ever notices.

## 5.2 The anchor nobody has looked at: five zone panels ARE the shell

Measured from the shipped catalogue:

| Class | Zone panel | x5 | `panels` slot | `paint` slot | `underbody` slot | `aero` slot | 5 panels as a share of the `panels` slot |
|---|---|---|---|---|---|---|---|
| entry | 800 | 4,000 | 3,900 | 5,600 | 3,400 | 3,600 | **103%** |
| everyday | 1,000 | 5,000 | 4,500 | 6,400 | 3,800 | 4,200 | **111%** |
| enthusiast | 2,400 | 12,000 | 11,200 | 16,000 | 9,600 | 10,400 | **107%** |
| flagship | 5,400 | 27,000 | 25,200 | 36,000 | 21,600 | 23,400 | **107%** |

`baseCostYen.zonePanel` is 6,000 against `baseCostYen.panels` 28,000: 21.4%, near exactly one fifth.
**The Y800 is not an isolated error. It is internally coherent with a pricing sheet that says an
entire entry-class bodyshell costs Y3,900 and a full respray Y5,600.** Raise `zonePanel` on its own by
5x and the game asserts that one bonnet (Y4,200) costs more than the whole shell it bolts to (Y3,900).

This is the constraint that most shapes the answer, and it is not visible from the panel price alone.

## 5.3 Panel, salvage and the crossover, per candidate

Salvage is `usedPartSaleValueYen(price, band of the old metal)`, so it spans 3% (poor) to 30% (mint) of
the panel price. Net cost is the panel minus that. The comparison is against the flat Y1,900
fill-and-sand tin, which does not move with class or with price.

| Candidate | Class | Panel | Salvage poor..mint | Net cost | Verdict against Y1,900 |
|---|---|---|---|---|---|
| x1 shipped | entry | 800 | 24..240 | 560..776 | SWAP cheaper by 1,124..1,340 |
| x1 shipped | everyday | 1,000 | 30..300 | 700..970 | SWAP cheaper by 930..1,200 |
| x1 shipped | enthusiast | 2,400 | 72..720 | 1,680..2,328 | straddles |
| x1 shipped | flagship | 5,400 | 162..1,620 | 3,780..5,238 | repair cheaper by 1,880..3,338 |
| x2 shipped | entry | 1,700 | 51..510 | 1,190..1,649 | SWAP cheaper by 251..710 |
| x2 shipped | everyday | 1,900 | 57..570 | 1,330..1,843 | SWAP cheaper by 57..570 |
| x2 shipped | enthusiast | 4,800 | 144..1,440 | 3,360..4,656 | repair cheaper by 1,460..2,756 |
| x2 shipped | flagship | 10,800 | 324..3,240 | 7,560..10,476 | repair cheaper by 5,660..8,576 |
| x3 shipped | entry | 2,500 | 75..750 | 1,750..2,425 | **straddles** |
| x3 shipped | everyday | 2,900 | 87..870 | 2,030..2,813 | repair cheaper by 130..913 |
| x3 shipped | enthusiast | 7,200 | 216..2,160 | 5,040..6,984 | repair cheaper by 3,140..5,084 |
| x3 shipped | flagship | 16,200 | 486..4,860 | 11,340..15,714 | repair cheaper by 9,440..13,814 |
| x5 shipped | entry | 4,200 | 126..1,260 | 2,940..4,074 | repair cheaper by 1,040..2,174 |
| x5 shipped | everyday | 4,800 | 144..1,440 | 3,360..4,656 | repair cheaper by 1,460..2,756 |
| x5 shipped | enthusiast | 12,000 | 360..3,600 | 8,400..11,640 | repair cheaper by 6,500..9,740 |
| x5 shipped | flagship | 27,000 | 810..8,100 | 18,900..26,190 | repair cheaper by 17,000..24,290 |
| x10 shipped | entry | 8,400 | 252..2,520 | 5,880..8,148 | repair cheaper by 3,980..6,248 |
| x10 shipped | flagship | 54,000 | 1,620..16,200 | 37,800..52,380 | repair cheaper by 35,900..50,480 |
| x20 shipped | entry | 16,800 | 504..5,040 | 11,760..16,296 | repair cheaper by 9,860..14,396 |
| x20 shipped | flagship | 108,000 | 3,240..32,400 | 75,600..104,760 | repair cheaper by 73,700..102,860 |
| x2 comp25 | entry | 4,300 | 129..1,290 | 3,010..4,171 | repair cheaper by 1,110..2,271 |
| x2 comp25 | everyday | 5,000 | 150..1,500 | 3,500..4,850 | repair cheaper by 1,600..2,950 |
| x2 comp25 | enthusiast | 7,200 | 216..2,160 | 5,040..6,984 | repair cheaper by 3,140..5,084 |
| x2 comp25 | flagship | 10,800 | 324..3,240 | 7,560..10,476 | repair cheaper by 5,660..8,576 |
| x2 comp18 | entry | 6,000 | 180..1,800 | 4,200..5,820 | repair cheaper by 2,300..3,920 |
| x2 comp18 | flagship | 10,800 | 324..3,240 | 7,560..10,476 | repair cheaper by 5,660..8,576 |
| x3 comp25 | entry | 6,500 | 195..1,950 | 4,550..6,305 | repair cheaper by 2,650..4,405 |
| x3 comp25 | flagship | 16,200 | 486..4,860 | 11,340..15,714 | repair cheaper by 9,440..13,814 |
| x5 comp25 | entry | 10,800 | 324..3,240 | 7,560..10,476 | repair cheaper by 5,660..8,576 |
| x5 comp25 | flagship | 27,000 | 810..8,100 | 18,900..26,190 | repair cheaper by 17,000..24,290 |

The clean floor is arithmetic: repair beats swap in EVERY salvage state only once
`0.7 x panel > 1,900`, i.e. **panel > Y2,714**. At x3 the entry class still straddles (net
Y1,750..2,425); x5 is the first shipped-curve row where entry is unambiguous.

## 5.4 Measured routes: does swap still win on time?

Driven through the real planners. Two representative states; energy is points, target is the class's
own expectation band.

**Zone 0\|1\|3 (dead paint over sound but rippled metal), tool tier 2.**

| Candidate | Class | Repair Y | Repair E | Swap Y | Swap E | Money | Time |
|---|---|---|---|---|---|---|---|
| x1 shipped | entry | 5,600 | 12 | 4,260 | 11 | SWAP by 1,340 | SWAP by 1E |
| x1 shipped | everyday | 5,600 | 12 | 4,400 | 11 | SWAP by 1,200 | SWAP by 1E |
| x1 shipped | enthusiast | 5,600 | 12 | 5,380 | 11 | SWAP by 220 | SWAP by 1E |
| x3 shipped | entry | 5,600 | 12 | 5,450 | 11 | SWAP by 150 | SWAP by 1E |
| x3 shipped | everyday | 5,600 | 12 | 5,730 | 11 | repair by 130 | SWAP by 1E |
| x5 shipped | entry | 5,600 | 12 | 6,640 | 11 | repair by 1,040 | SWAP by 1E |
| x5 shipped | everyday | 5,600 | 12 | 7,060 | 11 | repair by 1,460 | SWAP by 1E |
| x5 shipped | enthusiast | 5,600 | 12 | 12,100 | 11 | repair by 6,500 | SWAP by 1E |
| x20 shipped | entry | 5,600 | 12 | 15,460 | 11 | repair by 9,860 | SWAP by 1E |

**Zone 3\|2\|3 (rotted through), tool tier 2.**

| Candidate | Class | Repair Y | Repair E | Swap Y | Swap E | Money | Time |
|---|---|---|---|---|---|---|---|
| x1 shipped | entry | 5,600 | 20 | 4,476 | 11 | SWAP by 1,124 | SWAP by 9E |
| x1 shipped | everyday | 5,600 | 20 | 4,670 | 11 | SWAP by 930 | SWAP by 9E |
| x1 shipped | enthusiast | 5,600 | 20 | 6,028 | 11 | repair by 428 | SWAP by 9E |
| x2 shipped | everyday | 5,600 | 20 | 5,543 | 11 | SWAP by 57 | SWAP by 9E |
| x3 shipped | entry | 5,600 | 20 | 6,125 | 11 | repair by 525 | SWAP by 9E |
| x5 shipped | entry | 5,600 | 20 | 7,774 | 11 | repair by 2,174 | SWAP by 9E |
| x5 shipped | enthusiast | 5,600 | 20 | 15,340 | 11 | repair by 9,740 | SWAP by 9E |
| x10 shipped | entry | 5,600 | 20 | 11,848 | 11 | repair by 6,248 | SWAP by 9E |
| x20 shipped | entry | 5,600 | 20 | 19,996 | 11 | repair by 14,396 | SWAP by 9E |
| x2 comp25 | entry | 5,600 | 20 | 7,871 | 11 | repair by 2,271 | SWAP by 9E |
| x5 comp25 | entry | 5,600 | 20 | 14,176 | 11 | repair by 8,576 | SWAP by 9E |

**Swap's energy cost is price-invariant, so swap wins on time at every candidate and every class,
by 1 to 12 points depending on how much metal has to move.** Price cannot change that: a swap is
`energyByClass['bolt-on']` = 3 points flat plus the paint chain, and beat/weld are 5/4/3 points per
band step.

**And below tool tier 2, metal 3 has no repair route at all.** `beat` refuses above metal 2 and `weld`
needs the body line, so the swap is the only exit:

| Candidate | entry, 3\|2\|3, tier 1 | everyday, 3\|2\|3, tier 1 |
|---|---|---|
| x1 shipped | 5,276 SWAP ONLY | 5,470 SWAP ONLY |
| x3 shipped | 6,925 SWAP ONLY | 7,313 SWAP ONLY |
| x5 shipped | 8,574 SWAP ONLY | 9,156 SWAP ONLY |
| x10 shipped | 12,648 SWAP ONLY | 13,812 SWAP ONLY |
| x20 shipped | 20,796 SWAP ONLY | 23,124 SWAP ONLY |
| x2 comp25 | 8,671 SWAP ONLY | 9,350 SWAP ONLY |
| x5 comp25 | 14,976 SWAP ONLY | 16,722 SWAP ONLY |

Flagship rows are absent from both tier-1 and tier-2 tables because `expectationByTier.flagship.band`
is `mint` and `polish` floors at finish 1 without `fullCapability`: **neither route reaches a flagship's
own expectation below tool tier 3.** That is Part 2.5's defect, unchanged and unaffected by price.

## 5.5 The whole-body job, and why panel price cannot inflate it

All five panel zones at 3\|2\|3 plus the chassis, at tool tier 3, to the class expectation. This is a
CONSTRUCTED worst case, not a typical car (section 5.7 gives the real distribution).

| Candidate | Class | Shipped bill | All-repair | All-swap | Cheapest route | Share of the cheapest shipped car in class |
|---|---|---|---|---|---|---|
| x1 shipped | entry | 31,200 | 31,700 | 26,080 | **26,080** | 20.1% of 130,000 |
| x1 shipped | everyday | 31,200 | 31,700 | 27,050 | **27,050** | 5.6% of 480,000 |
| x1 shipped | enthusiast | 31,200 | 31,700 | 33,840 | 31,700 | 4.2% of 750,000 |
| x1 shipped | flagship | 31,200 | 36,500 | 53,190 | 36,500 | 1.3% of 2,890,000 |
| x2 shipped | entry | 31,200 | 31,700 | 30,445 | **30,445** | 23.4% of 130,000 |
| x3 shipped | entry | 31,200 | 31,700 | 34,325 | 31,700 | 24.4% of 130,000 |
| x5 shipped | entry | 31,200 | 31,700 | 42,570 | 31,700 | 24.4% of 130,000 |
| x10 shipped | entry | 31,200 | 31,700 | 62,940 | 31,700 | 24.4% of 130,000 |
| x20 shipped | entry | 31,200 | 31,700 | 103,680 | 31,700 | **24.4% of 130,000** |
| x20 shipped | flagship | 31,200 | 36,500 | 550,800 | 36,500 | 1.3% of 2,890,000 |

**The whole-body job is capped by the repair route and therefore capped against price.** From x3
onward the cheapest-route figure is frozen at Y31,700 (entry, everyday, enthusiast) and Y36,500
(flagship) no matter how dear panels get, because the player simply stops buying them. A 20x panel
price adds Y0 to the worst body job in the game at tool tier 3. The answer to "does a full body job
exceed a sane fraction of a cheap car's value" is: it reaches 24.4% of the cheapest shipped car and
then stops, at every price.

The one exception is tool tier 1, where metal 3 cannot be repaired at all. Five forced swaps on an
entry car: Y26,380 (x1), Y34,625 (x3), Y42,870 (x5), Y63,240 (x10), Y103,980 (x20), against a
Y130,000 Honda City, i.e. 20% rising to **80%**. That is a genuinely constructed tail (see 5.7: the
mean is 0.63 rotted zones per entry car, the p90 is 2), but it is the one shape where price does
inflate an unavoidable bill, and it is why x10 and x20 are ruled out below.

## 5.6 The typical generated car

Median over 200 cars per class, true body cost at tool tier 3 (cheaper route per zone) against the
car's own `marketValueYen`.

| Candidate | Class | Median true body Y | Median market value | Median share | p90 share |
|---|---|---|---|---|---|
| x1 shipped | entry | 14,360 | 146,054 | 9.6% | 44.8% |
| x1 shipped | everyday | 7,200 | 528,301 | 1.4% | 2.4% |
| x1 shipped | enthusiast | 4,500 | 736,106 | 0.6% | 1.4% |
| x1 shipped | flagship | 9,400 | 3,246,517 | 0.3% | 0.4% |
| x2 shipped | entry | 15,358 | 146,054 | 10.4% | 48.7% |
| x5 shipped | entry | 16,300 | 146,054 | **11.1%** | **50.4%** |
| x10 shipped | entry | 16,300 | 146,054 | 11.1% | 50.4% |
| x20 shipped | entry | 16,300 | 146,054 | 11.1% | 50.4% |
| x5 shipped | everyday | 7,400 | 528,301 | 1.4% | 2.7% |
| x5 shipped | enthusiast | 4,500 | 736,106 | 0.6% | 1.4% |
| x5 shipped | flagship | 9,400 | 3,246,517 | 0.3% | 0.4% |

Two things worth stating plainly.

1. **The typical body cost saturates by x5 and never moves again.** Raising panel prices costs the
   median entry car Y1,940 (9.6% to 11.1% of its value) and the median car of every other class
   between Y0 and Y200. Beyond x5 it costs literally nothing, because nobody buys a panel.
2. **The entry class's p90 of 44.8% at TODAY'S price is the alarming number**, and it is Part 2's
   flat-materials defect, not this lever. Panel price moves it 5.6 points and then stops.

## 5.7 The tier-1 rot toll, which is where the real ceiling is

The one bill a player genuinely cannot avoid: a zone at metal 3 with a tool tier 1 body line has no
repair route, so the panel must be bought.

| Class | n | Cars with at least one metal-3 panel zone | Mean metal-3 zones per car | Median panel zones needing a fill |
|---|---|---|---|---|
| entry | 420 | **221 (52.6%)** | 0.63 | 1 |
| everyday | 480 | 123 (25.6%) | 0.29 | 0 |
| enthusiast | 540 | 72 (13.3%) | 0.13 | 0 |
| flagship | 120 | 12 (10.0%) | 0.10 | 0 |

Net panel spend a tier-1 player cannot avoid, per car:

| Candidate | Class | Median toll | p90 toll | p90 as a share of the class's median market value |
|---|---|---|---|---|
| x1 shipped | entry | 776 | 1,552 | 0.8% |
| x2 shipped | entry | 1,649 | 3,298 | 1.8% |
| x3 shipped | entry | 2,425 | 4,850 | 2.6% |
| x5 shipped | entry | 4,074 | 8,148 | **4.4%** |
| x10 shipped | entry | 8,148 | 16,296 | **8.8%** |
| x20 shipped | entry | 16,296 | 32,592 | **17.5%** |
| x2 comp25 | entry | 4,171 | 8,342 | 4.5% |
| x3 comp25 | entry | 6,305 | 12,610 | 6.8% |
| x5 comp25 | entry | 10,476 | 20,952 | 11.3% |
| x2 comp18 | entry | 5,820 | 11,640 | 6.3% |
| x5 shipped | everyday | 0 | 4,656 | 0.9% |
| x5 shipped | enthusiast | 0 | 11,640 | 1.2% |
| x5 shipped | flagship | 0 | 26,190 | 0.8% |

**More than half of all entry cars arrive with metal a starting shop cannot weld.** That is the
constraint that sets the top of the window, and it binds on exactly the cars a new player owns.

## 5.8 Does the swap survive as a money decision at all?

Every panel zone of 120 cars per class that is below its target, resolved both ways at tool tier 3:

| Candidate | entry swap share | everyday | enthusiast | flagship |
|---|---|---|---|---|
| x1 shipped | **26.3%** | **14.9%** | 10.2% | 0.0% |
| x2 shipped | 26.3% | 14.9% | 0.0% | 0.0% |
| x3 shipped | 4.2% | 0.0% | 0.0% | 0.0% |
| x5 shipped and above | **0.0%** | 0.0% | 0.0% | 0.0% |
| every compressed candidate | 0.0% | 0.0% | 0.0% | 0.0% |

**Because the filler is flat at Y1,900, the crossover is a single threshold per class, not a curve.**
There is no price at which swapping wins on some entry zones and loses on others: it wins on all of
them or none. So the maintainer is choosing between two different meanings for the swap, and cannot
have both at the same class:

- **Below about Y2,700 per panel:** the swap is a money decision, and on cheap cars it dominates
  beating outright (today's defect).
- **Above about Y2,800 per panel:** the swap becomes a TIME decision (always 1 to 12 energy points
  cheaper) and the escape hatch for rot a low-tier shop cannot weld. Beating becomes the frugal route
  it was designed to be.

The only way to have both is to make the fill-and-sand cost scale with the car, which is Part 3's
option A and its own lever list.

## 5.9 The class curve, and one structural warning

`resolvePartPriceYen` (`partPricing.ts:186`) reads `sheet.classFactors[entry.fitmentClass]` for
**every SKU in the catalogue**, with no per-basis branch. There is exactly one class curve and all 472
entries ride it.

**Compressing the curve is therefore NOT a panel change.** It reprices every part in the game, which
is a blast radius far beyond this question. Compressing it for zone panels alone needs a new,
optional per-basis class-factor block in `PartPricingSheetSchema` (a small schema addition and one new
content block), or 20 individually-justified `overrides` entries, which is the wrong tool for a
systematic change.

What compression buys, if it is built: it makes the beat-versus-swap margin read the same at every
tier. On the shipped curve at x5 the margin ranges from Y1,040 (entry) to Y24,290 (flagship), a 23x
spread on a decision whose other side is a flat Y1,900 tin. On `comp25` at x2 it ranges Y1,110 to
Y8,576, under 8x. Since the filler does not know what car it is on, the decision arguably should not
either.

Note also that `partPricing.json` is hash-pinned by `economyApprovalGate.test.ts:1349`, so any row
picked here needs the recorded approval and a re-pin in the same change.

## 5.10 The window, and the row to pick

Four constraints, all measured, in the order they bind:

| # | Constraint | Where it comes from | What it fixes |
|---|---|---|---|
| C1 | Panel must exceed **Y2,714** | `0.7 x panel > Y1,900` filler, worst salvage case (5.3) | the FLOOR: below it, beating a filled panel is never correct on cheap cars |
| C2 | Entry panel should stay at or below about **Y4,500** | p90 tier-1 rot toll must stay under ~5% of an entry car's value (5.7) | the CEILING: 52.6% of entry cars carry unweldable metal |
| C3 | Five panels should stay near the `panels` slot price | 103% to 111% today (5.2) | coherence: otherwise one bonnet costs more than the shell |
| C4 | The swap keeps a money role only below about Y2,700 | single-threshold crossover (5.8) | a design choice, mutually exclusive with C1 |

C1 and C4 cannot both hold. C4 is the status quo and it is what the maintainer called broken, so it
is discharged rather than satisfied: **the swap becomes the time route and the rot escape hatch, not
the money route.**

**Recommended window: an entry-class zone panel of Y2,800 to Y4,500, i.e.
`baseCostYen.zonePanel` 6,000 to 20,000-30,000 on the shipped curve, or 12,000-14,000 with the class
curve compressed to 2.5x.**

| Row | `zonePanel` base | Curve | entry / everyday / enthusiast / flagship | In-window? |
|---|---|---|---|---|
| **x5 shipped** | 30,000 | shipped 6.43x | **4,200 / 4,800 / 12,000 / 27,000** | yes, at the top of C2 |
| **x2 comp25** | 12,000 | compressed 2.5x | **4,300 / 5,000 / 7,200 / 10,800** | yes, at the top of C2, with a flatter margin |
| x3 shipped | 18,000 | shipped | 2,500 / 2,900 / 7,200 / 16,200 | entry straddles C1 by Y150 |
| x10 shipped | 60,000 | shipped | 8,400 / 9,600 / 24,000 / 54,000 | no: breaks C2 (8.8% toll) |
| x20 shipped | 120,000 | shipped | 16,800 / 19,200 / 48,000 / 108,000 | no: breaks C2 badly (17.5% toll, 80% of a Y130,000 car in the constructed tier-1 tail) |
| x2 comp18 | 12,000 | compressed 1.8x | 6,000 / 6,700 / 8,600 / 10,800 | no: breaks C2 (6.3% toll) |

Whichever row is picked, **C3 makes `baseCostYen.panels` (28,000) a second lever in the same change**,
or the game states that one panel costs more than the shell. It is not free: `panels`'s stock price is
a weight in `costWeightedBandFactor` (`bands.ts:289`), which decides the lemon threshold on every sale
(`carCondition.ts:60`). `paint` (40,000) and `underbody` (24,000) are the maintainer's call and are
not implicated by any measurement here.

**The reason for this window, in one sentence: x5-shipped (or its compressed twin) is the lowest
measured price at which beating a panel wins on money at every class (by Y1,040 to Y9,740) while
swapping still wins on time at every class (by 1 to 12 energy points) and remains the only route on
the 52.6% of entry cars that arrive with metal a tier-1 shop cannot weld; and the highest at which the
unavoidable rot toll stays under 5% of a cheap car's value, against 8.8% at x10 and 17.5% at x20.**

Not a reason for anything, and worth saying because it was the commissioning worry: **none of this
touches generated damage.** Law 2 never reads the panel price, at any of the twelve candidates, on any
of 1,560 cars.

---

# Recommendation, ranked

## 1. D plus the Part 4 re-address. Identity first.

The measured hole is the largest and the fix is the cheapest.

- 23 of 100 authenticity weight is permanently unreachable. That is a fifth of the originality scale
  the player cannot touch, on the two slots (`panels` 11, `paint` 11) that are the second-heaviest in
  the taxonomy.
- 6 of 14 style condition weight can drag style down but can never push it up.
- 9 SKUs per class fight over one slot, and 6 of them silently return the car to factory downforce
  while occupying the slot a real wing needs.
- The blocking invariants are exactly two (`removable: false` plus the stock fallback in
  `applyDerivedBodyBands`), plus one guard test and one swap-resolver fix.
- **Zero new SKUs.** The six misfiled kits move to the slot they are already priced from.
- Zero economy levers. Nothing in `economy.json`, no payout, no formula. This is the only one of the
  four options that can be built without a directive-22 approval round.

Sequenced as: re-address the six kits, then unblock the carriers, then fix the swap resolver via
option (c), then decide whether the paint-finish ladder comes back.

## 2. A, fixing the bill. The only option that touches the measured error.

Everything in Part 2 stands until A is built: ¥5,660 and 9 labour units of error between cars the
game says are the same car, a typical ¥2,600 and 4 units, and up to 13 severity points of dents
billed at ¥0. Ranked second only because it is entirely lever-gated and the levers must be presented
and signed before implementation, whereas D can start immediately.

The lever list to present, by name: a per-severity-step metal price; a class scaling on
`materials.json` (or a per-class multiplier applied in `bodyPipeline.ts`); and, consequentially,
whether `hasZoneDegradeHeadroom` / `hasZoneImproveHeadroom` should keep excluding metal once metal
costs money.

## 3. The two correctness fixes that fall out of the measurement and belong to neither option.

Small, independent, and both are bugs rather than design:

- **Flagship bodies cannot reach `mint` at tool tier 1 or 2, 100% of the time**, because
  `polish`'s floor is 1 without `fullCapability` while `expectationByTier.flagship.band` is `mint`.
  Either the flagship expectation drops to `fine`, or `polish` reaches 0 at tier 2, or the
  flagship's body bill is knowingly permanent until tier 3. This is a design decision, not a typo,
  but it is currently undecided rather than decided.
- **The paint colour-mismatch penalty is inverted** (`derivePaintBand`, `bodyPipeline.ts:76-78`):
  `SEVERITY_BAND_ORDER` runs mint to poor, so `idx - 1` steps a two-tone car's paint band BETTER,
  not worse. One-line fix, and it wants a regression test.

## 4. B, rejected.

It pays the full 29-to-32 `CarPartId` blast radius (79 walk sites, 9 exhaustive keyed schemas, 24
new stock SKUs that must land in the same commit or content load throws, 6 hand-drawn pixel sprites,
the authenticity column re-authored to sum to 100 across 32 slots, a save version bump, and a
`chassis` name collision with no clean escape) in order to fix the location collapse, and it destroys
the metal-versus-finish distinction doing it. Part 2 shows the location collapse costs ¥5,660 and 9
labour units, which option A recovers for a fraction of the work. B is the most expensive option that
makes the model less expressive than it is today.

## 5. C, right in principle, wrong in proportion.

Multi-axis condition is what the body genuinely is. It is also a second condition vocabulary built to
serve 3 slots of 29, forcing `bandIndex`, `costToBandYen`, `bandFactor`, `usedPartSaleValueYen`,
`climbBand`, `weightedBandFactorForStat`, `foundationFactor`, the auction grade and every band chip
to take a vector or a projection, where the projection is the same collapse again. Revisit only if
the body ever becomes the centre of the game rather than one of six component groups.

---

## What was NOT changed to produce this

No shipped code, no content, no lever, no test. The probe used to produce Parts 1 and 2, and the
second probe used to produce Part 5, were both temporary Vitest files that drove the shipped
functions, and both have been deleted. No bot career was run (directive 21).

---

# Part 6: the blast radius of the two levers

Status: MEASUREMENT ONLY, third probe (2026-08-01). Nothing was changed. `partPricing.json` was
edited to real candidate values to run the guard suite and then restored byte for byte
(`git diff --stat` clean); the Vitest probe used for every number below has been deleted.

## 6.0 Summary, on one screen

The candidate: `baseCostYen.zonePanel` 6,000 to **30,000** ("x5"), and `baseCostYen.panels` 28,000
to some larger value.

| | `zonePanel` 6,000 to 30,000, alone | `panels` 28,000 to 150,000 |
|---|---|---|
| **Lemon threshold** | **no movement at all**, on any of 2,600 cars | entry 112 to 111 lemons of 700, everyday 38 to 34 of 800, enthusiast 24 to 19 of 900, flagship 0 to 0; 4 new lemons, 14 cured, 18 cars of 2,600 change status |
| **Repair bills on generated cars** | none | **none** |
| **Bodykits (12 SKUs on `aero`)** | none | **x5.36 across the board**; flagship race kit 75,600 to 405,000 |
| **Service-job payouts (3 templates)** | none | +12% to +84% depending on class and template, against a true cost that does not move |
| **Salvage** | zone panel resale **x5** (entry 24..240 becomes 126..1,260) | used bodykit resale x5.36; the `panels` scrap number moves but is unreachable in play |
| **Guard tests red** | **2** | **13**, in 5 files |

Three things the maintainer should take from this:

1. **The lemon threshold is not the risk.** `zonePanel` never touches it (both `stockReplacementPricesByClass` and `indexStockPartsByCarPartId` filter `zoneId == null`), and the `panels` move shifts it by at most 0.048 of a 0-1 factor and, on net, produces FEWER lemons, not more: 4 new against 14 cured. In the post-repair state a player actually sells from, there are zero factor-clause lemons before or after, at every candidate up to `panels` 300,000.
2. **The bodykits are the risk.** Twelve `aero`-slot SKUs price from `baseCostYen.panels` and ride it linearly. At `panels` 150,000 the everyday cosmetic FRP street body kit costs 31,200 against 12,500 for the everyday FRP RACE AERO kit that actually makes downforce. The shell price is doing double duty as a bodykit basis, and that is a content-schema defect, not a tuning one (6.5).
3. **`panels` cannot reach a C3-coherent value without turning a coherence probe red.** `balanceProbes.test.ts`'s donor invariant passes at `panels` 45,000 and fails at 55,000 and above, while C3 (Part 5.2) wants about 140,000. That conflict is real and has to be resolved before either lever moves (6.4, 6.6).

## 6.1 Method

Sample: 26 shipped models x 100 seeds = **2,600 generated cars**, `generateAuctionCarInstance` at
game year 1995 with symptoms and missing slots enabled, the same seed sequence for every candidate.
The probe **asserts** that the baseline re-priced catalogue reproduces the shipped `PARTS` prices and
the shipped `PARTS_TAXONOMY` weights exactly before measuring anything, and separately that
generation is bit-identical across all nine candidates (0 mismatches over 2,976 regenerations), so
every difference below is attributable to the price alone.

Nine candidates: shipped; `zonePanel` x5 alone; and `zonePanel` x5 with `panels` at 90k, 120k, 140k,
150k, 180k, 210k, 300k. Catalogue prices were recomputed with the shipped `resolvePartPriceYen` and
the taxonomy weights with a mirror of `data.ts`'s `stockReplacementPricesByClass`.

## 6.2 Part 1 of the brief: every consumer, traced and verified

`baseCostYen.zonePanel` reaches exactly three places. All 20 `zoneId`-carrying SKUs price from it and
nothing else does.

| Consumer | File | Live? | Moves with x5? |
|---|---|---|---|
| The 20 zone-panel SKU prices | `partPricing.ts:167` via `priceBasisPartId` | yes | x5 exactly |
| Parts-market shelf price of a zone panel | `PartsMarketScreen.vue:220-226` (the delist guard is `zoneId == null`, so zone panels ARE listed) | yes | x5 |
| Salvage on the panel `swapPanel` harvests back to inventory | `stagedWork.ts:329-339` then `usedPartSaleValueYen` | yes | x5 |
| `panelsRepairBillYen`'s panel-purchase term | `bodyPipeline.ts:441-444` | **no** | never fires |
| `stockReplacementPriceYenByClass` | `data.ts:99-105`, filters `zoneId == null` | n/a | excluded, confirmed |
| `indexStockPartsByCarPartId` | `context.ts:189-192`, filters `zoneId == null` | n/a | excluded, confirmed |
| `partFitsCar` | `parts.ts:73`, refuses any `zoneId`-carrying SKU | n/a | excluded |

The `panelMissing` question from the brief, settled: **no production code path sets it true.** Part
5.1 already ruled out every generation writer; this pass extends that to PLAYER actions. `planSwapPanel`
(`bodyPipeline.ts:578-591`) sets `panelMissing: false`, `improveZoneCarrierOneStep` only clears it, and
there is no strip stage that removes a panel: `planPipelineStage`'s `stripPrep` sets `finish: 3` and
touches nothing else. Repo-wide, the only `panelMissing: true` literals are in four test fixtures
(`CarDetailScreen.test.ts:2003`, `WorkshopViews.test.ts:204`, and two probes). So the one branch in
which a zone panel price enters a repair bill is unreachable from either direction.

`baseCostYen.panels` reaches more, and two of its four live roles have nothing to do with a bodyshell.

| Consumer | File | Live? | Effect |
|---|---|---|---|
| `stockReplacementPriceYenByClass.panels`, the weight in `costWeightedBandFactor` | `data.ts:118`, `bands.ts:289` | yes | the **lemon threshold** (`carCondition.ts:60-63`); measured in 6.3 |
| 12 bodykit SKUs on the `aero` slot (`frp-lightweight-panels`, `frp-sport-panel-kit`, `frp-carbon-panel-kit`, x4 classes) | `parts.json` `priceBasisPartId: "panels"` | yes | shelf price, install cost, used resale, and `installedPartsValueYen`'s aftermarket premium |
| The `panels` task in 3 service-job templates | `serviceJobs.ts:366-375` prices `planPartRepair` off the installed stock `panels` SKU | yes | payout; measured in 6.3 |
| Repair bill for `panels` on a car with no `zoneState` | `bands.ts:214-221` | probes only | real cars all carry `zoneState` (`auctions.ts:972`); the balance probes deliberately do not (`balanceProbes.ts:159-167`) |
| `scrapValueYen` for a `panels` instance | `bands.ts:129-137` | **no** | `panels` is `removable: false`, so no instance ever reaches inventory |
| Missing-slot replacement cost for `panels` | `bands.ts:222-224` | **no** | `missingSlotWeightByPart.panels` is 0 and `applyDerivedBodyBands` refills an empty carrier |
| Part-out yield (`stripAndSell`, `partedYieldYen`) | `plays.ts:233`, `balanceProbes.ts:566` | **no** | both gate on `removable` |

Consumers the brief asked about that turned out not to exist: **the machining term of the authenticity
formula reads no price at all** (`derivedStats.ts:153-160` returns 0 unconditionally, "because the
machining system does not exist"); there is no insurance, valuation or total-loss comparison anywhere
in `packages/sim`; and no story mission carries a body requirement (three name `body` only as a
`specialtyGroups` entry, which is a reputation tag, not a cost).

One consumer the brief did not list and that does move: **`installedPartsValueYen`**
(`marketValue.ts:228-243`) adds every non-stock installed part's `priceYen x retention` to a car's
value, so a fitted bodykit's contribution to sale value scales with `panels` exactly as its shelf
price does.

## 6.3 Part 2 of the brief: the measured deltas

### 6.3.1 The lemon threshold, as a distribution

The rule is `hasScrapOrMissingPart || costWeightedBandFactor <= 0.45` (`carCondition.ts:56-63`). Only
the second clause reads a price. Population 1 is the cars exactly as generated (flip-as-found).

Baseline over 2,600 cars: 1,046 lemons by the full rule, of which **174 by the factor clause alone**
(the rest are missing-slot cars); 227 cars carry a scrap part.

`zonePanel` 6,000 to 30,000, alone: **the factor is bit-identical on all 2,600 cars.** Zero delta,
zero flips, at every class. There is nothing further to report on this lever.

`panels` 28,000 to 150,000, per class:

| Class | n | factor p10/p50/p90 before | after | lemons(factor) | new | cured | delta p10/p50/p90 | max abs delta |
|---|---|---|---|---|---|---|---|---|
| entry | 700 | 0.4000 / 0.6343 / 0.8438 | 0.4000 / 0.6259 / 0.8126 | 112 to **111** | 4 | 5 | -0.0371 / -0.0122 / +0.0118 | 0.0483 |
| everyday | 800 | 0.5298 / 0.7199 / 0.8919 | 0.5334 / 0.7147 / 0.8686 | 38 to **34** | 0 | 4 | -0.0320 / -0.0083 / +0.0150 | 0.0477 |
| enthusiast | 900 | 0.5911 / 0.7798 / 0.9225 | 0.5961 / 0.7701 / 0.8987 | 24 to **19** | 0 | 5 | -0.0252 / -0.0079 / +0.0114 | 0.0467 |
| flagship | 200 | 0.7209 / 0.8472 / 0.9355 | 0.7192 / 0.8415 / 0.9198 | 0 to **0** | 0 | 0 | -0.0252 / -0.0070 / +0.0070 | 0.0475 |

**18 cars of 2,600 (0.69%) change lemon status, and the net is 10 fewer lemons, not more.** The delta
is two-sided by construction: raising the `panels` weight pulls the mean toward the panels band, which
helps a car whose body is better than its mechanicals and hurts one whose body is worse.

The whole `panels` sweep, entry class only (the only class with a meaningful count):

| `panels` | panels share of car weight | entry lemons(factor) | new | cured | max abs delta | entry cars within 0.02 of the line |
|---|---|---|---|---|---|---|
| 28,000 (shipped) | 2.15% | 112 | 0 | 0 | 0 | 28 |
| 90,000 | 6.59% | 111 | 3 | 4 | 0.0257 | 29 |
| 120,000 | 8.60% | 111 | 3 | 4 | 0.0373 | 31 |
| 140,000 | 9.89% | 111 | 3 | 4 | 0.0447 | 31 |
| 150,000 | 10.52% | 111 | 4 | 5 | 0.0483 | 31 |
| 180,000 | 12.36% | 112 | 6 | 6 | 0.0589 | 37 |
| 210,000 | 14.13% | 113 | 8 | 7 | 0.0690 | 39 |
| 300,000 | 19.04% | 109 | 8 | 11 | 0.0968 | 38 |

The count is flat because the threshold sits in a thin part of the distribution; what actually grows
is FRAGILITY, the number of cars sitting within 0.02 of the line (28 to 39 across the sweep).

**Population 2, the state a player actually sells from** (every non-body part lifted to `fine`, body
left as generated):

| `panels` | entry factor p10 | everyday p10 | enthusiast p10 | flagship p10 | lemons by the factor clause, any class |
|---|---|---|---|---|---|
| 28,000 (shipped) | 0.7712 | 0.7923 | 0.8015 | 0.8359 | **0** |
| 150,000 | 0.7408 | 0.7693 | 0.7806 | 0.8200 | **0** |
| 300,000 | 0.7083 | 0.7421 | 0.7614 | 0.8038 | **0** |

Nothing comes within 0.25 of the 0.45 line at any candidate. **The lemon rule is not exposed to this
lever in the state where it fires.**

### 6.3.2 Bodykits

The three FRP body kits per class carry `priceBasisPartId: "panels"` and the `aero` slot's default
grade ladder (1 / 1.3 / 2 / 3), so they are exactly `panels x classFactor x gradeFactor`.

| `panels` | entry street/sport/race | everyday | enthusiast | flagship |
|---|---|---|---|---|
| 28,000 (shipped) | 5,100 / 7,800 / 11,800 | 5,800 / 9,000 / 13,400 | 14,600 / 22,400 / 33,600 | 32,800 / 50,400 / 75,600 |
| 90,000 | 16,400 / 25,200 / 37,800 | 18,700 / 28,800 / 43,200 | 46,800 / 72,000 / 108,000 | 105,300 / 162,000 / 243,000 |
| 140,000 | 25,500 / 39,200 / 58,800 | 29,100 / 44,800 / 67,200 | 72,800 / 112,000 / 168,000 | 163,800 / 252,000 / 378,000 |
| 150,000 | 27,300 / 42,000 / 63,000 | 31,200 / 48,000 / 72,000 | 78,000 / 120,000 / 180,000 | 175,500 / 270,000 / 405,000 |

For contrast, the rest of the `aero` slot, which does not move (everyday class): stock 4,200, lip kit
(street) 5,400, GT wing (sport) 8,300, race aero 12,500, underglow 5,000, skirt and splitter kit
7,700, flat floor 11,500.

**At `panels` 150,000 an everyday cosmetic street body kit (31,200) costs 2.5x the everyday race aero
kit (12,500), and the race body kit (72,000) costs 5.8x it.** Six SKUs that make no downforce would
be the six most expensive things on the slot, by a wide margin. This is the single sharpest
consequence of the second lever and it is measured, not argued.

### 6.3.3 Repair bills on generated cars

Mean over the same 2,600 cars, at every one of the nine candidates:

| Class | mean `carCostToMintYen` | mean `carCostToBandYen` at the expectation band |
|---|---|---|
| entry | 66,511 | 45,959 |
| everyday | 59,055 | 32,400 |
| enthusiast | 95,799 | 48,382 |
| flagship | 133,625 | 49,028 |

**Identical to the yen at all nine candidates.** Every real car carries `zoneState`, so `panels`,
`paint` and `underbody` route through `bodyPartRepairBillYen` and never read a catalogue price; the
true cost by the pipeline route is the flat materials bill (1,900 fill-and-sand, 1,200 + 2,500 prime
and paint, 1,200 + 2,000 on the chassis) and moves with neither lever.

### 6.3.4 Service-job payouts

Three templates carry a `panels` task: `small-bodywork-touchup`, `put-her-in-a-ditch`,
`one-off-widebody`. `serviceJobCostBreakdown` prices the panels task off the installed stock `panels`
SKU, so the QUOTE moves with the lever while the player's actual cost (the body pipeline) does not.
Mean payout at `marginMin` (1.18), 200 cars per class:

| Template | Class | shipped | `zonePanel` x5 alone | `panels` 150,000 | change |
|---|---|---|---|---|---|
| small-bodywork-touchup | entry | 11,380 | 11,380 | 14,599 | +28% |
| small-bodywork-touchup | everyday | 9,397 | 9,397 | 11,882 | +26% |
| small-bodywork-touchup | enthusiast | 9,230 | 9,230 | 14,239 | +54% |
| small-bodywork-touchup | flagship | 8,680 | 8,680 | 16,001 | **+84%** |
| put-her-in-a-ditch | entry | 22,815 | 22,815 | 26,033 | +14% |
| put-her-in-a-ditch | flagship | 38,278 | 38,278 | 45,598 | +19% |
| one-off-widebody | entry | 40,404 | 40,404 | 45,640 | +13% |
| one-off-widebody | flagship | 112,957 | 112,957 | 133,104 | +18% |

The mean QUOTED task cost for `small-bodywork-touchup` goes 622 / 486 / 974 / 1,424 (entry to
flagship) at shipped, to 3,350 / 2,592 / 5,220 / 7,628 at `panels` 150,000. Read the other way, this
is a defect the lever partly FIXES: today the game quotes 486 yen of materials for an everyday panel
tidy-up whose real fill-and-sand tin costs 1,900, so the customer under-pays for the one input the
player actually buys. At 90,000 and above the quote clears the tin.

The 1.15x profitability invariant (`serviceJobPayout.test.ts`) holds at every candidate tested.

### 6.3.5 Salvage and scrap

The panel `swapPanel` harvests back into inventory, sold at `usedPartSaleValueYen`:

| Class | shipped panel, mint..poor resale | `zonePanel` x5 panel, mint..poor resale |
|---|---|---|
| entry | 800: 240 / 180 / 132 / 24 | 4,200: 1,260 / 945 / 693 / 126 |
| everyday | 1,000: 300 / 225 / 165 / 30 | 4,800: 1,440 / 1,080 / 792 / 144 |
| enthusiast | 2,400: 720 / 540 / 396 / 72 | 12,000: 3,600 / 2,700 / 1,980 / 360 |
| flagship | 5,400: 1,620 / 1,215 / 891 / 162 | 27,000: 8,100 / 6,075 / 4,455 / 810 |

Exactly x5, which is Part 5.3's net-cost column and needs no re-litigating. The scrap route is
unreachable for a zone panel twice over: `planSwapPanel` caps the harvested band at `poor` via
`bandForSeverity` (severity 3 maps to `poor`, never `scrap`), and `resolveScrapPart` refuses anything
that is not `scrap`.

The `panels`-slot scrap value (`scrapValueFraction` 0.05 x the shell price) moves from 195 / 225 / 560
/ 1,260 to 1,050 / 1,200 / 3,000 / 6,750 at `panels` 150,000, and is **dead in play**: `panels` is
`removable: false`, so no `panels` instance ever reaches inventory.

Used bodykit resale rides the bodykit price, so it moves x5.36 with `panels` 150,000.

## 6.4 Part 3 of the brief: what breaks

Baseline established first: the 31-file targeted set (1,005 tests) and a 9-file game-package set (234
tests) both pass green on the shipped values.

### 6.4.1 `zonePanel` 6,000 to 30,000 alone: 2 failures

| Test | File | Why |
|---|---|---|
| `partPricing.json matches its approved content exactly` | `packages/content/tests/economyApprovalGate.test.ts:1349` | the sha256 pin `1fa0f99b4fe2c86143cdd0f57ce00a28e6f82057a1fde97635e8e114ecb8fd7f`. Needs a re-pin with the recorded approval. |
| `a zonePanel-basis entry prices from the new basis, independent of its own carPartId base` | `packages/content/tests/partPricing.test.ts:46` | **two separate assertions fail.** Line 60 pins the literal 6,000 x `classFactors.everyday` = 960. Line 61 asserts the zone panel price is strictly LESS than the whole-slot `panels` price, and at 4,800 against 4,500 it is not. |

That second assertion matters more than the first. **Part 5.2's C3 incoherence is already encoded as a
guard test**, so `zonePanel` cannot cross `panels` without either raising `panels` or deliberately
retiring a guard. The minimum `panels` that satisfies the ordering is anything above 30,000.

Everything else holds: `economy.json` and `damagePatterns.json` hashes, the mission payout and budget
pin, the `advanceDay` golden master, `hashState`, `integrity.test.ts`'s 20-SKU zone-panel block, and
all 234 game-package tests.

### 6.4.2 `zonePanel` 30,000 plus `panels` 150,000: 13 failures in 5 files

| # | Test | File | Detail |
|---|---|---|---|
| 1 | `partPricing.json matches its approved content exactly` | `economyApprovalGate.test.ts:1349` | hash pin, re-pin required |
| 2 | `an entry without priceBasisPartId prices identically...` | `partPricing.test.ts:31` | line 43 pins the literal 28,000 |
| 3 | `a zonePanel-basis entry prices from the new basis...` | `partPricing.test.ts:46` | line 60 pins the literal 6,000 |
| 4 | `a scripted 30-day career reproduces an exact state hash` | `advanceDay.test.ts` | golden master. **Does NOT move on `zonePanel` alone**; it moves on `panels`. |
| 5 | `parting out the worst generatable car never beats repairing it` | `balanceProbes.test.ts:88` | `honda-city-e-aa: parted 29,425 > sensible repair 24,475 at bill ratio 0.46` |
| 6-13 | eight of nineteen story-mission satisfiability probes | `storyMissionProbes.test.ts` | the re-derived formula payout drifts below the pinned one |

The eight mission probes, measured. `probeCostYen = purchaseYen + repairYen + partsYen`, and the
probe's start car carries no `zoneState`, so raising `panels` raises the restoration bill inside
`marketValueYen` slightly faster than it raises the repair leg:

| Mission | pinned `payoutYen` | re-derived at `panels` 150,000 | drift |
|---|---|---|---|
| wont-strand-her | 125,000 | 123,000 | -1.60% |
| the-fleet-spare | 483,000 | 481,000 | -0.41% |
| the-column-clock | 999,000 | 996,000 | -0.30% |
| first-proper-car | 686,000 | 684,000 | -0.29% |
| the-showroom-standard | 703,000 | 701,000 | -0.28% |
| street-power-street-manners | 1,497,000 | 1,493,000 | -0.27% |
| low-and-loud | 1,161,000 | 1,158,000 | -0.26% |
| under-one-fifteen | 1,693,000 | 1,689,000 | -0.24% |

`four-wheels` and `make-it-pull` do not move. Note the knock-on: re-deriving these eight to green the
probes would then break `economyApprovalGate.test.ts`'s mission payout and budget-cap pin, which
passed at 150,000 precisely because the JSON literals were untouched. **It is a two-pin change, and
`budgetCapYen === payoutYen` must move with it.**

### 6.4.3 Where the donor invariant actually breaks

Bisected on `balanceProbes.test.ts` alone:

| `panels` | donor invariant | Honda City sensible flip margin against a constant 29,425 parted yield |
|---|---|---|
| 28,000 | PASS | above 29,425 |
| 45,000 | **PASS** | above 29,425 |
| 55,000 | FAIL | 24,430 |
| 65,000 | FAIL | 24,795 |
| 90,000 | FAIL | 24,585 |
| 150,000 | FAIL | 24,475 |

**The break is a cliff between 45,000 and 55,000, and the margin then flattens**, because
`enforceMaxBillFraction` caps the worst car's bill at 0.6 x clean value and the cap starts binding.

Two things must be said about this failure, and they point in opposite directions:

- It is a **probe-model artefact in the strict sense**: `buildUniformBandCar` deliberately synthesises
  no `zoneState` (`balanceProbes.ts:159-167`, whose own doc comment says a future change here "would
  move every probe figure that touches them; that is a real design question this file's own numbers
  must surface"). 6.3.3 measures that real generated cars' bills do not move by a single yen, and the
  four-play ranking gate (`plays.test.ts`, which measures the car a player would actually strip) stays
  green at every candidate.
- It is nonetheless **a red test on the shipped gate**, and the probe is measuring the only model in
  which `panels`'s catalogue price is a bodyshell price at all. Greening it means either re-basing the
  probe onto zone-model cars (a real piece of work with its own numbers to re-approve) or accepting a
  documented exception. It cannot be waved away.

### 6.4.4 What does not break

No content-schema bound or Zod refinement is violated: `baseCostYen`'s entries are
`z.number().int().positive()` with no ceiling and `zonePanel` is `.optional()`, so both values
validate. No literal panel or bodykit price is asserted anywhere in `packages/game`. Green at
`panels` 150,000: `coherenceValuation`, `stockCarValuationInvariant`, `valueModelProbes`,
`restorationPacing`, `generationCoherence`, `energyCalibration`, `serviceJobPayout`, `plays`,
`marketValue`, `valuation`, `bands`, `carCondition`, `selling`, `missions`, `style`, `authenticity`,
`jobs`, `parts`, `buyParts`, `catalogs`, `stagedWork`, `serviceJobs`, `tutorialProbe`, `hashState`,
`integrity`, `schemas`, and all nine game-package files (234 tests).

## 6.5 Part 4 of the brief: what `baseCostYen.panels` should become

### 6.5.1 The ratio

Today `panels / zonePanel` is 28,000 / 6,000 = **4.667**, which puts five zone panels at 103% to 111%
of the shell (Part 5.2). The right ratio is the one already shipped, and the reason is that a
bodyshell is not five bolt-on panels: it is those five plus a roof, floor, sills and structure that
have no zone of their own, so five panels landing a little OVER the shell price is already generous
to the panels and a ratio below 5 is defensible on its own terms. There is no evidence anywhere in
this document for moving the ratio, so the recommendation is to preserve it: **`panels` = 4.667 x
`zonePanel` = 140,000**, which reproduces 107% exactly, the mid-point of today's 103-111% spread.

### 6.5.2 Three candidates, measured

| | **A: 90,000** (ratio 3.0) | **B: 140,000** (ratio 4.667, today's) | **C: 150,000** (ratio 5.0) |
|---|---|---|---|
| Five panels as a share of the shell | 167% | **107%** | 100% |
| Per-class shell price | 12,600 / 14,400 / 36,000 / 81,000 | 19,600 / 22,400 / 56,000 / 126,000 | 21,000 / 24,000 / 60,000 / 135,000 |
| Lemon: entry lemons of 700 | 112 to 111 (3 new, 4 cured) | 112 to 111 (3 new, 4 cured) | 112 to 111 (4 new, 5 cured) |
| Lemon: everyday of 800 | 38 to **38** (0 new, 0 cured) | 38 to 34 (0 new, 4 cured) | 38 to 34 (0 new, 4 cured) |
| Lemon: enthusiast of 900 | 24 to 22 | 24 to 19 | 24 to 19 |
| Lemon: max abs delta, any car | **0.0257** | 0.0447 | 0.0483 |
| Lemon: entry cars within 0.02 of the line | 29 (from 28) | 31 | 31 |
| `panels` share of car weight | 6.59% | 9.89% | 10.52% |
| Bodykit, everyday street/sport/race | 18,700 / 28,800 / 43,200 | 29,100 / 44,800 / 67,200 | 31,200 / 48,000 / 72,000 |
| Bodykit, flagship race | 243,000 | 378,000 | 405,000 |
| Street body kit against the everyday race aero kit (12,500) | 1.5x | 2.3x | 2.5x |
| `small-bodywork-touchup` mean payout, flagship | 12,400 (+43%) | 15,401 (+77%) | 16,001 (+84%) |
| Guard tests red | 13 | 13 | 13 |
| Donor invariant | FAIL | FAIL | FAIL |
| C3 (Part 5.2) discharged? | no, five panels still 1.67x the shell | **yes** | yes, and arguably over-corrected |

**A (90,000)** is the mildest row on every measured axis and the only one that leaves the everyday
lemon count untouched, but it does not discharge C3: it converts "one bonnet costs more than the
shell" into "five bonnets cost 1.67 shells", which is a smaller absurdity, not the absence of one. It
still turns the donor probe red.

**B (140,000)** is the recommendation. It preserves the shipped ratio exactly, so nothing about what
a shell MEANS changes, and its lemon movement (18 cars of 2,600, net 9 fewer lemons, max shift 0.045)
is inside the noise of the number it feeds.

**C (150,000)** buys a rounder story ("the shell is its five panels") for a marginally larger lemon
shift and a marginally worse bodykit blowout. If the maintainer prefers a round number over the
preserved ratio, the measured cost of choosing it over B is one extra new lemon and one extra cured
one in 2,600 cars.

None of the three escapes the two structural problems below, and neither should be treated as
tuning.

## 6.6 The two things this measurement says are not tuning problems

**1. `baseCostYen.panels` is doing two unrelated jobs, and the bodykit job should be split off.**
The bodyshell reference and the price basis for twelve aftermarket FRP kits are the same number today,
so a shell repricing drags every bodykit with it by construction and the kits end up outpricing the
race aero on the same slot. The fix is the move already made once, for zone panels: add an optional
`bodyKit` key to `ByPriceBasisIdPriceSchema` (`partPricing.ts:56-60`) and point the twelve SKUs'
`priceBasisPartId` at it. That is one optional schema field, one content key and twelve one-word edits,
and it makes C3 free: `panels` then moves for shell reasons alone and the bodykit ladder is priced on
its own merits. It also removes the largest single delta in this whole document. Part 4.1 of this
analysis already wants those six FRP kits re-addressed off the `aero` slot entirely; if that lands
first, this is subsumed by it.

**2. The donor coherence probe and C3 cannot both be satisfied while the probe has no `zoneState`.**
C3 needs `panels` around 140,000; the probe goes red above roughly 50,000. Since real cars' bills do
not move at all (6.3.3), the probe is measuring a pricing model that no longer describes the game for
these three slots. This is a decision for the maintainer and it belongs BEFORE either lever moves:
re-base the donor probe onto zone-model cars, or record a documented exception for the `panels` row.

## 6.7 The approvals a change would need, listed

For directive 22, if the maintainer decides to proceed, the levers by name:

1. `ECONOMY.baseCostYen.zonePanel`: 6,000 to 30,000.
2. `ECONOMY.baseCostYen.panels`: 28,000 to the chosen value (recommended 140,000).
3. Re-pin `economyApprovalGate.test.ts:1349`, the `partPricing.json` sha256.
4. `partPricing.test.ts:43` and `:60`: the two literal bases, updated to the new values. The `:61`
   ordering assertion survives unchanged and should be kept, since it is C3 in test form.
5. `advanceDay.test.ts`'s golden-master hash.
6. Eight `storyMissions.json` `payoutYen`/`budgetCapYen` pairs re-derived, plus a re-pin of
   `economyApprovalGate.test.ts`'s mission payout table.
7. A ruling on `balanceProbes.test.ts`'s donor invariant.

`paint` (40,000) and `underbody` (24,000) are implicated by nothing measured here and should not move
in the same change.

## What was NOT changed to produce Part 6

No shipped code, no test, no lever left changed. `partPricing.json` was edited to real candidate
values so the guard suite could be run against them, then restored to the shipped 28,000 / 6,000
and verified clean with `git diff`. The measurement probe was a temporary Vitest file and has been
deleted. No bot career was run (directive 21).

# Part 7: do the Sprint 160 gate failures describe real generated cars?

Status: MEASUREMENT ONLY. No shipped code, content, lever or test was changed to produce it. No
fix is proposed here.

## 7.0 The four verdicts

Sprint 160 re-based `balanceProbes.test.ts`'s donor probe and `plays.ts`'s `restoreToBand` onto cars
carrying `zoneState` and five gates went red. All five claims are made on `buildUniformBandCar`
output: one synthetic car per model, every slot at one band, every zone at one severity. Directive
22 forbids reading a worst-case construction as a typical case, so each claim was re-asked against
**10,400 real lots** from `generateAuctionCarInstance`.

| # | Claim, as the red gate states it | Verdict on real cars | The number |
|---|---|---|---|
| 1 | Parting out beats repairing to expectation | **Artefact of the synthetic probe car** | 0 of 10,400 lots. Stripping loses ¥531,789 at p50 and ¥137,315 at p90; its BEST case anywhere on the roster still loses ¥3,745 |
| 2 | Repair-to-mint out-earns repair-to-expectation | **Real defect, and it affects typical cars** | 18.07% of entry lots and 54.84% of everyday lots, where `beyondDiscount` is 0.4 and 0.8 and the inversion must never happen. Not the mechanism Sprint 160 named |
| 3 | Stripping pays better per labour point than fixing | **Artefact, bar a four-lot tail** | 0.04% of lots (4 of 10,400), all entry. Strip is ¥-4,700/pt at p50 against repair's ¥+2,919/pt |
| 4 | The cheapest entry car strips as found for a profit | **Real, but confined to one model** | 0.93% of lots overall; 24.0% of `honda-city-e-aa` lots and 1 of 400 `nissan-sunny-b12`. Zero everywhere else. Never the best play on any of them |

And on the two mechanisms Sprint 160 offered as the cause:

| Mechanism | Verdict |
|---|---|
| "A body restoration is materials-only money" | **Half true, and the wrong half.** It is materials-only, but it is not cheap: a flat ¥22,907 mean to mint, up to a ¥31,200 ceiling, identical on a kei and on a GT-R. On entry and everyday cars it is about 7x DEARER than the generic per-part path it replaced. What makes over-restoring pay is 7.3 below, not the price level |
| "The Law 2 softening pass has finer granularity on the zone model" | **Probe-only by construction.** Every real generated car has carried a `zoneState` since the zone model landed, so real cars have always taken the fine-grained path. Sprint 160 changed nothing reachable from `generateAuctionCarInstance` |
| The re-base itself (`computeModelBalanceProbe`, `restoreToBand`) | **Faithful. The failures are revealed, not introduced.** The old route both undercharged AND took no value for what it charged. See 7.6 |

## 7.1 Method

Sample: **10,400 lots**, all 26 shipped models x 400 seeds, `generateAuctionCarInstance(model, id,
createRng(seed), CONTEXT, 1995)` with symptoms and missing slots enabled, so every lot carries its
own rolled history, damage pattern, symptom, per-slot bands and zone severities.

The economics are the shipped ones, driven rather than re-derived. `plays.ts` was copied verbatim
into a throwaway module with `restoreToBand`, `stripAndSell` and `resultFor` exported and nothing
else altered, so the four plays are priced by the same code the red gate prices them with, on a
real car instead of `buildRoughProbeCar`. Everything else is a direct call: `marketValueYen`,
`sensibleRepairTargetBand`, `carCostToMintYen`, `carCostToBandYen`, `costToBandYen`,
`bodyPartRepairBillYen`, `usedPartSaleValueYen`, `planPipelineStage`, `planPaintStage`,
`planSwapPanel`, `zonePanelPart`, `expectationForCar`, `enforceMaxBillFraction`,
`spendDamageBudget`. Buy price is the reserve, `guide x AUCTION_RESERVE_PRICE_FRACTION`, identical
across all four plays exactly as `computeModelPlayRanking` does it.

Both throwaway files have been deleted. No lever, no test and no shipped line was changed. No bot
career was run (directive 21).

## 7.2 Claim 1: part-out versus repair-to-expectation

Same car, same buy price, net profit against net profit. `strip best` is the better of
`strip-reconditioned` and `strip-as-found`.

| class | n | strip wins | delta p50 | delta p90 | delta BEST case | expProfit p50 | stripBest p50 |
|---|---|---|---|---|---|---|---|
| entry | 2,800 | **0.00%** | -157,557 | -39,798 | -3,745 | 82,081 | -75,627 |
| everyday | 3,200 | **0.00%** | -444,729 | -383,716 | -274,668 | 208,177 | -239,338 |
| enthusiast | 3,600 | **0.00%** | -851,794 | -580,291 | -210,630 | 411,074 | -444,228 |
| flagship | 800 | **0.00%** | -2,959,476 | -2,517,763 | -2,405,633 | 1,346,369 | -1,605,567 |
| ALL | 10,400 | **0.00%** | -531,789 | -137,315 | -3,745 | 244,822 | -278,740 |

Not a marginal pass. The single most strip-friendly lot in 10,400 still loses ¥3,745 by stripping,
and the median lot loses half a million yen. The teardown haircut (`usedPartSaleFraction` 0.3 x
`resaleBandFactors`) plus a 5% shell scrap simply does not recover a reserve-price purchase.

**One caveat about the gate that failed, not about the economy.** The donor gate compares
`partedYieldOfWorstCaseYen`, a GROSS yield with no purchase deducted, computed on
`buildWorstCaseRawCar`, against `sensibleFlipMarginYen`, a NET margin computed on
`buildRoughProbeCar`. Those are two different cars and two different accounting bases. Replicated
in that framing on real lots:

| class | n | gross parted yield > net repair margin | gross yield p50 | net repair margin p50 |
|---|---|---|---|---|
| entry | 2,800 | 5.07% | 35,501 | 82,081 |
| everyday | 3,200 | 0.00% | 60,992 | 208,177 |
| enthusiast | 3,600 | 0.00% | 150,779 | 411,074 |
| flagship | 800 | 0.00% | 391,839 | 1,346,369 |
| ALL | 10,400 | **1.37%** | 66,956 | 244,822 |

Even reading the gate on its own terms, real cars cross it on 1.37% of lots and only at the entry
tier. The synthetic car reads 100%.

## 7.3 Claim 2: repair-to-mint versus repair-to-expectation. This one is real

| class | n | `beyondDiscount` | mint wins | delta p50 | delta p90 | delta max |
|---|---|---|---|---|---|---|
| entry | 2,800 | 0.4 | **18.07%** | -6,604 | +2,646 | +10,284 |
| everyday | 3,200 | 0.8 | **54.84%** | +884 | +8,824 | +23,196 |
| enthusiast | 3,600 | 1.2 | 74.69% | +7,264 | +23,320 | +45,924 |
| flagship | 800 | 1.3 | 55.75% | +2,791 | +32,929 | +55,509 |
| ALL | 10,400 | | 51.88% | +468 | +17,996 | +55,509 |

Enthusiast and flagship carry a `beyondDiscount` above 1, so over-restoring is DESIGNED to pay
there and the gate already exempts them. Entry and everyday carry 0.4 and 0.8: a yen past the
expectation band must return less than a yen, so mint must never win. It wins on nearly one entry
lot in five and on a MAJORITY of everyday lots. That is a typical case, not a tail.

The value model itself is behaving exactly as written: extra revenue tracks
`beyondDiscount x billAbove` to within rounding.

| class | extra cost, exp to mint | extra revenue | bill left after repairing to exp | `beyondDiscount` x that bill |
|---|---|---|---|---|
| entry | 22,623 | 16,191 | 40,706 | 16,282 |
| everyday | 30,079 | 30,925 | 38,940 | 31,152 |
| enthusiast | 59,157 | 67,151 | 56,755 | 68,105 |
| flagship | 112,860 | 115,970 | 90,925 | 118,202 |

So the fault is not in the discount. It is in the bill the discount is applied to, and 7.4 is why.

## 7.4 The cause: the body bill measures a threshold, not a distance

`panelsRepairBillYen`, `paintRepairBillYen` and `underbodyRepairBillYen` charge a flat per-zone
materials price gated on `axis > severityThresholdForBand(target)`. A zone one rung above the
target and a zone three rungs above it are quoted the same money. The generic per-part path
(`costToBandYen`) is a distance, and its own doc comment states the contract that
`marketValueYen` splits the bill on: `cost(b -> t) + cost(t -> mint) === cost(b -> mint)`. The
pipeline bill does not obey it.

| class | body bill, as found to expectation | body bill of that SAME car once repaired to expectation | body bill, as found straight to mint | split gap (col2+col3-col4) | gap p90 | gap > 0 |
|---|---|---|---|---|---|---|
| entry | 20,456 | 26,979 | 26,943 | **20,491** | 29,300 | 100.00% |
| everyday | 12,739 | 23,695 | 23,688 | **12,747** | 19,900 | 99.00% |
| enthusiast | 8,648 | 20,230 | 20,231 | **8,647** | 14,300 | 96.14% |
| flagship | 6,266 | 17,697 | 17,697 | **6,266** | 12,500 | 89.38% |
| ALL | 12,903 | 22,919 | 22,907 | **12,914** | 23,600 | 97.54% |

Read the entry row as a sentence: **you pay ¥20,456 in body materials to take the shell from as
found to `fine`, and the market's assessment of what that shell still owes to reach mint moves from
¥26,943 to ¥26,979. It does not fall. It rises by ¥36.** Every zone you just lifted from severity 3
to severity 1 is still "above the target", so it is still quoted the whole tin of filler, the whole
tin of primer and the whole tin of paint.

The player-facing consequence is a return above 1 on the beyond-expectation spend regardless of
what `beyondDiscount` says:

| class | extra body money, expectation to mint | value that money releases (`beyondDiscount` x residual body bill) | effective return |
|---|---|---|---|
| entry | 6,487 | 10,792 | **1.66x** at a 0.4 discount |
| everyday | 10,949 | 18,956 | **1.73x** at a 0.8 discount |
| enthusiast | 11,583 | 24,276 | 2.10x at a 1.2 discount |
| flagship | 11,431 | 23,006 | 2.01x at a 1.3 discount |

Removing exactly this over-credit and nothing else (subtract `beyondDiscount x split gap` from each
lot's mint-versus-expectation delta) accounts for the whole of the inversion on the two tiers where
it is illegal:

| class | mint wins, measured | mint wins with the split gap removed |
|---|---|---|
| entry | 18.07% | **0.00%** |
| everyday | 54.84% | **0.00%** |
| enthusiast | 74.69% | 41.67% (legal, `beyondDiscount` 1.2) |
| flagship | 55.75% | 39.13% (legal, `beyondDiscount` 1.3) |
| ALL | 51.88% | 17.43% |

This is live on real cars today and owes nothing to Sprint 159 or 160. `carCostToBandYen` has
routed the three carriers through `bodyPartRepairBillYen` since the zone model landed. The re-base
is what let a probe see it.

## 7.5 Claims 3 and 4

**Yen per labour point.** The strip plays are not merely worse, they are negative.

| class | n | strip wins | strip p50 | repair p50 | strip p90 | repair p90 |
|---|---|---|---|---|---|---|
| entry | 2,800 | 0.14% | -1,073 | +463 | -79 | +5,354 |
| everyday | 3,200 | 0.00% | -4,456 | +2,031 | -2,330 | +18,445 |
| enthusiast | 3,600 | 0.00% | -8,671 | +7,649 | -4,109 | +59,551 |
| flagship | 800 | 0.00% | -28,440 | +46,683 | -24,806 | +289,178 |
| ALL | 10,400 | **0.04%** | -4,700 | +2,919 | -601 | +42,027 |

**The floor claim.** Stripping as found for a positive profit, per class and then per model:

| class | n | asFound > 0 | asFound p50 | asFound best | reconditioned > 0 |
|---|---|---|---|---|---|
| entry | 2,800 | 3.46% | -76,552 | +15,881 | 4.04% |
| everyday | 3,200 | 0.00% | -240,290 | -140,977 | 0.00% |
| enthusiast | 3,600 | 0.00% | -444,610 | -37,237 | 0.00% |
| flagship | 800 | 0.00% | -1,612,049 | -1,267,965 | 0.00% |
| ALL | 10,400 | **0.93%** | -280,056 | +15,881 | 1.09% |

| model | class | asFound > 0 | mint wins | strip wins |
|---|---|---|---|---|
| `honda-city-e-aa` | entry | **24.00%** | 22.50% | 0.00% |
| `nissan-sunny-b12` | entry | 0.25% | 20.75% | 0.00% |
| every other model | | 0.00% | see 7.3 | 0.00% |

So the gate is catching something real, on the single cheapest car in the game, on about a quarter
of its lots. It is not catching a strategy: the same lots pay more to fix on 100% of occasions.
The `honda-city-e-aa` median repair-to-expectation profit is ¥30,441, against ¥15,881 for the best
strip-as-found result seen anywhere on the entry tier.

## 7.6 Sanity-check of the re-base itself

**The new route is internally consistent.** `restoreToBand` charges `bodyPartRepairBillYen` at its
target and then applies `zoneStatesRepairedToBand` at the same target. Measured on every one of the
10,400 lots: the repaired car's remaining body bill at its own target is **zero on 100.00%** of
lots, at both the expectation band and mint. Money and state describe the same work.

**The old route was wrong in two directions at once, which is why nothing caught it.** Before the
re-base, `restoreToBand` priced the three carriers through the generic per-part formula and wrote
their bands directly, leaving `zoneState` untouched. On a car that actually has a `zoneState`, that
means:

- it UNDERCHARGED. The generic charge against the bodyshell/paint/underbody SKU prices is a small
  fraction of the pipeline bill on the two cheap tiers;
- and it took nothing for the money. `carCostToBandYen` reads `zoneState` for these three parts, not
  the written band, so a car "repaired" that way still owes the entire body bill and its value does
  not move.

| class | pipeline bill charged now, to expectation | generic charge the old route made | value the old route produced | value the new route produces | value the old route left on the table |
|---|---|---|---|---|---|
| entry | 20,456 | 3,561 | 230,591 | 248,969 | **18,378** |
| everyday | 12,739 | 3,413 | 568,260 | 574,620 | 6,360 |
| enthusiast | 8,648 | 7,424 | 1,204,493 | 1,205,359 | 866 |
| flagship | 6,266 | 14,553 | 3,312,026 | 3,312,026 | 0 |

The old route was only ever invoked on cars with NO `zoneState`, where both errors are silent
because `carCostToBandYen` takes the same generic branch. That is precisely the pricing model no
real car uses. **The re-base is faithful and the five failures are revealed, not introduced.**

**Where the new route still disagrees with what the game charges a player.** Three gaps, all
pre-existing contracts rather than Sprint 160 changes, listed because claim 2 rests on the money
being right:

| gap | measured |
|---|---|
| The closed-form bill is not the cheapest live pipeline route. `paintRepairBillYen` quotes prime + paint (¥3,700) for any zone above target, but a zone at finish 1 reaching mint needs only a polish (¥800), while a zone at finish 3 reaching mint needs prime + paint + polish (¥4,500) and is undercharged by ¥800 | Walking every zone through `planPipelineStage`/`planPaintStage`/`planSwapPanel` at full capability: the live route is CHEAPER on 92.08% of lots and dearer on 7.92%. Mean live-minus-quoted: entry -3,794, everyday -8,438, enthusiast -8,653, flagship -8,455 |
| The bill prices no capability. `planPaintStage` reaches finish 1 with the body line unlocked and finish 0 needs `fullCapability` (tier 3 body tools, or the line hired) | A mint body is unreachable for a tier-1 or tier-2 shop, yet `repair-to-mint` prices and sells one on every lot. The play the gate ranks cannot be performed by the shop the probe assumes |
| The bill prices no labour, by its own contract (beat and weld are labour and never yen) | `restoreToBand` returns body labour of 0 on every lot. The live workshop charges `laborUnits x energyPerBandStepByToolTier[tier]` per stage. This understates both repair plays equally, so it moves `yenPerLaborPoint` (claim 3) and not `profitYen` |

## 7.7 The body bill on real cars, for the record

Not near-free, and flat. The same materials bill lands on a ¥300,000 kei and a ¥5,000,000 flagship.

| class | n | bill to mint, mean | bill to mint, p90 | generic path to mint, mean | live walk to mint, mean | bill to expectation, mean | a zone needs a panel | `panels` band = scrap |
|---|---|---|---|---|---|---|---|---|
| entry | 2,800 | 26,943 | 31,200 | 3,561 | 23,149 | 20,456 | 3.25% | 3.25% |
| everyday | 3,200 | 23,688 | 29,300 | 3,413 | 15,249 | 12,739 | 0.88% | 0.88% |
| enthusiast | 3,600 | 20,231 | 25,500 | 7,424 | 11,579 | 8,648 | 0.22% | 0.22% |
| flagship | 800 | 17,697 | 23,600 | 14,553 | 9,242 | 6,266 | 0.00% | 0.00% |
| ALL | 10,400 | 22,907 | 29,300 | 5,698 | 15,644 | 12,903 | 1.22% | 1.22% |

The ceiling is ¥31,200 (5 zones x ¥1,900 filler + 5 zones x ¥3,700 prime and paint + ¥3,200 chassis
prime and underseal), and the mean entry car sits at 86% of it. The generic per-part path it
replaced scaled with class, from ¥3,561 at entry to ¥14,553 at flagship; the pipeline is flat and
runs slightly WORSE on better cars because they roll kinder zone severities. On entry the pipeline
is 7.6x the generic charge, on everyday 6.9x, on enthusiast 2.7x, and on flagship the two nearly
meet at 1.2x.

Sprint 159's two new states are as rare as intended and do not drive any of this: a panel needs
replacing on 1.22% of lots overall and never on a flagship.

## 7.8 The probe A/B, isolating what Sprint 160 moved

Sprint 160's diff touches `balanceProbes.ts`, `plays.ts`, one new pure function in
`bodyPipeline.ts` (`zoneStatesRepairedToBand`, called only by the two probes), an export in
`stagedWork.ts`, `gameStore.ts`'s reading of it, and a price-neutral `bodyKit` basis. **Nothing on
that list is reachable from `generateAuctionCarInstance`**, so no real car's guide value moved. The
Law 2 softening granularity difference the sprint reports is entirely the probe car acquiring a
`zoneState` it never had.

Rebuilding both probe cars side by side, same seed, same guards:

| model | class | guide, no `zoneState` (old probe) | guide, zone-derived (new probe) | body bill to mint, old | body bill to mint, new |
|---|---|---|---|---|---|
| `honda-city-e-aa` | entry | 37,400 | 34,978 | 3,870 | 18,500 |
| `suzuki-wagon-r-ct21s` | entry | 112,400 | 75,710 | 3,870 | 31,200 |
| `toyota-carina-at150` | entry | 127,400 | 90,710 | 3,870 | 31,200 |
| `nissan-sunny-b12` | entry | 52,400 | 38,265 | 3,870 | 28,000 |
| `honda-civic-sir2-eg6` | everyday | 411,488 | 375,926 | 4,410 | 31,200 |
| `toyota-sprinter-trueno-ae86` | enthusiast | 459,052 | 432,476 | 11,040 | 31,200 |
| `nissan-skyline-gtr-bnr32` | flagship | 2,114,061 | 2,105,793 | 24,840 | 31,200 |

The `honda-city-e-aa` guide value drop of ¥2,422 that Sprint 160 attributes to softening granularity
is dwarfed by the same car's body bill going from ¥3,870 to ¥18,500 on the pricing path alone. Both
are properties of the probe. Neither reaches a lot a player can buy.

## 7.9 What was NOT changed to produce Part 7

No shipped code, no content, no lever, no test. The two throwaway files (a verbatim `plays.ts` copy
with three internals exported, and the probe that drove it) were created under
`packages/sim/tests/`, run once each, and deleted. `git status` is unchanged apart from this
document. No bot career was run.
