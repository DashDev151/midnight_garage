import {
  ACCENT_TEAL,
  CRATE,
  DOOR,
  EAVE,
  GLASS_DARK,
  GLASS_LIT,
  HAZE_TINT,
  KERB,
  OUTLINE,
  ROAD,
  SIGN_BOARD,
  TRIM_LIGHT,
  TYRE,
  WALL_BASE,
  WALL_SHADE,
  YARD_CAR_COLOURS,
} from '../overworld/overworldPalette'

/**
 * The garage interior's own colours, laid over the overworld's palette
 * rather than beside it. Where a room and the street share a material -
 * concrete, timber, dust, a dark pane of glass - the overworld's own
 * constant is imported and used directly below, so the two scenes never
 * carry two hexes for one thing. Only genuinely interior materials get a
 * new constant: painted breeze block, worked steel, corrosion, and the cool
 * fluorescent tube that marks a room as lived-in versus a bare bulb.
 *
 * Re-exported here (rather than requiring every consumer to import from
 * both files) so `fixtures.ts` and `rooms.ts` have one place to pull
 * interior colours from.
 */
export {
  ACCENT_TEAL,
  CRATE,
  DOOR,
  EAVE,
  GLASS_DARK,
  GLASS_LIT,
  HAZE_TINT,
  KERB,
  OUTLINE,
  ROAD,
  SIGN_BOARD,
  TRIM_LIGHT,
  TYRE,
  WALL_BASE,
  WALL_SHADE,
  YARD_CAR_COLOURS,
}

// Concrete: the floor throughout the building. KERB is the overworld's
// pavement grey and reads exactly as a worn concrete slab at this scale;
// WALL_SHADE doubles as the floor's darker grout lines and oil stains.
export const FLOOR_BASE = KERB
export const FLOOR_SHADE = WALL_SHADE

// Painted block: the interior wall colour, a workshop's own material with
// no exterior equivalent - the street-facing cladding the overworld draws
// is a different substance from the painted block inside.
export const WALL_PAINT_LIGHT = '#6d8a80'
export const WALL_PAINT_SHADE = '#465a53'

// Steel: benches, racking, machine tool bodies. Two tones, lit and shaded,
// the same convention the overworld uses for a roof's two pitches.
export const STEEL_LIGHT = '#8b93a0'
export const STEEL_SHADE = '#565d68'

// Corrosion: what steel becomes once a room goes unopened for years. Used
// only in the three derelict variants (a dead lathe, a rusted upright, a
// rotten crate) - never in an open room.
export const RUST = '#8a5236'

// Strip light: the fluorescent tube overhead in a working room, cool and
// flat where the overworld's GLASS_LIT is warm sodium. A derelict room
// carries no strip light at all - it keeps GLASS_LIT for its one bare
// bulb, so the warm/cool split itself signals open versus derelict before
// a player reads a single fixture.
export const STRIP_LIGHT = '#dff2f5'

/**
 * Timber (CRATE, DOOR), dust (WALL_BASE, WALL_SHADE), dark glass
 * (GLASS_DARK) and paper/chrome highlight (TRIM_LIGHT) all reuse the
 * overworld constants re-exported above rather than gaining interior
 * names of their own - see each fixture's comment in `fixtures.ts` for
 * which role a given reuse is standing in for.
 */
