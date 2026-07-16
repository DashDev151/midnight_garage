import type { CarInstance, CarModel, CarPartId, GameState } from '@midnight-garage/content'
import type { SimContext } from './context'
import { marketValueYen } from './marketValue'

/**
 * Sprint 73 (diagnosis I, the fear-priced board - maintainer pricing law
 * 2026-07-15: "the room prices the symptom, the player prices the cause").
 * The room only ever shows a symptomatic car's APPARENT condition (the
 * pre-damage band recorded at generation, `CarInstance.apparentBandByPartId`)
 * - never the true, currently-installed band a damaged part actually holds.
 * `apparentViewOf` is the one place that builds "the car as the room sees
 * it"; every valuation on the auction side of a symptomatic lot goes through
 * a view built here, never the true `car` directly.
 */

/** A copy of `car` with every damaged part's band swapped back to its
 * recorded apparent (pre-damage) value - identical to `car` for an honest
 * car (`apparentBandByPartId === null`). Pure: never mutates `car`, and used
 * both for display (the lot card) and for sheet pricing below. */
export function apparentViewOf(car: CarInstance): CarInstance {
  if (!car.apparentBandByPartId) return car
  const parts = { ...car.parts }
  for (const [partId, band] of Object.entries(car.apparentBandByPartId)) {
    const installed = car.parts[partId as CarPartId].installed
    if (!installed || !band) continue
    parts[partId as CarPartId] = { installed: { ...installed, band } }
  }
  return { ...car, parts }
}

/**
 * The total expected DISCOUNT off the apparent value across every symptom
 * `car` carries, given `apparent` (`apparentViewOf(car)`) and its own
 * already-computed `apparentValue` - shared by `expectedTrueValueYen` and
 * `sheetGuideValueYen` below so a caller needing BOTH numbers (the hot path,
 * `carGuideValueYen`) never prices the apparent view or walks the cause list
 * twice. For each symptom, `marketValueYen` is computed once per cause (that
 * cause's damage applied to the apparent view) and weight-averaged - the
 * symptom's own expected discount. Symptoms combine by summing each one's
 * own discount in turn (array order, deterministic) - treating each
 * symptom's uncertainty as an independent deduction rather than enumerating
 * the full cross-product of every symptom's causes, which stays exact for
 * the shipped `maxSymptomsPerCar: 2` and any single-symptom car (the
 * overwhelming majority), and is a standard linear approximation for the
 * rare two-symptom case. Zero for an honest car (no symptoms) - the loop is
 * a no-op over an empty list.
 */
function symptomDiscountYen(
  car: CarInstance,
  model: CarModel,
  apparent: CarInstance,
  apparentValue: number,
  heatPercent: number,
  context: SimContext,
): number {
  let discount = 0
  for (const carSymptom of car.symptoms) {
    const symptom = context.symptomsById[carSymptom.symptomId]
    if (!symptom) continue
    const totalWeight = symptom.causes.reduce((sum, cause) => sum + cause.weight, 0)
    if (totalWeight <= 0) continue
    const weightedMean = symptom.causes.reduce((sum, cause) => {
      const installed = apparent.parts[cause.carPartId].installed
      if (!installed) return sum
      const damagedView: CarInstance = {
        ...apparent,
        parts: {
          ...apparent.parts,
          [cause.carPartId]: { installed: { ...installed, band: cause.setBand } },
        },
      }
      const causeValue = marketValueYen(
        model,
        damagedView,
        heatPercent,
        context.partsById,
        context.partsTaxonomyById,
        context.economy,
      )
      return sum + (cause.weight / totalWeight) * causeValue
    }, 0)
    discount += apparentValue - weightedMean
  }
  return discount
}

/**
 * The player's own private knowledge, priced as an expectation: what this
 * car is ACTUALLY worth on average, given every symptom's own weighted cause
 * table (`symptomDiscountYen` above), starting from the apparent view (the
 * room's own read). An honest car (no symptoms) returns exactly
 * `marketValueYen(car)` - `symptomDiscountYen` is 0 over an empty list.
 */
export function expectedTrueValueYen(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): number {
  const heatPercent = state.marketHeat[model.id] ?? 100
  const apparent = apparentViewOf(car)
  const apparentValue = marketValueYen(
    model,
    apparent,
    heatPercent,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  return (
    apparentValue - symptomDiscountYen(car, model, apparent, apparentValue, heatPercent, context)
  )
}

/**
 * The fear-priced room value (Sprint 73 decision 3) - the number the whole
 * auction room actually reads (`bidding.ts`'s `carGuideValueYen`): the
 * apparent value, discounted by `fearPremium` times the gap between the
 * apparent value and the honest expectation. `fearPremium > 1` (schema-
 * enforced) means the room ALWAYS prices a symptomatic car more harshly than
 * the pure expectation would - real risk aversion, not a fair-odds bet.
 * Degenerates to exactly the apparent value (= `marketValueYen(car)`) for an
 * honest car, since `symptomDiscountYen` is 0 then too. Computes the
 * apparent view/value and walks the cause list only ONCE (shares
 * `symptomDiscountYen` with `expectedTrueValueYen` rather than calling it),
 * since this is the seam every active auction lot reprices through on every
 * overnight step - `carGuideValueYen`'s own hot path.
 */
export function sheetGuideValueYen(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): number {
  const heatPercent = state.marketHeat[model.id] ?? 100
  const apparent = apparentViewOf(car)
  const apparentValue = marketValueYen(
    model,
    apparent,
    heatPercent,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  const discount = symptomDiscountYen(car, model, apparent, apparentValue, heatPercent, context)
  return apparentValue - context.economy.diagnosis.fearPremium * discount
}
