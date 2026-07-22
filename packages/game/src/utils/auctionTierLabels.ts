import type { AuctionTier, VenueNameByTier } from '@midnight-garage/content'

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
