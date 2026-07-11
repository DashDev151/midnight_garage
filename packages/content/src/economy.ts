import { z } from 'zod'

/** One yen/count value per auction tier - the same shape `AUCTION_LOTS_PER_TIER`
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

/**
 * Sprint 20 step 0 (maintainer ask, 2026-07-11): the content law says
 * designer-tunable numbers live in JSON, not in code - in practice the
 * economy/auction family lived in `sim/constants.ts` (plus a stray
 * `STARTING_CASH_YEN` in `sim/newGame.ts`). This schema + `data/economy.json`
 * fix that, threaded through `SimContext` like every other content file.
 *
 * This stage is a pure relocation: every value in `economy.json` is
 * identical to what the old TS constants held (golden-master sim test
 * hashes are the proof the move changed no behavior). The new Sprint 20
 * auction-rework knobs (demand ceiling, overnight counter, turnout bands,
 * etc.) are NOT part of this schema yet - they're born here only once the
 * bidding rework actually consumes them.
 */
export const EconomyConfigSchema = z.object({
  /**
   * Day-1 starting cash (was `STARTING_CASH_YEN` in sim/newGame.ts). Balance-
   * harness finding (Sprint 03): 100 days of `WEEKLY_RENT_YEN` (Y1,260,000)
   * almost exactly consumed the original economy-v0.md draft of Y1,200,000,
   * leaving zero operating margin for any strategy - even one with
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
  /**
   * Seller's floor under a deal, as a fraction of the lot's GUIDE VALUE
   * (`bidding.ts`'s `anchorValueYen` = `marketValueYen`, the Sprint 27
   * restoration-bill `instanceValue`) - NOT book value. Sprint 27 (Sprint 30
   * decision 2 pulled forward) rebased `reserveYen` off the guide value so the
   * reserve moves with a specific worn car instead of a static per-model
   * constant; the old 0.4 was calibrated against book value and is meaningless
   * on this basis (a book-value reserve sat above most worn cars' actual guide
   * value, seizing the whole auction market). 0.5 is Sprint 30 decision 2's
   * proposed value on the new basis (GDD 6.5).
   */
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
   * best-interested-buyer valuation the demand ceiling anchors to) - the
   * floor half of `computeBuyoutPriceYen`'s `max(anchor * premium, current +
   * increment)`. Sprint 20: re-pointed from book value (was 1.1x book) to
   * the value anchor and raised to 1.25x, since wholesale clearing now runs
   * ~0.6-0.8x value - buyout needs real separation from a patient bid to stay
   * a price-not-forbidden deterrent (maintainer decision 2).
   */
  AUCTION_BUYOUT_PREMIUM: z.number().positive(),
  /**
   * Sprint 20 (auction rework II): dealers pay resale minus recon minus
   * margin - the demand ceiling's wholesale anchor, applied to
   * `anchorValueYen` before the lot-seeded spread.
   */
  AUCTION_WHOLESALE_FRACTION: z.number().positive().max(1),
  /** Lot-to-lot turnout spread (bell-curve standard deviation, as a fraction
   * of the wholesale-anchored center) the demand ceiling rolls around. */
  AUCTION_DEMAND_SPREAD_SD: z.number().positive(),
  /** Chance a lot rolls a weak-turnout day, multiplying its demand ceiling by
   * `AUCTION_THIN_TURNOUT_FACTOR` - the weak-day tail where steals live. */
  AUCTION_THIN_TURNOUT_CHANCE: z.number().min(0).max(1),
  AUCTION_THIN_TURNOUT_FACTOR: z.number().positive().max(1),
  /** Overnight odds the standing dealers answer with one increment toward
   * the demand ceiling - unconditional on who currently leads. */
  AUCTION_COUNTER_CHANCE: z.number().min(0).max(1),
  /** Consecutive quiet overnight steps (no raise) before a lot hammers to
   * whoever currently leads (maintainer decision 1). */
  AUCTION_QUIET_DAYS_TO_HAMMER: z.number().int().positive(),
  /** Bid increment as a fraction of book value, floored/rounded to Y10,000 -
   * one ladder for the player, dealers, and bots alike. */
  AUCTION_BID_INCREMENT_FRACTION: z.number().positive(),
  /** Turnout-word thresholds over `demandCeiling / (anchorValueYen *
   * AUCTION_WHOLESALE_FRACTION)`: thin below the first, packed above the
   * second, steady between - flavor only, price is king. */
  AUCTION_TURNOUT_BANDS: AscendingFractionPairSchema,
  /**
   * Sprint 21 (per-component weights); Sprint 26 decision 4 replaced the old
   * hand-authored `componentValueWeights` with a cost-weighted mean of band
   * factors; Sprint 27 replaces THAT shim outright with a transparent
   * restoration-bill deduction (`marketValueYen`'s own doc comment carries
   * the formula) - `hassleFactor`/`floorFraction` are its two tunables.
   */
  valuation: z.object({
    /**
     * Sprint 27 decision 1: `restorationBill`'s weight in `instanceValue =
     * max(floor, cleanValue - hassleFactor * restorationBill) +
     * installedPartsValueYen`. Above 1.0 (propose 1.2) so a buyer discounts
     * MORE than the raw bill - the old 1.3 issue-penalty multiplier's intent,
     * now applied to a real, transparent number instead of a hidden one.
     */
    hassleFactor: z.number().positive(),
    /** Sprint 27 decision 1: `instanceValue`'s floor as a fraction of clean
     * value - a wreck whose restoration bill would drive it below zero still
     * has chassis/parts scrap value, never worth literally nothing. */
    floorFraction: z.number().min(0).max(1),
    /** Installed-part value retention: a part is worth this fraction of its
     * catalog price toward the car's market value (real markets: mods return
     * cents on the yen, they don't multiply the chassis price). */
    partsRetention: z.number().min(0).max(1),
    /** Multiplier applied to a genuine-period installed part's contribution
     * (on top of `partsRetention`) - period-correct parts hold more value
     * than a modern reproduction of the same catalog part. */
    genuinePeriodMultiplier: z.number().positive(),
    /** Buyer-taste spread (decision 4): `valuateCarForBuyer` bounds its taste
     * multiplier to `[1 - tasteSpread, 1 + tasteSpread]` around `marketValueYen`
     * - how well a buyer archetype's stat weights fit this car, never whether
     * the car is worth anything (that's `marketValueYen` alone). */
    tasteSpread: z.number().min(0).max(1),
    /** `listPubliclyAskingPrice`'s "slow, market price" premium over the
     * plain average interested-buyer valuation - the reward for patience that
     * used to come from double-applying market heat (removed, decision 6:
     * heat now applies exactly once, inside `marketValueYen`). */
    listingPatiencePremium: z.number().positive(),
    /**
     * Sprint 27 decision 4: a bot's walk-away target
     * (`bots/buyoutHelpers.ts`'s `walkAwayTargetYen`) is `instanceValue x
     * strategyMultiplier` times a small private spread, bell-shaped around
     * 1.0 with this standard deviation - even though every bidder reads the
     * identical transparent bands, no two private valuations of the same car
     * land exactly on the shared anchor.
     */
    walkAwaySpread: z.number().nonnegative(),
  }),
  /**
   * Sprint 21: deterministic supply/demand market pressure - replaces the
   * old pure random walk (`driftMarketHeat`'s +/-4 weekly). Three signals
   * (a slow per-model demand wave, a supply-glut penalty, a flood-the-market
   * penalty) combine into a target `marketHeat` value each model's actual
   * heat smooths toward weekly. See `marketHeat.ts` for the formula.
   */
  marketPressure: z
    .object({
      /** Amplitude (+/- percent) of each model's slow demand wave. */
      WAVE_AMPLITUDE: z.number().nonnegative(),
      /** Wave period, in weeks - a full up-and-down cycle. */
      WAVE_PERIOD_WEEKS: z.number().int().positive(),
      /** Heat-percent penalty per unit of decayed `lotSupply` (fresh catalog
       * lots of this model, exponentially decayed). */
      SUPPLY_WEIGHT: z.number().nonnegative(),
      /** Heat-percent penalty per unit of decayed `playerSales` (the
       * player's own recent sales of this model - flooding the market). */
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
       * per weekly update - smoothing so heat drifts rather than jumps. */
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
   * (decision 8 - same values, zero behavior change this sprint) so a future
   * sprint can retune them as data instead of a code edit.
   * `powerNormalizationCeiling` isn't a `computeDerivedStats` input - it
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
   * Sprint 26: the banded parts model's own tunables. Replaces Sprint 22's
   * `issues` block entirely - the hidden-issue/inspection system is paused
   * and removed (maintainer decision 2026-07-11; see TODO.md), and every
   * number that used to live there (repair cost, severity, labor sizing) is
   * now either a per-part content field (`parts-taxonomy.json`'s
   * `stepCostYen`) or gone outright.
   */
  bands: z.object({
    /** Value factor per condition band (decision 1) - mint's baseline 1.0
     * down to scrap's near-worthless floor. Feeds the cost-weighted value
     * shim (decision 4) the same way the old weighted-condition-percent
     * used to feed `conditionFactor` directly. */
    bandFactors: z.object({
      mint: z.number().positive(),
      fine: z.number().positive(),
      worn: z.number().positive(),
      poor: z.number().positive(),
      scrap: z.number().positive(),
    }),
    /** Save-migration thresholds (decision 11): a pre-Sprint-26 0-100
     * condition maps to `mint` at or above the first breakpoint, `fine` at
     * or above the second, `worn` at or above the third, `poor` at or above
     * the fourth, and `scrap` below that. */
    migrationThresholds: z
      .object({
        mint: z.number().int().min(0).max(100),
        fine: z.number().int().min(0).max(100),
        worn: z.number().int().min(0).max(100),
        poor: z.number().int().min(0).max(100),
      })
      .refine((t) => t.mint >= t.fine && t.fine >= t.worn && t.worn >= t.poor, {
        message: 'migrationThresholds must be non-increasing: mint >= fine >= worn >= poor',
      }),
    /** Fraction of `stockReplacementPriceYen` a scrap `PartInstance` sells
     * for (decision 6) - "pennies on the yen." */
    scrapValueFraction: z.number().min(0).max(1),
  }),
  /**
   * Sprint 23 decision 1: replaces the old single all-or-nothing quality bar
   * (`QUALITY_SALE_MIN_CONDITION`/`_MIN_AUTHENTICITY`/`_REPUTATION_BONUS`,
   * retired from constants.ts) with two reachable tiers. Clean requires only
   * player effort (no part below the band bar, Sprint 26 decision 9);
   * concours additionally requires authenticityPercent to clear its own bar
   * - a value the player can never raise, rolled 60-95 at generation, so
   * concours stays a genuine bonus for a well-matched car rather than the
   * only way to earn anything at all. Lemon's penalty and thresholds
   * (`LEMON_MAX_AVERAGE_CONDITION` etc., Sprint 26 decision 9) live in
   * `sim/constants.ts`, unchanged in kind since Sprint 15.
   */
  reputation: z.object({
    /** Every part's band must be at or above this to count as a clean sale -
     * a floor per part (Sprint 23's fix for "seven great parts can't hide
     * one neglected one"), reachable by effort alone, unlike the
     * authenticity roll below. */
    cleanSaleMinBand: z.enum(['scrap', 'poor', 'worn', 'fine', 'mint']),
    cleanSaleBonus: z.number().int().nonnegative(),
    /** Concours also requires the car's (unmodifiable) authenticityPercent to
     * clear this bar - on top of, not instead of, the clean band bar. */
    concoursSaleMinAuthenticityPercent: z.number().int().min(0).max(100),
    /** Concours bonus; replaces (does not stack with) cleanSaleBonus. */
    concoursSaleBonus: z.number().int().nonnegative(),
  }),
})

export type EconomyConfig = z.infer<typeof EconomyConfigSchema>
