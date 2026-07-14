import { z } from 'zod'
import type { RarityTier } from './tags'

/**
 * Sprint 53 decision 2 (economy-bible.md law 3): fitment classes ARE the
 * four roster tiers a car already carries - zero mapping cost, and a car's
 * declared class is never ambiguous. `gaisha`/`legend` (not yet used in the
 * shipped roster) fold into `rare` via `fitmentClassForTier` below until the
 * roster grows past PoC scope and earns a real mapping of its own.
 */
export const PartFitmentClassSchema = z.enum(['shitbox', 'common', 'uncommon', 'rare'])

export type PartFitmentClass = z.infer<typeof PartFitmentClassSchema>

/**
 * Diegetic, player-facing names for the four fitment classes (economy-bible.md:
 * "the code identifier never reaches player copy directly," mirroring the
 * Sprint 25 component-display-name law). A SKU's own `name`/`brand` never bake
 * the class in - the UI prefixes this label at render time so renaming a
 * class is a one-line edit here, never a mass content rewrite.
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
