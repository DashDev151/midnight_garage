import { z } from 'zod'
import { ComponentIdSchema, ReputationTierSchema } from './tags'

/**
 * One piece of repair equipment (Sprint 13, `docs/design/repair-replace-progression.md`). Owning it
 * is what unlocks REPAIR for the group(s) it covers - REPLACE (buying + installing a part) never
 * needs equipment, at any price. `componentIds` covers the 6 real groups (Sprint 26 - `forcedInduction`
 * folded into `engine`, `brakes` folded into `suspension`); `engine-crane` is the one entry that ever
 * covered more than one group pre-Sprint-26, and still could again if a future item needs to.
 */
export const EquipmentSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  displayName: z.string().min(1),
  componentIds: z.array(ComponentIdSchema).min(1),
  priceYen: z.number().int().positive(),
  /** Flat cash cost charged once per new repair-zone job on a covered component (decision 3). */
  consumablesCostYen: z.number().int().nonnegative(),
  /**
   * Sprint 26 decision 7: grades climbed per labor slot on a covered group -
   * exactly 1, 2, or 3, no open-ended multiplier. Base hand tools (owning
   * nothing beyond the starting kit) default to level 1 in the sim, not
   * here; every entry in this catalog is itself an upgrade over that floor.
   */
  repairLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Explicit tier gate on the priciest items (decision 7) - no gate if unset, no default fallback. */
  minReputationTier: ReputationTierSchema.optional(),
})

export const EquipmentsSchema = z.array(EquipmentSchema).min(1)

export type Equipment = z.infer<typeof EquipmentSchema>
