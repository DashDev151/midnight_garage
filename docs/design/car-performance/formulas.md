# Car performance model: formula reference

The exact maths of the model described in `README.md`. Read that first for what the model is for,
how accurate it is, and what is still missing; this file is the algebra alone.

Source of every formula below: `lapsim/lapsim-report.cjs`. The physics occupies the front of that
file; everything after it is reporting, sweeps and diagnostics. Numeric values quoted as "the
captured run" come from `lapsim/lapsim-report.txt`, the last captured stdout of the harness, or
from the `constants` block of `lapsim/lapsim-data.json`, which the run writes itself. Those two are
the authority on any current value; a number written into prose anywhere is a copy and can go
stale.

Units are SI throughout unless a line says otherwise. Speeds inside the model are m/s; every
km/h figure in the car data is divided by 3.6 on the way in. Distances are metres, times seconds,
masses kilograms, powers watts, accelerations m/s^2. Angles in the course arrays are degrees and
are converted to radians where an arc length is taken.

Notation used consistently below:

| Symbol | Meaning | Unit |
| --- | --- | --- |
| `v`, `u` | road speed | m/s |
| `m` | mass the sim moves: kerb weight plus 75 kg driver | kg |
| `mu` | mechanical lateral grip coefficient (dimensionless) | - |
| `bmu` | braking grip coefficient, a separate quantity from `mu` | - |
| `dfC` | per-car downforce coefficient | - |
| `k` | downforce term scale, `k = dfC * DOWNFORCE_K` | s^2/m^2 |
| `CdA` | drag area, `cd * frontalArea` | m^2 |
| `Pw` | wheel power at the crank figure, `ps * PS * eta` | W |
| `pEff` | effective through-the-gears wheel power from the acceleration solve | W |
| `aLaunch` | low-speed acceleration plateau from the acceleration solve | m/s^2 |
| `r` | corner radius | m |
| `L` | length of the straight following a corner | m |

---

## 1. Universal constants

```
g          = 9.81      m/s^2    standard gravity
rho        = 1.2       kg/m^3   air density
eta        = 0.88      -        driveline efficiency, crank power to wheel power
froll      = 0.012     -        rolling-resistance coefficient
PS         = 735.5     W        one metric horsepower
driver     = 75        kg       added to every kerb weight: m = c.kg + 75
DOWNFORCE_K = 6.2e-5   s^2/m^2  the scale of the downforce grip term
MAXGRIP    = 1.6       -        ceiling on the aero grip multiplier
V97  = 97 / 3.6  = 26.944 m/s
V161 = 161 / 3.6 = 44.722 m/s
V193 = 193 / 3.6 = 53.611 m/s
```

`DOWNFORCE_K` and `MAXGRIP` mirror `statFormulas.aero` in
`packages/content/data/economy.json` (`downforceK` and `maxGripMultiplier`), so the prototype and
the shipped sim speak the same units.

**The two reference-speed pairs are different pairs, and they may not be mixed.** The stats panel
the car data is read from quotes **lateral g at 97 and 193 km/h** and quotes **braking and
acceleration at 97 and 161 km/h**. Every lateral fit therefore runs on `(V97, V193)` and every
braking or acceleration fit on `(V97, V161)`. Mixing them corrupts the aero fit, because the
downforce term is proportional to speed **squared**: reading a 193 km/h datum as if it were a
161 km/h datum inflates `v^2` by `(193/161)^2 = 1.437`, a 44 per cent error in the term the fit
is trying to isolate. There is no 0 to 193 km/h acceleration figure and no 161 km/h lateral
figure anywhere in the data; neither is interpolated.

Marching and tolerance constants used by the integrators:

```
DV_STRAIGHT = 0.5   m/s    speed step of the straight-line march
DV_ACCEL    = 0.1   m/s    speed step of the acceleration integral
A_CRUISE    = 0.12  m/s^2  below this net acceleration a car is treated as being at
                           terminal speed and coasts the rest of the straight
ACC_TOL     = 5e-3  s      round-trip tolerance on a solved 0-97 or 0-161
A_LO, A_HI  = 0.3, 40   m/s^2  bisection bracket for aLaunch (about 0.03 g to 4 g)
P_LO, P_HI  = 500, 4e6  W      bisection bracket for pEff (0.5 kW to 4 MW)
```

Three further module-level scalars are **diagnostics, not terms**: `GRADE` (road slope, read only
by `straightTime`), `DRAG_K` and `ROLL_K` (multipliers on the aero and rolling resistance terms).
All three sit at `0`, `1`, `1` for every published number; only the sections that price
"could a gradient or a drag error explain this?" move them, and they restore them immediately.

---

## 2. Per-car measured inputs

A car is a plain record. The fields the physics reads:

**Identity and classification**

| Field | Meaning |
| --- | --- |
| `id` | stable key. Every cross-reference in the harness joins on it (display names move with the source's identity for a car; ids do not) |
| `n` | display name |
| `y` | model year. Read by the era-rubber grip fallback and by the braking fallback regression |
| `sec` | roster section (`Kei`, `Shitbox`, `Fast FWD`, `FR / Drift`, `Rotary`, `Flagship`, `AWD Turbo`, `Gaisha`, `Bubble weird`, `Kyusha`, `2004+ wave`, `Hyper wave`, `Legend`). Read by the frontal-area fallback and by track-width class |
| `src` | provenance: `forza` (the entry is a panel car in full) or `modelled` (no usable analogue, nothing measured) |

**Mass, power, geometry**

| Field | Meaning | Unit |
| --- | --- | --- |
| `kg` | kerb mass. `m = kg + 75` | kg |
| `ps` | real power output | metric hp |
| `q` | the manufacturer's quoted PS, kept only where it differs from the real output (the JDM 280 PS agreement) | metric hp |
| `tq`, `tqr`, `psr`, `rl`, `cc` | torque, torque rpm, power rpm, redline, capacity. Display data; the physics does not read them | - |
| `fr` | front weight distribution | per cent |
| `wb` | wheelbase | mm |
| `com` | centre-of-mass height | mm |
| `ty` | tyre size string; the first three-digit group is read as section width in mm (default 160 if absent) | - |
| `dt` | drivetrain: `FWD`, `RWD`, `AWD` | - |
| `ep` | engine position: `front`, `mid`, `rear` | - |
| `ec`, `cfg`, `asp` | engine code, cylinder configuration, aspiration | - |

`fr`, `wb` and `com` reach the live acceleration path only through the flag-gated `derived`
branch; `com` also enters the grip fallback, and `ty` enters both the grip fallback and the
track-width classification.

**Measured performance (the physics inputs proper)**

| Field | Meaning | Unit |
| --- | --- | --- |
| `lg` | mechanical lateral grip `mu`. **Not** the raw 97 km/h reading: it is the speed-independent half of the two-point aero fit (section 3) | - |
| `g97`, `g193` | the two raw lateral-g panel readings, at 97 and 193 km/h, kept so the fit can always be re-derived | g |
| `dfC` | downforce coefficient, `dfC = k / DOWNFORCE_K` with `k` from the same fit. `dfC = 0` means the two readings were equal or inverted, that is, no measurable rise, not "unmeasured" | - |
| `b97`, `b161` | braking distance from 97 and from 161 km/h | m |
| `z97` | 0 to 97 km/h | s |
| `z161` | 0 to 161 km/h. Normally carried inside the record's verbatim panel block as `fz.a100` and lifted to a first-class field at load; written explicitly only where an override replaces the scraped figure, in which case the explicit value wins | s |
| `z` | a published 0 to 100 km/h, surviving only on `modelled` cars. It is **not** interchangeable with `z97`: a 0-97 read as a 0-100 flatters a car by roughly two per cent | s |
| `top` | measured top speed | km/h |
| `cd` | drag coefficient, back-solved from `top` (section 4), divided by the car's real frontal area so that `cd * area` reproduces the measured `CdA` | - |

**Flags and provenance markers**

| Field | Meaning |
| --- | --- |
| `gearLtd` | the top-speed drag route was rejected for this car (its implied `CdA` ran more than 1.25x the geometric estimate, meaning it runs out of gearing before thrust). `cd` stays the geometric estimate |
| `aeroSus` | the car's own top speed is below 193 km/h while its lateral pair still rises, so the second lateral readout is an extrapolation and the `dfC` derived from it inherits that |
| `gOvr` | a recorded override: names every field replaced, the replacement's source and the argument for it. The verbatim panel block keeps the original figures so both are visible |
| `srcWarn` | names a suspicion about a panel reading without changing any figure |
| `est` | list of fields that are estimates rather than measurements |
| `cf` | confidence marker |
| `ig` | roster inclusion marker |
| `fz` | the car's whole source panel record, verbatim |

Where a car has no `lg`, grip falls back to a formula over era, tyre width, compound tier,
centre-of-mass-to-track ratio and drivetrain (`gripMu`); a measured lateral g is authoritative
wherever one exists.

```
gripMu(c):
  if c.lg present:  mu = c.lg
  else:
    cm = eraRubber(c.y) + tierDelta(compound(width, c.y))
    we = clamp((cm - 0.7) / 0.3, 0.4, 1)
    wa = clamp((width - 200) / 1100, -0.03, 0.045) * we
    cr = (c.com or 460) / track(c)
    tr = clamp(1 - 0.75 * (cr - 0.27), 0.8, 1)
    L  = 1 + 0.035 (active-AWD engine codes) or 0.02 (other AWD) or 0.015 (mid engine)
    mu = (cm + wa) * tr * L
```

with `eraRubber` a step function of year (0.72 below 1968 rising to 0.98 from 2008),
`tierDelta` a compound-tier offset (`eco` -0.04, `touring` -0.02, `performance` 0,
`sport` +0.02, `grand` +0.075), and `track(c)` 1210 mm for `Kei`, 1560 mm for tyres 245 mm or
wider, 1470 mm otherwise.

---

## 3. Grip: splitting a lateral pair into mechanical grip and downforce

The model of lateral grip against speed is

```
grip(v) = mu * (1 + k v^2)
```

Two readings at two speeds give two equations in the two unknowns `mu` and `k`. With
`R = g193 / g97`:

```
aeroFit(g97, g193):
  if g193 <= g97:  return { k: 0, mu: g97 }
  R = g193 / g97
  k  = (R - 1) / (V193^2 - R * V97^2)
  mu = g97 / (1 + k * V97^2)
```

- `g97`, `g193` are the raw panel lateral-g readings at 97 and 193 km/h (units of g).
- `mu` is the mechanical, speed-independent half, and is what is stored as the car's `lg`.
- `k` has units s^2/m^2 and is stored as `dfC = k / DOWNFORCE_K`.

The guard matters: if the higher-speed reading is not strictly greater than the lower one, there
is no measurable rise, so `k = 0` and `mu` is the raw reading. Feeding a raw 97 km/h reading in as
`lg` **and** running an aero term would count the downforce present at 97 km/h twice; the split
is what prevents that.

The grip multiplier the sim applies at speed, a port of the shipped `aeroGripMultiplier`:

```
aeroMult(v, dfC):
  if dfC <= 0:  return 1
  return min(1 + DOWNFORCE_K * dfC * v^2, MAXGRIP)
```

Exactly a no-op at `dfC = 0`. `MAXGRIP = 1.6` caps the multiplier, so no car gains more than 60
per cent over its mechanical grip however fast it is going.

---

## 4. Frontal area and drag

```
frontalArea(c):
  if the car's published width and height (mm) are known:
      A = 0.82 * (width / 1000) * (height / 1000)          [m^2]
  else:
      A = secA[c.sec]                                       [m^2]
```

`0.82` is the standard bounding-box fill factor. The section fallback `secA` runs from 1.45 m^2
(`Kei`) to 1.95 m^2 (`Flagship`, `Bubble weird`, `Hyper wave`), with 1.85 m^2 as the default for a
section not listed.

Drag coefficient back-solved from a measured top speed, at which wheel power exactly balances
aero plus rolling drag:

```
cdFromTop(c, topKmh):
  v  = topKmh / 3.6
  m  = c.kg + 75
  Pw = c.ps * PS * eta
  cd = (Pw / v - froll * m * g) / (0.5 * rho * v^2) / frontalArea(c)
```

This is the terminal-velocity balance `Pw = 0.5 rho CdA v^3 + froll m g v` rearranged for `CdA`
and then divided by the frontal area. No through-the-gears power fraction appears in it, by
design: a top speed **is** steady state at peak-power rpm, so the crank figure is the right power
to use.

**Consequence, stated plainly: the model consumes the product `CdA` and never the two factors
separately.** `carBlock` computes `CdA = c.cd * frontalArea(c)` and every drag term reads only
that product. For any car whose `cd` came from `cdFromTop`, an error in the frontal area cancels
exactly: the same wrong area appears once in the denominator of the back-solve and once in the
multiplication, and the `CdA` that reaches the sim is the one the measured top speed implies. The
frontal area matters as an independent quantity only for a car whose `cd` was **not** derived this
way, that is, a `gearLtd` car carrying a geometric estimate, or a car with no measured top speed.

---

## 5. Braking

Braking grip is its own per-car input and is not a copy of lateral grip. The traction circle says
the two should be equal; the measurements say they are not, and not by a constant factor either
(the ratio `bmu/mu` spans roughly 0.86 to 1.16 across the measured set), so braking carries its
own coefficient.

### The integral form

A stopping distance is an integral, not a constant-deceleration formula, because braking grip
rises with speed for the same reason lateral grip does. With `a(v) = bmu * g * (1 + k v^2)` and
`k = dfC * DOWNFORCE_K`:

```
d(V) = d0 + ln(1 + k V^2) / (2 g k bmu)

  =>  bmu = ln(1 + k V^2) / (2 g k (d - d0))
```

The `k -> 0` limit is the schoolbook expression, taken explicitly because the log form divides by
zero there:

```
bmu = V^2 / (2 g (d - d0))            when k <= 1e-9
```

As implemented:

```
brakeMuFrom(d, V, dfC):
  de = d - BRAKE_D0
  if de <= 0:  return null
  k = dfC * DOWNFORCE_K
  if k <= 1e-9:  return V^2 / (2 g de)
  return ln(1 + k V^2) / (2 g k de)

bmu97Of(c)  = brakeMuFrom(c.b97,  V97,  c.dfC)
bmu161Of(c) = brakeMuFrom(c.b161, V161, c.dfC)
```

The 97 km/h solution is the stored value; the 161 km/h solution is the consistency check on it.

### The dead distance `d0`

`d0` is the **dead distance**: the metres covered between the test tripping and full retardation
arriving (pedal travel, pad bite, weight transfer). It is a property of the measurement protocol,
not of the car, so one global constant serves all cars. Without it, the 161-0 figure reads about
ten per cent more grip than the 97-0 figure on every car that publishes both, one-signed with no
exceptions, which is a model defect rather than scatter: a fixed distance in front of every stop
is a larger share of a short stop than a long one, so it bites the fast cars hardest, which is
exactly the signature in the data.

A car's own `d0` is **exactly determined** where both distances exist, since the two equations
carry two unknowns (`bmu`, `d0`). With

```
R(k) = ln(1 + k V161^2) / ln(1 + k V97^2)          (and R = V161^2 / V97^2 when k <= 1e-9)
```

eliminating `bmu` between `d(V97)` and `d(V161)` gives

```
d0Of(c) = (R * c.b97 - c.b161) / (R - 1),      R = R(c.dfC * DOWNFORCE_K)
```

No fitting is involved per car; fitting happens only **across** cars. The quantity the global
constant has to collapse is the fractional disagreement between the two solutions at a candidate
`D0`:

```
d0Gap(c, D0) = R(k) * (c.b97 - D0) / (c.b161 - D0) - 1      = bmu161 / bmu97 - 1
```

which is zero by construction when the car's own `d0Of(c)` is used. The global constant minimises
that disagreement in least squares over every car with both distances, on a fine grid (one bounded
parameter, `0 <= D0 <= 14` m, step 0.0005 m):

```
BRAKE_D0 = argmin_D0  sum_over_cars ( d0Gap(c, D0)^2 )
```

Least squares rather than the median of the per-car solutions, on two grounds stated in the
source: the per-car distribution is near-symmetric, so the median's robustness buys nothing, and
least squares minimises the disagreement the constant exists to remove rather than a proxy for it.

`BRAKE_D0` is **fitted at run time**, on the set of cars publishing both braking distances. In the
captured run (`lapsim-report.txt`) it is **5.987 m**, that is 0.222 s of brake application at
97 km/h, fitted on 59 cars.

### Fallback for cars with no measured braking

Predicting `bmu` from era and drivetrain alone is far too coarse for the observed range, so the
regression predicts the dimensionless **ratio** `bmu / mu`, letting the car's own grip level carry
the scale:

```
bmu = mu * (a + b * (year - 1990) / 10 + c * [AWD])
```

with `[AWD]` a 0/1 indicator, and `(a, b, c)` obtained by ordinary least squares (Gauss-Jordan on
the normal equations, three predictors) over the cars that do publish `b97`. Fitted at run time;
in the captured run:

```
bmu = mu * (1.0542 + 0.0297 * (year - 1990) / 10 + 0.0610 * [AWD])
```

Selection:

```
brakeMu(c) = bmu97Of(c)  if c.b97 is present
           = gripMu(c) * ratio(c)  otherwise
```

---

## 6. The geometric corner-grip ceiling

`sqrt(mu g r)` has no upper bound, so grip buys corner speed without limit, and the
direction-change term divides by `mu`, so a grippier car is also charged less to change direction.
A corner therefore pays a high-grip car twice. Through a very tight corner that is not what
happens: the car is bounded by steering lock, wheelbase, width and how fast a driver can place it,
not by the contact patch, so past some grip level more grip buys nothing there.

```
GEO_R = 20                         m, the reference radius (a constant in the source)

cornerMu(mu, r) = min( mu, GEO_MU * (r / GEO_R)^GEO_T )
```

- `GEO_MU` is the **level**: the usable-grip ceiling at a 20 m radius (dimensionless).
- `GEO_T` is the **radius exponent**: how fast the ceiling rises with radius (dimensionless).

The ceiling rises with radius, so it bites hardest in the tightest corner and releases entirely
once the corner is open enough for geometry to stop binding. The second parameter is what
distinguishes this from a flat grip cap: a flat cap (`GEO_T = 0`) has no geometry in it and
charges a fast sweeper as heavily as a hairpin, which pushes a high-speed course the wrong way.

### The two placements

The ceiling is applied at both points where the double payout happens: to the grip the corner
**arc** may use, and to the grip the **direction-change** term may divide by.

```
GEO_PLACE = 'both'                 the published setting

arcMu(mu, r) = mu                  if GEO_PLACE == 'agi'
             = cornerMu(mu, r)     otherwise      (used by apex speed)

agiMu(mu, r) = mu                  if GEO_PLACE == 'apex'
             = cornerMu(mu, r)     otherwise      (used by the direction-change term)
```

`'apex'` and `'agi'` exist only for the placement comparison the report prints; nothing published
runs at either.

Downforce is untouched by the ceiling: it caps **mechanical** grip and the aero term is solved on
top of the capped value, so a car taking an open sweeper at very high speed is not charged for
steering geometry it is not using.

### Where the values come from

`GEO_MU` and `GEO_T` are **fitted at run time**, not written in the source (their declarations are
`Infinity` and `0`, which make the ceiling inert until the fit assigns them). They are fitted
jointly on **all scored driven points at once, equal weight per course**, over the courses that
carry driven times; the objective is the mean of the per-course mean absolute percentage errors,
with the cornerless course contributing a constant (no cornering lever can move a straight line,
but it is kept in the objective so that "fitted on all the data at once" is literally true). The
direction-change weight `kAgi` is swept jointly inside the fit on a 600-point grid, so the ceiling
cannot be credited with work that weight would have done. The search is a coarse grid
(`GEO_MU` from 1.0 in steps of 0.025, `GEO_T` from 0 in steps of 0.0125) followed by a fine local
refinement (steps 0.0025 and 0.00125).

In the captured run the fit produces `GEO_MU = 1.220` at `GEO_R = 20` m with `GEO_T = 0.0612`,
that is:

```
usable mu through a corner of radius r = min( mu, 1.220 * (r / 20)^0.0612 )
```

which at the tightest radius on any course gives a ceiling of about 1.176, above the mechanical
grip of every roster car, so the term is exactly inert for all of them.

---

## 7. Apex speed

Steady-state cornering with a speed-dependent grip multiplier is an implicit equation, because the
downforce that raises the grip depends on the speed being solved for:

```
v^2 = mu * g * r * (1 + k v^2),      k = DOWNFORCE_K * dfC
```

Solving for `v^2` gives `v^2 = base / (1 - mu k g r)` with `base = mu g r`. As implemented:

```
apexOf(mu, r, dfC):
  base = mu * g * r
  if dfC <= 0:                       return sqrt(base)          # no downforce, closed form
  k   = DOWNFORCE_K * dfC
  den = 1 - mu * k * g * r
  if den <= 0:                       return sqrt(base * MAXGRIP)   # divergent, take the ceiling
  solved = base / den
  if 1 + k * solved > MAXGRIP:       return sqrt(base * MAXGRIP)   # ceiling branch
  return sqrt(solved)
```

- `mu` here is the **ceiling-limited** grip: callers pass `arcMu(b.mu, r)`, not the raw `mu`.
- `r` is the corner radius in metres, `dfC` the car's downforce coefficient.
- Result is the apex speed in m/s.

The two guard branches are the same statement twice: the implicit solve is only valid while the
required grip multiplier stays under `MAXGRIP`. `den <= 0` is the case where the feedback loop
diverges outright; `1 + k * solved > MAXGRIP` is the case where it converges above the cap. Both
return the capped answer `sqrt(mu g r * MAXGRIP)`. This is a port of the shipped `apexSpeed` in
`packages/sim/src/performance.ts`, and it is an exact no-op at `dfC = 0`.

---

## 8. Acceleration

The curve the lap sim integrates is:

```
a(v) = min( aLaunch, pEff / (m v) ) - ( 0.5 rho CdA v^2 + froll m g ) / m
```

- `aLaunch` (m/s^2) is the low-speed plateau: what the contact patch and the launch allow.
- `pEff` (W) is the effective through-the-gears wheel power that governs the rest.

Two unknowns, and the data publishes two acceleration measurements, so the pair is **solved per
car** rather than predicted. Neither unknown is a claim about *why* a car falls short of its crank
figure: a gearing loss and an overstated power figure are indistinguishable from a lap time, and
the solve does not need to know which is which. `pEff` is deliberately **not** used for top speed,
which is steady state at peak-power rpm and runs on the crank figure.

### The integrator

```
accelIntegral(m, CdA, aL, pE, v0, v1, strict):
  acc(u) = min( pE / (m u), aL ) - ( 0.5 rho DRAG_K CdA u^2 + ROLL_K froll m g ) / m
           with pE / (m u) taken as +Infinity at u = 0

  march v from v0 to v1 in steps h = min(DV_ACCEL, v1 - v):
    a0 = acc(v),  a1 = acc(v + h/2),  a2 = acc(v + h)
    if any of a0, a1, a2 <= 0:  return Infinity if strict, else the time so far
    t += (h / 6) * (1/a0 + 4/a1 + 1/a2)          # Simpson's rule on dt = dv / a
  return t
```

The march is in **speed**, integrating `dt = dv / a` by Simpson quadrature. Starting at rest is
safe because the power-limited branch diverges at a standstill but `aLaunch` is what actually
binds there. The final step is cut to land exactly on the target rather than overshooting.

`strict` makes an unreachable target return `Infinity` instead of a truncated time. Any solve
**must** set it: a truncated time is smaller than the true one, which inverts the monotonicity the
bisections depend on. Reporting uses the lenient default.

### The two-measurement solve

```
solveAccel(m, CdA, t97, t161):

  # decoupled mode
  pE = bisect over [P_LO, P_HI]  such that  accelIntegral(m, CdA, Infinity, pE, V97, V161) = t161 - t97
  aL = bisect over [A_LO, A_HI]  such that  accelIntegral(m, CdA, aL, pE, 0, V97)          = t97

  # joint mode, taken only if the launch crossover is above 97 km/h
  if pE / (m * aL) > V97:
      inner(a) = bisect over [P_LO, P_HI] such that accelIntegral(m, CdA, a, ., 0, V161) = t161
      aL       = bisect over [A_LO, A_HI] such that accelIntegral(m, CdA, a, inner(a), 0, V97) = t97
      pE       = inner(aL)
```

- `t97`, `t161` are the car's published 0 to 97 and 0 to 161 km/h times, in seconds.
- Every bisection is monotone: both unknowns strictly lower every time they touch.

**The condition that selects the mode** is `pE / (m * aL) > V97`, that is, whether the car is
still traction-limited at 97 km/h. Above the launch crossover the curve is pure power, so the
97-to-161 segment fixes `pEff` on its own and the 0-97 then fixes `aLaunch`: two one-dimensional
solves instead of a two-dimensional one, and the decoupling is exact. When the crossover lands
above 97 km/h the 97-to-161 segment still carries `aLaunch`, so the pair must be solved jointly:
an inner solve for `pEff` against the 0-161, an outer for `aLaunch` against the 0-97. The outer is
monotone because holding the 0-161 fixed while raising `aLaunch` moves time out of the launch
phase and into the power phase.

### Validity checks and identifiability diagnostics

```
r97  = accelIntegral(m, CdA, aL, pE, 0, V97)      # round trip, lenient
r161 = accelIntegral(m, CdA, aL, pE, 0, V161)

bad flags:
  aLaunch pinned at a bracket bound   if aL <= A_LO * 1.001 or aL >= A_HI * 0.999
  pEff    pinned at a bracket bound   if pE <= P_LO * 1.001 or pE >= P_HI * 0.999
  0-97  does not round-trip           if |r97  - t97|  > ACC_TOL or r97 not finite
  0-161 does not round-trip           if |r161 - t161| > ACC_TOL or r161 not finite

vc          = pE / (m * aL)                                       # the launch crossover speed
launchShare = accelIntegral(m, CdA, aL, pE, 0, min(vc, V97)) / r97
```

`vc` (m/s) and `launchShare` (dimensionless, 0 to 1) say how well the data **identifies**
`aLaunch`: a car that is power-limited from 20 km/h spends almost none of its 0-97 under the
plateau, so the measurement barely constrains it. The bracket bounds are wide enough that hitting
one means "no solution", not "the bracket was mean".

### One measurement only

```
solveAccelFromT97(m, CdA, t97, aL):
  aL = ACCEL_FIT.aOf(c)                       # taken from the fallback regression
  pE = bisect over [P_LO, P_HI] such that accelIntegral(m, CdA, aL, pE, 0, V97) = t97
```

One measurement leaves one free parameter. Rather than discard the measurement, `aLaunch` comes
from the regression and `pEff` is solved to reproduce the published 0-97 exactly. These are cars
that cannot reach 161 km/h at all, so they are slow, so they are power-limited over almost the
whole run and `pEff` is what the datum actually pins. Same bracket and round-trip checks apply.

### The fallback regression

For cars with no measured acceleration at all, the regression predicts **dimensionless ratios**,
in the same shape the braking fallback uses, so the car's own grip and own power carry the scale
and only the fraction of each that reaches the road is regressed:

```
ACC_X(c) = [ 1, [AWD], [FWD], ln( c.ps * 1000 / c.kg ) ]        # PS per tonne, logged

aLaunch / (mu * g) = ACC_X . bA
pEff    / Pw       = ACC_X . bP

aOf(c) = max( 0.5,   (ACC_X . bA) * gripMu(c) * g )       [m/s^2]
pOf(c) = max( 2e3,   (ACC_X . bP) * c.ps * PS * eta )     [W]
```

`bA` and `bP` are four-coefficient OLS vectors fitted at run time over the cars whose two-point
solve succeeded. **Why the ratios matter:** the regression is asked to predict what fraction of
`mu g` the launch plateau reaches and what fraction of crank wheel power the effective power
reaches, both of which are narrow, dimensionless quantities. It is never asked to predict an
absolute acceleration or an absolute power, which would have to reproduce the car's grip and power
from year and drivetrain. The two floors (`0.5` m/s^2 and `2` kW) exist only to keep a wild
extrapolation physical, and a car that hits one is flagged as clamped.

The captured stdout does not print `bA` and `bP` (that section writes to stderr and is not in
`lapsim-report.txt`), so no numeric values for them are quoted here.

### Selection and provenance

```
accelOf(c):
  if c.z97 and c.z161 present:  solveAccel(m, CdA, c.z97, c.z161)        src = 'measured'   tag 'meas'
  elif c.z97 present:           solveAccelFromT97(m, CdA, c.z97, aOf(c)) src = 'one-point'  tag ' 1pt'
  else:                         aL = aOf(c), pE = pOf(c)                 src = 'predicted'  tag ' est'
```

The result is memoised on the **values** the solve reads (`m`, `CdA`, `mu`, `ps`, `dt`, `z97`,
`z161`), never on the object, so two records for the same car with different mass, power or drag
each get their own honest solve.

A separate, flag-gated `derived` path exists in the source (constants `aCapK = 0.7`,
`awdK = 0.66`, `phi = 1.0`, and a nine-entry engine-archetype `deliveryFactor` table). It is
reachable only when the `derived` flag is set, which is done exclusively by the report's
comparison tables; the published model never reads it.

---

## 9. High-speed traction release

The solve fits `pEff` over the 97-to-161 km/h window. Applying that one number at **every** speed
is a claim the measurement does not support: a car whose tyres run out before its engine does is
measured through a window where the binding constraint is traction, so the number that comes back
is what the contact patch allowed over that window, not what the engine makes. Held flat to
300 km/h it makes the model assert two incompatible things about one car: a top speed that only
full crank power reaches, and a fraction of that power on the way there.

**The decision is taken on the car's own already-solved arithmetic**, not on a new per-car input:

```
vFull = Pw / (m * aLaunch)          the speed below which FULL crank power asks the contact
                                    patch for more thrust than the solved launch plateau can give

tractionShare(m, aL, Pw):
  fTr = clamp( (vFull - V97) / (V161 - V97), 0, 1 )
```

`fTr` is the share of the 97-to-161 km/h measurement window that sits below `vFull`. `fTr = 0`
says the window never touched the traction-limited regime, so the whole shortfall is gearing,
torque curve or an overstated crank figure, and it is just as real at 250 km/h as at 100.
`fTr = 1` says the car was traction-bound across the entire window, so the shortfall the fit
measured is traction alone and it evaporates as speed rises and demanded thrust falls.

The one assumption, stated in the source: `fTr` is a share of the measurement **window** and it is
used as the share of the measured **shortfall** that traction owns. Those are different
quantities. What is defensible is the direction and the ordering, plus the two endpoints, which
are exact.

```
paccAt(b, u):
  if traction release off, or fTr = 0, or u <= V161, or vTop <= V161:   return Pacc
  W    = V161 - V97
  dTop = 1 - W / (vTop - V97)
  w    = 1                                     if dTop <= 1e-9
       = clamp( (1 - W / (u - V97)) / dTop, 0, 1 )   otherwise
  return Pacc + fTr * max(0, Pw - Pacc) * w
```

- `Pacc` is the solved `pEff` (W); `Pw` the crank wheel power (W); `vTop` the car's top speed
  (m/s); `u` the speed in question (m/s).
- The shape is the same dilution arithmetic the detection is built on: run the window on past
  161 km/h to speed `u` and the traction-limited share of it falls as `(V161 - V97) / (u - V97)`,
  because the numerator is fixed at whatever sat below `vFull` and only the denominator grows.
  One minus that, normalised by its value at the car's own top speed, is `w`.
- Normalisation completes the release exactly at the top speed, which is the speed at which the
  rest of the model already assumes full crank power, so the two stop contradicting each other at
  precisely the point where the contradiction was visible.
- What is never handed back is `(1 - fTr)` of the shortfall: the part the measurement attributes
  to gearing, torque curve or an overstated crank figure, which is as real at 300 km/h as at 100.

**It only acts above 161 km/h.** Neither solve integral ever marches above `V161`, so no measured
car's 0-97 or 0-161 round trip can see this function move. In the captured run it fires on 3 of
the 85 cars and is exactly zero for the other 82, whose `vFull` sits below 97 km/h.

---

## 10. Top speed

Terminal speed is a root, not a march: wheel thrust exactly balances aero plus rolling drag, and
net acceleration falls monotonically with speed.

```
vTopOf(b, c):
  net(v) = Pw / (m v) - ( 0.5 rho DRAG_K CdA v^2 + ROLL_K froll m g ) / m
  bisect net(v) = 0 on [1, 200] m/s        (60 halvings)
    if net(1)   <= 0:  vt = 1
    if net(200) >  0:  vt = 200
  if the car has a measured top speed:  vt = min(vt, c.top / 3.6)
  return vt                                                            [m/s]
```

`Pw` is the **crank** wheel power `ps * PS * eta`, never `pEff`: top speed is steady state at
peak-power rpm, which is the same reason `cdFromTop` uses the crank figure. Bisecting rather than
scanning removes a quantisation of roughly 1.8 km/h from every apex clamp and every published
top-speed figure.

---

## 11. The straight

`straightTime(b, v_in, v_out, L)` accelerates a car block `b` down a straight of length `L`
(metres) from entry speed `v_in` (m/s), arriving at the next corner's apex speed `v_out` (m/s).
The march is in **speed**, not time, and it ends at whichever comes first: the brake point, or
terminal speed. Both exits are solved for **inside** the step that crosses them, because a step is
roughly 15 m at motorway speed and breaking at the first step past the brake point would charge
the car for braking from a speed it never reached.

### Net acceleration

```
netAccel(b, u, aSlope):
  aRes  = ( 0.5 rho DRAG_K CdA u^2 + ROLL_K froll m g ) / m
  aPow  = paccAt(b, u) / (m u)
  dRamp = dF + (1 - dF) * min(1, u / 33)
  aEng  = min(aPow, aGrip) * dRamp
  return aEng - aRes + aSlope
```

`aGrip` is the solved launch plateau `aLaunch`, `paccAt` the effective wheel power (section 9).
`dF` is the delivery ramp and is `1` on every car in the published model, making `dRamp` exactly
1; it is non-unity only on the flag-gated `derived` path. The function is hoisted out of
`straightTime` so that the `tau` reading of the corner-exit penalty prices its seconds against
exactly this quantity and the two cannot drift apart.

### Braking, and the braking-point test

```
aSlope    = g * sin(atan(GRADE))            zero for every published number
aBrake(u) = max( 0.5, bmu * aeroMult(u, dfC) * g - aSlope )         [m/s^2]
dBrake(u) = (u^2 - v_out^2) / (2 aBrake(u))   if u > v_out, else 0  [m]
tBrake(u) = (u - v_out) / aBrake(u)           if u > v_out, else 0  [s]
```

**Braking runs on the car's own measured braking coefficient `bmu`, not on lateral `mu`.**
Downforce still helps it, through `aeroMult`, and more the faster the car is going. The
`max(..., 0.5)` floor keeps the deceleration physical if the slope term ever dominates. Both
braking expressions are evaluated at the speed at the top of the brake zone, so the deceleration
is treated as constant across the zone at its entry value.

### The march

```
v = max(v_in, 3);  x = 0;  t = 0
if dBrake(v) >= L:  return tBrake(v)          # enters faster than the next corner allows:
                                              # the whole straight is braking
vCap = vTop  if capToVTop else Infinity

loop:
  if v >= vCap or netAccel(v) <= A_CRUISE:
      return t + (L - x - dBrake(v)) / v + tBrake(v)       # cruise branch
  stride = min(DV_STRAIGHT, vCap - v)
  sc = 1                                   if netAccel(v + stride) > A_CRUISE
     = bisection on s in [0,1] for the crossing of netAccel(v + s*stride) = A_CRUISE   otherwise
  step = Simpson over the partial stride s = sc:
      dt = (h/6) * ( 1/a0 + 4/a1 + 1/a2 )
      dx = (h/6) * ( v/a0 + 4(v + h/2)/a1 + (v + h)/a2 )        with h = sc * stride
  if x + step.dx + dBrake(v + sc*stride) >= L:                  # brake point falls in this step
      sb = bisection on s in [0, sc] for  x + dx(s) + dBrake(v + s*stride) = L
      return t + dt(sb) + tBrake(v + sb*stride)
  x += step.dx;  t += step.dt;  v += sc * stride
  if sc < 1:  return t + (L - x - dBrake(v)) / v + tBrake(v)    # reached terminal speed
```

- Both integrands (`dt = dv/a` and `dx = v dv/a`) steepen sharply as `a` falls towards
  `A_CRUISE`, which is exactly where an endpoint rule spends its error, so Simpson's two extra
  evaluations per step buy the convergence.
- The in-step bisections are 40 halvings of `[0, 1]`, which is exact in double precision.
- **The cruise branch** treats the car as being at terminal speed and coasts the rest of the
  straight at constant speed, then brakes. `A_CRUISE` is needed because the integrand `1/a` is
  unbounded as `a` approaches zero; the speed at which it bites is interpolated, so the threshold
  is a statement about terminal speed rather than a property of the step size.
- `vCap` caps the march at the car's own top speed when `capToVTop` is set (it is, for every
  published number). The effective power `pEff` lands above the crank figure on a handful of cars,
  and without the cap a long enough straight would carry them past their own measured top speed.
- The "whole straight is braking" test cannot recur inside the loop: every step stops at the brake
  point, so `x + dBrake(v) < L` still holds at the top of the next iteration.

---

## 12. The corner, and lap assembly

A course is an array of segments, each `[radius m, angle degrees, following straight m]`. A lap
runs the segments in order and wraps: the straight after the last segment leads into the first
corner's apex.

```
lapSplit(c, segs):
  b    = carBlock(c)                       # the car's solved block
  vTop = b.vTop
  apex[i] = min( apexOf( arcMu(b.mu, r_i), r_i, b.dfC ), vTop )

  for each segment i:
      dArc = ( r_i * angle_i * pi / 180 ) / apex[i]                       # arc time
      dAgi = kAgi * agiCornerW(b, AGI, seg_i) * tightOf(seg_i, AGI)       # direction change
      vOut = min( apex[(i+1) mod n], vTop )
      drop = exitDrop(b, seg_i, apex[i], EXIT, kExit)                     # corner-exit deficit
      dStr = straightTime(b, apex[i] - drop, vOut, L_i)
      t   += dArc + dAgi + dStr

lap(c, segs) = lapSplit(c, segs).t
```

`lapSplit` also returns the three shares (`arc`, `agi`, `str`) and, on request, the exit cost
`exi`, obtained by running each straight twice, once from the reduced speed and once from the
apex; `str` is reported net of `exi` so the shares add to the lap. The total is identical either
way.

### The arc term

```
dArc = r * (angle in radians) / apex          [s]
```

Arc length over apex speed: the corner is traversed at a constant speed, the apex speed. The grip
fed to `apexOf` is `arcMu(mu, r)`, the ceiling-limited grip of section 6.

### The direction-change term

The seconds spent turning the car in, which a point-mass sim steering an arc at a fixed apex speed
never charges for. Its full family:

```
agility per corner = kAgi * (m/1200)^p * (1/mu_eff)^q * (angle/90)^a * clamp((R0/r)^t, lo, hi)

  tightOf(seg, s)       = (angle/90)^a * clamp((R0/r)^t, lo, hi)          # pure geometry
  agiCornerW(b, s, seg) = (m/1200)^p / agiMu(b.mu, r)^q                   # the car factor
  agiSum(b, segs, s)    = sum over corners of agiCornerW * tightOf        # what multiplies kAgi
```

- `mu_eff = agiMu(mu, r)` is the ceiling-limited grip: a car with more grip than a hairpin can use
  does not change direction any sooner for having it. Wherever the ceiling does not bind this
  reduces to plain `1/mu^q`.
- `1/mu` is the price because the transient uses the same contact patch the steady-state corner
  does, which makes it a grip-limited cost and nothing else.
- `R0 = 80` m is the clamp's reference radius; `lo = 0.4` and `hi = 2.5` bound the tightness
  factor.

**The published shape** is `p = 0, q = 1, a = 1, t = 1, hi = 2.5, lo = 0.4, R0 = 80`, so the
published per-corner charge is

```
dAgi = kAgi / min(mu, GEO_MU (r/GEO_R)^GEO_T) * (angle/90) * clamp(80/r, 0.4, 2.5)     [s]
```

Mass is absent by construction (`p = 0`): mass is already priced three times in this model,
through apex speed via the grip fit, through braking distance and through acceleration off the
corner, and a fourth linear charge made the term a heavy-car handicap rather than a transition
model.

**One structural fact about this family:** everything after the `(1/mu)^q` factor is pure
geometry, so on a fixed course the whole of `a`, `t`, `hi` and `lo` collapses into a single scalar
multiplying `kAgi`. The only car-dependence the term has is `m^p` and `mu^-q`. What the shape
controls is the ratio between two courses' totals, which is the only channel through which a
second course can argue about it.

**The affine identity**, which makes every sweep over `kAgi` exact rather than sampled:

```
lap(kAgi) = lap(0) + kAgi * agiSum(car, course, shape)
```

`kAgi` is **fitted at run time** on the driven laps, equal weight per course, on the raw
mean-absolute-percentage-error objective. In the captured run it is **0.82**.

### The corner-exit speed penalty

An alternative to the additive charge: instead of adding seconds, the car leaves the corner
carrying less speed, and `straightTime` starts from the reduced speed, so the deficit is paid all
the way down whatever follows. It compounds on a hairpin onto a short connector and is worth
almost nothing on a fast sweeper onto a long straight, so the tight-versus-fast axis comes out of
the arithmetic rather than being fitted in.

```
exitDrop(b, seg, apexV, s, k):
  if k = 0:  return 0
  L = k * (m/1200)^p / mu^q * tightOf(seg, s)
  if s.form = 'ratio':   return apexV * L / (1 + L)
  base = apexV                        if s.form = 'frac'
       = max(0, netAccel(b, apexV))   if s.form = 'tau'
       = 1                            if s.form = 'abs'
  return min( apexV * (1 - EXIT_FLOOR), L * base )        # EXIT_FLOOR = 0.4
```

The four `form` values are the choice of what the deficit is measured against: `abs` a fixed
number of m/s per unit of corner geometry; `frac` a fraction of the speed carried; `ratio` the
same idea written as `v_exit = apex / (1 + L)` so that it cannot saturate and needs no floor;
`tau` the car's own net acceleration at the apex, which makes `kExit` read as **seconds** spent
rotating instead of accelerating and makes a car with nothing left to give lose nothing.
`EXIT_FLOOR = 0.4` is a structural bound (a car cannot leave a corner below 40 per cent of its
apex speed) on the three forms that need one; the report counts how often it binds.

`kExit` and the exit shape are fitted at run time on all driven laps on all lap courses at once,
equal weight per course. In the captured run the fit is `kExit = 94.5833` with shape
`tau, p 1.0, q 1.0, a 1.5, t 1.5, hi 2.5, lo 0`.

**Which of the two terms is live: the ADDITIVE one.** `kExit` is 0 in the published run, so
`exitDrop` returns 0 on its first line and the corner-exit penalty is exactly inert; the additive
direction-change charge runs at the fitted `kAgi`. Two independent places say so and agree: the
setup code that assigns both levers, and the `constants` block the run writes into
`lapsim/lapsim-data.json` (`kExit: 0`, `kAgi: 0.82`).

The exit term is nevertheless kept, fitted and scored beside the additive one on every run, because
it is better at the thing it was built for and worse at the thing that decides which one ships. A
real direction-change deficit should propagate down the following straight rather than being a flat
charge, and the exit term reproduces materially more of the driven course-character swing. What it
costs is level accuracy on all three lap courses at once, and the reason is structural rather than
tuning: both facsimile geometries were searched under the additive term and are held fixed, and an
exit-speed deficit cannot supply what the frozen Hakone geometry asks of a direction-change term
without saturating. Re-searching both geometries under the exit term is the obvious next step and
has not been done.

### Standing-start offset

A lap as computed is a flying lap: it enters corner 0 at its apex speed and never sees a
standstill. The offset a standing start costs, used only for comparison against driven times, is

```
standingPenalty(c, segs) = accelIntegral(m, CdA, aGrip, Pacc, 0, 3)
                         + straightTime(b, 0,    vOut, L_0)
                         - straightTime(b, vFly, vOut, L_0)
```

with `vFly = apex[0] - exitDrop(...)` and `vOut = apex[1]`. Placing the start line at the exit of
corner 0 makes the offset exactly the extra time the first straight takes from rest. The first
term exists because `straightTime` floors its entry speed at 3 m/s, so the launch below that is
charged separately. It is an estimate of a systematic offset, not a term in the model.

---

## 13. The standing kilometre

`Yatabe Straight` is a course with an empty segment array: 1 km from a standing start, no corners.
A pure straight cannot be written in the `[radius, angle, straight]` contract (a zero-angle
segment would still enter its straight at an apex speed, making it a flying kilometre), so it
carries its own evaluator, registered in the course-evaluator registry beside `lap`.

```
YATABE_M = 1000       m

dragKm(c, metres):
  b    = carBlock(c)
  vCap = vTopOf(b, c)
  dt   = 5e-4  s
  v = 0.1 m/s;  x = 0;  t = 0
  while x < metres:
      v = min( vCap, v + max(0, netAccel(b, v, 0)) * dt )
      x += v * dt
      t += dt
  return t and the split times/distances at 97 and 161 km/h
```

Marched in **time** rather than in speed, because the quantity being integrated to a target is
distance. The step is far inside convergence (5e-4 s and 2e-5 s agree to better than a
millisecond).

```
dragTime(c) = dragKm(c, YATABE_M).t * (1 - DRAG_OFFSET)
```

### The offset

`DRAG_OFFSET` is a flat protocol calibration, fitted in relative error, which is the currency
every score in the harness is quoted in. With `r_i = model_i / driven_i` over the driven standing
kilometres, minimising `sum_i (a r_i - 1)^2` over the multiplier `a` gives

```
a = sum(r_i) / sum(r_i^2)
DRAG_OFFSET = 1 - a
```

It is refitted from the driven set on every run rather than frozen at a decimal, so the driven
kilometres are in-sample for this one constant. In the captured run `DRAG_OFFSET = 3.2830 per
cent`.

It is a **protocol offset and not physics**: the model is fed canned panel figures for 0-97 and
0-161 while the driven kilometres are hand-driven with the assists off, which are plausibly not
the same measurement, and a constant that is one-signed across a 645 kg car and a 1901 kg car
looks more like a measurement gap than a missing term. Power does not order the residual and
neither does power-to-weight, so a scaling law is refused by the data and a flat constant is the
honest shape.

### The mechanism that confines it to the drag strip

**The offset applies to the standing kilometre only and never touches a lap time.** The guarantee
is structural rather than conventional: the multiplier appears in exactly one expression in the
whole file, the body of **`dragTime`**, and `dragTime` is reachable only through the course
evaluator registry entry for Yatabe:

```
COURSE_EVAL = { Yatabe: (c, blk) => dragTime(c, blk) }
courseTime(k, c, blk) = COURSE_EVAL[k] ? COURSE_EVAL[k](c, blk) : lap(c, COURSES[k], blk)
```

The lap path calls `lap()`; the strip calls `dragTime()`; nothing calls both. The offset is
deliberately **not** inside `accelIntegral`, `netAccel`, `paccAt`, `carBlock` or anything else the
lap path can reach, and `dragKm` itself stays raw so that the diagnostics arguing about the model
see the model. Moving it into the shared acceleration path would move every lap time in the file
with it, because the lap courses are accurate with the straight-line pessimism in place: it
cancels against a direction-change weight fitted with that pessimism present.

---

## 14. The overall index

```
COURSE_WEIGHT = { Misaki: 0.40, Hakone: 0.35, Wangan: 0.20, Yatabe: 0.05 }
wOf(k)        = COURSE_WEIGHT[k]  if present, else 1 / (number of courses)
WSUM          = sum over all courses of wOf(k)

best[k]  = min over all cars of  time(car, k)

overall(car)  = ( sum over all courses k of  ( time(car, k) / best[k] ) * wOf(k) ) / WSUM
overall3(car) = the same sum restricted to the lap courses, normalised by their weights alone
```

- `time(car, k)` is `courseTime(k, car)`: `lap()` for a course with corners, `dragTime()` for the
  cornerless one.
- `best[k]` is the fastest time any car in the table sets on course `k`, so each ratio is at
  least 1 and the index is a weighted mean of normalised times.

**A value of 1.000 means the car is the fastest car on every course in the index.** Any car that
is slower than the best on any course scores above 1.000, and the amount above is the
weight-averaged fraction by which it trails the course leaders.

The weights are not equal, deliberately. Influence is weight times the course's spread of
normalised times, and those spreads differ substantially (in the captured run: Hakone 0.099,
Misaki 0.148, Wangan 0.182, Yatabe 0.214), so equal weight would hand the straight-line course
about a third of the index's spread on a nominal quarter and let the two power-biased courses
outvote the only tight one. The published weights buy influence of roughly Misaki 42 per cent,
Wangan 26, Hakone 25, Yatabe 8.

A car's **specialty** is the course on which its normalised time `time / best` is lowest, that is,
the course where it is relatively strongest.

---

## Constants fitted at run time, and where their current values come from

Every value in this table is computed on each run of the harness rather than written in the
source. The numbers quoted are from `lapsim/lapsim-report.txt`, the last captured run.

| Constant | Fitted on | Captured value |
| --- | --- | --- |
| `BRAKE_D0` | least squares on the two-point braking disagreement, over the cars publishing both distances (59 in the captured run) | 5.987 m (0.222 s at 97 km/h) |
| brake fallback `(a, b, c)` | OLS of `bmu/mu` on `[1, (year-1990)/10, AWD]` over the cars publishing `b97` | `1.0542 + 0.0297 (year-1990)/10 + 0.0610 [AWD]` |
| `ACCEL_FIT.bA`, `.bP` | OLS of `aLaunch/(mu g)` and `pEff/Pw` on `[1, AWD, FWD, ln(PS/tonne)]` over the two-point solved cars (59) | not printed in the captured stdout |
| `GEO_MU`, `GEO_T` | joint grid search on all scored driven points, equal weight per course, with `kAgi` swept inside | 1.220 at 20 m; exponent 0.0612 |
| `kAgi` | driven laps, equal weight per course, raw MAE objective | 0.82, **live** |
| `kExit` and exit shape | all driven lap-course points at once, equal weight per course | 94.5833, shape `tau p 1.0 q 1.0 a 1.5 t 1.5 hi 2.5 lo 0`. **Fitted but NOT APPLIED**: the published `kExit` is 0 |
| `DRAG_OFFSET` | relative-error least squares on the driven standing kilometres (7 in the captured run) | 3.2830 per cent |

The sets those fits run over, in the captured run: **45 driven reference times** (Misaki 17,
Hakone 12, Wangan 9, Yatabe 7), of which the 38 on the three lap courses carry the direction-change
fit, plus **6 high-grip points** above the roster's grip range which are the only thing the corner-
grip ceiling is fitted on. Note which of those are in-sample for which constant before quoting an
error figure against it.
