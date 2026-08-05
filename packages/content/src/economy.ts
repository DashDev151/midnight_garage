import { z } from 'zod'
import { BuyerArchetypeSchema } from './buyer'
import { DAMAGE_PATTERN_IDS } from './damagePattern'
import { PartFitmentClassSchema } from './partFitment'
import { UpkeepTierSchema } from './provenance'
import { PowerFractionSchema } from './stats'
import {
  CarPartIdSchema,
  ComponentIdSchema,
  ConditionBandSchema,
  ReputationTierSchema,
  TyreCompoundSchema,
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
  aero: z.number().nonnegative(),
  seats: z.number().nonnegative(),
  dashGauges: z.number().nonnegative(),
})

/** A zone's severity roll weights over 0/1/2/3, as positive integer
 * percentages - not required to sum to exactly 100, but every seed table in
 * this codebase does. Feeds `partsGeneration.zoneStates` below. */
const ZoneSeverityWeightsSchema = z.tuple([
  z.number().int().positive(),
  z.number().int().positive(),
  z.number().int().positive(),
  z.number().int().positive(),
])

/** One `ZoneSeverityWeightsSchema` row per `PartFitmentClass`. */
const ByPartFitmentClassZoneWeightsSchema = z.object({
  entry: ZoneSeverityWeightsSchema,
  everyday: ZoneSeverityWeightsSchema,
  enthusiast: ZoneSeverityWeightsSchema,
  flagship: ZoneSeverityWeightsSchema,
})

/**
 * How rough a generated car is, as one ordered four-point scale: `tidy` is a
 * couple of jobs and a good weekend, `used` is honest wear and real work,
 * `rough` is a proper project, `project` is a car someone gave up on. Ordered
 * tidy-to-project, and the order is load-bearing - the schema refines the
 * band-step ladder to rise along it.
 */
export const DamageGradeSchema = z.enum(['tidy', 'used', 'rough', 'project'])
export type DamageGrade = z.infer<typeof DamageGradeSchema>
export const DAMAGE_GRADES = DamageGradeSchema.options

/** One non-negative draw weight per damage grade, keyed explicitly so a
 * missing grade fails validation rather than silently reading as zero. */
const DamageGradeWeightsSchema = z.object({
  tidy: z.number().nonnegative(),
  used: z.number().nonnegative(),
  rough: z.number().nonnegative(),
  project: z.number().nonnegative(),
})

/**
 * How well a kind of car tends to have been looked after
 * (docs/design/systems/generation-damage.md, layer 2). A car's culture picks
 * one of these and its tier shifts the choice one step, so the profile is the
 * distribution the car's own history is rolled from.
 *
 * DECLARATION ORDER IS LOAD-BEARING: this is one ordered ladder from
 * best-treated to worst, and the tier shift walks it by index (a flagship
 * moves one step toward `cherished`, an entry car one step toward `worked`).
 */
export const CareProfileSchema = z.enum(['cherished', 'enthusiast', 'mixed', 'hammered', 'worked'])
export type CareProfile = z.infer<typeof CareProfileSchema>
export const CARE_PROFILES = CareProfileSchema.options

/** One grade distribution per care profile, keyed explicitly so a missing
 * profile fails validation rather than leaving a culture with no table. */
const CareProfileWeightsSchema = z.object({
  cherished: DamageGradeWeightsSchema,
  enthusiast: DamageGradeWeightsSchema,
  mixed: DamageGradeWeightsSchema,
  hammered: DamageGradeWeightsSchema,
  worked: DamageGradeWeightsSchema,
})

/** Which care profile each culture starts from, keyed explicitly so a culture
 * added to `CarCultureSchema` without a profile fails validation rather than
 * silently generating undefined weights. */
const CareProfileByCultureSchema = z.object({
  kei: CareProfileSchema,
  drift: CareProfileSchema,
  wangan: CareProfileSchema,
  kyusha: CareProfileSchema,
  rotary: CareProfileSchema,
  touge: CareProfileSchema,
  exotic: CareProfileSchema,
  kurokan: CareProfileSchema,
  'honest-transport': CareProfileSchema,
  'rally-bred': CareProfileSchema,
  'touring-car': CareProfileSchema,
  'front-drive-tuner': CareProfileSchema,
  oddball: CareProfileSchema,
})

/**
 * The four whole-car paint states `rollZoneStates` (sim/bodyPipeline.ts)
 * rolls a car into at generation: still wearing its factory colour, resprayed
 * to something else, one panel a family-neighbour shade, or one panel bare.
 * Declaration order feeds the cumulative weighted roll and carries no other
 * meaning.
 */
export const PaintHistoryStateSchema = z.enum([
  'original',
  'resprayed',
  'mismatchedPanel',
  'primedPanel',
])
export type PaintHistoryState = z.infer<typeof PaintHistoryStateSchema>
export const PAINT_HISTORY_STATES = PaintHistoryStateSchema.options

/** One non-negative draw weight per paint-history state, keyed explicitly so
 * a missing state fails validation rather than silently reading as zero. */
const PaintHistoryStateWeightsSchema = z.object({
  original: z.number().nonnegative(),
  resprayed: z.number().nonnegative(),
  mismatchedPanel: z.number().nonnegative(),
  primedPanel: z.number().nonnegative(),
})

/**
 * How likely a kind of car is to have kept its factory paint
 * (docs/design/systems/paint-system-design.md). A separate question from
 * `CareProfile` (how hard a car was used): the two correlate but are not the
 * same fact, so a culture can sit in a different place on each ladder.
 */
export const PaintHistoryProfileSchema = z.enum(['cherished', 'scene', 'worked', 'mixed'])
export type PaintHistoryProfile = z.infer<typeof PaintHistoryProfileSchema>
export const PAINT_HISTORY_PROFILES = PaintHistoryProfileSchema.options

/** One state distribution per paint-history profile, keyed explicitly so a
 * missing profile fails validation rather than leaving a culture with no
 * table. */
const PaintHistoryWeightsSchema = z.object({
  cherished: PaintHistoryStateWeightsSchema,
  scene: PaintHistoryStateWeightsSchema,
  worked: PaintHistoryStateWeightsSchema,
  mixed: PaintHistoryStateWeightsSchema,
})

/** Which paint-history profile each culture starts from, keyed explicitly so
 * a culture added to `CarCultureSchema` without a profile fails validation
 * rather than silently generating undefined weights. */
const PaintHistoryByCultureSchema = z.object({
  kei: PaintHistoryProfileSchema,
  drift: PaintHistoryProfileSchema,
  wangan: PaintHistoryProfileSchema,
  kyusha: PaintHistoryProfileSchema,
  rotary: PaintHistoryProfileSchema,
  touge: PaintHistoryProfileSchema,
  exotic: PaintHistoryProfileSchema,
  kurokan: PaintHistoryProfileSchema,
  'honest-transport': PaintHistoryProfileSchema,
  'rally-bred': PaintHistoryProfileSchema,
  'touring-car': PaintHistoryProfileSchema,
  'front-drive-tuner': PaintHistoryProfileSchema,
  oddball: PaintHistoryProfileSchema,
})

/** One non-negative multiplier per damage grade, keyed explicitly like every
 * other grade table here. */
const DamageGradeMultipliersSchema = z.object({
  tidy: z.number().nonnegative(),
  used: z.number().nonnegative(),
  rough: z.number().nonnegative(),
  project: z.number().nonnegative(),
})

/** Which upkeep tier each history reads as - the derivation that replaced the
 * retired independent upkeep roll. */
const UpkeepTierByGradeSchema = z.object({
  tidy: UpkeepTierSchema,
  used: UpkeepTierSchema,
  rough: UpkeepTierSchema,
  project: UpkeepTierSchema,
})

/** How many band steps of damage each grade buys. Zero is legitimate at the
 * tidy end (a car that arrives exactly as the wear model left it). */
const DamageGradeStepsSchema = z.object({
  tidy: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  rough: z.number().int().nonnegative(),
  project: z.number().int().nonnegative(),
})

/** One non-negative draw weight per damage pattern, keyed explicitly so a
 * pattern added to `DamagePatternIdSchema` without a weight fails validation
 * rather than becoming silently unreachable. */
const DamagePatternWeightsSchema = z.object({
  garaged: z.number().nonnegative(),
  'neglected-commuter': z.number().nonnegative(),
  'frontal-collision': z.number().nonnegative(),
  drifted: z.number().nonnegative(),
  grenade: z.number().nonnegative(),
})

/** Which patterns each history can have left behind, one weighted row per
 * grade. See `damageGrades.patternWeightsByGrade` for what the rows mean. */
const PatternWeightsByGradeSchema = z.object({
  tidy: DamagePatternWeightsSchema,
  used: DamagePatternWeightsSchema,
  rough: DamagePatternWeightsSchema,
  project: DamagePatternWeightsSchema,
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

/** One non-negative draw weight per `CarTier`, keyed explicitly so a missing
 * band fails validation rather than silently reading as zero. Zero is a real,
 * meaningful value here: a band weighted 0 in a room never appears there. */
const ByCarTierWeightSchema = z.object({
  entry: z.number().nonnegative(),
  everyday: z.number().nonnegative(),
  enthusiast: z.number().nonnegative(),
  flagship: z.number().nonnegative(),
})

/** One car-tier weight row per auction tier - the catalogue mix of every
 * auction room in one table (`auction.carTierWeightsByAuctionTier`). Weights
 * are relative within a row and need not sum to any particular total. */
const CarTierWeightsByAuctionTierSchema = z.object({
  'local-yard': ByCarTierWeightSchema,
  regional: ByCarTierWeightSchema,
  premium: ByCarTierWeightSchema,
  'collector-network': ByCarTierWeightSchema,
})

/**
 * One auction room's opening hours (`auction.cadenceByTier`): which days of
 * the week it lets people in, and how many weeks pass between sittings.
 * `openDaysOfWeek` holds 1-indexed positions within the week
 * (`calendar.ts`'s `dayOfWeek`, so 1 is the first day and `daysPerWeek` the
 * last); `weeksBetween` is 1 for a room that sits every week and 2 for one
 * that sits every second week. Week 1 is an open week for every room, so a
 * `weeksBetween` of 2 sits in weeks 1, 3, 5 and so on
 * (`calendar.ts`'s `isAuctionTierOpen`, the one implementation).
 *
 * Cadence belongs to the VENUE, which is why it lives here rather than as
 * one global auction day on the calendar: a single day made the late game
 * wait, when a player who has earned access to four rooms should get MORE to
 * do rather than less. Two rooms open on the same day is deliberate and
 * desirable, never a collision to resolve, and attending a room does not
 * cost the day - a player may sit at every room open today.
 */
const AuctionTierCadenceSchema = z
  .object({
    openDaysOfWeek: z.array(z.number().int().positive()).min(1),
    weeksBetween: z.number().int().positive(),
  })
  .strict()

/** One cadence per auction tier, keyed explicitly so a missing room fails
 * validation rather than silently never opening. */
const CadenceByAuctionTierSchema = z.object({
  'local-yard': AuctionTierCadenceSchema,
  regional: AuctionTierCadenceSchema,
  premium: AuctionTierCadenceSchema,
  'collector-network': AuctionTierCadenceSchema,
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
 * source of truth. `turnout` grew a third band (`steady`, between `thin`
 * and `packed`) for the real board's three turnouts, where the demo only
 * ever needed two.
 *
 * The room's opening bid is NOT authored here. It is the seller's floor,
 * `AUCTION_RESERVE_PRICE_FRACTION`, over the same guide value the room
 * reads, so the reserve printed on the auction card and the number the room
 * opens at are one figure by construction (sprint150.md, which retired the
 * room-local copy of the fraction: it held a second, disagreeing 0.55).
 * `auctionRoom.ts`'s `roomConfigFrom` folds it in for the machine.
 */
export const AuctionRoomConfigSchema = z.object({
  /** Per-bid fuse, in milliseconds. */
  clockMs: z.number().int().positive(),
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

/** One non-negative multiplier per `CarRarity` - the offer-chance
 * desirability weight per car rarity (`selling.offerChanceByRarity`). */
const ByCarRarityMultiplierSchema = z.object({
  common: z.number().nonnegative(),
  uncommon: z.number().nonnegative(),
  rare: z.number().nonnegative(),
  legend: z.number().nonnegative(),
})

/**
 * The six listing channels a for-sale car can be listed on - the id a
 * `ForSaleEntry` (sale.ts) carries and `sellingChannels` below is keyed by.
 */
export const SellingChannelIdSchema = z.enum([
  'shopFront',
  'freeAdsPaper',
  'tunerMagazine',
  'tradeNetwork',
  'weekendMeet',
  'collectorNetwork',
])

export type SellingChannelId = z.infer<typeof SellingChannelIdSchema>

/**
 * A channel's own buyer base: one non-negative draw multiplier per buyer
 * archetype, deciding WHO walks in rather than what they pay. Multiplied into
 * the weighted persona pick (`pickWeightedCandidate`, sim/selling.ts)
 * alongside each buyer's own valuation and their `tierPreferences` weight, so
 * it composes with the valuation size bias rather than replacing it. All six
 * archetypes are stated on every channel that has a pool at all: a silently
 * absent archetype and a deliberate 0 are different authoring intentions and
 * this schema will not let them look alike.
 */
const BuyerPoolWeightsSchema = z.object({
  collector: z.number().nonnegative(),
  tuner: z.number().nonnegative(),
  'show-crowd': z.number().nonnegative(),
  racer: z.number().nonnegative(),
  'daily-drivers': z.number().nonnegative(),
  touge: z.number().nonnegative(),
})

/**
 * One listing channel's shape - where you list decides who shows up, at what
 * cost, at what speed, and how much of the +/-12% taste band the arriving
 * pool can express. Every field but `feeYen` is optional; each channel uses
 * exactly one of three cadence shapes (enforced below): `offerChanceFactor`
 * multiplies `selling.offerChanceBase` uniformly across every rarity;
 * `offerChanceFactorByRarity` does the same per `CarRarity`, for a channel
 * whose pool splits sharply by how scarce the car is; `oneDrawNextEndDay`
 * replaces both with one guaranteed strong draw resolved on the next End Day
 * only.
 * `tasteCeiling` caps the top of the taste roll a buyer through this channel
 * can express (`.min(1)` allows a ceiling of exactly 1.00, never above
 * value); `priceBand` replaces the taste roll with a fixed fraction-of-value
 * range instead; `matchedOnly` restricts the pool to buyers whose visible
 * want the listed car satisfies - a mismatch draws no offers at all.
 * `buyerPoolWeights` is the channel's own buyer base (above), and
 * `poolWidening` is the weight an archetype with NO stated interest in the
 * car's tier still draws at: absent means the tier gate stays hard, a value
 * in (0, 1] admits the rest of the market at that fraction of a full tier
 * preference, which is how a channel reaches people who would never come to
 * the forecourt. Both are persona properties, so a `priceBand` channel (no
 * persona at all) may carry neither.
 * `requiresForecourt` (sprint148.md): true when a buyer comes to look at the
 * car in person, so listing on this channel moves it onto a forecourt slot;
 * false when the car is collected or shipped instead (the trade network is
 * the one `false` today). Required, not optional - every channel must state
 * which it is.
 */
const SellingChannelSchema = z
  .object({
    feeYen: z.number().int().nonnegative(),
    offerChanceFactor: z.number().positive().optional(),
    offerChanceFactorByRarity: ByCarRarityMultiplierSchema.optional(),
    oneDrawNextEndDay: z.boolean().optional(),
    tasteCeiling: z.number().min(1).optional(),
    priceBand: z
      .object({ min: z.number().positive(), max: z.number().positive() })
      .refine((b) => b.min < b.max, {
        message: 'sellingChannels priceBand min must be strictly less than max',
      })
      .optional(),
    matchedOnly: z.boolean().optional(),
    buyerPoolWeights: BuyerPoolWeightsSchema.optional(),
    poolWidening: z.number().positive().max(1).optional(),
    requiresForecourt: z.boolean(),
  })
  .strict()
  .refine(
    (c) => {
      const shapes = [
        c.offerChanceFactor !== undefined,
        c.offerChanceFactorByRarity !== undefined,
        c.oneDrawNextEndDay === true,
      ]
      return shapes.filter(Boolean).length === 1
    },
    {
      message:
        'sellingChannels: each channel needs exactly one cadence shape (offerChanceFactor, offerChanceFactorByRarity, or oneDrawNextEndDay)',
    },
  )
  .refine(
    (c) =>
      c.priceBand
        ? c.buyerPoolWeights === undefined && c.poolWidening === undefined
        : c.buyerPoolWeights !== undefined,
    {
      message:
        'sellingChannels: a persona channel must state its own buyerPoolWeights, and a priceBand channel (no persona at all) must state neither buyerPoolWeights nor poolWidening',
    },
  )

/**
 * The six listing channels (directive 22 lever list). `matchedSaleRepBonus`
 * (a further locked lever) lives beside `cleanSaleBonus`/`concoursSaleBonus`
 * in `EconomyConfigSchema`'s own `reputation` block below, not here - it is
 * a sale-quality bonus family member, not a channel property.
 */
const SellingChannelsSchema = z.object({
  shopFront: SellingChannelSchema,
  freeAdsPaper: SellingChannelSchema,
  tunerMagazine: SellingChannelSchema,
  tradeNetwork: SellingChannelSchema,
  weekendMeet: SellingChannelSchema,
  collectorNetwork: SellingChannelSchema,
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
 * One physical dial's condition curve: the fraction of that dial a car still
 * delivers at each band. Mint is 1.0 by construction, so a car in good order
 * runs on its measured figures exactly.
 */
const PhysicalConditionCurveSchema = z.object({
  mint: z.number().positive(),
  fine: z.number().positive(),
  worn: z.number().positive(),
  poor: z.number().positive(),
  scrap: z.number().positive(),
})

/** A fraction of a fitted part's own advantage over stock. Above 1 a worn
 * part would beat the same part at mint; below 0 its advantage would change
 * sign and an upgrade would read as a penalty. */
const RetainedAdvantageFraction = z.number().min(0).max(1)

/**
 * One part grade's band curve: how much of an installed SKU's own advantage
 * over stock survives at each condition band.
 */
const GradeBandCurveSchema = z.object({
  mint: RetainedAdvantageFraction,
  fine: RetainedAdvantageFraction,
  worn: RetainedAdvantageFraction,
  poor: RetainedAdvantageFraction,
  scrap: RetainedAdvantageFraction,
})

/**
 * One operation: a named craft a shop quotes, applied to one slot's part and
 * recorded on that part for good. Machining's original four engine-only
 * entries and the six scene-gated crafts (`docs/design/systems/scene-
 * standing-refactor.md` section 6) are one catalogue and one shape - the
 * generalisation is exactly the five fields below, added alongside the four
 * machining already had.
 *
 * `powerFraction` is the SAME shape a fitted SKU carries, per engine
 * character, so an operation enters the power model through the path a part
 * already uses rather than a second one. It is the figure for a `stock`-grade
 * part; `machining.gradeMultiplier` scales it for a better part.
 *
 * `spec` is what the operation adds to its slot's support contribution, on
 * the same scale as `statFormulas.support.specByGrade`. It is added to what
 * the fitted grade already contributes rather than replacing it, which is the
 * only thing that lets an operation on a stock part support anything at all
 * (a machined original part is still `stock`, whose `specByGrade` is 0) and
 * the only reason the two power-free operations exist.
 *
 * `authenticityCost` is the operation's cost in authenticity points on the
 * desirability model's own 1-to-10 scale: 1 to 2 a purist shrugs, 4 to 6 a
 * raised eyebrow, 7 to 9 a collector weeps. Charged on STOCK-grade parts only
 * (`machiningCost`, sim/derivedStats.ts) - an aftermarket part already spent
 * its slot's whole authenticity weight when it was fitted, so charging
 * machining on top would book one loss twice.
 *
 * `labourPoints` is the whole price of the work. Every operation costs no
 * money at all: the tooling (and, for a scene operation, the standing) was
 * the purchase, and time is what a shop spends after that.
 *
 * `scene` is which buyer archetype's Shop-stage standing ALSO gates this
 * operation, on top of the tool tier every operation already needs
 * (`craftOperationCapabilityGateReason`, sim/machiningJobs.ts) - absent for
 * the four original engine operations, which gate on tool tier alone.
 *
 * `handlingFraction` is handling's counterpart to `powerFraction`: the
 * fraction of the car's own mint handling this operation adds on top of
 * whatever the fitted part's own grade and band already give. Handling has
 * no per-part accumulation of its own the way power does, so this is summed
 * separately in `computeDerivedStats` rather than folded into a catalogue
 * value.
 *
 * `style` is style's counterpart: raw points on the same scale as
 * `StatModifierSchema.style`, added to a fitted part's own style points
 * before the combined total is band-scaled exactly as the catalogue figure
 * already is. Never grade-scaled, matching `stylePercentOf`'s own rule that
 * style never reads grade.
 *
 * `reliabilityConditionBonus` is reliability's counterpart, but it lands on
 * the CONDITION term rather than the coherence one `spec` already reaches -
 * this is what lets a merely-worn part read closer to what a mint one would
 * give, which is a different claim from a well-supported BUILD reading
 * better than an unsupported one. Never band- or grade-scaled: a properly
 * sorted subsystem does not un-sort itself as it wears.
 *
 * `coherenceSupported` says whether this operation's own power and handling
 * fractions are scaled by the car's own coherence factor
 * (`coherenceFactorFor`, sim/derivedStats.ts) before they apply - a build
 * that fights itself gets less out of the operation than one that does not.
 * Defaults false: every other operation's fraction applies in full
 * regardless of how well the rest of the car hangs together.
 */
const MachiningOperationSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  displayName: z.string().min(1),
  /** What the operation does to the car, in a sentence the workshop page
   * shows beside its figures. */
  description: z.string().min(1),
  carPartId: CarPartIdSchema,
  powerFraction: PowerFractionSchema,
  spec: z.number().nonnegative().default(0),
  authenticityCost: z.number().nonnegative(),
  labourPoints: z.number().int().positive(),
  scene: BuyerArchetypeSchema.optional(),
  handlingFraction: z.number().default(0),
  style: z.number().default(0),
  reliabilityConditionBonus: z.number().min(0).default(0),
  coherenceSupported: z.boolean().default(false),
})

export type MachiningOperation = z.infer<typeof MachiningOperationSchema>

/**
 * One scene-standing stage's band (`valuation.sceneStanding` below): the
 * floor `channelTasteMultiplier` (sim/valuation.ts) reads for that scene's
 * buyers instead of the standard `1 - tasteSpread`, and an optional ceiling
 * that competes with a selling channel's own `tasteCeiling` by taking the
 * higher of the two - never stacking. A stage that names no ceiling (the
 * shipped `known` stage) moves the floor only.
 */
const SceneStandingBandSchema = z
  .object({
    floor: z.number().min(0).max(1),
    ceiling: z.number().min(1).optional(),
  })
  .strict()

/**
 * Designer-tunable economy/auction numbers live here (content law), threaded
 * through `SimContext` like every other content file.
 */
export const EconomyConfigSchema = z.object({
  /**
   * Day-1 starting cash. Derived, not asserted: pooling the two cheapest
   * roster tiers across many generated lots, the median guide value is
   * ~Y133,795 and the median full-restore bill ~Y80,800; buying at the 0.6
   * reserve (~Y80,277) plus that restoration (~Y161,077 total) plus four
   * weeks' rent (Y80,000) plus an early parts float (~Y30,000) gives a
   * derived floor of ~Y271,000 - one full cheapest-tier flip cycle. This
   * value sits a real margin above that floor, not bare survival.
   */
  STARTING_CASH_YEN: z.number().int().positive(),
  /**
   * The week's shape (sprint149.md): `calendar.ts` is the ONLY place
   * `state.day` is ever turned into a day-of-week or a month - every other
   * module calls its derivations rather than keeping a private day-of-week
   * check of its own. `daysPerWeek`/`daysPerMonth` are the week/month
   * LENGTH; the three `*DayOfWeek` fields are 1-indexed positions within
   * that week (1 = the first day, `daysPerWeek` = the last), naming which
   * day each landmark falls on: the weekend meet's one guaranteed draw,
   * staff payday and the rent bill. `daysPerMonth` is
   * chosen as four clean weeks, so a month boundary is always also a week
   * boundary - no second cadence to reconcile. A game month is
   * `floor((day - 1) / daysPerMonth) + 1`, never a Gregorian one (no leap
   * years, no real 1995 calendar - the game counts days from day one).
   *
   * The auction house is NOT a landmark here. Each room keeps its own hours
   * (`auction.cadenceByTier`, sprint150.md), so there is no one auction day
   * to name.
   */
  calendar: z
    .object({
      daysPerWeek: z.number().int().positive(),
      daysPerMonth: z.number().int().positive(),
      meetDayOfWeek: z.number().int().positive(),
      paydayOfWeek: z.number().int().positive(),
      rentDayOfWeek: z.number().int().positive(),
    })
    .strict()
    .refine(
      (c) =>
        [c.meetDayOfWeek, c.paydayOfWeek, c.rentDayOfWeek].every(
          (d) => d >= 1 && d <= c.daysPerWeek,
        ),
      { message: 'calendar: every *DayOfWeek lever must fall within [1, daysPerWeek]' },
    ),
  /**
   * Weekly rent, deducted on its own named day (`calendar.rentDayOfWeek`,
   * separate from staff wages on `calendar.paydayOfWeek` since sprint149.md)
   * (`finances.ts`'s `computeWeeklyRentYen`/`applyWeeklyRentAndWages`) -
   * `baseWeeklyYen` plus every owned bay's own per-kind rate, summed:
   * `weeklyRentYen = baseWeeklyYen + sum over kinds of (bayCount[kind] *
   * perBayWeeklyYen[kind])`. Replaces the old flat constant this block used
   * to be (sprint148.md): a one-off bay purchase used to be free to hold
   * forever, so capacity was a pure ratchet with never a reason to sell
   * quickly rather than hold. Every bay now bills weekly, so unused capacity
   * bleeds and a held car costs the slot it occupies. Sized so day 1 is
   * unchanged at exactly 20,000 (6000 + 5000x1 + 2000x3 + 1500x2), matching
   * the retired constant's own median-margin derivation.
   */
  rent: z.object({
    baseWeeklyYen: z.number().int().nonnegative(),
    /** Explicit per-kind keys (not `z.record`), so a missing kind fails
     * validation rather than silently billing nothing for it - same
     * preference `ByCarTierWeightSchema` above uses. */
    perBayWeeklyYen: z.object({
      service: z.number().int().nonnegative(),
      parking: z.number().int().nonnegative(),
      forecourt: z.number().int().nonnegative(),
    }),
  }),
  /**
   * The daily cost of leaving a car in the one grace/"double parking"
   * overflow slot (`facilities.ts`'s `resolveGraceParking`) - charged every
   * End Day the slot is still occupied, same unconditional-deduction shape as
   * weekly rent (no floor check; going negative is already an accepted
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
   * How an auction room's catalogue is drawn (`auctions.ts`'s
   * `generateAuctionCatalog`). Every car is eligible at every room; which room
   * a car turns up in is a probability, not a rule. The draw runs in two
   * stages, so each of the two tables below owns exactly one question and
   * neither can disturb the other's answer.
   */
  auction: z.object({
    /**
     * Stage one: which price band the lot is. Each room's own appetite per
     * band, and what separates a local yard from a collector network. Read as
     * literal shares of the room's catalogue - a row of 70/28/2/0 puts 70 lots
     * in 100 in `entry` - since the band is rolled from this row directly,
     * before any car is chosen. How many models sit in a band therefore has no
     * bearing on the band's share, and adding a car to the roster cannot move
     * these numbers' meaning. A zero means that band never appears in that
     * room.
     */
    carTierWeightsByAuctionTier: CarTierWeightsByAuctionTierSchema,
    /**
     * Stage two: which car, given the band. Scarcity decides how often a car
     * appears among its own price peers rather than which room it appears in,
     * so a rare car is rare everywhere it can turn up at all. The one
     * placement rule scarcity still owns is GDD 9.2's, enforced by
     * `canAppearAtAuctionTier` rather than here: a `legend` reaches no room
     * but the Collector Network.
     */
    rarityDrawMultiplier: ByCarRarityMultiplierSchema,
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
    /**
     * When each room opens its doors, replacing the retired single global
     * auction day the calendar block used to name (sprint150.md). Every entry's
     * `openDaysOfWeek` must fall within `[1, calendar.daysPerWeek]`;
     * `schemas.test.ts` asserts that bound, since the two blocks are
     * validated independently. Rooms deliberately overlap: `premium` and
     * `collector-network` share day 6 on alternate weeks, and that is the
     * point, not a defect.
     */
    cadenceByTier: CadenceByAuctionTierSchema,
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
      /**
       * Stage C (sale-value-system.md section 3, design v4): how hard the
       * market discounts a car for an unsupported build's own failure risk -
       * `coherenceDiscount = coherenceDiscountWeight * (1 - coherenceFactor) *
       * tolerance`, applied to the Stage B condition value before the
       * aftermarket premium is added. Zero on a fully coherent (or stock)
       * build, since `coherenceFactor` is 1 there.
       */
      coherenceDiscountWeight: z.number().min(0).max(1),
      /**
       * Stage D (sale-value-system.md section 3): the floor and ceiling of
       * the retention curve installed-parts value scales along with
       * `coherenceFactor` - `retention = retentionFloor + (retentionCeiling -
       * retentionFloor) * coherenceFactor`. Replaces the old flat retention
       * constant: an incoherent build's parts are worth a fraction of their
       * catalog price, a coherent one's are worth MORE than it -
       * `retentionCeiling` is deliberately allowed above 1.
       */
      retentionFloor: z.number().min(0),
      retentionCeiling: z.number().min(0),
      /**
       * Stage C's per-buyer tolerance for the coherence discount (the
       * tolerance ruling, sprint144.md): how much a given buyer archetype
       * minds an unsupported build's failure risk, `[0, 1]` where 0 ignores
       * it entirely and 1 feels the full discount. `default` is what every
       * buyer-agnostic caller uses (`marketValueYen`'s own optional
       * `coherenceTolerance` parameter defaults to it) - the market's own
       * view, not an accident. Only `valuateCarForBuyer` and
       * `valuateCarForBuyerViaChannel` read a named archetype's override; an
       * archetype with no entry here falls back to `default` deliberately
       * (collector, racer, daily-drivers) - `coherenceToleranceFor`
       * (sim/valuation.ts) is the one place that reads these keys, and
       * `coherenceValuation.test.ts`'s authored-value guard asserts every
       * archetype resolves to a value named here rather than falling through
       * by accident.
       */
      tolerance: z
        .object({
          default: z.number().min(0).max(1),
          'show-crowd': z.number().min(0).max(1).optional(),
          tuner: z.number().min(0).max(1).optional(),
          touge: z.number().min(0).max(1).optional(),
        })
        .strict(),
      /** Buyer-taste spread: `valuateCarForBuyer` bounds its taste multiplier
       * to `[1 - tasteSpread, 1 + tasteSpread]` around `marketValueYen` - how
       * well a buyer archetype's stat weights fit this car, never whether the
       * car is worth anything (that's `marketValueYen` alone). */
      tasteSpread: z.number().min(0).max(1),
      /**
       * Per-scene standing bands (docs/sprints/scene-standing-arc.md): what
       * each stage moves for that scene's own buyers only, read by
       * `channelTasteMultiplier` (sim/valuation.ts) and nothing else in the
       * pricing path. `known` names a floor only; `respected` and `shop`
       * each raise both the floor and the ceiling, the ceiling always
       * competing with a channel's own rather than adding to it. The floor
       * never reaches 1.0 (a specialised car is still someone else's wrong
       * car); the ceiling only ever climbs, stage over stage.
       */
      sceneStanding: z
        .object({
          known: SceneStandingBandSchema,
          respected: SceneStandingBandSchema,
          shop: SceneStandingBandSchema,
        })
        .strict(),
      /**
       * The score `tasteMatchFor` must clear for a sale to count as MATCHED
       * (`isTasteMatched`, sim/valuation.ts) - tested on the underlying
       * [0, 1] taste score, never on the priced multiplier, so a raised
       * standing floor can never make the test easier to pass. Exactly the
       * score that prices at 1.0 under the standard, no-standing band
       * regardless of `tasteSpread`'s own value (`1 - tasteSpread +
       * 2 x tasteSpread x score = 1` at `score = 0.5`), so MATCHED means the
       * same thing at every standing stage. Governs the `matchedOnly`
       * channel gate and `reputation.matchedSaleRepBonus` alike.
       */
      matchedTasteScoreThreshold: z.number().min(0).max(1),
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
       * be below 1 deliberately - restoring an entry-tier kei to mint is
       * passion spend, not an investment. At mint both bills are zero, so a fully
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
    .strict()
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
    )
    .refine((v) => v.retentionFloor <= v.retentionCeiling, {
      message: 'valuation.retentionFloor must be <= valuation.retentionCeiling',
    }),
  /**
   * Earning scene standing (docs/sprints/scene-standing-arc.md step 4):
   * `creditSceneDelivery` (sim/sceneStanding.ts) is the one place a delivery
   * (a matched market sale, or a delivered story mission crediting its
   * persona's own scene) turns into a stage change - nowhere else moves
   * `GameState.sceneStanding` or appends to `GameState.sceneLedger`. Deeds
   * are a plain cumulative count per scene, never reset: standing never
   * decays, so neither does the tally that earned it.
   */
  sceneStandingProgress: z
    .object({
      /** Total matched deliveries to a scene, ever, that reach Known. */
      knownDeliveries: z.number().int().positive(),
      /** Total matched deliveries, ever, that reach Respected - strictly
       * above `knownDeliveries`, enforced below. */
      respectedDeliveries: z.number().int().positive(),
      /**
       * The marquee price bar The Shop needs, one per fitment class (a
       * car's fitment class IS its roster tier, `fitmentClassForTier`) -
       * a marquee Daily Drivers car and a marquee Collector car are not the
       * same money. A matched delivery at or above this bar reaches The
       * Shop only once that scene has ALSO cleared `respectedDeliveries`:
       * a single expensive sale can never vault a scene from nothing to
       * the top, because `respectedDeliveries` cannot be cleared by one
       * delivery either.
       */
      marqueeBarYenByTier: z.record(PartFitmentClassSchema, z.number().int().positive()),
      /**
       * How many days of matched-delivery history the word-of-mouth draw
       * reads on top of a channel's own authored weights
       * (`recentSceneLedgerEntries`, sim/sceneStanding.ts) - the anti-lock-in
       * term `rollingWindowShareCap` below scales.
       */
      rollingWindowDays: z.number().int().positive(),
      /**
       * Word of mouth (the Known payload, docs/sprints/scene-standing-arc.md
       * step 5): the flat multiplier a scene's own `buyerPoolWeights` draw
       * across every channel out - MULTIPLICATIVE on the channel's own
       * authored weight, never additive, so a channel that barely carries a
       * scene (a Collector at the free ads paper, 0.4) still barely carries
       * it, only more than before. Below Known the multiplier is a flat 1 -
       * there is no entry for `none`, and `wordOfMouthMultiplierFor`
       * (sim/sceneStanding.ts) never looks one up at that stage.
       */
      wordOfMouthMultiplierByStage: z.object({
        known: z.number().positive(),
        respected: z.number().positive(),
        shop: z.number().positive(),
      }),
      /**
       * The rolling window's own ceiling: a scene worked exclusively across
       * `rollingWindowDays` reaches this multiplier on top of
       * `wordOfMouthMultiplierByStage`; a scene untouched in the window
       * reads a flat 1 (never a penalty). What makes pivoting scenes take
       * effect in days rather than a second climb.
       */
      rollingWindowShareCap: z.number().positive(),
    })
    .strict()
    .refine((p) => p.knownDeliveries < p.respectedDeliveries, {
      message: 'sceneStandingProgress.knownDeliveries must be strictly below respectedDeliveries',
    })
    .refine(
      (p) =>
        PartFitmentClassSchema.options.every((tier) => p.marqueeBarYenByTier[tier] !== undefined),
      { message: 'sceneStandingProgress.marqueeBarYenByTier must name every fitment class' },
    )
    .refine((p) => p.rollingWindowShareCap >= 1, {
      message:
        'sceneStandingProgress.rollingWindowShareCap must be >= 1 - the rolling window can only ever raise the draw, never lower it below the stage multiplier',
    }),
  /**
   * Scene commissions (the Respected payload, docs/sprints/
   * scene-standing-arc.md step 6): a Respected-or-better scene's own
   * generated brief, read entirely by `sceneCommissions.ts` (sim) -
   * generation, refresh cadence and payout all live off these two values,
   * nowhere else.
   */
  sceneCommissions: z
    .object({
      /** How many days an unaccepted (`offered`) commission sits before it
       * is replaced by a freshly generated one - "refreshing weekly if
       * unaccepted". Read as a rolling age check against `postedOnDay`, not
       * a calendar weekday, so a scene reaching Respected mid-week still
       * gets its first refresh exactly one cadence later. */
      refreshIntervalDays: z.number().int().positive(),
      /** What a completed commission pays against the SAME open-market
       * valuation an ordinary sale uses (`valuateCarForBuyer`) for the
       * ACTUAL delivered car - never a flat authored figure, so a
       * commission can never under- or over-quote a car nobody has chosen
       * yet. */
      payoutMultiplier: z.number().positive(),
    })
    .strict(),
  /**
   * Repair cost per grade is ONE global fraction of the INSTALLED part's own
   * catalog `priceYen`, never the host car's tier -
   * `round(repairStepFraction * catalogPart.priceYen)`. Every repair-cost
   * function in the ONE cost pipeline (`costToMintYen`, `planPartRepair`, and
   * via those, `carCostToMintYen`/`groupCostToMintYen`/`planGroupRepair`/
   * `serviceJobCostBreakdown`) reads this. Structurally closes the donor-car
   * repair arbitrage a tier-scaled model would allow (laundering an
   * expensive car's worn parts through a kept entry-tier car at a fraction of
   * the price): a part's repair price is intrinsic to the part, identical on-car
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
   * `derivedStats.ts`'s stat-formula magic numbers, kept here as data so they
   * can be retuned without a code edit. `powerNormalizationCeiling` isn't a
   * `computeDerivedStats` input - it feeds `valuateCarForBuyer`'s taste
   * normalisation instead - but lives in this block since it's part of the
   * same "stat formula magic numbers" family. The `grip` block is handling's
   * whole model: `performance.ts` reads it for `computeGrip`, `balanceOf`,
   * and the display curve, and `derivedStats.ts` derives handling from those.
   */
  statFormulas: z.object({
    /** Power at 0 engine condition, as a fraction of stock power (floor);
     * scales linearly up to 1.0 (full stock power) at 100 condition. */
    powerConditionFloor: z.number().min(0).max(1),
    /**
     * What splits the naturally aspirated field into the two NA engine
     * characters (`engineCharacterOf`, sim/derivedStats.ts). A car with
     * forced induction reads `forced` outright, before this threshold is
     * ever consulted; otherwise its specific output (stock PS per effective
     * litre, rotary displacement scaled 1.8x) is compared against this
     * value - at or above it the engine is `high-strung-na`, below it
     * `lazy-na`. At 80.0: the Honda Beat (97.6 PS/L) reads high-strung and
     * the Toyota Carina (57.2 PS/L) reads lazy, the two required sanity
     * targets.
     */
    engineCharacter: z.object({
      naHighStrungThreshold: z.number().positive(),
    }),
    /**
     * The support-ratio model (`packages/sim/src/support.ts`, design section
     * 6): whether a build's own gains are backed by the specification that
     * holds them together. The old flat reliability ceiling (70, with no
     * per-car meaning) is RETIRED by this block rather than moved - it is
     * replaced by `CarModel.spec.reliabilityBase`, a per-car value, so
     * authoring a flat ceiling here first and overwriting it later would be
     * pure waste.
     *
     * By construction a stock car sits at exactly 1.0 on every subsystem:
     * every gain is 0 and every spec is 0, so `demand = support = 1`
     * everywhere before a single aftermarket part is fitted.
     */
    support: z.object({
      /**
       * The stock car's own factory headroom, PROPORTIONAL to what the
       * build actually demands: `support[s] = 1 + stockSupportMargin *
       * (demand[s] - 1) + supportWeights term`. A flat headroom would cover
       * proportionally far more of a small naturally-aspirated gain than a
       * large forced-induction one; scaling it to the build's own demand
       * overshoot avoids that while a genuinely unsupported build (fresh
       * demand, no fitted specification) still falls exactly as far short
       * as before. Demand is exactly 1 on a stock car, so this term is
       * always 0 there and the stock-car-equals-1.0 identity is untouched
       * regardless of the margin's value.
       */
      stockSupportMargin: z.number().min(0).max(1),
      /**
       * How much a build's own total power gain costs reliability, on top of
       * (never folded into) the condition-plus-coherence budget:
       * `reliability = base * clamp(conditionFactor + coherenceFactor - 1, 0,
       * 1) * (1 - stressCoefficient * totalGainFraction)`. `totalGainFraction`
       * is the same sum `supportRatios` already accumulates as `totalGain`
       * (`packages/sim/src/support.ts`'s `totalGainFractionOf`) - every fitted
       * part's own `powerFraction[engineCharacter]`, summed across the whole
       * car.
       *
       * This is an OUTER multiplier, deliberately structured apart from
       * `coherenceFactor`'s own additive shortfall: folding it into that
       * budget instead was measured and rejected, because it would subtract
       * an identical flat amount from a supported and an unsupported build
       * alike and collapse the unsupported case toward an uninteresting
       * floor. Even a fully and properly supported build moves more energy
       * through every part of the car than stock does, and pays for that
       * here in proportion to how much more power it makes - never in
       * proportion to how well it is supported, which stays
       * `coherenceFactor`'s job alone.
       *
       * `totalGainFraction` is exactly 0 on a stock car (no aftermarket part
       * fitted anywhere), so this term is always 1 there regardless of the
       * coefficient's value - the stock-car-reads-exactly-its-base identity
       * holds by the same construction `stockSupportMargin` above relies on.
       */
      stressCoefficient: z.number().min(0).max(1),
      /**
       * Lever 1: what a fitted grade is worth as SPECIFICATION on a
       * supporting slot - flat per grade, the same on every slot and every
       * car. Never band-scaled: specification does not decay, a worn forged
       * conrod is still stronger than a stock cast one.
       */
      specByGrade: z.object({
        stock: z.literal(0),
        street: z.number().min(0).max(1),
        sport: z.number().min(0).max(1),
        race: z.number().min(0).max(1),
      }),
      /**
       * Lever 2: how strongly each subsystem's demand responds to the
       * gain that drives it - see `demandDrivers` immediately below for
       * WHICH slot(s) that is, per subsystem.
       */
      demandWeights: z.object({
        cylinderPressure: z.number().nonnegative(),
        fuelling: z.number().nonnegative(),
        heat: z.number().nonnegative(),
        revs: z.number().nonnegative(),
        torqueTransmission: z.number().nonnegative(),
      }),
      /**
       * WHICH slot(s) drive each subsystem's demand (content, not code - a
       * future part must not be able to join a subsystem's demand side by
       * editing a list in a source file, matching `supportWeights`'s own
       * content-driven membership on the support side). Two shapes:
       * `{ kind: 'slot', slot }` reads a single named slot's own gain
       * (`cylinderPressure`/`forcedInduction`, `revs`/`camsTiming`);
       * `{ kind: 'total' }` reads the gain summed across every slot on the
       * car (`fuelling`, `heat`, `torqueTransmission` - a bigger build asks
       * more of fuel, cooling and the drivetrain no matter which slot made
       * the power). `packages/sim/src/support.ts` reads this map rather than
       * hard-coding which slot demands which subsystem.
       */
      demandDrivers: z.object({
        cylinderPressure: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('slot'), slot: CarPartIdSchema }),
          z.object({ kind: z.literal('total') }),
        ]),
        fuelling: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('slot'), slot: CarPartIdSchema }),
          z.object({ kind: z.literal('total') }),
        ]),
        heat: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('slot'), slot: CarPartIdSchema }),
          z.object({ kind: z.literal('total') }),
        ]),
        revs: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('slot'), slot: CarPartIdSchema }),
          z.object({ kind: z.literal('total') }),
        ]),
        torqueTransmission: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('slot'), slot: CarPartIdSchema }),
          z.object({ kind: z.literal('total') }),
        ]),
      }),
      /**
       * Lever 3: which slots support each subsystem, and how strongly - the
       * dual-role convention (design section 6c) made data: within one
       * subsystem a slot is a demander or a supporter, never both, but the
       * SAME slot may demand one subsystem while supporting another (a
       * bored block raises fuelling/heat/torque demand and supports cylinder
       * pressure). `fuelSystem` and `clutch` carry zero power gain on every
       * SKU, which is what keeps a pure enabler from partly paying for the
       * gain its own slot demands.
       */
      supportWeights: z.object({
        cylinderPressure: z.object({
          internals: z.number().nonnegative(),
          block: z.number().nonnegative(),
        }),
        fuelling: z.object({ fuelSystem: z.number().nonnegative() }),
        heat: z.object({ cooling: z.number().nonnegative() }),
        revs: z.object({
          headValvetrain: z.number().nonnegative(),
          internals: z.number().nonnegative(),
        }),
        torqueTransmission: z.object({
          clutch: z.number().nonnegative(),
          gearbox: z.number().nonnegative(),
          driveline: z.number().nonnegative(),
          differential: z.number().nonnegative(),
        }),
      }),
      /**
       * Lever 4: the headline support ratio's band thresholds.
       * `adequateAtOrAbove` is load-bearing twice - it is both the readout's
       * silence threshold (design 7b: competence is the baseline, not an
       * achievement) and the knee of the coherence curve below, so
       * `adequate` means exactly the same thing on both surfaces: this
       * costs you nothing.
       */
      thresholds: z
        .object({
          adequateAtOrAbove: z.number().positive(),
          strainedAtOrAbove: z.number().positive(),
        })
        .refine((t) => t.strainedAtOrAbove <= t.adequateAtOrAbove, {
          message: 'statFormulas.support.thresholds.strainedAtOrAbove must be <= adequateAtOrAbove',
        }),
      /**
       * Lever 6 (signed): the coherence curve's exponent -
       * `min(1, headline / thresholds.adequateAtOrAbove) ^ coherenceExponent`.
       * Capped at 1, so a build is never MORE reliable than stock; below the
       * knee the exponent decides how sharply a shortfall bites.
       */
      coherenceExponent: z.number().positive(),
    }),
    /**
     * The chassis-support model (`packages/sim/src/support.ts`'s
     * `usableGripFraction`, design `docs/design/systems/chassis-support-measured.md`):
     * how much of the grip a build GAINED it cannot use, because the parts
     * that control that grip are below the grade of the parts that made it.
     *
     *     required = highest grade among tyres, dampers, springs, antiRollBars, aero
     *     missing  = sum of `share` over the support slots below `required`
     *     usable   = factory + gain * (1 - lossByGrade[required] * missing)
     *
     * `gain` is measured in EFFECTIVE grip (mechanical grip times the
     * downforce multiplier at the display curve's own reference speed), so a
     * wing is charged for the load it puts through the brakes and the steering
     * rather than exempt from the whole model. It is read against the same car
     * at its OWN condition band, so letting a car rot never dodges the loss.
     *
     * A stock car is untouched by construction and regardless of any value
     * here: `required` is `stock`, whose loss is pinned at 0, and `gain` is
     * exactly 0 because a stock build IS its own factory reference. A build
     * whose gain is NEGATIVE (three shipped cars leave the factory on rubber
     * better than a street SKU maps to) passes through untouched for the same
     * reason it must: there is no extra grip to support.
     */
    chassisSupport: z.object({
      /**
       * How much of the gain becomes unusable when nothing supports it, by the
       * grade of the parts that made the grip. `stock` is pinned at 0 rather
       * than authored, so a stock car can never be moved from here.
       *
       * At street 0.10 the median car on the roster loses nothing at all and
       * no car loses more than a point: bolting street dampers to stock brakes
       * reads as a number that went up. At sport 0.20 the loss is always
       * visible and never zero. At race 0.35 an unsupported build gives up
       * around a tenth of its readout and several seconds of a mountain lap,
       * which is worth going back and fixing. The rise up the ladder is what
       * the model says out loud: the harder the parts, the more of their gain
       * a stock chassis cannot put down.
       */
      lossByGrade: z.object({
        stock: z.literal(0),
        street: z.number().min(0).max(1),
        sport: z.number().min(0).max(1),
        race: z.number().min(0).max(1),
      }),
      /**
       * How the shortfall divides across the three purchases that clear it.
       * The values sum to 1, so an entirely unsupported build carries the
       * whole of `lossByGrade` and a fully supported one carries none of it.
       *
       * `brakes` splits evenly across `brakePadsDiscs` and
       * `brakeCalipersLines`, so the first brake part bought returns half of
       * it rather than nothing. `chassis` takes the smallest share because a
       * chassis SKU already carries its own `physicalModifiers.grip` and earns
       * a second time that way; an equal split made it worth twice the
       * steering at the counter. Brakes taking the largest share is also the
       * sentence the whole model exists to say.
       */
      share: z.object({
        brakes: z.number().min(0).max(1),
        steering: z.number().min(0).max(1),
        chassis: z.number().min(0).max(1),
      }),
    }),
    /**
     * Soft power ceiling `valuateCarForBuyer` normalizes taste's power term
     * against (was the file-local `POWER_NORMALIZATION_CEILING` constant in
     * valuation.ts). Every archetype's `statTargets.power.target` is a
     * fraction of THIS, so raising it moves ordinary appetite for every
     * buyer at once - it is deliberately NOT how the top of the market
     * tracks a player's best build; that is `powerExpectationChainStepDiscounts`
     * below, which moves a separate, unread-by-buyers figure instead.
     *
     * 600 sits just above the roster's fastest stock car (560 PS), so a
     * clearing-house ceiling of 300 (satisfied at 225 PS by the most
     * power-hungry archetype, `racer` at 0.75) no longer leaves the whole
     * upper half of the roster - and every built engine - worth nothing to
     * anybody (docs/sprints/scene-standing-arc.md). Raising it here, rather
     * than adding a second normalisation path, keeps every archetype's
     * authored fraction the single source of what "wants a lot of power"
     * means.
     */
    powerNormalizationCeiling: z.number().positive(),
    /**
     * The climbing chain (docs/sprints/scene-standing-arc.md step 0,
     * `GameState.powerExpectationChain`): how far below the player's own
     * best-ever delivered power (in PS, at the moment of sale) the top of
     * the market currently sits, indexed by how many deliveries have
     * cleared the current bar since the last personal best.
     * `currentPowerExpectationBarPs` (sim/valuation.ts) reads step `[0]`
     * immediately after a new best, then `[1]`, then `[2]` (held there for
     * any further delivery at the same best), restarting at `[0]` the
     * instant a delivery beats the best outright.
     *
     * Governs the TOP of the market only - it never moves a buyer's own
     * `statTargets.power`, and nothing in shipped content reads the derived
     * bar yet. Built and proved here for later work (the scene-standing
     * arc's commission sprint) to consume; a 700 PS build and a 300 PS
     * build stay equally worth doing today because ordinary appetite is
     * `powerNormalizationCeiling` above, untouched by this table.
     */
    powerExpectationChainStepDiscounts: z.array(z.number().min(0).max(1)).min(1),
    /**
     * What full marks means on the stat radar's power spoke. **A display
     * scale, and deliberately NOT `powerNormalizationCeiling` above**, which
     * answers a different question: the PS past which a BUYER stops caring.
     * The two are separate because a chart and a buyer want opposite things
     * from a ceiling. A buyer's is soft and low, so most of the roster can
     * satisfy someone; a chart's has to sit above the fastest thing it will
     * ever draw, or every built engine pegs the spoke and the axis stops
     * saying anything at the end where builds get interesting.
     *
     * Sits above the roster's fastest stock car (560 PS) with room for a
     * fully built engine, so a race motor reads differently from a stock
     * supercar. Power is the one radar axis whose raw value is not already
     * 0-100, so without this it is the only spoke that can silently plot on
     * a different scale from its neighbours.
     */
    radarPowerCeilingPs: z.number().positive(),
    /**
     * How many points of fitted `statModifiers.style` take a car all the way
     * from its own `spec.styleBase` to its own `spec.styleCeiling`
     * (`computeDerivedStats`): `reach = min(1, fitted / styleSaturationPoints)`.
     * Style is the one stat where a part closes a gap rather than adding to a
     * total, so this is the exchange rate between the catalogue's points and
     * every car's own headroom.
     *
     * At 66 against the 88 points a maximal fit-the-best-in-every-slot build
     * totals, a focused and coherent build reaches its car's ceiling without
     * needing literally every style part, and the last stretch is spent on an
     * already-finished car. Setting it at the maximum instead would mean only
     * an exhaustive build ever reaches a ceiling, which punishes taste.
     *
     * It is set against the catalogue's whole shape rather than against its
     * loudest few parts, and the two have to move together. The catalogue holds
     * ten style-bearing slots with a best-in-slot ladder from 18 (`aero`) down
     * to 4 (`intake`), so on a top-grade build three parts buy half a car's
     * headroom, five buy four fifths, and the last of it takes seven.
     */
    styleSaturationPoints: z.number().positive(),
    /**
     * Handling's grip model (`performance.ts`). Every constant of the
     * mechanical-grip calculation, the tyre-grade-to-compound map, the
     * two-segment 0-100 display curve, and the balance term lives here so
     * the whole handling stat retunes from content alone.
     */
    grip: z.object({
      /** Era rubber-chemistry ceiling: the first band whose `beforeYear`
       * exceeds the car's `yearFrom` sets the base mu; `eraRubberDefaultMu`
       * applies to anything at or past the last band's year. */
      eraRubberBands: z
        .array(z.object({ beforeYear: z.number().int(), mu: z.number().positive() }))
        .min(1),
      eraRubberDefaultMu: z.number().positive(),
      /** Compound-tier mu adjustment added to the era ceiling. */
      tierDelta: z.object({
        eco: z.number(),
        touring: z.number(),
        performance: z.number(),
        sport: z.number(),
        grand: z.number(),
        slick: z.number(),
      }),
      /** Fitted-tyre grade to effective compound tier. `stock` is `null` -
       * a stock tyre keeps the model's own `spec.tyreCompound`. */
      gradeToCompound: z.object({
        stock: z.null(),
        street: TyreCompoundSchema,
        sport: TyreCompoundSchema,
        race: TyreCompoundSchema,
      }),
      /** Contact-patch width adjustment, secondary to compound: a signed mu
       * nudge from tyre section width, scaled by how much of a wide patch the
       * rubber can exploit (`effMu*`), then clamped (`adj*`). */
      width: z.object({
        referenceMm: z.number(),
        divisor: z.number().positive(),
        adjMin: z.number(),
        adjMax: z.number(),
        effMuFloor: z.number(),
        effMuSpan: z.number().positive(),
        effMin: z.number(),
        effMax: z.number(),
        fallbackMm: z.number().positive(),
      }),
      /** Centre-of-mass / track weight-transfer factor, clamped to
       * `[floor, ceiling]`. */
      transfer: z.object({
        slope: z.number(),
        reference: z.number(),
        floor: z.number(),
        ceiling: z.number(),
      }),
      /** Drivetrain-layout grip bonus. AWD earns `awdActive` with factory
       * active yaw, `awdPassive` without; a mid engine earns `mid`. */
      layout: z.object({
        base: z.number().positive(),
        awdActive: z.number(),
        awdPassive: z.number(),
        mid: z.number(),
      }),
      /** Track width (mm) by class: Kei, wide (section width at or above the
       * threshold), or standard. */
      track: z.object({
        keiMm: z.number().positive(),
        wideMm: z.number().positive(),
        standardMm: z.number().positive(),
        wideWidthThresholdMm: z.number().positive(),
      }),
      /** Centre-of-mass height fallback for a model without a stated one. */
      comHeightFallbackMm: z.number().positive(),
      /** Two-segment display curve mapping EFFECTIVE lateral g to the 0-100
       * readout: a steep stock segment (`stockLow` to `stockHigh`) and a gentle
       * modified segment (`stockHigh` to `modifiedHigh`). The g it reads is
       * mechanical grip plus the downforce the car makes at
       * `displayReferenceSpeedKmh`, so a wing moves the number and the readout
       * answers "how hard does this corner" rather than "how sticky are the
       * tyres". */
      displayCurve: z.object({
        stockLowG: z.number(),
        stockLowDisplay: z.number(),
        stockHighG: z.number(),
        stockHighDisplay: z.number(),
        modifiedHighG: z.number(),
        modifiedHighDisplay: z.number(),
        displayReferenceSpeedKmh: z.number().positive(),
      }),
      /** Balance term: front-weight bias plus drivetrain and engine-position
       * offsets, clamped, then scaled by `weight` where it deducts from
       * handling. */
      balance: z.object({
        frontReference: z.number(),
        frontDivisor: z.number().positive(),
        frontFallback: z.number(),
        fwd: z.number(),
        rwd: z.number(),
        rear: z.number(),
        mid: z.number(),
        clampMin: z.number(),
        clampMax: z.number(),
        weight: z.number().nonnegative(),
      }),
    }),
    /** Aerodynamics (`performance.ts`): downforce rises with the square of speed,
     * so it is worth nothing at a standstill and a great deal on a fast corner,
     * and the same bodywork that makes it costs drag. `downforceK` is the grip
     * gained per (m/s)^2 at a `downforceCoeff` of 1.0, calibrated from the
     * Calsonic BNR32 Gr.A's measured lateral-g pair; `maxGripMultiplier` bounds
     * the term so nothing runs away at top speed. `byGrade` is what a fitted
     * aero-functional SKU provides, by its grade. Signed in
     * docs/sprints/sprint_archive/sprint125.md. */
    aero: z.object({
      downforceK: z.number().positive(),
      maxGripMultiplier: z.number().positive(),
      byGrade: z.object({
        stock: z.object({ downforceCoeff: z.number(), dragCdDelta: z.number() }),
        street: z.object({ downforceCoeff: z.number(), dragCdDelta: z.number() }),
        sport: z.object({ downforceCoeff: z.number(), dragCdDelta: z.number() }),
        race: z.object({ downforceCoeff: z.number(), dragCdDelta: z.number() }),
      }),
    }),
    /** The pace/lap model (`performance.ts` lapTime): every physics constant of
     * the quasi-static point-mass sim, the direction-change term, the geometric
     * corner-grip ceiling, and the fallback regressions that answer for a car
     * carrying no measurement. Calibrated against real driven laps; signed in
     * docs/sprints/sprint_archive/sprint128.md section 6. */
    pace: z.object({
      gravity: z.number().positive(),
      airDensity: z.number().positive(),
      drivelineEfficiency: z.number().positive(),
      rollingResistance: z.number().nonnegative(),
      psWatts: z.number().positive(),
      driverMassKg: z.number().nonnegative(),
      agilityWeight: z.number().nonnegative(),
      cruiseThreshold: z.number().positive(),
      integrationStep: z.number().positive(),
      frontalAreaCoeff: z.number().positive(),
      frontalAreaFallbackM2: z.number().positive(),
      /** The transition/agility term (a point-mass sim omits yaw): a low-grip
       * car loses most time changing direction in tight corners.
       * `agilityWeight` scales it; these normalise corner geometry. */
      agilityReferenceMassKg: z.number().positive(),
      agilityAngleReferenceDeg: z.number().positive(),
      agilityRadiusReferenceM: z.number().positive(),
      agilityTightnessMin: z.number().positive(),
      agilityTightnessMax: z.number().positive(),
      /** Metres covered between a braking measurement tripping and full
       * retardation arriving. A property of the measurement protocol, not of
       * the car, so one global value serves every car. */
      brakeDeadDistanceM: z.number().nonnegative(),
      /** The geometric corner-grip ceiling: through a tight corner a car is
       * bounded by steering lock, wheelbase and width rather than by the
       * contact patch, so usable grip is capped at
       * `geoMu * (radius / geoR) ^ geoT`. It rises with radius, so it bites
       * hardest in a hairpin and releases on an open sweeper, and it caps
       * MECHANICAL grip only: downforce is solved on top of the capped value. */
      geoMu: z.number().positive(),
      geoR: z.number().positive(),
      geoT: z.number().nonnegative(),
      /** Protocol offset on the standing-kilometre course, per cent. It applies
       * to a standing-kilometre run and to nothing else: the lap courses are
       * accurate with the straight-line pessimism in place, because it cancels
       * against a direction-change weight fitted with that pessimism present. */
      dragOffsetPct: z.number(),
      /** Regression coefficients answering for a car that carries no
       * measurement. Each predicts a DIMENSIONLESS RATIO, so the car's own grip
       * and own power carry the scale and only the fraction of each that
       * reaches the road is regressed.
       *
       * `brake` predicts `bmu / mu` on `[1, (year - 1990) / 10, isAWD]`.
       * `accelLaunch` predicts `aLaunch / (mu * g)` and `accelPower` predicts
       * `pEff / crankWheelPower`, both on
       * `[1, isAWD, isFWD, ln(stockPowerPs * 1000 / curbWeightKg)]`.
       *
       * THEY ARE PINNED AND ARE NEVER REFITTED IN-GAME. They were fitted across
       * all 85 cars of the research roster; the shipped roster is 26, and
       * refitting on it would give different coefficients and stop those cars
       * reproducing the reference harness. */
      fallback: z.object({
        brake: z.tuple([z.number(), z.number(), z.number()]),
        accelLaunch: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        accelPower: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      }),
    }),
    /**
     * What CONDITION does to the physical dials. A dial's factor is the
     * weighted mean of its curve here across the parts that reach it
     * (`physicalWeights` in parts-taxonomy.json), and it multiplies that dial
     * directly: `grip` the car's mechanical grip, `braking` its braking
     * coefficient, `driveline` the crank-to-wheel conversion, `aero` its
     * downforce coefficient.
     *
     * Deliberately separate from `bands.bandFactors`. That curve is right for a
     * stat CONTRIBUTION and catastrophic as a multiplier on physics: at its
     * scrap value of 0.15 a car's grip coefficient would land near 0.13 and it
     * would not move. These curves are far gentler, and mint is exactly 1.000
     * on every dial, so a car in good order reproduces its measured figures to
     * the last bit.
     *
     * The bands are condition percentages (mint 90+, fine 70-90, worn 40-70,
     * poor 15-40, scrap under 15), and the curves are scaled to what those
     * actually mean: a `worn` part is half worn out and reads as a car that
     * needs parts, `poor` is past any legal limit, and `scrap` is junk. The
     * driveline is gentlest, since a tired clutch and diff cost drivability
     * rather than steady-state thrust.
     *
     * `braking` degrades faster than `grip` at every band, deliberately. The
     * coefficient this curve scales is a LAP-AVERAGE, not a first-stop figure: a
     * lap of these courses is nine to eleven braking events in a few minutes,
     * and worn pads, tired fluid and heat-cycled discs fade across that. Fade
     * arrives early and easily on exactly the hardware a `worn` or `poor` car is
     * carrying, so the average a lap consumes falls considerably further than a
     * single measured stop would.
     *
     * Two scrap entries are unreachable by construction and are kept only so the
     * curves are complete: `braking`'s, because both its carriers
     * (`brakePadsDiscs`, `brakeCalipersLines`) are `scrapDisablesCar`, and
     * `driveline`'s, because all four of its carriers are. A car that would
     * contribute either is already undrivable. There is nothing to tune in
     * those two numbers. `grip`'s scrap entry IS reached, through dampers,
     * springs, anti-roll bars and rims, none of which gate; `aero`'s is reached
     * throughout.
     *
     * PROVISIONAL. These are first-pass judgements, not measurements: no driven
     * data exists for a worn car, and every one of them is expected to be tuned.
     */
    condition: z.object({
      bandFactor: z.object({
        grip: PhysicalConditionCurveSchema,
        braking: PhysicalConditionCurveSchema,
        driveline: PhysicalConditionCurveSchema,
        aero: PhysicalConditionCurveSchema,
      }),
      /**
       * How much of an installed SKU's own `physicalModifiers` advantage
       * survives its condition band, by the GRADE of the part fitted.
       * `buildFactors` (sim/derivedStats.ts) spends it as `1 + (modifier - 1)
       * * gradeBandFactor[grade][band]`, so a row is a fraction of the
       * ADVANTAGE a part carries over stock, never a multiplier on the dial
       * itself.
       *
       * The rows steepen up the ladder because a race part is highly strung
       * and a stock part is under-stressed: at the same band a race part has
       * given up more of its advantage than a street part has. That is what
       * makes a race damper at `poor` deliver less than a street damper at
       * `mint`, across the ladder rather than only at its extremes.
       *
       * **This is a curve shape, not a wear rate.** Nothing in the game
       * degrades with use: `degradeBand` runs only at generation, before the
       * player ever sees the car, and the only thing that moves a band during
       * play is the player repairing it. A race part is more SENSITIVE at a
       * given band, never more fragile over time, so no value here is
       * denominated in days and nothing may introduce one.
       *
       * The `stock` row is `bands.bandFactors` exactly, so a car built from
       * stock parts delivers precisely what it always did; every row is 1.00
       * at `mint`, so the calibrated harness times are untouched at the top of
       * the band.
       *
       * Deliberately separate from `bandFactor` above. That curve says what
       * CONDITION does to the four physical dials of any car; this one says
       * how much of a FITTED PART's own upgrade survives. Both apply to a worn
       * aftermarket part, and they are two different jobs rather than one
       * charged twice.
       */
      gradeBandFactor: z.object({
        stock: GradeBandCurveSchema,
        street: GradeBandCurveSchema,
        sport: GradeBandCurveSchema,
        race: GradeBandCurveSchema,
      }),
      /**
       * Lever 8 (rebalanced): a CEILING on reliability's condition mean, not
       * a replacement for it. The mean alone lets a single catastrophic
       * fault average away against fourteen good parts (a seized block used
       * to read 92/100); this caps that mean at what the reliability-bearing
       * parts allow, so a grenade caps the car no matter how perfect
       * everything else is.
       *
       * The cap reads each offending part's own RELEVANCE, not just its
       * band: `cap = 1 - (1 - reliabilityCeiling[band]) * min(1,
       * statWeights.reliability / reliabilityCeilingWeightReference)`, taken
       * as the MINIMUM across every reliability-bearing part on the car. A
       * flat lookup on the worst band alone caps a weight-1 propshaft
       * exactly as hard as weight-3 cooling; scaling by relevance keeps a
       * light part's failure from throwing away the same amount of headroom
       * as a heavy one's.
       *
       * "Any" is the right test rather than a crude one, because the parts
       * that carry a `statWeights.reliability` weight in the taxonomy are
       * exactly the parts that stop the car - paint and dashGauges carry
       * zero precisely because they do not. The band is read from the
       * taxonomy's own weighted parts, never a hand-written list, and a
       * MISSING reliability-bearing part counts as `scrap` for this ceiling
       * (matching `weightedBandFactor`'s existing treatment of a missing part
       * as a 0 band factor); a legitimately absent slot (an NA car's empty
       * forced-induction slot) is not missing and never trips it.
       *
       * Only `scrap` and `poor` carry a real ceiling; `worn`, `fine` and
       * `mint` are unconstrained (the mean is already <= 1 there, so a ceiling
       * would do nothing).
       */
      reliabilityCeiling: z.object({
        poor: z.number().min(0).max(1),
        scrap: z.number().min(0).max(1),
      }),
      /** Lever 8's own relevance reference: the taxonomy's highest
       * `statWeights.reliability` (cooling, 3). A part carrying this much
       * weight takes the ceiling's FULL bite; anything lighter softens it
       * proportionally. */
      reliabilityCeilingWeightReference: z.number().positive(),
    }),
  }),
  /**
   * Lever 5: the support-ratio warning's copy (design 7c). Shown only at
   * `strained` and `dangerous` - `adequate` shows nothing at all, because
   * competence is the baseline rather than an achievement. `shortfallCopy`
   * names what the named subsystem can't do; `framingByBand` wraps it,
   * substituting the literal `{shortfall}` token the same way
   * `diagnosis.saleRevealCopy` substitutes `<cause>`. The element itself is
   * qualitative - the band and the named shortfall, no numbers - so nothing
   * here ever carries a figure.
   */
  supportReadout: z.object({
    shortfallCopy: z.object({
      cylinderPressure: z.string().min(1),
      fuelling: z.string().min(1),
      heat: z.string().min(1),
      revs: z.string().min(1),
      torqueTransmission: z.string().min(1),
    }),
    framingByBand: z.object({
      strained: z.string().min(1),
      dangerous: z.string().min(1),
    }),
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
       * offsets this baseline before each of the 28 parts jitters around it
       * in a per-tier range. Higher mileage skews condition worse; low-
       * mileage cars stay mostly good.
       */
      conditionBaselineMinByMileageKm: CurveSchema,
      conditionBaselineMaxByMileageKm: CurveSchema,
      /** Added to the mileage-rolled condition baseline (percent) before
       * per-part jitter - negative for neglected, 0 for average, positive for
       * cherished. Clamped into [0, 100]. SCALED by `wearExposureByMileageKm`
       * below, so upkeep only expresses itself in proportion to how far the
       * car has actually been driven. The upkeep tier itself is no longer
       * rolled: it is read off the car's rolled history through
       * `damageGrades.upkeepTierByGrade`, so how a car was treated and how
       * rough it arrived are one fact rather than two. */
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
       * the same near-mint car; at exposure 1 a neglected history bites
       * exactly as hard as it did before.
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
       * How far a damage pattern moves a slot's rolled condition, in condition
       * percent per unit of its group's RELATIVE pattern weight
       * (`damagePatterns.ts`'s `patternConditionOffsets`). A group the pattern
       * weights at twice an even share sits one swing below the car it is in,
       * one weighted at three times sits two swings below, and the groups the
       * pattern spares come up by whatever those cost: the offsets sum to zero
       * across the car, so this decides WHERE a car's condition sits and never
       * how much of it there is.
       *
       * It exists because nothing else could carry the answer. The damage
       * budget is about a fifth of a car's band steps, and merely rearranging
       * the rolled condition tops out at 1.22x a group's flat share (every part
       * jitters around one baseline, so a car's own spread is narrow). At 0 a
       * pattern reaches only the budget, the shell and the symptom draw, which
       * is the state this lever was added to fix.
       *
       * Sized against the band widths it has to cross: `bands` are 20 to 30
       * percent wide, and the sharpest authored pattern (`grenade`, engine at
       * 62 of 100 against an even 16.7) carries a relative weight of 3.7, so 7
       * moves its engine about 20 percent - one full band, and no more than one.
       */
      patternConditionSwingPercent: z.number().nonnegative(),
      /**
       * A car's HISTORY: what happened to it before it reached the block, and
       * the single cause every other roll about its condition now hangs off
       * (docs/design/systems/generation-damage.md, layers 1 and 2).
       *
       * `careProfileByCulture` picks the profile a car's own scene tends to
       * produce and `CarTier` shifts that choice one step along the
       * `CARE_PROFILES` ladder (flagship toward `cherished`, entry toward
       * `worked`; everyday and enthusiast sit where culture put them). The
       * chosen row of `careProfiles` is the distribution the history is rolled
       * from, which is why there is no roster-wide grade table: nobody wrecks
       * a 2000GT and nobody handles an Acty with white gloves, so one flat
       * table for both was the defect. The roster-wide MIX is an emergent
       * property of the 94 authored cultures rather than an authored number.
       *
       * Still not a per-venue table: `auction.carTierWeightsByAuctionTier`
       * already decides which price bands a room sells, so the roughness
       * gradient across rooms emerges from the mix the rooms already have.
       *
       * Three things read the rolled history, and nothing else rolls them
       * independently:
       *
       * - `bandStepsByGrade` is what it buys in BAND STEPS rather than in yen:
       *   `auctions.ts`'s `spendDamageBudget` degrades one installed part per
       *   step, under the same `maxBillFraction` ceiling every other generation
       *   step obeys, having first deducted the steps this car's symptoms
       *   already spent.
       * - `upkeepTierByGrade` says which upkeep tier the history reads as,
       *   feeding `upkeepBaselineOffset`, `upkeepJitterRange`,
       *   `upkeepMissingMultiplier` and the provenance blurb pool. The upkeep
       *   tier is DERIVED here rather than rolled beside the history: they
       *   answered the same question ("how was this car treated") and a second
       *   roll let a cherished blurb sit on a car someone had given up on.
       * - `aftermarketChanceMultiplierByGrade` scales `aftermarketChance`
       *   below, so a car that was driven hard is likelier to carry aftermarket
       *   parts than one that was garaged. History is the CAUSE of both the
       *   damage and the parts; inferring one from the other would be circular.
       * - `patternWeightsByGrade` says which NAMED THINGS could have happened to
       *   a car that arrived at this grade, and the pattern it draws
       *   (`damagePatterns.json`) is the sole answer to WHERE the damage landed
       *   (layer 3). A `tidy` car mostly has no story at all, so its row is
       *   dominated by `garaged`; a `project` car got that way for a reason, so
       *   its row is dominated by the shunt and the let-go engine. The grade
       *   still owns HOW MUCH and the pattern only owns WHERE, which is why the
       *   two tables are separate and neither can express the other's half.
       *
       * `patternSymptomBias` is how hard that pattern leans on the SYMPTOM draw,
       * in [0, 1]: 0 leaves the draw uniform over the symptom pool exactly as it
       * was before layer 3, and 1 makes it strictly proportional to how much a
       * symptom's causes sit in the groups the pattern implicates. It is one
       * lever rather than a per-pattern field because it is a statement about
       * how legible we want a car to be, not about any one kind of damage.
       *
       * Steps, not yen, because a step is what a player perceives while yen is
       * downstream of `partPricing.classFactors`. The bill then falls out of
       * the parts' own prices, which is the right direction of causation: a
       * rough cheap car SHOULD have a small bill.
       *
       * `projectGateMaxAgeYears`/`projectGateMaxMileageKm` gate the worst
       * grade: age and mileage are already rolled ahead of the grade, and a
       * car under BOTH thresholds has a rolled `project` demoted one step to
       * `rough`, because a young, barely-driven car cannot yet have been
       * given up on. Either threshold alone is not enough - a heavily driven
       * young car keeps its eligibility for the worst grade.
       *
       * `minWorkSteps` is a floor under the rolled-and-scaled step count, not
       * a second roll: economy-bible.md's core-loop law guarantees a minimum
       * of fixable work on every lot, and a `tidy` grade on a barely-driven
       * car can otherwise scale toward zero steps, generating a car with
       * nothing wrong at all. The floor is small relative to a car's 26
       * ordinary slots, so it drops a handful of parts one band each (mint to
       * fine) rather than ruining any of them - the young-car guards measure
       * parts ruined to `poor`, which this floor does not touch.
       */
      damageGrades: z.object({
        careProfiles: CareProfileWeightsSchema,
        careProfileByCulture: CareProfileByCultureSchema,
        bandStepsByGrade: DamageGradeStepsSchema,
        upkeepTierByGrade: UpkeepTierByGradeSchema,
        aftermarketChanceMultiplierByGrade: DamageGradeMultipliersSchema,
        patternWeightsByGrade: PatternWeightsByGradeSchema,
        patternSymptomBias: z.number().min(0).max(1),
        projectGateMaxAgeYears: z.number().int().positive(),
        projectGateMaxMileageKm: z.number().int().positive(),
        minWorkSteps: z.number().int().nonnegative(),
      }),
      /**
       * Per ELIGIBLE, non-missing slot (eligible = the catalog has a `grade >
       * stock` entry for this `carPartId` at the car's own fitment class),
       * the BASE chance `generateAuctionCarInstance` fits that aftermarket
       * part instead of the default stock one, at the SAME rolled band the
       * stock part would have had. Runs strictly after the missing-slot roll
       * (a missing slot is never also aftermarket) and before the symptom
       * roll, so a symptom's cause can damage whatever ends up fitted either
       * way.
       *
       * Scaled per car by
       * `damageGrades.aftermarketChanceMultiplierByGrade[history]` and clamped
       * back into [0, 1]: the car's history is what decides how modified it
       * is likely to be.
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
      /**
       * The zone model's own generation tunables (docs/design/
       * workshop-rework.md's generation table): per-tier severity weights
       * for a zone's `metal` (the six metal zones only) and `finish` (all
       * nine), rolled independently per zone per generated car.
       * `surfaceExtraChance` is the chance a metal zone's generated surface
       * severity (`max(0, metal - 1)`) is bumped up one further step, capped
       * at 2.
       *
       * `zoneBeyondRepairChance` and `zonePanelMissingChance` are the two
       * escalations past what hand work can pull back, and both are hard-gated
       * on the car's own history rather than rolled against the world: only a
       * `rough` or `project` car is eligible at all, and only its most heavily
       * damaged metal zone (the one the damage pattern put at the front of the
       * severity order) whose metal already sits at the weldable maximum. So a
       * panel goes past saving on the car whose story says it was hit, never on
       * the car that merely got old, and at most one panel per car can reach it.
       * `zonePanelMissingChance` then decides whether that panel is absent
       * outright rather than ruined in place; both states force a replacement
       * and neither can be beaten, welded or filled away.
       */
      zoneStates: z.object({
        metalWeightsByTier: ByPartFitmentClassZoneWeightsSchema,
        finishWeightsByTier: ByPartFitmentClassZoneWeightsSchema,
        surfaceExtraChance: z.number().min(0).max(1),
        zoneBeyondRepairChance: z.number().min(0).max(1),
        zonePanelMissingChance: z.number().min(0).max(1),
      }),
      /**
       * Which whole-car paint state a generated car rolls into
       * (docs/design/systems/paint-system-design.md): a separate table from
       * `damageGrades.careProfileByCulture`, deliberately - that one answers
       * how hard a car was used, this one answers whether it was repainted,
       * and the two correlate without being the same fact. `paintHistoryByCulture`
       * picks the profile a car's own scene tends toward and `paintHistory`
       * is the state distribution that profile rolls from
       * (`rollZoneStates`, sim/bodyPipeline.ts).
       */
      paintHistory: PaintHistoryWeightsSchema,
      paintHistoryByCulture: PaintHistoryByCultureSchema,
    })
    .refine(
      (pg) =>
        CARE_PROFILES.every((profile) =>
          DAMAGE_GRADES.some((grade) => pg.damageGrades.careProfiles[profile][grade] > 0),
        ),
      {
        message:
          'every partsGeneration.damageGrades.careProfiles row must give at least one grade a real share, or a car with that profile has nothing to roll',
      },
    )
    .refine(
      (pg) =>
        PAINT_HISTORY_PROFILES.every((profile) =>
          PAINT_HISTORY_STATES.some((state) => pg.paintHistory[profile][state] > 0),
        ),
      {
        message:
          'every partsGeneration.paintHistory row must give at least one state a real share, or a car with that profile has nothing to roll',
      },
    )
    .refine(
      (pg) =>
        DAMAGE_GRADES.every(
          (grade, i) =>
            i === 0 ||
            pg.damageGrades.bandStepsByGrade[grade] >=
              pg.damageGrades.bandStepsByGrade[DAMAGE_GRADES[i - 1]!],
        ),
      {
        message:
          'partsGeneration.damageGrades.bandStepsByGrade must rise from tidy to project - the grades are one ordered scale of how rough a car is',
      },
    )
    .refine(
      (pg) =>
        DAMAGE_GRADES.every((grade) =>
          DAMAGE_PATTERN_IDS.some(
            (patternId) => pg.damageGrades.patternWeightsByGrade[grade][patternId] > 0,
          ),
        ),
      {
        message:
          'every partsGeneration.damageGrades.patternWeightsByGrade row must give at least one pattern a real share, or a car at that grade has no pattern to roll',
      },
    ),
  /**
   * Two reachable quality tiers, both earned. Clean requires only that no
   * part sits below the band bar; concours additionally requires the car's
   * DERIVED authenticity (`computeDerivedStats`, sim/derivedStats.ts) to
   * clear its own bar. That number used to be a stored roll no player could
   * move; it is now originality times condition, so concours means an
   * unmodified car in genuinely excellent order. Lemon's penalty and
   * thresholds (`LEMON_MAX_AVERAGE_CONDITION` etc.) live in
   * `sim/constants.ts`.
   */
  reputation: z
    .object({
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
       * a floor per part ("seven great parts can't hide one neglected one"). */
      cleanSaleMinBand: z.enum(['scrap', 'poor', 'worn', 'fine', 'mint']),
      cleanSaleBonus: z.number().int().nonnegative(),
      /** Concours also requires the car's derived authenticity to clear this
       * bar - on top of, not instead of, the clean band bar. Since
       * authenticity is originality times condition, and concours already
       * demands every part mint, in practice this is a bar on how much of the
       * car is still the parts it left the factory with. */
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
    })
    .strict(),
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
      /** Per-`CarRarity` desirability multiplier on `offerChanceBase` - how
       * much natural foot traffic a car's own scarcity draws, independent of
       * whether any buyer archetype is even a plausible fit for its tier at
       * all (that's the separate `saleCandidates` gate `sellViaWalkIn` already
       * applies). A car you see every day gets looked at far more often than
       * one nobody has laid eyes on in years. */
      offerChanceByRarity: ByCarRarityMultiplierSchema,
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
       * How sharply a channel's own crowd turns up, by standing: the exponent
       * every `sellingChannels[*].buyerPoolWeights` entry is raised to before
       * the draw. 1.0 leaves a pool exactly as authored; above 1 the
       * archetypes a channel is FOR crowd out the ones it is not, because a
       * weight above 1 grows and a weight below 1 shrinks under the same
       * exponent. This is what standing buys on the sell side: not a door,
       * and not a bigger number on the same offer, but the right people
       * arriving more reliably through a channel already open. A flat pool
       * (every archetype at exactly 1, the shop front) is mathematically
       * untouched by any exponent, so the free channel never improves - which
       * is the design, not an accident of the values.
       */
      channelStandingFocusByReputationTier: z.object({
        unknown: z.number().min(1),
        local: z.number().min(1),
        known: z.number().min(1),
        respected: z.number().min(1),
        legend: z.number().min(1),
      }),
    })
    .refine((s) => s.heatBandColdBelowPercent <= s.heatBandHotAtOrAbovePercent, {
      message: 'selling.heatBandColdBelowPercent must be <= heatBandHotAtOrAbovePercent',
    }),
  /**
   * Stage F, the normalised listing clock (sale-value-system.md S4): how an
   * arriving offer's chance and price both slide as a listing's own
   * `ForSaleEntry.offersSeen` climbs - never `daysListed`. A car nobody has
   * come to look at has not gone stale; it goes stale once people have
   * looked and passed (sprint147.md). `stalenessFor`/`qualityMeanFor`
   * (selling.ts) are the two curve implementations.
   */
  liquidity: z
    .object({
      /** The floor `stalenessFor` decays toward as `offersSeen` grows - a
       * long-stale listing still draws SOME foot traffic, never zero. */
      stalenessFloor: z.number().min(0).max(1),
      /** Offers-seen at which the staleness multiplier has closed half the
       * gap between 1.0 (fresh) and `stalenessFloor`. */
      stalenessHalfLifeOffers: z.number().positive(),
      /** A genuinely fresh listing's expected offer quality, as a fraction
       * of channel price (`offersSeen` = 0). */
      qualityFresh: z.number().min(0).max(1),
      /** The floor `qualityMeanFor`'s mean decays toward as `offersSeen`
       * grows, and the hard clamp every drawn offer respects regardless of
       * how the roll lands. */
      qualityFloor: z.number().min(0).max(1),
      /** Offers-seen at which the quality mean has closed half the gap
       * between `qualityFresh` and `qualityFloor`. */
      qualityHalfLifeOffers: z.number().positive(),
      /** Standard deviation of the seeded Normal draw around the quality
       * mean, before the `[qualityFloor, 1.0]` clamp. */
      qualitySpread: z.number().nonnegative(),
      /**
       * Re-listing (`resolveSetForSale`, on a channel switch or a same-
       * channel re-list) carries the old entry's `offersSeen` forward at
       * this fraction rather than resetting to 0 fresh:
       * `newOffersSeen = round(oldOffersSeen * (1 - relistRecovery))`. Same
       * plate, same advertisement, everyone has seen it - a full reset would
       * sell patience back for the price of a listing fee.
       */
      relistRecovery: z.number().min(0).max(1),
    })
    .strict()
    .refine((l) => l.qualityFloor <= l.qualityFresh, {
      message: 'liquidity.qualityFloor must be <= liquidity.qualityFresh',
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
   * number the roster-wide coherence check (`balanceProbes.ts`,
   * `tools/balance/src/balance/invariants.py`) gates the "brake pads vs car
   * price" guard against - the full tyres+brakePadsDiscs+clutch consumable
   * set, class-priced, must never exceed this fraction of a model's own book
   * value. A content anchor rather than a hardcoded check constant.
   */
  coherence: z.object({
    maxConsumablesShareOfBookValue: z.number().positive().max(1),
  }),
  /**
   * The used-part counter. `usedPartSaleFraction` is `resolveSellPart`'s
   * haircut off a part's own resolved catalogue price (`usedPartSaleValueYen`,
   * sim/bands.ts), and `resaleBandFactors` is the condition curve that same
   * price runs through.
   *
   * `resaleBandFactors` is deliberately NOT `bands.bandFactors`. That curve
   * prices REPAIR and car value, where a band step costs
   * `restoration.repairStepFraction` of the part's price; this one prices
   * what a stranger pays for the part on the counter, and it falls away far
   * faster at the bottom. The gap between the two is what makes
   * reconditioning worth doing before selling: a poor part costs one
   * repair step to lift to worn and gains
   * `(worn - poor) x usedPartSaleFraction` of its price by doing so. The
   * steps above worn deliberately do NOT pay - repairing past worn is for a
   * part you intend to fit, not one you intend to sell. `scrap` has no entry
   * because a scrap part is unsellable at any price (`resolveScrapPart` is
   * its only route).
   *
   * `donorBreakEvenBillRatio` is the bill-to-clean ratio above which parting
   * out a car's worst-case rolled condition can beat the sensible-repair
   * route - a disclosed measurement threshold for the balance report, not a
   * hard-gated invariant.
   *
   * Removal labour is priced by `energy.actionPoints.removePart` (one flat
   * figure, not per depth class); like-for-like reassembly prices through
   * `energy.actionPoints.refitUnchangedMember` via `jobs.ts`'s
   * `refitLaborSlotsFor` and `CarPartState.vacatedBaseline`.
   */
  teardown: z.object({
    usedPartSaleFraction: z.number().positive().max(1),
    resaleBandFactors: z.object({
      mint: z.number().positive().max(1),
      fine: z.number().positive().max(1),
      worn: z.number().positive().max(1),
      poor: z.number().positive().max(1),
    }),
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
   * laborSlots.ts), while a higher tool tier REDUCES a repair's per-band-step
   * cost (`energyPerBandStepByToolTier`, no ceil, so a tier is a genuine
   * fraction of the work, not a rounded-up whole slot).
   */
  energy: z.object({
    /** Energy points one labour slot is worth (the x10 scale). The per-member
     * pool contribution is `staffMember.laborSlotsPerDay x pointsPerLabour`, and
     * a single-labour op (a diagnostic test, an owned-car workup) costs exactly
     * this. Display divides nothing: the point value the sim holds is the number
     * the player reads. */
    pointsPerLabour: z.number().int().positive(),
    /** The solo shop's daily labour pool in points (`energyMax`'s base term).
     * Benched staff add on top; the pool refills fully each day, and a coffee
     * round (`economy.cafe`) can add a little back mid-day without waiting
     * for that refill. */
    basePoolPoints: z.number().int().positive(),
    /** Repair energy per band step climbed, by the group's tool tier (the
     * tool-tier speed axis, now on the bar). A repair costs `steps x
     * energyPerBandStepByToolTier[tier]` points - NO ceil, so a higher tier
     * is a genuine fraction of the work. Must be positive and non-increasing
     * up the tiers (a better tier never costs MORE per band step). */
    energyPerBandStepByToolTier: z
      .object({
        1: z.number().int().positive(),
        2: z.number().int().positive(),
        3: z.number().int().positive(),
      })
      .refine((e) => e[1] >= e[2] && e[2] >= e[3], {
        message:
          'energy.energyPerBandStepByToolTier must be non-increasing up the tiers (tier 1 >= tier 2 >= tier 3)',
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
   * The cafe across the street: a coffee round buys labour back today for
   * cash instead of waiting for tomorrow's refill (`resolveBuyCoffee`,
   * sim/cafe.ts). It only refunds points already spent, so it never lifts
   * the pool's own ceiling (`energyMax`, laborSlots.ts) and never advances
   * the day. Capped at `maxPurchasesPerDay` - unlimited coffee would be
   * unlimited labour for money, which would erase the day's own limit
   * rather than merely loosen it the way a tool tier or a bench member does.
   */
  cafe: z.object({
    /** Labour points one round restores, on the same energy-point scale
     * every other labour figure uses. `resolveBuyCoffee` restores at most
     * what is actually still spent today, so this can never push the pool
     * above its own maximum. */
    coffeeLabourPoints: z.number().int().positive(),
    /** The flat part of the round's price - what a solo player with no crew
     * would pay. */
    coffeeBasePriceYen: z.number().int().nonnegative(),
    /** Added once per staff member on the payroll (`state.staff.length`,
     * bench or contract alike, the same headcount `applyWeeklyRentAndWages`
     * pays a wage to): the round buys for the whole crew, not just whoever
     * is on shift today. */
    coffeePerStaffYen: z.number().int().nonnegative(),
    /** How many rounds the cafe will sell in one day. */
    maxPurchasesPerDay: z.number().int().positive(),
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
       * (weld/panel repair or replace of panels or chassis). */
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
     * wheels on the tyre bench op (`benchSwapGateGroup`), so they name no
     * slots here - this predicate must never fire for them.
     */
    signatureSlotsByGroup: z.partialRecord(ComponentIdSchema, z.array(CarPartIdSchema).min(1)),
    probeAmortisationOps: z.number().int().positive(),
  }),
  /**
   * The rolling road. A dyno is a workshop tool the shop hires in for the day
   * or buys outright, priced and gated exactly the way a tool line's tier-2
   * machine is, and presented alongside the six lines. It is NOT one of them:
   * nothing is repaired on it and it belongs to no part group, so it carries
   * its own three values here rather than a seventh column in
   * `toolLines.json` and `machineShopAssist.feeYenByGroup`, both of which are
   * keyed by `ComponentId` and exhaustive over the six.
   *
   * `hireFeeYen` buys the day's access, the same day-stamped shape a machine
   * line's hire already uses; `purchasePriceYen` buys it outright and ends the
   * fee for good; `minReputationTier` is the standing a purchase needs,
   * mirroring a tool tier's own `minReputationTier`. Nothing measured on the
   * dyno changes the car, so no value here reaches a stat, a price or a lap
   * time - these three buy knowledge and nothing else.
   */
  dyno: z.object({
    hireFeeYen: z.number().int().positive(),
    purchasePriceYen: z.number().int().positive(),
    minReputationTier: ReputationTierSchema,
  }),
  /**
   * Machining: the third way a part gets better. A repair restores a part to
   * what it was and fitting aftermarket replaces it with something else;
   * machining improves the original, and the part stays the car's own. The
   * record lives on the `PartInstance` (`PartInstanceSchema.machining`), so it
   * travels with the part between cars and survives every job that rebuilds a
   * slot.
   *
   * `operations` is the whole catalogue, four machinable slots between them:
   * the engine's own castings, which are the only things a machinist takes
   * metal off. Every figure an operation carries is a lever and lives here
   * rather than in code (content law).
   *
   * The three cross-cutting levers:
   *
   * - `gradeMultiplier` scales an operation's power by the GRADE of the part
   *   machined, because better surrounding hardware can use more of what
   *   machining unlocks. It is what keeps a machined part below the next grade
   *   up, which is what keeps the money ladder meaningful.
   * - `reliabilityCostPerOperation` is the single reliability charge, folded
   *   into the build-intensity factor rather than added as a fourth loss term:
   *   machining IS power, and the intensity term is where power's own cost on
   *   reliability already lands. A machining gain deliberately does NOT enter
   *   `totalGainFractionOf`, because that would charge the same energy twice
   *   and make this lever misleading.
   * - `valuePremiumPerOperation` is what one operation adds to a part's worth,
   *   as a fraction of that part's own catalogue price. A machined part is a
   *   dearer object, on the same axis where a race block already outranks a
   *   street one; it is never the power that moves the money.
   *
   * `minEngineToolTier` is the engine line's rung that owns the means of
   * production - the tier `toolLines.json` already names "Machine-shop
   * tooling". Owning it buys the right to spend labour this way; it does not
   * make the labour free.
   *
   * `craftOperationToolTier` is the SAME idea for every operation whose own
   * `scene` gates it: standing ungates the tool, but the tool itself is
   * still tier 3 of whichever line the operation's `carPartId` belongs to
   * (`docs/design/systems/tier-three-unlocks.md`'s ruling). Kept separate
   * from `minEngineToolTier` rather than reusing it, because the four
   * original operations are engine-specific while a scene operation's line
   * is read off its own `carPartId` and can be any of the six.
   */
  machining: z.object({
    minEngineToolTier: ToolTierSchema,
    craftOperationToolTier: ToolTierSchema,
    gradeMultiplier: z.object({
      stock: z.number().nonnegative(),
      street: z.number().nonnegative(),
      sport: z.number().nonnegative(),
      race: z.number().nonnegative(),
    }),
    reliabilityCostPerOperation: z.number().min(0).max(1),
    valuePremiumPerOperation: z.number().min(0),
    operations: z.array(MachiningOperationSchema).min(1),
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
   *
   * `symptomChanceByTier` IS AN INPUT AND NOT THE RATE A PLAYER MEETS, on
   * purpose. `applySymptoms` drops a symptom outright if it would breach the
   * Law 2 ceiling, so the EFFECTIVE rate is this number times a survival
   * fraction, and the signed design intent (0.55 / 0.50 / 0.45 / 0.35) is a
   * statement about the effective rate. These four are therefore derived as
   * `signed / measured survival` rather than authored directly.
   *
   * The standing hazard, recorded in TODO.md as well as here: anything that
   * changes how rough generated cars are, or which symptoms get drawn, moves
   * that survival fraction and silently reopens the gap. Re-measure and
   * re-derive rather than assuming these four still hold.
   */
  diagnosis: z.object({
    symptomChanceByTier: z.object({
      entry: z.number().min(0).max(1),
      everyday: z.number().min(0).max(1),
      enthusiast: z.number().min(0).max(1),
      flagship: z.number().min(0).max(1),
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
