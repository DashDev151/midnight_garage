import type {
  Buyer,
  CarInstance,
  CarModel,
  CarPartId,
  CarPartTaxonomyEntry,
  EconomyConfig,
  Part,
} from '@midnight-garage/content'
import { computeDerivedStats } from './derivedStats'
import { marketValueYen } from './marketValue'

const STAT_WEIGHT_KEYS = ['power', 'handling', 'style', 'reliability', 'authenticity'] as const

/**
 * Bounded taste multiplier: how well a buyer archetype's stat weights fit
 * this car's derived stats, `[1 - tasteSpread, 1 + tasteSpread]`
 * (economy.json's first-pass `tasteSpread` of 0.12 bounds it to [0.88, 1.12],
 * centered near 1.0 for an average car). Stats stop being the value pipeline
 * (`marketValueYen` is stat-blind), but they still decide who pays a bit more,
 * never whether the car is worth anything.
 */
function tasteMultiplier(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): number {
  const stats = computeDerivedStats(model, instance, partsById, partsTaxonomy, economy)
  const weights = buyer.statWeights
  const powerCeiling = economy.statFormulas.powerNormalizationCeiling

  const weightedScore =
    (stats.power / powerCeiling) * weights.power +
    (stats.handling / 100) * weights.handling +
    (stats.style / 100) * weights.style +
    (stats.reliability / 100) * weights.reliability +
    (stats.authenticity / 100) * weights.authenticity

  const sumOfWeights = STAT_WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0)
  const normalizedStatScore = sumOfWeights > 0 ? weightedScore / sumOfWeights : 0

  const spread = economy.valuation.tasteSpread
  return 1 - spread + 2 * spread * normalizedStatScore
}

/**
 * What a buyer archetype would pay for a car (GDD 6.3), shared by bidding
 * (as an AI competitor's true value) and selling (as an offer). Stays pure
 * and deterministic - no RNG, no side effects. Computed as `marketValue x
 * taste`, where `marketValueYen` (marketValue.ts) is the taste-free "what is
 * this car worth" answer shared by every price in the game (condition,
 * installed parts, market heat), and `tasteMultiplier` above is the only
 * place stat fit still matters, bounded so it can only nudge the price.
 */
export function valuateCarForBuyer(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  heatPercent: number,
  economy: EconomyConfig,
): number {
  const value = marketValueYen(model, instance, heatPercent, partsById, partsTaxonomyById, economy)
  const taste = tasteMultiplier(buyer, model, instance, partsById, partsTaxonomy, economy)
  return Math.round(Math.max(0, value * taste))
}
