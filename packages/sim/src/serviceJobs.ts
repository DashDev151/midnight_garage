import type {
  CarModel,
  ComponentId,
  DayLogEntry,
  Equipment,
  GameState,
  Grade,
  HiddenIssue,
  ServiceJob,
  ServiceJobType,
} from '@midnight-garage/content'
import { generateAuctionCarInstance } from './auctions'
import { applyReputationDelta } from './calendar'
import {
  GRADE_REPUTATION_MULTIPLIER,
  JOB_HINT_OFFER_CHANCE,
  SERVICE_JOB_DEADLINE_DAYS,
  SERVICE_JOB_FAILURE_REP_MULTIPLIER,
} from './constants'
import type { SimContext } from './context'
import { hasEquipmentFor, hasEquipmentForIds } from './equipment'
import { hasParkingSpace, releaseCarFromServiceBay } from './facilities'
import type { Rng } from './rng'

/** Attempts a fresh pick can't exceed before falling back to whatever was last rolled
 * (an extremely rare edge case — every type gated and every hint roll missing). */
const MAX_TYPE_PICK_ATTEMPTS = 20

/**
 * Picks one service-job type for an offer (Sprint 16 decision 4): a
 * repair-kind type whose equipment isn't owned is normally rerolled, but a
 * flat `JOB_HINT_OFFER_CHANCE` per-candidate probability lets it through
 * anyway as a "here's what's next" hint. Install-kind types are never
 * filtered — replace is always available, gated on nothing.
 */
function pickServiceJobType(
  types: readonly ServiceJobType[],
  ownedEquipmentIds: readonly string[],
  equipmentById: Readonly<Record<string, Equipment>>,
  rng: Rng,
): ServiceJobType {
  let picked = types[0]!
  for (let attempt = 0; attempt < MAX_TYPE_PICK_ATTEMPTS; attempt++) {
    picked = rng.pick(types)
    const needsUnownedEquipment =
      picked.work.kind === 'repair' &&
      !hasEquipmentForIds(ownedEquipmentIds, equipmentById, picked.work.componentId)
    if (!needsUnownedEquipment || rng.next() < JOB_HINT_OFFER_CHANCE) return picked
  }
  return picked
}

/**
 * Offer a fresh batch of service jobs (Sprint 11: composed from a job-type +
 * flavor-pool catalog, not a fixed 1:1 template). Each carries a real
 * customer car (rolled like an auction car, so repair jobs land on an
 * already-worn zone and install jobs land on an empty slot) that enters the
 * shop on acceptance for the player to actually work on. A type, a customer
 * name, and a flavor line are picked independently — a flavor line can never
 * be paired with a `work` it wasn't written for, since it only ever lives in
 * its own type's pool. `currentYear` (Sprint 10, default Infinity =
 * unrestricted) excludes still-unreleased models and clamps the rolled car's
 * year, same as auction generation — a customer's car is bound by the same
 * in-game calendar a lot is. `ownedEquipmentIds`/`equipmentById` (Sprint 16,
 * both default to "nothing owned") drive the job-board equipment hinting
 * policy above — mostly filter out repair offers the player can't act on yet.
 */
export function generateServiceJobOffers(
  types: readonly ServiceJobType[],
  customerNames: readonly string[],
  models: readonly CarModel[],
  hiddenIssuesByComponent: Readonly<Record<ComponentId, readonly HiddenIssue[]>>,
  day: number,
  count: number,
  expiresInDays: number,
  rng: Rng,
  currentYear: number = Infinity,
  ownedEquipmentIds: readonly string[] = [],
  equipmentById: Readonly<Record<string, Equipment>> = {},
): ServiceJob[] {
  const eligibleModels = models.filter((model) => model.spec.yearFrom <= currentYear)
  if (types.length === 0 || customerNames.length === 0 || eligibleModels.length === 0) return []
  const offers: ServiceJob[] = []
  for (let i = 0; i < count; i++) {
    const type = pickServiceJobType(types, ownedEquipmentIds, equipmentById, rng)
    const model = rng.pick(eligibleModels)
    const [minPayout, maxPayout] = type.payoutRangeYen
    const car = generateAuctionCarInstance(
      model,
      hiddenIssuesByComponent,
      `svc-car-${day}-${i}`,
      rng,
      currentYear,
    )
    offers.push({
      id: `svc-${day}-${i}`,
      typeId: type.id,
      customerName: rng.pick(customerNames),
      description: rng.pick(type.flavorPool),
      work: type.work,
      car,
      payoutYen: rng.int(minPayout, maxPayout),
      baseReputation: type.baseReputation,
      expiresOnDay: day + expiresInDays,
      dueOnDay: null,
    })
  }
  return offers
}

export interface AcceptServiceJobResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The instant accept resolver (Sprint 11): moves an offer into
 * activeServiceJobs the moment the player clicks Accept — the customer's car
 * is now sitting in parking (the player moves it into a service bay to work
 * it). Needs a free parking space to take delivery; a full shop just leaves
 * the offer on the board rather than spending anything. Shared by the
 * player's instant click and advanceDay's bot batch loop (one queued accept
 * per call, matching every other Sprint 11 instant resolver's shape).
 *
 * Sprint 13: a `repair`-kind offer additionally needs the matching component's
 * equipment owned — "can't even accept them without it," per the design doc.
 * `install`-kind offers are never gated (replace is always available). The
 * maintainer's own read is that an unreachable repair offer arguably
 * shouldn't be generated in the first place, not surfaced-then-blocked; that
 * refinement is deliberately deferred (tracked in TODO.md) — this sprint
 * ships the simpler accept-time block.
 */
export function resolveAcceptServiceJob(
  state: GameState,
  offerId: string,
  context: SimContext,
): AcceptServiceJobResult {
  const offer = state.serviceJobOffers.find((o) => o.id === offerId)
  if (!offer) return { state, log: [] }
  if (offer.work.kind === 'repair' && !hasEquipmentFor(state, offer.work.componentId, context)) {
    return {
      state,
      log: [{ type: 'acquisition-blocked', kind: 'service-accept', reason: 'no-equipment' }],
    }
  }
  if (!hasParkingSpace(state)) {
    return {
      state,
      log: [{ type: 'acquisition-blocked', kind: 'service-accept', reason: 'no-parking' }],
    }
  }
  const activeJob: ServiceJob = { ...offer, dueOnDay: state.day + SERVICE_JOB_DEADLINE_DAYS }
  return {
    state: {
      ...state,
      serviceJobOffers: state.serviceJobOffers.filter((o) => o.id !== offerId),
      activeServiceJobs: [...state.activeServiceJobs, activeJob],
    },
    log: [{ type: 'service-job-accepted', jobId: offer.id, carInstanceId: offer.car.id }],
  }
}

/** Whether the customer's required work has actually been done on their car. */
export function isServiceWorkDone(job: ServiceJob): boolean {
  const component = job.car.components[job.work.componentId]
  return job.work.kind === 'repair' ? component.condition >= 100 : component.installed !== null
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

/** The catalog part installed for an install job's component (undefined for repair jobs). */
function installedPart(job: ServiceJob, context: SimContext) {
  if (job.work.kind !== 'install') return undefined
  const part = job.car.components[job.work.componentId].installed
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
    const withReputation = applyReputationDelta(releasedState, reputationGained)
    return {
      state: {
        ...withReputation,
        cashYen: withReputation.cashYen + job.payoutYen,
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
  const withReputation = applyReputationDelta(releasedState, -penalty)
  const reputationLost = releasedState.reputationPoints - withReputation.reputationPoints
  return {
    state: { ...withReputation, activeServiceJobs, jobs },
    log: [{ type: 'service-job-failed', jobId: job.id, reputationLost }],
    outcome: 'failed',
  }
}
