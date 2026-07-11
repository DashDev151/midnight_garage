import type {
  CarInstance,
  DayLogEntry,
  GameState,
  Job,
  PartInstance,
} from '@midnight-garage/content'
import type { NewJobSpec } from './actions'
import type { SimContext } from './context'
import { hasEquipmentFor } from './equipment'
import { issueRepairCostYen } from './issues'
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
    issueId: spec.issueId,
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
 * service-job cars. Repair -> condition 100, installed untouched; part
 * install (Replace) -> the part moves from inventory onto the component AND
 * condition -> 100 (skipped entirely if the component is already occupied).
 *
 * Sprint 13 fix: the install branch used to leave `condition` untouched - a
 * gap inherited from the pre-Sprint-12 model, where `condition` and
 * `buildSheet` were separate maps with no coupling at all, so installing a
 * part never had a way to affect condition. `docs/design/
 * repair-replace-progression.md` is explicit that Replace "sets condition ->
 * 100 and swaps installed" - Sprint 13 is exactly the sprint that makes
 * Replace a real, complete alternative restoration path to Repair, so this
 * is the sprint that closes the gap, not a silent behavior change smuggled
 * in elsewhere.
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

  if (job.kind === 'fix-issue') {
    if (!job.issueId) {
      throw new Error(`fix-issue job ${job.id} missing issueId`)
    }
    const issueId = job.issueId
    // Sprint 22: fixes the ISSUE, never the component's own `condition` -
    // repainting a car does not fix its apex seals. `effectiveComponentCondition`
    // (issues.ts) is what actually reflects this fix in every consumer.
    return {
      car: {
        ...car,
        hiddenIssues: car.hiddenIssues.map((issue) =>
          issue.issueId === issueId ? { ...issue, repaired: true } : issue,
        ),
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
        [job.componentId]: { condition: 100, installed: partInstance },
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
 * job from state.jobs - the caller (advanceDay) owns list bookkeeping.
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

/** An open job's stable id - one job per car+component+kind at a time. */
function jobIdFor(spec: NewJobSpec): string {
  return `job-${spec.carInstanceId}-${spec.kind}-${spec.componentId}`
}

export type RepairJobGate = { ok: true; state: GameState } | { ok: false; log: DayLogEntry[] }

/**
 * Sprint 13: the equipment + consumables gate on *starting* a new repair-zone
 * (Sprint 22: or fix-issue) job - checked once, at creation, never again.
 * Equipment ownership is monotonic (nothing in the sim ever removes it), so
 * a job that passed this gate never needs re-checking once it exists; unlike
 * the service-bay gate (which toggles as cars move and is re-checked every
 * labor application), this one only ever needs to fire at the single moment
 * a job is born. `install-part` is a no-op here (it has never charged
 * anything beyond the part itself, bought separately). Shared by the
 * player's instant `findOrCreateJob` path and advanceDay's bot batch
 * job-creation loop - one gate, two callers, matching every other Sprint 11
 * instant-resolver precedent.
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

  if (spec.kind === 'repair-zone') {
    if (state.cashYen < consumablesCostYen) {
      // Equipment owned, just can't afford the consumables right now - a
      // silent refusal, matching every other can't-afford-it gate in this
      // codebase (resolveBuyPart, applyBayPurchase, resolveBuyoutInstant).
      return { ok: false, log: [] }
    }
    return { ok: true, state: { ...state, cashYen: state.cashYen - consumablesCostYen } }
  }

  // fix-issue (Sprint 22 decision 3): consumables + the issue's own repair
  // cost, resolved from the actual rolled severity on the target car (the
  // spec itself only carries the issueId, not the severity).
  if (!spec.issueId) return { ok: false, log: [] }
  const issue = context.hiddenIssuesById[spec.issueId]
  if (!issue) return { ok: false, log: [] }
  const car = findWorkableCar(state, spec.carInstanceId)
  const revealedIssue = car?.hiddenIssues.find((ri) => ri.issueId === spec.issueId)
  if (!revealedIssue) return { ok: false, log: [] }

  const totalCostYen =
    consumablesCostYen + issueRepairCostYen(issue, revealedIssue.severityPercent, context.economy)
  if (state.cashYen < totalCostYen) {
    return { ok: false, log: [] }
  }
  return { ok: true, state: { ...state, cashYen: state.cashYen - totalCostYen } }
}

export type InstallFitGate = { ok: true } | { ok: false; log: DayLogEntry[] }

/**
 * Sprint 24 fix 2: the sim never validated part-component fit on install -
 * only the UI's own inline copy (`gameStore.installablePartsFor`) did,
 * leaving a staged action or a bot's queued install job free to install any
 * part onto any component. A separate, small gate beside `repairJobGate`
 * (not folded into it - that function deliberately opens with `if (kind !==
 * 'repair-zone') return ok` and, post-Sprint-22, branches per kind; fit is
 * its own concern) - exported and called from both `findOrCreateJob` below
 * (the player's instant path) AND `advanceDay`'s bot batch job-creation
 * loop directly (that loop calls `repairJobGate` inline, never
 * `findOrCreateJob`, mirroring `repairJobGate`'s own "one gate, two
 * callers" precedent). Refuses the same way an unaffordable/ungated repair
 * does: a blocked-and-logged no-op, never a throw (a bot's queued spec or
 * the dev console must not crash the tick).
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
  if (!car || !model || !part || !partFitsCar(part, model, spec.componentId)) {
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
 * `repairJobGate` (equipment owned + consumables affordable) before it's
 * created - `job` comes back `null` when the gate refuses, since nothing was
 * created to return. Sprint 24: a *new* install-part job likewise passes
 * `installFitGate` (fix 2).
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
  const consumablesCostYen = state.cashYen - gate.state.cashYen || undefined
  return {
    state: { ...gate.state, jobs: [...gate.state.jobs, job] },
    job,
    log: [
      {
        type: 'job-created',
        jobId: job.id,
        carInstanceId: job.carInstanceId,
        kind: job.kind,
        ...(consumablesCostYen ? { consumablesCostYen } : {}),
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
      if (updatedJob.kind === 'fix-issue' && updatedJob.issueId) {
        log.push({
          type: 'issue-fixed',
          carInstanceId: updatedJob.carInstanceId,
          issueId: updatedJob.issueId,
        })
      }
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
 * to create a repair-zone job at all (no equipment / can't afford
 * consumables) - `job` comes back `null` in that case, and there's nothing
 * left to apply labor to.
 */
export function resolveJobLabor(
  state: GameState,
  spec: NewJobSpec,
  laborAvailable: number,
  context: SimContext,
): LaborApplicationResult {
  const created = findOrCreateJob(state, spec, context)
  if (!created.job) return { state: created.state, log: created.log, laborSlotsUsed: 0 }
  const result = applyAvailableLaborToJob(created.state, created.job.id, laborAvailable)
  return { ...result, log: [...created.log, ...result.log] }
}
