import type { DayLog, DayLogEntry, GameState, Job } from '@midnight-garage/content'
import type { DayActions } from './actions'
import { availableLaborSlots } from './laborSlots'
import { applyWeeklyRentAndWages } from './finances'
import { applyLaborToJob, completeJob, createJob, isJobComplete } from './jobs'
import { driftMarketHeat } from './marketHeat'
import { createRng } from './rng'
import { computeServiceBayIncomeYen } from './serviceBay'

export interface AdvanceDayResult {
  state: GameState
  log: DayLog
}

/**
 * Sim contract: advanceDay(state, queuedActions, seed) -> newState + eventLog.
 * `seed` is caller-derived per day (e.g. state.seed + state.day), not read
 * from state.seed directly, so every day gets a distinct but fully
 * reproducible RNG stream from one career seed.
 */
export function advanceDay(
  state: GameState,
  queuedActions: DayActions,
  seed: number,
): AdvanceDayResult {
  const log: DayLogEntry[] = []
  const rng = createRng(seed)
  let next: GameState = state

  // 1. Create today's queued jobs.
  const jobs: Job[] = [...next.jobs]
  queuedActions.createJobs.forEach((spec, i) => {
    const job = createJob(spec, `job-${next.day}-${i}`)
    jobs.push(job)
    log.push({
      type: 'job-created',
      jobId: job.id,
      carInstanceId: job.carInstanceId,
      kind: job.kind,
    })
  })
  next = { ...next, jobs }

  // 2. Apply labor assignments, clamped to today's available slots.
  const available = availableLaborSlots(next)
  const requested = queuedActions.laborAssignments.reduce((sum, a) => sum + a.laborSlots, 0)
  if (requested > available) {
    log.push({ type: 'labor-overbooked', requestedSlots: requested, availableSlots: available })
  }

  const jobsById = new Map(next.jobs.map((job) => [job.id, job]))
  let remaining = available
  for (const assignment of queuedActions.laborAssignments) {
    if (remaining <= 0) break
    const job = jobsById.get(assignment.jobId)
    if (!job || isJobComplete(job)) continue
    const need = job.laborSlotsRequired - job.laborSlotsSpent
    const slotsToApply = Math.min(assignment.laborSlots, remaining, need)
    if (slotsToApply <= 0) continue
    jobsById.set(job.id, applyLaborToJob(job, slotsToApply))
    remaining -= slotsToApply
    log.push({ type: 'job-progress', jobId: job.id, laborSlotsSpent: slotsToApply })
  }
  next = { ...next, jobs: Array.from(jobsById.values()) }

  // 3. Complete any jobs that hit their labor requirement today.
  const stillOpen: Job[] = []
  for (const job of next.jobs) {
    if (!isJobComplete(job)) {
      stillOpen.push(job)
      continue
    }
    const result = completeJob(next, job)
    next = result.state
    if (result.blockedByOccupiedSlot) {
      log.push({ type: 'job-blocked', jobId: job.id, reason: 'slot-occupied' })
      stillOpen.push(job)
      continue
    }
    log.push({
      type: 'job-completed',
      jobId: job.id,
      carInstanceId: job.carInstanceId,
      kind: job.kind,
    })
  }
  next = { ...next, jobs: stillOpen }

  // 4. Daily service-bay income.
  const serviceIncome = computeServiceBayIncomeYen(next.staff, next.reputationTier)
  if (serviceIncome > 0) {
    next = { ...next, cashYen: next.cashYen + serviceIncome }
    log.push({ type: 'service-bay-income', amountYen: serviceIncome })
  }

  // 5. Weekly rent/wages + market-heat drift (both fire on 7-day boundaries).
  const finances = applyWeeklyRentAndWages(next)
  next = finances.state
  log.push(...finances.log)

  const heat = driftMarketHeat(next, rng)
  next = heat.state
  log.push(...heat.log)

  // 6. The day itself passes.
  next = { ...next, day: next.day + 1 }

  return { state: next, log }
}
