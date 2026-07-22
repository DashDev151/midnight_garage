import { z } from 'zod'
import { CarInstanceSchema } from './carInstance'

/**
 * GDD 6.5 tiers, rep-gated from Local Yard up to Collector Network.
 * Gaisha never appears here - GDD 4.5 sources it only via the (unbuilt)
 * Import Broker, "no auction luck" - see auctionTierForRarity in sim.
 */
export const AuctionTierSchema = z.enum(['local-yard', 'regional', 'premium', 'collector-network'])

/**
 * A real bidder-count band, rolled once per lot at creation and persisted.
 * Feeds the live auction room's own turnout tuning (`economy.auctionRoom.turnout`,
 * `packages/game/src/screens/auctionRoom.ts`) - dealer count and clearing band -
 * so a lot's crowd is fixed for its whole life, not recomputed daily.
 */
export const TurnoutBandSchema = z.enum(['thin', 'steady', 'packed'])
export type TurnoutBand = z.infer<typeof TurnoutBandSchema>

/**
 * A generated, not-yet-owned car offered at auction. `car` carries its true
 * part bands directly - there is no reveal machinery, a lot's parts are just
 * plain, always-visible state.
 *
 * `expiresOnDay` is the backstop close: "this lot leaves the board no later
 * than day N." A lot is settled before that day arrives by winning it in the
 * live auction room (a pure sim purchase at the room's hammer price,
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
   * This lot's rolled bidder-count band, fixed for its whole life (see
   * `TurnoutBandSchema`'s own doc comment). Defaults to `'steady'`.
   */
  turnout: TurnoutBandSchema.default('steady'),
  /**
   * True only for the one deterministic lot the guided tutorial injects while
   * its mission is live - telemetry/probes can exclude it, and the auction
   * board sorts it to the top of its tier so the walkthrough's subject is
   * never buried under the day's random stock. Optional (absent = an ordinary
   * lot), the genuinely-optional-key pattern.
   */
  scripted: z.boolean().optional(),
})

export const AuctionLotsSchema = z.array(AuctionLotSchema)

export type AuctionTier = z.infer<typeof AuctionTierSchema>
export type AuctionLot = z.infer<typeof AuctionLotSchema>
