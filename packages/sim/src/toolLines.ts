import type {
  ComponentId,
  DayLogEntry,
  GameState,
  ToolTier,
  ToolTiers,
} from '@midnight-garage/content'
import type { SimContext } from './context'
import type { UpgradeToolLineAction } from './actions'

/**
 * Sprint 36: tool lines replace binary equipment ownership. Every line is
 * always owned at tier 1 or above (progression bible law 1: nothing basic
 * is ever locked); upgrading buys labor efficiency (tier IS the
 * `repairLevel` the banded repair formula climbs at) and, from Sprint 37's
 * content onward, capability ceilings (`minToolTier` on service-job tasks).
 * There is no ownership gate anywhere - the old owns-the-machine refusal
 * class is structurally unrepresentable.
 */

/** A fresh shop's tool tiers: every line at 1 (owned from day one). */
export function freshToolTiers(): ToolTiers {
  return {
    engine: 1,
    drivetrain: 1,
    suspension: 1,
    wheels: 1,
    body: 1,
    interior: 1,
  }
}

/** The shop's current tier for `componentId`'s tool line - the repair level
 * every repair path climbs at (`bands.ts`'s `repairLevelForGroup` reads the
 * same map; this is the state-first spelling for callers holding a GameState). */
export function toolTierForGroup(state: GameState, componentId: ComponentId): ToolTier {
  return state.toolTiers[componentId]
}

export interface ToolUpgradeResult {
  state: GameState
  log: DayLogEntry[]
  applied: boolean
}

/**
 * The pure "upgrade one tool line one tier" core (Sprint 36) - same
 * instant-for-the-player / DayAction-for-bots pattern as `applyBayPurchase`.
 * Sequential only: one call climbs exactly one tier, and gates in order:
 * already at 3 -> no-op not-applied; can't afford the next tier's
 * `upgradePriceYen` -> no-op not-applied; otherwise deduct, set tier + 1,
 * and log `tool-upgraded`. NO reputation gate (progression bible: tools
 * have no reputation gates - upgrade prices are the only gate on
 * capability). A same-day duplicate in a bot's batch re-checks cash and
 * tier per call, so it is either a genuine second sequential step or a
 * no-op - never a double charge for the same tier.
 */
export function applyToolUpgrade(
  state: GameState,
  componentId: ComponentId,
  context: SimContext,
): ToolUpgradeResult {
  const currentTier = state.toolTiers[componentId]
  if (currentTier >= 3) return { state, log: [], applied: false }
  const nextTier = context.toolLines[componentId].tiers[currentTier]!
  if (state.cashYen < nextTier.upgradePriceYen) return { state, log: [], applied: false }

  const toTier = (currentTier + 1) as ToolTier
  return {
    state: {
      ...state,
      cashYen: state.cashYen - nextTier.upgradePriceYen,
      toolTiers: { ...state.toolTiers, [componentId]: toTier },
    },
    log: [{ type: 'tool-upgraded', componentId, toTier, priceYen: nextTier.upgradePriceYen }],
    applied: true,
  }
}

/** Applies a batch of tool upgrades in order (bots' only path - the player
 * upgrades instantly). Mirrors the retired `applyEquipmentPurchases`. */
export function applyToolUpgrades(
  state: GameState,
  upgrades: readonly UpgradeToolLineAction[],
  context: SimContext,
): { state: GameState; log: DayLogEntry[] } {
  let next = state
  const log: DayLogEntry[] = []
  for (const upgrade of upgrades) {
    const result = applyToolUpgrade(next, upgrade.componentId, context)
    next = result.state
    log.push(...result.log)
  }
  return { state: next, log }
}
