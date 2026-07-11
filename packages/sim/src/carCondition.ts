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
 * car earns it. Lemon is checked first and takes explicit precedence — a car
 * with a dead component is never scored as a quality sale no matter how good
 * the rest looks. Plain selling in between is reputation-neutral, regardless
 * of price — normal flipping isn't punished.
 *
 * Sprint 22 decision 6: extends the lemon check with a NEW trigger — any
 * unrepaired issue at or above `lemonSeverityThreshold`, independent of the
 * condition-based check above (a car can look great on paper and still hide
 * a serious, unfixed problem).
 *
 * Sprint 23 decision 1: the old single all-or-nothing quality bar (average
 * condition AND authenticity both >=85) is replaced by two reachable tiers.
 * *Clean* requires zero unrepaired issues AND EVERY one of the 8 components'
 * effective condition clearing `cleanSaleMinConditionPercent` — stricter than
 * an average (no single neglected component can hide behind seven great
 * ones) but always reachable by player effort. *Concours* additionally
 * requires the car's authenticityPercent (rolled 60-95 at generation, never
 * player-modifiable) to clear its own bar — a genuine bonus for a
 * well-matched find, not the only door into the faucet. Concours replaces
 * clean; the two never stack.
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

  const isClean =
    unrepairedIssues.length === 0 &&
    ComponentIdSchema.options.every(
      (id) =>
        effectiveComponentCondition(car, id, issuesById) >=
        economy.reputation.cleanSaleMinConditionPercent,
    )
  if (!isClean) return 0

  const isConcours =
    car.authenticityPercent >= economy.reputation.concoursSaleMinAuthenticityPercent
  return isConcours ? economy.reputation.concoursSaleBonus : economy.reputation.cleanSaleBonus
}

export type SaleQuality = 'lemon' | 'clean' | 'concours'

/**
 * Derives which of `saleReputationDeltaFor`'s bonuses/penalty actually fired
 * from its numeric return value, for the day-report copy (Sprint 23) — the
 * four outcomes (-5/0/+2/+4 by default config) are mutually exclusive by
 * construction, so comparing against the same economy thresholds that
 * produced the delta identifies the tier without a second, parallel
 * computation or a redundant field threaded through `PublicListing`.
 */
export function saleQualityFor(deltaPoints: number, economy: EconomyConfig): SaleQuality | null {
  if (deltaPoints <= -LEMON_SALE_REPUTATION_PENALTY) return 'lemon'
  if (deltaPoints >= economy.reputation.concoursSaleBonus) return 'concours'
  if (deltaPoints >= economy.reputation.cleanSaleBonus) return 'clean'
  return null
}
