import { z } from 'zod'
import { ComponentIdSchema, ReputationTierSchema } from './tags'

/**
 * One piece of repair equipment (Sprint 13, `docs/design/repair-replace-progression.md`). Owning it
 * is what unlocks REPAIR for the component(s) it covers - REPLACE (buying + installing a part) never
 * needs equipment, at any price. `componentIds` is more than one only for `engine-crane`, which also
 * covers `forcedInduction` (a turbo/rotary is "engine, shared" per the design doc's own component
 * mapping) - everything else covers exactly one component.
 */
export const EquipmentSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  displayName: z.string().min(1),
  componentIds: z.array(ComponentIdSchema).min(1),
  priceYen: z.number().int().positive(),
  /** Flat cash cost charged once per new repair-zone job on a covered component (decision 3). */
  consumablesCostYen: z.number().int().nonnegative(),
  /** Explicit tier gate on the priciest items (decision 7) - no gate if unset, no default fallback. */
  minReputationTier: ReputationTierSchema.optional(),
})

export const EquipmentsSchema = z.array(EquipmentSchema).min(1)

export type Equipment = z.infer<typeof EquipmentSchema>
