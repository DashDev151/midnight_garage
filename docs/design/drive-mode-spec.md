# Midnight Garage - "Drive My Car" - Full Implementation Spec (v2)

**Feature:** an ancillary test-drive mode for *Midnight Garage* (90s-Japan car-workshop economy sim). After upgrading a car in the garage, the player drives it to *feel* their build before flipping it. Fun reward loop, not a standalone racer.

**This version (v2)** folds in everything decided during design: the concrete tech stack (verified against the repo), the pseudo-3D rendering path (Mode 7), the anti-aliasing plan, and the map authoring pipeline. It supersedes v1.

Status: **not scheduled, not implemented.** Parked against the driving-minigame entry in `IDEAS.md` per the maintainer's standing 2026-07-08 sign-off (post-launch, optional, zero gameplay weight). Filed 2026-07-12 after a technical review found the architecture sound; see that review's notes on the "stat-linked, not twitch-linked" constraint before this ever enters a sprint.

---

## 0. TL;DR for the dev

- **Physics:** a single-rigid-body slip-angle model (Marco Monster / carphysics2d lineage). Pure TS, lives in `@midnight-garage/sim`, unit-tested. The one non-obvious must-have is the **friction circle** - it's what makes FWD/RWD/AWD feel different. Don't apply engine force body-wide.
- **Rendering:** pseudo-3D chase cam via **Mode 7** (flat ground texture sampled through an inverse perspective projection) implemented as a **Pixi v8 full-screen Mesh + fragment shader**. Props and the car are billboard sprites forward-projected each frame.
- **Anti-aliasing:** the line-shimmer seen in the prototype is texture aliasing; fixed with **mipmaps + linear/trilinear sampling** (free on the GPU) plus distance-based sharpness and fog. This is the main reason to use a GPU shader over a CPU loop.
- **Maps:** authored as flat pixel art. Ground = a PNG (Aseprite). Object placement = **Tiled** -> JSON. A second hidden **surface-mask PNG** = per-pixel grip/boundary the physics samples. No 3D authoring tool involved.
- **Integration:** `CarSpec` (in `@midnight-garage/sim`) is the single contract between the economy sim and the drive mode. Drive screen is a Vue component hosting a Pixi app (same pattern as the existing `PixiCarSandbox.vue`).

---

## 1. Design pillars & non-goals

**Pillars**
- **Arcade feel-first.** Make invisible upgrades *felt*. Readable behaviour beats simulation accuracy.
- **Lightweight & web-native.** Stay in the existing TS/Vue/Pixi stack. No second engine, no 3D physics engine.
- **One car, two systems.** The economy sim owns the spec; the drive mode reads it. A mod is a data edit; the feel updates for free.
- **Scope sits *below* Art of Rally / Super Woden**, which use real 3D (Unity). We target the F-Zero / Mario Kart **Mode 7** look: genuinely good retro pseudo-3D.

**Non-goals**
- No rollover/crash-tumble sim, no suspension travel, no deformation.
- No full tyre model (Pacejka), no per-wheel independent lockup/wheelspin.
- No AI opponents or car-to-car collision physics.
- Not a jump/hill-climb sim (heightfield elevation is explicitly out; the ground is a flat plane).

---

## 2. Tech stack & where the feature lives

Verified against the repo (pnpm monorepo, Node >=22):

| Package | Role | Relevant existing bits |
|---|---|---|
| `@midnight-garage/game` | Vue 3.5 + **Pixi.js ^8.19** front end (Vite 8, pinia, vue-router, dexie saves) | `src/pixi/carSprite.ts` (indexed pixel template + palette swap), `components/PixiCarSandbox.vue`, `screens/`, `router/` |
| `@midnight-garage/sim` | Simulation/economy logic, deterministic RNG (`createRng`), balance tooling | `balance:run` script |
| `@midnight-garage/content` | Game content/state (`gameState.ts`) | - |

**Placement of the new feature**

```
packages/sim/src/drive/            # PURE TS, no Pixi/Vue. Unit-tested (vitest).
  carSpec.ts                       # the shared CarSpec type (the contract)
  physics.ts                       # step(state, spec, input, dt) -> state
  frictionCircle.ts                # combined-slip per-axle solver
  surface.ts                       # sample grip from surface mask
  index.ts

packages/game/src/pixi/drive/      # RENDERING (Pixi v8), consumes published state
  Mode7Ground.ts                   # full-screen Mesh + fragment shader
  camera.ts                        # chase-cam + forward projection for billboards
  billboards.ts                    # props + car sprite management
  DriveApp.ts                      # wires physics tick + render loop
packages/game/src/screens/DriveScreen.vue   # Vue host (mirror PixiCarSandbox.vue)

packages/game/public/maps/<stage>/ # AUTHORED ASSETS
  ground.png                       # what you see
  surface.png                      # hidden grip/boundary mask
  objects.json                     # Tiled export: prop placements
```

Key rule: **`packages/sim/src/drive` never imports Pixi or Vue.** It's pure, deterministic, testable TS that takes `CarSpec` + input and returns state. Rendering reads that state. This keeps the sim reusable and the physics unit-testable in `vitest` like the rest of the sim.

---

## 3. Architecture

```
 ECONOMY SIM (Vue/Pinia)              CONTRACT                 DRIVE MODE
 +----------------------+        +---------------+     +-----------------------+
 | garage / mods / value |------>|   CarSpec     |---->| physics.ts (pure TS)  |
 | builds the car        |        | (@sim/drive)  |     |  step() -> DriveState |
 +----------------------+        +---------------+     +-----------+-----------+
                                                                    | x,y,heading,
                                                                    | speed,rpm,slip
                                                                    v
                                                        +-----------------------+
                                                        | Pixi v8 renderer       |
                                                        |  Mode7Ground + billbds |
                                                        +-----------------------+
   Surface mask (PNG) --------------- sampled CPU-side by physics for grip/bounds
```

**Internal physics layering** (add in order; earlier phases stub later ones):

```
Engine (torque curve) -> Transmission (gears/RPM) -> Drivetrain (axle split)
   -> Tyres (friction circle) -> Body (rigid-body integration) -> DriveState (published)
```

---

## 4. CarSpec - the shared contract

Lives in `@midnight-garage/sim`. The economy sim populates it from installed mods; the physics reads it; the renderer never sees it.

```ts
export type Drivetrain = 'FWD' | 'RWD' | 'AWD';

export interface CarSpec {
  // mass & geometry
  massKg: number;              // kerb weight
  weightBalanceFront: number;  // 0..1 static front weight fraction (FWD ~0.62)
  cgHeightM: number;           // CG height (coilovers lower this)
  wheelbaseM: number;
  trackHalfWidthM: number;
  yawInertiaScale?: number;    // inertia = massKg * scale (default ~1.25)

  // drivetrain
  drivetrain: Drivetrain;      // maps to driveSplitFront: FWD=1, RWD=0, AWD=~0.4
  awdSplitFront?: number;      // override for AWD (0..1)

  // engine - choose ONE tier
  peakPowerHp?: number;                       // simple
  torqueCurve?: { rpm: number; nm: number }[];// full
  gearRatios?: number[]; finalDrive?: number;
  idleRpm?: number; redlineRpm?: number; drivetrainEfficiency?: number;
  tractionCapFactor?: number;  // launch force cap as multiple of weight (~1.3)

  // tyres
  tyreGripMu: number;          // compound (the big lever)
  corneringStiffnessFront: number;
  corneringStiffnessRear: number;

  // brakes & assists
  brakeForceN: number;
  brakeBiasFront: number;      // 0..1
  absEnabled?: boolean;
  tcEnabled?: boolean;

  steeringLockRad: number;
  downforceCoeff?: number;     // ~0 for a street Civic; kept for future
}
```

`DriveState` (published to renderer): `{ x, y, heading, vx, vy, yawRate, speed, rpm, gear, rearSlip, frontSliding, rearSliding, sliding }`.

---

## 5. Physics model

### 5.1 Basis
Single rigid body, two axles, slip-angle tyres: the **Marco Monster "Car Physics for Games"** model (open-source reference: `spacejack/carphysics2d`, MIT; same family as Absolute Drift -> Art of Rally). SI units. A working reference implementation exists (see §14).

### 5.2 Fixed-step loop (recommend 120 Hz, accumulator, interpolate render)
1. World velocity -> car-local `vLong`, `vLat`.
2. Dynamic axle loads = static balance +/- **weight transfer** (CG height, wheelbase, longitudinal accel).
3. Front/rear **slip angles** (incl. yaw-rate term).
4. Per-axle tyre forces via the **friction circle** (§6, critical).
5. Sum forces -> local accel -> world -> integrate velocity & position.
6. Yaw torque from front/rear lateral forces -> integrate yaw rate & heading.
7. Publish `DriveState`.

Weight transfer is **required**: it's what enables lift-off tuck-in and brake rotation and feeds the friction-circle grip budget.

---

## 6. Friction circle + drivetrains (headline feature)

### 6.1 The mechanism
Each axle has **one grip budget** shared between longitudinal (drive/brake) and lateral (cornering) force. Spending it on drive leaves less for cornering **on that axle**, which is exactly what makes drivetrains feel different. **Do not** apply engine force as a single body-wide force (the v1/prototype shortcut) or FWD and RWD collapse to identical.

```ts
// per axle:
const gripBudget = mu * axleLoad;                      // load includes weight transfer
const fLongDemand = driveForceAtAxle - brakeForceAtAxle;
const fLatDemand  = -corneringStiffness * slipAngle * axleLoad;

const combined = Math.hypot(fLongDemand, fLatDemand);
let fLong = fLongDemand, fLat = fLatDemand;
if (combined > gripBudget) {                            // tyre saturated -> sliding
  const s = gripBudget / combined;
  fLong = fLongDemand * s;
  fLat  = fLatDemand  * s;                              // cornering grip eaten by drive
}
```

### 6.2 Axle split
One parameter: `driveSplitFront in [0,1]` (from `CarSpec.drivetrain`).

```
driveForceFront = totalDrive * driveSplitFront
driveForceRear  = totalDrive * (1 - driveSplitFront)
```

| Drivetrain | split | Character |
|---|---|---|
| FWD | 1.0 | Understeer on power, tucks on lift, eager, safe - "Honda" |
| RWD | 0.0 | Throttle oversteer, needs control on exit - "AE86" |
| AWD | ~0.4 | Planted, strong corner-exit traction, neutral |

### 6.3 Felt behaviour (also acceptance tests, §12)
Same car, change only the drivetrain flag -> FWD pushes wide under mid-corner throttle; RWD steps the rear out; AWD drives out cleanly. If they don't diverge, the friction circle is wrong.

---

## 7. Engine, gears & RPM (optional depth - Physics Phase 2)

MVP models drive as **power-limited**: `drive = min(power / max(speed, vFloor), tractionCap * mass * g)`, ties HP to pull *and* top speed, good arcade launch.

Full engine character (later):
- **Torque curve** lookup over RPM; `power = torque x rpm` falls out for free (peak power above peak torque; turbo/VTEC/diesel = different curve shapes).
- **RPM is derived, not stored:** `rpm = wheelAngularVel * gearRatio * finalDrive * 60/2pi`, clamped idle..redline.
- **Drive force:** `torqueAt(rpm) * gearRatio * finalDrive * efficiency / wheelRadius`.
- **Upshift rev-drop is free:** smaller ratio, same speed, lower derived RPM. This is also the audio pitch hook.

---

## 8. Mod -> parameter mapping (worked example: EG6 build)

| Upgrade | CarSpec field(s) | Effect |
|---|---|---|
| Exhaust + intake | `peakPowerHp` / `torqueCurve` +~10-15%, peakier | Revvier, more top-end |
| Better brakes | `brakeForceN` up (+/- `brakeBiasFront`) | Later braking, trail-brake |
| Coilovers | `cgHeightM` down; balance via `corneringStiffness` split | Flatter, faster, tunable balance |
| Better tyre compound | `tyreGripMu` up (+ `corneringStiffness` up) | Higher limit, biggest single change |
| Weight reduction | `massKg` down (+ inertia down) | Sharper turn-in, better power-to-weight |
| Chassis / rust work | *(economic only)* | Value/reliability, not handling |

The mod system edits `CarSpec` fields only; it never touches driving code.

---

## 9. Rendering - pseudo-3D via Mode 7

### 9.1 Why Mode 7 (and not pixi-projection)
Pixi is a 2D renderer with no perspective. The old go-to plugin `pixi-projection` (Camera3d/Sprite3d) is **not compatible with Pixi v8** (open, unresolved issue; targets v6/v7); do not depend on it. Instead we implement the perspective ground ourselves via **Mode 7**: a flat ground texture sampled through an inverse perspective projection. This is the SNES Mario Kart / F-Zero technique. The chase-cam projection math already exists in the session prototypes and ports directly.

### 9.2 The ground: Pixi v8 full-screen Mesh + fragment shader
Render the ground as a **full-screen quad Mesh** with a custom fragment shader. Per fragment (screen pixel below the horizon):

1. Inverse-project the screen pixel to a world point on the ground plane (`z = 0`):
   ```
   depth   = camHeight * K / (screenY - horizonY)        // row -> distance
   centerW = camPos + forward * depth
   halfW   = depth * FOV
   worldXY = centerW + perp * ((screenX/width - 0.5) * 2 * halfW)
   ```
2. Convert to texture UV (`worldXY * texScale`, with `repeat` wrap for a tiling map, or clamp for a finite baked stage).
3. Sample the ground texture, **with GPU mipmapping + trilinear filtering** (see §10). This is what removes shimmer.
4. Blend toward night-fog colour by `depth` for atmosphere and far-row calming.

Uniforms: `camPos(x,y)`, `sinYaw/cosYaw`, `camHeight`, `horizonY`, `K`, `FOV`, `texScale`, fog params, and the ground `Texture`. (Follow Pixi v8's Mesh/Shader API for exact `GlProgram`/`GpuProgram` + `Shader.from` signatures; verify against current Pixi v8 docs; v8 supports both WebGL and WebGPU backends.)

### 9.3 Camera (chase cam)
Locked a fixed distance behind and above the car, yaw = car heading (so it points where the nose aims, drifts read dramatically), pitched down slightly. Tunables: `back`, `height`, `lookAhead`, `FOV`. Car stays centred; the world swings around it.

### 9.4 Billboards (props + car)
Props (streetlights, signs, vending machines, buildings) and the car are **Pixi Sprites**. Each frame, forward-project their world position to screen with the matching camera math:
```
depth = dot(worldPos - camPos, forward)          // skip if <= near
side  = dot(worldPos - camPos, perp)
screenX = W/2 + (side / (depth*FOV)) * (W/2)
screenY = horizonY + camHeight*K / depth          // ground contact (matches ground)
scale   = (W/2/FOV) / depth
```
Set `sprite.position`, `sprite.scale`, and `sprite.zIndex = -depth` for back-to-front sorting (Pixi sorts by zIndex). Fade alpha by depth into the fog. The car can be a fixed lower-centre billboard, or projected at its own position; both are fine.

### 9.5 Sky / horizon
A gradient (night city-pop palette) above the horizon line, optionally with a distant light band. Cheap Graphics/Sprite; not part of the shader.

---

## 10. Anti-aliasing / line shimmer (the flicker fix)

**Symptom:** thin high-contrast features (lane dashes, kerbs) flicker on/off as you approach: "disco lights." **Cause:** at distance one screen pixel covers many texels; nearest-neighbour picks one, and which one flips frame-to-frame. This is standard texture aliasing, the known tax of Mode 7, fully solvable.

Fix stack (apply in this order):

1. **Mipmaps (primary).** Generate a mip chain for the ground texture (`128->64->32...`). Far scanlines sample a pre-shrunk, pre-averaged level where dashes are already a soft line instead of a flickering hard one. On the GPU this is a texture setting, not code: set the ground `TextureSource` to `autoGenerateMipmaps: true`, `scaleMode: 'linear'`, `addressMode/wrapMode: 'repeat'`. Kills ~90% of the shimmer.
2. **Bilinear / trilinear filtering.** Linear sampling blends the 4 nearest texels; trilinear also blends between two mip levels (no visible level seam). With mipmaps enabled and linear scale mode, the GPU does trilinear automatically because the full-screen-quad derivatives are correct.
3. **Distance-based sharpness (keep the pixel-art look).** Mipmaps/blur fight the crunchy aesthetic. Keep the **near** ground crisp and only smooth the **far** rows: in the shader, bias mip LOD or `mix()` between a nearest sample (near) and trilinear sample (far) based on `depth`. Result: crisp-underfoot, calm-at-the-horizon.
4. **Fog.** Fade far rows toward night-blue before they can shimmer (already in §9.2). Free, and real racers lean on it.
5. **Art mitigation.** Draw lane dashes slightly thicker and lower-contrast so a one-texel miss matters less. Free.
6. **Supersample (optional brute force).** Render the ground buffer at 1.5-2x and downscale if any shimmer remains.

**Why this validates the GPU-shader choice:** mipmapping + trilinear are *hardware features*, nearly free on the GPU, hand-written work on a CPU loop. The CPU per-pixel loop in the prototype (which showed the shimmer) is prototype-only; the shipped ground must be the shader.

---

## 11. Map authoring pipeline

You never author in 3D. You draw flat, top-down pixel art and record coordinates. Three artefacts per stage:

### 11.1 Ground image - `ground.png` (Aseprite)
A top-down picture of the drivable area: tarmac, lane dashes, kerbs, grass/lots. Two modes:
- **Tiling tile** (e.g., 128x128, power-of-two): wraps infinitely for a free-roam lot / endless city grid. Cheapest.
- **Baked finite stage** (e.g., 2048x2048, no wrap): the whole wangan loop / touge run / industrial lot as one large image; out-of-bounds = void/grass. **Recommended for the "feel my car" toy**: easiest to author, reads as intentional.

Convention: define **texels per world unit** (`texScale`) so the physics and renderer agree on scale (e.g., 4 texels/m).

### 11.2 Object placement - `objects.json` (Tiled)
Load `ground.png` as a background in **Tiled** (free, standard 2D map editor). Drag prop sprites (each a small Aseprite PNG) where you want them. Tiled records `{ name, x, y }` and exports **JSON**. The renderer reads it and spawns a billboard per entry. Tiled draws nothing 3D; it's a coordinate list.

### 11.3 Surface mask - `surface.png` (Aseprite, hidden)
Same dimensions as `ground.png`, painted crudely by colour = surface type:
- grey = tarmac (`mu` high), tan = gravel (`mu` mid), green = grass/off-track (`mu` low), black = out-of-bounds.

Loaded once into a CPU-side buffer (canvas `getImageData`); the physics samples the pixel under the car each tick to set `tyreGripMu` and detect bounds. Never rendered.

### 11.4 Curvy roads - splines (optional enhancement)
Hand-painting a winding touge into one PNG is awkward. Instead, author the road **centre-line as a spline** (Catmull-Rom/Bezier points, in Tiled or a small tool) and bake the road ribbon into `ground.png`/`surface.png` at build time (or render a separate perspective road strip). Straight wangan loops and lots don't need this.

**Summary of the whole workflow:** draw `ground.png` and prop sprites in Aseprite -> place props in Tiled (`objects.json`) -> paint `surface.png` grip mask in Aseprite. Three flat files. No 3D tool, ever.

---

## 12. Acceptance criteria ("done" tests)

**Physics**
- Change only `drivetrain`: FWD understeers under power, RWD oversteers, AWD drives out. Distinguishable by feel.
- Lower `tyreGripMu` -> earlier, more progressive breakaway.
- -40 kg `massKg` -> quicker turn-in & accel; heavier -> lazier, more stable.
- Higher `brakeForceN` -> shorter stop; `brakeBiasFront` shifts lock-up balance.
- Lower `cgHeightM` -> less roll-induced understeer, sharper response.
- Editing a mod changes only `CarSpec`; no driving-code change needed.

**Rendering**
- **No visible line shimmer** approaching a road/kerb (mipmaps + trilinear working).
- Near ground reads crisp/pixel-art; far ground is calm (distance-based sharpness).
- Straight roads stay straight and converge honestly at the horizon.
- Stable 60 fps at internal resolution on a mid laptop / Steam-Deck-class device.
- Surface mask correctly changes grip on- vs off-road and blocks out-of-bounds.

**Integration**
- Car built in the garage drives with its actual `CarSpec` in the drive screen.

---

## 13. Testing (matches repo conventions)

- Physics core is pure functions -> **vitest** unit tests in `packages/sim`. Use the existing deterministic `createRng`. Assert the §12 physics behaviours numerically (e.g., yaw response sign per drivetrain, stopping distance vs brake force).
- Golden-run test: fixed input sequence + fixed `CarSpec` -> deterministic trajectory snapshot (guards against regressions).
- Rendering is validated by eye against the §12 rendering criteria (no cheap automated test for shimmer).

---

## 14. Reference prototypes (from design session)

Three self-contained HTML prototypes were built while specced; use them as behavioural references:
1. **Physics, top-down**: validates the base slip-angle model.
2. **Physics, pseudo-3D chase cam + drivetrain/grip/weight sliders**: the pinhole projection + handling feel. *Note:* this one uses the body-wide-force shortcut, so it does **not** yet show FWD/RWD divergence; it's the "before" for the §6 friction-circle upgrade.
3. **Mode 7 map demo**: flat pixel-art tile rendered as a drivable perspective road, with a flat-PNG/3D toggle. Demonstrates §9 and the §10 shimmer (which the shader build must fix).

---

## 15. Phased delivery

Two tracks that meet at an integration milestone.

| Physics track | Render track |
|---|---|
| **P0** base slip model + power-as-force; `mass/mu/brake` params | **R0** Mode-7 ground (GPU shader, mipmapped) + chase cam + car billboard |
| **P1** friction circle + per-axle drive + weight transfer -> **drivetrain feel** | **R1** billboard props + surface-mask grip/bounds |
| **P2** torque curve, gears, RPM, upshift rev-drop | **R2** stage authoring (Tiled pipeline) + optional spline roads |
| - | **R3** polish: distance sharpness, fog, tyre-chirp/skid, engine audio (RPM-linked) |

**Integration milestone:** `CarSpec` wired garage -> `DriveScreen.vue`; enter/exit UX from the garage.

P1 and R0 are the two load-bearing pieces. A satisfying "feel my build" mode exists at **P0+P1+R0+R1**, before any gears or spline roads.

---

## 16. Feel & feedback layer

Perceived fidelity lives here, not in physics accuracy. Prioritise:
- Tyre chirp/screech tied to friction-circle saturation (per axle).
- Skid marks laid when a driven/loaded tyre slides (billboard decals or texture writes).
- Engine note pitch tracking RPM (P2) or speed (MVP); turbo flutter on lift.
- Camera weight-shift telegraphing load transfer and slide angle.
- HUD: speedo, tach (P2), gear, simple grip/drift indicator.

---

## 17. Open decisions for the dev

- Input: keyboard / gamepad / touch (match parent-game targets).
- Reverse gear needed, or forward-only feel loop?
- Assists default: `absEnabled`/`tcEnabled` on or off? (EG6 build includes an ABS upgrade; wire it.)
- Stage type for v1: wangan loop vs touge vs industrial lot (all flat; all fine).
- Endless tiling map vs finite baked stage (recommend finite baked for v1).
- WebGL vs WebGPU backend for the ground shader (Pixi v8 supports both; WebGL is the safe default).
- Enter/exit UX from the garage, and whether to surface anything after (lap time, or just vibes).

---

## 18. References

- Marco Monster, *Car Physics for Games* (canonical model).
- `github.com/spacejack/carphysics2d` (MIT): readable JS implementation of that model.
- Friction circle / combined slip: the addition in §6 that makes drivetrains felt.
- Mode 7 (SNES): the ground-rendering technique in §9.
- PixiJS v8 Mesh/Shader + texture mipmap/wrap docs: for §9/§10 exact API (verify against current v8 docs; `pixi-projection` is **not** v8-compatible).
