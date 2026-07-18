import type { CarInstance, DayLogEntry, GameState } from '@midnight-garage/content'
import type { NewJobSpec } from './actions'
import {
  assemblyContainerFor,
  assemblyDefById,
  resolveRefitAssembly,
  resolveRemoveAssembly,
} from './assemblies'
import { bandIndex, canRepair, planGroupRepair } from './bands'
import type { SimContext } from './context'
import { findWorkableCar, installLaborSlotsFor, refitLaborSlotsFor, resolveJobLabor } from './jobs'

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

    // Sprint 87: an assembly op is a single atomic resolver, not a NewJobSpec -
    // it runs against the same shared remaining-labour budget and appends to the
    // same log, but never touches the repair/install job pipeline below.
    if (action.kind === 'remove-assembly') {
      const result = resolveRemoveAssembly(
        current,
        carInstanceId,
        action.assemblyId,
        context,
        remainingLabor,
      )
      current = result.state
      log.push(...result.log)
      remainingLabor -= result.laborSlotsUsed
      continue
    }
    if (action.kind === 'refit-assembly') {
      const container = assemblyContainerFor(current, carInstanceId, action.assemblyId)
      if (container) {
        const result = resolveRefitAssembly(current, container.id, context, remainingLabor)
        current = result.state
        log.push(...result.log)
        remainingLabor -= result.laborSlotsUsed
      }
      continue
    }

    let spec: NewJobSpec | null = null
    if (action.kind === 'repair') {
      const plan = planGroupRepair(
        car,
        action.componentId,
        action.targetBand,
        current.toolTiers,
        context.partIdsByGroup,
        context.partsById,
        context.partsTaxonomyById,
        context.economy.restoration.repairStepFraction,
        action.carPartId,
        // Sprint 82: size staged repair labour with the benched crew's speed
        // discount (decision 2), matching the store's Confirm-total preview.
        { staff: current.staff, economy: context.economy },
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
      // Sprint 71: labor sizes off the TARGET slot's own depth class - the
      // picked part's own catalog address when `action.carPartId` (the
      // per-part drawer) is unset, exactly how `applyJobToCar` itself
      // resolves the real target slot at completion. Sprint 79: a refit
      // matching the slot's own `vacatedBaseline` (putting the car back the
      // way it was found) is free - `refitLaborSlotsFor` falls back to the
      // plain class-based cost whenever `partInstance` can't be resolved.
      const partInstance = current.partInventory.find((p) => p.id === action.partInstanceId)
      const catalogPart = partInstance ? context.partsById[partInstance.partId] : undefined
      const targetPartId = action.carPartId ?? catalogPart?.carPartId
      spec = targetPartId
        ? {
            carInstanceId,
            kind: 'install-part',
            componentId: action.componentId,
            partInstanceId: action.partInstanceId,
            carPartId: action.carPartId,
            laborSlotsRequired: partInstance
              ? refitLaborSlotsFor(car, targetPartId, partInstance, context)
              : installLaborSlotsFor(targetPartId, context),
          }
        : null
    }
    if (!spec) continue // nothing left to do for this staged action - skip it

    const result = resolveJobLabor(current, spec, remainingLabor, context)
    current = result.state
    log.push(...result.log)
    remainingLabor -= result.laborSlotsUsed
  }

  return { state: clearStagedWork(current, carInstanceId), log }
}

/**
 * Sprint 48: a pure "what would this car look like if every currently
 * planned action fully completed" projection - no cash, no labor, no jobs
 * created, nothing in `state` mutated. Powers the Finances panel's
 * pre-confirm estimate: the projected car feeds straight into the same
 * `marketValueYen` the real guide value already uses, so "value after" is
 * never a parallel estimator. Deliberately simpler than `confirmStagedWork`
 * (no labor budget, no partial completion) - a preview assumes every planned
 * action finishes, which is exactly what "projected after Confirm, assuming
 * enough labor" should show.
 */
export function previewPlannedWork(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
): CarInstance | null {
  const car = findWorkableCar(state, carInstanceId)
  if (!car) return null
  const staged = state.stagedCarWork[carInstanceId] ?? []
  let parts = car.parts

  for (const action of staged) {
    if (action.kind === 'repair') {
      const candidateIds = action.carPartId
        ? [action.carPartId]
        : context.partIdsByGroup[action.componentId]
      for (const partId of candidateIds) {
        const installed = parts[partId].installed
        if (!installed) continue
        const entry = context.partsTaxonomyById[partId]
        if (!entry || !canRepair(installed.band, entry)) continue
        if (bandIndex(installed.band) >= bandIndex(action.targetBand)) continue
        parts = { ...parts, [partId]: { installed: { ...installed, band: action.targetBand } } }
      }
    } else if (action.kind === 'remove-assembly') {
      // Sprint 87: the assembly comes off - every member slot projects empty.
      const def = assemblyDefById(action.assemblyId, context)
      if (def) for (const member of def.members) parts = { ...parts, [member]: { installed: null } }
    } else if (action.kind === 'refit-assembly') {
      // Sprint 87: the assembly goes back on - fill each member slot from the
      // container currently on the bench, if any.
      const container = assemblyContainerFor(state, carInstanceId, action.assemblyId)
      if (container) {
        for (const [member, instance] of Object.entries(container.members)) {
          if (instance)
            parts = { ...parts, [member as keyof typeof parts]: { installed: instance } }
        }
      }
    } else {
      const partInstance = state.partInventory.find((p) => p.id === action.partInstanceId)
      if (!partInstance) continue
      const catalogPart = context.partsById[partInstance.partId]
      const targetPartId = action.carPartId ?? catalogPart?.carPartId
      if (!targetPartId) continue
      parts = { ...parts, [targetPartId]: { installed: partInstance } }
    }
  }

  return { ...car, parts }
}
