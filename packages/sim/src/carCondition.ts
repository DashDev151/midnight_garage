import {
  ComponentIdSchema,
  type CarInstance,
  type EconomyConfig,
  type HiddenIssue,
} from '@midnight-garage/content'
import {
  LEMON_MAX_AVERAGE_CONDITION,
  LEMON_MAX_SINGLE_COMPONENT_CONDITION,
  LEMON_SALE_REPUTATION_PENALTY,
  QUALITY_SALE_MIN_AUTHENTICITY,
  QUALITY_SALE_MIN_CONDITION,
  QUALITY_SALE_REPUTATION_BONUS,
} from './constants'
import { effectiveComponentCondition } from './issues'

/**
 * Average condition across all 8 real components (Sprint 15) — no such
 * aggregate existed anywhere in the sim before this; bots only ever read a
 * single component's own condition for their repair-target picking. Feeds
 * both the lemon/quality sale check below and, eventually, Hall of Legends
 * enshrinement (GDD 9.2's 90+ average condition bar — not this sprint's
 * concern, but the same helper will serve it later).
 *
 * Sprint 22 decision 2: reads EFFECTIVE condition (a component with an
 * unrepaired hidden issue counts as damaged here even at raw condition 100).
 */
export function averageConditionPercent(
  car: CarInstance,
  issuesById: Readonly<Record<string, HiddenIssue>>,
): number {
  const ids = ComponentIdSchema.options
  const total = ids.reduce((sum, id) => sum + effectiveComponentCondition(car, id, issuesById), 0)
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
 *
 * Sprint 22 decision 6: extends the lemon check with a NEW trigger — any
 * unrepaired issue at or above `lemonSeverityThreshold`, independent of the
 * condition-based check above (a car can look great on paper and still hide
 * a serious, unfixed problem). The quality bonus additionally requires ZERO
 * unrepaired issues of any severity — a known, unfixed defect (however
 * minor) means this was never actually a fully-restored sale.
 */
export function saleReputationDeltaFor(
  car: CarInstance,
  issuesById: Readonly<Record<string, HiddenIssue>>,
  economy: EconomyConfig,
): number {
  const average = averageConditionPercent(car, issuesById)
  const hasSevereComponent = ComponentIdSchema.options.some(
    (id) =>
      effectiveComponentCondition(car, id, issuesById) <= LEMON_MAX_SINGLE_COMPONENT_CONDITION,
  )
  const unrepairedIssues = car.hiddenIssues.filter((ri) => !ri.repaired)
  const hasSevereUnrepairedIssue = unrepairedIssues.some(
    (ri) => ri.severityPercent >= economy.issues.lemonSeverityThreshold,
  )
  if (average <= LEMON_MAX_AVERAGE_CONDITION || hasSevereComponent || hasSevereUnrepairedIssue) {
    return -LEMON_SALE_REPUTATION_PENALTY
  }
  if (
    unrepairedIssues.length === 0 &&
    average >= QUALITY_SALE_MIN_CONDITION &&
    car.authenticityPercent >= QUALITY_SALE_MIN_AUTHENTICITY
  ) {
    return QUALITY_SALE_REPUTATION_BONUS
  }
  return 0
}
