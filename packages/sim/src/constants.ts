import type { AuctionTier, Grade, ReputationTier, ServiceJobTier } from '@midnight-garage/content'

/**
 * GDD 3.2: base labor slots per day before any staff bonus. Sprint 33
 * decision 7 (labor recalibration): raised 2 -> 6 (3x). Playtest finding:
 * against the real 29-part-per-group repair granularity (Sprint 26), base 2
 * slots made a full restoration take ~20 days even on a moderately worn
 * car - a war of attrition, not a fun restoration arc. Left the equipment
 * repair-LEVEL ladder (`bands.ts`'s `repairLevelForGroup`, still defaulting
 * to level 1/"1 grade per slot" with nothing owned) untouched rather than
 * also raising the base level, so owning equipment still means something -
 * doubling or tripling the BASE throughput instead would flatten most
 * equipment's relative value to zero. First-pass number, openly retunable
 * (`restorationPacing.test.ts` documents the resulting "days to fully
 * restore a typical car" anchor); further calibrated against the balance
 * harness + playtest, same as every other content-tunable number here.
 */
export const PLAYER_BASE_LABOR_SLOTS = 6

/** A bolt-on install is a single-slot job for now. */
export const INSTALL_LABOR_SLOTS = 1

/** How long a service-job offer stays on the board before expiring unaccepted
 * (Sprint 29 decision 4: "offers expire as today"). Daily offer COUNT is a
 * content tunable now (economy.json's `serviceJobs.dailyOfferCountWeights`),
 * replacing the old flat `SERVICE_JOB_OFFERS_PER_REFRESH` weekly dump. */
export const SERVICE_JOB_EXPIRY_DAYS = 10

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
 * Correlated per-car condition roll (Sprint 12): a car's real parts don't
 * roll condition independently (which let a car land a pristine engine and
 * a wrecked transmission with no relationship between them) - one 0-100
 * baseline is rolled per car, and each part jitters around it (see
 * CAR_CONDITION_JITTER) before bucketing into its condition band (Sprint 26:
 * `bandForMigratedCondition`, bands.ts). Sprint 34: the baseline's own [min,
 * max] range is now derived from the car's rolled mileage (`economy.json`'s
 * `partsGeneration.conditionBaselineMinByMileageKm`/`MaxByMileageKm`, sampled
 * in `auctions.ts`), which is itself rolled from the car's age - so mileage is
 * the single coherent wear driver and a low-mileage car stays mostly good.
 */
export const CAR_CONDITION_JITTER = 15

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
