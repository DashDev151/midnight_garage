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
 * creation (`auctions.ts`'s `generateAuctionCatalog`) and persisted. Feeds
 * the live auction room's own turnout tuning (`economy.auctionRoom.turnout`,
 * `packages/game/src/screens/auctionRoom.ts`) - dealer count and clearing
 * band - so a lot's crowd is fixed for its whole life, not recomputed daily.
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
 * standard/long duration roll): "this lot leaves the board no later than day
 * N." A lot is settled before that day arrives by winning it in the live
 * auction room (a pure sim purchase at the room's hammer price,
 * `settleAuctionHammer`) or by an instant buyout; a lot nobody has settled by
 * its backstop day simply expires unsold.
 */
export const AuctionLotSchema = z.object({
  id: z.string().min(1),
  tier: AuctionTierSchema,
  modelId: z.string().min(1),
  car: CarInstanceSchema,
  bookValueYen: z.number().int().positive(),
  expiresOnDay: z.number().int().positive(),
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
   * lot the guided tutorial injects while its mission is live - telemetry/
   * probes can exclude it, and the auction board sorts it to the top of its
   * tier so the walkthrough's subject is never buried under the day's random
   * stock. Optional (absent = an ordinary lot), the genuinely-optional-key
   * pattern - no existing lot literal needs touching.
   */
  scripted: z.boolean().optional(),
})

export const AuctionLotsSchema = z.array(AuctionLotSchema)

export type AuctionTier = z.infer<typeof AuctionTierSchema>
export type AuctionLot = z.infer<typeof AuctionLotSchema>
