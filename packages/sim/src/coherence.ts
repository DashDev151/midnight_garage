import {
  ALL_CAR_PART_IDS,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type PartFitmentClass,
} from '@midnight-garage/content'
import { enforceMaxBillFraction, stockInstanceFor } from './auctions'
import { carCostToMintYen, hasForcedInduction } from './bands'
import type { SimContext } from './context'
import { marketValueYen, mileageFactor } from './marketValue'

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
   * the worst bill to fully restore, sell at guide (= clean value, Law 1's
   * ceiling) - the flip margin a maintainer or player could realize on the
   * single worst lot the game could ever generate for this model. */
  flipMarginYen: number
  flipMarginFraction: number
  /** Cost to replace every true consumable (tyres + brake pads/discs +
   * clutch) from scratch at this model's own class, as a fraction of book
   * value - the direct, permanent "brake pads vs car price" guard (Law 3). */
  consumablesCostYen: number
  consumablesShare: number
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
      )
      return [partId, { installed }]
    }),
  ) as CarInstance['parts']
  return {
    id: `coherence-${model.id}`,
    modelId: model.id,
    year: model.spec.yearFrom,
    mileageKm,
    color: 'White',
    provenanceNote: 'coherence probe',
    authenticityPercent: 70,
    parts,
  }
}

/** The four Law 2/Law 3 closed-form facts for one roster model. */
export function computeModelCoherence(model: CarModel, context: SimContext): ModelCoherenceRow {
  const fitmentClass = fitmentClassForTier(model.tier)
  const rawCar = buildWorstCaseRawCar(model, context)
  const softened = enforceMaxBillFraction(rawCar, model, context)

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

  return {
    modelId: model.id,
    fitmentClass,
    cleanValueYen: Math.round(cleanValueYen),
    worstBillYen,
    billToCleanRatio,
    flipMarginYen,
    flipMarginFraction,
    consumablesCostYen,
    consumablesShare,
  }
}

export function computeRosterCoherence(
  models: readonly CarModel[],
  context: SimContext,
): ModelCoherenceRow[] {
  return models.map((model) => computeModelCoherence(model, context))
}
