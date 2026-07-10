import type { ComponentId, DayLogEntry, Equipment, GameState } from '@midnight-garage/content'
import { reputationAtLeast } from './calendar'
import type { SimContext } from './context'
import type { BuyEquipmentAction } from './actions'

/**
 * The pure ownership lookup (Sprint 16 decision 5): whether `ownedEquipmentIds`
 * covers `componentId`, given nothing but the loose pieces a caller might
 * have — no `GameState` required. Extracted because `generateServiceJobOffers`
 * (offer generation) never has a full `GameState`, only a bot/harness caller's
 * loose content pieces, so it can't call `hasEquipmentFor` below without one.
 * One real check, two callers.
 */
export function hasEquipmentForIds(
  ownedEquipmentIds: readonly string[],
  equipmentById: Readonly<Record<string, Equipment>>,
  componentId: ComponentId,
): boolean {
  return ownedEquipmentIds.some((id) => equipmentById[id]?.componentIds.includes(componentId))
}

/** Whether the shop currently owns equipment covering this component — what REPAIR is gated on. */
export function hasEquipmentFor(
  state: GameState,
  componentId: ComponentId,
  context: SimContext,
): boolean {
  return hasEquipmentForIds(state.ownedEquipmentIds, context.equipmentById, componentId)
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
