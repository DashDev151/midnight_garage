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
  SellingChannelId,
  ServiceJob,
  ServiceJobSymptomTask,
  ServiceJobTask,
  ServiceJobType,
  Symptom,
  ToolLevels,
} from '@midnight-garage/content'
import { fitmentClassForTier } from '@midnight-garage/content'
import { dissolveAssembliesForCar, externalBlockersFor } from './assemblies'
import {
  applySpecificSymptom,
  carOriginLabel,
  generateAuctionCarInstance,
  stockInstanceFor,
} from './auctions'
import { bandIndex, bandsBelowExcludingScrap } from './bands'
import { candidateFixCostYen, symptomResolved } from './diagnosis'
import { partFixCostYen, sumFixCosts, type PartFixCost } from './repairJobs'
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
import { gradeAtLeast, partFitsCar, reconcileStations } from './parts'
import { makeCarOrigin, partsOriginatingFromCar } from './provenance'
import { evaluateRequirement } from './requirements'
import type { Rng } from './rng'
import { pickWeighted } from './rng'
import { deleteServiceJobLedger, serviceJobLedgerFor } from './serviceJobLedger'
import { taskLaborChain } from './taskLaborChain'
import { toolLevelsFor } from './toolLines'

/** A `resolveSymptom` template/job's own candidate-count commitment (spec
 * section 8: "2-4 candidate causes") - the eligible symptom pool a job's
 * `symptomId` is drawn from excludes any symptom authored with more. */
const MAX_SYMPTOM_JOB_CANDIDATES = 4

/** A placeholder ledger for `isServiceTaskDone`'s call into
 * `evaluateRequirement` - `slotCondition` never reads `ledger`/`day`, but
 * the shared evaluator signature carries them for potential future primitives. */
const EMPTY_LEDGER: CarLedger = {
  purchaseYen: null,
  repairYen: 0,
  partsYen: 0,
  listingFeesYen: 0,
}

/** The level a line reads once the shop covering it is owned (`toolLevelsFor`,
 * toolLines.ts). There is no rung above 2, so 3 means the shop and nothing
 * else. */
const SHOP_TOOL_LEVEL = 3

/**
 * Whether one task asks for work this garage cannot be offered yet. What a
 * task needs is DERIVED from what it asks for, never authored beside it.
 *
 * Only a `mint` band has a ceiling: mint is Restore work, and Restore is shop
 * work whatever its recipe names (`cardRefusalFor`, repairJobs.ts), so the
 * shop covering that part's group has to be owned before the commission is an
 * honest one. Every other band is reachable on day one - the line is hired for
 * the day, or slogged by hand - and so is any grade requirement, mint
 * included: that route buys a part rather than working one, and a part is
 * bought at any tier.
 *
 * Always false for a `resolveSymptom` task: a symptom job's own tool gating
 * lives on the diagnostic TESTS a candidate needs to open
 * (`requiresToolTier`, `diagnosticTest.ts`), never on the job's own
 * offerability - see `ServiceJobSymptomTaskSchema`'s doc comment.
 */
export function taskToolBlocked(
  task: ServiceJobTask,
  toolLevels: ToolLevels,
  context: SimContext,
): boolean {
  if (task.kind !== 'slotCondition') return false
  const { carPartId, minBand, minGrade } = task.requirement
  if (minGrade || minBand !== 'mint') return false
  const group = context.partsTaxonomyById[carPartId]?.group
  return group !== undefined && toolLevels[group] < SHOP_TOOL_LEVEL
}

export interface ToolGateSummary {
  /** True when any task in the list is out of reach. */
  blocked: boolean
  /** Every DISTINCT group whose covering shop a blocked task is waiting on. */
  blockedGroups: ComponentId[]
}

/** The whole task list's tool gate, summarized once for the offer rule, the
 * accept gate, the store's `canAccept`/`upgradeHint`, and the bots' own accept
 * decisions - one computation, four callers. */
export function toolGateSummary(
  tasks: readonly ServiceJobTask[],
  toolLevels: ToolLevels,
  context: SimContext,
): ToolGateSummary {
  const blockedGroups: ComponentId[] = []
  for (const task of tasks) {
    if (!taskToolBlocked(task, toolLevels, context)) continue
    const group =
      task.kind === 'slotCondition'
        ? context.partsTaxonomyById[task.requirement.carPartId]?.group
        : undefined
    if (group && !blockedGroups.includes(group)) blockedGroups.push(group)
  }
  return { blocked: blockedGroups.length > 0, blockedGroups }
}

/**
 * A template is OFFERABLE iff nothing on its task list is out of reach - in
 * practice, iff it asks for no Restore this garage has no shop for. Everything
 * else is offered from day one and paid for in hire fees or in energy.
 * Affordability is NOT checked: cash is the player's lever and fluctuates
 * daily.
 */
export function isTemplateOfferable(
  tasks: readonly ServiceJobTask[],
  toolLevels: ToolLevels,
  context: SimContext,
): boolean {
  return !toolGateSummary(tasks, toolLevels, context).blocked
}

/**
 * The UPGRADE-HINT string a blocked task list carries: "needs <the shop that
 * would open it>". A Restore is the only work a purchase opens, and only the
 * covering shop opens it, so there is exactly one thing to name. Null when
 * nothing is blocked. Derived live against the current levels, so it clears
 * itself the moment the purchase lands, rather than being stamped stale onto
 * the offer.
 */
export function upgradeHintFor(
  tasks: readonly ServiceJobTask[],
  toolLevels: ToolLevels,
  context: SimContext,
): string | null {
  const group = toolGateSummary(tasks, toolLevels, context).blockedGroups[0]
  if (!group) return null
  return `needs ${context.toolShopByGroup[group].displayName}`
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
  /** Sum of every task's CASH cost: a grade-requirement task's median
   * fitting-part price, a repair task's banded parts bill, and either way the
   * day's hire the work needs, folded in before any margin so no quoted job
   * is a loss. */
  taskCostYen: number
  /** Total labor slots the task list nominally takes: every task's whole
   * physical chain (`taskLaborChain`, taskLaborChain.ts) - clearing and
   * refitting whatever blocks the slot, pulling the part (or its whole
   * assembly) off, the bench job, and the refit that actually delivers the
   * improvement - every stage at base rate. A repair-route task's bench work
   * is its repair job's own recipe steps; a buy-new task's is the bench
   * swap-in when the slot is an assembly member, or nothing at all
   * otherwise. */
  laborSlots: number
}

/**
 * The material-cost + labor-slot inputs `deriveServiceJobPayoutYen` prices -
 * split out so the profitability invariant test can inspect the same
 * numbers a real offer derives from, not just the final rounded payout.
 *
 * A task with no `minGrade` prices the REPAIR route (`partFixCostYen`,
 * repairJobs.ts: the smallest job whose finished band reaches `minBand`, its
 * banded parts bill, and one day's hire only where that job cannot be worked by
 * hand at all); everything else - a `minGrade` requirement, a scrap or missing
 * slot, or a non-repairable part - prices the buy-new route (the narrowest
 * fitting tier's median price, and no day, since fitting a fresh part works no
 * recipe) instead. Neither an empty nor a scrap slot counts as "already
 * done" for a band-only task: both are genuinely outstanding work, priced as
 * the replacement they actually need. The only real 0-cost/labor case is a
 * task ALREADY satisfied, which `partFixCostYen` prices at nothing, fee
 * included.
 *
 * Reuses `partFixCostYen` for the money and `taskLaborChain`
 * (taskLaborChain.ts) for the labour - the ONE fix-price atom and the ONE
 * labour pipeline, never a second bill implementation.
 *
 * The quote assumes the hire route throughout, which is why any fee is folded
 * in before any margin and why the labour is never slog-multiplied: a garage
 * that hires pays cash and works at base rate. A player who owns the line
 * keeps the fee as margin; one who works by hand pays the difference in energy
 * rather than in yen. Nothing here reads the shop's own tools, so a customer's
 * quote never moves with what is bolted to the wall.
 *
 * A fee is rare, because a tier 2 tool is a rate rather than a wall: a day is
 * named only where the bench job genuinely cannot be worked by hand
 * (`forcedHireDayFor`), which on the shipped ladder is a welded Rebuild and
 * nothing else. Most quotes therefore price their parts and their labour and
 * nothing more, and a buy-new task never names a day at all: it works no
 * recipe, and reaching even a buried slot costs energy rather than yen
 * (`accessRoute`, jobs.ts). A `mint` task's Restore carries no fee either, and
 * is only ever offered to a garage that owns the covering shop
 * (`taskToolBlocked`).
 *
 * And only one day's hire rides on a LINE, however many tasks want it: a job
 * freshening dampers and springs together hires the suspension line once, so
 * the task list totals through `sumFixCosts` rather than task by task.
 *
 * A `resolveSymptom` task is skipped outright here: its own payout prices
 * through `deriveSymptomJobPayoutYen` (the weighted-mean chain-priced cost
 * over the symptom's whole candidate list, not one fixed slot), never this
 * per-slot material+labour pipeline.
 */
export function serviceJobCostBreakdown(
  tasks: readonly ServiceJobTask[],
  car: CarInstance,
  model: CarModel,
  context: SimContext,
): ServiceJobCostBreakdown {
  const fixes: PartFixCost[] = []
  let laborSlots = 0
  for (const task of tasks) {
    if (task.kind !== 'slotCondition') continue
    const { carPartId, minBand, minGrade } = task.requirement
    const entry = context.partsTaxonomyById[carPartId]
    if (!entry) continue

    // A grade requirement always buys fresh, so it never asks the atom what
    // the fitted part could be worked up to; anything else does, and the
    // atom's own answer decides whether this task is repaired or replaced.
    const installed = car.parts[carPartId].installed
    const catalogPart = installed ? context.partsById[installed.partId] : undefined
    const fix =
      !minGrade && installed && catalogPart
        ? partFixCostYen(entry, catalogPart, installed.band, minBand, context)
        : null
    if (fix && fix.jobKind !== 'replace') {
      fixes.push(fix)
      laborSlots += taskLaborChain(car, carPartId, fix.jobKind, context).totalSlots
      continue
    }

    // The buy-new route: either a grade requirement (always buys fresh), or
    // a band-only requirement the slot can't reach by repair (scrap, missing,
    // or non-repairable). Both are genuinely outstanding and genuinely priced
    // here as a replacement: the part and the labour to fit it, and no day at
    // all. Fitting a fresh part works no recipe, so nothing about it can force
    // a machine, and reaching a buried slot is a rate rather than a wall.
    const candidates = fittingPartsForRequirement(carPartId, minGrade ?? 'stock', model, context)
    const chain = taskLaborChain(car, carPartId, 'install', context)
    fixes.push({
      jobKind: 'replace',
      partsYen: medianYen(candidates.map((part) => part.priceYen)),
      hireFeeYen: 0,
      hireLine: null,
    })
    laborSlots += chain.totalSlots
  }
  return { taskCostYen: sumFixCosts(fixes).totalYen, laborSlots }
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
 * long as `marginMin >= 1.15` - pricing in the real teardown-chain labour
 * only ever raises the payout side of that ratio, never the player's own
 * minimum achievable cost, so it can only widen the margin, never erode it.
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

/**
 * The customer pays the going quote (docs/design/systems/
 * knowledge-and-diagnosis.md section 8, decided): `symptom`'s payout is the
 * plain weighted MEAN of every candidate's chain-priced fix cost
 * (`candidateFixCostYen`, diagnosis.ts - the ONE fix-cost function; the
 * room's own near-worst-case fear pricing is an auction phenomenon, never a
 * service-counter one), margined and calloutFee-loaded exactly as
 * `deriveServiceJobPayoutYen` margins a slot-task job's own cost pool - the
 * same payout formula SHAPE, a different cost pipeline underneath it.
 *
 * Computed once, at generation time, against the specific customer car just
 * rolled (with the true cause's own part already at `cause.setBand`,
 * `applySpecificSymptom`) - never re-derived once the offer exists, matching
 * every other service-job payout in this codebase.
 */
export function deriveSymptomJobPayoutYen(
  symptom: Symptom,
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  marginRoll: number,
): number {
  const totalWeight = symptom.causes.reduce((sum, cause) => sum + cause.weight, 0)
  if (totalWeight <= 0) return 0
  const weightedMeanCostYen = symptom.causes.reduce((sum, cause) => {
    const cost = candidateFixCostYen(car, model, cause, context)
    return sum + (cause.weight / totalWeight) * cost
  }, 0)
  const { calloutFeeYen } = context.economy.serviceJobs
  return Math.round(weightedMeanCostYen * marginRoll + calloutFeeYen)
}

/**
 * Every authored symptom eligible for a `resolveSymptom` job (spec section
 * 8: "2-4 candidate causes") - every symptom whose own `causes` list is no
 * longer than `MAX_SYMPTOM_JOB_CANDIDATES`. Computed fresh per call (the
 * pool is small and static content, no caching worth the indirection).
 */
function eligibleSymptomJobSymptoms(context: SimContext): Symptom[] {
  return context.symptoms.filter((symptom) => symptom.causes.length <= MAX_SYMPTOM_JOB_CANDIDATES)
}

/**
 * Builds one `resolveSymptom` job's own customer car: a plain generated car
 * with no symptom of its own (`allowSymptoms: false`, matching every other
 * customer-car roll), then one symptom from `eligibleSymptomJobSymptoms`
 * forced onto it (`applySpecificSymptom`, auctions.ts) - "candidates'
 * parts consistent with the car's rolled state" (spec section 8) falls out
 * for free, since the forced cause damages whatever part actually landed on
 * this exact car. Retries the whole car (a fresh generation draw, still
 * deterministic against the shared `rng` stream) a bounded number of times
 * if `applySpecificSymptom` vetoes the first attempt (Law 2, or a rolled-empty
 * target slot) - both rare; `null` after every attempt fails means this
 * offer slot is simply skipped for today, same as an empty eligible pool
 * anywhere else in this file.
 */
function buildSymptomJobCar(
  model: CarModel,
  id: string,
  context: SimContext,
  currentYear: number,
  day: number,
  rng: Rng,
): { car: CarInstance; symptom: Symptom } | null {
  const pool = eligibleSymptomJobSymptoms(context)
  if (pool.length === 0) return null
  const ATTEMPTS = 5
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const symptom = rng.pick(pool)
    const rolledCar = generateAuctionCarInstance(
      model,
      id,
      rng,
      context,
      currentYear,
      false,
      day,
      false,
    )
    const pattern = rolledCar.damagePattern
      ? context.damagePatternsById[rolledCar.damagePattern]
      : undefined
    if (!pattern) continue
    const carOrigin = makeCarOrigin(id, carOriginLabel(model, rolledCar.year), day)
    const result = applySpecificSymptom(rolledCar, model, context, carOrigin, pattern, rng, symptom)
    if (result) return { car: { ...result.car, symptoms: [result.carSymptom] }, symptom }
  }
  return null
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
 *
 * A `resolveSymptom` task is skipped outright: `applySpecificSymptom`
 * (auctions.ts) is what makes a symptom job's own work genuinely
 * outstanding, called separately by `generateDailyServiceJobOffers` before
 * this function ever runs on the rest of the task list.
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
    if (task.kind !== 'slotCondition') continue
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
 * How many external blockers a task's slot demands clearing before work can
 * even start on it - the same single-hop chain `taskLaborChain` actually
 * removes, read here purely structurally (taxonomy + assembly defs only, no
 * car or state) so it can weigh a TEMPLATE before any car has been rolled
 * for it. An assembly member (`assemblies.json`) counts its assembly's own
 * external-blocker set (`externalBlockersFor`), since the whole thing comes
 * off together; a non-member counts its own direct `blockedBy`; a slot that
 * never leaves the car at all (`removable: false`) is never deep.
 */
function taskChainDepth(carPartId: CarPartId, context: SimContext): number {
  const entry = context.partsTaxonomyById[carPartId]
  if (!entry || entry.removable === false) return 0
  const assemblyDef = context.assemblies.find((a) => a.members.includes(carPartId))
  return assemblyDef ? externalBlockersFor(assemblyDef, context).length : entry.blockedBy.length
}

/** A template's own chain depth: the deepest single task it carries - a
 * multi-task template is exactly as deep as its hardest task, since that
 * task's teardown gates the whole job regardless of what else is on the
 * list. A `resolveSymptom` task contributes no depth of its own - it has no
 * `carPartId` chain to measure - so a symptom template's depth is always 0. */
function templateChainDepth(template: ServiceJobType, context: SimContext): number {
  return Math.max(
    0,
    ...template.tasks.map((task) =>
      task.kind === 'slotCondition' ? taskChainDepth(task.requirement.carPartId, context) : 0,
    ),
  )
}

/** Whether every task in `template` is a `resolveSymptom` task - a symptom
 * template is always exactly one such task (`generateDailyServiceJobOffers`
 * only ever authors one), but this reads the real list rather than assuming
 * the shape. */
function isSymptomTemplate(template: ServiceJobType): boolean {
  return template.tasks.every((task) => task.kind === 'resolveSymptom')
}

/**
 * A deep-chain template's offer weight relative to a shallow one:
 * `deepTaskWeightDecay ** depth` - geometric decay, so each extra blocker a
 * job's hardest task demands clearing shrinks its odds of being the one
 * rolled. Felt behaviour: a deep job is a prize the player occasionally
 * gets offered, not the median phone call - a fresh shop's board reads
 * mostly as easy, familiar work, with the rare teardown standing out, and
 * now that its payout prices the whole real chain
 * (`serviceJobCostBreakdown`), it pays like the day it eats.
 *
 * A `resolveSymptom` template reads its own flat
 * `economy.serviceJobs.symptomJobOfferWeight` instead - the chain-depth
 * formula has nothing to measure on a task with no `carPartId`.
 */
function templateOfferWeight(template: ServiceJobType, context: SimContext): number {
  if (isSymptomTemplate(template)) return context.economy.serviceJobs.symptomJobOfferWeight
  return context.economy.serviceJobs.deepTaskWeightDecay ** templateChainDepth(template, context)
}

/**
 * Generates today's fresh batch of service-job offers, a daily bell-curve
 * draw. Each carries a real customer car (rolled like an auction car, then
 * run through `forceTasksOutstanding` so the template's tasks are
 * guaranteed genuinely outstanding on it) and a payout derived from the
 * template's own task list against that specific car
 * (`deriveServiceJobPayoutYen`) - never an authored flat range.
 * Each offer's board lifetime is rolled uniformly per offer from
 * `economy.serviceJobs.offerLifetimeDaysRange`. `state.reputationTier`
 * gates which template TIERS are even in the candidate pool; within that
 * pool, `state`'s own tool levels (`toolLevelsFor`) drive the offer rule
 * (`isTemplateOfferable`): a template asking for a Restore this garage has no
 * covering shop for is not generated at all, and everything else is.
 * `currentYear` (default Infinity = unrestricted)
 * excludes still-unreleased models and clamps the rolled car's year, same
 * as auction generation.
 *
 * A `requiresOperationId` template (a signature template) is excluded from
 * the pool entirely unless that operation's own capability (level 3 of its
 * tool line, which is the shop covering it,
 * `craftOperationCapabilityGateReason`) is met; a template carrying no
 * `requiresOperationId` is never signature-gated at all. Every eligible
 * template is then drawn WEIGHTED by its own chain depth
 * (`templateOfferWeight`), not uniformly: a shallow bolt-on job is the
 * ordinary phone call, a deep teardown is the rarer, better-paying one.
 */
export function generateDailyServiceJobOffers(
  context: SimContext,
  day: number,
  rng: Rng,
  state: GameState,
  currentYear: number = Infinity,
): ServiceJob[] {
  const toolLevels = toolLevelsFor(state, context)
  const eligibleModels = context.models.filter((model) => model.spec.yearFrom <= currentYear)
  const tierEligibleTemplates = context.serviceJobTypes.filter((template) =>
    reputationAtLeast(state.reputationTier, SERVICE_JOB_TIER_MIN_REPUTATION[template.tier]),
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
    const template = pickWeighted(eligibleTemplates, (t) => templateOfferWeight(t, context), rng)
    const model = rng.pick(eligibleModels)
    const id = `svc-car-${day}-${i}`

    if (isSymptomTemplate(template)) {
      // A resolveSymptom job's customer car carries no ordinary force-
      // outstanding slot task - `buildSymptomJobCar` rolls a plain car
      // (still `allowSymptoms: false`, matching every other customer-car
      // roll) and forces exactly one real symptom onto it instead.
      const built = buildSymptomJobCar(model, id, context, currentYear, day, rng)
      if (!built) continue
      const { car, symptom } = built
      const margin = rollMargin(context, rng)
      const payoutYen = deriveSymptomJobPayoutYen(symptom, car, model, context, margin)
      const symptomTask: ServiceJobSymptomTask = { kind: 'resolveSymptom', symptomId: symptom.id }
      offers.push({
        id: `svc-${day}-${i}`,
        typeId: template.id,
        customerName: rng.pick(context.serviceJobCustomerNames),
        description: rng.pick(template.flavorPool),
        tasks: [symptomTask],
        car,
        payoutYen,
        baseReputation: template.baseReputation,
        deadlineDays: template.deadlineDays,
        expiresOnDay: day + rng.int(minLifetimeDays, maxLifetimeDays),
        arrivesOnDay: null,
        dueOnDay: null,
        unlocksSellingChannel: template.unlocksSellingChannel,
      })
      continue
    }

    // A customer's car never rolls a random missing slot
    // (`allowMissingSlots: false`) - `forceTasksOutstanding` below is the
    // only way one of its slots ends up empty, and only when the job's own
    // install task calls for it. Symptoms only spawn on auction lots, never
    // a customer's own car (`allowSymptoms: false`).
    const rolledCar = generateAuctionCarInstance(
      model,
      id,
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
      unlocksSellingChannel: template.unlocksSellingChannel,
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
 * An offer asking for a Restore this garage has no covering shop for is
 * refused (`taskToolBlocked`) and becomes acceptable the moment the shop
 * lands, since the gate is re-checked live here rather than stamped at
 * generation time. Generation already excludes such a template, so this is
 * defence in depth against a stale offer.
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
  if (toolGateSummary(offer.tasks, toolLevels, context).blocked) {
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
 * A `resolveSymptom` task's own completion (spec section 8): the symptom
 * collapsed to its true cause (`symptomResolved`, diagnosis.ts) AND that
 * cause's own part sitting at `fine` or better - narrowing alone (still more
 * than one remaining candidate) is knowledge, not a fix, and a resolved
 * symptom whose true part is still poor/scrap/missing hasn't actually been
 * put right yet. A symptom already CURED off the car entirely
 * (`pruneCuredCauses` removed it from `car.symptoms` once its every
 * candidate's part outgrew its own `setBand`) reads as done outright - there
 * is nothing left to collapse or fix.
 */
function isSymptomTaskDone(
  car: CarInstance,
  task: ServiceJobSymptomTask,
  context: SimContext,
): boolean {
  const carSymptom = car.symptoms.find((s) => s.symptomId === task.symptomId)
  if (!carSymptom) return true
  if (!symptomResolved(carSymptom)) return false
  const symptom = context.symptomsById[carSymptom.symptomId]
  const trueCause = symptom?.causes.find((c) => c.id === carSymptom.trueCauseId)
  if (!trueCause) return false
  const installed = car.parts[trueCause.carPartId].installed
  return !!installed && bandIndex(installed.band) >= bandIndex('fine')
}

/**
 * Whether one task has actually been satisfied on the customer's car. A
 * `slotCondition` task is a one-liner over `evaluateRequirement` - any route
 * counts: re-fitting the customer's own repaired part, fitting a bought one,
 * or fitting one pulled from a donor all satisfy it equally, there is no
 * instance-identity tracking, and an empty or scrap-band slot always fails.
 * A `resolveSymptom` task dispatches to `isSymptomTaskDone` above.
 */
export function isServiceTaskDone(
  car: CarInstance,
  task: ServiceJobTask,
  context: SimContext,
): boolean {
  if (task.kind === 'resolveSymptom') return isSymptomTaskDone(car, task, context)
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
    if (task.kind !== 'slotCondition' || !task.requirement.minGrade) continue
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
 * Appends `channelId` to `state.serviceJobChannelUnlocks` if it names one and
 * it isn't claimed already - the persisted half of a service job's unlock,
 * read by `isSellingChannelUnlocked` (selling.ts). Returns the existing field
 * unchanged (same reference) when there is nothing new to claim, so a job
 * with no unlock, or one already claimed, never touches this field.
 */
function claimedServiceJobChannelUnlocks(
  state: GameState,
  channelId: SellingChannelId | undefined,
): GameState['serviceJobChannelUnlocks'] {
  if (!channelId) return state.serviceJobChannelUnlocks
  const existing = state.serviceJobChannelUnlocks ?? []
  if (existing.includes(channelId)) return state.serviceJobChannelUnlocks
  return [...existing, channelId]
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
  // part-level job on one of those parts goes with it (nothing left to work),
  // alongside the usual dropping of car jobs on the departing car. Which parts
  // those are is read from origin (`provenance.ts`), not a mutable tag - every
  // loose inventory part that traces back to this job's car reconciles out.
  const returnedParts = partsOriginatingFromCar(releasedState.partInventory, job.car.id)
  const reconciledPartIds = new Set(returnedParts.map((p) => p.id))
  // A receipt line for what left with the customer - captured as display
  // strings, not ids, since these instances leave `partInventory` in this
  // same step and could never be looked back up afterward.
  const returnedPartDescriptions = returnedParts
    .map((p) => context.partsById[p.partId])
    .filter((part): part is Part => !!part)
    .map((part) => `${part.brand} ${part.name}`)
  // A part-level job carries the part's own id in `carInstanceId` for stable
  // identity (`resolveRepairStep`, `resolveMachiningLabor`), which is exactly
  // what tells one apart from a car job here.
  const jobs = releasedState.jobs.filter(
    (j) =>
      j.carInstanceId !== job.car.id &&
      !(
        j.partInstanceId !== undefined &&
        j.carInstanceId === j.partInstanceId &&
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
            serviceJobChannelUnlocks: claimedServiceJobChannelUnlocks(
              withReputation,
              job.unlocksSellingChannel,
            ),
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
 * into `context.partsTaxonomyById` directly. `undefined` for a
 * `resolveSymptom` task - it names no single slot. */
export function taskGroup(task: ServiceJobTask, context: SimContext): ComponentId | undefined {
  if (task.kind !== 'slotCondition') return undefined
  return context.partsTaxonomyById[task.requirement.carPartId]?.group
}
