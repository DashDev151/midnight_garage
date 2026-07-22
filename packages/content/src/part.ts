import { z } from 'zod'
import { CarPartIdSchema, ConditionBandSchema, GradeSchema, TagSchema } from './tags'
import { PartFitmentClassSchema } from './partFitment'
import { StatModifierSchema } from './stats'
import { resolvePartPriceYen, type PartPricingSheet } from './partPricing'

/**
 * Parts are parody-branded from day one - no real/parody split. `carPartId`
 * is a catalog part's address; a part's group is derived by looking its
 * `carPartId` up in `parts-taxonomy.json`, not stored redundantly here.
 * This is the raw, hand-authored catalog shape - identity only, no `priceYen`.
 * `fitmentClass` is the one new field: every component slot ships 16 real
 * SKUs (4 fitment classes x 4 grades), a SKU's `id`/`brand`/`name`/`grade`
 * identical across classes (the class label is a UI-time prefix, never baked
 * into the string). Price is derived, not authored - see `PartSchema`/
 * `resolvePartsCatalog` below.
 */
export const PartCatalogEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  brand: z.string().min(1),
  name: z.string().min(1),
  carPartId: CarPartIdSchema,
  fitmentClass: PartFitmentClassSchema,
  grade: GradeSchema,
  requiredTags: z.array(TagSchema).default([]),
  statModifiers: StatModifierSchema,
})

export const PartCatalogEntriesSchema = z.array(PartCatalogEntrySchema).min(1)

export type PartCatalogEntry = z.infer<typeof PartCatalogEntrySchema>

/**
 * The resolved catalog shape sim/game consume - identical in shape and type
 * name so every downstream reader is unchanged; only where the price number
 * comes from is different now (content-load-time derivation via
 * `resolvePartsCatalog`, not a hand-typed JSON field).
 */
export const PartSchema = PartCatalogEntrySchema.extend({
  priceYen: z.number().int().nonnegative(),
})

export const PartsSchema = z.array(PartSchema).min(1)

/**
 * The one content-load-time derivation point - every SKU's price comes from
 * `resolvePartPriceYen` (partPricing.ts) against the pricing sheet, never a
 * hand-authored number. Called once by `data.ts`; nothing downstream (sim,
 * game, tests) ever calls this itself.
 */
export function resolvePartsCatalog(
  entries: readonly PartCatalogEntry[],
  sheet: PartPricingSheet,
): Part[] {
  return entries.map((entry) => ({ ...entry, priceYen: resolvePartPriceYen(entry, sheet) }))
}

/**
 * Where a `PartInstance` came from, stamped at birth and never rewritten.
 * `car` means it was pulled from (or generated already installed on) a
 * specific `CarInstance` - `carLabel` is denormalised (not looked up live)
 * so it still reads correctly after the donor car is sold or scrapped. `market`
 * means the player bought it. This is the one fact every ownership question in
 * the codebase now routes through (`packages/sim/src/provenance.ts`).
 */
export const PartOriginSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('car'),
    carInstanceId: z.string().min(1),
    carLabel: z.string().min(1),
    day: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('market'),
    day: z.number().int().nonnegative(),
  }),
])

export type PartOrigin = z.infer<typeof PartOriginSchema>

/**
 * An owned/installed part. Band and genuine-period status are per-instance
 * (a used genuine part differs from a new reproduction of the same catalog
 * part), so they live here, not on Part. A purchased part always starts `mint`.
 * `origin` is required and immutable - every birth site stamps it
 * (`provenance.ts`'s `makeCarOrigin`/`makeMarketOrigin`), and no code path may
 * rewrite it once set.
 */
export const PartInstanceSchema = z.object({
  id: z.string().min(1),
  partId: z.string().min(1),
  band: ConditionBandSchema.default('mint'),
  genuinePeriod: z.boolean().default(false),
  origin: PartOriginSchema,
  /**
   * What this specific instance actually cost - set at purchase
   * (`resolveBuyPart`, express at charge time / standard at its locked order
   * price on delivery), incremented by a bench-recondition charge. Absent
   * means unknown - the financial panel treats a missing value as 0 spent on
   * that part, never a crash.
   */
  pricePaidYen: z.number().int().nonnegative().optional(),
})

export type Part = z.infer<typeof PartSchema>
export type PartInstance = z.infer<typeof PartInstanceSchema>

/**
 * A standard-delivery part purchase in transit: cash is deducted and the
 * price locked in the moment it's ordered, but the part doesn't land in
 * `partInventory` as a real `PartInstance` until `arrivesOnDay` - the same
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
