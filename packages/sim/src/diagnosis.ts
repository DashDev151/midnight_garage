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
import { titleCaseFromSlug } from '@midnight-garage/content'
import { energyMax } from './laborSlots'
import type { SimContext } from './context'
import { benchHasTrait } from './crewSkills'
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
      if (!installed) return sum
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
 * Sprint 74 decision 5: the ONE rule governing every band the player sees.
 * True when (a) the car is honest, (b) this part has no recorded apparent
 * band at all (a symptom never damaged it), or (c) every symptom that DOES
 * target this part has narrowed enough to resolve it - either no remaining
 * candidate cause still targets this part, or the symptom has narrowed to
 * exactly one remaining cause overall (so whichever it is, its effect on
 * this part - damaging it or not - is already known). Otherwise the
 * APPARENT band, flagged `uncertain` for the UI's "?" chip. `null` band
 * means genuinely missing (mirrors every other missing-slot convention in
 * this codebase - never a real `ConditionBand` value).
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
 * cost-preview range (decision 5) reads this to find its worst-case band. */
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
 * Sprint 74 decision 5's repair-cost-preview range: the worst (lowest) band
 * any still-live remaining cause would set `partId` to, or `null` when
 * nothing remaining targets it (an uncertain-repair-cost preview has
 * nothing worse to show than the apparent band itself).
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
 * Sprint 74 decision 4: uninstall reveals truth. Called from `resolveRemovePart`
 * (jobs.ts) after a successful removal of `carPartId` on an OWNED car - the
 * removed instance's band was always the true band, so pulling it is free
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
 * part). At most one symptom's own `trueCauseId` can target a given part in
 * practice (Sprint 73 content), so `revealedCauseId` reports the first (and
 * only) one found.
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
 * Sprint 74 decision 1: the pure "why can't I start a visit at `tier` right
 * now" predicate - what the UI queries proactively for the per-tier button's
 * disabled reason (mirrors `removeBlockReason`'s own reuse shape, jobs.ts).
 * `null` when nothing blocks it. Shared with `beginInspectionVisit` below so
 * there is one gate, not two.
 */
export function inspectionVisitGateReason(
  state: GameState,
  tier: AuctionTier,
  context: SimContext,
): InspectionVisitGateReason | null {
  const feeYen = context.economy.diagnosis.travelFeeYenByTier[tier]
  // Sprint 94: a yard visit costs one labour's worth of energy (`pointsPerLabour`).
  const freeEnergy = energyMax(state, context.economy) - state.energySpentToday
  if (freeEnergy < context.economy.energy.pointsPerLabour) return 'no-labor-slot'
  if (state.cashYen < feeYen) return 'no-cash'
  const hasLiveLot = state.activeAuctionLots.some((lot) => lot.tier === tier)
  if (!hasLiveLot) return 'no-lots'
  return null
}

/**
 * Sprint 74 decision 1: start (or replace) the yard inspection visit at
 * `tier` - requires a free labour slot, enough cash for
 * `economy.diagnosis.travelFeeYenByTier[tier]`, and at least one live lot at
 * that tier (`inspectionVisitGateReason` above). Spends the slot and the fee,
 * sets `minutesLeft` to the full `economy.diagnosis.visitMinutes`.
 * Deliberately does NOT refuse when a different visit is already active with
 * minutes left - it simply replaces it, forfeiting the remainder; the
 * two-step confirm before that happens at all is a UI-layer courtesy
 * (decision 7), not a rule this resolver enforces itself.
 *
 * Sprint 82 decision 4: a benched `auction-rat` knows the Local Yard, so a
 * local-yard visit grants `economy.staff.auctionRatExtraMinutes` on top of the
 * base minutes. One tier, no stacking - one rat's worth regardless of count.
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
    energySpentToday: state.energySpentToday + context.economy.energy.pointsPerLabour,
    inspectionVisit: { tier, minutesLeft: minutesGranted },
  }
  return {
    state: nextState,
    log: [{ type: 'inspection-visit', tier, feeYen, minutesGranted }],
    outcome: 'started',
  }
}

export type RunDiagnosticTestOutcome =
  | 'ran'
  | 'no-visit'
  | 'wrong-tier'
  | 'not-found'
  | 'test-not-applicable'
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
 * Sprint 74 decision 2: run `testId` against `lotId`'s `symptomIndex`-th
 * symptom. Legal only with an active visit at the lot's own tier, enough
 * `minutesLeft`, a test that actually applies to this symptom, and one that
 * hasn't already run on this exact symptom instance (`runTestIds`).
 * Deterministic, no RNG: finds which of the test's two partition groups
 * contains the (already-rolled, generation-time) `trueCauseId`, and narrows
 * `remainingCauseIds` to its intersection with that group. Knowledge lives
 * on the car itself, not the visit, so it survives a purchase and dies with
 * a lost lot for free - nothing extra to wire.
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

export type OwnedWorkupGateReason = 'no-labor-slot' | 'not-found' | 'no-symptoms'

export type ResolveOwnedWorkupOutcome = 'done' | OwnedWorkupGateReason

export interface ResolveOwnedWorkupResult {
  state: GameState
  log: DayLogEntry[]
  outcome: ResolveOwnedWorkupOutcome
}

/**
 * Sprint 74 decision 3: the pure "why can't I run a full workup on this car
 * right now" predicate - the "Full workup" button's own proactive disabled
 * reason (mirrors `inspectionVisitGateReason`/`removeBlockReason`'s reuse
 * shape). `null` when nothing blocks it.
 */
export function ownedWorkupGateReason(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
): OwnedWorkupGateReason | null {
  const car = state.ownedCars.find((c) => c.id === carInstanceId)
  if (!car) return 'not-found'
  if (car.symptoms.length === 0) return 'no-symptoms'
  // Sprint 94: the workup costs one labour's worth of energy (`pointsPerLabour`).
  const freeEnergy = energyMax(state, context.economy) - state.energySpentToday
  if (freeEnergy < context.economy.energy.pointsPerLabour) return 'no-labor-slot'
  return null
}

/**
 * Sprint 74 decision 3: the owned-car workup - 1 labour slot, no fee, no
 * clock, collapses every one of `carInstanceId`'s symptoms straight to
 * their true cause (`remainingCauseIds = [trueCauseId]`). Owned cars only
 * (never a lot, never a customer's service-job car); this is also the only
 * way to resolve `wont-idle`'s deliberate bench-only ambiguity (decision 4
 * of sprint73.md), alongside uninstall-reveals-truth.
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
    energySpentToday: state.energySpentToday + context.economy.energy.pointsPerLabour,
  }
  return {
    state: nextState,
    log: [{ type: 'car-workup', carInstanceId }],
    outcome: 'done',
  }
}

/**
 * Sprint 75 decision 2 (the organic teacher): the one-line reveal a sale
 * gains when the sold car still carries an unresolved symptom
 * (`remainingCauseIds.length > 1`) - `undefined` for an honest car, or one
 * already fully resolved by a test/workup/reveal-on-removal (nothing left to
 * teach). Picks the first such symptom (array order, deterministic) if the
 * car happens to carry more than one. Compares the car's own TRUE value
 * (`marketValueYen` on the real, already-damaged car - exactly what the sale
 * itself paid, per Sprint 73's sale-side blindness) against the player's own
 * pre-sale estimate (`playerEstimateYen`): the true cause turning out
 * CHEAPER (true value above the estimate) fires `buyerWon`; DEARER (true
 * value at or below the estimate) fires `playerWon`. Substitutes the true
 * cause's own display label for each template's `<cause>` token.
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
