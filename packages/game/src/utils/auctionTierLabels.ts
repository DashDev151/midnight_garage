import type { AuctionTier } from '@midnight-garage/content'

/**
 * Player-facing names for the four auction tiers (Sprint 95 decision 6). The
 * enum slug ("local-yard") is a schema identifier, never copy - any screen
 * that shows a tier to the player renders it through this map.
 */
export const AUCTION_TIER_LABELS: Record<AuctionTier, string> = {
  'local-yard': 'Local Yard',
  regional: 'Regional',
  premium: 'Premium',
  'collector-network': 'Collector Network',
}
