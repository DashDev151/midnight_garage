import {
  ALL_CAR_PART_IDS,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type EconomyConfig,
} from '@midnight-garage/content'
import { bandIndex, costWeightedBandFactor, isPartMissing } from './bands'

/**
 * The reputation effect of selling this car, shared by both sale
 * channels: a lemon costs reputation; a genuinely well-restored car earns
 * it. Lemon is checked first and takes explicit precedence. Plain selling
 * in between is reputation-neutral, regardless of price - normal flipping
 * isn't punished.
 *
 * - **Lemon**: any present part at `scrap` (unrepairable, universally
 *   uninstallable elsewhere - the game's honest "this needs real money
 *   before it's sellable" state), OR the car's cost-weighted band factor
 *   (`costWeightedBandFactor`, the same figure that feeds valuation) at or
 *   below the reputation config's `lemonMaxAverageBandFactor`.
 * - **Clean**: every present part at or above `cleanSaleMinBand` - a floor
 *   per part so seven great parts can't hide one neglected one, reachable
 *   by player effort alone.
 * - **Concours**: clean, AND every present part is `mint`, AND
 *   `authenticityPercent` clears its own bar - a genuine bonus for a
 *   well-matched find (that value is never player-modifiable), not the only
 *   door into the faucet.
 *
 * A MISSING part (`isPartMissing` - a real defect, distinct from the one
 * legitimately-empty `forcedInduction`-on-NA case) fails clean/concours
 * exactly like a scrap part does, and triggers lemon exactly like one too
 * - a stripped car can't quietly pass as a well-kept one just because a
 * slot happens to be empty instead of merely worn.
 */
export function saleReputationDeltaFor(
  car: CarInstance,
  model: CarModel,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const hasScrapOrMissingPart = ALL_CAR_PART_IDS.some((id) => {
    const installed = car.parts[id].installed
    return installed ? installed.band === 'scrap' : isPartMissing(car, model, id)
  })
  const weightedFactor = costWeightedBandFactor(car, model, partsTaxonomyById, economy)
  if (hasScrapOrMissingPart || weightedFactor <= economy.reputation.lemonMaxAverageBandFactor) {
    return -economy.reputation.lemonSalePenalty
  }

  const minCleanIndex = bandIndex(economy.reputation.cleanSaleMinBand)
  const isClean = ALL_CAR_PART_IDS.every((id) => {
    const installed = car.parts[id].installed
    return installed ? bandIndex(installed.band) >= minCleanIndex : !isPartMissing(car, model, id)
  })
  if (!isClean) return 0

  const isConcours =
    car.authenticityPercent >= economy.reputation.concoursSaleMinAuthenticityPercent &&
    ALL_CAR_PART_IDS.every((id) => {
      const installed = car.parts[id].installed
      return installed ? installed.band === 'mint' : !isPartMissing(car, model, id)
    })
  return isConcours ? economy.reputation.concoursSaleBonus : economy.reputation.cleanSaleBonus
}

export type SaleQuality = 'lemon' | 'clean' | 'concours'

/**
 * Derives which of `saleReputationDeltaFor`'s bonuses/penalty actually
 * fired from its numeric return value, for the day-report copy - the four
 * outcomes (-8/0/+2/+4 by default config) are mutually exclusive by
 * construction, so comparing against the same economy thresholds that
 * produced the delta identifies the tier without a second, parallel
 * computation.
 */
export function saleQualityFor(deltaPoints: number, economy: EconomyConfig): SaleQuality | null {
  if (deltaPoints <= -economy.reputation.lemonSalePenalty) return 'lemon'
  if (deltaPoints >= economy.reputation.concoursSaleBonus) return 'concours'
  if (deltaPoints >= economy.reputation.cleanSaleBonus) return 'clean'
  return null
}
