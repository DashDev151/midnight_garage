import {
  ALL_CAR_PART_IDS,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type EconomyConfig,
  type Part,
} from '@midnight-garage/content'
import { bandFactor, costWeightedBandFactor, isPartPresent } from './bands'

/**
 * Sprint 21 - the taste-free "what is this car worth" answer, shared by
 * every price in the game (`marketValueYen` = `bookValueYen x
 * conditionFactor x heat + installedPartsValueYen`).
 */

/**
 * Weighted condition run through a floor-to-ceiling curve (decision 2):
 * `floor + (ceiling - floor) x weighted^exponent`. Worked examples (first-
 * pass values: floor 0.35, ceiling 1.10, exponent 1.3):
 *   weighted 0.15 (every part scrap) -> ~0.42
 *   weighted 0.65 (every part worn)  -> ~0.78
 *   weighted 1.0  (every part mint)  -> 1.10 (a perfect restoration clears book value)
 *
 * Sprint 26 decision 4: `weighted` is now `costWeightedBandFactor` (bands.ts)
 * - a 0.15-1.0 mean of every present part's band factor, weighted by that
 * part's own share of the car's total `costToMint`. A scrap turbo (an
 * expensive part to bring back to mint) drags this further down than scrap
 * brakes on an otherwise-identical car - the maintainer's own worked case.
 * Replaces the old hand-authored `componentValueWeights` entirely. This is a
 * shim for this sprint only; Sprint 27 replaces the whole formula with the
 * full restoration-bill deduction model.
 */
export function conditionFactor(
  car: CarInstance,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const { conditionFloor, conditionCeiling, conditionExponent } = economy.valuation
  const weighted = costWeightedBandFactor(car, partsTaxonomyById, economy)
  const range = conditionCeiling - conditionFloor
  return conditionFloor + range * Math.pow(weighted, conditionExponent)
}

/**
 * Installed parts add real yen, additively rather than multiplicatively
 * (decision 3 - real markets: mods return cents on the yen, they don't
 * multiply the chassis price). Per installed part instance:
 * `part.priceYen x partsRetention x bandFactor(installed.band) x
 * (genuinePeriod ? genuinePeriodMultiplier : 1.0)`, summed and rounded.
 * Sprint 26: `bandFactor` replaces the old `conditionPercent / 100`.
 */
export function installedPartsValueYen(
  car: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): number {
  const { partsRetention, genuinePeriodMultiplier } = economy.valuation
  let total = 0
  for (const partId of ALL_CAR_PART_IDS) {
    if (!isPartPresent(car, partId)) continue
    const installed = car.parts[partId].installed
    if (!installed) continue
    const part = partsById[installed.partId]
    if (!part) continue
    const genuineMultiplier = installed.genuinePeriod ? genuinePeriodMultiplier : 1.0
    total +=
      part.priceYen * partsRetention * bandFactor(installed.band, economy) * genuineMultiplier
  }
  return Math.round(total)
}

/**
 * The single shared value answer (decision 1): `round(bookValueYen x
 * conditionFactor x (heatPercent/100)) + installedPartsValueYen`. Heat
 * applies exactly once, here (decision 6) - no other price in the game
 * multiplies by market heat a second time. Every other price (the auction
 * anchor, walk-in offers, listing asking price, buyer taste) is this value
 * times a bounded multiplier, never a competing formula.
 */
export function marketValueYen(
  model: CarModel,
  car: CarInstance,
  heatPercent: number,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const heatFraction = heatPercent / 100
  const baseValue = Math.round(
    model.bookValueYen * conditionFactor(car, partsTaxonomyById, economy) * heatFraction,
  )
  return baseValue + installedPartsValueYen(car, partsById, economy)
}
