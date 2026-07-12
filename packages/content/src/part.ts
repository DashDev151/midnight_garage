import { z } from 'zod'
import { CarPartIdSchema, ConditionBandSchema, GradeSchema, TagSchema } from './tags'
import { StatModifierSchema } from './stats'

/**
 * Parts are parody-branded from day one (GDD 2.4) - no real/parody split.
 * `carPartId` is a catalog part's address (Sprint 26 - replaces the old
 * 8-way `componentId`; a part's group is derived by looking its
 * `carPartId` up in `parts-taxonomy.json`, not stored redundantly here).
 */
export const PartSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  brand: z.string().min(1),
  name: z.string().min(1),
  carPartId: CarPartIdSchema,
  grade: GradeSchema,
  requiredTags: z.array(TagSchema).default([]),
  statModifiers: StatModifierSchema,
  priceYen: z.number().int().nonnegative(),
})

export const PartsSchema = z.array(PartSchema).min(1)

/**
 * An owned/installed part. Band and genuine-period status are per-instance
 * (GDD 5.3: a used genuine part differs from a new reproduction of the same
 * catalog part), so they live here, not on Part. Sprint 26: `band` replaces
 * the old `conditionPercent` - a purchased part always starts `mint`
 * (matching the old `conditionPercent: 100` default).
 */
export const PartInstanceSchema = z.object({
  id: z.string().min(1),
  partId: z.string().min(1),
  band: ConditionBandSchema.default('mint'),
  genuinePeriod: z.boolean().default(false),
})

export type Part = z.infer<typeof PartSchema>
export type PartInstance = z.infer<typeof PartInstanceSchema>

/**
 * A standard-delivery part purchase in transit (Sprint 14): cash is deducted
 * and the price locked in the moment it's ordered, but the part doesn't land
 * in `partInventory` as a real `PartInstance` until `arrivesOnDay` - the same
 * "commit now, resolves automatically on a future day" shape every other
 * day-boundary resolution in this codebase uses.
 */
export const PendingPartOrderSchema = z.object({
  id: z.string().min(1),
  partId: z.string().min(1),
  priceYen: z.number().int().nonnegative(),
  purchasedOnDay: z.number().int().positive(),
  arrivesOnDay: z.number().int().positive(),
})

export const PendingPartOrdersSchema = z.array(PendingPartOrderSchema)

export type PendingPartOrder = z.infer<typeof PendingPartOrderSchema>
