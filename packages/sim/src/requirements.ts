import {
  ALL_CAR_PART_IDS,
  titleCaseFromSlug,
  type CarInstance,
  type CarLedger,
  type CarModel,
  type RequirementSpec,
} from '@midnight-garage/content'
import { bandIndex, isPartMissing } from './bands'
import { computeDerivedStats } from './derivedStats'
import { lapTimeSecondsFor } from './lapModel'
import { marketValueYen } from './marketValue'
import { gradeAtLeast } from './parts'
import { valuateCarForBuyer } from './valuation'
import type { SimContext } from './context'

/**
 * Sprint 72 (outcome-based service jobs, the shared module story missions
 * consume too - Sprint 76): the result of checking one `RequirementSpec`
 * against a car right now. `label`/`actual`/`required` are plain, catalog-
 * display-name-backed strings (never a raw id) so a caller can show them
 * directly, without a second lookup pass.
 */
export interface RequirementResult {
  pass: boolean
  label: string
  actual: string
  required: string
}

/**
 * Sprint 77 (story missions II, the deliver-flow "labels only, no live
 * pass/fail" checklist): every requirement kind's `label`/`required` text
 * depends only on the spec itself and `context` (display names, buyer
 * names) - never on a specific car - so this is the ONE place that text is
 * computed, and every `evaluate*` function below calls it rather than
 * recomputing its own copy. Exported so a caller can render the checklist
 * before any car is even picked (`gameStore.ts`'s `activeStoryMissionView`).
 */
export function requirementLabel(
  spec: RequirementSpec,
  context: SimContext,
): { label: string; required: string } {
  switch (spec.kind) {
    case 'slotCondition': {
      const entry = context.partsTaxonomyById[spec.carPartId]
      const displayName = entry?.displayName ?? spec.carPartId
      const required = spec.minGrade
        ? `${spec.minGrade}+ grade, ${spec.minBand}+ condition`
        : `${spec.minBand}+ condition`
      const label = spec.minGrade
        ? `${displayName}: ${spec.minGrade} or better, fitted and ${spec.minBand}`
        : `${displayName} must be ${spec.minBand}`
      return { label, required }
    }
    case 'statThreshold':
    case 'statCeiling': {
      const statLabel = titleCaseFromSlug(spec.stat)
      const label =
        spec.kind === 'statThreshold'
          ? `${statLabel} at least ${spec.min}`
          : `${statLabel} no more than ${spec.max}`
      const required = spec.kind === 'statThreshold' ? `${spec.min}+` : `<= ${spec.max}`
      return { label, required }
    }
    case 'budgetCap':
      return {
        label: 'Total spend within budget',
        required: `<= ${spec.maxTotalSpendYen.toLocaleString('en-US')}`,
      }
    case 'deadline':
      return { label: 'Deliver on time', required: `by day ${spec.dueOnDay}` }
    case 'tasteMatch': {
      const buyer = context.buyers.find((b) => b.id === spec.buyerId)
      return {
        label: `${buyer?.displayName ?? spec.buyerId} wants this build`,
        required: `${spec.minMultiplier.toFixed(2)}x+`,
      }
    }
    case 'roadworthy':
      return { label: 'Every part worn condition or better', required: 'worn+ throughout' }
    case 'lapTimeCeiling':
      return {
        label: `Lap the ${spec.courseId} course in ${spec.maxSeconds}s or less`,
        required: `<= ${spec.maxSeconds}s`,
      }
  }
}

/** Sprint 72's original primitive: a slot's installed part must be at least
 * `minBand`, and - when present - at least `minGrade`. An empty or scrap-band
 * slot always fails, regardless of `minGrade` - closes the old "or empty"
 * hole (`isServiceTaskDone`'s former `if (!installed) return true` for a
 * repair task). */
function evaluateSlotCondition(
  spec: Extract<RequirementSpec, { kind: 'slotCondition' }>,
  car: CarInstance,
  context: SimContext,
): RequirementResult {
  const { label, required } = requirementLabel(spec, context)
  const installed = car.parts[spec.carPartId].installed

  if (!installed || installed.band === 'scrap') {
    return { pass: false, label, actual: installed ? 'scrap' : 'empty', required }
  }

  const part = context.partsById[installed.partId]
  const actual = part ? `${installed.band} (${part.grade})` : installed.band
  const bandOk = bandIndex(installed.band) >= bandIndex(spec.minBand)
  const gradeOk = !spec.minGrade || (!!part && gradeAtLeast(part.grade, spec.minGrade))
  return { pass: bandOk && gradeOk, label, actual, required }
}

/**
 * Sprint 76 (story missions I): a derived-stat floor/ceiling over
 * `computeDerivedStats`. `model` is optional and trailing on
 * `evaluateRequirement` itself (every pre-Sprint-76 call site never had one to
 * pass); a mission call site always resolves and passes a real `CarModel`, so
 * `model` missing here only ever means "evaluated from a call site that can't
 * resolve one" - fails closed rather than throwing, keeping the function
 * total.
 */
function evaluateStatBound(
  spec: Extract<RequirementSpec, { kind: 'statThreshold' | 'statCeiling' }>,
  car: CarInstance,
  model: CarModel | undefined,
  context: SimContext,
): RequirementResult {
  const { label, required } = requirementLabel(spec, context)
  if (!model) return { pass: false, label, actual: 'unknown', required }

  const stats = computeDerivedStats(
    model,
    car,
    context.partsById,
    context.partsTaxonomy,
    context.economy,
  )
  const actualValue = stats[spec.stat]
  const pass = spec.kind === 'statThreshold' ? actualValue >= spec.min : actualValue <= spec.max
  return { pass, label, actual: `${actualValue}`, required }
}

/** Sprint 76: a spend ceiling over the caller's own `ledger` - purchase (0
 * when unknown - only reachable via a dev grant, accepted), repairs, and
 * installed parts must together stay at or under `maxTotalSpendYen`. */
function evaluateBudgetCap(
  spec: Extract<RequirementSpec, { kind: 'budgetCap' }>,
  ledger: CarLedger,
  context: SimContext,
): RequirementResult {
  const { label, required } = requirementLabel(spec, context)
  const spend = (ledger.purchaseYen ?? 0) + ledger.repairYen + ledger.partsYen
  return {
    pass: spend <= spec.maxTotalSpendYen,
    label,
    actual: spend.toLocaleString('en-US'),
    required,
  }
}

/** Sprint 76: a day-of-delivery cutoff, evaluated against the caller's own
 * `day` - delivery day, not accept day. */
function evaluateDeadline(
  spec: Extract<RequirementSpec, { kind: 'deadline' }>,
  day: number,
  context: SimContext,
): RequirementResult {
  const { label, required } = requirementLabel(spec, context)
  return { pass: day <= spec.dueOnDay, label, actual: `day ${day}`, required }
}

/**
 * Sprint 76: "this buyer archetype has to actually want it." `valuateCarForBuyer
 * / marketValueYen` is exactly `tasteMultiplier` (`valuation.ts`) regardless
 * of which heat value is used for both terms, as long as it's the SAME heat
 * for both - so this reads at a fixed neutral heat rather than needing the
 * live `GameState.marketHeat` map threaded into `evaluateRequirement`'s
 * signature at all.
 */
const TASTE_MATCH_NEUTRAL_HEAT_PERCENT = 100

function evaluateTasteMatch(
  spec: Extract<RequirementSpec, { kind: 'tasteMatch' }>,
  car: CarInstance,
  model: CarModel | undefined,
  context: SimContext,
): RequirementResult {
  const { label, required } = requirementLabel(spec, context)
  const buyer = context.buyers.find((b) => b.id === spec.buyerId)
  if (!model || !buyer) return { pass: false, label, actual: 'unknown', required }

  const value = marketValueYen(
    model,
    car,
    TASTE_MATCH_NEUTRAL_HEAT_PERCENT,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  const valuated = valuateCarForBuyer(
    buyer,
    model,
    car,
    context.partsById,
    context.partsTaxonomy,
    context.partsTaxonomyById,
    TASTE_MATCH_NEUTRAL_HEAT_PERCENT,
    context.economy,
  )
  const ratio = value > 0 ? valuated / value : 0
  return { pass: ratio >= spec.minMultiplier, label, actual: `${ratio.toFixed(2)}x`, required }
}

/**
 * Sprint 76, corrected Sprint 90: every slot a real defect could touch holds
 * an installed part at `worn` condition or better. A filled slot fails when it
 * is below `worn`; an empty slot fails only when it is genuinely missing
 * (`isPartMissing`) - a legitimately-absent `forcedInduction` slot on an NA car
 * is not a defect and never counts, exactly as every other consumer (auction
 * grading, the cost/condition/stat helpers) already treats it. An unresolvable
 * model fails closed (an empty slot counts), matching how the sibling
 * stat/taste/lap evaluators degrade.
 */
function evaluateRoadworthy(
  spec: Extract<RequirementSpec, { kind: 'roadworthy' }>,
  car: CarInstance,
  context: SimContext,
): RequirementResult {
  const { label, required } = requirementLabel(spec, context)
  const model = context.modelsById[car.modelId]
  const minIndex = bandIndex('worn')
  let failingCount = 0
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = car.parts[partId].installed
    if (installed) {
      if (bandIndex(installed.band) < minIndex) failingCount += 1
    } else if (!model || isPartMissing(car, model, partId)) {
      failingCount += 1
    }
  }
  const actual =
    failingCount === 0
      ? required
      : `${failingCount} slot${failingCount === 1 ? '' : 's'} below worn`
  return { pass: failingCount === 0, label, actual, required }
}

/** Sprint 77 decision 2: a reference-lap time ceiling on one named course -
 * passes when `lapTimeSecondsFor` returns a real time at or under
 * `maxSeconds`. Fails with `actual: "no time set"` when the model returns
 * `null` (no tyres fitted, or a scrap-band set - nothing to grip the road
 * with). `model` missing here (a legacy call site) fails closed the same
 * way, for the same reason `evaluateStatBound`/`evaluateTasteMatch` do. */
function evaluateLapTimeCeiling(
  spec: Extract<RequirementSpec, { kind: 'lapTimeCeiling' }>,
  car: CarInstance,
  model: CarModel | undefined,
  context: SimContext,
): RequirementResult {
  const { label, required } = requirementLabel(spec, context)
  const timeSeconds = model ? lapTimeSecondsFor(car, model, context) : null
  if (timeSeconds === null) return { pass: false, label, actual: 'no time set', required }
  return { pass: timeSeconds <= spec.maxSeconds, label, actual: `${timeSeconds}s`, required }
}

/**
 * The one evaluator every requirement kind runs through. Pure and total over
 * `RequirementSpec` (Sprint 76 extended the dispatch from `slotCondition`
 * alone to six kinds; Sprint 77 adds `lapTimeCeiling` as the seventh).
 * `model` is optional and trailing: every pre-Sprint-76 call site
 * (`isServiceTaskDone`, evaluating `slotCondition` only) keeps compiling
 * unchanged, since none of those kinds ever read it; a story-mission call
 * site always resolves and passes the real `CarModel` the stat/taste/lap
 * kinds need.
 */
export function evaluateRequirement(
  spec: RequirementSpec,
  car: CarInstance,
  ledger: CarLedger,
  day: number,
  context: SimContext,
  model?: CarModel,
): RequirementResult {
  switch (spec.kind) {
    case 'slotCondition':
      return evaluateSlotCondition(spec, car, context)
    case 'statThreshold':
    case 'statCeiling':
      return evaluateStatBound(spec, car, model, context)
    case 'budgetCap':
      return evaluateBudgetCap(spec, ledger, context)
    case 'deadline':
      return evaluateDeadline(spec, day, context)
    case 'tasteMatch':
      return evaluateTasteMatch(spec, car, model, context)
    case 'roadworthy':
      return evaluateRoadworthy(spec, car, context)
    case 'lapTimeCeiling':
      return evaluateLapTimeCeiling(spec, car, model, context)
  }
}
