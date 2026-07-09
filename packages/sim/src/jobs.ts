import type {
  CarInstance,
  DayLogEntry,
  GameState,
  Job,
  PartInstance,
} from '@midnight-garage/content'
import type { NewJobSpec } from './actions'

export function createJob(spec: NewJobSpec, id: string): Job {
  return {
    id,
    carInstanceId: spec.carInstanceId,
    kind: spec.kind,
    componentId: spec.componentId,
    partInstanceId: spec.partInstanceId,
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
   * already occupied — the caller logs a job-blocked event rather than
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
 * service-job cars. Repair -> condition 100; part install -> the part moves
 * from inventory onto the component (skipped if it's already occupied).
 */
function applyJobToCar(
  car: CarInstance,
  job: Job,
  partInventory: readonly PartInstance[],
): CarEffect {
  const component = car.components[job.componentId]

  if (job.kind === 'repair-zone') {
    return {
      car: {
        ...car,
        components: { ...car.components, [job.componentId]: { ...component, condition: 100 } },
      },
      partInventory: [...partInventory],
      blockedByOccupiedSlot: false,
    }
  }

  if (!job.partInstanceId) {
    throw new Error(`install-part job ${job.id} missing partInstanceId`)
  }
  if (component.installed) {
    return { car, partInventory: [...partInventory], blockedByOccupiedSlot: true }
  }
  const partIndex = partInventory.findIndex((p) => p.id === job.partInstanceId)
  const partInstance = partIndex === -1 ? undefined : partInventory[partIndex]
  if (!partInstance) {
    throw new Error(`install-part job ${job.id} references a part not in inventory`)
  }
  return {
    car: {
      ...car,
      components: {
        ...car.components,
        [job.componentId]: { ...component, installed: partInstance },
      },
    },
    partInventory: partInventory.filter((_, i) => i !== partIndex),
    blockedByOccupiedSlot: false,
  }
}

/**
 * Applies a completed job's effect (zone repair or part install) to GameState.
 * The target car may be an owned car OR a customer car sitting in a service
 * job (the player works both with the same job system). Does not remove the
 * job from state.jobs — the caller (advanceDay) owns list bookkeeping.
 */
export function completeJob(state: GameState, job: Job): JobCompletionResult {
  const ownedIndex = state.ownedCars.findIndex((c) => c.id === job.carInstanceId)
  if (ownedIndex !== -1) {
    const effect = applyJobToCar(state.ownedCars[ownedIndex]!, job, state.partInventory)
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
    const effect = applyJobToCar(serviceJob.car, job, state.partInventory)
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

/** An open job's stable id — one job per car+component+kind at a time. */
function jobIdFor(spec: NewJobSpec): string {
  return `job-${spec.carInstanceId}-${spec.kind}-${spec.componentId}`
}

/**
 * Finds the car's already-open job matching this spec's kind+component, or
 * creates one (Sprint 11). A car can only have one open job per component at
 * a time, so a repeat click on the same repair/install just continues the
 * existing job rather than creating a duplicate — the id is derived
 * deterministically from car+kind+componentId instead of a day/index
 * counter, so "the same job" is recognizable across days without extra
 * bookkeeping.
 */
export function findOrCreateJob(
  state: GameState,
  spec: NewJobSpec,
): { state: GameState; job: Job } {
  const id = jobIdFor(spec)
  const existing = state.jobs.find((j) => j.id === id)
  if (existing) return { state, job: existing }

  const job = createJob(spec, id)
  return { state: { ...state, jobs: [...state.jobs, job] }, job }
}

export interface LaborApplicationResult {
  state: GameState
  log: DayLogEntry[]
  /** How much of the caller's offered labor was actually consumed — 0 if the job was already complete. */
  laborSlotsUsed: number
}

/**
 * Applies up to `laborAvailable` labor to one job (by id), completing it
 * immediately if that's enough — the single-job core shared by the player's
 * instant repair/install click and advanceDay's bot batch loop (Sprint 11).
 * Bumps `laborSlotsSpentToday` by exactly what was used, so the caller never
 * has to track the daily budget separately from the state transition itself.
 */
export function applyAvailableLaborToJob(
  state: GameState,
  jobId: string,
  laborAvailable: number,
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
    const result = completeJob(next, updatedJob)
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
 * needs. Composes `findOrCreateJob` + `applyAvailableLaborToJob` — the same
 * two primitives advanceDay's bot batch loop uses, just for a single click
 * instead of a whole day's queue.
 */
export function resolveJobLabor(
  state: GameState,
  spec: NewJobSpec,
  laborAvailable: number,
): LaborApplicationResult {
  const created = findOrCreateJob(state, spec)
  return applyAvailableLaborToJob(created.state, created.job.id, laborAvailable)
}
