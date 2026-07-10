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

/** The FLOOR of the instant-buyout price, as a fraction of book value — the
 * convenience tax for certainty when nobody's bidding hard yet. Sprint 19c:
 * no longer the whole story — `bidding.ts`'s `computeBuyoutPriceYen` raises
 * the real, chargeable buyout price to match the current top bid whenever a
 * real bid (player or an escalated rival) exceeds this floor, so buyout
 * always stays a guaranteed win, never a bargain a serious auction could
 * undercut. */
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
 * Headroom-gauge bucket thresholds (Sprint 19 decision 3) — how much of a
 * rival's true ceiling is still unrevealed above the current top bid,
 * expressed as a fraction of that ceiling. Obfuscates the same way the
 * pre-bid Interest read already does (a qualitative bucket, not a yen
 * figure) — a new question ("how much room is left to move against me"),
 * not a relabeling of the pre-bid estimate. First-pass, openly adjustable.
 */
export const AUCTION_HEADROOM_PLENTY_MIN_FRACTION = 0.5
export const AUCTION_HEADROOM_MODERATE_MIN_FRACTION = 0.25
export const AUCTION_HEADROOM_TIGHT_MIN_FRACTION = 0.05

/**
 * Per-bid aggression range (Sprint 03 decision 4a; re-scoped Sprint 10 from
 * a persistent per-buyer-id multiplier to a fresh roll per anonymous rival
 * bidder — see AUCTION_FIELD_* below). Each rival in a lot's field bids
 * independently within this range around their disciplined valuation.
 */
export const AUCTION_BIDDER_NOISE_RANGE: readonly [number, number] = [0.85, 1.15]

/**
 * Bell-curve calibration for the auction rival field (Sprint 10; discipline
 * retuned Sprint 19c). `AUCTION_FIELD_BASE`/`AUCTION_FIELD_PER_INTEREST` set
 * the field-size mean: fieldMean = BASE + PER_INTEREST * (sum of interested
 * archetypes' tier weights for that car) — a broadly-loved car draws a
 * bigger field. `AUCTION_FIELD_SIZE_SD` sets how fat the "small field, cheap
 * win" tail is. `AUCTION_BIDDER_DISCIPLINE` sets where a rival's own ceiling
 * centers: a rival's true max is `valuateCarForBuyer * discipline` — still
 * below what a customer would pay for the same car finished (a dealer needs
 * *some* resale margin), but no longer capped at the lot's buyout price
 * (Sprint 19c: `buildRivalField` no longer clamps `rawBid` — see its own
 * comment for why). Retuned from 0.7 to 0.95, verified against a real
 * (car, buyer-archetype) sample from the actual roster/buyer data
 * (`valuateCarForBuyer` output, no cap, with the existing noise range
 * applied): 0.7 centered ceilings at ~0.65x book (p25=0.59x, p75=0.73x) —
 * comfortably below the "occasionally competitive with a well-restored
 * car's own resale value" feel the maintainer wants; 0.95 centers them at
 * ~0.89x book (p25=0.80x, p75=0.99x, p90=1.09x), landing the bulk of real
 * rivals in the maintainer's explicit 0.8-1.1x target band with a real
 * (not artificially capped) tail above book value.
 */
export const AUCTION_FIELD_BASE = 3
export const AUCTION_FIELD_PER_INTEREST = 1.5
export const AUCTION_FIELD_SIZE_SD = 3.5
export const AUCTION_BIDDER_DISCIPLINE = 0.95

/**
 * Day-by-day rival escalation (Sprint 19 decision 2, the core new mechanic):
 * each active lot's rivals start unrevealed and gradually approach their own
 * fixed ceiling (still `buildRivalField`'s unchanged-shape output, just no
 * longer buyout-capped — Sprint 19c) over the lot's lifetime, instead of
 * revealing it all at once. Each day, a rival who isn't already beaten and
 * hasn't hit their ceiling has this flat per-day chance to raise, by this
 * fraction of their remaining gap to it (their first successful raise lands
 * at the reserve price plus a step from there, not a step from ¥0 — Sprint
 * 19b). A short (flash) auction gives rivals few chances to ever escalate
 * far, which is exactly where "won cheap" naturally comes from — no separate
 * "sometimes let the player win" rule needed.
 *
 * `AUCTION_ESCALATION_DAILY_CHANCE` retuned 0.4 -> 0.6 (Sprint 19c): verified
 * via Monte Carlo against real generated lots that raising this alone (step
 * left at 0.35) roughly halves how often a standard 3-4 day auction resolves
 * as a "steal" (price near reserve) relative to the reserve-to-buyout band,
 * while barely moving the flash (1-day) tier's own steal rate — flash stays
 * the deliberately steal-prone tier, standard/long auctions get meaningfully
 * more competitive. First-pass, openly adjustable.
 */
export const AUCTION_ESCALATION_DAILY_CHANCE = 0.6
export const AUCTION_ESCALATION_STEP_FRACTION = 0.35

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

/**
 * Auction lot duration by rarity (Sprint 19 decision 1): replaces the old
 * flat 7-day window for every lot with a variable duration, so an auction
 * becomes a real multi-day event whose length itself signals how special
 * the car is. First-pass day ranges, openly adjustable.
 */
export const AUCTION_DURATION_STANDARD_RANGE_DAYS: readonly [number, number] = [2, 4]
export const AUCTION_DURATION_LONG_RANGE_DAYS: readonly [number, number] = [7, 10]
export const AUCTION_DURATION_FLASH_DAYS = 1
/** Any tier can roll a rare "flash sale" (~1 day), checked before the rarity-driven bands below. */
export const AUCTION_FLASH_CHANCE = 0.08
/** Uncommon/rare cars occasionally draw a longer sale on top of their normal standard band. */
export const AUCTION_LONG_CHANCE_UNCOMMON_RARE = 0.25

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
