# Sprint 126 - Acceleration physics, and grip as measured data

**Status: SUPERSEDED, NEVER BUILT. Do not implement any part of this document.**

Its two threads were both overtaken by the calibration arc that ran immediately after it was
written, and the replacements are strictly better rather than merely different:

- **Thread A, `usablePowerFraction`.** This proposed one global constant to represent the gearbox,
  fitted on three cars. It was replaced by solving each car's own effective wheel power and launch
  acceleration from its two measured acceleration times, so the shortfall is measured per car
  instead of assumed to be shared. The same change also deleted `phi`, `awdLaunchFactor`,
  `launchCapCoeff` and the nine-entry engine-archetype delivery table, which were four more global
  guesses at the same quantity. Lever B below (`awdLaunchFactor` 0.66 to 0.70) is therefore moot:
  the constant no longer exists for measured cars.
- **Thread B, `spec.stockLateralG` as an anchor for the derived grip formula.** This had measured
  grip for three cars and kept the formula as the source of truth. There are now measured figures
  for 64, and the formula is no longer competing with them: grip, downforce and braking all come
  from measurement, and the derived formula survives only as the predictor for cars nothing has
  measured. Design D also double-counted: a lateral-g figure read at 97 km/h already contains that
  car's downforce, so anchoring the mechanical formula to it directly would have credited the aero
  twice.

The evidence tables below are kept because they are real measurements and the reasoning is sound
against what was known at the time. The lever table is dead: **no constant named in it may be moved
on the strength of this document.**

The current design of record is `docs/design/car-performance/`. The work this sprint was reaching
for is now the integration of that model into `packages/sim`, which is a different and larger job.

## Goal

Close the one remaining structural defect in the lap model, and change where grip comes from.

Two things, driven by the maintainer's ruling of 2026-07-25:

> 1. source as much as possible directly out of forza
> 2. use our improved model for the rest we cant get

**Thread A - acceleration.** The model assumes peak power at every engine speed. It has no gearbox
and no power curve, so it is 17-45% too fast in the power-limited regime and 7.3% too fast across
sixty published 0-100 figures. This is real missing physics, not a tuning error.

**Thread B - grip as data.** `computeGrip` derives mechanical grip from build year, tyre width,
weight transfer and layout. Where Forza has measured the car, that derivation should stop competing
with the measurement and start predicting it.

## Reuse analysis (directive 16)

### Genuinely new

| New | Why nothing existing covers it |
|---|---|
| `pace.usablePowerFraction` | No term anywhere represents the gearbox. `drivelineEfficiency` is a steady-state loss that must also apply to top speed; this must NOT. |
| `spec.stockLateralG` | No car field carries a measured performance figure today. Every physical field (`dragCd`, `comHeightMm`, `topSpeedKmh`) is a published dimension, not a measured outcome. |

### Existing mechanisms reused, unchanged

- **The whole pace sim.** `carBlock` / `straightTime` / `apexSpeed` / `vTopOf` / `lapTime` in
  `packages/sim/src/performance.ts` are untouched in structure. `usablePowerFraction` multiplies
  `aPow` at the two acceleration sites and nowhere else.
- **`computeGrip` keeps its entire formula.** Thread B does not replace it; it anchors it. The
  formula continues to supply the whole mod response (see below).
- **`pace.delivery`, all nine archetype factors: UNCHANGED.** An agent proposed folding thread A into
  this table. Rejected. `delivery` is corner-exit turbo lag, so turbos score *worse* (singleTurbo
  0.78, bigNA 1.00). `usablePowerFraction` is mean power across a gear sweep, where flat-torque
  turbos score *better*. They are different physics pulling opposite ways and both are real. The
  measured fits confirm it: the NA V12 needs the lowest fraction, the twin-turbos the highest.
- **`statFormulas.aero`, the Sprint 125 block: UNCHANGED.**
- **`pace.launchCapCoeff`: UNCHANGED, and deliberately so.** See "the lever I am not pulling".
- **The economy approval gate** re-pins as usual; **the story-mission lap ceilings** re-derive
  mechanically through `storyMissionProbes`'s existing `ceil1AtTwoPercentSlower` rule, exactly as in
  Sprints 124 and 125. No payout moves. Payouts derive from build cost, not lap time.

### Anchoring, not replacing (the thread B design)

The measured figure sets the level; the existing formula supplies the mod response:

```
mu = stockLateralG x  formula(model, fittedCompound) / formula(model, stockCompound)
```

With no measured figure the ratio is against the formula itself and the result is today's value
exactly. With one, the car sits where Forza measured it, and a tyre or width upgrade moves it by the
proportion the formula predicts. This is the smallest possible change that honours the ruling: it
makes the formula a *predictor of a measurable quantity* rather than a parallel truth, and every
measured car becomes a residual that improves it for the cars we can never measure.

## The evidence

### Thread A: the model is uniformly too fast where it is power-limited

Fitted on the **97 -> 161 km/h segment**, which is almost entirely power-limited and so isolates this
lever independently of launch traction:

| Car | our 97->161 | Forza | error at today's constants |
|---|---|---|---|
| Countach LP5000 QV | 3.76 s | 6.88 s | **-45%** |
| Mitsubishi GTO 1997 | 6.27 s | 8.61 s | **-27%** |
| Calsonic BNR32 Gr.A | 2.26 s | 2.74 s | **-17%** |

Not one anchor is too slow. Per-car best fits: GTO **0.77**, Calsonic **0.82**, Countach 0.60.

**The Countach is discounted as a data problem.** Forza displays its claimed 461 PS; the QV's real
measured output is nearer 400. It is also the only 5-speed and the only non-roster car in the set.
Bending a global constant to absorb a bad power figure would hide a data fault inside the physics.

**The decisive independent check.** The sixty published 0-100 figures were never used to fit this
lever, and they agree:

| statistic | today | at 0.82 / 0.70 |
|---|---|---|
| mean error | **-7.3%** | **+0.2%** |
| median error | -7.3% | -0.2% |
| mean absolute error | 9.5% | **7.2%** |
| AWD mean (n=15) | -4.2% | +1.7% |
| RWD mean (n=33) | -8.2% | -0.8% |
| FWD mean (n=12) | -8.8% | -0.8% |

A 7.3% systematic optimism collapses to 0.2%, and all three drivetrains land inside 1.7% where every
one of them was 4-9% fast. That is the strongest single result in this work.

### The cost, stated plainly: laps get slightly worse

Acceleration feeds `straightTime`, so every lap slows. Today's lap accuracy was bought with
**compensating errors** - acceleration too fast, agility too slow - exactly as the maintainer
anticipated when ordering the accel-pairs-not-lap-times fit. Removing one exposes the other. Across
the fourteen driven Misaki laps, no value of `agilityWeight` recovers today's combined figure:

| group | today | after |
|---|---|---|
| all 14 | 0.03% mean / **2.26% MAE** | 1.52% mean / **3.05% MAE** |
| main field (7, kei removed) | -0.02% / 0.68% | 1.31% / 2.09% |
| **true out-of-sample (GTO, Countach)** | -2.30% / **2.30%** | -0.06% / **0.36%** |

The only column fitted on data neither lever has ever seen **improves sixfold**. The in-sample
columns degrade. That is the signature of removing an overfit, not of introducing an error. The R32
in particular goes +1.4% -> -0.8%, closing part of the section-9 ordering defect without a per-car
patch.

Two costs to book rather than bury:

- **The Honda Beat degrades 9.0% -> 13.4%.** A flat power fraction punishes a 64 PS car hardest,
  right where the standing kei defect already lives. The Beat and Acty remain open (see `TODO.md`).
- **The RX-7 FD goes 1.9% -> 3.2%**, the one blind car that gets worse.

## The lever table (directive 22 - SIGN BY NAME AND VALUE BEFORE IMPLEMENTATION)

### A. New: `statFormulas.pace.usablePowerFraction`

| Constant | Today | Proposed | Meaning |
|---|---|---|---|
| `usablePowerFraction` | (absent) | **0.82** | Mean fraction of peak wheel power actually delivered while accelerating through the gears: an engine sweeps its power curve within each gear and makes zero thrust during upshifts. |

Applied at exactly two sites, both in the acceleration integrator. **Never applied to `vTopOf`** -
top speed *is* steady state at peak-power rpm, and it is already correct. This is what keeps the fix
from breaking the top speeds.

Evidence range 0.77-0.87 (GTO 0.77, Calsonic 0.82, published-60 zero-crossing ~0.87). 0.82 is the
centre of the two six-speed anchors and lands the published set at +0.2% bias.

### B. `statFormulas.pace.awdLaunchFactor`

| Constant | Today | Proposed |
|---|---|---|
| `awdLaunchFactor` | 0.66 | **0.70** |

The two AWD anchors bracket it: the GTO fits at 0.64, the Calsonic at 0.76. **Evidence is thin (n=2)
and I am flagging it as the softest row in this table.** If you would rather move one lever this
sprint, leave this at 0.66 and I will refit it when the priority-1 fingerprints land; the published
AWD mean lands at +1.7% with it and roughly -1% without.

### C. `statFormulas.pace.agilityWeight` - RECOMMEND NO CHANGE

| Constant | Today | Recommendation |
|---|---|---|
| `agilityWeight` | 0.30 | **leave at 0.30** |

You signed 0.3 yesterday. The refit does not clearly demand a move: the in-sample twelve minimise at
0.20, both out-of-sample cars prefer 0.28-0.30, and the whole 0.20-0.30 range is flat to within
0.26 MAE points. Holding it also keeps this sprint to **one changed physical lever**, so if the next
blind test drifts I know which change caused it.

The alternatives, if you want them: **0.24** (near-best on both criteria: no-kei MAE 1.53, OOS 0.71)
or **0.20** (best in-sample: no-kei MAE 1.50, OOS 1.14, but it costs field spread, which you have
asked to increase rather than compress).

`agilityWeight` is now the largest unphysical term left in the model. It should be shrunk with data,
not tuned against fourteen laps it has already been fitted to twice.

### D. New schema field: `spec.stockLateralG` (optional, per car)

| Car | formula today | measured (Forza) | delta |
|---|---|---|---|
| Nissan Skyline GT-R (BNR32) | 0.876 | **0.96** | +9.6% |
| Mitsubishi GTO Twin Turbo (Z16A) | 0.930 | **0.89** | -4.3% |
| Lamborghini Countach LP5000 QV | (formula) | **1.10** | - |

Three of eighty-five cars. The R32/GTO pair is the point: the era-rubber band hands the 1997 GTO more
grip than the 1989 R32 purely on build year, which is backwards, and it is the direct cause of the
9.4-second ordering error recorded in `lap-calibration.md` section 9. Measured data fixes it by
construction rather than by tuning.

**This one has consequences beyond lap time.** `computeGrip` feeds the displayed handling stat and
therefore valuation, so the R32's and GTO's handling stats will move and the `advanceDay` goldens
will need re-pinning. That is a legitimate stat change with a measurement behind it, not drift.

### The lever I am NOT pulling, and why

`launchCapCoeff` (0.70) fits the Countach at 0.53, a 24% move. **I am not proposing it.** The cap is
the binding term for only **4 of 66** RWD/FWD cars - the 930 Turbo, Countach, F355 and Testarossa,
all rear-biased exotics, all binding by under 0.041 g. It is a four-supercar lever, not a roster
lever, and its fit came from the one car I just ruled the least trustworthy datum in the set. Moving
a global constant on that evidence is exactly the failure directive 22 exists to prevent.

## Task breakdown (mechanical once A-D are signed)

Claude-implementable:

1. `packages/content/data/economy.json`: add `usablePowerFraction`; set `awdLaunchFactor` per B.
2. `packages/content/src/economy.ts`: extend the pace Zod schema.
3. `packages/content/src/carModel.ts`: add `stockLateralG: z.number().positive().optional()`.
4. `packages/sim/src/performance.ts`: apply the fraction at the two acceleration sites; implement the
   grip anchoring ratio in `computeGrip`.
5. `packages/content/data/cars/*`: populate the three measured figures.
6. Tests: a pace test asserting the fraction does NOT reach `vTopOf`; a grip test asserting the
   anchoring ratio is identity when no measured figure is present; re-pin the economy gate and the
   `advanceDay` goldens with the approval recorded.
7. Re-derive the two story-mission lap ceilings mechanically; **payouts untouched**.
8. Update `lap-calibration.md` (including the stale AWD-efficiency claim in section 11, which the
   maintainer has already corrected: AWD reduces top speed but usually *increases* acceleration).

Maintainer-only (behind the data air gap and the game itself):

9. Collect priority-1 fingerprints per `docs/design/car-performance/forza-telemetry.md`. Nine cars already have
   driven laps and no fingerprint; completing them needs no driving and is worth more than any
   further modelling.

## Exit

_(to be filled on completion)_
