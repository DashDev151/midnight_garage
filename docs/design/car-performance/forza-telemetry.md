# Forza telemetry: the measured source of record

**Status: OPEN, actively collected.** This file is the project's primary source for per-car grip and
acceleration. It replaces published road-test figures, which were tried and rejected
(`archive/lateral-g-research.md`, closed 2026-07-25): they are on a different scale from the game we are
calibrating against, they disagree with themselves between tests, and they do not exist at all for
most of this roster.

The rule, set by the maintainer on 2026-07-25:

1. **Source as much as possible directly out of Forza.**
2. **Use the model for the rest.**

So the formula in `computeGrip` stops being a competing truth and becomes a *predictor*: where a
measured figure exists it wins, and where one does not the formula fills in. Every measured car is
also a residual against the formula, which is how the formula gets better for the cars we can never
measure.

## The capture route changed on 2026-07-26: use Data Out, not screenshots

**Forza Horizon 6 has an official telemetry feed and it supersedes hand-screenshotting.** Playground
publish the spec at
`https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation`.
It is a supported feature, enabled in `SETTINGS > HUD AND GAMEPLAY` (Data Out, IP, port), streaming a
324-byte UDP packet to localhost. **This is not modding and carries no risk**; do not confuse it with
the GameDB decryption route below.

It carries everything the model needs, and two fields that remove a whole class of inference:

| Field | What it kills |
| --- | --- |
| `F32 Power` (watts), `F32 Torque` (N.m) | We stop inferring power from acceleration. It is handed to us per tick. |
| `U8 Gear` + `CurrentEngineRpm` + `TimestampMS` | Every upshift is an exact window, so shift losses are measured rather than fitted. |
| `WheelRotationSpeed` per wheel | Gear ratios come free: total ratio = rpm x (2 pi / 60) / wheel rad/s, constant within a gear. |
| `AccelerationX/Y/Z`, `Speed`, `Accel`/`Brake` inputs | Coast-down gives drag and rolling resistance with no power term involved. |

**Sampling is at frame rate, NOT a fixed 60 Hz** (measured at 128-140 Hz in the wild, unlike Forza
Motorsport's fixed 60). Integrate on `TimestampMS` deltas; never assume a fixed dt.

### The two runs, per car. No steering, so nothing depends on driving skill

1. **Full-throttle pull**, standstill to top speed on a straight. Yields the power curve (bin `Power`
   by rpm over frames where `Accel` = 255, discarding frames where `Gear` changes), the shift losses,
   the gear ratios, and the real top speed.
2. **Coast-down**, lift off at speed, no brake. Yields drag and rolling resistance cleanly, and it
   works for gearing-limited cars where the top-speed route fails.

Grip and downforce are already covered by the screenshot pairs and need no re-capture.

### First, one diagnostic and one experiment

- **Is `Power` crank or wheel referenced?** The documentation does not say. Check whether
  `Power` is approximately `Torque` x rpm x (2 pi / 60). If it holds, crank; if `Power` reads
  systematically lower, wheel. Either is usable, but the fit must know which.
- **The capped-power question, settled in minutes.** One pull each in the NSX-R, R32, Evo VI TME and
  R34, reading peak `Power`. If the Evo and R34 read well above the other two despite near-identical
  labels, Forza simulates real output and shows the declared figure. If all four track their labels,
  that idea is dead and the difference is the torque curve (the Evo and R34 carry about 30% more
  torque at the same stated power) plus the R34's sixth gear. Comparing four cars on one channel is
  self-normalising, so the crank-versus-wheel question does not affect the answer.

### Tooling

`github.com/ClickClickMedia/Forza-6-telemetry` already emits raw CSV and a dyno with shift transients
excluded; `github.com/theRTB/ForzaShiftTone` already derives gear ratios and power curves. Consume a
CSV and do our own analysis in this repo rather than vendoring either. `CarOrdinal` in the packet
maps to a car name via the public FH6 car-ID list, which makes per-car batch logging practical.

**A parser trap worth knowing:** the documented fields sum to 323 bytes, not 324. The last byte is an
undocumented trailing zero, and at least one published parser shipped a one-byte offset error that
corrupted the entire tail of the packet.

### The route deliberately not taken

FH6's GameDB is an encrypted SQLite file and a community tool can decrypt it. Evidence from an old
Forza Motorsport 4 editor shows the torque curve IS stored, as a point list, which confirms the files
hold physics inputs rather than the panel's computed figures. We are not going there: the only FH6
decryptor is a save-editing toolkit carrying its own ban warning, it means touching the game install,
and there is no schema documentation. Data Out gives us more, officially, for less.

## What one fingerprint is

Six readings, all visible on the car's stats/telemetry panel. No driving required.

| Reading | Feeds | Why it matters |
|---|---|---|
| Lateral g at 97 km/h | the grip split, with the 193 reading | mechanical grip, the single biggest lap-time input |
| **Lateral g at 193 km/h** | the grip split, with the 97 reading | the PAIR separates mechanical grip from downforce; neither reading alone can |
| Braking 97 -> 0 (m) | the braking coefficient | braking is its own input, not a copy of lateral grip |
| Braking 161 -> 0 (m) | the braking coefficient | the PAIR determines the car's dead distance, so the two readings must agree |
| 0-97 km/h (s) | launch acceleration | the traction-limited phase, which the launch term is solved against |
| 0-161 km/h (s) | effective wheel power | the PAIR splits launch traction from power delivery per car |
| Top speed (km/h) | drag area | pins CdA when combined with power, since top speed is steady state |

**Every physical quantity here comes from a PAIR of readings, never a single one.** That is the whole
design: two measurements at two speeds carry two unknowns, so grip splits from downforce, launch
splits from power, and the braking figure yields both a coefficient and the dead distance in front of
it. A half-captured fingerprint is worth far less than half a fingerprint.

**Mind the speeds: the panel does not use one pair.** Lateral g is quoted at **97 and 193** km/h,
while braking and acceleration are quoted at **97 and 161**. Reading the second lateral figure as a
161 km/h number would corrupt the downforce fit, since `downforceK` is speed-SQUARED and 193 against
161 is a 44% error in the term. The Calsonic aero calibration was done correctly at 193; an earlier
draft of this table said 161 and was wrong.

Plus the car's displayed **PS, torque, kerb weight and front weight %**, because Forza's figures for a
given car often differ from our spec book's variant (its BNR32 is a 1992 280 PS/1480 kg car; ours is
a 1989 320 PS/1430 kg one). We calibrate against the numbers the game itself simulates.

A **driven lap** is the acceptance test, not an input, on any of the four courses (Misaki as a hotlap,
Hakone and Wangan from a standing start, Yatabe as a standing kilometre). It is the expensive reading;
the fingerprint is the cheap one, and the fingerprint is what improves the model.

## Priority 1: the cars already driven

A car with a driven lap but no fingerprint is the most wasteful state in the set: the expensive
reading is spent and the cheap one is missing, so the lap cannot be read as a result about the car.
Completing a fingerprint costs no driving and turns each such car into a fully determined calibration
point: measured grip in, measured acceleration in, measured lap out. This is the highest-value data in
the project.

### Captured 2026-07-26: nine complete fingerprints

Read from the maintainer's stats-panel screenshots. Power is PS, torque N.m, weight kg, distances
metres, speeds km/h throughout; no panel showed imperial units. **Forza's power and weight supersede
the spec book** where they differ (maintainer ruling), and they differ often, because Forza's variant
is frequently not ours.

| Car (as Forza names it) | PS | N.m | kg | fr% | drive | lat g 97 | lat g 193 | brake 97 | brake 161 | 0-97 | 0-161 | top |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2010 Lexus LFA | 560 | 480 | 1480 | 48 | RWD | 1.03 | 1.09 | 30.8 | 73.4 | 3.660 | 7.694 | 327.1 |
| 1992 Mazda RX-7 Type R | 256 | 294 | 1260 | 50 | RWD | 0.92 | 0.95 | 44.3 | 109.6 | 5.240 | 13.000 | 285.5 |
| 2001 Mitsubishi Lancer Evolution VI GSR TM Edition | 280 | 373 | 1280 | 58 | AWD | 0.95 | 1.03 | 40.6 | 101.5 | 4.520 | 9.667 | 240.0 |
| 2000 Nissan Skyline GT-R V-spec II | 285 | 392 | 1505 | 54 | AWD | 0.94 | 0.97 | 40.8 | 103.2 | 4.438 | 10.076 | 291.3 |
| 1994 Honda Acty | 38 | 54 | 770 | 52 | AWD | 0.80 | 0.80 | 49.3 | FAILED | 24.717 | FAILED | 111.3 |
| 1992 Honda NSX-R | 280 | 294 | 1230 | 42 | RWD | 1.07 | 1.13 | 38.8 | 96.8 | 4.632 | 11.460 | 275.2 |
| 2001 Acura Integra Type R | 198 | 176 | 1197 | 62 | FWD | 0.90 | 0.91 | 44.5 | 111.0 | 6.168 | 14.538 | 250.3 |
| 1999 Toyota Altezza RS200 Z Edition | 210 | 216 | 1360 | 50 | RWD | 0.89 | 0.91 | 45.6 | 112.7 | 6.846 | 17.674 | 251.8 |
| 1992 Nissan Skyline GT-R | 280 | 353 | 1480 | 59 | AWD | 0.90 | 0.94 | 42.0 | 106.0 | 4.943 | 12.758 | 267.7 |

The Acty's `FAILED` entries are the literal on-screen text: it cannot reach 161 km/h at all. That is
data, not a gap.

### Earlier captures, carried forward

| Car | lat g 97 | lat g 193 | brake 97 | brake 161 | 0-97 | 0-161 | top |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Mitsubishi GTO 1997 | 0.89 | 0.91 | 42.2 | 106.8 | 5.629 | 14.241 | 268.1 |
| Countach LP5000 QV 1988 | 1.10 | 1.15 | 39 | 95.9 | 4.839 | 11.721 | 299.7 |
| Calsonic BNR32 Gr.A | 1.58 | 1.78 | 23.3 | 55.9 | 2.5 | 5.238 | 322.9 |

### Two corrections this capture forces

**1. The R32's grip figure in the spec book is wrong.** `car-spec-book.html` carries `lg: 0.96` for
the BNR32, recorded from an earlier session. The 1992 Skyline GT-R panel reads **0.90 / 0.94**. The
0.96 / 0.97 pair matches the **2000 V-spec II** almost exactly, so the earlier reading was very
probably the R34's, filed against the R32. The driven car's specs (280 PS, 1480 kg, 59% front) match
the 1992 panel exactly, so 0.90 is the figure that belongs with the 105.4 s lap.

**2. The Evo VI's 240.0 km/h is not a drag ceiling.** Its 97 to 161 time beats the heavier, more
powerful R34's, so the car is not short of thrust; it runs out of road in top gear. Maintainer
reading (2026-07-26): short rally-derived ratios rather than an electronic limiter. Either way the
consequence for us is the same, and it is important: **deriving `CdA` from that top speed, which is
how every other car's drag is pinned, would badly overstate its drag.**

The mechanism matters beyond this one car. A gearing-limited top speed is a direct measurement of
the thing the pace model has no representation of at all: there is no gearbox in it, only continuous
power. A top speed that is suspiciously round, or that sits below what the car's own acceleration
implies, is the signature to watch for.

### Still open on the driven nine

`Ferrari F355`, `BMW M3 (E30)`, `Toyota 2000GT` and `Honda Beat` have driven Misaki laps but no
fingerprint yet. The `NSX-R`, `Evo VI`, `Altezza`, `LFA` and `Acty` are now complete on both.

## Priority 2: CLOSED. Engine character no longer needs sampling

This section used to ask whether the shortfall between a car's crank power and what it actually
delivers is one shared constant or varies by engine type, and proposed sampling six cars of differing
power-curve shape to find out.

**The question is dissolved rather than answered, and it is worth understanding why, because the same
trap is easy to walk back into.** A gearing loss and an overstated power figure are the same number
to a measured 0-161, so no amount of sampling can attribute the deficit between them. The model
stopped trying: it solves each car's launch acceleration and effective wheel power from that car's
own two acceleration times, and reproduces both to machine precision. Two unknowns, two measurements,
no shared constant to argue about and no need to know which half of the shortfall is which.

The practical consequence for collection: **there is no longer a class of car worth prioritising for
engine character.** A rotary, a sequential twin-turbo and a flat-torque six all get their own solved
curve from their own pair. Collect breadth instead, per priority 3.

## Priority 3: everything else in the roster that Forza has

Grip only (the lateral pair at **97 and 193**, never 161) is worth having even without the rest.
Anything measured is a car the formula no longer has to guess at.

## Known trap

Forza's displayed power is the manufacturer's claimed figure, which for some cars the real engine
never made. The Countach LP5000 QV displays 461 PS against a real measured output nearer 400, and it
is correspondingly the worst-fitting car in the acceleration set. Where a car's fingerprint fits
badly and its claimed power is historically suspect, say so rather than bending a global constant to
absorb it.
