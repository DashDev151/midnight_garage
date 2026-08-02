# Power

**What it is.** The engine's output in PS, as the car sits right now. Every other derived stat is a
0 to 100 score; power is not. It is a real figure in real units, and a stock car in mint condition
reads exactly the number on its own spec sheet.

**Where it is computed.** `computeDerivedStats` in `packages/sim/src/derivedStats.ts`. Nothing else
in the codebase derives power, and nothing adjusts it afterwards.

---

## 1. The headline formula

As written, in `computeDerivedStats`:

```text
powerConditionFraction = weightedBandFactorForStat(car, model, 'power', taxonomy, economy)
powerConditionScale    = powerConditionFloor + (1 - powerConditionFloor) * powerConditionFraction

power = model.spec.stockPowerPs * powerConditionScale

      + SUM over every installed part of
            model.spec.stockPowerPs
          * ( part.statModifiers.powerFraction[engineCharacter]
            + machiningPowerFractionOf(installedPart, part, engineCharacter, economy) )
          * bandFactor(installedPart.band)

return Math.round(Math.max(0, power))
```

`engineCharacter` is `engineCharacterOf(model, economy)`, resolved once per car before the loop and
shared by every part in it.

**In plain language.** A car makes its factory power, dragged down by how worn its engine parts are,
plus a percentage of that same factory power for every aftermarket engine part bolted to it, plus a
further percentage for every machining operation done to a part that is on it. The percentage each
one is worth depends on what sort of engine it is bolted to, and a worn part delivers less of its
percentage. Everything is a fraction of the car's own stock output, so the same exhaust is worth
20 PS on a Supra and 4 PS on a Beat, and the order you fit or machine things in never matters.

**There is one power term per slot, and machining is inside it rather than beside it.** A slot
contributes what its fitted SKU gives plus what has been machined into that SKU, scaled by the one
band the one part carries. There is no second accumulation and no second power path.

---

## 2. Every input

### 2a. `model.spec.stockPowerPs` (per car, `cars.json`)

The single figure the whole formula is denominated in. Both terms are fractions of it, so it sets
both the floor and the ceiling.

- Shipped roster (26 cars): 55 PS (Suzuki Wagon R CT21S) to 324 PS (Toyota Supra RZ and Toyota
  Aristo 3.0V).
- Full 94-car roster (`docs/design/midnight-garage-roster.csv`): 31 PS (Honda Today JW1) to 560 PS
  (Lexus LFA). One row, the Daihatsu Mira TR-XX (L70), carries no `stockPowerPs` at all.

### 2b. The condition term: `powerConditionFraction` (per part, driven by content weights)

`weightedBandFactorForStat(car, model, 'power', ...)` is a weighted mean of `bandFactor(band)` over
every taxonomy slot carrying a non-zero `statWeights.power`. Six of the 29 slots do:

| slot | `statWeights.power` |
| --- | ---: |
| forcedInduction | 3 |
| internals | 2 |
| camsTiming | 2 |
| ignitionEcu | 2 |
| intake | 1 |
| exhaust | 1 |
| every other slot (23 of them) | 0 |

Total weight 11. Three rules govern the walk:

- **A legitimately absent slot drops out of both sums.** The only one that can be is
  `forcedInduction` on a car whose `spec.aspiration` is `NA`. So the denominator is **11 on
  any car with something in the forced-induction slot, and 8 on a factory-NA car with that slot
  empty**. Fitting a turbo to an NA car therefore adds 3 to that car's denominator.
- **A missing part is worse than a scrap one.** `isPartMissing` (a real defect: a gutted exhaust,
  a stolen turbo off a factory-turbo car) contributes 0 to the numerator and its full weight to the
  denominator.
- **The band read is the true band**, `car.parts[id].installed.band`, never
  `apparentBandByPartId`.

`bandFactor` is `economy.bands.bandFactors`: mint 1, fine 0.85, worn 0.65, poor 0.4, scrap 0.15.

### 2c. `statFormulas.powerConditionFloor` (global, 0.5)

Maps the 0-to-1 condition mean onto a 0.5-to-1.0 multiplier of stock power. A car whose engine has
entirely fallen out still makes half its factory figure.

Measured, on a Supra (324 PS stock, forced-induction slot occupied, denominator 11), every
power-weighted slot moved to one band together:

| every power-weighted slot at | power | multiple of stock |
| --- | ---: | ---: |
| mint | 324 PS | x1.0000 |
| fine | 300 PS | x0.9259 |
| worn | 267 PS | x0.8241 |
| poor | 227 PS | x0.7006 |
| scrap | 186 PS | x0.5741 |
| all missing | 162 PS | x0.5000 |

Measured, the same Supra with exactly one stock slot dropped to scrap and everything else mint:

| slot dropped to scrap | weight | power | loss |
| --- | ---: | ---: | ---: |
| forcedInduction | 3 | 286 PS | 38 PS |
| internals | 2 | 299 PS | 25 PS |
| camsTiming | 2 | 299 PS | 25 PS |
| ignitionEcu | 2 | 299 PS | 25 PS |
| intake | 1 | 311 PS | 13 PS |
| exhaust | 1 | 311 PS | 13 PS |
| block, headValvetrain, or any of the other 21 | 0 | 324 PS | none |

And with the forced-induction slot emptied outright on that same factory-turbo car: **280 PS**,
worse than leaving a scrap turbo in place.

### 2d. `engineCharacter` (per car, three values)

`engineCharacterOf(model, economy)`, in three steps:

1. `hasForcedInduction(model)` is true when `model.spec.aspiration` is anything other than `NA`.
   If so, the character is **`forced`**, full stop. Specific output is never consulted.
   `aspiration` is a required field on `CarModelSchema` and `NA` is the only naturally aspirated
   value the enum carries, so the answer is schema-guaranteed rather than dependent on a tag being
   remembered.
2. Otherwise, if `model.spec.displacementCc` is absent, the character is **`lazy-na`**.
3. Otherwise `specificOutputOf(model)` is compared against
   `statFormulas.engineCharacter.naHighStrungThreshold` (**80**): at or above is
   **`high-strung-na`**, below is **`lazy-na`**.

`specificOutputOf` is `stockPowerPs / (effectiveDisplacementCc / 1000)`, PS per effective litre.
`effectiveDisplacementCcOf` multiplies `displacementCc` by **1.8** when `spec.engineConfig` starts
with `rotary`, and by 1.0 otherwise, so a 13B is measured as roughly 2.35 litres rather than 1.3.

Shipped split (**measured**, 26 cars): 16 `forced`, 5 `high-strung-na`, 5 `lazy-na`. The induction
TAG and `spec.aspiration` agree on all 26 (**measured**: zero disagreements), so the shipped split
is the same one the tag used to produce.

Full roster, from the CSV's own `aspiration` column, which is now the field the sim reads: **93
rows carry a power figure** and split 47 `forced`, 24 `high-strung-na`, 22 `lazy-na`. All 94 rows
carry an `aspiration`; the 94th is the Daihatsu Mira TR-XX (L70), a factory turbo with no
`stockPowerPs` (finding 5).

**The threshold is a cliff, and the roster is dense around it.** The two closest NA cars either
side are the VW Golf GTI 16V (Mk2) at 78.05 PS per effective litre (`lazy-na`) and the Mitsubishi
Pajero Evolution at 80.07 (`high-strung-na`). Concretely: the AE86 makes 130 PS from 1587 cc, which
is 81.92, so it is `high-strung-na` and caps at 189 PS. Authoring its stock figure as 126 PS
instead would put it at 79.4, make it `lazy-na`, and move its ceiling to 202 PS. Four PS of
authoring, thirteen PS of ceiling.

### 2e. `part.statModifiers.powerFraction[engineCharacter]` (per SKU, `parts.json`)

The aftermarket term. Non-zero on **96 of the 472 shipped SKUs**: eight slots, three aftermarket
grades, four fitment classes. Zero on every `stock`-grade SKU without exception, and zero on every
slot outside these eight.

Race-grade fractions, the top of each ladder:

| slot | `high-strung-na` | `lazy-na` | `forced` |
| --- | ---: | ---: | ---: |
| block | 0.13 | 0.16 | 0.04 |
| internals | 0.04 | 0.05 | 0.04 |
| headValvetrain | 0.09 | 0.11 | 0.08 |
| camsTiming | 0.11 | 0.14 | 0.06 |
| intake | 0.01 | 0.03 | 0.07 |
| exhaust | 0.04 | 0.06 | 0.18 |
| ignitionEcu | 0.03 | 0.05 | 0.33 |
| forcedInduction | 0.20 | 0.28 | 0.50 |
| **sum** | **0.65** | **0.88** | **1.30** |

The full ladders, street / sport / race:

| slot | `high-strung-na` | `lazy-na` | `forced` | ladder shape |
| --- | --- | --- | --- | --- |
| block | 0.051 / 0.085 / 0.13 | 0.061 / 0.102 / 0.16 | 0.016 / 0.028 / 0.04 | mildly diminishing |
| internals | 0.016 / 0.026 / 0.04 | 0.02 / 0.032 / 0.05 | 0.016 / 0.028 / 0.04 | mildly diminishing |
| headValvetrain | 0.037 / 0.065 / 0.09 | 0.043 / 0.079 / 0.11 | 0.041 / 0.064 / 0.08 | mildly diminishing |
| camsTiming | 0.028 / 0.069 / 0.11 | 0.039 / 0.089 / 0.14 | 0.023 / 0.043 / 0.06 | roughly linear |
| intake | 0.005 / 0.008 / 0.01 | 0.015 / 0.025 / 0.03 | 0.047 / 0.064 / 0.07 | diminishing |
| exhaust | 0.018 / 0.031 / 0.04 | 0.025 / 0.046 / 0.06 | 0.101 / 0.153 / 0.18 | diminishing |
| ignitionEcu | 0.005 / 0.016 / 0.03 | 0.007 / 0.027 / 0.05 | 0.056 / 0.195 / 0.33 | increasing |
| forcedInduction | 0.04 / 0.09 / 0.20 | 0.056 / 0.126 / 0.28 | 0.10 / 0.225 / 0.50 | increasing |

**Every slot keeps its own grade shape, and that is load-bearing rather than
decorative.** The catalogue's price ladders are bespoke per slot (the ECU climbs x8.67
to race, the turbo x6.5, cams x4.5, everything else x3), so a flat power shape laid
over them puts one part far ahead on power per yen. A uniform rescale was measured and
rejected for exactly that: it made a street ECU 2.1 times the power per yen of anything
else on a boosted car. `forcedInduction`'s own column is pinned to its price ladder's
ratios first, because one sheet entry serves all three characters, and the other seven
slots absorb the slack (`packages/content/tests/partPricing.test.ts` acceptance 2a).

The ladder shapes are entirely a property of the authored numbers. `computeDerivedStats` reads
whatever fraction the fitted SKU carries and adds it; there is no curve, threshold or unlock
anywhere in the code.

The four fitment-class variants of a SKU (`khs-race-ecu`, `shitbox-khs-race-ecu`,
`uncommon-khs-race-ecu`, `rare-khs-race-ecu`) carry **byte-identical** `powerFraction` objects.
Class moves price and nothing else.

### 2f. `PartInstance.machining` (per instance, `economy.machining.operations`)

The third input, and the only one that is a property of an INSTANCE rather than of a car or a SKU.
`machiningPowerFractionOf` (`packages/sim/src/machining.ts`) reads the operation ids recorded on the
fitted `PartInstance`, sums their `powerFraction[engineCharacter]`, and scales the sum by
`economy.machining.gradeMultiplier[part.grade]`.

**Nine operations, on four slots.** Every one of them is content, and there is no other route into
this term:

| operation | slot | `high-strung-na` | `lazy-na` | `forced` |
| --- | --- | ---: | ---: | ---: |
| Port and polish | headValvetrain | 0.011676 | 0.015065 | 0.061818 |
| Milling the head | headValvetrain | 0.004865 | 0.006277 | **0** |
| Multi-angle valve job | headValvetrain | 0.002919 | 0.003766 | 0.010909 |
| Bore and hone | block | 0.016865 | 0.021913 | 0.021818 |
| Decking the block | block | 0.011243 | 0.014609 | 0.014545 |
| O-ringing the deck | block | **0** | **0** | **0** |
| Balance and polish | internals | 0.008649 | 0.011413 | 0.036364 |
| Shot peening the rods | internals | **0** | **0** | **0** |
| Cam regrind | camsTiming | 0.023784 | 0.031957 | 0.054545 |
| **whole engine** | | **0.0800** | **0.1050** | **0.2000** |

**The grade multiplier.** `stock` 1.0, `street` 1.0, `sport` 1.25, `race` 1.5. Machining a better
part is worth more because the surrounding hardware can use more of what it unlocks, and this is the
only place the fitted grade reaches power other than the SKU's own fraction. So the whole-engine
figure above is what a fully machined set of ORIGINAL castings gives; on race-grade parts it is
1.5x that: **0.12 / 0.1575 / 0.30** (measured).

**Three operations carry no power at all on any character**, and one more carries none on `forced`.
O-ringing the deck and shot peening the rods exist entirely for support; milling the head raises
static compression, which is what you do instead of running boost rather than as well as it.

**Bounds on this term alone.** Zero on every unmachined part, which is every part in the game until
a player takes one to the bench. Maximum 0.30 of stock power, reached only by machining all four
slots at race grade on a `forced` engine.

**What it is worth in PS** (measured, one operation at a time, on the car's own character):

| car | biggest operation | smallest non-zero |
| --- | --- | --- |
| Supra RZ (324 PS, forced) | port and polish, **20.03 PS** | multi-angle valve job, 3.53 PS |
| Wagon R (55 PS, high-strung NA) | cam regrind, **1.31 PS** | multi-angle valve job, 0.16 PS |
| Beat (64 PS, high-strung NA) | cam regrind, **1.52 PS** | multi-angle valve job, 0.19 PS |

That spread is the feature rather than a calibration failure: machining an aspirated engine's
internals is worth well under one per cent for a full five-point labour slot, and the player is
meant to learn to spend the labour where it pays.

### 2g. `bandFactor(installedPart.band)` on the aftermarket and machining terms (per part)

Each part's own contribution is scaled by its own band, on the same value-side curve as the
condition mean (mint 1, fine 0.85, worn 0.65, poor 0.4, scrap 0.15). A missing part is skipped by
the loop entirely, so it contributes nothing rather than something negative. Machining rides inside
that same term, so a machined part that has since worn delivers exactly the same fraction of its
machined gain as it does of its bought one: one band, one scaling, no second rule.

A part in a **weight-carrying** slot therefore has its band read twice, for two different jobs: once
as its share of the condition mean that scales the base, and once to scale its own contribution.
That is not double-charging. The first says how healthy the engine is, the second says how much of
this specific upgrade survives its own wear. A part in a **zero-weight** slot (`block`,
`headValvetrain`) has its band read only for the second.

---

## 3. Bounds, measured

### Floor: exactly 0.5 x `stockPowerPs`

Reached by making every power-weighted slot missing. The base term bottoms out at
`powerConditionFloor` and the aftermarket term cannot go below zero on shipped content.

- Measured, Supra: **162 PS**. Every shipped car's floor is `round(stockPowerPs / 2)`, from 28 PS
  (Wagon R) to 162 PS (Supra, Aristo).
- Roster floor: **16 PS** (Honda Today JW1).

### Ceiling: a per-character multiple of `stockPowerPs`

Every one of the eight power-bearing slots at race grade, mint. **Re-measured with machining in the
model**: the parts-only figures are unchanged, and the four machined columns are new.

| engine character | own induction | own induction, fully machined | race turbo fitted regardless | turbo, fully machined |
| --- | ---: | ---: | ---: | ---: |
| `high-strung-na` | x1.45 | **x1.56** | x1.65 | **x1.76** |
| `lazy-na` | x1.60 | **x1.76** | x1.87 | **x2.03** |
| `forced` | x2.30 | **x2.60** | x2.30 | **x2.60** |

Measured shipped maxima, turbo always fitted, unmachined and then fully machined: Supra and Aristo
**745 to 842 PS** each, Chaser / Skyline GT-R / Fairlady Z **644 to 728**, RX-7 FD **587 to 663**,
Impreza WRX STI **575 to 650**, MR2 SW20 **561 to 634**, Beat **106 to 113**, Wagon R **91 to 97**.
(The realised ratios sit a few thousandths off the table above because the result is rounded to
whole PS, which shows most on the low-power kei cars.)

**The Supra is the car the ladder was set on**, and it reads its authored figures exactly: 324
stock, 389 stock machined, 454 street, 518 street machined, 583 sport, 664 sport machined, 745
race, 842 race machined.

Roster projection from the CSV, with a race turbo fitted and no machining: Nissan GT-R Black Edition
(R35, 480 PS, forced) at **936 PS** and Lexus LFA (560 PS, high-strung NA) at **913 PS** are the two
highest numbers the parts model can produce anywhere on the 94-car roster. Those two rows are not in
`cars.json`, so unlike everything else on this page they are arithmetic rather than a measured run,
and no machined figure is given for them for that reason.

**Whole reachable band: 0.5x to 2.60x the car's own stock power**, the top reached only by a
`forced` engine with every power slot at race grade and every one of its four machinable slots fully
machined.

---

## 4. Miniscule effects, which still count

- **The smallest non-zero fraction in the catalogue is 0.005**, `khs-street-ecu` on a
  `high-strung-na` engine. On the lowest-power shipped car (55 PS Wagon R) at scrap band that is
  **0.0413 PS**, which rounds away entirely.
- **Machining goes smaller still.** The smallest non-zero machining fraction is **0.0029189**, a
  multi-angle valve job on a `high-strung-na` engine: **0.16 PS** on the Wagon R and **0.19 PS** on
  the Beat, at mint. Five labour points buys a figure that does not move the readout at all. That is
  the lesson the operation is there to teach rather than a rounding defect, and it is why the shop
  page shows PS to a tenth rather than whole.
- **A cheap part in a weighted slot is a net power loss as soon as it wears.** Measured on the
  Wagon R (NA, empty forced-induction slot, denominator 8), fitting the street ECU against a stock
  ECU baseline of 55 PS: mint 55, fine 54, worn 53, poor 51, scrap 49. Its own gain is 0.275 PS at
  mint, while its band drags a quarter of the condition mean (weight 2 of that car's denominator
  of 8).
- **A part with zero power can cost power.** A stock forced-induction SKU carries `powerFraction`
  0 on all three characters. Dropped into a Beat's empty slot it reads 64 PS at mint (no change)
  and **57 PS at scrap**, purely by joining the condition denominator at weight 3.
- **The NA turbo-conversion crossover is `poor`.** Measured on a Beat (64 PS stock, everything else
  mint) with a race turbo fitted: mint 77, fine 74, worn 69, poor 64, scrap 59. At `poor` the turbo
  exactly pays back the denominator it added; at `scrap` the converted car makes less than it did
  before the conversion. Same car with a street turbo: mint 67, fine 65, worn 63, poor 60, scrap 57,
  so a street turbo on an NA car is under water from `worn` down.
- **`powerConditionScale` can never exceed 1.** No amount of condition makes a car produce more
  than its factory figure. The only route above stock is a `powerFraction`.

---

## 5. What does NOT affect power

- **Support ratios, coherence, and the support verdict.** An unsupported build makes its full power
  and pays for it in reliability alone. **Measured**: a Supra with all eight power slots at race
  grade and no support upgrade anywhere reads a headline support ratio of 0.6064 (`dangerous`) and
  makes **745 PS**. The identical build with every support slot also at race grade reads 0.9850
  (`adequate`) and makes **exactly the same 745 PS**. Only reliability moves, 32 against 70.

  **The same pair fully machined**: both make **842 PS**, again identically, at reliability 30
  against 66. Neither the ladder nor machining changes the relationship: support decides what the
  power costs, never how much of it there is.
- **Anything about the machining record other than which operations are on the part.** The order
  they were done in, when they were done, and which car they were done on are not recorded and
  could not be read if they were. Two parts carrying the same operations are identical to this
  stat. **Measured**: applying the nine operations in catalogue order and in reverse gives
  byte-identical power on all three characters.
- **The other four derived stats.** Power is computed before any of them and reads none of them.
- **Fitment class, rarity, and price.** Identical `powerFraction` across all four class variants.
- **`statFormulas.condition.gradeBandFactor`.** The per-grade wear curves (`stock` / `street` /
  `sport` / `race`) apply only to `physicalModifiers` through `buildFactors`, which drives grip,
  braking and mass. Power uses the flat `bands.bandFactors` curve, so a race ECU at worn delivers
  0.65 of its fraction exactly as a street ECU at worn does.
- **`physicalModifiers`.** Power is deliberately absent from `PhysicalModifierSchema`
  (`packages/content/src/stats.ts`), which names it as one of two dials with exactly one path in.
- **The induction TAGS.** `Turbo` and `Supercharged` on `model.tags` are a platform facet, used for
  display and matching. `hasForcedInduction` reads `spec.aspiration` and nothing else, so a car
  whose two representations disagreed would take the column its `aspiration` names. `bands.test.ts`
  pins that against fixtures whose tag and aspiration deliberately disagree, and
  `integrity.test.ts` holds the two in agreement on every shipped car.
- **`spec.quotedPowerPs`.** Optional, carried by four shipped cars, read nowhere outside dev
  sandbox fixtures.
- **The condition of `block` and `headValvetrain` on the base term.** Both carry
  `statWeights.power` 0. Measured: a Supra with a scrap stock block and a scrap stock head reads
  exactly 324 PS. Their bands still scale their own contributions (a race block reads 330 PS at
  mint and 325 PS at scrap).
- **Every slot outside the eight.** No fuel system, cooling, gearbox, clutch, differential,
  driveline, chassis, damper, spring, anti-roll bar, steering, brake, rim, tyre, panel, paint,
  underbody, aero, seat or gauge part moves power by any amount.
- **Mileage, model year, colour, provenance note, symptoms, market heat, reputation, tool tier,
  crew skills, and the day.** None of them appear anywhere in the derivation.
- **`apparentBandByPartId`.** Power reads the true band, so hidden damage is already costing power
  before it has been diagnosed.
- **`statFormulas.powerNormalizationCeiling` (300).** Not an input. It is how
  `normalizedPowerScore` (`packages/sim/src/valuation.ts`) puts PS on the same 0-to-1 footing the
  other four stats reach by dividing by 100, for buyer taste matching. It is uncapped, so a car
  past 300 PS scores above 1.
- **Install order.** Every contribution is a fraction of *stock* power, never of current power, so
  nothing compounds.
- **A 0-to-100 clamp.** The other four stats are clamped to 100. Power is a PS figure and is only
  floored at 0.

**Who consumes power** (none of these feed back into it): the radar chart, the dyno readout
(`packages/sim/src/dyno.ts`), the lap model (`lapModel.ts` passes `stats.power` straight to
`lapTime`), buyer taste matching via `normalizedPowerScore`, and mission stat-floor requirements
(`packages/content/src/requirement.ts`).

---

## 6. Where the content levers live

`packages/content/data/economy.json` (maintainer-gated per directive 22; pinned by
`packages/content/tests/economyApprovalGate.test.ts`):

| key | shipped value | what it does |
| --- | --- | --- |
| `bands.bandFactors` | mint 1, fine 0.85, worn 0.65, poor 0.4, scrap 0.15 | the one band curve, used for both the condition mean and each part's own contribution |
| `statFormulas.powerConditionFloor` | 0.5 | power at zero engine condition, as a fraction of stock |
| `statFormulas.engineCharacter.naHighStrungThreshold` | 80 | PS per effective litre that splits `lazy-na` from `high-strung-na` |
| `toolCeilings.naToTurboConversionEngineTier` | 3 | engine tool tier needed to fill an empty forced-induction slot on a factory-NA car (`naToTurboConversionBlocked`, `packages/sim/src/jobs.ts`) |
| `machining.operations[].powerFraction` | see 2f | per operation, per character, the fraction of stock power one machining job is worth on a stock-grade part |
| `machining.gradeMultiplier` | stock 1, street 1, sport 1.25, race 1.5 | scales every machining fraction by the grade of the part machined |
| `machining.minEngineToolTier` | 3 | the engine rung that owns the machine-shop tooling, which is what makes any of it reachable |

Other content:

| file | key | what it does |
| --- | --- | --- |
| `packages/content/data/parts-taxonomy.json` | `statWeights.power` | which slots' condition scales the base, and by how much |
| `packages/content/data/parts.json` | `statModifiers.powerFraction` | per-SKU, per-character fraction of stock power |
| `packages/content/data/cars.json` | `spec.stockPowerPs` | the figure everything is a fraction of |
| `packages/content/data/cars.json` | `spec.displacementCc`, `spec.engineConfig` | the specific-output derivation and the rotary test |
| `packages/content/data/cars.json` | `spec.aspiration` | the only signal that makes a car `forced`, and required on every model |

**Not content, and it should be:** the rotary equivalency factor **1.8** is a literal inside
`effectiveDisplacementCcOf` in `packages/sim/src/derivedStats.ts`.

---

## 7. Findings

1. **The rotary equivalency factor is a code literal.** `1.8` sits in `effectiveDisplacementCcOf`
   rather than in `economy.json`, against engineering law 2 (content law). Every other number the
   character derivation reads is content. It changes six roster cars' engine character if moved.

2. **Induction is carried twice on a `CarModel`, and the copy that reaches power is now the
   authored one.** The question this finding asked was which of the two representations the sim
   reads, because they could silently disagree: `hasForcedInduction` used to read `model.tags`
   while `midnight-garage-roster.csv` authored `aspiration` on all 94 rows and left `tags` blank on
   the unbuilt ones, so a car imported from the CSV without a hand-written `Turbo` tag would read
   NA, take the NA fraction column on every slot, and fail nothing. **The answer: it reads
   `spec.aspiration`**, which is now a REQUIRED field on `CarModelSchema` rather than an optional
   display facet, and the tag path is gone. The tag is still carried, still used for display and
   matching, and no longer answers this question. **Measured**: the two agree on all 26 shipped
   cars, so no shipped figure moved when the source changed. An import missing an `aspiration` now
   fails at the schema instead of quietly reading NA.

3. **Fitting forced induction never changes engine character, and machining makes that visible.**
   The character is a property of the MODEL, read once from `spec.aspiration`, so a converted NA car
   keeps its NA fraction column permanently. **Measured**: a Beat with a race turbo fitted still
   resolves `high-strung-na`, so the turbo pays 0.20 rather than `forced`'s 0.35. This is deliberate
   and pinned by `packages/sim/tests/proportionalPower.test.ts`, and it is defensible (the character
   answers "what sort of engine is this", not "what is bolted to it"), but a reader will assume the
   opposite.

   **Machining inherits the same behaviour and shows it more sharply.** Milling the head is
   deliberately worth zero on `forced`, because raising static compression is what you do instead of
   running boost. On a turbocharged Beat it is still worth its `high-strung-na` figure (0.004865,
   **0.31 PS**, measured), because the character never moved. In life that would be the wrong call
   on a boosted engine. This predates machining, it is the power model's behaviour rather than
   machining's, and machining only makes it legible.

4. **`statWeights.power` and `powerFraction` cover different slot sets.** Eight slots make power;
   six weight the condition mean. `block` and `headValvetrain` make power but their condition never
   scales the base: a Supra with a scrap stock block and a scrap stock head reads exactly its stock
   324 PS. Their own contributions are still band-scaled (race block: 330 PS mint, 325 PS scrap).
   Nothing is broken, but a tuner reading either table alone will get the wrong answer.

5. **`engineCharacterOf`'s missing-displacement branch is unreachable in shipped content.** All 26
   shipped cars carry `displacementCc`, and `packages/sim/tests/engineCharacter.test.ts` pins that.
   The roster has one row that would reach it: the Daihatsu Mira TR-XX (L70) has no `stockPowerPs`
   and no `displacementCc`. It carries `aspiration: turbo`, so `hasForcedInduction` answers first
   and the branch stays unreached even for that row.

6. **`Math.max(0, power)` cannot fire on shipped content.** The base term alone floors at
   0.5 x `stockPowerPs` and every authored `powerFraction` is non-negative. It is not dead code:
   `PowerFractionSchema` is a bare `z.number()` with no `.nonnegative()`, so the clamp is a live
   guard against a future negative fraction.

7. **The design doc's per-part response table now matches the code.**
   `docs/design/systems/tuning-system.md` section 5d used to show a single "NA" column where the
   code has two characters, and to give `forcedInduction` on NA as "n/a". Both are corrected: the
   table carries a `high-strung NA` and a `lazy NA` column at the shipped race-grade values, and
   the forced-induction row states that NA is not n/a and that a turbo fits a naturally aspirated
   car gated only on engine tool tier 3. **Read** against `parts.json`: every forced-induction SKU
   carries `requiredTags: []` and real NA fractions (0.04 / 0.09 / 0.20 high-strung, 0.056 / 0.126
   / 0.28 lazy). The doc's section 5b also now names `spec.aspiration` as what makes a car
   `forced`, which is what `hasForcedInduction` reads.

8. **Section 5e's ECU description is corrected; section 5b's specific-output line is still the
   pre-rotary form.** The claim that the ECU is a "threshold" that "unlocks what the others can do"
   is gone: 5e now says the ECU curve is increasing, gives the forced ladder as 0.038 / 0.138 /
   0.25, and states plainly that it unlocks nothing because every fraction is additive and
   independent of what else is fitted. **No unlock exists in the code**, and that is now what the
   doc says. What remains is 5b's "Specific output is `stockPowerPs / (displacementCc / 1000)`":
   the code divides by EFFECTIVE displacement, which 5c goes on to specify, so the section is only
   wrong read alone.

9. **The 80 PS-per-litre threshold is a hard cliff sitting inside a dense part of the roster.**
   Crossing it moves an NA car's ceiling from x1.60 to x1.45 (factory induction) or x1.87 to x1.65
   (turbo fitted). The Golf GTI 16V is at 78.05 and the Pajero Evolution at 80.07. Authoring the
   AE86 at 126 PS instead of 130 would flip it from `high-strung-na` to `lazy-na` and move its
   ceiling from 189 PS to 202 PS. Not a bug, but it means `stockPowerPs` and `displacementCc` are
   load-bearing on a discontinuity, and a routine correction to either can silently reshape a car's
   whole tuning ladder.

10. **The forced-induction slot is the single most punishing condition slot in the game.** At
    weight 3 out of 11 it costs a factory-turbo car 38 PS at scrap and 44 PS if it is missing
    outright, more than internals, cams and the ECU each cost at 2, and this happens on a stock
    part with zero `powerFraction`. Combined with rule 2b, filling that slot on an NA car is a
    permanent 3-point increase to that car's condition denominator, which is why an NA conversion
    goes under water at `poor`.

11. **Power is now the only stat with a per-INSTANCE input, and the two power-making slots that
    carry no condition weight are exactly the two machining leans hardest on.** Everything else this
    stat reads is a fact about the car (`stockPowerPs`, `aspiration`) or about a catalogue SKU
    (`powerFraction`). Machining is a fact about one physical part, and two identical SKUs on two
    identical cars can now make different power. Finding 4's mismatch sharpens with it: `block` and
    `headValvetrain` still carry `statWeights.power` 0, and between them they hold five of the nine
    operations and, on a `forced` engine, 10.9 of the 20.0 points of machining available. **Measured
    on a Supra**: a scrap stock block and a scrap stock head still read exactly **324 PS**, while
    the same two slots machined on their original castings read **359 PS**. The slots that reward
    the machinist most are the slots whose condition the base term ignores entirely.

12. **The whole per-slot table was re-authored, and the ceiling moved further than anything else in
    this file.** The race sums including forced induction are now **0.65 / 0.88 / 1.30** against
    0.63 / 0.85 / 0.95, so a `forced` engine's ceiling went from x1.95 to **x2.30**, which is the
    largest single movement any of the five stats has taken. The two engines the old cap was
    measurably low for now land where they should: the 2JZ reads **745 PS** at race against a real
    built band of 700 to 900, and the RB26 **644** against 600 to 800. Three cars the rise inflates
    (FD 587, Impreza 575, SW20 561) are accepted rather than unresolved.

    **The street and sport columns are NOT a uniform rescale of race, and that is the load-bearing
    part.** A uniform rescale was tried first and broke the pricing guards loudly: it put a street
    ECU at 2.1 times the power per yen of anything else on a boosted car, which is the
    one-correct-first-purchase defect `partPricing.test.ts` exists to catch. Keeping each slot's own
    grade shape, with `forcedInduction`'s column pinned to its price ladder's ratios and the other
    seven absorbing the slack, fixes it with **no price movement at all**: the four probes measure
    1.137 against a 1.35 bound, 0.641 against 0.50, 0.141 against 0.25, and 0.003 against 0.005.
