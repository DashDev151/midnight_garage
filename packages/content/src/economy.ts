import { z } from 'zod'

/** One yen/count value per auction tier — the same shape `AUCTION_LOTS_PER_TIER`
 * and `AUCTION_TRAVEL_FEE_YEN` used as `Readonly<Record<AuctionTier, number>>`
 * in sim/constants.ts before this file existed. Explicit per-tier keys (not a
 * generic `z.record`) so a missing tier fails validation, matching
 * `FacilitiesSchema`'s existing preference for explicit shape over a bare map. */
const ByAuctionTierSchema = z.object({
  'local-yard': z.number().int().nonnegative(),
  regional: z.number().int().nonnegative(),
  premium: z.number().int().nonnegative(),
  'collector-network': z.number().int().nonnegative(),
})

/** An inclusive [min, max] day range, min <= max. */
const DayRangeSchema = z
  .tuple([z.number().int().positive(), z.number().int().positive()])
  .refine(([min, max]) => min <= max, { message: 'range min must be <= max' })

/** An ascending [low, high] pair of fractional thresholds, low <= high. */
const AscendingFractionPairSchema = z
  .tuple([z.number().positive(), z.number().positive()])
  .refine(([low, high]) => low <= high, { message: 'pair low must be <= high' })

/** An ascending [low, high] pair of 0-100 severity-percent breakpoints. */
const AscendingSeverityPairSchema = z
  .tuple([z.number().int().min(0).max(100), z.number().int().min(0).max(100)])
  .refine(([low, high]) => low <= high, { message: 'pair low must be <= high' })

/** Labor slots for [minor, serious, severe] issue bands, each a positive int. */
const LaborSlotsByBandSchema = z.tuple([
  z.number().int().positive(),
  z.number().int().positive(),
  z.number().int().positive(),
])

/**
 * Sprint 21: per-component weight (0-1) toward `conditionFactor`'s weighted
 * condition — the 8 real components (same set as `ComponentIdSchema` in
 * tags.ts), explicit keys rather than a generic `z.record` so a missing
 * component fails validation instead of silently contributing 0. Refined to
 * sum to 1.0 (within floating-point tolerance) so the weighted average stays
 * a genuine 0-100 percentage.
 */
const ComponentValueWeightsSchema = z
  .object({
    engine: z.number().min(0).max(1),
    body: z.number().min(0).max(1),
    drivetrain: z.number().min(0).max(1),
    suspension: z.number().min(0).max(1),
    interior: z.number().min(0).max(1),
    brakes: z.number().min(0).max(1),
    wheels: z.number().min(0).max(1),
    forcedInduction: z.number().min(0).max(1),
  })
  .refine((weights) => Math.abs(Object.values(weights).reduce((sum, w) => sum + w, 0) - 1) < 1e-6, {
    message: 'componentValueWeights must sum to 1.0',
  })

/**
 * Sprint 20 step 0 (maintainer ask, 2026-07-11): the content law says
 * designer-tunable numbers live in JSON, not in code — in practice the
 * economy/auction family lived in `sim/constants.ts` (plus a stray
 * `STARTING_CASH_YEN` in `sim/newGame.ts`). This schema + `data/economy.json`
 * fix that, threaded through `SimContext` like every other content file.
 *
 * This stage is a pure relocation: every value in `economy.json` is
 * identical to what the old TS constants held (golden-master sim test
 * hashes are the proof the move changed no behavior). The new Sprint 20
 * auction-rework knobs (demand ceiling, overnight counter, turnout bands,
 * etc.) are NOT part of this schema yet — they're born here only once the
 * bidding rework actually consumes them.
 */
export const EconomyConfigSchema = z.object({
  /**
   * Day-1 starting cash (was `STARTING_CASH_YEN` in sim/newGame.ts). Balance-
   * harness finding (Sprint 03): 100 days of `WEEKLY_RENT_YEN` (Y1,260,000)
   * almost exactly consumed the original economy-v0.md draft of Y1,200,000,
   * leaving zero operating margin for any strategy — even one with
   * genuinely profitable trades goes under from a single bad run or a slow
   * start. Bumped to give real working capital; economy-v0.md updated to
   * match.
   */
  STARTING_CASH_YEN: z.number().int().positive(),
  /**
   * Weekly rent, deducted alongside staff wages on 7-day boundaries. Set to 0
   * for Sprints 20-22 (maintainer decision 2026-07-10) until the economy
   * worked end-to-end; restored in Sprint 23 decision 4's sizing rule: 0.3 x
   * measured median weekly gross margin (M1: 274 local-yard flips, median
   * margin Y168,569 at 16 median days-per-flip -> 0.4375 flips/week, well
   * under the 2/week cap), rounded to the nearest Y10,000 -> Y20,000. "Real
   * but beatable" (sprint23.md's Goal) at this size relative to the median
   * per-flip margin, not a guess.
   */
  WEEKLY_RENT_YEN: z.number().int().nonnegative(),
  /** Seller's floor under a deal, as a fraction of book value (GDD 6.5). */
  AUCTION_RESERVE_PRICE_FRACTION: z.number().positive().max(1),
  /** New lots per tier on each weekly catalog refresh. */
  AUCTION_LOTS_PER_TIER: ByAuctionTierSchema,
  /** Standard-tier lot duration band, inclusive, in days (Sprint 19 decision 1). */
  AUCTION_DURATION_STANDARD_RANGE_DAYS: DayRangeSchema,
  /** Long-sale duration band, inclusive, in days. */
  AUCTION_DURATION_LONG_RANGE_DAYS: DayRangeSchema,
  /** Flash-sale duration, in days. */
  AUCTION_DURATION_FLASH_DAYS: z.number().int().positive(),
  /** Chance any lot rolls a flash sale instead of its normal duration band. */
  AUCTION_FLASH_CHANCE: z.number().min(0).max(1),
  /** Chance an uncommon/rare lot rolls the long band instead of standard. */
  AUCTION_LONG_CHANCE_UNCOMMON_RARE: z.number().min(0).max(1),
  /** Inspection travel fee by tier. */
  AUCTION_TRAVEL_FEE_YEN: ByAuctionTierSchema,
  /**
   * Instant-buyout premium over `bidding.ts`'s `anchorValueYen` (the same
   * best-interested-buyer valuation the demand ceiling anchors to) — the
   * floor half of `computeBuyoutPriceYen`'s `max(anchor * premium, current +
   * increment)`. Sprint 20: re-pointed from book value (was 1.1x book) to
   * the value anchor and raised to 1.25x, since wholesale clearing now runs
   * ~0.6-0.8x value — buyout needs real separation from a patient bid to stay
   * a price-not-forbidden deterrent (maintainer decision 2).
   */
  AUCTION_BUYOUT_PREMIUM: z.number().positive(),
  /**
   * Sprint 20 (auction rework II): dealers pay resale minus recon minus
   * margin — the demand ceiling's wholesale anchor, applied to
   * `anchorValueYen` before the lot-seeded spread.
   */
  AUCTION_WHOLESALE_FRACTION: z.number().positive().max(1),
  /** Lot-to-lot turnout spread (bell-curve standard deviation, as a fraction
   * of the wholesale-anchored center) the demand ceiling rolls around. */
  AUCTION_DEMAND_SPREAD_SD: z.number().positive(),
  /** Chance a lot rolls a weak-turnout day, multiplying its demand ceiling by
   * `AUCTION_THIN_TURNOUT_FACTOR` — the weak-day tail where steals live. */
  AUCTION_THIN_TURNOUT_CHANCE: z.number().min(0).max(1),
  AUCTION_THIN_TURNOUT_FACTOR: z.number().positive().max(1),
  /** Overnight odds the standing dealers answer with one increment toward
   * the demand ceiling — unconditional on who currently leads. */
  AUCTION_COUNTER_CHANCE: z.number().min(0).max(1),
  /** Consecutive quiet overnight steps (no raise) before a lot hammers to
   * whoever currently leads (maintainer decision 1). */
  AUCTION_QUIET_DAYS_TO_HAMMER: z.number().int().positive(),
  /** Bid increment as a fraction of book value, floored/rounded to Y10,000 —
   * one ladder for the player, dealers, and bots alike. */
  AUCTION_BID_INCREMENT_FRACTION: z.number().positive(),
  /** Turnout-word thresholds over `demandCeiling / (anchorValueYen *
   * AUCTION_WHOLESALE_FRACTION)`: thin below the first, packed above the
   * second, steady between — flavor only, price is king. */
  AUCTION_TURNOUT_BANDS: AscendingFractionPairSchema,
  /**
   * Sprint 21 (value model): per-component weight (0-1, sum 1.0) a car's 8
   * real components contribute to `conditionFactor` — an engine matters far
   * more to what a car is worth than its wheels. Explicit per-component keys
   * (not a generic `z.record`), matching `ByAuctionTierSchema`'s existing
   * preference for explicit shape over a bare map.
   */
  valuation: z.object({
    componentValueWeights: ComponentValueWeightsSchema,
    /** `conditionFactor`'s floor at weighted condition 0 — a wreck still has
     * chassis/parts scrap value, never worth literally nothing. */
    conditionFloor: z.number().nonnegative(),
    /** `conditionFactor`'s ceiling at weighted condition 100 — a perfect
     * restoration clears book value, giving genuine headroom for a profitable
     * flip (mirrors the old `valuateCarForBuyer` fit-component's own note on
     * why a formula that can never clear book breaks the economy). */
    conditionCeiling: z.number().positive(),
    /** Curve shape between floor and ceiling: `(weighted/100)^exponent`. */
    conditionExponent: z.number().positive(),
    /** Installed-part value retention: a part is worth this fraction of its
     * catalog price toward the car's market value (real markets: mods return
     * cents on the yen, they don't multiply the chassis price). */
    partsRetention: z.number().min(0).max(1),
    /** Multiplier applied to a genuine-period installed part's contribution
     * (on top of `partsRetention`) — period-correct parts hold more value
     * than a modern reproduction of the same catalog part. */
    genuinePeriodMultiplier: z.number().positive(),
    /** Buyer-taste spread (decision 4): `valuateCarForBuyer` bounds its taste
     * multiplier to `[1 - tasteSpread, 1 + tasteSpread]` around `marketValueYen`
     * — how well a buyer archetype's stat weights fit this car, never whether
     * the car is worth anything (that's `marketValueYen` alone). */
    tasteSpread: z.number().min(0).max(1),
    /** `listPubliclyAskingPrice`'s "slow, market price" premium over the
     * plain average interested-buyer valuation — the reward for patience that
     * used to come from double-applying market heat (removed, decision 6:
     * heat now applies exactly once, inside `marketValueYen`). */
    listingPatiencePremium: z.number().positive(),
  }),
  /**
   * Sprint 21: deterministic supply/demand market pressure — replaces the
   * old pure random walk (`driftMarketHeat`'s +/-4 weekly). Three signals
   * (a slow per-model demand wave, a supply-glut penalty, a flood-the-market
   * penalty) combine into a target `marketHeat` value each model's actual
   * heat smooths toward weekly. See `marketHeat.ts` for the formula.
   */
  marketPressure: z
    .object({
      /** Amplitude (+/- percent) of each model's slow demand wave. */
      WAVE_AMPLITUDE: z.number().nonnegative(),
      /** Wave period, in weeks — a full up-and-down cycle. */
      WAVE_PERIOD_WEEKS: z.number().int().positive(),
      /** Heat-percent penalty per unit of decayed `lotSupply` (fresh catalog
       * lots of this model, exponentially decayed). */
      SUPPLY_WEIGHT: z.number().nonnegative(),
      /** Heat-percent penalty per unit of decayed `playerSales` (the
       * player's own recent sales of this model — flooding the market). */
      SALES_WEIGHT: z.number().nonnegative(),
      /** Below this decayed `lotSupply`, a model counts as scarce and gets
       * `SCARCITY_BONUS` added to its target heat. */
      SCARCITY_THRESHOLD: z.number().nonnegative(),
      /** Flat heat-percent bonus applied when a model is scarce. */
      SCARCITY_BONUS: z.number().nonnegative(),
      /** Hard clamp floor/ceiling on the target heat any model can reach. */
      HEAT_MIN: z.number().positive(),
      HEAT_MAX: z.number().positive(),
      /** Fraction of the gap to the target each model's real heat closes,
       * per weekly update — smoothing so heat drifts rather than jumps. */
      SMOOTHING: z.number().min(0).max(1),
      /** Weekly exponential decay applied to both `marketLedger` counters
       * before they feed the target-heat formula. */
      LEDGER_DECAY: z.number().min(0).max(1),
    })
    .refine((m) => m.HEAT_MIN <= m.HEAT_MAX, {
      message: 'HEAT_MIN must be <= HEAT_MAX',
    }),
  /**
   * Sprint 21: `derivedStats.ts`'s five magic numbers, moved here verbatim
   * (decision 8 — same values, zero behavior change this sprint) so a future
   * sprint can retune them as data instead of a code edit.
   * `powerNormalizationCeiling` isn't a `computeDerivedStats` input — it
   * feeds `valuateCarForBuyer`'s taste normalization instead (the old
   * `POWER_NORMALIZATION_CEILING` constant), but lives in this block since
   * it's part of the same "stat formula magic numbers" family.
   */
  statFormulas: z.object({
    /** Power at 0 engine condition, as a fraction of stock power (floor);
     * scales linearly up to 1.0 (full stock power) at 100 condition. */
    powerConditionFloor: z.number().min(0).max(1),
    /** Handling's base term, scaled by suspension condition / 100. */
    handlingBase: z.number().positive(),
    /** Curb weight (kg) divisor subtracted from handling's base term. */
    handlingWeightDivisor: z.number().positive(),
    /** Style's cap at 100 body condition. */
    styleCap: z.number().positive(),
    /** Reliability's cap at 100 average engine+drivetrain condition. */
    reliabilityCap: z.number().positive(),
    /** Soft power ceiling `valuateCarForBuyer` normalizes taste's power term
     * against (was the file-local `POWER_NORMALIZATION_CEILING` constant in
     * valuation.ts). */
    powerNormalizationCeiling: z.number().positive(),
  }),
  /**
   * Sprint 22: hidden issues become a real, priced defect instead of a
   * one-time condition subtraction. `issueRepairCostYen` is computed inline
   * in `issues.ts` (`repairCostBaseYen * severityPercent / costDivisor`,
   * rounded to the nearest Y1,000) — everything else here tunes how that
   * cost turns into a market-value penalty (owned cars) or a risk discount
   * (auction lots), and how much labor fixing one costs.
   */
  issues: z.object({
    /** Owned/sale-side penalty multiplier (decision 4): an unrepaired issue
     * costs more in lost sale value than it costs to actually fix — the
     * incentive that makes fixing-before-selling profitable by construction. */
    penaltyMultiplier: z.number().positive(),
    /** Weight applied to a model's average issue-repair-cost fraction when
     * computing its auction lot risk discount (decision 5). */
    riskDiscountWeight: z.number().min(0).max(1),
    /** Hard cap on how far a model's known issue risk can discount its
     * auction anchor, regardless of how bad its hiddenIssueWeights look. */
    maxRiskDiscount: z.number().min(0).max(1),
    /** [minor-vs-serious, serious-vs-severe] severity-percent breakpoints —
     * also the labor band's own breakpoints (decision 3). */
    severityBands: AscendingSeverityPairSchema,
    /** Labor slots to fix an issue, by band: [minor, serious, severe]. */
    laborSlotsByBand: LaborSlotsByBandSchema,
    /** Divisor in `repairCostBaseYen * severityPercent / costDivisor` — a
     * severity roll exactly equal to this value costs exactly the catalog's
     * base repair cost. */
    costDivisor: z.number().positive(),
    /** Decision 6: an unrepaired issue at or above this severity triggers
     * the lemon reputation penalty on sale, on top of the existing
     * condition-based lemon check (Sprint 15) — a distinct number from
     * `severityBands` (those size labor, not reputation). */
    lemonSeverityThreshold: z.number().int().min(0).max(100),
  }),
  /**
   * Sprint 23 decision 1: replaces the old single all-or-nothing quality bar
   * (`QUALITY_SALE_MIN_CONDITION`/`_MIN_AUTHENTICITY`/`_REPUTATION_BONUS`,
   * retired from constants.ts) with two reachable tiers. Clean requires only
   * player effort (every component's effective condition clears the bar, no
   * unrepaired issues); concours additionally requires authenticityPercent
   * to clear its own bar — a value the player can never raise, rolled 60-95
   * at generation, so concours stays a genuine bonus for a well-matched car
   * rather than the only way to earn anything at all. Lemon's penalty and
   * thresholds (`LEMON_MAX_AVERAGE_CONDITION` etc.) are untouched by this
   * block, unchanged since Sprint 15.
   */
  reputation: z.object({
    /** Every one of the 8 components' effective condition must clear this to
     * count as a clean sale — stricter than an average (Sprint 23's fix for
     * "seven great components can't hide one neglected one"), but reachable
     * by effort alone, unlike the authenticity roll below. */
    cleanSaleMinConditionPercent: z.number().int().min(0).max(100),
    cleanSaleBonus: z.number().int().nonnegative(),
    /** Concours also requires the car's (unmodifiable) authenticityPercent to
     * clear this bar — on top of, not instead of, the clean condition bar. */
    concoursSaleMinAuthenticityPercent: z.number().int().min(0).max(100),
    /** Concours bonus; replaces (does not stack with) cleanSaleBonus. */
    concoursSaleBonus: z.number().int().nonnegative(),
  }),
})

export type EconomyConfig = z.infer<typeof EconomyConfigSchema>
