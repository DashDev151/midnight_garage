import type { GameState, ServiceJobLedger } from '@midnight-garage/content'

/**
 * The read/write primitives for `GameState.serviceJobLedgers`, mirroring
 * `carLedger.ts`'s exact shape at job scope instead of car scope - what
 * the player actually spent on a customer's job (repair charges,
 * installed parts at their paid price), so the completion report can
 * show real numbers instead of a catalog-price reconstruction.
 */
const EMPTY_LEDGER: ServiceJobLedger = { repairYen: 0, partsYen: 0 }

/** `serviceJobLedgers[jobId]`, or the empty default when no entry exists
 * yet (a job that hasn't had any charge land on it). */
export function serviceJobLedgerFor(state: GameState, jobId: string): ServiceJobLedger {
  return state.serviceJobLedgers[jobId] ?? EMPTY_LEDGER
}

/** Reads the current entry (or the empty default), applies `update`, and
 * writes the result back - every charge site accumulates onto whatever's
 * already there. */
export function updateServiceJobLedger(
  state: GameState,
  jobId: string,
  update: (current: ServiceJobLedger) => ServiceJobLedger,
): GameState {
  return {
    ...state,
    serviceJobLedgers: {
      ...state.serviceJobLedgers,
      [jobId]: update(serviceJobLedgerFor(state, jobId)),
    },
  }
}

/** Drops `jobId`'s ledger entry - `resolveServiceJob`'s close-out step, so a
 * ledger never outlives the job it describes. A no-op when there's nothing
 * to remove. */
export function deleteServiceJobLedger(state: GameState, jobId: string): GameState {
  if (!(jobId in state.serviceJobLedgers)) return state
  const serviceJobLedgers = { ...state.serviceJobLedgers }
  delete serviceJobLedgers[jobId]
  return { ...state, serviceJobLedgers }
}
