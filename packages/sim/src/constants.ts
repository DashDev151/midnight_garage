import type { AuctionTier, Grade, ReputationTier, ServiceJobTier } from '@midnight-garage/content'

/**
 * Days between accepting a service job and the customer's car actually
 * arriving in the shop (Sprint 25 task 2: accepting no longer teleports the
 * car in instantly - "I'll drop it off first thing in the morning").
 */
export const SERVICE_JOB_ARRIVAL_DELAY_DAYS = 1

/**
 * Sprint 29 decision 2: which reputation tier unlocks each service-job
 * template tier - a clean 1:1 mapping onto the first 4 of the 5 reputation
 * tiers (`legend` reserved for something rarer, same framing as
 * `AUCTION_TIER_MIN_REPUTATION`). A turbo/FI install (tier 4) can never be a
 * first job: a brand-new game starts at `unknown`, tier 1 only.
 */
export const SERVICE_JOB_TIER_MIN_REPUTATION: Readonly<Record<ServiceJobTier, ReputationTier>> = {
  1: 'unknown',
  2: 'local',
  3: 'known',
  4: 'respected',
}

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
 * Sprint 34: generation's `age -> mileage -> condition` chain needs a concrete
 * calendar age (`currentYear - car.year`) to pick the mileage range;
 * `generateAuctionCarInstance`'s `currentYear` defaults to `Infinity` for
 * callers with no real calendar context (most unit tests, and the value-model
 * probes), where "age" is meaningless. This fallback stands in for age in
 * exactly that case - real gameplay always threads a concrete
 * `currentGameYear(...)`, never this default (see `newGame.ts`/`advanceDay.ts`).
 * Picked to land mid-range - a reasonable "typical used car, no calendar info"
 * stand-in rather than an accidental best- or worst-case.
 */
export const DEFAULT_CONDITION_AGE_YEARS_WHEN_UNBOUNDED = 10

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

/**
 * Parts-market delivery timing (Sprint 14): express pays this surcharge for
 * a part to land in inventory the same day (today's pre-Sprint-14 behavior);
 * standard pays sticker price and waits this many days instead.
 */
export const PARTS_EXPRESS_SURCHARGE_FRACTION = 0.1
export const PARTS_STANDARD_DELIVERY_DAYS = 1
