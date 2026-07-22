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
 * How well a buyer archetype's stat weights fit this car's derived stats,
 * normalized to [0, 1] (0 = the archetype's weighted stats read as worthless,
 * 1 = a perfect fit). The shared input every taste band below maps onto its
 * own range - stats never touch `marketValueYen` itself, only who pays a bit
 * more.
 */
function normalizedTasteScore(
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
  return sumOfWeights > 0 ? weightedScore / sumOfWeights : 0
}

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
  const score = normalizedTasteScore(buyer, model, instance, partsById, partsTaxonomy, economy)
  const spread = economy.valuation.tasteSpread
  return 1 - spread + 2 * spread * score
}

/**
 * The listing-channel taste band a selling channel realises: `ceiling` is
 * that channel's own `sellingChannels[*].tasteCeiling`. The low
 * end never moves (`1 - tasteSpread`, every channel's honest floor); the top
 * end either CLAMPS the standard `[1-spread, 1+spread]` band (a ceiling at or
 * below `1 + spread` - the shop front, the free ads paper) or REPLACES it (a
 * ceiling above `1 + spread` - the tuner magazine, the weekend meet), so a
 * matched buyer through one of those two can pay a real premium the standard
 * band never reaches. Same `normalizedTasteScore` either way - the channel
 * only changes which range that score lands in.
 */
function channelTasteMultiplier(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
  ceiling: number,
): number {
  const score = normalizedTasteScore(buyer, model, instance, partsById, partsTaxonomy, economy)
  const spread = economy.valuation.tasteSpread
  const low = 1 - spread
  const normalTop = 1 + spread
  if (ceiling > normalTop) {
    return low + (ceiling - low) * score
  }
  return Math.min(low + (normalTop - low) * score, ceiling)
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

/**
 * A buyer's taste multiplier for a car AS ONE LISTING CHANNEL WOULD REALISE
 * IT - `channelTasteMultiplier`'s clamp/extend band, exported so
 * `selling.ts` can both price a channel offer with it and read the same
 * number back to decide MATCHED (`>= 1.0` - the buyer's visible want is met)
 * everywhere that definition is needed: the tuner magazine/weekend meet
 * mismatch gate, and the matched-sale reputation bonus at accept time.
 */
export function channelBuyerTaste(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
  tasteCeiling: number,
): number {
  return channelTasteMultiplier(
    buyer,
    model,
    instance,
    partsById,
    partsTaxonomy,
    economy,
    tasteCeiling,
  )
}

/**
 * `valuateCarForBuyer`, but pricing the taste term through one listing
 * channel's own band (`channelBuyerTaste`) instead of the standard
 * `[1-spread, 1+spread]` one - the channel-aware twin every
 * `drawDailyOffers` channel path prices its offer through.
 */
export function valuateCarForBuyerViaChannel(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  heatPercent: number,
  economy: EconomyConfig,
  tasteCeiling: number,
): number {
  const value = marketValueYen(model, instance, heatPercent, partsById, partsTaxonomyById, economy)
  const taste = channelBuyerTaste(
    buyer,
    model,
    instance,
    partsById,
    partsTaxonomy,
    economy,
    tasteCeiling,
  )
  return Math.round(Math.max(0, value * taste))
}
