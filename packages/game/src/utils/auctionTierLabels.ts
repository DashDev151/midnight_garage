import type { AuctionTier, EconomyConfig, VenueNameByTier } from '@midnight-garage/content'
import { dayOfWeekName } from '@midnight-garage/sim'

/**
 * Player-facing names for the four auction tiers. The
 * enum slug ("local-yard") is a schema identifier, never copy - any screen
 * that shows a tier to the player renders it through this map.
 */
export const AUCTION_TIER_LABELS: Record<AuctionTier, string> = {
  'local-yard': 'Local Yard',
  regional: 'Regional',
  premium: 'Premium',
  'collector-network': 'Collector Network',
}

/**
 * The label a tier actually renders as: the save's own rolled venue name
 * (`GameState.venueNameByTier`) when present, else the plain tier label
 * above. The tier id itself stays the mechanical key everywhere - only this
 * display seam swaps. `venueNameByTier` is absent for any state never built
 * through `createInitialGameState` (bots, probes, a pre-v45 save), so the
 * fallback keeps every such screen rendering exactly as before.
 */
export function venueLabelFor(
  tier: AuctionTier,
  venueNameByTier: VenueNameByTier | undefined,
): string {
  return venueNameByTier?.[tier] ?? AUCTION_TIER_LABELS[tier]
}

/**
 * A tier's own hours, in plain words: "Open Monday, Wednesday, Friday." or,
 * for a room that only sits every other week, "Open Friday, alternate
 * weeks." (sprint209.md task A3 - the map gives the calendar away rather
 * than the player discovering it by bouncing off a shut door).
 *
 * `cadence.openDaysOfWeek` already holds 1-indexed day-of-week positions
 * (the same numbers `isAuctionTierOpen` compares `dayOfWeek(day, economy)`
 * against), and `dayOfWeekName` derives that same position from whatever
 * absolute day it is handed - so feeding a position straight in as if it
 * were day 1 of the campaign resolves to the right name without a second,
 * position-to-name table to keep in sync.
 */
export function auctionCadencePhraseFor(tier: AuctionTier, economy: EconomyConfig): string {
  const cadence = economy.auction.cadenceByTier[tier]
  const days = cadence.openDaysOfWeek.map((position) => dayOfWeekName(position, economy)).join(', ')
  return cadence.weeksBetween > 1 ? `Open ${days}, alternate weeks.` : `Open ${days}.`
}
