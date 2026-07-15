import {
  ALL_CAR_PART_IDS,
  ComponentIdSchema,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ConditionBand,
  type PartFitmentClass,
} from '@midnight-garage/content'
import { carOriginLabel, enforceMaxBillFraction, stockInstanceFor } from './auctions'
import {
  bandFactor,
  bandIndex,
  carCostToMintYen,
  hasForcedInduction,
  planGroupRepair,
} from './bands'
import { PLAYER_BASE_LABOR_SLOTS } from './constants'
import type { SimContext } from './context'
import { removeLaborSlotsFor } from './jobs'
import { expectationForCar, marketValueYen, mileageFactor } from './marketValue'
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
  // not `depthClass`, so it still credits the full car. That leaves
  // `repairCostYen`/`repairLaborSlots` (and everything derived from them:
  // `sensibleFlipMarginYen`, `wageMarginYen`, `wageRatio`) undercounted on
  // any model whose expectation band touches a bolt-on/buried slot: the
  // wage probe's cost side no longer prices the same lift its value side
  // assumes. Known, disclosed gap (TODO.md: "teardown labour in Law 1
  // margins and Law 6 payouts", scoped across Sprints 71-72); Sprint 72
  // prices the full teardown chain (uninstall + bench repair + reinstall)
  // into this sum rather than patching it here ad hoc.
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
  const fitmentClass = fitmentClassForTier(model.tier)
  const carHasForcedInduction = hasForcedInduction(model)
  const carId = `donor-${model.id}`
  const cleanOrigin = makeCarOrigin(carId, carOriginLabel(model, model.spec.yearFrom), 0)
  const cleanParts = Object.fromEntries(
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
  const cleanCar: CarInstance = {
    id: carId,
    modelId: model.id,
    year: model.spec.yearFrom,
    mileageKm: 0,
    color: 'White',
    provenanceNote: 'donor probe',
    authenticityPercent: 100,
    parts: cleanParts,
  }

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
