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

/**
 * How much extra a bot is willing to pay for certainty, on top of the lot's
 * own shown "bid this high to win" estimate (`LotInterest.estimateHighYen`,
 * `bidding.ts`) — the harness's buyout-vs-bid telemetry (external review
 * 2026-07 finding 2; `TODO.md`). Deliberately compared against the
 * *expected clearing price*, not a bot's own arbitrary bid ceiling, so the
 * decision means the same thing regardless of which strategy is asking: pay
 * out when the field is competitive enough that you'd likely have to bid
 * close to buyout anyway, don't bother when a lot is quiet and cheap to win.
 * First-pass number, openly adjustable like every other constant here.
 */
export const AUCTION_BUYOUT_TOLERANCE_FRACTION = 0.05

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

/**
 * Correlated per-car condition roll (Sprint 12): a car's 8 components no
 * longer roll condition independently (which let a car land a pristine
 * engine and a wrecked transmission with no relationship between them) — one
 * baseline is rolled per car, in this range, and each component jitters
 * around it (see CAR_CONDITION_JITTER). Keeps today's 30-90 overall spread.
 */
export const CAR_CONDITION_BASE_MIN = 30
export const CAR_CONDITION_BASE_MAX = 90

/** Max +/- spread each component rolls away from its car's condition baseline. */
export const CAR_CONDITION_JITTER = 15

/**
 * Auction tier reputation ladder (Sprint 16 decision 3): extends the
 * pre-existing Collector Network gate (GDD 6.5) to the other three tiers —
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
 * race-grade install). Not claimed correct — the shape (each tier
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
 * Selling a genuinely well-restored car (average component condition AND
 * authenticity both clear this bar) earns a flat reputation bonus on top of
 * the sale itself — flat constants, matching this codebase's existing
 * preference over continuous formulas at this stage.
 */
export const QUALITY_SALE_MIN_CONDITION = 85
export const QUALITY_SALE_MIN_AUTHENTICITY = 85
export const QUALITY_SALE_REPUTATION_BONUS = 3

/**
 * Selling a "lemon" costs reputation instead: average component condition at
 * or below `LEMON_MAX_AVERAGE_CONDITION`, **or** any single component at or
 * below `LEMON_MAX_SINGLE_COMPONENT_CONDITION` regardless of the average (the
 * maintainer's own framing — a car can average fine and still hide one dead
 * component). These two thresholds can overlap (seven components at 96+ and
 * one at <=10 still averages >=85) — `saleReputationDeltaFor` checks lemon
 * first, so a car with a dead component is never scored as a quality sale.
 * Deliberately does not apply to plain lowball/cheap-but-not-broken sales —
 * only genuinely bad condition, so normal flipping stays reputation-neutral.
 */
export const LEMON_MAX_AVERAGE_CONDITION = 40
export const LEMON_MAX_SINGLE_COMPONENT_CONDITION = 10
export const LEMON_SALE_REPUTATION_PENALTY = 5
