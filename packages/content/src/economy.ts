import { z } from 'zod'
import { PartFitmentClassSchema } from './partFitment'
import { CarPartIdSchema, ConditionBandSchema, ReputationTierSchema } from './tags'
import { ToolTierSchema } from './toolLines'

/**
 * One non-negative weight per `CarPartId` (Sprint 32) - explicit per-part
 * keys (not a generic `z.record`), matching this codebase's established
 * preference (`ByAuctionTierSchema` etc.) for a missing key to fail
 * validation rather than silently default to 0. Used by
 * `partsGeneration.missingSlotWeightByPart` (decision 6): a part's weight
 * times `missingSlotBaseChance` is its actual per-slot chance of generating
 * MISSING instead of a fresh stock part.
 */
const ByCarPartIdWeightSchema = z.object({
  block: z.number().nonnegative(),
  internals: z.number().nonnegative(),
  headValvetrain: z.number().nonnegative(),
  camsTiming: z.number().nonnegative(),
  intake: z.number().nonnegative(),
  exhaust: z.number().nonnegative(),
  fuelSystem: z.number().nonnegative(),
  ignitionEcu: z.number().nonnegative(),
  cooling: z.number().nonnegative(),
  forcedInduction: z.number().nonnegative(),
  gearbox: z.number().nonnegative(),
  clutch: z.number().nonnegative(),
  differential: z.number().nonnegative(),
  driveline: z.number().nonnegative(),
  chassis: z.number().nonnegative(),
  dampers: z.number().nonnegative(),
  springs: z.number().nonnegative(),
  antiRollBars: z.number().nonnegative(),
  steering: z.number().nonnegative(),
  brakePadsDiscs: z.number().nonnegative(),
  brakeCalipersLines: z.number().nonnegative(),
  rims: z.number().nonnegative(),
  tyres: z.number().nonnegative(),
  panels: z.number().nonnegative(),
  paint: z.number().nonnegative(),
  underbody: z.number().nonnegative(),
  aero: z.number().nonnegative(),
  seats: z.number().nonnegative(),
  dashGauges: z.number().nonnegative(),
})

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

/** Per-tier fraction in [0, 1] - the probability-shaped sibling of
 * `ByAuctionTierSchema` (which is int counts/yen), reused for Sprint 30's
 * per-tier nightly bid-cohort chance. */
const ByAuctionTierFractionSchema = z.object({
  'local-yard': z.number().min(0).max(1),
  regional: z.number().min(0).max(1),
  premium: z.number().min(0).max(1),
  'collector-network': z.number().min(0).max(1),
})

/** Per-tier non-negative rate (Sprint 30 decision 4: expected new lots/day,
 * not necessarily a whole number - `rollDailySpawnCount` in catalogs.ts turns
 * it into an actual integer count each day). */
const ByAuctionTierRateSchema = z.object({
  'local-yard': z.number().nonnegative(),
  regional: z.number().nonnegative(),
  premium: z.number().nonnegative(),
  'collector-network': z.number().nonnegative(),
})

/** One non-negative multiplier per `RarityTier` (Sprint 31) - the offer-chance
 * desirability weight per car tier (`selling.offerChanceByTier`). */
const ByRarityTierMultiplierSchema = z.object({
  shitbox: z.number().nonnegative(),
  common: z.number().nonnegative(),
  uncommon: z.number().nonnegative(),
  rare: z.number().nonnegative(),
  gaisha: z.number().nonnegative(),
  legend: z.number().nonnegative(),
})

/**
 * A piecewise-linear curve (Sprint 30 decision 1): ascending `[x, y]`
 * breakpoints a designer can draw directly in JSON. Reads as "y is this at
 * x=breakpoint[i][0]"; interpolated linearly between neighboring breakpoints,
 * clamped to the first/last y outside the breakpoint range. Used for the
 * mileage factor in `marketValue.ts`'s clean-value formula and (Sprint 34) the
 * generation mileage-by-age / condition-by-mileage curves. Both x and y are
 * non-negative: a curve's y can legitimately be 0 (a brand-new car's minimum
 * mileage floor is 0 km, `mileageRangeMinByAgeYears`'s first breakpoint).
 */
export const CurveSchema = z
  .array(z.tuple([z.number().nonnegative(), z.number().nonnegative()]))
  .min(2)
  .refine((points) => points.every((p, i) => i === 0 || p[0] > points[i - 1]![0]), {
    message: 'curve breakpoints must have strictly ascending x values',
  })

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
   * Day-1 starting cash (was `STARTING_CASH_YEN` in sim/newGame.ts). Retuned
   * 1,500,000 -> 300,000 (Sprint 59, playtest item 12: the old figure gave a
   * fresh career several free flips of runway before the economy's own risk
   * ever mattered). Derived, not asserted: pooling the shitbox and common
   * roster tiers across many generated lots, the median guide value is
   * ~Y133,795 and the median full-restore bill ~Y80,800; buying at the new
   * 0.6 reserve (~Y80,277) plus that restoration (~Y161,077 total) plus four
   * weeks' rent (Y80,000) plus an early parts float (~Y30,000) gives a
   * derived floor of ~Y271,000 - one full cheapest-tier flip cycle. 300,000
   * sits a real margin above that floor, not bare survival. See
   * `docs/sprints/sprint59.md`'s Exit for the full working.
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
   * Sprint 45: the daily cost of leaving a car in the one grace/"double
   * parking" overflow slot (`facilities.ts`'s `resolveGraceParking`) - charged
   * every End Day the slot is still occupied, same unconditional-deduction
   * shape as `WEEKLY_RENT_YEN` (no floor check; going negative is an already-
   * accepted possibility elsewhere in this economy). First-pass number,
   * explicit maintainer-tuning bait.
   */
  DOUBLE_PARKING_FINE_YEN: z.number().int().nonnegative(),
  /**
   * Seller's floor under a deal, as a fraction of the lot's GUIDE VALUE
   * (`bidding.ts`'s `anchorValueYen` = `marketValueYen`, the Sprint 27
   * restoration-bill `instanceValue`) - NOT book value. Sprint 27 (Sprint 30
   * decision 2 pulled forward) rebased `reserveYen` off the guide value so the
   * reserve moves with a specific worn car instead of a static per-model
   * constant; the old 0.4 was calibrated against book value and is meaningless
   * on this basis (a book-value reserve sat above most worn cars' actual guide
   * value, seizing the whole auction market). 0.5 was Sprint 30 decision 2's
   * proposed value on the new basis (GDD 6.5).
   *
   * Retuned 0.5 -> 0.6 (Sprint 59, playtest item 19): a pure SELLER FLOOR, not
   * the price-setter - opening low and letting a lot go unsold below this line
   * is deliberately kept, so bidding still reads as a hunt. The instant-flip
   * exploit this fixes lived in contestation (`AUCTION_WHOLESALE_FRACTION`
   * below), not the floor; this edit only trims how cheap an uncontested
   * open-and-hammer lot could still be.
   */
  AUCTION_RESERVE_PRICE_FRACTION: z.number().positive().max(1),
  /** New lots per tier on DAY 1 ONLY (`newGame.ts`'s `createInitialGameState`,
   * via `catalogs.ts`'s `refreshCatalogs`) - a full opening board so a fresh
   * career isn't empty (Sprint 10). Every day after that, arrivals are the
   * Sprint 30 decision 4 daily trickle (`AUCTION_DAILY_SPAWN_RATE` below,
   * `catalogs.ts`'s `generateDailyAuctionArrivals`), not this fixed batch. */
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
   * margin. Sprint 30 decision 3 reuses this as the CENTER each individual
   * rival cohort's private valuation (`bidding.ts`'s `privateValuationYen`)
   * spreads around, replacing the old single lot-wide demand ceiling this
   * fraction used to anchor. Retuned 0.85 -> 0.75 (Sprint 55 decision 3,
   * economy-bible.md law 4's retune pass): Sprint 54's gentler one-slope
   * value law raised anchorValueYen for a damaged car far above its old
   * floor-collapsed level, while `AUCTION_BID_INCREMENT_FRACTION` stayed
   * pegged to the car's static `bookValueYen` - the same fixed-yen raise now
   * represents a SMALLER fraction of the (higher) anchor, so the same
   * contestation rules climbed further before running out of eligible
   * cohorts. Re-measured 2026-07-14: the historical 84% steal-tail problem
   * had flipped into the opposite extreme (36.1% frenzy vs a 15% ceiling,
   * steal down to 7.3% against a 10% floor) - lowering the wholesale center
   * back toward its pre-2026-07-12 value pulls rival private valuations back
   * down relative to the new, less-discounted anchor.
   *
   * Retuned 0.75 -> 0.97 (Sprint 59, playtest item 19: the ~156k unimproved
   * instant-flip bug). Root cause was here, not the reserve: rival cohorts
   * were pricing like wholesalers with a guaranteed retail exit, so even a
   * CONTESTED close sat far below guide value while walk-in sales paid ~0.99x
   * guide - the ~49% gap was structural. Raising this to 0.97 means rivals now
   * price close to guide (their margin has to come from the work, exactly
   * like the player's), so a contested close converges on fair value. Lots
   * still open at the (lower) reserve and can occasionally go uncontested and
   * cheap - the fix is in what a REAL bidding war converges to, not in
   * forbidding cheap opens. A first-instinct fix (a high reserve floor
   * instead) was explicitly rejected by the maintainer: it would flatten
   * bidding into a dead sliver and kill the auction as a game.
   */
  AUCTION_WHOLESALE_FRACTION: z.number().positive().max(1),
  /** Consecutive quiet overnight steps (no raise) before a lot hammers to
   * whoever currently leads (maintainer decision 1). */
  AUCTION_QUIET_DAYS_TO_HAMMER: z.number().int().positive(),
  /** Bid increment as a fraction of book value, floored/rounded to Y10,000 -
   * one ladder for the player, dealers, and bots alike. */
  AUCTION_BID_INCREMENT_FRACTION: z.number().positive(),
  /**
   * Sprint 30 decision 4: expected new lots per day per tier, replacing the
   * old `day % 7` weekly dump for every day AFTER day 1 (day 1 itself still
   * seeds the full `AUCTION_LOTS_PER_TIER` batch - see that field's own doc
   * comment). Tuned ABOVE naive weekly-volume parity (`AUCTION_LOTS_PER_TIER
   * / 7`) per the maintainer's explicit ask for more lots than a player can
   * realistically chase, not merely to preserve the old pace.
   * `catalogs.ts`'s `rollDailySpawnCount` turns this real-valued rate into an
   * actual integer count each day.
   */
  AUCTION_DAILY_SPAWN_RATE: ByAuctionTierRateSchema,
  /**
   * Sprint 66 (playtest 2026-07-15 item 6a): the youngest a generated car may
   * be, in years, when a real calendar year is known. The maintainer's point:
   * *"why is the car coming to a backyard mechanic if it was just bought from
   * a dealer?"* - a current-model-year car does not turn up at a local yard.
   * `generateAuctionCarInstance` clamps the rolled `year` to at most
   * `currentYear - AUCTION_MIN_AGE_YEARS`, never below the model's own
   * `spec.yearFrom` (a car cannot predate its own model - a model released
   * within this window simply generates at its release year). Inert when the
   * caller passes no finite `currentYear`.
   */
  AUCTION_MIN_AGE_YEARS: z.number().int().nonnegative(),
  /**
   * Sprint 30 decision 3: the daily bidder-interest process replacing the
   * old one-shot demand ceiling (Sprint 20) and its Sprint 25 interim patches
   * (both deleted, decision 5). Turnout is rolled once per lot at creation
   * (`auctions.ts`'s `generateAuctionCatalog`) as a `TurnoutBand`; everything
   * below turns that band, plus tonight's price-vs-guide-value gap, into how
   * many bid increments (0-2) land overnight (`bidding.ts`'s
   * `advanceLotOvernight`).
   */
  auctionInterest: z
    .object({
      /** Base nightly odds a single active rival cohort places a bid, before
       * the value-gap adjustment below - first-pass, openly tunable. */
      perCohortBidChance: ByAuctionTierFractionSchema,
      /**
       * Each rival cohort's private-valuation spread (`bidding.ts`'s
       * `privateValuationYen`, passed as its `spreadSD` override), BY the
       * lot's own rolled `TurnoutBand` - deliberately wider than a bot's own
       * tight `valuation.walkAwaySpread` (0.05, models one bidder's own
       * confident read of a car's value) and deliberately narrower for a
       * packed field than a thin one (behavioral proof (c): a packed
       * field's cohorts read as more of a consensus crowd - individually
       * more tightly clustered around the wholesale center - so its winning
       * price rarely reaches a single outlier's tail value; a thin field's
       * one or two active bidders are comparatively idiosyncratic, wide
       * enough that their true valuation occasionally clears guide value
       * outright). A flat spread measured as too tight (nobody, at any
       * turnout, could ever cross guide value) or, flattened wide, produced
       * the OPPOSITE of proof (c) (more cohorts meant MORE above-guide wins,
       * pure order-statistics on the tail) - hence turnout-dependent, not a
       * single number.
       */
      cohortValuationSpreadByTurnout: z.object({
        thin: z.number().nonnegative(),
        steady: z.number().nonnegative(),
        packed: z.number().nonnegative(),
      }),
      /** How much a cheap-relative-to-guide-value lot boosts eagerness: the
       * value-gap multiplier is `1 + valueGapEagerBonus * (1 -
       * currentBid/guideValue)`, clamped to
       * `[valueGapFloor, valueGapCeiling]`. */
      valueGapEagerBonus: z.number().nonnegative(),
      /** Floor on the value-gap multiplier - competition never fully dies
       * while cohorts remain eligible, even once price clears guide value. */
      valueGapFloor: z.number().min(0),
      /** Ceiling on the value-gap multiplier - an unopened (0-bid) lot
       * doesn't become a guaranteed bid just from being cheap. */
      valueGapCeiling: z.number().positive(),
      /** How many rival cohorts a lot's rolled `TurnoutBand` represents -
       * `bidding.ts`'s `turnoutBidderCount` rolls an integer in this
       * (inclusive) range per lot, stable for the lot's whole life. Reuses
       * `DayRangeSchema`'s ascending-positive-int-pair shape (not really
       * about days here, just the same tuple contract). */
      turnoutBidderCounts: z.object({
        thin: DayRangeSchema,
        steady: DayRangeSchema,
        packed: DayRangeSchema,
      }),
      /** Weights (need not be pre-normalized to exactly 1, but should sum to
       * ~1 - same convention as `serviceJobs.dailyOfferCountWeights` below)
       * over which `TurnoutBand` a fresh lot rolls: [thin, steady, packed]. */
      turnoutBandWeights: z.tuple([
        z.number().nonnegative(),
        z.number().nonnegative(),
        z.number().nonnegative(),
      ]),
      /** Hard cap on how many bid increments one overnight step can apply
       * (decision 3: "0-2 increments applied per overnight"). */
      maxIncrementsPerNight: z.number().int().positive(),
    })
    .refine((a) => a.valueGapFloor <= a.valueGapCeiling, {
      message: 'auctionInterest.valueGapFloor must be <= valueGapCeiling',
    }),
  /**
   * Sprint 21 (per-component weights); Sprint 26 decision 4 replaced the old
   * hand-authored `componentValueWeights` with a cost-weighted mean of band
   * factors; Sprint 27 replaced THAT shim with a transparent restoration-bill
   * deduction; Sprint 47 replaced Sprint 27's hard floor-clamp deduction with
   * a two-slope premium; Sprint 54 (economy-bible.md law 1) replaces the
   * two-slope model with ONE slope, always above 1 - every repair yen returns
   * more than itself, by construction, at every reachable state
   * (`marketValueYen`'s own doc comment carries the current formula).
   */
  valuation: z
    .object({
      /** Sprint 30 decision 1: `[mileageKm, factor]` breakpoints - a small
       * low-mileage bonus flattening to 1.0, then falling off with mileage,
       * clamped to the first/last factor outside the breakpoint range. */
      mileageFactorCurve: CurveSchema,
      /**
       * Sprint 54 decision 1 (economy-bible.md law 1): the deduction rate for
       * the portion of the (mint-referenced) restoration bill BELOW the car's
       * tier expectation band - yen of guide value gained per repair yen paid
       * off. `.min(1)` is Law 1 itself, enforced structurally: a value < 1 would
       * mean repairing a car for real yen returns less than that yen back,
       * exactly the guaranteed-loss bug Sprint 54 retired.
       *
       * Sprint 66 scoped this rather than weakened it: work ABOVE the tier's
       * expectation band is discounted at `expectationByTier[tier].beyondDiscount`
       * instead, which is deliberately allowed below 1 (see that field). This
       * rate, and its >= 1 guarantee, still govern every repair up to the band -
       * which is every repair the economy asks a player to make.
       *
       * Retuned 1.2 -> 1.5 (Sprint 66, economy-bible.md law 6 - the wage law).
       * A repair's cash cost and its bill reduction are identical by
       * construction (`planPartRepair` and `costToMintYen` are the same
       * `repairStepFraction x partPriceYen` product), so THIS NUMBER IS THE
       * ENTIRE RETURN ON REPAIR WORK: paying X yen returns `marketRepairDiscount
       * x X`. At 1.2 that was a 20% margin on spend - technically Law 1
       * compliant, but so thin that a playtest (2026-07-15) found a full
       * poor->worn pass barely moved projected profit. At 1.5 every repair yen
       * returns 1.5 yen, a 50% margin, which is what makes bench time pay.
       *
       * CONSTRAINT - never move this alone. `instanceBaseValueYen` floors at
       * `bands.scrapValueFraction x cleanValue`, so for the floor never to bind
       * on a generatable car we need
       * `marketRepairDiscount x partsGeneration.maxBillFraction < 1`.
       * Today: 1.5 x 0.6 = 0.90. Raising this rate REQUIRES lowering
       * `maxBillFraction` in the same edit (and vice versa); `valueModelProbes`'
       * floor probe is the machine check that catches a violation.
       */
      marketRepairDiscount: z.number().min(1),
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
      /**
       * Sprint 27 decision 4: a bot's walk-away target
       * (`bots/buyoutHelpers.ts`'s `walkAwayTargetYen`) is `instanceValue x
       * strategyMultiplier` times a small private spread, bell-shaped around
       * 1.0 with this standard deviation - even though every bidder reads the
       * identical transparent bands, no two private valuations of the same car
       * land exactly on the shared anchor.
       */
      walkAwaySpread: z.number().nonnegative(),
      /**
       * Sprint 60 (economy-bible.md law 5 - the foundation law): the aftermarket
       * premium (`marketValue.ts`'s `installedPartsValueYen`) is multiplied by
       * the factor of the SINGLE WORST foundational part before it counts toward
       * market value - no buyer pays for a race turbo in a car that can't stop
       * or steer. The base value (clean minus the restoration bill) already
       * prices broken parts through the bill; this gates only the ADD-ON
       * premium, so Law 1 (every repair yen returns more than itself) is
       * untouched, and repairing a failed foundational part returns EXTRA on top
       * of the `marketRepairDiscount` slope by releasing the withheld premium.
       */
      foundation: z.object({
        /** The foundational slots a buyer treats as non-negotiable - safety and
         * structure (brakes, tyres, steering, chassis, rust), not performance.
         * If the WORST of these is bad, the extras stop counting. */
        parts: z.array(CarPartIdSchema).min(1),
        /**
         * The premium multiplier by the worst foundational part's state
         * (`missing` = the slot is empty; otherwise its condition band). Must be
         * monotonic non-decreasing (a worse state never withholds LESS premium)
         * and never above 1 (the foundation law only ever WITHHOLDS premium, it
         * never inflates it - the no-inflation ceiling from Law 1, extended to
         * the premium term). `worn`-or-better at 1.0 means a roadworthy car pays
         * full premium; the base value already handled the mild wear through the
         * bill.
         */
        factorByState: z
          .object({
            missing: z.number().min(0).max(1),
            scrap: z.number().min(0).max(1),
            poor: z.number().min(0).max(1),
            worn: z.number().min(0).max(1),
            fine: z.number().min(0).max(1),
            mint: z.number().min(0).max(1),
          })
          .refine(
            (f) =>
              f.missing <= f.scrap &&
              f.scrap <= f.poor &&
              f.poor <= f.worn &&
              f.worn <= f.fine &&
              f.fine <= f.mint,
            {
              message:
                'valuation.foundation.factorByState must be monotonic non-decreasing (missing <= scrap <= poor <= worn <= fine <= mint)',
            },
          ),
      }),
      /**
       * Sprint 66 (economy-bible.md law 1 as amended, and law 5's second
       * multiplier): diminishing returns, keyed to the car's tier.
       *
       * The market expects a different standard of a kei runabout than of a
       * collector car, and the value formula has to be able to say so. Each
       * tier names the `band` the market actually expects of that kind of car;
       * the mint-referenced restoration bill splits there, and the two halves
       * are discounted at different rates:
       *
       *   baseValue = cleanValue
       *             - marketRepairDiscount x billBelowExpectation
       *             - beyondDiscount        x billAboveExpectation
       *
       * Below the band, `marketRepairDiscount` applies and Law 1's >= 1
       * guarantee is absolute: making a car roadworthy always pays, every tier,
       * every damage state. Above it, `beyondDiscount` applies and MAY be below
       * 1 deliberately - restoring a shitbox kei to mint is passion spend, not
       * an investment (the maintainer's framing, 2026-07-15: "it might still be
       * fun"). At mint both bills are zero, so a fully restored car is worth
       * exactly clean value and Sprint 54's no-inflation ceiling is untouched.
       *
       * The shape this produces is the real-world one: a tidy running Wagon R
       * (`beyondDiscount` 0.4) prices within touching distance of a mint one,
       * while a scruffy FD (1.5) is worth a fraction of a concours FD.
       *
       * `aftermarketReturn` is the same idea on Law 5's premium term - a race
       * turbo on a kei returns a fraction of its cost, on a rare car all of it.
       * Capped at 1, so like `foundationFactor` it only ever withholds.
       */
      expectationByTier: z.record(
        PartFitmentClassSchema,
        z.object({
          /** The condition the market expects of this tier. Repair up to here
           * is investment; past here is passion. */
          band: ConditionBandSchema,
          /** The value returned per repair yen spent ABOVE `band`. May be < 1
           * (that is the whole point); never above `marketRepairDiscount`,
           * enforced below. */
          beyondDiscount: z.number().min(0),
          /** Law 5's second multiplier on the aftermarket premium. */
          aftermarketReturn: z.number().min(0).max(1),
        }),
      ),
    })
    .refine(
      (v) =>
        Object.values(v.expectationByTier).every(
          (e) => e!.beyondDiscount <= v.marketRepairDiscount,
        ),
      {
        message:
          'valuation.expectationByTier[*].beyondDiscount must never exceed valuation.marketRepairDiscount - the market can only ever care LESS about work above a tier expectation, never more, and this is what keeps the (D, F) interlock (economy-bible law 2) safe',
      },
    )
    .refine(
      (v) => PartFitmentClassSchema.options.every((c) => v.expectationByTier[c] !== undefined),
      { message: 'valuation.expectationByTier must name every fitment class' },
    ),
  /**
   * Sprint 44 decision 1 (revert of Sprint 41's tier-scaled repair costs -
   * maintainer rejection, 2026-07-13: "we should probably not be scaling
   * component costs per car... constant"): repair cost per grade is ONE
   * global fraction of the INSTALLED part's own catalog `priceYen`, never the
   * host car's tier - `round(repairStepFraction * catalogPart.priceYen)`.
   * Every repair-cost function in the ONE cost pipeline (`costToMintYen`,
   * `planPartRepair`, and via those, `carCostToMintYen`/`groupCostToMintYen`/
   * `planGroupRepair`/`serviceJobCostBreakdown`) reads this. Structurally
   * closes the donor-car repair arbitrage the tier-scaling model allowed
   * (launder an expensive car's worn parts through a kept shitbox at 0.12x):
   * a part's repair price is intrinsic to the part now, identical on-car or
   * on the bench, wherever it sits and whoever owns the car. Replacement
   * pricing (scrap, a missing slot, a non-repairable consumable) stays flat
   * at `stockReplacementPriceYen`, unchanged from Sprint 41 - a gearbox costs
   * what a gearbox costs at the parts market regardless of the car it's
   * bolted to.
   */
  restoration: z.object({
    /** Fraction of the installed part's own `priceYen` one grade of repair
     * costs - worn -> mint (2 grades) costs `2 * repairStepFraction` of a
     * fresh part, so repair-vs-replace stays a real decision on every slot.
     * Tuning bait (sprint44.md): "repairs feel wrong globally" = move this
     * ONE number. */
    repairStepFraction: z.number().positive().max(1),
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
   * now either a per-part content field or gone outright. (Repair cost
   * itself moved again in Sprint 44: from the taxonomy's authored
   * `stepCostYen`, since deleted, to this same schema's `restoration.
   * repairStepFraction` above, applied to the installed part's own catalog
   * price.)
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
   * Sprint 32: the stock-baseline/missing-slot model's own generation
   * tunable (decisions 2, 3, 6) - every other Sprint 32 number (the
   * catalog's stock/street/sport/race prices, the restoration-bill/
   * installed-parts-value treatment) is either plain catalog data or reuses
   * existing `bands`/`valuation` machinery outright, so this is the one
   * genuinely new economy knob the sprint adds.
   */
  partsGeneration: z.object({
    /** Base per-slot chance (decision 6) a generated auction/service-job
     * car's slot rolls MISSING instead of a fresh stock part at the rolled
     * band - multiplied by `missingSlotWeightByPart`'s per-part weight
     * below, so the real per-slot chance is `missingSlotBaseChance *
     * weight`. Deliberately low ("propose a low base rate"); never applies
     * to `forcedInduction`, which is entirely tag-driven (decision 6(a)) -
     * see `generateAuctionCarInstance`, auctions.ts. */
    missingSlotBaseChance: z.number().min(0).max(1),
    /** Per-part multiplier on `missingSlotBaseChance` (decision 6): 0 for
     * `block`/`chassis` (never missing - the maintainer's explicit
     * carve-out), higher for the cosmetically/physically pluckable slots
     * (wheels, exhaust, aero, seats) than the flat baseline everything else
     * gets. */
    missingSlotWeightByPart: ByCarPartIdWeightSchema,
    /**
     * Sprint 34: generation is a single causal chain, `age -> mileage ->
     * condition`. Age sets a mileage range (these two curves, km by age in
     * years), a mileage is rolled uniformly in that range, and the mileage
     * then sets the condition-baseline range below. Replaces Sprint 33's
     * direct age->condition curves (single-system, directive 16): age no
     * longer reaches condition except through mileage, so mileage is the one
     * coherent wear driver (it is also the sole value-side wear signal, via
     * `marketValue.ts`'s `mileageFactor`). `auctions.ts`'s
     * `mileageRangeForAge` samples both curves at the car's age and rolls
     * `rng.int(min, max)` once. 1990s Japan centres ~9-10k km/yr, low by world
     * standards (the shaken inspection regime), with wide variance and a
     * high-use tail - hence the spread rather than a single mean.
     */
    mileageRangeMinByAgeYears: CurveSchema,
    mileageRangeMaxByAgeYears: CurveSchema,
    /**
     * Sprint 34: the condition-baseline roll's [min, max] range (percent,
     * pre-jitter) as a function of the rolled mileage - replaces Sprint 33's
     * age-keyed condition curves. `auctions.ts`'s
     * `conditionBaselineRangeForMileage` samples both at the rolled mileage
     * and rolls `rng.int(min, max)` once; the car's upkeep tier (Sprint 47,
     * below) then offsets this baseline before each of the 29 parts jitters
     * around it in a per-tier range. Higher mileage skews condition worse;
     * low-mileage cars stay mostly good.
     */
    conditionBaselineMinByMileageKm: CurveSchema,
    conditionBaselineMaxByMileageKm: CurveSchema,
    /**
     * Sprint 47 decision 4: a per-car upkeep roll, layered ON TOP of the
     * mileage-based baseline above (that chain is unchanged) - real
     * cross-car variance, so two cars at the same mileage can be a genuine
     * wreck or genuinely sound, not interchangeably mediocre (the playtest's
     * "no scrap, no poor parts, so why is it worth so little" complaint).
     * Weights for the three tiers (`generateAuctionCarInstance` rolls one
     * per car, weighted).
     */
    upkeepTierWeights: z.object({
      neglected: z.number().nonnegative(),
      average: z.number().nonnegative(),
      cherished: z.number().nonnegative(),
    }),
    /** Added to the mileage-rolled condition baseline (percent) before
     * per-part jitter - negative for neglected, 0 for average, positive for
     * cherished. Clamped into [0, 100] same as the baseline+jitter always
     * has been. Sprint 66: SCALED by `wearExposureByMileageKm` below, so
     * upkeep only expresses itself in proportion to how far the car has
     * actually been driven. */
    upkeepBaselineOffset: z.object({
      neglected: z.number(),
      average: z.number(),
      cherished: z.number(),
    }),
    /** Per-tier `[min, max]` per-part jitter range (percent), replacing the
     * old flat symmetric `CAR_CONDITION_JITTER` (+/-15 for every car) -
     * neglected skews a harsher negative tail (individual trashed
     * components), cherished a gentler one. Sprint 66: the NEGATIVE bound is
     * scaled by `wearExposureByMileageKm` (the positive bound is not - a car
     * can be better than its baseline at any age; it cannot be worn out
     * before it has been driven). */
    upkeepJitterRange: z.object({
      neglected: z.tuple([z.number(), z.number()]),
      average: z.tuple([z.number(), z.number()]),
      cherished: z.tuple([z.number(), z.number()]),
    }),
    /**
     * Sprint 66 (playtest 2026-07-15 item 6a): how much of the upkeep tier's
     * wear can express itself, by the car's own mileage - `[mileageKm,
     * exposure]` breakpoints in [0, 1], read through the same
     * `interpolateCurve` every other curve here uses.
     *
     * The bug this fixes: `upkeepBaselineOffset`/`upkeepJitterRange` used to
     * apply as ABSOLUTE offsets regardless of age, so a `neglected` roll
     * (-22 baseline, -30 jitter) could drive an 11 km car's parts to `poor` -
     * the maintainer's verbatim "was that 11km driven on the surface of the
     * sun?". Mileage-driven wear already lives in the condition baseline
     * itself (`conditionBaselineMinByMileageKm`); this curve governs the
     * SECOND, independent axis - how badly the previous owner treated it -
     * which cannot have expressed itself on a car that has barely moved.
     * At exposure 0 every upkeep tier produces the same near-mint car; at
     * exposure 1 a neglected roll bites exactly as hard as it did before.
     */
    wearExposureByMileageKm: CurveSchema,
    /** Multiplies `missingSlotBaseChance * missingSlotWeightByPart[partId]`
     * by the car's upkeep tier - a neglected car sheds parts more often, a
     * cherished one almost never. */
    upkeepMissingMultiplier: z.object({
      neglected: z.number().nonnegative(),
      average: z.number().nonnegative(),
      cherished: z.number().nonnegative(),
    }),
    /**
     * Sprint 54 decision 4 (economy-bible.md law 2 - no value traps): the
     * hard ceiling on a generated car's restoration bill, as a fraction of
     * its clean value (at neutral heat) - `generateAuctionCarInstance`
     * softens the worst-rolled parts, one band at a time in seeded order,
     * until `carCostToMintYen(car) <= maxBillFraction * cleanValue`. Every
     * generatable lot is therefore profitably restorable by construction.
     *
     * Retuned 0.7 -> 0.6 (Sprint 66) as the OTHER half of the wage law's
     * (D, F) pair - see `valuation.marketRepairDiscount`'s own doc comment
     * for the full constraint. In short: `marketRepairDiscount x
     * maxBillFraction` must stay below 1 or a worst-case car's value falls
     * through the scrap floor, so raising the repair return to 1.5 required
     * pulling this ceiling down to 0.6 in the same edit (1.5 x 0.6 = 0.90).
     * Never move one without the other.
     */
    maxBillFraction: z.number().positive().max(1),
    /**
     * Sprint 75 decision 1 (the standing TODO.md item: generated cars should
     * sometimes arrive already modified): per ELIGIBLE, non-missing slot
     * (eligible = the catalog has a `grade > stock` entry for this
     * `carPartId` at the car's own fitment class), the chance
     * `generateAuctionCarInstance` fits that aftermarket part instead of the
     * default stock one, at the SAME rolled band the stock part would have
     * had. Runs strictly after the missing-slot roll (a missing slot is
     * never also aftermarket) and before the symptom roll (Sprint 73), so a
     * symptom's cause can damage whatever ends up fitted either way.
     */
    aftermarketChance: z.number().min(0).max(1),
    /** The hard cap on how many slots per car this roll can ever fit
     * (decision 1) - a "someone's old project" car is meaningfully modified,
     * not entirely rebuilt; `generateAuctionCarInstance` stops rolling
     * aftermarket once this many slots have already landed one. */
    maxAftermarketSlots: z.number().int().nonnegative(),
    /** Which of the three real aftermarket grades a hit rolls, weighted
     * (decision 1: street the common case, race the rare one) - renormalised
     * over whichever grades the catalog actually has for this specific
     * `carPartId`+fitment class (today, always all three). */
    aftermarketGradeWeights: z.object({
      street: z.number().nonnegative(),
      sport: z.number().nonnegative(),
      race: z.number().nonnegative(),
    }),
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
    /**
     * The reputation ladder (Sprint 69). Lived in `sim/constants.ts` as
     * `REPUTATION_TIER_THRESHOLDS` until now, which broke the content law
     * (engineering law 2: every designer-tunable number lives in JSON) - and
     * this is the sprint that retunes it, so it had to move first.
     *
     * Raised ~4x across the board on the maintainer's instruction ("Rep levels
     * are climbed too quickly. Raise the rep level needed for every rep rung"):
     * local 15 -> 60, known 50 -> 200, respected 120 -> 500, legend 300 ->
     * 1400.
     *
     * CALIBRATED AGAINST REAL PLAY, NOT THE BOT - which is the whole point.
     * The maintainer's own session reached 32 rep and `local` by DAY 6, about
     * 5 rep/day. The harness's `competent-policy` probe earns about 1 rep/day
     * and takes until p50 day 16. The old ladder was scaled to the bot, so it
     * collapsed under real play: at 5/day the old `local` (15) falls on day 3.
     *
     * INTERLOCK: `local` drives the hard-gated days-to-`local` invariant
     * (`tools/balance/invariants.py`), which measures the ~1 rep/day BOT - so
     * raising `local` moves that gate's p50 almost 1:1 and the band must move
     * with it. The band was re-based in this sprint by explicit maintainer
     * approval. The deeper problem (that invariant has been measuring bot
     * patience rather than game pacing for its whole life) is recorded in
     * `TODO.md`'s harness-rework entry, not solved here.
     *
     * Must be monotonic and start at 0 - a ladder that goes down, or that a
     * fresh shop does not start at the bottom of, is a bug, not a tuning
     * choice.
     */
    tierThresholds: z
      .object({
        unknown: z.literal(0),
        local: z.number().int().positive(),
        known: z.number().int().positive(),
        respected: z.number().int().positive(),
        legend: z.number().int().positive(),
      })
      .refine((t) => t.local < t.known && t.known < t.respected && t.respected < t.legend, {
        message:
          'reputation.tierThresholds must be strictly ascending (each rung genuinely harder than the last)',
      }),
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
  /**
   * Sprint 29: the service-job framework v2's own tunables - derived-payout
   * inputs and the daily offer-arrival cadence, replacing the old per-type
   * authored `payoutRangeYen` and the weekly fixed-count dump.
   */
  serviceJobs: z
    .object({
      /**
       * `payout`'s margin rolls uniform in `[marginMin, marginMax]` over the
       * task+labor cost pool (`deriveServiceJobPayoutYen`, serviceJobs.ts).
       * Retuned `[1.4, 1.65]` -> `[1.18, 1.35]` (Sprint 59, playtest item 16:
       * a single tyre-install job was clearing ~Y47,000 profit, read as a
       * windfall for one part swap). The floor stays above the Law 4
       * hard-gated payout-coverage minimum (1.15) with real headroom; the
       * ceiling drops enough that the same tyre exemplar now profits roughly
       * Y15,000-25,000 - paid work, not a jackpot.
       */
      marginMin: z.number().positive(),
      marginMax: z.number().positive(),
      /** Yen per labor slot the payout formula credits toward the job's
       * "wrench time" component - a market rate, not tied to the shop's own
       * current equipment tier (see that function's own doc comment). */
      laborRateYen: z.number().int().nonnegative(),
      /** Flat callout/booking fee added on top of the margin-applied pool. */
      calloutFeeYen: z.number().int().nonnegative(),
      /** Bell-shaped weights over how many fresh offers land on the board
       * each day - index 0 is the weight for 0 offers, index 4 for 4; must
       * sum to 1 (`generateDailyServiceJobOffers`'s own sampling reads this
       * as a discrete distribution). */
      dailyOfferCountWeights: z.array(z.number().min(0)).length(5),
      /**
       * Sprint 52 decision 1: a linear-stepped ramp clamping the weighted
       * draw above so a fresh career sees a gentle trickle before the full
       * distribution unlocks - `[dayThreshold, capAtOrAfterThatDay]` pairs,
       * ascending by day, the step-function reading `offerCountCapForDay`
       * (serviceJobs.ts) uses (NOT smooth interpolation - an offer count is
       * always a whole number). Tuning bait.
       */
      offerCountCapByDay: z
        .array(z.tuple([z.number().int().positive(), z.number().int().nonnegative()]))
        .min(1),
    })
    .refine((s) => s.marginMin <= s.marginMax, {
      message: 'serviceJobs.marginMin must be <= marginMax',
    }),
  /**
   * Sprint 31 (the walk-in offer stream): a for-sale car's daily offer draw.
   * Replaces `valuation.listingPatiencePremium` and the sim-constant
   * `WALK_IN_OFFER_RANGE` (content law: designer-tunable numbers live in
   * JSON, not in code) - `offerChanceFor`/`sellViaWalkIn` (selling.ts) are
   * the two consumers.
   */
  selling: z
    .object({
      /** Base daily chance a for-sale car draws an offer at all, before the
       * tier/heat-band multipliers below (decision 2: "propose base 0.65"). */
      offerChanceBase: z.number().min(0).max(1),
      /** Per-`RarityTier` desirability multiplier on `offerChanceBase` - how
       * much natural foot traffic a car's own rarity draws, independent of
       * whether any buyer archetype is even a plausible fit for it at all
       * (that's the separate `saleCandidates` gate `sellViaWalkIn` already
       * applies). A common shitbox gets looked at far more often than a
       * gaisha or a legend. */
      offerChanceByTier: ByRarityTierMultiplierSchema,
      /** Below this market-heat percent, today counts as a "cold" heat band;
       * at or above `heatBandHotAtOrAbovePercent`, "hot"; otherwise "normal" -
       * three flat bands (mirrors the auction turnout-band style), not a
       * continuous curve, so a maintainer can eyeball-tune each one directly. */
      heatBandColdBelowPercent: z.number().positive(),
      heatBandHotAtOrAbovePercent: z.number().positive(),
      /** Multiplier on `offerChanceBase` per today's heat band. */
      offerChanceByHeatBand: z.object({
        cold: z.number().nonnegative(),
        normal: z.number().nonnegative(),
        hot: z.number().nonnegative(),
      }),
      /**
       * `offerYen = valuateCarForBuyer * uniform(min, max)` - the "fast,
       * variable" walk-in-style roll, unchanged in kind since Sprint 11's
       * `WALK_IN_OFFER_RANGE`. Retuned `[0.82, 1.12]` -> `[0.90, 1.08]`
       * (Sprint 55 decision 3, economy-bible.md law 4's retune pass):
       * `valuateCarForBuyer`'s own taste spread can already land as low as
       * ~0.88x guide value on a bad roll (`valuation.tasteSpread`); compounded
       * with the old 0.82 lower edge, a fully-restored car's worst-case
       * walk-in sale could clear as little as ~72% of clean value - enough to
       * erase the worst-case flip margin the Law 2 generation guard still
       * permits (as low as ~22% of clean value at the guard's own ceiling,
       * `coherence.ts`). The raised floor keeps a genuinely bad walk-in roll
       * from being able to turn a profitable restoration into a loss. The
       * upper edge came down to match (1.15 would have raised the spread's
       * own mean above 1.0, breaking the Sprint 54 no-free-lunch invariant
       * that an unmodified car's expected walk-in sale never nets a profit
       * over its own guide value, `valueModelProbes.test.ts`) - `[0.90, 1.08]`
       * keeps the mean at 0.99, still a real discount on average.
       *
       * Retuned again `[0.90, 1.08]` -> `[0.93, 1.05]` (Sprint 59, playtest
       * item 19): narrower tails so a patient, unimproved flip can't rely on a
       * lucky high roll to clear a real profit - the mean stays 0.99,
       * preserving the same no-free-lunch invariant unchanged.
       */
      offerSpread: z
        .tuple([z.number().positive(), z.number().positive()])
        .refine(([min, max]) => min <= max, { message: 'offerSpread min must be <= max' }),
    })
    .refine((s) => s.heatBandColdBelowPercent <= s.heatBandHotAtOrAbovePercent, {
      message: 'selling.heatBandColdBelowPercent must be <= heatBandHotAtOrAbovePercent',
    }),
  /**
   * Sprint 37: the one own-car capability ceiling (progression bible's
   * bolt-on vs built line). Converting a factory-NA car to forced induction
   * (fitting the FIRST turbo/supercharger into a legitimately-empty slot,
   * `hasForcedInduction(model) === false`) is fabrication work, gated
   * behind this engine tool tier - a car that already carries a forced-
   * induction part (factory-turbo, or a previous conversion) swaps freely
   * at any tier; only the first conversion is gated
   * (`jobs.ts`'s `naToTurboConversionBlocked`).
   */
  toolCeilings: z.object({
    naToTurboConversionEngineTier: ToolTierSchema,
  }),
  /**
   * Sprint 38: the specialty axis's four tunables (progression bible's
   * horizontal axis - per-discipline word of mouth). `biasFactor`/
   * `softcapPoints` shape the offer-selection weight
   * (`1 + biasFactor * min(1, specialty[group] / softcapPoints)`,
   * `pickServiceJobTemplate`, serviceJobs.ts); `premiumThresholdPoints`/
   * `inLanePremium` gate and size the in-lane payout premium
   * (`deriveServiceJobPayoutYen`'s margin roll, same file). Sprint 39 adds
   * `titleThresholdPoints`/`titleBiasMultiplier`: the derived shop title
   * (`shopTitle`) requires the top specialty group to clear
   * `titleThresholdPoints`; once it does, that group's offer-selection
   * weight (already computed via `biasFactor`/`softcapPoints` above) is
   * ADDITIONALLY multiplied by `titleBiasMultiplier` - a title is both a
   * name and a real pull on what walks in the door.
   */
  specialty: z.object({
    biasFactor: z.number().nonnegative(),
    softcapPoints: z.number().positive(),
    premiumThresholdPoints: z.number().nonnegative(),
    inLanePremium: z.number().positive(),
    titleThresholdPoints: z.number().nonnegative(),
    titleBiasMultiplier: z.number().positive(),
  }),
  /**
   * Sprint 52 decision 2 (maintainer-approved 2026-07-13): the used-
   * machinery classifieds cadence. Reputation still gates which tool tiers
   * are ELIGIBLE (Sprint 43's per-tier thresholds, unchanged); a listing is
   * what makes an eligible tier actually PURCHASABLE, one machine at a time.
   * `minGapDays`/`maxGapDays` bound the seeded roll for how long the
   * classifieds stay quiet after a listing lapses (or before the first one
   * ever appears, once something becomes eligible); `windowDays` is how long
   * a fresh listing stays live before it lapses (unbought machines are never
   * lost - a later issue can list the same one again). Tuning bait.
   */
  machineListings: z
    .object({
      minGapDays: z.number().int().positive(),
      maxGapDays: z.number().int().positive(),
      windowDays: z.number().int().positive(),
    })
    .refine((m) => m.minGapDays <= m.maxGapDays, {
      message: 'machineListings.minGapDays must be <= maxGapDays',
    }),
  /**
   * Sprint 55 (economy-bible.md law 4 - one derived ledger, machine-checked):
   * the one number the roster-wide coherence check (`coherence.ts`,
   * `tools/balance/src/balance/invariants.py`) gates the "brake pads vs car
   * price" guard against - the full tyres+brakePadsDiscs+clutch consumable
   * set, class-priced, must never exceed this fraction of a model's own book
   * value. A content anchor rather than a hardcoded check constant, so
   * retuning it is a one-line content edit like every other economy knob.
   */
  coherence: z.object({
    maxConsumablesShareOfBookValue: z.number().positive().max(1),
  }),
  /**
   * Sprint 71 (the teardown game): labour cost by slot depth for the
   * symmetric uninstall/install verbs (`resolveRemovePart`/`installFitGate`,
   * jobs.ts) - replaces the old flat `INSTALL_LABOR_SLOTS` constant
   * everywhere. `usedPartSaleFraction` is `resolveSellPart`'s haircut off a
   * part's own resolved price (parts.ts); `donorBreakEvenBillRatio` is the
   * bill-to-clean ratio above which parting out a car's worst-case rolled
   * condition can beat the sensible-repair route - a disclosed measurement
   * threshold for the balance report, not a hard-gated invariant (decision 8,
   * sprint71.md).
   *
   * Sprint 79 (the equivalence-priced labour model, maintainer directive
   * 2026-07-16): `removeSlotsByClass` is zeroed at every depth - removal and
   * like-for-like reassembly are free; labour only ever prices the
   * IMPROVEMENT to a slot (a repair, a replacement, an upgrade), never the
   * logistics of reaching it. The knob stays in content (this is a value
   * change, not a mechanism removal) - `CarPartState.vacatedBaseline`
   * (content/src/carInstance.ts) plus `jobs.ts`'s `refitLaborSlotsFor` are
   * what let a matching refit skip `installSlotsByClass` too.
   */
  teardown: z.object({
    removeSlotsByClass: z.object({
      surface: z.number().int().nonnegative(),
      'bolt-on': z.number().int().nonnegative(),
      buried: z.number().int().nonnegative(),
    }),
    installSlotsByClass: z.object({
      surface: z.number().int().nonnegative(),
      'bolt-on': z.number().int().nonnegative(),
      buried: z.number().int().nonnegative(),
    }),
    usedPartSaleFraction: z.number().positive().max(1),
    donorBreakEvenBillRatio: z.number().positive().max(1),
  }),
  /**
   * Sprint 73 (diagnosis I, the fear-priced board - maintainer pricing law
   * 2026-07-15: "the room prices the symptom, the player prices the cause").
   * `fearPremium` is `sheetGuideValueYen`'s (`diagnosis.ts`, sim) risk
   * multiplier on the gap between a symptomatic car's apparent value and its
   * cause-weighted expected true value - always > 1, so the room never prices
   * a symptomatic car as generously as its apparent condition alone would
   * suggest. `symptomChanceByTier` is keyed by `PartFitmentClass` (the same
   * four values `valuation.expectationByTier` uses), rolled per generated car
   * (`generateAuctionCarInstance`); `secondSymptomChance` is the independent
   * roll for a SECOND symptom once the first lands, capped at
   * `maxSymptomsPerCar`. `visitMinutes`/`travelFeeYenByTier` are consumed by
   * Sprint 74's inspection verb - shipped now per decision 5's own
   * instruction so the whole key lands in one bump.
   */
  diagnosis: z.object({
    fearPremium: z.number().min(1),
    symptomChanceByTier: z.object({
      shitbox: z.number().min(0).max(1),
      common: z.number().min(0).max(1),
      uncommon: z.number().min(0).max(1),
      rare: z.number().min(0).max(1),
    }),
    secondSymptomChance: z.number().min(0).max(1),
    maxSymptomsPerCar: z.number().int().positive(),
    visitMinutes: z.number().int().positive(),
    travelFeeYenByTier: ByAuctionTierSchema,
    /**
     * Sprint 75 decision 2 (the organic teacher): the two one-line reveal
     * templates `resolveSellViaWalkIn` (sim/selling.ts) picks between when a
     * sold car still carries an unresolved symptom - each a full sentence
     * carrying a literal `<cause>` token the sim substitutes with the true
     * cause's own display label. `buyerWon` fires when the true cause turns
     * out cheaper (milder) than the player's own estimate at time of sale;
     * `playerWon` when it turns out dearer.
     */
    saleRevealCopy: z.object({
      buyerWon: z.string().min(1),
      playerWon: z.string().min(1),
    }),
  }),
  /**
   * Sprint 77 (story missions II, the lap model - pre-approved 2026-07-15):
   * one pure, monotonic formula over the car's CURRENT derived stats -
   * `lapModel.ts`'s `lapTimeSecondsFor` reads every field here, never a
   * hardcoded constant of its own. `C` and `ratioExp` are the power-to-
   * weight curve's scale and exponent (`C x (curbWeightKg / power) ^
   * ratioExp`); `gripMult` is the fitted tyre SKU's own grade multiplying
   * that base time (worse grip - `stock` - always slower, `race` always
   * faster - monotonic by construction, never re-ordered by content).
   * `courseId`/`courseName` name the one v1.0 course; the schema is
   * course-keyed so a second course is content, not a code change.
   *
   * Sprint 79 (grip spread nerf, maintainer directive 2026-07-16): tightened
   * from `{stock 1.06, street 1.00, sport 0.94, race 0.88}` - race tyres
   * alone were worth roughly +70% power-equivalent (a solved opening move for
   * every lap mission) - to `{stock 1.04, street 1.00, sport 0.98,
   * race 0.96}`, roughly +26% race-vs-stock, about +6% per tyre step. Real
   * course simulation (torque curve, drive type, brakes, drag) stays
   * post-launch, tied to drive mode.
   */
  lapModel: z.object({
    C: z.number().positive(),
    ratioExp: z.number().positive(),
    gripMult: z.object({
      stock: z.number().positive(),
      street: z.number().positive(),
      sport: z.number().positive(),
      race: z.number().positive(),
    }),
    courseId: z.string().min(1),
    courseName: z.string().min(1),
  }),
  /**
   * Sprint 80 (staff I), reworked into the crew model (maintainer redesign
   * 2026-07-17): every tunable knob behind job-ad acquisition and the crew
   * economy. Both formulas are fixed in code (`deriveStaffWageYen` and
   * `computeContractIncomeYen`, sim); these are their coefficients plus the
   * ad-board and candidate-roll knobs. Content law: a maintainer retunes wage
   * feel, contract feel, or ad pacing here, never in code.
   *
   * The principle: more people means more work, plainly; passive income is an
   * assignment you trade labour for, never a bonus on top. Hustle is gone (R1).
   *
   * WAGE (R4), a pure function of the stat line and the labour slots, never
   * rolled independently (the drift guard `staffProbes.test.ts` asserts this):
   *   `weeklyWageYen = round100(wageBaseYen + wagePerSkillPointYen * sum(stats)
   *                   + wagePerLaborSlotYen * laborSlotsPerDay)`.
   *
   * CONTRACT income (R3), the daily fleet retainer a `contract`-assigned member
   * earns (taxi firms, delivery fleets), accrued in `serviceBay.ts`:
   *   `contractBaseYenPerDay + contractPerSkillPointYenPerDay * sum(stats)`.
   *
   * Coefficients derived by exhaustive search (maximin-centred) so the reworked
   * hire coherence probe HARD-GATES all three bounds with honest margins - see
   * decision 5 (R5) in `docs/sprints/sprint80.md`:
   *   A (net profit): weekly contract in [1.05, 1.40] x weekly wage, every
   *     candidate every tier - a parked member always profits, modestly.
   *   B (honest work beats the retainer): weekly contract <= 0.5 x
   *     (laborSlotsPerDay x 7 x serviceJobs.laborRateYen), every candidate - the
   *     same hands billed out always out-earn the retainer by at least double.
   *   C (first hire reachable): the entry tier's cheapest introduction fee stays
   *     within 15% of STARTING_CASH_YEN.
   *
   * `laborSlotsPerDayWeights` is `[weightFor1Slot, weightFor2Slots]` (R2) -
   * the weighted roll for how many slots a generated candidate puts in (a pair
   * of hands is a pair of hands, no thresholds).
   *
   * `introductionFeeWeeks` (R6a) is the one-off hiring fee, in multiples of the
   * candidate's weekly wage, charged at hire; 0 disables it. With parking now
   * net-positive, the fee keeps "hire four on day one" an investment with a
   * payback period rather than a free annuity.
   *
   * `statBudgetByTier` is a PER-STAT inclusive `[min, max]` range applied to
   * each of the three stats independently (better shops attract people who are
   * stronger across the board, consistent with the progression bible's
   * Capability pillar) - `min <= max`, both within the 1..5 stat domain. The
   * per-tier ladder is deliberately overlapping and monotone, not disjoint.
   *
   * `maxOpenAds`/`adExpiryDays` govern the weekly ad refresh; `maxStaff` is the
   * GDD section 7 hiring cap. First-pass numbers, openly retunable.
   */
  staff: z
    .object({
      wageBaseYen: z.number().int().nonnegative(),
      wagePerSkillPointYen: z.number().int().nonnegative(),
      wagePerLaborSlotYen: z.number().int().nonnegative(),
      contractBaseYenPerDay: z.number().int().nonnegative(),
      contractPerSkillPointYenPerDay: z.number().int().nonnegative(),
      /** `[weightFor1Slot, weightFor2Slots]` - the weighted roll for a
       * generated candidate's `laborSlotsPerDay` (R2). Need not pre-normalise
       * to 1 (same convention as the other weight tuples here). */
      laborSlotsPerDayWeights: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
      /** One-off hiring fee, in multiples of the weekly wage (R6a); 0 disables. */
      introductionFeeWeeks: z.number().int().nonnegative(),
      statBudgetByTier: z.record(
        ReputationTierSchema,
        z
          .object({
            min: z.number().int().min(1).max(5),
            max: z.number().int().min(1).max(5),
          })
          .refine((r) => r.min <= r.max, {
            message: 'staff.statBudgetByTier[*].min must be <= max',
          }),
      ),
      maxOpenAds: z.number().int().positive(),
      adExpiryDays: z.number().int().positive(),
      maxStaff: z.number().int().positive(),
    })
    .refine((s) => ReputationTierSchema.options.every((t) => s.statBudgetByTier[t] !== undefined), {
      message: 'staff.statBudgetByTier must name every reputation tier',
    }),
})

export type EconomyConfig = z.infer<typeof EconomyConfigSchema>
