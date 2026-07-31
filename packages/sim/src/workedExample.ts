import {
  ALL_CAR_PART_IDS,
  fitmentClassForTier,
  type AuctionLot,
  type AuctionTier,
  type Buyer,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ComponentId,
  type ConditionBand,
  type DayLogEntry,
  type GameState,
  type Grade,
  type SellingChannelId,
  type StagedAction,
  type ZoneId,
  type ZoneState,
} from '@midnight-garage/content'
import { emptyDayActions } from './actions'
import { advanceDay } from './advanceDay'
import {
  assemblyContainerFor,
  resolveRefitAssembly,
  resolveRemoveAssembly,
  resolveSwapAssemblyMember,
} from './assemblies'
import { generateAuctionCarInstance, rollAuctionDurationDays } from './auctions'
import { bandIndex, canRepair, carCostToBandYen, planGroupRepair } from './bands'
import {
  anchorValueYen,
  computeBuyoutPriceYen,
  reserveYen,
  resolveAttendAuction,
  settleAuctionHammer,
} from './bidding'
import {
  PANEL_ZONE_IDS,
  isBodyDerivedPart,
  planPaintStage,
  planPipelineStage,
  severityThresholdForBand,
} from './bodyPipeline'
import { carLedgerFor } from './carLedger'
import type { SimContext } from './context'
import { coherenceFactorFor } from './derivedStats'
import { moveCar } from './facilities'
import { computeWeeklyRentYen } from './finances'
import {
  reconditionQuote,
  refitLaborSlotsFor,
  resolveHireMachineLine,
  resolveJobLabor,
  resolveReconditionLabor,
  resolveRemovePart,
  signatureGroupFor,
} from './jobs'
import { energyMax } from './laborSlots'
import {
  expectationForCar,
  foundationFactor,
  installedPartsValueYen,
  marketValueYen,
  retentionFor,
  sensibleRepairTargetBand,
} from './marketValue'
import { createInitialGameState } from './newGame'
import { gradeAtLeast, resolveBuyPart } from './parts'
import { createRng } from './rng'
import { resolveSellViaWalkIn, resolveSetForSale } from './selling'
import { confirmStagedWork } from './stagedWork'
import { supportVerdict } from './support'
import { channelBuyerTaste, valuateCarForBuyerViaChannel } from './valuation'
import { valueLedgerFor, type ValueLedger } from './valueLedger'

/**
 * A scripted, fully deterministic two-car lifecycle - auction desk to
 * specialised sale - driven entirely through the shipped resolvers, so every
 * figure it reports is one the game itself produced. It exists to answer the
 * single question the percentage levers cannot: what does the whole machine
 * do to a player's bank balance, once, with every yen named.
 *
 * NOT a bot career (directive 21). There is no strategy, no search, no
 * repetition and no distribution: the play is written down in `CAR_SCRIPTS`
 * in advance and runs once, exactly like a hand-played session recorded step
 * by step. `docs/design/systems/worked-example-two-cars.md` is its output.
 *
 * The one law this file enforces on itself is in `Run.step` below: every
 * scripted step must explain its own cash movement, line by line, from figures
 * the sim reported (a day-log entry, or a planner's own quote for the two
 * charges that emit no log). A step that moves cash this file cannot name
 * throws immediately, so an incomplete ledger fails loudly rather than
 * silently rounding itself right.
 */

/** Which side of the ledger a cash line belongs to. Fixed overheads are
 * `shop`, never a car's: weekly rent is a function of bays owned, not of any
 * one car, so it is reported as context and never subtracted from a car's
 * margin. */
export type CashScope = 'car-a' | 'car-b' | 'shop'

export type CashCategory =
  | 'acquisition'
  | 'attendance'
  | 'repair'
  | 'parts'
  | 'materials'
  | 'machine-hire'
  | 'listing'
  | 'sale'
  | 'rent'
  | 'other'

/** One named cash movement, signed as the bank sees it: negative out,
 * positive in. */
export interface CashLine {
  day: number
  scope: CashScope
  category: CashCategory
  label: string
  yen: number
}

/** One rung of the value ladder, with the full `valueLedgerFor` decomposition
 * behind it - never a second valuation. */
export interface ValueRung {
  label: string
  day: number
  heatPercent: number
  ledger: ValueLedger
  /** The car's remaining restoration bill to its tier's expected band at this
   * rung (`carCostToBandYen`) - what the market is still discounting. */
  billToExpectedBandYen: number
  /** Stage C/D's dials, read off the same car this rung values. */
  supportHeadline: number
  coherenceFactor: number
  retention: number
  foundationFactor: number
  aftermarketReturn: number
  /** `installedPartsValueYen` at this rung's own retention - the raw premium
   * before the foundation and tier gates take their cut. */
  installedPartsValueYen: number
}

/** One acquisition, priced at both ends of the band the live room settles
 * inside. */
export interface AcquisitionQuote {
  tier: AuctionTier
  lotId: string
  /** `anchorValueYen` - the guide value every auction price is a fraction of. */
  anchorYen: number
  /** `reserveYen` = anchor x `AUCTION_RESERVE_PRICE_FRACTION`. */
  reserveYen: number
  /** `computeBuyoutPriceYen` = anchor x `AUCTION_BUYOUT_PREMIUM`. */
  buyoutYen: number
  /** `auctionRoom.attendanceFeeYenByTier[tier]` - a live mechanism sitting at
   * zero for every tier in shipped content. */
  attendanceFeeYen: number
  /** What the scripted run actually paid. */
  paidYen: number
}

/** One installed aftermarket part, with the price paid for it. */
export interface FittedPart {
  carPartId: CarPartId
  partId: string
  displayName: string
  grade: Grade
  listPriceYen: number
  paidYen: number
  expressSurchargeYen: number
}

/** One offer that landed on a listed car, exactly as the daily draw priced
 * it. */
export interface OfferObservation {
  day: number
  /** The listing's `offersSeen` at the moment the draw ran (before its own
   * increment) - the clock both `stalenessFor` and `qualityMeanFor` read. */
  offersSeenAtDraw: number
  buyerId: string
  priceYen: number
  /** `priceYen / valuateCarForBuyerViaChannel(...)` - the Stage F quality
   * fraction this offer was drawn at, recovered from the sim's own channel
   * price rather than re-rolled. */
  qualityFraction: number
}

/** What the SAME car, on the SAME day, to the SAME buyer would have been
 * priced at through each listing channel - the taste ceiling is the only thing
 * that differs, so this isolates what a specialised sale is actually worth.
 * Every figure is a direct `valuateCarForBuyerViaChannel` read; no draw, no
 * RNG. */
export interface ChannelQuote {
  channelId: SellingChannelId
  feeYen: number
  /** `null` for the trade network, which has no taste roll at all - it prices
   * a flat band around plain `marketValueYen` instead. */
  tasteCeiling: number | null
  matchedOnly: boolean
  requiresForecourt: boolean
  /** The buyer's taste for this car read through this channel's own ceiling. */
  buyerTaste: number
  /** The channel price the daily draw would then apply its quality fraction
   * to. For the trade network this is plain `marketValueYen`, the number its
   * `priceBand` multiplies. */
  channelPriceYen: number
}

export interface StalenessWalk {
  days: number
  offers: OfferObservation[]
  firstOfferYen: number
  bestOfferYen: number
  bestOfferDay: number
  /** `bestOfferYen - firstOfferYen` - what patience is worth, before the rent
   * the extra days cost. */
  holdingGainYen: number
  /** Rent charged across the walk's own days, so the gain can be read net. */
  rentOverWalkYen: number
}

export interface CarRunReport {
  scope: CashScope
  modelId: string
  displayName: string
  tier: CarModel['tier']
  culture: string
  whyChosen: string
  carInstanceId: string
  year: number
  mileageKm: number
  generationSeed: number
  acquisition: AcquisitionQuote
  expectedBand: ConditionBand
  repairTargetBand: ConditionBand
  rungs: ValueRung[]
  /** Slots that arrived already carrying somebody else's aftermarket part -
   * generation fits up to `partsGeneration.maxAftermarketSlots` per car, so a
   * bought car can turn up with a half-finished build already discounted by
   * Stage C. */
  inheritedAftermarket: {
    carPartId: CarPartId
    displayName: string
    grade: Grade
    band: ConditionBand
  }[]
  fittedParts: FittedPart[]
  machineHires: { day: number; group: ComponentId; feeYen: number }[]
  /** Labour is slots, not yen - tracked separately and never mixed into a
   * money line. */
  laborSlotsSpent: number
  daysHeld: number
  listingChannelId: SellingChannelId
  listingFeeYen: number
  soldOnDay: number
  soldToBuyerId: string
  soldForYen: number
  soldBuyerTaste: number
  soldQualityFraction: number
  /** The same car, the same day, the same buyer, priced through every channel
   * - so the cost of selling off the shop front is legible. */
  channelQuotes: ChannelQuote[]
  /** The sim's own `CarLedger` at the moment of sale - never recomputed. */
  ledgerPurchaseYen: number
  ledgerRepairYen: number
  ledgerPartsYen: number
  /** `priceYen - (purchaseYen + repairYen + partsYen)`, the same expression
   * `resolveSellViaWalkIn` itself logs as `profitYen`. */
  netYen: number
  /** Parts still below the expected band once every route open to a tier-1
   * shop had been used - the honest residual. */
  residual: { carPartId: CarPartId; band: ConditionBand; reason: string }[]
  residualBillYen: number
  /** Present only for the car the staleness demonstration runs on. A pure
   * side branch off the listing snapshot: nothing in it touches the career
   * this report reconciles. */
  stalenessWalk: StalenessWalk | null
}

export interface WorkedExampleReport {
  careerSeed: number
  startingCashYen: number
  finalCashYen: number
  weeklyRentYen: number
  cashLines: CashLine[]
  carA: CarRunReport
  carB: CarRunReport
  /** Every non-car income stream that fired. All three must be empty for the
   * run to mean anything; the test asserts it. */
  excludedIncome: CashLine[]
}

/** The two cars, and why each one is here. */
interface CarScript {
  scope: CashScope
  modelId: string
  culture: string
  whyChosen: string
  generationSeed: number
  auctionTier: AuctionTier
  /** The build fitted at rung 3, as `[slot, grade]` pairs. Every slot named
   * here is reachable without pulling an assembly. */
  build: [CarPartId, Grade][]
  /** Express pays `PARTS_EXPRESS_SURCHARGE_FRACTION` for same-day stock;
   * standard pays sticker and waits a day. One car uses each, so both prices
   * appear in the ledger. */
  buildDeliverySpeed: 'standard' | 'express'
  listingChannelId: SellingChannelId
  /** Days to walk the listing forward in the side branch, collecting every
   * offer without taking one. 0 means no staleness demonstration. */
  stalenessWalkDays: number
}

const CAR_SCRIPTS: readonly CarScript[] = [
  {
    scope: 'car-a',
    modelId: 'suzuki-wagon-r-ct21s',
    culture: 'Kei',
    whyChosen:
      'The cheapest thing a day-one shop can reach, and bought rough: entry tier, Kei culture, ¥230,000 of book value. Its tier expects only `worn`, its `beyondDiscount` is 0.4 and its `aftermarketReturn` is 0.3 - so it is the car the economy pays you to fix and charges you to modify.',
    generationSeed: 26,
    auctionTier: 'local-yard',
    // A modest warm-over, not a power build: both entry-tier buyers
    // (first-timer, kei-specialist) cap power with an `upper` target, so the
    // money goes into a lip kit and a breathe-easier top end rather than
    // chasing horsepower a kei buyer would mark down.
    build: [
      ['aero', 'street'],
      ['exhaust', 'street'],
      ['intake', 'street'],
      ['cooling', 'street'],
    ],
    buildDeliverySpeed: 'express',
    listingChannelId: 'shopFront',
    stalenessWalkDays: 0,
  },
  {
    scope: 'car-b',
    modelId: 'nissan-silvia-s13',
    culture: 'Drift',
    whyChosen:
      'Everything the Wagon R is not, and bought tidy rather than rough: everyday tier, Drift culture, ¥500,000 of book value. Its tier expects `fine`, its `beyondDiscount` is 0.8 and its `aftermarketReturn` is 0.6, so a coherent build gets twice the credit it would on the kei, and the tuner/racer/stancer crowd it draws will pay for it.',
    generationSeed: 9,
    auctionTier: 'regional',
    // A coherent bolt-on power build. The support slots are bought FIRST, so
    // that even a shop that runs out of cash part-way through never ends up
    // holding a power part nothing answers: `supportVerdict` stays `adequate`
    // and Stage C never bites.
    build: [
      ['fuelSystem', 'street'],
      ['cooling', 'street'],
      ['intake', 'street'],
      ['exhaust', 'street'],
      ['aero', 'street'],
    ],
    buildDeliverySpeed: 'standard',
    listingChannelId: 'freeAdsPaper',
    stalenessWalkDays: 45,
  },
]

const ALL_ZONE_IDS: readonly ZoneId[] = [...PANEL_ZONE_IDS, 'chassis']
const WORK_GROUPS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'wheels',
  'body',
  'interior',
]

/** Day-log entries that move cash, and the sign the bank sees. Everything the
 * scripted run can trigger is named here; anything else is unaccounted by
 * construction and trips the reconciliation in `Run.step`. */
function cashLinesFromLog(log: readonly DayLogEntry[], day: number, scope: CashScope): CashLine[] {
  const lines: CashLine[] = []
  const push = (category: CashCategory, label: string, yen: number): void => {
    if (yen !== 0) lines.push({ day, scope, category, label, yen })
  }
  const pushShop = (category: CashCategory, label: string, yen: number): void => {
    if (yen !== 0) lines.push({ day, scope: 'shop', category, label, yen })
  }
  for (const entry of log) {
    switch (entry.type) {
      case 'lot-bought-out':
        push('acquisition', `Bought out lot ${entry.lotId}`, -entry.priceYen)
        break
      case 'auction-hammer-won':
        push('acquisition', `Hammer won on lot ${entry.lotId}`, -entry.priceYen)
        break
      case 'part-bought':
        push('parts', `Part bought express: ${entry.partId}`, -entry.priceYen)
        break
      case 'part-ordered':
        push('parts', `Part ordered standard: ${entry.partId}`, -entry.priceYen)
        break
      case 'machine-hired':
        push(
          'machine-hire',
          `Machine line hired for the day: ${entry.componentId}`,
          -entry.priceYen,
        )
        break
      case 'job-created':
        if (entry.costYen) push('repair', `Repair charge on ${entry.carInstanceId}`, -entry.costYen)
        break
      case 'rent-paid':
        pushShop('rent', 'Weekly rent', entry.amountYen)
        break
      case 'wage-paid':
        pushShop('other', 'Staff wage', entry.amountYen)
        break
      case 'double-parking-fine':
        push('other', 'Double-parking fine', -entry.amountYen)
        break
      case 'contract-income':
        push('other', 'Contract staff retainer', entry.amountYen)
        break
      case 'car-sold':
        push('sale', `Car sold: ${entry.carInstanceId}`, entry.priceYen)
        break
      case 'part-scrapped':
        push('parts', `Scrap part sold: ${entry.partInstanceId}`, entry.priceYen)
        break
      case 'part-sold':
        push('parts', `Used part sold: ${entry.partInstanceId}`, entry.priceYen)
        break
      case 'shell-scrapped':
        push('other', `Shell scrapped: ${entry.carInstanceId}`, entry.priceYen)
        break
      case 'inspection-visit':
        push('attendance', `Inspection visit at the ${entry.tier} rooms`, -entry.feeYen)
        break
      case 'service-job-completed':
        push('other', `Service job payout: ${entry.jobId}`, entry.payoutYen)
        break
      case 'mission-delivered':
        push('other', `Story mission payout: ${entry.missionId}`, entry.payoutYen)
        break
      default:
        break
    }
  }
  return lines
}

/** The scripted driver: one live `GameState`, one running cash ledger, and a
 * refusal to let any step move cash it cannot name. */
class Run {
  state: GameState
  readonly lines: CashLine[] = []
  readonly laborByScope: Record<CashScope, number> = { 'car-a': 0, 'car-b': 0, shop: 0 }

  constructor(
    state: GameState,
    readonly context: SimContext,
  ) {
    this.state = state
  }

  get day(): number {
    return this.state.day
  }

  /** Labour left in today's pool - `energyMax` minus what is already spent. */
  get labourLeft(): number {
    return Math.max(0, energyMax(this.state, this.context.economy) - this.state.energySpentToday)
  }

  /**
   * Runs one scripted step and books its cash movement. `extra` carries lines
   * for the two charges the sim makes without logging them (body-pipeline
   * materials, and a bench recondition), each taken from the relevant
   * planner's own quote rather than from arithmetic here. Throws when the
   * named lines do not add up to the real cash delta.
   */
  step(
    scope: CashScope,
    run: () => { state: GameState; log: readonly DayLogEntry[]; extra?: CashLine[] },
  ): readonly DayLogEntry[] {
    const before = this.state
    const labourBefore = before.energySpentToday
    const result = run()
    const day = before.day
    const lines = [...cashLinesFromLog(result.log, day, scope), ...(result.extra ?? [])]
    const named = lines.reduce((sum, line) => sum + line.yen, 0)
    const actual = result.state.cashYen - before.cashYen
    if (named !== actual) {
      throw new Error(
        `worked example: unaccounted cash on day ${day} (${scope}). Named lines total ` +
          `${named} yen, the sim moved ${actual} yen, a gap of ${actual - named} yen. ` +
          `Lines: ${JSON.stringify(lines)}`,
      )
    }
    this.state = result.state
    this.lines.push(...lines)
    // A day boundary resets the pool, so labour only accumulates within a day.
    const labourAfter = result.state.energySpentToday
    if (labourAfter >= labourBefore) this.laborByScope[scope] += labourAfter - labourBefore
    return result.log
  }

  /** One End Day through the real `advanceDay`, with an empty action batch:
   * every action in this run is resolved instantly, exactly as a player's
   * click resolves it. The per-day rng stream is `seed + day`, the convention
   * `advanceDay`'s own contract documents. */
  endDay(scope: CashScope): readonly DayLogEntry[] {
    return this.step(scope, () => {
      const result = advanceDay(
        this.state,
        emptyDayActions(),
        this.state.seed + this.state.day,
        this.context,
      )
      return { state: result.state, log: result.log }
    })
  }

  /** Ends the day if fewer than `slots` labour points remain, so the next
   * operation is never silently refused for want of budget. */
  ensureLabour(scope: CashScope, slots: number): void {
    if (this.labourLeft < slots) this.endDay(scope)
  }
}

/** Builds a real auction lot around a really generated car - the same
 * `generateAuctionCarInstance` the live catalogue uses, at a pinned seed, so
 * the lot is a genuine roll rather than a hand-built fiction. */
function buildScriptedLot(
  script: CarScript,
  context: SimContext,
  day: number,
  currentYear: number,
): AuctionLot {
  const model = context.modelsById[script.modelId]
  if (!model) throw new Error(`worked example: unknown model ${script.modelId}`)
  const rng = createRng(script.generationSeed)
  const lotId = `worked-${script.scope}-${script.generationSeed}`
  const car = generateAuctionCarInstance(
    model,
    `car-${lotId}`,
    rng,
    context,
    currentYear,
    true,
    day,
    true,
  )
  return {
    id: lotId,
    tier: script.auctionTier,
    modelId: model.id,
    car,
    bookValueYen: model.bookValueYen,
    expiresOnDay: day + rollAuctionDurationDays(model.rarity, rng, context.economy),
    turnout: 'steady',
  }
}

function carOf(state: GameState, carInstanceId: string): CarInstance {
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) throw new Error(`worked example: car ${carInstanceId} is not owned`)
  return car
}

/** One rung of the ladder, read straight off `valueLedgerFor` and the same
 * Stage C/D atoms `marketValueYen` itself consumes. */
function readRung(
  label: string,
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): ValueRung {
  const heatPercent = state.marketHeat[model.id] ?? 100
  const expectation = expectationForCar(model, context.economy)
  const headline = supportVerdict(car, model, context.partsById, context.economy).headline
  const coherenceFactor = coherenceFactorFor(headline, context.economy)
  const retention = retentionFor(coherenceFactor, context.economy)
  return {
    label,
    day: state.day,
    heatPercent,
    ledger: valueLedgerFor(
      car,
      model,
      heatPercent,
      context.partsById,
      context.partsTaxonomyById,
      context.economy,
    ),
    billToExpectedBandYen: carCostToBandYen(
      car,
      model,
      context.partsById,
      context.partsTaxonomyById,
      context.economy,
      expectation.band,
    ),
    supportHeadline: headline,
    coherenceFactor,
    retention,
    foundationFactor: foundationFactor(car, context.economy),
    aftermarketReturn: expectation.aftermarketReturn,
    installedPartsValueYen: installedPartsValueYen(
      car,
      context.partsById,
      context.economy,
      retention,
    ),
  }
}

/** Hires `group`'s line for today if it is not already available, booking the
 * fee. An owned machine, a zero fee, or a line already hired today is a silent
 * no-op inside the resolver, so this is safe to call unconditionally. */
function hireLine(
  run: Run,
  scope: CashScope,
  group: ComponentId,
  hires: CarRunReport['machineHires'],
): void {
  const day = run.day
  const before = run.state.cashYen
  run.step(scope, () => {
    const result = resolveHireMachineLine(run.state, group, run.context)
    return { state: result.state, log: result.log }
  })
  const feeYen = before - run.state.cashYen
  if (feeYen > 0) hires.push({ day, group, feeYen })
}

type GenericStage = 'beat' | 'fillAndSand' | 'prime' | 'polish'

/** The one stage this zone should take next to climb toward `target`, or null
 * when it is there (or stuck - a `metal` severity above 2 needs welding, and
 * welding needs the body line this run never hires). Pure: it only reads the
 * zone and the thresholds the pricing side reads. */
function nextZoneStage(
  zone: ZoneState,
  zoneId: ZoneId,
  target: ConditionBand,
  polishFloor: number,
): { kind: 'stage'; stage: GenericStage } | { kind: 'paint' } | null {
  const threshold = severityThresholdForBand(target)
  const isPanelZone = zoneId !== 'chassis'
  const needsMetal = zone.metal > threshold
  const needsSurface = isPanelZone && zone.surface > threshold
  const needsFinish = zone.finish > threshold
  if (!needsMetal && !needsSurface && !needsFinish) return null

  // A polish is the cheapest way down one finish grade, and needs nothing
  // underneath it - so it is tried before any metalwork.
  if (needsFinish && zone.primed) return { kind: 'paint' }
  if (needsFinish && zone.finish < 3 && zone.finish > Math.max(polishFloor, threshold)) {
    return { kind: 'stage', stage: 'polish' }
  }
  // Everything else in the ladder (fill and sand, prime, paint) needs straight
  // metal underneath it, so the metal comes down even when the metal itself is
  // already inside the band.
  if (zone.metal >= 1 && zone.metal <= 2) return { kind: 'stage', stage: 'beat' }
  if (zone.metal !== 0) return null // rotten: only a weld or a new panel fixes it
  if (zone.surface > 0) return { kind: 'stage', stage: 'fillAndSand' }
  if (needsFinish && !zone.primed) return { kind: 'stage', stage: 'prime' }
  return null
}

/** Runs one staged body-pipeline action through the real `confirmStagedWork`,
 * booking the materials charge from the planner's own quote (the resolver
 * charges cash without logging it). */
function confirmOnePipelineAction(
  run: Run,
  scope: CashScope,
  carInstanceId: string,
  action: StagedAction,
  materialsCostYen: number,
  label: string,
): void {
  run.step(scope, () => {
    const withStaged: GameState = {
      ...run.state,
      stagedCarWork: { ...run.state.stagedCarWork, [carInstanceId]: [action] },
    }
    const result = confirmStagedWork(withStaged, carInstanceId, run.labourLeft, run.context)
    const spentYen = withStaged.cashYen - result.state.cashYen
    return {
      state: result.state,
      log: result.log,
      extra:
        spentYen === 0
          ? []
          : [
              {
                day: run.day,
                scope,
                category: 'materials' as const,
                label,
                yen: -materialsCostYen,
              },
            ],
    }
  })
}

/** Walks every zone up to `target` through the body pipeline, one stage at a
 * time. The body line is never hired here, so `weld` is unreachable and a
 * rotten panel simply stalls - which is exactly what the residual reports. */
function runBodyPipeline(
  run: Run,
  scope: CashScope,
  carInstanceId: string,
  target: ConditionBand,
): void {
  const { context } = run
  const capability = {
    unlocked: run.state.toolTiers.body >= 2,
    fullCapability: run.state.toolTiers.body >= 3,
  }
  const polishFloor = capability.fullCapability ? 0 : 1
  // Bounded: every zone has at most a handful of real steps, and a pass that
  // changes nothing ends the sweep.
  for (let pass = 0; pass < 40; pass++) {
    let didSomething = false
    for (const zoneId of ALL_ZONE_IDS) {
      const car = carOf(run.state, carInstanceId)
      if (!car.zoneState) return
      const zone = car.zoneState[zoneId]
      const next = nextZoneStage(zone, zoneId, target, polishFloor)
      if (!next) continue

      if (next.kind === 'paint') {
        const plan = planPaintStage(zone, zoneId, 'Factory White', capability)
        if (!plan.ok) continue
        run.ensureLabour(scope, plan.laborUnits * 5)
        confirmOnePipelineAction(
          run,
          scope,
          carInstanceId,
          { kind: 'pipeline-paint', zoneId, colour: 'Factory White' },
          plan.materialsCostYen,
          `Body pipeline paint on ${zoneId}`,
        )
      } else {
        const plan = planPipelineStage(next.stage, zone, capability)
        if (!plan.ok) continue
        run.ensureLabour(scope, plan.laborUnits * 5)
        confirmOnePipelineAction(
          run,
          scope,
          carInstanceId,
          { kind: 'pipeline-stage', stage: next.stage, zoneId },
          plan.materialsCostYen,
          `Body pipeline ${next.stage} on ${zoneId}`,
        )
      }
      const after = carOf(run.state, carInstanceId).zoneState![zoneId]
      if (JSON.stringify(after) !== JSON.stringify(zone)) didSomething = true
    }
    if (!didSomething) return
    void context
  }
}

/** Books a bench recondition of one loose part, taking the charge from
 * `reconditionQuote` (the resolver charges cash without logging it). */
function reconditionLoosePart(
  run: Run,
  scope: CashScope,
  partInstanceId: string,
  target: ConditionBand,
  label: string,
): void {
  const quote = reconditionQuote(run.state, partInstanceId, target, run.context)
  if (!quote) return
  run.ensureLabour(scope, quote.laborSlotsRequired)
  const costYen = quote.costYen
  run.step(scope, () => {
    const result = resolveReconditionLabor(
      run.state,
      partInstanceId,
      target,
      run.labourLeft,
      run.context,
    )
    const spentYen = run.state.cashYen - result.state.cashYen
    return {
      state: result.state,
      log: result.log,
      extra:
        spentYen === 0
          ? []
          : [{ day: run.day, scope, category: 'repair' as const, label, yen: -costYen }],
    }
  })
}

/** Fits one loose `PartInstance` into its slot through the player's own
 * instant path. A signature slot needs its group's machine line for the
 * install (a hire that expires at End Day), so it is taken out here, as late
 * as possible and only when the fit actually needs it. */
function installLoosePart(
  run: Run,
  scope: CashScope,
  carInstanceId: string,
  carPartId: CarPartId,
  partInstanceId: string,
  hires: CarRunReport['machineHires'],
): boolean {
  const { context } = run
  const componentId = context.partsTaxonomyById[carPartId]?.group
  const loose = run.state.partInventory.find((p) => p.id === partInstanceId)
  if (!componentId || !loose) return false
  const slots = refitLaborSlotsFor(carOf(run.state, carInstanceId), carPartId, loose, context)
  // The labour check runs BEFORE the hire: an End Day between the two would
  // expire the line and strand the job, which is exactly the trap this
  // ordering exists to avoid.
  run.ensureLabour(scope, slots)
  const signatureGroup = signatureGroupFor(carPartId, context)
  if (signatureGroup) hireLine(run, scope, signatureGroup, hires)
  run.step(scope, () => {
    const result = resolveJobLabor(
      run.state,
      {
        carInstanceId,
        kind: 'install-part',
        componentId,
        partInstanceId,
        carPartId,
        laborSlotsRequired: slots,
      },
      run.labourLeft,
      context,
    )
    return { state: result.state, log: result.log }
  })
  return carOf(run.state, carInstanceId).parts[carPartId].installed?.id === partInstanceId
}

/** Pulls one slot's part into the bin. */
function removeSlot(run: Run, scope: CashScope, carInstanceId: string, carPartId: CarPartId): void {
  const { context } = run
  run.ensureLabour(scope, context.economy.energy.actionPoints.removePart)
  run.step(scope, () => {
    const result = resolveRemovePart(run.state, carInstanceId, carPartId, context, run.labourLeft)
    return { state: result.state, log: result.log }
  })
}

/** The bench cycle for one bolt-on slot: pull it, recondition it to `target`,
 * put it back. Every leg is a real resolver; a refusal simply stops the cycle
 * and the part shows up in the residual. */
function benchCyclePart(
  run: Run,
  scope: CashScope,
  carInstanceId: string,
  carPartId: CarPartId,
  target: ConditionBand,
  hires: CarRunReport['machineHires'],
): void {
  const installed = carOf(run.state, carInstanceId).parts[carPartId].installed
  if (!installed) return
  const partInstanceId = installed.id

  removeSlot(run, scope, carInstanceId, carPartId)
  if (!run.state.partInventory.some((p) => p.id === partInstanceId)) return

  reconditionLoosePart(
    run,
    scope,
    partInstanceId,
    target,
    `Bench recondition: ${carPartId} to ${target}`,
  )
  installLoosePart(run, scope, carInstanceId, carPartId, partInstanceId, hires)
}

/** Buys the class's own stock SKU for `carPartId` and fits it in place of
 * whatever is there - the only route open for a replace-only consumable
 * (tyres, brake pads, clutch), which no amount of bench time can repair.
 * Standard delivery, so there is no express surcharge and the part lands the
 * next morning. */
function replaceWithStockPart(
  run: Run,
  scope: CashScope,
  carInstanceId: string,
  carPartId: CarPartId,
  hires: CarRunReport['machineHires'],
): void {
  const { context } = run
  const model = context.modelsById[carOf(run.state, carInstanceId).modelId]!
  const stock = context.stockPartByCarPartId[fitmentClassForTier(model.tier)][carPartId]
  if (!stock) return
  const before = new Set(run.state.partInventory.map((p) => p.id))
  run.step(scope, () => {
    const result = resolveBuyPart(run.state, stock.id, context, 'standard')
    return { state: result.state, log: result.log }
  })
  run.endDay(scope) // a standard order lands the next morning, surcharge-free
  const fresh = run.state.partInventory.find((p) => !before.has(p.id) && p.partId === stock.id)
  if (!fresh) return
  if (carOf(run.state, carInstanceId).parts[carPartId].installed) {
    removeSlot(run, scope, carInstanceId, carPartId)
  }
  if (carOf(run.state, carInstanceId).parts[carPartId].installed) return
  installLoosePart(run, scope, carInstanceId, carPartId, fresh.id, hires)
}

/** Whether a `PartInstance`'s catalogue entry is the plain OEM stock SKU -
 * the one case where replacing a replace-only consumable is free of any
 * premium loss. */
function isStockPart(partId: string, context: SimContext): boolean {
  return context.partsById[partId]?.grade === 'stock'
}

/** The slots that sit behind the rims and can only be worked with the wheel
 * assembly off the car - both of them foundation parts, so a `poor` pair caps
 * the whole aftermarket premium at 0.45 whatever else the car has. */
const BEHIND_THE_RIMS: readonly CarPartId[] = ['brakePadsDiscs', 'brakeCalipersLines']

/**
 * The wheel-off window: pull the wheel assembly, do everything the rims were
 * blocking (brake pads, calipers), recondition the rims and fit a fresh stock
 * set of tyres, then put it all back. Tyres and brake pads are replace-only,
 * so a purchase is the only route for either.
 */
function wheelOffWindow(
  run: Run,
  scope: CashScope,
  carInstanceId: string,
  target: ConditionBand,
  hires: CarRunReport['machineHires'],
): void {
  const { context } = run
  const belowTarget = (slot: CarPartId): boolean => {
    const band = carOf(run.state, carInstanceId).parts[slot].installed?.band
    return band !== undefined && bandIndex(band) < bandIndex(target)
  }
  const needsWork = (['rims', 'tyres', ...BEHIND_THE_RIMS] as CarPartId[]).some(belowTarget)
  if (!needsWork) return

  run.ensureLabour(scope, 2 * context.economy.energy.actionPoints.removePart)
  run.step(scope, () => {
    const result = resolveRemoveAssembly(
      run.state,
      carInstanceId,
      'wheelAssembly',
      context,
      run.labourLeft,
    )
    return { state: result.state, log: result.log }
  })
  const container = assemblyContainerFor(run.state, carInstanceId, 'wheelAssembly')
  if (!container) return
  const containerId = container.id

  // Everything the rims were in front of, while they are off.
  for (const slot of BEHIND_THE_RIMS) {
    if (!belowTarget(slot)) continue
    const entry = context.partsTaxonomyById[slot]!
    const installed = carOf(run.state, carInstanceId).parts[slot].installed!
    if (canRepair(installed.band, entry)) {
      benchCyclePart(run, scope, carInstanceId, slot, target, hires)
    } else if (isStockPart(installed.partId, context)) {
      replaceWithStockPart(run, scope, carInstanceId, slot, hires)
    }
    // An AFTERMARKET consumable is deliberately left alone: swapping it for a
    // stock one clears its share of the restoration bill but destroys the
    // whole `installedPartsValueYen` premium it was carrying, and the premium
    // is worth more than the bill.
  }

  const rims = container.members.rims
  if (rims) {
    reconditionLoosePart(run, scope, rims.id, target, `Bench recondition: rims to ${target}`)
  }

  const tyres = container.members.tyres
  if (tyres && bandIndex(tyres.band) < bandIndex(target) && isStockPart(tyres.partId, context)) {
    const model = context.modelsById[carOf(run.state, carInstanceId).modelId]!
    const stockTyre = context.stockPartByCarPartId[fitmentClassForTier(model.tier)].tyres
    if (stockTyre) {
      const before = new Set(run.state.partInventory.map((p) => p.id))
      run.step(scope, () => {
        const result = resolveBuyPart(run.state, stockTyre.id, context, 'standard')
        return { state: result.state, log: result.log }
      })
      run.endDay(scope) // a standard order lands the next morning, surcharge-free
      const fresh = run.state.partInventory.find(
        (p) => !before.has(p.id) && p.partId === stockTyre.id,
      )
      if (fresh) {
        // Mounting a tyre is the one bench op with a machine gate of its own.
        hireLine(run, scope, 'wheels', hires)
        const freshId = fresh.id
        run.step(scope, () => {
          const result = resolveSwapAssemblyMember(
            run.state,
            containerId,
            'tyres',
            freshId,
            context,
            run.labourLeft,
          )
          return { state: result.state, log: result.log }
        })
      }
    }
  }

  run.ensureLabour(scope, 2 * context.economy.energy.energyByClass['bolt-on'])
  run.step(scope, () => {
    const result = resolveRefitAssembly(run.state, containerId, context, run.labourLeft)
    return { state: result.state, log: result.log }
  })
}

/** A group-level repair-zone job through the player's own instant path. Only
 * surface slots are on-car candidates, so this reaches `chassis` and `aero`,
 * and `seats`/`dashGauges` only with the interior line hired. */
function repairGroup(
  run: Run,
  scope: CashScope,
  carInstanceId: string,
  componentId: ComponentId,
  target: ConditionBand,
): void {
  const { context } = run
  const plan = planGroupRepair(
    carOf(run.state, carInstanceId),
    componentId,
    target,
    run.state.toolTiers,
    context.partIdsByGroup,
    context.partsById,
    context.partsTaxonomyById,
    context.economy.restoration.repairStepFraction,
    context.economy.energy.energyPerBandStepByToolTier,
    undefined,
    { staff: run.state.staff, economy: context.economy },
  )
  if (plan.partIds.length === 0) return
  run.ensureLabour(scope, plan.laborSlotsRequired)
  run.step(scope, () => {
    const result = resolveJobLabor(
      run.state,
      {
        carInstanceId,
        kind: 'repair-zone',
        componentId,
        targetBand: target,
        laborSlotsRequired: plan.laborSlotsRequired,
      },
      run.labourLeft,
      context,
    )
    return { state: result.state, log: result.log }
  })
}

/** Buys the whole build in one visit to the parts market, then fits it slot by
 * slot. Buying first is the real play: a standard order lands the next
 * morning, so one End Day covers the entire order rather than one per part. */
function fitBuild(
  run: Run,
  scope: CashScope,
  carInstanceId: string,
  build: readonly [CarPartId, Grade][],
  deliverySpeed: 'standard' | 'express',
  hires: CarRunReport['machineHires'],
): FittedPart[] {
  const { context } = run
  const model = context.modelsById[carOf(run.state, carInstanceId).modelId]!
  const fitmentClass = fitmentClassForTier(model.tier)
  const ordered: { carPartId: CarPartId; grade: Grade; partId: string }[] = []
  const before = new Set(run.state.partInventory.map((p) => p.id))

  for (const [carPartId, grade] of build) {
    const part = context.aftermarketPartByCarPartId[fitmentClass]?.[carPartId]?.[grade]
    if (!part) continue
    // Never pay to downgrade a slot: a car can arrive already carrying a
    // higher-grade part than the build calls for (generation fits up to
    // `maxAftermarketSlots`), and fitting a cheaper one over it would spend
    // money to lose value.
    const sitting = carOf(run.state, carInstanceId).parts[carPartId].installed
    const sittingGrade = sitting ? context.partsById[sitting.partId]?.grade : undefined
    if (sittingGrade && gradeAtLeast(sittingGrade, grade)) continue
    run.step(scope, () => {
      const result = resolveBuyPart(run.state, part.id, context, deliverySpeed)
      return { state: result.state, log: result.log }
    })
    ordered.push({ carPartId, grade, partId: part.id })
  }
  if (deliverySpeed === 'standard') run.endDay(scope)

  const fitted: FittedPart[] = []
  for (const order of ordered) {
    const fresh = run.state.partInventory.find(
      (p) => !before.has(p.id) && p.partId === order.partId,
    )
    if (!fresh) continue
    if (carOf(run.state, carInstanceId).parts[order.carPartId].installed) {
      removeSlot(run, scope, carInstanceId, order.carPartId)
    }
    if (carOf(run.state, carInstanceId).parts[order.carPartId].installed) continue
    if (!installLoosePart(run, scope, carInstanceId, order.carPartId, fresh.id, hires)) continue
    const catalogPart = context.partsById[order.partId]!
    const paidYen = fresh.pricePaidYen ?? catalogPart.priceYen
    fitted.push({
      carPartId: order.carPartId,
      partId: order.partId,
      displayName: `${catalogPart.brand} ${catalogPart.name}`,
      grade: order.grade,
      listPriceYen: catalogPart.priceYen,
      paidYen,
      expressSurchargeYen: paidYen - catalogPart.priceYen,
    })
  }
  return fitted
}

/** Whatever is still below the expected band once every route this run can
 * reach has been used, with the reason it stayed there. */
function residualOf(
  car: CarInstance,
  target: ConditionBand,
  context: SimContext,
): CarRunReport['residual'] {
  const rows: CarRunReport['residual'] = []
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = car.parts[partId].installed
    if (!installed) continue
    if (bandIndex(installed.band) >= bandIndex(target)) continue
    const entry = context.partsTaxonomyById[partId]!
    const inAssembly = context.assemblies.find((a) => a.members.includes(partId))
    let reason: string
    if (car.zoneState && isBodyDerivedPart(partId)) {
      reason = 'body pipeline capped: metal is labour-only and welding needs the body line'
    } else if (!canRepair(installed.band, entry)) {
      reason =
        installed.band === 'scrap'
          ? 'scrap: replace-only'
          : isStockPart(installed.partId, context)
            ? 'replace-only consumable'
            : 'replace-only aftermarket part, kept: its premium is worth more than its share of the bill'
    } else if (inAssembly) {
      reason = `assembly-gated (${inAssembly.id}): worked only through the ${inAssembly.group} line`
    } else if (entry.depthClass === 'surface' && signatureGroupFor(partId, context)) {
      reason = `signature slot: needs the ${entry.group} line hired`
    } else {
      reason = 'not reached by this run'
    }
    rows.push({ carPartId: partId, band: installed.band, reason })
  }
  return rows
}

/** The Stage F quality fraction of one offer, recovered as the price the sim
 * drew over the channel price it drew against. */
function qualityFractionOf(
  car: CarInstance,
  model: CarModel,
  buyer: Buyer | undefined,
  heatPercent: number,
  channelId: SellingChannelId,
  priceYen: number,
  context: SimContext,
): number {
  const tasteCeiling = context.economy.sellingChannels[channelId].tasteCeiling
  if (!buyer || tasteCeiling === undefined) return Number.NaN
  const value = valuateCarForBuyerViaChannel(
    buyer,
    model,
    car,
    context.partsById,
    context.partsTaxonomy,
    context.partsTaxonomyById,
    heatPercent,
    context.economy,
    tasteCeiling,
  )
  return value > 0 ? priceYen / value : Number.NaN
}

/** Prices one car, for one buyer, through every listing channel the economy
 * ships. Pure reads: `channelBuyerTaste` and `valuateCarForBuyerViaChannel`
 * carry no RNG, so this is what the channel WOULD price against before its
 * own quality draw. */
function channelQuotesFor(
  car: CarInstance,
  model: CarModel,
  buyer: Buyer | undefined,
  heatPercent: number,
  context: SimContext,
): ChannelQuote[] {
  const quotes: ChannelQuote[] = []
  for (const [channelId, channel] of Object.entries(context.economy.sellingChannels) as [
    SellingChannelId,
    (typeof context.economy.sellingChannels)[SellingChannelId],
  ][]) {
    const tasteCeiling = channel.tasteCeiling ?? null
    const buyerTaste =
      buyer && tasteCeiling !== null
        ? channelBuyerTaste(
            buyer,
            model,
            car,
            context.partsById,
            context.partsTaxonomy,
            context.economy,
            tasteCeiling,
          )
        : Number.NaN
    const channelPriceYen =
      buyer && tasteCeiling !== null
        ? valuateCarForBuyerViaChannel(
            buyer,
            model,
            car,
            context.partsById,
            context.partsTaxonomy,
            context.partsTaxonomyById,
            heatPercent,
            context.economy,
            tasteCeiling,
          )
        : marketValueYen(
            model,
            car,
            heatPercent,
            context.partsById,
            context.partsTaxonomyById,
            context.economy,
          )
    quotes.push({
      channelId,
      feeYen: channel.feeYen,
      tasteCeiling,
      matchedOnly: channel.matchedOnly === true,
      requiresForecourt: channel.requiresForecourt,
      buyerTaste,
      channelPriceYen,
    })
  }
  return quotes
}

/**
 * The staleness side branch: from the listing snapshot, walk `days` End Days
 * without taking anything, and record every offer the draw produced. Runs on
 * a forked `GameState`, so nothing here touches the career the report
 * reconciles.
 */
function walkForOffers(
  snapshot: GameState,
  carInstanceId: string,
  model: CarModel,
  channelId: SellingChannelId,
  days: number,
  context: SimContext,
): StalenessWalk {
  let state = snapshot
  const offers: OfferObservation[] = []
  let rentOverWalkYen = 0
  for (let i = 0; i < days; i++) {
    const offersSeenAtDraw =
      state.carsForSale.find((f) => f.carInstanceId === carInstanceId)?.offersSeen ?? 0
    const result = advanceDay(state, emptyDayActions(), state.seed + state.day, context)
    state = result.state
    for (const entry of result.log) {
      if (entry.type === 'rent-paid') rentOverWalkYen -= entry.amountYen
    }
    const offer = state.pendingOffers.find((o) => o.carInstanceId === carInstanceId)
    if (!offer) continue
    const car = state.ownedCars.find((c) => c.id === carInstanceId)
    if (!car) break
    offers.push({
      day: state.day,
      offersSeenAtDraw,
      buyerId: offer.buyerId,
      priceYen: offer.priceYen,
      qualityFraction: qualityFractionOf(
        car,
        model,
        context.buyers.find((b) => b.id === offer.buyerId),
        state.marketHeat[model.id] ?? 100,
        channelId,
        offer.priceYen,
        context,
      ),
    })
  }
  const first = offers[0]
  let best = offers[0]
  for (const offer of offers) if (best && offer.priceYen > best.priceYen) best = offer
  return {
    days,
    offers,
    firstOfferYen: first?.priceYen ?? 0,
    bestOfferYen: best?.priceYen ?? 0,
    bestOfferDay: best?.day ?? 0,
    holdingGainYen: (best?.priceYen ?? 0) - (first?.priceYen ?? 0),
    rentOverWalkYen,
  }
}

/** One car, cradle to grave. */
function runOneCar(run: Run, script: CarScript, currentYear: number): CarRunReport {
  const { context } = run
  const model = context.modelsById[script.modelId]!
  const scope = script.scope
  const hires: CarRunReport['machineHires'] = []
  const labourAtStart = run.laborByScope[scope]

  // --- Acquisition -------------------------------------------------------
  const lot = buildScriptedLot(script, context, run.day, currentYear)
  run.state = { ...run.state, activeAuctionLots: [...run.state.activeAuctionLots, lot] }
  const anchorYen = anchorValueYen(lot, run.state, context)
  const reserve = reserveYen(lot, run.state, context)
  const buyout = computeBuyoutPriceYen(lot, run.state, context)
  const attendanceFeeYen = context.economy.auctionRoom.attendanceFeeYenByTier[script.auctionTier]

  run.step(scope, () => {
    const result = resolveAttendAuction(run.state, script.auctionTier, context)
    return {
      state: result.state,
      log: result.log,
      extra:
        attendanceFeeYen === 0
          ? []
          : [
              {
                day: run.day,
                scope,
                category: 'attendance' as const,
                label: `Auction attendance (${script.auctionTier})`,
                yen: -attendanceFeeYen,
              },
            ],
    }
  })

  const acquisitionDay = run.day
  run.step(scope, () => {
    const result = settleAuctionHammer(run.state, lot.id, reserve, context)
    return { state: result.state, log: result.log }
  })
  const carInstanceId = lot.car.id
  const asBought = carOf(run.state, carInstanceId)
  const rungs: ValueRung[] = [readRung('As bought', asBought, model, run.state, context)]
  const inheritedAftermarket = ALL_CAR_PART_IDS.flatMap((partId) => {
    const installed = asBought.parts[partId].installed
    const catalogPart = installed ? context.partsById[installed.partId] : undefined
    if (!installed || !catalogPart || catalogPart.grade === 'stock') return []
    return [
      {
        carPartId: partId,
        displayName: `${catalogPart.brand} ${catalogPart.name}`,
        grade: catalogPart.grade,
        band: installed.band,
      },
    ]
  })

  // --- Work --------------------------------------------------------------
  run.state = moveCar(run.state, carInstanceId, 'service', context.economy, run.labourLeft).state
  const target = sensibleRepairTargetBand(model, context.economy)

  runBodyPipeline(run, scope, carInstanceId, target)
  wheelOffWindow(run, scope, carInstanceId, target, hires)

  // Every remaining bolt-on repairable slot below the band, through the bench.
  // Assembly members are excluded (they are worked through their assembly,
  // never individually), as is anything still behind a blocker.
  for (const partId of ALL_CAR_PART_IDS) {
    const entry = context.partsTaxonomyById[partId]!
    if (entry.depthClass !== 'bolt-on') continue
    if (context.assemblies.some((a) => a.members.includes(partId))) continue
    const installed = carOf(run.state, carInstanceId).parts[partId].installed
    if (!installed || bandIndex(installed.band) >= bandIndex(target)) continue
    if (!canRepair(installed.band, entry)) continue
    if (entry.blockedBy.some((b) => carOf(run.state, carInstanceId).parts[b].installed !== null)) {
      continue
    }
    benchCyclePart(run, scope, carInstanceId, partId, target, hires)
  }

  for (const componentId of WORK_GROUPS) {
    repairGroup(run, scope, carInstanceId, componentId, target)
  }

  const repaired = carOf(run.state, carInstanceId)
  rungs.push(readRung('Repaired', repaired, model, run.state, context))
  const residual = residualOf(repaired, target, context)
  const residualBillYen = carCostToBandYen(
    repaired,
    model,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
    target,
  )

  // --- Modification ------------------------------------------------------
  const fittedParts = fitBuild(
    run,
    scope,
    carInstanceId,
    script.build,
    script.buildDeliverySpeed,
    hires,
  )
  rungs.push(readRung('Modified', carOf(run.state, carInstanceId), model, run.state, context))

  // --- Sale --------------------------------------------------------------
  const listingFeeYen = context.economy.sellingChannels[script.listingChannelId].feeYen
  run.step(scope, () => {
    const result = resolveSetForSale(
      run.state,
      carInstanceId,
      true,
      context,
      script.listingChannelId,
    )
    return {
      state: result.state,
      log: result.log,
      extra:
        listingFeeYen === 0
          ? []
          : [
              {
                day: run.day,
                scope,
                category: 'listing' as const,
                label: `Listing fee (${script.listingChannelId})`,
                yen: -listingFeeYen,
              },
            ],
    }
  })

  const listingSnapshot = run.state
  const stalenessWalk =
    script.stalenessWalkDays > 0
      ? walkForOffers(
          listingSnapshot,
          carInstanceId,
          model,
          script.listingChannelId,
          script.stalenessWalkDays,
          context,
        )
      : null

  let soldOnDay = 0
  let soldToBuyerId = ''
  let soldForYen = 0
  let soldBuyerTaste = Number.NaN
  let soldQualityFraction = Number.NaN
  let channelQuotes: ChannelQuote[] = []
  let ledgerAtSale = carLedgerFor(run.state, carInstanceId)

  for (let dayIndex = 0; dayIndex < 90; dayIndex++) {
    run.endDay(scope)
    const offer = run.state.pendingOffers.find((o) => o.carInstanceId === carInstanceId)
    if (!offer) continue
    const buyer = context.buyers.find((b) => b.id === offer.buyerId)
    const listedCar = carOf(run.state, carInstanceId)
    const heatPercent = run.state.marketHeat[model.id] ?? 100
    const tasteCeiling = context.economy.sellingChannels[script.listingChannelId].tasteCeiling
    soldBuyerTaste =
      buyer && tasteCeiling !== undefined
        ? channelBuyerTaste(
            buyer,
            model,
            listedCar,
            context.partsById,
            context.partsTaxonomy,
            context.economy,
            tasteCeiling,
          )
        : Number.NaN
    soldQualityFraction = qualityFractionOf(
      listedCar,
      model,
      buyer,
      heatPercent,
      script.listingChannelId,
      offer.priceYen,
      context,
    )
    channelQuotes = channelQuotesFor(listedCar, model, buyer, heatPercent, context)
    ledgerAtSale = carLedgerFor(run.state, carInstanceId)
    soldOnDay = run.day
    soldToBuyerId = offer.buyerId
    soldForYen = offer.priceYen
    run.step(scope, () => {
      const result = resolveSellViaWalkIn(run.state, carInstanceId, context)
      return { state: result.state, log: result.log }
    })
    break
  }
  if (soldOnDay === 0) {
    throw new Error(`worked example: ${script.modelId} drew no offer within 90 days of listing`)
  }

  return {
    scope,
    modelId: model.id,
    displayName: model.displayName,
    tier: model.tier,
    culture: script.culture,
    whyChosen: script.whyChosen,
    carInstanceId,
    year: asBought.year,
    mileageKm: asBought.mileageKm,
    generationSeed: script.generationSeed,
    acquisition: {
      tier: script.auctionTier,
      lotId: lot.id,
      anchorYen,
      reserveYen: reserve,
      buyoutYen: buyout,
      attendanceFeeYen,
      paidYen: reserve,
    },
    expectedBand: expectationForCar(model, context.economy).band,
    repairTargetBand: target,
    rungs,
    inheritedAftermarket,
    fittedParts,
    machineHires: hires,
    laborSlotsSpent: run.laborByScope[scope] - labourAtStart,
    daysHeld: soldOnDay - acquisitionDay,
    listingChannelId: script.listingChannelId,
    listingFeeYen,
    soldOnDay,
    soldToBuyerId,
    soldForYen,
    soldBuyerTaste,
    soldQualityFraction,
    channelQuotes,
    ledgerPurchaseYen: ledgerAtSale.purchaseYen ?? 0,
    ledgerRepairYen: ledgerAtSale.repairYen,
    ledgerPartsYen: ledgerAtSale.partsYen,
    netYen:
      soldForYen -
      ((ledgerAtSale.purchaseYen ?? 0) + ledgerAtSale.repairYen + ledgerAtSale.partsYen),
    residual,
    residualBillYen,
    stalenessWalk,
  }
}

export interface WorkedExampleOptions {
  /** The career seed - `createInitialGameState`'s only input, and the base
   * every day's `advanceDay` stream derives from (`seed + day`). */
  careerSeed?: number
}

/** A day-1 career with the rolled opening catalogue and job board cleared: the
 * two scripted lots are the only lots, and no service job can be accepted by
 * accident. Cash, bays, tools and reputation are exactly what
 * `createInitialGameState` produced. */
function createScriptedCareer(context: SimContext, careerSeed: number): GameState {
  const base = createInitialGameState(context, careerSeed)
  return { ...base, activeAuctionLots: [], serviceJobOffers: [] }
}

function weeklyRentForStartingBays(context: SimContext): number {
  return computeWeeklyRentYen(
    {
      service: context.facilities.service.startCount,
      parking: context.facilities.parking.startCount,
      forecourt: context.facilities.forecourt.startCount,
    },
    context.economy,
  )
}

/**
 * Runs the whole scripted example and returns every figure it produced.
 * Deterministic: the only inputs are `context` and the seeds.
 */
export function runWorkedExample(
  context: SimContext,
  options: WorkedExampleOptions = {},
): WorkedExampleReport {
  const careerSeed = options.careerSeed ?? 1995
  const initial = createScriptedCareer(context, careerSeed)
  const run = new Run(initial, context)
  const currentYear = 1995

  const carA = runOneCar(run, CAR_SCRIPTS[0]!, currentYear)
  const carB = runOneCar(run, CAR_SCRIPTS[1]!, currentYear)

  const excludedIncome = run.lines.filter(
    (line) =>
      line.label.startsWith('Service job payout') ||
      line.label.startsWith('Contract staff retainer') ||
      line.label.startsWith('Story mission payout'),
  )

  return {
    careerSeed,
    startingCashYen: initial.cashYen,
    finalCashYen: run.state.cashYen,
    weeklyRentYen: weeklyRentForStartingBays(context),
    cashLines: run.lines,
    carA,
    carB,
    excludedIncome,
  }
}
