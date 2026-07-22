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
  Technique,
  ToolTiers,
} from '@midnight-garage/content'
import { ComponentIdSchema, fitmentClassForTier } from '@midnight-garage/content'
import { dissolveAssembliesForCar } from './assemblies'
import { carOriginLabel, generateAuctionCarInstance, stockInstanceFor } from './auctions'
import { bandsBelowExcludingScrap, planPartRepair } from './bands'
import { applyReputationDelta, reputationAtLeast } from './calendar'
import {
  GRADE_REPUTATION_MULTIPLIER,
  SERVICE_JOB_ARRIVAL_DELAY_DAYS,
  SERVICE_JOB_FAILURE_REP_MULTIPLIER,
  SERVICE_JOB_TIER_MIN_REPUTATION,
} from './constants'
import type { SimContext } from './context'
import { assignToShop, hasAcquisitionSpace, releaseCarFromShop } from './facilities'
import { installLaborSlotsFor } from './jobs'
import { gradeAtLeast, partFitsCar } from './parts'
import { makeCarOrigin, partsOriginatingFromCar } from './provenance'
import { evaluateRequirement } from './requirements'
import type { Rng } from './rng'
import { deleteServiceJobLedger, serviceJobLedgerFor } from './serviceJobLedger'
import { clearStagedWork } from './stagedWork'
import { freshToolTiers } from './toolLines'

/** A placeholder ledger for `isServiceTaskDone`'s call into
 * `evaluateRequirement` - `slotCondition` never reads `ledger`/`day`, but
 * the shared evaluator signature carries them for potential future primitives. */
const EMPTY_LEDGER: CarLedger = { purchaseYen: null, repairYen: 0, partsYen: 0 }

/**
 * How many tiers short the shop's tool line is of `task.minToolTier` -
 * `max(0, minToolTier - toolTiers[group])`. 0 means the task's capability
 * ceiling is met.
 */
export function taskToolDeficit(
  task: ServiceJobTask,
  toolTiers: ToolTiers,
  context: SimContext,
): number {
  const group = context.partsTaxonomyById[task.requirement.carPartId]?.group
  if (!group) return 0
  return Math.max(0, task.minToolTier - toolTiers[group])
}

export interface ToolDeficitSummary {
  /** The largest per-task deficit across the whole task list. */
  maxDeficit: number
  /** Every DISTINCT group with a deficit above 0. */
  deficientGroups: ComponentId[]
}

/** The whole task list's tool-tier deficits, summarized once for the offer
 * rule, the accept gate, the store's `canAccept`/`upgradeHint`, and the
 * bots' own accept decisions - one computation, four callers. */
export function toolDeficitSummary(
  tasks: readonly ServiceJobTask[],
  toolTiers: ToolTiers,
  context: SimContext,
): ToolDeficitSummary {
  let maxDeficit = 0
  const deficientGroups: ComponentId[] = []
  for (const task of tasks) {
    const deficit = taskToolDeficit(task, toolTiers, context)
    if (deficit === 0) continue
    if (deficit > maxDeficit) maxDeficit = deficit
    const group = context.partsTaxonomyById[task.requirement.carPartId]?.group
    if (group && !deficientGroups.includes(group)) deficientGroups.push(group)
  }
  return { maxDeficit, deficientGroups }
}

/**
 * A template is OFFERABLE iff its max tool-tier deficit is <= 1 AND at most
 * ONE distinct group is deficient - "one upgrade away," never two tiers or
 * two lines out. Affordability is NOT checked: cash is the player's lever
 * and fluctuates daily.
 */
export function isTemplateOfferable(
  tasks: readonly ServiceJobTask[],
  toolTiers: ToolTiers,
  context: SimContext,
): boolean {
  const { maxDeficit, deficientGroups } = toolDeficitSummary(tasks, toolTiers, context)
  return maxDeficit <= 1 && deficientGroups.length <= 1
}

/**
 * The UPGRADE-HINT string an offer with a deficit carries:
 * "needs <that group's next tier displayName>". Null when there is no
 * deficit. Derived live against the current tiers, so it clears itself the
 * moment the upgrade lands, rather than being stamped stale onto the offer.
 */
export function upgradeHintFor(
  tasks: readonly ServiceJobTask[],
  toolTiers: ToolTiers,
  context: SimContext,
): string | null {
  const { deficientGroups } = toolDeficitSummary(tasks, toolTiers, context)
  const group = deficientGroups[0]
  if (!group) return null
  const nextTier = context.toolLines[group].tiers[toolTiers[group]]
  return nextTier ? `needs ${nextTier.displayName}` : null
}

/** All six groups at zero - a fresh shop has no word of mouth yet,
 * mirrors `freshToolTiers`. */
export function freshSpecialty(): Record<ComponentId, number> {
  return { engine: 0, drivetrain: 0, suspension: 0, wheels: 0, body: 0, interior: 0 }
}

/**
 * The group the shop is most known for right now: the highest `specialty`
 * value, ties broken by `ComponentIdSchema`'s declared order (engine,
 * drivetrain, suspension, wheels, body, interior). The loop only overwrites
 * on a strict improvement, so the first group at the max value wins ties.
 * Always returns a real group, even at all-zero (defaults to `engine`);
 * callers gate on `specialty[top]` meeting a threshold.
 */
export function topSpecialtyGroup(specialty: Record<ComponentId, number>): ComponentId {
  let best = ComponentIdSchema.options[0]!
  let bestPoints = specialty[best]
  for (const group of ComponentIdSchema.options) {
    const points = specialty[group]
    if (points > bestPoints) {
      best = group
      bestPoints = points
    }
  }
  return best
}

/**
 * The shop's derived title - the top specialty group, once it clears
 * `titleThresholdPoints`; `null` below it. Pure function of `specialty`
 * (no state of its own), reusing `topSpecialtyGroup`'s own tie-break.
 */
function titleGroupFor(
  specialty: Record<ComponentId, number>,
  context: SimContext,
): ComponentId | null {
  const top = topSpecialtyGroup(specialty)
  return specialty[top] >= context.economy.specialty.titleThresholdPoints ? top : null
}

/** The shop's current title line, derived entirely from `state.specialty` -
 * `null` below `titleThresholdPoints`. No stored state; can shift the moment
 * another line overtakes. */
export function shopTitle(state: GameState, context: SimContext): ComponentId | null {
  return titleGroupFor(state.specialty, context)
}

/** Every technique whose threshold `specialty` has cleared - the private
 * engine both `unlockedTechniques` and offer generation share. */
function unlockedTechniquesFor(
  specialty: Record<ComponentId, number>,
  context: SimContext,
): Technique[] {
  return context.techniques.filter((t) => specialty[t.componentId] >= t.thresholdPoints)
}

/** Every technique the shop has unlocked right now - pure, derives entirely
 * from `state.specialty` + the technique catalog; nothing is stored. */
export function unlockedTechniques(state: GameState, context: SimContext): Technique[] {
  return unlockedTechniquesFor(state.specialty, context)
}

/** The one group every task in `tasks` belongs to, or null when they span
 * more than one (the in-lane premium and specialty-copy flavor swap only
 * ever apply to a single-discipline template). */
function singleTaskGroup(
  tasks: readonly ServiceJobTask[],
  context: SimContext,
): ComponentId | null {
  const groups = new Set(
    tasks.map((task) => taskGroup(task, context)).filter((g): g is ComponentId => g !== undefined),
  )
  return groups.size === 1 ? [...groups][0]! : null
}

/**
 * The offer-bias formula: `1 + biasFactor * min(1, specialty[group] /
 * softcapPoints)`, where `group` is the template's FIRST task's group
 * (deterministic, no judgment needed for a multi-group template - the weight
 * only needs to bias SELECTION, not decide "the" discipline). A template
 * addressing an unknown/missing group weights at the neutral 1 (no bias).
 *
 * When `titleGroup` is non-null and matches, the whole weight is
 * ADDITIONALLY multiplied by `titleBiasMultiplier` - a shop title is a real
 * pull on what walks in the door, stacked on top of the bias formula.
 * `titleGroup` defaults to `null` (no title effect), which is also exactly
 * what a zero-specialty shop derives.
 */
function templateWeight(
  template: ServiceJobType,
  specialty: Record<ComponentId, number>,
  context: SimContext,
  titleGroup: ComponentId | null = null,
): number {
  const firstTask = template.tasks[0]
  const group = firstTask ? taskGroup(firstTask, context) : undefined
  if (!group) return 1
  const { biasFactor, softcapPoints, titleBiasMultiplier } = context.economy.specialty
  const base = 1 + biasFactor * Math.min(1, specialty[group] / softcapPoints)
  return group === titleGroup ? base * titleBiasMultiplier : base
}

/**
 * Picks one template from `templates`, weighted by `templateWeight` - a
 * high-specialty line's own templates are drawn more often, but bias never
 * excludes anything (every weight is >= 1). Uses EXACTLY one `rng.next()`
 * draw via cumulative weights, the same single-draw shape `rng.pick` itself
 * uses.
 */
export function pickServiceJobTemplate(
  templates: readonly ServiceJobType[],
  specialty: Record<ComponentId, number>,
  context: SimContext,
  rng: Rng,
  titleGroup: ComponentId | null = null,
): ServiceJobType {
  const weights = templates.map((template) =>
    templateWeight(template, specialty, context, titleGroup),
  )
  const total = weights.reduce((sum, w) => sum + w, 0)
  const roll = rng.next() * total
  let cumulative = 0
  for (let i = 0; i < templates.length; i++) {
    cumulative += weights[i]!
    if (roll < cumulative) return templates[i]!
  }
  return templates[templates.length - 1]!
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
  const { energyPerGradeByTier, pointsPerLabour } = context.economy.energy
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
        energyPerGradeByTier,
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
  const fitmentClass = model ? fitmentClassForTier(model.tier) : 'common'
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
 * candidate pool; within that pool, `toolTiers` (default: a fresh shop's
 * all-1) drives the offer rule (`isTemplateOfferable`): a template at most
 * one tool-tier upgrade away in at most one line is offerable - shown as an
 * upgrade-hint offer when a deficit exists - and anything further out is
 * not generated at all. `currentYear` (default Infinity = unrestricted)
 * excludes still-unreleased models and clamps the rolled car's year, same
 * as auction generation.
 *
 * `specialty` (default: a fresh shop's all-zero) biases WHICH template gets
 * picked (`pickServiceJobTemplate`) and, for a template that stays wholly
 * within the shop's top specialty line and clears `premiumThresholdPoints`,
 * multiplies the margin roll by `inLanePremium` and swaps the offer's
 * flavor line for `context.specialtyCopy`'s word-of-mouth pool - the one
 * place specialty is ever surfaced (bible law 4: no meters). At all-zero
 * specialty every template weighs equally and the premium condition can
 * never hold (0 never clears the threshold).
 *
 * A `requiresTechnique` template (a signature template) is excluded from
 * the pool entirely unless its technique is unlocked
 * (`specialty[technique.componentId] >= technique.thresholdPoints`) - an
 * unknown/unresolvable technique id fails CLOSED (never offered), a content
 * bug should never accidentally expose a locked signature job. The shop's
 * derived title line (`titleGroupFor`), once earned, gets its own offer-
 * selection weight further multiplied by `titleBiasMultiplier`. A picked
 * signature template's flavor draws from its own `flavorPool` PLUS the
 * technique's `unlockLogLine` folded in as one more candidate line (never a
 * separate stateful announcement) - unless the in-lane premium's
 * `specialtyCopy` swap applies instead, same as any other template.
 */
export function generateDailyServiceJobOffers(
  context: SimContext,
  day: number,
  rng: Rng,
  currentYear: number = Infinity,
  toolTiers: ToolTiers = freshToolTiers(),
  reputationTier: ReputationTier = 'legend',
  specialty: Record<ComponentId, number> = freshSpecialty(),
): ServiceJob[] {
  const eligibleModels = context.models.filter((model) => model.spec.yearFrom <= currentYear)
  const tierEligibleTemplates = context.serviceJobTypes.filter((template) =>
    reputationAtLeast(reputationTier, SERVICE_JOB_TIER_MIN_REPUTATION[template.tier]),
  )
  const toolReadyTemplates = tierEligibleTemplates.filter((template) =>
    isTemplateOfferable(template.tasks, toolTiers, context),
  )
  const unlockedTechniqueIds = new Set(unlockedTechniquesFor(specialty, context).map((t) => t.id))
  const eligibleTemplates = toolReadyTemplates.filter(
    (template) =>
      !template.requiresTechnique || unlockedTechniqueIds.has(template.requiresTechnique),
  )
  if (
    eligibleTemplates.length === 0 ||
    context.serviceJobCustomerNames.length === 0 ||
    eligibleModels.length === 0
  ) {
    return []
  }

  const topGroup = topSpecialtyGroup(specialty)
  const titleGroup = titleGroupFor(specialty, context)
  const [minLifetimeDays, maxLifetimeDays] = context.economy.serviceJobs.offerLifetimeDaysRange
  const rawCount = sampleDailyOfferCount(context.economy.serviceJobs.dailyOfferCountWeights, rng)
  const count = Math.min(
    rawCount,
    offerCountCapForDay(context.economy.serviceJobs.offerCountCapByDay, day),
  )
  const offers: ServiceJob[] = []
  for (let i = 0; i < count; i++) {
    const template = pickServiceJobTemplate(eligibleTemplates, specialty, context, rng, titleGroup)
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
    const inLane =
      singleTaskGroup(template.tasks, context) === topGroup &&
      specialty[topGroup] >= context.economy.specialty.premiumThresholdPoints
    const margin = rollMargin(context, rng) * (inLane ? context.economy.specialty.inLanePremium : 1)
    const payoutYen = deriveServiceJobPayoutYen(template.tasks, car, model, context, margin)
    const technique = template.requiresTechnique
      ? context.techniques.find((t) => t.id === template.requiresTechnique)
      : undefined
    const flavorPool = technique
      ? [...template.flavorPool, technique.unlockLogLine]
      : template.flavorPool
    offers.push({
      id: `svc-${day}-${i}`,
      typeId: template.id,
      customerName: rng.pick(context.serviceJobCustomerNames),
      description: inLane ? rng.pick(context.specialtyCopy[topGroup].lines) : rng.pick(flavorPool),
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
 * An offer with any tool-tier deficit (a task whose `minToolTier` exceeds
 * the line's current tier) is refused - it was generated as an
 * upgrade-hint offer and becomes acceptable the moment the upgrade lands,
 * since the deficit is re-checked live here rather than stamped at
 * generation time.
 *
 * A signature template's `requiresTechnique` is re-checked live here too
 * (reason `'technique'`) - defensive, since generation already excludes an
 * unmet-technique template, but specialty could in principle have dropped
 * between generation and accept (or the offer is stale).
 */
export function resolveAcceptServiceJob(
  state: GameState,
  offerId: string,
  context: SimContext,
): AcceptServiceJobResult {
  const offer = state.serviceJobOffers.find((o) => o.id === offerId)
  if (!offer) return { state, log: [] }

  if (toolDeficitSummary(offer.tasks, state.toolTiers, context).maxDeficit > 0) {
    return {
      state,
      log: [{ type: 'acquisition-blocked', kind: 'service-accept', reason: 'tool-tier' }],
    }
  }
  const offerTemplate = context.serviceJobTypes.find((t) => t.id === offer.typeId)
  const requiredTechnique = offerTemplate?.requiresTechnique
    ? context.techniques.find((t) => t.id === offerTemplate.requiresTechnique)
    : undefined
  if (
    offerTemplate?.requiresTechnique &&
    (!requiredTechnique ||
      state.specialty[requiredTechnique.componentId] < requiredTechnique.thresholdPoints)
  ) {
    return {
      state,
      log: [{ type: 'acquisition-blocked', kind: 'service-accept', reason: 'technique' }],
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

/** Reputation lost when a job is failed (handed back unfinished / overdue). */
export function reputationForFailure(baseReputation: number): number {
  return Math.round(baseReputation * SERVICE_JOB_FAILURE_REP_MULTIPLIER)
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

/** Every DISTINCT group among `tasks` - the specialty earn split's basis: a
 * multi-group job's reputation-shaped delta is divided evenly across every
 * discipline it actually touched. */
function distinctTaskGroups(tasks: readonly ServiceJobTask[], context: SimContext): ComponentId[] {
  const groups = new Set<ComponentId>()
  for (const task of tasks) {
    const group = taskGroup(task, context)
    if (group) groups.add(group)
  }
  return [...groups]
}

export interface SpecialtyDeltaResult {
  state: GameState
  /** Per-group delta actually applied - all 6 groups present, 0 for any
   * group `totalDelta` didn't touch (surfaced in the completion report,
   * `service-job-completed`/`-failed`'s `specialtyGained`). */
  deltas: Record<ComponentId, number>
}

/**
 * Splits `totalDelta` evenly across `groups` and applies it to
 * `state.specialty`, clamped at 0 per group - the specialty twin of
 * `applyReputationDelta`'s own floor. A no-op when `groups` is empty (every
 * task addressed an unknown part - never happens for real content, but this
 * stays a pure, total function regardless).
 */
export function applySpecialtyDelta(
  state: GameState,
  groups: readonly ComponentId[],
  totalDelta: number,
): SpecialtyDeltaResult {
  const deltas = freshSpecialty()
  if (groups.length === 0) return { state, deltas }
  const perGroup = Math.round(totalDelta / groups.length)
  const specialty = { ...state.specialty }
  for (const group of groups) {
    specialty[group] = Math.max(0, specialty[group] + perGroup)
    deltas[group] = perGroup
  }
  return { state: { ...state, specialty }, deltas }
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
    dissolveAssembliesForCar(
      clearStagedWork(releaseCarFromShop(state, job.car.id), job.car.id),
      job.car.id,
    ),
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
    const { state: withSpecialty, deltas: specialtyGained } = applySpecialtyDelta(
      withReputation,
      distinctTaskGroups(job.tasks, context),
      reputationGained,
    )
    return {
      state: {
        ...withSpecialty,
        cashYen: withSpecialty.cashYen + job.payoutYen,
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
          repairCostYen: ledger.repairYen,
          partsCostYen: ledger.partsYen,
          specialtyGained,
          netProfitYen: job.payoutYen - ledger.repairYen - ledger.partsYen,
          ...(acceptedOnDay !== null ? { daysSpent: releasedState.day - acceptedOnDay } : {}),
        },
        ...returnedPartsLog,
      ],
      outcome: 'paid',
    }
  }

  const penalty = reputationForFailure(job.baseReputation)
  const withReputation = applyReputationDelta(releasedState, -penalty, context.economy)
  const { state: withSpecialty, deltas: specialtyGained } = applySpecialtyDelta(
    withReputation,
    distinctTaskGroups(job.tasks, context),
    -penalty,
  )
  const reputationLost = releasedState.reputationPoints - withReputation.reputationPoints
  return {
    state: { ...withSpecialty, activeServiceJobs, jobs, partInventory },
    log: [
      {
        type: 'service-job-failed',
        jobId: job.id,
        reputationLost,
        repairCostYen: ledger.repairYen,
        partsCostYen: ledger.partsYen,
        specialtyGained,
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
