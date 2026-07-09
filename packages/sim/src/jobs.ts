import type { CarInstance, GameState, Job, PartInstance } from '@midnight-garage/content'
import type { NewJobSpec } from './actions'

export function createJob(spec: NewJobSpec, id: string): Job {
  return {
    id,
    carInstanceId: spec.carInstanceId,
    kind: spec.kind,
    zone: spec.zone,
    slot: spec.slot,
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
 * service-job cars. Zone repair -> condition 100; part install -> the part
 * moves from inventory onto the build sheet (skipped if the slot is occupied).
 */
function applyJobToCar(
  car: CarInstance,
  job: Job,
  partInventory: readonly PartInstance[],
): CarEffect {
  if (job.kind === 'repair-zone') {
    if (!job.zone) throw new Error(`repair-zone job ${job.id} has no zone`)
    return {
      car: { ...car, condition: { ...car.condition, [job.zone]: 100 } },
      partInventory: [...partInventory],
      blockedByOccupiedSlot: false,
    }
  }

  if (!job.slot || !job.partInstanceId) {
    throw new Error(`install-part job ${job.id} missing slot/partInstanceId`)
  }
  if (car.buildSheet[job.slot]) {
    return { car, partInventory: [...partInventory], blockedByOccupiedSlot: true }
  }
  const partIndex = partInventory.findIndex((p) => p.id === job.partInstanceId)
  const partInstance = partIndex === -1 ? undefined : partInventory[partIndex]
  if (!partInstance) {
    throw new Error(`install-part job ${job.id} references a part not in inventory`)
  }
  return {
    car: { ...car, buildSheet: { ...car.buildSheet, [job.slot]: partInstance } },
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
