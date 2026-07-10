import { ComponentIdSchema, type CarInstance } from '@midnight-garage/content'
import {
  LEMON_MAX_AVERAGE_CONDITION,
  LEMON_MAX_SINGLE_COMPONENT_CONDITION,
  LEMON_SALE_REPUTATION_PENALTY,
  QUALITY_SALE_MIN_AUTHENTICITY,
  QUALITY_SALE_MIN_CONDITION,
  QUALITY_SALE_REPUTATION_BONUS,
} from './constants'

/**
 * Average condition across all 8 real components (Sprint 15) — no such
 * aggregate existed anywhere in the sim before this; bots only ever read a
 * single component's own condition for their repair-target picking. Feeds
 * both the lemon/quality sale check below and, eventually, Hall of Legends
 * enshrinement (GDD 9.2's 90+ average condition bar — not this sprint's
 * concern, but the same helper will serve it later).
 */
export function averageConditionPercent(car: CarInstance): number {
  const ids = ComponentIdSchema.options
  const total = ids.reduce((sum, id) => sum + car.components[id].condition, 0)
  return total / ids.length
}

/**
 * The reputation effect of selling this car (Sprint 15), shared by both sale
 * channels: a lemon (average condition at or below the floor, OR any single
 * component this badly damaged) costs reputation; a genuinely well-restored
 * car (average condition AND authenticity both clearing the quality bar)
 * earns it. Lemon is checked first and takes explicit precedence — the two
 * thresholds can overlap (seven components at 96+ and one at <=10 still
 * averages >=85), so a car with a dead component is never scored as a
 * quality sale no matter how good the average looks. Plain selling in
 * between the two bars is reputation-neutral, regardless of price — normal
 * flipping isn't punished.
 */
export function saleReputationDeltaFor(car: CarInstance): number {
  const average = averageConditionPercent(car)
  const hasSevereComponent = ComponentIdSchema.options.some(
    (id) => car.components[id].condition <= LEMON_MAX_SINGLE_COMPONENT_CONDITION,
  )
  if (average <= LEMON_MAX_AVERAGE_CONDITION || hasSevereComponent) {
    return -LEMON_SALE_REPUTATION_PENALTY
  }
  if (
    average >= QUALITY_SALE_MIN_CONDITION &&
    car.authenticityPercent >= QUALITY_SALE_MIN_AUTHENTICITY
  ) {
    return QUALITY_SALE_REPUTATION_BONUS
  }
  return 0
}
