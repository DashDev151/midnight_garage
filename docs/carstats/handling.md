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
const { condition: physical, build } = physicalFactorsFor(instance, model, partsById, partsTaxonomy, economy)
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

`physicalFactorsFor`, in the same file, is where the build's grip factor is assembled and where
the share of the gain the car cannot put down comes off it:

```ts
const condition = physicalConditionFactors(car, model, partsTaxonomy, economy)
const build = buildFactors(car, partsById, economy)
const usable = usableGripFraction(car, model, partsById, economy, condition, build)
return { condition, build: { ...build, grip: build.grip * usable } }
```

In words, and with every symbol named:

```text
buildGrip   = buildFactors(car).grip          // the raw product of every fitted SKU's own modifier
usable      = usableGripFraction(car, model)  // support.ts, section 3c; 1 on a stock car
mu          = effectiveGrip(model, compound, physical.grip * buildGrip * usable)   // performance.ts
dfCoeff     = effectiveDownforce(car, model).downforceCoeff * physical.aero // performance.ts
gEff        = mu * min(1 + aero.downforceK * dfCoeff * (200/3.6)^2, aero.maxGripMultiplier)
display     = piecewise-linear map of gEff onto 0..100, clamped to [0, 100]
balancePen  = grip.balance.weight * |balanceOf(model)|
handling    = round(clamp((display - balancePen) * handlingFraction, 0, 100))
```

**There is no additive per-part term.** `statModifiers.handling` does not exist: it is absent from
`StatModifierSchema` (`packages/content/src/stats.ts`), absent from the sim, and absent from all
472 SKUs (**measured**: zero SKUs carry a `handling` key). `StatModifierSchema` carries `style` and
`powerFraction` and nothing else. A part reaches handling only by moving grip or downforce, by
supporting the grip the build already makes, or by its own condition.

The supporting functions live in `packages/sim/src/performance.ts` (`gripToDisplay`, the 0-100 map
including the aero multiplier at the reference speed; `effectiveGrip`, mechanical grip including
the condition and build factors) and `packages/sim/src/support.ts` (`usableGripFraction`).
`handlingFraction` comes from `weightedBandFactorForStat` in `derivedStats.ts`.

---

## 2. What the number means

**Handling is how much lateral grip the car has at 200 km/h and can actually use, with a small
deduction for how far its weight balance sits from neutral.** Not agility, not steering feel:
cornering grip, minus the part of it the fitted brakes, steering and shell cannot put down. A
player raises it by fitting stickier tyres, by fitting suspension that grips better, by bolting on
aero the body can actually work, by fitting brakes, a rack and a chassis good enough to cope with
what the rest of the build makes, and by keeping all of it in good condition. A tatty car reads low
however it is specified, because the whole number is multiplied by how worn its suspension, tyres,
brakes and aero are.

---

## 3. Every input

Five independent things multiply or subtract into the result. Nothing else reaches it.

### 3a. Mechanical grip, `mu`

`effectiveGrip(model, compound, grip, aero, physical.grip * build.grip)`, where `build.grip`
already carries the support loss of 3c:

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
| Fitted tyre grade | per part | `effectiveCompound`, via `statFormulas.grip.gradeToCompound` | stock keeps `spec.tyreCompound`; street maps to `performance`, sport to `sport`, race to `slick`. **Measured**: race tyres on their own are worth +12 to +18 displayed points (median +13.5), and +23 to +32 (median +26) once the brakes, steering and chassis are at race grade too. |
| Tyre section width | per car | `spec.stockTyre`, first three-digit group; fallback 160 mm | `statFormulas.grip.width`: up to -0.03 or +0.045 mu against a 200 mm reference, itself scaled 0.4 to 1.0 by how good the rubber is. No part changes it; a wider tyre is not purchasable. |
| Centre-of-mass height and track | per car | `spec.comHeightMm` (fallback 460 mm), `Kei` tag and tyre width via `trackOf` | `statFormulas.grip.transfer`: a factor clamped to [0.80, 1.00]. A tall narrow car loses up to 20 per cent of its mu. |
| Drivetrain and engine position | per car | layout tag, `spec.activeYaw` | `statFormulas.grip.layout`: +3.5 per cent for active-yaw AWD (ATTESA, AYC), +2.0 per cent for passive AWD, +1.5 per cent for a mid engine, nothing otherwise. |
| `physical.grip` (condition) | per band | `physicalConditionFactors`, `statFormulas.condition.bandFactor.grip` | Weighted mean over `physicalWeights.grip`: tyres 3, dampers 2, springs 2, anti-roll bars 2, steering 1, rims 1 (total 11). Curve: mint 1.00, fine 0.96, worn 0.88, poor 0.74, scrap 0.55; a MISSING part counts as 0. |
| `build.grip` (specification) | per part | `buildFactors`, each SKU's `physicalModifiers.grip` scaled by `statFormulas.condition.gradeBandFactor[grade][band]` | Only four slots carry a grip modifier at all: dampers, springs and anti-roll bars at 1.010 / 1.020 / 1.029 (street / sport / race), and chassis at 1.016 / 1.033 / 1.050. **Measured**: the RAW product of all four at race grade and mint, before the loss below, is exactly 1.1440, the largest mechanical build factor available. |
| `usable` (support) | per build | `usableGripFraction`, `statFormulas.chassisSupport` | Section 3c. A multiplier on the raw product above, exactly 1 on a stock car and on a fully supported build. **Measured**: 0.8638 to 0.8924 on an unsupported race build. |

`gradeBandFactor` is the wear interpolation on a fitted modifier: `effective = 1 + (modifier - 1) *
gradeBandFactor[grade][band]`. Race is the harshest row (mint 1.00, fine 0.80, worn 0.52, poor
0.25, scrap 0.05), stock the value-side curve exactly. A worn race coilover therefore delivers less
of its own advantage than a mint street one.

### 3b. Downforce

`effectiveDownforce(car, model, partsById, aero).downforceCoeff * physical.aero`, then applied as
`aeroGripMultiplier` at the reference speed.

| Input | Scope | Where it comes from | Size of effect |
|---|---|---|---|
| Factory downforce | per car | The speed-dependent half of the measured lateral fit (`aeroFit`), else `spec.downforceCoeff`, else 0 | **Measured**: 15 of 26 shipped cars carry a non-zero figure, spanning 0.0837 (MR2 SW20, Fairlady Z) to 1.0038 (Honda City E). It is a FLOOR: nothing a player fits can take it away. |
| Fitted aero-functional SKU | per part | `statFormulas.aero.byGrade` | Downforce coefficient 0 / 0.10 / 0.40 / 1.20 for stock / street / sport / race, **added to** the factory figure: `factoryDownforceCoeff + byGrade[grade].downforceCoeff * spec.aeroCeiling`. A cosmetic SKU in the aero slot leaves the factory figure alone. |
| `spec.aeroCeiling` | per car | `cars.json` and the roster CSV, required, 0 to 1 | Scales what a FITTED part ADDS, never the factory floor and never the drag. Authored for all 94 roster rows; range 0.20 to 1.00 on both the roster and the 26 shipped cars. **Measured**: a race wing takes the Wagon R (ceiling 0.20, no factory downforce) from a coefficient of 0 to 0.24, and the FD (ceiling 1.00, factory 0.2476) from 0.2476 to 1.4476. |
| Drag, `dragCdDelta` | per part | `statFormulas.aero.byGrade` | 0 / 0.01 / 0.04 / 0.09 by grade, **unscaled by the ceiling** and arriving in full on every car. It is what makes a wing on a body that cannot use it a straight loss on a lap; it never reaches the handling readout. |
| `physical.aero` (condition) | per band | `statFormulas.condition.bandFactor.aero` | Weighted mean over `physicalWeights.aero`: aero 3, panels 1, underbody 1 (total 5). Curve: mint 1.00, fine 0.98, worn 0.93, poor 0.84, scrap 0.68. **Measured**: scrap panels and underbody together cost 2.07 raw points on the City E, 0.75 on the S14 and exactly 0 on the eleven cars with no downforce at all. |
| `aero.downforceK`, `displayReferenceSpeedKmh` | global | `economy.json` | 6.2e-05 and 200 km/h, so the multiplier is `1 + 0.19136 * coeff` at the readout's reference speed. **Measured**: one unit of downforce coefficient is worth 19.1 per cent more grip on the readout. |
| `aero.maxGripMultiplier` | global | `economy.json`, 2.5 | Caps the multiplier. **Measured**: it would need a coefficient of 7.84 at the reference speed and the largest reachable anywhere in shipped content is 1.5388, so it never binds on the handling readout. |

### 3c. The chassis-support loss

`usableGripFraction` in `packages/sim/src/support.ts`, applied to `build.grip` by
`physicalFactorsFor` and nowhere else. **A proportion of the grip a build GAINED is unusable while
the parts that control it sit below the grade of the parts that made it**, and the proportion rises
with how hard the build is.

```text
required = the highest grade fitted across tyres, dampers, springs, antiRollBars, aero
missing  = the summed share of every support slot fitted below `required`
gain     = builtEffectiveGrip - factoryEffectiveGrip, both at the car's OWN condition band
usable   = clamp(1 - gain * lossByGrade[required] * missing / builtEffectiveGrip, 0, 1)
```

| Input | Scope | Where it comes from | Value |
|---|---|---|---|
| Which slots set `required` | global, code | `GRIP_SLOTS` in `support.ts` | tyres, dampers, springs, antiRollBars, aero |
| `lossByGrade` | global | `economy.json` `statFormulas.chassisSupport.lossByGrade` | stock 0 (pinned by `z.literal(0)`), street 0.10, sport 0.20, race 0.35 |
| `share` | global | `statFormulas.chassisSupport.share` | brakes 0.45, steering 0.35, chassis 0.20. The brake share is split evenly across `brakePadsDiscs` and `brakeCalipersLines`, 0.225 each, so the first brake part bought is worth something. |
| What `gain` is measured in | global, code | `usableGripFraction` | EFFECTIVE grip, mu times the aero multiplier at the display curve's own reference speed, converted back to mu on the way out. A wing loads a car at speed and demands brakes and steering as rubber does, so it pays towards the bar it raises. |
| The reference the gain is read against | per car, per band | `usableGripFraction` | The car's own stock compound and factory downforce **at its current condition band**, so a rough car shows the smaller gain a rough car really makes and cannot dodge the loss by rotting. |

Three early returns carry most of the behaviour, and each is a property rather than a special case:

- `required` of `stock` gives a loss fraction of 0, so **a stock car is exactly untouched**.
- Nothing missing gives a share of 0, so **a fully supported build recovers every point**.
- Non-positive gain returns untouched, so **a downgrade passes through whole**. **Measured**: the
  FD3S, Supra RZ and Aristo left the factory on rubber better than a street SKU maps to, and street
  tyres take them from 39 to 37, 38 to 36 and 29 to 27 with the model in force or switched off.

**Measured**, all 26 cars, handling points lost by a build with nothing supporting it:

| grip parts at | min | median | max |
|---|---:|---:|---:|
| street | 0 | 0 | 1 |
| sport | 1 | 3 | 3 |
| race | 11 | 15 | 19 |

**Measured**, what one support purchase returns on an unsupported build, min / median / max:

| purchase | on a sport build | on a race build |
|---|---|---|
| brake pads and discs alone | 0 / 1 / 1 | 3 / 3 / 5 |
| both brake slots | 0 / 1 / 2 | 5 / 7 / 9 |
| steering | 0 / 1 / 1 | 4 / 5 / 7 |
| chassis | 2 / 3 / 4 | 6 / 7 / 9 |
| all four slots | 4 / 6 / 7 | 16 / 21 / 25 |

Support is a race-build concern by design: a sport build has gained little, so there is little of
it to lose. **The grade ladder cannot invert**, because a proportion of a larger gain is still
larger. **Measured**: an unsupported race build still beats a fully supported sport one by 8 to 18
points (median 14) on every one of the 26.

**Measured**, rot is not an exit, on the Silvia S13's unsupported race build (the figure with the
model switched off in brackets): mint 67 (83), fine 51 (64), worn 32 (40), poor 12 (16).

### 3d. The display curve

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

### 3e. The balance penalty

`grip.balance.weight * Math.abs(balanceOf(model, grip))`, subtracted from the display value before
the condition fraction multiplies it.

`balanceOf` reads `spec.weightDistributionFront` (fallback 55), then adds -1 for FWD, +0.7 for RWD,
+1 for a rear engine and +0.35 for a mid engine, clamped to [-3, +3]. `balance.weight` is 1, so the
penalty is the absolute balance in displayed points.

**Measured** across the 26 shipped cars: 0.32 (Cefiro, Aristo) to 2.50 (Alto Works). It is a
per-model constant. No part, no condition and no build changes it.

### 3f. The condition fraction

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

### 3g. Per-slot sensitivity, measured

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

This is a STOCK car, so the support term is inert on every row: the changes here are condition
alone. What a fitted brake, steering or chassis GRADE is worth is 3c.

---

## 4. The bounds

All **measured**, all 26 shipped cars, every slot at the stated grade and band.

| State | Range across the roster |
|---|---|
| Stock, every part mint | 12 (Wagon R) to 41 (Honda City E), mean 29.7 |
| Stock, every part worn | 2 to 18 |
| Stock, every part scrap | 0 on all 26 |
| Race suspension, brakes and steering, mint | 18 to 49, mean 37.0 |
| The above plus race tyres, mint | 38 to 75, mean 57.4 |
| The above plus a race wing, mint | 42 to 90, mean 72.5 |
| Race grade in every slot that has one, mint | 49 to 99, mean 81.5 |
| Race grade everywhere, worn | 20 to 48 |

The three middle rows leave the chassis stock, so `chassis`'s 0.20 of the shortfall is charged at
the race rate throughout them. The row below them fits a race chassis, which both clears that
shortfall and adds the largest grip modifier in the catalogue, and it is the only handling-relevant
difference between the two: every other slot a full race build adds carries neither a grip modifier
nor a support share.

**The floor is 0 and it is easy to reach.** An all-scrap car reads exactly 0 on every shipped car,
because the display curve has already clamped to 0 well before the condition fraction is applied.
Removing the suspension outright reads 0 on all 26; removing the tyres alone reads 0 on 5 of them
(Wagon R, Carina, Sunny B12, Alto Works, City Turbo II).

**The ceiling is 99, and the display curve's own top is now reached.** The best combination in
shipped content is the FD RX-7 on slicks with a race wing and every support slot at race, all
mint: mechanical grip 1.2559, downforce coefficient 1.4476, effective grip **1.6039** at the
reference speed. That is past the curve's `modifiedHigh` of 1.60, so `gripToDisplay` clamps at 100
and the 0.95 balance penalty is the entire reason the stat reads **99**. The R32 GT-R does the same
from the other direction: mechanical grip 1.2533, coefficient 1.5388, effective grip 1.6224,
clamped to 100, less a 0.88 penalty, **99**. **Measured: exactly 2 of the 26 cars clamp the
curve**; the other 24 stop short of 1.60 g on their best build.

**Mechanical grip really does top out near 1.25, and aero is the only way past it.** The highest
mechanical grip any shipped car can be built to is **1.2566** (Fairlady Z Z32 and MR2 SW20, race
suspension, slicks and full support, all mint). Mechanical grip alone therefore cannot exceed a
displayed 69 before the balance penalty; every point above that comes from downforce. This matches
`car-performance/README.md` section 7g's stated acceptance target, that an aggressively winged
build should reach an effective grip of 1.5 or a little more.

---

## 5. What does NOT affect handling

- **Power, torque, weight and drag.** Not one of `stockPowerPs`, `powerFraction`, `curbWeightKg`,
  `physicalModifiers.mass` or `dragCd` appears anywhere in the handling expression. **Measured**:
  an S14 with all eight power slots at race grade reads exactly its stock 39, and so does the same
  car with every engine, drivetrain and interior slot at scrap.
- **A part's `physicalModifiers.braking`.** It reaches the lap model and never this stat. Brakes
  reach handling only through their GRADE, and only on a build that has made grip for them to
  support (3c). **Measured**: a race big brake kit and a race steering rack together still move
  handling by exactly 0 on all 26 cars when nothing else is fitted, because a stock car's
  `required` grade is `stock` and the loss is pinned at 0 there.
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
- **Machining, in every respect.** All four machinable slots (block, internals, head and valvetrain,
  cams and timing) already carry zero handling weight and zero grip weight, so the operations done to
  them cannot reach this stat by any route. **Verified rather than assumed**: on all 26 shipped cars,
  at stock grade and at race grade, applying all nine operations left handling identical in **52 of
  52 cases**, and `physicalFactorsFor` returns a byte-identical set of factors machined against
  unmachined on all three engine characters. Machining moves power and nothing else the physics
  reads.
- **`spec.styleCeiling`, `spec.reliabilityBase`, `spec.styleBase`.** Different stats entirely.
- **`spec.aspiration` and the induction tags.** They decide engine character and whether an empty
  forced-induction slot is a defect. Neither reaches this stat.
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
| How much of a build's gain missing support costs, and how the shortfall splits | `economy.json` | `statFormulas.chassisSupport.lossByGrade`, `statFormulas.chassisSupport.share` |
| The four physical dial curves (grip and aero are the two handling reads) | `economy.json` | `statFormulas.condition.bandFactor` |
| Per-grade wear on a fitted modifier | `economy.json` | `statFormulas.condition.gradeBandFactor` |
| The value-side band curve the condition fraction runs on | `economy.json` | `bands.bandFactors` |
| Which slots' condition counts, and how much | `packages/content/data/parts-taxonomy.json` | `statWeights.handling` |
| Which slots' condition moves the physics | `parts-taxonomy.json` | `physicalWeights.grip`, `physicalWeights.aero` |
| What a fitted SKU is worth mechanically | `packages/content/data/parts.json` | `physicalModifiers.grip` |
| Which SKUs are aero-functional | `parts.json` | `aeroFunctional` |
| Per-car aero potential | `docs/design/midnight-garage-roster.csv` and `packages/content/data/cars.json` | `aeroCeiling` |
| Per-car measured grip and downforce | roster CSV and `cars.json` | `lateralG97`, `lateralG193` (`spec.downforceCoeff` is a schema fallback the CSV has no column for and no shipped car sets) |
| Per-car balance, centre of mass, tyre | roster CSV and `cars.json` | `weightDistributionFront`, `comHeightMm`, `stockTyre`, `tyreCompound` |
| Who cares about handling and how much | `packages/content/data/buyers.json` | `statTargets.handling` |

Which slots set `required` and which carry the shortfall is code (`GRIP_SLOTS` and `BRAKE_SLOTS` in
`support.ts`), not content, so a new grip or support slot is a code change as well as a value one.

Every content lever above is maintainer-gated under directive 22.

---

## 7. Findings

**1. The design documents that described the deleted additive path now agree with the code.**
`docs/design/systems/tuning-system.md` records the per-car `spec.aeroCeiling` and the deletion of
the additive handling path under what is BUILT, its section 11 verdict table names
`StatModifierSchema` as two fields with handling derived, and the claim that the data model can
express "absolute deltas to handling" is gone. **Read**: `statModifiers.handling` is absent from
the schema, the sim and all 472 SKUs, and `spec.aeroCeiling` is a required schema field that
`effectiveDownforce` reads on every car. The question this finding asked is closed and the answer
is that the code was right.

**2. The Honda City E has the highest stock handling on the roster.** **Measured**: 41, against the
S14 and the FD RX-7 at 39, and the Supra RZ and R32 GT-R at 38. The cause is content, not code. Its
measured lateral pair (0.86 g at 97 km/h, 0.97 g at 193 km/h) fits to a downforce coefficient of
**1.0038**, the largest factory figure on the roster, and 84 per cent of what a race wing adds to
an FD. The readout is quoted at 200 km/h and the City E's published top speed is 141 km/h, so its
handling number is grip at a speed the car physically cannot reach. `aeroFit` applies no speed
sanity check, and a 193 km/h lateral reading exists for a car that cannot reach 193 km/h. Worth a
look at the source figure before the readout is trusted for that car.

**3. Fitting an aero part can no longer LOWER handling, and what a wing costs moved from downforce
to support.** `effectiveDownforce` used to REPLACE the factory coefficient, so a fitted part was a
downgrade whenever `byGrade[grade].downforceCoeff * aeroCeiling` came in under what the body
already made: a street lip kit was a net loss on 11 of the 26 cars and a race wing dropped the City
E from 41 to 30. It now ADDS to the factory figure, which is a floor. **Measured across all 78
car-and-grade combinations: no fitted aero part lowers the downforce coefficient on any car, and
none lowers the handling readout below stock either.** The City E now reads 41 / 42 / 45 at street
/ sport / race against its stock 41.

What a wing costs instead is the chassis-support loss and its drag. A bare race wing raises the
`required` grade to race with nothing supporting it, so it is charged at the race rate: **measured**
+2 to +14 displayed points (median +9) fitted alone, and +7 to +26 (median +19) once the brakes,
steering and chassis are at race grade. The drag is unscaled by `aeroCeiling` and arrives in full,
so a wing on a body that makes nothing from it is still a bad idea on a lap, which is what the
per-car ceiling exists to say. The readout itself never sees drag; see section 5.

**4. A big brake kit and a race steering rack are worth real handling points, and only on a build
that made grip for them to support.** They still carry no `physicalModifiers.grip` and never will:
a steering rack does not create grip, it lets a car use grip it already has. **Measured on an
otherwise stock car**: race brakes and a race steering rack together move handling by exactly 0 on
all 26, because a stock car's `required` grade is `stock` and `lossByGrade.stock` is pinned at 0.
**Measured on an unsupported race build**: both brake slots return 5 to 9 points and the rack 4 to
7, on every one of the 26, and the first brake part bought is worth 3 to 5 on its own rather than
nothing. On a race SUSPENSION build with stock tyres and no wing the pair is worth 2 to 3.

So the answer to the old question, why brakes carry handling condition weight when no brake SKU can
contribute to handling, is that they are SUPPORT: their condition scales the number through
`statWeights.handling` and their grade decides how much of the build's gain the car can put down.
Neither route is a grip modifier.

**5. The taxonomy's handling column is still not the list of parts that move handling.** Two slots
move it while carrying no handling weight at all. `rims` carries `physicalWeights.grip` of 1 but no
`statWeights.handling`, so its condition reaches handling through the physics only (**measured**:
scrap rims cost the S14 4 points, missing rims 9). `chassis` carries neither weight, yet it reaches
handling twice over: its aftermarket SKUs carry the largest `physicalModifiers.grip` in the
catalogue at 1.050 (**measured**: a race chassis on an otherwise stock car is worth +3 to +5), and
it carries 0.20 of the support shortfall on top (**measured**: +6 to +9 on an unsupported race
build). A scrap or missing STOCK chassis still changes handling by exactly 0 (**measured** on the
S14: 39 either way).

**6. Body damage reaches handling, faintly, and only on cars that make downforce.** `panels` and
`underbody` carry `physicalWeights.aero`, and `bodyPipeline.ts`'s `applyDerivedBodyBands` writes the
zone-derived bands into `car.parts`, so panel and floor damage scales the downforce coefficient.
**Measured**: scrapping both is worth 2.07 raw points on the City E, 0.75 on the S14 and exactly 0
on the eleven cars with no factory downforce.

**7. 100 is unreachable, but the curve's own top is not.** The display curve needs 1.60 g and two
cars now pass it: the FD RX-7 at 1.6039 g and the R32 GT-R at 1.6224 g on their best builds, both
clamping `gripToDisplay` at 100. The stat still reads 99 on both, and the balance penalty (0.95 and
0.88) is the whole of the difference. So the dead range is now the last point rather than the last
six, and the binding constraint on the top of the scale has moved from the aero ladder to the
balance term. Neither penalty is as large as the point they are short of: what actually blocks 100
is the rounding margin, since 100 less 0.95 is 99.05 and 100 less 0.88 is 99.12, and both round to
99. Only a penalty of half a point or less would leave the last one standing. The two cars with the
smallest penalty on the roster (Cefiro and Aristo, 0.32) top out at 73 and 76.

**8. The racer buyer's taste target is out of reach for 7 of the 26 cars.** `buyers.json` gives the
racer a handling target of 0.75, that is 75 points, at importance 0.9. **Measured** best-possible
handling, every slot that has a race SKU at race grade and mint, puts the Wagon R at 49, the Carina,
Sunny B12, Alto Works and City Turbo II at 61, the Cefiro at 73 and the Civic SiR-II at 74. No build
satisfies a racer on those cars. The same seven cars, at the same seven numbers, failed before the
aero and support changes: **measured**, all seven carry zero factory downforce, so a fitted wing
adding to the factory figure rather than replacing it is a no-op on them, and a fully supported
build takes no support loss.

**9. The balance penalty is scaled by condition, which reads backwards.** The penalty is subtracted
BEFORE the condition fraction multiplies, so an all-scrap car pays 15 per cent of its balance
penalty and a mint car pays all of it. A worn car does not become better balanced. The largest
penalty on the roster is 2.50 (Alto Works), so the effect is under 2.2 points on every shipped car
and this is a note rather than a problem. Finding 7 is where the penalty does real work.

**10. The `grand` tyre compound is unreachable.** `statFormulas.grip.tierDelta` authors `grand` at
+0.075, but `gradeToCompound` maps street, sport and race to `performance`, `sport` and `slick`
only, and no car on either the 26-car shipped set or the 94-row roster CSV carries
`tyreCompound: grand`. Nothing in the game can ever be computed at that tier. Dead content value.

**11. `aero.maxGripMultiplier` never binds on the handling readout.** **Measured**: at the 200 km/h
reference it would take a downforce coefficient of 7.84, and the largest reachable anywhere in
shipped content is 1.5388 (the R32 GT-R, its own 0.3388 plus a race wing's full 1.20). It is a live
lever in the lap model, where the speeds are higher, but it cannot touch this stat.

**12. The handling readout is quoted at a speed most of the roster cannot reach.** 200 km/h is
above the published top speed of seven shipped cars, from the Wagon R at 140 km/h to the Sera at
193. For the 11 cars with no downforce this changes nothing, since the multiplier is 1 regardless.
For the 15 that carry a measured factory figure it means the displayed number is grip in a regime
some of them never enter.
