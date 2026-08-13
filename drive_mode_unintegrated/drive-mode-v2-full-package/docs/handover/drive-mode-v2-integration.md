# Drive Mode v2: Integration Handover

Audience: the developer or LLM agent integrating the endless drive
mode into the main game. This document is self-contained; where it
points elsewhere, the paths are exact. Read it fully before writing
code. The two companion references are `DRIVE_CHECKPOINT.md` at the
repository root (the complete build log, decision history and every
hard-won lesson) and `docs/design/systems/drive-mode-v2-endless.md`
(the design record, feature by feature).

## 1. What this is

An endless, seeded, procedurally generated night drive through a
Japanese landscape. Left-hand traffic. It is driving, not racing:
no lap times, no opponents, no failure state beyond resetting to
the road. By design it never touches money, reputation or
progression. The player picks a car, gets a road that goes on
forever, and drives. A drive card (distance, time, top speed,
longest drift, route code) is the only scorekeeping, and it is
ephemeral.

Design pillars, in force throughout:

- One continuous road. Zones (hills, forest, village, coast,
  summit) exist internally but are deliberately hidden from the
  player. Do not resurface them in UI.
- Deterministic worlds. The same seed always produces the same
  road, byte for byte. Route codes (`MG-` plus base36 seed) let
  players share roads.
- The simulation values honesty: assists shape inputs or drain
  excess yaw, but nothing ever adds grip. The friction circle is
  inviolate.
- Ambience (time of day, rain, traffic) is per-session random and
  intentionally NOT seed-coupled. Road from the seed, weather from
  the night. Keep it that way.

## 2. File map

Everything lives in `packages/game` unless noted.

Core modules (shared by both hosts, single source of truth):

- `src/screens/drive/roadGen.ts`. Seeded road generation, windowed
  sampling, zones, surface queries. `surfaceZAt` is the single
  analytic ground truth that physics, camera and meshes all ride.
  `roadGen.golden.test.ts` pins cross-implementation checksums for
  seeds 1, 7 and 23. If that test fails you have changed world
  generation; that is almost never what you meant to do.
- `src/screens/drive/webglRenderer.ts`. The renderer class
  (`DriveRenderer`), chunk mesh builder, car meshes, the glow pass,
  rest stops (`restStopAt`, `restStopAccents`), lighthouse, torii,
  shader mood system. Owns all GL state.
- `src/screens/drive/arcadePhysics.ts` plus `arcadeConfig.ts`. The
  arcade register: friction circle, gearbox, load transfer, ABS,
  EBD, MSR, ESC, drivetrain identities, steering model. Tests in
  `arcadePhysics.test.ts` pin measured behaviour.
- `src/screens/drive/audio.ts`. WebAudio engine voices (per model
  id), tyres, wind, rain, turbo hiss. Lazy init on first user
  gesture.
- `src/screens/drive/driveWorld.ts`. Time of day, rain machine,
  traffic machine, smoke pool, drift stats, route codes. Pure
  state machines, tested in `driveWorld.test.ts`.

Hosts (thin; contain no game logic that is not plumbing):

- `src/screens/DriveScreen.vue`. The game host. Already routed at
  `/drive` (route name `drive` in `src/router/index.ts`). Reads the
  player garage via `game.carsDetailed`, derives physics parameters
  through the sim package's `driveParamsForInstance`, and blocks
  undrivable cars via `lapBlockers` (they render disabled with
  "cannot run").
- `src/screens/drive/standalone/shell.ts` plus `cars.ts`. The
  standalone artifact host used for browser testing outside the
  game. Built, never hand-edited.

Build system for the standalone artifact:

- `scripts/buildArtifact.mjs`, run as `pnpm build:artifact` inside
  `packages/game` (vite JS API, lib mode, iife). Stitches the
  bundle into `tools/artifact/template.html` (repo root) and emits
  `dist-artifact/midnight-roads.html`, a single file.

## 3. Architecture in five paragraphs

The road is a windowed stream of samples spaced 2 m apart, grouped
in 100-sample chunks, kept 5 chunks ahead and 2 behind the car.
Samples are dropped off the front as the window advances;
`samplesDropped` rebases indices, and station (distance along the
road) is monotone forever. Anything keyed to world position should
key to station or to the deterministic hash helpers, never to array
index alone.

The host runs a fixed 120 Hz physics loop (`ARCADE_DT_S`),
accumulating real time and stepping the simulation deterministically
inside it; rendering happens once per animation frame. World
machines (rain, traffic, drift stats) advance inside the fixed loop
so behaviour does not depend on display refresh.

The renderer receives two per-frame contracts from the host. The
`mood` object (from `todNow`) carries fog, sky triad, ambient and
emissive scale and wetness. The `fx` object carries camera
configuration, the smoke pool, lighthouse and window lists,
rest-stop accents and the traffic car. The exact field lists are the
type on `DriveRenderer.fx`; treat that type as the contract and
extend it rather than side-channelling.

Physics parameters come from the sim package:
`driveParamsForInstance(car, model, context)` maps a concrete owned
car (with its condition and parts) to `DriveParams`. The arcade
layer then builds a runtime car via `arcadeCarFor(params, tune)`.
Never feed raw dump parameters into the arcade layer directly; the
mapping applies grip and slip scaling that the whole register was
calibrated against (this exact mistake once had braking tuned at 60
percent grip; see the checkpoint).

The standalone artifact exists so the mode can be tested in a bare
browser. It is generated from the same modules; the shell is DOM
plumbing only. If you find yourself editing generated HTML, stop:
edit the shell or template and rebuild.

## 4. Phase 1: dev-panel integration, three tested cars

Goal: the mode reachable by developers only, with exactly the three
cars the register was calibrated on, independent of save state.

The tested model ids:

- `honda-civic-sir2-eg6`
- `toyota-sprinter-trueno-ae86`
- `nissan-skyline-gtr-bnr32`

Suggested shape (adapt to your dev surface conventions; the repo has
no formal dev panel today, only dev-gated affordances):

1. Entry point. A dev-gated control (guard with
   `import.meta.env.DEV`) wherever your dev tooling lives, or
   temporarily on `OverworldScreen.vue`, that does
   `router.push({ name: 'drive', query: { dev: '1' } })`.
2. Car provisioning. In `DriveScreen.vue`, when `route.query.dev`
   is set and `import.meta.env.DEV` is true, replace the owned-car
   list with three stock mint instances of the tested models. The
   pattern already exists in `arcadePhysics.test.ts` (the local
   `arcadeSetup` helper builds a minimal mint instance through the
   sim context and `driveParamsForInstance`); lift that pattern
   into the screen behind the dev flag. This keeps phase 1 fully
   decoupled from whatever the current save owns.
3. Do not expose the route in any player-facing navigation in
   phase 1.

Everything else (controls, pause, weather, the card) already works
and needs nothing from you.

## 5. Phase 2: overworld entry (UI direction pending)

The product owner has NOT finalised UI integration. The agreed
placeholder direction:

- Add a new element to `OverworldScreen.vue`: a road, drawn in the
  top-left region of the map, adjacent to the existing touge or
  test-track element (see `TestTrackScreen.vue` and its overworld
  affordance for the visual language to match).
- Clicking it routes to `/drive` in normal mode: the player may
  take any drivable car currently in their possession. The screen
  already implements ownership listing, drivability blocking and
  car selection; phase 2 should not rebuild any of that.
- Build nothing speculative beyond the map element and routing.
  Await the UI decision before styling setup or summary screens
  further.

## 6. One open design decision (do not decide it yourself)

Should driving add mileage to the car instance? The sim values
odometers and provenance, and a 200 km night drive arguably belongs
on the clock; but the mode's charter says it never touches
progression. Currently it writes nothing to the instance. This is
the product owner's call. Flag it in your integration PR
description; do not implement either way without a decision.

## 7. Traps and footguns

Learned the hard way; each has a fuller story in the checkpoint.

Build and repo discipline:

- The standalone artifact is a build output. Never hand-edit it.
  `pnpm build:artifact` in `packages/game`.
- No new dependencies. There is no standalone esbuild package;
  bundling goes through vite's JS API (already wired).
- House style: tests colocated next to sources; British English in
  prose; no em dashes; `arr[i]!` under noUncheckedIndexedAccess.
- Never use git reset, force, rebase or clean here. Do not commit
  without explicit approval from the product owner.

Contracts:

- Template contract is DOM ids AND CSS state classes. The tune
  sheet opens with class `open`; the card and pause overlay with
  `on`. A matching id with a mismatched state class fails silently
  (this shipped once; see checkpoint v16.6a).
- The renderer `fx` and `mood` objects are the only channels into
  the renderer per frame. Extend the types; do not add globals.
- Rest-stop effects must consume the full descriptor from
  `restStopAt` (including `kind`). Re-deriving a partial
  descriptor produced glow for buildings that did not exist
  (checkpoint v16.6b). `restStopAccents` is the shared,
  variant-aware source; both hosts call it.
- Light budget is ten slots: eight nearest lamps, two reserved for
  the oncoming car's headlights. Do not grow past ten without
  editing the shader loop.
- Double-sided emissive quads must be offset twins along the face
  normal (the `emiBoth` idiom), never coplanar reversed twins;
  coplanar twins z-fight and flicker.

Physics and tests:

- Behaviour is pinned by measurement tests with inequality margins.
  If a deliberate feel change moves a pin, re-measure and re-cut
  the pin with a comment; do not loosen pins to make red go green.
- To measure, embed a temporary `it` block inside
  `arcadePhysics.test.ts` (its fixtures are file-local and not
  importable), read the console output, then convert findings to
  pins and delete the probe.
- Known pending work (deliberately deferred to a dedicated physics
  session, do not "fix" in passing): front/rear split of the
  post-peak retention (`hold`), a stronger speed-sensitivity knee
  in the 30 to 70 km/h band, and saturation-driven tyre squeal as
  the traction telegraph. Rationale and target numbers are in the
  checkpoint (v16.6d and the following analysis).

Runtime:

- Audio must be initialised from a user gesture (browser autoplay
  policy). `audio.init()` is called from input handlers; keep that
  property when adding new entry points. Voices are keyed by MODEL
  id, not instance id.
- The road is seed-pure; ambience uses `Math.random` by design. Do
  not couple weather to the seed, and do not let anything
  seed-pure consume `Math.random`.
- Performance budgets that exist on purpose: smoke pool 48, skid
  marks 900, rain streaks 100 at full wet, ten lights. The mode
  targets mid-range phones.

For LLM agents specifically, scripted-edit discipline that this
project now treats as law: route every file write through a helper
that asserts the payload is a string of sane length BEFORE opening
the file for writing (`open(p, 'w')` truncates first; a tuple
payload once emptied the renderer to zero bytes); after every
write, grep the file for your new markers; a failed batch writes
nothing, so re-verify every member, not just the one that threw;
and when an anchor unexpectedly fails, suspect that the work
already landed in a previous pass before you retry.

## 8. Verification

From the repository root:

- `pnpm typecheck` must be clean.
- `pnpm --filter @midnight-garage/game vitest run` must be green
  (1079 tests at handover; 88 files).
- `cd packages/game && pnpm build:artifact` must emit
  `dist-artifact/midnight-roads.html`; extract the script block and
  `node --check` it if you touched the shell or template.
- The golden road test is your canary for accidental world drift.
- Visual QA without a GPU: the mesh builders are exercised by the
  software rasteriser workflow described in the checkpoint (scene
  dump to JSON, render to PNG); reach for it whenever you touch
  `buildChunkMesh`.

## 9. State at handover

All green: 1079 tests, typecheck clean, artifact building from the
repo. Calibrated behaviour on record includes 0 to 100 km/h of 5.06
s (R32), 6.68 s (EG6), 8.53 s (AE86); ABS turn-in under a fully
held brake; FWD holding a moderate 80 km/h arc with 8 degrees of
body slip and zero drift frames. The steering model is fresh
(asymmetric ramp, speed-sensitive lock) and awaits the product
owner's road test; treat its two constants as tunable, not settled.
