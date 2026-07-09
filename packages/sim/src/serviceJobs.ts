import type {
  CarModel,
  DayLogEntry,
  GameState,
  Grade,
  HiddenIssue,
  ServiceJob,
  ServiceJobTemplate,
  Zone,
} from '@midnight-garage/content'
import { generateAuctionCarInstance } from './auctions'
import {
  GRADE_REPUTATION_MULTIPLIER,
  SERVICE_JOB_DEADLINE_DAYS,
  SERVICE_JOB_FAILURE_REP_MULTIPLIER,
} from './constants'
import type { SimContext } from './context'
import { releaseCarFromServiceBay } from './facilities'
import type { Rng } from './rng'

/**
 * Offer a fresh batch of service jobs. Each carries a real customer car (rolled
 * like an auction car, so repair jobs land on an already-worn zone and install
 * jobs land on an empty slot) that enters the shop on acceptance for the player
 * to actually work on. `currentYear` (Sprint 10, default Infinity =
 * unrestricted) excludes still-unreleased models and clamps the rolled car's
 * year, same as auction generation — a customer's car is bound by the same
 * in-game calendar a lot is.
 */
export function generateServiceJobOffers(
  templates: readonly ServiceJobTemplate[],
  models: readonly CarModel[],
  hiddenIssuesByZone: Readonly<Record<Zone, readonly HiddenIssue[]>>,
  day: number,
  count: number,
  expiresInDays: number,
  rng: Rng,
  currentYear: number = Infinity,
): ServiceJob[] {
  const eligibleModels = models.filter((model) => model.spec.yearFrom <= currentYear)
  if (templates.length === 0 || eligibleModels.length === 0) return []
  const offers: ServiceJob[] = []
  for (let i = 0; i < count; i++) {
    const template = rng.pick(templates)
    const model = rng.pick(eligibleModels)
    const car = generateAuctionCarInstance(
      model,
      hiddenIssuesByZone,
      `svc-car-${day}-${i}`,
      rng,
      currentYear,
    )
    offers.push({
      id: `svc-${day}-${i}`,
      templateId: template.id,
      customerName: template.customerName,
      description: template.description,
      work: template.work,
      car,
      payoutYen: template.payoutYen,
      baseReputation: template.baseReputation,
      expiresOnDay: day + expiresInDays,
      dueOnDay: null,
    })
  }
  return offers
}

/** Whether the customer's required work has actually been done on their car. */
export function isServiceWorkDone(job: ServiceJob): boolean {
  return job.work.kind === 'repair'
    ? job.car.condition[job.work.zone] >= 100
    : job.car.buildSheet[job.work.slot] !== null
}

/**
 * Reputation earned for completing a job: the base amount scaled by the
 * installed part's grade (repair jobs pass `null` -> the stock/1.0 rate).
 */
export function reputationForCompletion(baseReputation: number, grade: Grade | null): number {
  const multiplier = grade ? GRADE_REPUTATION_MULTIPLIER[grade] : 1
  return Math.round(baseReputation * multiplier)
}

/** Reputation lost when a job is failed (handed back unfinished / overdue). */
export function reputationForFailure(baseReputation: number): number {
  return Math.round(baseReputation * SERVICE_JOB_FAILURE_REP_MULTIPLIER)
}

export type ServiceJobOutcome = 'paid' | 'failed' | 'not-found'

export interface ServiceJobResolution {
  state: GameState
  log: DayLogEntry[]
  outcome: ServiceJobOutcome
}

/** The catalog part installed for an install job's slot (undefined for repair jobs). */
function installedPart(job: ServiceJob, context: SimContext) {
  if (job.work.kind !== 'install') return undefined
  const part = job.car.buildSheet[job.work.slot]
  return part ? context.partsById[part.partId] : undefined
}

/**
 * Resolve one active service job by handing the car back to its customer. The
 * single source of truth for job resolution, shared by the player's immediate
 * "Complete Job" click and advanceDay's deadline backstop:
 *  - work done  -> pay the fixed payout + grant reputation (grade-scaled),
 *  - work undone -> no pay + reputation penalty.
 * Either way the customer's car leaves and any leftover jobs on it are dropped.
 * advanceDay is never what *decides* a player's job is done — this is.
 */
export function resolveServiceJob(
  state: GameState,
  jobId: string,
  context: SimContext,
): ServiceJobResolution {
  const job = state.activeServiceJobs.find((sj) => sj.id === jobId)
  if (!job) return { state, log: [], outcome: 'not-found' }

  const releasedState = releaseCarFromServiceBay(state, job.car.id)
  const activeServiceJobs = releasedState.activeServiceJobs.filter((sj) => sj.id !== jobId)
  const jobs = releasedState.jobs.filter((j) => j.carInstanceId !== job.car.id)

  if (isServiceWorkDone(job)) {
    const part = installedPart(job, context)
    const reputationGained = reputationForCompletion(job.baseReputation, part?.grade ?? null)
    const partCostYen = part?.priceYen
    const acceptedOnDay = job.dueOnDay === null ? null : job.dueOnDay - SERVICE_JOB_DEADLINE_DAYS
    return {
      state: {
        ...releasedState,
        cashYen: releasedState.cashYen + job.payoutYen,
        reputationPoints: releasedState.reputationPoints + reputationGained,
        activeServiceJobs,
        jobs,
      },
      log: [
        {
          type: 'service-job-completed',
          jobId: job.id,
          payoutYen: job.payoutYen,
          reputationGained,
          ...(partCostYen !== undefined
            ? { partCostYen, profitYen: job.payoutYen - partCostYen }
            : {}),
          ...(acceptedOnDay !== null ? { daysSpent: releasedState.day - acceptedOnDay } : {}),
        },
      ],
      outcome: 'paid',
    }
  }

  const penalty = reputationForFailure(job.baseReputation)
  const reputationLost = Math.min(penalty, releasedState.reputationPoints)
  return {
    state: {
      ...releasedState,
      reputationPoints: releasedState.reputationPoints - reputationLost,
      activeServiceJobs,
      jobs,
    },
    log: [{ type: 'service-job-failed', jobId: job.id, reputationLost }],
    outcome: 'failed',
  }
}
