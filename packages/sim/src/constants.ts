import type { ReputationTier } from '@midnight-garage/content'

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
