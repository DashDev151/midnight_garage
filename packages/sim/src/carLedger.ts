import type { CarLedger, GameState } from '@midnight-garage/content'

/**
 * Shared read/write primitives that every resolver which touches
 * `GameState.carLedgers` uses - one small module so "how do I record a
 * spend against a car" has exactly one implementation, not one per call site
 * (auction win/buyout, repair-job creation, install completion, sale).
 */
const UNKNOWN_LEDGER: CarLedger = { purchaseYen: null, repairYen: 0, partsYen: 0 }

/** `carLedgers[carInstanceId]`, or the unknown-purchase default when no
 * entry exists yet (a car with unknown acquisition, or a dev-granted car) -
 * callers never see `undefined`, only degrade gracefully. */
export function carLedgerFor(state: GameState, carInstanceId: string): CarLedger {
  return state.carLedgers[carInstanceId] ?? UNKNOWN_LEDGER
}

/** Overwrites (or creates) `carInstanceId`'s ledger entry outright - the
 * acquisition case (auction win, buyout), where there is no prior spend to
 * fold in. */
export function setCarLedger(
  state: GameState,
  carInstanceId: string,
  ledger: CarLedger,
): GameState {
  return { ...state, carLedgers: { ...state.carLedgers, [carInstanceId]: ledger } }
}

/** Reads the current entry (or the unknown-purchase default), applies
 * `update`, and writes the result back - the repair/install case, where a
 * spend accumulates onto whatever's already there. */
export function updateCarLedger(
  state: GameState,
  carInstanceId: string,
  update: (current: CarLedger) => CarLedger,
): GameState {
  return setCarLedger(state, carInstanceId, update(carLedgerFor(state, carInstanceId)))
}

/** Drops `carInstanceId`'s ledger entry - every car-exit path (currently
 * only a sale; see `selling.ts`'s `resolveSellViaWalkIn`) cleans up after
 * itself so a ledger never outlives the car it describes. A no-op when
 * there's nothing to remove. */
export function deleteCarLedger(state: GameState, carInstanceId: string): GameState {
  if (!(carInstanceId in state.carLedgers)) return state
  const carLedgers = { ...state.carLedgers }
  delete carLedgers[carInstanceId]
  return { ...state, carLedgers }
}
