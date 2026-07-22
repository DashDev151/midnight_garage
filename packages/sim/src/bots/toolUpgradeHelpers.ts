import type { ComponentId, GameState } from '@midnight-garage/content'
import type { DayActions } from '../actions'
import type { SimContext } from '../context'

/**
 * Component ids a bot has already queued a tool-line upgrade for earlier in
 * the same day's decision tick - `state` never mutates mid-strategy (bots
 * only ever build a `DayActions` object), so without this a bot iterating
 * several cars that all want the same line upgraded would queue the same
 * upgrade repeatedly. Mirrors `ServiceBayBudget`'s
 * mutable-counter-threaded-through-a-tick shape (`bayHelpers.ts`).
 */
export interface ToolUpgradeBudget {
  queuedComponentIds: Set<ComponentId>
}

export function toolUpgradeBudget(): ToolUpgradeBudget {
  return { queuedComponentIds: new Set() }
}

/**
 * The shared "should this bot buy the next tier of this line" decision.
 * Queues the line's next tier iff the line is below 3 AND the bot can
 * cover `upgradePriceYen * cashBufferMultiplier` from its current cash
 * (the same headroom style every bot already applies to its other spends).
 * Never a prerequisite for working: repair is always possible at the
 * current tier, so callers proceed with their work whether or not this
 * queues anything.
 *
 * Deliberately NO bot-side reputation check: tiers 2/3 gate on reputation
 * (`applyToolUpgrade`/`nextToolTierRepGate`, toolLines.ts), but a bot
 * below the gate still queues the upgrade, and the resolver silently
 * refuses it - the same no-op contract an unaffordable upgrade already
 * has. No bot needs to reason about reputation to decide whether to try.
 *
 * Returns `true` when an upgrade was queued this call (or already queued
 * this same tick - the budget dedupe); `false` when the line is maxed or
 * the buffer isn't covered. Note this return value reflects intent only -
 * a queued upgrade can still be refused reputation-side at resolution.
 */
export function considerToolUpgrade(
  state: GameState,
  componentId: ComponentId,
  actions: DayActions,
  context: SimContext,
  budget: ToolUpgradeBudget,
  cashBufferMultiplier: number,
): boolean {
  if (budget.queuedComponentIds.has(componentId)) return true

  const currentTier = state.toolTiers[componentId]
  if (currentTier >= 3) return false
  const nextTier = context.toolLines[componentId].tiers[currentTier]!
  if (state.cashYen < nextTier.upgradePriceYen * cashBufferMultiplier) return false

  actions.upgradeToolLines.push({ componentId })
  budget.queuedComponentIds.add(componentId)
  return true
}
