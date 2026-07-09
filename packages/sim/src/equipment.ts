import type { ComponentId, DayLogEntry, GameState } from '@midnight-garage/content'
import { reputationAtLeast } from './calendar'
import type { SimContext } from './context'
import type { BuyEquipmentAction } from './actions'

/** Whether the shop currently owns equipment covering this component — what REPAIR is gated on. */
export function hasEquipmentFor(
  state: GameState,
  componentId: ComponentId,
  context: SimContext,
): boolean {
  return state.ownedEquipmentIds.some((id) =>
    context.equipmentById[id]?.componentIds.includes(componentId),
  )
}

export interface EquipmentPurchaseResult {
  state: GameState
  log: DayLogEntry[]
  applied: boolean
}

/**
 * The pure "buy one piece of equipment" core — same instant-for-the-player /
 * DayAction-for-bots pattern as `applyBayPurchase` (Sprint 09). Equipment has
 * no ladder (unlike bays): it's owned or not, bought at most once. A no-op
 * (not an error) if already owned, reputation-gated, or unaffordable.
 */
export function applyEquipmentPurchase(
  state: GameState,
  equipmentId: string,
  context: SimContext,
): EquipmentPurchaseResult {
  const equipment = context.equipmentById[equipmentId]
  if (!equipment) return { state, log: [], applied: false }
  if (state.ownedEquipmentIds.includes(equipmentId)) return { state, log: [], applied: false }
  if (
    equipment.minReputationTier &&
    !reputationAtLeast(state.reputationTier, equipment.minReputationTier)
  ) {
    return { state, log: [], applied: false }
  }
  if (state.cashYen < equipment.priceYen) return { state, log: [], applied: false }

  return {
    state: {
      ...state,
      cashYen: state.cashYen - equipment.priceYen,
      ownedEquipmentIds: [...state.ownedEquipmentIds, equipmentId],
    },
    log: [{ type: 'equipment-purchased', equipmentId, priceYen: equipment.priceYen }],
    applied: true,
  }
}

/** Applies a batch of equipment purchases in order (bots' only path — the player buys instantly). */
export function applyEquipmentPurchases(
  state: GameState,
  purchases: readonly BuyEquipmentAction[],
  context: SimContext,
): { state: GameState; log: DayLogEntry[] } {
  let next = state
  const log: DayLogEntry[] = []
  for (const purchase of purchases) {
    const result = applyEquipmentPurchase(next, purchase.equipmentId, context)
    next = result.state
    log.push(...result.log)
  }
  return { state: next, log }
}
