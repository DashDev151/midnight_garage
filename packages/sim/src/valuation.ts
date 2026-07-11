import type { Buyer, CarInstance, CarModel, Part } from '@midnight-garage/content'
import { computeDerivedStats } from './derivedStats'

const STAT_WEIGHT_KEYS = ['power', 'handling', 'style', 'reliability', 'authenticity'] as const

/** Power has no upper clamp in computeDerivedStats; 300 PS is a JZA80-class soft ceiling for normalization. */
const POWER_NORMALIZATION_CEILING = 300

const DEFAULT_TIER_PREFERENCE_WEIGHT = 0.2

/**
 * What a buyer archetype would pay for a car (GDD 6.3), shared by
 * bidding (as an AI competitor's true value) and selling (as an offer).
 * Sprint 03 decision 5: stays pure and deterministic — no RNG, no side
 * effects. Bidder-side noise (decision 4) is layered on by the caller.
 */
export function valuateCarForBuyer(
  buyer: Buyer,
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
): number {
  const stats = computeDerivedStats(model, instance, partsById)
  const weights = buyer.statWeights

  const weightedScore =
    (stats.power / POWER_NORMALIZATION_CEILING) * weights.power +
    (stats.handling / 100) * weights.handling +
    (stats.style / 100) * weights.style +
    (stats.reliability / 100) * weights.reliability +
    (stats.authenticity / 100) * weights.authenticity

  const sumOfWeights = STAT_WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0)
  const normalizedStatScore = sumOfWeights > 0 ? weightedScore / sumOfWeights : 0

  // Book value is the anchor, and needs headroom on both sides: a
  // mediocre-fit, rough-condition car should land well under book, but a
  // well-matched buyer looking at a well-restored car needs to be able to
  // reach or clear book value — otherwise nothing in the economy (a
  // repaired flip, a snipe under book, a well-matched sale) can ever be
  // profitable, since every valuation is capped below what was paid for
  // even a perfect car. (First pass had this backwards: fitComponent
  // topped out at 1.0 and priceSensitivity only ever subtracted, so the
  // best possible valuation for anyone, on a flawless car, was ~86% of
  // book — a structural ceiling no amount of bot tuning could fix.)
  const fitComponent = 0.6 + 0.7 * normalizedStatScore
  const tierPreference = buyer.tierPreferences.find((p) => p.tier === model.tier)
  const tierComponent = 1 + (tierPreference?.weight ?? DEFAULT_TIER_PREFERENCE_WEIGHT) * 0.3

  const baseValue = model.bookValueYen * fitComponent * tierComponent
  const priceAdjusted = baseValue * (1 - buyer.priceSensitivity * 0.15)

  return Math.round(Math.max(0, priceAdjusted))
}
