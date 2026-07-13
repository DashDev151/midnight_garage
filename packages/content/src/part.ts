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
 *
 * Sprint 35 decision 1: `customerJobId`, when present, marks this instance as
 * belonging to that active service job's customer - a part pulled off their
 * car (`resolveRemovePart`), tracked in our inventory but never ours to sell
 * or scrap, and reconciled out at close-out (`resolveServiceJob`). Absent
 * (the default and the state of every existing part) means player-owned.
 * Chosen over a bare boolean so close-out can reconcile the specific job's
 * parts.
 */
export const PartInstanceSchema = z.object({
  id: z.string().min(1),
  partId: z.string().min(1),
  band: ConditionBandSchema.default('mint'),
  genuinePeriod: z.boolean().default(false),
  customerJobId: z.string().min(1).optional(),
  /**
   * Sprint 42 (the flip ledger): what this specific instance actually cost -
   * set at purchase (`resolveBuyPart`, express at charge time / standard at
   * its locked order price on delivery), incremented by a bench-recondition
   * charge (a reconditioned loose part "cost" its buy price plus the work).
   * Absent means unknown (every pre-Sprint-42 instance, and any part that
   * entered inventory some other way, e.g. pulled off a car) - the financial
   * panel treats a missing value as 0 spent on that part, never a crash.
   */
  pricePaidYen: z.number().int().nonnegative().optional(),
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
