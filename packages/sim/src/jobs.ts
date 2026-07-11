import type {
  CarInstance,
  DayLogEntry,
  GameState,
  Job,
  PartInstance,
} from '@midnight-garage/content'
import type { NewJobSpec } from './actions'
import { bandIndex, planGroupRepair, presentPartIdsInGroup } from './bands'
import type { SimContext } from './context'
import { hasEquipmentFor } from './equipment'
import { partFitsCar } from './parts'

/**
 * A car the player can work on - either an owned car or a customer's car
 * sitting in an active service job. Both are worked through the same job
 * system, so any job/labor/staging resolver resolves either the same way.
 * Shared home for a lookup every one of those (and the game-layer store's own
 * view-building `findWorkableCar`) needs identically.
 */
export function findWorkableCar(state: GameState, carInstanceId: string): CarInstance | undefined {
  return (
    state.ownedCars.find((c) => c.id === carInstanceId) ??
    state.activeServiceJobs.find((sj) => sj.car.id === carInstanceId)?.car
  )
}

export function createJob(spec: NewJobSpec, id: string): Job {
  return {
    id,
    carInstanceId: spec.carInstanceId,
    kind: spec.kind,
    componentId: spec.componentId,
    partInstanceId: spec.partInstanceId,
    targetBand: spec.targetBand,
    laborSlotsRequired: spec.laborSlotsRequired,
    laborSlotsSpent: 0,
  }
}

/** Applies labor to a job, clamped so it never exceeds laborSlotsRequired. */
export function applyLaborToJob(job: Job, slots: number): Job {
  const laborSlotsSpent = Math.min(job.laborSlotsRequired, job.laborSlotsSpent + slots)
  return { ...job, laborSlotsSpent }
}

export function isJobComplete(job: Job): boolean {
  return job.laborSlotsSpent >= job.laborSlotsRequired
}

export interface JobCompletionResult {
  state: GameState
  /**
   * True if an install-part job was skipped because its target slot was
   * already occupied - the caller logs a job-blocked event rather than
   * silently overwriting the existing part.
   */
  blockedByOccupiedSlot: boolean
}

interface CarEffect {
  car: CarInstance
  partInventory: PartInstance[]
  blockedByOccupiedSlot: boolean
}

/**
 * The pure "apply a completed job to a car" core, shared by owned cars and
 * service-job cars (Sprint 26: rewritten for the group-level "bridge",
 * decision 13 - a job addresses a 6-way group, but its effect lands on the
 * real per-part state).
 *
 * Repair-zone: climbs every non-mint, non-scrap part in the group that's
 * still below `job.targetBand` up to it - exactly the set `planGroupRepair`
 * priced and sized at job creation (decision 5). A part reached scrap or
 * mint between creation and completion is simply skipped now (scrap stays
 * unrepairable; mint has nothing left to climb) rather than erroring - the
 * job was already fully paid for and labored, so there is nothing to refund.
 *
 * Install-part: resolves which CarPartId the picked catalog part actually
 * addresses (`context.partsById[...].carPartId`, decision 13's "only that
 * one part's slot changes") and sets it to a fresh `{ band: 'mint',
 * installed: partInstance, fitted: true }` - the `fitted: true` is a no-op
 * for every part but forcedInduction, where it's decision 3's "fitting a kit
 * sets fitted: true, mint."
 */
function applyJobToCar(
  car: CarInstance,
  job: Job,
  partInventory: readonly PartInstance[],
  context: SimContext,
): CarEffect {
  if (job.kind === 'repair-zone') {
    const targetBand = job.targetBand
    if (!targetBand) {
      throw new Error(`repair-zone job ${job.id} missing targetBand`)
    }
    const parts = { ...car.parts }
    for (const partId of presentPartIdsInGroup(car, job.componentId, context.partIdsByGroup)) {
      const partState = parts[partId]
      if (partState.band === 'scrap') continue
      if (bandIndex(partState.band) >= bandIndex(targetBand)) continue
      parts[partId] = { ...partState, band: targetBand }
    }
    return {
      car: { ...car, parts },
      partInventory: [...partInventory],
      blockedByOccupiedSlot: false,
    }
  }

  if (!job.partInstanceId) {
    throw new Error(`install-part job ${job.id} missing partInstanceId`)
  }
  const partIndex = partInventory.findIndex((p) => p.id === job.partInstanceId)
  const partInstance = partIndex === -1 ? undefined : partInventory[partIndex]
  if (!partInstance) {
    throw new Error(`install-part job ${job.id} references a part not in inventory`)
  }
  const catalogPart = context.partsById[partInstance.partId]
  if (!catalogPart) {
    throw new Error(
      `install-part job ${job.id} references unknown catalog part ${partInstance.partId}`,
    )
  }
  const targetPartId = catalogPart.carPartId
  const targetState = car.parts[targetPartId]
  if (targetState.installed) {
    return { car, partInventory: [...partInventory], blockedByOccupiedSlot: true }
  }
  return {
    car: {
      ...car,
      parts: {
        ...car.parts,
        [targetPartId]: { band: 'mint', installed: partInstance, fitted: true },
      },
    },
    partInventory: partInventory.filter((_, i) => i !== partIndex),
    blockedByOccupiedSlot: false,
  }
}

/**
 * Applies a completed job's effect (group repair or part install) to
 * GameState. The target car may be an owned car OR a customer car sitting in
 * a service job (the player works both with the same job system). Does not
 * remove the job from state.jobs - the caller (advanceDay) owns list
 * bookkeeping.
 */
export function completeJob(state: GameState, job: Job, context: SimContext): JobCompletionResult {
  const ownedIndex = state.ownedCars.findIndex((c) => c.id === job.carInstanceId)
  if (ownedIndex !== -1) {
    const effect = applyJobToCar(state.ownedCars[ownedIndex]!, job, state.partInventory, context)
    if (effect.blockedByOccupiedSlot) return { state, blockedByOccupiedSlot: true }
    const ownedCars = [...state.ownedCars]
    ownedCars[ownedIndex] = effect.car
    return {
      state: { ...state, ownedCars, partInventory: effect.partInventory },
      blockedByOccupiedSlot: false,
    }
  }

  const serviceIndex = state.activeServiceJobs.findIndex((sj) => sj.car.id === job.carInstanceId)
  if (serviceIndex !== -1) {
    const serviceJob = state.activeServiceJobs[serviceIndex]!
    const effect = applyJobToCar(serviceJob.car, job, state.partInventory, context)
    if (effect.blockedByOccupiedSlot) return { state, blockedByOccupiedSlot: true }
    const activeServiceJobs = [...state.activeServiceJobs]
    activeServiceJobs[serviceIndex] = { ...serviceJob, car: effect.car }
    return {
      state: { ...state, activeServiceJobs, partInventory: effect.partInventory },
      blockedByOccupiedSlot: false,
    }
  }

  throw new Error(`job ${job.id} references unknown car ${job.carInstanceId}`)
}

/** An open job's stable id - one job per car+component+kind at a time. */
function jobIdFor(spec: NewJobSpec): string {
  return `job-${spec.carInstanceId}-${spec.kind}-${spec.componentId}`
}

export type RepairJobGate = { ok: true; state: GameState } | { ok: false; log: DayLogEntry[] }

/**
 * Sprint 13: the equipment + consumables gate on *starting* a new repair-zone
 * job - checked once, at creation, never again. Equipment ownership is
 * monotonic (nothing in the sim ever removes it), so a job that passed this
 * gate never needs re-checking once it exists.
 *
 * Sprint 26 decisions 5+7: repair-zone now ALSO charges the real yen cost of
 * the work - `planGroupRepair`'s `costYen` (grades climbed times each part's
 * `stepCostYen`, summed across every eligible part in the group) on top of
 * consumables. A group with nothing left to repair (every part already at
 * or above the target, or every part scrap) refuses quietly - there is
 * nothing to create a job for. `install-part` is a no-op here (it has never
 * charged anything beyond the part itself, bought separately). Shared by the
 * player's instant `findOrCreateJob` path and advanceDay's bot batch
 * job-creation loop.
 */
export function repairJobGate(
  state: GameState,
  spec: NewJobSpec,
  context: SimContext,
): RepairJobGate {
  if (spec.kind === 'install-part') return { ok: true, state }

  const id = jobIdFor(spec)
  if (!hasEquipmentFor(state, spec.componentId, context)) {
    return {
      ok: false,
      log: [{ type: 'job-blocked', jobId: id, reason: 'equipment-missing' }],
    }
  }

  const equipment = context.equipment.find((e) => e.componentIds.includes(spec.componentId))
  const consumablesCostYen = equipment?.consumablesCostYen ?? 0

  if (!spec.targetBand) return { ok: false, log: [] }
  const car = findWorkableCar(state, spec.carInstanceId)
  if (!car) return { ok: false, log: [] }
  const plan = planGroupRepair(
    car,
    spec.componentId,
    spec.targetBand,
    state.ownedEquipmentIds,
    context.partIdsByGroup,
    context.partsTaxonomyById,
    context.equipmentById,
  )
  if (plan.partIds.length === 0) {
    // Nothing repairable is below the target band right now (all mint
    // already, or every part in the group is scrap) - a silent no-op.
    return { ok: false, log: [] }
  }

  const totalCostYen = consumablesCostYen + plan.costYen
  if (state.cashYen < totalCostYen) {
    // Equipment owned, just can't afford the work right now - a silent
    // refusal, matching every other can't-afford-it gate in this codebase.
    return { ok: false, log: [] }
  }
  return { ok: true, state: { ...state, cashYen: state.cashYen - totalCostYen } }
}

export type InstallFitGate = { ok: true } | { ok: false; log: DayLogEntry[] }

/**
 * Sprint 24 fix 2: the sim never validated part-component fit on install -
 * only the UI's own inline copy did. A separate, small gate beside
 * `repairJobGate` - exported and called from both `findOrCreateJob` below
 * (the player's instant path) AND `advanceDay`'s bot batch job-creation loop
 * directly.
 *
 * Sprint 26 decision 6: additionally, universally rejects any `PartInstance`
 * whose own band is `scrap` - a scrap part cannot move between cars, only be
 * replaced or scrap-sold (`resolveScrapPart`, parts.ts). Decision 13: fit is
 * now checked against the target GROUP (`spec.componentId`), resolved via
 * the catalog part's own taxonomy group, not a direct componentId match.
 */
export function installFitGate(
  state: GameState,
  spec: NewJobSpec,
  context: SimContext,
): InstallFitGate {
  if (spec.kind !== 'install-part') return { ok: true }
  const id = jobIdFor(spec)
  if (!spec.partInstanceId)
    return { ok: false, log: [{ type: 'job-blocked', jobId: id, reason: 'part-does-not-fit' }] }

  const car = findWorkableCar(state, spec.carInstanceId)
  const model = car ? context.modelsById[car.modelId] : undefined
  const partInstance = state.partInventory.find((p) => p.id === spec.partInstanceId)
  const part = partInstance ? context.partsById[partInstance.partId] : undefined
  const fits =
    car &&
    model &&
    part &&
    partInstance &&
    partInstance.band !== 'scrap' &&
    partFitsCar(part, model, spec.componentId, context.partsTaxonomyById)
  if (!fits) {
    return { ok: false, log: [{ type: 'job-blocked', jobId: id, reason: 'part-does-not-fit' }] }
  }
  return { ok: true }
}

/**
 * Finds the car's already-open job matching this spec's kind+component, or
 * creates one (Sprint 11). A car can only have one open job per component at
 * a time, so a repeat click on the same repair/install just continues the
 * existing job rather than creating a duplicate - the id is derived
 * deterministically from car+kind+componentId instead of a day/index
 * counter, so "the same job" is recognizable across days without extra
 * bookkeeping. Sprint 13: a *new* repair-zone job additionally passes
 * `repairJobGate` (equipment owned + consumables + repair cost affordable)
 * before it's created - `job` comes back `null` when the gate refuses, since
 * nothing was created to return. Sprint 24: a *new* install-part job
 * likewise passes `installFitGate` (fix 2).
 */
export function findOrCreateJob(
  state: GameState,
  spec: NewJobSpec,
  context: SimContext,
): { state: GameState; job: Job | null; log: DayLogEntry[] } {
  const id = jobIdFor(spec)
  const existing = state.jobs.find((j) => j.id === id)
  if (existing) return { state, job: existing, log: [] }

  const fitGate = installFitGate(state, spec, context)
  if (!fitGate.ok) return { state, job: null, log: fitGate.log }

  const gate = repairJobGate(state, spec, context)
  if (!gate.ok) return { state, job: null, log: gate.log }

  const job = createJob(spec, id)
  const totalCostYen = state.cashYen - gate.state.cashYen || undefined
  return {
    state: { ...gate.state, jobs: [...gate.state.jobs, job] },
    job,
    log: [
      {
        type: 'job-created',
        jobId: job.id,
        carInstanceId: job.carInstanceId,
        kind: job.kind,
        ...(totalCostYen ? { costYen: totalCostYen } : {}),
      },
    ],
  }
}

export interface LaborApplicationResult {
  state: GameState
  log: DayLogEntry[]
  /** How much of the caller's offered labor was actually consumed - 0 if the job was already complete. */
  laborSlotsUsed: number
}

/**
 * Applies up to `laborAvailable` labor to one job (by id), completing it
 * immediately if that's enough - the single-job core shared by the player's
 * instant repair/install click and advanceDay's bot batch loop (Sprint 11).
 * Bumps `laborSlotsSpentToday` by exactly what was used, so the caller never
 * has to track the daily budget separately from the state transition itself.
 */
export function applyAvailableLaborToJob(
  state: GameState,
  jobId: string,
  laborAvailable: number,
  context: SimContext,
): LaborApplicationResult {
  const job = state.jobs.find((j) => j.id === jobId)
  if (!job || isJobComplete(job) || laborAvailable <= 0) {
    return { state, log: [], laborSlotsUsed: 0 }
  }
  if (!state.serviceBayCarIds.includes(job.carInstanceId)) {
    return {
      state,
      log: [{ type: 'job-blocked', jobId: job.id, reason: 'not-in-service-bay' }],
      laborSlotsUsed: 0,
    }
  }

  const need = job.laborSlotsRequired - job.laborSlotsSpent
  const slotsToApply = Math.min(laborAvailable, need)
  if (slotsToApply <= 0) return { state, log: [], laborSlotsUsed: 0 }

  const updatedJob = applyLaborToJob(job, slotsToApply)
  let next: GameState = {
    ...state,
    jobs: state.jobs.map((j) => (j.id === jobId ? updatedJob : j)),
    laborSlotsSpentToday: state.laborSlotsSpentToday + slotsToApply,
  }
  const log: DayLogEntry[] = [{ type: 'job-progress', jobId, laborSlotsSpent: slotsToApply }]

  if (isJobComplete(updatedJob)) {
    const result = completeJob(next, updatedJob, context)
    next = result.state
    if (result.blockedByOccupiedSlot) {
      log.push({ type: 'job-blocked', jobId, reason: 'slot-occupied' })
    } else {
      next = { ...next, jobs: next.jobs.filter((j) => j.id !== jobId) }
      log.push({
        type: 'job-completed',
        jobId,
        carInstanceId: updatedJob.carInstanceId,
        kind: updatedJob.kind,
      })
    }
  }

  return { state: next, log, laborSlotsUsed: slotsToApply }
}

/**
 * The instant player-facing resolver (Sprint 11): find-or-create the job for
 * this car+zone/slot, then apply as much of today's remaining labor as it
 * needs. Composes `findOrCreateJob` + `applyAvailableLaborToJob` - the same
 * two primitives advanceDay's bot batch loop uses, just for a single click
 * instead of a whole day's queue. Sprint 13: `findOrCreateJob` can now refuse
 * to create a repair-zone job at all (no equipment / can't afford it) -
 * `job` comes back `null` in that case, and there's nothing left to apply
 * labor to.
 */
export function resolveJobLabor(
  state: GameState,
  spec: NewJobSpec,
  laborAvailable: number,
  context: SimContext,
): LaborApplicationResult {
  const created = findOrCreateJob(state, spec, context)
  if (!created.job) return { state: created.state, log: created.log, laborSlotsUsed: 0 }
  const result = applyAvailableLaborToJob(created.state, created.job.id, laborAvailable, context)
  return { ...result, log: [...created.log, ...result.log] }
}
