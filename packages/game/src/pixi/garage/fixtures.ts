import { Sprite, Texture } from 'pixi.js'
import {
  ACCENT_TEAL,
  CRATE,
  DOOR,
  EAVE,
  GLASS_DARK,
  GLASS_LIT,
  HAZE_TINT,
  OUTLINE,
  RUST,
  SIGN_BOARD,
  STEEL_LIGHT,
  STEEL_SHADE,
  TRIM_LIGHT,
  TYRE,
  WALL_BASE,
  WALL_SHADE,
  YARD_CAR_COLOURS,
} from './garagePalette'

/**
 * The garage's own object vocabulary, drawn with the same indexed-template
 * technique as `overworld/buildings.ts`: one hand-built character grid per
 * fixture, rasterised through a colour map. Every fixture sits at 1x - one
 * template pixel is one scene pixel - and `rooms.ts` places these at
 * whatever x/y a room needs, repeating a stamp as many times as it likes.
 *
 * Three fixtures - `rack-bay`, `lathe` and `booth` - are drawn once and
 * given a second, derelict colour map rather than a second template. A
 * derelict room is meant to read as the same room gone unopened, not a
 * different room, so reusing the exact shape and recolouring it to rust
 * and dust is the technique doing the design work: where a derelict map
 * simply omits a key (the lathe's carriage, the booth's car, the rack's
 * boxes), that part of the fixture renders as nothing at all - the piece
 * that is missing, missing.
 *
 * Shared index characters (a fixture's own colour map decides what each
 * one renders as, exactly as `buildings.ts` documents for its own set):
 *   '.' transparent   '0' outline / linework   'h' body, lit face
 *   'k' chrome, chuck or paper   'b' body, shaded face or a frame
 *   'c' a highlight, a box, or paper   'p' primer grey or a frame post
 *   'd' a dark drawer, grille or drape   'u' a steel upright
 *   'w' a light panel   'f' a shaded face, a filter slat or a foot
 *   'j' rot   'D' a fold or a shadow line   't' timber, tank, tool
 *   'g' glass, a gauge or a ground line   'a' an arm nub or the accent dial
 *   'r' rubber, rail, or a radio body   'v' a vice   'i' a pin   's' a
 *   silhouette, sign board or shaving   'm' a steel handle   'o' a tool
 *   highlight
 */

type ColorMap = Record<string, string>

/** Static fixtures: one template, one colour map, no runtime parameter.
 * `-derelict` ids share their open counterpart's template with a second
 * colour map rather than a second shape. */
export type GarageFixtureId =
  | 'bench'
  | 'wheel-stack'
  | 'rack-bay'
  | 'rack-bay-derelict'
  | 'lathe'
  | 'lathe-derelict'
  | 'mill'
  | 'swarf'
  | 'booth'
  | 'booth-derelict'
  | 'panel-stand'
  | 'compressor'
  | 'corkboard'
  | 'card'
  | 'photo'
  | 'certificate'
  | 'phone'
  | 'register'
  | 'radio'
  | 'desk'
  | 'chair'
  | 'for-sale-sign'
  | 'bay-lift'
  | 'tool-board'
  | 'junk-boxes'
  | 'dust-sheet-lump'
  | 'bare-bulb'

// --- Workbench: timber top, a vice, two tool marks, a steel apron and legs ---
const BENCH_TEMPLATE = [
  '000000000000000000000000',
  '0ttvvttttttoottttttoott0',
  '0tttttttttttttttttttttt0',
  '0aaaaaaaaaaaaaaaaaaaaaa0',
  '..aa...............aa...',
]
const BENCH_COLORS: ColorMap = {
  '0': OUTLINE,
  a: STEEL_SHADE,
  o: TRIM_LIGHT,
  t: CRATE,
  v: STEEL_SHADE,
}

// --- Wheel stack: tyres stacked, rims seen from above ---
const WHEEL_STACK_TEMPLATE = [
  '..0000..',
  '.0rrrr0.',
  '0rr00rr0',
  '0r0000r0',
  '0rr00rr0',
  '.0rrrr0.',
  '..0000..',
]
const WHEEL_STACK_COLORS: ColorMap = { '0': OUTLINE, r: TYRE }

// --- Racking bay: two uprights, three shelves of boxes, floor showing
// through the gaps beneath each shelf ---
const RACK_BAY_TEMPLATE = [
  'u0000000000000000000000u',
  'u0cc0cc0cc0cc0cc0cc0cc0u',
  'u......................u',
  'u0000000000000000000000u',
  'u0cc0cc0cc0cc0cc0cc0cc0u',
  'u......................u',
  'u0000000000000000000000u',
  'u0cc0cc0cc0cc0cc0cc0cc0u',
  'uuuuuuuuuuuuuuuuuuuuuuuu',
]
const RACK_BAY_COLORS: ColorMap = { '0': OUTLINE, c: CRATE, u: STEEL_LIGHT }
// Derelict: the boxes are gone (no 'c' entry, so those cells render
// nothing) and the steel has gone to rust.
const RACK_BAY_DERELICT_COLORS: ColorMap = { '0': EAVE, u: RUST }

// --- Lathe: a headstock and chuck, a bed rail with a carriage, a tailstock ---
const LATHE_TEMPLATE = [
  '0000000000......................',
  '0hhhhhhhh0..............00000000',
  '0kkkkkkkk0..............0hhhhhh0',
  '0kkkkkkkk0000000000000000hhhhhh0',
  '0kkkkkkkk00bbbbccccbbbb00hhhhhh0',
  '0kkkkkkkk00bbbbbbbbbbbb00hhhhhh0',
  '0kkkkkkkk0000000000000000hhhhhh0',
  '0kkkkkkkk0..............0hhhhhh0',
  '0hhhhhhhh0..............00000000',
  '0000000000......................',
]
const LATHE_COLORS: ColorMap = {
  '0': OUTLINE,
  b: STEEL_SHADE,
  c: TRIM_LIGHT,
  h: STEEL_LIGHT,
  k: TRIM_LIGHT,
}
// Derelict: the carriage is missing (no 'c' entry) and everything that was
// steel has corroded; the bed reads as a dark, decayed line rather than a
// worked-metal rail.
const LATHE_DERELICT_COLORS: ColorMap = { '0': OUTLINE, b: OUTLINE, h: RUST, k: EAVE }

// --- Mill: a column and head standing over a table, distinct from the
// lathe's long low bed by standing tall and narrow ---
const MILL_TEMPLATE = [
  '0000000000..................',
  '0hhhhhhhh0..................',
  '0hhhhhhhh0..................',
  '0kkkkkkkk0..................',
  '0kkkkkkkk0..................',
  '0hhhhhhhh0000000000000000000',
  '0hhhhhhhh00bbbbbbccccbbbbbb0',
  '0000000000000000000000000000',
]
const MILL_COLORS: ColorMap = {
  '0': OUTLINE,
  b: STEEL_SHADE,
  c: TRIM_LIGHT,
  h: STEEL_LIGHT,
  k: TRIM_LIGHT,
}

// --- Swarf: a small curled-shavings heap at a machine's foot ---
const SWARF_TEMPLATE = ['.000.', '0sss0', '0sss0', '.000.']
const SWARF_COLORS: ColorMap = { '0': OUTLINE, s: TRIM_LIGHT }

// --- Spray booth: a filter-slat back wall, a primed car standing on the
// booth's own grated floor ---
const BOOTH_TEMPLATE = [
  '0000000000000000000000000000',
  '0wwwwwwwwwwwwwwwwwwwwwwwwww0',
  '0wwwwwwwwwwwwwwwwwwwwwwwwww0',
  '0wfwfwfwfwfwfwfwfwfwfwfwfwf0',
  '0wfwfwfwfwfwfwfwfwfwfwfwfwf0',
  '0wfwfwfwfwfwfwfwfwfwfwfwfwf0',
  '0wwwwwwwwwwwwwwwwwwwwwwwwww0',
  '0wwwwwwwwwwwwwwwwwwwwwwwwww0',
  '0........pppppppppp........0',
  '0......pppppppppppppp......0',
  '0......pppppppppppppp......0',
  '0........pppppppppp........0',
  '0ffffffffffffffffffffffffff0',
  '0000000000000000000000000000',
]
const BOOTH_COLORS: ColorMap = { '0': OUTLINE, f: STEEL_SHADE, p: WALL_SHADE, w: TRIM_LIGHT }
// Derelict: no car waiting inside (no 'p' entry), the filter slats have
// gone dark rather than working steel, and the panels have dulled to the
// same flat tone a dust sheet carries.
const BOOTH_DERELICT_COLORS: ColorMap = { '0': OUTLINE, f: OUTLINE, w: WALL_BASE }

// --- Panel stand: an easel holding a body panel upright ---
const PANEL_STAND_TEMPLATE = [
  '..0000..',
  '.0pppp0.',
  '0pppppp0',
  '0pppppp0',
  '0pppppp0',
  '.0pppp0.',
  '.0f00f0.',
  '0f....f0',
]
const PANEL_STAND_COLORS: ColorMap = { '0': OUTLINE, f: STEEL_SHADE, p: WALL_SHADE }

// --- Compressor: a horizontal tank on two feet, a motor block and a gauge ---
const COMPRESSOR_TEMPLATE = [
  '.....0gg0.....',
  '.000000000000.',
  '0tttttttttttt0',
  '0ttttttttmmmm0',
  '0ttttttttmmmm0',
  '0tttttttttttt0',
  '.000000000000.',
  '..ff......ff..',
]
const COMPRESSOR_COLORS: ColorMap = {
  '0': OUTLINE,
  f: OUTLINE,
  g: TRIM_LIGHT,
  m: STEEL_SHADE,
  t: STEEL_LIGHT,
}

// --- Corkboard: wood frame, cork face, no cards baked in - `rooms.ts`
// stamps a real count of `card` fixtures over it ---
const CORKBOARD_TEMPLATE = [
  '00000000000000000000000000000000',
  '0bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bkkkkkkkkkkkkkkkkkkkkkkkkkkkkb0',
  '0bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb0',
  '00000000000000000000000000000000',
]
const CORKBOARD_COLORS: ColorMap = { '0': OUTLINE, b: DOOR, k: CRATE }

// --- Card: one pinned index card, the corkboard's repeatable stamp -
// `rooms.ts`'s buildOfficeScene stamps one per car currently listed ---
const CARD_TEMPLATE = [
  '00000000',
  '0cccccc0',
  '0cciicc0',
  '0cccccc0',
  '0chhchh0',
  '0cccccc0',
  '00000000',
]
const CARD_COLORS: ColorMap = { '0': OUTLINE, c: TRIM_LIGHT, h: WALL_SHADE, i: YARD_CAR_COLOURS.a }

// --- Photo: a faded snapshot, a car and its owner pinned beside it - the
// photo wall's repeatable stamp, drawn by `rooms.ts`'s buildOfficeScene
// from the reputation-derived photo count ---
const PHOTO_TEMPLATE = [
  '000000000',
  '0fffffff0',
  '0ffppppf0',
  '0ffppppf0',
  '0fsfffff0',
  '0fggggff0',
  '0fffffff0',
  '0fffffff0',
  '000000000',
]
const PHOTO_COLORS: ColorMap = { '0': DOOR, f: HAZE_TINT, g: EAVE, p: OUTLINE, s: OUTLINE }

// --- Certificate: a framed craft operation, the wall's third repeatable stamp ---
const CERTIFICATE_TEMPLATE = [
  '0bbbbbbbb0',
  '0bccccccb0',
  '0bc0000cb0',
  '0bc0rr0cb0',
  '0bc0rr0cb0',
  '0bc0000cb0',
  '0bccccccb0',
  '0bccccccb0',
  '0bbbbbbbb0',
]
const CERTIFICATE_COLORS: ColorMap = { '0': OUTLINE, b: SIGN_BOARD, c: TRIM_LIGHT, r: DOOR }

// --- Phone: a rotary desk phone, handset laid across the body ---
const PHONE_TEMPLATE = [
  '.000000.',
  '0hhhhhh0',
  '0h0000h0',
  '0hhhhhh0',
  '0hhhhhh0',
  '00hhhh00',
  '..0000..',
]
const PHONE_COLORS: ColorMap = { '0': OUTLINE, h: TRIM_LIGHT }

// --- Cash register: a keyed till over a drawer front ---
const REGISTER_TEMPLATE = [
  '.0000000.',
  '0kkkkkkk0',
  '0k0k0k0k0',
  '0kkkkkkk0',
  '0ddddddd0',
  '0ddddddd0',
  '000000000',
]
const REGISTER_COLORS: ColorMap = { '0': OUTLINE, d: EAVE, k: STEEL_LIGHT }

// --- Radio: a boombox, two speakers either side of one small dial light ---
const RADIO_TEMPLATE = [
  '.000000000.',
  '0rrrrrrrrr0',
  '0dd00a00dd0',
  '0dd00a00dd0',
  '0rrrrrrrrr0',
  '0rrrrrrrrr0',
  '.000000000.',
]
const RADIO_COLORS: ColorMap = { '0': OUTLINE, a: ACCENT_TEAL, d: STEEL_SHADE, r: TRIM_LIGHT }

// --- Desk: a flat top over two drawer stacks, handles at the front edge ---
const DESK_TEMPLATE = [
  '0000000000000000',
  '0dddddddddddddd0',
  '0dddddddddddddd0',
  '0dddddddddddddd0',
  '0dddddddddddddd0',
  '0ddddmddddmdddd0',
  '0000000000000000',
]
const DESK_COLORS: ColorMap = { '0': OUTLINE, d: DOOR, m: TRIM_LIGHT }

// --- Chair: seen from behind, a curved back rail over a seat ---
const CHAIR_TEMPLATE = ['..0000..', '.0cccc0.', '0cccccc0', '0cccccc0', '.0cccc0.', '..0000..']
const CHAIR_COLORS: ColorMap = { '0': OUTLINE, c: STEEL_SHADE }

// --- For-sale sign: a standing placard by a car in the alley ---
const FOR_SALE_SIGN_TEMPLATE = ['.0000.', '0ssss0', '0ssss0', '.0000.', '..00..', '..00..']
const FOR_SALE_SIGN_COLORS: ColorMap = { '0': OUTLINE, s: SIGN_BOARD }

// --- Two-post lift: posts either end, arm nubs partway up, the bay itself
// left open so the floor - and, once occupied, a car - shows through ---
const BAY_LIFT_TEMPLATE = [
  '000000............................000000',
  '0hhhh0............................0hhhh0',
  '0hhhh0............................0hhhh0',
  '0aaaa0............................0aaaa0',
  '0hhhh0............................0hhhh0',
  '0hhhh0............................0hhhh0',
  '000000............................000000',
]
const BAY_LIFT_COLORS: ColorMap = { '0': OUTLINE, a: TRIM_LIGHT, h: STEEL_LIGHT }

// --- Tool board: a wall-mounted pegboard, a handful of tools hung in
// silhouette - the tool lines a workshop owns, read at a glance ---
const TOOL_BOARD_TEMPLATE = [
  '000000000000000000000000',
  '0pppppppppppppppppppppp0',
  '0p..t...t..t....t.....p0',
  '0p..t...t..t....t.....p0',
  '0p..t...t..t....t.....p0',
  '0pppppppppppppppppppppp0',
  '000000000000000000000000',
]
const TOOL_BOARD_COLORS: ColorMap = { '0': OUTLINE, p: STEEL_SHADE, t: OUTLINE }

// --- Junk boxes: two rotten crates stacked off-square - disorder is the
// tell that nobody has touched this in years ---
const JUNK_BOXES_TEMPLATE = [
  '.0000.....',
  '0jjjj0....',
  '0jjjj00000',
  '0jjjjjjjj0',
  '.0jjjjjjj0',
  '.0jjjjjjj0',
  '..00000000',
]
const JUNK_BOXES_COLORS: ColorMap = { '0': OUTLINE, j: RUST }

// --- Dust sheet lump: something under a sheet, a fold breaking the fill ---
const DUST_SHEET_LUMP_TEMPLATE = [
  '..0000000000..',
  '.000000000000.',
  '0dddddddddddd0',
  '0dddddDdddddd0',
  '0dddddddddddd0',
  '.000000000000.',
]
const DUST_SHEET_LUMP_COLORS: ColorMap = { '0': OUTLINE, D: WALL_SHADE, d: WALL_BASE }

// --- Bare bulb: a cord dropping to one lit bulb - the derelict rooms'
// only light, warm where a working room's strip light is cool ---
const BARE_BULB_TEMPLATE = ['.0.', '.0.', '.0.', '.0.', '000', '0b0', '000']
const BARE_BULB_COLORS: ColorMap = { '0': OUTLINE, b: GLASS_LIT }

interface FixtureArt {
  template: readonly string[]
  colors: ColorMap
}

const FIXTURE_ART: Record<GarageFixtureId, FixtureArt> = {
  bench: { template: BENCH_TEMPLATE, colors: BENCH_COLORS },
  'wheel-stack': { template: WHEEL_STACK_TEMPLATE, colors: WHEEL_STACK_COLORS },
  'rack-bay': { template: RACK_BAY_TEMPLATE, colors: RACK_BAY_COLORS },
  'rack-bay-derelict': { template: RACK_BAY_TEMPLATE, colors: RACK_BAY_DERELICT_COLORS },
  lathe: { template: LATHE_TEMPLATE, colors: LATHE_COLORS },
  'lathe-derelict': { template: LATHE_TEMPLATE, colors: LATHE_DERELICT_COLORS },
  mill: { template: MILL_TEMPLATE, colors: MILL_COLORS },
  swarf: { template: SWARF_TEMPLATE, colors: SWARF_COLORS },
  booth: { template: BOOTH_TEMPLATE, colors: BOOTH_COLORS },
  'booth-derelict': { template: BOOTH_TEMPLATE, colors: BOOTH_DERELICT_COLORS },
  'panel-stand': { template: PANEL_STAND_TEMPLATE, colors: PANEL_STAND_COLORS },
  compressor: { template: COMPRESSOR_TEMPLATE, colors: COMPRESSOR_COLORS },
  corkboard: { template: CORKBOARD_TEMPLATE, colors: CORKBOARD_COLORS },
  card: { template: CARD_TEMPLATE, colors: CARD_COLORS },
  photo: { template: PHOTO_TEMPLATE, colors: PHOTO_COLORS },
  certificate: { template: CERTIFICATE_TEMPLATE, colors: CERTIFICATE_COLORS },
  phone: { template: PHONE_TEMPLATE, colors: PHONE_COLORS },
  register: { template: REGISTER_TEMPLATE, colors: REGISTER_COLORS },
  radio: { template: RADIO_TEMPLATE, colors: RADIO_COLORS },
  desk: { template: DESK_TEMPLATE, colors: DESK_COLORS },
  chair: { template: CHAIR_TEMPLATE, colors: CHAIR_COLORS },
  'for-sale-sign': { template: FOR_SALE_SIGN_TEMPLATE, colors: FOR_SALE_SIGN_COLORS },
  'bay-lift': { template: BAY_LIFT_TEMPLATE, colors: BAY_LIFT_COLORS },
  'tool-board': { template: TOOL_BOARD_TEMPLATE, colors: TOOL_BOARD_COLORS },
  'junk-boxes': { template: JUNK_BOXES_TEMPLATE, colors: JUNK_BOXES_COLORS },
  'dust-sheet-lump': { template: DUST_SHEET_LUMP_TEMPLATE, colors: DUST_SHEET_LUMP_COLORS },
  'bare-bulb': { template: BARE_BULB_TEMPLATE, colors: BARE_BULB_COLORS },
}

/** All fixture ids, in the order they are declared above. */
export const GARAGE_FIXTURE_IDS: readonly GarageFixtureId[] = Object.keys(
  FIXTURE_ART,
) as GarageFixtureId[]

/** Canvas size derived from the template itself, so it can never drift
 * from the art. */
function sizeOf(template: readonly string[]): { width: number; height: number } {
  return { width: Math.max(...template.map((row) => row.length)), height: template.length }
}

/** Rasterise an indexed template through a colour map; unmapped characters
 * stay transparent. Identical technique to `overworld/buildings.ts`'s
 * `renderLayer`, kept as its own copy for the same reason that file gives:
 * no dependency between the two art pipelines while they develop apart. */
function renderLayer(template: readonly string[], colors: ColorMap): Texture {
  const { width, height } = sizeOf(template)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d canvas context')
  template.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x] ?? '.']
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
    }
  })
  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'nearest'
  return texture
}

const fixtureTextureCache = new Map<GarageFixtureId, Texture>()

/** A fixture's size in scene pixels, before any integer zoom the consuming
 * screen applies to the whole room. */
export function garageFixtureSize(id: GarageFixtureId): { width: number; height: number } {
  return sizeOf(FIXTURE_ART[id].template)
}

/** Renders one fixture at 1x. The texture is cached per id - a corkboard
 * full of `card` stamps rasterises the card once and reuses it - while
 * every call still returns its own `Sprite` so callers can position each
 * instance independently. */
export function buildFixtureSprite(id: GarageFixtureId): Sprite {
  let texture = fixtureTextureCache.get(id)
  if (!texture) {
    const art = FIXTURE_ART[id]
    texture = renderLayer(art.template, art.colors)
    fixtureTextureCache.set(id, texture)
  }
  return new Sprite(texture)
}

// --- The one parameterised fixture: a small top-down car, its paint
// supplied at build time so the alley can seat several different cars
// and the workshop floor can seat one in bare primer grey ---
const CAR_TOP_TEMPLATE = ['00000000', '01111110', '01gggg10', '01111110', '00000000']

export function garageCarSize(): { width: number; height: number } {
  return sizeOf(CAR_TOP_TEMPLATE)
}

/** Builds one top-down car in the given paint. `scale` repeats each
 * template pixel as an NxN block, so the same tiny drawing can stand in
 * for a parked car in the alley at 1x-2x and a car up on a lift at a
 * larger size, without a second template. */
export function buildCarTopSprite(paintHex: string, scale = 1): Sprite {
  const colors: ColorMap = { '0': OUTLINE, '1': paintHex, g: GLASS_DARK }
  const { width, height } = sizeOf(CAR_TOP_TEMPLATE)
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d canvas context')
  CAR_TOP_TEMPLATE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x] ?? '.']
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  })
  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'nearest'
  return new Sprite(texture)
}
