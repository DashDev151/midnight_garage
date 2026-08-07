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
  expectationForCar,
  foundationWithheldYen,
  isOnScrapFloor,
  isSellingChannelUnlocked,
  marketValueYen,
  mileageFactor,
  mileageRangeForAge,
  normalizedTasteScore,
  restorationValueLinesFor,
  roomClearingRangeFor,
  roomConfigFrom,
  roomReserveYen,
  saleOutcomeFor,
  valuateCarForBuyer,
  valueLedgerFor,
  type ChannelArrivalOdds,
  type RestorationValueBreakdown,
  type RoomClearingRange,
  type SaleOutcome,
  type SimContext,
  type TurnoutKey,
  type ValueLedgerLine,
} from '@midnight-garage/sim'
import { describeLogEntry } from '../../utils/dayLogFormat'

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
      unlocked: isSellingChannelUnlocked(state, context, channelId),
      burnsTicksForNothing: matchedOnly && odds.arrivalChance > 0 && odds.offerChance === 0,
    }
  })
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
  return {
    roomReadYen,
    reserveYen: roomReserveYen(roomReadYen, config),
    buyoutYen: buyoutPriceYen(roomReadYen, context.economy),
    turnouts,
  }
}

/** One kind of spend the bench has made, with what the sim called it. */
export interface BenchSpendLine {
  type: DayLogEntry['type']
  /** The sim's own words for the last entry of this kind. */
  label: string
  bucket: CashBucket
  yen: number
  count: number
}

/**
 * The cost side.
 *
 * `attributed` is the sim's own per-car attribution, straight off
 * `carLedgerFor` - purchase, repair, parts fitted, listing fees.
 *
 * `unattributed` is every other yen that left the till, grouped by kind and
 * classified by `cashMovementFor` alone. Two kinds land here. Machine-shop
 * hire, which design law keeps off a car's ledger (one day's crane hire pulls
 * four engines, so charging it to one car would be a fiction) and which the
 * bench therefore shows as its own line rather than pretending it is free or
 * pretending it belongs to the car. And parts bought, which are stock the
 * moment they are paid for and only reach the car's ledger if and when they
 * are fitted - so a part bought and never fitted appears here and nowhere
 * else.
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
  const byType = new Map<DayLogEntry['type'], BenchSpendLine>()
  for (const entry of entries) {
    const movement = cashMovementFor(entry)
    if (!movement || movement.bucket === 'income' || movement.bucket === 'onCars') continue
    const existing = byType.get(entry.type)
    byType.set(entry.type, {
      type: entry.type,
      label: describeLogEntry(entry, resolveModelName),
      bucket: movement.bucket,
      yen: (existing?.yen ?? 0) + movement.amountYen,
      count: (existing?.count ?? 0) + 1,
    })
  }
  const unattributed = [...byType.values()]
  return {
    attributed: carLedgerFor(state, carInstanceId),
    unattributed,
    unattributedTotalYen: unattributed.reduce((sum, line) => sum + line.yen, 0),
  }
}
