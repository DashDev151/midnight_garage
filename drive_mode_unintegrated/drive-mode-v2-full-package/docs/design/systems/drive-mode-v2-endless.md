# Drive mode v2: the endless night road

Status: implemented, tests green, awaiting playtest sign-off.
Feature folder: `packages/game/src/screens/drive/`
Screen: `packages/game/src/screens/DriveScreen.vue` (route `/drive`)

## What this is, in plain language

A driving mode, not a racing mode. The player picks a car they own and
drives it down an endless mountain road at night. There is no clock, no
opponent, no walls and no finish line; the only numbers are the
speedometer and the odometer. Every road is generated from one random
seed, so every drive is a new road, and the same seed would always
produce exactly the same road. Driving changes nothing about the save:
no money, no reputation, no wear.

The look is deliberate: low-poly flat-shaded geometry rendered at a tiny
internal resolution and blown up, so the picture is made of chunky
pixels, with a limited colour palette, violet depth fog and a banded
night sky.

## The three parts and how data flows

1. `roadGen.ts` generates the world. The centreline makes constant
   forward progress along a global axis, with all its winding expressed
   as bounded lateral wander from seeded value noise; heading is the
   slope of that wander, never an integrated random walk. Elevation is
   a second noise stack over arc length. Everything is a deterministic
   function of the seed.
   Geometry exists as a sliding window of samples every 2 m, grouped
   into 100-sample chunks: `maintainWindow` generates chunks ahead of
   the car and drops them behind, and the absolute station only ever
   increases. The station is the odometer.
2. `arcadePhysics.ts` moves the car. It is the sim's full drive model
   (per-axle friction circle, real gearbox, aero, load transfer) with
   the arcade register applied as causes, not hacks: the lateral force
   curve rises to a rounded peak and then holds at 0.985 instead of
   falling off a cliff, the slip window is widened 2.3x with the driven
   axle saturating first, grip is mapped up 1.7x from the car's real mu,
   steering has full authority at all speeds with the prototype's input
   slew, and gearshifts soft-cut to 55 % torque instead of zero so a
   drift survives the shift. It steps at a fixed 120 Hz and is fully
   deterministic.
3. `webglRenderer.ts` draws it. Raw WebGL 1, no libraries: one vertex
   format (position, normal, colour), everything rendered into a low
   internal framebuffer and NEAREST-upscaled by an integer factor of the
   device-pixel canvas, with 10-level posterisation and a light
   interleaved-gradient dither. Each road chunk is one VBO plus a lamp
   registry, created when the chunk generates and deleted when it drops.

   The lighting engine: per-fragment shading with one directional
   moonlight (0.62 ambient, 0.45 diffuse), up to ten point lights fed
   per frame from the nearest sodium lamps (amber, 27 m radius, squared
   falloff, half-Lambert so the pool reads on the flat road), and one
   headlight spot cast from the car's nose along its pitched forward
   axis (34 m, warm white). Surfaces pushed with `pushEmissive` carry a
   zero-length normal, which the shader reads as full-bright albedo:
   lamp heads, reflector tops, and the car's head and tail lamps.
   Sodium zones come from `road.litAt` (value noise, 240 m wavelength,
   threshold 0.52, about half the road lit in stretches); lamps stand
   every 16 m on alternating sides inside them.

`DriveScreen.vue` wires them together: a fixed-step accumulator calls
`stepArcade`, `locateOnRoad` turns the car's x, y into a station and
lateral offset, `surfaceAtLateral` decides tarmac or grass, and the
render call receives the car pose plus the smoothed camera heights.

The car's figures come from the player's actual instance:
`driveParamsForInstance(car, model, context)` in
`packages/sim/src/drive/instance.ts` assembles DriveParams from the real
build, wear and compound, gated by `lapBlockers`, with no course
involved. A worn-out engine is slower here too.

## Tech stack

TypeScript and Vue inside the existing game package; the sim package for
car parameter derivation; raw WebGL 1 for rendering. No new
dependencies. The standalone artifact `midnight-roads-v9.html` is the
same systems in one plain-JavaScript file and remains the fast iteration
vehicle.

## Tuning

Player-facing feel lives in one object, `DEFAULT_TUNE` in
`arcadePhysics.ts`:

| Key    | Default | Meaning |
| ------ | ------- | ------- |
| grip   | 1.7     | Multiplier on the car's real mu into gameplay range |
| slip   | 2.3     | Multiplier on the derived peak slip window |
| hold   | 0.985   | Post-peak lateral force retained (1 is a perfect hold) |
| assist | 0.1     | TC, ABS, yaw damp, countersteer blend (player slider) |
| power  | 1.0     | Engine power multiplier |

World character lives in `roadGen.ts` (`makeRoad`) and in the mesh
constants of `webglRenderer.ts`:

- Wander: three noise octaves (330, 175 and 80 m) scaled by zone
  multiplier x character noise (820 m), effective multiplier capped
  at 1.95; slope soft-saturated below 1.05 and low-passed over 10.4 m
  during integration. Measured register (turned-up): self-approach
  floor 124 m, tightest bends about 20 m radius, median tight bend
  about 170 m (medium sweepers), max grade 21%. Calm now comes from
  village and coast zones rather than the character noise.
- Elevation: a per-cell zone lift (summits +20 to +32 m, coasts -7 to
  -4 m, cosine-blended at cell edges) over a ~1.4 km mountain swell of
  +-34 m, plus local octaves 13 m at 430 m, 4.5 m at 150 m and 1.5 m at
  70 m. Measured span about 58 m over 10 km; max grade 17-21 %.
- Coast cells split 45 % sheer cliffs (narrow shoulder, 22 m face
  straight down to the sea) and 55 % beach shores. Driving out over
  the water in either form resets the car to the nearest road sample
  with speed clamped to 6 m/s (`waterHazardAt` in roadGen).
- Distant ridge silhouettes: two layered dark walls at 205 m and 330 m
  lateral whose top edges undulate from the terrain noises; skipped
  over open sea so the coast horizon stays clear.
- Controls: the left slider sets a MAX SPEED, not a throttle. The car
  cruises up to the target (`speedTargetControl` in arcadePhysics: full
  throttle when 5 m/s under, coast when over, a light trim brake when
  more than 2.5 m/s over). A small band below the notch is a tiny
  reverse gear (drive fraction 0.30 backwards, capped at 3.6 m/s,
  engaging only near a standstill; brakes oppose the direction of
  motion). A dedicated BRAKE button overrides everything: while held,
  throttle is forced to zero and the brake ramps to full in 140 ms.
- Cross-slope terrain: each zone cell tilts the flanking terrain
  (signed, up to 1.0 in summits, 0.12 in villages; coasts always put
  the hill on the land side) so one side climbs about 30 m at 40 m
  lateral and 64 m at 92 m while the other falls away, like a road cut
  into a hillside. The tilt holds the cell's value across its middle
  half with 25 % cosine ramps; ridges, trees and rocks follow it.
  The car itself still rides the analytic centreline elevation, so the
  first 11 m beside the road stay flat and drivable.
- Polish notes. Edge lines are a bright 0.45 m emissive core over a
  1.2 m lit halo band: the core goes sub-pixel with distance under
  NEAREST minification (which read as dots); the halo keeps catching
  pixels so the line runs unbroken to the fog. Internal render floor
  raised H/280 -> H/330. Trees carry per-instance hue jitter; the car
  gained a bonnet wedge and dark bumpers in both codebases. Audio: the
  master gain ramp lives in the per-frame update (the artifact's
  master sat at 0 forever, killing sound and the toggle with it: the
  ramp had been lost); a soft master limiter (comp -8 dB, 6:1) guards
  the stacked buses; tyres pan with lateral velocity through a
  StereoPanner. The sound chip shows its state as text; Reset flashes.
- Drivetrain identity, as causes. Engine braking drags the driven
  axle when the throttle closes below 35 % (0.22 x driveCap, ramping
  in above walking pace), which is what makes a lift DO something.
  FWD (EG6): a throttle lift narrows the rear peak slip with
  deceleration (up to 38 % at 2.5 m/s^2; braking exempt, EBD owns
  that), producing the classic tuck-in: measured yaw 0.19 on part
  throttle rising to 0.87 on lift. AWD (BNR32): ATTESA-style transfer
  migrates torque forward as the rear slips (front share up to 0.68),
  keeping full-power corners planted (rear saturation peaks 0.99, was
  1.10). RWD (AE86) is untouched: progressive, drift-friendly, with
  slightly livelier trail rotation from the new engine braking.
  Benchmarks from real instance data: 0-100 km/h 5.1 s (R32), 6.7 s
  (EG6), 8.5 s (AE86); 0-160 spreads 12.7 / 18.1 / 26.0 s. The R32's
  turbo envelope genuinely bogs below boost, which reads as
  acceleration parity off corners.
- SINGLE CODEBASE (v16.6). The standalone artifact is now a BUILD
  OUTPUT: src/screens/drive/standalone/shell.ts is a thin vanilla
  host (DOM, input, fixed loop) importing the SAME roadGen,
  webglRenderer, arcadePhysics, audio and driveWorld modules the game
  screen uses; scripts/buildArtifact.mjs bundles it via vite lib mode
  (iife) and stitches it into tools/artifact/template.html. Command:
  pnpm build:artifact. The hand-synced artifact era, and its whole
  divergence defect class, is over.
- Engine voices (v16.6), from engine-order acoustics: harmonics sit
  at half-integer crank orders, dominant order = cylinders/2. AE86
  4A-GE: rough half-orders, heavy AM, exhaust bark. EG6 B16A: clean
  integer orders that brighten with rpm as VTEC comes in. R32 RB26:
  smooth order-3 six, deep sub, broadband turbo hiss riding load.
- Session UX (v16.6): pause (Esc) with Resume, controls/sky/rain/
  camera rows and End drive; auto-pause on backgrounding; first-run
  control hints; camera modes Chase/Hood/Far on C.
- Content (v16.6): route codes (MG-base36 seed, entered at setup,
  shown on the card); three rest-stop layouts (full station, lookout
  parapet, konbini-forward); tri-tone oncoming traffic; a rare
  vermillion torii (kasagi, nuki, black cap, base uplights) in forest
  and village cells.
- ABS (v16.4), always on like every car since the nineties: brake
  demand is capped at 86 % of the front circle and 92 % of the rear,
  so a fully held binary keyboard brake keeps steering authority
  (71 degrees of turn-in measured under full brake) while total force
  never exceeds mu x Fz - the grip model is intact, ABS completes it.
- Sense of speed (v16.4), the restrained way: the follow distance
  breathes with acceleration (hangs back under power, closes under
  braking, spring-smoothed) and the FOV widens up to 9 degrees with
  speed; a subtle radial smear at the frame edges scales with speed
  in the post pass. All deliberately gentle.
- Haze, not fog (v16.4): exponential with distance, thinning with
  height above the camera, capped at 0.88 so silhouettes always
  survive; valleys pool, summits stay clear.
- Rest stops (v16.4): roughly one cell in three every ~1.9 km draws a
  pull-off on a deterministic side (always the land side on coasts):
  widened apron, petrol canopy with glowing underside and pumps, a
  kiosk with a lit shopfront, a tall red sign, sometimes a parked
  car, one sodium light; trees and houses yield the ground.
- Weather and time of day (v16.3). A slow 15-minute loop blends four
  moods (dusk, night, deep night, pre-dawn): fog colour, a sky triad,
  ambient scale and emissive scale, all as uniforms; the renderer
  carries a mood object the screen refreshes per frame. Rain is a
  random-length shower state: wet fades over ~6 s, cuts grip by up to
  32 % (showcasing the braking register), thickens fog by 40 %,
  darkens and cools lit surfaces while sharpening emissives, adds
  bandpassed patter and a low wash to the mix, and draws streak
  particles ahead of the camera.
- The living night (v16.3). At most one oncoming car at a time spawns
  380 m ahead every ~20-45 s, drives the opposite lane at 13-18 m/s
  with real headlights (two reserved light slots + glow halos) and a
  grey copy of the player's silhouette; no collision, pure event.
  Cliff cells each carry a lighthouse (tower in the chunk mesh) whose
  occulting flash and slow 46 m beam sweep render in the glow pass.
  Village windows near the car flicker analytically (30 % of houses,
  35 % of those TV-blue). Tyre smoke: a 48-particle pool of pale
  rising puffs while sliding above 6 m/s.
- The drive card (v16.3). End drive shows distance, time, top speed
  and longest drift; zones are deliberately absent and the HUD zone
  label is gone: to the player it is one continuous road.
- PARITY AUDIT (v16.2): the artifact and the repo were verified to be
  the same machine. Road generation is digit-identical across seeds
  (geometry, elevation, zones, cliffs, tilt, ridges; pinned forever by
  the golden road test). Physics matched to three decimals on the
  AE86 and EG6; the R32's ~1 % delta fingerprinted the one fork - the
  artifact applied aerodynamic downforce to grip and the repo did not
  - closed by wiring the sim's aeroGripMultiplier into stepArcade
  (mu, brake force and brake clamps, drive traction unaffected),
  after which all metrics matched to every printed digit.
- Braking stability v2, tuned at TRUE mapped grip (the first pass was
  measured against raw dump params at ~60 % of shipped grip; the repo
  test caught it). Four mechanisms, all real-car causes: (1) the
  brake friction-circle relief is REAR-ONLY (0.5) - the front circle
  saturates under hard braking like a real car, stabilising
  understeer, while the rear keeps its sideways grip; (2) EBD yields
  rear brake demand by up to 62 % with rear slip; (3) MSR (engine
  drag torque control) backs engine braking off as the driven axle
  slips and as pedal pressure rises; (4) ESC under braking: yaw in
  excess of 1.15x the steered kinematic rate is damped at 3.1/s
  scaled by brake input - trail rotation the driver asks for
  survives, the snap beyond it does not. Measured at true grip:
  disturbed no-steer braking drifts 5 degrees; a full trail stop at
  0.3 steer rotates 102 degrees against a 108 degree kinematic
  prediction; downhill 15 % trail braking peaks at 1.03 rad/s; a
  moderate at-speed braking arc peaks at 1.17 rad/s against a 1.26
  commanded rate (mild understeer).
- Braking stability v1 history, superseded: (1) the friction circle couples 30 %
  less under braking than under drive (`brakeSaturationRelief` 0.7),
  the EBD-era tyre behaviour; (2) EBD proper: rear brake demand yields
  by up to 55 % as rear slip develops, so the rear axle keeps its
  sideways grip during load transfer instead of snapping loose; (3)
  the standstill clamp keys on TOTAL speed, so a sideways slide bleeds
  out through the tyres (~1 g) instead of wall-stopping the moment
  longitudinal speed crosses zero. Measured: a disturbed no-steer
  brake from 130 km/h drifts 2 degrees; trail braking at 0.3 steer
  rotates the kinematic ~93 degrees without looping; a 10 m/s lateral
  slide settles in 1.3 s with a worst per-step speed change of
  0.08 m/s.
- The car rides the DRAWN surface, not just the centreline:
  `surfaceZAt(road, station, lateral)` is the jitter-free mean of the
  mesh cross-section (flank-distance ramp convention shared with the
  mesh's tzf; verified to 0.00 m at the bank line). Height is
  axle-sampled (front/rear stations weighted to the CG), pitch comes
  from the axle height difference, roll from the track width heights,
  and gravity pulls the car down any cross-slope via the optional
  latGradePerM parameter of stepArcade (zero on the crowned road, so
  on-tarmac feel is unchanged).
- Recovery: three routes back to the tarmac share one gentle reset
  (nearest sample, heading aligned, speed clamped to 6 m/s, lateral
  and yaw zeroed): driving into the sea (`waterHazardAt`), tumbling
  more than 24 m laterally off the road (cliff flanks and steep
  banks), and a manual Reset button in the HUD.
- Slider polish: the thumb is positioned in pixels over track-minus-
  thumb so it can never overflow; a magnetic detent snaps to zero
  within 4.5 % of the notch (the notch and fill base are positioned
  by the same DET constant as the logic, never by static CSS; the
  reverse band is 10 % of the track); forward targets persist while the reverse
  band springs back to the stop on release; the BRAKE button sits
  inside the slider cluster for one-thumb operation (its pointer
  events stop propagation so it never drives the slider).
- Context-loss recovery: the renderer retains CPU copies of live chunk
  meshes; on `webglcontextrestored` it recompiles programs and
  re-uploads everything, and a 120-frame watchdog repairs dead or
  empty chunk buffers on a live context (never on a lost one, where
  isBuffer is false for everything and a rebuild would wedge null
  handles).
- Terrain skirts: verge to 10 m, hill band to 40 m at 2.2 to 4 m below
  the road, valley band to 110 m at 9 m below; trees 11 to 35 m out.
- Fog: per-zone near distance (see zones), complete 290 m later.

## Zones

Each ~760 m cell of road has a zone character chosen by seeded hash
(thresholds .30/.52/.68/.84) that drives road shape, lighting, scenery,
fog and the sound mix together. Continuous parameters (wander
multiplier, fog near, tree density) blend across the edge 10% of each
cell; discrete placement (lamp mode, buildings, water side) switches at
the boundary.

| Zone    | wander x | lamps  | trees | fog near | signature                       |
|---------|----------|--------|-------|----------|---------------------------------|
| HILLS   | 1.00     | noise  | 1.0   | 140 m    | the baseline register           |
| FOREST  | 0.90     | off    | 3.0   | 100 m    | close trees both sides          |
| VILLAGE | 0.45     | forced | 0.3   | 155 m    | houses, warm windows, lamps x5  |
| COAST   | 0.35     | off    | 0.15  | 175 m    | beach, flat night sea, glints   |
| SUMMIT  | 1.55     | off    | 0.0   | 120 m    | rock cones, technical wander    |

The effective wander multiplier is capped at 2.1 so summit corners stay
above the drivable radius floor. Village houses sit within 14 m of
their own road; stretches never come within 100 m of each other, so
they can never touch another stretch. Coast water is a flat band at
road-relative depth (analytic-surface rule trumps sea-level realism).

## Sound stage

Fully procedural, no samples (drive/audio.ts). The pure mapping
computeMixTargets is unit-tested; the node graph mirrors it:

- Engine: six oscillators at firing frequency (rpm/30): detuned saw
  pair (1x, 1.007x), half-order saw (0.502x), a whisper of square
  rasp (1.996x), and a sub of triangle at 0.25x plus sine at 0.5x;
  all into a load-driven lowpass (600 + load*3800 + speed*8 Hz) with
  a 31 Hz roughness LFO. An exhaust layer of lowpassed noise
  (90 + f0*0.9 Hz, cap 420) amplitude-modulated at the firing
  frequency makes it breathe instead of buzz.
- Tyres: shared noise buffer through two resonant bandpasses (950 +
  speed*8 Hz Q5.5, 2500 Hz Q9), gain from slide smoothed over 0.18 s.
- Wind: lowpass noise, gain speed-squared, x1.5 on the summit.
- Crickets: 4300 Hz Q14 bandpass chirped by a 23 Hz LFO whose rate
  wobbles at 0.13 Hz; per-zone base gain, ducked 70% at speed.
- Sodium hum: 100 Hz sine + 200 Hz triangle, gain (1 - d/24)^2 * 0.05
  from the nearest active lamp.
- Waves: 420 Hz lowpass noise swelling on a 0.12 Hz LFO, coast only
  (both carrier and LFO depth gated so silence is true silence).

The context starts on the first user gesture (browser rule); a Sound
button toggles the master. All parameter moves use setTargetAtTime.

## Touch controls

Left vertical slider: notch at 35% from the bottom. Above the notch is
throttle and PERSISTS on release (set-and-hold cruising); below is
brake and springs back over 140 ms. Right horizontal slider is
absolute-position steering, springing to centre over 130 ms
(quadratic). H-brake is a hold button above the steer track. Keyboard
still works; touch axes win when active. Slider steer sign: thumb
right = steer right = negative input.steer.
- Sodium light: intensity triple the base amber, radius 30 m, glow
  halo quads 1.15 m; headlight cone 0.83 to 0.955, 34 m, 1.6x.
- Pixel look: internal target height 280, posterise 18 levels, dither
  amplitude 0.06.
- Lamp halos are radial fans (bright centre, black rim, additive), not
  quads: a flat additive quad reads as an orange box.
- `ROAD_HALF_WIDTH_M` 5.0, sample spacing 2 m, chunking 100 samples,
  5 ahead, 2 behind.
- Palette, fog band (90 to 380 m), posterisation levels and dither
  amplitude sit at the top of `webglRenderer.ts`.

## Conventions that must not regress

- The analytic surface rule. Samples are for building meshes and for
  `locateOnRoad` only. Anything continuous, the height under the car,
  the grade in the physics, the camera targets, comes from
  `elevationAt` and `gradeAt`. Reading them from nearest samples makes
  the car staircase over 2 m steps ("speed bumps"). Pinned by the
  smooth-surface test in `roadGen.test.ts`.
- The body-axis rule. Longitudinal tyre forces act along the body axis
  and are never rotated through the steering angle; only the front
  lateral force takes cos(delta). At arcade steering locks the sin
  cross-term makes braking-while-steering yank the nose the wrong way.
  Pinned by the trail-braking regression test in
  `arcadePhysics.test.ts`.
- The shared-corner rule. Any terrain value that two segments both
  touch (the band edge heights) is a function of the GLOBAL sample
  index, never of the segment: per-segment randomness tears the strips
  into overlapping slivers that streak at distance. The same global
  index drives every cadence and hash in the chunk builder so geometry
  is identical however the window was rebuilt.
- The monotone-progress rule, which supersedes every earlier corridor
  patch. The centreline must be a FUNCTION of forward distance
  (x monotonic, |dy/dx| < 1), never an integrated heading: a heading
  random walk recrosses itself in plan (measured within 1 m in most
  seeds), which puts two stretches of road, verge and terrain in the
  same place at different heights: the long-standing map-on-top-of-
  the-map bug that no skirt geometry could ever fix. With the
  monotone construction the measured self-approach floor is 146 m
  over 16 seeds x 5 km, beyond the widest skirt, so overlap is
  impossible. Pinned by the self-approach test in roadGen.test.ts.
- The corridor-exclusivity rule (defence in depth under the above). The road corridor crosses ITSELF on a
  winding road, so nothing a stretch builds may rise above any other
  stretch's tarmac. Skirt heights are strictly RELATIVE to their own
  road and descend outward (never an absolute world height: the old
  fixed-height valley edge hung over every dip as a black ceiling,
  the long-standing "map on top of the car"), extents stay inside the
  road's minimum self-approach distance, and trees check the whole
  generated window and are skipped inside any road corridor. Pinned by
  an offline scan: across 12 seeds and 34 km, no skirt or tree vertex
  rises above a distant stretch passing nearby.
- The integer-upscale rule. The internal framebuffer must never exceed
  the device-pixel canvas size; NEAREST minification irregularly
  deletes rows, eating thin lines and streaking the far field. The
  canvas backing store uses devicePixelRatio and the internal
  resolution is the backing size divided by a whole number.
- Window arithmetic compares GLOBAL quantities only. The chunk need is
  computed from hint PLUS samplesDropped against the all-time
  chunksGenerated; mixing a window-relative hint with the global total
  stalled generation at about 2 km. The chunk builder's end index caps
  at samples.length - 1, not - 2: the off-by-one left one unbuilt 2 m
  strip at every chunk boundary, a see-through black band across the
  whole world. Both are pinned by the long-run maintainWindow test.
- Nothing is stacked a few centimetres above something else at
  distance: the edge lines sit BESIDE the asphalt on the same plane,
  because near-coplanar overlays lose the 16-bit depth fight and break
  up. Depth range is 0.7 to 460 m for the same reason.

## How to iterate

Feel and look changes go fastest in the artifact: edit
`midnight-roads-v9.html`, hand it to the player, port the delta back
into the modules. For visual QA without a GPU, `tools/drive-preview`
holds the software rasteriser workflow that renders the exact mesh
builders to PNG; it caught the featureless-brick car mesh that shipped
in v8. Physics and generation changes get unit tests next to the
modules.

## Verification

`pnpm vitest run` in packages/game: 85 files, 1049 tests green,
including the five roadGen tests and four register tests.
`pnpm vitest run tests/driveInstance.test.ts` in packages/sim covers the
params-only assembly route. Workspace `pnpm typecheck` is clean. The
renderer and the screen are excluded from unit coverage with rationale
in `vitest.config.ts` (GPU, animation loop); their pure mesh builders
are exercised through the tests and the preview tool.

## Known gaps and parked items

- Grades reach about 20 %; single-constant softening documented above.
- Tail lamps are always lit (emissive); varying brightness with brake
  input is a nicety.
- Lit-zone coverage is about half the road; raise the 0.52 threshold in
  `roadGen.ts` toward 0.6 for rarer lamps.
- The GL output has been verified through the software rasteriser and
  the player's screenshots, not by an automated GPU test.
- The test track's "Drive it yourself" link still passes a course
  query; the screen ignores it by design (endless mode) and honours
  only `?car=`.
- Touch controls exist in the artifact but not yet in the game screen;
  keyboard only for now.
- `carArt.ts` and the lap-timer helpers in `driveSession.ts` are no
  longer used by this screen (the summary uses `formatLapS` only). They
  stay, tested, for other screens. `driveGhost.test.ts` belongs to the
  retired lap-replication thread and its removal is proposed but awaits
  explicit approval.
