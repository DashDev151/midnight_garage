import { z } from 'zod'
import { CarInstanceSchema } from './carInstance'

/**
 * GDD 6.5 tiers, rep-gated from Local Yard up to Collector Network.
 * Gaisha never appears here — GDD 4.5 sources it only via the (unbuilt)
 * Import Broker, "no auction luck" — see auctionTierForRarity in sim.
 */
export const AuctionTierSchema = z.enum(['local-yard', 'regional', 'premium', 'collector-network'])

/**
 * A generated, not-yet-owned car offered at auction. `car` carries the
 * true (possibly unrevealed) condition and hidden issues — inspecting a
 * lot flips its issues' `revealed` flags; the sliding-scale lemon rule
 * (GDD 6.5) resolves the rest at handover if the player skipped that.
 */
export const AuctionLotSchema = z.object({
  id: z.string().min(1),
  tier: AuctionTierSchema,
  modelId: z.string().min(1),
  car: CarInstanceSchema,
  bookValueYen: z.number().int().positive(),
  inspected: z.boolean().default(false),
  expiresOnDay: z.number().int().positive(),
})

export const AuctionLotsSchema = z.array(AuctionLotSchema)

export type AuctionTier = z.infer<typeof AuctionTierSchema>
export type AuctionLot = z.infer<typeof AuctionLotSchema>
