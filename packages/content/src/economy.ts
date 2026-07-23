import { z } from 'zod'
import { PartFitmentClassSchema } from './partFitment'
import {
  CarPartIdSchema,
  ComponentIdSchema,
  ConditionBandSchema,
  RarityTierSchema,
  ReputationTierSchema,
} from './tags'
import { ToolTierSchema } from './toolLines'

/** One non-negative weight per `CarPartId`, keyed explicitly (not
 * `z.record`) so a missing key fails validation instead of silently
 * defaulting to 0. Feeds `partsGeneration.missingSlotWeightByPart`: weight
 * times `missingSlotBaseChance` is a part's per-slot chance of generating
 * MISSING instead of a fresh stock part. */
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
 * used as `Readonly<Record<AuctionTier, number>>` in sim/constants.ts before
 * this file existed. Explicit per-tier keys (not a generic `z.record`) so a
 * missing tier fails validation, matching `FacilitiesSchema`'s existing
 * preference for explicit shape over a bare map. */
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

/**
 * One rung of the auction card's overall-grade ladder: the apparent
 * restoration bill, as a fraction of the model's book value, at or below
 * which the lot earns `grade`. `computeAuctionGrade` (sim/auctionGrade.ts)
 * walks `overallRatioSteps` top-down and returns the first match; a ratio
 * past every listed `maxRatio` falls through to grade '1' in code, so '1'
 * itself never needs a step here. `grade` excludes 'R': that grade is the
 * mechanical-corpse override, never a ratio-table outcome.
 */
const AuctionGradingStepSchema = z.object({
  maxRatio: z.number().positive(),
  grade: z.enum(['S', '6', '5', '4.5', '4', '3.5', '3', '2', '1']),
})

/** A [min, max] millisecond delay band, min <= max - the auction room's raise
 * pacing, reused for both the ordinary and the feud delay bands. */
const AuctionRoomDelayRangeSchema = z
  .object({ min: z.number().int().nonnegative(), max: z.number().int().positive() })
  .refine((d) => d.min <= d.max, { message: 'auctionRoom delay range min must be <= max' })

/** One auction room turnout band's crowd size and the fraction of the room's
 * read it clears within, clearMin <= clearMax. */
const AuctionRoomTurnoutBandSchema = z
  .object({
    dealers: z.number().int().positive(),
    clearMin: z.number().min(0).max(1),
    clearMax: z.number().min(0).max(1),
  })
  .refine((t) => t.clearMin <= t.clearMax, {
    message: 'auctionRoom turnout band clearMin must be <= clearMax',
  })

/**
 * The live auction room's own tuning (`packages/game/src/screens/
 * auctionRoom.ts`), generalised out of the auction room demo so a shared,
 * config-driven machine seats both the demo and the production room off one
 * source of truth. Every field mirrors the demo's own former `ROOM_TUNING`
 * constant exactly; `turnout` grew a third band (`steady`, between `thin`
 * and `packed`) for the real board's three turnouts, where the demo only
 * ever needed two.
 */
export const AuctionRoomConfigSchema = z.object({
  /** Per-bid fuse, in milliseconds. */
  clockMs: z.number().int().positive(),
  /** Opening bid, as a fraction of the room's read value. */
  reserveFraction: z.number().min(0).max(1),
  /**
   * Per-tier admission charged the first time a room seats at that tier on
   * a given day - later sittings at the same tier the same day are covered
   * (`resolveAttendAuction`, sim/bidding.ts). A zero fee is a silent no-op:
   * no charge, no state recorded, nothing shown in the room header. Buyout
   * never touches this; inspection visits keep their own separate travel
   * fee (`diagnosis.travelFeeYenByTier`).
   */
  attendanceFeeYenByTier: ByAuctionTierSchema,
  /** Delay band before each ordinary room raise; always shorter than clockMs. */
  bidDelayMs: AuctionRoomDelayRangeSchema,
  /** Chance the room is cold and clears below the turnout floor. */
  bargainChance: z.number().min(0).max(1),
  /** A read at or above this bids on the coarse step, below it the fine one. */
  stepThresholdYen: z.number().int().positive(),
  /** Bid step for a read under stepThresholdYen. */
  stepBelowYen: z.number().int().positive(),
  /** Bid step for a read at or above stepThresholdYen. */
  stepAboveYen: z.number().int().positive(),
  /** The bidder's raise choices, in rungs. */
  playerRaiseOptionsRungs: z.array(z.number().int().positive()).min(1),
  /** Per turnout, the crowd size and the band the room clears in as a
   * fraction of the read. */
  turnout: z.object({
    thin: AuctionRoomTurnoutBandSchema,
    steady: AuctionRoomTurnoutBandSchema,
    packed: AuctionRoomTurnoutBandSchema,
  }),
  reactions: z.object({
    /** A raise this many rungs up reads as a jump. */
    jumpRungs: z.number().int().positive(),
    /** Jump: the chance the room loses its stomach. */
    scareChance: z.number().min(0).max(1),
    /** ...and has at most this many rungs left in it. */
    scareLeftRungs: z.number().int().positive(),
    /** Jump: the chance a rival answers with a jump of their own. */
    callChance: z.number().min(0).max(1),
    /** ...this many rungs on top. */
    callRungs: z.number().int().positive(),
    /** RARE: the chance an inspected bidder's jump convinces the room it is
     * missing something. */
    goadChance: z.number().min(0).max(1),
    /** The goaded ceiling, as a fraction of the room read; once per room. */
    goadMaxLift: z.number().min(1),
    /** A bid this late in the fuse reads as a snipe. */
    snipeWindowMs: z.number().int().positive(),
    /** Snipes tolerated before the room gets irritated. */
    snipesBeforeTax: z.number().int().nonnegative(),
    /** Each later room response may then take snipeTaxRungs at once. */
    snipeTaxChance: z.number().min(0).max(1),
    /** ...rungs taken at once, still capped by the clearing price. */
    snipeTaxRungs: z.number().int().positive(),
    /** A wide board-to-clearing gap may play out as a dealer feud. */
    feudChance: z.number().min(0).max(1),
    /** ...at least this many rungs between board and clearing. */
    feudMinGapRungs: z.number().int().positive(),
    /** Raises exchanged in the burst. */
    feudRungs: z.number().int().positive(),
    /** The short, urgent delay band the feud paces on. */
    feudDelayMs: AuctionRoomDelayRangeSchema,
    /** The chance a room with nothing left to bid answers anyway: drawn the
     * moment a player raise first sweeps the next room rung past the
     * clearing price with a dealer still active. */
    spiteChance: z.number().min(0).max(1),
    /** The spite counter's own rungs, past the player's board that sweep -
     * exempt from the clearing cap, but the counter is discarded outright if
     * that rung would land at or above the room's read. */
    spiteMaxRungs: z.number().int().positive(),
  }),
})

/** Per-tier non-negative rate: expected new lots/day, not necessarily a whole
 * number - `rollDailySpawnCount` in catalogs.ts turns it into an actual
 * integer count each day. */
const ByAuctionTierRateSchema = z.object({
  'local-yard': z.number().nonnegative(),
  regional: z.number().nonnegative(),
  premium: z.number().nonnegative(),
  'collector-network': z.number().nonnegative(),
})

/** One non-negative multiplier per `RarityTier` - the offer-chance
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
 * The five listing channels a for-sale car can be listed on - the id a
 * `ForSaleEntry` (sale.ts) carries and `sellingChannels` below is keyed by.
 */
export const SellingChannelIdSchema = z.enum([
  'shopFront',
  'freeAdsPaper',
  'tunerMagazine',
  'tradeNetwork',
  'weekendMeet',
])

export type SellingChannelId = z.infer<typeof SellingChannelIdSchema>

/**
 * One listing channel's shape - where you list decides who shows up, at what
 * cost, at what speed, and how much of the +/-12% taste band the arriving
 * pool can express. Every field but `feeYen` is optional; each channel uses
 * exactly one of three cadence shapes (enforced below): `offerChanceFactor`
 * multiplies `selling.offerChanceBase` uniformly across every rarity tier;
 * `offerChanceFactorByTierClass` does the same per `RarityTier`, for a
 * channel whose pool splits sharply by tier; `oneDrawNextEndDay` replaces
 * both with one guaranteed strong draw resolved on the next End Day only.
 * `tasteCeiling` caps the top of the taste roll a buyer through this channel
 * can express (`.min(1)` allows a ceiling of exactly 1.00, never above
 * value); `priceBand` replaces the taste roll with a fixed fraction-of-value
 * range instead; `matchedOnly` restricts the pool to buyers whose visible
 * want the listed car satisfies - a mismatch draws no offers at all.
 */
const SellingChannelSchema = z
  .object({
    feeYen: z.number().int().nonnegative(),
    offerChanceFactor: z.number().positive().optional(),
    offerChanceFactorByTierClass: ByRarityTierMultiplierSchema.optional(),
    oneDrawNextEndDay: z.boolean().optional(),
    tasteCeiling: z.number().min(1).optional(),
    priceBand: z
      .object({ min: z.number().positive(), max: z.number().positive() })
      .refine((b) => b.min < b.max, {
        message: 'sellingChannels priceBand min must be strictly less than max',
      })
      .optional(),
    matchedOnly: z.boolean().optional(),
  })
  .refine(
    (c) => {
      const shapes = [
        c.offerChanceFactor !== undefined,
        c.offerChanceFactorByTierClass !== undefined,
        c.oneDrawNextEndDay === true,
      ]
      return shapes.filter(Boolean).length === 1
    },
    {
      message:
        'sellingChannels: each channel needs exactly one cadence shape (offerChanceFactor, offerChanceFactorByTierClass, or oneDrawNextEndDay)',
    },
  )

/**
 * The five listing channels (directive 22 lever list). `matchedSaleRepBonus`
 * (the sixth locked lever) lives beside `cleanSaleBonus`/`concoursSaleBonus`
 * in `EconomyConfigSchema`'s own `reputation` block below, not here - it is
 * a sale-quality bonus family member, not a channel property.
 */
const SellingChannelsSchema = z.object({
  shopFront: SellingChannelSchema,
  freeAdsPaper: SellingChannelSchema,
  tunerMagazine: SellingChannelSchema,
  tradeNetwork: SellingChannelSchema,
  weekendMeet: SellingChannelSchema,
})

/**
 * A piecewise-linear curve: ascending `[x, y]` breakpoints a designer can
 * draw directly in JSON. Reads as "y is this at x=breakpoint[i][0]";
 * interpolated linearly between neighbouring breakpoints, clamped to the
 * first/last y outside the breakpoint range. Used for the mileage factor in
 * `marketValue.ts`'s clean-value formula and the generation mileage-by-age /
 * condition-by-mileage curves. Both x and y are non-negative: a curve's y can
 * legitimately be 0 (a brand-new car's minimum mileage floor is 0 km,
 * `mileageRangeMinByAgeYears`'s first breakpoint).
 */
export const CurveSchema = z
  .array(z.tuple([z.number().nonnegative(), z.number().nonnegative()]))
  .min(2)
  .refine((points) => points.every((p, i) => i === 0 || p[0] > points[i - 1]![0]), {
    message: 'curve breakpoints must have strictly ascending x values',
  })

/**
 * Designer-tunable economy/auction numbers live here (content law), threaded
 * through `SimContext` like every other content file.
 */
export const EconomyConfigSchema = z.object({
  /**
   * Day-1 starting cash. Derived, not asserted: pooling the shitbox and
   * common roster tiers across many generated lots, the median guide value is
   * ~Y133,795 and the median full-restore bill ~Y80,800; buying at the 0.6
   * reserve (~Y80,277) plus that restoration (~Y161,077 total) plus four
   * weeks' rent (Y80,000) plus an early parts float (~Y30,000) gives a
   * derived floor of ~Y271,000 - one full cheapest-tier flip cycle. This
   * value sits a real margin above that floor, not bare survival.
   */
  STARTING_CASH_YEN: z.number().int().positive(),
  /**
   * Weekly rent, deducted alongside staff wages on 7-day boundaries. Sized as
   * 0.3 x measured median weekly gross margin (274 local-yard flips, median
   * margin Y168,569 at 16 median days-per-flip -> 0.4375 flips/week, well
   * under the 2/week cap), rounded to the nearest Y10,000. Real but beatable
   * relative to the median per-flip margin, not a guess.
   */
  WEEKLY_RENT_YEN: z.number().int().nonnegative(),
  /**
   * The daily cost of leaving a car in the one grace/"double parking"
   * overflow slot (`facilities.ts`'s `resolveGraceParking`) - charged every
   * End Day the slot is still occupied, same unconditional-deduction shape as
   * `WEEKLY_RENT_YEN` (no floor check; going negative is already an accepted
   * possibility elsewhere in this economy).
   */
  DOUBLE_PARKING_FINE_YEN: z.number().int().nonnegative(),
  /**
   * Seller's floor under a deal, as a fraction of the lot's GUIDE VALUE
   * (`bidding.ts`'s `anchorValueYen` = `marketValueYen`, the restoration-bill
   * `instanceValue`) - NOT book value. A pure SELLER FLOOR, not the
   * price-setter: opening low and letting a lot go unsold below this line is
   * deliberately kept, so bidding still reads as a hunt. Real contestation
   * pressure comes from `AUCTION_WHOLESALE_FRACTION` below, not this floor.
   */
  AUCTION_RESERVE_PRICE_FRACTION: z.number().positive().max(1),
  /** New lots per tier on DAY 1 ONLY (`newGame.ts`'s `createInitialGameState`,
   * via `catalogs.ts`'s `refreshCatalogs`) - a full opening board so a fresh
   * career isn't empty. Every day after that, arrivals are the daily trickle
   * (`AUCTION_DAILY_SPAWN_RATE` below, `catalogs.ts`'s
   * `generateDailyAuctionArrivals`), not this fixed batch. */
  AUCTION_LOTS_PER_TIER: ByAuctionTierSchema,
  /** Standard-tier lot duration band, inclusive, in days. */
  AUCTION_DURATION_STANDARD_RANGE_DAYS: DayRangeSchema,
  /** Long-sale duration band, inclusive, in days. */
  AUCTION_DURATION_LONG_RANGE_DAYS: DayRangeSchema,
  /** Flash-sale duration, in days. */
  AUCTION_DURATION_FLASH_DAYS: z.number().int().positive(),
  /** Chance any lot rolls a flash sale instead of its normal duration band. */
  AUCTION_FLASH_CHANCE: z.number().min(0).max(1),
  /** Chance an uncommon/rare lot rolls the long band instead of standard. */
  AUCTION_LONG_CHANCE_UNCOMMON_RARE: z.number().min(0).max(1),
  /**
   * Instant-buyout premium over `bidding.ts`'s `anchorValueYen` (the same
   * best-interested-buyer valuation the demand ceiling anchors to) - the
   * floor half of `computeBuyoutPriceYen`'s `max(anchor * premium, current +
   * increment)`. Needs real separation from a patient bid, since wholesale
   * clearing runs well below the anchor - buyout stays a costly option,
   * never a forbidden one.
   */
  AUCTION_BUYOUT_PREMIUM: z.number().positive(),
  /**
   * Dealers pay resale minus recon minus margin: this fraction is the CENTER
   * each individual rival cohort's private valuation (`bidding.ts`'s
   * `privateValuationYen`) spreads around. Rivals price close to guide value
   * (their margin comes from the work, exactly like the player's), so a
   * genuinely contested close converges on fair value; lots can still open at
   * the (lower) reserve and go uncontested and cheap - the fairness lives in
   * what a real bidding war converges to, not in forbidding cheap opens.
   */
  AUCTION_WHOLESALE_FRACTION: z.number().positive().max(1),
  /**
   * Expected new lots per day per tier, for every day AFTER day 1 (day 1
   * itself still seeds the full `AUCTION_LOTS_PER_TIER` batch - see that
   * field's own doc comment). Tuned ABOVE naive weekly-volume parity
   * (`AUCTION_LOTS_PER_TIER / 7`): deliberately more lots than a player can
   * realistically chase. `catalogs.ts`'s `rollDailySpawnCount` turns this
   * real-valued rate into an actual integer count each day.
   */
  AUCTION_DAILY_SPAWN_RATE: ByAuctionTierRateSchema,
  /**
   * The youngest a generated car may be, in years, when a real calendar year
   * is known - a current-model-year car does not turn up at a local yard.
   * `generateAuctionCarInstance` clamps the rolled `year` to at most
   * `currentYear - AUCTION_MIN_AGE_YEARS`, never below the model's own
   * `spec.yearFrom` (a car cannot predate its own model - a model released
   * within this window simply generates at its release year). Inert when the
   * caller passes no finite `currentYear`.
   */
  AUCTION_MIN_AGE_YEARS: z.number().int().nonnegative(),
  /**
   * Reputation-conditioned rarity weighting for auction model selection
   * (`auctions.ts`'s `generateAuctionCatalog`). Each eligible model's draw
   * weight is `rarityWeightsByReputation[reputationTier]?.[model.tier] ?? 1`,
   * so any tier or rarity absent from the map draws at the implicit 1
   * (uniform). Content ships one entry - `{unknown: {shitbox: 3}}` - so a
   * fresh (unknown-rep) career's Local Yard board favours cheap shitboxes 3:1
   * per model, and from `local` onward selection is uniform. Partial by
   * design: each map names only the entries that deviate from weight 1.
   */
  auction: z.object({
    rarityWeightsByReputation: z.partialRecord(
      ReputationTierSchema,
      z.partialRecord(RarityTierSchema, z.number().positive()),
    ),
    /**
     * Weights (need not be pre-normalised to exactly 1, but should sum to ~1
     * - same convention as `serviceJobs.dailyOfferCountWeights` below) over
     * which `TurnoutBand` a fresh lot rolls: [thin, steady, packed]
     * (`auctions.ts`'s `rollTurnoutBand`). The rolled band is fixed for the
     * lot's whole life and feeds the live auction room's own turnout tuning
     * (`economy.auctionRoom.turnout`).
     */
    turnoutBandWeights: z.tuple([
      z.number().nonnegative(),
      z.number().nonnegative(),
      z.number().nonnegative(),
    ]),
  }),
  /**
   * economy-bible.md law 1: a single slope, always above 1 - every repair
   * yen returns more than itself, by construction, at every reachable state
   * (`marketValueYen`'s own doc comment carries the current formula).
   */
  valuation: z
    .object({
      /** `[mileageKm, factor]` breakpoints - a small low-mileage bonus
       * flattening to 1.0, then falling off with mileage, clamped to the
       * first/last factor outside the breakpoint range. */
      mileageFactorCurve: CurveSchema,
      /**
       * economy-bible.md law 1: the deduction rate for the restoration bill
       * BELOW the car's tier expectation band - yen of guide value gained per
       * repair yen paid off. `.min(1)` is Law 1 itself: repairing a car must
       * never return less than the yen spent. Work ABOVE the expectation band
       * uses `expectationByTier[tier].beyondDiscount` instead, which may be
       * below 1 (see that field).
       *
       * A repair's cash cost and its bill reduction are identical by
       * construction, so paying X yen always returns `marketRepairDiscount x
       * X` - THIS NUMBER IS THE ENTIRE RETURN ON REPAIR WORK. CONSTRAINT:
       * never move it alone. `instanceBaseValueYen` floors at
       * `bands.scrapValueFraction x cleanValue`, so the floor never binds on a
       * generatable car only while `marketRepairDiscount x
       * partsGeneration.maxBillFraction < 1` (today 1.5 x 0.6 = 0.90) -
       * raising this rate requires lowering `maxBillFraction` in the same
       * edit, checked by `valueModelProbes`'s floor probe.
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
      /** Buyer-taste spread: `valuateCarForBuyer` bounds its taste multiplier
       * to `[1 - tasteSpread, 1 + tasteSpread]` around `marketValueYen` - how
       * well a buyer archetype's stat weights fit this car, never whether the
       * car is worth anything (that's `marketValueYen` alone). */
      tasteSpread: z.number().min(0).max(1),
      /**
       * A bot's walk-away target (`bots/buyoutHelpers.ts`'s
       * `walkAwayTargetYen`) is `instanceValue x strategyMultiplier` times a
       * small private spread, bell-shaped around 1.0 with this standard
       * deviation - even though every bidder reads the identical transparent
       * bands, no two private valuations of the same car land exactly on the
       * shared anchor.
       */
      walkAwaySpread: z.number().nonnegative(),
      /**
       * economy-bible.md law 5 (the foundation law): the aftermarket premium
       * (`marketValue.ts`'s `installedPartsValueYen`) is multiplied by the
       * factor of the SINGLE WORST foundational part before it counts toward
       * market value - no buyer pays for a race turbo in a car that can't stop
       * or steer. The base value (clean minus the restoration bill) already
       * prices broken parts through the bill; this gates only the ADD-ON
       * premium, so Law 1 is untouched, and repairing a failed foundational
       * part returns EXTRA on top of the `marketRepairDiscount` slope by
       * releasing the withheld premium.
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
       * economy-bible.md law 1 (as amended) and law 5's second multiplier:
       * diminishing returns, keyed to the car's tier. Each tier names the
       * `band` the market expects of that kind of car; the mint-referenced
       * restoration bill splits there, and the two halves are discounted at
       * different rates:
       *
       *   baseValue = cleanValue
       *             - marketRepairDiscount x billBelowExpectation
       *             - beyondDiscount        x billAboveExpectation
       *
       * Below the band, `marketRepairDiscount` applies and Law 1's >= 1
       * guarantee is absolute: making a car roadworthy always pays, every
       * tier, every damage state. Above it, `beyondDiscount` applies and MAY
       * be below 1 deliberately - restoring a shitbox kei to mint is passion
       * spend, not an investment. At mint both bills are zero, so a fully
       * restored car is worth exactly clean value and the no-inflation
       * ceiling is untouched. The result is the real-world shape: a tidy
       * running Wagon R (`beyondDiscount` 0.4) prices near a mint one, while a
       * scruffy FD (1.5) is worth a fraction of a concours FD.
       *
       * `aftermarketReturn` is the same idea on Law 5's premium term - a race
       * turbo on a kei returns a fraction of its cost, on a rare car all of
       * it. Capped at 1, so like `foundationFactor` it only ever withholds.
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
   * Repair cost per grade is ONE global fraction of the INSTALLED part's own
   * catalog `priceYen`, never the host car's tier -
   * `round(repairStepFraction * catalogPart.priceYen)`. Every repair-cost
   * function in the ONE cost pipeline (`costToMintYen`, `planPartRepair`, and
   * via those, `carCostToMintYen`/`groupCostToMintYen`/`planGroupRepair`/
   * `serviceJobCostBreakdown`) reads this. Structurally closes the donor-car
   * repair arbitrage a tier-scaled model would allow (laundering an
   * expensive car's worn parts through a kept shitbox at a fraction of the
   * price): a part's repair price is intrinsic to the part, identical on-car
   * or on the bench, wherever it sits and whoever owns the car. Replacement
   * pricing (scrap, a missing slot, a non-repairable consumable) stays flat
   * at `stockReplacementPriceYen` - a gearbox costs what a gearbox costs at
   * the parts market regardless of the car it's bolted to.
   */
  restoration: z.object({
    /** Fraction of the installed part's own `priceYen` one grade of repair
     * costs - worn -> mint (2 grades) costs `2 * repairStepFraction` of a
     * fresh part, so repair-vs-replace stays a real decision on every slot.
     * Tuning bait: "repairs feel wrong globally" moves this ONE number. */
    repairStepFraction: z.number().positive().max(1),
  }),
  /**
   * Deterministic supply/demand market pressure. Three signals (a slow
   * per-model demand wave, a supply-glut penalty, a flood-the-market penalty)
   * combine into a target `marketHeat` value each model's actual heat smooths
   * toward weekly. See `marketHeat.ts` for the formula.
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
   * `derivedStats.ts`'s five magic numbers, kept here as data so they can be
   * retuned without a code edit. `powerNormalizationCeiling` isn't a
   * `computeDerivedStats` input - it feeds `valuateCarForBuyer`'s taste
   * normalisation instead - but lives in this block since it's part of the
   * same "stat formula magic numbers" family.
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
   * The banded parts model's own tunables. The hidden-issue/inspection
   * system is paused and removed (see TODO.md); repair cost is now either a
   * per-part content field or applied via this schema's `restoration.
   * repairStepFraction`, on the installed part's own catalog price.
   */
  bands: z.object({
    /** Value factor per condition band - mint's baseline 1.0 down to scrap's
     * near-worthless floor. Feeds the cost-weighted value shim the same way
     * the old weighted-condition-percent used to feed `conditionFactor`
     * directly. */
    bandFactors: z.object({
      mint: z.number().positive(),
      fine: z.number().positive(),
      worn: z.number().positive(),
      poor: z.number().positive(),
      scrap: z.number().positive(),
    }),
    /** Save-migration thresholds: a legacy 0-100 condition value maps to
     * `mint` at or above the first breakpoint, `fine` at or above the
     * second, `worn` at or above the third, `poor` at or above the fourth,
     * and `scrap` below that. */
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
     * for - "pennies on the yen." */
    scrapValueFraction: z.number().min(0).max(1),
  }),
  /**
   * The stock-baseline/missing-slot model's own generation tunable - the
   * catalog's stock/street/sport/race prices and the restoration-bill/
   * installed-parts-value treatment are plain catalog data or reuse existing
   * `bands`/`valuation` machinery outright; this is the one new economy knob.
   */
  partsGeneration: z
    .object({
      /** Base per-slot chance a generated auction/service-job car's slot
       * rolls MISSING instead of a fresh stock part at the rolled band -
       * multiplied by `missingSlotWeightByPart`'s per-part weight below, so
       * the real per-slot chance is `missingSlotBaseChance * weight`.
       * Deliberately low; never applies to `forcedInduction`, which is
       * entirely tag-driven - see `generateAuctionCarInstance`, auctions.ts. */
      missingSlotBaseChance: z.number().min(0).max(1),
      /** Per-part multiplier on `missingSlotBaseChance`: 0 for
       * `block`/`chassis` (never missing, by explicit design), higher for
       * the cosmetically/physically pluckable slots (wheels, exhaust, aero,
       * seats) than the flat baseline everything else gets. */
      missingSlotWeightByPart: ByCarPartIdWeightSchema,
      /**
       * Generation is a single causal chain, `age -> mileage -> condition`.
       * Age sets a mileage range (these two curves, km by age in years), a
       * mileage is rolled uniformly in that range, and the mileage then sets
       * the condition-baseline range below (directive 16: age never reaches
       * condition except through mileage, the one coherent wear driver - also
       * the sole value-side wear signal, via `marketValue.ts`'s
       * `mileageFactor`). `auctions.ts`'s `mileageRangeForAge` samples both
       * curves at the car's age and rolls `rng.int(min, max)` once. 1990s
       * Japan centres ~9-10k km/yr, low by world standards (the shaken
       * inspection regime), with wide variance and a high-use tail - hence
       * the spread rather than a single mean.
       */
      mileageRangeMinByAgeYears: CurveSchema,
      mileageRangeMaxByAgeYears: CurveSchema,
      /**
       * The condition-baseline roll's [min, max] range (percent, pre-jitter)
       * as a function of the rolled mileage. `auctions.ts`'s
       * `conditionBaselineRangeForMileage` samples both at the rolled mileage
       * and rolls `rng.int(min, max)` once; the car's upkeep tier below then
       * offsets this baseline before each of the 29 parts jitters around it
       * in a per-tier range. Higher mileage skews condition worse; low-
       * mileage cars stay mostly good.
       */
      conditionBaselineMinByMileageKm: CurveSchema,
      conditionBaselineMaxByMileageKm: CurveSchema,
      /**
       * A per-car upkeep roll, layered ON TOP of the mileage-based baseline
       * above (that chain is unchanged) - real cross-car variance, so two
       * cars at the same mileage can be a genuine wreck or genuinely sound,
       * not interchangeably mediocre. Weights for the three tiers
       * (`generateAuctionCarInstance` rolls one per car, weighted).
       */
      upkeepTierWeights: z.object({
        neglected: z.number().nonnegative(),
        average: z.number().nonnegative(),
        cherished: z.number().nonnegative(),
      }),
      /** Added to the mileage-rolled condition baseline (percent) before
       * per-part jitter - negative for neglected, 0 for average, positive for
       * cherished. Clamped into [0, 100]. SCALED by `wearExposureByMileageKm`
       * below, so upkeep only expresses itself in proportion to how far the
       * car has actually been driven. */
      upkeepBaselineOffset: z.object({
        neglected: z.number(),
        average: z.number(),
        cherished: z.number(),
      }),
      /** Per-tier `[min, max]` per-part jitter range (percent) - neglected
       * skews a harsher negative tail (individual trashed components),
       * cherished a gentler one. The NEGATIVE bound is scaled by
       * `wearExposureByMileageKm` (the positive bound is not - a car can be
       * better than its baseline at any age; it cannot be worn out before it
       * has been driven). */
      upkeepJitterRange: z.object({
        neglected: z.tuple([z.number(), z.number()]),
        average: z.tuple([z.number(), z.number()]),
        cherished: z.tuple([z.number(), z.number()]),
      }),
      /**
       * How much of the upkeep tier's wear can express itself, by the car's
       * own mileage - `[mileageKm, exposure]` breakpoints in [0, 1], read
       * through the same `interpolateCurve` every other curve here uses.
       * Without this, `upkeepBaselineOffset`/`upkeepJitterRange` would apply
       * as ABSOLUTE offsets regardless of age, letting a neglected roll drive
       * a near-new car's parts to `poor`. Mileage-driven wear already lives
       * in the condition baseline itself (`conditionBaselineMinByMileageKm`);
       * this curve governs the SECOND, independent axis - how badly the
       * previous owner treated it - which cannot have expressed itself on a
       * car that has barely moved. At exposure 0 every upkeep tier produces
       * the same near-mint car; at exposure 1 a neglected roll bites exactly
       * as hard as it did before.
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
       * economy-bible.md law 2 (no value traps): the hard ceiling on a
       * generated car's restoration bill, as a fraction of its clean value
       * (at neutral heat) - `generateAuctionCarInstance` softens the
       * worst-rolled parts, one band at a time in seeded order, until
       * `carCostToMintYen(car) <= maxBillFraction * cleanValue`. Every
       * generatable lot is therefore profitably restorable by construction.
       *
       * The OTHER half of the (D, F) interlock - see
       * `valuation.marketRepairDiscount`'s own doc comment for the full
       * constraint. `marketRepairDiscount x maxBillFraction` must stay below
       * 1 (today 1.5 x 0.6 = 0.90) or a worst-case car's value falls through
       * the scrap floor. Never move one without the other.
       */
      maxBillFraction: z.number().positive().max(1),
      /**
       * The core-loop law's floor: the minimum below-expectation restoration
       * bill a generated car must carry, as a fraction of `bookValueYen`, keyed
       * by `PartFitmentClass` (`fitmentClassForTier` - `legend`/`gaisha` fold
       * into `rare`, same as every other fitment-keyed config). After symptoms
       * land, `auctions.ts`'s `enforceMinWorkBill` degrades installed parts
       * (seeded, honest visible wear, never forced to `scrap`) until the true
       * car's bill to its own tier's expectation band
       * (`valuation.expectationByTier[tier].band`) clears `bookValueYen *
       * minWorkBillFractionByTier[tier]`. Without this floor a generated lot
       * could roll with nothing below expectation to fix at all - no fixable
       * work, no core loop. The trailing refine below keeps every tier's floor
       * strictly under `maxBillFraction`'s ceiling: the floor top-up runs under
       * the SAME Law 2 guard `enforceMaxBillFraction` already enforces, so the
       * floor must never be able to reach the ceiling it is itself bounded by.
       */
      minWorkBillFractionByTier: z.record(PartFitmentClassSchema, z.number().positive().max(1)),
      /**
       * Per ELIGIBLE, non-missing slot (eligible = the catalog has a `grade >
       * stock` entry for this `carPartId` at the car's own fitment class),
       * the chance `generateAuctionCarInstance` fits that aftermarket part
       * instead of the default stock one, at the SAME rolled band the stock
       * part would have had. Runs strictly after the missing-slot roll (a
       * missing slot is never also aftermarket) and before the symptom roll,
       * so a symptom's cause can damage whatever ends up fitted either way.
       */
      aftermarketChance: z.number().min(0).max(1),
      /** The hard cap on how many slots per car this roll can ever fit - a
       * "someone's old project" car is meaningfully modified, not entirely
       * rebuilt; `generateAuctionCarInstance` stops rolling aftermarket once
       * this many slots have already landed one. */
      maxAftermarketSlots: z.number().int().nonnegative(),
      /** Which of the three real aftermarket grades a hit rolls, weighted
       * (street the common case, race the rare one) - renormalised over
       * whichever grades the catalog actually has for this specific
       * `carPartId`+fitment class (today, always all three). */
      aftermarketGradeWeights: z.object({
        street: z.number().nonnegative(),
        sport: z.number().nonnegative(),
        race: z.number().nonnegative(),
      }),
    })
    .refine(
      (pg) =>
        PartFitmentClassSchema.options.every((c) => pg.minWorkBillFractionByTier[c] !== undefined),
      { message: 'partsGeneration.minWorkBillFractionByTier must name every fitment class' },
    )
    .refine(
      (pg) =>
        PartFitmentClassSchema.options.every(
          (c) => pg.minWorkBillFractionByTier[c]! < pg.maxBillFraction,
        ),
      {
        message:
          'partsGeneration.minWorkBillFractionByTier[*] must be strictly below partsGeneration.maxBillFraction - the floor top-up runs under the same Law 2 ceiling guard, so it must never be able to reach it',
      },
    ),
  /**
   * Two reachable quality tiers. Clean requires only player effort (no part
   * below the band bar); concours additionally requires authenticityPercent
   * to clear its own bar - a value the player can never raise, rolled 60-95
   * at generation, so concours stays a genuine bonus for a well-matched car
   * rather than the only way to earn anything at all. Lemon's penalty and
   * thresholds (`LEMON_MAX_AVERAGE_CONDITION` etc.) live in
   * `sim/constants.ts`.
   */
  reputation: z.object({
    /**
     * The reputation ladder. CALIBRATED AGAINST REAL PLAY, NOT THE BOT - a
     * real session reaches `local` at roughly 5 rep/day; the harness's
     * `competent-policy` probe earns about 1 rep/day and takes until p50 day
     * 16. A ladder scaled to the bot collapses under real play.
     *
     * INTERLOCK: `local` drives the hard-gated days-to-`local` invariant
     * (`tools/balance/invariants.py`), which measures the ~1 rep/day BOT, so
     * raising `local` moves that gate's p50 almost 1:1 and the band must move
     * with it. That invariant measures bot patience rather than game pacing;
     * see `TODO.md`'s harness-rework entry.
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
     * a floor per part ("seven great parts can't hide one neglected one"),
     * reachable by effort alone, unlike the authenticity roll below. */
    cleanSaleMinBand: z.enum(['scrap', 'poor', 'worn', 'fine', 'mint']),
    cleanSaleBonus: z.number().int().nonnegative(),
    /** Concours also requires the car's (unmodifiable) authenticityPercent to
     * clear this bar - on top of, not instead of, the clean band bar. */
    concoursSaleMinAuthenticityPercent: z.number().int().min(0).max(100),
    /** Concours bonus; replaces (does not stack with) cleanSaleBonus. */
    concoursSaleBonus: z.number().int().nonnegative(),
    /** Word-of-mouth term for a MATCHED sale (the car fits the buyer's
     * visible want) - stacks on top of any clean/concours bonus rather than
     * replacing it, since it rewards a different thing (reading the buyer,
     * not the car's own condition). Revealed only in sale-close copy, never
     * as an ambient number (progression bible law 4). */
    matchedSaleRepBonus: z.number().int().nonnegative(),
    /** Reputation docked for selling a lemon - a mechanically unsound car,
     * caught either by a single present part at `scrap`/missing or by the
     * car's cost-weighted band factor sitting at or below
     * `lemonMaxAverageBandFactor` below. A positive number; the delta applied
     * is its negation, so selling a lemon is a real setback worth several
     * clean sales. */
    lemonSalePenalty: z.number().positive(),
    /** The cost-weighted band-factor bar (a 0-1 fraction) at or below which a
     * sale counts as a lemon regardless of any single part - set above
     * `bands.bandFactors.poor` so "every part poor" reliably reads as a lemon,
     * yet below `worn` so an otherwise-sound car with one worn part stays
     * neutral. */
    lemonMaxAverageBandFactor: z.number().min(0).max(1),
  }),
  /**
   * The service-job framework's own tunables: derived-payout inputs and the
   * daily offer-arrival cadence.
   */
  serviceJobs: z
    .object({
      /**
       * `payout`'s margin rolls uniform in `[marginMin, marginMax]` over the
       * task+labour cost pool (`deriveServiceJobPayoutYen`, serviceJobs.ts).
       * The floor stays above the Law 4 hard-gated payout-coverage minimum
       * (1.15) with real headroom; the ceiling keeps a typical job's profit
       * feeling like paid work, not a jackpot.
       */
      marginMin: z.number().positive(),
      marginMax: z.number().positive(),
      /** Yen per labor slot the payout formula credits toward the job's
       * "wrench time" component - a market rate, not tied to the shop's own
       * current equipment tier (see that function's own doc comment). */
      laborRateYen: z.number().int().nonnegative(),
      /** Flat callout/booking fee added on top of the margin-applied pool. */
      calloutFeeYen: z.number().int().nonnegative(),
      /**
       * How many days a fresh radial offer stays on the board before it
       * expires unaccepted - an inclusive `[min, max]` day range rolled
       * uniformly PER OFFER (`generateDailyServiceJobOffers`). Uniform over
       * 3..8 gives a ~5.5-day mean with real variety. Story missions are
       * unaffected (they never expire).
       */
      offerLifetimeDaysRange: DayRangeSchema,
      /** Bell-shaped weights over how many fresh offers land on the board
       * each day - index 0 is the weight for 0 offers, index 4 for 4; must
       * sum to 1 (`generateDailyServiceJobOffers`'s own sampling reads this
       * as a discrete distribution). */
      dailyOfferCountWeights: z.array(z.number().min(0)).length(5),
      /**
       * A linear-stepped ramp clamping the weighted draw above so a fresh
       * career sees a gentle trickle before the full distribution unlocks -
       * `[dayThreshold, capAtOrAfterThatDay]` pairs, ascending by day, the
       * step-function `offerCountCapForDay` (serviceJobs.ts) reads (NOT
       * smooth interpolation - an offer count is always a whole number).
       */
      offerCountCapByDay: z
        .array(z.tuple([z.number().int().positive(), z.number().int().nonnegative()]))
        .min(1),
    })
    .refine((s) => s.marginMin <= s.marginMax, {
      message: 'serviceJobs.marginMin must be <= marginMax',
    }),
  /**
   * The walk-in offer stream: a for-sale car's daily offer draw (content
   * law: designer-tunable numbers live in JSON, not in code).
   * `offerChanceFor`/`sellViaWalkIn` (selling.ts) are the two consumers.
   */
  selling: z
    .object({
      /** Base daily chance a for-sale car draws an offer at all, before the
       * tier/heat-band multipliers below. */
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
       * continuous curve, so each one can be eyeball-tuned directly. */
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
       * variable" walk-in-style roll. CONSTRAINT: the floor must stay high
       * enough that, compounded with `valuation.tasteSpread`'s own worst
       * case, a fully-restored car's worst-case walk-in sale cannot erase the
       * worst-case flip margin the Law 2 generation guard still permits
       * (`coherence.ts`). CONSTRAINT: the mean must not exceed 1.0 - the
       * no-free-lunch invariant that an unmodified car's expected walk-in
       * sale never nets a profit over its own guide value
       * (`valueModelProbes.test.ts`). The current range keeps the mean at
       * 0.99, a real discount on average, with narrow enough tails that a
       * patient, unimproved flip can't rely on a lucky high roll to clear a
       * real profit.
       */
      offerSpread: z
        .tuple([z.number().positive(), z.number().positive()])
        .refine(([min, max]) => min <= max, { message: 'offerSpread min must be <= max' }),
    })
    .refine((s) => s.heatBandColdBelowPercent <= s.heatBandHotAtOrAbovePercent, {
      message: 'selling.heatBandColdBelowPercent must be <= heatBandHotAtOrAbovePercent',
    }),
  /**
   * The five listing channels a for-sale car can be listed on (directive 22
   * lever list) - see `SellingChannelSchema`'s own doc comment above for the
   * per-channel shape. Reuses `selling.offerChanceBase` as the base rate
   * every channel's own factor multiplies, and `valuation.tasteSpread`'s
   * +/-12% band as what `tasteCeiling` caps the top of - no parallel offer or
   * taste system.
   */
  sellingChannels: SellingChannelsSchema,
  /**
   * The one own-car capability ceiling (progression bible's bolt-on vs built
   * line). Converting a factory-NA car to forced induction (fitting the
   * FIRST turbo/supercharger into a legitimately-empty slot,
   * `hasForcedInduction(model) === false`) is fabrication work, gated behind
   * this engine tool tier - a car that already carries a forced-induction
   * part swaps freely at any tier; only the first conversion is gated
   * (`jobs.ts`'s `naToTurboConversionBlocked`).
   */
  toolCeilings: z.object({
    naToTurboConversionEngineTier: ToolTierSchema,
  }),
  /**
   * Tools cap the finish: the best condition band a REPAIR can reach at each
   * tool tier. Tier-1 hand tools climb a part only to `fine`; owning the
   * tier-2 machine is what lets a repair reach `mint`. This is a HARD cap on
   * REPAIRING, never a rental and never a gate on INSTALL: buying a mint
   * replacement part and fitting it is allowed at any tier (a bought part is
   * already mint via `resolveBuyPart`), so mint is ALWAYS reachable by buying
   * - owning tier-2 only lets you REPAIR the existing part to mint instead
   * (cheaper, and it keeps a genuine-period part; that price gap IS the
   * incentive to own). Read per group's own tool tier by the repair planners
   * (`planGroupRepair`/`planPartRepair`/`planReconditionPart`/
   * `repairJobGate`, sim). Deliberately NOT read by value/cost accounting
   * (`carCostToBandYen`, `serviceJobCostBreakdown`): those price the
   * mint-referenced restoration bill and the market-rate customer quote, both
   * tier-independent facts, never the player's own shop capability. Keyed per
   * tier (1/2/3); per-group overrides are unnecessary (uniform). Must be
   * band-monotonic up the ladder - a higher tier never repairs to a WORSE
   * band.
   */
  repairBandCeilingByTier: z
    .object({
      1: ConditionBandSchema,
      2: ConditionBandSchema,
      3: ConditionBandSchema,
    })
    .refine(
      (c) => {
        const idx = (band: (typeof ConditionBandSchema.options)[number]) =>
          ConditionBandSchema.options.indexOf(band)
        return idx(c[1]) <= idx(c[2]) && idx(c[2]) <= idx(c[3])
      },
      {
        message:
          'repairBandCeilingByTier must be band-monotonic up the tiers (tier 1 <= tier 2 <= tier 3)',
      },
    ),
  /**
   * The specialty axis's tunables (progression bible's horizontal axis -
   * per-discipline word of mouth). `biasFactor`/`softcapPoints` shape the
   * offer-selection weight (`1 + biasFactor * min(1, specialty[group] /
   * softcapPoints)`, `pickServiceJobTemplate`, serviceJobs.ts);
   * `premiumThresholdPoints`/`inLanePremium` gate and size the in-lane payout
   * premium (`deriveServiceJobPayoutYen`'s margin roll, same file).
   * `titleThresholdPoints`/`titleBiasMultiplier`: the derived shop title
   * (`shopTitle`) requires the top specialty group to clear
   * `titleThresholdPoints`; once it does, that group's offer-selection weight
   * is ADDITIONALLY multiplied by `titleBiasMultiplier` - a title is both a
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
   * The used-machinery classifieds cadence. Reputation still gates which
   * tool tiers are ELIGIBLE (per-tier thresholds, unchanged); a listing is
   * what makes an eligible tier actually PURCHASABLE, one machine at a time.
   * `minGapDays`/`maxGapDays` bound the seeded roll for how long the
   * classifieds stay quiet after a listing lapses (or before the first one
   * ever appears, once something becomes eligible); `windowDays` is how long
   * a fresh listing stays live before it lapses (unbought machines are never
   * lost - a later issue can list the same one again).
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
   * economy-bible.md law 4 (one derived ledger, machine-checked): the one
   * number the roster-wide coherence check (`coherence.ts`,
   * `tools/balance/src/balance/invariants.py`) gates the "brake pads vs car
   * price" guard against - the full tyres+brakePadsDiscs+clutch consumable
   * set, class-priced, must never exceed this fraction of a model's own book
   * value. A content anchor rather than a hardcoded check constant.
   */
  coherence: z.object({
    maxConsumablesShareOfBookValue: z.number().positive().max(1),
  }),
  /**
   * Labour cost by slot depth for the symmetric uninstall/install verbs
   * (`resolveRemovePart`/`installFitGate`, jobs.ts). `usedPartSaleFraction`
   * is `resolveSellPart`'s haircut off a part's own resolved price
   * (parts.ts); `donorBreakEvenBillRatio` is the bill-to-clean ratio above
   * which parting out a car's worst-case rolled condition can beat the
   * sensible-repair route - a disclosed measurement threshold for the
   * balance report, not a hard-gated invariant.
   *
   * Removal labour is priced by `energy.actionPoints.removePart` (one flat
   * figure, not per depth class); like-for-like reassembly prices through
   * `energy.actionPoints.refitUnchangedMember` via `jobs.ts`'s
   * `refitLaborSlotsFor` and `CarPartState.vacatedBaseline`.
   */
  teardown: z.object({
    usedPartSaleFraction: z.number().positive().max(1),
    donorBreakEvenBillRatio: z.number().positive().max(1),
  }),
  /**
   * The continuous daily labour bar's own knobs. Labour is spent as integer
   * "energy points" so the sim stays deterministic (no floats per the
   * boundary law) - the x10 scale (`pointsPerLabour`) gives finer-than-a-slot
   * granularity while keeping every quantity an integer. The player-facing
   * word stays "labour" (never "energy"); the value the player reads IS this
   * integer point value (no decimals).
   *
   * Tools and staff are the loosening levers: a benched member RAISES the
   * pool (`laborSlotsPerDay x pointsPerLabour`, `energyMax` in
   * laborSlots.ts), while a higher tool tier REDUCES a repair's per-grade
   * cost (`energyPerGradeByTier`, no ceil, so a tier is a genuine fraction of
   * the work, not a rounded-up whole slot).
   */
  energy: z.object({
    /** Energy points one labour slot is worth (the x10 scale). The per-member
     * pool contribution is `staffMember.laborSlotsPerDay x pointsPerLabour`, and
     * a single-labour op (a diagnostic test, an owned-car workup) costs exactly
     * this. Display divides nothing: the point value the sim holds is the number
     * the player reads. */
    pointsPerLabour: z.number().int().positive(),
    /** The solo shop's daily labour pool in points (`energyMax`'s base term) -
     * the old `PLAYER_BASE_LABOR_SLOTS` x `pointsPerLabour`, so day-1 is
     * unchanged. Benched staff add on top; the pool refills fully each day. */
    basePoolPoints: z.number().int().positive(),
    /** Repair energy per grade climbed, by the group's tool tier (the tool-
     * tier speed axis, now on the bar). A repair costs `grades x
     * energyPerGradeByTier[tier]` points - NO ceil, so a higher tier is a
     * genuine fraction of the work. Must be positive and non-increasing up
     * the tiers (a better tier never costs MORE per grade). */
    energyPerGradeByTier: z
      .object({
        1: z.number().int().positive(),
        2: z.number().int().positive(),
        3: z.number().int().positive(),
      })
      .refine((e) => e[1] >= e[2] && e[2] >= e[3], {
        message:
          'energy.energyPerGradeByTier must be non-increasing up the tiers (tier 1 >= tier 2 >= tier 3)',
      }),
    /** Install energy by the target slot's depth class. Removal and a
     * like-for-like equivalence refit price through `actionPoints.removePart`
     * and `actionPoints.refitUnchangedMember` respectively. */
    energyByClass: z.object({
      surface: z.number().int().nonnegative(),
      'bolt-on': z.number().int().nonnegative(),
      buried: z.number().int().nonnegative(),
    }),
    /** Every physical player action's labour figure, in energy points, in one
     * map - the sim reads each action's cost from here and nowhere else. Zero
     * means the action is free today; any key raised above zero makes that
     * action gate on the remaining labour bar and spend its figure into
     * `energySpentToday`. */
    actionPoints: z
      .object({
        removePart: z.number().int().nonnegative(),
        removeAssembly: z.number().int().nonnegative(),
        refitAssembly: z.number().int().nonnegative(),
        refitUnchangedMember: z.number().int().nonnegative(),
        benchFitMember: z.number().int().nonnegative(),
        benchRemoveMember: z.number().int().nonnegative(),
        benchBuildAssembly: z.number().int().nonnegative(),
        moveCar: z.number().int().nonnegative(),
        scrapShell: z.number().int().nonnegative(),
        scrapPart: z.number().int().nonnegative(),
        workup: z.number().int().nonnegative(),
        inspectionVisit: z.number().int().nonnegative(),
      })
      .strict(),
  }),
  /**
   * The machine-shop assist. Until the player owns the relevant tier-2
   * machine, a BURIED engine/drivetrain operation (remove OR install, the
   * same `removeMachineGateGroup` predicate) is still workable at a cash fee
   * instead of a hard wall - `feeYenByGroup[group]`, posted to the car's
   * ledger through the existing repair-cost path so service-job billing and
   * mission budget caps see it. Ownership removes the fee (buys margin), it
   * never gates capability. `probeAmortisationOps` is the operation count the
   * coherence probe amortises the machine's own `upgradePriceYen` over: each
   * fee must be > 0 and strictly cheaper per operation than owning the
   * machine at that volume. The tier-2/3 purchase gates (price, reputation,
   * listing) are untouched.
   *
   * Uniform tool access: every one of the six groups carries a fee, so tool
   * access is rent-or-own uniformly. Suspension, body, and interior - which
   * otherwise gate nothing on the player's own car - each also carry a
   * `signatureSlotsByGroup` entry naming the slots whose heavy op (repair or
   * install/replace) needs their tier-2 machine (`signatureOpFeeYen`,
   * sim/jobs.ts). Engine/drivetrain keep their buried-slot gate and wheels
   * its tyre-fit gate, unchanged, so those three groups are deliberately
   * absent from `signatureSlotsByGroup`.
   */
  machineShopAssist: z.object({
    feeYenByGroup: z.object({
      engine: z.number().int().positive(),
      drivetrain: z.number().int().positive(),
      /** The two-post lift's per-job fee for the suspension signature op
       * (fit/repair dampers or springs) without owning it. */
      suspension: z.number().int().positive(),
      /** The per-tyre-operation fitting charge a shop without the tier-2
       * tyre machine pays to swap a tyre onto (or off) the rims on the bench
       * - a 1995 tyre-shop fitting fee. Unlike the engine/drivetrain fees
       * (which gate buried removal AND install of those groups' assemblies),
       * this one applies ONLY to a tyre-into-assembly bench op, never to
       * removing or refitting the whole wheel assembly. */
      wheels: z.number().int().positive(),
      /** The MIG welder & panel tools' per-job fee for the body signature op
       * (weld/panel repair or replace of panels or underbody). */
      body: z.number().int().positive(),
      /** The upholstery & trim bench's per-job fee for the interior
       * signature op (retrim of seats or dash & gauges). */
      interior: z.number().int().positive(),
    }),
    /**
     * Per group, the slots whose signature heavy op needs that group's
     * tier-2 machine - the named-slot gate for the three groups (suspension,
     * body, interior) that lack one otherwise. `signatureOpFeeYen`
     * (sim/jobs.ts) charges `feeYenByGroup[group]` on a repair or
     * install/replace that touches one of these slots unless the group's
     * tier-2 is owned (removal stays free; a non-listed light bolt-on slot in
     * the same group is never charged). A PARTIAL map by design:
     * engine/drivetrain gate on buried depth (`removeMachineGateGroup`) and
     * wheels on the tyre bench op (`benchSwapFeeYen`), so they name no slots
     * here - this predicate must never fire for them.
     */
    signatureSlotsByGroup: z.partialRecord(ComponentIdSchema, z.array(CarPartIdSchema).min(1)),
    probeAmortisationOps: z.number().int().positive(),
  }),
  /**
   * The diagnosis knobs. The room prices the symptom, the player prices the
   * cause: a symptomatic car's sheet value is the cause-weighted expectation
   * over every authored cause (`sheetGuideValueYen`, sim/diagnosis.ts) with
   * no premium on top - knowledge, not a multiplier, is what separates the
   * player's number from the room's. `symptomChanceByTier` is keyed by
   * `PartFitmentClass` (the same four values `valuation.expectationByTier`
   * uses), rolled per generated car (`generateAuctionCarInstance`);
   * `secondSymptomChance` is the independent roll for a SECOND symptom once
   * the first lands, capped at `maxSymptomsPerCar`.
   * `visitMinutes`/`travelFeeYenByTier` govern the yard inspection verb.
   */
  diagnosis: z.object({
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
     * The two one-line reveal templates `resolveSellViaWalkIn`
     * (sim/selling.ts) picks between when a sold car still carries an
     * unresolved symptom - each a full sentence carrying a literal `<cause>`
     * token the sim substitutes with the true cause's own display label.
     * `buyerWon` fires when the true cause turns out cheaper (milder) than
     * the player's own estimate at time of sale; `playerWon` when it turns
     * out dearer.
     */
    saleRevealCopy: z.object({
      buyerWon: z.string().min(1),
      playerWon: z.string().min(1),
    }),
  }),
  /**
   * The live auction room's tuning: the seeded clearing draw, the raise
   * pacing, and the six bidding reactions, all read by the shared room
   * machine (`packages/game/src/screens/auctionRoom.ts`) rather than a
   * hardcoded constant, so every room the game seats (the tuning demo, the
   * tutorial's quiet room, and the production floor alike) rides one source
   * of truth.
   */
  auctionRoom: AuctionRoomConfigSchema,
  /**
   * One pure, monotonic formula over the car's CURRENT derived stats -
   * `lapModel.ts`'s `lapTimeSecondsFor` reads every field here, never a
   * hardcoded constant of its own. `C` and `ratioExp` are the power-to-weight
   * curve's scale and exponent (`C x (curbWeightKg / power) ^ ratioExp`);
   * `gripMult` is the fitted tyre SKU's own grade multiplying that base time
   * (worse grip - `stock` - always slower, `race` always faster - monotonic
   * by construction, never re-ordered by content). `courseId`/`courseName`
   * name the one v1.0 course; the schema is course-keyed so a second course
   * is content, not a code change.
   *
   * `gripMult`'s spread is deliberately tight: race tyres worth much more
   * than roughly +26% power-equivalent over stock (about +6% per tyre step)
   * would make tyre choice a solved opening move for every lap mission. Real
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
   * Every tunable knob behind job-ad acquisition and the crew economy. Both
   * formulas are fixed in code (`deriveStaffWageYen` and
   * `computeContractIncomeYen`, sim); these are their coefficients plus the
   * ad-board and candidate-roll knobs. Content law: retune wage feel,
   * contract feel, or ad pacing here, never in code.
   *
   * The principle: more people means more work, plainly; passive income is an
   * assignment you trade labour for, never a bonus on top.
   *
   * WAGE, a pure function of the stat line and the labour slots, never rolled
   * independently (the drift guard `staffProbes.test.ts` asserts this):
   *   `weeklyWageYen = round100(wageBaseYen + wagePerSkillPointYen * sum(stats)
   *                   + wagePerLaborSlotYen * laborSlotsPerDay)`.
   *
   * CONTRACT income, the daily fleet retainer a `contract`-assigned member
   * earns (taxi firms, delivery fleets), accrued in `serviceBay.ts`:
   *   `contractBaseYenPerDay + contractPerSkillPointYenPerDay * sum(stats)`.
   *
   * Coefficients are derived by exhaustive search (maximin-centred) so the
   * hire coherence probe HARD-GATES all three bounds with honest margins:
   *   A (net profit): weekly contract in [1.05, 1.40] x weekly wage, every
   *     candidate every tier - a parked member always profits, modestly.
   *   B (honest work beats the retainer): weekly contract <= 0.5 x
   *     (laborSlotsPerDay x 7 x serviceJobs.laborRateYen), every candidate -
   *     the same hands billed out always out-earn the retainer by at least
   *     double.
   *   C (first hire reachable): the entry tier's cheapest introduction fee
   *     stays within 15% of STARTING_CASH_YEN.
   *
   * `laborSlotsPerDayWeights` is `[weightFor1Slot, weightFor2Slots]` - the
   * weighted roll for how many slots a generated candidate puts in (a pair of
   * hands is a pair of hands, no thresholds).
   *
   * `introductionFeeWeeks` is the one-off hiring fee, in multiples of the
   * candidate's weekly wage, charged at hire; 0 disables it. With parking
   * net-positive, the fee keeps "hire four on day one" an investment with a
   * payback period rather than a free annuity.
   *
   * `statBudgetByTier` is a PER-STAT inclusive `[min, max]` range applied to
   * each of the three stats independently (better shops attract people who
   * are stronger across the board, consistent with the progression bible's
   * Capability pillar) - `min <= max`, both within the 1..5 stat domain. The
   * per-tier ladder is deliberately overlapping and monotone, not disjoint.
   *
   * `maxOpenAds`/`adExpiryDays` govern the weekly ad refresh; `maxStaff` is
   * the GDD section 7 hiring cap.
   */
  staff: z
    .object({
      wageBaseYen: z.number().int().nonnegative(),
      wagePerSkillPointYen: z.number().int().nonnegative(),
      wagePerLaborSlotYen: z.number().int().nonnegative(),
      contractBaseYenPerDay: z.number().int().nonnegative(),
      contractPerSkillPointYenPerDay: z.number().int().nonnegative(),
      /** `[weightFor1Slot, weightFor2Slots]` - the weighted roll for a
       * generated candidate's `laborSlotsPerDay`. Need not pre-normalise to
       * 1 (same convention as the other weight tuples here). */
      laborSlotsPerDayWeights: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
      /** One-off hiring fee, in multiples of the weekly wage; 0 disables. */
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
      /**
       * Which component groups each crew skill leads. A member's
       * `engine`/`chassis`/`body` stat acts on the groups listed here while
       * they are at the bench; the three lists partition all six component
       * groups exactly once. `crewSkillFor(group)` (sim) reads the highest
       * listed skill among benched members. */
      skillGroupMap: z.object({
        engine: z.array(ComponentIdSchema).min(1),
        chassis: z.array(ComponentIdSchema).min(1),
        body: z.array(ComponentIdSchema).min(1),
      }),
      /**
       * Labour slots a group repair plan saves, indexed by the leading
       * benched crew skill (index 0..5; index 0 = no crew). Non-decreasing (a
       * stronger hand never saves fewer slots). The saving is clamped in code
       * so a plan keeps at least half its base slots and at least one
       * labour's worth (`crewEnergySaved`, sim). */
      crewSpeedDiscount: z
        .array(z.number().int().nonnegative())
        .length(6)
        .refine((c) => c.every((v, i) => i === 0 || v >= c[i - 1]!), {
          message: 'staff.crewSpeedDiscount must be non-decreasing',
        }),
      /**
       * Extra inspection minutes a benched `auction-rat` adds to a Local Yard
       * visit (`beginInspectionVisit`, sim). No stacking - one rat's worth of
       * minutes regardless of count. */
      auctionRatExtraMinutes: z.number().int().nonnegative(),
      /**
       * The fraction a benched `perfectionist` takes off repair cash cost
       * (0.10 = 10% cheaper). The same trait also spends one of the crew
       * speed slots (careful work is slower) - both applied in
       * `crewEnergySaved`/`perfectionistCostMultiplier` (sim). */
      perfectionistPartsDiscount: z.number().min(0).max(1),
    })
    .refine((s) => ReputationTierSchema.options.every((t) => s.statBudgetByTier[t] !== undefined), {
      message: 'staff.statBudgetByTier must name every reputation tier',
    })
    .refine(
      (s) => {
        const listed = [
          ...s.skillGroupMap.engine,
          ...s.skillGroupMap.chassis,
          ...s.skillGroupMap.body,
        ]
        return (
          listed.length === ComponentIdSchema.options.length &&
          ComponentIdSchema.options.every((g) => listed.filter((x) => x === g).length === 1)
        )
      },
      { message: 'staff.skillGroupMap must partition every component group exactly once' },
    ),
  /**
   * The auction card's four-stamp grade. `overallRatioSteps` is the only
   * tunable: `computeAuctionGrade` (sim/auctionGrade.ts) divides the
   * apparent car's mint-referenced restoration bill by the model's book
   * value and walks this list top-down for the first step whose `maxRatio`
   * covers that fraction, so a cheap car's bill has to be a much smaller
   * slice of its own book value to earn the same grade as an expensive
   * one's. Must stay non-empty; the letter grades (mechanical, exterior,
   * interior) and the 'R' mechanical-corpse override carry no tunables of
   * their own.
   */
  auctionGrading: z.object({
    overallRatioSteps: z.array(AuctionGradingStepSchema).min(1),
  }),
})

export type EconomyConfig = z.infer<typeof EconomyConfigSchema>
export type AuctionRoomConfig = z.infer<typeof AuctionRoomConfigSchema>
