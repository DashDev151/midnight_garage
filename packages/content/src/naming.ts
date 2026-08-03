import type { CarModel } from './carModel'
import type { PaintAlias } from './paintAlias'

/**
 * Naming Layer (GDD 2.4, roadmap risk R5). `spec` fields on a CarModel are
 * real, unprotectable facts; displayName/brand vs parodyName/parodyBrand
 * are the only fields this flip touches. One constant, one redeploy - see
 * the leak test in tests/naming.test.ts for the CI guarantee.
 */
export type NamingMode = 'real' | 'parody'

export const NAMING_MODE: NamingMode = 'real'

export function resolveCarDisplayName(model: CarModel, mode: NamingMode = NAMING_MODE): string {
  return mode === 'parody' ? model.parodyName : model.displayName
}

export function resolveCarBrand(model: CarModel, mode: NamingMode = NAMING_MODE): string {
  return mode === 'parody' ? model.parodyBrand : model.brand
}

/**
 * An iconic colour alias's flip, exactly as `resolveCarDisplayName` flips a
 * car's name: parody mode shows the invented name, real mode shows the
 * manufacturer's own name (paint code and all).
 */
export function resolvePaintColourName(alias: PaintAlias, mode: NamingMode = NAMING_MODE): string {
  return mode === 'parody' ? alias.parodyName : alias.realName
}

/**
 * Real manufacturer and model-name substrings that must never survive a
 * parody-mode resolution. Deliberately case-insensitive substring
 * matching in the leak test - over-flagging is safe, a miss is not.
 */
export const REAL_BRANDS = ['Honda', 'Toyota', 'Nissan', 'Mazda', 'Suzuki', 'Subaru'] as const

/**
 * Also guards the headline registered sub-marks a parody name must never
 * carry (WRX, GT-R, VTEC, MR2): the parody strings drop them (VRX, GT-N,
 * Si-V, MR-II) and this list makes the leak test enforce that. `STI` is
 * deliberately NOT listed: this is a case-insensitive substring guard, and
 * `sti` occurs inside ordinary English already present in the guarded copy
 * surface (`still`, `sticks`), so a bare `STI` token would false-fail
 * legitimate strings. `WRX` covers the only place STI could realistically
 * leak - the Impreza's full `WRX STI` badge - which the parody already omits.
 */
export const REAL_MODEL_TOKENS = [
  'City',
  'Wagon R',
  'Civic',
  'Sprinter Trueno',
  '180SX',
  'Chaser',
  'Silvia',
  'Savanna',
  'RX-7',
  'Supra',
  'WRX',
  'GT-R',
  'VTEC',
  'MR2',
] as const

/**
 * The distinctive multi-word marks from `paintAliases.json`'s `realName`
 * column that a parody-mode resolution must never leak, guarded the same
 * case-insensitive-substring way as `REAL_MODEL_TOKENS`. `Midnight Purple`
 * and `Grand Prix` each cover more than one alias (the Roman-numeral Midnight
 * Purple II/III variants, the Maroon/White/Red Grand Prix variants) - no
 * separate entry is needed since the longer real name already contains the
 * shorter token as a substring.
 *
 * Single common colour words (Red, White, Blue, Black, Silver, and so on)
 * are excluded outright, for the same reason `REAL_MODEL_TOKENS` excludes
 * `STI`: they occur inside ordinary copy constantly on their own, so a bare
 * token would false-fail legitimate strings.
 *
 * Four aliases have no token here at all, for the same reason: each pairs a
 * word this game's own copy already uses constantly with an everyday colour
 * word, in the adjective-colour order ordinary English actually uses, so the
 * exact phrase is plausible coincidence rather than a leak.
 * - Vintage Red: "vintage" describes classic JDM cars throughout this game's
 *   copy; "a vintage red example" reads as ordinary prose about a car's age.
 * - Alpine White (II): "alpine" is the natural word for this game's
 *   mountain-pass touge settings; "alpine white peaks" is ordinary scenery.
 * - Brilliant Blue (TPM): "brilliant" is an everyday superlative for a fresh
 *   paint job; "buffed to a brilliant blue shine" is ordinary shop-floor copy.
 * - Strong Blue Metallic: "strong" is an everyday intensifier for a colour;
 *   "a strong blue" is ordinary colour description, not a leak.
 */
export const REAL_COLOUR_NAMES = [
  'Bayside Blue',
  'Midnight Purple',
  'Gun Grey',
  'Championship White',
  'Blauschwarz',
  'Grand Prix',
  'Rosso Corsa',
  'Giallo Modena',
  'Tornado Red',
  'WR Blue',
  'Sonic Blue',
  'Titanium Grey',
  'Montego Blue',
  'Guards Red',
  'Macao Blue',
  'Safari Gold',
  'New Sight Orange',
  'Cashmere Yellow',
  'Lightning Yellow',
  'Super Bright Yellow',
  'Sunlight Yellow',
  'Competition Yellow',
  'Milano Red',
  'New Formula Red',
  'Passion Red',
  'Carnival Yellow',
  'Skyline Brown',
  'Whitest White',
  'High-Tech Two-Tone',
] as const
