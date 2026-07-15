import {
  ReputationTierSchema,
  type EconomyConfig,
  type GameState,
  type ReputationTier,
} from '@midnight-garage/content'

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
 * plausibly appear at auction or as a service-job customer's car - a
 * first-pass formula, explicitly tunable like every other constant here.
 */
export function currentGameYear(reputationTier: ReputationTier): number {
  return CALENDAR_START_YEAR + YEARS_PER_REPUTATION_TIER * reputationTierIndex(reputationTier)
}

/**
 * Turns accrued reputation points into a tier (Sprint 15) - the highest tier
 * whose threshold `points` has reached, reading `economy.reputation
 * .tierThresholds` so there is exactly one place the point/tier mapping is
 * defined.
 *
 * Sprint 69: the ladder moved from `sim/constants.ts` into content (the
 * content law), so this takes the economy rather than closing over a
 * hardcoded table.
 */
export function deriveReputationTier(points: number, economy: EconomyConfig): ReputationTier {
  const thresholds = economy.reputation.tierThresholds
  let tier: ReputationTier = 'unknown'
  for (const candidate of ReputationTierSchema.options) {
    if (points >= thresholds[candidate]) tier = candidate
  }
  return tier
}

/**
 * The single place `reputationPoints` ever changes (Sprint 15): clamps at
 * zero (a penalty can never go negative - matches the pre-existing
 * service-job-failure clamp) and re-derives `reputationTier` in the same
 * step, so the tier is never stale relative to the points underneath it.
 */
export function applyReputationDelta(
  state: GameState,
  delta: number,
  economy: EconomyConfig,
): GameState {
  const reputationPoints = Math.max(0, state.reputationPoints + delta)
  return {
    ...state,
    reputationPoints,
    reputationTier: deriveReputationTier(reputationPoints, economy),
  }
}
