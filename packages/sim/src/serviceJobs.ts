import type {
  CarInstance,
  CarModel,
  ComponentId,
  DayLogEntry,
  GameState,
  Grade,
  Part,
  ReputationTier,
  ServiceJob,
  ServiceJobTask,
  ServiceJobType,
} from '@midnight-garage/content'
import { generateAuctionCarInstance } from './auctions'
import { bandIndex, canRepair, gradesBetween, slotsNeededToClimb } from './bands'
import { applyReputationDelta, reputationAtLeast } from './calendar'
import {
  GRADE_REPUTATION_MULTIPLIER,
  INSTALL_LABOR_SLOTS,
  JOB_HINT_OFFER_CHANCE,
  SERVICE_JOB_ARRIVAL_DELAY_DAYS,
  SERVICE_JOB_FAILURE_REP_MULTIPLIER,
  SERVICE_JOB_TIER_MIN_REPUTATION,
} from './constants'
import type { SimContext } from './context'
import { hasEquipmentFor, hasEquipmentForIds } from './equipment'
import { assignToParking, hasParkingSpace, releaseCarFromShop } from './facilities'
import { gradeAtLeast, partFitsCar } from './parts'
import type { Rng } from './rng'
import { clearStagedWork } from './stagedWork'

/** Attempts a fresh pick can't exceed before falling back to whatever was last rolled
 * (an extremely rare edge case - every template gated and every hint roll missing). */
const MAX_TYPE_PICK_ATTEMPTS = 20

/** Sprint 33 decision 2: the hard cap on how many distinct equipment groups
 * a template may still be missing and still be offer-eligible at all - "one
 * purchase away," never two or more. Templates needing more are excluded
 * from the candidate pool entirely (`actionableOrOnePurchaseAwayTemplates`
 * below), not merely de-weighted by the existing hint-chance reroll. */
const MAX_MISSING_EQUIPMENT_GROUPS_FOR_OFFER = 1

/** Every distinct component group `template` needs repair equipment for that
 * `ownedEquipmentIds` doesn't already cover - install tasks never count
 * (replace never needs equipment). Two tasks needing the SAME ungowned group
 * count once, since one purchase fixes both. */
function missingEquipmentGroups(
  template: ServiceJobType,
  ownedEquipmentIds: readonly string[],
  context: SimContext,
): Set<ComponentId> {
  const missingGroups = new Set<ComponentId>()
  for (const task of template.tasks) {
    if (task.action !== 'repair') continue
    const group = context.partsTaxonomyById[task.carPartId]?.group
    if (!group) continue
    if (!hasEquipmentForIds(ownedEquipmentIds, context.equipmentById, group)) {
      missingGroups.add(group)
    }
  }
  return missingGroups
}

/** Whether the player could BUY, at `reputationTier` right now, a machine that
 * covers `group`. Equipment with no `minReputationTier` is purchasable from the
 * start (the tyre machine). This is what makes "one purchase away" mean a
 * purchase the player can actually make today, not "one purchase, someday": a
 * group whose only machine is locked behind a higher tier is unreachable now,
 * so a job needing it must not be offered until that tier is reached. */
function groupHasPurchasableEquipment(
  group: ComponentId,
  reputationTier: ReputationTier,
  context: SimContext,
): boolean {
  for (const equipment of Object.values(context.equipmentById)) {
    if (!equipment.componentIds.includes(group)) continue
    if (reputationAtLeast(reputationTier, equipment.minReputationTier ?? 'unknown')) {
      return true
    }
  }
  return false
}

/**
 * Sprint 33 decision 2 (completed here): a service-job offer is generated ONLY
 * if the player can complete it now, or needs exactly ONE equipment purchase
 * THEY CAN MAKE RIGHT NOW at their current reputation. The original Sprint 33
 * filter counted missing groups (<= 1) but never checked the missing machine
 * was actually buyable, so a day-one `unknown`-reputation player could be
 * offered a cooling repair needing the Engine Crane - a `known`-tier, Y1.5M
 * machine two tiers out of reach. "One purchase away" now means a purchase
 * unlocked at the current tier: a single missing group whose only machine is
 * reputation-locked excludes the template outright (it is not shown as a
 * buy-this hint, it is simply not offered until that tier is reached). This is
 * still a hard pre-filter, not a probability, so the DoD's "job board never
 * offers an un-doable job" holds regardless of RNG luck; `pickServiceJobTemplate`'s
 * existing per-candidate hint roll still decides how OFTEN a surviving 1-missing
 * template surfaces. Extends Sprint 29's tier gating + the Sprint 16
 * equipment-hint mechanic rather than forking a second gate (directive 16).
 */
function actionableOrOnePurchaseAwayTemplates(
  templates: readonly ServiceJobType[],
  ownedEquipmentIds: readonly string[],
  reputationTier: ReputationTier,
  context: SimContext,
): ServiceJobType[] {
  return templates.filter((template) => {
    const missing = missingEquipmentGroups(template, ownedEquipmentIds, context)
    if (missing.size > MAX_MISSING_EQUIPMENT_GROUPS_FOR_OFFER) return false
    // Every missing group (0 or 1) must be coverable by a machine buyable now.
    for (const group of missing) {
      if (!groupHasPurchasableEquipment(group, reputationTier, context)) return false
    }
    return true
  })
}

/**
 * Picks one service-job template for an offer (Sprint 29): a template that
 * needs equipment the player doesn't own for at least one of its repair
 * tasks is normally rerolled, but a flat `JOB_HINT_OFFER_CHANCE`
 * per-candidate probability lets it through anyway as a "here's what's
 * next" hint - the same policy Sprint 16 shipped for single-task types,
 * extended to "any repair task in this template needs unowned equipment."
 * Install-only tasks are never filtered here (replace is always available).
 *
 * The candidate pool passed in has already been tier-gated by the caller
 * (Sprint 25 task 10's own reasoning, generalized to all 4 tiers): filtering
 * BEFORE rolling, not rerolling inline, is what keeps this function's
 * `MAX_TYPE_PICK_ATTEMPTS` fallback safe - it can only ever return something
 * already reputation-eligible.
 */
function pickServiceJobTemplate(
  templates: readonly ServiceJobType[],
  ownedEquipmentIds: readonly string[],
  context: SimContext,
  rng: Rng,
): ServiceJobType {
  let picked = templates[0]!
  for (let attempt = 0; attempt < MAX_TYPE_PICK_ATTEMPTS; attempt++) {
    picked = rng.pick(templates)
    const needsUnownedEquipment = picked.tasks.some((task) => {
      if (task.action !== 'repair') return false
      const group = context.partsTaxonomyById[task.carPartId]?.group
      return !group || !hasEquipmentForIds(ownedEquipmentIds, context.equipmentById, group)
    })
    if (!needsUnownedEquipment || rng.next() < JOB_HINT_OFFER_CHANCE) return picked
  }
  return picked
}

/** Sorted-median of a non-empty yen list, rounded to the nearest yen - the
 * "market price for this grade of part" an install task's cost derives
 * from (Sprint 29 decision 1), not the cheapest or most expensive option. */
function medianYen(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
}

/**
 * Every catalog part that fits `model` on this exact `carPartId` slot,
 * preferring an exact grade match to `task.minGrade` and falling back first
 * to "at least that grade," then to any fitting part at all. A subset's
 * median is always >= the full fitting set's minimum (a subset's smallest
 * member is never below the superset's smallest), so pricing off the
 * narrowest non-empty tier here can only ever price a task AT OR ABOVE what
 * the player could actually pay for the cheapest part that satisfies the
 * task's real "at least minGrade" requirement - the structural reason the
 * profitability invariant holds regardless of catalog grade-coverage gaps
 * (see `deriveServiceJobPayoutYen`'s own doc comment).
 */
function fittingPartsForInstallTask(
  task: Extract<ServiceJobTask, { action: 'install' }>,
  model: CarModel,
  context: SimContext,
): Part[] {
  const group = context.partsTaxonomyById[task.carPartId]?.group
  if (!group) return []
  const allFitting = context.parts.filter((part) =>
    partFitsCar(part, model, group, context.partsTaxonomyById, task.carPartId),
  )
  const exact = allFitting.filter((part) => part.grade === task.minGrade)
  if (exact.length > 0) return exact
  const atLeast = allFitting.filter((part) => gradeAtLeast(part.grade, task.minGrade))
  return atLeast.length > 0 ? atLeast : allFitting
}

export interface ServiceJobCostBreakdown {
  /** Sum of every task's material cost (Sprint 29 decision 1): an install
   * task's median fitting-part price, a repair task's banded-steps cost. */
  taskCostYen: number
  /** Total labor slots the task list nominally takes, at base (level-1,
   * "worst case tooling") repair speed - a market rate for the job's wrench
   * time, independent of the shop's own current equipment tier (that only
   * changes how many DAYS the work actually takes the player, never what
   * the customer is nominally being charged for). */
  laborSlots: number
}

/**
 * The material-cost + labor-slot inputs `deriveServiceJobPayoutYen` prices
 * (Sprint 29 decision 1) - split out so the profitability invariant test can
 * inspect the same numbers a real offer derives from, not just the final
 * rounded payout. A repair task on a part that's already at or above
 * `targetBand`, or that's rolled `scrap` (unrepairable, Sprint 26 decision
 * 5 - the job's own `isServiceTaskDone` already treats scrap as satisfied),
 * contributes 0 to both totals: there is genuinely nothing left to charge
 * or labor for.
 */
export function serviceJobCostBreakdown(
  tasks: readonly ServiceJobTask[],
  car: CarInstance,
  model: CarModel,
  context: SimContext,
): ServiceJobCostBreakdown {
  let taskCostYen = 0
  let laborSlots = 0
  for (const task of tasks) {
    if (task.action === 'repair') {
      const entry = context.partsTaxonomyById[task.carPartId]
      const installed = car.parts[task.carPartId].installed
      // Sprint 32: a missing slot has no band to climb - out of repair's
      // reach exactly like scrap is (0 cost/labor), rather than crashing on
      // a null read.
      if (!entry || !installed || !canRepair(installed.band)) continue
      const grades = gradesBetween(installed.band, task.targetBand)
      taskCostYen += grades * entry.stepCostYen
      laborSlots += slotsNeededToClimb(grades, 1)
    } else {
      const candidates = fittingPartsForInstallTask(task, model, context)
      taskCostYen += medianYen(candidates.map((part) => part.priceYen))
      laborSlots += INSTALL_LABOR_SLOTS
    }
  }
  return { taskCostYen, laborSlots }
}

/**
 * The payout formula (Sprint 29 decision 1): `round((taskCostYen + laborSlots
 * * laborRateYen) * margin + calloutFeeYen)`. Computed once, at generation
 * time, against the specific customer car just rolled - never re-derived
 * once an offer exists (an in-flight job keeps whatever it was quoted, same
 * as every other locked-in-at-creation price in this codebase).
 *
 * **The profitability invariant** (tested as a property in
 * `tests/serviceJobPayout.test.ts`): for every template x every roster
 * model, the worst payout roll (`margin = marginMin`) covers the player's
 * minimum achievable cost (the same `serviceJobCostBreakdown` taskCostYen,
 * since a repair task's cost is deterministic - no player choice - and an
 * install task's true cheapest option is never above this function's
 * median-of-the-narrowest-fitting-tier basis, per `fittingPartsForInstallTask`'s
 * own doc comment) by at least 1.15x. Because `taskCostYen` is identical on
 * both sides of that comparison, the ratio collapses to `margin +
 * (laborSlots * laborRateYen + calloutFeeYen) / taskCostYen >= marginMin`,
 * which holds structurally as long as `marginMin >= 1.15` - true by a
 * comfortable margin at the proposed 1.20 floor, and the labor/callout terms
 * only add further headroom. This is what "derived, never authored"
 * structurally retires: Sprint 25 task 10's guaranteed-loss bug (an authored
 * flat payout blind to the parts market) cannot recur under this formula,
 * for any current or future template.
 */
export function deriveServiceJobPayoutYen(
  tasks: readonly ServiceJobTask[],
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  marginRoll: number,
): number {
  const { taskCostYen, laborSlots } = serviceJobCostBreakdown(tasks, car, model, context)
  const { laborRateYen, calloutFeeYen } = context.economy.serviceJobs
  return Math.round((taskCostYen + laborSlots * laborRateYen) * marginRoll + calloutFeeYen)
}

/** A uniform margin roll in `[marginMin, marginMax]` (Sprint 29 decision 1). */
function rollMargin(context: SimContext, rng: Rng): number {
  const { marginMin, marginMax } = context.economy.serviceJobs
  return marginMin + rng.next() * (marginMax - marginMin)
}

/** How many fresh offers land on the board today: a discrete weighted draw
 * over `economy.json`'s `serviceJobs.dailyOfferCountWeights` (Sprint 29
 * decision 4 - index 0 is the weight for 0 offers, index 4 for 4). Board
 * pressure is the point: more offers than a solo wrench can take. */
function sampleDailyOfferCount(weights: readonly number[], rng: Rng): number {
  const roll = rng.next()
  let cumulative = 0
  for (let count = 0; count < weights.length; count++) {
    cumulative += weights[count]!
    if (roll < cumulative) return count
  }
  return weights.length - 1
}

/**
 * Generates today's fresh batch of service-job offers (Sprint 29: replaces
 * the Sprint 11 weekly fixed-count dump with a daily bell-curve draw).
 * Each carries a real customer car (rolled like an auction car) and a
 * payout derived from the template's own task list against that specific
 * car (`deriveServiceJobPayoutYen`) - never an authored flat range.
 * `reputationTier` (default `'legend'` = unrestricted) gates which template
 * TIERS are even in the candidate pool (Sprint 29 decision 2); within that
 * pool, `ownedEquipmentIds` (default "nothing owned") first hard-excludes
 * any template needing 2+ equipment purchases
 * (`actionableOrOnePurchaseAwayTemplates`, Sprint 33 decision 2), then drives
 * the same equipment-hinting policy Sprint 16 shipped for what's left,
 * extended to multi-task templates by `pickServiceJobTemplate`. `currentYear`
 * (default Infinity = unrestricted) excludes still-unreleased models and
 * clamps the rolled car's year, same as auction generation.
 */
export function generateDailyServiceJobOffers(
  context: SimContext,
  day: number,
  expiresInDays: number,
  rng: Rng,
  currentYear: number = Infinity,
  ownedEquipmentIds: readonly string[] = [],
  reputationTier: ReputationTier = 'legend',
): ServiceJob[] {
  const eligibleModels = context.models.filter((model) => model.spec.yearFrom <= currentYear)
  const tierEligibleTemplates = context.serviceJobTypes.filter((template) =>
    reputationAtLeast(reputationTier, SERVICE_JOB_TIER_MIN_REPUTATION[template.tier]),
  )
  const eligibleTemplates = actionableOrOnePurchaseAwayTemplates(
    tierEligibleTemplates,
    ownedEquipmentIds,
    reputationTier,
    context,
  )
  if (
    eligibleTemplates.length === 0 ||
    context.serviceJobCustomerNames.length === 0 ||
    eligibleModels.length === 0
  ) {
    return []
  }

  const count = sampleDailyOfferCount(context.economy.serviceJobs.dailyOfferCountWeights, rng)
  const offers: ServiceJob[] = []
  for (let i = 0; i < count; i++) {
    const template = pickServiceJobTemplate(eligibleTemplates, ownedEquipmentIds, context, rng)
    const model = rng.pick(eligibleModels)
    const car = generateAuctionCarInstance(model, `svc-car-${day}-${i}`, rng, context, currentYear)
    const payoutYen = deriveServiceJobPayoutYen(
      template.tasks,
      car,
      model,
      context,
      rollMargin(context, rng),
    )
    offers.push({
      id: `svc-${day}-${i}`,
      typeId: template.id,
      customerName: rng.pick(context.serviceJobCustomerNames),
      description: rng.pick(template.flavorPool),
      tasks: template.tasks,
      car,
      payoutYen,
      baseReputation: template.baseReputation,
      deadlineDays: template.deadlineDays,
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
 * work deadline (`dueOnDay`) is counted from that arrival day using the
 * OFFER's own `deadlineDays` (Sprint 29: a per-template value, replacing the
 * old flat `SERVICE_JOB_DEADLINE_DAYS` constant), so the in-transit day
 * never silently eats into it. Needs a free parking space to take delivery;
 * a full shop just leaves the offer on the board rather than spending
 * anything. Shared by the player's instant click and advanceDay's bot batch
 * loop (one queued accept per call, matching every other Sprint 11 instant
 * resolver's shape).
 *
 * Sprint 13: any `repair`-kind task additionally needs its group's matching
 * equipment owned - "can't even accept them without it," per the design
 * doc, extended in Sprint 29 to "every repair task in the whole job," since
 * a multi-task offer can no longer be reduced to one single group. A
 * template with no repair tasks at all (every task is `install`) is never
 * gated (replace is always available). The maintainer's own read is that an
 * unreachable repair offer arguably shouldn't be generated in the first
 * place, not surfaced-then-blocked; that refinement is deliberately
 * deferred (tracked in TODO.md) - this sprint ships the simpler accept-time
 * block, same as before.
 */
export function resolveAcceptServiceJob(
  state: GameState,
  offerId: string,
  context: SimContext,
): AcceptServiceJobResult {
  const offer = state.serviceJobOffers.find((o) => o.id === offerId)
  if (!offer) return { state, log: [] }

  const missingEquipmentForTask = offer.tasks.find((task) => {
    if (task.action !== 'repair') return false
    const group = context.partsTaxonomyById[task.carPartId]?.group
    return !group || !hasEquipmentFor(state, group, context)
  })
  if (missingEquipmentForTask) {
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
    dueOnDay: arrivesOnDay + offer.deadlineDays,
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

/** Whether one task has actually been satisfied on the customer's car - a
 * repair task once its part reaches `targetBand` (or is `scrap`, or the
 * slot is empty - both unrepairable and therefore out of repair's reach
 * entirely, Sprint 26 decision 5 / Sprint 32); an install task once its
 * slot holds a catalog part graded at least `minGrade` (Sprint 29: "at
 * least," a player who overdelivers still passes, same as the offer's own
 * cost basis being priced off the narrowest satisfying tier - see
 * `fittingPartsForInstallTask`). */
export function isServiceTaskDone(
  car: CarInstance,
  task: ServiceJobTask,
  partsById: Readonly<Record<string, Part>>,
): boolean {
  if (task.action === 'repair') {
    const installed = car.parts[task.carPartId].installed
    if (!installed) return true
    return installed.band === 'scrap' || bandIndex(installed.band) >= bandIndex(task.targetBand)
  }
  const installed = car.parts[task.carPartId].installed
  if (!installed) return false
  const part = partsById[installed.partId]
  return !!part && gradeAtLeast(part.grade, task.minGrade)
}

/**
 * Whether the customer's required work has actually been done on their car -
 * every task in the job's list satisfied (Sprint 29: extends the Sprint 26
 * group-level "bridge" to a real per-task, per-part list). Multi-task
 * completion requires ALL tasks done; a partial hand-back is the existing
 * failure path (`resolveServiceJob` below), unchanged.
 */
export function isServiceWorkDone(job: ServiceJob, context: SimContext): boolean {
  return job.tasks.every((task) => isServiceTaskDone(job.car, task, context.partsById))
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

/** Every catalog part actually installed by one of `job`'s install tasks
 * (Sprint 29: a job can now have several, not at most one) - the basis for
 * both the completion reputation grade and the part-cost/profit log fields. */
function installedTaskParts(job: ServiceJob, context: SimContext): Part[] {
  const result: Part[] = []
  for (const task of job.tasks) {
    if (task.action !== 'install') continue
    const installed = job.car.parts[task.carPartId].installed
    const part = installed ? context.partsById[installed.partId] : undefined
    if (part) result.push(part)
  }
  return result
}

/** The priciest grade among a job's installed task parts (Sprint 29: a
 * multi-install job's reputation scales off its best part, matching the old
 * single-install "pricier grade earns more reputation" rule); `null` for a
 * repair-only job (no install task at all), which earns the stock rate. */
function highestInstalledGrade(parts: readonly Part[]): Grade | null {
  let best: Grade | null = null
  for (const part of parts) {
    if (best === null || gradeAtLeast(part.grade, best)) best = part.grade
  }
  return best
}

/**
 * Resolve one active service job by handing the car back to its customer. The
 * single source of truth for job resolution, shared by the player's immediate
 * "Complete Job" click and advanceDay's deadline backstop:
 *  - work done  -> pay the fixed payout + grant reputation (grade-scaled),
 *  - work undone -> no pay + reputation penalty.
 * Either way the customer's car leaves and any leftover jobs on it are dropped.
 * advanceDay is never what *decides* a player's job is done - this is.
 *
 * Sprint 35 decision 5 (close-out reconciliation): every path a job ends by
 * (paid here on a "Complete" click, failed here on a partial hand-back, or
 * either of those via advanceDay's deadline backstop - which calls this exact
 * function) removes every `partInventory` entry tagged with this job's
 * `customerJobId`. A customer part the player pulled and replaced leaves with
 * the customer via this step; a customer part the player repaired and refitted
 * is already back on the car and leaves with it. Player-owned parts are never
 * touched. This is the single close-out hook because this is the single place
 * an ACTIVE job (one that could have parts pulled) ever ends - an unaccepted
 * OFFER expiring pulls no parts, so it needs no reconciliation.
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
  // Sprint 35 decision 5: the customer's pulled parts (tagged with this job)
  // leave with them at close-out; any in-flight recondition job on one of
  // those parts goes with it (nothing left to bench-repair), alongside the
  // usual dropping of car jobs on the departing car.
  const reconciledPartIds = new Set(
    releasedState.partInventory.filter((p) => p.customerJobId === job.id).map((p) => p.id),
  )
  const jobs = releasedState.jobs.filter(
    (j) =>
      j.carInstanceId !== job.car.id &&
      !(
        j.kind === 'recondition-part' &&
        j.partInstanceId !== undefined &&
        reconciledPartIds.has(j.partInstanceId)
      ),
  )
  const partInventory = releasedState.partInventory.filter((p) => p.customerJobId !== job.id)

  if (isServiceWorkDone(job, context)) {
    const installedParts = installedTaskParts(job, context)
    const reputationGained = reputationForCompletion(
      job.baseReputation,
      highestInstalledGrade(installedParts),
    )
    const partCostYen =
      installedParts.length > 0
        ? installedParts.reduce((sum, part) => sum + part.priceYen, 0)
        : undefined
    const acceptedOnDay = job.dueOnDay === null ? null : job.dueOnDay - job.deadlineDays
    const withReputation = applyReputationDelta(releasedState, reputationGained)
    return {
      state: {
        ...withReputation,
        cashYen: withReputation.cashYen + job.payoutYen,
        activeServiceJobs,
        jobs,
        partInventory,
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
    state: { ...withReputation, activeServiceJobs, jobs, partInventory },
    log: [{ type: 'service-job-failed', jobId: job.id, reputationLost }],
    outcome: 'failed',
  }
}

/** Shared lookup for callers (bots, the game store) that need to know which
 * of the 6 component groups a task's `carPartId` belongs to without reaching
 * into `context.partsTaxonomyById` directly. */
export function taskGroup(task: ServiceJobTask, context: SimContext): ComponentId | undefined {
  return context.partsTaxonomyById[task.carPartId]?.group
}
