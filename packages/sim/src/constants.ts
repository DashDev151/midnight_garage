import type { AuctionTier, Grade, ReputationTier } from '@midnight-garage/content'

/** GDD 3.2: base labor slots per day before any staff bonus. */
export const PLAYER_BASE_LABOR_SLOTS = 2

/**
 * Labor-slots a zone repair costs, scaled by how damaged the zone is so a
 * badly hurt zone can span multiple days against the daily slot budget
 * (making the labor-scarcity tension visible). A stock 2-slot day clears a
 * lightly damaged zone same-day; a wrecked one takes two. Provisional PoC
 * heuristic — belongs in content JSON once the job taxonomy firms up.
 */
export function repairLaborSlotsFor(conditionPercent: number): number {
  return Math.max(1, Math.ceil((100 - conditionPercent) / 30))
}

/** A bolt-on install is a single-slot job for now. */
export const INSTALL_LABOR_SLOTS = 1

/** Service-job offers refreshed onto the board each week, and how long they last. */
export const SERVICE_JOB_OFFERS_PER_REFRESH = 4
export const SERVICE_JOB_EXPIRY_DAYS = 10

/** Days the player has to finish + hand back a job after accepting it. */
export const SERVICE_JOB_DEADLINE_DAYS = 7

/**
 * Reputation penalty for a failed job (handed back unfinished, or the deadline
 * passed with the work undone), as a multiple of the job's base reputation —
 * failing stings more than completing rewards at the stock rate.
 */
export const SERVICE_JOB_FAILURE_REP_MULTIPLIER = 2

/**
 * Reputation multiplier by installed part grade (Sprint 08): a pricier,
 * higher-grade part earns more reputation for a part-install service job (and
 * costs the player more profit) — repair-only jobs use the stock/1.0 rate.
 */
export const GRADE_REPUTATION_MULTIPLIER: Readonly<Record<Grade, number>> = {
  stock: 1.0,
  street: 1.3,
  sport: 1.7,
  race: 2.2,
}

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

/** Instant-buyout price as a fraction of book value — a premium over the
 * expected auction clearing price, the convenience tax for certainty. */
export const AUCTION_BUYOUT_PREMIUM = 1.1

/** Default +/- fuzz band on the shown "expected clearing" estimate. A future
 * auction-scout staff trait narrows this via the `precision` parameter. */
export const AUCTION_INTEREST_BASE_BAND = 0.2

/**
 * Per-bid aggression range (Sprint 03 decision 4a; re-scoped Sprint 10 from
 * a persistent per-buyer-id multiplier to a fresh roll per anonymous rival
 * bidder — see AUCTION_FIELD_* below). Each rival in a lot's field bids
 * independently within this range around their disciplined valuation.
 */
export const AUCTION_BIDDER_NOISE_RANGE: readonly [number, number] = [0.85, 1.15]

/**
 * Bell-curve calibration for the auction rival field (Sprint 10), tuned via
 * Monte Carlo against the real 5-buyer roster to land the win-price
 * distribution at roughly STEAL 10% / MID 82% / FRENZY 8% (see
 * docs/sprints/sprint10.md decision 4f) with an average field around 6
 * bidders, mostly in the 3-9 band:
 * - AUCTION_FIELD_BASE / AUCTION_FIELD_PER_INTEREST set the field-size mean:
 *   fieldMean = BASE + PER_INTEREST * (sum of interested archetypes' tier
 *   weights for that car). A broadly-loved car draws a bigger field.
 * - AUCTION_FIELD_SIZE_SD sets how fat the "small field, cheap win" tail is.
 * - AUCTION_BIDDER_DISCIPLINE sets where the winning price centers and how
 *   fat the "big field, near-buyout" tail is: a rival bids
 *   `valuateCarForBuyer * discipline`, well below what a customer would pay
 *   for the same car finished, since a dealer needs resale margin.
 */
export const AUCTION_FIELD_BASE = 3
export const AUCTION_FIELD_PER_INTEREST = 1.5
export const AUCTION_FIELD_SIZE_SD = 3.5
export const AUCTION_BIDDER_DISCIPLINE = 0.7

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
