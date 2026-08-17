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
import { DIAGNOSTIC_TESTS, fitmentClassForTier, titleCaseFromSlug } from '@midnight-garage/content'
import { bandIndex, planPartRepair } from './bands'
import { energyMax } from './laborSlots'
import type { SimContext } from './context'
import { benchHasTrait, benchedMemberWithTrait } from './crewSkills'
import { bookCashMovements } from './financeLedger'
import { findWorkableCar, writeCarBack } from './jobs'
import { verifySlot } from './knowledge'
import { marketValueYen } from './marketValue'
import { taskLaborChain } from './taskLaborChain'

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

/**
 * Whether a symptom is down to one answer: a single remaining candidate cause
 * (or, defensively, none - a symptom pruned that far is cured and leaves the
 * car entirely, `pruneCuredCauses`). The KNOWLEDGE question, and the one every
 * "nothing left to narrow" read in the sim asks: a resolved symptom prices at
 * its exact true value with no averaging, needs no further test, and hides no
 * band behind a "?".
 *
 * Not the same question as `symptomTested` below. A symptom can be tested and
 * still open (a narrowing test that left two causes standing), and the two
 * reads are wanted in different places for that reason.
 */
export function symptomResolved(carSymptom: CarSymptom): boolean {
  return carSymptom.remainingCauseIds.length <= 1
}

/**
 * The verdict's own cause id, once elimination leaves exactly one candidate
 * - `null` at two or more (still open) and, defensively, at zero (cured;
 * `pruneCuredCauses` already removes a symptom that gets here from
 * `car.symptoms` entirely, so this is never reached for a live symptom in
 * practice). Stricter than `symptomResolved` above, which also reads the
 * defensive zero case as resolved - the verdict layer (sprint210.md task
 * B1) needs an actual cause to name, not just "nothing left to narrow".
 */
export function symptomVerdictCauseId(carSymptom: CarSymptom): string | null {
  return carSymptom.remainingCauseIds.length === 1 ? carSymptom.remainingCauseIds[0]! : null
}

/**
 * Whether any diagnostic test has been run against a symptom - the BEHAVIOUR
 * question, and the only narrowing a lot's symptom can ever have had (the
 * workup and reveal-on-removal are owned-car routes).
 *
 * The auction room reads this to decide whether the floor saw the player under
 * the car, which is a fact about what they did rather than about what they
 * learned: the room reacts to the behaviour, never to the player's own number,
 * so nothing about the car leaks through it.
 */
export function symptomTested(carSymptom: CarSymptom): boolean {
  return carSymptom.runTestIds.length > 0
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
 *
 * A LATENT symptom (`carSymptom.latent`, knowledge-and-diagnosis.md section
 * 2) is skipped outright, before `causesFor` ever runs: it applies no
 * discount to anyone's estimate, room or player alike. Its true damage is
 * already baked into the part's own band at generation, and that band is
 * masked back to the estimated guess by `knowledgeViewOf`/`apparentViewOf`
 * exactly like any other unverified slot - a SECOND, cause-weighted discount
 * on top would double-count it and leak its existence through the number
 * even while the checklist stays silent about it.
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
    if (carSymptom.latent) continue
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
 * The value-difference estimator behind `expectedTrueValueYen` and
 * `playerEstimateYen`: the apparent view's market value minus the expected
 * symptom discount over `causesFor`'s cause set (`symptomDiscountYen`
 * above). The cause set is the lever between the two - the honest average
 * reads every authored cause, the player only the causes their own
 * knowledge still leaves standing. `sheetGuideValueYen` (the room's own
 * number) no longer runs through this estimator at all - it fear-biases
 * toward the near-worst chain-priced candidate instead
 * (`roomSymptomCostYen`), a genuinely different quantity (repair cost, not
 * value delta) computed by a genuinely different formula, per knowledge-and-
 * diagnosis.md section 4. An honest car (no symptoms) prices at exactly
 * `marketValueYen(car)`.
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
 * unfiltered cause set, priced by plain VALUE difference (the weighted mean
 * `symptomDiscountYen` already computes). This is the honest average, used
 * by the balance probes and the CSV export to measure how far the room's own
 * number (`sheetGuideValueYen` below) sits from it - since knowledge-and-
 * diagnosis.md section 4, the room prices near its WORST candidate rather
 * than this average, so the two are no longer identical by construction; the
 * gap between them is the fearful room working as designed.
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
 * The chain-priced cost to fix `cause`'s own damage, reasoned on `apparent`'s
 * own hypothetical view (the part forced to `cause.setBand` - the room's own
 * "if this cause turns out true" reasoning, `symptomDiscountYen`'s
 * `damagedView` construction). Repaired at the bench if the cause doesn't
 * scrap the part and the slot is repairable at all (`planPartRepair` to
 * `mint`, the standard "make it right" target every other repair-cost
 * convention in this codebase already prices to); replaced fresh otherwise
 * (the fitment class's own stock catalogue price). Either way, labour prices
 * through `taskLaborChain` at the real shop `state` describes and
 * `economy.serviceJobs.laborRateYen` - the SAME cost pipeline
 * `serviceJobCostBreakdown` (serviceJobs.ts) prices a customer's own quote
 * through, so a candidate's fix cost here and what fixing it would actually
 * cost on the shop floor can never drift apart. Zero when the taxonomy or
 * the installed part can't be resolved (defensive; never happens for real
 * content).
 */
function candidateFixCostYen(
  apparent: CarInstance,
  model: CarModel,
  cause: Cause,
  state: GameState,
  context: SimContext,
): number {
  const entry = context.partsTaxonomyById[cause.carPartId]
  const installed = apparent.parts[cause.carPartId].installed
  if (!entry || !installed) return 0
  const damagedView: CarInstance = {
    ...apparent,
    parts: {
      ...apparent.parts,
      [cause.carPartId]: { installed: { ...installed, band: cause.setBand } },
    },
  }
  const { repairStepFraction } = context.economy.restoration
  const { energyPerBandStepByToolTier } = context.economy.energy
  const { laborRateYen } = context.economy.serviceJobs

  if (cause.setBand !== 'scrap' && entry.repairable) {
    const catalogPart = context.partsById[installed.partId]
    if (!catalogPart) return 0
    const plan = planPartRepair(
      cause.setBand,
      'mint',
      1,
      entry,
      catalogPart.priceYen,
      repairStepFraction,
      energyPerBandStepByToolTier,
    )
    const laborSlots = taskLaborChain(
      damagedView,
      cause.carPartId,
      'mint',
      context,
      state,
    ).totalSlots
    return plan.costYen + laborSlots * laborRateYen
  }

  const fitmentClass = fitmentClassForTier(model.tier)
  const partCostYen = context.stockPartByCarPartId[fitmentClass]?.[cause.carPartId]?.priceYen ?? 0
  const laborSlots = taskLaborChain(
    damagedView,
    cause.carPartId,
    'install',
    context,
    state,
  ).totalSlots
  return partCostYen + laborSlots * laborRateYen
}

/**
 * One symptom's fear-priced cost to the room (knowledge-and-diagnosis.md
 * section 4): `fearBias x maxCandidateFixCost + (1 - fearBias) x
 * weightedMeanFixCost`, over every authored cause (never narrowed by the
 * player's own tests - the room reacts to whether a visit tested it, never
 * to what it learned, `symptomTested`). `fearBias` close to the ceiling
 * (economy.diagnosis.fearBias) means the sheet is nearly always bracing for
 * the single worst candidate rather than the honest average, which is what
 * makes a diagnosed-cheap fault profitable to outbid and a diagnosed-grenade
 * a walk. Zero when the causes carry no weight at all (defensive; never
 * happens for real content, which requires at least 2 weighted causes per
 * symptom).
 */
function roomSymptomCostYen(
  apparent: CarInstance,
  model: CarModel,
  causes: readonly Cause[],
  state: GameState,
  context: SimContext,
): number {
  const totalWeight = causes.reduce((sum, cause) => sum + cause.weight, 0)
  if (totalWeight <= 0) return 0
  let maxCost = 0
  let weightedMean = 0
  for (const cause of causes) {
    const cost = candidateFixCostYen(apparent, model, cause, state, context)
    if (cost > maxCost) maxCost = cost
    weightedMean += (cause.weight / totalWeight) * cost
  }
  const { fearBias } = context.economy.diagnosis
  return fearBias * maxCost + (1 - fearBias) * weightedMean
}

/**
 * The room's number - what the auction sheet prints and every room price
 * derives from (`bidding.ts`'s `carGuideValueYen`): the apparent view's
 * market value, less each open symptom's own `roomSymptomCostYen` (the
 * near-worst-case chain-priced fear cost, never the plain value-weighted
 * mean `expectedTrueValueYen` uses) - a SEPARATE consumer of candidate costs
 * from the player's own `playerEstimateYen`/`estimateValueYen` below, per
 * knowledge-and-diagnosis.md section 4: "the room prices an unresolved
 * symptom near its WORST candidate, not the weighted average." Never
 * narrowed by `remainingCauseIds` (every authored cause, always - the room
 * reacts to whether the player tested, never to what they learned). Skips a
 * LATENT symptom outright (`symptomDiscountYen`'s own doc comment explains
 * why). An honest car (no symptoms) prices at exactly `marketValueYen(car)`.
 *
 * FEAR PRICES WHAT NOBODY HAS LOOKED AT; A FULLY-DISCLOSED LOT HAS NOTHING
 * TO FEAR. `feared` (default `true`) is the one escape hatch: `false` skips
 * `roomSymptomCostYen` entirely and falls back to the pre-fear estimator
 * (`estimateValueYen` over every cause, unfiltered - exactly what this
 * function computed before the fearful room existed). The fear formula
 * exists to price UNCERTAINTY about which candidate is true; a car nobody
 * has any real doubt about - the scripted tutorial lot, sprint215.md's own
 * `fullyVerifiedCar` exemption, a teaching artefact with its condition
 * disclosed rather than hidden - has none to price, so the room reads it
 * the honest way instead. The one caller that ever passes `false` is
 * `bidding.ts`'s `anchorValueYen`, keyed on `AuctionLot.scripted`, the exact
 * flag sprint215.md's own settlement code already uses to decide full
 * verification; every other caller (an honest lot, an owned car, a probe
 * fixture) takes the default and prices exactly as before this paragraph
 * existed.
 */
export function sheetGuideValueYen(
  car: CarInstance,
  model: CarModel,
  state: GameState,
  context: SimContext,
  feared: boolean = true,
): number {
  if (!feared) return estimateValueYen(car, model, state, context)
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
  let discount = 0
  for (const carSymptom of car.symptoms) {
    if (carSymptom.latent) continue
    const symptom = context.symptomsById[carSymptom.symptomId]
    if (!symptom) continue
    discount += roomSymptomCostYen(apparent, model, symptom.causes, state, context)
  }
  return apparentValue - discount
}

/**
 * The player's number: `estimateValueYen` over each symptom's REMAINING
 * causes (`remainingCauseIds`, narrowed by tests, workups, and
 * reveal-on-removal), reweighted - the original weights renormalised over
 * just the remaining set by `symptomDiscountYen`'s `totalWeight` division,
 * priced by plain value difference. This is the SECOND, independent
 * consumer of candidate costs the design calls for (knowledge-and-
 * diagnosis.md section 4): "the player's own estimate uses their actual
 * knowledge: weighted mean over the candidates they still have open, actual
 * cost once collapsed" - never the room's own near-worst-case
 * `roomSymptomCostYen`. No longer equal to the room's number even while
 * nothing has narrowed, since `sheetGuideValueYen` now fear-biases toward
 * the worst chain-priced candidate; a fully-resolved symptom (exactly one
 * remaining cause) still contributes its exact true value with no averaging
 * at all, which is the one point the two numbers can coincide.
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
 *
 * A LATENT symptom targeting `partId` (knowledge-and-diagnosis.md section 2)
 * counts as still uncertain here for as long as `partId` is unverified,
 * regardless of `symptomResolved` - a latent carries exactly one candidate
 * from birth, so the ordinary "narrowed to one, therefore known" read would
 * show its true band the moment it is drawn. Reads `car.verifiedSlots`
 * directly rather than `knowledge.ts`'s `isSlotVerified` (whose absent-array
 * default reads VERIFIED, the right default for every pre-215 caller that
 * still expects full transparency) - a latent needs the opposite default,
 * unverified until proven otherwise, which is exactly "no verifiedSlots yet"
 * on a lot still sitting at auction. Once `partId` verifies, this clause
 * drops out and the ordinary `symptomResolved` read below takes over,
 * showing the true band the caller's own (already knowledge-masked, for an
 * owned car) `car` carries.
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
    if (carSymptom.latent) return !(car.verifiedSlots?.includes(partId) ?? false)
    if (symptomResolved(carSymptom)) return false
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
 *
 * The `symptomResolved` early-exit below is skipped for a LATENT symptom
 * (knowledge-and-diagnosis.md section 2): a latent is ALWAYS "resolved" by
 * that read (it carries exactly one candidate from birth), yet the player
 * has never been told, so - unlike an ordinary already-narrowed symptom,
 * where skipping is correct because there is genuinely nothing left to
 * reveal - a latent still has everything left to reveal the first time its
 * own part comes off.
 */
export function revealOnRemoval(
  car: CarInstance,
  carPartId: CarPartId,
  context: SimContext,
): { car: CarInstance; revealedCauseId: string | null } {
  if (car.symptoms.length === 0) return { car, revealedCauseId: null }
  let revealedCauseId: string | null = null
  const symptoms = car.symptoms.map((carSymptom) => {
    if (!carSymptom.latent && symptomResolved(carSymptom)) return carSymptom
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

/** One verification event's outcome (knowledge-and-diagnosis.md section 1):
 * `car` with `partId` verified and every open symptom's candidates resolved
 * against the now-known truth on that slot; `revealedCauseId` and
 * `eliminated` describe what that resolution did, for the caller's own
 * day-log/UI copy. */
export interface KnowledgeUpdate {
  car: CarInstance
  /** Set when this verification collapsed one of the car's symptoms to
   * exactly one remaining cause - the existing verdict idiom (symptom
   * checklist) already shows this, so callers need it only for the
   * pre-existing "Opened it up: <cause>." day-log convention (`part-removed`
   * on the removal route); no new copy is owed for the collapse case. */
  revealedCauseId: string | null
  /** True when this verification eliminated at least one open symptom's
   * candidate on `partId` WITHOUT collapsing that symptom to one cause - the
   * generic "The {part} is clean. It wasn't that." line
   * (`symptom-cause-eliminated` day-log entry) is owed exactly when this is
   * true. */
  eliminated: boolean
}

/**
 * Marks `partId` verified (`knowledge.ts`'s `verifySlot`) and resolves
 * whatever that reveals - the one function every verification route (C1
 * removal, C2 repair, C3 diagnostic confirmation) calls, so "the spanner
 * always tells" has one implementation rather than three. Reuses
 * `revealOnRemoval` above for the actual cause-resolution (the existing
 * silent prune, surfaced rather than rewritten - sprint215.md task D): a
 * symptom whose `trueCauseId` targets `partId` collapses to it; every other
 * remaining candidate targeting `partId` is eliminated, since a part now
 * known to sit at a given band could never have hidden a cause that claims a
 * different one. The name is generic on purpose - nothing about the
 * resolution logic is specific to removal, only its historical starting
 * point was.
 */
export function verifyAndResolve(
  car: CarInstance,
  partId: CarPartId,
  context: SimContext,
): KnowledgeUpdate {
  const verified = verifySlot(car, partId)
  const { car: resolvedCar, revealedCauseId } = revealOnRemoval(verified, partId, context)
  let eliminated = false
  resolvedCar.symptoms.forEach((carSymptom, index) => {
    const before = verified.symptoms[index]
    if (
      before &&
      carSymptom.remainingCauseIds.length < before.remainingCauseIds.length &&
      carSymptom.remainingCauseIds.length > 1
    ) {
      eliminated = true
    }
  })
  return { car: resolvedCar, revealedCauseId, eliminated }
}

/** `verifyAndResolve` folded over several slots at once (a group repair can
 * climb more than one unverified slot in a single click) - each slot's
 * revelation runs against the car the previous one already updated, and the
 * caller gets back every distinct revealed cause and every distinct part
 * that came up clean without a collapse, for one combined day-log line per
 * part rather than one per symptom. */
export function verifyManyAndResolve(
  car: CarInstance,
  partIds: readonly CarPartId[],
  context: SimContext,
): { car: CarInstance; revealedCauseIds: string[]; eliminatedCarPartIds: CarPartId[] } {
  let current = car
  const revealedCauseIds: string[] = []
  const eliminatedCarPartIds: CarPartId[] = []
  for (const partId of partIds) {
    const result = verifyAndResolve(current, partId, context)
    current = result.car
    if (result.revealedCauseId) revealedCauseIds.push(result.revealedCauseId)
    if (result.eliminated) eliminatedCarPartIds.push(partId)
  }
  return { car: current, revealedCauseIds, eliminatedCarPartIds }
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
  // Getting to the yard is a cost of doing business, not of any lot looked at
  // there - most visits end without buying anything.
  const log: DayLogEntry[] = [{ type: 'inspection-visit', tier, feeYen, minutesGranted }]
  return {
    state: bookCashMovements(nextState, log, context.economy),
    log,
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
    latent: false,
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
  if (symptomResolved(carSymptom)) return { minutes: 0, nextTestId: null }
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
    if (symptomResolved(carSymptom)) continue
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
  if (lot.car.symptoms.every(symptomResolved)) return 'already-resolved'
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
 * would spend labour to learn nothing new. Reads `findWorkableCar`
 * (jobs.ts) - an owned car or a customer's car sitting in an active
 * service job, the same population the car-detail screen itself reads
 * (`gameStore.ts`'s own `findWorkableCar`), so a scripted job's authored
 * symptom is workable the moment the car is in the shop, not only once
 * it's been bought.
 */
export function ownedWorkupGateReason(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
): OwnedWorkupGateReason | null {
  const car = findWorkableCar(state, carInstanceId)
  if (!car) return 'not-found'
  if (car.symptoms.length === 0) return 'no-symptoms'
  if (car.symptoms.every(symptomResolved)) return 'already-resolved'
  const freeEnergy = energyMax(state, context.economy) - state.energySpentToday
  if (freeEnergy < context.economy.energy.actionPoints.workup) return 'no-labor-slot'
  return null
}

/**
 * The workable-car workup - costs `energy.actionPoints.workup`, no fee, no
 * clock, collapses every one of `carInstanceId`'s symptoms straight to
 * their true cause (`remainingCauseIds = [trueCauseId]`). Works on an owned
 * car OR a customer's car sitting in an active service job
 * (`findWorkableCar`/`writeCarBack`, jobs.ts) - never a lot, which narrows
 * only through a yard visit's own tests; this is also the only way to
 * resolve `wont-idle`'s deliberate bench-only ambiguity on a workable car,
 * alongside uninstall-reveals-truth.
 */
export function resolveOwnedWorkup(
  state: GameState,
  carInstanceId: string,
  context: SimContext,
): ResolveOwnedWorkupResult {
  const gateReason = ownedWorkupGateReason(state, carInstanceId, context)
  if (gateReason) return { state, log: [], outcome: gateReason }
  const car = findWorkableCar(state, carInstanceId)!

  const collapsedCar: CarInstance = {
    ...car,
    symptoms: car.symptoms.map((s) => ({ ...s, remainingCauseIds: [s.trueCauseId] })),
  }
  // A diagnostic confirmation names its part (knowledge-and-diagnosis.md
  // section 1, route 3): the workup collapses every symptom straight to its
  // true cause, so every one of those causes' own slots is now verified too
  // - `verifyManyAndResolve` also resolves any OTHER open symptom that
  // happens to share one of those slots.
  const trueCausePartIds = car.symptoms.flatMap((s) => {
    const symptom = context.symptomsById[s.symptomId]
    const cause = symptom?.causes.find((c) => c.id === s.trueCauseId)
    return cause ? [cause.carPartId] : []
  })
  const { car: updatedCar } = verifyManyAndResolve(collapsedCar, trueCausePartIds, context)
  const nextState: GameState = {
    ...writeCarBack(state, carInstanceId, updatedCar),
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
 * still carries an unresolved symptom (`symptomResolved` above) -
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
  const carSymptom = car.symptoms.find((s) => !symptomResolved(s))
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
