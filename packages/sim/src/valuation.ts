import type { Buyer, CarInstance, CarModel, EconomyConfig, Part } from '@midnight-garage/content'
import { computeDerivedStats } from './derivedStats'
import { marketValueYen } from './marketValue'

const STAT_WEIGHT_KEYS = ['power', 'handling', 'style', 'reliability', 'authenticity'] as const

/**
 * Bounded taste multiplier (decision 4): how well a buyer archetype's stat
 * weights fit this car's derived stats, `[1 - tasteSpread, 1 + tasteSpread]`
 * (economy.json's first-pass `tasteSpread` of 0.12 bounds it to [0.88, 1.12],
 * centered near 1.0 for an average car). Kept verbatim from the pre-Sprint-21
 * fit-score math — stats stop being the value pipeline (`marketValueYen` is
 * both issue-blind and stat-blind), but they still decide who pays a bit
 * more, never whether the car is worth anything.
 */
function tasteMultiplier(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): number {
  const stats = computeDerivedStats(model, instance, partsById, economy)
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
 * What a buyer archetype would pay for a car (GDD 6.3), shared by
 * bidding (as an AI competitor's true value) and selling (as an offer).
 * Sprint 03 decision 5: stays pure and deterministic — no RNG, no side
 * effects. Bidder-side noise (decision 4) is layered on by the caller.
 *
 * Sprint 21 rewrite: `marketValue x taste` — `marketValueYen` (marketValue.ts)
 * is the taste-free "what is this car worth" answer shared by every price in
 * the game (condition, installed parts, market heat); `tasteMultiplier`
 * above is the only place stat fit still matters, bounded so it can only
 * nudge the price, never invert whether the car is worth anything. Deleted
 * outright: the old `fitComponent`/`tierComponent`/`priceAdjusted` price
 * math (see sprint21.md's "Deleted outright" section) — `buyer.priceSensitivity`
 * stays in the schema/content as a reserved, currently-unused field.
 */
export function valuateCarForBuyer(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  heatPercent: number,
  economy: EconomyConfig,
): number {
  const value = marketValueYen(model, instance, heatPercent, partsById, economy)
  const taste = tasteMultiplier(buyer, model, instance, partsById, economy)
  return Math.round(Math.max(0, value * taste))
}
