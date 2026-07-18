import { z } from 'zod'
import { CarInstanceSchema } from './carInstance'

/**
 * GDD 6.5 tiers, rep-gated from Local Yard up to Collector Network.
 * Gaisha never appears here - GDD 4.5 sources it only via the (unbuilt)
 * Import Broker, "no auction luck" - see auctionTierForRarity in sim.
 */
export const AuctionTierSchema = z.enum(['local-yard', 'regional', 'premium', 'collector-network'])

/**
 * Sprint 30 decision 3: a real bidder-count band, rolled once per lot at
 * creation (`auctions.ts`'s `generateAuctionCatalog`) and persisted -
 * replaces the old per-day-recomputed ratio read (`bidding.ts`'s deleted
 * `turnoutBand` function, and its Sprint 25 badge-honesty clamp, superseded
 * by this model). `bidding.ts`'s `turnoutBidderCount` turns the band into an
 * actual rival-cohort count via `economy.auctionInterest.turnoutBidderCounts`.
 */
export const TurnoutBandSchema = z.enum(['thin', 'steady', 'packed'])
export type TurnoutBand = z.infer<typeof TurnoutBandSchema>

/**
 * A generated, not-yet-owned car offered at auction. `car` carries its true
 * part bands directly - the hidden-issue/inspection system (and the
 * `inspected` flag this schema used to carry) is paused and removed (Sprint
 * 26, maintainer decision 2026-07-11): there is no reveal machinery left,
 * a lot's parts are just plain, always-visible state (sprint26.md decision
 * 10). Sprint 27 is what actually surfaces that per-part detail in the UI;
 * this sprint only removes the flag that no longer means anything.
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
  /**
   * Sprint 30 decision 3: this lot's rolled bidder-count band, fixed for its
   * whole life (see `TurnoutBandSchema`'s own doc comment). Defaults to
   * `'steady'` for a pre-v19 save's already-listed lots (SAVE_VERSION doc
   * comment, saveCodec.ts) - a neutral assumption for a lot that predates the
   * mechanic, no migration needed since a mid-life lot losing its original
   * (never-persisted) turnout roll can't be recovered anyway.
   */
  turnout: TurnoutBandSchema.default('steady'),
  /**
   * Sprint 89 (the scripted tutorial lot): true only for the one deterministic
   * lot the guided tutorial injects while its mission is live. Two effects,
   * both parameter pins rather than a bypass of the normal auction: telemetry/
   * probes can exclude it, and its rival cohorts are pinned out of the
   * overnight step (`bidding.ts`'s `advanceLotOvernight`) so the seller's
   * floor is also the rivals' ceiling - the player's reserve bid stands and
   * hammers on the quiet-days rule, a guaranteed win at reserve. Optional
   * (absent = an ordinary lot), the genuinely-optional-key pattern - no
   * existing lot literal needs touching.
   */
  scripted: z.boolean().optional(),
})

export const AuctionLotsSchema = z.array(AuctionLotSchema)

export type AuctionTier = z.infer<typeof AuctionTierSchema>
export type AuctionLot = z.infer<typeof AuctionLotSchema>
