import {
  ALL_CAR_PART_IDS,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type ConditionBand,
  type PartFitmentClass,
} from '@midnight-garage/content'
import { carOriginLabel, generateAuctionCarInstance, stockInstanceFor } from './auctions'
import {
  bandIndex,
  canRepair,
  isPartMissing,
  planPartRepair,
  scrapValueYen,
  usedPartSaleValueYen,
} from './bands'
import { buildRoughProbeCar } from './balanceProbes'
import {
  applyDerivedBodyBands,
  bodyPartRepairBillYen,
  isBodyDerivedPart,
  zoneStatesRepairedToBand,
} from './bodyPipeline'
import type { SimContext } from './context'
import { machinedPartPriceYen } from './machining'
import { installLaborSlotsFor, removeLaborSlotsFor } from './jobs'
import { marketValueYen, sensibleRepairTargetBand } from './marketValue'
import { makeCarOrigin } from './provenance'
import { createRng } from './rng'

/**
 * The four things a player can do with a car they have just bought, priced
 * end to end against the SAME car and the SAME purchase price, so their
 * ranking is a measurement rather than an opinion.
 *
 * The economy owes them an order, most profitable to least:
 *
 * 1. `repair-to-expectation` - fix it up to what its market expects, sell it.
 * 2. `repair-to-mint`        - fix it past that, sell it.
 * 3. `strip-reconditioned`   - strip it, tidy the parts up, sell them.
 * 4. `strip-as-found`        - strip it and sell the parts as they came off.
 *
 * Every figure comes from the real sim functions (`marketValueYen`,
 * `planPartRepair`, `usedPartSaleValueYen`, `scrapValueYen`,
 * `removeLaborSlotsFor`), never a re-derivation of their formulas, so this
 * cannot drift from what the game does. No careers and no RNG beyond the one
 * pinned seed `buildRoughProbeCar` already threads through the generation
 * floor guard.
 */

/** The four plays, in the order the economy is supposed to rank them. */
export const PLAY_IDS = [
  'repair-to-expectation',
  'repair-to-mint',
  'strip-reconditioned',
  'strip-as-found',
] as const

export type PlayId = (typeof PLAY_IDS)[number]

export interface PlayResult {
  play: PlayId
  /** What the play brings in: a sale price for the two repair plays, the
   * counter takings for every part plus the shell's scrap value for the two
   * strip plays. */
  revenueYen: number
  /** What the play spends on top of the purchase - repair work, replacement
   * parts, recondition work. Never includes the purchase itself, which is
   * identical across all four. */
  outlayYen: number
  /** `revenueYen - buyPriceYen - outlayYen`. */
  profitYen: number
  /** Labour energy the play burns, in the same points
   * `energy.actionPoints`/`energyPerBandStepByToolTier` are denominated in. */
  laborPoints: number
  /** `profitYen / laborPoints`, or the profit itself when the play costs no
   * labour at all (a car already at its expectation band needs no work). */
  yenPerLaborPoint: number
}

export interface ModelPlayRankingRow {
  modelId: string
  fitmentClass: PartFitmentClass
  bookValueYen: number
  /** The one price every play is measured against: the rough probe car's own
   * guide value at the auction reserve. */
  buyPriceYen: number
  /** One entry per `PLAY_IDS`, in that order. */
  plays: PlayResult[]
  /** The plays sorted by profit, most first - the measured ranking. */
  rankedPlayIds: PlayId[]
  /** True when `rankedPlayIds` is exactly `PLAY_IDS`, ties allowed (a car
   * with no sub-worn part gives the two strip plays identical yields, which
   * is correct rather than a failure). */
  ranksAsDesigned: boolean
}

/**
 * The result of taking `car` up to `targetBand`, with the money and the time
 * always describing the same work.
 *
 * Three cases, one per slot:
 *
 * - A repairable part below the target climbs at
 *   `restoration.repairStepFraction` per band step, costing
 *   `energyPerBandStepByToolTier[1]` per step. A bolt-on or buried slot is
 *   bench work, so it additionally pays to come off and go back on.
 * - A part with no repair path (scrap, or a replace-only consumable below
 *   `fine`) is replaced outright at its class's stock price and comes back
 *   mint, paying removal plus install labour.
 * - A genuinely missing slot is filled the same way, paying install labour
 *   only.
 *
 * Blocker chains are deliberately not priced: a real teardown pays to move
 * whatever sits in front of a buried slot and then to put it back, which is
 * a per-restoration deduped figure this probe does not model. That understates
 * the labour of both repair plays equally, so it moves `yenPerLaborPoint`
 * and never `profitYen`, which is what the ranking is decided on.
 *
 * The three zone-derived body carriers are a fourth case, not one of the
 * three above: their band is derived, so the zone state underneath them is
 * repaired to the same target and the bands re-derive from it, at the
 * pipeline's own money (`bodyPartRepairBillYen` - materials and any panel a
 * zone needs, since beating and welding cost labour and never yen). Their
 * labour is per STAGE rather than per band step and joins the blocker chains
 * above as an unpriced understatement shared by both repair plays.
 */
function restoreToBand(
  car: CarInstance,
  model: CarModel,
  targetBand: ConditionBand,
  context: SimContext,
): { car: CarInstance; costYen: number; laborPoints: number } {
  const fitmentClass = fitmentClassForTier(model.tier)
  const origin = makeCarOrigin(car.id, carOriginLabel(model, car.year), 0)
  const parts = { ...car.parts }
  let costYen = 0
  let laborPoints = 0

  const fitFresh = (partId: (typeof ALL_CAR_PART_IDS)[number]) => {
    parts[partId] = {
      installed: stockInstanceFor(
        partId,
        'mint',
        `${car.id}-fitted`,
        fitmentClass,
        context.stockPartByCarPartId,
        origin,
      ),
    }
  }

  for (const partId of ALL_CAR_PART_IDS) {
    const entry = context.partsTaxonomyById[partId]
    if (!entry) continue
    if (car.zoneState && isBodyDerivedPart(partId)) continue // derived - see below
    const installed = parts[partId].installed
    if (!installed) {
      if (!isPartMissing(car, model, partId)) continue // legitimately absent
      costYen += entry.stockReplacementPriceYenByClass[fitmentClass]
      laborPoints += installLaborSlotsFor(partId, context)
      fitFresh(partId)
      continue
    }
    if (bandIndex(installed.band) >= bandIndex(targetBand)) continue
    const catalogPart = context.partsById[installed.partId]
    if (!catalogPart) continue
    if (!canRepair(installed.band, entry)) {
      costYen += entry.stockReplacementPriceYenByClass[fitmentClass]
      laborPoints += removeLaborSlotsFor(partId, context) + installLaborSlotsFor(partId, context)
      fitFresh(partId)
      continue
    }
    const plan = planPartRepair(
      installed.band,
      targetBand,
      1,
      entry,
      catalogPart.priceYen,
      context.economy.restoration.repairStepFraction,
      context.economy.energy.energyPerBandStepByToolTier,
    )
    costYen += plan.costYen
    laborPoints += plan.laborSlotsRequired
    if (entry.depthClass !== 'surface') {
      laborPoints += removeLaborSlotsFor(partId, context) + installLaborSlotsFor(partId, context)
    }
    parts[partId] = { installed: { ...installed, band: targetBand } }
  }

  let zoneState = car.zoneState
  if (zoneState) {
    for (const partId of ['panels', 'paint'] as const) {
      costYen += bodyPartRepairBillYen(
        partId,
        zoneState,
        targetBand,
        fitmentClass,
        context.partsById,
      )
    }
    zoneState = zoneStatesRepairedToBand(zoneState, targetBand)
  }
  return {
    car: applyDerivedBodyBands({ ...car, parts, zoneState }, model, context),
    costYen,
    laborPoints,
  }
}

/**
 * The band a part is worth reconditioning to before it goes on the counter.
 *
 * `teardown.resaleBandFactors` falls away faster at the bottom than
 * `restoration.repairStepFraction` charges to climb, so exactly the steps
 * whose resale gain beats their repair cost are worth taking. Walking the
 * ladder rather than hardcoding a band keeps this correct if either curve
 * moves: a steeper resale curve would make another rung pay, and this would
 * find it.
 */
function bestResaleBand(
  fromBand: ConditionBand,
  partPriceYen: number,
  context: SimContext,
): ConditionBand {
  let best = fromBand
  let bestNet = usedPartSaleValueYen(partPriceYen, fromBand, context.economy)
  for (const candidate of ['worn', 'fine', 'mint'] as const) {
    if (bandIndex(candidate) <= bandIndex(fromBand)) continue
    const steps = bandIndex(candidate) - bandIndex(fromBand)
    const costYen = Math.round(
      steps * context.economy.restoration.repairStepFraction * partPriceYen,
    )
    const net = usedPartSaleValueYen(partPriceYen, candidate, context.economy) - costYen
    if (net > bestNet) {
      best = candidate
      bestNet = net
    }
  }
  return best
}

/**
 * Strip every removable part off `car` and sell it. `recondition` decides
 * whether each part is first worked up to `bestResaleBand`; without it every
 * part goes over the counter exactly as it came off.
 *
 * Labour is every pulled part's own `removeLaborSlotsFor`, which is what an
 * assembly costs too (`removeAssemblyLaborSlotsFor` charges per member), plus
 * the recondition work when there is any. Selling and scrapping are instant
 * (`actionPoints.scrapPart`/`scrapShell` are zero), so nothing is charged for
 * them; a scrap-band part is unsellable and goes for its scrap value instead.
 * The stripped shell is scrapped at `bands.scrapValueFraction` of book.
 */
function stripAndSell(
  car: CarInstance,
  model: CarModel,
  recondition: boolean,
  context: SimContext,
): { revenueYen: number; costYen: number; laborPoints: number } {
  let revenueYen = Math.round(model.bookValueYen * context.economy.bands.scrapValueFraction)
  let costYen = 0
  let laborPoints = 0
  for (const partId of ALL_CAR_PART_IDS) {
    const entry = context.partsTaxonomyById[partId]
    const installed = car.parts[partId].installed
    if (!entry?.removable || !installed) continue
    const catalogPart = context.partsById[installed.partId]
    if (!catalogPart) continue
    laborPoints += removeLaborSlotsFor(partId, context)
    if (installed.band === 'scrap') {
      revenueYen += scrapValueYen(entry, context.economy, catalogPart.fitmentClass)
      continue
    }
    let band: ConditionBand = installed.band
    if (recondition && canRepair(band, entry)) {
      const target = bestResaleBand(band, catalogPart.priceYen, context)
      if (bandIndex(target) > bandIndex(band)) {
        const plan = planPartRepair(
          band,
          target,
          1,
          entry,
          catalogPart.priceYen,
          context.economy.restoration.repairStepFraction,
          context.economy.energy.energyPerBandStepByToolTier,
        )
        costYen += plan.costYen
        laborPoints += plan.laborSlotsRequired
        band = target
      }
    }
    // Priced off what the part is worth with its machining on it, exactly as
    // the counter prices it (`resolveSellPart`, parts.ts). The repair planning
    // above stays on the plain catalogue price: a machined block's
    // restoration bill is an ordinary block's.
    revenueYen += usedPartSaleValueYen(
      machinedPartPriceYen(installed, catalogPart, context.economy),
      band,
      context.economy,
    )
  }
  return { revenueYen, costYen, laborPoints }
}

function resultFor(
  play: PlayId,
  revenueYen: number,
  outlayYen: number,
  buyPriceYen: number,
  laborPoints: number,
): PlayResult {
  const profitYen = Math.round(revenueYen - buyPriceYen - outlayYen)
  return {
    play,
    revenueYen: Math.round(revenueYen),
    outlayYen: Math.round(outlayYen),
    profitYen,
    laborPoints,
    yenPerLaborPoint: laborPoints > 0 ? profitYen / laborPoints : profitYen,
  }
}

/** What a lot costs to take home: its own guide value at the auction reserve,
 * the one price every play is measured against. Heat-neutral at 100, like
 * every other closed-form probe. */
function reservePriceYen(car: CarInstance, model: CarModel, context: SimContext): number {
  const guideYen = marketValueYen(
    model,
    car,
    100,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  return Math.round(guideYen * context.economy.AUCTION_RESERVE_PRICE_FRACTION)
}

/**
 * All four plays for ONE car at ONE buy price, ranked by what they actually
 * pay - the measurement itself, with no opinion about where the car came from.
 * A closed-form probe car and a real generated lot go through this identically,
 * which is what lets the same ranking be asserted on both.
 */
export function computeCarPlayRanking(
  car: CarInstance,
  model: CarModel,
  buyPriceYen: number,
  context: SimContext,
): ModelPlayRankingRow {
  const sellAfter = (restored: CarInstance): number =>
    marketValueYen(
      model,
      restored,
      100,
      context.partsById,
      context.partsTaxonomyById,
      context.economy,
    )

  const toExpectation = restoreToBand(
    car,
    model,
    sensibleRepairTargetBand(model, context.economy),
    context,
  )
  const toMint = restoreToBand(car, model, 'mint', context)
  const reconditioned = stripAndSell(car, model, true, context)
  const asFound = stripAndSell(car, model, false, context)

  const plays: PlayResult[] = [
    resultFor(
      'repair-to-expectation',
      sellAfter(toExpectation.car),
      toExpectation.costYen,
      buyPriceYen,
      toExpectation.laborPoints,
    ),
    resultFor(
      'repair-to-mint',
      sellAfter(toMint.car),
      toMint.costYen,
      buyPriceYen,
      toMint.laborPoints,
    ),
    resultFor(
      'strip-reconditioned',
      reconditioned.revenueYen,
      reconditioned.costYen,
      buyPriceYen,
      reconditioned.laborPoints,
    ),
    resultFor(
      'strip-as-found',
      asFound.revenueYen,
      asFound.costYen,
      buyPriceYen,
      asFound.laborPoints,
    ),
  ]

  const ranked = [...plays].sort((a, b) => b.profitYen - a.profitYen)
  return {
    modelId: model.id,
    fitmentClass: fitmentClassForTier(model.tier),
    bookValueYen: model.bookValueYen,
    buyPriceYen,
    plays,
    rankedPlayIds: ranked.map((p) => p.play),
    ranksAsDesigned: PLAY_IDS.every(
      (playId, i) => plays[i]!.profitYen >= (plays[i + 1]?.profitYen ?? -Infinity),
    ),
  }
}

/** All four plays for one roster model, on the roughest car generation could
 * deliver for it (`buildRoughProbeCar`) - the closed-form bound. */
export function computeModelPlayRanking(model: CarModel, context: SimContext): ModelPlayRankingRow {
  const roughCar = buildRoughProbeCar(model, context)
  return computeCarPlayRanking(roughCar, model, reservePriceYen(roughCar, model, context), context)
}

export function computeRosterPlayRanking(
  models: readonly CarModel[],
  context: SimContext,
): ModelPlayRankingRow[] {
  return models.map((model) => computeModelPlayRanking(model, context))
}

/** One real generated lot's ranking, carrying the seed that produced it so a
 * failure names the exact car to reproduce. */
export interface GeneratedLotPlayRankingRow extends ModelPlayRankingRow {
  seed: number
}

/**
 * The four plays on REAL lots: `seedsPerModel` cars per roster model straight
 * out of `generateAuctionCarInstance`, each with its own rolled history, damage
 * pattern, symptom, per-slot bands and zone severities, each bought at its own
 * reserve.
 *
 * The closed-form `computeRosterPlayRanking` above measures one constructed
 * worst-reachable car per model, which bounds the economy; this measures the
 * cars a player is actually offered, which is what a claim about how the game
 * plays has to rest on. Both price the plays through the same
 * `computeCarPlayRanking`, so the two can never disagree about what a play is.
 */
export function computeGeneratedLotPlayRanking(
  models: readonly CarModel[],
  context: SimContext,
  seedsPerModel: number,
  gameYear: number,
): GeneratedLotPlayRankingRow[] {
  const rows: GeneratedLotPlayRankingRow[] = []
  for (const model of models) {
    for (let seed = 0; seed < seedsPerModel; seed++) {
      const car = generateAuctionCarInstance(
        model,
        `lot-${model.id}-${seed}`,
        createRng(seed),
        context,
        gameYear,
      )
      rows.push({
        ...computeCarPlayRanking(car, model, reservePriceYen(car, model, context), context),
        seed,
      })
    }
  }
  return rows
}
