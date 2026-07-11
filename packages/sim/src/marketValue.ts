import {
  ALL_CAR_PART_IDS,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type EconomyConfig,
  type Part,
} from '@midnight-garage/content'
import { bandFactor, carCostToMintYen, isPartPresent } from './bands'

/**
 * Sprint 27 - the taste-free "what is this car worth" answer, shared by
 * every price in the game: `marketValueYen` = `instanceValue +
 * installedPartsValueYen`, where `instanceValue` is clean value (book value
 * scaled by market heat) minus a hassle-weighted restoration bill, floored.
 * Replaces the Sprint 26 cost-weighted band-factor shim entirely.
 */

/**
 * The restoration-bill deduction (decision 1):
 * `max(floor, cleanValue - hassleFactor * restorationBill)`, where
 * `cleanValue = bookValueYen * (heatPercent / 100)` (heat applies exactly
 * once - the Sprint 21 heat-once law - nowhere else in the game multiplies
 * by market heat a second time) and `restorationBill` is
 * `carCostToMintYen` (bands.ts): the sum of every present part's real cost
 * to bring to mint - an unfitted forced-induction slot contributes zero (an
 * NA car isn't "missing" a turbo), and a scrap part prices at its
 * `stockReplacementPriceYen` (bands.ts decision 5), since scrap has no
 * repair path to draw a step cost from. `hassleFactor` (above 1.0) means a
 * buyer discounts MORE than the raw bill - real buyers price in the hassle
 * of getting work done, not just the parts-and-labor total. `floor =
 * floorFraction * cleanValue` - a wreck whose bill would drive it below
 * zero still has scrap-level worth, never literally nothing.
 */
function instanceBaseValueYen(
  model: CarModel,
  car: CarInstance,
  heatPercent: number,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const { hassleFactor, floorFraction } = economy.valuation
  const cleanValue = model.bookValueYen * (heatPercent / 100)
  const restorationBill = carCostToMintYen(car, partsTaxonomyById)
  const floor = floorFraction * cleanValue
  return Math.max(floor, cleanValue - hassleFactor * restorationBill)
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
 * The single shared value answer (Sprint 27 decision 1): `round(instanceValue)
 * + installedPartsValueYen`, where `instanceValue` is `instanceBaseValueYen`
 * above - clean value minus the hassle-weighted restoration bill, floored.
 * Heat applies exactly once, inside clean value (decision 6, unchanged from
 * Sprint 21) - no other price in the game multiplies by market heat a second
 * time. Every other price (the auction anchor, walk-in offers, listing
 * asking price, buyer taste, bot walk-away targets) is this value times a
 * bounded multiplier, never a competing formula.
 */
export function marketValueYen(
  model: CarModel,
  car: CarInstance,
  heatPercent: number,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const baseValue = Math.round(
    instanceBaseValueYen(model, car, heatPercent, partsTaxonomyById, economy),
  )
  return baseValue + installedPartsValueYen(car, partsById, economy)
}
