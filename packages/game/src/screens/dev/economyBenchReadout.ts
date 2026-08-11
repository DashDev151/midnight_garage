import {
  cashMovementFor,
  type Buyer,
  type BuyerArchetype,
  type CarInstance,
  type CarLedger,
  type CarModel,
  type CashBucket,
  type ConditionBand,
  type DayLogEntry,
  type EconomyConfig,
  type GameState,
  type ReputationTier,
  type SceneStandingStage,
  type SellingChannelId,
  type StatKey,
} from '@midnight-garage/content'
import {
  buyoutPriceYen,
  carCostToMintYen,
  carGuideValueYen,
  carLedgerFor,
  championStatFor,
  channelArrivalOddsFor,
  channelBuyerTaste,
  channelPriceBandRangeFor,
  coherenceFactorForCar,
  expectationForCar,
  foundationWithheldYen,
  isOnScrapFloor,
  isSellingChannelUnlocked,
  isTasteMatched,
  marketValueYen,
  mileageFactor,
  mileageRangeForAge,
  normalizedTasteScore,
  qualityMeanFor,
  restorationValueLinesFor,
  roomClearingRangeFor,
  roomConfigFrom,
  roomReserveYen,
  saleOutcomeFor,
  supportVerdict,
  valuateCarForBuyer,
  valuateCarForBuyerViaChannel,
  valueLedgerFor,
  type ChannelArrivalOdds,
  type ChannelPriceBandRange,
  type RestorationValueBreakdown,
  type RoomClearingRange,
  type SaleOutcome,
  type SimContext,
  type SupportVerdict,
  type TurnoutKey,
  type ValueLedgerLine,
} from '@midnight-garage/sim'
import { describeLogEntry } from '../../utils/dayLogFormat'
import { evaluateCarInstance, type CarEvaluation } from './sandboxModel'

/**
 * THE ECONOMY BENCH'S READOUT.
 *
 * Every figure below is the return value of a named sim function. This module
 * selects, groups and labels; it never derives a yen. The one thing it sums is
 * a list of cash movements the sim has already classified
 * (`cashMovementFor`), which is bookkeeping over sim's own answers rather than
 * a second opinion about any of them.
 */

/** This model's own market heat right now - neutral (100) for a model the
 * ledger has never moved. */
export function heatPercentFor(state: GameState, model: CarModel): number {
  return state.marketHeat[model.id] ?? 100
}

/** What mileage on its own is doing to this car's price. */
export interface BenchMileageNote {
  /** `mileageFactor` at this mileage. At 1.0 mileage is taking nothing away;
   * below it, that is the share of book value the mileage has cost. */
  factor: number
  /** `economy.json`'s own breakpoints, rendered rather than restated, so the
   * note cannot disagree with the curve it describes. */
  curve: readonly (readonly [number, number])[]
  /** The highest breakpoint still sitting at exactly 1.0: the top of the flat
   * band, and the mileage the curve starts discounting above. Null if the
   * curve never touches 1.0. */
  discountFromKm: number | null
  /** The youngest a generated lot is ever allowed to be. */
  minAgeYears: number
  /** The mileage range generation rolls for a lot of exactly that age - the
   * lowest-mileage lot the board can ever carry. */
  youngestLotRangeKm: readonly [number, number]
  /** True when even the top of that range sits inside the flat band, so every
   * freshly generated lot of that age prices at full book whatever mileage it
   * rolls. */
  youngestLotUndiscounted: boolean
}

export function mileageNoteFor(mileageKm: number, economy: EconomyConfig): BenchMileageNote {
  const curve = economy.valuation.mileageFactorCurve
  const flatBand = curve.filter(([, factor]) => factor === 1)
  const discountFromKm = flatBand[flatBand.length - 1]?.[0] ?? null
  const youngestLotRangeKm = mileageRangeForAge(economy.AUCTION_MIN_AGE_YEARS, economy)
  return {
    factor: mileageFactor(mileageKm, economy),
    curve,
    discountFromKm,
    minAgeYears: economy.AUCTION_MIN_AGE_YEARS,
    youngestLotRangeKm,
    youngestLotUndiscounted: discountFromKm !== null && youngestLotRangeKm[1] <= discountFromKm,
  }
}

/** What the whole car is worth right now: the one figure every delta on the
 * running log is measured against. */
export function benchValueYen(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): number {
  return marketValueYen(
    model,
    car,
    heatPercentFor(state, model),
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
}

/** The opening decomposition of the car as it stands. */
export interface BenchOpeningBlock {
  /** `marketValueYen`, which the ledger lines sum to. */
  totalYen: number
  /** `valueLedgerFor`'s own ordered lines. */
  ledgerLines: readonly ValueLedgerLine[]
  /**
   * The restoration bill's effect on the price, slot by slot and zone by zone
   * - exact, because the bill is a literal sum over slots and both discounts
   * above it scale every line identically.
   */
  restoration: RestorationValueBreakdown
  /** The whole bill to mint, which the restoration lines' `billYen` sum to. */
  billToMintYen: number
  /** The band the market expects of this tier: below it a repair yen returns
   * more than itself, above it only `beyondDiscount` on the yen. */
  expectationBand: ConditionBand
  /**
   * The aftermarket premium, ONE line and never split per slot: it is a
   * minimum over five foundation slots with a per-slot scrap gate, so a
   * per-slot counterfactual can be wrong by the entire term.
   */
  aftermarketPremiumYen: number
  /** What a failing foundation is holding back - exact by construction, and
   * exactly what fixing the foundations returns. */
  foundationWithheldYen: number
  /**
   * True when the bill has driven the price onto the scrap-value backstop. On
   * such a car every counterfactual is fictional: repairing a slot moves the
   * bill without moving the price, so the per-slot value column describes
   * arithmetic the car is no longer priced by.
   */
  onScrapFloor: boolean
}

export function openingBlockFor(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): BenchOpeningBlock {
  const { partsById, partsTaxonomyById, economy } = context
  const heatPercent = heatPercentFor(state, model)
  const ledger = valueLedgerFor(car, model, heatPercent, partsById, partsTaxonomyById, economy)
  const restoration = restorationValueLinesFor(car, model, partsById, partsTaxonomyById, economy)
  return {
    totalYen: ledger.totalYen,
    ledgerLines: ledger.lines,
    restoration,
    billToMintYen: carCostToMintYen(car, model, partsById, partsTaxonomyById, economy),
    expectationBand: expectationForCar(model, economy).band,
    aftermarketPremiumYen: ledger.lines.find((line) => line.id === 'aftermarket')?.yen ?? 0,
    foundationWithheldYen: foundationWithheldYen(model, car, partsById, economy),
    onScrapFloor: isOnScrapFloor(model, car, heatPercent, partsById, partsTaxonomyById, economy),
  }
}

/**
 * What the car IS, as against what it is worth: the five stats, the lap times,
 * and the two figures that decide whether a build hangs together.
 *
 * The stats, the power score and the laps are the performance sandbox's own
 * evaluator (`evaluateCarInstance`), so the two dev screens read one set of
 * functions and cannot disagree about a car they both hold.
 */
export interface BenchStatsPanel {
  /** `computeDerivedStats`, `normalizedPowerScore`, `lapTimeSecondsFor` per
   * course and `lapBlockers`, all off the same instance. */
  evaluation: CarEvaluation
  /** The headline support ratio, its band, and the subsystem that set it -
   * the worst of the five, which is what the whole verdict reads. */
  support: SupportVerdict
  /**
   * `coherenceFactorForCar`: how much of the car's value and of its fitted
   * parts' retention survives the build's own incoherence. 1 is a build whose
   * support is at or above adequate, which is the baseline rather than a bonus.
   */
  coherenceFactor: number
}

export function statsPanelFor(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
): BenchStatsPanel {
  const { partsById, economy } = context
  return {
    evaluation: evaluateCarInstance(model, car, context),
    support: supportVerdict(car, model, partsById, economy),
    coherenceFactor: coherenceFactorForCar(car, model, partsById, economy),
  }
}

/** One buyer archetype's whole verdict on this car. */
export interface BenchBuyerRow {
  buyerId: string
  displayName: string
  archetype: BuyerArchetype
  /** `normalizedTasteScore` - already zero when the champion gate fails. */
  tasteScore: number
  /** The stat this buyer is known for. */
  championStat: StatKey
  /**
   * Whether that stat cleared its target. `saleOutcomeFor` returns `nothing`
   * exactly when it has not, so this is sim's own answer to the gate rather
   * than a second reading of it.
   */
  championGatePassed: boolean
  outcome: SaleOutcome
  /** What this buyer would pay, at THEIR OWN coherence tolerance.
   * `valueLedgerFor` cannot answer this: it takes no tolerance. */
  priceYen: number
}

export function buyerRowsFor(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): BenchBuyerRow[] {
  const { partsById, partsTaxonomy, partsTaxonomyById, economy } = context
  const heatPercent = heatPercentFor(state, model)
  return context.buyers.map((buyer: Buyer) => {
    const outcome = saleOutcomeFor(buyer, model, car, partsById, partsTaxonomy, economy)
    return {
      buyerId: buyer.id,
      displayName: buyer.displayName,
      archetype: buyer.archetype,
      tasteScore: normalizedTasteScore(buyer, model, car, partsById, partsTaxonomy, economy),
      championStat: championStatFor(buyer),
      championGatePassed: outcome !== 'nothing',
      outcome,
      priceYen: valuateCarForBuyer(
        buyer,
        model,
        car,
        partsById,
        partsTaxonomy,
        partsTaxonomyById,
        heatPercent,
        economy,
      ),
    }
  })
}

/** One listing channel's odds for this car, for ONE day. */
export interface BenchChannelRow {
  channelId: SellingChannelId
  odds: ChannelArrivalOdds
  /** Whether the channel refuses to price a visitor whose taste does not
   * match the car. */
  matchedOnly: boolean
  /**
   * Whether the channel draws once on its own day rather than rolling a
   * cadence every day. Its arrival chance is 1 on that day while the draw is
   * still owed and 0 on every other day, so a zero here is a calendar fact
   * about today and not a statement that the channel never comes.
   */
  oneDraw: boolean
  /** Whether any mission has opened this channel yet. */
  unlocked: boolean
  /**
   * THE TRAP: a `matchedOnly` channel that can bring somebody but nobody it
   * brings can ever pay. The visit still clears the roll, so it still burns an
   * `offersSeen` tick and still ages the listing, while no offer can ever
   * arrive. A zero offer chance hides this; the flag says it out loud.
   */
  burnsTicksForNothing: boolean
}

export function channelRowsFor(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): BenchChannelRow[] {
  const channels = context.economy.sellingChannels
  return (Object.keys(channels) as SellingChannelId[]).map((channelId) => {
    const odds = channelArrivalOddsFor(car, model, channelId, state, context)
    const matchedOnly = channels[channelId].matchedOnly === true
    return {
      channelId,
      odds,
      matchedOnly,
      oneDraw: channels[channelId].oneDrawNextEndDay === true,
      unlocked: isSellingChannelUnlocked(state, context, channelId),
      burnsTicksForNothing: matchedOnly && odds.arrivalChance > 0 && odds.offerChance === 0,
    }
  })
}

/** What one buyer would actually be offered through one channel. */
export interface BenchChannelPriceRow {
  buyerId: string
  displayName: string
  /**
   * `channelBuyerTaste`: the taste multiplier this channel realises for this
   * buyer, priced through the channel's own ceiling AND this shop's standing
   * with that buyer's scene. The one figure the six standing dials move.
   */
  channelTaste: number
  /** `valuateCarForBuyerViaChannel` - what an offer through this channel is
   * priced off, before the listing's own quality draw. */
  channelPriceYen: number
  /** `valuateCarForBuyer`: the same buyer at the STANDARD taste band, which is
   * what the buyer table shows. Beside the channel price, the difference is
   * what the channel and the standing are worth. */
  standardPriceYen: number
  /** Whether this car genuinely meets the buyer's want (`isTasteMatched`).
   * Only a `matchedOnly` channel gates on it. */
  tasteMatched: boolean
  /** Whether this channel would price them at all: false on a `matchedOnly`
   * channel this buyer does not match, where the visit leaves nothing. */
  wouldBePriced: boolean
  /** This buyer's share of the channel's draw, or null when the channel's pool
   * does not reach them for this league of car at all. */
  shareOfDraw: number | null
}

/** One channel's realised prices, buyer by buyer. */
export interface BenchChannelPricePanel {
  channelId: SellingChannelId
  /** The channel's own taste ceiling. Null on a channel that prices off a
   * band instead of through taste. */
  tasteCeiling: number | null
  matchedOnly: boolean
  rows: BenchChannelPriceRow[]
  /** The listing's own staleness clock, which the quality mean reads. */
  offersSeen: number
  /**
   * `qualityMeanFor` at that clock: the mean fraction of the channel price a
   * real offer actually pays. The prices above are before this is applied, so
   * a live offer averages this much of one.
   */
  qualityMeanFraction: number
}

export function channelPricePanelFor(
  car: CarInstance,
  model: CarModel,
  channelId: SellingChannelId,
  state: GameState,
  context: SimContext,
): BenchChannelPricePanel {
  const { partsById, partsTaxonomy, partsTaxonomyById, economy } = context
  const channel = economy.sellingChannels[channelId]
  const heatPercent = heatPercentFor(state, model)
  const odds = channelArrivalOddsFor(car, model, channelId, state, context)
  const matchedOnly = channel.matchedOnly === true
  const tasteCeiling = channel.tasteCeiling ?? null

  const rows =
    tasteCeiling === null
      ? []
      : context.buyers.map((buyer: Buyer) => {
          const tasteMatched = isTasteMatched(buyer, model, car, partsById, partsTaxonomy, economy)
          return {
            buyerId: buyer.id,
            displayName: buyer.displayName,
            channelTaste: channelBuyerTaste(
              buyer,
              model,
              car,
              partsById,
              partsTaxonomy,
              economy,
              tasteCeiling,
              state.sceneStanding,
            ),
            channelPriceYen: valuateCarForBuyerViaChannel(
              buyer,
              model,
              car,
              partsById,
              partsTaxonomy,
              partsTaxonomyById,
              heatPercent,
              economy,
              tasteCeiling,
              state.sceneStanding,
            ),
            standardPriceYen: valuateCarForBuyer(
              buyer,
              model,
              car,
              partsById,
              partsTaxonomy,
              partsTaxonomyById,
              heatPercent,
              economy,
            ),
            tasteMatched,
            wouldBePriced: !matchedOnly || tasteMatched,
            shareOfDraw: odds.buyers.find((row) => row.buyerId === buyer.id)?.shareOfDraw ?? null,
          }
        })

  return {
    channelId,
    tasteCeiling,
    matchedOnly,
    rows,
    offersSeen: listingOffersSeenFor(state, car.id),
    qualityMeanFraction: qualityMeanFor(listingOffersSeenFor(state, car.id), economy),
  }
}

/**
 * Every channel that prices off a flat band rather than through a buyer's
 * taste. Such a channel has no buyer pool at all, so it appears in no per-buyer
 * table and its price is invisible without its own line.
 */
export function bandPricedChannelsFor(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): ChannelPriceBandRange[] {
  const heatPercent = heatPercentFor(state, model)
  const channelIds = Object.keys(context.economy.sellingChannels) as SellingChannelId[]
  return channelIds
    .map((channelId) => channelPriceBandRangeFor(car, model, channelId, heatPercent, context))
    .filter((range): range is ChannelPriceBandRange => range !== null)
}

/** Today's live offer on the bench car, drawn by the real daily draw. */
export interface BenchPendingOffer {
  buyerId: string
  /** The buyer's own name, or the id a no-persona channel attributes to. */
  displayName: string
  priceYen: number
}

export function pendingOfferFor(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
): BenchPendingOffer | null {
  const offer = state.pendingOffers.find((entry) => entry.carInstanceId === carInstanceId)
  if (!offer) return null
  return {
    buyerId: offer.buyerId,
    displayName: context.buyers.find((b) => b.id === offer.buyerId)?.displayName ?? offer.buyerId,
    priceYen: offer.priceYen,
  }
}

/** One scene whose standing the sale moved. */
export interface BenchSceneChange {
  archetype: BuyerArchetype
  before: SceneStandingStage
  after: SceneStandingStage
}

/**
 * What a completed sale did, measured across the two states the resolver ran
 * between.
 *
 * Every yen and every point here is either the sim's own figure from the
 * `car-sold` entry it wrote, or a field read off the two states. Nothing is
 * recomputed: in particular `profitYen` is the resolver's OWN realised profit,
 * which it takes against `carLedgerFor`, and `ledger` is that same ledger read
 * on the pre-sale state so the components behind the figure are visible.
 */
export interface BenchSaleSummary {
  priceYen: number
  /** Null when the car's purchase price was never recorded, which is what the
   * sim does rather than fabricate a profit. */
  profitYen: number | null
  /** The pre-sale ledger the sim measured that profit against. */
  ledger: CarLedger
  /** The buyer's verdict, or null when nobody was pleased or disappointed. */
  saleQuality: 'satisfied' | 'delighted' | null
  /** Whether the car genuinely met the buyer's want, which is what credits a
   * scene rather than reputation. */
  matchedSale: boolean
  reputationDelta: number
  reputationPointsBefore: number
  reputationPointsAfter: number
  reputationTierBefore: ReputationTier
  reputationTierAfter: ReputationTier
  /** This model's heat either side of the sale. A sale does not move heat on
   * the day: it bumps the sales counter below, and the weekly market update is
   * what reads that counter. */
  heatPercentBefore: number
  heatPercentAfter: number
  /** `marketLedger.playerSales` for this model, the counter a sale does move. */
  playerSalesBefore: number
  playerSalesAfter: number
  sceneChanges: BenchSceneChange[]
}

export function saleSummaryFrom(
  before: GameState,
  after: GameState,
  entries: readonly DayLogEntry[],
  model: CarModel,
  carInstanceId: string,
): BenchSaleSummary | null {
  const sold = entries.find(
    (entry) => entry.type === 'car-sold' && entry.carInstanceId === carInstanceId,
  )
  if (!sold || sold.type !== 'car-sold') return null

  const sceneChanges: BenchSceneChange[] = []
  for (const archetype of Object.keys(after.sceneStanding) as BuyerArchetype[]) {
    const was = before.sceneStanding[archetype]
    const now = after.sceneStanding[archetype]
    if (was !== now) sceneChanges.push({ archetype, before: was, after: now })
  }

  return {
    priceYen: sold.priceYen,
    profitYen: sold.profitYen ?? null,
    ledger: carLedgerFor(before, carInstanceId),
    saleQuality: sold.saleQuality ?? null,
    matchedSale: sold.matchedSale === true,
    reputationDelta: sold.reputationDelta ?? 0,
    reputationPointsBefore: before.reputationPoints,
    reputationPointsAfter: after.reputationPoints,
    reputationTierBefore: before.reputationTier,
    reputationTierAfter: after.reputationTier,
    heatPercentBefore: heatPercentFor(before, model),
    heatPercentAfter: heatPercentFor(after, model),
    playerSalesBefore: before.marketLedger.playerSales[model.id] ?? 0,
    playerSalesAfter: after.marketLedger.playerSales[model.id] ?? 0,
    sceneChanges,
  }
}

/**
 * How stale the listing every channel row is read at already is: the
 * `offersSeen` on this car's own for-sale entry, and zero for a car that is not
 * listed. `channelArrivalOddsFor` defaults to exactly this figure, so it is the
 * staleness term behind every arrival chance on the screen.
 */
export function listingOffersSeenFor(state: GameState, carInstanceId: string): number {
  return state.carsForSale.find((entry) => entry.carInstanceId === carInstanceId)?.offersSeen ?? 0
}

/** What one turnout band would pay for this car. */
export interface BenchTurnoutRow {
  turnout: TurnoutKey
  dealers: number
  range: RoomClearingRange
}

/** What acquiring this car costs, from either side of the room. */
export interface BenchAcquisitionPanel {
  /** The room's own read of the car (`carGuideValueYen`): the apparent,
   * fear-priced view when it carries a symptom, its plain market value when it
   * does not. */
  roomReadYen: number
  /** The seller's floor, where the board opens. */
  reserveYen: number
  /** The desk's instant price. */
  buyoutYen: number
  /**
   * Whether the desk charges more than the room's own read of the car. A
   * comparison of two sim answers rather than a reading of the premium behind
   * them, so the note beside the two figures cannot claim a premium the
   * shipped tuning does not charge.
   */
  buyoutAboveRoomRead: boolean
  turnouts: BenchTurnoutRow[]
}

export function acquisitionPanelFor(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): BenchAcquisitionPanel {
  const config = roomConfigFrom(context.economy)
  const roomReadYen = carGuideValueYen(car, model, state, context)
  const turnouts = (Object.keys(config.turnout) as TurnoutKey[]).map((turnout) => ({
    turnout,
    dealers: config.turnout[turnout].dealers,
    range: roomClearingRangeFor(roomReadYen, turnout, config),
  }))
  const buyoutYen = buyoutPriceYen(roomReadYen, context.economy)
  return {
    roomReadYen,
    reserveYen: roomReserveYen(roomReadYen, config),
    buyoutYen,
    buyoutAboveRoomRead: buyoutYen > roomReadYen,
    turnouts,
  }
}

/**
 * One movement of cash the bench has made, with the sim's own words for it.
 *
 * One line per movement rather than one per kind: the label is the sim's
 * sentence about a single entry and carries that entry's own yen inside it, so
 * a line standing for several movements would print one figure in its words and
 * a different one beside them.
 */
export interface BenchSpendLine {
  type: DayLogEntry['type']
  /** The sim's own words for this movement. */
  label: string
  bucket: CashBucket
  yen: number
}

/**
 * The cost side.
 *
 * `attributed` is the sim's own per-car attribution, straight off
 * `carLedgerFor` - purchase, repair, parts fitted, listing fees.
 *
 * `unattributed` is every other yen that left the till, one line per movement,
 * classified by `cashMovementFor` alone. Two kinds land here. Machine-shop
 * hire, which design law keeps off a car's ledger (one day's crane hire pulls
 * four engines, so charging it to one car would be a fiction) and which the
 * bench therefore shows as its own line rather than pretending it is free or
 * pretending it belongs to the car. And parts bought, which are stock the
 * moment they are paid for.
 *
 * The two halves are not disjoint and must not be added together. A part is
 * charged to the till when it is bought and stays on that line for good;
 * fitting it later ADDS its price to the car's own `partsYen` without removing
 * anything here, so the same yen is present in both, answering two different
 * questions about it.
 *
 * Rent and wages never appear: the bench never ends a day, and a fixed
 * overhead is never charged against a single play's profitability.
 */
export interface BenchCostSheet {
  attributed: CarLedger
  unattributed: BenchSpendLine[]
  unattributedTotalYen: number
}

export function costSheetFor(
  state: GameState,
  carInstanceId: string,
  entries: readonly DayLogEntry[],
  resolveModelName: (modelId: string) => string,
): BenchCostSheet {
  const unattributed: BenchSpendLine[] = []
  for (const entry of entries) {
    const movement = cashMovementFor(entry)
    if (!movement || movement.bucket === 'income' || movement.bucket === 'onCars') continue
    unattributed.push({
      type: entry.type,
      label: describeLogEntry(entry, resolveModelName),
      bucket: movement.bucket,
      yen: movement.amountYen,
    })
  }
  return {
    attributed: carLedgerFor(state, carInstanceId),
    unattributed,
    unattributedTotalYen: unattributed.reduce((sum, line) => sum + line.yen, 0),
  }
}
