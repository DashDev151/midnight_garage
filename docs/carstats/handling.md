# Handling

What actually makes the handling stat, read off the code rather than off any design document.
Where a design document disagrees with the code, the code is documented here and the disagreement
is written down under Findings.

Everything marked **measured** was produced by running the shipped sim over all 26 cars in
`packages/content/data/cars.json`. Everything marked **read** was taken off the source or the
content JSON.

---

## 1. The headline formula

`packages/sim/src/derivedStats.ts`, `computeDerivedStats`, verbatim:

```ts
const handlingFraction = weightedBandFactorForStat(instance, model, 'handling', partsTaxonomy, economy)
const compound = effectiveCompound(instance, model, partsById, grip)
const downforce = effectiveDownforce(instance, model, partsById, aero)
const physical = physicalConditionFactors(instance, model, partsTaxonomy, economy)
const build = buildFactors(instance, partsById, economy)
const mintHandling =
  gripToDisplay(
    effectiveGrip(model, compound, grip, aero, physical.grip * build.grip),
    downforce.downforceCoeff * physical.aero,
    grip,
    aero,
  ) -
  grip.balance.weight * Math.abs(balanceOf(model, grip))
const handling = mintHandling * handlingFraction
// ...
handling: Math.round(clamp(handling, 0, 100)),
```

In words, and with every symbol named:

```text
mu          = effectiveGrip(model, compound, physical.grip * build.grip)   // performance.ts
dfCoeff     = effectiveDownforce(car, model).downforceCoeff * physical.aero // performance.ts
gEff        = mu * min(1 + aero.downforceK * dfCoeff * (200/3.6)^2, aero.maxGripMultiplier)
display     = piecewise-linear map of gEff onto 0..100, clamped to [0, 100]
balancePen  = grip.balance.weight * |balanceOf(model)|
handling    = round(clamp((display - balancePen) * handlingFraction, 0, 100))
```

**There is no additive per-part term.** `statModifiers.handling` does not exist: it is absent from
`StatModifierSchema` (`packages/content/src/stats.ts`), absent from the sim, and absent from all
472 SKUs. `StatModifierSchema` carries `style` and `powerFraction` and nothing else. A part reaches
handling only by moving grip or downforce, or by its own condition.

The two supporting functions live in `packages/sim/src/performance.ts`: `gripToDisplay` (the 0-100
map, including the aero multiplier at the reference speed) and `effectiveGrip` (mechanical grip,
including the condition and build factors). `handlingFraction` comes from
`weightedBandFactorForStat` in `derivedStats.ts`.

---

## 2. What the number means

**Handling is how much lateral grip the car has at 200 km/h, with a small deduction for how far
its weight balance sits from neutral.** Not agility, not steering feel, not brakes: cornering
grip. A player raises it by fitting stickier tyres, by fitting suspension that grips better, by
bolting on aero the body can actually work, and by keeping the suspension and the rubber in good
condition. A tatty car reads low however it is specified, because the whole number is multiplied
by how worn its suspension, tyres, brakes and aero are.

---

## 3. Every input

Four independent things multiply or subtract into the result. Nothing else reaches it.

### 3a. Mechanical grip, `mu`

`effectiveGrip(model, compound, grip, aero, physical.grip * build.grip)`:

```
formulaStockMu = computeGrip(model, model.spec.tyreCompound)
stockMu        = measured lateral fit ?? formulaStockMu
mu             = stockMu * (computeGrip(model, compound) / formulaStockMu) * conditionFactor
```

| Input | Scope | Where it comes from | Size of effect |
|---|---|---|---|
| `spec.lateralG97` / `spec.lateralG193` | per car | `cars.json` | When present, the 97 km/h reading (less its own downforce share) IS the car's stock grip; the formula supplies only the ratio a tyre change moves it by. 17 of 26 shipped cars carry a pair; the other 9 run on the formula alone. |
| Era rubber band | per car | `economy.json` `statFormulas.grip.eraRubberBands`, keyed on `spec.yearFrom` | 0.72 mu before 1968 rising to 0.93 before 2008, default 0.98. Only reaches the number through the ratio when a car is measured; it is the whole base when it is not. |
| Tyre compound tier | per car and per part | `statFormulas.grip.tierDelta` | eco -0.04, touring -0.02, performance 0, sport +0.02, grand +0.075, slick +0.20, added to the era mu. |
| Fitted tyre grade | per part | `effectiveCompound`, via `statFormulas.grip.gradeToCompound` | stock keeps `spec.tyreCompound`; street maps to `performance`, sport to `sport`, race to `slick`. **Measured**: race tyres alone are worth +18 to +26 displayed points on the shipped roster. |
| Tyre section width | per car | `spec.stockTyre`, first three-digit group; fallback 160 mm | `statFormulas.grip.width`: up to -0.03 or +0.045 mu against a 200 mm reference, itself scaled 0.4 to 1.0 by how good the rubber is. No part changes it; a wider tyre is not purchasable. |
| Centre-of-mass height and track | per car | `spec.comHeightMm` (fallback 460 mm), `Kei` tag and tyre width via `trackOf` | `statFormulas.grip.transfer`: a factor clamped to [0.80, 1.00]. A tall narrow car loses up to 20 per cent of its mu. |
| Drivetrain and engine position | per car | layout tag, `spec.activeYaw` | `statFormulas.grip.layout`: +3.5 per cent for active-yaw AWD (ATTESA, AYC), +2.0 per cent for passive AWD, +1.5 per cent for a mid engine, nothing otherwise. |
| `physical.grip` (condition) | per band | `physicalConditionFactors`, `statFormulas.condition.bandFactor.grip` | Weighted mean over `physicalWeights.grip`: tyres 3, dampers 2, springs 2, anti-roll bars 2, steering 1, rims 1 (total 11). Curve: mint 1.00, fine 0.96, worn 0.88, poor 0.74, scrap 0.55; a MISSING part counts as 0. |
| `build.grip` (specification) | per part | `buildFactors`, each SKU's `physicalModifiers.grip` scaled by `statFormulas.condition.gradeBandFactor[grade][band]` | Only four slots carry a grip modifier at all: dampers, springs and anti-roll bars at 1.010 / 1.020 / 1.029 (street / sport / race), and chassis at 1.016 / 1.033 / 1.050. **Measured**: the product of all four at race grade and mint is exactly 1.1440, the largest mechanical build factor available. |

`gradeBandFactor` is the wear interpolation on a fitted modifier: `effective = 1 + (modifier - 1) *
gradeBandFactor[grade][band]`. Race is the harshest row (mint 1.00, fine 0.80, worn 0.52, poor
0.25, scrap 0.05), stock the value-side curve exactly. A worn race coilover therefore delivers less
of its own advantage than a mint street one.

### 3b. Downforce

`effectiveDownforce(car, model, partsById, aero).downforceCoeff * physical.aero`, then applied as
`aeroGripMultiplier` at the reference speed.

| Input | Scope | Where it comes from | Size of effect |
|---|---|---|---|
| Factory downforce | per car | The speed-dependent half of the measured lateral fit (`aeroFit`), else `spec.downforceCoeff`, else 0 | **Measured**: 15 of 26 shipped cars carry a non-zero figure, spanning 0.0837 (MR2 SW20, Fairlady Z) to 1.0038 (Honda City E). |
| Fitted aero-functional SKU | per part | `statFormulas.aero.byGrade` | Downforce coefficient 0 / 0.10 / 0.40 / 1.20 for stock / street / sport / race. A fitted aero-functional part REPLACES the factory figure outright rather than adding to it. A cosmetic SKU in the aero slot leaves the factory figure alone. |
| `spec.aeroCeiling` | per car | `cars.json` and the roster CSV, required, 0 to 1 | Multiplies a FITTED part's downforce only, never the factory figure and never the drag. Authored for all 94 roster rows; range 0.20 to 1.00 on both the roster and the 26 shipped cars. **Measured**: a race wing is worth +4 displayed points on the Wagon R (0.20) and +17 on the FD (1.00). |
| `physical.aero` (condition) | per band | `statFormulas.condition.bandFactor.aero` | Weighted mean over `physicalWeights.aero`: aero 3, panels 1, underbody 1 (total 5). Curve: mint 1.00, fine 0.98, worn 0.93, poor 0.84, scrap 0.68. **Measured**: scrap panels and underbody together cost 2.07 raw points on the City E, 0.75 on the S14 and exactly 0 on the eleven cars with no downforce at all. |
| `aero.downforceK`, `displayReferenceSpeedKmh` | global | `economy.json` | 6.2e-05 and 200 km/h, so the multiplier is `1 + 0.19136 * coeff` at the readout's reference speed. **Measured**: one unit of downforce coefficient is worth 19.1 per cent more grip on the readout. |
| `aero.maxGripMultiplier` | global | `economy.json`, 2.5 | Caps the multiplier. **Measured**: it would need a coefficient of 7.84 at the reference speed and the largest available is 1.20, so it never binds on the handling readout. |

### 3c. The display curve

`statFormulas.grip.displayCurve`, spent by `gripToDisplay`. Two linear segments, then a clamp to
[0, 100]. The three authored points:

| Point | Effective g | Displayed |
|---|---|---|
| `stockLow` | 0.66 | 10 |
| `stockHigh` | 1.10 | 55 |
| `modifiedHigh` | 1.60 | 100 |

**Measured** slopes: 102.27 points per g below 1.10 g, 90.00 points per g above it. The curve
crosses zero at 0.5622 g and is clamped there, so anything below that reads 0 with no resolution
left. Sample values (**measured**): 0.60 g reads 3.86, 0.80 g reads 24.32, 1.00 g reads 44.77,
1.25 g reads 68.50, 1.40 g reads 82.00, 1.60 g and above read 100.

### 3d. The balance penalty

`grip.balance.weight * Math.abs(balanceOf(model, grip))`, subtracted from the display value before
the condition fraction multiplies it.

`balanceOf` reads `spec.weightDistributionFront` (fallback 55), then adds -1 for FWD, +0.7 for RWD,
+1 for a rear engine and +0.35 for a mid engine, clamped to [-3, +3]. `balance.weight` is 1, so the
penalty is the absolute balance in displayed points.

**Measured** across the 26 shipped cars: 0.32 (Cefiro, Aristo) to 2.50 (Alto Works). It is a
per-model constant. No part, no condition and no build changes it.

### 3e. The condition fraction

`weightedBandFactorForStat(car, model, 'handling', ...)`: a weighted mean of the value-side band
curve (`economy.json` `bands.bandFactors`: mint 1.00, fine 0.85, worn 0.65, poor 0.40, scrap 0.15,
missing 0) over the taxonomy's own `statWeights.handling` column.

| Slot | `statWeights.handling` | Share of the fraction |
|---|---|---|
| tyres | 3 | 21.4 per cent |
| dampers | 2 | 14.3 per cent |
| springs | 2 | 14.3 per cent |
| antiRollBars | 2 | 14.3 per cent |
| steering | 2 | 14.3 per cent |
| brakePadsDiscs | 1 | 7.1 per cent |
| brakeCalipersLines | 1 | 7.1 per cent |
| aero | 1 | 7.1 per cent |
| **total** | **14** | |

No other slot in `parts-taxonomy.json` carries a handling weight. None of these eight can be
legitimately absent (the only legitimately-absent slot in the game is `forcedInduction` on an NA
car, which carries no handling weight), so the denominator is always 14.

This is a straight multiplier on the whole result, balance penalty included. An all-mint car reads
1.00; an all-worn car 0.65; an all-scrap car 0.15.

### 3f. Per-slot sensitivity, measured

Nissan Silvia K's S14, every other slot mint stock, base handling 39:

| Slot changed | At scrap | Removed entirely |
|---|---|---|
| tyres | 22 | 10 |
| dampers | 27 | 18 |
| springs | 27 | 18 |
| antiRollBars | 27 | 18 |
| steering | 30 | 26 |
| rims | 35 | 30 |
| aero | 35 | 33 |
| brakePadsDiscs | 36 | 36 |
| brakeCalipersLines | 36 | 36 |
| panels | 38 | 37 |
| underbody | 38 | 37 |
| chassis | 39 | 39 |
| gearbox, paint, seats, block | 39 | 39 |

---

## 4. The bounds

All **measured**, all 26 shipped cars, every slot at the stated grade and band.

| State | Range across the roster |
|---|---|
| Stock, every part mint | 12 (Wagon R) to 41 (Honda City E), mean 29.7 |
| Stock, every part worn | 2 to 18 |
| Stock, every part scrap | 0 on all 26 |
| Race suspension, brakes and steering, mint | 23 to 55 |
| The above plus race tyres, mint | 45 to 84 |
| The above plus a race wing, mint | 49 to 94 |
| Race grade in every slot that has one, mint | 49 to 94 (identical to the row above) |
| Race grade everywhere, worn | 20 to 44 |

**The floor is 0 and it is easy to reach.** An all-scrap car reads exactly 0 on every shipped car,
because the display curve has already clamped to 0 well before the condition fraction is applied.
Removing the suspension or the tyres outright reads 0 on the weaker cars.

**The ceiling is 94 and 100 is unreachable.** The display curve needs 1.60 g to read 100. The best
combination in shipped content is the FD RX-7 on slicks with a race wing, all mint: mechanical grip
1.2559, downforce coefficient 1.200, effective grip 1.5444 at the reference speed, displayed 94.99,
less a 0.95 balance penalty, rounded to **94**. The R32 GT-R reaches the same 94.

**Mechanical grip really does top out near 1.25, and aero is the only way past it.** The highest
mechanical grip any shipped car can be built to is **1.2566** (Fairlady Z Z32 and MR2 SW20, race
suspension and slicks, all mint). Mechanical grip alone therefore cannot exceed a displayed 69
before the balance penalty; every point above that comes from downforce. This matches
`car-performance/README.md` section 7g's stated acceptance target, that an aggressively winged
build should reach an effective grip of 1.5 or a little more.

---

## 5. What does NOT affect handling

- **Power, torque, weight and drag.** Not one of `stockPowerPs`, `powerFraction`, `curbWeightKg`,
  `physicalModifiers.mass` or `dragCd` appears anywhere in the handling expression. A twin-turbo
  conversion moves handling by exactly 0. So does a full carbon weight-saving build.
- **Braking.** `physicalModifiers.braking` never reaches handling. **Measured**: a race big brake
  kit and a race steering rack together move handling by exactly 0 on all 26 cars, compared like
  for like against the same suspension build without them. Their CONDITION still matters, through
  `statWeights.handling`.
- **The drag a wing costs.** `effectiveDownforce` returns a `dragCdDelta` alongside the downforce
  and handling reads only the downforce. A wing that makes the car slower down a straight still
  raises the handling readout.
- **Any additive per-part number.** There is no `statModifiers.handling` to author.
- **Market value.** `marketValueYen` takes no stats at all. Handling reaches money only through
  `valuation.ts`'s buyer taste multiplier, bounded to `[1 - tasteSpread, 1 + tasteSpread]`.
- **Every engine, drivetrain and interior slot.** block, internals, head, cams, intake, exhaust,
  fuel, ignition, cooling, forced induction, gearbox, clutch, differential, driveline, seats, dash,
  paint: all carry zero handling weight and zero grip weight, and none of their SKUs carries a grip
  modifier. **Measured**: scrapping or removing any of them leaves handling unchanged.
- **`spec.styleCeiling`, `spec.reliabilityBase`, `spec.styleBase`.** Different stats entirely.
- **Diagnosis.** `computeDerivedStats` reads each part's TRUE `band`. `apparentBandByPartId` never
  reaches it, so the handling readout on an undiagnosed car is the honest number, not the
  player's current belief about it.
- **Mileage, year, colour, provenance and rarity.** None appears in the expression.

---

## 6. Where the content levers live

| Lever | File | Key |
|---|---|---|
| The 0-100 map, its two segments and the reference speed | `packages/content/data/economy.json` | `statFormulas.grip.displayCurve` |
| Era rubber, compound tiers, grade-to-compound mapping, width, weight transfer, layout bonuses, track | `economy.json` | `statFormulas.grip.*` |
| The balance model and its weight | `economy.json` | `statFormulas.grip.balance` |
| Downforce per aero grade, the drag that comes with it, `downforceK`, the multiplier cap | `economy.json` | `statFormulas.aero` |
| The four physical dial curves (grip and aero are the two handling reads) | `economy.json` | `statFormulas.condition.bandFactor` |
| Per-grade wear on a fitted modifier | `economy.json` | `statFormulas.condition.gradeBandFactor` |
| The value-side band curve the condition fraction runs on | `economy.json` | `bands.bandFactors` |
| Which slots' condition counts, and how much | `packages/content/data/parts-taxonomy.json` | `statWeights.handling` |
| Which slots' condition moves the physics | `parts-taxonomy.json` | `physicalWeights.grip`, `physicalWeights.aero` |
| What a fitted SKU is worth mechanically | `packages/content/data/parts.json` | `physicalModifiers.grip` |
| Which SKUs are aero-functional | `parts.json` | `aeroFunctional` |
| Per-car aero potential | `docs/design/midnight-garage-roster.csv` and `packages/content/data/cars.json` | `aeroCeiling` |
| Per-car measured grip and downforce | roster CSV and `cars.json` | `lateralG97`, `lateralG193`, `downforceCoeff` |
| Per-car balance, centre of mass, tyre | roster CSV and `cars.json` | `weightDistributionFront`, `comHeightMm`, `stockTyre`, `tyreCompound` |
| Who cares about handling and how much | `packages/content/data/buyers.json` | `statTargets.handling` |

Every one of these is maintainer-gated under directive 22.

---

## 7. Findings

**1. Two design documents still describe the deleted additive path as live.**
`docs/design/systems/tuning-system.md` opens by listing "the aero ceiling and the handling deletion
(Sprint 140)" under "What is still a proposal", and its section 2 still states that the data model
"Can" express "absolute deltas to handling". Both are false: `statModifiers.handling` is gone from
the schema, the sim and all 472 SKUs, and `spec.aeroCeiling` is a required schema field that
`effectiveDownforce` reads on every car. The document's own header says each shipped sprint's doc
wins where they disagree, but a reader who stops at the status line gets the wrong answer.

**2. The Honda City E has the highest stock handling on the roster.** **Measured**: 41, against the
FD RX-7 and the S14 at 39 and the R32 GT-R at 38. The cause is content, not code. Its measured
lateral pair (0.86 g at 97 km/h, 0.97 g at 193 km/h) fits to a downforce coefficient of **1.0038**,
the largest factory figure on the roster and 84 per cent of what a race wing delivers to an FD. The
readout is quoted at 200 km/h and the City E's published top speed is 141 km/h, so its handling
number is grip at a speed the car physically cannot reach. `aeroFit` applies no speed sanity check,
and a 193 km/h lateral reading exists for a car that cannot reach 193 km/h. Worth a look at the
source figure before the readout is trusted for that car.

**3. Fitting an aero part can LOWER handling, and often does.** `effectiveDownforce` REPLACES the
factory coefficient rather than adding to it, so a fitted part is a downgrade whenever
`byGrade[grade].downforceCoeff * aeroCeiling` is less than what the body already made.
**Measured**: a street lip kit is a net handling loss on 11 of the 26 shipped cars and neutral on
7 more; a sport wing loses on 2; a race wing loses on 1, the City E, which drops from 41 to 30.
The design doc frames the wrong-car case as paying drag for nothing, which understates it: on a
car with real measured factory aero, the part also takes downforce away.

**4. A big brake kit does nothing for handling, and a race steering rack does nothing either.**
`brakePadsDiscs`, `brakeCalipersLines` and `steering` carry `statWeights.handling` of 1, 1 and 2,
so their CONDITION moves the number, but no SKU in any of the three slots carries a
`physicalModifiers.grip`. **Measured**: adding race brakes and a race steering rack to a race
suspension build moves handling by exactly 0 on all 26 cars. A player who fits brakes expecting the
handling bar to move will see nothing, which is at odds with brakes appearing in handling's own
weight column.

**5. The taxonomy's handling column is not the list of parts that move handling.** Two slots move
it while carrying no handling weight at all. `rims` carries `physicalWeights.grip` of 1 but no
`statWeights.handling`, so its condition reaches handling through the physics only (**measured**:
scrap rims cost the S14 4 points, missing rims 9). `chassis` carries neither weight, yet its
aftermarket SKUs carry the largest `physicalModifiers.grip` in the catalogue at 1.050, so a fitted
race chassis raises handling while a scrap or missing STOCK chassis changes it by exactly 0.

**6. Body damage reaches handling, faintly, and only on cars that make downforce.** `panels` and
`underbody` carry `physicalWeights.aero`, and `bodyPipeline.ts`'s `syncBodyBands` writes the
zone-derived bands into `car.parts`, so panel and floor damage scales the downforce coefficient.
**Measured**: scrapping both is worth 2.07 raw points on the City E, 0.75 on the S14 and exactly 0
on the eleven cars with no factory downforce.

**7. 100 is unreachable in shipped content.** The curve needs 1.60 g; the best build reaches
1.5444 g for a displayed 94. This is deliberate per `car-performance/README.md` 7f and 7g (the band
top was chosen for the range a player can reach, and the aero grade above `race` that would use the
rest of it has never been authored), but it means the top 6 points of the scale are dead until that
part exists.

**8. The racer buyer's taste target is out of reach for 7 of the 26 cars.** `buyers.json` gives the
racer a handling target of 0.75, that is 75 points, at importance 0.9. **Measured** best-possible
handling puts the Wagon R at 49, the Carina, Sunny B12, Alto Works and City Turbo II at 61, the
Cefiro at 73 and the Civic SiR-II at 74. No build satisfies a racer on those cars.

**9. The balance penalty is scaled by condition, which reads backwards.** The penalty is subtracted
BEFORE the condition fraction multiplies, so an all-scrap car pays 15 per cent of its balance
penalty and a mint car pays all of it. A worn car does not become better balanced. The effect is
under 2.2 points on every shipped car, so this is a note rather than a problem.

**10. The `grand` tyre compound is unreachable.** `statFormulas.grip.tierDelta` authors `grand` at
+0.075, but `gradeToCompound` maps street, sport and race to `performance`, `sport` and `slick`
only, and no car on either the 26-car shipped set or the 94-row roster CSV carries
`tyreCompound: grand`. Nothing in the game can ever be computed at that tier. Dead content value.

**11. `aero.maxGripMultiplier` never binds on the handling readout.** **Measured**: at the 200 km/h
reference it would take a downforce coefficient of 7.84 and the largest available anywhere is 1.20.
It is a live lever in the lap model, where the speeds are higher, but it cannot touch this stat.

**12. The handling readout is quoted at a speed most of the roster cannot reach.** 200 km/h is
above the published top speed of every kei car and several entry cars. For the 11 cars with no
downforce this changes nothing, since the multiplier is 1 regardless. For the 15 that carry a
measured factory figure it means the displayed number is grip in a regime some of them never enter.
