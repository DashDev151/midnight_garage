# Reliability

What the number is made of, exactly as the code computes it. Every figure below is either read
off the source (marked "source") or measured by running the shipped code (marked "measured").

## The headline formula

`reliabilityBreakdownOf` in `packages/sim/src/derivedStats.ts` is the whole derivation.
`computeDerivedStats`, in the same file, reads its `reliability` field and rounds it; nothing
else derives reliability anywhere.

```text
base            = model.spec.reliabilityBase

conditionFactor = min( weightedBandFactorForStat(car, 'reliability'),
                       reliabilitySeverityCeiling(car) )

coherenceFactor = min(1, supportVerdict(car).headline / support.thresholds.adequateAtOrAbove)
                  ** support.coherenceExponent

intensityFactor = clamp(1 - support.stressCoefficient * totalGainFractionOf(car)
                          - machining.reliabilityCostPerOperation * machiningOperationCountOf(car),
                        0, 1)

budget          = clamp(conditionFactor + coherenceFactor - 1, 0, 1)

reliability     = base * budget * intensityFactor

stat            = round(clamp(reliability, 0, 100))
```

The three factors come from three different places: `conditionFactor` from the taxonomy's
`statWeights.reliability` column and the band curve, `coherenceFactor` from `supportVerdict`
(`packages/sim/src/support.ts`), `intensityFactor` from `totalGainFractionOf` (same file).

### The four-term identity

`ReliabilityBreakdown` also returns the loss split the dyno sheet shows, and

```text
reliability + conditionLossPoints + coherenceLossPoints + intensityLossPoints === base
```

holds exactly. The three loss terms are:

```text
shortfall           = (1 - conditionFactor) + (1 - coherenceFactor)
share               = shortfall > 0 ? (1 - budget) / shortfall : 0

conditionLossPoints = base * intensityFactor * (1 - conditionFactor) * share
coherenceLossPoints = base * intensityFactor * (1 - coherenceFactor) * share
intensityLossPoints = base * (1 - intensityFactor)
```

`share` is exactly 1 whenever the `budget` clamp is not biting, so the plain decomposition
(loss = base x intensity x shortfall, plus the intensity term) is what you get in the normal
case. When the two shortfalls together exceed the whole budget, the clamp floors reliability at
zero and `share` scales the two shortfall terms down to the amount of budget there actually was
to lose, so the identity survives the clamp.

**Measured:** 3,250 combinations (26 shipped cars x 5 build shapes x 5 uniform bands x 5 defect
variants) give a maximum absolute error of 2.8e-14 on that identity, which is floating-point
noise and nothing else.

**Re-measured with machining in the intensity term**, over a fresh sweep that varies the machining
record as well: 1,560 combinations (26 shipped cars x 4 grades x 5 uniform bands x 3 machining
states, from unmachined through a partial engine to all nine operations) give a maximum absolute
error of **2.84e-14**, the same order of floating-point noise. **The identity still holds exactly,
and machining did not need a fourth loss term to make it hold.** It is folded into
`intensityLossPoints` rather than added beside the three, which is why the dyno's three rows and
`displayedReliabilitySplit`'s three-element arithmetic were untouched by the whole feature.

**The four DISPLAYED integers reconcile too.** `displayedReliabilitySplit`
(`packages/sim/src/dyno.ts`) hands out whole points by largest remainder against what the rounded
stat leaves to explain, rather than rounding each term on its own. **Measured** over the same
3,250 combinations: the stat plus its three displayed losses equal the car's base exactly in every
one, with a worst deviation of 0. See finding 4.

## In plain language

Reliability is how likely this car is to get you home. It starts at whatever the car was when it
left the factory, and three things take it down: the state the parts are in now, whether the
build asks more of the car than the fitted hardware can support, and how much extra power the
build makes at all. A stock, mint car reads its own factory number exactly. Nothing ever reads
higher.

## Every input

### 1. `spec.reliabilityBase` (per car)

The ceiling nothing exceeds and the scale everything else multiplies. A required field on
`CarModel.spec` (`packages/content/src/carModel.ts`), authored per car for all 94 roster rows in
the `reliabilityBase` column of `docs/design/midnight-garage-roster.csv`, and validated `0..100`
by the schema. The authored band is 65 to 100 and its axis is age and engineering culture rather
than price.

**Measured spread, all 94 roster rows:**

| tier | rows | min | median | mean | max |
| --- | --- | --- | --- | --- | --- |
| flagship | 31 | 65 | 86 | 83.1 | 95 |
| enthusiast | 26 | 66 | 88 | 86.6 | 97 |
| everyday | 19 | 82 | 93 | 92.4 | 98 |
| entry | 18 | 88 | 96.5 | 95.1 | 100 |

The extremes: 65 for the Mazda Cosmo Sport 110S and the Lamborghini Countach LP5000 QV, 100 for
the Toyota Carina AT150 and the Toyota Corolla AE91. The 26 cars currently in `cars.json` span 80
(Mazda RX-7 FD3S) to 100 (Carina). `packages/content/tests/rosterCsvGuard.test.ts` asserts every
shipped car's `reliabilityBase` against the CSV row, and pins the 65 to 100 band for all 94.

Because everything else multiplies this number, the same defect costs a flagship fewer points
than an entry car in absolute terms and exactly the same fraction. One weight-3 part at scrap
takes a base-100 car to 40 and a base-80 car to 32.

### 2. The condition mean (`weightedBandFactorForStat`, per part, per band)

A weighted mean over the parts taxonomy: for every slot carrying a non-zero
`statWeights.reliability`, that weight times `economy.bands.bandFactors[band]`, divided by the
total weight. Source: `weightedBandFactor` and `weightedBandFactorForStat` in `derivedStats.ts`.

Band factors (`economy.json`, `bands.bandFactors`, global): mint 1.00, fine 0.85, worn 0.65,
poor 0.40, scrap 0.15. A MISSING part contributes a 0 factor while still counting its full
weight, which is worse than scrap. A legitimately absent slot (the `forcedInduction` slot on a
car with no factory forced induction, per `isPartMissing`) drops out of both the numerator and
the denominator.

The 21 weight-carrying slots (`packages/content/data/parts-taxonomy.json`, per part):

| weight | slots |
| --- | --- |
| 3 | cooling |
| 2 | block, internals, headValvetrain, gearbox, chassis, steering, brakeCalipersLines, tyres |
| 1 | camsTiming, intake, exhaust, fuelSystem, ignitionEcu, forcedInduction, clutch, differential, driveline, springs, brakePadsDiscs, underbody |

Total weight 31. The eight slots at zero (dampers, antiRollBars, rims, panels, paint, aero,
seats, dashGauges) cannot move reliability by any amount, in any band, ever.

**Measured, single part moved off mint on a base-100 car with all 31 weight present** (unrounded
points lost):

| weight | to fine | to worn | to poor | to scrap |
| --- | --- | --- | --- | --- |
| 1 | 0.484 | 1.129 | 10.000 | 20.000 |
| 2 | 0.968 | 2.258 | 20.000 | 40.000 |
| 3 (cooling) | 1.452 | 3.387 | 30.000 | 60.000 |

The `fine` and `worn` columns are the mean at work. The `poor` and `scrap` columns are round
numbers because the mean has stopped mattering there; see the ceiling below.

The smallest movement the system can produce is a weight-1 part going mint to fine. **Measured:**
0.4839 points on a base-100 car, 0.3871 on the base-80 FD3S, where the displayed integer does not
move at all (79.613 rounds back to 80).

### 3. The severity ceiling (`reliabilitySeverityCeiling`, per part, per band)

A cap on the condition mean rather than part of it, taken as the MINIMUM across every
reliability-bearing part of

```text
partCap = 1 - (1 - reliabilityCeilingBaseFor(band)) * min(1, statWeights.reliability / reliabilityCeilingWeightReference)
```

`reliabilityCeilingBaseFor` returns `condition.reliabilityCeiling.scrap` (0.40) at scrap,
`condition.reliabilityCeiling.poor` (0.70) at poor, and 1 at worn, fine and mint.
`reliabilityCeilingWeightReference` is 3, the taxonomy's own highest reliability weight, so
relevance is `weight / 3` for every part in shipped content. A missing part counts as scrap; a
legitimately absent slot is skipped.

| weight | cap at poor | cap at scrap |
| --- | --- | --- |
| 1 | 0.90 | 0.80 |
| 2 | 0.80 | 0.60 |
| 3 | 0.70 | 0.40 |

**This term, not the mean, decides the condition factor for almost every damaged car.** A single
weight-1 part at poor gives a mean of 0.981 and a cap of 0.90, and 0.90 is what the car runs on.
Measured behaviour on a base-100 car:

| car | conditionFactor | reliability |
| --- | --- | --- |
| one weight-1 part at poor | 0.90 | 90.0 |
| three weight-1 parts at poor | 0.90 | 90.0 |
| one weight-3 part at poor | 0.70 | 70.0 |
| one weight-3 part at poor plus three weight-1 at poor | 0.70 | 70.0 |
| one weight-3 part at scrap | 0.40 | 40.0 |
| every weighted part at scrap | 0.15 | 15.0 |

The ceiling is a minimum, so **it does not stack**: three ruined light parts cap the car exactly
as hard as one does. The mean only takes over again once enough parts have fallen that the mean
itself drops below the cap, which on a uniformly aged car happens at poor (mean 0.40 against a
0.70 cap) and scrap (0.15 against 0.40).

### 4. The coherence factor (`coherenceFactorFor`, per build)

```text
coherenceFactor = min(1, headline / adequateAtOrAbove) ** coherenceExponent
```

with `adequateAtOrAbove` 0.90 and `coherenceExponent` 2 (`economy.json`,
`statFormulas.support`, global). At or above the adequate knee this is exactly 1: competence is
the baseline, never a bonus, and the `min(1, ...)` means no build is ever more reliable than
stock.

`headline` is `supportVerdict(...).headline`, the **weakest link**: the minimum of five
per-subsystem ratios (`supportRatios`, `packages/sim/src/support.ts`), each
`support[s] / demand[s]`, with ties broken in `SubsystemSchema` order so the named subsystem is
deterministic.

```text
demand[s]  = 1 + demandWeights[s] * driverGain(s)
support[s] = 1 + stockSupportMargin * (demand[s] - 1) + sum(supportWeights[s][slot] * specByGrade[grade of slot])
```

- `driverGain(s)` is either the whole car's total gain fraction or one named slot's gain, chosen
  by `demandDrivers[s]` (content, not code): cylinderPressure reads the `forcedInduction` slot,
  revs reads `camsTiming`, and fuelling, heat and torqueTransmission read the total.
- `demandWeights` (global): cylinderPressure 2.0, fuelling 0.8, heat 0.7, revs 3.5,
  torqueTransmission 0.9.
- `specByGrade` (global): stock 0, street 0.25, sport 0.60, race 1.0. Support reads the fitted
  GRADE only and never the band, because specification does not decay: a worn forged rod is still
  stronger than a stock cast one.
- `supportWeights` (global): cylinderPressure from internals 0.45 and block 0.25; fuelling from
  fuelSystem 0.75; heat from cooling 0.70; revs from headValvetrain 0.25 and internals 0.15;
  torqueTransmission from clutch 0.30, gearbox 0.25, driveline 0.15, differential 0.15.
- `stockSupportMargin` 0.27 is the factory headroom, proportional to what the build actually
  demands. On a stock car every gain is 0, so every demand is exactly 1, the margin term is
  `0.27 * 0` regardless of its value, every spec is 0, and every ratio is exactly 1.0.

Because the headline is a minimum, **support fitted to a subsystem that was not the weak link
buys nothing at all.** Measured on the 180SX with a race turbo fitted: the weak link is cylinder
pressure at 0.6350, and adding a race cooling system, fuel system, clutch, gearbox, driveline and
differential leaves the headline at 0.6350 and the reliability stat at 41, unchanged. Those six
parts are supporting subsystems that were never binding.

**Measured lowest coherence factor reachable** (every gain slot at race, nothing supporting it):
0.4540 on a forced-induction car (headline 0.6064), 0.5665 on a lazy naturally aspirated car
(0.6774), 0.6589 on a high-strung naturally aspirated car (0.7306). That build maximises demand
and leaves the bottom end unsupported, so it is the lowest headline the shipped catalogue can
construct.

### 5. The build-intensity factor (`reliabilityIntensityFactor`, per build)

```text
intensityFactor = clamp(1 - stressCoefficient * totalGainFraction
                          - reliabilityCostPerOperation * machiningOperationCount, 0, 1)
```

`stressCoefficient` is 0.20 (`economy.json`, `statFormulas.support`, global).
`totalGainFraction` is `totalGainFractionOf`: the sum of every fitted SKU's
`statModifiers.powerFraction[engineCharacter]` across all 29 slots, reading the fitted GRADE only
and never the band. It is exactly 0 on a stock car.

`machiningOperationCount` is `machiningOperationCountOf` (`packages/sim/src/machining.ts`): how many
machining operations are recorded across every part on the car, and `reliabilityCostPerOperation` is
**0.004** (`economy.json`, `machining`, global). It is exactly 0 on an unmachined car, so the
stock-car-reads-its-base identity still holds by construction, on both terms at once.

This is an OUTER multiplier, structurally separate from coherence: even a perfectly supported
build moves more energy through the car than stock did and pays for it in proportion to how much
more power it makes, not to how well it is supported.

**The two subtractions are additive and never compound**, which is what stops the machining charge
being levied twice. A machining gain deliberately does NOT enter `totalGainFractionOf`: that sum and
this count describe the same thing, more energy through every part, so charging both would charge
one engine twice and make the small lever misleading. Measured, on all three engine characters, a
full nine-operation engine takes exactly **0.036** off the factor whatever else is fitted:

| car | build | intensity | intensity, fully machined | reliability |
| --- | --- | ---: | ---: | --- |
| Wagon R (high-strung NA, base 98) | stock | 1.0000 | **0.9640** | 98.00 to 94.47 |
| Wagon R | race, unsupported | 0.9100 | **0.8740** | 68.64 to 65.92 |
| City E (lazy NA, base 99) | stock | 1.0000 | **0.9640** | 99.00 to 95.44 |
| City E | race, unsupported | 0.8800 | **0.8440** | 59.54 to 57.10 |
| 180SX (forced, base 92) | stock | 1.0000 | **0.9640** | 92.00 to 88.69 |
| 180SX | race, unsupported | 0.7400 | **0.7040** | 30.91 to 29.40 |

So a fully machined engine costs **3.6 per cent of the car's own base**, and the whole of what
machining does to reliability lands here. Nothing else in the derivation reads it.

`engineCharacter` (`engineCharacterOf`) picks which `powerFraction` column every fitted part
reads. It is `forced` when the MODEL's `spec.aspiration` is anything but `NA`, otherwise
`high-strung-na` or `lazy-na` by specific output against
`statFormulas.engineCharacter.naHighStrungThreshold`. It is a property of the car, resolved once,
never of the fitted parts.

**Measured, every gain slot at race:** total gain 1.30 on a forced car (intensity 0.740), 0.88 on
a lazy-NA car (intensity 0.824) and 0.65 on a high-strung NA car (intensity 0.870). So the
intensity term alone costs a maximal build between 13 and 26 per cent of its base.

**Measured:** exactly eight of the 29 slots carry a non-zero `powerFraction` anywhere in the
shipped catalogue (block, internals, headValvetrain, camsTiming, intake, exhaust, ignitionEcu,
forcedInduction). The other 21, which includes cooling, fuelSystem, clutch, gearbox, driveline
and differential and every suspension, wheel, body and interior slot, are 0 at every grade, so
fitting them changes total gain by nothing. A mint car with all six of the named support slots at
race grade reads exactly its own base: measured on the Carina (100), the 180SX (92) and the FD
(80).

### 6. Rounding

`computeDerivedStats` returns `round(clamp(reliability, 0, 100))`. The upper clamp is
unreachable: the schema caps `reliabilityBase` at 100 and every factor is at most 1. The lower
clamp is real and reachable (see bounds).

## The bounds

**Ceiling: exactly `spec.reliabilityBase`, per car.** Reached by a stock mint car, and also by
any all-mint build made only of zero-gain parts. Measured on all 26 shipped cars, and pinned in
`packages/sim/tests/reliabilityModel.test.ts`.

**Floor: exactly 0, on every car.** Measured: a build with every gain slot at race, no support
fitted anywhere, and every part at scrap reads 0 on all 26 shipped cars; so does a car with every
part missing. The floor is genuinely load-bearing there, not idle clamping: the pre-clamp budget
on that build is negative.

**Measured intermediate points, per car** (all figures the rounded stat):

| state | value | Carina (100) | 180SX (92) | FD (80) |
| --- | --- | --- | --- | --- |
| stock, mint | base | 100 | 92 | 80 |
| stock, all fine | 0.85 x base | 85 | 78 | 68 |
| stock, all worn | 0.65 x base | 65 | 60 | 52 |
| stock, all poor | 0.40 x base | 40 | 37 | 32 |
| stock, all scrap | 0.15 x base | 15 | 14 | 12 |
| stock mint, cooling poor | 0.70 x base | 70 | 64 | 56 |
| stock mint, cooling scrap | 0.40 x base | 40 | 37 | 32 |
| every part missing | 0 | 0 | 0 | 0 |
| fully supported race build, mint | varies | 82 | 68 | 59 |
| maximal unsupported race build, mint | varies | 47 | 31 | 27 |
| maximal unsupported race build, all scrap | 0 | 0 | 0 | 0 |

Getting to the floor takes both halves at once: condition alone bottoms out at 0.15 of base
(everything scrap, but present), and coherence alone bottoms out at 0.454, and
`budget = conditionFactor + coherenceFactor - 1` needs those two to sum below 1.0 before the
clamp bites.

## What does NOT affect it

- **The car's power.** Reliability never gates or reduces power, and power never appears in the
  reliability formula except through `powerFraction`, which is read as a demand figure. See the
  section below.
- **Mileage, model year, tier, price, rarity, culture.** None appear in the derivation. Mileage
  reaches value and generation, never this stat.
- **A part's GRADE, inside the condition mean.** The mean uses `bands.bandFactors`, which is
  grade-blind. **Measured:** a car with a full race engine build at worn and a fully stock car at
  worn both read `conditionFactor` 0.650000. (The grade-sensitive curve,
  `condition.gradeBandFactor`, belongs to `buildFactors` and the physical dials, not here.)
- **`physicalModifiers`** (grip, braking, mass) and the four `condition.bandFactor` dial curves.
  Those are the performance model; nothing in them reaches reliability.
- **`statModifiers.style`** and the whole style and authenticity pipeline.
- **The eight zero-weight slots**: dampers, antiRollBars, rims, panels, paint, aero, seats,
  dashGauges. A scrap bodykit, scrap paint, scrap wheels or a scrap dashboard move this number by
  exactly nothing.
- **`support.thresholds.strainedAtOrAbove`** (0.75). It picks warning copy and the verdict's band
  label; only `adequateAtOrAbove` enters the coherence factor.
- **The player's knowledge of the car.** The derivation reads `installed.band`, the true band.
  `apparentViewOf` (`packages/sim/src/diagnosis.ts`) exists for auction pricing and the lot card's
  group bands and grade, and no reliability figure is computed from it.
- **Repair labour, tools, crew, reputation, the calendar.** Nothing time-based or shop-based
  touches this stat. There is no wear rate and no service interval: condition only changes when
  something in the sim changes a part's band.
- **WHICH machining operations were done, as opposed to how many.** The intensity term reads a
  COUNT. Nine operations cost the same 0.036 whichever nine they are, and O-ringing a deck costs
  exactly as much here as boring a block does, despite one making no power at all. Machining
  reaches this stat a second way, through coherence, and there the identity of the operation is
  everything: an operation's own `spec` lifts its slot's support contribution. **Measured** on a
  fully machined race build, though, coherence did not move at all (0.7697 / 0.6834 / 0.4540 before
  and after, on the three characters), because at race grade those slots were already supplying
  their subsystem and the weakest link was elsewhere. Machining support pays when it lands on the
  weakest link and not otherwise, exactly as bought support does.

### The thing readers get wrong: an unsupported build makes its full power

**Verified, in code and by measurement.** `computeDerivedStats` builds power as

```text
power = stockPowerPs * (powerConditionFloor + (1 - powerConditionFloor) * powerConditionFraction)
      + sum over fitted parts of  stockPowerPs * powerFraction[engineCharacter] * bandFactor(band)
```

There is no support term, no coherence term and no headline anywhere in it. `supportVerdict` is
imported into `derivedStats.ts` for the reliability derivation alone.

**Measured on the 180SX at mint:** stock 157 PS. With a race turbo fitted and nothing supporting
it (headline 0.6350, verdict `dangerous`) it makes 236 PS and reads 41 reliability. With every
gain slot at race and no support at all (headline 0.6064, `dangerous`) it makes 361 PS, 130 per
cent over stock, and reads 31 reliability.

So the game's answer is: **you get the power, and you pay for it in reliability and in what the
car is worth.** Coherence is the same factor `marketValue.ts` uses for its coherence discount and
its parts-retention scaling, read from the same `supportVerdict`, so an incoherent build is
punished twice (once here, once at the till) and gated nowhere.

## Where the content levers live

| lever | file | key |
| --- | --- | --- |
| per-car ceiling | `docs/design/midnight-garage-roster.csv` (source of truth, all 94) and `packages/content/data/cars.json` | `reliabilityBase` / `spec.reliabilityBase` |
| condition weights, per slot | `packages/content/data/parts-taxonomy.json` | `statWeights.reliability` |
| band curve | `packages/content/data/economy.json` | `bands.bandFactors` |
| severity ceiling | `economy.json` | `statFormulas.condition.reliabilityCeiling.poor` / `.scrap` |
| ceiling relevance reference | `economy.json` | `statFormulas.condition.reliabilityCeilingWeightReference` |
| coherence knee and curve | `economy.json` | `statFormulas.support.thresholds.adequateAtOrAbove`, `statFormulas.support.coherenceExponent` |
| factory headroom | `economy.json` | `statFormulas.support.stockSupportMargin` |
| demand shape | `economy.json` | `statFormulas.support.demandWeights`, `statFormulas.support.demandDrivers` |
| support shape | `economy.json` | `statFormulas.support.supportWeights`, `statFormulas.support.specByGrade` |
| build-intensity rate | `economy.json` | `statFormulas.support.stressCoefficient` |
| machining charge, per operation | `economy.json` | `machining.reliabilityCostPerOperation` (0.004) |
| per-SKU demand and gain | `packages/content/data/parts.json` | `statModifiers.powerFraction`, `grade` |
| engine-character split | `economy.json` | `statFormulas.engineCharacter.naHighStrungThreshold` |

What guards each of them:

- **Everything in `economy.json`** (rows 3 to 10 and 12 above) is covered by a sha256 hash of the
  whole file in `packages/content/tests/economyApprovalGate.test.ts`, whose header records the
  approval for each value by name. Moving one is a maintainer-gated change (CLAUDE.md directive
  22) and re-pinning happens in the same change as the recorded approval.
- **`spec.reliabilityBase`** is pinned twice: as an exact 26-entry table in
  `packages/sim/tests/reliabilityModel.test.ts`, and against the roster CSV row for every shipped
  car in `packages/content/tests/rosterCsvGuard.test.ts`, which also holds all 94 rows inside the
  65 to 100 band.
- **`statModifiers.powerFraction`** is not hashed either: `packages/content/tests/powerFraction.test.ts`
  guards its shape, its coverage and which slots carry it, and
  `packages/content/tests/partPricing.test.ts` guards price per unit of fraction, while the
  race-grade values themselves are recorded by name in the approval gate's ledger header.
- **`statWeights.reliability`** has no hash and no pinned table. `parts-taxonomy.json` is not one
  of the four files the approval gate hashes, and the reliability tests derive the weights from
  content rather than asserting them, so most of the suite would follow a weight change rather
  than catch it. The one accidental tripwire is the grenade test's hard-coded reference to
  cooling's weight of 3.

## Findings

1. **The severity ceiling, not the weighted mean, is what decides the condition factor on almost
   every damaged car.** Any single reliability-bearing part at poor or scrap caps the car at 0.90
   down to 0.40 of its base, and the mean (which would read 0.94 to 0.99 for a single defect) is
   discarded. The mean only regains control when a car is uniformly aged to poor or worse. Two
   consequences worth knowing before tuning anything: the cap does not stack, so **repairing
   light damaged parts while a heavier one is still poor changes the displayed number by exactly
   zero**; and the jump from worn to poor on one weight-3 part is worth 26.6 points on a
   base-100 car (3.39 to 30.00), the sharpest discontinuity anywhere in the stat.

2. **Support spent on the wrong subsystem is worth nothing.** The headline is a minimum, so six
   race-grade support parts can leave both the headline and the stat bit-for-bit unchanged
   (measured: 0.6350 and 41 before and after, on the 180SX with a race turbo). This is correct
   under the weakest-link design, but it means a player who buys "some support" without reading
   the dyno sheet can spend a lot of money for no movement at all.

3. **The design docs that disagreed with the code have been corrected.** The question was whether
   any of them still described a formula the sim does not run. **Read**, all three:
   - `docs/design/systems/tuning-system.md` now gives `spec.reliabilityBase *
     clamp(conditionFactor + coherenceFactor - 1, 0, 1) * intensityFactor`, which is the shipped
     derivation term for term. `reliabilityCap` appears only in its amendment log, recording that
     the flat ceiling became per car; there is no such key in `economy.json`.
   - The "absolute deltas to handling, style, reliability and authenticity" line is gone from the
     same document. `statModifiers.reliability` does not exist and its name is banned by
     `packages/content/tests/retiredIdentifiers.test.ts`.
   - `docs/design/midnight-garage-roster.md` section 3b now states that a built car reads below
     its base however coherent it is, because the build-intensity term charges for the power
     itself, and cites the Carina figure. **Measured**, unchanged: a fully supported race build
     reads 82 on the base-100 Carina and 59 on the base-80 FD.

4. **The dyno sheet's four displayed integers always sum to the base.** They did not, when each of
   the four was rounded on its own: the Honda City E (base 99) on a maximal unsupported build at
   mint carries exact losses of 0, 35.367 and 17.424 against a stat of 46, and rounding those three
   independently gives 46 + 0 + 35 + 17 = **98**. The sheet asked the player to distrust the
   arithmetic rather than the build.

   **Which car and band show the gap is a property of the power curve rather than of the
   arithmetic**, so the worked example moves when the catalogue's fractions do. **Measured** on the
   shipped catalogue, a maximal build disagrees under independent rounding on 18 of the 26 cars at
   one band or more, and the 180SX this example used to cite is no longer one of them: at poor it
   carries 35.644, 32.436 and 23.920, which reconciles at 92 either way.

   `displayedReliabilitySplit` (`packages/sim/src/dyno.ts`) now hands out whole points by largest
   remainder against what the ROUNDED stat has actually left to explain, so each figure is its own
   value rounded except for the odd point the roundings disagree over, which goes to whichever loss
   came closest to earning it. **Measured**: that same City E case reads **99**, and over 3,250
   combinations (26 cars x 5 build shapes x 5 bands x 5 defect variants) the four displayed figures
   reconcile to the base in every one, with a worst deviation of 0. `gameStore.ts` spreads the
   result rather than rounding anything itself, so the sheet and the stat cannot drift apart.

5. **The condition mean's denominator is not the same on every car.** It is 31 when the
   `forcedInduction` slot is occupied and 30 on a naturally aspirated car whose slot is
   legitimately empty, because that slot drops out of both sums. Every other part's condition
   share is therefore about 3.3 per cent larger on an NA car. Measured: one cooling part at fine
   gives `conditionFactor` 0.985484 with the slot filled and 0.985000 with it empty.

6. **No SKU in the catalogue carries `requiredTags`,** so an aftermarket turbo can be fitted to a
   naturally aspirated car. `engineCharacterOf` reads the MODEL's own `spec.aspiration`, so such a
   car still reads
   `high-strung-na` or `lazy-na`, and the fitted turbo therefore contributes its NA
   `powerFraction` column to power, to cylinder-pressure demand and to build intensity. Whether
   that fit should be possible is a content question, not a reliability one, but the reliability
   consequences are real and currently silent.

7. **A full race drivetrain is free.** Every SKU on cooling, fuelSystem, clutch, gearbox,
   driveline and differential carries `powerFraction` 0 at every grade, so fitting all six at
   race grade leaves total gain at 0, intensity at 1, coherence at 1 and reliability at exactly
   the car's base. Measured on three cars. The only way to lose reliability by fitting parts is
   to fit something that makes power.

8. **The smallest possible move is invisible.** A weight-1 part going mint to fine costs 0.3871
   points on the base-80 FD, which rounds back to the same displayed integer. Anything smaller
   than roughly half a point cannot be seen in the stat, though it is real in the unrounded value
   the dyno sheet's split is computed from.

9. **An unresolvable part id is counted twice differently.** `weightedBandFactor` and
   `reliabilitySeverityCeiling` read `installed.band` without resolving the SKU, so an unknown
   part still contributes its condition; `slotContribution` and `buildFactors` resolve the SKU and
   contribute nothing when they cannot. So a broken part id would move condition but not demand,
   support or intensity. No shipped content is in that state.

10. **`statFormulas.reliabilityCap` is fully retired,** not merely unread: it is absent from
    `economy.json` and from the schema, its absence is asserted by
    `packages/sim/tests/reliabilityModel.test.ts`, and the name is banned across all three
    packages by `packages/content/tests/retiredIdentifiers.test.ts`.

11. **The taxonomy's reliability weights are the one unguarded lever in the derivation.** The
    approval gate hashes `economy.json`, `damagePatterns.json`, `partPricing.json` and the
    mission payouts, and nothing hashes `parts-taxonomy.json`. Editing
    `statWeights.reliability` moves the condition mean and every severity cap on every car in
    the game, and the reliability suite reads those weights out of content rather than
    asserting them, so it would mostly follow the change rather than fail on it.
