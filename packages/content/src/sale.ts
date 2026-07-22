import { z } from 'zod'
import { SellingChannelIdSchema } from './economy'

/**
 * Every sale resolves through the same walk-in-style path, so there is exactly
 * one channel. Kept as an enum to allow future extensibility.
 */
export const SaleChannelSchema = z.enum(['walk-in-offer'])

/**
 * A car the player has toggled "taking offers" on. The car stays in `ownedCars`/
 * the shop the whole time; `sinceDay` is when the toggle was switched on, read
 * by bots' accept-threshold policies as the holding-cost-pressure clock.
 *
 * `channelId` is where it's listed - sets the fee already paid, the offer
 * cadence, and which buyer pool can arrive (`economy.sellingChannels`).
 * Re-listing on another channel replaces this and pays that channel's fee
 * again. `weekendMeetPending` is that one channel's own one-shot state: true
 * whenever (re-)listed on `weekendMeet`, consumed (set false) the moment
 * `drawDailyOffers` resolves that listing's single guaranteed draw, hit or
 * miss; always false for every other channel.
 */
export const ForSaleEntrySchema = z.object({
  carInstanceId: z.string().min(1),
  sinceDay: z.number().int().positive(),
  channelId: SellingChannelIdSchema,
  weekendMeetPending: z.boolean(),
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
