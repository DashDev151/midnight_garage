# Drive physics v1

Status: sim core, tests and the dev drive screen are in place; the ghost
acceptance matrix is honest and currently RED (1 of 9 in band). This
document records the decisions, the reuse analysis directive 16 asks for,
and every tunable a maintainer should review.

## What this is

A real-time handling model (Marco Monster lineage: one rigid body on two
slip-angle axles) integrated at a fixed 120 Hz, pure TypeScript in
`packages/sim/src/drive/`, with no rendering imports. The game renders
published `DriveState` telemetry; the physics never learns the renderer
exists. Drive mode touches no money, reputation or progression.

Try it: `pnpm dev` in `packages/game`, navigate to `/drive-debug` (dev
builds only). Arrows or WASD drive, space is the handbrake, selects swap
car and course live, and the assist slider fades every helper from raw to
full.

## The player feature

`/drive` is a real (non-dev) route reached from the test track's "Drive it
yourself" link, which carries the location's course and the picked car.
Three phases in one screen (`DriveScreen.vue`): setup (only cars the
player OWNS; `lapBlockers` disables cars that cannot run, exactly as the
lap board refuses them), driving (top-down heading-up canvas, kerbs,
start-line chequer, minimap, HUD with live delta, Esc pause), and results
(laps, best and last against the target). The car driven is the INSTANCE:
`driveSetupFor` (sim, `drive/instance.ts`) assembles derived power,
effective compound and downforce, and condition and build factors by the
exact route `lapTimeSecondsFor` takes, so the target time IS the board's
figure for that car. Driving changes nothing: no money, wear, reputation
or progression moves. Placeholder art is deliberate and swappable: the
sprite is `carArt.ts` (one procedural painter) and the road is painted
geometry. Logic lives in tested modules (`driveSession.ts` timing and
formatting, `carArt.ts`, `drive/instance.ts`); the canvas screen itself is
coverage-excluded like the debug screen. The dev `/drive-debug` screen
remains as tooling (whole roster, stock trim).

## Reuse analysis (directive 16)

Reused, not restated: `carBlock()` is the single assembly of what a car
physically is (mass, powers, grip, braking, launch plateau, drag,
downforce); `cornerMu`, `apexSpeed`, `vTopOf`, `aeroGripMultiplier` and
`factoryDownforceCoeff` are the lap model's own maths and are imported,
never copied (`apexSpeed` and `vTopOf` gained exports; behaviour
unchanged); course geometry is the calibrated `courses.json` segment data;
air density, gravity and rolling resistance come from the economy content
so drive mode and the lap model cannot disagree about the air.

Invented here, because the point-mass model never carried it: turn
DIRECTIONS for corners (alternating, presentational only; every radius and
length is calibrated), the tyre curve shape, yaw dynamics, weight-transfer
lag, assists, the synthetic gearbox, the track ribbon, and the ghost
driver.

`redlineRpm` note: the spec's redline sets the rev dial's scale and shift
points only. The gearbox invents no torque curve; its power envelope is
normalised so the mean over a gear sweep is exactly 1, so net acceleration
still integrates to the calibrated figure. Where redline is display data,
this is display usage.

## Load-bearing design decisions

- Speed-sensitive steering lock (`steerLockFor`): kinematic angle for
  `ayCapFactor` times current grip PLUS a front peak-slip allowance. Digital
  input stays drivable; the limit stays reachable.
- Braking splits by live axle load with the rear biased UNDER ideal
  (`brakes.rearBiasSafety`), as period proportioning valves were set: an
  exactly-ideal rear has zero lateral budget and slides at every braked
  turn-in. A full-pedal straight stop still lands on the calibrated figure.
- The yaw-damper assist is ONE-SIDED: it bleeds yaw beyond the grip-bounded
  kinematic rate and never adds rotation. A symmetric damper spins the car
  up in hairpins, because a cranked wheel's kinematic rate includes the
  slip allowance the path does not have.
- Off-road drag sits below the weakest car's grass-grip launch force:
  grass is slow, never a trap.
- The ghost steers by CURVATURE with an explicit slip-angle feed-forward
  and error terms whose lateral-acceleration authority is capped as grip
  fractions; its speed plan is the lap model's own corner maths with a
  friction-circle-aware backward braking pass; braking is fed forward from
  the plan gradient. The full campaign log of why each piece exists lives
  in `DRIVE_CHECKPOINT.md` at the repo root until acceptance is green.

## Acceptance

`packages/sim/tests/driveGhost.test.ts` drives a scripted clean lap for
three cars (FWD, RWD, AWD) on three lap courses and holds the ratio to
`lapTime()` inside 0.96..1.07. Current state: misaki/civic passes; two
more combinations are clean but a few percent slow; the rear-limited cars
still take occasional large excursions. The band is not to be widened to
make this pass. `driveTrack` and `drivePhysics` (10 tests: geometry,
terminal speed, calibrated stop, gear behaviour, envelope normalisation,
FWD/RWD divergence) are green, as is the roster test that every in-game
car derives sane drive parameters.

## Tunables for maintainer review

All in `packages/sim/src/drive/config.ts` (none touch the economy):
`stepHz`, `loadTransferTauS`, `lowSpeed.*`, `tyre.*` (peak slip base,
reference mu, slide retain, falloff width), `steering.*` (lock, slew
rates, ayCapFactor, slipAllowanceFactor), `driveSplitFront` per layout,
`brakes.rearBiasSafety`, `handbrake.*`, `assists.*` (TC and ABS caps, yaw
damp, countersteer, retain bonus), `gearbox.*` (gear count, first and top
gear placement, shift points, cut, envelope shapes per aspiration,
redline fallbacks), `track.*` (sample spacing, half widths, off-road grip
and drag), `geometry.*` (yaw inertia constants, weight and CG fallbacks),
and `ghost.*` (fractions, plan margin, preview, tracker gains and caps,
mode latches). The ghost block tunes only the scripted driver, never the
player's physics.
