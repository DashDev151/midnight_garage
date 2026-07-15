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
  Technique,
  ToolTiers,
} from '@midnight-garage/content'
import { ALL_CAR_PART_IDS, ComponentIdSchema, fitmentClassForTier } from '@midnight-garage/content'
import { generateAuctionCarInstance, stockInstanceFor } from './auctions'
import { bandIndex, bandsBelowExcludingScrap, planPartRepair } from './bands'
import { applyReputationDelta, reputationAtLeast } from './calendar'
import {
  GRADE_REPUTATION_MULTIPLIER,
  INSTALL_LABOR_SLOTS,
  SERVICE_JOB_ARRIVAL_DELAY_DAYS,
  SERVICE_JOB_FAILURE_REP_MULTIPLIER,
  SERVICE_JOB_TIER_MIN_REPUTATION,
} from './constants'
import type { SimContext } from './context'
import { assignToShop, hasAcquisitionSpace, releaseCarFromShop } from './facilities'
import { gradeAtLeast, partFitsCar } from './parts'
import type { Rng } from './rng'
import { deleteServiceJobLedger, serviceJobLedgerFor } from './serviceJobLedger'
import { clearStagedWork } from './stagedWork'
import { freshToolTiers } from './toolLines'

/**
 * Sprint 36, the offer rule's atom: how many tiers short the shop's tool
 * line is of `task.minToolTier` - `max(0, minToolTier - toolTiers[group])`.
 * 0 means the task's capability ceiling is met.
 */
export function taskToolDeficit(
  task: ServiceJobTask,
  toolTiers: ToolTiers,
  context: SimContext,
): number {
  const group = context.partsTaxonomyById[task.carPartId]?.group
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
    const group = context.partsTaxonomyById[task.carPartId]?.group
    if (group && !deficientGroups.includes(group)) deficientGroups.push(group)
  }
  return { maxDeficit, deficientGroups }
}

/**
 * Sprint 36, the offer rule (replaces every equipment filter, including
 * interim fix dc306d9): a template is OFFERABLE iff its max tool-tier
 * deficit is <= 1 AND at most ONE distinct group is deficient - "one
 * upgrade away," never two tiers or two lines out. Affordability is NOT
 * checked: cash is the player's lever and fluctuates daily. With this
 * sprint's all-default-1 content every template passes with zero deficits;
 * Sprint 37 authors real ceilings.
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
 * The UPGRADE-HINT string an offer with a deficit carries (Sprint 36):
 * "needs <that group's next tier displayName>". Null when there is no
 * deficit (nothing to hint at). Derived live against the CURRENT tiers, so
 * it clears itself the moment the upgrade lands, rather than being stamped
 * stale onto the offer at generation time.
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

/** All six groups at zero (Sprint 38 - a fresh shop has no word of mouth
 * yet, mirrors `freshToolTiers`). */
export function freshSpecialty(): Record<ComponentId, number> {
  return { engine: 0, drivetrain: 0, suspension: 0, wheels: 0, body: 0, interior: 0 }
}

/**
 * The group the shop is most known for right now (Sprint 38): the highest
 * `specialty` value, ties broken by `ComponentIdSchema`'s declared order
 * (engine, drivetrain, suspension, wheels, body, interior) - the loop only
 * ever overwrites on a STRICT improvement, so the first group at the max
 * value wins ties for free. Always returns a real group, even at all-zero
 * (defaults to `engine`); callers gate on `specialty[top]` meeting a
 * threshold, not on this alone.
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
 * Sprint 39: the shop's derived title - the top specialty group, once it
 * clears `titleThresholdPoints`; `null` below it. Pure function of
 * `specialty` (no state of its own), reusing `topSpecialtyGroup`'s own
 * tie-break. The private `specialty`-shaped twin (`titleGroupFor`) is what
 * offer generation actually uses, since it only ever has the loose
 * `specialty` record, not a full `GameState`.
 */
function titleGroupFor(
  specialty: Record<ComponentId, number>,
  context: SimContext,
): ComponentId | null {
  const top = topSpecialtyGroup(specialty)
  return specialty[top] >= context.economy.specialty.titleThresholdPoints ? top : null
}

/** Sprint 39: the shop's current title line, derived entirely from
 * `state.specialty` - `null` below `titleThresholdPoints`. No stored state;
 * can shift the moment another line overtakes (progression bible: no
 * ceremony, no lock-in). */
export function shopTitle(state: GameState, context: SimContext): ComponentId | null {
  return titleGroupFor(state.specialty, context)
}

/** Every technique whose threshold `specialty` has cleared (Sprint 39) -
 * the private engine both `unlockedTechniques` (state-shaped, for callers
 * with a full GameState) and offer generation (which only ever has the
 * loose `specialty` record) share. */
function unlockedTechniquesFor(
  specialty: Record<ComponentId, number>,
  context: SimContext,
): Technique[] {
  return context.techniques.filter((t) => specialty[t.componentId] >= t.thresholdPoints)
}

/** Sprint 39: every technique the shop has unlocked right now - pure,
 * derives entirely from `state.specialty` + the technique catalog; nothing
 * is stored. */
export function unlockedTechniques(state: GameState, context: SimContext): Technique[] {
  return unlockedTechniquesFor(state.specialty, context)
}

/** The one group every task in `tasks` belongs to, or null when they span
 * more than one (Sprint 38: the in-lane premium and the specialty-copy
 * flavor swap only ever apply to a template that stays wholly within a
 * single discipline - a multi-group template is never "in lane" for any
 * one specialty). */
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
 * Sprint 38, the offer-bias atom: `1 + biasFactor * min(1, specialty[group]
 * / softcapPoints)`, where `group` is the template's FIRST task's group
 * (deterministic, no judgment needed for a multi-group template - the
 * weight only needs to bias SELECTION, not decide "the" discipline the way
 * the in-lane premium's stricter `singleTaskGroup` does). A template
 * addressing an unknown/missing group weights at the neutral 1 (no bias
 * either way, never a crash).
 *
 * Sprint 39: when `titleGroup` is non-null and matches, the whole weight is
 * ADDITIONALLY multiplied by `titleBiasMultiplier` - a shop title is a real
 * pull on what walks in the door, stacked on top of the Sprint 38 bias, not
 * instead of it. `titleGroup` defaults to `null` (no title effect), which
 * is also exactly what a zero-specialty shop derives, so this never
 * disturbs the Sprint 38 zero-specialty-identical guarantee.
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
 * Sprint 38: picks one template from `templates`, weighted by
 * `templateWeight` - a high-specialty line's own templates are drawn more
 * often, but bias never excludes anything (every weight is >= 1). Uses
 * EXACTLY one `rng.next()` draw via cumulative weights, the same single-
 * draw shape `rng.pick` itself uses - at all-zero specialty every weight is
 * exactly 1, which makes this mathematically identical to `rng.pick`
 * (`floor(next() * length)` either way), so a zero-specialty career's offer
 * sequence for a fixed seed is byte-identical to pre-Sprint-38 behavior.
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
 * `targetBand`, that's rolled `scrap`, or (Sprint 41) that's non-repairable
 * (the job's own `isServiceTaskDone` already treats scrap as satisfied; a
 * non-repairable part never gets a repair task to begin with - content
 * integrity test - but `planPartRepair`'s own `canRepair` check covers it
 * for free either way) contributes 0 to both totals: there is genuinely
 * nothing left to charge or labor for.
 *
 * Sprint 41: reuses `planPartRepair` (bands.ts) directly rather than
 * re-deriving the grades/cost/labor formula inline - the ONE cost pipeline,
 * never a second bill implementation. Sprint 44: a repair task's cost derives
 * from the installed instance's own catalog `priceYen`
 * (`context.partsById[installed.partId]`) times `economy.restoration.
 * repairStepFraction`, never a car/model-derived factor. Repair labor sizes
 * at level 1 (base, "worst case tooling" - a market rate for the customer's
 * own wrench time, independent of the shop's actual current tool tier,
 * unchanged from pre-Sprint-41).
 */
export function serviceJobCostBreakdown(
  tasks: readonly ServiceJobTask[],
  car: CarInstance,
  model: CarModel,
  context: SimContext,
): ServiceJobCostBreakdown {
  const { repairStepFraction } = context.economy.restoration
  let taskCostYen = 0
  let laborSlots = 0
  for (const task of tasks) {
    if (task.action === 'repair') {
      const entry = context.partsTaxonomyById[task.carPartId]
      const installed = car.parts[task.carPartId].installed
      // Sprint 32: a missing slot has no band to climb - out of repair's
      // reach exactly like scrap is (0 cost/labor), rather than crashing on
      // a null read.
      if (!entry || !installed) continue
      const catalogPart = context.partsById[installed.partId]
      if (!catalogPart) continue
      const plan = planPartRepair(
        installed.band,
        task.targetBand,
        1,
        entry,
        catalogPart.priceYen,
        repairStepFraction,
      )
      taskCostYen += plan.costYen
      laborSlots += plan.laborSlotsRequired
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
 * Sprint 52 decision 1: the day-1 pacing ramp - a step function (never
 * smooth interpolation; an offer count is always a whole number) over
 * `economy.json`'s `serviceJobs.offerCountCapByDay` ascending `[day,
 * capAtOrAfterThatDay]` pairs. Returns the cap in effect for `day` - the
 * value from the LAST breakpoint whose own day is `<= day`.
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
 * The condition bands an install task's original part is rolled down to
 * (Sprint 61) - a visibly-neglected part so the customer's complaint is
 * honest ("pads are down to metal"), never a manufactured missing slot. Poor
 * or scrap: bad enough to justify a replacement without the odd middle
 * ground of "worn but the customer's furious."
 */
const INSTALL_OUTSTANDING_BANDS = ['poor', 'scrap'] as const

/**
 * Sprint 40, the real fix for "work done before the car even arrived": forces
 * every task in `tasks` to be genuinely outstanding on `car` BEFORE a payout
 * is derived from it. Pre-Sprint-40, offer generation rolled the template and
 * the customer car fully independently, with nothing linking them - a repair
 * task could land on a part that had already rolled at/above its target band,
 * and an install task could land on a slot that already held a part meeting
 * `minGrade`. Either way the job read as "already done" the moment it hit the
 * board, before the player (or bot) ever touched it.
 *
 * A repair task whose `isServiceTaskDone` is already true installs a fresh
 * stock instance on that exact slot at a band rolled uniformly from strictly
 * BELOW the target (`bandsBelowExcludingScrap` - never scrap, there must be
 * real repair work left).
 *
 * Sprint 61 (the maintainer's "keep track of the original part" direction,
 * replacing Sprint 40's slot-clearing hack): an install task NO LONGER clears
 * its slot. The customer's car keeps its ORIGINAL part (same `PartInstance.id`,
 * which becomes the job's baseline), rolled down to a neglected band so the
 * complaint is honest - the task's completion is then gated on fitting a
 * DIFFERENT part (`isServiceTaskDone`'s baseline check), never on the slot
 * being empty. This structurally kills the "customer says the tyres are worn
 * but the car has no tyres" contradiction: the tyres are present and worn, as
 * described. A slot that is somehow already empty is left empty (defensive;
 * service cars never roll a missing slot).
 */
export function forceTasksOutstanding(
  car: CarInstance,
  tasks: readonly ServiceJobTask[],
  context: SimContext,
  rng: Rng,
): CarInstance {
  const model = context.modelsById[car.modelId]
  const fitmentClass = model ? fitmentClassForTier(model.tier) : 'common'
  let parts = car.parts
  for (const task of tasks) {
    if (task.action === 'install') {
      // Roll the original part down to a neglected band, keeping its instance
      // (its id is the job's baseline) - present, not missing.
      const installed = parts[task.carPartId].installed
      if (!installed) continue // defensive: already empty, leave it
      const band = rng.pick(INSTALL_OUTSTANDING_BANDS)
      parts = { ...parts, [task.carPartId]: { installed: { ...installed, band } } }
      continue
    }
    const working: CarInstance = parts === car.parts ? car : { ...car, parts }
    if (!isServiceTaskDone(working, task, context.partsById)) continue
    const candidates = bandsBelowExcludingScrap(task.targetBand)
    if (candidates.length === 0) continue // no valid "still needs repair" band to roll
    const band = rng.pick(candidates)
    const installed = stockInstanceFor(
      task.carPartId,
      band,
      `${car.id}-part`,
      fitmentClass,
      context.stockPartByCarPartId,
    )
    if (!installed) continue // defensive: no stock entry for this slot (never happens for real content)
    parts = { ...parts, [task.carPartId]: { installed } }
  }
  return parts === car.parts ? car : { ...car, parts }
}

/**
 * Generates today's fresh batch of service-job offers (Sprint 29: replaces
 * the Sprint 11 weekly fixed-count dump with a daily bell-curve draw).
 * Each carries a real customer car (rolled like an auction car, then run
 * through `forceTasksOutstanding` - Sprint 40 - so the template's tasks are
 * guaranteed genuinely outstanding on it) and a payout derived from the
 * template's own task list against that specific car
 * (`deriveServiceJobPayoutYen`) - never an authored flat range.
 * `reputationTier` (default `'legend'` = unrestricted) gates which template
 * TIERS are even in the candidate pool (Sprint 29 decision 2); within that
 * pool, `toolTiers` (default: a fresh shop's all-1) drives the Sprint 36
 * offer rule (`isTemplateOfferable`): a template at most one tool-tier
 * upgrade away in at most one line is offerable - shown as an upgrade-hint
 * offer when a deficit exists - and anything further out is not generated
 * at all. `currentYear` (default Infinity = unrestricted) excludes
 * still-unreleased models and clamps the rolled car's year, same as auction
 * generation.
 *
 * `specialty` (Sprint 38, default: a fresh shop's all-zero) biases WHICH
 * template gets picked (`pickServiceJobTemplate`) and, for a template that
 * stays wholly within the shop's top specialty line and clears
 * `premiumThresholdPoints`, multiplies the margin roll by `inLanePremium`
 * and swaps the offer's flavor line for `context.specialtyCopy`'s
 * word-of-mouth pool - the one place specialty is ever surfaced (bible law
 * 4: no meters). At all-zero specialty every template weighs equally and
 * the premium condition can never hold (0 never clears the threshold), so
 * this is a strict no-op extension: a zero-specialty career's offers are
 * byte-identical to pre-Sprint-38 behavior for a fixed seed.
 *
 * Sprint 39: a `requiresTechnique` template (a signature template) is
 * excluded from the pool entirely unless its technique is unlocked
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
  expiresInDays: number,
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
  const rawCount = sampleDailyOfferCount(context.economy.serviceJobs.dailyOfferCountWeights, rng)
  const count = Math.min(
    rawCount,
    offerCountCapForDay(context.economy.serviceJobs.offerCountCapByDay, day),
  )
  const offers: ServiceJob[] = []
  for (let i = 0; i < count; i++) {
    const template = pickServiceJobTemplate(eligibleTemplates, specialty, context, rng, titleGroup)
    const model = rng.pick(eligibleModels)
    // Sprint 47 decision 7 (playtest 2026-07-13: "how did the car even get
    // here with a missing diff?"): a customer's car never rolls a random
    // missing slot (`allowMissingSlots: false`) - `forceTasksOutstanding`
    // below is the only way one of its slots ends up empty, and only when
    // the job's own install task calls for it.
    const rolledCar = generateAuctionCarInstance(
      model,
      `svc-car-${day}-${i}`,
      rng,
      context,
      currentYear,
      false,
    )
    // Sprint 40: the car and the template rolled fully independently above -
    // force every task genuinely outstanding before pricing the job off it,
    // so the payout (and the job itself) never prices in vacuous "work".
    const car = forceTasksOutstanding(rolledCar, template.tasks, context, rng)
    // Sprint 61: snapshot the original part instance id in each slot (the
    // parts the customer's car arrived with). An install task is done only
    // once a DIFFERENT part is fitted, so re-fitting the customer's own pulled
    // part never satisfies it.
    //
    // Sprint 68 fix: snapshot EVERY slot, not just install-task slots. This
    // record is also what `resolveRemovePart` uses to decide whose a pulled
    // part is, and an install-task-only snapshot could not answer that for any
    // other slot - so a player could pull the customer's engine off a job that
    // happened to have an install task, and keep it. The map is now total over
    // the car, so "is this the part the customer arrived with" is always
    // decidable rather than inferred from an absence.
    const baselineInstalledPartIds: Record<string, string | null> = {}
    for (const partId of ALL_CAR_PART_IDS) {
      baselineInstalledPartIds[partId] = car.parts[partId].installed?.id ?? null
    }
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
      expiresOnDay: day + expiresInDays,
      arrivesOnDay: null,
      dueOnDay: null,
      baselineInstalledPartIds,
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
 * Sprint 36: an offer with any tool-tier deficit (a task whose
 * `minToolTier` exceeds the line's current tier) is refused - it was
 * generated as an upgrade-hint offer and becomes acceptable the moment the
 * upgrade lands, since the deficit is re-checked live here rather than
 * stamped at generation time. This replaces the retired accept-time
 * equipment refusal.
 *
 * Sprint 39: a signature template's `requiresTechnique` is re-checked live
 * here too (reason `'technique'`) - defensive, since generation already
 * excludes an unmet-technique template, but specialty could in principle
 * have dropped between generation and accept (or the offer is stale).
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
 * `fittingPartsForInstallTask`).
 *
 * Sprint 61: an install task also requires the slot's part to be a
 * genuinely NEW instance - `baselineInstalledPartIds[carPartId]` is the
 * part instance the customer's car arrived with, and re-fitting that exact
 * part (its own `PartInstance.id`, preserved by the Sprint 35 pull/keep
 * flow) never satisfies the job. A `carPartId` absent from the baseline map
 * (an install task on a legacy pre-Sprint-61 job, whose baseline defaults to
 * `{}`, or any call that doesn't thread the baseline) falls back to the
 * pre-Sprint-61 "any qualifying part present is done" semantics.
 */
export function isServiceTaskDone(
  car: CarInstance,
  task: ServiceJobTask,
  partsById: Readonly<Record<string, Part>>,
  baselineInstalledPartIds: Readonly<Record<string, string | null>> = {},
): boolean {
  if (task.action === 'repair') {
    const installed = car.parts[task.carPartId].installed
    if (!installed) return true
    return installed.band === 'scrap' || bandIndex(installed.band) >= bandIndex(task.targetBand)
  }
  const installed = car.parts[task.carPartId].installed
  if (!installed) return false
  const part = partsById[installed.partId]
  if (!part || !gradeAtLeast(part.grade, task.minGrade)) return false
  // Sprint 61: a NEW part is required, not the customer's own arrived part.
  // An absent baseline (legacy job / untracked call) keeps the old "present
  // and qualifying is enough" behavior for that task.
  const baselineId = baselineInstalledPartIds[task.carPartId]
  if (baselineId === undefined) return true
  return installed.id !== baselineId
}

/**
 * Whether the customer's required work has actually been done on their car -
 * every task in the job's list satisfied (Sprint 29: extends the Sprint 26
 * group-level "bridge" to a real per-task, per-part list). Multi-task
 * completion requires ALL tasks done; a partial hand-back is the existing
 * failure path (`resolveServiceJob` below), unchanged. Sprint 61: threads the
 * job's own `baselineInstalledPartIds` so install tasks require a genuinely
 * new part.
 */
export function isServiceWorkDone(job: ServiceJob, context: SimContext): boolean {
  return job.tasks.every((task) =>
    isServiceTaskDone(job.car, task, context.partsById, job.baselineInstalledPartIds),
  )
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
 * `'in-transit'` (Sprint 40): the job's customer car hasn't actually arrived
 * yet - `resolveServiceJob`'s own defense-in-depth guard, mirroring
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

/** Every DISTINCT group among `tasks` (Sprint 38 - the specialty earn
 * split's basis: a multi-group job's reputation-shaped delta is divided
 * evenly across every discipline it actually touched). */
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
   * group `totalDelta` didn't touch (Sprint 57: surfaced in the completion
   * report, `service-job-completed`/`-failed`'s `specialtyGained`). */
  deltas: Record<ComponentId, number>
}

/**
 * Sprint 38: splits `totalDelta` evenly across `groups` and applies it to
 * `state.specialty`, clamped at 0 per group - the specialty twin of
 * `applyReputationDelta`'s own floor. A no-op when `groups` is empty (every
 * task addressed an unknown part - never happens for real content, but this
 * stays a pure, total function regardless).
 */
function applySpecialtyDelta(
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
 *
 * Sprint 40 (defense in depth): refuses outright while the customer's car is
 * still in transit (`isServiceJobInTransit`), mirroring
 * `resolveAcceptServiceJob`'s existing refusal shape. There is no real path
 * to this today - the deadline backstop's own `dueOnDay <= next.day` check
 * can only fire once `dueOnDay` (always >= `arrivesOnDay`) has passed, so an
 * in-transit job is never yet overdue - but the player's "Complete Job"
 * click and this function are the one resolution path every caller shares,
 * so the guard belongs here rather than trusted to every caller re-deriving
 * it themselves.
 */
export function resolveServiceJob(
  state: GameState,
  jobId: string,
  context: SimContext,
): ServiceJobResolution {
  const job = state.activeServiceJobs.find((sj) => sj.id === jobId)
  if (!job) return { state, log: [], outcome: 'not-found' }
  if (isServiceJobInTransit(job, state.day)) return { state, log: [], outcome: 'in-transit' }

  // Sprint 57: read the job's real spend before its ledger is deleted at
  // close-out - the honest report's repair/parts cost lines.
  const ledger = serviceJobLedgerFor(state, job.id)
  const releasedState = deleteServiceJobLedger(
    clearStagedWork(releaseCarFromShop(state, job.car.id), job.car.id),
    job.id,
  )
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
    ],
    outcome: 'failed',
  }
}

/** Shared lookup for callers (bots, the game store) that need to know which
 * of the 6 component groups a task's `carPartId` belongs to without reaching
 * into `context.partsTaxonomyById` directly. */
export function taskGroup(task: ServiceJobTask, context: SimContext): ComponentId | undefined {
  return context.partsTaxonomyById[task.carPartId]?.group
}
