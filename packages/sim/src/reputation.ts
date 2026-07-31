import {
  ReputationTierSchema,
  type EconomyConfig,
  type GameState,
  type ReputationTier,
} from '@midnight-garage/content'

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
 * Turns accrued reputation points into a tier - the highest tier whose
 * threshold `points` has reached, reading
 * `economy.reputation.tierThresholds` so there is exactly one place the
 * point/tier mapping is defined.
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
 * The single place `reputationPoints` ever changes: clamps at zero (a
 * penalty can never go negative) and re-derives `reputationTier` in the
 * same step, so the tier is never stale relative to the points underneath
 * it.
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
