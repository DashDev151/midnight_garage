import { z } from 'zod'
import type { RarityTier } from './tags'

/**
 * Fitment classes ARE the four roster tiers a car already carries - zero
 * mapping cost, and a car's declared class is never ambiguous. `gaisha`/
 * `legend` fold into `rare` via `fitmentClassForTier` below until the roster
 * grows and earns a real mapping of its own.
 */
export const PartFitmentClassSchema = z.enum(['shitbox', 'common', 'uncommon', 'rare'])

export type PartFitmentClass = z.infer<typeof PartFitmentClassSchema>

/**
 * Diegetic, player-facing names for the four fitment classes. A SKU's own
 * `name`/`brand` never bake the class in - the UI prefixes this label at
 * render time so renaming a class is a one-line edit here, never a mass
 * content rewrite.
 */
export const PART_FITMENT_CLASS_DISPLAY_NAMES: Record<PartFitmentClass, string> = {
  shitbox: 'Kei & Compact',
  common: 'Family',
  uncommon: 'Sports',
  rare: 'Grand Touring',
}

export function partFitmentClassLabel(fitmentClass: PartFitmentClass): string {
  return PART_FITMENT_CLASS_DISPLAY_NAMES[fitmentClass]
}

/**
 * A car's parts-fitment class, derived from its roster `tier` - the one
 * mapping every sim/game call site threads a `CarModel` through rather than
 * re-deriving locally. `gaisha`/`legend` fold into `rare` (see this file's
 * top doc comment); every other tier maps to the identically-named class.
 */
export function fitmentClassForTier(tier: RarityTier): PartFitmentClass {
  if (tier === 'shitbox' || tier === 'common' || tier === 'uncommon' || tier === 'rare') {
    return tier
  }
  return 'rare'
}
