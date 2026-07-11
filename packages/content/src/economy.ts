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
   * Weekly rent, deducted alongside staff wages on 7-day boundaries.
   * Temporarily 0 per maintainer decision 2026-07-10 until the economy
   * works end-to-end; restored as a tuned knob in Sprint 23.
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
})

export type EconomyConfig = z.infer<typeof EconomyConfigSchema>
