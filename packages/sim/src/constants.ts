import type { AuctionTier, Grade, ReputationTier } from '@midnight-garage/content'

/** GDD 3.2: base labor slots per day before any staff bonus. */
export const PLAYER_BASE_LABOR_SLOTS = 2

/**
 * Labor-slots a zone repair costs, scaled by how damaged the zone is so a
 * badly hurt zone can span multiple days against the daily slot budget
 * (making the labor-scarcity tension visible). A stock 2-slot day clears a
 * lightly damaged zone same-day; a wrecked one takes two. Provisional PoC
 * heuristic - belongs in content JSON once the job taxonomy firms up.
 */
export function repairLaborSlotsFor(conditionPercent: number): number {
  return Math.max(1, Math.ceil((100 - conditionPercent) / 30))
}

/** A bolt-on install is a single-slot job for now. */
export const INSTALL_LABOR_SLOTS = 1

/** Service-job offers refreshed onto the board each week, and how long they last. */
export const SERVICE_JOB_OFFERS_PER_REFRESH = 4
export const SERVICE_JOB_EXPIRY_DAYS = 10

/**
 * Days between accepting a service job and the customer's car actually
 * arriving in the shop (Sprint 25 task 2: accepting no longer teleports the
 * car in instantly - "I'll drop it off first thing in the morning").
 */
export const SERVICE_JOB_ARRIVAL_DELAY_DAYS = 1

/** Days the player has to finish + hand back a job after accepting it, counted from arrival. */
export const SERVICE_JOB_DEADLINE_DAYS = 7

/**
 * Job-board equipment hinting (Sprint 16 decision 4): a repair-kind offer
 * candidate whose equipment isn't owned is normally rerolled during
 * generation; this flat per-candidate probability lets it through anyway as
 * a "here's what's next" hint instead of a hard filter to zero. A flat
 * per-candidate roll (not a cap count) naturally produces "usually 0,
 * occasionally 1" across a typical weekly batch. Install-kind offers are
 * never filtered (unaffected, as already true since Sprint 13).
 */
export const JOB_HINT_OFFER_CHANCE = 0.15

/**
 * Reputation penalty for a failed job (handed back unfinished, or the deadline
 * passed with the work undone), as a multiple of the job's base reputation -
 * failing stings more than completing rewards at the stock rate.
 */
export const SERVICE_JOB_FAILURE_REP_MULTIPLIER = 2

/**
 * Reputation multiplier by installed part grade (Sprint 08): a pricier,
 * higher-grade part earns more reputation for a part-install service job (and
 * costs the player more profit) - repair-only jobs use the stock/1.0 rate.
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

/**
 * Walk-in offers vary around true valuation for the convenience of an
 * instant sale (GDD 6.3: "fast, variable") - centered closer to 1.0 than
 * strictly capped below it, since the buyer is already weighted toward
 * whoever wants this car most (sellViaWalkIn), not a uniformly random
 * stranger; an eager walk-in can occasionally beat true value.
 */
export const WALK_IN_OFFER_RANGE: readonly [number, number] = [0.85, 1.1]

/**
 * Correlated per-car condition roll (Sprint 12): a car's 8 components no
 * longer roll condition independently (which let a car land a pristine
 * engine and a wrecked transmission with no relationship between them) - one
 * baseline is rolled per car, in this range, and each component jitters
 * around it (see CAR_CONDITION_JITTER). Keeps today's 30-90 overall spread.
 */
export const CAR_CONDITION_BASE_MIN = 30
export const CAR_CONDITION_BASE_MAX = 90

/** Max +/- spread each component rolls away from its car's condition baseline. */
export const CAR_CONDITION_JITTER = 15

/**
 * Auction tier reputation ladder (Sprint 16 decision 3): extends the
 * pre-existing Collector Network gate (GDD 6.5) to the other three tiers -
 * a clean 1:1 mapping onto 4 of the 5 reputation tiers, `legend` reserved
 * for something rarer than a mere auction tier. `local-yard: unknown` means
 * "no gate" (every tier is at least `unknown`).
 */
export const AUCTION_TIER_MIN_REPUTATION: Readonly<Record<AuctionTier, ReputationTier>> = {
  'local-yard': 'unknown',
  regional: 'local',
  premium: 'known',
  'collector-network': 'respected',
}

/** Default wait for a list-publicly sale to resolve (GDD 6.3: "slow, market price"). */
export const PUBLIC_LISTING_WAIT_DAYS = 5

/**
 * Parts-market delivery timing (Sprint 14): express pays this surcharge for
 * a part to land in inventory the same day (today's pre-Sprint-14 behavior);
 * standard pays sticker price and waits this many days instead.
 */
export const PARTS_EXPRESS_SURCHARGE_FRACTION = 0.1
export const PARTS_STANDARD_DELIVERY_DAYS = 1

/**
 * Reputation-point ladder (Sprint 15): first-pass, openly adjustable
 * thresholds, scaled against what a service-job-only career can realistically
 * earn (`baseReputation` in content is 1-4 per job, up to ~2.2x for a
 * race-grade install). Not claimed correct - the shape (each tier
 * meaningfully harder than the last) is what any future retune preserves,
 * once real harness/playtest data exists (see the `reputationPoints` harness
 * sample this sprint adds to careers.csv).
 */
export const REPUTATION_TIER_THRESHOLDS: Readonly<Record<ReputationTier, number>> = {
  unknown: 0,
  local: 15,
  known: 50,
  respected: 120,
  legend: 300,
}

/**
 * Selling a "lemon" costs reputation instead: average component condition at
 * or below `LEMON_MAX_AVERAGE_CONDITION`, **or** any single component at or
 * below `LEMON_MAX_SINGLE_COMPONENT_CONDITION` regardless of the average (the
 * maintainer's own framing - a car can average fine and still hide one dead
 * component). These two thresholds can overlap (seven components at 96+ and
 * one at <=10 still averages >=85) - `saleReputationDeltaFor` checks lemon
 * first, so a car with a dead component is never scored as a quality sale.
 * Deliberately does not apply to plain lowball/cheap-but-not-broken sales -
 * only genuinely bad condition, so normal flipping stays reputation-neutral.
 */
export const LEMON_MAX_AVERAGE_CONDITION = 40
export const LEMON_MAX_SINGLE_COMPONENT_CONDITION = 10
export const LEMON_SALE_REPUTATION_PENALTY = 5
