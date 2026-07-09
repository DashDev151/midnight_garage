import type { ComponentId, GameState } from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { reputationAtLeast } from '../calendar'
import type { SimContext } from '../context'
import { hasEquipmentFor } from '../equipment'

/**
 * Equipment ids a bot has already decided to buy earlier in the same day's
 * decision tick — `state` never mutates mid-strategy (bots only ever build a
 * `DayActions` object), so without this a bot iterating several cars that
 * all want the same component repaired would queue the same purchase
 * repeatedly. Mirrors `ServiceBayBudget`'s mutable-counter-threaded-through-
 * a-tick shape (`bayHelpers.ts`, Sprint 09).
 */
export interface EquipmentBudget {
  queuedIds: Set<string>
}

export function equipmentBudget(): EquipmentBudget {
  return { queuedIds: new Set() }
}

/**
 * Sprint 13: the shared "can this bot repair `componentId` right now, and if
 * not, should it buy the tool" decision every repair-touching bot calls
 * before creating a repair-zone job. Without this, every existing bot's
 * repair loop would silently and permanently block the moment equipment
 * gating shipped (see sprint13.md decision 10) — Service Grinder especially,
 * since repair-only service jobs are its entire purpose.
 *
 * Returns `true` when repair can proceed this tick — either the equipment is
 * already owned, or a purchase was just queued (equipment purchases resolve
 * in advanceDay before job creation, so a same-day queued buy really does
 * unlock repair the same tick, not "next day"). Returns `false` when the
 * bot should skip repairing this component for now (unaffordable,
 * reputation-gated, or no equipment exists for it in the catalog) — the
 * caller's existing "nothing happens, try again later" fallback handles
 * that exactly like any other blocked action today.
 *
 * `cashBufferMultiplier` reuses whatever safety margin the calling bot
 * already applies to its other purchases (auction bids, parts) — a plain
 * "buy if literally affordable" would strand a bot broke on tools with
 * nothing left to run the shop.
 */
export function ensureEquipmentFor(
  state: GameState,
  componentId: ComponentId,
  actions: DayActions,
  context: SimContext,
  budget: EquipmentBudget,
  cashBufferMultiplier: number,
): boolean {
  if (hasEquipmentFor(state, componentId, context)) return true

  const equipment = context.equipment.find((e) => e.componentIds.includes(componentId))
  if (!equipment) return false
  if (budget.queuedIds.has(equipment.id)) return true

  if (
    equipment.minReputationTier &&
    !reputationAtLeast(state.reputationTier, equipment.minReputationTier)
  ) {
    return false
  }
  if (state.cashYen < equipment.priceYen * cashBufferMultiplier) return false

  actions.buyEquipment.push({ equipmentId: equipment.id })
  budget.queuedIds.add(equipment.id)
  return true
}
