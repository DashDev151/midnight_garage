import { z } from 'zod'

/**
 * Every sale resolves through the same walk-in-style path, so there is exactly
 * one channel. Kept as an enum to allow future extensibility.
 */
export const SaleChannelSchema = z.enum(['walk-in-offer'])

/**
 * A car the player has toggled "taking offers" on. The car stays in `ownedCars`/
 * the shop the whole time; `sinceDay` is when the toggle was switched on, read
 * by bots' accept-threshold policies as the holding-cost-pressure clock.
 */
export const ForSaleEntrySchema = z.object({
  carInstanceId: z.string().min(1),
  sinceDay: z.number().int().positive(),
})

/**
 * Today's live offer on a for-sale car - at most one per car, rolled fresh by
 * the daily offer-draw step and valid the day it's drawn for only (it expires
 * at End Day, never mid-screen). `buyerId` is the archetype who made it,
 * reused for both the accept-time reputation/heat plumbing and the "A tuner
 * is offering..." copy.
 */
export const PendingSaleOfferSchema = z.object({
  carInstanceId: z.string().min(1),
  buyerId: z.string().min(1),
  priceYen: z.number().int().positive(),
})

export type SaleChannel = z.infer<typeof SaleChannelSchema>
export type ForSaleEntry = z.infer<typeof ForSaleEntrySchema>
export type PendingSaleOffer = z.infer<typeof PendingSaleOfferSchema>
