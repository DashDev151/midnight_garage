import { Container, Graphics } from 'pixi.js'
import { EAVE, GRASS_BASE, GRASS_SHADE, HAZE_TINT, KERB, ROAD, WATER } from './overworldPalette'
import { buildLocationSprite, overworldLocationSize, type OverworldLocationId } from './buildings'

/**
 * The 960x540 overworld scene: a tourist map, not a survey map. The central
 * district (the garage and its immediate neighbours) is geographically
 * tiny and occupies most of the canvas because that is where every day is
 * spent; the four corners compress toward the edges, smaller and hazier,
 * with the roads narrowing as they reach them. Distance is conveyed by that
 * compression and by a haze tint over the far clusters, never by empty
 * tarmac - the ground between clusters is grass, not a bare road shoulder.
 *
 * This module draws the ground, water, roads and haze with Pixi's own
 * `Graphics` primitives (rects and polygons) rather than indexed templates:
 * broad terrain fields are naturally vector shapes, where `buildings.ts`'s
 * per-location templates earn their keep on rectilinear, detailed props. A
 * handful of trees use the same `Graphics` approach for the treeline that
 * compresses the route to the larger city.
 *
 * Everything here sits at 1x, matching `buildings.ts`: the screen that
 * consumes this scene applies whatever integer zoom it needs.
 */

export const SCENE_WIDTH = 960
export const SCENE_HEIGHT = 540

/**
 * One location's position on the map, CENTRE coordinates, snapped to the
 * 16px grid from the design table's raw numbers. Every nudge is at most
 * 8px and is listed here rather than silently applied:
 *
 *   garage 480,290 -> 480,288 (-2y)          cafe 400,230 -> 400,224 (-6y)
 *   tool hire 580,240 -> 576,240 (-4x)       parts shop 600,330 -> 608,336 (+8x,+6y)
 *   local yard 360,380 -> 368,384 (+8x,+4y)  staff centre 300,250 -> 304,256 (+4x,+6y)
 *   bank 560,410 -> 560,416 (+6y)            mountains 110,80 -> 112,80 (+2x)
 *   regional auction 830,90 -> 832,96 (+2x,+6y)
 *   highway/wangan 850,430 -> 848,432 (-2x,+2y)
 *   premium auction 890,480 -> 896,480 (+6x)
 *   dealer network 110,450 -> 112,448 (+2x,-2y)
 *   collector network 200,480 -> 208,480 (+8x, the one tie broken upward)
 *   international raceway 60,380 -> 64,384 (+4x,+4y)
 *
 * No two locations' bounds overlap once these are applied.
 */
export interface OverworldPlacement {
  id: OverworldLocationId
  x: number
  y: number
}

export const OVERWORLD_PLACEMENTS: readonly OverworldPlacement[] = [
  { id: 'garage', x: 480, y: 288 },
  { id: 'cafe', x: 400, y: 224 },
  { id: 'tool-hire', x: 576, y: 240 },
  { id: 'parts-shop', x: 608, y: 336 },
  { id: 'local-yard', x: 368, y: 384 },
  { id: 'staff-centre', x: 304, y: 256 },
  { id: 'bank', x: 560, y: 416 },
  { id: 'mountains-touge', x: 112, y: 80 },
  { id: 'regional-auction', x: 832, y: 96 },
  { id: 'highway-wangan', x: 848, y: 432 },
  { id: 'premium-auction', x: 896, y: 480 },
  { id: 'dealer-network', x: 112, y: 448 },
  { id: 'collector-network', x: 208, y: 480 },
  { id: 'international-raceway', x: 64, y: 384 },
]

// The paved centre: a plaza the immediate cluster fronts onto, wide enough
// that it reads as the place the player actually stands, not a road. Tall
// enough to run under the garage, cafe, tool hire and staff centre's own
// kerb rows - each building draws over it, so the overlap just reads as
// that building fronting onto the street rather than floating on grass.
const HUB = { x0: 256, y0: 250, x1: 704, y1: 364 }

/** Four points, centreline (x0,y0)-(x1,y1), tapering from w0 to w1. */
function taperedRoad(
  x0: number,
  y0: number,
  w0: number,
  x1: number,
  y1: number,
  w1: number,
): number[] {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  return [
    x0 + (nx * w0) / 2,
    y0 + (ny * w0) / 2,
    x1 + (nx * w1) / 2,
    y1 + (ny * w1) / 2,
    x1 - (nx * w1) / 2,
    y1 - (ny * w1) / 2,
    x0 - (nx * w0) / 2,
    y0 - (ny * w0) / 2,
  ]
}

/** A road with a kerb: the same tapered shape drawn twice, kerb-coloured
 * six pixels wider all round, then the road on top. */
function drawTaperedRoad(
  g: Graphics,
  x0: number,
  y0: number,
  w0: number,
  x1: number,
  y1: number,
  w1: number,
): void {
  g.poly(taperedRoad(x0, y0, w0 + 6, x1, y1, w1 + 6)).fill(KERB)
  g.poly(taperedRoad(x0, y0, w0, x1, y1, w1)).fill(ROAD)
}

function drawGround(scene: Container): void {
  const ground = new Graphics()
  ground.rect(0, 0, SCENE_WIDTH, SCENE_HEIGHT).fill(GRASS_BASE)
  // A handful of darker patches break up the flat fill without reading as
  // a pattern - waste ground rather than a tended lawn.
  const patches: [number, number, number, number][] = [
    [40, 180, 140, 90],
    [560, 60, 120, 70],
    [760, 220, 160, 100],
    [40, 460, 120, 60],
    [420, 440, 140, 70],
  ]
  for (const [x, y, w, h] of patches) ground.rect(x, y, w, h).fill(GRASS_SHADE)
  scene.addChild(ground)
}

function drawWater(scene: Container): void {
  // The bay the wangan runs along, tucked into the bottom-right corner
  // behind the highway gantry and the premium auction.
  const water = new Graphics()
  water.rect(820, 500, SCENE_WIDTH - 820, SCENE_HEIGHT - 500).fill(WATER)
  water.poly([820, 500, 960, 460, 960, 500]).fill(WATER)
  for (let x = 830; x < 950; x += 22) {
    water.rect(x, 512 + ((x / 22) % 2) * 6, 12, 2).fill(KERB)
  }
  scene.addChild(water)
}

function drawRoads(scene: Container): void {
  const g = new Graphics()
  const kerbInset = 4
  g.rect(
    HUB.x0 - kerbInset,
    HUB.y0 - kerbInset,
    HUB.x1 - HUB.x0 + kerbInset * 2,
    HUB.y1 - HUB.y0 + kerbInset * 2,
  ).fill(KERB)
  g.rect(HUB.x0, HUB.y0, HUB.x1 - HUB.x0, HUB.y1 - HUB.y0).fill(ROAD)

  // Four branches, each narrowing toward its corner - the map's one
  // distance cue besides haze and size.
  drawTaperedRoad(g, 300, HUB.y0, 40, 95, 116, 12) // north-west, meeting the touge's own switchback
  drawTaperedRoad(g, 660, HUB.y0, 40, 800, 140, 16) // north-east, to the regional auction
  drawTaperedRoad(g, 660, HUB.y1, 40, 850, 430, 18) // south-east, under the gantry
  drawTaperedRoad(g, 850, 430, 18, 960, 510, 12) // the wangan running on, off the corner
  drawTaperedRoad(g, 300, HUB.y1, 40, 200, 430, 18) // south-west, to the larger city

  scene.addChild(g)
}

/** A simple triangle-and-trunk tree, cheap enough to repeat along a
 * treeline without becoming its own indexed template. */
function drawTree(scene: Container, x: number, y: number, scale = 1): void {
  const tree = new Graphics()
  tree.rect(-1 * scale, 0, 2 * scale, 5 * scale).fill(EAVE)
  tree.poly([0, -14 * scale, 8 * scale, 2 * scale, -8 * scale, 2 * scale]).fill(GRASS_SHADE)
  tree.x = x
  tree.y = y
  scene.addChild(tree)
}

function drawTreeline(scene: Container): void {
  // Between the hub and the larger city, the one place the design calls
  // out a treeline explicitly as a compression device.
  const sw: [number, number, number][] = [
    [246, 400, 1],
    [232, 414, 1],
    [214, 424, 0.85],
    [198, 434, 0.8],
  ]
  for (const [x, y, scale] of sw) drawTree(scene, x, y, scale)

  // A thin line along the foot of the touge, where the switchback road
  // meets the plain.
  const foot: [number, number, number][] = [
    [100, 132, 0.8],
    [118, 138, 0.75],
    [82, 140, 0.75],
  ]
  for (const [x, y, scale] of foot) drawTree(scene, x, y, scale)
}

function drawHaze(scene: Container): void {
  const zones: [number, number, number, number][] = [
    [16, 24, 220, 150], // the mountains and the touge
    [740, 32, 220, 140], // the regional auction
    [740, 350, 220, 190], // the highway, the wangan, the premium auction
    [0, 330, 260, 210], // the larger city
  ]
  const haze = new Graphics()
  for (const [x, y, w, h] of zones) {
    haze.rect(x, y, w, h).fill(HAZE_TINT)
  }
  // One alpha on the whole layer rather than a per-fill alpha: every zone
  // shares the same haze strength, and `alpha` is the one property every
  // Pixi version agrees on the shape of.
  haze.alpha = 0.32
  scene.addChild(haze)
}

function placeBuildings(scene: Container): void {
  const ordered = [...OVERWORLD_PLACEMENTS].sort((a, b) => a.y - b.y)
  for (const placement of ordered) {
    const sprite = buildLocationSprite(placement.id)
    const { width, height } = overworldLocationSize(placement.id)
    sprite.x = Math.round(placement.x - width / 2)
    sprite.y = Math.round(placement.y - height / 2)
    scene.addChild(sprite)
  }
}

/** Builds the full overworld scene: ground and water, the road network,
 * the treeline, every building at its placement, and the distance haze
 * over the four far corners drawn last so it sits over the buildings too. */
export function buildOverworldScene(): Container {
  const scene = new Container()
  drawGround(scene)
  drawWater(scene)
  drawRoads(scene)
  drawTreeline(scene)
  placeBuildings(scene)
  drawHaze(scene)
  return scene
}
