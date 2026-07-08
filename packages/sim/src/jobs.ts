import type { GameState, Job } from '@midnight-garage/content'
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

/**
 * Applies a completed job's effect (zone repair or part install) to
 * GameState. Does not remove the job from state.jobs — the caller
 * (advanceDay) owns list bookkeeping.
 */
export function completeJob(state: GameState, job: Job): JobCompletionResult {
  const carIndex = state.ownedCars.findIndex((c) => c.id === job.carInstanceId)
  const car = carIndex === -1 ? undefined : state.ownedCars[carIndex]
  if (!car) {
    throw new Error(`job ${job.id} references unknown car ${job.carInstanceId}`)
  }

  if (job.kind === 'repair-zone') {
    if (!job.zone) throw new Error(`repair-zone job ${job.id} has no zone`)
    const updatedCar = { ...car, condition: { ...car.condition, [job.zone]: 100 } }
    const ownedCars = [...state.ownedCars]
    ownedCars[carIndex] = updatedCar
    return { state: { ...state, ownedCars }, blockedByOccupiedSlot: false }
  }

  // install-part
  if (!job.slot || !job.partInstanceId) {
    throw new Error(`install-part job ${job.id} missing slot/partInstanceId`)
  }
  if (car.buildSheet[job.slot]) {
    return { state, blockedByOccupiedSlot: true }
  }

  const partIndex = state.partInventory.findIndex((p) => p.id === job.partInstanceId)
  const partInstance = partIndex === -1 ? undefined : state.partInventory[partIndex]
  if (!partInstance) {
    throw new Error(`install-part job ${job.id} references a part not in inventory`)
  }

  const updatedCar = { ...car, buildSheet: { ...car.buildSheet, [job.slot]: partInstance } }
  const ownedCars = [...state.ownedCars]
  ownedCars[carIndex] = updatedCar
  const partInventory = state.partInventory.filter((_, i) => i !== partIndex)

  return { state: { ...state, ownedCars, partInventory }, blockedByOccupiedSlot: false }
}
