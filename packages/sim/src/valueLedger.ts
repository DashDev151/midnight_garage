import {
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type EconomyConfig,
  type GameState,
  type Part,
} from '@midnight-garage/content'
import { carCostToBandBreakdown } from './bands'
import type { ZoneBillLine } from './bodyPipeline'
import type { SimContext } from './context'
import { coherenceFactorForCar } from './derivedStats'
import { apparentViewOf, sheetGuideValueYen } from './diagnosis'
import {
  cleanValueYen,
  excellencePremiumYen,
  expectationForCar,
  foundationFactor,
  installedPartsValueYen,
  restorationBillSplitFor,
  retentionFor,
} from './marketValue'

/**
 * The value ledger: every price the game shows decomposes into these ordered,
 * additive line items, summing exactly to the engine's own total. The ids are
 * a stable contract with the game layer, which supplies its own display copy
 * per id and never computes a yen figure of its own.
 */
export type ValueLedgerLineId =
  | 'book'
  | 'mileage'
  | 'heat'
  | 'wear'
  | 'polish'
  | 'floor'
  | 'coherence'
  | 'excellence'
  | 'aftermarket'
  | 'fear'

export interface ValueLedgerLine {
  id: ValueLedgerLineId
  yen: number
}

export interface ValueLedger {
  lines: ValueLedgerLine[]
  totalYen: number
}

/**
 * Decomposes `marketValueYen` into its ledger lines, built from the same
 * atoms the value formula itself consumes (`cleanValueYen`,
 * `restorationBillSplitFor`, `expectationForCar`,
 * `coherenceFactorForCar`, `retentionFor`,
 * `installedPartsValueYen`, `foundationFactor`) - never a second value
 * computation. The base-term lines are rounded as telescoping differences of
 * the formula's own cumulative checkpoints, mirroring its expression order
 * exactly, so `totalYen` and the line sum both equal `marketValueYen` (at its
 * own default `coherenceTolerance` of 1.0 - the market's own view, matching
 * this function having no buyer to read a tolerance from) to the yen with no
 * tolerance anywhere (probed per roster model in `tests/valueLedger.test.ts`).
 *
 * Lines, in order: 'book' (book value), 'mileage' (the mileage-curve
 * adjustment), 'heat' (the market-heat adjustment, only when `heatPercent`
 * is not 100), 'wear' (the below-expectation restoration bill at this tier's
 * own `marketRepairDiscount`, negative), 'polish' (the above-expectation bill
 * at the tier's `beyondDiscount`, negative), 'floor' (only when the
 * scrap-value backstop binds, the adjustment up to it), 'coherence' (Stage
 * C's discount for an unsupported build's own failure risk, only when it
 * bites - zero on a stock or fully-coherent build), 'excellence'
 * (sprint213.md's state-gated premium for a fine-throughout, coherent, fresh
 * example, only when it applies), 'aftermarket' (the foundation-and-tier-gated
 * premium, retention-scaled by the same build's coherence, only when
 * non-zero).
 */
export function valueLedgerFor(
  car: CarInstance,
  model: CarModel,
  heatPercent: number,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): ValueLedger {
  const marketRepairDiscount =
    economy.valuation.marketRepairDiscount[fitmentClassForTier(model.tier)]!
  const expectation = expectationForCar(model, economy)

  const bookYen = model.bookValueYen
  // 'mileage' is the heat-neutral checkpoint (`cleanValueYen` at heatPercent
  // 100), so the 'heat' line below can telescope from it to the real,
  // heat-adjusted clean value.
  const mileageAdjusted = cleanValueYen(bookYen, car.mileageKm, 100, economy)
  const cleanValue = cleanValueYen(bookYen, car.mileageKm, heatPercent, economy)
  const bill = restorationBillSplitFor(car, model, partsById, partsTaxonomyById, economy)
  const afterWear = cleanValue - marketRepairDiscount * bill.belowYen
  const raw = afterWear - expectation.beyondDiscount * bill.aboveYen
  const base = Math.max(economy.bands.scrapValueFraction * cleanValue, raw)

  const lines: ValueLedgerLine[] = []
  let previousRounded = 0
  const pushCheckpoint = (id: ValueLedgerLineId, cumulativeYen: number): void => {
    const rounded = Math.round(cumulativeYen)
    lines.push({ id, yen: rounded - previousRounded })
    previousRounded = rounded
  }
  pushCheckpoint('book', bookYen)
  pushCheckpoint('mileage', mileageAdjusted)
  if (heatPercent !== 100) pushCheckpoint('heat', cleanValue)
  pushCheckpoint('wear', afterWear)
  pushCheckpoint('polish', raw)
  if (base > raw) pushCheckpoint('floor', base)

  // Stage C: the coherence discount, at the market's own default tolerance
  // (this function has no buyer to read one from - see the doc comment
  // above). `previousRounded` is exactly `marketValueYen`'s own `baseValue`
  // at this point, so this checkpoint reproduces its `stagedValue` exactly.
  const coherenceFactor = coherenceFactorForCar(car, model, partsById, economy)
  const coherenceDiscount = economy.valuation.coherenceDiscountWeight * (1 - coherenceFactor)
  if (coherenceDiscount > 0) {
    pushCheckpoint('coherence', previousRounded * (1 - coherenceDiscount))
  }

  // The same gated, coherence-and-freshness-scaled premium `marketValueYen`
  // adds - the below-expectation bill here is exactly its own gate figure,
  // computed the same way from the same car.
  const excellenceYen = excellencePremiumYen(
    model,
    cleanValue,
    bill.belowYen,
    coherenceFactor,
    car.mileageKm,
    economy,
  )
  if (excellenceYen > 0) pushCheckpoint('excellence', previousRounded + excellenceYen)

  const retention = retentionFor(coherenceFactor, economy)
  const creditedPremiumYen = Math.round(
    foundationFactor(car, economy) *
      expectation.aftermarketReturn *
      installedPartsValueYen(car, partsById, retention, economy),
  )
  if (creditedPremiumYen !== 0) lines.push({ id: 'aftermarket', yen: creditedPremiumYen })

  return { lines, totalYen: previousRounded + creditedPremiumYen }
}

/** One slot's own share of the ledger's 'wear' and 'polish' lines. */
export interface RestorationValueLine {
  partId: CarPartId
  /** What bringing this slot to mint costs in work - `carCostToBandBreakdown`
   * at `'mint'`, unscaled. */
  billYen: number
  /** What the work the market expects of this slot costs: the parts owed up to
   * the tier's expectation band, charged at `marketRepairDiscount`. */
  belowBandBillYen: number
  /** The parts owed between the expectation band and mint, charged at the
   * tier's own `beyondDiscount`. The two halves sum to `billYen` exactly. */
  aboveBandBillYen: number
  /** What this slot's condition costs the car's price, negative: the two halves
   * at their own discounts. */
  valueYen: number
  /** Where the money falls across the nine body zones - present only for the
   * two body value carriers on a car carrying `zoneState`. */
  zones?: ZoneBillLine[]
}

/** The restoration bill's effect on price, slot by slot. */
export interface RestorationValueBreakdown {
  lines: RestorationValueLine[]
  /** The lines' `valueYen` summed. Equal to the ledger's 'wear' plus 'polish'
   * lines up to the rounding those two telescoping checkpoints apply. */
  totalValueYen: number
  /** The lines' `billYen` summed, exactly `carCostToMintYen`. */
  totalBillYen: number
}

/**
 * `valueLedgerFor`'s 'wear' and 'polish' lines, unsummed: what each slot's own
 * condition costs the car's price.
 *
 * The decomposition is exact because the bill is a literal sum over slots
 * (`carCostToBandBreakdown`) and both discounts above it are band-independent,
 * so each half scales every line identically - the licence
 * `carCostToBandBreakdown`'s own contract grants. The split point is the tier's
 * expectation band (`expectationForCar`), the same one Stage B splits at, so a
 * slot's line and the whole-car figure can never disagree about which side of
 * the band a yen of work falls on. Both halves are parts, exactly as Stage B's
 * own split is: a car's value never counts a tool-hire day.
 *
 * Rounding is the only difference from the ledger: this rounds each line, while
 * the ledger rounds two telescoping cumulative checkpoints, so the sums agree
 * to within a yen or two rather than exactly. Nothing here is a second value
 * computation - every figure comes out of the same reads the ledger's own
 * totals come out of.
 */
export function restorationValueLinesFor(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): RestorationValueBreakdown {
  const marketRepairDiscount =
    economy.valuation.marketRepairDiscount[fitmentClassForTier(model.tier)]!
  const expectation = expectationForCar(model, economy)
  const toMint = carCostToBandBreakdown(car, model, partsById, partsTaxonomyById, economy, 'mint')
  const toBand = carCostToBandBreakdown(
    car,
    model,
    partsById,
    partsTaxonomyById,
    economy,
    expectation.band,
  )
  const belowByPartId = new Map(toBand.lines.map((line) => [line.partId, line.yen]))

  const lines = toMint.lines.map((line) => {
    const belowBandBillYen = belowByPartId.get(line.partId) ?? 0
    const aboveBandBillYen = line.yen - belowBandBillYen
    return {
      partId: line.partId,
      billYen: line.yen,
      belowBandBillYen,
      aboveBandBillYen,
      valueYen: -Math.round(
        marketRepairDiscount * belowBandBillYen + expectation.beyondDiscount * aboveBandBillYen,
      ),
      ...(line.zones ? { zones: line.zones } : {}),
    }
  })

  return {
    lines,
    totalValueYen: lines.reduce((sum, line) => sum + line.valueYen, 0),
    totalBillYen: toMint.totalYen,
  }
}

/**
 * The room's ledger: the APPARENT view's value ledger plus one 'fear' line
 * (negative, the cause-weighted symptom discount), summing exactly to
 * `carGuideValueYen`'s read of the same car. For an honest car the apparent
 * view IS the car and no fear line is added, so this degenerates to
 * `valueLedgerFor`. The fear line carries the exact (possibly fractional)
 * discount the sheet itself applies, so the sum stays equal to the sheet
 * value rather than a rounded neighbour of it.
 *
 * `feared` (default `true`) forwards straight to `sheetGuideValueYen`'s own
 * escape hatch, so a scripted lot's ledger names its fear line honestly too
 * (zero, or near it) rather than disagreeing with `anchorValueYen`'s own
 * exempted read of the same lot.
 */
export function roomLedgerFor(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
  feared: boolean = true,
): ValueLedger {
  const heatPercent = state.marketHeat[model.id] ?? 100
  const apparentLedger = valueLedgerFor(
    apparentViewOf(car),
    model,
    heatPercent,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  if (car.symptoms.length === 0) return apparentLedger
  const fearYen = sheetGuideValueYen(car, model, state, context, feared) - apparentLedger.totalYen
  return {
    lines: [...apparentLedger.lines, { id: 'fear', yen: fearYen }],
    totalYen: apparentLedger.totalYen + fearYen,
  }
}
