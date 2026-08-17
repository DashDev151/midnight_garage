import { z } from 'zod'
import { SellingChannelIdSchema } from './economy'

/**
 * Every sale resolves through the same walk-in-style path, so there is exactly
 * one channel. Kept as an enum to allow future extensibility.
 */
export const SaleChannelSchema = z.enum(['walk-in-offer'])

/**
 * A car the player has toggled "taking offers" on. The car stays in `ownedCars`/
 * the shop the whole time; `offersSeen` is the listing's own normalised clock
 * (sale-value-system.md S4): expected offer-draw attempts this listing has
 * already produced, read by both the staleness (offer-chance) curve and the
 * offer-quality curve, and by bots' accept-threshold policies as the
 * holding-pressure signal. Deliberately NOT a day count - a car nobody has
 * come to look at has not gone stale, whatever the calendar says
 * (sprint147.md). Incremented once per draw attempt, hit or miss
 * (`drawDailyOffers`).
 *
 * `channelId` is where it's listed - sets the fee already paid, the offer
 * cadence, and which buyer pool can arrive (`economy.sellingChannels`).
 * Re-listing on another channel replaces this entry but carries `offersSeen`
 * forward at `economy.liquidity.relistRecovery` rather than resetting it:
 * the plate and the advertisement are the same, so switching channels alone
 * cannot refresh a listing for free (`resolveSetForSale`).
 * `weekendMeetPending` is a one-shot channel's own state (any channel
 * carrying `oneDrawNextEndDay` - `weekendMeet`, `collectorNetwork`): true
 * whenever (re-)listed on one of them, consumed (set false) the moment
 * `drawDailyOffers` resolves that listing's single guaranteed draw, hit or
 * miss; always false for every other channel. The field kept its original
 * name rather than a generic one - it is a persisted save field, and
 * renaming it would cost a save-schema touch for zero player value.
 */
export const ForSaleEntrySchema = z.object({
  carInstanceId: z.string().min(1),
  offersSeen: z.number().int().nonnegative(),
  channelId: SellingChannelIdSchema,
  weekendMeetPending: z.boolean(),
})

/**
 * Today's live offer on a for-sale car - at most one per car, rolled fresh by
 * the daily offer-draw step and valid the day it's drawn for only (it expires
 * at End Day, never mid-screen). `buyerId` is the archetype who made it,
 * reused for both the accept-time reputation/heat plumbing and the "A tuner
 * is offering..." copy.
 *
 * `noticeLine` (knowledge-and-diagnosis.md section 6, sprint217.md task B) is
 * set only when the drawn offer noticed at least one open, unverified symptom
 * (`rollBuyerNotice`, sim/diagnosis.ts) - a fully-interpolated, ready-to-
 * render line naming what was caught, the same "ready to render, never
 * re-derived" convention `car-sold`'s own `saleRevealLine` uses. Its presence
 * is also the accept-time signal that this offer already priced in a notice
 * deduction, so accepting it costs `diagnosis.noticeReputationPenalty`
 * reputation.
 */
export const PendingSaleOfferSchema = z.object({
  carInstanceId: z.string().min(1),
  buyerId: z.string().min(1),
  priceYen: z.number().int().positive(),
  noticeLine: z.string().min(1).optional(),
})

export type SaleChannel = z.infer<typeof SaleChannelSchema>
export type ForSaleEntry = z.infer<typeof ForSaleEntrySchema>
export type PendingSaleOffer = z.infer<typeof PendingSaleOfferSchema>
