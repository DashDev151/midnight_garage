import { Sprite, Texture } from 'pixi.js'
import {
  ACCENT_MAGENTA,
  ACCENT_TEAL,
  BUNTING_COLOURS,
  CRATE,
  DOOR,
  EAVE,
  GLASS_DARK,
  GLASS_LIT,
  HAZE_TINT,
  KERB,
  OUTLINE,
  ROAD,
  ROOF_CIVIC_LIGHT,
  ROOF_CIVIC_SHADE,
  ROOF_COSY_LIGHT,
  ROOF_COSY_SHADE,
  ROOF_INDUSTRIAL_LIGHT,
  ROOF_INDUSTRIAL_SHADE,
  ROOF_LOT_LIGHT,
  ROOF_LOT_SHADE,
  SIGN_BOARD,
  TRIM_LIGHT,
  TYRE,
  WALL_BASE,
  WALL_SHADE,
  YARD_CAR_COLOURS,
} from './overworldPalette'

/**
 * The overworld's buildings, drawn with the same technique as
 * `carSprite.ts`: an indexed string template rasterised through a colour
 * map, one drawing per location rather than free illustration. Every
 * template here is hand-built at its final canvas size (a multiple of the
 * 16px prop grid) with one pixel of template equal to one pixel on the
 * 960x540 scene - `overworldMap.ts` places these at 1x, the consuming
 * screen may still scale the whole scene up by an integer factor.
 *
 * Two structural recipes cover most of the roster and are worth naming even
 * though only their output survives as literals below: a gable roof (a
 * ridge down the centre, a lit pitch to the left, a shaded pitch to the
 * right, widening from the ridge cap to the eave) for the cosier shops and
 * the garage, and a flat parapet roof for the more institutional or
 * industrial buildings. Reusing one vocabulary of parts - roof, eave,
 * fascia, wall, window, door, kerb - is what keeps sixteen locations
 * reading as one place instead of sixteen unrelated drawings.
 *
 * Shared index characters (a building's own colour map decides what each
 * one actually renders as, so the same letter can be a ridge cap on one
 * template and a fence post on another):
 *   '.' transparent   '0' outline / linework   'e' eave or fascia shadow
 *   'h' roof, lit face   's' roof, shaded face   'w' wall base
 *   'm' wall corner shade   'k' kerb / pavement   'd' door or shutter
 *   'g' glass or a dark opening   'x' shuttered, unlit glass
 *   'n' signboard or fascia nameplate   'l' trim, pillar or lintel highlight
 *   'p' ridge cap, post or pole (context-dependent, see each building)
 */

type ColorMap = Record<string, string>

export type OverworldLocationId =
  | 'garage'
  | 'cafe'
  | 'tool-hire'
  | 'parts-shop'
  | 'local-yard'
  | 'staff-centre'
  | 'bank'
  | 'mountains-touge'
  | 'regional-auction'
  | 'highway-wangan'
  | 'premium-auction'
  | 'dealer-network'
  | 'collector-network'
  | 'international-raceway'
  | 'drag-strip'
  | 'the-stand'

/** Locations that are drawn but have no destination screen: shuttered,
 * dark-windowed, closed for now rather than a broken link. The dealer
 * network is a fax circle, not a walk-in trade - its building refuses the
 * click with its own line (`overworldNav.ts`). The stand is NOT here: its
 * shut state is a story condition rather than a permanent one (`overworldNav.ts`'s
 * own `standUnlocked` flag), so it is drawn as a working building and
 * `destinationFor` decides shut-or-open per call instead of this static list. */
export const INERT_LOCATIONS: readonly OverworldLocationId[] = ['bank', 'dealer-network']

// --- The garage: home, the hero building, roller door facing the viewer ---
const GARAGE_TEMPLATE = [
  '...........................0hhhppsss0...........................',
  '..........................0hhhhppssss0..........................',
  '.........................0hhhhvvvvssss0.........................',
  '........................0hhhhhvvvvsssss0........................',
  '.......................0hhhhhhhppsssssss0.......................',
  '......................0hhhhhhhhppssssssss0......................',
  '.....................0hhhhhhhhhppsssssssss0.....................',
  '....................0hhhhhhhhhhppssssssssss0....................',
  '...................0hhhhhhhhhhhppsssssssssss0...................',
  '..................0hhhhhhhhhhhhppssssssssssss0..................',
  '.................0hhhhhhhhhhhhhppsssssssssssss0.................',
  '................0hhhhhhhhhhhhhhppssssssssssssss0................',
  '...............0hhhhhhhhhhhhhhhppsssssssssssssss0...............',
  '..............0hhhhhhhhhhhhhhhhppssssssssssssssss0..............',
  '.............0hhhhhhhhhhhhhhhhhppsssssssssssssssss0.............',
  '............0hhhhhhhhhhhhhhhhhhppssssssssssssssssss0............',
  '...........0hhhhhhhhhhhhhhhhhhhppsssssssssssssssssss0...........',
  '..........0hhhhhhhhhhhhhhhhhhhhppssssssssssssssssssss0..........',
  '.........0hhhhhhhhhhhhhhhhhhhhhppsssssssssssssssssssss0.........',
  '........0hhhhhhhhhhhhhhhhhhhhhhppssssssssssssssssssssss0........',
  '.......0hhhhhhhhhhhhhhhhhhhhhhhppsssssssssssssssssssssss0.......',
  '......0hhhhhhhhhhhhhhhhhhhhhhhhppssssssssssssssssssssssss0......',
  '.....0hhhhhhhhhhhhhhhhhhhhhhhhhppsssssssssssssssssssssssss0.....',
  '....0hhhhhhhhhhhhhhhhhhhhhhhhhhppssssssssssssssssssssssssss0....',
  '...0hhhhhhhhhhhhhhhhhhhhhhhhhhhppsssssssssssssssssssssssssss0...',
  '..0hhhhhhhhhhhhhhhhhhhhhhhhhhhhppssssssssssssssssssssssssssss0..',
  '..0hhhhhhhhhhhhhhhhhhhhhhhhhhhhppssssssssssssssssssssssssssss0..',
  '..0hhhhhhhhhhhhhhhhhhhhhhhhhhhhppssssssssssssssssssssssssssss0..',
  '..0hhhhhhhhhhhhhhhhhhhhhhhhhhhhppssssssssssssssssssssssssssss0..',
  '..0hhhhhhhhhhhhhhhhhhhhhhhhhhhhppssssssssssssssssssssssssssss0..',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0mwwwwwwwwwwwwwwwwwwnnnnnnnnnnnnnnnnnnnnnnnnwwwwwwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww0gggggggg0wm0',
  '0mwwwwwwwwwwwwww0dddddddddddddddddddddddddddddd0www0gggggggg0wm0',
  '0mwwwwwwwwwwwwww00000000000000000000000000000000www0gggggggg0wm0',
  '0mwwwwwwwwwwwwww0dddddddddddddddddddddddddddddd0www0gggggggg0wm0',
  '0mwwwwwwwwwwwwww00000000000000000000000000000000wwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwww0dddddddddddddddddddddddddddddd0wwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwww00000000000000000000000000000000wwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwww0dddddddddddddddddddddddddddddd0wwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwww00000000000000000000000000000000wwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwww0dddddddddddddddddddddddddddddd0wwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwww00000000000000000000000000000000wwwwwwwwwwwwwwm0',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
]

const GARAGE_COLORS: ColorMap = {
  '0': OUTLINE,
  d: DOOR,
  e: EAVE,
  g: GLASS_LIT,
  h: ROOF_COSY_LIGHT,
  k: KERB,
  m: WALL_SHADE,
  n: SIGN_BOARD,
  p: EAVE,
  s: ROOF_COSY_SHADE,
  v: TRIM_LIGHT,
  w: WALL_BASE,
}

// --- Cafe: across the street, inert - shuttered windows, a closed sign ---
const CAFE_TEMPLATE = [
  '.............0hpps0.............',
  '............0hhppss0............',
  '...........0hhhppsss0...........',
  '..........0hhhhppssss0..........',
  '.........0hhhhhppsssss0.........',
  '........0hhhhhhppssssss0........',
  '.......0hhhhhhhppsssssss0.......',
  '......0hhhhhhhhppssssssss0......',
  '.....0hhhhhhhhhppsssssssss0.....',
  '....0hhhhhhhhhhppssssssssss0....',
  '...0hhhhhhhhhhhppsssssssssss0...',
  '..0hhhhhhhhhhhhppssssssssssss0..',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'annaannaannaannaannaannaannaanna',
  '0mw0xxxxx0wwwwwwwwwwww0xxxxx0wm0',
  '0mw0000000wwwwwwwwwwww0000000wm0',
  '0mw0xxxxx0ww0ddnndd0ww0xxxxx0wm0',
  '0mwwwwwwwwww0dddddd0wwwwwwwwwwm0',
  '0mwwwwwwwwww0dddddd0wwwwwwwwwwm0',
  '0mwwwwwwwwww0dddddd0wwwwwwwwwwm0',
  '0mwwwwwwwwww0dddddd0wwwwwwwwwwm0',
  '00000000000000000000000000000000',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
]

const CAFE_COLORS: ColorMap = {
  '0': OUTLINE,
  a: ACCENT_MAGENTA,
  d: WALL_SHADE,
  e: EAVE,
  h: ROOF_COSY_LIGHT,
  k: KERB,
  m: WALL_SHADE,
  n: SIGN_BOARD,
  p: EAVE,
  s: ROOF_COSY_SHADE,
  w: WALL_BASE,
  x: GLASS_DARK,
}

// --- Bank: a little out, inert - pillars, shutters, no function yet ---
const BANK_TEMPLATE = [
  '00000000000000000000000000000000',
  '00hhhhhhhhhhhhhhhhhhhhhhhhhhhh00',
  '00hhhhhhhhhhhhhhhhhhhhhhhhhhhh00',
  '00hhhhhhhhhhhhhhhhhhhhhhhhhhhh00',
  '00hhhhhhhhhhhhhhhhhhhhhhhhhhhh00',
  '00hhhhhhhhhhhhhhhhhhhhhhhhhhhh00',
  '00hhhhhhhhhhhhhhhhhhhhhhhhhhhh00',
  '00hhhhhhhhhhhhhhhhhhhhhhhhhhhh00',
  '00ssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssss00',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0mllllllllllllllllllllllllllllm0',
  '0mwlwwwwwwwwwwwwwwwwwwwwwwwwlwm0',
  '0mwl0xxxxx0wwwwwwwwww0xxxxx0lwm0',
  '0mwl0xxxxx0wwwwwwwwww0xxxxx0lwm0',
  '0mwl0xxxxx0wwwwwwwwww0xxxxx0lwm0',
  '0mwl0xxxxx00dddddddd00xxxxx0lwm0',
  '0mwlwwwwwww0dddddddd0wwwwwwwlwm0',
  '0mwlwwwwwww0dddddddd0wwwwwwwlwm0',
  '0mwlwwwwwww0dddddddd0wwwwwwwlwm0',
  '0mwlwwwwwww0dddddddd0wwwwwwwlwm0',
  '0mwlwwwwwww0dddddddd0wwwwwwwlwm0',
  '00000000000000000000000000000000',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
]

const BANK_COLORS: ColorMap = {
  '0': OUTLINE,
  d: WALL_SHADE,
  e: EAVE,
  h: ROOF_CIVIC_LIGHT,
  k: KERB,
  l: TRIM_LIGHT,
  m: WALL_SHADE,
  s: ROOF_CIVIC_SHADE,
  w: WALL_BASE,
  x: GLASS_DARK,
}

// --- Tool hire: nearby - corrugated shed, roller shutter, a tyre stack ---
const TOOL_HIRE_TEMPLATE = [
  '000000000000000000000000000000000000000000000000',
  '0hh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0',
  '0hh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0',
  '0hh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0',
  '0hh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0',
  '0hh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0',
  '0hh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0hhh0',
  '0ss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0',
  '0ss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0',
  '0ss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0',
  '0ss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0',
  '0ss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0',
  '0ss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0',
  '0ss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0sss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww0gggggg0wm0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww0gggggg0wm0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww0gggggg0wm0',
  '0mwwttttttwwwww0dddddddddddddddddddd0wwwwwwwwwm0',
  '0mwwwuuuuwwwwww0dddddddddddddddddddd0wwwwwwwwwm0',
  '0mwwttttttwwwww0dddddddddddddddddddd0wwwwwwwwwm0',
  '0mwwwuuuuwwwwww0000000000000000000000wwwwwwwwwm0',
  '0mwwttttttwwwww0dddddddddddddddddddd0wwwwwwwwwm0',
  '0mwwwuuuuwwwwww0000000000000000000000wwwwwwwwwm0',
  '0mwwwwwwwwwwwww0dddddddddddddddddddd0wwwwwwwwwm0',
  '0mwwwwwwwwwwwww0000000000000000000000wwwwwwwwwm0',
  '000000000000000000000000000000000000000000000000',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
]

const TOOL_HIRE_COLORS: ColorMap = {
  '0': OUTLINE,
  d: DOOR,
  e: EAVE,
  g: GLASS_LIT,
  h: ROOF_INDUSTRIAL_LIGHT,
  k: KERB,
  m: WALL_SHADE,
  s: ROOF_INDUSTRIAL_SHADE,
  t: TYRE,
  u: TRIM_LIGHT,
  w: WALL_BASE,
}

// --- Parts shop: nearby - a wide display window and crates by the door ---
const PARTS_SHOP_TEMPLATE = [
  '000000000000000000000000000000000000000000000000',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0mnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnm0',
  '0mwwwwwwwwwwwwwwwwwwwww0gggggggggggggggg0wwwwwm0',
  '0mwwwwwwwwwwwwwwwwwwwww0gggggggggggggggg0wwwwwm0',
  '0mwwwwwwwwwwwwwwwwwwwww0gggggggggggggggg0wwwwwm0',
  '0mwwwwwwwwwwwwwwwwwwwww0gggggggggggggggg0wwwwwm0',
  '0mwwwwwwwwwwwwwwwwwwwww0gggggggggggggggg0wwwwwm0',
  '0mwww0dddddddd0wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwww0dddddddd0wccccccwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwww0dddddddd0wc0ccccwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwww0dddddddd0wwccccwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwww0dddddddd0wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwww0dddddddd0wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '000000000000000000000000000000000000000000000000',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
]

const PARTS_SHOP_COLORS: ColorMap = {
  '0': OUTLINE,
  c: CRATE,
  d: DOOR,
  e: EAVE,
  g: GLASS_LIT,
  h: ROOF_INDUSTRIAL_LIGHT,
  k: KERB,
  m: WALL_SHADE,
  n: SIGN_BOARD,
  s: ROOF_INDUSTRIAL_SHADE,
  w: WALL_BASE,
}

// --- Local yard: a little out - fenced scrapyard, cars stacked, a lean-to ---
const LOCAL_YARD_TEMPLATE = [
  'pppppppppppppppppppppppppppppppppppppppppppppppp',
  'pf.f.f.fpf.f.f.fpf.f.f.fpf.f.f.fpf.f.f.fpf.f.f.f',
  'p.f.f.f.p.f.f.f.p.f.f.f.p.f.f.f.p.f.f.f.p.f.f.f.',
  'pf.f.f.fpf.f.f.fpf.f.f.fpf.f.f.fpf.f.f.fpf.f.f.f',
  'p.f.f.f.p.f.f.f.p.f.f.f.p.f.f.f.p.f.f.f.p.f.f.f.',
  'pppppppppppppppppppppppppppppppppppppppppppppppp',
  'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
  'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyrrrrrrrrrryy',
  'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyeeeeeeeeeeyy',
  'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyeeeeeeeeeeyy',
  'yyyyyy000000yyyyyyyyyyyyyyyy000000yypyyyyyyyypyy',
  'yyyyy01111110yyyyyyyyyyyyyy02222220ypyyyyyyyypyy',
  'yyyyy01100110yyyyyyyyyyyyyy02200220ypyyyyyyyypyy',
  'yyyyy01111110yyyyyyyyyyyyyy02222220ypyyyyyyyypyy',
  'yyyyyy000000yyyyyyyyyyyyyyyy000000yyyyyyyyyyyyyy',
  'yyyyy000000yyyyyyyyyyyyyyyy000000yyyyyyyyyyyyyyy',
  'yyyy04444440yyyyyyyyyyyyyy03333330yyyyyyyyyyyyyy',
  'yyyy04400440yyyyyyyyyyyyyy03300330yyyyyyyyyyyyyy',
  'yyyy04444440yyyyyyyyyyyyyy03333330yyyyyyyyyyyyyy',
  'yyyyy000000yyyyyyyyyyyyyyyy000000yyyyyyyyyyyyyyy',
  'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
  'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
  'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
  'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
  'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
  'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
  '000000000000000000000000000000000000000000000000',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
]

const LOCAL_YARD_COLORS: ColorMap = {
  '0': OUTLINE,
  '1': YARD_CAR_COLOURS.a,
  '2': YARD_CAR_COLOURS.b,
  '3': YARD_CAR_COLOURS.c,
  '4': YARD_CAR_COLOURS.d,
  e: EAVE,
  f: KERB,
  k: KERB,
  p: WALL_SHADE,
  r: ROOF_INDUSTRIAL_LIGHT,
  y: CRATE,
}

// --- Staff centre: a little out - the office-like small building ---
const STAFF_CENTRE_TEMPLATE = [
  '.............0hpps0.............',
  '............0hhppss0............',
  '...........0hhhppsss0...........',
  '..........0hhhhppssss0..........',
  '.........0hhhhhppsssss0.........',
  '........0hhhhhhppssssss0........',
  '.......0hhhhhhhppsssssss0.......',
  '......0hhhhhhhhppssssssss0......',
  '.....0hhhhhhhhhppsssssssss0.....',
  '....0hhhhhhhhhhppssssssssss0....',
  '...0hhhhhhhhhhhppsssssssssss0...',
  '..0hhhhhhhhhhhhppssssssssssss0..',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0mwwwwwwwwwwwnnnnnnwwwwwwwwwwwm0',
  '0mw0ggggg0wwwwwwwwwwww0ggggg0wm0',
  '0mw0ggggg0wwwwwwwwwwww0ggggg0wm0',
  '0mw0ggggg0ww0dddddd0ww0ggggg0wm0',
  '0mwwwwwwwwww0dddddd0wwwwwwwwwwm0',
  '0mwwwwwwwwww0dddddd0wwwwwwwwwwm0',
  '0mwwwwwwwwww0dddddd0wwwwwwwwwwm0',
  '0mwwwwwwwwww0dddddd0wwwwwwwwwwm0',
  '00000000000000000000000000000000',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
]

const STAFF_CENTRE_COLORS: ColorMap = {
  '0': OUTLINE,
  d: DOOR,
  e: EAVE,
  g: GLASS_LIT,
  h: ROOF_COSY_LIGHT,
  k: KERB,
  m: WALL_SHADE,
  n: SIGN_BOARD,
  p: EAVE,
  s: ROOF_COSY_SHADE,
  w: WALL_BASE,
}

// --- Mountains and the touge: far, hazy, a switchback climbing the face ---
const MOUNTAINS_TOUGE_TEMPLATE = [
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '................................................................................................',
  '........................ddddd...................................ddddd...........................',
  '.......................dddddddd........oooo....................dddddddd.........................',
  '......................dddddddddd........ooooo.................dddddddddd........................',
  '....................ddddddddddddd.........ooooo.............ddddddddddddd.......................',
  '....................dddddddddddddd..........ooooo...........dddddddddddddd......................',
  '...................dddddddddddddddd...........ooooo........dddddddddddddddd.....................',
  '..................ddddddddddddddddd.............ooooo.....ddddddddddddddddd.....................',
  '.................ddddddddddddddddddd..............ooooo..ddddddddddddddddddd....................',
  '................ddddddddddddddddddddd...............ooooodddddddddddddddddddd...................',
  '...............ddddddddddddddddddddddd................oooooddddddddddddddddddd.................d',
  '...............dddddddddddddddddddddddd................dooooddddddddddddddddddd................d',
  '..............dddddddddddddddddddddddddd.............ooooooddddddddddddddddddddd..............dd',
  '.............ddddddddddddddddddddddddddd...........ooooodddddddddddddddddddddddd.............ddd',
  'dd..........ddddddddddddddddnnnnnnnndddddd......oooooddddddddddddddddddddddddddddd......ssssssss',
  'ddd........dddddddddddddddnnnnnnnnnnnnddddd..ooooo.dddddddddddddddddddddddddddddddd...ssssssssss',
  'dddd.....dddddddddddddddnnnnnnnnnnnnnnnnddooooo..dddddddddddddddddddddddddddddddddddssssssssssss',
  'ddddddddddddddddddddddnnnnnnnnnnnnnnnnnoooooodddddddddddddddddddddddddddddddddddddssssssssssssss',
  'dddddddddddddddddddddnnnnnnnnnnnnnnnnooooonndddddddddddddddddddddddddddddddddddddsssssssssssssss',
  'dddddddddddddddddddnnnnnnnnnnnnnnnooooonnnnnnddddddddddddddddddddddddddddddddddsssssssssssssssss',
  'ddddddddddddddddddnnnnnnnnnnnnnooooonnnnnnnnnnddddddddddddddddddddddddddddddddssssssssssssssssss',
  'ddddddddddddddddnnnnnnnnnnnnnoooonnnnnnnnnnnnnnnddddddddddddddddddddddddddddssssssssssssssssssss',
  'dddddddddddddddnnnnnnnnnnnnnnnoooonnnnnnnnnnnnnnnddddddddddddddddddddddddddsssssssssssssssssssss',
  'ddddddddddddddnnnnnnnnnnnnnnnnnoooonnnnnnnnnnnnnnnndddddddddddddddddddddddssssssssssssssssssssss',
  'ddddddddddddnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnnnnnnnnddddddddddddddddddddssssssssssssssssssssssss',
  'ddddddddddnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnnnnnnnnsddddddddddddddddssssssssssssssssssssssssss',
  'ddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnnnnnnnsssddddddddddddssssssssssssssssssssssssssss',
  'ddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnnnnnsssssddddddddssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnooonnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnooooonnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnooooonnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnooooonnnnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnnnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnoooonnnnnnnnnnnnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnooooonnnnnnnnnnnnnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnooooonnnnnnnnnnnnnnnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnooooonnnnnnnnnnnnnnnnnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnoooonnnnnnnnnnnnnnnnnnnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
  'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnsssssssssssssssssssssssssssssssssssssssssss',
]

const MOUNTAINS_TOUGE_COLORS: ColorMap = {
  d: HAZE_TINT,
  n: ROOF_INDUSTRIAL_LIGHT,
  o: ROAD,
  s: ROOF_INDUSTRIAL_SHADE,
}

// --- Regional auction: far, top right - an open lot under bunting flags ---
const REGIONAL_AUCTION_TEMPLATE = [
  '000000000000000000000000000000000000000000000000',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '..1.2.1.2.1.2.1.2.1.2.1.2.1.2.1.2.1.2.1.2.1.2...',
  '0nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwwwwwww0gggggggggggggggggggggggggggg0wwwwwwwm0',
  '0mwwwwwww0gggggggggggggggggggggggggggg0wwwwwwwm0',
  '0mwwwwwww0gggggggggggggggggggggggggggg0wwwwwwwm0',
  '0mwwwwwww0gggggggggggggggggggggggggggg0wwwwwwwm0',
  '0mwwwwwww0gggggggggggggggggggggggggggg0wwwwwwwm0',
  '0mwwwwwww0gggggggggggggggggggggggggggg0wwwwwwwm0',
  '0mwwwwwww0gggggggggggggggggggggggggggg0wwwwwwwm0',
  '0mwwwwwww0gggggggggggggggggggggggggggg0wwwwwwwm0',
  '0mwwwwwww0gggggggggggggggggggggggggggg0wwwwwwwm0',
  '000000000000000000000000000000000000000000000000',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
]

const REGIONAL_AUCTION_COLORS: ColorMap = {
  '0': OUTLINE,
  '1': BUNTING_COLOURS.a,
  '2': BUNTING_COLOURS.b,
  g: GLASS_DARK,
  h: ROOF_LOT_LIGHT,
  k: KERB,
  m: WALL_SHADE,
  n: SIGN_BOARD,
  s: ROOF_LOT_SHADE,
  w: WALL_BASE,
}

// --- Premium auction: far right, smallest - grander trim, the same bunting ---
const PREMIUM_AUCTION_TEMPLATE = [
  '000000000000000000000000000000000000000000000000',
  '00hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh00',
  '00hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh00',
  '00hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh00',
  '00hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh00',
  '00hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh00',
  '00ssssssssssssssssssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssssssssssssssssssss00',
  '00ssssssssssssssssssssssssssssssssssssssssssss00',
  '..1.2.1.2.1.2.1.2.1.2.1.2.1.2.1.2.1.2.1.2.1.2...',
  '0llllllllllllllllllllllllllllllllllllllllllllll0',
  '0mwnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnwm0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwwwww0gggggggggggggggggggggggggggggggg0wwwwwm0',
  '0mwwwww0gggggggggggggggggggggggggggggggg0wwwwwm0',
  '0mwwwww0gggggggggggggggggggggggggggggggg0wwwwwm0',
  '0mwwwww0gggggggggggggggggggggggggggggggg0wwwwwm0',
  '0mwwwww0gggggggggggggggggggggggggggggggg0wwwwwm0',
  '0mwwwww0gggggggggggggggggggggggggggggggg0wwwwwm0',
  '0mwwwww0gggggggggggggggggggggggggggggggg0wwwwwm0',
  '0mwwwww0gggggggggggggggggggggggggggggggg0wwwwwm0',
  '0mwwwww0gggggggggggggggggggggggggggggggg0wwwwwm0',
  '000000000000000000000000000000000000000000000000',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
]

const PREMIUM_AUCTION_COLORS: ColorMap = {
  '0': OUTLINE,
  '1': BUNTING_COLOURS.a,
  '2': BUNTING_COLOURS.b,
  g: GLASS_DARK,
  h: ROOF_LOT_LIGHT,
  k: KERB,
  l: TRIM_LIGHT,
  m: WALL_SHADE,
  n: SIGN_BOARD,
  s: ROOF_LOT_SHADE,
  w: WALL_BASE,
}

// --- Dealer network: bottom left, the larger city - a big showroom front ---
const DEALER_NETWORK_TEMPLATE = [
  '00000000000000000000000000000000',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0ssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssss0',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0nnnnnnnnnnnnnnnnnnnnnnnnnnnnnn0',
  '0m0gggggggggggggggggggggggggg0m0',
  '0m0gggggggggggggggggggggggggg0m0',
  '0m0gggggggggggggggggggggggggg0m0',
  '0m0gggggggggggggggggggggggggg0m0',
  '0m0gggggggggggggggggggggggggg0m0',
  '0m0gggggggggggggggggggggggggg0m0',
  '0m0gggggggggggggggggggggggggg0m0',
  '0mwwwwwwwww0dddddddd0wwwwwwwwwm0',
  '0mwwwwwwwww0dddddddd0wwwwwwwwwm0',
  '0mwwwwwwwww0dddddddd0wwwwwwwwwm0',
  '0mwwwwwwwww0dddddddd0wwwwwwwwwm0',
  '0mwwwwwwwww0dddddddd0wwwwwwwwwm0',
  '0mwwwwwwwww0dddddddd0wwwwwwwwwm0',
  '00000000000000000000000000000000',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
]

const DEALER_NETWORK_COLORS: ColorMap = {
  '0': OUTLINE,
  d: DOOR,
  e: EAVE,
  g: GLASS_LIT,
  h: ROOF_CIVIC_LIGHT,
  k: KERB,
  m: WALL_SHADE,
  n: SIGN_BOARD,
  s: ROOF_CIVIC_SHADE,
  w: WALL_BASE,
}

// --- Collector network: bottom left, the larger city - a members' club ---
const COLLECTOR_NETWORK_TEMPLATE = [
  '............0hhppss0............',
  '...........0hhhppsss0...........',
  '..........0hhhhppssss0..........',
  '.........0hhhhhppsssss0.........',
  '........0hhhhhhppssssss0........',
  '.......0hhhhhhhppsssssss0.......',
  '......0hhhhhhhhppssssssss0......',
  '.....0hhhhhhhhhppsssssssss0.....',
  '....0hhhhhhhhhhppssssssssss0....',
  '...0hhhhhhhhhhhppsssssssssss0...',
  '..0hhhhhhhhhhhhppssssssssssss0..',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  '.0hhhhhhhhhhhhhppsssssssssssss0.',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0mwwwwwwwwllllllllllllwwwwwwwwm0',
  '0mwwwwggggwwwwwwwwwwwwggggwwwwm0',
  '0mww0gggggg0wwwwwwww0gggggg0wwm0',
  '0mww0gggggg00dddddd00gggggg0wwm0',
  '0mww0gggggg00dddddd00gggggg0wwm0',
  '0mwwwwwwwwww0dddddd0wwwwwwwwwwm0',
  '0mwwwwwwwwww0dddddd0wwwwwwwwwwm0',
  '0mwwwwwwwwww0dddddd0wwwwwwwwwwm0',
  '00000000000000000000000000000000',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
]

const COLLECTOR_NETWORK_COLORS: ColorMap = {
  '0': OUTLINE,
  d: DOOR,
  e: EAVE,
  g: GLASS_LIT,
  h: ROOF_COSY_LIGHT,
  k: KERB,
  l: TRIM_LIGHT,
  m: WALL_SHADE,
  p: EAVE,
  s: ROOF_COSY_SHADE,
  w: WALL_BASE,
}

// --- International raceway: bottom left, the larger city - a gate and a
// floodlight standing above the roofline ---
const INTERNATIONAL_RACEWAY_TEMPLATE = [
  '...lllll........................................',
  '.....p..........................................',
  '.....p..........................................',
  '.....p..........................................',
  '.....p..........................................',
  '000000000000000000000000000000000000000000000000',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  '0ssssssssssssssssssssssssssssssssssssssssssssss0',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0mnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnm0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwm0',
  '0mwwwwwwwwwww0gggggggggggggggggggg0wwwwwwwwwwwm0',
  '0mwwwwwwwwwww0gggggggggggggggggggg0wwwwwwwwwwwm0',
  '0mwwwwwwwwwww0gggggggggggggggggggg0wwwwwwwwwwwm0',
  '0mwwwwwwwwwww0gggggggggggggggggggg0wwwwwwwwwwwm0',
  '0mwwwwwwwwwww0gggggggggggggggggggg0wwwwwwwwwwwm0',
  '0mwwwwwwwwwww0gggggggggggggggggggg0wwwwwwwwwwwm0',
  '0mwwwwwwwwwww0gggggggggggggggggggg0wwwwwwwwwwwm0',
  '0mwwwwwwwwwww0gggggggggggggggggggg0wwwwwwwwwwwm0',
  '0mwwwwwwwwwww0gggggggggggggggggggg0wwwwwwwwwwwm0',
  '0mwwwwwwwwwww0gggggggggggggggggggg0wwwwwwwwwwwm0',
  '000000000000000000000000000000000000000000000000',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
]

const INTERNATIONAL_RACEWAY_COLORS: ColorMap = {
  '0': OUTLINE,
  e: EAVE,
  g: GLASS_DARK,
  h: ROOF_LOT_LIGHT,
  k: KERB,
  l: ACCENT_TEAL,
  m: WALL_SHADE,
  n: SIGN_BOARD,
  p: WALL_SHADE,
  s: ROOF_LOT_SHADE,
  w: WALL_BASE,
}

// --- The highway and the wangan: bottom right - a gantry sign over the
// road, mostly open beneath so the road reads through it ---
const HIGHWAY_WANGAN_TEMPLATE = [
  '..00000000000000000000000000000000000000000000..',
  '..naaaannnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnaaaan..',
  '..naaaannnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnaaaan..',
  '..naaaannnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnaaaan..',
  '..naaaannnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnaaaan..',
  '..00000000000000000000000000000000000000000000..',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
  '....ppp..................................ppp....',
]

const HIGHWAY_WANGAN_COLORS: ColorMap = {
  '0': OUTLINE,
  a: SIGN_BOARD,
  n: TRIM_LIGHT,
  p: WALL_SHADE,
}

// --- Drag strip: bottom left, on the outskirts of the big city - a straight
// tarmac lane with a chequered start line near one end and a timing gantry
// planted at the other. A standing kilometre reads as the strip itself, not
// as a building, so this template carries no roof at all. ---
const DRAG_STRIP_TEMPLATE = [
  '................................................................................0000000000000000',
  '................................................................................0nnnnnnnnnnnnnn0',
  '................................................................................0ngnnnnnnnnnngn0',
  '..................................................................................p..........p..',
  '..................................................................................p..........p..',
  '..................................................................................p..........p..',
  '..................................................................................p..........p..',
  '..................................................................................p..........p..',
  '..................................................................................p..........p..',
  '..................................................................................p..........p..',
  'kkkkkk0lkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk..p..........p..',
  'rrrrrrl0rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr..p..........p..',
  'rrrrrr0lrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr..p..........p..',
  'rrrrrrl0rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr..p..........p..',
  'rrrrrr0lrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr..p..........p..',
  'rrrrrrl0rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr..p..........p..',
  'rrrrrr0lrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr..p..........p..',
  'rrrrrrl0rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr..p..........p..',
  'rrrrrr0lrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr..p..........p..',
  'rrrrrrl0rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr..p..........p..',
  'rrrrrr0lrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr..p..........p..',
  'kkkkkkl0kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk..p..........p..',
  '..................................................................................p..........p..',
  '..................................................................................p..........p..',
  '..................................................................................p..........p..',
  '..................................................................................p..........p..',
  '..................................................................................p..........p..',
  '..................................................................................p..........p..',
  '.................................................................................000........000.',
  '................................................................................................',
]

const DRAG_STRIP_COLORS: ColorMap = {
  '0': OUTLINE,
  g: GLASS_LIT,
  k: KERB,
  l: TRIM_LIGHT,
  n: SIGN_BOARD,
  p: WALL_SHADE,
  r: ROAD,
}

/**
 * The stand: a sixteenth location added for sprint205.md, wired with no new
 * art. The art bible bans AI-generated art from ever shipping, and this
 * building has no hand-drawn template of its own yet, so it borrows the
 * staff centre's small gable template and colour map wholesale as an
 * explicit placeholder - a real newsstand template is still to be drawn by
 * hand. See `BUILDING_ART` below, which points `the-stand` at
 * `STAFF_CENTRE_TEMPLATE`/`STAFF_CENTRE_COLORS` rather than declaring a
 * template of its own.
 */

/** Canvas size derived from the template itself, so it can never drift from
 * the art. */
function sizeOf(template: readonly string[]): { width: number; height: number } {
  return { width: Math.max(...template.map((row) => row.length)), height: template.length }
}

/** Rasterise an indexed template through a colour map; unmapped characters
 * stay transparent. Identical technique to `carSprite.ts`'s `renderLayer`,
 * kept as its own copy here rather than imported so the overworld pipeline
 * has no dependency on the car-sprite module while the two are developed
 * separately - they are expected to converge later. */
function renderLayer(template: readonly string[], colors: ColorMap, scale = 1): Texture {
  const { width, height } = sizeOf(template)
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d canvas context')
  template.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x] ?? '.']
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  })
  const texture = Texture.from(canvas)
  texture.source.scaleMode = 'nearest'
  return texture
}

interface BuildingArt {
  template: readonly string[]
  colors: ColorMap
}

const BUILDING_ART: Record<OverworldLocationId, BuildingArt> = {
  garage: { template: GARAGE_TEMPLATE, colors: GARAGE_COLORS },
  cafe: { template: CAFE_TEMPLATE, colors: CAFE_COLORS },
  'tool-hire': { template: TOOL_HIRE_TEMPLATE, colors: TOOL_HIRE_COLORS },
  'parts-shop': { template: PARTS_SHOP_TEMPLATE, colors: PARTS_SHOP_COLORS },
  'local-yard': { template: LOCAL_YARD_TEMPLATE, colors: LOCAL_YARD_COLORS },
  'staff-centre': { template: STAFF_CENTRE_TEMPLATE, colors: STAFF_CENTRE_COLORS },
  bank: { template: BANK_TEMPLATE, colors: BANK_COLORS },
  'mountains-touge': { template: MOUNTAINS_TOUGE_TEMPLATE, colors: MOUNTAINS_TOUGE_COLORS },
  'regional-auction': { template: REGIONAL_AUCTION_TEMPLATE, colors: REGIONAL_AUCTION_COLORS },
  'highway-wangan': { template: HIGHWAY_WANGAN_TEMPLATE, colors: HIGHWAY_WANGAN_COLORS },
  'premium-auction': { template: PREMIUM_AUCTION_TEMPLATE, colors: PREMIUM_AUCTION_COLORS },
  'dealer-network': { template: DEALER_NETWORK_TEMPLATE, colors: DEALER_NETWORK_COLORS },
  'collector-network': { template: COLLECTOR_NETWORK_TEMPLATE, colors: COLLECTOR_NETWORK_COLORS },
  'international-raceway': {
    template: INTERNATIONAL_RACEWAY_TEMPLATE,
    colors: INTERNATIONAL_RACEWAY_COLORS,
  },
  'drag-strip': { template: DRAG_STRIP_TEMPLATE, colors: DRAG_STRIP_COLORS },
  // Placeholder art, see the comment above `DRAG_STRIP_COLORS` - reuses the
  // staff centre's template and colour map rather than a template of its own.
  'the-stand': { template: STAFF_CENTRE_TEMPLATE, colors: STAFF_CENTRE_COLORS },
}

/** All sixteen location ids, in the order they appear in the design table. */
export const OVERWORLD_LOCATION_IDS: readonly OverworldLocationId[] = [
  'garage',
  'cafe',
  'tool-hire',
  'parts-shop',
  'local-yard',
  'staff-centre',
  'bank',
  'mountains-touge',
  'regional-auction',
  'highway-wangan',
  'premium-auction',
  'dealer-network',
  'collector-network',
  'international-raceway',
  'drag-strip',
  'the-stand',
]

/** The name shown when a location is hovered - what a player standing in
 * front of it would call it, not the internal id. */
export const OVERWORLD_LOCATION_LABELS: Readonly<Record<OverworldLocationId, string>> = {
  garage: 'Garage',
  cafe: 'Cafe',
  'tool-hire': 'Tool hire',
  'parts-shop': 'Parts shop',
  'local-yard': 'Local yard',
  'staff-centre': 'Staff centre',
  bank: 'Bank',
  'mountains-touge': 'The touge',
  'regional-auction': 'Regional auction',
  'highway-wangan': 'The wangan',
  'premium-auction': 'Premium auction',
  'dealer-network': 'Dealer network',
  'collector-network': 'Collector network',
  'international-raceway': 'International raceway',
  'drag-strip': 'Drag strip',
  'the-stand': 'The stand',
}

/** A location's canvas size in scene pixels, before any integer zoom the
 * consuming screen applies to the whole map. */
export function overworldLocationSize(id: OverworldLocationId): { width: number; height: number } {
  return sizeOf(BUILDING_ART[id].template)
}

/** Renders one location's sprite at 1x: one template pixel per scene pixel. */
export function buildLocationSprite(id: OverworldLocationId): Sprite {
  const art = BUILDING_ART[id]
  return new Sprite(renderLayer(art.template, art.colors))
}
