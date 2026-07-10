import type { DayLogEntry, GameState } from '@midnight-garage/content'
import { INSTALL_LABOR_SLOTS, repairLaborSlotsFor } from './constants'
import type { SimContext } from './context'
import { findWorkableCar, resolveJobLabor } from './jobs'
import type { NewJobSpec } from './actions'

/**
 * Drops a car's staged-work entry, wherever it stands — called by every
 * car-exit resolver (walk-in sale, public listing, service-job resolution)
 * so staged work never outlives the car it was staged on. A car that leaves
 * with staged installs still pending would otherwise leave those specific
 * `PartInstance`s permanently greyed out in the inventory (decision 3's
 * cross-car guard has no way to know the stage it's protecting is dead).
 * No-op (same reference) if the car has no staged entry.
 */
export function clearStagedWork(state: GameState, carInstanceId: string): GameState {
  if (!(carInstanceId in state.stagedCarWork)) return state
  const stagedCarWork = Object.fromEntries(
    Object.entries(state.stagedCarWork).filter(([id]) => id !== carInstanceId),
  )
  return { ...state, stagedCarWork }
}

export interface StagedWorkResolution {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The Confirm resolver (Sprint 18): resolves every staged action on one car
 * at once, against a single shared remaining-labor budget, through the exact
 * same `resolveJobLabor`/`findOrCreateJob` machinery the old per-click instant
 * flow always used — Confirm is a loop over that machinery, not a new
 * resolution path. Staged actions are processed in list order (first staged,
 * first dibs on today's labor); an action whose gate refuses (e.g. the
 * repair equipment gate) or that only partially labors today still leaves
 * behind a normal, continuable `Job` — nothing here changes what happens to
 * an already-open job afterward (decision 4: that's the existing
 * single-click "Continue repair" flow, not staging). The car's staged list
 * is cleared unconditionally at the end, whether or not every action could
 * be fully labored today.
 */
export function confirmStagedWork(
  state: GameState,
  carInstanceId: string,
  laborAvailable: number,
  context: SimContext,
): StagedWorkResolution {
  const staged = state.stagedCarWork[carInstanceId] ?? []
  let current = state
  let remainingLabor = laborAvailable
  const log: DayLogEntry[] = []

  for (const action of staged) {
    const car = findWorkableCar(current, carInstanceId)
    if (!car) break // the car left the shop mid-loop — nothing left to work on

    const spec: NewJobSpec =
      action.kind === 'repair'
        ? {
            carInstanceId,
            kind: 'repair-zone',
            componentId: action.componentId,
            laborSlotsRequired: repairLaborSlotsFor(car.components[action.componentId].condition),
          }
        : {
            carInstanceId,
            kind: 'install-part',
            componentId: action.componentId,
            partInstanceId: action.partInstanceId,
            laborSlotsRequired: INSTALL_LABOR_SLOTS,
          }

    const result = resolveJobLabor(current, spec, remainingLabor, context)
    current = result.state
    log.push(...result.log)
    remainingLabor -= result.laborSlotsUsed
  }

  return { state: clearStagedWork(current, carInstanceId), log }
}
