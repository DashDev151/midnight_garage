# Pace / lap-time model: exact formulas and variables

**Status: PROTOTYPE spec for audit (2026-07-24).** This is the complete mathematics of the lap-time
model as run in the prototype (`lapsim-report.js`). Every formula, variable, and constant is listed
so the maths and logic can be checked. It is a quasi-static point-mass sim (OptimumLap-class);
provenance for each physics relation is in the research passes summarised in
`docs/design/pace-model-design.md`. SI units throughout unless stated. Deterministic: no randomness,
a fixed-step marcher, so it satisfies the sim's seeded-determinism law.

## 0. Constants (first-pass tunables)

| Symbol | Value | Meaning |
| --- | --- | --- |
| `g` | 9.81 m/s^2 | gravity |
| `rho` | 1.2 kg/m^3 | air density |
| `eta` | 0.88 | driveline efficiency (crank power -> wheel power) |
| `f_roll` | 0.012 | rolling-resistance coefficient |
| `PS_W` | 735.5 W | 1 metric PS in watts |
| `m_driver` | 75 kg | added driver mass |
| `k_AWD` | 0.66 | AWD launch-traction factor (fraction of mu usable off the line) |
| `a_capK` | 0.70 | RWD/FWD launch cap coefficient; cap = a_capK * mu (scales with the tyre, not a fixed g) |
| `k_agi` | 0.3 | agility/transition weight (per-corner time penalty scale) |
| `a_cruise` | 0.12 m/s^2 | below this residual acceleration the car is treated as coasting at terminal speed |
| `dv` | 0.5 m/s | straight-line integration step |
| `v_full` | 33 m/s | speed at/above which power delivery reaches full (delivery ramp saturates) |

## 1. Per-car inputs (from the spec sheet)

`ps` power (PS); `kg` kerb weight; `ty` stock tyre string; `com` CoM height (mm); `wb` wheelbase (mm);
`fr` front weight distribution (%); `dt` drivetrain (FWD/RWD/AWD); `ep` engine position
(front/mid/rear); `ec` engine code; `cfg` engine config; `asp` aspiration; `cd` drag coefficient;
`y` year; `top` published top speed (km/h); `width`,`height` (mm).

## 2. Grip coefficient `mu` (the signed-off Sprint 123 model, unchanged)

```
tyreW      = first three-digit group of `ty`            (tyre section width, mm)
track      = 1210 if Kei tag, else 1560 if tyreW>=245, else 1470     (mm)
compound   = tier by width [eco,touring,performance,sport,grand], index by
             width thresholds (<165,<195,<225,<255), capped by era:
             cap = 2 if y<1990, 3 if y<2000, else 4
eraRubber(y) = 0.72(y<1968) 0.76(<1975) 0.80(<1982) 0.835(<1988)
               0.875(<1993) 0.905(<1998) 0.93(<2008) 0.98(else)
tierDelta   = eco -0.04, touring -0.02, performance 0, sport +0.02, grand +0.075
compoundMu  = eraRubber(y) + tierDelta(compound)
widthEff    = clamp( (compoundMu - 0.70)/0.30 , 0.4, 1.0 )
widthAdj    = clamp( (tyreW - 200)/1100 , -0.03, 0.045 ) * widthEff
comR        = com / track
transfer    = clamp( 1 - 0.75*(comR - 0.27) , 0.80, 1.0 )
layout      = 1 + (AWD ? (active?0.035:0.02) : (ep=='mid'?0.015:0))
              active = ec matches RB26DETT|VR38DETT, or name contains "Lancer"
mu          = (compoundMu + widthAdj) * transfer * layout       <-- lateral grip coefficient
```
`mu` is dimensionless (a friction coefficient). It feeds cornering, braking, and the traction limit
(the shared friction budget). Uncapped: a stock car sits ~0.66-1.08; slicks/aero push it higher.

## 3. Mass, power, aerodynamics

```
m          = kg + m_driver                              (kg)
P_wheel    = ps * PS_W * eta                            (W)
A          = 0.82 * (width/1000) * (height/1000)        (m^2, frontal area; real dims)
             (fallback: a body-class estimate if dimensions unknown)
CdA        = cd * A                                     (drag area, m^2)
F_drag(v)  = 0.5 * rho * CdA * v^2                       (N)
F_roll     = f_roll * m * g                              (N, constant)
```

## 4. Launch traction limit (longitudinal grip ceiling, by drivetrain)

Standard traction-limited acceleration with load transfer (Gillespie). `bL` = rear axle load
fraction, `cL` = front, `hL` = CoM-height / wheelbase.

```
bL = 1 - fr/100 ,  cL = fr/100 ,  hL = com / wb
a_cap = a_capK * mu                               (launch cap scales with tyre grip, not a fixed g)
AWD:  ag = mu * k_AWD
RWD:  ag = min( (mu * bL) / (1 - min(0.9, mu*hL)) , a_cap )   (rear transfer helps; capped)
FWD:  ag = min( (mu * cL) / (1 + mu*hL) , a_cap )             (front transfer hurts; capped)
a_grip = min(mu, ag) * g                          (m/s^2; never exceeds mu*g)
```
`a_cap = a_capK * mu` bounds the launch traction so a rear-heavy mid-engine car (e.g. F355 at ~59%
rear axle) cannot be over-credited by the unbounded load-transfer term. Unlike a fixed g cap it
scales with the tyre: street rubber (mu ~0.88) caps ~0.62 g as before, while a slick build (mu ~1.5)
caps ~1.05 g, per the Calsonic telemetry (0-97 km/h in 2.5 s = 1.10 g average).
```
```
This is why a high-power car is not proportionally quicker off the line: at low speed acceleration is
clamped to `a_grip`, independent of power.

## 5. Power delivery (torque-curve shape -> corner-exit modifier)

```
archetype  = from (cfg, asp, ec): rotary NA/turbo, seq-twin (2JZ), parallel-twin,
             single-turbo, supercharged, VTEC-NA, big-NA, plain-NA
dF         = delivery factor by archetype:
             plainNA 1.00, bigNA 1.00, superch 0.98, seqTwin 0.90, parallelTwin 0.85,
             seqTwinR 0.85, vtecNA 0.88, rotaryNA 0.82, singleTurbo 0.78
dRamp(v)   = dF + (1 - dF) * min(1, v / v_full)          (dimensionless, in [dF,1])
```
`dRamp` scales usable engine force: at low speed (corner exit) a laggy/peaky engine delivers only
`dF` of its force, rising to full by `v_full`. Torquey NA cars (dF=1) get no penalty.

## 6. Acceleration at speed v (on a straight)

```
a_power(v)  = P_wheel / (m * v)                          (power-limited accel, m/s^2)
a_engine(v) = min( a_power(v), a_grip ) * dRamp(v)       (lesser of power and traction, delivery-shaped)
a_resist(v) = ( F_drag(v) + F_roll ) / m
a(v)        = a_engine(v) - a_resist(v)
```

## 7. Top speed

```
v_phys = smallest v (marched from 20 m/s) with a_power(v) - a_resist(v) <= 0
v_top  = min( v_phys , top/3.6 )     (physics maximum, capped at the published figure)
```

## 8. Straight solver: time from entry speed v_in to required exit speed v_out over length L

`a_brake = mu * g` (grip-limited braking deceleration, the same friction budget). March `v` from
`v_in` in steps of `dv`, accumulating distance `x` and time `t`:

```
repeat:
  d_brake = (v^2 - v_out^2) / (2*a_brake)   if v > v_out, else 0     (distance needed to slow to v_out)
  if x + d_brake >= L:                       # brake point reached
      t += (v - v_out)/a_brake ; stop
  compute a(v) from section 6
  if a <= a_cruise:                          # at terminal speed: coast then brake
      cruise = L - x - d_brake ; if cruise>0 { t += cruise/v ; x += cruise }
      if v > v_out: t += (v - v_out)/a_brake ; stop
  else:                                      # accelerate one step
      dt = dv / a ; x += v*dt ; t += dt ; v += dv
```
The `a_cruise` branch avoids `dt = dv/a` diverging as `a -> 0` near terminal speed.

## 9. Corner model

For corner i with radius `r_i` (m) and turn angle `theta_i` (deg):
```
apex_i   = min( sqrt(mu * g * r_i) , v_top )             (max cornering speed, capped at top speed)
arc_i    = r_i * theta_i * pi/180                        (corner arc length, m)
t_corner = arc_i / apex_i                                (traversed at constant apex speed)
tight_i  = (theta_i/90) * clamp( 80/r_i , 0.4, 2.5 )     (tighter + sharper = larger)
t_agility= k_agi * (m/1200) / mu * tight_i               (transition/rotation cost: heavy, low-grip,
                                                          tight corners cost most)
```
`t_agility` is the deliberate correction for what a point-mass omits (yaw/direction-change time); it
is what makes a heavy car lose on a twisty road even at equal grip and power.

## 10. Lap assembly

A course is an ordered loop of segments `[ (r_i, theta_i, L_i) ]`. Lap time:
```
lap = SUM over corners i of [ t_corner(i) + t_agility(i)
                              + straightTime( apex_i , apex_{i+1 mod n} , L_i ) ]
```

## 11. Validation quantities

```
0-100 time = integrate a(v) with a_engine = min(a_power, a_grip)  (no delivery ramp, full traction)
             from v=0 to 27.78 m/s (100 km/h); stop if a<=0.
top speed  = v_top (section 7), reported in km/h; compared to published.
```

## 12. Courses (prototype layouts; radius m / angle deg / following-straight m)

```
Touge    : (18,150,90)(45,90,70)(20,140,80)(55,80,120)(110,60,150)(18,160,70)(50,90,100)(130,50,180)
Mountain : (60,80,200)(140,60,280)(22,150,150)(50,90,180)(120,70,250)(300,40,400)(55,85,160)
           (150,55,300)(20,140,120)(130,60,220)
Wangan   : (320,35,1200)(160,50,700)(400,30,1500)(350,40,900)(180,45,600)
Circuit  : (55,90,200)(130,70,250)(20,150,140)(300,40,380)(50,85,180)(140,60,240)(280,45,320)(60,80,160)
```

## 13. Ranking metrics

```
best[k]     = min over all cars of lap(car, course k)
overall(car)= mean over the four courses of  lap(car,k) / best[k]     (1.000 = fastest everywhere)
specialty   = the course k minimising lap(car,k)/best[k] (the car's relatively strongest course)
```

## 14. Provenance and known simplifications

- Acceleration `a = (min(F_engine, F_grip) - F_drag - F_roll)/m`, the two-regime min-of-forces, is
  the standard quasi-steady-state form (OptimumLap, QUB/Hakewill lap sims).
- Corner speed `sqrt(mu*g*r)` and braking `mu*g` share one friction budget (the traction circle).
- Deliberately omitted (as OptimumLap omits them): explicit gear ratios (folded into delivery),
  the friction-ellipse blend at corner entry/exit (single apex speed instead), tyre load-sensitivity
  (constant `mu`), transient weight transfer beyond the launch term, and thermal/brake fade (a future
  stint-level term, per the resolved design).
- First-pass constants to calibrate against more data: `k_AWD` (0.66), `k_agi` (0.5), `a_cruise`
  (0.12), `eta` (0.88), and the four course layouts. `f_roll` and `rho` are standard and fixed.
- Frontal areas are real (0.82 x width x height) for cars with gathered dimensions; a body-class
  estimate otherwise (being replaced by real dimensions for the whole roster).
