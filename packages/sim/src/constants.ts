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

/**
 * Selling a "lemon" costs reputation instead (Sprint 15; re-based on bands,
 * Sprint 26 decision 9): the car's cost-weighted band factor
 * (`costWeightedBandFactor`, bands.ts) at or below `LEMON_MAX_AVERAGE_BAND_FACTOR`,
 * **or** any single present part at `scrap` regardless of the average (the
 * maintainer's own framing - a car can look great overall and still hide one
 * dead part; scrap being both unrepairable and an automatic lemon trigger is
 * intentional, the game's honest "this needs real money" state). Set above
 * `poor`'s own band factor (economy.json's `bands.bandFactors.poor`, 0.4) -
 * not exactly at it - so "every part poor" reliably reads as a lemon
 * without depending on which side of an exact floating-point tie the
 * weighted average happens to land on; still comfortably below `worn`
 * (0.65), so an otherwise-fine car with one worn part stays neutral, not a
 * lemon. `saleReputationDeltaFor` (carCondition.ts) checks lemon first, so a
 * car with a dead part is never scored as a quality sale. Deliberately does
 * not apply to plain lowball/cheap-but-not-broken sales - only genuinely bad
 * condition, so normal flipping stays reputation-neutral.
 */
export const LEMON_MAX_AVERAGE_BAND_FACTOR = 0.45
export const LEMON_SALE_REPUTATION_PENALTY = 5
