import type { AuctionTier, ReputationTier } from '@midnight-garage/content'

/** GDD 3.2: base labor slots per day before any staff bonus. */
export const PLAYER_BASE_LABOR_SLOTS = 2

/**
 * v1 rule (GDD 3.2 "base 2, more with skill"): a staff member with Hustle
 * at or above this threshold grants +1 labor slot/day. Equipment-driven
 * bonuses (lift, dyno, ...) are the Sprint 14 equipment-tier system.
 */
export const STAFF_HUSTLE_BONUS_THRESHOLD = 4

/** Weekly rent, Portside start (docs/economy-v0.md). First-pass number. */
export const WEEKLY_RENT_YEN = 90_000

/** Service-bay income scales with reputation (GDD 3.4). First-pass multipliers. */
export const REPUTATION_INCOME_MULTIPLIER: Readonly<Record<ReputationTier, number>> = {
  unknown: 1.0,
  local: 1.1,
  known: 1.25,
  respected: 1.5,
  legend: 2.0,
}

/** Yen of daily service-bay income per point of a staff member's Hustle stat (v1, GDD 3.4). */
export const SERVICE_BAY_YEN_PER_HUSTLE = 3_000

/** Weekly market-heat drift (GDD 6.4): inclusive random-walk bounds. */
export const MARKET_HEAT_WEEKLY_DRIFT_RANGE: readonly [number, number] = [-4, 4]

/** Seller won't sell for a token amount — GDD 6.5's floor under a deal. */
export const AUCTION_RESERVE_PRICE_FRACTION = 0.4

/** Second-price sealed-bid resolution: winner pays second-highest + this. */
export const AUCTION_BID_INCREMENT_YEN = 10_000

/** Persistent per-bidder aggression range (Sprint 03 decision 4a). */
export const AUCTION_BIDDER_NOISE_RANGE: readonly [number, number] = [0.85, 1.15]

/**
 * Walk-in offers vary around true valuation for the convenience of an
 * instant sale (GDD 6.3: "fast, variable") — centered closer to 1.0 than
 * strictly capped below it, since the buyer is already weighted toward
 * whoever wants this car most (sellViaWalkIn), not a uniformly random
 * stranger; an eager walk-in can occasionally beat true value.
 */
export const WALK_IN_OFFER_RANGE: readonly [number, number] = [0.85, 1.1]

/** New lots per tier on each weekly catalog refresh. */
export const AUCTION_LOTS_PER_TIER: Readonly<Record<AuctionTier, number>> = {
  'local-yard': 3,
  regional: 3,
  premium: 2,
  'collector-network': 1,
}

/** How many days a catalog lot stays biddable before it expires unsold. */
export const AUCTION_LOT_EXPIRY_DAYS = 7

/** Inspection travel fee by tier (docs/economy-v0.md: ¥8,000 local / ¥25,000 regional, extended). */
export const AUCTION_TRAVEL_FEE_YEN: Readonly<Record<AuctionTier, number>> = {
  'local-yard': 8_000,
  regional: 15_000,
  premium: 25_000,
  'collector-network': 40_000,
}

/** GDD 6.5: Collector Network is rep-gated. First-pass threshold. */
export const COLLECTOR_NETWORK_MIN_REPUTATION: ReputationTier = 'respected'

/** Default wait for a list-publicly sale to resolve (GDD 6.3: "slow, market price"). */
export const PUBLIC_LISTING_WAIT_DAYS = 5
