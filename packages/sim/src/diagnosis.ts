import type {
  AuctionLot,
  AuctionTier,
  CarInstance,
  CarModel,
  CarPartId,
  Cause,
  ConditionBand,
  DayLogEntry,
  GameState,
  Symptom,
} from '@midnight-garage/content'
import { DIAGNOSTIC_TESTS, titleCaseFromSlug } from '@midnight-garage/content'
import { bandIndex } from './bands'
import { energyMax } from './laborSlots'
import type { SimContext } from './context'
import { benchHasTrait, benchedMemberWithTrait } from './crewSkills'
import { marketValueYen } from './marketValue'

type CarSymptom = CarInstance['symptoms'][number]

/**
 * The room prices the symptom, the player prices the cause. The room only
 * ever shows a symptomatic car's APPARENT condition (the pre-damage band
 * recorded at generation, `CarInstance.apparentBandByPartId`), never the
 * true, currently-installed band a damaged part actually holds.
 * `apparentViewOf` is the one place that builds "the car as the room sees
 * it"; every valuation on the auction side of a symptomatic lot goes through
 * a view built here, never the true `car` directly.
 */

/** A copy of `car` with every damaged part's band swapped back to its
 * recorded apparent (pre-damage) value - identical to `car` for an honest
 * car (`apparentBandByPartId === null`). Pure: never mutates `car`, and used
 * both for display (the lot card) and for sheet pricing below. */
export function apparentViewOf(car: CarInstance): CarInstance {
  if (!car.apparentBandByPartId) return car
  const parts = { ...car.parts }
  for (const [partId, band] of Object.entries(car.apparentBandByPartId)) {
    const installed = car.parts[partId as CarPartId].installed
    if (!installed || !band) continue
    parts[partId as CarPartId] = { installed: { ...installed, band } }
  }
  return { ...car, parts }
}

/** Every one of a symptom's own causes, unfiltered - the room's cause set,
 * which knows nothing about the player's own narrowing knowledge. */
function allCauses(_carSymptom: CarSymptom, symptom: Symptom): readonly Cause[] {
  return symptom.causes
}

/**
 * The total expected DISCOUNT off the apparent value across every symptom
 * `car` carries, given `apparent` (`apparentViewOf(car)`) and its own
 * already-computed `apparentValue` - the one body behind every estimator
 * below, so no caller prices the apparent view or walks a cause list twice.
 * For each symptom, `causesFor(carSymptom, symptom)` picks which causes are
 * still in play; `marketValueYen` is computed once per cause (that cause's
 * damage applied to the apparent view) and weight-averaged over just those
 * causes - the symptom's own expected discount. Symptoms combine by summing
 * each one's own discount in turn (array order, deterministic) - treating
 * each symptom's uncertainty as an independent deduction rather than
 * enumerating the full cross-product of every symptom's causes, which stays
 * exact for the shipped `maxSymptomsPerCar: 2` and any single-symptom car
 * (the overwhelming majority), and is a standard linear approximation for
 * the rare two-symptom case. Zero for an honest car (no symptoms), and zero
 * for any symptom `causesFor` returns no causes for - a fully-resolved
 * symptom (exactly one remaining cause) contributes its exact true value,
 * no averaging.
 */
function symptomDiscountYen(
  car: CarInstance,
  model: CarModel,
  apparent: CarInstance,
  apparentValue: number,
  heatPercent: number,
  context: SimContext,
  causesFor: (carSymptom: CarSymptom, symptom: Symptom) => readonly Cause[] = allCauses,
): number {
  let discount = 0
  for (const carSymptom of car.symptoms) {
    const symptom = context.symptomsById[carSymptom.symptomId]
    if (!symptom) continue
    const causes = causesFor(carSymptom, symptom)
    const totalWeight = causes.reduce((sum, cause) => sum + cause.weight, 0)
    if (totalWeight <= 0) continue
    const weightedMean = causes.reduce((sum, cause) => {
      const installed = apparent.parts[cause.carPartId].installed
      // A cause on an unfitted part cannot damage what is not there, so it implies no value change.
      if (!installed) return sum + (cause.weight / totalWeight) * apparentValue
      const damagedView: CarInstance = {
        ...apparent,
        parts: {
          ...apparent.parts,
          [cause.carPartId]: { installed: { ...installed, band: cause.setBand } },
        },
      }
      const causeValue = marketValueYen(
        model,
        damagedView,
        heatPercent,
        context.partsById,
        context.partsTaxonomyById,
        context.economy,
      )
      return sum + (cause.weight / totalWeight) * causeValue
    }, 0)
    discount += apparentValue - weightedMean
  }
  return discount
}

/**
 * The one estimator behind every diagnosis-side price: the apparent view's
 * market value minus the expected symptom discount over `causesFor`'s cause
 * set (`symptomDiscountYen` above). The cause set is the ONLY lever - the
 * room averages over every authored cause, the player over the causes their
 * own knowledge still leaves standing - so knowledge is the only thing that
 * separates the player's number from the room's. An honest car (no
 * symptoms) prices at exactly `marketValueYen(car)`.
 */
function estimateValueYen(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
  causesFor: (carSymptom: CarSymptom, symptom: Symptom) => readonly Cause[] = allCauses,
): number {
  const heatPercent = state.marketHeat[model.id] ?? 100
  const apparent = apparentViewOf(car)
  const apparentValue = marketValueYen(
    model,
    apparent,
    heatPercent,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  return (
    apparentValue -
    symptomDiscountYen(car, model, apparent, apparentValue, heatPercent, context, causesFor)
  )
}

/**
 * The all-cause expectation: what this car is worth on average given every
 * symptom's own full weighted cause table - `estimateValueYen` over the
 * unfiltered cause set. Identical to `sheetGuideValueYen` by construction;
 * both names are kept because they answer different questions at the call
 * site (the honest average vs the number printed on the auction sheet).
 */
export function expectedTrueValueYen(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): number {
  return estimateValueYen(car, model, state, context)
}

/**
 * The room's number - what the auction sheet prints and every room price
 * derives from (`bidding.ts`'s `carGuideValueYen`): `estimateValueYen` over
 * the unfiltered cause set. The room prices the odds, nothing more, so this
 * equals `expectedTrueValueYen` and the two only ever diverge from the
 * PLAYER's read (`playerEstimateYen`) once narrowing has happened.
 */
export function sheetGuideValueYen(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): number {
  return estimateValueYen(car, model, state, context)
}

/**
 * The player's number: `estimateValueYen` over each symptom's REMAINING
 * causes (`remainingCauseIds`, narrowed by tests, workups, and
 * reveal-on-removal), reweighted - the original weights renormalised over
 * just the remaining set by `symptomDiscountYen`'s `totalWeight` division.
 * Equals the room's number while nothing has narrowed; a fully-resolved
 * symptom (exactly one remaining cause) contributes its exact true value
 * with no averaging at all.
 */
export function playerEstimateYen(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): number {
  const remainingCausesFor = (carSymptom: CarSymptom, symptom: Symptom): readonly Cause[] =>
    symptom.causes.filter((cause) => carSymptom.remainingCauseIds.includes(cause.id))
  return estimateValueYen(car, model, state, context, remainingCausesFor)
}

/**
 * The ONE rule governing every band the player sees. True when (a) the car
 * is honest, (b) this part has no recorded apparent band at all (a symptom
 * never damaged it), or (c) every symptom that DOES target this part has
 * narrowed enough to resolve it - either no remaining candidate cause
 * still targets this part, or the symptom has narrowed to exactly one
 * remaining cause overall (so whichever it is, its effect on this part -
 * damaging it or not - is already known). Otherwise the APPARENT band,
 * flagged `uncertain` for the UI's "?" chip. `null` band means genuinely
 * missing (mirrors every other missing-slot convention in this codebase -
 * never a real `ConditionBand` value).
 */
export function displayedBandFor(
  car: CarInstance,
  partId: CarPartId,
  context: SimContext,
): { band: ConditionBand | null; uncertain: boolean } {
  const trueBand = car.parts[partId].installed?.band ?? null
  if (!car.apparentBandByPartId) return { band: trueBand, uncertain: false }
  const apparentBand = car.apparentBandByPartId[partId]
  if (apparentBand === undefined) return { band: trueBand, uncertain: false }

  const stillUncertain = car.symptoms.some((carSymptom) => {
    const symptom = context.symptomsById[carSymptom.symptomId]
    if (!symptom) return false
    const targetsThisPart = symptom.causes.some((cause) => cause.carPartId === partId)
    if (!targetsThisPart) return false
    if (carSymptom.remainingCauseIds.length <= 1) return false // symptom fully resolved
    return symptom.causes.some(
      (cause) => cause.carPartId === partId && carSymptom.remainingCauseIds.includes(cause.id),
    )
  })

  if (!stillUncertain) return { band: trueBand, uncertain: false }
  return { band: apparentBand, uncertain: true }
}

/** Every cause across `car`'s symptoms that still (a) remains a live
 * candidate and (b) targets `partId` - the "worst remaining cause" repair-
 * cost-preview range reads this to find its worst-case band. */
function remainingCausesTargeting(
  car: CarInstance,
  partId: CarPartId,
  context: SimContext,
): Cause[] {
  const result: Cause[] = []
  for (const carSymptom of car.symptoms) {
    const symptom = context.symptomsById[carSymptom.symptomId]
    if (!symptom) continue
    for (const cause of symptom.causes) {
      if (cause.carPartId === partId && carSymptom.remainingCauseIds.includes(cause.id)) {
        result.push(cause)
      }
    }
  }
  return result
}

/**
 * The repair-cost-preview range: the worst (lowest) band any still-live
 * remaining cause would set `partId` to, or `null` when nothing remaining
 * targets it (an uncertain-repair-cost preview has nothing worse to show
 * than the apparent band itself).
 */
export function worstRemainingBandFor(
  car: CarInstance,
  partId: CarPartId,
  context: SimContext,
): ConditionBand | null {
  const causes = remainingCausesTargeting(car, partId, context)
  if (causes.length === 0) return null
  const bandOrder: readonly ConditionBand[] = ['scrap', 'poor', 'worn', 'fine', 'mint']
  let worst: ConditionBand = 'mint'
  for (const cause of causes) {
    if (bandOrder.indexOf(cause.setBand) < bandOrder.indexOf(worst)) worst = cause.setBand
  }
  return worst
}

/**
 * Uninstall reveals truth. Called from `resolveRemovePart` (jobs.ts) after
 * a successful removal of `carPartId` on an OWNED car - the removed
 * instance's band was always the true band, so pulling it is free
 * knowledge, no extra labour beyond what the teardown itself already cost.
 * For each symptom still open (more than one remaining cause): if its
 * `trueCauseId` targets `carPartId`, the true cause is now directly known -
 * collapse `remainingCauseIds` to exactly `[trueCauseId]` and report it as
 * `revealedCauseId` (the day-log reveal line, "Opened it up: <cause>.",
 * fires only for this branch - it is the moment the true cause is directly
 * SEEN, not merely narrowed); otherwise, this part is now proven undamaged
 * by whichever cause turns out true, so every remaining candidate that
 * targets `carPartId` is eliminated (silent narrowing, no reveal line, even
 * if it happens to leave exactly one remaining candidate for some OTHER
 * part). At most one symptom's own `trueCauseId` can target a given part
 * in practice, so `revealedCauseId` reports the first (and only) one
 * found.
 */
export function revealOnRemoval(
  car: CarInstance,
  carPartId: CarPartId,
  context: SimContext,
): { car: CarInstance; revealedCauseId: string | null } {
  if (car.symptoms.length === 0) return { car, revealedCauseId: null }
  let revealedCauseId: string | null = null
  const symptoms = car.symptoms.map((carSymptom) => {
    if (carSymptom.remainingCauseIds.length <= 1) return carSymptom // already resolved
    const symptom = context.symptomsById[carSymptom.symptomId]
    if (!symptom) return carSymptom
    const trueCause = symptom.causes.find((cause) => cause.id === carSymptom.trueCauseId)
    if (!trueCause || trueCause.carPartId !== carPartId) {
      const remainingCauseIds = carSymptom.remainingCauseIds.filter((id) => {
        const cause = symptom.causes.find((c) => c.id === id)
        return cause ? cause.carPartId !== carPartId : true
      })
      return { ...carSymptom, remainingCauseIds }
    }
    revealedCauseId ??= carSymptom.trueCauseId
    return { ...carSymptom, remainingCauseIds: [carSymptom.trueCauseId] }
  })
  return { car: { ...car, symptoms }, revealedCauseId }
}

/**
 * Cure-on-repair: `revealOnRemoval`'s sibling on the install side, a pure
 * prune over `remainingCauseIds`, called after ANY resolver raises one of
 * `car`'s installed part bands - a repair-zone completion, a fresh install,
 * a benched member's refit. For every symptom, drops each remaining cause
 * whose own `carPartId` currently sits STRICTLY better (by `bandIndex`) than
 * that cause's `setBand`: whatever damage the cause claims, the part fitted
 * now cannot carry it. Equal band never cures - the damage a cause claims is
 * still exactly what's fitted, so it stays a live candidate; an unfitted
 * slot proves nothing either way, so a cause targeting it is left alone too.
 * A symptom pruned down to zero causes is CURED and leaves `car.symptoms`
 * entirely, exactly as if it had never been generated; pruned to exactly one
 * is resolved knowledge, the same state a workup or a narrowing test leaves
 * behind. Never called on removal - an emptied slot reveals nothing about
 * which cause was true (`revealOnRemoval` owns that read); this only ever
 * runs where a band goes UP.
 */
export function pruneCuredCauses(car: CarInstance, context: SimContext): CarInstance {
  if (car.symptoms.length === 0) return car
  let changed = false
  const symptoms: CarSymptom[] = []
  for (const carSymptom of car.symptoms) {
    const symptom = context.symptomsById[carSymptom.symptomId]
    if (!symptom) {
      symptoms.push(carSymptom)
      continue
    }
    const remainingCauseIds = carSymptom.remainingCauseIds.filter((id) => {
      const cause = symptom.causes.find((c) => c.id === id)
      if (!cause) return true
      const installed = car.parts[cause.carPartId].installed
      if (!installed) return true
      return bandIndex(installed.band) <= bandIndex(cause.setBand)
    })
    if (remainingCauseIds.length === carSymptom.remainingCauseIds.length) {
      symptoms.push(carSymptom)
      continue
    }
    changed = true
    if (remainingCauseIds.length > 0) symptoms.push({ ...carSymptom, remainingCauseIds })
  }
  return changed ? { ...car, symptoms } : car
}

/** Outcome discriminants shared by the three day-state verbs below - every
 * refusal is a plain no-op (unchanged `state`, empty `log`), matching every
 * other instant resolver's own "refuse quietly, let the caller show why"
 * shape in this codebase. */
export type BeginInspectionVisitOutcome = 'started' | InspectionVisitGateReason

export interface BeginInspectionVisitResult {
  state: GameState
  log: DayLogEntry[]
  outcome: BeginInspectionVisitOutcome
}

export type InspectionVisitGateReason = 'no-labor-slot' | 'no-cash' | 'no-lots'

/**
 * The pure "why can't I start a visit at `tier` right now" predicate -
 * what the UI queries proactively for the per-tier button's disabled
 * reason (mirrors `removeBlockReason`'s own reuse shape, jobs.ts). `null`
 * when nothing blocks it. Shared with `beginInspectionVisit` below so
 * there is one gate, not two.
 */
export function inspectionVisitGateReason(
  state: GameState,
  tier: AuctionTier,
  context: SimContext,
): InspectionVisitGateReason | null {
  const feeYen = context.economy.diagnosis.travelFeeYenByTier[tier]
  const freeEnergy = energyMax(state, context.economy) - state.energySpentToday
  if (freeEnergy < context.economy.energy.actionPoints.inspectionVisit) return 'no-labor-slot'
  if (state.cashYen < feeYen) return 'no-cash'
  const hasLiveLot = state.activeAuctionLots.some((lot) => lot.tier === tier)
  if (!hasLiveLot) return 'no-lots'
  return null
}

/**
 * Start (or replace) the yard inspection visit at `tier` - requires a free
 * labour slot, enough cash for `economy.diagnosis.travelFeeYenByTier[tier]`,
 * and at least one live lot at that tier (`inspectionVisitGateReason`
 * above). Spends the slot and the fee, sets `minutesLeft` to the full
 * `economy.diagnosis.visitMinutes`. Deliberately does NOT refuse when a
 * different visit is already active with minutes left - it simply replaces
 * it, forfeiting the remainder; the two-step confirm before that happens
 * at all is a UI-layer courtesy, not a rule this resolver enforces itself.
 *
 * A benched `auction-rat` knows the Local Yard, so a local-yard visit
 * grants `economy.staff.auctionRatExtraMinutes` on top of the base
 * minutes. One tier, no stacking - one rat's worth regardless of count.
 */
export function beginInspectionVisit(
  state: GameState,
  tier: AuctionTier,
  context: SimContext,
): BeginInspectionVisitResult {
  const gateReason = inspectionVisitGateReason(state, tier, context)
  if (gateReason) return { state, log: [], outcome: gateReason }

  const feeYen = context.economy.diagnosis.travelFeeYenByTier[tier]
  const ratBonus =
    tier === 'local-yard' && benchHasTrait(state.staff, 'auction-rat')
      ? context.economy.staff.auctionRatExtraMinutes
      : 0
  const minutesGranted = context.economy.diagnosis.visitMinutes + ratBonus
  const nextState: GameState = {
    ...state,
    cashYen: state.cashYen - feeYen,
    energySpentToday: state.energySpentToday + context.economy.energy.actionPoints.inspectionVisit,
    inspectionVisit: { tier, minutesLeft: minutesGranted },
  }
  return {
    state: nextState,
    log: [{ type: 'inspection-visit', tier, feeYen, minutesGranted }],
    outcome: 'started',
  }
}

/**
 * Which of `symptom`'s own test applications are currently offerable to
 * `carSymptom` - a test qualifies iff it has no `unlockedBy` (a root,
 * offered from the start), or its `unlockedBy.testId` is already in
 * `carSymptom.runTestIds` AND (`unlockedBy.group` is absent, or that
 * parent test's own outcome fell in partition group `unlockedBy.group`).
 * An absent `group` means the sibling having run at all is enough,
 * whichever way it resolved - this is how a whole board of follow-up
 * tests opens after a first look. A parent's outcome group is the index of
 * its `partition` entry containing `carSymptom.trueCauseId` - the sim
 * itself may read the true cause to route the tree; the player only ever
 * sees the result copy the room already showed them. Availability is
 * always DERIVED from `runTestIds` + `trueCauseId` + content, never
 * stored, so it needs no save-state of its own. An already-run test still
 * counts as available here - separating "offered" from "already run" is
 * the caller's job (`runDiagnosticTest`'s own `already-run` gate, the UI's
 * breadcrumb trail), not this function's.
 */
export function availableTestIdsFor(carSymptom: CarSymptom, symptom: Symptom): string[] {
  return symptom.tests
    .filter((testApplication) => {
      if (!testApplication.unlockedBy) return true
      const { testId: parentId, group } = testApplication.unlockedBy
      if (!carSymptom.runTestIds.includes(parentId)) return false
      if (group === undefined) return true
      const parent = symptom.tests.find((t) => t.testId === parentId)
      if (!parent) return false
      const parentGroupIndex = parent.partition.findIndex((causeIds) =>
        causeIds.includes(carSymptom.trueCauseId),
      )
      return parentGroupIndex === group
    })
    .map((testApplication) => testApplication.testId)
}

/** Builds a from-scratch, real-shaped car symptom for `symptom` whose true
 * cause is `trueCauseId` - every cause still a live candidate, nothing yet
 * run. The optimal-route search's own starting point for "a car whose true
 * cause turns out to be X" (`bestRouteMinutesToResolve` below). */
function freshRouteState(symptom: Symptom, trueCauseId: string): CarSymptom {
  return {
    symptomId: symptom.id,
    trueCauseId,
    remainingCauseIds: symptom.causes.map((cause) => cause.id),
    runTestIds: [],
  }
}

/** One diagnostic test's minutes cost, read off the real content catalog -
 * `bestRouteMinutesToResolve`'s own default lookup, since every existing
 * caller (the route probes) only ever routes real symptoms against real
 * tests. */
const REAL_MINUTES_BY_TEST_ID: Readonly<Record<string, number>> = Object.fromEntries(
  DIAGNOSTIC_TESTS.map((test) => [test.id, test.minutes]),
)

function realContentMinutesForTestId(testId: string): number {
  const minutes = REAL_MINUTES_BY_TEST_ID[testId]
  if (minutes === undefined) throw new Error(`no real content diagnostic test "${testId}"`)
  return minutes
}

interface OptimalRoute {
  /** The fewest additional minutes any legal route from here needs to reach
   * full resolution (a single remaining cause) - zero once already resolved. */
  minutes: number
  /** The first test of that cheapest route, or `null` once resolved. */
  nextTestId: string | null
}

/**
 * The expected-minutes-optimal route search: the reading player's own
 * policy, since a player who reads every result and reasons about it always
 * routes to the cheapest path to the answer. Exhaustively tries every
 * currently offered, not-yet-run test (`availableTestIdsFor`), narrows
 * exactly as `runDiagnosticTest` narrows a real symptom for the known
 * `trueCauseId`, and recurses; a branch that never reaches resolution
 * contributes nothing (never wins, never throws here) - only the caller
 * decides whether "no route at all" is an error. Ties (more than one test
 * reaching the same minimal total) resolve to the first in
 * `availableTestIdsFor`'s own order, so the pick is always deterministic.
 * One search behind both `bestRouteMinutesToResolve` below (a fresh
 * symptom, minutes only - the route probes' own reading-pays law) and
 * `bestNextTestId` (a live, possibly mid-route symptom - the send-inspector
 * resolver's own step, diagnosis.ts) - the reader policy has exactly one
 * implementation.
 */
function searchOptimalRoute(
  carSymptom: CarSymptom,
  symptom: Symptom,
  minutesForTestId: (testId: string) => number,
): OptimalRoute | null {
  if (carSymptom.remainingCauseIds.length <= 1) return { minutes: 0, nextTestId: null }
  const available = availableTestIdsFor(carSymptom, symptom).filter(
    (testId) => !carSymptom.runTestIds.includes(testId),
  )
  let best: OptimalRoute | null = null
  for (const testId of available) {
    const testApplication = symptom.tests.find((t) => t.testId === testId)
    if (!testApplication) throw new Error(`"${symptom.id}" has no test "${testId}"`)
    const group = testApplication.partition.find((g) => g.includes(carSymptom.trueCauseId))
    if (!group) {
      throw new Error(`"${testId}" partition never covers "${carSymptom.trueCauseId}"`)
    }
    const narrowed: CarSymptom = {
      ...carSymptom,
      remainingCauseIds: carSymptom.remainingCauseIds.filter((id) => group.includes(id)),
      runTestIds: [...carSymptom.runTestIds, testId],
    }
    const sub = searchOptimalRoute(narrowed, symptom, minutesForTestId)
    if (!sub) continue
    const minutes = minutesForTestId(testId) + sub.minutes
    if (best === null || minutes < best.minutes) best = { minutes, nextTestId: testId }
  }
  return best
}

/**
 * The fewest minutes any legal route needs to fully resolve `symptom` down
 * to `trueCauseId` alone, starting from a fresh (nothing yet run) symptom -
 * `diagnosisRouteProbes.test.ts`'s own `readerMinutes`/`isIsolatable`/
 * "reading pays" law reads this directly against real content
 * (`minutesForTestId` defaults to the real catalog, `REAL_MINUTES_BY_TEST_ID`
 * above). Throws if no route from a fresh symptom ever resolves this cause -
 * the "resolution accounting" probe's own contract, unchanged from before
 * the extraction.
 */
export function bestRouteMinutesToResolve(
  symptom: Symptom,
  trueCauseId: string,
  minutesForTestId: (testId: string) => number = realContentMinutesForTestId,
): number {
  const route = searchOptimalRoute(freshRouteState(symptom, trueCauseId), symptom, minutesForTestId)
  if (!route) {
    throw new Error(`"${symptom.id}" has no route that ever resolves trueCauseId="${trueCauseId}"`)
  }
  return route.minutes
}

/**
 * The next test the reading policy would run against `carSymptom` right
 * now - `null` once it is already resolved (or, on a content bug, if no
 * route from here ever resolves). The send-inspector resolver's own step
 * (`resolveSendInspector` below): it charges this test through the REAL
 * `runDiagnosticTest`, then asks again off the narrowed result, walking the
 * same route a player who read every result and routed perfectly would
 * have walked by hand.
 */
export function bestNextTestId(
  carSymptom: CarSymptom,
  symptom: Symptom,
  context: SimContext,
): string | null {
  const route = searchOptimalRoute(carSymptom, symptom, (testId) => {
    const test = context.diagnosticTestsById[testId]
    if (!test) throw new Error(`context has no diagnostic test "${testId}"`)
    return test.minutes
  })
  return route?.nextTestId ?? null
}

export type RunDiagnosticTestOutcome =
  | 'ran'
  | 'no-visit'
  | 'wrong-tier'
  | 'not-found'
  | 'test-not-applicable'
  | 'locked'
  | 'already-run'
  | 'not-enough-minutes'

export interface RunDiagnosticTestResult {
  state: GameState
  log: DayLogEntry[]
  outcome: RunDiagnosticTestOutcome
  /** The authored result-copy line for the partition group the true cause
   * fell in, or `null` when the test didn't legally run. */
  resultCopy: string | null
}

/**
 * Run `testId` against `lotId`'s `symptomIndex`-th symptom. Legal only
 * with an active visit at the lot's own tier, a test that actually
 * applies to this symptom and is registered, one currently OFFERED by the
 * routed tree (`availableTestIdsFor` - checked before the already-run
 * refusal, so a locked test reports `locked` even on a repeat call), one
 * that hasn't already run on this exact symptom instance (`runTestIds`),
 * and enough `minutesLeft`. Deterministic, no RNG: finds which of the
 * test's two partition groups contains the (already-rolled,
 * generation-time) `trueCauseId`, and narrows `remainingCauseIds` to its
 * intersection with that group. Knowledge lives on the car itself, not the
 * visit, so it survives a purchase and dies with a lost lot for free -
 * nothing extra to wire.
 */
export function runDiagnosticTest(
  state: GameState,
  lotId: string,
  symptomIndex: number,
  testId: string,
  context: SimContext,
): RunDiagnosticTestResult {
  const visit = state.inspectionVisit
  if (!visit) return { state, log: [], outcome: 'no-visit', resultCopy: null }
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot) return { state, log: [], outcome: 'not-found', resultCopy: null }
  if (lot.tier !== visit.tier) return { state, log: [], outcome: 'wrong-tier', resultCopy: null }
  const carSymptom = lot.car.symptoms[symptomIndex]
  if (!carSymptom) return { state, log: [], outcome: 'not-found', resultCopy: null }
  const symptom = context.symptomsById[carSymptom.symptomId]
  if (!symptom) return { state, log: [], outcome: 'not-found', resultCopy: null }
  const testApplication = symptom.tests.find((t) => t.testId === testId)
  if (!testApplication) {
    return { state, log: [], outcome: 'test-not-applicable', resultCopy: null }
  }
  const test = context.diagnosticTestsById[testId]
  if (!test) return { state, log: [], outcome: 'test-not-applicable', resultCopy: null }
  if (!availableTestIdsFor(carSymptom, symptom).includes(testId)) {
    return { state, log: [], outcome: 'locked', resultCopy: null }
  }
  if (carSymptom.runTestIds.includes(testId)) {
    return { state, log: [], outcome: 'already-run', resultCopy: null }
  }
  if (visit.minutesLeft < test.minutes) {
    return { state, log: [], outcome: 'not-enough-minutes', resultCopy: null }
  }

  const groupIndex = testApplication.partition.findIndex((group) =>
    group.includes(carSymptom.trueCauseId),
  )
  // Content integrity (packages/content/tests/symptom.test.ts) guarantees
  // every partition covers its symptom's full cause list exactly once, so
  // trueCauseId (always one of the symptom's own causes) is always found -
  // this fallback never fires against real content.
  if (groupIndex === -1) {
    return { state, log: [], outcome: 'test-not-applicable', resultCopy: null }
  }
  const group = testApplication.partition[groupIndex]!
  const resultCopy = testApplication.resultCopy[groupIndex]!
  const newRemaining = carSymptom.remainingCauseIds.filter((id) => group.includes(id))

  const updatedSymptom: CarSymptom = {
    ...carSymptom,
    remainingCauseIds: newRemaining,
    runTestIds: [...carSymptom.runTestIds, testId],
  }
  const updatedCar: CarInstance = {
    ...lot.car,
    symptoms: lot.car.symptoms.map((s, i) => (i === symptomIndex ? updatedSymptom : s)),
  }
  const updatedLot: AuctionLot = { ...lot, car: updatedCar }
  const nextState: GameState = {
    ...state,
    activeAuctionLots: state.activeAuctionLots.map((l) => (l.id === lotId ? updatedLot : l)),
    inspectionVisit: { ...visit, minutesLeft: visit.minutesLeft - test.minutes },
  }
  return { state: nextState, log: [], outcome: 'ran', resultCopy }
}

/** The very first test the send-inspector walk would attempt against `lot`
 * right now: the first not-yet-resolved symptom (array order), its own
 * next optimal test (`bestNextTestId`). `null` once every symptom is
 * resolved, the lot carries none, or (a content bug) an open symptom has no
 * route out at all. `sendInspectorGateReason`'s own `not-enough-minutes`
 * check and `resolveSendInspector`'s own walk both start from this exact
 * read, so the gate never promises a pass the walk then can't deliver. */
function firstInspectionStep(
  lot: AuctionLot,
  context: SimContext,
): { symptomIndex: number; testId: string; minutes: number } | null {
  for (let symptomIndex = 0; symptomIndex < lot.car.symptoms.length; symptomIndex++) {
    const carSymptom = lot.car.symptoms[symptomIndex]!
    if (carSymptom.remainingCauseIds.length <= 1) continue
    const symptom = context.symptomsById[carSymptom.symptomId]
    if (!symptom) continue
    const testId = bestNextTestId(carSymptom, symptom, context)
    if (testId === null) continue
    const test = context.diagnosticTestsById[testId]
    if (!test) continue
    return { symptomIndex, testId, minutes: test.minutes }
  }
  return null
}

export type SendInspectorGateReason =
  | 'not-found'
  | 'no-inspector'
  | 'no-visit'
  | 'wrong-tier'
  | 'no-symptoms'
  | 'already-resolved'
  | 'not-enough-minutes'

/**
 * The pure "why can't I send the inspector at this lot right now" predicate
 * - the per-lot send control's own proactive gate (mirrors
 * `inspectionVisitGateReason`/`ownedWorkupGateReason`'s reuse shape). `null`
 * when nothing blocks it. Checked in the order the design names them: (a)
 * a benched `master-inspector` (`no-inspector`), (b) an active visit
 * covering this lot's own tier (`no-visit`/`wrong-tier`), (c) at least one
 * unresolved symptom (`no-symptoms`/`already-resolved`), (d) enough minutes
 * left for the very next test the walk would run (`not-enough-minutes`,
 * read off `firstInspectionStep`).
 */
export function sendInspectorGateReason(
  state: GameState,
  lotId: string,
  context: SimContext,
): SendInspectorGateReason | null {
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot) return 'not-found'
  if (!benchedMemberWithTrait(state.staff, 'master-inspector')) return 'no-inspector'
  const visit = state.inspectionVisit
  if (!visit) return 'no-visit'
  if (visit.tier !== lot.tier) return 'wrong-tier'
  if (lot.car.symptoms.length === 0) return 'no-symptoms'
  if (lot.car.symptoms.every((s) => s.remainingCauseIds.length <= 1)) return 'already-resolved'
  const step = firstInspectionStep(lot, context)
  if (!step || visit.minutesLeft < step.minutes) return 'not-enough-minutes'
  return null
}

export type ResolveSendInspectorOutcome = 'done' | SendInspectorGateReason

export interface ResolveSendInspectorResult {
  state: GameState
  log: DayLogEntry[]
  outcome: ResolveSendInspectorOutcome
}

/**
 * Send the benched master inspector to walk `lotId`'s own open symptoms:
 * one send per explicit player action, no automation beyond it. Walks
 * symptoms in array order; within each, repeatedly asks `bestNextTestId`
 * for the reading policy's own next move and runs it through the REAL
 * `runDiagnosticTest` (real minute charging, real trail entries, real
 * result lines - the inspector plays the same game a perfect manual player
 * would, they just do not need the player's own clicks) until that
 * symptom resolves, then moves to the next. Stops the instant the next
 * test does not fit the visit's remaining minutes, leaving whatever ran so
 * far in the trail and nothing more - no cherry-picking a cheaper test
 * elsewhere on the sheet once the clock runs out. Deterministic: the same
 * lot and the same remaining minutes always produce the same route,
 * since `bestNextTestId` never rolls anything.
 */
export function resolveSendInspector(
  state: GameState,
  lotId: string,
  context: SimContext,
): ResolveSendInspectorResult {
  const gateReason = sendInspectorGateReason(state, lotId, context)
  if (gateReason) return { state, log: [], outcome: gateReason }

  let current = state
  for (;;) {
    const lot = current.activeAuctionLots.find((l) => l.id === lotId)
    if (!lot) break // defensive; the gate above already confirmed the lot exists
    const step = firstInspectionStep(lot, context)
    if (!step) break // every symptom resolved (or, on a content bug, stuck)
    if ((current.inspectionVisit?.minutesLeft ?? 0) < step.minutes) break // budget exhausted
    const result = runDiagnosticTest(current, lotId, step.symptomIndex, step.testId, context)
    if (result.outcome !== 'ran') break // defensive; the gate/step above already cleared this
    current = result.state
  }

  return { state: current, log: [], outcome: 'done' }
}

export type OwnedWorkupGateReason =
  'no-labor-slot' | 'not-found' | 'no-symptoms' | 'already-resolved'

export type ResolveOwnedWorkupOutcome = 'done' | OwnedWorkupGateReason

export interface ResolveOwnedWorkupResult {
  state: GameState
  log: DayLogEntry[]
  outcome: ResolveOwnedWorkupOutcome
}

/**
 * The pure "why can't I run a full workup on this car right now" predicate
 * - the "Full workup" button's own proactive disabled reason (mirrors
 * `inspectionVisitGateReason`/`removeBlockReason`'s reuse shape). `null`
 * when nothing blocks it. `already-resolved`: every symptom is already
 * down to its single remaining cause - nothing left for a workup to
 * narrow, so the UI hides the button rather than offering a click that
 * would spend labour to learn nothing new.
 */
export function ownedWorkupGateReason(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
): OwnedWorkupGateReason | null {
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) return 'not-found'
  if (car.symptoms.length === 0) return 'no-symptoms'
  if (car.symptoms.every((s) => s.remainingCauseIds.length <= 1)) return 'already-resolved'
  const freeEnergy = energyMax(state, context.economy) - state.energySpentToday
  if (freeEnergy < context.economy.energy.actionPoints.workup) return 'no-labor-slot'
  return null
}

/**
 * The owned-car workup - costs `energy.actionPoints.workup`, no fee, no
 * clock, collapses every one of `carInstanceId`'s symptoms straight to
 * their true cause (`remainingCauseIds = [trueCauseId]`). Owned cars only
 * (never a lot, never a customer's service-job car); this is also the only
 * way to resolve `wont-idle`'s deliberate bench-only ambiguity, alongside
 * uninstall-reveals-truth.
 */
export function resolveOwnedWorkup(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
): ResolveOwnedWorkupResult {
  const gateReason = ownedWorkupGateReason(state, carInstanceId, context)
  if (gateReason) return { state, log: [], outcome: gateReason }
  const carIndex = state.ownedCars.findIndex((c) => c.id === carInstanceId)
  const car = state.ownedCars[carIndex]!

  const updatedCar: CarInstance = {
    ...car,
    symptoms: car.symptoms.map((s) => ({ ...s, remainingCauseIds: [s.trueCauseId] })),
  }
  const ownedCars = [...state.ownedCars]
  ownedCars[carIndex] = updatedCar
  const nextState: GameState = {
    ...state,
    ownedCars,
    energySpentToday: state.energySpentToday + context.economy.energy.actionPoints.workup,
  }
  return {
    state: nextState,
    log: [{ type: 'car-workup', carInstanceId }],
    outcome: 'done',
  }
}

/**
 * The organic teacher: the one-line reveal a sale gains when the sold car
 * still carries an unresolved symptom (`remainingCauseIds.length > 1`) -
 * `undefined` for an honest car, or one already fully resolved by a
 * test/workup/reveal-on-removal (nothing left to teach). Picks the first
 * such symptom (array order, deterministic) if the car happens to carry
 * more than one. Compares the car's own TRUE value (`marketValueYen` on
 * the real, already-damaged car - exactly what the sale itself paid, per
 * the sale-side blindness law) against the player's own pre-sale estimate
 * (`playerEstimateYen`): the true cause turning out CHEAPER (true value
 * above the estimate) fires `buyerWon`; DEARER (true value at or below the
 * estimate) fires `playerWon`. Substitutes the true cause's own display
 * label for each template's `<cause>` token.
 */
export function saleRevealLineFor(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
): string | undefined {
  const carSymptom = car.symptoms.find((s) => s.remainingCauseIds.length > 1)
  if (!carSymptom) return undefined
  const symptom = context.symptomsById[carSymptom.symptomId]
  if (!symptom) return undefined
  const trueCause = symptom.causes.find((cause) => cause.id === carSymptom.trueCauseId)
  if (!trueCause) return undefined

  const heatPercent = state.marketHeat[model.id] ?? 100
  const trueValueYen = marketValueYen(
    model,
    car,
    heatPercent,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  const estimateYen = playerEstimateYen(car, model, state, context)
  const template =
    trueValueYen > estimateYen
      ? context.economy.diagnosis.saleRevealCopy.buyerWon
      : context.economy.diagnosis.saleRevealCopy.playerWon
  return template.replace('<cause>', titleCaseFromSlug(trueCause.id))
}
