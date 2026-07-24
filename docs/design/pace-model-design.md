# Pace model design (car spec arc, the timing half)

**Status: DESIGN PROPOSAL for maintainer review (2026-07-24). Planning only, nothing implemented.**
Grounded in five research passes (acceleration/traction, braking, power delivery, quasi-static lap
simulation, and how racing games rate performance); sources are in the session transcript. This is
the design for what the plan calls Sprint 124: pace, aero, braking, power delivery, and the lap
rebuild. It builds directly on the Sprint 123 grip model.

## The one idea that ties it all together: the friction budget

A tyre has ONE grip budget, and cornering, braking, and putting power down all spend from it (the
"traction circle"). This is the backbone that unifies everything you listed:

- **Cornering** spends the budget sideways: max corner speed `v = sqrt(mu * g * r)`.
- **Braking** spends it lengthways: max deceleration `a = mu * g`.
- **Acceleration** is capped by it at low speed: the tyres can only put down `mu * (load on driven
  axle)` before they spin.

So grip is not a separate stat from braking or launch, it is the same number seen from three
directions. Our Sprint 123 `computeGrip` already produces that `mu`. The pace model reuses it three
ways instead of inventing three separate systems. That is the single most important structural
decision here.

## Everything that goes into pace (your five, plus what else)

**The five you named:**
1. **Power-to-weight** governs the TOP END only (high-speed pull and top speed).
2. **Grip** (the friction budget) governs corners, braking, and low-speed traction.
3. **Aero / downforce** adds grip that grows with speed (`downforce = 0.5 * rho * Cd_lift * A * v^2`),
   so it matters in fast corners and high-speed braking, and its drag costs top speed.
4. **Braking efficiency** (see the braking section: it is fade/consistency, NOT stopping distance).
5. **Power delivery** (the torque-curve shape, not peak power).

**The "what else" the research surfaced:**
6. **The traction limit / drivetrain.** At low speed a car is grip-limited, not power-limited: the
   tyres spin before the engine runs out. This is why a 400 PS RWD car is not twice as quick off the
   line as a 200 PS one, and why AWD launches best (`a_max/g approx mu` for AWD, less for RWD, least
   for FWD, because weight transfers off the front wheels under acceleration). Drivetrain belongs in
   the grip ceiling, not the power path.
7. **Drag and top speed.** Drag rises with `v^2` (the power to overcome it with `v^3`), so it sets
   top speed: `v_top approx (2 * P_wheel / (rho * Cd * A))^(1/3)`. Only matters on long straights.
8. **Weight**, beyond power-to-weight: it also lengthens braking indirectly and loads the tyres, but
   it is the SMALLEST direct lap lever. It should read through power-to-weight and braking, not as a
   big standalone number (this is why Sprint 123 correctly made grip mass-independent).
9. **Course character.** The corner-vs-straight mix of a course decides which of the above wins. A
   twisty touge rewards grip and low-speed punch; a fast expressway rewards power and low drag. This
   is what makes different cars win different events, and it falls out of the model for free.
10. **Gearing** is deliberately abstracted. Research consensus: a single peak-power value with
    constant-power kinematics captures the dominant ranking behaviour for road cars; explicit gear
    ratios add fidelity but a lot of data for little ranking change. We fold gearbox character into
    the power-delivery term instead of modelling ratios. (Revisit only if gearboxes become a
    gameplay lever.)

## The sub-models

### 1. Grip / friction budget (from Sprint 123, extended)
- **Low-speed grip** `mu_low` = the mechanical grip `computeGrip` already returns.
- **High-speed grip** `mu_high(v)` = `mu_low + downforceCoeff * v^2` (per unit weight). Near-0 for
  stock road cars, a touch for the R35/LFA, raised by aero parts. This is your two-figure display
  and the "nothing on an Acty, a lot on a Supra" behaviour, made physical.

### 2. Acceleration
`a(v) = ( min(engineForce(v), gripCeiling) - drag(v) - rolling ) / mass`.
- Low speed: `gripCeiling` wins (traction-limited); it uses `mu` and a drivetrain factor
  (AWD approx mu, RWD a bit less, FWD least).
- High speed: `engineForce = P_wheel / v` wins (power-limited), eroded by drag.
- Yields 0-100 and in-gear pull directly; we can validate against the published `zeroToHundredS`.

### 3. Power delivery (the torque-curve shape, not peak power)
Two scalars from the curve (which we already anchor with `peakTorqueNm`, `torqueRpm`, `powerRpm`,
`redlineRpm`, `aspiration`, `engineConfig`), using the archetypes already in the spec book:
- **Effective power** = mean power over the used rev band (the "area under the curve" as one number).
  Two engines with equal peak power but different curve shapes get different effective power. Drives
  straight-line and open-track pace.
- **Grunt / response** = low-end torque fraction plus a turbo-response penalty (single big turbo
  worst, sequential-twin a small mid-range dip, NA/rotary instant). Drives corner-exit acceleration,
  "how fast torque is available out of a hole." A laggy 2JZ climbs out of a slow corner worse than a
  torquey NA of the same peak power.
This is exactly what you asked for: peak power alone is not enough; the shape decides corner exit.

### 4. Braking (and what "braking efficiency" actually is)
The research is emphatic and it reshapes the feature: **for a road car, single-stop braking distance
is set by tyre grip, not brake hardware.** Once the brakes can lock the wheels (all of them can),
`a_brake = mu * g` and bigger discs do not shorten the stop. So:
- **Braking capability** = the shared grip budget (`mu`, + aero at speed). Better tyres brake harder,
  the same lever that improves cornering and traction. One upgrade, three benefits.
- **Braking efficiency** = **fade resistance / consistency**, a genuinely separate brake-hardware
  stat. Model it as a thermal budget: repeated hard braking (many corners, long descents, heavy
  cars, FWD front-load) depletes it; when spent, effective braking-g drops and pace bleeds. Better
  brakes = larger thermal budget = the car holds full pace deeper into a lap or a hill run. This
  makes "better tyres" (raw pace) and "better brakes" (endurance) two DISTINCT upgrade paths instead
  of two knobs doing the same thing.

### 5. Top speed
`v_top approx (2 * P_wheel / (rho * Cd * A))^(1/3)`. Needs `Cd` (have it) and frontal area `A` (new,
see below). Validate against the published `topSpeedKmh`.

## How it becomes a lap: the quasi-static segment model

The industry-standard simple method (OptimumLap, Hakewill), minus the physics tick loop, fully
closed-form and deterministic (fits our seeded no-random sim law):
1. A **course** is a small loop of segments: each corner has a radius `r` and a following-straight
   length `L`. Authored as corner CLASSES to keep it light: hairpin / slow / medium / fast, plus
   total straight length.
2. **Apex speed** per corner: `v = sqrt(mu * g * r)` (with the aero term for cars that have it).
3. **Down each straight**: accelerate out of the corner (constant-power closed form
   `t = m(v_b^2 - v_a^2)/2P`, `x = m(v_b^3 - v_a^3)/3P`, capped by the grip ceiling at low speed and
   by drag-limited top speed), then brake into the next corner (`a_brake = mu*g`, reduced by fade).
4. **Lap time** = sum of corner times + straight times. A few dozen algebraic steps, no loop.

**Why this is the design win:** different courses reward different cars with NO special-casing. On a
touge (small `r`, short `L`) grip and low-speed punch dominate; on an expressway (large `r`, long
`L`) power and low drag dominate. The same equations produce both. Several courses = several ways to
be fast, which is the "cars win on different tracks" you signed off.

## The player-facing readouts (derived, never hand-authored)

Racing games agree on the discipline: derive every rating from a physical figure (Forza) and never
hand-set them (the distrusted GT Sport meter). A compact, readable set of six, each on a fixed band:
1. **Acceleration** (0-100, from the accel model: power-to-weight gated by traction).
2. **Top speed** (power vs drag).
3. **Braking** (the grip budget; brake fade shown separately if we surface it).
4. **Grip, low speed** (mechanical, the Sprint 123 handling figure).
5. **Grip, high speed** (mechanical + aero, your two-figure display).
6. **Power delivery** (flexible/tractable vs peaky, plus instant vs laggy).
Plus the **lap time per course** as the aggregate "pace" (the thing missions grade and the board
shows). Fold Forza's "Launch" into a drivetrain modifier on Acceleration rather than a seventh bar.

## What maps to existing spec fields, and what is new

| Need | Source |
|---|---|
| power | `spec.stockPowerPs` (real) |
| torque-curve shape | `peakTorqueNm`, `torqueRpm`, `powerRpm`, `redlineRpm`, `aspiration`, `engineConfig` (delivery archetype, already in the spec book) |
| weight | `spec.curbWeightKg` |
| grip (low speed) | Sprint 123 `computeGrip` |
| drivetrain / traction | layout tag + `weightDistributionFront` (+ `comHeightMm` for the transfer term) |
| drag | `spec.dragCd` |
| top-speed / drag area | **NEW: frontal area** (store `frontalAreaM2`, or derive `A approx 0.85 * track * height`; we can also back-solve it from the published `topSpeedKmh` for cars that have one) |
| aero grip | **NEW: `downforceCoeff`** (near-0 stock, small R35/LFA, raised by aero parts) |
| braking efficiency | **NEW: a brake fade/thermal stat**, supplied by brake PARTS |
| courses | **NEW content: corner-class course profiles** |
| pace constants | **NEW economy content** (the levers) |
| calibration truth | `spec.zeroToHundredS`, `spec.topSpeedKmh` (published, validate the model against them) |

## Calibration (a real advantage we already have)

Because Sprint 122 captured published `zeroToHundredS` and `topSpeedKmh` for many cars, we can tune
the accel and top-speed constants so the model REPRODUCES the real figures, then trust it for the
cars where those are unpublished. That is a strong, honest calibration anchor most games do not have.

## Levers (directive 22, signed one block at a time when Sprint 124 is built)

- Pace/accel constants (drivetrain traction factors, rolling/driveline efficiency, the power-to-pace
  mapping).
- The delivery-archetype curve templates and the grunt/response weights.
- Aero: `downforceCoeff` values + the aero-part downforce ladder.
- Braking: the fade/thermal model constants + the brake-part ladder.
- Course definitions (corner-class radii, straight lengths).
- The lap-time constants and the sub-rating display bands.

## Resolved decisions (maintainer, 2026-07-24)

1. **Brake fade = a strategic constraint.** Fade is a real factor on demanding events (long descents,
   endurance, heavy cars); brake upgrades are a core, meaningful choice, not a niche fine-tune.
2. **Three to four courses at launch** (e.g. touge, mountain pass, expressway, mixed circuit), so
   genuinely different cars win different events. Missions may target specific courses.
3. **Store real frontal areas.** Frontal area itself is rarely published, but real width and height
   almost always are, so gather real published width and height per car and compute
   `A ~ 0.82 * width * height`, back-checked against published top speeds. This is a data-gathering
   step for Sprint 124 (the same kind of pass that captured the specs).
4. **Merge the grip pair on the radar.** The radar shows one Grip axis; the low-speed vs high-speed
   split is revealed only in the car-detail panel.
5. **Gearing is abstracted** (folded into the power-delivery term) rather than modelling gear ratios,
   per the recommendation; not contested.
