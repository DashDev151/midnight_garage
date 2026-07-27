# The car performance model

**Status: LOCKED.** The physics, the inputs and the four courses are settled and validated against
real driven times. Changes to any of it need maintainer approval recorded here, on the same footing
as a bible.

This folder is the whole of how a car's physical behaviour is modelled. It replaces the scattered
working notes the calibration arc produced; those are in `archive/` and are history, not reference.

| File | What it is |
|---|---|
| `README.md` (this file) | the canonical document: what the model is, what it eats, how accurate it is, and what is still missing |
| `formulas.md` | the exact maths, every formula and constant |
| `forza-telemetry.md` | the measurement protocol and the source of record for captured data |
| `car-spec-book.html` | the per-car data itself, 85 cars, browsable |
| `lapsim/` | the calibration harness that runs the model, plus its dashboard |
| `data/` | the raw source scrape the spec book was built from |
| `archive/` | the arc's working notes, superseded by this document |

---

## 1. What it is, in one paragraph

A quasi-static point-mass lap simulator. It takes a car's measured physical behaviour, marches it
round a course corner by corner and straight by straight, and returns a lap time. Every car is
timed on the same four roads, so the model's real output is not one number but a **ranking with
distances between the entries**: how much faster this car is than that one, and on what kind of
road. That is what the game needs, and it is what the model has been validated to produce.

## 2. The one idea that makes it work

**A car's behaviour is measured, not derived.**

The model used to compute grip from build year, tyre width, centre-of-mass height and drivetrain
layout, compute acceleration from peak power and a launch constant, and assume braking equalled
cornering grip. Each of those was a formula standing in for a measurement, and each carried its own
error, which then had to be tuned out against lap times, which hid the errors in each other.

Now the measurements come from the game the maintainer plays, per car, off the stats panel: lateral
grip at two speeds, stopping distance from two speeds, acceleration to two speeds, top speed, power,
torque, mass and weight distribution. **Every physical quantity is solved from a PAIR of readings**,
and that is the whole trick: two measurements at two speeds carry two unknowns, so

- two lateral-g readings split **mechanical grip** from **downforce**,
- two stopping distances give a **braking coefficient** and the **dead distance** in front of it,
- two acceleration times split **launch traction** from **effective power at the wheels**.

Nothing about which half of a shortfall is which has to be assumed, argued, or fitted globally. The
car reproduces its own measurements by construction, and what is left over is the model's error and
nothing else.

Where a car has no measurements, a regression predicts the same dimensionless ratios from the
things the car does state, so the fallback answers in the same currency rather than being a second
model. Across the 85-car roster: **59 cars fully measured, 4 with one measurement and one predicted
half, 22 predicted entirely.**

## 3. What a car is to the model

| Input | Source | Feeds |
|---|---|---|
| lateral g at 97 and 193 km/h | measured, as a pair | mechanical grip coefficient and downforce coefficient |
| braking distance 97-0 and 161-0 m | measured, as a pair | braking coefficient and the dead distance |
| 0-97 and 0-161 km/h, seconds | measured, as a pair | launch acceleration and effective wheel power |
| top speed | measured | drag area, back-solved (top speed is steady state) |
| power, torque, mass, front weight % | measured | mass, the power ceiling, weight transfer |
| wheelbase, CoM height, width, height, tyre size | published spec | frontal area, transfer geometry |

**Mind the speeds: the panel does not use one pair.** Lateral g is quoted at **97 and 193** km/h;
braking and acceleration at **97 and 161**. Downforce goes as speed squared, so reading the second
lateral figure as 161 is a 44% error in that term. This has been got wrong once already.

## 4. The courses

Four, each carrying real driven laps. Nothing synthetic survives: a course with no driven time on
it was measuring nothing, so both of the invented ones were deleted.

| Course | Character | Protocol | Driven laps |
|---|---|---|---|
| Misaki | mixed circuit, 4.7 km | hotlap | 17 |
| Hakone | touge, 2.7 km, four switchbacks | standing start | 12 |
| Wangan | highway loop, 7.0 km, eight sweepers | standing start | 9 |
| Yatabe | 1 km straight, no corners | standing start | 7 |

**Hakone and Wangan are behavioural facsimiles, not surveys. Say so every time their geometry is
quoted.** No radius in either is a measured fact about a real road; both were searched to reproduce
the driven times, because the model has no racing-line term and the surveyed Hakone is unlappable
without one (it floors at 22% slow with the direction-change term switched off entirely). Only
Misaki's geometry is independent of any fit, so **only Misaki's error LEVEL measures the model**. On
the facsimiles, read the mean as a receipt for the search and the SCATTER about it as the model, since
a geometry charges every car through the same corners and cannot move a per-car residual.

Yatabe is the one course carrying a calibration offset: a flat **-3.28%** fitted on the seven driven
kilometres, contained inside the drag evaluator and structurally unable to reach a lap time.

**The overall index is weighted Misaki 0.40, Hakone 0.35, Wangan 0.20, Yatabe 0.05**, each car's
time as a ratio of the best time on that course. 1.000 means fastest everywhere.

## 5. How accurate it is

Against 45 driven reference times:

| Course | n | mean error | mean absolute error |
|---|---|---|---|
| Misaki | 17 | -0.60% | **1.78%** |
| Hakone | 12 | +0.79% | **1.42%** |
| Wangan | 9 | +0.83% | **1.82%** |
| Yatabe | 7 | -0.03% | **1.40%** |

**Read those carefully: two of the four course geometries were searched against their own driven
times, so their LEVEL is a receipt for the search, not for the model.** The number that actually
matters is what the model does on a car it has never seen, committed in writing before that car was
driven.

The cleanest such test available is the last one: a heavily modified mid-engine car, sharing nothing
with any fitted car but its grip level, predicted on all four courses and then driven. It came in at
**-0.4% / -1.2% / +1.7% / -2.1%**, worst course 2.1%. The round before it, three untouched stock cars
across three courses, came in at 1.6% / 2.3% / 1.9% mean absolute error per course. **Around 2% is
the honest headline, with about 3% as the outer bound on an extreme build.**

The high-grip region is the weakest: the six points above the roster's grip range sit at 1.57% mean
absolute error with a worst of 3.3%, and those are the points the corner-grip ceiling was fitted on,
so they are in-sample. Before that ceiling they were at 5.24% and 11.1%.

The full blind record, every committed prediction beside its driven time, is printed by the harness.

**Validated envelope.** The 85-car roster spans **38 to 560 PS, 570 to 1763 kg, and grip 0.69 to
1.08**. The driven set reaches well above that, because several of the blind tests were deliberately
extreme builds: two independently maxed road cars at grip 1.23 and 1.25, a Group A race car at 1.51,
and a heavily modified prototype at 1.70. All three drivetrains, all four course types.

**Two maxed road cars landing at 1.23 and 1.25 is worth noticing, but only about MECHANICAL grip**,
which is where the tyres and the chassis stop. It is not where a car's grip stops. Downforce rides
on top of the mechanical figure and goes much further: a maxed road car on the race aero grade
crosses an effective 1.5 at about 222 km/h, and on the downforce coefficient actually measured on a
maxed road build it crosses 1.5 by about 190 km/h. The corner-grip ceiling caps mechanical grip
only and leaves aero alone, deliberately, so nothing in the model stands between a player and the
top of the grip range. **The route there is the wing, not the tyres.**

Those two figures are also the acceptance the aftermarket ladder in section 7c is scored against, and
it clears them: a maximal legal build on the roster's quicker cars lands at a mechanical 1.21 to 1.26,
so the region two driven cars occupy is a region the game can now actually be built into.

## 6. The known limits, stated rather than buried

1. **At high grip on corner-heavy courses the model is still about 2 to 3 per cent fast.** The
   geometric corner-grip ceiling took this from 9 to 11 per cent down to 2 to 3, but not to zero, and
   the residual is one-signed across the two cars that reach that grip level. It is inside the
   accuracy bar and it is real, not scatter.
2. **The straight-line model is about 3 per cent pessimistic against a hand-driven kilometre**,
   one-signed across seven runs, and no property of any car predicts it. Six candidate mechanisms
   were priced and every one was rejected: the cars never agree on a shared parameter value. The
   likeliest reading is a protocol gap between the game's canned panel figures and a human driving
   manually, which is not physics and must not be fitted. This is why the drag strip carries a flat
   offset and the lap courses do not.
3. **Most of what is left is per-car, not per-corner.** Splitting the residuals of the ten cars
   driven on two or more courses gives a car-level rms of 2.02% against a course-varying 1.22%, so
   the car-level part owns roughly seven tenths of it. Nineteen candidate inputs were correlated
   against those car constants and **none of them explains it**.
4. **The model expresses only part of the real course-character swing.** Over the pairs driven on
   both Hakone and Wangan it reproduces 54% of the driven swing. A car that is genuinely a touge car
   reads as a touge car, but less emphatically than it should.
5. **The direction-change term is the last unphysical thing in it.** It charges seconds per corner
   scaled by geometry and divided by usable grip. A corner-exit speed penalty was built and tested as
   a replacement, because a real direction-change deficit should propagate down the following
   straight rather than being a flat charge; it improved course character and cost more level
   accuracy than it bought, so it is switched off and the additive term stands.

## 7. What is NOT built yet

This is the honest list. Everything here is outstanding work, not a caveat.

**a. The model IS in the game; what a build does to it is not.** `packages/sim/src/performance.ts`
runs this document's physics, `packages/content/data/courses.json` ships these four geometries, and
`packages/sim/tests/harnessAcceptance.test.ts` is the standing proof: it times every shipped car on
every shipped course against the harness's own answers and holds them to a tenth of a second. The
handling readout, the reference-lap board and the story missions' lap ceilings all run on it. One
deliberate omission from the port is recorded in `TODO.md` with its number rather than a shrug: the
high-speed traction release, which fires on no shipped car and moves no lap by half a per cent.

The half of the picture the model was never asked to supply is now supplied too: what a car's
CONDITION does to its physics is (b) below, and what an AFTERMARKET part does to it is (c). Both
run on the ratio bridge this port carries, so neither needed the physics re-solved. **What is
outstanding in both is measurement, not mechanism: every curve and every ladder value in them is a
provisional default chosen to land on a driven end point, not a figure read off a car.**

**What the port did NOT do, and what must never start doing: it does not move prices.** Performance and
value are independent by maintainer law. A car is never worth more BECAUSE it is faster.
`marketValueYen` enforces this structurally: it takes no derived stat as an argument at all, and
value comes from condition, mileage, rarity, market heat and the credited aftermarket-parts premium.
The two do correlate, because a part that adds performance usually adds value as well, but they do so
through two separate paths and neither reads the other. The only place a stat reaches a realised
price is `tasteMultiplier`, bounded to plus or minus 12% and shared across all five stats, which
decides which buyer pays at which end of a band rather than what the car is worth. **Anyone porting
this model should treat "the handling number moved, so the price should move" as a bug, not a
feature.**

**b. Condition reaches the physics, on curves nobody has measured.** A part's condition band now
moves four physical dials: **grip, braking, driveline and aero**. Each has its own five-band curve in
`statFormulas.condition.bandFactor`, deliberately separate from the existing `bands.bandFactors`,
because that curve runs from 1.0 at mint down to 0.15 at scrap and a figure right for a stat
contribution is catastrophic as a multiplier on physics. Which parts pull on which dial lives on the
taxonomy as `physicalWeights`, and the traversal is the existing `weightedBandFactor` generalised
rather than a second walker. Two structural rules hold it together. There is **deliberately no power
dial**: engine condition already reaches the model through the ratio bridge scaling the car's current
power, and a second factor would charge it twice. And the **grip and braking weights are disjoint**,
enforced by a test, because braking derives from grip through that same bridge and a part sitting on
both dials would be one input counted twice. At mint every factor is exactly 1.000, proved by strict
equality rather than a tolerance, so the calibration is untouched at the top of the band and
`harnessAcceptance.test.ts` passes unchanged.

**Every one of those curve values is a PROVISIONAL default, not a measurement**, and that is the most
important sentence in this section: no driven data exists for a worn car, so the curves were chosen
to make a plausible whole-car loss and nothing more. What that whole-car loss currently is: a fully
scrap car gives up roughly 12 to 13 per cent on the touge and 4 to 7 per cent on the standing
kilometre.

**c. Aftermarket parts reach the physics too, on a ladder nobody has measured either.** A catalogue
SKU carries `physicalModifiers`, three multipliers of the car's stock figure: **grip**, **braking**
and **mass**. They are assembled per car by `buildFactors` and spent at exactly the points the
condition factors are spent, so each dial is assembled in one place and applied in one place. The
same disjointness rules govern them: no tyre SKU carries a grip modifier, because the compound tier
already gives a tyre upgrade its whole effect through the grip formula's own stock-to-fitted ratio;
no SKU carries both grip and braking; and there is no power modifier and no downforce modifier,
because power moves through `statModifiers.power` and the car's current derived power figure, and
downforce through an aero-functional SKU's grade in `statFormulas.aero.byGrade`.

The ladder is scored against the driven end point rather than chosen freely: a maximal legal build
reaches **x1.40 of stock mechanical grip** (x1.36 to x1.47 across the roster, the spread being the
tyre half's own era and width terms), which puts the quickest roster cars at a mechanical **1.21 to
1.26** against the 1.23 and 1.25 measured on two independently maxed road cars. Braking gains x1.15
and kerb weight falls 10 per cent, both at the top of the ladder. **Every per-SKU figure in it is a
provisional default**, stepped geometrically between stock and maxed rather than fitted to anything.

What (c) did NOT do, and it is the open question rather than an oversight: **the power ladder is
untouched.** `statModifiers.power` is additive and class-invariant, so a maximal build adds a flat
+200 PS to any car it is fitted to, which is x1.6 to x2.0 on the performance roster and as much as
x4.6 on a kei car. A ratio target cannot be expressed on an additive path, and making it
proportional is a design change rather than a retune.

**d. Only 63 of 85 cars carry any measurement.** The other 22 are predicted by regression, and a
prediction is not a measurement however good the fit. Every fingerprint captured improves both that
car and, through the regression, every car that will never be measured. A car with a driven lap but
no fingerprint is the most wasteful state in the set: the expensive reading is spent and the cheap
one is missing.

**e. Two kei outliers are open.** The Beat and the Acty do not sit where the model puts them, and
the standing-kilometre kei case is the worst of them.

**f. The handling READOUT answers the right question now; one grade is still missing.** The stat
reads EFFECTIVE grip (mechanical plus whatever downforce the car makes) at a 200 km/h reference,
across a band topping out at 1.60, so a wing moves the number and a maxed road build occupies the
top of the range rather than two thirds of it. A car with no downforce reads exactly what it always
did. What the port did not settle is what the readout should do above a road build: the band top was
chosen for the range a player can reach, so genuine race machinery will peg it, which is only a
problem once such a car exists.

**g. The headroom for serious aero exists; the PART that would use it does not.** The two levers
that denied it have moved: `aero.maxGripMultiplier` is 2.5 (downforce up to 1.5 times the car's
weight, which clears a GT3-class package at road speeds instead of clipping it from about 194 km/h),
and `aero.byGrade.race.downforceCoeff` is 1.20, just above the 1.164 measured on a maxed road build,
so the strongest wing a player can fit is no longer weaker than one that has actually been built.

What remains is content, not physics: **there is still no aero grade above `race`.** The aftermarket
pass (c) went by without authoring one, deliberately: what was asked for was the headroom, not the
part. So GT3-class bodywork is still a part nobody has written, and the ceiling is still sitting
there waiting for it, which is the state it was raised into. The behavioural target it was signed
against stands as the acceptance for that part whenever it is authored: **an aggressively winged
build should reach an effective grip of 1.5 or a little more, and a GT3-class aero package should
not run into a ceiling at road speeds.**

## 8. It is also the blueprint for the driving mode

The parked test-drive mode (`../parked/drive-mode-spec.md`) needs a per-car physics contract, and
when that spec was written the honest answer to "where do these numbers come from" was "estimate and
tune". That is no longer true: grip, downforce, braking, launch traction and effective power are all
measured per car by this model, and drive mode should read them rather than carry a second set.

What this model cannot supply is anything transient. It is a point mass: it has no yaw, no slip
angle, no weight-transfer dynamics beyond the launch term. Cornering stiffness, yaw inertia and the
friction-circle blend stay drive mode's own problem, which is a far smaller one than it was.

It also hands that feature its strongest acceptance test. The four courses have measured lap times,
so a correctly parameterised drive model should reproduce them. That turns "does it feel right" into
a number, and it guarantees the two halves of the game never disagree about which car is faster.

## 9. Running it

```sh
node docs/design/car-performance/lapsim/lapsim-report.cjs
```

Takes a little over a minute. `lapsim/README.md` covers what it prints, how the fits are performed,
and how to refresh the dashboard.
