# drive-preview: visual QA without a GPU

The drive mode's WebGL renderer cannot run headless here, so this tool
renders the exact same triangle data (9 floats per vertex: position,
normal, colour) with the same camera and lighting maths in software,
producing a PNG a reviewer, human or model, can actually look at. It
exists because reasoning about geometry in the abstract shipped a
featureless brick as the player car in v8; one rendered image found it
in seconds.

## Workflow

1. Dump meshes to JSON. The builders (`buildCarMesh`, `buildWheelMesh`,
   `buildChunkMesh` in `packages/game/src/screens/drive/webglRenderer.ts`)
   are pure functions of params and road data. Copy them plus the two
   push helpers into a scratch `.mjs` (or extract the identical JS from
   the current artifact HTML), call them, and write
   `JSON.stringify({car: Array.from(carMesh), wheel: Array.from(wheelMesh),
   world: Array.from(chunkMesh), aM, bM})`.
2. Render:
   `python3 render_preview.py meshes.json out.png --car-only` for the
   car close-up, add `--pixel` for the in-game 160 px look, or give
   `--eye`/`--look` in world metres for scene shots.
3. Look at the PNG before shipping any mesh or matrix change. That is
   the whole point.

Requires Pillow (`pip install pillow`). Dev-only; not wired to CI.
