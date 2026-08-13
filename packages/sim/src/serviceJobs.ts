import type {
  CarInstance,
  CarLedger,
  CarModel,
  CarPartId,
  ComponentId,
  DayLogEntry,
  GameState,
  Grade,
  Part,
  ReputationTier,
  ServiceJob,
  ServiceJobTask,
  ServiceJobType,
  ToolLevels,
} from '@midnight-garage/content'
import { fitmentClassForTier } from '@midnight-garage/content'
import { dissolveAssembliesForCar } from './assemblies'
import { carOriginLabel, generateAuctionCarInstance, stockInstanceFor } from './auctions'
import { bandsBelowExcludingScrap, planPartRepair } from './bands'
import { craftOperationCapabilityGateReason } from './machiningJobs'
import { applyReputationDelta, reputationAtLeast } from './reputation'
import {
  GRADE_REPUTATION_MULTIPLIER,
  SERVICE_JOB_ARRIVAL_DELAY_DAYS,
  SERVICE_JOB_TIER_MIN_REPUTATION,
} from './constants'
import type { SimContext } from './context'
import { assignToShop, hasAcquisitionSpace, releaseCarFromShop } from './facilities'
import { bookCashMovements } from './financeLedger'
import { installLaborSlotsFor } from './jobs'
import { gradeAtLeast, partFitsCar, reconcileStations } from './parts'
import { makeCarOrigin, partsOriginatingFromCar } from './provenance'
import { evaluateRequirement } from './requirements'
import type { Rng } from './rng'
import { deleteServiceJobLedger, serviceJobLedgerFor } from './serviceJobLedger'
import { freshToolLevels, toolLevelsFor } from './toolLines'

/** A placeholder ledger for `isServiceTaskDone`'s call into
 * `evaluateRequirement` - `slotCondition` never reads `ledger`/`day`, but
 * the shared evaluator signature carries them for potential future primitives. */
const EMPTY_LEDGER: CarLedger = {
  purchaseYen: null,
  repairYen: 0,
  partsYen: 0,
  listingFeesYen: 0,
}

/**
 * How many levels short the garage's tool line is of `task.minToolTier` -
 * `max(0, minToolTier - toolLevels[group])`. 0 means the task's capability
 * ceiling is met.
 */
export function taskToolDeficit(
  task: ServiceJobTask,
  toolLevels: ToolLevels,
  context: SimContext,
): number {
  const group = context.partsTaxonomyById[task.requirement.carPartId]?.group
  if (!group) return 0
  return Math.max(0, task.minToolTier - toolLevels[group])
}

export interface ToolDeficitSummary {
  /** The largest per-task deficit across the whole task list. */
  maxDeficit: number
  /** Every DISTINCT group with a deficit above 0. */
  deficientGroups: ComponentId[]
}

/** The whole task list's tool-level deficits, summarized once for the offer
 * rule, the accept gate, the store's `canAccept`/`upgradeHint`, and the
 * bots' own accept decisions - one computation, four callers. */
export function toolDeficitSummary(
  tasks: readonly ServiceJobTask[],
  toolLevels: ToolLevels,
  context: SimContext,
): ToolDeficitSummary {
  let maxDeficit = 0
  const deficientGroups: ComponentId[] = []
  for (const task of tasks) {
    const deficit = taskToolDeficit(task, toolLevels, context)
    if (deficit === 0) continue
    if (deficit > maxDeficit) maxDeficit = deficit
    const group = context.partsTaxonomyById[task.requirement.carPartId]?.group
    if (group && !deficientGroups.includes(group)) deficientGroups.push(group)
  }
  return { maxDeficit, deficientGroups }
}

/**
 * A template is OFFERABLE iff its max tool-level deficit is <= 1 AND at most
 * ONE distinct group is deficient - "one upgrade away," never two levels or
 * two lines out. Affordability is NOT checked: cash is the player's lever
 * and fluctuates daily.
 */
export function isTemplateOfferable(
  tasks: readonly ServiceJobTask[],
  toolLevels: ToolLevels,
  context: SimContext,
): boolean {
  const { maxDeficit, deficientGroups } = toolDeficitSummary(tasks, toolLevels, context)
  return maxDeficit <= 1 && deficientGroups.length <= 1
}

/**
 * The UPGRADE-HINT string an offer with a deficit carries:
 * "needs <the next thing that would close it>" - that group's next rung while
 * one is left, and otherwise the shop covering the group, since above the top
 * rung a shop is the only thing that lifts a line. Null when there is no
 * deficit. Derived live against the current levels, so it clears itself the
 * moment the purchase lands, rather than being stamped stale onto the offer.
 */
export function upgradeHintFor(
  tasks: readonly ServiceJobTask[],
  toolLevels: ToolLevels,
  context: SimContext,
): string | null {
  const { deficientGroups } = toolDeficitSummary(tasks, toolLevels, context)
  const group = deficientGroups[0]
  if (!group) return null
  const nextTier = context.toolLines[group].tiers[toolLevels[group]]
  const name = nextTier ? nextTier.displayName : context.toolShopByGroup[group].displayName
  return `needs ${name}`
}

/**
 * Whether an operation's own capability is unlocked - a thin boolean wrapper
 * over `craftOperationCapabilityGateReason` for the one caller here that only
 * wants a yes/no, not which reason refused it.
 */
function isCraftOperationUnlocked(
  operationId: string,
  toolLevels: ToolLevels,
  context: SimContext,
): boolean {
  const operation = context.economy.machining.operations.find((o) => o.id === operationId)
  if (!operation) return false
  return craftOperationCapabilityGateReason(operation, toolLevels, context) === null
}

/**
 * Whether `template`'s signature gate (`requiresOperationId`) is satisfied
 * right now. A template naming no operation is never signature-gated and
 * always passes. Shared with `resolveAcceptServiceJob`'s live re-check so the
 * two can never disagree about which templates are actually reachable.
 */
function signatureGateSatisfied(
  template: ServiceJobType,
  toolLevels: ToolLevels,
  context: SimContext,
): boolean {
  if (!template.requiresOperationId) return true
  return isCraftOperationUnlocked(template.requiresOperationId, toolLevels, context)
}

/** Sorted-median of a non-empty yen list, rounded to the nearest yen - the
 * "market price for this grade of part" an install task's cost derives
 * from, not the cheapest or most expensive option. */
function medianYen(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
}

/**
 * Every catalog part that fits `model` on this exact `carPartId` slot,
 * preferring an exact grade match to `minGrade` and falling back first
 * to "at least that grade," then to any fitting part at all. A subset's
 * median is always >= the full fitting set's minimum (a subset's smallest
 * member is never below the superset's smallest), so pricing off the
 * narrowest non-empty tier here can only ever price a task AT OR ABOVE what
 * the player could actually pay for the cheapest part that satisfies the
 * task's real "at least minGrade" requirement - the structural reason the
 * profitability invariant holds regardless of catalog grade-coverage gaps
 * (see `deriveServiceJobPayoutYen`'s own doc comment).
 */
function fittingPartsForRequirement(
  carPartId: CarPartId,
  minGrade: Grade,
  model: CarModel,
  context: SimContext,
): Part[] {
  const group = context.partsTaxonomyById[carPartId]?.group
  if (!group) return []
  const allFitting = context.parts.filter((part) =>
    partFitsCar(part, model, group, context.partsTaxonomyById, carPartId),
  )
  const exact = allFitting.filter((part) => part.grade === minGrade)
  if (exact.length > 0) return exact
  const atLeast = allFitting.filter((part) => gradeAtLeast(part.grade, minGrade))
  return atLeast.length > 0 ? atLeast : allFitting
}

export interface ServiceJobCostBreakdown {
  /** Sum of every task's material cost: a grade-requirement task's median
   * fitting-part price, a band-only task's banded-steps repair cost. */
  taskCostYen: number
  /** Total labor slots the task list nominally takes, at base (level-1,
   * "worst case tooling") repair speed - a market rate for the job's wrench
   * time, independent of the shop's own current equipment tier (that only
   * changes how many DAYS the work actually takes the player, never what
   * the customer is nominally being charged for). Removal and blocker
   * refits price through `energy.actionPoints` (zero at shipped tuning), so
   * the teardown chain carries no overhead here - every task simply adds
   * `installLaborSlotsFor` for its own target slot, on top of the
   * bench-repair labour below, since a delivered task always IMPROVES its
   * slot (a customer's task is never a like-for-like refit) and so is
   * always charged.
   */
  laborSlots: number
}

/**
 * The material-cost + labor-slot inputs `deriveServiceJobPayoutYen` prices -
 * split out so the profitability invariant test can inspect the same
 * numbers a real offer derives from, not just the final rounded payout.
 *
 * A task with no `minGrade` prices the bench-repair route (its own
 * installed part, if repairable and NOT scrap, climbed to `minBand`);
 * everything else - a `minGrade` requirement, a scrap or missing slot, or a
 * non-repairable part - prices the buy-new route (the narrowest fitting
 * tier's median price) instead. Neither an empty nor a scrap slot counts as
 * "already done" for a band-only task: both are genuinely outstanding
 * work, priced as the replacement they actually need. The only real
 * 0-cost/labor case is a task ALREADY satisfied (`planPartRepair` itself
 * returns 0 when there's nothing left to climb).
 *
 * Reuses `planPartRepair` (bands.ts) directly rather than re-deriving the
 * grades/cost/labor formula inline - the ONE cost pipeline, never a second
 * bill implementation. A repair-route task's cost derives from the
 * installed instance's own catalog `priceYen`
 * (`context.partsById[installed.partId]`) times `economy.restoration.
 * repairStepFraction`, never a car/model-derived factor. Repair labor sizes
 * at level 1 (base, "worst case tooling" - a market rate for the customer's
 * own wrench time, independent of the shop's actual current tool tier).
 *
 * Removal and blocker refits are free, so a task's own teardown-chain
 * overhead is gone - both routes simply add `installLaborSlotsFor` for the
 * task's own target slot, since a customer task always improves that slot
 * (never a like-for-like refit) and so is always charged.
 */
export function serviceJobCostBreakdown(
  tasks: readonly ServiceJobTask[],
  car: CarInstance,
  model: CarModel,
  context: SimContext,
): ServiceJobCostBreakdown {
  const { repairStepFraction } = context.economy.restoration
  const { energyPerBandStepByToolTier, pointsPerLabour } = context.economy.energy
  let taskCostYen = 0
  // The planners size labour in energy points; the customer payout prices
  // wrench time at a market rate per slot (`serviceJobs.laborRateYen` -
  // energy is the player's own time, not the customer's bill). All labour here
  // is priced at tier 1 (a market baseline), so the conversion is exact.
  let laborEnergy = 0
  for (const task of tasks) {
    const { carPartId, minBand, minGrade } = task.requirement
    const entry = context.partsTaxonomyById[carPartId]
    if (!entry) continue

    const installed = car.parts[carPartId].installed
    const canBenchRepair = !minGrade && installed && installed.band !== 'scrap' && entry.repairable
    if (canBenchRepair) {
      const catalogPart = context.partsById[installed.partId]
      if (!catalogPart) continue
      const plan = planPartRepair(
        installed.band,
        minBand,
        1,
        entry,
        catalogPart.priceYen,
        repairStepFraction,
        energyPerBandStepByToolTier,
      )
      taskCostYen += plan.costYen
      laborEnergy += plan.laborSlotsRequired + installLaborSlotsFor(carPartId, context)
      continue
    }

    // The buy-new route: either a grade requirement (always buys fresh), or
    // a band-only requirement the slot can't reach by repair (scrap, missing,
    // or non-repairable). Both are genuinely outstanding and genuinely priced
    // here as a replacement.
    const candidates = fittingPartsForRequirement(carPartId, minGrade ?? 'stock', model, context)
    const partCostYen = medianYen(candidates.map((part) => part.priceYen))
    taskCostYen += partCostYen
    laborEnergy += installLaborSlotsFor(carPartId, context)
  }
  return { taskCostYen, laborSlots: laborEnergy / pointsPerLabour }
}

/**
 * The payout formula: `round((taskCostYen + laborSlots * laborRateYen) *
 * margin + calloutFeeYen)`. Computed once, at generation time, against the
 * specific customer car just rolled - never re-derived once an offer exists.
 *
 * **The profitability invariant** (tested as a property in
 * `tests/serviceJobPayout.test.ts`): for every template x every roster model,
 * the worst payout roll (`margin = marginMin`) covers the player's minimum
 * achievable cost by at least 1.15x. Because `taskCostYen` is deterministic
 * for repair tasks (no player choice) and install tasks price off the
 * median-of-the-narrowest-fitting-tier basis, the ratio holds structurally as
 * long as `marginMin >= 1.15`.
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

/** A uniform margin roll in `[marginMin, marginMax]`. */
function rollMargin(context: SimContext, rng: Rng): number {
  const { marginMin, marginMax } = context.economy.serviceJobs
  return marginMin + rng.next() * (marginMax - marginMin)
}

/** How many fresh offers land on the board today: a discrete weighted draw
 * over `economy.json`'s `serviceJobs.dailyOfferCountWeights` (index 0 is the
 * weight for 0 offers, index 4 for 4). Board pressure is the point: more
 * offers than a solo wrench can take. */
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
 * The day-1 pacing ramp: a step function (never smooth interpolation; an
 * offer count is always a whole number) over `economy.json`'s
 * `serviceJobs.offerCountCapByDay` ascending `[day, capAtOrAfterThatDay]`
 * pairs. Returns the cap in effect for `day` - the value from the LAST
 * breakpoint whose own day is `<= day`.
 */
function offerCountCapForDay(
  breakpoints: readonly (readonly [number, number])[],
  day: number,
): number {
  let cap = breakpoints[0]![1]
  for (const [thresholdDay, value] of breakpoints) {
    if (day >= thresholdDay) cap = value
  }
  return cap
}

/**
 * The condition bands an install task's original part is rolled down to - a
 * visibly-neglected part so the customer's complaint is honest ("pads are
 * down to metal"), never a manufactured missing slot. Poor or scrap: bad
 * enough to justify a replacement without the odd middle ground of "worn
 * but the customer's furious."
 */
const INSTALL_OUTSTANDING_BANDS = ['poor', 'scrap'] as const

/**
 * Forces every task in `tasks` to be genuinely outstanding on `car` BEFORE a
 * payout is derived from it - a band-only task could otherwise land on a
 * part that already rolled at/above its target band, and a grade-requirement
 * task could land on a slot that already held a part meeting `minGrade`,
 * either of which would read as "already done" the moment the job hit the
 * board, before the player (or bot) ever touched it.
 *
 * A band-only task whose `isServiceTaskDone` is already true installs a
 * fresh stock instance on that exact slot at a band rolled uniformly from
 * strictly BELOW the target (`bandsBelowExcludingScrap` - never scrap, there
 * must be real repair work left).
 *
 * A grade-requirement task's slot is NOT cleared: the customer's car keeps
 * its ORIGINAL part (same `PartInstance.id`), rolled down to a neglected
 * band so the complaint is honest. `isServiceTaskDone`'s completion check is
 * a pure `evaluateRequirement` read of band+grade, no instance-identity
 * comparison needed - rolling the band down to `poor`/`scrap` already
 * guarantees the task is genuinely outstanding on its own (every grade
 * task's `minBand` is `fine`, which a rolled-down part always fails,
 * regardless of whether its grade already qualifies). This structurally
 * kills the "customer says the tyres are worn but the car has no tyres"
 * contradiction: the tyres are present and worn, as described. A slot that
 * is somehow already empty is left empty (defensive; service cars never
 * roll a missing slot).
 *
 * `day` (default 0) stamps any freshly-rolled band-only-task replacement
 * with this same customer car's origin (`makeCarOrigin`) - it is still
 * generation, before the offer ever reaches the board.
 */
export function forceTasksOutstanding(
  car: CarInstance,
  tasks: readonly ServiceJobTask[],
  context: SimContext,
  rng: Rng,
  day: number = 0,
): CarInstance {
  const model = context.modelsById[car.modelId]
  const fitmentClass = model ? fitmentClassForTier(model.tier) : 'everyday'
  const carOrigin = makeCarOrigin(
    car.id,
    model ? carOriginLabel(model, car.year) : car.modelId,
    day,
  )
  let parts = car.parts
  for (const task of tasks) {
    const { carPartId, minBand, minGrade } = task.requirement
    if (minGrade) {
      // Roll the original part down to a neglected band, keeping its
      // instance - present, not missing.
      const installed = parts[carPartId].installed
      if (!installed) continue // defensive: already empty, leave it
      const band = rng.pick(INSTALL_OUTSTANDING_BANDS)
      parts = { ...parts, [carPartId]: { installed: { ...installed, band } } }
      continue
    }
    const working: CarInstance = parts === car.parts ? car : { ...car, parts }
    if (!isServiceTaskDone(working, task, context)) continue
    const candidates = bandsBelowExcludingScrap(minBand)
    if (candidates.length === 0) continue // no valid "still needs repair" band to roll
    const band = rng.pick(candidates)
    const installed = stockInstanceFor(
      carPartId,
      band,
      `${car.id}-part`,
      fitmentClass,
      context.stockPartByCarPartId,
      carOrigin,
    )
    if (!installed) continue // defensive: no stock entry for this slot (never happens for real content)
    parts = { ...parts, [carPartId]: { installed } }
  }
  return parts === car.parts ? car : { ...car, parts }
}

/**
 * Generates today's fresh batch of service-job offers, a daily bell-curve
 * draw. Each carries a real customer car (rolled like an auction car, then
 * run through `forceTasksOutstanding` so the template's tasks are
 * guaranteed genuinely outstanding on it) and a payout derived from the
 * template's own task list against that specific car
 * (`deriveServiceJobPayoutYen`) - never an authored flat range. Each offer's
 * board lifetime is rolled uniformly per offer from
 * `economy.serviceJobs.offerLifetimeDaysRange`. `reputationTier` (default
 * `'legend'` = unrestricted) gates which template TIERS are even in the
 * candidate pool; within that pool, `toolLevels` (default: a fresh garage's
 * all-1) drives the offer rule (`isTemplateOfferable`): a template at most
 * one tool-level upgrade away in at most one line is offerable - shown as an
 * upgrade-hint offer when a deficit exists - and anything further out is
 * not generated at all. `currentYear` (default Infinity = unrestricted)
 * excludes still-unreleased models and clamps the rolled car's year, same
 * as auction generation.
 *
 * A `requiresOperationId` template (a signature template) is excluded from
 * the pool entirely unless that operation's own capability (level 3 of its
 * tool line, which is the shop covering it,
 * `craftOperationCapabilityGateReason`) is met; a template carrying no
 * `requiresOperationId` is never signature-gated at all. Every eligible
 * template is drawn uniformly - no discipline is favoured over another.
 */
export function generateDailyServiceJobOffers(
  context: SimContext,
  day: number,
  rng: Rng,
  currentYear: number = Infinity,
  toolLevels: ToolLevels = freshToolLevels(),
  reputationTier: ReputationTier = 'legend',
): ServiceJob[] {
  const eligibleModels = context.models.filter((model) => model.spec.yearFrom <= currentYear)
  const tierEligibleTemplates = context.serviceJobTypes.filter((template) =>
    reputationAtLeast(reputationTier, SERVICE_JOB_TIER_MIN_REPUTATION[template.tier]),
  )
  const toolReadyTemplates = tierEligibleTemplates.filter((template) =>
    isTemplateOfferable(template.tasks, toolLevels, context),
  )
  const eligibleTemplates = toolReadyTemplates.filter((template) =>
    signatureGateSatisfied(template, toolLevels, context),
  )
  if (
    eligibleTemplates.length === 0 ||
    context.serviceJobCustomerNames.length === 0 ||
    eligibleModels.length === 0
  ) {
    return []
  }

  const [minLifetimeDays, maxLifetimeDays] = context.economy.serviceJobs.offerLifetimeDaysRange
  const rawCount = sampleDailyOfferCount(context.economy.serviceJobs.dailyOfferCountWeights, rng)
  const count = Math.min(
    rawCount,
    offerCountCapForDay(context.economy.serviceJobs.offerCountCapByDay, day),
  )
  const offers: ServiceJob[] = []
  for (let i = 0; i < count; i++) {
    const template = rng.pick(eligibleTemplates)
    const model = rng.pick(eligibleModels)
    // A customer's car never rolls a random missing slot
    // (`allowMissingSlots: false`) - `forceTasksOutstanding` below is the
    // only way one of its slots ends up empty, and only when the job's own
    // install task calls for it. Symptoms only spawn on auction lots, never
    // a customer's own car (`allowSymptoms: false`).
    const rolledCar = generateAuctionCarInstance(
      model,
      `svc-car-${day}-${i}`,
      rng,
      context,
      currentYear,
      false,
      day,
      false,
    )
    // The car and the template rolled fully independently above - force
    // every task genuinely outstanding before pricing the job off it, so
    // the payout (and the job itself) never prices in vacuous "work".
    const car = forceTasksOutstanding(rolledCar, template.tasks, context, rng, day)
    const margin = rollMargin(context, rng)
    const payoutYen = deriveServiceJobPayoutYen(template.tasks, car, model, context, margin)
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
      expiresOnDay: day + rng.int(minLifetimeDays, maxLifetimeDays),
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

export interface RejectServiceJobResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Decline a radial offer. Removes it from the board by id and does nothing
 * else - NO reputation effect and NO day-log entry, so a declined offer
 * leaves no trace at all, exactly as if it had never been made (offer
 * expiry is already penalty-free, so this is pure addition). Returns the
 * state UNCHANGED (same reference) when the id doesn't match a live offer,
 * so a caller can detect the no-op without a log entry to check. Story
 * missions are untouched - they are never on this board.
 */
export function resolveRejectServiceJobOffer(
  state: GameState,
  offerId: string,
): RejectServiceJobResult {
  if (!state.serviceJobOffers.some((o) => o.id === offerId)) return { state, log: [] }
  return {
    state: { ...state, serviceJobOffers: state.serviceJobOffers.filter((o) => o.id !== offerId) },
    log: [],
  }
}

/**
 * The instant accept resolver: moves an offer into activeServiceJobs the
 * moment the player clicks Accept. The parking slot is claimed immediately
 * (a full garage still blocks acceptance), but the customer's car itself
 * doesn't arrive until `SERVICE_JOB_ARRIVAL_DELAY_DAYS` later - "I'll drop
 * it off first thing in the morning," not an instant teleport into the
 * shop. The work deadline (`dueOnDay`) is counted from that arrival day
 * using the OFFER's own `deadlineDays` (a per-template value), so the
 * in-transit day never silently eats into it. Needs a free parking space to
 * take delivery; a full shop just leaves the offer on the board rather than
 * spending anything. Shared by the player's instant click and advanceDay's
 * bot batch loop (one queued accept per call, matching every other instant
 * resolver's shape).
 *
 * An offer with any tool-level deficit (a task whose `minToolTier` exceeds
 * the line's current level) is refused - it was generated as an
 * upgrade-hint offer and becomes acceptable the moment the upgrade lands,
 * since the deficit is re-checked live here rather than stamped at
 * generation time.
 *
 * A signature template's gate is re-checked live here too (reason
 * `'operation'`) - defensive, since generation already excludes a template
 * whose gate is unmet, but the offer could be stale.
 */
export function resolveAcceptServiceJob(
  state: GameState,
  offerId: string,
  context: SimContext,
): AcceptServiceJobResult {
  const offer = state.serviceJobOffers.find((o) => o.id === offerId)
  if (!offer) return { state, log: [] }

  const toolLevels = toolLevelsFor(state, context)
  if (toolDeficitSummary(offer.tasks, toolLevels, context).maxDeficit > 0) {
    return {
      state,
      log: [{ type: 'acquisition-blocked', kind: 'service-accept', reason: 'tool-tier' }],
    }
  }
  const offerTemplate = context.serviceJobTypes.find((t) => t.id === offer.typeId)
  if (offerTemplate && !signatureGateSatisfied(offerTemplate, toolLevels, context)) {
    return {
      state,
      log: [{ type: 'acquisition-blocked', kind: 'service-accept', reason: 'operation' }],
    }
  }
  if (!hasAcquisitionSpace(state)) {
    return {
      state,
      log: [{ type: 'acquisition-blocked', kind: 'service-accept', reason: 'no-space' }],
    }
  }
  const arrivesOnDay = state.day + SERVICE_JOB_ARRIVAL_DELAY_DAYS
  const activeJob: ServiceJob = {
    ...offer,
    arrivesOnDay,
    dueOnDay: arrivesOnDay + offer.deadlineDays,
  }
  const withCar = assignToShop(
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
 * slot, but not yet actually in the shop. Cleared by `advanceDay`'s
 * day-boundary tick, same shape as `resolvePartDeliveries`.
 */
export function isServiceJobInTransit(job: ServiceJob, day: number): boolean {
  return job.arrivesOnDay !== null && job.arrivesOnDay > day
}

export interface ServiceJobArrivalResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * Day-boundary resolution for in-transit customer cars - same
 * pre-increment day arithmetic as `resolvePartDeliveries` (parts.ts):
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
 * Whether one task has actually been satisfied on the customer's car - a
 * one-liner over `evaluateRequirement`. Any route counts: re-fitting the
 * customer's own repaired part, fitting a bought one, or fitting one pulled
 * from a donor all satisfy it equally - there is no instance-identity
 * tracking. An empty or scrap-band slot always fails.
 */
export function isServiceTaskDone(
  car: CarInstance,
  task: ServiceJobTask,
  context: SimContext,
): boolean {
  return evaluateRequirement(task.requirement, car, EMPTY_LEDGER, 0, context).pass
}

/**
 * Whether the customer's required work has actually been done on their car -
 * every task in the job's list satisfied. Multi-task completion requires
 * ALL tasks done; a partial hand-back is the existing failure path
 * (`resolveServiceJob` below).
 */
export function isServiceWorkDone(job: ServiceJob, context: SimContext): boolean {
  return job.tasks.every((task) => isServiceTaskDone(job.car, task, context))
}

/**
 * Reputation earned for completing a job: the base amount scaled by the
 * installed part's grade (repair jobs pass `null` -> the stock/1.0 rate).
 */
export function reputationForCompletion(baseReputation: number, grade: Grade | null): number {
  const multiplier = grade ? GRADE_REPUTATION_MULTIPLIER[grade] : 1
  return Math.round(baseReputation * multiplier)
}

/**
 * `'in-transit'`: the job's customer car hasn't actually arrived yet -
 * `resolveServiceJob`'s own defense-in-depth guard, mirroring
 * `resolveAcceptServiceJob`'s refusal shape. Currently unreachable through
 * normal play (the deadline backstop's own `dueOnDay <= next.day` check can
 * only fire once `dueOnDay`, which is always >= `arrivesOnDay`, has passed -
 * see `resolveServiceJob`'s own doc comment on the guard).
 */
export type ServiceJobOutcome = 'paid' | 'failed' | 'not-found' | 'in-transit'

export interface ServiceJobResolution {
  state: GameState
  log: DayLogEntry[]
  outcome: ServiceJobOutcome
}

/** Every catalog part actually installed by one of `job`'s grade-requirement
 * tasks - the basis for both the completion reputation grade and the
 * part-cost/profit log fields. */
function installedTaskParts(job: ServiceJob, context: SimContext): Part[] {
  const result: Part[] = []
  for (const task of job.tasks) {
    if (!task.requirement.minGrade) continue
    const installed = job.car.parts[task.requirement.carPartId].installed
    const part = installed ? context.partsById[installed.partId] : undefined
    if (part) result.push(part)
  }
  return result
}

/** The priciest grade among a job's installed task parts - a multi-install
 * job's reputation scales off its best part; `null` for a repair-only job
 * (no install task at all), which earns the stock rate. */
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
 *  - work undone -> no pay, and no reputation either way.
 * Either way the customer's car leaves and any leftover jobs on it are dropped.
 *
 * Reputation only ever rises (progression bible, fifth amendment): a job
 * handed back unfinished, or one the deadline caught, earns nothing rather
 * than costing anything. The lost payout and the sunk repair and parts bills
 * are the whole of what a failure costs.
 * advanceDay is never what *decides* a player's job is done - this is.
 *
 * Close-out reconciliation: every path a job ends by (paid here on a
 * "Complete" click, failed here on a partial hand-back, or either of those
 * via advanceDay's deadline backstop - which calls this exact function)
 * removes every `partInventory` entry tagged with this job's
 * `customerJobId`. A customer part the player pulled and replaced leaves
 * with the customer via this step; a customer part the player repaired and
 * refitted is already back on the car and leaves with it. Player-owned
 * parts are never touched. This is the single close-out hook because this
 * is the single place an ACTIVE job (one that could have parts pulled) ever
 * ends - an unaccepted OFFER expiring pulls no parts, so it needs no
 * reconciliation.
 *
 * Defense in depth: refuses outright while the customer's car is still in
 * transit (`isServiceJobInTransit`), mirroring `resolveAcceptServiceJob`'s
 * existing refusal shape. There is no real path to this today - the
 * deadline backstop's own `dueOnDay <= next.day` check can only fire once
 * `dueOnDay` (always >= `arrivesOnDay`) has passed, so an in-transit job is
 * never yet overdue - but the player's "Complete Job" click and this
 * function are the one resolution path every caller shares, so the guard
 * belongs here rather than trusted to every caller re-deriving it
 * themselves.
 */
export function resolveServiceJob(
  state: GameState,
  jobId: string,
  context: SimContext,
): ServiceJobResolution {
  const job = state.activeServiceJobs.find((sj) => sj.id === jobId)
  if (!job) return { state, log: [], outcome: 'not-found' }
  if (isServiceJobInTransit(job, state.day)) return { state, log: [], outcome: 'in-transit' }

  // Read the job's real spend before its ledger is deleted at close-out -
  // the honest report's repair/parts cost lines.
  const ledger = serviceJobLedgerFor(state, job.id)
  // Dissolve any of this car's assemblies still on the bench first - each
  // member drops to the parts bin, so the `partsOriginatingFromCar`
  // reconciliation below returns the customer's benched members with their car.
  const releasedState = deleteServiceJobLedger(
    dissolveAssembliesForCar(releaseCarFromShop(state, job.car.id), job.car.id),
    job.id,
  )
  const activeServiceJobs = releasedState.activeServiceJobs.filter((sj) => sj.id !== jobId)
  // The customer's pulled parts leave with them at close-out; any in-flight
  // recondition job on one of those parts goes with it (nothing left to
  // bench-repair), alongside the usual dropping of car jobs on the
  // departing car. Which parts those are is read from origin
  // (`provenance.ts`), not a mutable tag - every loose inventory part that
  // traces back to this job's car reconciles out.
  const returnedParts = partsOriginatingFromCar(releasedState.partInventory, job.car.id)
  const reconciledPartIds = new Set(returnedParts.map((p) => p.id))
  // A receipt line for what left with the customer - captured as display
  // strings, not ids, since these instances leave `partInventory` in this
  // same step and could never be looked back up afterward.
  const returnedPartDescriptions = returnedParts
    .map((p) => context.partsById[p.partId])
    .filter((part): part is Part => !!part)
    .map((part) => `${part.brand} ${part.name}`)
  const jobs = releasedState.jobs.filter(
    (j) =>
      j.carInstanceId !== job.car.id &&
      !(
        j.kind === 'recondition-part' &&
        j.partInstanceId !== undefined &&
        reconciledPartIds.has(j.partInstanceId)
      ),
  )
  const partInventory = releasedState.partInventory.filter((p) => !reconciledPartIds.has(p.id))
  const returnedPartsLog: DayLogEntry[] =
    returnedPartDescriptions.length > 0
      ? [
          {
            type: 'service-parts-returned',
            jobId: job.id,
            carInstanceId: job.car.id,
            parts: returnedPartDescriptions,
          },
        ]
      : []

  if (isServiceWorkDone(job, context)) {
    const installedParts = installedTaskParts(job, context)
    const reputationGained = reputationForCompletion(
      job.baseReputation,
      highestInstalledGrade(installedParts),
    )
    const acceptedOnDay = job.dueOnDay === null ? null : job.dueOnDay - job.deadlineDays
    const withReputation = applyReputationDelta(releasedState, reputationGained, context.economy)
    // Only the payout moves cash here: the repair and parts figures below are
    // what was already spent (and already booked) on the customer's car.
    const log: DayLogEntry[] = [
      {
        type: 'service-job-completed',
        jobId: job.id,
        payoutYen: job.payoutYen,
        reputationGained,
        repairCostYen: ledger.repairYen,
        partsCostYen: ledger.partsYen,
        netProfitYen: job.payoutYen - ledger.repairYen - ledger.partsYen,
        ...(acceptedOnDay !== null ? { daysSpent: releasedState.day - acceptedOnDay } : {}),
      },
      ...returnedPartsLog,
    ]
    return {
      // The customer's parts have left the warehouse with their car, so any
      // station holding one of them is now clear.
      state: reconcileStations(
        bookCashMovements(
          {
            ...withReputation,
            cashYen: withReputation.cashYen + job.payoutYen,
            activeServiceJobs,
            jobs,
            partInventory,
          },
          log,
          context.economy,
        ),
      ),
      log,
      outcome: 'paid',
    }
  }

  return {
    state: reconcileStations({ ...releasedState, activeServiceJobs, jobs, partInventory }),
    log: [
      {
        type: 'service-job-failed',
        jobId: job.id,
        repairCostYen: ledger.repairYen,
        partsCostYen: ledger.partsYen,
        netProfitYen: -ledger.repairYen - ledger.partsYen,
      },
      ...returnedPartsLog,
    ],
    outcome: 'failed',
  }
}

/** Shared lookup for callers (bots, the game store) that need to know which
 * of the 6 component groups a task's `carPartId` belongs to without reaching
 * into `context.partsTaxonomyById` directly. */
export function taskGroup(task: ServiceJobTask, context: SimContext): ComponentId | undefined {
  return context.partsTaxonomyById[task.requirement.carPartId]?.group
}
