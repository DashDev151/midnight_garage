import type { Grade, ReputationTier, ServiceJobTier } from '@midnight-garage/content'

/** Days between accepting a service job and the customer's car actually
 * arriving in the shop - "I'll drop it off first thing in the morning." */
export const SERVICE_JOB_ARRIVAL_DELAY_DAYS = 1

/**
 * Which reputation tier unlocks each service-job template tier - a clean
 * 1:1 mapping onto the first 4 of the 5 reputation tiers (`legend`
 * reserved for something rarer). A turbo/FI install (tier 4) can never be
 * a first job: a brand-new game starts at `unknown`, tier 1 only.
 */
export const SERVICE_JOB_TIER_MIN_REPUTATION: Readonly<Record<ServiceJobTier, ReputationTier>> = {
  1: 'unknown',
  2: 'local',
  3: 'known',
  4: 'respected',
}

/**
 * Reputation multiplier by installed part grade: a pricier, higher-grade
 * part earns more reputation for a part-install service job (and costs
 * the player more profit) - repair-only jobs use the stock/1.0 rate.
 *
 * The gradient is deliberately shallow. A race build out-earns a stock one by
 * 60 per cent, which is a real difference without letting the best job on the
 * board out-earn selling a car well: the service board is the steady trickle,
 * and the shop's own cars are the road to legend.
 */
export const GRADE_REPUTATION_MULTIPLIER: Readonly<Record<Grade, number>> = {
  stock: 1.0,
  street: 1.15,
  sport: 1.35,
  race: 1.6,
}

/**
 * Generation's `age -> mileage -> condition` chain needs a concrete
 * calendar age (`currentYear - car.year`) to pick the mileage range;
 * `generateAuctionCarInstance`'s `currentYear` defaults to `Infinity` for
 * callers with no real calendar context (most unit tests, and the
 * value-model probes), where "age" is meaningless. This fallback stands
 * in for age in exactly that case - real gameplay always threads a
 * concrete `currentGameYear(...)`, never this default (see
 * `newGame.ts`/`advanceDay.ts`). Picked to land mid-range - a reasonable
 * "typical used car, no calendar info" stand-in rather than an accidental
 * best- or worst-case.
 */
export const DEFAULT_CONDITION_AGE_YEARS_WHEN_UNBOUNDED = 10

/**
 * Parts-market delivery timing: express pays this surcharge for a part to
 * land in inventory the same day; standard pays sticker price and waits
 * this many days instead.
 */
export const PARTS_EXPRESS_SURCHARGE_FRACTION = 0.1
export const PARTS_STANDARD_DELIVERY_DAYS = 1
