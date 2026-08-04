/**
 * The overworld's own colours: terrain and structure tones that sit outside
 * `@midnight-garage/content`'s `PAINT_COLOURS` (car paint is a separate,
 * swappable system - buildings and roads are not). Grouped by the art
 * bible's three-tier system (base concrete, sodium light, magenta/teal
 * accent) so the scene stays within its area budget: base carries most of
 * the ground, light is the one glow source, accent appears twice.
 *
 * Several names are reused for more than one role below. That is
 * deliberate: two materials that read as the same flat tone at this scale
 * (chain-link wire and a concrete kerb, a wood crate and packed dirt) share
 * a hex rather than spending a palette slot on a difference nobody sees.
 */

// Base tier: concrete and tarmac, warm-shifted per the art bible so the
// scene never reads blue-dead. Dominant across the canvas.
export const OUTLINE = '#241d1a'
export const EAVE = '#3d322a'
export const KERB = '#8f887c'
export const WALL_BASE = '#c7bca8'
export const WALL_SHADE = '#8a8071'
export const ROAD = '#3a352e'
export const GRASS_BASE = '#3f5c3a'
export const GRASS_SHADE = '#2b4026'

// Light tier: the sodium glow. Windows, signage and the one warm accent
// that is meant to catch the eye on an otherwise desaturated street.
export const SIGN_BOARD = '#c68f42'
export const GLASS_LIT = '#ffce6e'
export const TRIM_LIGHT = '#e6dcc6'

// Fixed material tones that are neither base, light nor accent: a door is a
// door regardless of what streetlight falls on it.
export const DOOR = '#5c4531'
export const GLASS_DARK = '#333c46'
export const CRATE = '#a8794c'
export const TYRE = '#221f1f'

// The four roof zones. Each groups a handful of locations into a
// neighbourhood: cosy pitched roofs for the shops immediately around the
// garage, cool slate for the two civic buildings, teal-grey corrugation for
// the industrial cluster, sandy canopies for the open-air auction lots. Four
// zones instead of fifteen one-off roofs is what keeps the roll-up palette
// tight while still giving the map districts that read apart.
export const ROOF_COSY_LIGHT = '#c96a44'
export const ROOF_COSY_SHADE = '#8a4128'
export const ROOF_CIVIC_LIGHT = '#7c8792'
export const ROOF_CIVIC_SHADE = '#525c66'
export const ROOF_INDUSTRIAL_LIGHT = '#5f7d76'
export const ROOF_INDUSTRIAL_SHADE = '#3d534d'
export const ROOF_LOT_LIGHT = '#b6a473'
export const ROOF_LOT_SHADE = '#7c6d48'

// Distance haze: the far corners of the tourist map sit behind this tint
// (the mountains' own far ridge included), so compression reads as
// atmosphere rather than as a smaller drawing.
export const HAZE_TINT = '#9fb0c2'

// Accent tier: magenta and teal, small and emissive only, per the art
// bible's rule of glow. One appears on the cafe's awning, the other on the
// raceway's floodlight - two saturated accents on the whole map, not a
// glow on every building.
export const ACCENT_MAGENTA = '#ea4f9c'
export const ACCENT_TEAL = '#2fd0c4'

// The hover cue: a flat, hard-edged blue with no equivalent among the
// buildings' own colours, so it never reads as part of the scene itself -
// purely an interaction mark the screen draws on top, not part of the
// environment palette the rest of this file counts toward.
export const HOVER_OUTLINE = '#4fb3ff'

/**
 * Real paint colours, used where a real colour fits rather than inventing a
 * parallel one: the local yard's stacked wrecks, the auction lots' bunting,
 * and the bay water the wangan runs along. Picking from the same
 * `PAINT_COLOURS` list the cars themselves use is what makes the yard read
 * as full of real cars rather than generic scrap-coloured blocks.
 */
export const YARD_CAR_COLOURS = {
  a: '#c8202a', // PAINT_COLOURS 'red', Bright Red
  b: '#131f3c', // PAINT_COLOURS 'blue-navy', Navy
  c: '#9a9894', // PAINT_COLOURS 'grey-mid', Ash Grey
  d: '#ddc373', // PAINT_COLOURS 'yellow-soft', Soft Yellow
} as const

export const BUNTING_COLOURS = {
  a: '#c8202a', // PAINT_COLOURS 'red', Bright Red
  b: '#2e6fc4', // PAINT_COLOURS 'blue-rally', Mid Blue
} as const

export const WATER = '#1c3f8f' // PAINT_COLOURS 'blue-deep', Deep Blue
