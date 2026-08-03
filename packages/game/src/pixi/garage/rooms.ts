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
 * The alley and workshop-floor cars are still sample content, standing in
 * for live game data (which cars are parked, which are for sale) that a
 * screen has yet to drive. The office's three stamps are no longer a
 * sample: `buildOfficeScene` takes the real listing, photo and certificate
 * counts and draws exactly that many, clamped to what each part of the
 * wall can hold; the five/three/two it used to bake in only survive as its
 * default for a caller with no counts to give.
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

/** The real counts `buildOfficeScene` stamps up: one card per car listed
 * for sale, one photo per point of the reputation-derived coverage
 * `officeDisplay.ts` already computes, one certificate per technique
 * earned. Never a raw reputation number or a technique's identity - the
 * office's whole point is reading as those things at a glance rather than
 * as a readout - so a caller hands over counts only. */
export interface OfficeSceneCounts {
  listings: number
  photos: number
  certificates: number
}

/** What `buildOfficeScene` has always sample-drawn: five cards, three
 * photos (the design doc's own "a new shop has three curling snapshots"),
 * two certificates. Kept as the default so a caller that has not wired up
 * real counts yet renders exactly as before. */
export const DEFAULT_OFFICE_COUNTS: OfficeSceneCounts = {
  listings: 5,
  photos: 3,
  certificates: 2,
}

/** A rectangle in scene pixels, given by its centre, that a repeatable
 * stamp is laid out inside. */
interface StampField {
  x: number
  y: number
  width: number
  height: number
}

/** The corkboard's own footprint, inset so a card's edge never rides over
 * the wooden lip drawn around the cork - derived from the corkboard's own
 * placement and template size (`GARAGE_PLACEMENTS`, `garageFixtureSize`)
 * rather than a second set of numbers, so moving or resizing the corkboard
 * carries the card field with it. */
function fieldForOfficeFixture(fixture: GarageFixtureId, margin: number): StampField {
  const placement = GARAGE_PLACEMENTS.find((p) => p.room === 'office' && p.fixture === fixture)
  if (!placement) throw new Error(`no office placement for fixture "${fixture}"`)
  const scale = placement.scale ?? DEFAULT_FIXTURE_SCALE
  const { width, height } = garageFixtureSize(fixture)
  return {
    x: placement.x,
    y: placement.y,
    width: width * scale - margin * 2,
    height: height * scale - margin * 2,
  }
}

const CARD_COLUMNS = 4
const CARD_ROWS = 3
/** How many index cards the corkboard has room to pin before it is
 * physically full. Past this, a caller's true listing count keeps growing
 * (the HTML readout beside the canvas still shows it) but the board itself
 * stops adding cards rather than overflowing its own frame. */
export const MAX_LISTING_CARDS = CARD_COLUMNS * CARD_ROWS
const CARD_FIELD = fieldForOfficeFixture('corkboard', 16)

// The photo wall and the certificate frames pin straight to the painted
// wall - they have no backing fixture of their own to inset from - so
// their fields are given directly, chosen to sit inside the office's wall
// band (below the strip lights, above the floor seam) and clear of every
// other office fixture: the corkboard to the left, the desk, chair,
// register and radio further along the room.
const PHOTO_COLUMNS = 5
const PHOTO_ROWS = 3
/** Exactly the legend tier's own photo count (`officeDisplay.ts`'s
 * `photoCountForReputationTier`), so the wall never runs out of room
 * before reputation runs out of tiers - no separate cap invented. */
export const MAX_PHOTO_STAMPS = PHOTO_COLUMNS * PHOTO_ROWS
const PHOTO_FIELD: StampField = { x: 560, y: 145, width: 160, height: 96 }

const CERTIFICATE_COLUMNS = 4
const CERTIFICATE_ROWS = 2
/** More frames than the game has techniques to earn today, so the wall
 * has headroom for whatever the roster grows to before it is the one
 * running short. */
export const MAX_CERTIFICATE_STAMPS = CERTIFICATE_COLUMNS * CERTIFICATE_ROWS
const CERTIFICATE_FIELD: StampField = { x: 740, y: 145, width: 128, height: 64 }

/** Lays out up to `columns * rows` stamp centres inside `field`, left to
 * right then top to bottom. `count` is clamped to that capacity first, so
 * nothing to show draws nothing and more than the field can hold stops at
 * the same cap every time rather than overflowing or shrinking to fit.
 * Earlier stamps keep their slot as the count grows - only the next empty
 * slot in reading order ever gains a new one. Pure arithmetic: no Pixi or
 * DOM object touches this, so the stamping maths can be tested without a
 * canvas. */
function stampPositions(
  count: number,
  columns: number,
  rows: number,
  field: StampField,
): [number, number][] {
  const shown = Math.max(0, Math.min(count, columns * rows))
  const colStep = field.width / columns
  const rowStep = field.height / rows
  const left = field.x - field.width / 2
  const top = field.y - field.height / 2
  const positions: [number, number][] = []
  for (let i = 0; i < shown; i++) {
    const col = i % columns
    const row = Math.floor(i / columns)
    positions.push([
      Math.round(left + colStep * (col + 0.5)),
      Math.round(top + rowStep * (row + 0.5)),
    ])
  }
  return positions
}

/** Where the corkboard's cards land for a given listing count, clamped to
 * `MAX_LISTING_CARDS`. */
export function officeCardPositions(count: number): [number, number][] {
  return stampPositions(count, CARD_COLUMNS, CARD_ROWS, CARD_FIELD)
}

/** Where the photo wall's snapshots land for a given photo count, clamped
 * to `MAX_PHOTO_STAMPS`. */
export function officePhotoPositions(count: number): [number, number][] {
  return stampPositions(count, PHOTO_COLUMNS, PHOTO_ROWS, PHOTO_FIELD)
}

/** Where the certificate frames land for a given earned-technique count,
 * clamped to `MAX_CERTIFICATE_STAMPS`. */
export function officeCertificatePositions(count: number): [number, number][] {
  return stampPositions(count, CERTIFICATE_COLUMNS, CERTIFICATE_ROWS, CERTIFICATE_FIELD)
}

function buildOfficeScene(counts: OfficeSceneCounts = DEFAULT_OFFICE_COUNTS): Container {
  const scene = new Container()
  drawInteriorShell(scene, OFFICE_WALL_HEIGHT)
  drawStripLights(scene)
  for (const placement of placementsFor('office')) placeFixture(scene, placement)

  // The corkboard's cards: one per car currently listed for sale.
  for (const [x, y] of officeCardPositions(counts.listings)) {
    placeFixture(scene, { room: 'office', fixture: 'card', x, y })
  }

  // The photo wall: one snapshot per point of reputation coverage, pinned
  // straight to the wall, no board beneath.
  for (const [x, y] of officePhotoPositions(counts.photos)) {
    placeFixture(scene, { room: 'office', fixture: 'photo', x, y })
  }

  // The certificates, beside the photos: one per technique earned.
  for (const [x, y] of officeCertificatePositions(counts.certificates)) {
    placeFixture(scene, { room: 'office', fixture: 'certificate', x, y })
  }

  // The phone, on the desk.
  placeFixture(scene, { room: 'office', fixture: 'phone', x: 455, y: 415 })

  return scene
}

/** Builds one room's scene. Both variants of a derelict-capable room share
 * `drawInteriorShell` at the same wall height, so calling this twice with
 * the `-open` and `-derelict` ids of the same room produces two scenes
 * with identical architecture and different contents. `officeCounts` is
 * only read for `id === 'office'`; every other room ignores it, and
 * omitting it renders the office at `DEFAULT_OFFICE_COUNTS`. */
export function buildGarageRoomScene(
  id: GarageRoomId,
  officeCounts?: OfficeSceneCounts,
): Container {
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
      return buildOfficeScene(officeCounts)
  }
}
