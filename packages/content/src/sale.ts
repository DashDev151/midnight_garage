import { z } from 'zod'

/**
 * Sprint 31: the public-listing channel is gone (GDD 6.3 delta) - every sale
 * now resolves through the same walk-in-style path, so there is exactly one
 * channel left. Kept as an enum, not a bare literal field, so the deferred
 * known-buyer-contact channel (Sprint 03 decision 6) has somewhere to slot in
 * later without another schema shape change.
 */
export const SaleChannelSchema = z.enum(['walk-in-offer'])

/**
 * A car the player has toggled "taking offers" on (Sprint 31 decision 2) -
 * replaces both the old instant walk-in sell and the public-listing channel.
 * The car stays in `ownedCars`/the shop the whole time; `sinceDay` is when
 * the toggle was switched on, read by bots' accept-threshold policies as the
 * holding-cost-pressure clock (and available to a future UI "up for sale N
 * days" hint).
 */
export const ForSaleEntrySchema = z.object({
  carInstanceId: z.string().min(1),
  sinceDay: z.number().int().positive(),
})

/**
 * Today's live offer on a for-sale car (Sprint 31 decision 2) - at most one
 * per car, rolled fresh by the daily offer-draw step and valid the day it's
 * drawn for only (the no-reflex rule: it expires at End Day, never mid-
 * screen). `buyerId` is the archetype who made it, reused for both the
 * accept-time reputation/heat plumbing and the "A tuner is offering..."
 * copy (decision 5).
 */
export const PendingSaleOfferSchema = z.object({
  carInstanceId: z.string().min(1),
  buyerId: z.string().min(1),
  priceYen: z.number().int().positive(),
})

export type SaleChannel = z.infer<typeof SaleChannelSchema>
export type ForSaleEntry = z.infer<typeof ForSaleEntrySchema>
export type PendingSaleOffer = z.infer<typeof PendingSaleOfferSchema>
