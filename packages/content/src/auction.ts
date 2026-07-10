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
 *
 * Sprint 19 (multi-day bidding): `expiresOnDay` now means "the day this lot
 * resolves" (a real top-bid-wins outcome, first-price since Sprint 19b), not
 * just "the day an unsold lot disappears" — the same day serves both
 * meanings, since an unbid lot that
 * reaches it simply resolves with no player winner, which reads the same as
 * "expired unsold" always did. Kept the field name rather than renaming to
 * `resolvesOnDay` (the newer, more consistent convention `PublicListing`/
 * `PendingPartOrder` use) — a rename here would need a real migration
 * (renaming a required field isn't a safe default-fill), and this sprint's
 * scope is already the largest of the five; not worth the added risk for a
 * naming nicety alone.
 */
export const AuctionLotSchema = z.object({
  id: z.string().min(1),
  tier: AuctionTierSchema,
  modelId: z.string().min(1),
  car: CarInstanceSchema,
  bookValueYen: z.number().int().positive(),
  inspected: z.boolean().default(false),
  expiresOnDay: z.number().int().positive(),
  /** The player's own committed max bid on this lot, if any — never resolves
   * anything by itself (Sprint 19: placing/raising a bid just sets this).
   * Can only ever go up (never lowered) until the lot resolves. */
  playerMaxBidYen: z.number().int().positive().nullable().default(null),
  /**
   * How far each anonymous rival (index-aligned with `buildRivalField`'s
   * stable, lot-id-seeded output) has escalated toward their own fixed
   * ceiling so far, updated once per day this lot is still active. Starts
   * empty (no escalation pass has run yet) — `slotAt`-style index access
   * treats a missing entry as that rival's own starting floor (their ceiling
   * clamped to the reserve price, since Sprint 19b — a real bidder was never
   * going to show up below the seller's own floor), the same robustness
   * pattern Sprint 17 established for under-sized indexed arrays, so this
   * never needs to be pre-sized against a rival count computed elsewhere.
   */
  rivalEscalatedBidsYen: z.array(z.number().int().nonnegative()).default([]),
})

export const AuctionLotsSchema = z.array(AuctionLotSchema)

export type AuctionTier = z.infer<typeof AuctionTierSchema>
export type AuctionLot = z.infer<typeof AuctionLotSchema>
