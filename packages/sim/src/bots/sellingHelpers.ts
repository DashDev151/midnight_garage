import type { CarInstance, GameState } from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { currentGameYear } from '../calendar'
import type { SimContext } from '../context'
import { bestFitBuyer } from '../selling'
import { valuateCarForBuyer } from '../valuation'

export interface SellDecisionOptions {
  /** Accept today's offer once it clears this fraction of the car's own
   * best-fit valuation (Sprint 31 decision 4's "accept-threshold") - the
   * direct replacement for every bot's old `ACCEPTABLE_WALKIN_FRACTION`
   * comparison, now checked against a real, materialized offer instead of a
   * pre-sale estimate. */
  acceptFraction: number
  /** Accept ANY live offer, price aside, once the car has been up for sale
   * this many days or more - the holding-cost-pressure half of decision 4.
   * Rent and parking scarcity (already-real mechanics this sprint's own
   * reuse analysis leans on) make waiting forever a genuinely bad idea, not
   * just a patience question, so a purely price-gated bot would otherwise
   * sit on a car forever if the market never rolls a generous offer. */
  maxHoldingDays: number
}

/**
 * One car's full sell decision for one bot day (Sprint 31 decision 4):
 * ensure it's marked for sale, then accept today's live offer (if any) once
 * it clears `acceptFraction` of the car's best-fit valuation OR the car has
 * been sitting for-sale `maxHoldingDays` or more. Replaces every bot's old
 * "sellViaWalkIn vs listForSale" channel choice with one shared
 * accept-threshold policy - the archetypes differ only in which
 * `SellDecisionOptions` they pass in.
 */
export function decideSale(
  state: GameState,
  car: CarInstance,
  context: SimContext,
  actions: DayActions,
  options: SellDecisionOptions,
): void {
  const alreadyForSale = state.carsForSale.some((f) => f.carInstanceId === car.id)
  if (!alreadyForSale) {
    actions.setForSale.push({ carInstanceId: car.id, forSale: true })
  }

  const offer = state.pendingOffers.find((o) => o.carInstanceId === car.id)
  if (!offer) return

  const model = context.modelsById[car.modelId]
  if (!model) return
  const heatPercent = state.marketHeat[car.modelId] ?? 100
  const currentYear = currentGameYear(state.reputationTier)
  const buyer = bestFitBuyer(
    car,
    model,
    context.buyers,
    context.partsById,
    context.partsTaxonomy,
    context.partsTaxonomyById,
    heatPercent,
    currentYear,
    context.economy,
  )
  const trueValueYen = buyer
    ? valuateCarForBuyer(
        buyer,
        model,
        car,
        context.partsById,
        context.partsTaxonomy,
        context.partsTaxonomyById,
        heatPercent,
        currentYear,
        context.economy,
      )
    : 0

  const forSaleEntry = state.carsForSale.find((f) => f.carInstanceId === car.id)
  const holdingDays = forSaleEntry ? state.day - forSaleEntry.sinceDay : 0
  const clearsThreshold =
    trueValueYen > 0 && offer.priceYen >= trueValueYen * options.acceptFraction
  const pressured = holdingDays >= options.maxHoldingDays

  if (clearsThreshold || pressured) {
    actions.acceptOffers.push({ carInstanceId: car.id })
  }
}
