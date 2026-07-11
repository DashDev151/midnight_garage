import type {
  CarModel,
  DayLogEntry,
  EconomyConfig,
  Equipment,
  GameState,
  Grade,
  ReputationTier,
  ServiceJob,
  ServiceJobType,
} from '@midnight-garage/content'
import { generateAuctionCarInstance } from './auctions'
import { presentPartIdsInGroup } from './bands'
import { applyReputationDelta, reputationAtLeast } from './calendar'
import {
  GRADE_REPUTATION_MULTIPLIER,
  JOB_HINT_OFFER_CHANCE,
  SERVICE_JOB_ARRIVAL_DELAY_DAYS,
  SERVICE_JOB_DEADLINE_DAYS,
  SERVICE_JOB_FAILURE_REP_MULTIPLIER,
} from './constants'
import type { SimContext } from './context'
import { hasEquipmentFor, hasEquipmentForIds } from './equipment'
import { assignToParking, hasParkingSpace, releaseCarFromShop } from './facilities'
import type { Rng } from './rng'
import { clearStagedWork } from './stagedWork'

/** Attempts a fresh pick can't exceed before falling back to whatever was last rolled
 * (an extremely rare edge case - every type gated and every hint roll missing). */
const MAX_TYPE_PICK_ATTEMPTS = 20

/** Sprint 25 task 10: install-kind offers (parts the player buys and fits) only
 * start appearing once the shop has some standing - a brand-new game's very
 * first job must never be a turbo build. Repair jobs are ungated here; they
 * keep their existing equipment/hint policy below. */
const INSTALL_OFFER_MIN_REPUTATION: ReputationTier = 'local'

/**
 * Picks one service-job type for an offer (Sprint 16 decision 4): a
 * repair-kind type whose equipment isn't owned is normally rerolled, but a
 * flat `JOB_HINT_OFFER_CHANCE` per-candidate probability lets it through
 * anyway as a "here's what's next" hint. Install-kind types are otherwise
 * never filtered - replace is always available.
 *
 * Sprint 25 task 10: below-reputation install types are filtered out of the
 * candidate pool BEFORE any rolling happens, not rerolled inline like the
 * equipment hint above - a hard structural gate, not a soft probabilistic
 * one. This matters: `MAX_TYPE_PICK_ATTEMPTS`'s fallback returns whatever
 * was last rolled if every attempt gets rerolled, and a brand-new game
 * (reputation 'unknown', zero equipment owned) rerolls BOTH every install
 * pick (gated) and ~85% of repair picks (`JOB_HINT_OFFER_CHANCE` only lets
 * 15% through with no equipment) - exhausting all 20 attempts without a
 * valid pick happens often enough in that exact scenario that an inline
 * reroll's fallback would silently hand back a still-gated install type,
 * defeating the whole point. Filtering the pool first makes that
 * structurally impossible: the fallback can only ever return something
 * already eligible.
 */
function pickServiceJobType(
  types: readonly ServiceJobType[],
  ownedEquipmentIds: readonly string[],
  equipmentById: Readonly<Record<string, Equipment>>,
  reputationTier: ReputationTier,
  rng: Rng,
): ServiceJobType {
  const eligibleTypes = types.filter(
    (t) =>
      t.work.kind !== 'install' || reputationAtLeast(reputationTier, INSTALL_OFFER_MIN_REPUTATION),
  )
  const pool = eligibleTypes.length > 0 ? eligibleTypes : types // never leave zero candidates
  let picked = pool[0]!
  for (let attempt = 0; attempt < MAX_TYPE_PICK_ATTEMPTS; attempt++) {
    picked = rng.pick(pool)
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
 * name, and a flavor line are picked independently - a flavor line can never
 * be paired with a `work` it wasn't written for, since it only ever lives in
 * its own type's pool. `currentYear` (Sprint 10, default Infinity =
 * unrestricted) excludes still-unreleased models and clamps the rolled car's
 * year, same as auction generation - a customer's car is bound by the same
 * in-game calendar a lot is. `ownedEquipmentIds`/`equipmentById` (Sprint 16,
 * both default to "nothing owned") drive the job-board equipment hinting
 * policy above - mostly filter out repair offers the player can't act on yet.
 * `reputationTier` (Sprint 25 task 10, default `'legend'` = unrestricted)
 * gates install-kind offers behind `INSTALL_OFFER_MIN_REPUTATION`.
 */
export function generateServiceJobOffers(
  types: readonly ServiceJobType[],
  customerNames: readonly string[],
  models: readonly CarModel[],
  economy: EconomyConfig,
  day: number,
  count: number,
  expiresInDays: number,
  rng: Rng,
  currentYear: number = Infinity,
  ownedEquipmentIds: readonly string[] = [],
  equipmentById: Readonly<Record<string, Equipment>> = {},
  reputationTier: ReputationTier = 'legend',
): ServiceJob[] {
  const eligibleModels = models.filter((model) => model.spec.yearFrom <= currentYear)
  if (types.length === 0 || customerNames.length === 0 || eligibleModels.length === 0) return []
  const offers: ServiceJob[] = []
  for (let i = 0; i < count; i++) {
    const type = pickServiceJobType(types, ownedEquipmentIds, equipmentById, reputationTier, rng)
    const model = rng.pick(eligibleModels)
    const [minPayout, maxPayout] = type.payoutRangeYen
    const car = generateAuctionCarInstance(model, `svc-car-${day}-${i}`, rng, economy, currentYear)
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
      arrivesOnDay: null,
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
 * activeServiceJobs the moment the player clicks Accept. The parking slot is
 * claimed immediately (Sprint 25 task 2: a full garage still blocks
 * acceptance, exactly as before), but the customer's car itself doesn't
 * arrive until `SERVICE_JOB_ARRIVAL_DELAY_DAYS` later - "I'll drop it off
 * first thing in the morning," not an instant teleport into the shop. The
 * work deadline (`dueOnDay`) is counted from that arrival day, not from
 * acceptance, so the in-transit day never silently eats into it. Needs a
 * free parking space to take delivery; a full shop just leaves the offer on
 * the board rather than spending anything. Shared by the player's instant
 * click and advanceDay's bot batch loop (one queued accept per call,
 * matching every other Sprint 11 instant resolver's shape).
 *
 * Sprint 13: a `repair`-kind offer additionally needs the matching component's
 * equipment owned - "can't even accept them without it," per the design doc.
 * `install`-kind offers are never gated (replace is always available). The
 * maintainer's own read is that an unreachable repair offer arguably
 * shouldn't be generated in the first place, not surfaced-then-blocked; that
 * refinement is deliberately deferred (tracked in TODO.md) - this sprint
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
  const arrivesOnDay = state.day + SERVICE_JOB_ARRIVAL_DELAY_DAYS
  const activeJob: ServiceJob = {
    ...offer,
    arrivesOnDay,
    dueOnDay: arrivesOnDay + SERVICE_JOB_DEADLINE_DAYS,
  }
  const withCar = assignToParking(
    {
      ...state,
      serviceJobOffers: state.serviceJobOffers.filter((o) => o.id !== offerId),
      activeServiceJobs: [...state.activeServiceJobs, activeJob],
    },
    offer.car.id,
  )
  return {
    state: withCar,
    log: [{ type: 'service-job-accepted', jobId: offer.id, carInstanceId: offer.car.id }],
  }
}

/**
 * True while an accepted job's customer car is still in transit - claimed a
 * slot, but not yet actually in the shop (Sprint 25 task 2). Cleared by
 * `advanceDay`'s day-boundary tick, same shape as `resolvePartDeliveries`.
 */
export function isServiceJobInTransit(job: ServiceJob, day: number): boolean {
  return job.arrivesOnDay !== null && job.arrivesOnDay > day
}

export interface ServiceJobArrivalResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Day-boundary resolution for in-transit customer cars (Sprint 25 task 2) -
 * same pre-increment day arithmetic as `resolvePartDeliveries` (parts.ts):
 * `advanceDay` calls this before its own `state.day` increments, so a job
 * accepted on day N (`arrivesOnDay: N + 1`) must clear here during the very
 * call that turns N into N + 1, not the next one - otherwise the car would
 * still read as in-transit for a full extra day after the player lands on
 * the day it was supposed to arrive.
 */
export function resolveServiceJobArrivals(state: GameState): ServiceJobArrivalResult {
  let changed = false
  const activeServiceJobs = state.activeServiceJobs.map((job) => {
    if (job.arrivesOnDay === null || job.arrivesOnDay > state.day + 1) return job
    changed = true
    return { ...job, arrivesOnDay: null }
  })
  if (!changed) return { state, log: [] }
  return { state: { ...state, activeServiceJobs }, log: [] }
}

/**
 * Whether the customer's required work has actually been done on their car.
 *
 * Sprint 26 decision 13 (the group-level "bridge"): `job.work.componentId`
 * is a 6-way group, not a single part slot - a repair job is done when
 * every present, repairable (non-scrap) part in the group has reached
 * `mint` (scrap parts are out of repair's reach entirely, so they don't
 * block completion); an install job is done once ANY present part in the
 * group has something installed (the customer's car rolls every part
 * empty, same as an auction car, so the first install in the group is
 * necessarily the one the player just did).
 */
export function isServiceWorkDone(job: ServiceJob, context: SimContext): boolean {
  const partIds = presentPartIdsInGroup(job.car, job.work.componentId, context.partIdsByGroup)
  if (job.work.kind === 'repair') {
    return partIds.every(
      (id) => job.car.parts[id].band === 'mint' || job.car.parts[id].band === 'scrap',
    )
  }
  return partIds.some((id) => job.car.parts[id].installed !== null)
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

/** The catalog part installed for an install job's group (undefined for repair jobs). */
function installedPart(job: ServiceJob, context: SimContext) {
  if (job.work.kind !== 'install') return undefined
  const partIds = presentPartIdsInGroup(job.car, job.work.componentId, context.partIdsByGroup)
  const installedPartId = partIds.find((id) => job.car.parts[id].installed !== null)
  const instance = installedPartId ? job.car.parts[installedPartId].installed : null
  return instance ? context.partsById[instance.partId] : undefined
}

/**
 * Resolve one active service job by handing the car back to its customer. The
 * single source of truth for job resolution, shared by the player's immediate
 * "Complete Job" click and advanceDay's deadline backstop:
 *  - work done  -> pay the fixed payout + grant reputation (grade-scaled),
 *  - work undone -> no pay + reputation penalty.
 * Either way the customer's car leaves and any leftover jobs on it are dropped.
 * advanceDay is never what *decides* a player's job is done - this is.
 */
export function resolveServiceJob(
  state: GameState,
  jobId: string,
  context: SimContext,
): ServiceJobResolution {
  const job = state.activeServiceJobs.find((sj) => sj.id === jobId)
  if (!job) return { state, log: [], outcome: 'not-found' }

  const releasedState = clearStagedWork(releaseCarFromShop(state, job.car.id), job.car.id)
  const activeServiceJobs = releasedState.activeServiceJobs.filter((sj) => sj.id !== jobId)
  const jobs = releasedState.jobs.filter((j) => j.carInstanceId !== job.car.id)

  if (isServiceWorkDone(job, context)) {
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
