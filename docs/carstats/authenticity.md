# Authenticity

What the number is made of, exactly as the shipped code computes it. Where this document and a
design doc disagree, this one follows the code and the disagreement is written up under
[Findings](#findings).

Every figure below marked **measured** was produced by running the shipped sim against shipped
content. Figures marked **read** were taken off the source or the content JSON without executing
it.

---

## 1. The headline formula

`authenticityPercentOf` in `packages/sim/src/derivedStats.ts`:

    stockness    = sum(weight_s * isStock(s)) / sum(weight_s)      over every slot s
    raw          = 100 * stockness - machiningCost(car)
    authenticity = round(clamp(raw * conditionFactor, 0, 100))

with, in the same file:

- `stocknessOf(car, model, partsById, partsTaxonomy)` supplying `stockness`,
- `machiningCost(car)` supplying the machining term, and
- `weightedBandFactorForStat(car, model, 'authenticity', partsTaxonomy, economy)` supplying
  `conditionFactor`.

`computeDerivedStats` (same file) calls `authenticityPercentOf` whole and returns it unchanged.
Authenticity is one of the four stats that never enter that function's per-part accumulation loop;
only `power` does.

`weight_s` is the taxonomy's own `statWeights.authenticity` column, and it is the ONLY per-slot
number in the formula. Both halves read it: `stocknessOf` weights the originality sum with it, and
`weightedBandFactorForStat` weights the condition mean with it. A slot weighted 0 therefore drops
out of both at once, and neither its grade nor its condition can touch the stat.

---

## 2. In plain language

**Authenticity is how much of the car is still the car the factory built, discounted by how well
that surviving original material has been looked after.**

A player recognises it as: how far is this from being the real thing? Two entirely separate ways to
lose it, and both are charged. Bolt something aftermarket on, and the car stops being original,
whether the new part is beautiful or not. Let the original parts rot, and it stops being the real
thing in a second sense: a numbers-matching car with a ruined shell has kept its identity and lost
its substance. An all-stock, all-mint car reads exactly 100, and that identity is structural rather
than tuned: both factors are exactly 1 there and the machining term is 0.

---

## 3. Every input

### 3.1 The per-slot weight column (per-slot, global, content)

`packages/content/data/parts-taxonomy.json`, key `statWeights.authenticity`, one value per slot.
All 29 slots carry the key and the column sums to exactly **100** (measured; also pinned by
`packages/sim/tests/authenticity.test.ts`). The whole table, read from the content:

| slot | weight | has a non-stock SKU? |
| --- | ---: | --- |
| `block` | 18 | yes |
| `panels` | 11 | yes |
| `paint` | 11 | **no** |
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
| `chassis` | 1 | yes (but unfittable: see finding F3) |
| `dampers` | 1 | yes |
| `steering` | 1 | yes |
| `brakeCalipersLines` | 1 | yes |
| `underbody` | 1 | yes |
| `dashGauges` | 1 | yes |
| `fuelSystem` | 0 | yes |
| `cooling` | 0 | yes |
| `clutch` | 0 | yes |
| `driveline` | 0 | yes |
| `antiRollBars` | 0 | yes |
| `brakePadsDiscs` | 0 | yes |
| `tyres` | 0 | yes |

22 slots carry weight; 7 carry zero. The "has a non-stock SKU" column is measured by asking
`SimContext.aftermarketPartByCarPartId` for each slot at each of the four fitment classes: `paint`
is the only slot with no aftermarket ladder, and it is missing one at **all four** classes (`entry`,
`everyday`, `enthusiast`, `flagship`).

### 3.2 Stockness: which SKU is fitted (per-part, per-slot)

`stocknessOf`. For each taxonomy entry with a non-zero authenticity weight:

- **Skip entirely** when the slot is empty AND `isPartMissing` is false. That is exactly one case
  in shipped content: `forcedInduction` on a car whose `spec.aspiration` is `NA`. The slot leaves
  BOTH sums, so the denominator becomes 97 rather than 100 and the other slots share the whole
  scale between them.
- Otherwise **add the weight to the denominator**, and add it to the numerator only when the
  fitted SKU resolves in the catalogue and its `grade` is exactly `'stock'`.

Three states therefore count as not-original, and they are indistinguishable to this half of the
formula:

1. an aftermarket SKU is fitted (`grade` of `street`, `sport` or `race`),
2. the slot is genuinely empty (`isPartMissing` true: a stolen wheel, a gutted turbo on a
   factory-turbo car),
3. the fitted `partId` does not resolve in the catalogue at all.

`grade` is the whole originality signal. There is no second per-part authenticity field; parts
carry `statModifiers.style` and `statModifiers.powerFraction`, and nothing else that reaches this
stat.

Returns 1 when no slot on the car carries any authenticity weight, guarding the division.

### 3.3 The condition factor (per-part band, global curve)

`weightedBandFactorForStat(..., 'authenticity', ...)`, which is `weightedBandFactor` over the same
weight column, on the value-side band curve `economy.bands.bandFactors` (read):

| band | factor |
| --- | ---: |
| `mint` | 1.00 |
| `fine` | 0.85 |
| `worn` | 0.65 |
| `poor` | 0.40 |
| `scrap` | 0.15 |

A **missing** part scores **0**, which is below `scrap`. A legitimately-absent slot is skipped, as
above. This is the sharp value-side curve, not the far gentler
`statFormulas.condition.bandFactor` curves that the four physical dials run on; those never reach
authenticity.

The factor multiplies the WHOLE raw figure, so condition scales originality rather than being
subtracted from it. A half-original car in poor order is worse than either fault alone, by
construction.

### 3.4 The machining term (per-car)

`machiningCost(car)` in the same file. **It returns literal `0` for every car, unconditionally.**
The body is a `void car` and a `return 0`; the parameter is deliberately unread. Verified by
reading the source and by measuring it against every shipped car. No machining operation exists to
apply and `CarInstance` records none, so the term is honestly zero rather than approximated. See
finding F1.

### 3.5 The rounding and the clamps (global)

`Math.round` (half away from zero on positive values) after `clamp(raw * conditionFactor, 0, 100)`.
Both clamp arms are currently unreachable: `raw` is `100 * stockness` with `stockness` in `[0, 1]`
and the machining term at 0, and `conditionFactor` is in `[0, 1]`, so the product already lies in
`[0, 100]`. See finding F2.

### 3.6 The zone model, and the one indirect input

`panels`, `paint` and `underbody` are body value carriers. On a car with `zoneState`,
`applyDerivedBodyBands` (`packages/sim/src/bodyPipeline.ts`) is the single writer of their BAND,
derived from the six zones. It writes the band and nothing else, so whatever SKU is fitted survives
every re-derivation.

That gives authenticity one genuinely indirect input. Fitting a body kit to `panels` runs
`refitCarrierZoneStates`, which puts all five panel zones through `planSwapPanel`: metal resets to
the fitted kit's own band, surface resets to 0, and finish resets to `BARE_FINISH` (3). The `paint`
band then re-derives off that worst finish and lands on `poor`. **So a body kit costs authenticity
twice**: the 11 stockness points of `panels`, plus a condition hit on `paint` until the car is
painted again. Measured on a pristine zone-model car: 100 before, **83** after a mint sport body
kit, not the 89 the stockness loss alone would give.

`underbody`'s carrier covers the chassis zone alone; `paint`'s carrier covers no zone, so changing
what is fitted there would move nothing (and nothing can be fitted there anyway: finding F1a).

### 3.7 The naturally aspirated denominator (per-car)

A car whose `spec.aspiration` is `NA` (`hasForcedInduction` in `packages/sim/src/bands.ts`, which
reads that field and nothing else) has its `forcedInduction` slot skipped by both sums, so every
other slot is worth slightly more. Measured on a shipped NA model against the same swap on a
shipped turbo model:

| modification | turbo car (denominator 100) | NA car (denominator 97) |
| --- | ---: | ---: |
| aftermarket `block` | 82 | 81 |
| aftermarket `panels` | 89 | 89 |
| aftermarket `aero` | 90 | 90 |
| aftermarket `rims` | 93 | 93 |

Miniscule but real: the block swap differs by a whole point, the others round to the same figure.

### 3.8 What generation puts on a car before the player touches it

`generateAuctionCarInstance` (`packages/sim/src/auctions.ts`) can fit an aftermarket SKU to any
slot whose ladder exists, at up to `maxAftermarketSlots` slots per car. Read from
`economy.json.partsGeneration`: `aftermarketChance` 0.06 per slot, multiplied by the car's rolled
history through `damageGrades.aftermarketChanceMultiplierByGrade` (`tidy` 0.6, `used` 1.0, `rough`
1.6, `project` 2.0) and clamped to 1, capped at `maxAftermarketSlots` 3. Grade is then drawn from
`aftermarketGradeWeights` (`street` 60, `sport` 30, `race` 10).

So an auction lot arrives with an authenticity already below 100 fairly often. Note that this roll
reaches `chassis`, which the player's own fitting flow cannot (finding F3).

Generation can also leave a slot MISSING: `missingSlotBaseChance` 0.015, scaled per slot by
`missingSlotWeightByPart` and by upkeep. Six slots are authored at weight 0 there and can never
roll missing: `block`, `chassis`, `panels`, `paint`, `underbody` and `forcedInduction` (the last of
which never enters the missing roll at all, taking its own branch off the model's `spec.aspiration`
instead).

---

## 4. Measured behaviour

All figures below are measured on a shipped forced-induction model at the `enthusiast` fitment
class, every other slot mint and stock unless stated.

### 4.1 What one aftermarket SKU costs

| slot | authenticity |
| --- | ---: |
| `block` | 82 |
| `panels` | 89 |
| `aero` | 90 |
| `internals` | 92 |
| `rims` | 93 |
| `headValvetrain` | 94 |
| `gearbox` | 94 |
| `camsTiming` | 96 |
| `seats` | 96 |
| `forcedInduction` | 97 |
| `springs` | 98 |
| each of the ten weight-1 slots (`intake`, `exhaust`, `ignitionEcu`, `differential`, `chassis`, `dampers`, `steering`, `brakeCalipersLines`, `underbody`, `dashGauges`) | 99 |
| each of the seven weight-0 slots | 100 |
| `paint` | **100** |

`paint` reads 100 with an aftermarket SKU requested because there is no such SKU to fit. That row
is the whole of finding F1a in one number.

### 4.2 What one ruined original part costs

Every slot stock, one slot dropped to `scrap`:

`block` 85, `panels` 91, `paint` 91, `aero` 92, `internals` 93, `rims` 94, `headValvetrain` 95,
`gearbox` 95, `camsTiming` 97, `seats` 97, `forcedInduction` 97, `springs` 98, each weight-1 slot
99, each weight-0 slot 100.

Note the ordering against 4.1: for the heavy slots, **modifying costs more than ruining**. An
aftermarket block reads 82, a scrap original block reads 85, because a scrap part still keeps 15
per cent of its weight through `bandFactors.scrap` while an aftermarket one keeps none of its
originality.

### 4.3 What one missing part costs

Both charges land at once, since a missing part is neither original nor in any condition:

`block` 67, `panels` 79, `paint` 79, `aero` 81, `internals` 85, `rims` 86, `headValvetrain` 88,
`gearbox` 88, `camsTiming` 92, `seats` 92, `forcedInduction` 94, `springs` 96, each weight-1 slot
98, each weight-0 slot 100.

### 4.4 How condition alone scales an untouched car

All 26 shipped car models, all-stock, every slot at the same band. Every model gives an identical
figure, because stockness is 1 and the condition mean is the flat band factor:

| every slot at | authenticity |
| --- | ---: |
| `mint` | 100 |
| `fine` | 85 |
| `worn` | 65 |
| `poor` | 40 |
| `scrap` | 15 |

---

## 5. The bounds

### Ceiling: 100, and it is exactly reachable

An all-stock, all-mint car reads exactly 100 on every one of the 26 shipped models (measured). Both
factors are 1 and the machining term is 0, so this is an identity rather than a calibration. Nothing
can exceed it: `stockness` cannot exceed 1 and `conditionFactor` cannot exceed 1.

### Practical floor for a fully-modified car: 11

**Fit an aftermarket race SKU to every slot that has one, at mint, and authenticity reads exactly
11** (measured). Those 11 points are `paint`'s weight, and they cannot be modified away because no
non-stock `paint` SKU exists at any fitment class.

The same fully-modified car with condition also dropped, every slot including `paint` (measured):

| every slot at | authenticity |
| --- | ---: |
| `mint` | 11 |
| `fine` | 9 |
| `worn` | 7 |
| `poor` | 4 |
| `scrap` | 2 |

Two points is the floor a car that still HAS all of its parts can reach.

### Absolute floor: 0

Every weight-carrying slot missing gives stockness 0 and a condition factor of 0, so the stat reads
0 (measured). That is not a state a playable car reaches; it is quoted so the bound is known.

### What it takes to hold the concours gate

`economy.json.reputation.concoursSaleMinAuthenticityPercent` is 85, and `carCondition.ts` also
requires every present part to be `mint` before it reads authenticity at all. With every part mint
the condition factor is exactly 1, so at the gate authenticity IS stockness: **a concours car may
give up at most 15 of the 100 authored points.** Consequences, each of them asserted by a shipped
test in `packages/sim/tests/authenticity.test.ts` (22 tests, all passing):

- an aftermarket `block` alone (18) fails, at 82,
- a kit and wheels together (`aero` 10 plus `rims` 7) fail, at 83,
- a full engine swap with its ancillaries reads 58,
- a full set of new consumables (`tyres`, `brakePadsDiscs`, `clutch`, plus `cooling`, `fuelSystem`,
  `driveline`, `antiRollBars`) costs nothing at all and holds 100.

A body kit fitted through the real install path fails it at 83 for a second, less obvious reason as
well: the `paint` condition hit from section 3.6.

---

## 6. What does NOT affect authenticity

- **Mileage, age, model year, colour, provenance note, tier, culture, rarity and price.** None is
  read anywhere in the derivation. Two cars with identical parts read identical authenticity
  whatever else differs.
- **Any stored roll.** There is no `CarInstance.authenticityPercent`; the field is retired and
  `packages/content/tests/retiredIdentifiers.test.ts` fails if the identifier reappears. A save
  carrying one is stripped on parse.
- **Any per-part authenticity number.** `statModifiers.authenticity` is retired too. A part's
  `grade` is the entire per-part signal.
- **The seven zero-weight slots, in both directions.** New race tyres, a race clutch, a race
  radiator, a race fuel system, an aftermarket propshaft, aftermarket anti-roll bars and race pads
  cost nothing, and their condition costs nothing either, however ruined. A scrap set of tyres
  leaves a perfect car at 100 (measured).
- **How GOOD an aftermarket part is.** A `street` SKU and a `race` SKU in the same slot cost
  identical authenticity. The grade ladder decides physics and style, never originality; only
  `grade === 'stock'` versus anything else matters here.
- **How MANY aftermarket parts are in one slot.** A slot holds one part.
- **The car's power, handling, style or reliability.** No derived stat reads another.
- **The car's market value, in either direction.** `marketValueYen`
  (`packages/sim/src/marketValue.ts`) contains no reference to authenticity and takes no derived
  stat at all. Authenticity reaches money only through the buyer taste multiplier (section 7).
- **The physical dial curves.** `statFormulas.condition.bandFactor` (grip, braking, driveline,
  aero) and per-SKU `physicalModifiers` never touch this stat; it runs on `bands.bandFactors`
  alone.
- **The support and coherence model.** `supportVerdict`, `coherenceFactorFor` and
  `reliabilityIntensityFactor` feed reliability only.
- **Repairing a car above the tool-tier repair ceiling, or buying a mint replacement.** Fitting a
  brand-new mint STOCK part restores the slot's full weight on both halves, so a fully-restored
  numbers-matching car is worth exactly as much originality as one that never wore out.

---

## 7. Who consumes authenticity

- **`packages/sim/src/valuation.ts`**, as one of five stats in `tasteMatchFor`, normalised by
  dividing by 100. Buyer targets are read from `packages/content/data/buyers.json`, key
  `statTargets.authenticity`: `collector` target 0.90 at importance 1.00, `hobbyist` 0.60 at 0.50,
  `first-timer` 0.50 at 0.20, and `tuner`, `stancer` and `racer` all at target 0 and importance 0,
  meaning they are wholly indifferent to it. The taste match then scales price within
  `[1 - tasteSpread, 1 + tasteSpread]`, `tasteSpread` being 0.12, or within a listing channel's own
  band.
- **`packages/sim/src/carCondition.ts`**, as the concours gate on `saleReputationDeltaFor`. It calls
  the exported `authenticityPercentOf` rather than deriving its own figure.
- **`packages/game/src/utils/radar.ts`**, as one of the five radar axes, already on a 0-to-100
  scale.
- **`packages/game/src/screens/PerformanceSandboxScreen.vue`**, as a stock-versus-current row.

Nothing else. No story mission, requirement or payout reads it: `storyMissions.json` contains no
mention of authenticity at all, and only `buyers.json` and `parts-taxonomy.json` mention it
anywhere in `packages/content/data`.

---

## 8. Where the content levers live

| lever | file | key |
| --- | --- | --- |
| the 29 per-slot weights | `packages/content/data/parts-taxonomy.json` | `statWeights.authenticity` |
| the condition curve | `packages/content/data/economy.json` | `bands.bandFactors` |
| the concours gate | `packages/content/data/economy.json` | `reputation.concoursSaleMinAuthenticityPercent` |
| how much taste can move a price | `packages/content/data/economy.json` | `valuation.tasteSpread` |
| who cares, and how much | `packages/content/data/buyers.json` | `statTargets.authenticity` |
| how modified a generated car arrives | `packages/content/data/economy.json` | `partsGeneration.aftermarketChance`, `partsGeneration.maxAftermarketSlots`, `partsGeneration.aftermarketGradeWeights`, `partsGeneration.damageGrades.aftermarketChanceMultiplierByGrade` |
| how often a slot arrives empty | `packages/content/data/economy.json` | `partsGeneration.missingSlotBaseChance`, `partsGeneration.missingSlotWeightByPart` |
| which slots can be modified at all | `packages/content/data/parts.json` | the existence of a non-`stock` `grade` for a `carPartId` |

Every one of these is maintainer-gated under directive 22. The 29 weights ship as preliminary
defaults recorded as implemented rather than approved, which
`docs/design/systems/authenticity-weights-proposal.md` states in its own status line.

---

## Findings

### F1. The machining term is dead code today, and cannot fire

`machiningCost(car)` returns literal `0` with its parameter explicitly discarded. `CarInstance`
records no machining operation and no operation exists to apply, so the term is not merely zero in
practice, it is unreachable. Confirmed by reading the source and by measuring it against every
shipped car.

This is deliberate and documented as a seam. It is worth stating plainly anyway, because
`docs/design/systems/desirability-system.md` section 3 devotes a full table to the machining cost
scale (a careful freshen at 3, a mild road port at 15, a full boost build at 39) and a reader can
easily take that for live behaviour. **None of those numbers is in the game.** No car has ever lost
a single point to machining.

### F1a. `paint` still ships no non-stock SKU, so 11 of the 100 points cannot be modified away

The single most surprising thing about this stat. `stocknessOf` asks each slot whether its fitted
SKU is `grade: 'stock'`, and `packages/content/data/parts.json` contains exactly four `paint`
entries (`stock-paint` and its three fitment-class siblings), all of them `grade: 'stock'`.
Measured: `paint` is the only slot in the game with no aftermarket ladder, and it lacks one at all
four fitment classes.

The consequences, all measured:

- a fully-modified car floors at **11**, not 0,
- a resprayed car reads as wearing its factory colour, because a respray is a pipeline stage acting
  on zone `finish` and `colour`, and never changes the fitted SKU,
- a car resprayed a completely different colour and a car in original paint are indistinguishable
  to this stat.

The weight is NOT dead: the same column drives the condition factor, where `paint` at `scrap` costs
9 points (measured, 91 against 100), tied with `panels` as the heaviest condition hit on the list.
The originality half alone is what cannot fire.

This is known, deliberately deferred, and recorded in `TODO.md` with two candidate routes (a
`paint` SKU ladder, or a per-zone refinished flag read by `stocknessOf` instead of the carrier's
grade), neither chosen. `packages/sim/tests/authenticity.test.ts` pins it and fails the moment a
non-stock `paint` SKU is added.

### F2. Both clamp arms are currently unreachable

`clamp(raw * conditionFactor, 0, 100)` can never bite. `raw` is `100 * stockness` with the
machining term at 0, so it lies in `[0, 100]`; `conditionFactor` lies in `[0, 1]`; the product is
therefore already in range. The upper arm becomes meaningful only if a weight column stops summing
to its own denominator, and the lower arm only when `machiningCost` starts returning a real number
large enough to drive `raw` negative (which, on the design's own scale, a full boost build at 39
would not do by itself). Harmless and correct as defensive code; simply not load-bearing today.

### F3. `chassis` carries a live weight the player can never lose, and can never recover

`chassis` is `removable: false` in the taxonomy, and it is not a body-derived part, so it takes
neither route into the slot:

- `applyJobToCar` (`packages/sim/src/jobs.ts`) refuses an install onto an occupied slot unless the
  target is one of `panels`/`paint`/`underbody`, and
- `removeBlockReason` refuses removal outright on a `removable: false` entry.

The chassis slot is never empty (generation fills it, and `missingSlotWeightByPart.chassis` is 0,
so it can never roll missing), so the player can never fit one of the shipped seam-weld, sport or
tube-chassis kits.

But `generateAuctionCarInstance` CAN fit one, through the aftermarket-at-generation roll, which
has no such gate. So the weight of 1 is live but one-way: an auction lot can arrive with an
aftermarket chassis costing it a point, and there is no action in the game that puts the point
back. Small, and worth knowing before the weight is ever raised.

`docs/design/systems/authenticity-weights-proposal.md` section 3.3 asks this exact question and
leaves it open ("Worth confirming"). The answer is above.

### F4. Modifying a heavy slot costs MORE than ruining it

Measured: an aftermarket `block` reads 82, an original `block` at `scrap` reads 85. Same for every
heavy slot. The cause is structural rather than a tuning slip: `bandFactors.scrap` is 0.15, so a
ruined original keeps 15 per cent of its weight, while an aftermarket part keeps none of its
originality however mint it is.

Whether that ordering is intended is a design question, not a bug report. It reads correctly for a
purist judging a car (a tired original engine is still THE engine), and it is worth stating because
the opposite is the intuitive expectation.

### F5. A body kit charges authenticity twice, and the second charge is now stated

Fitting a body kit onto `panels` runs `refitCarrierZoneStates`, which resets all five panel zones to
bare, unprimed metal. The `paint` band then derives to `poor`. **Measured** on a pristine zone-model
car, through that real swap: **100 before, 83 after a mint sport body kit**, where the 11-point
stockness loss alone gives 89 (**measured**: stockness is exactly 89.00 either way, so the whole of
the remaining 6 points is the paint band). Identical on both cars measured, the S13 and the EG6.

The second charge is recoverable (paint the car and `paint` climbs back to mint), and it is
correct: a car that has just had a kit fitted genuinely is in primer. What was wrong was that
nothing said so. The car now carries a note under its radar naming the unpainted panels and saying
that style and authenticity both come back with the paint (`unpaintedPanelZoneIds` in
`bodyPipeline.ts`, `unpaintedPanelsText` in `packages/game/src/utils/zoneSeverity.ts`,
`CarDetailScreen`). **No formula changed with it**, and this document's figures are unmoved: the
drop is as large as it ever was, and it is now legible.

### F6. The three design docs that were stale on the body slots have been corrected

The question was whether any document still claimed 23 of the 100 points were unloseable, or that
`aero` was the only slot a visible modification could land on. **Read**, all three:

1. `docs/design/systems/authenticity-weights-proposal.md` section 3.1 now states that `panels` and
   `underbody` "shared this gap when the weights were written and no longer do", and concludes
   "**11 of the 100 points can never be lost to modification**". **Measured**: `paint` is the only
   slot with no aftermarket ladder, at all four fitment classes, and a fully modified car floors at
   exactly 11.
2. The same document's section 3.2 is now headed "`aero` no longer carries the whole visible-body
   signal" and records that `panels` (11) and `underbody` (1) carry ladders of their own and that
   `panels` outweighs `aero`.
3. `docs/design/systems/desirability-system.md`'s outstanding item now reads "Originality for
   `paint`, which cannot currently read as modified at all. `panels` and `underbody` now can."

F7 is the one place the stale 23 survives, and it is a test comment rather than a design document.

### F7. A test comment carries the same stale 23

`packages/sim/tests/valuation.test.ts`, in the stancer smoke test, reads: "It does not go lower
because three body slots have no aftermarket SKU to fit, so 23 of the 100 authenticity points are
currently unreachable by modification." One slot, and 11 points. The assertion it sits above is
still correct and still passes; only the explanation is out of date. Reported rather than changed,
since this document changes no code.

### F8. The design doc's own worked examples are correct

Worth recording alongside the drift above, because it is the part that held. Every arithmetic
example in `authenticity-weights-proposal.md` section 2 reproduces exactly against the shipped
code: the consumables car at 100, the block swap at 82, the long block at 64, the full swap with
ancillaries at 58, that same swap on an NA car at 60, and the kit-and-wheels build at 83. The
weight table in that document matches `parts-taxonomy.json` value for value across all 29 slots.
