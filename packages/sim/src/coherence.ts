import {
  ALL_CAR_PART_IDS,
  ComponentIdSchema,
  ReputationTierSchema,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ConditionBand,
  type EconomyConfig,
  type PartFitmentClass,
  type ReputationTier,
  type StaffMember,
} from '@midnight-garage/content'
import { carOriginLabel, enforceMaxBillFraction, stockInstanceFor } from './auctions'
import {
  bandFactor,
  bandIndex,
  canRepair,
  carCostToMintYen,
  hasForcedInduction,
  planGroupRepair,
  planPartRepair,
} from './bands'
import { PLAYER_BASE_LABOR_SLOTS } from './constants'
import { deriveStaffWageYen, introductionFeeYen, staffSkillSum } from './staff'
import type { SimContext } from './context'
import { expectedTrueValueYen, sheetGuideValueYen } from './diagnosis'
import { installLaborSlotsFor, removeLaborSlotsFor } from './jobs'
import { expectationForCar, marketValueYen, mileageFactor } from './marketValue'
import { createInitialGameState } from './newGame'
import { makeCarOrigin } from './provenance'
import { freshToolTiers } from './toolLines'

/**
 * Sprint 55 (economy-bible.md law 4 - one derived ledger, machine-checked):
 * the closed-form coherence math, per roster model. Every number below is
 * produced by CALLING the real sim functions (`enforceMaxBillFraction`,
 * `carCostToMintYen`, `marketValueYen`) against a deliberately worse-than-
 * generation-could-ever-roll car, never a re-derivation of their formulas -
 * so this can never silently drift from what the game itself actually does.
 * No careers/RNG needed: every input is either roster content or the
 * worst-case construction below, so this is cheap enough to run on every
 * `pnpm balance:run` alongside the Monte Carlo career export.
 */

const CONSUMABLE_PART_IDS: readonly CarPartId[] = ['tyres', 'brakePadsDiscs', 'clutch']

export interface ModelCoherenceRow {
  modelId: string
  fitmentClass: PartFitmentClass
  /** Clean (mint, all-stock) value at the roster's worst reachable mileage. */
  cleanValueYen: number
  /** The bill AFTER the Law 2 generation guard has softened the worst
   * plausible pre-guard roll - what the guard actually allows to reach a
   * real lot. */
  worstBillYen: number
  /** `worstBillYen / cleanValueYen` - Law 2's own ratio, checked against
   * `partsGeneration.maxBillFraction`. */
  billToCleanRatio: number
  /** Buy at reserve (off the worst-bill lot's own damaged guide value), pay
   * the worst bill to fully restore TO MINT, sell at guide (= clean value,
   * Law 1's ceiling) - the flip margin a maintainer or player could realize on
   * the single worst lot the game could ever generate for this model.
   *
   * This is Law 2's literal claim and stays gated as such: full restoration
   * must be mathematically capable of profit on every generatable lot. Since
   * Sprint 66 it is NOT the headline number, because on a low tier it prices a
   * play no sane player makes - a mint kei. Read `sensibleFlipMarginYen` for
   * the play the economy actually asks for. */
  flipMarginYen: number
  flipMarginFraction: number
  /**
   * The SENSIBLE play, and the number to read first (Sprint 66): buy a rough
   * but fixable car (`buildWageProbeCar` - every real slot at `poor`) at
   * reserve off its own damaged guide value, repair it up to its tier's
   * expectation band (not a yen past), sell at the resulting guide value.
   *
   * Every figure comes from the real sim functions, so this is what a player
   * following the economy's own advice actually clears. It exists because
   * Law 1's Sprint 66 amendment made "fully restore" the wrong default: the
   * market barely discounts a worn kei (`beyondDiscount` 0.4), so you pay near
   * clean value for one and a mint restore burns the margin - `flipMarginYen`
   * collapses on the shitbox tier for exactly that reason, correctly. The
   * money on a cheap car is in buying BELOW the expectation band and bringing
   * it up to the band, which is discounted at the full `marketRepairDiscount`.
   */
  sensibleFlipMarginYen: number
  sensibleFlipMarginFraction: number
  /** Cost to replace every true consumable (tyres + brake pads/discs +
   * clutch) from scratch at this model's own class, as a fraction of book
   * value - the direct, permanent "brake pads vs car price" guard (Law 3). */
  consumablesCostYen: number
  consumablesShare: number
  /**
   * Law 6 (the wage law, Sprint 66) - does a day at the bench out-earn a day
   * of standing still? Measured closed-form on the repairable portion of the
   * worst generatable car, at a fresh shop's tier-1 tools, planned to the
   * car's own EXPECTATION BAND (Law 1 as amended), never to mint:
   *
   * - `repairCostYen` / `repairLaborSlots` come from the SAME real
   *   `planGroupRepair(... expectationBand)` calls, summed over the six
   *   groups, so the money and the time are always the same plan's own
   *   figures. Scrap and missing slots are excluded from BOTH sides on
   *   purpose - those are replacements (buying a part at the market), a
   *   different economic act from bench labour.
   * - `repairGainYen` = `(marketRepairDiscount - 1) x repairCostYen`. That is
   *   the whole return on repair work: a repair's cash cost and its bill
   *   reduction are identical by construction, so the discount rate above 1
   *   IS the margin. Work below the expectation band is all priced at
   *   `marketRepairDiscount`, which is why this row can use it flat.
   * - `rentDuringRepairYen` = the rent accrued over the days that labour takes
   *   at `PLAYER_BASE_LABOR_SLOTS`/day.
   *
   * `wageMarginYen` is the difference. Law 6 requires it positive for every
   * roster model: repairing a car to the standard its market expects, then
   * selling it, must beat selling it as-is by more than the rent the work
   * costs.
   */
  repairCostYen: number
  repairLaborSlots: number
  repairGainYen: number
  rentDuringRepairYen: number
  wageMarginYen: number
  /**
   * `repairGainYen / rentDuringRepairYen` - how many times over the bench work
   * pays for the time it takes. The gate is `wageMarginYen > 0`; this ratio is
   * reported alongside it because a positive margin is not the same as one
   * worth getting out of bed for, and the maintainer tunes against the ratio.
   */
  wageRatio: number
}

/**
 * The largest mileage the real generation pipeline (`auctions.ts`) can ever
 * roll for any model: the last breakpoint of `mileageRangeMaxByAgeYears`,
 * since `interpolateCurve` clamps to it for any age beyond. Reading it off
 * the live curve (rather than a hardcoded constant) keeps this derived, not
 * authored - a future curve edit that raises the ceiling is picked up here
 * for free.
 */
function worstCaseMileageKm(context: SimContext): number {
  const curve = context.economy.partsGeneration.mileageRangeMaxByAgeYears
  return curve[curve.length - 1]![1]
}

/**
 * The worst PLAUSIBLE pre-guard roll for `model`: every real slot at `scrap`
 * (the maximum-cost band `costToMintYen` recognizes - at least as bad as
 * anything `generateAuctionCarInstance` could actually produce, since a
 * missing slot prices identically to scrap), at the roster's worst reachable
 * mileage. Stress-tests the real Law 2 guard against a state that is never
 * softer than a genuine generation roll, so a pass here proves the guard
 * holds for this model at its absolute worst, not merely on average.
 */
function buildWorstCaseRawCar(model: CarModel, context: SimContext): CarInstance {
  const mileageKm = worstCaseMileageKm(context)
  const fitmentClass = fitmentClassForTier(model.tier)
  const carHasForcedInduction = hasForcedInduction(model)
  const carId = `coherence-${model.id}`
  const origin = makeCarOrigin(carId, carOriginLabel(model, model.spec.yearFrom), 0)
  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      if (partId === 'forcedInduction' && !carHasForcedInduction) {
        return [partId, { installed: null }]
      }
      const installed = stockInstanceFor(
        partId,
        'scrap',
        `coherence-${model.id}`,
        fitmentClass,
        context.stockPartByCarPartId,
        origin,
      )
      return [partId, { installed }]
    }),
  ) as CarInstance['parts']
  return {
    id: carId,
    modelId: model.id,
    year: model.spec.yearFrom,
    mileageKm,
    color: 'White',
    provenanceNote: 'coherence probe',
    authenticityPercent: 70,
    parts,
    symptoms: [],
    apparentBandByPartId: null,
  }
}

/**
 * Law 6's probe subject: rough but FIXABLE - every real slot at `poor`, at the
 * roster's worst reachable mileage.
 *
 * Deliberately NOT `buildWorstCaseRawCar`. That car is all-`scrap`, and scrap
 * is unrepairable by definition (`costToBandYen`'s own first branch): it is
 * replaced, not worked on. Measuring bench wages on it reports zero repairable
 * work for any model whose softened worst case stays at scrap - which is a
 * true fact about a write-off, and a useless one for the question Law 6 asks.
 * The worst-case car belongs to Law 2 (can generation produce a trap?); Law 6
 * needs the car the fantasy is actually about - the wreck you can make good.
 *
 * `poor` is one band above scrap and below every tier's expectation band, so
 * every model gets real, repairable work at every tier.
 */
function buildWageProbeCar(
  model: CarModel,
  context: SimContext,
  repairedTo?: ConditionBand,
): CarInstance {
  const fitmentClass = fitmentClassForTier(model.tier)
  const carHasForcedInduction = hasForcedInduction(model)
  const carId = `wage-${model.id}`
  const origin = makeCarOrigin(carId, carOriginLabel(model, model.spec.yearFrom), 0)
  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      if (partId === 'forcedInduction' && !carHasForcedInduction) {
        return [partId, { installed: null }]
      }
      // `repairedTo` models the car AFTER the repair plan below has run. Only
      // REPAIRABLE parts lift: a replace-only consumable (tyres, pads, clutch)
      // has no repair path, so the plan never paid to move it and it must stay
      // where it started, or the "after" car would be worth more than the work
      // bought. Same exclusion, both sides of the ledger.
      const band = repairedTo && context.partsTaxonomyById[partId]?.repairable ? repairedTo : 'poor'
      const installed = stockInstanceFor(
        partId,
        band,
        `wage-${model.id}`,
        fitmentClass,
        context.stockPartByCarPartId,
        origin,
      )
      return [partId, { installed }]
    }),
  ) as CarInstance['parts']
  return {
    id: carId,
    modelId: model.id,
    year: model.spec.yearFrom,
    mileageKm: worstCaseMileageKm(context),
    color: 'White',
    provenanceNote: 'wage probe',
    authenticityPercent: 70,
    parts,
    symptoms: [],
    apparentBandByPartId: null,
  }
}

/** The four Law 2/Law 3 closed-form facts for one roster model. */
export function computeModelCoherence(model: CarModel, context: SimContext): ModelCoherenceRow {
  const fitmentClass = fitmentClassForTier(model.tier)
  const rawCar = buildWorstCaseRawCar(model, context)
  const softened = enforceMaxBillFraction(
    rawCar,
    model,
    context,
    makeCarOrigin(rawCar.id, carOriginLabel(model, rawCar.year), 0),
  )

  const cleanValueYen = model.bookValueYen * mileageFactor(softened.mileageKm, context.economy)
  const worstBillYen = carCostToMintYen(
    softened,
    model,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  const billToCleanRatio = cleanValueYen > 0 ? worstBillYen / cleanValueYen : 0

  const guideValueYen = marketValueYen(
    model,
    softened,
    100,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  const buyPriceYen = Math.round(guideValueYen * context.economy.AUCTION_RESERVE_PRICE_FRACTION)
  const flipMarginYen = Math.round(cleanValueYen) - buyPriceYen - worstBillYen
  const flipMarginFraction = cleanValueYen > 0 ? flipMarginYen / cleanValueYen : 0

  const consumablesCostYen = CONSUMABLE_PART_IDS.reduce(
    (sum, partId) =>
      sum + context.partsTaxonomyById[partId]!.stockReplacementPriceYenByClass[fitmentClass],
    0,
  )
  const consumablesShare = model.bookValueYen > 0 ? consumablesCostYen / model.bookValueYen : 0

  // Law 6 (the wage law): the repairable portion of this car, planned to the
  // car's own EXPECTATION BAND through the real repair planner at a fresh
  // shop's tools - money and time from the same plan. Planning to mint (as
  // this did when first written) measures a restoration no sane player would
  // perform on a kei, and then reports that it barely pays; the expectation
  // band is the repair the economy actually asks for.
  const expectationBand = expectationForCar(model, context.economy).band
  const wageCar = buildWageProbeCar(model, context)
  // Sprint 71 (the teardown game) narrowed `planGroupRepair` (bands.ts) to
  // surface-slot candidates only: bolt-on/buried repair moved to the bench,
  // off the on-car plan this sum reads. `buildWageProbeCar`'s "repaired to
  // the expectation band" value-side lift below is gated on `repairable`,
  // not `depthClass`, so it still credits the full car - so the loop below
  // separately prices every non-surface repairable part's own bench-repair
  // cost, closing the gap Sprint 71 disclosed (TODO.md: "teardown labour in
  // Law 1 margins and Law 6 payouts") per Sprint 72 decision 6.
  let repairCostYen = 0
  let repairLaborSlots = 0
  for (const groupId of ComponentIdSchema.options) {
    const plan = planGroupRepair(
      wageCar,
      groupId,
      expectationBand,
      freshToolTiers(),
      context.partIdsByGroup,
      context.partsById,
      context.partsTaxonomyById,
      context.economy.restoration.repairStepFraction,
    )
    repairCostYen += plan.costYen
    repairLaborSlots += plan.laborSlotsRequired
  }
  // Sprint 79 (the equivalence-priced labour model): removal and blocker
  // refits are free, so the once-per-restoration blocker premium this loop
  // used to track (a shared `blockedBy` part pulled and refitted only ONCE,
  // not once per dependent behind it) is gone along with it - a bench
  // repair simply adds its own `installLaborSlotsFor` refit, the same
  // unconditional charge `serviceJobCostBreakdown` now uses, since a
  // restoration always improves the slot it repairs.
  for (const partId of ALL_CAR_PART_IDS) {
    const entry = context.partsTaxonomyById[partId]
    if (!entry || entry.depthClass === 'surface') continue
    const installed = wageCar.parts[partId].installed
    if (!installed || !canRepair(installed.band, entry)) continue
    const catalogPart = context.partsById[installed.partId]
    if (!catalogPart) continue
    // Repair level 1 (worst-case tooling): matches the fresh-shop assumption
    // `freshToolTiers()` already applies to the surface loop above, and
    // `planPartRepair`'s `costYen` is repair-level-independent regardless.
    const plan = planPartRepair(
      installed.band,
      expectationBand,
      1,
      entry,
      catalogPart.priceYen,
      context.economy.restoration.repairStepFraction,
    )
    if (plan.laborSlotsRequired === 0) continue
    repairCostYen += plan.costYen
    repairLaborSlots += plan.laborSlotsRequired + installLaborSlotsFor(partId, context)
  }
  const repairGainYen = (context.economy.valuation.marketRepairDiscount - 1) * repairCostYen
  const repairDays = repairLaborSlots / PLAYER_BASE_LABOR_SLOTS
  const rentDuringRepairYen = repairDays * (context.economy.WEEKLY_RENT_YEN / 7)

  // The sensible play, end to end through the real value function: buy the
  // rough car at reserve, do exactly the repair above, sell at the resulting
  // guide value.
  const wageCarGuideYen = marketValueYen(
    model,
    wageCar,
    100,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  const wageCarBuyYen = Math.round(wageCarGuideYen * context.economy.AUCTION_RESERVE_PRICE_FRACTION)
  const repairedGuideYen = marketValueYen(
    model,
    buildWageProbeCar(model, context, expectationBand),
    100,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  const sensibleFlipMarginYen = Math.round(repairedGuideYen - wageCarBuyYen - repairCostYen)

  return {
    modelId: model.id,
    fitmentClass,
    cleanValueYen: Math.round(cleanValueYen),
    worstBillYen,
    billToCleanRatio,
    flipMarginYen,
    flipMarginFraction,
    sensibleFlipMarginYen,
    sensibleFlipMarginFraction: cleanValueYen > 0 ? sensibleFlipMarginYen / cleanValueYen : 0,
    consumablesCostYen,
    consumablesShare,
    repairCostYen: Math.round(repairCostYen),
    repairLaborSlots,
    repairGainYen: Math.round(repairGainYen),
    rentDuringRepairYen: Math.round(rentDuringRepairYen),
    wageMarginYen: Math.round(repairGainYen - rentDuringRepairYen),
    wageRatio: rentDuringRepairYen > 0 ? repairGainYen / rentDuringRepairYen : Infinity,
  }
}

export function computeRosterCoherence(
  models: readonly CarModel[],
  context: SimContext,
): ModelCoherenceRow[] {
  return models.map((model) => computeModelCoherence(model, context))
}

export interface ModelDonorCoherenceRow {
  modelId: string
  /** A clean, all-mint example of this model (0 km, authenticity 100),
   * valued whole through the real `marketValueYen` - the "just sell it"
   * baseline the parted-out route below is measured against. */
  wholeSaleYen: number
  /** Selling every REMOVABLE part off that same clean car at the used-part
   * haircut - the same formula `resolveSellPart` applies (`part.priceYen x
   * bandFactor('mint') x economy.teardown.usedPartSaleFraction`), called
   * directly rather than through a throwaway `GameState` since it is a plain
   * one-line arithmetic reuse, not a re-derivation - plus scrapping the
   * stripped shell (`model.bookValueYen x economy.bands.scrapValueFraction`).
   * Decision 8's "whole beats parted" gate compares this against
   * `wholeSaleYen` above, on every roster model. */
  partedYieldYen: number
  /** Total uninstall labour the parted route above actually costs - every
   * removable part's own `removeLaborSlotsFor`, summed. Not gated; disclosed
   * alongside the yen figures so a maintainer can read "is this worth the
   * bench time" at a glance. */
  stripLaborSlots: number
  /**
   * Sprint 71 decision 8's second probe: on the SAME worst-case generatable
   * car `computeModelCoherence` builds (`buildWorstCaseRawCar` softened by
   * `enforceMaxBillFraction` - reused here exactly, not rebuilt differently),
   * the yield of parting out only the parts strictly better than `poor` (the
   * ones actually worth pulling rather than replacing outright) plus
   * scrapping the shell. The crossover against that same model's
   * `sensibleFlipMarginYen` (`ModelCoherenceRow`) - the bill-to-clean ratio
   * above which parting out beats the sensible repair - is measured and
   * DISCLOSED per model in `coherence.test.ts`, not force-asserted against
   * `economy.teardown.donorBreakEvenBillRatio` exactly.
   */
  partedYieldOfWorstCaseYen: number
}

/**
 * A clean (0 km, all-mint stock, authenticity 100), honest example of
 * `model` - the "what a healthy example of this tier looks like" probe,
 * shared by `computeDonorCoherence` (the whole-vs-parted question) and
 * `computeSymptomCoherence` (Sprint 73, the blind-buy guardrail - a
 * symptom's damage is applied ON TOP of this same clean baseline, never a
 * worst-case one, since the whole point of a symptom is a surprise on a car
 * that otherwise looks fine).
 */
function buildCleanProbeCar(
  model: CarModel,
  context: SimContext,
  idPrefix: string,
  provenanceNote: string,
): CarInstance {
  const fitmentClass = fitmentClassForTier(model.tier)
  const carHasForcedInduction = hasForcedInduction(model)
  const carId = `${idPrefix}-${model.id}`
  const cleanOrigin = makeCarOrigin(carId, carOriginLabel(model, model.spec.yearFrom), 0)
  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      if (partId === 'forcedInduction' && !carHasForcedInduction) {
        return [partId, { installed: null }]
      }
      const installed = stockInstanceFor(
        partId,
        'mint',
        carId,
        fitmentClass,
        context.stockPartByCarPartId,
        cleanOrigin,
      )
      return [partId, { installed }]
    }),
  ) as CarInstance['parts']
  return {
    id: carId,
    modelId: model.id,
    year: model.spec.yearFrom,
    mileageKm: 0,
    color: 'White',
    provenanceNote,
    authenticityPercent: 100,
    parts,
    symptoms: [],
    apparentBandByPartId: null,
  }
}

/**
 * Sprint 71 decision 8 (the teardown game's donor-economy law): is a clean
 * car ever worth more parted out than sold whole? It must never be - a player
 * should never be better off destroying a good car for scrap parts, which is
 * the whole reason `usedPartSaleFraction`/`scrapValueFraction` are haircuts,
 * not parity prices.
 */
export function computeDonorCoherence(
  model: CarModel,
  context: SimContext,
): ModelDonorCoherenceRow {
  const cleanCar = buildCleanProbeCar(model, context, 'donor', 'donor probe')

  const wholeSaleYen = Math.round(
    marketValueYen(
      model,
      cleanCar,
      100,
      context.partsById,
      context.partsTaxonomyById,
      context.economy,
    ),
  )

  const shellScrapYen = Math.round(model.bookValueYen * context.economy.bands.scrapValueFraction)

  let partedYieldYen = shellScrapYen
  let stripLaborSlots = 0
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = cleanCar.parts[partId].installed
    const taxonomyEntry = context.partsTaxonomyById[partId]
    if (!installed || !taxonomyEntry?.removable) continue
    const part = context.partsById[installed.partId]
    if (!part) continue
    partedYieldYen += Math.round(
      part.priceYen *
        bandFactor('mint', context.economy) *
        context.economy.teardown.usedPartSaleFraction,
    )
    stripLaborSlots += removeLaborSlotsFor(partId, context)
  }

  const rawWorstCar = buildWorstCaseRawCar(model, context)
  const worstOrigin = makeCarOrigin(rawWorstCar.id, carOriginLabel(model, rawWorstCar.year), 0)
  const softenedWorstCar = enforceMaxBillFraction(rawWorstCar, model, context, worstOrigin)

  let partedYieldOfWorstCaseYen = shellScrapYen
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = softenedWorstCar.parts[partId].installed
    const taxonomyEntry = context.partsTaxonomyById[partId]
    if (!installed || !taxonomyEntry?.removable) continue
    if (bandIndex(installed.band) <= bandIndex('poor')) continue // not worth pulling over replacing
    const part = context.partsById[installed.partId]
    if (!part) continue
    partedYieldOfWorstCaseYen += Math.round(
      part.priceYen *
        bandFactor(installed.band, context.economy) *
        context.economy.teardown.usedPartSaleFraction,
    )
  }

  return {
    modelId: model.id,
    wholeSaleYen,
    partedYieldYen,
    stripLaborSlots,
    partedYieldOfWorstCaseYen,
  }
}

export function computeRosterDonorCoherence(
  models: readonly CarModel[],
  context: SimContext,
): ModelDonorCoherenceRow[] {
  return models.map((model) => computeDonorCoherence(model, context))
}

/** One cause's edge (Sprint 73): `marketValueYen` if this cause turns out
 * true, minus what the room's sheet actually charges - positive means this
 * cause is a pleasant surprise (the car is worth more than paid), negative
 * means it costs more than it turned out to be worth. */
export interface SymptomCauseEdgeRow {
  causeId: string
  edgeYen: number
}

export interface SymptomCoherenceRow {
  symptomId: string
  fitmentClass: PartFitmentClass
  apparentValueYen: number
  expectedTrueValueYen: number
  sheetGuideValueYen: number
  /** `expectedTrueValueYen - sheetGuideValueYen` - the average edge of
   * buying this symptomatic lot blind, with no test run at all. */
  blindBuyEvYen: number
  edgePerCauseYen: SymptomCauseEdgeRow[]
}

const SYMPTOM_PROBE_FITMENT_CLASSES: readonly PartFitmentClass[] = [
  'shitbox',
  'common',
  'uncommon',
  'rare',
]

/**
 * Sprint 73 decision 6: the diagnosis system's blind-buy guardrail - for
 * every symptom, on a representative clean car per tier (`buildCleanProbeCar`,
 * shared with `computeDonorCoherence` above - a symptom is a surprise on an
 * otherwise-healthy car, not a worst-case wreck), how good a bet is buying
 * without running a single test?
 *
 * `blindBuyEvYen = expectedTrueValueYen - sheetGuideValueYen` must stay >= 0
 * (the room's fear premium always prices in MORE caution than the honest
 * average risk, so buying blind is never -EV on average) and <= 0.2 x the
 * apparent-to-expected gap (a modest edge, not a windfall). Both bounds
 * follow algebraically from `fearPremium` alone -
 * `blindBuyEvYen = (fearPremium - 1) x (apparentValueYen - expectedTrueValueYen)`
 * - so this is really machine-checking `1 <= fearPremium <= 1.2` against the
 * REAL content pipeline, closed-form, rather than trusting the raw number in
 * isolation. `edgePerCauseYen` must show at least one cause on each side of
 * zero for every symptom - some causes worse than the sheet price, some
 * better - or the symptom's own weight spread isn't creating real
 * uncertainty. Not bot-derived: every number is a direct call into the real
 * sim functions (`diagnosis.ts`), the same "closed-form, cheap enough for
 * every balance run" standing as `computeRosterCoherence` above.
 */
export function computeSymptomCoherence(context: SimContext): SymptomCoherenceRow[] {
  const neutralState = createInitialGameState(context, 0)
  const rows: SymptomCoherenceRow[] = []

  for (const symptom of context.symptoms) {
    for (const fitmentClass of SYMPTOM_PROBE_FITMENT_CLASSES) {
      const model = context.models.find((m) => fitmentClassForTier(m.tier) === fitmentClass)
      if (!model) continue

      const clean = buildCleanProbeCar(model, context, `symptom-${symptom.id}`, 'symptom probe')
      // Every cause in a real symptom addresses the same part (decision 4's
      // content) - any cause's own `carPartId` names the slot to record.
      const carPartId = symptom.causes[0]!.carPartId
      const apparentBand = clean.parts[carPartId].installed?.band ?? 'mint'
      const carWithSymptom: CarInstance = {
        ...clean,
        symptoms: [
          {
            symptomId: symptom.id,
            trueCauseId: symptom.causes[0]!.id,
            remainingCauseIds: symptom.causes.map((cause) => cause.id),
            runTestIds: [],
          },
        ],
        apparentBandByPartId: { [carPartId]: apparentBand },
      }

      const apparentValue = marketValueYen(
        model,
        clean,
        100,
        context.partsById,
        context.partsTaxonomyById,
        context.economy,
      )
      const expectedValue = expectedTrueValueYen(carWithSymptom, model, neutralState, context)
      const sheetValue = sheetGuideValueYen(carWithSymptom, model, neutralState, context)

      const edgePerCauseYen = symptom.causes.map((cause) => {
        const installed = clean.parts[cause.carPartId].installed
        const causeValue = installed
          ? marketValueYen(
              model,
              {
                ...clean,
                parts: {
                  ...clean.parts,
                  [cause.carPartId]: { installed: { ...installed, band: cause.setBand } },
                },
              },
              100,
              context.partsById,
              context.partsTaxonomyById,
              context.economy,
            )
          : apparentValue
        return { causeId: cause.id, edgeYen: Math.round(causeValue - sheetValue) }
      })

      rows.push({
        symptomId: symptom.id,
        fitmentClass,
        apparentValueYen: Math.round(apparentValue),
        expectedTrueValueYen: Math.round(expectedValue),
        sheetGuideValueYen: Math.round(sheetValue),
        blindBuyEvYen: Math.round(expectedValue - sheetValue),
        edgePerCauseYen,
      })
    }
  }

  return rows
}

/**
 * Sprint 80 crew model, R5 (maintainer redesign 2026-07-17): the hire
 * coherence probe, closed-form, one row per reputation tier. Every figure is a
 * direct call into the real wage formula (`deriveStaffWageYen`), the contract
 * coefficients, the introduction-fee rule, and the live content rates, so it
 * can never drift from what the game does - the same standing as
 * `computeRosterCoherence` above.
 *
 * A contract-assigned member MUST net a profit (that is the point of the
 * assignment), but a modest one, and the same hands billed out must always beat
 * the retainer. The three bounds, all HARD-gated, measured here and asserted
 * (exhaustively across each tier's whole budget cube) in `staffProbes.test.ts`:
 *
 * - Bound A (net profit), every candidate every tier: `weeklyContract` in
 *   `[1.05, 1.40] x weeklyWage`. Each row carries the tier's two binding
 *   candidates - the lowest ratio (nearest 1.05) and the highest (nearest
 *   1.40); the probe finds them by walking the cube, so it stays correct if the
 *   coefficients move.
 * - Bound B (honest work beats the retainer), every candidate:
 *   `weeklyContract <= HIRE_BOUND_B_BILLABLE_FRACTION x (laborSlotsPerDay x 7 x
 *   serviceJobs.laborRateYen)`. The row carries the tier's tightest candidate
 *   (the largest contract at the fewest slots).
 * - Bound C (first hire reachable), hard-gated only at the entry tier
 *   (`boundCGated`), disclosed elsewhere: the tier's cheapest candidate's
 *   introduction fee stays within `HIRE_BOUND_C_STARTING_CASH_FRACTION` of
 *   `STARTING_CASH_YEN`.
 * - Bound D (Sprint 82 decision 3: skills worth paying for), hard-gated only at
 *   the entry tier (`boundDGated`), disclosed elsewhere: the wage premium of a
 *   max-skill candidate over a min-skill one (identical slots) stays within
 *   `HIRE_BOUND_D_SAVEABLE_MULTIPLE x` the weekly value of the labour that
 *   candidate's speed discount can save at full utilisation. Idle skills save
 *   nothing, and bound A already stops contract income from carrying the
 *   premium - so a skilled hire is only ever worth it for a shop that works.
 */
export const HIRE_BOUND_A_MIN_RATIO = 1.05
export const HIRE_BOUND_A_MAX_RATIO = 1.4
export const HIRE_BOUND_B_BILLABLE_FRACTION = 0.5
export const HIRE_BOUND_C_STARTING_CASH_FRACTION = 0.15
/**
 * Sprint 82 decision 3 (bound D): the wage premium a shop pays for a max-skill
 * candidate over a min-skill one (identical slots) must not exceed this
 * multiple of the weekly value of the labour that candidate's speed discount
 * can save at full utilisation. Skills must be worth paying for when the shop
 * is busy; the discount they buy is worth far more than the premium.
 */
export const HIRE_BOUND_D_SAVEABLE_MULTIPLE = 2

/** One binding candidate for bound A - a `(stats, laborSlotsPerDay)` corner and
 * the ratio it produces. */
export interface HireBoundACandidate {
  stats: StaffMember['stats']
  laborSlotsPerDay: number
  wageYen: number
  contractWeeklyYen: number
  /** `contractWeeklyYen / wageYen` - must sit in [1.05, 1.40]. */
  ratio: number
}

export interface HireCoherenceRow {
  tier: ReputationTier
  /** Bound A's lowest-ratio candidate in the tier (nearest the 1.05 floor). */
  boundALow: HireBoundACandidate
  /** Bound A's highest-ratio candidate in the tier (nearest the 1.40 ceiling). */
  boundAHigh: HireBoundACandidate
  /** Bound B's tightest candidate: the largest weekly contract at the fewest
   * labour slots (the smallest billable ceiling). */
  boundBStats: StaffMember['stats']
  boundBSlots: number
  boundBContractWeeklyYen: number
  boundBCeilingYen: number
  /** `ceiling - contract`; `>= 0` means honest work still beats the retainer. */
  boundBMarginYen: number
  /** Bound C: this tier's cheapest candidate (min stats, 1 slot). */
  boundCWageYen: number
  boundCFeeYen: number
  boundCCapYen: number
  /** `cap - fee`; `>= 0` means the first hire is affordable. */
  boundCMarginYen: number
  /** `true` only for the entry (first) reputation tier - the single tier where
   * bound C is hard-gated (a day-one shop starts there). */
  boundCGated: boolean
  /** Bound D: the wage premium (identical slots) of this tier's max-skill
   * candidate over its min-skill one. */
  boundDPremiumYen: number
  /** Bound D: the weekly value of the labour the tier's best hands can save -
   * `crewSpeedDiscount[budget.max] x 7 x serviceJobs.laborRateYen`. */
  boundDSaveableWeeklyYen: number
  /** Bound D cap: `HIRE_BOUND_D_SAVEABLE_MULTIPLE x boundDSaveableWeeklyYen`. */
  boundDCapYen: number
  /** `cap - premium`; `>= 0` means skills are not overpriced for a busy shop. */
  boundDMarginYen: number
  /** `true` only for the entry tier - the single tier where bound D is
   * hard-gated (mirrors bound C). */
  boundDGated: boolean
}

function weeklyContractYen(stats: StaffMember['stats'], economy: EconomyConfig): number {
  const { contractBaseYenPerDay, contractPerSkillPointYenPerDay } = economy.staff
  return 7 * (contractBaseYenPerDay + contractPerSkillPointYenPerDay * staffSkillSum(stats))
}

export function computeHireCoherence(context: SimContext): HireCoherenceRow[] {
  const economy = context.economy
  const { statBudgetByTier } = economy.staff
  const entryTier = ReputationTierSchema.options[0]!
  const capC = Math.round(HIRE_BOUND_C_STARTING_CASH_FRACTION * economy.STARTING_CASH_YEN)
  const rows: HireCoherenceRow[] = []

  for (const tier of ReputationTierSchema.options) {
    const budget = statBudgetByTier[tier]!

    let low: HireBoundACandidate | null = null
    let high: HireBoundACandidate | null = null
    let tightestB: {
      stats: StaffMember['stats']
      slots: number
      contractWeekly: number
      ceiling: number
      margin: number
    } | null = null

    for (let engine = budget.min; engine <= budget.max; engine++) {
      for (let chassis = budget.min; chassis <= budget.max; chassis++) {
        for (let body = budget.min; body <= budget.max; body++) {
          const stats: StaffMember['stats'] = { engine, chassis, body }
          const contractWeekly = weeklyContractYen(stats, economy)
          for (const slots of [1, 2] as const) {
            const wage = deriveStaffWageYen(stats, slots, economy)
            const ratio = contractWeekly / wage
            const candidate: HireBoundACandidate = {
              stats,
              laborSlotsPerDay: slots,
              wageYen: wage,
              contractWeeklyYen: contractWeekly,
              ratio,
            }
            if (low === null || ratio < low.ratio) low = candidate
            if (high === null || ratio > high.ratio) high = candidate

            const ceiling =
              HIRE_BOUND_B_BILLABLE_FRACTION * slots * 7 * economy.serviceJobs.laborRateYen
            const margin = ceiling - contractWeekly
            if (tightestB === null || margin < tightestB.margin) {
              tightestB = { stats, slots, contractWeekly, ceiling, margin }
            }
          }
        }
      }
    }

    const cheapestStats: StaffMember['stats'] = {
      engine: budget.min,
      chassis: budget.min,
      body: budget.min,
    }
    const boundCWageYen = deriveStaffWageYen(cheapestStats, 1, economy)
    const boundCFeeYen = introductionFeeYen(boundCWageYen, economy)

    // Bound D (decision 3): the wage premium of the all-max-skill candidate over
    // the all-min-skill one at IDENTICAL slots (the slot premium cancels, so 1
    // slot stands for both), against the weekly value of the labour the tier's
    // best hands can save at full utilisation.
    const dearestStats: StaffMember['stats'] = {
      engine: budget.max,
      chassis: budget.max,
      body: budget.max,
    }
    const boundDPremiumYen =
      deriveStaffWageYen(dearestStats, 1, economy) - deriveStaffWageYen(cheapestStats, 1, economy)
    const curve = economy.staff.crewSpeedDiscount
    const bestSaved = curve[Math.min(budget.max, curve.length - 1)] ?? 0
    const boundDSaveableWeeklyYen = bestSaved * 7 * economy.serviceJobs.laborRateYen
    const boundDCapYen = HIRE_BOUND_D_SAVEABLE_MULTIPLE * boundDSaveableWeeklyYen

    rows.push({
      tier,
      boundALow: low!,
      boundAHigh: high!,
      boundBStats: tightestB!.stats,
      boundBSlots: tightestB!.slots,
      boundBContractWeeklyYen: tightestB!.contractWeekly,
      boundBCeilingYen: tightestB!.ceiling,
      boundBMarginYen: tightestB!.margin,
      boundCWageYen,
      boundCFeeYen,
      boundCCapYen: capC,
      boundCMarginYen: capC - boundCFeeYen,
      boundCGated: tier === entryTier,
      boundDPremiumYen,
      boundDSaveableWeeklyYen,
      boundDCapYen,
      boundDMarginYen: boundDCapYen - boundDPremiumYen,
      boundDGated: tier === entryTier,
    })
  }

  return rows
}
