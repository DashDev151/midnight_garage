import { Container, Graphics } from 'pixi.js'
import {
  EAVE,
  FLOOR_BASE,
  FLOOR_SHADE,
  KERB,
  OUTLINE,
  ROAD,
  STRIP_LIGHT,
  WALL_PAINT_LIGHT,
  WALL_PAINT_SHADE,
  YARD_CAR_COLOURS,
} from './garagePalette'
import {
  buildCarTopSprite,
  buildFixtureSprite,
  garageCarSize,
  garageFixtureSize,
  type GarageFixtureId,
} from './fixtures'

/**
 * The garage interior: six rooms, each its own 960x540 scene at the
 * overworld's own scale so the two feel like one world. Every room shares
 * the same top-down oblique read as `overworld/overworldMap.ts` - you see
 * the floor, the near edge of the back wall, and the tops of whatever is
 * standing in the room - and the same technique split: broad architecture
 * (floor, wall, lighting) drawn with Pixi `Graphics`, individual objects
 * drawn from `fixtures.ts`'s indexed templates and placed here.
 *
 * Three rooms ship two variants apiece - warehouse, machine shop, body and
 * paint shop - an open state and a derelict one. Both variants of a given
 * room call the exact same shell function with the exact same wall height,
 * so the architecture is pixel-identical between them; only the lighting
 * (a cool strip light when open, one warm bare bulb when derelict) and the
 * fixture placements change. That sameness is deliberate: a derelict room
 * has to read as the room the player could have, not a different room.
 *
 * `GARAGE_PLACEMENTS` covers the fixed furniture only - the things a
 * screen would hit-test against later (a lathe, a corkboard, a bay lift).
 * Two kinds of content are deliberately left out of that table and drawn
 * directly inside each room's builder instead: the cars in the alley and
 * on the lift, and the office's pinned cards, photos and certificates.
 * Both stand in for live game data (which cars exist, which cars sold,
 * which techniques are earned) that a screen will eventually drive the
 * real count and identity of - the placeholder count baked in here is a
 * sample, not a placement a future screen should read as authoritative.
 */

export const SCENE_WIDTH = 960
export const SCENE_HEIGHT = 540

/** Every fixture in `fixtures.ts` renders at 1x; every room repeats each
 * template pixel this many times so furniture reads at room scale rather
 * than at the overworld's building-on-a-map scale. Integer only. */
const DEFAULT_FIXTURE_SCALE = 4

// Wall height for the five rooms that share the standard shell. The office
// is taller - it carries a wall-mounted corkboard, photos and certificates
// and needs the headroom - and the alley has no wall band at all, so
// neither uses this constant.
const STANDARD_WALL_HEIGHT = 128
const OFFICE_WALL_HEIGHT = 220

export type GarageRoomId =
  | 'alley'
  | 'workshop-floor'
  | 'warehouse-open'
  | 'warehouse-derelict'
  | 'machine-shop-open'
  | 'machine-shop-derelict'
  | 'body-paint-open'
  | 'body-paint-derelict'
  | 'office'

/** Rooms that start closed. What opening one costs, and what it adds to
 * rent, is a design and economy decision made elsewhere - this module only
 * draws what each state looks like. */
export const DERELICT_CAPABLE_ROOMS: readonly GarageRoomId[] = [
  'warehouse-open',
  'warehouse-derelict',
  'machine-shop-open',
  'machine-shop-derelict',
  'body-paint-open',
  'body-paint-derelict',
]

export const GARAGE_ROOM_IDS: readonly GarageRoomId[] = [
  'alley',
  'workshop-floor',
  'warehouse-open',
  'warehouse-derelict',
  'machine-shop-open',
  'machine-shop-derelict',
  'body-paint-open',
  'body-paint-derelict',
  'office',
]

/** One fixed piece of furniture: which room, which fixture, and its
 * CENTRE in scene pixels (matching `overworld/overworldMap.ts`'s own
 * `OverworldPlacement` convention) at `DEFAULT_FIXTURE_SCALE` unless a
 * placement gives its own `scale`. */
export interface GarageFixturePlacement {
  room: GarageRoomId
  fixture: GarageFixtureId
  x: number
  y: number
  scale?: number
}

export const GARAGE_PLACEMENTS: readonly GarageFixturePlacement[] = [
  // --- Alley: the two for-sale signs. The cars themselves are sample
  // content, drawn directly in buildAlleyScene rather than tabled here.
  { room: 'alley', fixture: 'for-sale-sign', x: 560, y: 260 },
  { room: 'alley', fixture: 'for-sale-sign', x: 700, y: 300 },

  // --- Workshop floor: two lifts, a tool board, two benches.
  { room: 'workshop-floor', fixture: 'tool-board', x: 170, y: 90 },
  { room: 'workshop-floor', fixture: 'bay-lift', x: 260, y: 300 },
  { room: 'workshop-floor', fixture: 'bay-lift', x: 650, y: 300 },
  { room: 'workshop-floor', fixture: 'bench', x: 450, y: 460 },
  { room: 'workshop-floor', fixture: 'bench', x: 820, y: 460 },

  // --- Warehouse, open: three racks, two wheel stacks.
  { room: 'warehouse-open', fixture: 'rack-bay', x: 190, y: 260 },
  { room: 'warehouse-open', fixture: 'rack-bay', x: 480, y: 260 },
  { room: 'warehouse-open', fixture: 'rack-bay', x: 770, y: 260 },
  { room: 'warehouse-open', fixture: 'wheel-stack', x: 100, y: 440 },
  { room: 'warehouse-open', fixture: 'wheel-stack', x: 860, y: 440 },

  // --- Warehouse, derelict: the same three rack footprints emptied out,
  // one bare bulb, and the junk that has piled up instead of stock.
  { room: 'warehouse-derelict', fixture: 'rack-bay-derelict', x: 190, y: 260 },
  { room: 'warehouse-derelict', fixture: 'rack-bay-derelict', x: 480, y: 260 },
  { room: 'warehouse-derelict', fixture: 'rack-bay-derelict', x: 770, y: 260 },
  { room: 'warehouse-derelict', fixture: 'junk-boxes', x: 100, y: 440 },
  { room: 'warehouse-derelict', fixture: 'dust-sheet-lump', x: 480, y: 450 },
  { room: 'warehouse-derelict', fixture: 'junk-boxes', x: 860, y: 440 },
  { room: 'warehouse-derelict', fixture: 'bare-bulb', x: 480, y: 90 },

  // --- Machine shop, open: a lathe, a mill, swarf at each foot, a bench.
  { room: 'machine-shop-open', fixture: 'lathe', x: 280, y: 280 },
  { room: 'machine-shop-open', fixture: 'mill', x: 650, y: 270 },
  { room: 'machine-shop-open', fixture: 'swarf', x: 280, y: 330 },
  { room: 'machine-shop-open', fixture: 'swarf', x: 650, y: 320 },
  { room: 'machine-shop-open', fixture: 'bench', x: 480, y: 460 },

  // --- Machine shop, derelict: the lathe on the same spot, gone to rust
  // and short its carriage; no mill at all; junk where the bench was.
  { room: 'machine-shop-derelict', fixture: 'lathe-derelict', x: 280, y: 280 },
  { room: 'machine-shop-derelict', fixture: 'junk-boxes', x: 650, y: 300 },
  { room: 'machine-shop-derelict', fixture: 'dust-sheet-lump', x: 480, y: 450 },
  { room: 'machine-shop-derelict', fixture: 'junk-boxes', x: 800, y: 440 },
  { room: 'machine-shop-derelict', fixture: 'bare-bulb', x: 480, y: 90 },

  // --- Body and paint, open: the booth, a panel on its stand, the compressor.
  { room: 'body-paint-open', fixture: 'booth', x: 620, y: 240 },
  { room: 'body-paint-open', fixture: 'panel-stand', x: 250, y: 380 },
  { room: 'body-paint-open', fixture: 'compressor', x: 180, y: 460 },

  // --- Body and paint, derelict: the same booth, empty, gone dark; the
  // panel stand and compressor replaced with junk and a dust sheet.
  { room: 'body-paint-derelict', fixture: 'booth-derelict', x: 620, y: 240 },
  { room: 'body-paint-derelict', fixture: 'dust-sheet-lump', x: 250, y: 400 },
  { room: 'body-paint-derelict', fixture: 'junk-boxes', x: 180, y: 460 },
  { room: 'body-paint-derelict', fixture: 'bare-bulb', x: 480, y: 90 },

  // --- Office: the corkboard, the desk and chair, the register, the radio.
  // The photo wall and the certificates need no backing object of their
  // own - they pin straight to the painted wall - so only their stamps
  // appear, drawn directly in buildOfficeScene.
  { room: 'office', fixture: 'corkboard', x: 200, y: 170 },
  { room: 'office', fixture: 'desk', x: 500, y: 430 },
  { room: 'office', fixture: 'chair', x: 500, y: 470 },
  { room: 'office', fixture: 'register', x: 760, y: 430 },
  { room: 'office', fixture: 'radio', x: 850, y: 250 },
]

/** Places one fixture from `fixtures.ts` by its CENTRE, scaling the whole
 * sprite by an integer factor so 1x template art reads at room scale. */
function placeFixture(scene: Container, placement: GarageFixturePlacement): void {
  const scale = placement.scale ?? DEFAULT_FIXTURE_SCALE
  const sprite = buildFixtureSprite(placement.fixture)
  const { width, height } = garageFixtureSize(placement.fixture)
  sprite.scale.set(scale)
  sprite.x = Math.round(placement.x - (width * scale) / 2)
  sprite.y = Math.round(placement.y - (height * scale) / 2)
  scene.addChild(sprite)
}

/** Places a top-down car by CENTRE, in the given paint, at the given
 * integer scale - the alley's parked stock and the workshop floor's one
 * car up on the lift share this same drawing. */
function placeCar(scene: Container, x: number, y: number, paintHex: string, scale: number): void {
  const sprite = buildCarTopSprite(paintHex, scale)
  const { width, height } = garageCarSize()
  sprite.x = Math.round(x - (width * scale) / 2)
  sprite.y = Math.round(y - (height * scale) / 2)
  scene.addChild(sprite)
}

/** The floor's own texture: a handful of darker patches (grout lines, old
 * oil stains) breaking up the flat fill, the same device
 * `overworld/overworldMap.ts` uses for its grass. Positions are given
 * relative to the floor's own top edge so the same call works whether the
 * room's wall band is the standard height or the office's taller one. */
function drawFloorTexture(scene: Container, floorTop: number): void {
  const g = new Graphics()
  const patches: [number, number, number, number][] = [
    [60, floorTop + 40, 160, 60],
    [420, floorTop + 20, 140, 50],
    [700, floorTop + 60, 180, 70],
    [220, floorTop + 180, 140, 60],
    [560, floorTop + 200, 160, 50],
  ]
  for (const [x, y, w, h] of patches) g.rect(x, y, w, h).fill(FLOOR_SHADE)
  // Two small, deliberately irregular oil-stain blotches near the middle
  // of the room, where a car would usually be standing.
  g.rect(360, floorTop + 120, 48, 22).fill(EAVE)
  g.rect(560, floorTop + 150, 36, 18).fill(EAVE)
  scene.addChild(g)
}

/** The standard interior shell every non-alley room shares: a painted
 * block wall down to a skirting board, a seam line, and a concrete floor
 * with its own texture. Both variants of a derelict-capable room call this
 * with the same `wallHeight`, which is what keeps their architecture
 * identical. */
function drawInteriorShell(scene: Container, wallHeight: number): void {
  const skirtingHeight = 16
  const wall = new Graphics()
  wall.rect(0, 0, SCENE_WIDTH, wallHeight - skirtingHeight).fill(WALL_PAINT_LIGHT)
  wall.rect(0, wallHeight - skirtingHeight, SCENE_WIDTH, skirtingHeight).fill(WALL_PAINT_SHADE)
  wall.rect(0, wallHeight, SCENE_WIDTH, 4).fill(OUTLINE)
  scene.addChild(wall)

  const floor = new Graphics()
  floor.rect(0, wallHeight + 4, SCENE_WIDTH, SCENE_HEIGHT - wallHeight - 4).fill(FLOOR_BASE)
  scene.addChild(floor)
  drawFloorTexture(scene, wallHeight + 4)
}

/** Three evenly spaced fluorescent tubes near the ceiling - the cool light
 * that marks a room as open and in use, contrasted with a derelict room's
 * one warm bare bulb (drawn from `fixtures.ts` like any other fixture). */
function drawStripLights(scene: Container): void {
  const g = new Graphics()
  const xs = [120, 420, 720]
  for (const x of xs) g.rect(x, 16, 120, 8).fill(STRIP_LIGHT)
  scene.addChild(g)
}

/** The alley's own shell: tarmac rather than painted block, since it is
 * the one room that is genuinely outside - the road out to the overworld
 * runs along its far edge. */
function drawAlleyShell(scene: Container): void {
  const g = new Graphics()
  g.rect(0, 0, SCENE_WIDTH, SCENE_HEIGHT).fill(ROAD)
  // The garage's own back wall, low and close, along the top of the scene.
  g.rect(0, 0, SCENE_WIDTH, 64).fill(WALL_PAINT_SHADE)
  g.rect(0, 64, SCENE_WIDTH, 6).fill(OUTLINE)
  // A kerb line marking the edge of the yard before the road proper.
  g.rect(0, SCENE_HEIGHT - 40, SCENE_WIDTH, 10).fill(KERB)
  scene.addChild(g)
}

function placementsFor(room: GarageRoomId): GarageFixturePlacement[] {
  return GARAGE_PLACEMENTS.filter((p) => p.room === room)
}

function buildAlleyScene(): Container {
  const scene = new Container()
  drawAlleyShell(scene)
  for (const placement of placementsFor('alley')) placeFixture(scene, placement)
  // Sample parked and for-sale cars - real content once a screen reads
  // the actual parking and forecourt state.
  placeCar(scene, 220, 340, YARD_CAR_COLOURS.b, 8)
  placeCar(scene, 320, 380, YARD_CAR_COLOURS.a, 8)
  placeCar(scene, 560, 320, YARD_CAR_COLOURS.c, 8)
  placeCar(scene, 700, 360, YARD_CAR_COLOURS.d, 8)
  placeCar(scene, 820, 420, YARD_CAR_COLOURS.c, 8)
  return scene
}

function buildWorkshopFloorScene(): Container {
  const scene = new Container()
  drawInteriorShell(scene, STANDARD_WALL_HEIGHT)
  drawStripLights(scene)
  for (const placement of placementsFor('workshop-floor')) placeFixture(scene, placement)
  // One car up on the second lift, mid-repair and still in primer - the
  // fixed lift positions above are furniture; which bay holds a car, and
  // which car, is live state a screen will drive later.
  placeCar(scene, 650, 300, FLOOR_SHADE, 12)
  return scene
}

function buildWarehouseScene(derelict: boolean): Container {
  const scene = new Container()
  drawInteriorShell(scene, STANDARD_WALL_HEIGHT)
  if (!derelict) drawStripLights(scene)
  for (const placement of placementsFor(derelict ? 'warehouse-derelict' : 'warehouse-open')) {
    placeFixture(scene, placement)
  }
  return scene
}

function buildMachineShopScene(derelict: boolean): Container {
  const scene = new Container()
  drawInteriorShell(scene, STANDARD_WALL_HEIGHT)
  if (!derelict) drawStripLights(scene)
  for (const placement of placementsFor(derelict ? 'machine-shop-derelict' : 'machine-shop-open')) {
    placeFixture(scene, placement)
  }
  return scene
}

function buildBodyPaintScene(derelict: boolean): Container {
  const scene = new Container()
  drawInteriorShell(scene, STANDARD_WALL_HEIGHT)
  if (!derelict) drawStripLights(scene)
  for (const placement of placementsFor(derelict ? 'body-paint-derelict' : 'body-paint-open')) {
    placeFixture(scene, placement)
  }
  return scene
}

function buildOfficeScene(): Container {
  const scene = new Container()
  drawInteriorShell(scene, OFFICE_WALL_HEIGHT)
  drawStripLights(scene)
  for (const placement of placementsFor('office')) placeFixture(scene, placement)

  // The corkboard's cards: a sample pipeline, not a live one. Positions
  // sit inside the corkboard fixture placed above (centre 200,170 at 4x,
  // roughly x136-264 y126-214).
  const cardSpots: [number, number][] = [
    [160, 175],
    [200, 168],
    [240, 178],
    [175, 205],
    [225, 208],
  ]
  for (const [x, y] of cardSpots) placeFixture(scene, { room: 'office', fixture: 'card', x, y })

  // The photo wall: three curling snapshots - a new shop's starting count,
  // per the design doc - pinned straight to the wall, no board beneath.
  const photoSpots: [number, number][] = [
    [450, 110],
    [495, 106],
    [540, 112],
  ]
  for (const [x, y] of photoSpots) placeFixture(scene, { room: 'office', fixture: 'photo', x, y })

  // The certificates, beside the photos: a sample of two earned techniques.
  const certificateSpots: [number, number][] = [
    [620, 108],
    [665, 112],
  ]
  for (const [x, y] of certificateSpots)
    placeFixture(scene, { room: 'office', fixture: 'certificate', x, y })

  // The phone, on the desk.
  placeFixture(scene, { room: 'office', fixture: 'phone', x: 455, y: 415 })

  return scene
}

/** Builds one room's scene. Both variants of a derelict-capable room share
 * `drawInteriorShell` at the same wall height, so calling this twice with
 * the `-open` and `-derelict` ids of the same room produces two scenes
 * with identical architecture and different contents. */
export function buildGarageRoomScene(id: GarageRoomId): Container {
  switch (id) {
    case 'alley':
      return buildAlleyScene()
    case 'workshop-floor':
      return buildWorkshopFloorScene()
    case 'warehouse-open':
      return buildWarehouseScene(false)
    case 'warehouse-derelict':
      return buildWarehouseScene(true)
    case 'machine-shop-open':
      return buildMachineShopScene(false)
    case 'machine-shop-derelict':
      return buildMachineShopScene(true)
    case 'body-paint-open':
      return buildBodyPaintScene(false)
    case 'body-paint-derelict':
      return buildBodyPaintScene(true)
    case 'office':
      return buildOfficeScene()
  }
}
