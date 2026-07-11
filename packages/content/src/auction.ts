import { z } from 'zod'
import { CarInstanceSchema } from './carInstance'

/**
 * GDD 6.5 tiers, rep-gated from Local Yard up to Collector Network.
 * Gaisha never appears here - GDD 4.5 sources it only via the (unbuilt)
 * Import Broker, "no auction luck" - see auctionTierForRarity in sim.
 */
export const AuctionTierSchema = z.enum(['local-yard', 'regional', 'premium', 'collector-network'])

/**
 * A generated, not-yet-owned car offered at auction. `car` carries the
 * true (possibly unrevealed) condition and hidden issues - inspecting a
 * lot flips its issues' `revealed` flags; the sliding-scale lemon rule
 * (GDD 6.5) resolves the rest at handover if the player skipped that.
 *
 * `expiresOnDay` is the backstop close (Sprint 19 decision 1's flash/
 * standard/long duration roll, kept per Sprint 20 maintainer decision 4):
 * "this lot leaves the board no later than day N." Sprint 20 (auction
 * rework II) usually closes a lot earlier than that, via activity-based
 * closing instead - open, visible bidding replaces the old sealed player-max
 * + hidden-rival-escalation model. `currentBidYen` + `leadingBidder` are
 * literally "the price on the board and who holds it"; `quietDays` counts
 * consecutive overnight steps with no raise and drives "going once, going
 * twice" - a lot hammers, to whoever currently leads, after
 * `AUCTION_QUIET_DAYS_TO_HAMMER` quiet steps in a row, or at the
 * `expiresOnDay` backstop, whichever comes first.
 */
export const AuctionLotSchema = z.object({
  id: z.string().min(1),
  tier: AuctionTierSchema,
  modelId: z.string().min(1),
  car: CarInstanceSchema,
  bookValueYen: z.number().int().positive(),
  inspected: z.boolean().default(false),
  expiresOnDay: z.number().int().positive(),
  /** The literal price on the board - 0 means bidding hasn't opened yet.
   * First-price: whoever leads pays exactly this at the hammer. */
  currentBidYen: z.number().int().nonnegative().default(0),
  /** Who holds `currentBidYen` - null only while `currentBidYen` is 0 (the
   * lot hasn't opened). */
  leadingBidder: z.enum(['player', 'rival']).nullable().default(null),
  /** Consecutive overnight steps with no raise on this lot. Resets to 0 on
   * any raise (player or dealer); hammers at `AUCTION_QUIET_DAYS_TO_HAMMER`. */
  quietDays: z.number().int().nonnegative().default(0),
  /** Set true on the player's first raise, never reset (even if later
   * outbid) - load-bearing, not bookkeeping: gates the "My Active Bids"
   * panel (which deliberately keeps showing a lot the player is currently
   * LOSING), the `auction-outbid` log entry, and the only-log-a-loss-if-the-
   * player-had-skin rule at the hammer. */
  playerHasBid: z.boolean().default(false),
})

export const AuctionLotsSchema = z.array(AuctionLotSchema)

export type AuctionTier = z.infer<typeof AuctionTierSchema>
export type AuctionLot = z.infer<typeof AuctionLotSchema>
