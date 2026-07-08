import { z } from 'zod'

export const SaleChannelSchema = z.enum(['list-publicly', 'walk-in-offer'])

/**
 * Only the list-publicly channel needs persisted state — walk-in offers
 * resolve the same day they're taken (GDD 6.3: "fast, variable"), while
 * a public listing takes days to sell ("slow, market price"). The known-
 * buyer-contact channel is deferred (Sprint 03 decision 6): it needs the
 * events system to create contacts in the first place.
 */
export const PublicListingSchema = z.object({
  id: z.string().min(1),
  carInstanceId: z.string().min(1),
  /** Snapshot of the market valuation at listing time — market heat can
   * drift while the listing is pending, but the asking price doesn't. */
  askingPriceYen: z.number().int().positive(),
  resolvesOnDay: z.number().int().positive(),
})

export const PublicListingsSchema = z.array(PublicListingSchema)

export type SaleChannel = z.infer<typeof SaleChannelSchema>
export type PublicListing = z.infer<typeof PublicListingSchema>
