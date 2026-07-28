# Drive mode: the plan to build it

**Status: PLAN, not scheduled. Drafted 2026-07-28.**

**This does not replace `docs/design/parked/drive-mode-spec.md`.** That spec is
sound, technically reviewed, and its physics and rendering design stand. This
document resolves the four things blocking it, marks what in it has gone stale, and
says what the first sprint actually builds.

The maintainer's ask, 2026-07-28: *"start properly working on the driving aspect of
the game. we have usable car specs now... i want to drive our cars. and we have done
all of the groundwork for what the cars should feel like."*

That last clause is the point. When the spec was filed on 2026-07-12, every car
parameter was an open sourcing question and the honest answer was "estimate it and
tune until it feels right". The performance model landed in Sprints 127 to 131,
LOCKED and validated to about 2 per cent on blind predictions against real driven
laps. **The expensive half of this feature was paid for by other work.**

---

## 1. The four blockers, resolved

### 1a. The art bible conflict, which nobody had noticed

`art-direction.md` locks a **640x360 logical stage, integer-only scaling,
nearest-neighbour upscaling, no fractional zoom anywhere**, and calls mixed texel
densities "the number-one amateur tell". It also bans anti-aliasing against
transparency.

`drive-mode-spec.md` section 10 builds its entire anti-shimmer stack on **mipmaps,
trilinear filtering and distance-based blur**, and argues that hardware filtering is
why the GPU-shader approach is correct.

These are directly opposed and **neither document mentions the other.**

**Resolution: build it as a period console would have, and the conflict evaporates.**

Mode 7 is a 1990 Super Famicom technique. F-Zero, Super Mario Kart and Rad Racer all
shimmer at speed, at low resolution, with nearest-neighbour sampling, and that
shimmer is not a defect anyone was trying to fix. It is what the era looked like.

A 1995 game about 1995 cars, rendered the way a 1995 console rendered driving, is
not a compromise. It is the strongest possible answer to the art bible's rule, and
it makes the drive mode look like it belongs in this game rather than like a modern
racer bolted onto it. It is also **cheaper**: no mipmap chain, no trilinear, no
distance-blur shader, less to get wrong.

Rewrite spec section 10 accordingly. Keep exactly one item from it, the art
mitigation: a ground texture authored with low contrast and dithering rather than
fine detail shimmers far less, and that is a pixel-art discipline the project
already has.

### 1b. Section 4's `CarSpec` is forbidden by section 4.1 of the same document

Section 4 defines a `packages/sim/src/drive/carSpec.ts` contract. Section 4.1, added
later, says: *"Drive mode reads them; it does not re-derive them, and it does not
carry a second set."*

A `drive/carSpec.ts` is a second set. The shipped contract is `carBlock(...)`
returning `CarBlock` (`m`, `crankPowerW`, `effectivePowerW`, `mu`, `brakeMu`,
`launchAccel`, `cdA`, `downforceCoeff`), whose own doc comment says "there is one
assembly of them and this is it".

**Resolution: drive mode consumes `CarBlock` directly and adds only what the
point-mass model genuinely cannot supply.** Section 4.1 already lists that set
honestly: `corneringStiffnessFront`/`Rear`, `yawInertiaScale`, `steeringLockRad`,
and the friction-circle blend. Those four are the whole of what this feature has to
invent. Delete the rest of section 4.

### 1c. There is no torque curve, and there never was

Spec section 7 describes engine tiers with "torque curve lookup over RPM".
`formulas.md` section 2 is explicit that `tq`, `tqr`, `psr`, `rl` and `cc` are
"Display data; the physics does not read them". There is no curve behind them for
any car.

**Resolution: no gears, no RPM, no torque curve in the first build.** The drive
model gets its thrust from `effectivePowerW` and its traction limit from
`launchAccel`, both of which are solved per car and calibrated. A power-limited,
traction-limited car accelerating and running out of breath against drag is
completely convincing without a gearbox, and the spec's own phasing agrees: "A
satisfying 'feel my build' mode exists at P0+P1+R0+R1, before any gears or spline
roads."

If gears are ever wanted, they are content that must be authored, not data that
exists. Say so rather than reaching for the display fields.

### 1d. The rules question, where two documents disagree

`IDEAS.md` calls the drive mode "a sanctioned future exception" to the pillars.
`TODO.md` says it is "optional, zero gameplay weight, **which is what keeps it
inside the no-reflex-input hard rule rather than an exception to it**; do not flag
it as a rules violation."

Same conclusion, opposite reasoning, and the difference matters the moment anyone
proposes letting a lap time do anything.

**Resolution: `TODO.md`'s framing governs.** It is the more recent and more careful
one, and it is also the more useful, because it produces a hard rule rather than a
vibe: **the moment drive mode affects money, reputation or progression, it stops
being inside the hard rule and becomes a violation.** So it never does. No rewards,
no unlocks, no faster-lap-better-price. A lap time may be displayed and remembered;
it may never be spent.

That is not a limitation to work around. It is what lets the mode be pure
expression, and it is why it can afford real physics.

---

## 2. What "stat-linked, not twitch-linked" means concretely

`IDEAS.md`'s fourth constraint is the one with teeth, and its 2026-07-12 update
flags the tension honestly: "the spec's real slip-angle physics genuinely reward
driving skill in the moment, which sits in tension with this entry's 'stat-linked,
not twitch-linked' constraint".

The resolution is not weaker physics. It is **assists that scale with the build**:

- Generous default assists (stability, counter-steer help, forgiving grip falloff)
  so an unskilled player never spins and never feels punished.
- **A better-built car is more forgiving, not just faster.** More grip means a wider
  slip-angle window before it lets go; better brakes mean a shorter, more stable
  stop. The build buys margin, and margin is what an average driver actually feels.
- Assists reducible for a player who wants to slide, because the drift culture is
  the setting and the friction circle already supports it.

So the skilled driver goes faster, and the good build makes everyone go faster and
feel safer. That is management payoff rather than a driving-skill test, which is
exactly what the constraint asked for.

---

## 3. The acceptance test, which the spec invented and never wired in

Spec section 4.1 proposes it and then instructs "**Add it to section 12**". That was
never done; section 12's integration block still reads only "Car built in the garage
drives with its actual `CarSpec` in the drive screen."

> "A correctly parameterised drive model should reproduce those lap times. That
> turns 'does it feel right' (unfalsifiable) into 'does a clean lap land inside a
> few per cent of the number the economy sim already shows the player'."

**This is the single most valuable sentence in the spec and it is the definition of
done for the physics.** We have four calibrated courses and a lap model validated to
about 2 per cent against real driven laps. A drive mode that reproduces those times
is correct by construction; one that does not is wrong in a measurable way.

Two caveats to carry, both from `car-performance/README.md` section 6:

- The lap model runs about 2 to 3 per cent fast at high grip on corner-heavy
  courses, one-signed. So drive mode landing slightly slower than the number is
  expected, not a failure.
- The model reproduces only 54 per cent of the driven Hakone-versus-Wangan course
  character swing, and "the direction-change term is the last unphysical thing in
  it". A real yaw model may well do *better* than the point-mass sim here. **If drive
  mode disagrees with the lap model on course character, drive mode is probably
  right.** That is worth knowing before someone treats a mismatch as a bug.

The courses themselves are facsimiles: both carry a `geometryNote` in
`courses.json` warning against citing their radii as facts about the real roads.
A drivable Hakone is a drivable *interpretation*, and it should say so.

---

## 4. What the first sprint builds

The spec's own phasing, made concrete. The target is the smallest thing that
delivers the actual fantasy: **build a car, then feel it.**

**In scope:**

- `packages/sim/src/drive/`, pure TS, fixed 120 Hz accumulator, **never imports Pixi
  or Vue** (the spec's binding architectural rule).
- The friction circle, one grip budget per axle shared between longitudinal and
  lateral. `driveSplitFront` as the single parameter that makes FWD and RWD diverge.
  **The spec's own test: "If they don't diverge, the friction circle is wrong."**
- Reading `CarBlock` for everything the performance model supplies; inventing only
  the four yaw and steering parameters.
- One stage: a flat baked ground texture plus a `surface.png` grip mask, at
  640x360, nearest-neighbour, no filtering.
- Chase camera, keyboard input, assists on.
- A lap timer, displayed and not spent.

**Out of scope, explicitly:** gears, RPM, torque curves, reverse, AI, collisions,
elevation, deformation, tyre wear, multiple stages, gamepad, touch.

**Definition of done:** a clean lap on the drivable course lands within a few per
cent of the lap time the economy sim shows for the same car, on three cars of
different layouts (an FF Civic, an FR AE86, an AWD GT-R), and the three feel
different in the way their layouts say they should.

---

## 5. What this needs that does not exist

**A car sprite from behind.** The art bible locks two sprite classes per car and no
more (a 96x48 side master, and a front-facing oblique scene sprite), and records
that a third angle class was "considered and rejected on cost". A chase camera needs
a rear view. **This is a real, unresolved cost and it is the feature's largest art
dependency**, not a detail. Options, all needing the maintainer: author a third
class for a small subset of cars only; use a generic silhouette; or place the camera
somewhere that reuses an existing angle. It should be settled before the sprint
opens, not during.

**A ground texture and a surface mask** per stage, authored in Aseprite and Tiled.
Small, but it is art work and the no-AI-assets law is absolute.

**Where the mode is entered from.** The spec lists "enter/exit UX" among its open
decisions. The diegetic-UI law applies: this is a physical act in the world, not a
button labelled Drive.

---

## 6. Reuse analysis (directive 16)

**Genuinely new:** the slip-angle model, the Mode 7 renderer, stage content, and the
four yaw and steering parameters.

| Concern | What already exists |
| --- | --- |
| Every physical quantity a car has | `carBlock` returning `CarBlock`, one assembly, already calibrated |
| Whether a car can be driven at all | `lapBlockers`, which names the scrap parts stopping it |
| What condition does to grip, braking, driveline and aero | `physicalConditionFactors`, the four dials |
| What a build does to grip, braking and mass | `buildFactors` (which needs the band fix from `tuning-system.md` first) |
| Course geometry | `courses.json`, four calibrated courses |
| The correctness oracle | `lapTimeSecondsFor` and the harness acceptance test |
| A Pixi canvas island inside a Vue app | `carSprite.ts`, `PixiCarSandbox.vue` |

**Must NOT be built:** a second car-parameter contract (`drive/carSpec.ts`), a
second condition or build model, a torque curve, or a second set of course
geometry.

---

## 7. Open questions

1. **The rear sprite** (section 5). The largest one, and it is an art-cost decision.
2. **Which course ships first?** Misaki carries the most weight and is the only
   course whose geometry error measures the model rather than a search. Hakone is
   the more characterful drive. My instinct is Misaki, because the acceptance test
   is sharpest there.
3. **Does the player drive their own car, or a car?** Driving the actual instance,
   with its actual condition and parts, is the entire point and I would not
   compromise on it. Worth confirming, because it makes the mode depend on the
   garage rather than being a standalone toy.
4. **Is a lap time remembered?** Displaying it is free. Storing a personal best per
   car is a save-schema question and a small one, but it edges toward the mode
   meaning something, which section 1d says it must not.
