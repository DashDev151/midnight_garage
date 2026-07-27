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

**a. The model is not in the game.** `packages/sim/src/performance.ts` still runs the older derived
physics: grip from the era-and-width formula, braking as a copy of lateral grip, acceleration from
peak power with fitted launch constants and a nine-entry engine-archetype delivery table, and no
grip ceiling. `packages/content/data/courses.json` still ships the five invented courses. **The
validated model described in this document currently exists only in the harness.** Closing that is a
sprint of its own, and it must move the physics, the car data and the courses together: the
calibrated geometries were searched under the new physics and would make the shipped model worse, not
better, if dropped in alone.

**What that port does NOT do, and must never start doing: it does not move prices.** Performance and
value are independent by maintainer law. A car is never worth more BECAUSE it is faster.
`marketValueYen` enforces this structurally: it takes no derived stat as an argument at all, and
value comes from condition, mileage, rarity, market heat and the credited aftermarket-parts premium.
The two do correlate, because a part that adds performance usually adds value as well, but they do so
through two separate paths and neither reads the other. The only place a stat reaches a realised
price is `tasteMultiplier`, bounded to plus or minus 12% and shared across all five stats, which
decides which buyer pays at which end of a band rather than what the car is worth. **Anyone porting
this model should treat "the handling number moved, so the price should move" as a bug, not a
feature.**

**b. Condition does not touch performance.** A worn engine, tired dampers and dead tyres change the
game's abstract stats today, but nothing in this model. What a part's condition band does to grip,
braking, power and mass is undesigned.

**c. Aftermarket parts do not touch performance either.** The same gap from the other end: the model
can say exactly what a car with a given grip and power does, and nothing yet says what fitting a
given part does to that grip and power.

**d. Only 63 of 85 cars carry any measurement.** The other 22 are predicted by regression, and a
prediction is not a measurement however good the fit. Every fingerprint captured improves both that
car and, through the regression, every car that will never be measured. A car with a driven lap but
no fingerprint is the most wasteful state in the set: the expensive reading is spent and the cheap
one is missing.

**e. Two kei outliers are open.** The Beat and the Acty do not sit where the model puts them, and
the standing-kilometre kei case is the worst of them.

**f. The handling READOUT is calibrated to mechanical grip alone, and is therefore both blind and
short.** Two separate faults, and neither is in the physics.

*Blind.* `gripToDisplay` reads mechanical grip only. Downforce is exactly what carries a build past
1.5 effective, and the readout cannot see it: fit an aggressive wing and the handling number does not
move, while the car corners half again as hard at speed. The one upgrade that reaches the top of the
grip range is the one upgrade the stat ignores.

*Short.* The curve runs 0.66 to 1.10 mechanical across the stock band and 1.10 to 1.62 across the
modified band. A fully maxed road car sits at about 1.25 mechanical, so it reads about **68 out of
100**, and the top third of the readout belongs to race machinery a player cannot build. The
displayed range does not describe the range a player can occupy.

Both want the same fix and it is a design question, not a tuning one: **decide what the handling
stat is a readout OF.** If it is meant to answer "how hard does this thing corner", it has to include
downforce at some reference speed and its band has to be redrawn around what a build can actually
reach.

**g. There is NOT currently headroom for serious aero, and the game must have it** (maintainer
requirement, 2026-07-27: room for GT3-style wings, splitters and diffusers, whether or not those
parts exist yet). Two separate levers block it, and both are content values rather than physics:

- **`aero.maxGripMultiplier` is 1.6**, which means downforce can never exceed **0.6 times the car's
  weight**, at any speed, on any car. A GT3 car makes roughly its own weight in downforce at
  250 km/h, so it would be clipped from about 194 km/h upward. This is not hypothetical: the
  modified 787B already in the validated set is clipped from **170 km/h**, and the only reason that
  did not show up in its error is that its one driven lap is on the slowest course in the set. The
  cap wants to roughly double before any aggressive aero part is authored.
- **`aero.byGrade.race.downforceCoeff` is 0.85**, the strongest wing a player can currently fit.
  That is below the 1.164 measured on a maxed road build and roughly a quarter of what a GT3 wing
  would need. The grade table wants a tier above its current top.

Both are directive-22 levers and neither has been moved. They belong on the lever list of whichever
sprint first touches aero, with the target stated as a behaviour rather than a number: **an
aggressively winged build should reach an effective grip of 1.5 or a little more, and a GT3-class
aero package should not run into a ceiling at road speeds.**

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
