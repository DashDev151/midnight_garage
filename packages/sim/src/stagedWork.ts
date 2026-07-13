import type { DayLogEntry, GameState } from '@midnight-garage/content'
import type { NewJobSpec } from './actions'
import { planGroupRepair, restorationCostFactorForTier } from './bands'
import { INSTALL_LABOR_SLOTS } from './constants'
import type { SimContext } from './context'
import { findWorkableCar, resolveJobLabor } from './jobs'

/**
 * Drops a car's staged-work entry, wherever it stands - called by every
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
 * flow always used - Confirm is a loop over that machinery, not a new
 * resolution path. Staged actions are processed in list order (first staged,
 * first dibs on today's labor); an action whose gate refuses (e.g. the
 * repair-cost affordability gate) or that only partially labors today still
 * leaves behind a normal, continuable `Job` - nothing here changes what
 * happens to an already-open job afterward. The car's staged list is cleared
 * unconditionally at the end, whether or not every action could be fully
 * labored today.
 *
 * Sprint 26 decision 13 (the group-level "bridge"): a staged `repair` sizes
 * its `NewJobSpec.laborSlotsRequired` via `planGroupRepair` (bands.ts) -
 * every non-mint, non-scrap part in the group climbing toward the staged
 * `targetBand`, at the group's own repair level. A group with nothing left
 * to repair (already there, or every part scrap) simply produces no spec -
 * the same "nothing to do" no-op `repairJobGate` itself falls back on.
 *
 * Sprint 28: `action.carPartId`, when set, passes straight through to the
 * built `NewJobSpec` (and into `planGroupRepair`'s `onlyPartId`) - a
 * per-part staged action resolves through this exact same loop, sized down
 * to one part instead of the whole group. Nothing else about the loop
 * changes; group-level and per-part staged actions on the same car are
 * simply different entries in the same `staged` list, each producing its
 * own spec and its own job.
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
    if (!car) break // the car left the shop mid-loop - nothing left to work on

    let spec: NewJobSpec | null = null
    if (action.kind === 'repair') {
      const model = context.modelsById[car.modelId]
      if (!model) continue // should never happen for real content; nothing to price against
      const factor = restorationCostFactorForTier(model.tier, context.economy)
      const plan = planGroupRepair(
        car,
        action.componentId,
        action.targetBand,
        current.toolTiers,
        context.partIdsByGroup,
        context.partsTaxonomyById,
        factor,
        action.carPartId,
      )
      if (plan.partIds.length > 0) {
        spec = {
          carInstanceId,
          kind: 'repair-zone',
          componentId: action.componentId,
          targetBand: action.targetBand,
          carPartId: action.carPartId,
          laborSlotsRequired: plan.laborSlotsRequired,
        }
      }
    } else {
      spec = {
        carInstanceId,
        kind: 'install-part',
        componentId: action.componentId,
        partInstanceId: action.partInstanceId,
        carPartId: action.carPartId,
        laborSlotsRequired: INSTALL_LABOR_SLOTS,
      }
    }
    if (!spec) continue // nothing left to do for this staged action - skip it

    const result = resolveJobLabor(current, spec, remainingLabor, context)
    current = result.state
    log.push(...result.log)
    remainingLabor -= result.laborSlotsUsed
  }

  return { state: clearStagedWork(current, carInstanceId), log }
}
