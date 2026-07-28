import { z } from 'zod'
import type { CarTier } from './tags'

/**
 * Fitment classes ARE the four roster tiers a car carries - zero mapping cost,
 * and a car's declared class is never ambiguous. The catalogue ships exactly
 * four classes; a fifth would mean re-authoring every SKU.
 */
export const PartFitmentClassSchema = z.enum(['entry', 'everyday', 'enthusiast', 'flagship'])

export type PartFitmentClass = z.infer<typeof PartFitmentClassSchema>

/**
 * Diegetic, player-facing names for the four fitment classes. A SKU's own
 * `name`/`brand` never bake the class in - the UI prefixes this label at
 * render time so renaming a class is a one-line edit here, never a mass
 * content rewrite.
 */
export const PART_FITMENT_CLASS_DISPLAY_NAMES: Record<PartFitmentClass, string> = {
  entry: 'Kei & Compact',
  everyday: 'Family',
  enthusiast: 'Sports',
  flagship: 'Grand Touring',
}

export function partFitmentClassLabel(fitmentClass: PartFitmentClass): string {
  return PART_FITMENT_CLASS_DISPLAY_NAMES[fitmentClass]
}

/**
 * A car's parts-fitment class, derived from its roster `tier` - the one
 * mapping every sim/game call site threads a `CarModel` through rather than
 * reading `tier` as a class directly. The two value sets are identical today,
 * so this is a relabel; it stays the single seam for the day the roster grows
 * enough that a tier and a parts basket stop being the same question.
 */
export function fitmentClassForTier(tier: CarTier): PartFitmentClass {
  return tier
}
