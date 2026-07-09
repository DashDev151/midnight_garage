import type { DayLogEntry, GameState, PartInstance } from '@midnight-garage/content'
import type { SimContext } from './context'

export interface BuyPartResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The instant buy-part resolver (Sprint 11): a bought part lands in
 * inventory the moment it's bought — installable immediately (an install
 * job can reference the new part-instance id in the same click that creates
 * it), not from the next day like the old queued-until-End-Day flow.
 */
export function resolveBuyPart(
  state: GameState,
  partId: string,
  context: SimContext,
): BuyPartResult {
  const part = context.partsById[partId]
  if (!part || state.cashYen < part.priceYen) return { state, log: [] }

  const partInstance: PartInstance = {
    id: `part-${state.day}-${state.partInventory.length}`,
    partId: part.id,
    conditionPercent: 100,
    genuinePeriod: false,
  }
  return {
    state: {
      ...state,
      cashYen: state.cashYen - part.priceYen,
      partInventory: [...state.partInventory, partInstance],
    },
    log: [
      {
        type: 'part-bought',
        partId: part.id,
        partInstanceId: partInstance.id,
        priceYen: part.priceYen,
      },
    ],
  }
}
