import type {
  CarInstance,
  CarModel,
  CarPartId,
  CarPartTaxonomyEntry,
  EconomyConfig,
  GameState,
  Part,
} from '@midnight-garage/content'
import { carCostToBandYen, carCostToMintYen } from './bands'
import type { SimContext } from './context'
import { coherenceFactorForCar } from './derivedStats'
import { apparentViewOf, sheetGuideValueYen } from './diagnosis'
import {
  cleanValueYen,
  expectationForCar,
  foundationFactor,
  installedPartsValueYen,
  retentionFor,
} from './marketValue'

/**
 * The value ledger: every price the game shows decomposes into these ordered,
 * additive line items, summing exactly to the engine's own total. The ids are
 * a stable contract with the game layer, which supplies its own display copy
 * per id and never computes a yen figure of its own.
 */
export type ValueLedgerLineId =
  'book' | 'mileage' | 'heat' | 'wear' | 'polish' | 'floor' | 'coherence' | 'aftermarket' | 'fear'

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
 * `carCostToBandYen`/`carCostToMintYen`, `expectationForCar`,
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
 * is not 100), 'wear' (the below-expectation restoration bill at
 * `marketRepairDiscount`, negative), 'polish' (the above-expectation bill at
 * the tier's `beyondDiscount`, negative), 'floor' (only when the scrap-value
 * backstop binds, the adjustment up to it), 'coherence' (Stage C's discount
 * for an unsupported build's own failure risk, only when it bites - zero on a
 * stock or fully-coherent build), 'aftermarket' (the
 * foundation-and-tier-gated premium, retention-scaled by the same build's
 * coherence, only when non-zero).
 */
export function valueLedgerFor(
  car: CarInstance,
  model: CarModel,
  heatPercent: number,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): ValueLedger {
  const { marketRepairDiscount } = economy.valuation
  const expectation = expectationForCar(model, economy)

  const bookYen = model.bookValueYen
  // 'mileage' is the heat-neutral checkpoint (`cleanValueYen` at heatPercent
  // 100), so the 'heat' line below can telescope from it to the real,
  // heat-adjusted clean value.
  const mileageAdjusted = cleanValueYen(bookYen, car.mileageKm, 100, economy)
  const cleanValue = cleanValueYen(bookYen, car.mileageKm, heatPercent, economy)
  const billToMintYen = carCostToMintYen(car, model, partsById, partsTaxonomyById, economy)
  const billBelowYen = carCostToBandYen(
    car,
    model,
    partsById,
    partsTaxonomyById,
    economy,
    expectation.band,
  )
  const billAboveYen = billToMintYen - billBelowYen
  const afterWear = cleanValue - marketRepairDiscount * billBelowYen
  const raw = afterWear - expectation.beyondDiscount * billAboveYen
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

  const retention = retentionFor(coherenceFactor, economy)
  const creditedPremiumYen = Math.round(
    foundationFactor(car, economy) *
      expectation.aftermarketReturn *
      installedPartsValueYen(car, partsById, retention, economy),
  )
  if (creditedPremiumYen !== 0) lines.push({ id: 'aftermarket', yen: creditedPremiumYen })

  return { lines, totalYen: previousRounded + creditedPremiumYen }
}

/**
 * The room's ledger: the APPARENT view's value ledger plus one 'fear' line
 * (negative, the cause-weighted symptom discount), summing exactly to
 * `carGuideValueYen`'s read of the same car. For an honest car the apparent
 * view IS the car and no fear line is added, so this degenerates to
 * `valueLedgerFor`. The fear line carries the exact (possibly fractional)
 * discount the sheet itself applies, so the sum stays equal to the sheet
 * value rather than a rounded neighbour of it.
 */
export function roomLedgerFor(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
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
  const fearYen = sheetGuideValueYen(car, model, state, context) - apparentLedger.totalYen
  return {
    lines: [...apparentLedger.lines, { id: 'fear', yen: fearYen }],
    totalYen: apparentLedger.totalYen + fearYen,
  }
}
