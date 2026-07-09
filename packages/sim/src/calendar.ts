import { ReputationTierSchema, type ReputationTier } from '@midnight-garage/content'

/** GDD 2.2: "starting in 1995." */
const CALENDAR_START_YEAR = 1995

/** GDD 2.2: "the calendar advances ~2 in-game years per reputation tier." */
const YEARS_PER_REPUTATION_TIER = 2

/**
 * A reputation tier's position on the ladder, read straight from the schema
 * so there is exactly one source of tier order in the codebase (not a
 * second, hand-maintained array).
 */
function reputationTierIndex(tier: ReputationTier): number {
  return ReputationTierSchema.options.indexOf(tier)
}

/** Whether `current` has reached at least `min` on the reputation ladder. */
export function reputationAtLeast(current: ReputationTier, min: ReputationTier): boolean {
  return reputationTierIndex(current) >= reputationTierIndex(min)
}

/**
 * The in-game calendar year for a reputation tier (GDD 2.2: "1995 -> 2005
 * over a full campaign, ~2 years per tier"). Gates which car model years can
 * plausibly appear at auction or as a service-job customer's car — a
 * first-pass formula, explicitly tunable like every other constant here.
 */
export function currentGameYear(reputationTier: ReputationTier): number {
  return CALENDAR_START_YEAR + YEARS_PER_REPUTATION_TIER * reputationTierIndex(reputationTier)
}
