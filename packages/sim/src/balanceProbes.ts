import {
  ALL_CAR_PART_IDS,
  ComponentIdSchema,
  MATERIALS,
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
  type ZoneState,
  type ZoneStates,
} from '@midnight-garage/content'
import {
  BEYOND_REPAIR_METAL,
  METAL_ZONE_IDS,
  TRIM_ZONE_IDS,
  applyDerivedBodyBands,
  bodyPartRepairBillYen,
  isBodyDerivedPart,
  severityThresholdForBand,
  zoneStatesRepairedToBand,
} from './bodyPipeline'
import {
  carOriginLabel,
  enforceMaxBillFraction,
  spendDamageBudget,
  stockInstanceFor,
} from './auctions'
import {
  bandIndex,
  canRepair,
  carCostToMintYen,
  hasForcedInduction,
  planGroupRepair,
  planPartRepair,
  usedPartSaleValueYen,
} from './bands'
import { deriveStaffWageYen, introductionFeeYen, staffSkillSum } from './staff'
import type { SimContext } from './context'
import { expectedTrueValueYen, sheetGuideValueYen } from './diagnosis'
import { installLaborSlotsFor, removeLaborSlotsFor } from './jobs'
import {
  cleanValueYen as computeCleanValueYen,
  marketValueYen,
  sensibleRepairTargetBand,
} from './marketValue'
import { createInitialGameState } from './newGame'
import { makeCarOrigin } from './provenance'
import { createRng } from './rng'
import { freshToolTiers } from './toolLines'

/**
 * Economy-bible.md law 4 (one derived ledger, machine-checked): the
 * closed-form coherence math, per roster model. Every number below is
 * produced by CALLING the real sim functions (`enforceMaxBillFraction`,
 * `carCostToMintYen`, `marketValueYen`) against a deliberately worse-than-
 * generation-could-ever-roll car, never a re-derivation of their formulas -
 * so this can never silently drift from what the game itself actually does.
 * No careers/RNG needed: every input is either roster content or the
 * worst-case construction below.
 */

const CONSUMABLE_PART_IDS: readonly CarPartId[] = ['tyres', 'brakePadsDiscs', 'clutch']

/**
 * The materials one repair charges, summed once - they price the same
 * regardless of a car's class (an era-true tin of filler costs the same on a
 * kei or a grand tourer), so they join Law 3's "brake pads vs car price" guard
 * as one more flat consumable cost, exactly like tyres/brakePadsDiscs/clutch.
 *
 * The metallic and pearl tins are excluded, and both reasons are independent.
 * They are alternatives to the plain tin rather than additions to it, so a
 * flat sum over all three would charge a car for three paint jobs it never
 * does. And they are what a player buys to make a car BETTER than it left the
 * factory: a repair restores a finish, it does not upgrade one, so an upgrade
 * a car need never buy cannot belong in the guard that asks whether a cheap
 * car is crushed by the costs it cannot avoid.
 */
const FINISH_UPGRADE_MATERIAL_IDS: readonly string[] = ['paint-metallic', 'paint-pearl']
const MATERIALS_COST_YEN = MATERIALS.filter(
  (material) => !FINISH_UPGRADE_MATERIAL_IDS.includes(material.id),
).reduce((sum, material) => sum + material.priceYen, 0)

export interface ModelBalanceProbeRow {
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
   * Law 1's ceiling) - the flip margin a player could realize on the single
   * worst lot the game could ever generate for this model.
   *
   * This is Law 2's literal claim and stays gated as such: full restoration
   * must be mathematically capable of profit on every generatable lot. It
   * is NOT the headline number, because on a low tier it prices a play no
   * sane player makes - a mint kei. Read `sensibleFlipMarginYen` for the
   * play the economy actually asks for. */
  flipMarginYen: number
  flipMarginFraction: number
  /**
   * The SENSIBLE play, and the number to read first: buy a rough but
   * fixable car (`buildRoughProbeCar` - every real slot at `poor`) at
   * reserve off its own damaged guide value, repair it up to its tier's
   * expectation band (not a yen past), sell at the resulting guide value.
   *
   * Every figure comes from the real sim functions, so this is what a
   * player following the economy's own advice actually clears. Law 1's
   * expectation-band amendment made "fully restore" the wrong default: the
   * market barely discounts a worn kei (`beyondDiscount` 0.4), so you pay
   * near clean value for one and a mint restore burns the margin -
   * `flipMarginYen` collapses on the entry tier for exactly that reason,
   * correctly. The money on a cheap car is in buying BELOW the expectation
   * band and bringing it up to the band, discounted at the full
   * `marketRepairDiscount`.
   */
  sensibleFlipMarginYen: number
  sensibleFlipMarginFraction: number
  /** Cost to replace every true consumable (tyres + brake pads/discs +
   * clutch, class-priced) PLUS one of every body-pipeline material (flat-
   * priced, class-independent), as a fraction of book value - the direct,
   * permanent "brake pads vs car price" guard (Law 3). */
  consumablesCostYen: number
  consumablesShare: number
  /**
   * The cost and time of the repair `sensibleFlipMarginYen` above prices:
   * the repairable portion of the rough probe car, at a fresh shop's tier-1
   * tools, planned to the car's own EXPECTATION BAND and clamped to the
   * tier-1 repair ceiling (`fine`) - so a flagship's mint expectation is
   * measured as a repair to fine, the most a fresh shop's tools can finish.
   *
   * Both figures come from the SAME real `planGroupRepair(...
   * expectationBand)` calls, summed over the six groups, so the money and
   * the time always describe the same plan. Scrap and missing slots are
   * excluded from BOTH sides on purpose: those are replacements (buying a
   * part at the market), a different economic act from bench labour.
   *
   * `repairCostYen` also carries the body pipeline's own bill for the three
   * zone-derived carriers (`bodyPartRepairBillYen`), which `planGroupRepair`
   * never plans because a derived band is not a repair target. That bill is
   * money-only by construction - filler, primer, paint, underseal and any
   * panel a zone needs - since beating and welding cost labour and never yen.
   * `repairLaborSlots` therefore stays the band-step labour of the on-car and
   * bench plans alone: the pipeline charges labour per STAGE rather than per
   * band step, and that is a different unit, not a missing addend.
   */
  repairCostYen: number
  repairLaborSlots: number
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
 * The one shared skeleton every band-uniform coherence probe in this file
 * builds from: every real slot filled with a fresh stock `PartInstance` at
 * a single `band`, through `stockInstanceFor` - the SAME per-part builder
 * real generation (`generateAuctionCarInstance`, auctions.ts) uses to fill
 * a fresh slot. `parts` walks `ALL_CAR_PART_IDS` (the schema's own live
 * enum), so a new `CarPartId` needs no edit here, and it is the only piece
 * of construction that ever touches the part catalogue.
 *
 * Every other `CarInstance` field a probe varies (id, mileage, provenance)
 * is a caller-supplied scalar, so the whole object shape is authored in
 * exactly ONE place in this file: a future field on `CarInstance` needs one
 * edit here, never three. `forcedInduction` is left absent on a model that
 * was never built with one - `hasForcedInduction`'s own platform fact, not a
 * per-probe decision.
 *
 * The car carries a `zoneState` because every real generated car does
 * (`rollZoneStates` + `applyDerivedBodyBands`, auctions.ts/bodyPipeline.ts),
 * and that state is what prices `panels`/`paint`: with it, those two route
 * through the body pipeline's own bill (`bodyPartRepairBillYen`); without it
 * they would route through the generic per-part formula (`costToBandYen`,
 * bands.ts), which is a pricing model no car in the game uses.
 * `applyDerivedBodyBands` is the single writer of those two bands, so they
 * are derived here rather than set from `band` directly.
 */
function buildUniformBandCar(
  model: CarModel,
  context: SimContext,
  options: {
    carId: string
    band: ConditionBand
    year: number
    mileageKm: number
    provenanceNote: string
  },
): CarInstance {
  const { carId, band, year, mileageKm, provenanceNote } = options
  const fitmentClass = fitmentClassForTier(model.tier)
  const carHasForcedInduction = hasForcedInduction(model)
  const origin = makeCarOrigin(carId, carOriginLabel(model, year), 0)
  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      if (partId === 'forcedInduction' && !carHasForcedInduction) {
        return [partId, { installed: null }]
      }
      const installed = stockInstanceFor(
        partId,
        band,
        carId,
        fitmentClass,
        context.stockPartByCarPartId,
        origin,
      )
      return [partId, { installed }]
    }),
  ) as CarInstance['parts']
  return applyDerivedBodyBands(
    {
      id: carId,
      modelId: model.id,
      year,
      mileageKm,
      factoryColour: model.spec.factoryColours[0]!,
      provenanceNote,
      parts,
      symptoms: [],
      apparentBandByPartId: null,
      zoneState: uniformZoneStates(band),
    },
    model,
    context,
  )
}

/**
 * Every zone at the severity `band` maps to, so the two derived carriers read
 * `band` for the same reason a generated car's do. Each axis is clamped to
 * its own ceiling, which is why the worst expressible car is not uniformly
 * `scrap`: only `metal` reaches the beyond-repair rung, `surface` tops out at
 * worn and `finish` at poor. That asymmetry is the live model's, not this
 * probe's. No `colour` is set, so no zone can disagree with another about one.
 */
function uniformZoneStates(band: ConditionBand): ZoneStates {
  const severity = severityThresholdForBand(band)
  const metal = Math.min(severity, BEYOND_REPAIR_METAL)
  const surface = Math.min(severity, 2)
  const finish = Math.min(severity, 3)
  const states = {} as Record<string, ZoneState>
  for (const zoneId of METAL_ZONE_IDS) {
    states[zoneId] = { metal, surface, finish, panelMissing: false, primed: false }
  }
  for (const zoneId of TRIM_ZONE_IDS) {
    states[zoneId] = { finish, panelMissing: false, primed: false }
  }
  return states as ZoneStates
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
export function buildWorstCaseRawCar(model: CarModel, context: SimContext): CarInstance {
  return buildUniformBandCar(model, context, {
    carId: `coherence-${model.id}`,
    band: 'scrap',
    year: model.spec.yearFrom,
    mileageKm: worstCaseMileageKm(context),
    provenanceNote: 'coherence probe',
  })
}

/** The fixed seed the rough probe threads through `spendDamageBudget`'s
 * candidate picks - the damage budget is the one generation guard that draws,
 * and pinning the draw keeps the coherence table reproducible. */
const ROUGH_PROBE_SEED = 0

/**
 * The roughest car GENERATION CAN ACTUALLY DELIVER for this model, and the
 * shared subject of every "what should a player do with this car" probe.
 * Every real slot starts at `poor` at the roster's worst reachable mileage,
 * and then the two generation guards run in the order
 * `generateAuctionCarInstance` runs them - `enforceMaxBillFraction` softens
 * whatever the Law 2 ceiling forbids, and the damage budget spends a
 * `project` grade's worth of band steps back into what the softening freed.
 *
 * Both guards are essential. A raw all-`poor` car sits far above the Law 2
 * ceiling for most of the roster - its bill to mint runs to several times
 * what the guard permits - so anything measured on one is measured on a lot
 * the game can never produce: the market prices such a car at a few percent
 * of clean, and the restoration it "needs" is a bill no player would ever be
 * offered. The budget is the other half, at the worst grade the roll can
 * produce, so the probe car is the worst a real lot can be rather than the
 * worst arithmetic allows.
 *
 * Deliberately NOT `buildWorstCaseRawCar`. That car is all-`scrap`, and scrap
 * is unrepairable by definition (`costToBandYen`'s own first branch): it is
 * replaced, not worked on, so it reports zero repairable work for any model
 * whose softened worst case stays at scrap - a true fact about a write-off,
 * and a useless one here. The worst-case car belongs to Law 2 (can generation
 * produce a trap?); this one is the car the fantasy is actually about - the
 * wreck you can make good.
 */
export function buildRoughProbeCar(model: CarModel, context: SimContext): CarInstance {
  const carId = `rough-${model.id}`
  const raw = buildUniformBandCar(model, context, {
    carId,
    band: 'poor',
    year: model.spec.yearFrom,
    mileageKm: worstCaseMileageKm(context),
    provenanceNote: 'rough probe',
  })
  const origin = makeCarOrigin(carId, carOriginLabel(model, model.spec.yearFrom), 0)
  const softened = enforceMaxBillFraction(raw, model, context, origin)
  return spendDamageBudget(
    softened,
    model,
    context,
    origin,
    // `garaged` is the one pattern authored flat across every group and zone,
    // so the probe stays deliberately pattern-NEUTRAL: it measures what the
    // worst reachable lot costs and returns, and a probe that leaned toward
    // one group would be measuring a story rather than a bound.
    context.damagePatternsById.garaged,
    createRng(ROUGH_PROBE_SEED),
    context.economy.partsGeneration.damageGrades.bandStepsByGrade.project,
  )
}

/**
 * The rough probe car AFTER its repair plan has run: every REPAIRABLE slot
 * sitting below `band` lifted to it, and nothing else touched.
 *
 * Two exclusions, each mirroring one the cost side already makes, so the money
 * and the value always describe the same work: a replace-only consumable
 * (tyres, pads, clutch) has no repair path, so the plan never paid to move it,
 * and a slot already at or above `band` is not part of the plan either.
 *
 * The three derived body carriers never have their band written here, because
 * `applyDerivedBodyBands` is the only writer of it: the zone state underneath
 * them is repaired to the same target instead and the bands re-derive from it,
 * which is exactly what the pipeline's own bill (`bodyPartRepairBillYen`, paid
 * on the cost side) buys.
 */
function repairRoughProbeCar(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  band: ConditionBand,
): CarInstance {
  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      const slot = car.parts[partId]
      const installed = slot.installed
      if (car.zoneState && isBodyDerivedPart(partId)) return [partId, slot]
      if (!installed || !context.partsTaxonomyById[partId]?.repairable) return [partId, slot]
      if (bandIndex(installed.band) >= bandIndex(band)) return [partId, slot]
      return [partId, { ...slot, installed: { ...installed, band } }]
    }),
  ) as CarInstance['parts']
  const zoneState = car.zoneState ? zoneStatesRepairedToBand(car.zoneState, band) : undefined
  return applyDerivedBodyBands({ ...car, parts, zoneState }, model, context)
}

/** The four Law 2/Law 3 closed-form facts for one roster model. */
export function computeModelBalanceProbe(
  model: CarModel,
  context: SimContext,
): ModelBalanceProbeRow {
  const fitmentClass = fitmentClassForTier(model.tier)
  const rawCar = buildWorstCaseRawCar(model, context)
  const softened = enforceMaxBillFraction(
    rawCar,
    model,
    context,
    makeCarOrigin(rawCar.id, carOriginLabel(model, rawCar.year), 0),
  )

  // Fixed at heat-neutral 100, matching `guideValueYen` below and every
  // other roster-wide probe in this file - a closed-form invariant cannot
  // depend on live market heat.
  const cleanValueYen = computeCleanValueYen(
    model.bookValueYen,
    softened.mileageKm,
    100,
    context.economy,
  )
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

  const consumablesCostYen =
    CONSUMABLE_PART_IDS.reduce(
      (sum, partId) =>
        sum + context.partsTaxonomyById[partId]!.stockReplacementPriceYenByClass[fitmentClass],
      0,
    ) + MATERIALS_COST_YEN
  const consumablesShare = model.bookValueYen > 0 ? consumablesCostYen / model.bookValueYen : 0

  // The sensible play's own repair: the repairable portion of this car,
  // planned to the car's own EXPECTATION BAND through the real repair planner
  // at a fresh shop's tools - money and time from the same plan. Planning to
  // mint measures a restoration no sane player would perform on a kei; the
  // expectation band is the repair the economy actually asks for.
  // A fresh shop's tools are tier-1, which caps a repair at fine. A flagship's
  // mint expectation is not reachable by repair here - the sensible tier-1
  // play repairs the rough car up to the ceiling (fine) and sells at that
  // band. Reaching the mint expectation needs the tier-2 machine owned (repair
  // fine->mint cheaply) or buying mint parts. Owning tier-2 widens this
  // margin, which is the incentive to buy it. Every tier whose expectation
  // already sits at or below fine is untouched - the clamp is a no-op there.
  const effectiveExpectationBand = sensibleRepairTargetBand(model, context.economy)
  const roughCar = buildRoughProbeCar(model, context)
  // `planGroupRepair` (bands.ts) covers surface-slot candidates only:
  // bolt-on/buried repair moved to the bench, off the on-car plan this sum
  // reads. `repairRoughProbeCar`'s value-side lift is gated on `repairable`,
  // not `depthClass`, so it still credits the full car - so the loop below
  // separately prices every non-surface repairable part's own bench-repair
  // cost.
  let repairCostYen = 0
  let repairLaborSlots = 0
  for (const groupId of ComponentIdSchema.options) {
    const plan = planGroupRepair(
      roughCar,
      groupId,
      effectiveExpectationBand,
      freshToolTiers(),
      context.partIdsByGroup,
      context.partsById,
      context.partsTaxonomyById,
      context.economy.restoration.repairStepFraction,
      context.economy.energy.energyPerBandStepByToolTier,
    )
    repairCostYen += plan.costYen
    repairLaborSlots += plan.laborSlotsRequired
  }
  // Removal and blocker refits are free - a bench repair simply adds its own
  // `installLaborSlotsFor` refit, the same unconditional charge
  // `serviceJobCostBreakdown` uses, since a restoration always improves the
  // slot it repairs.
  for (const partId of ALL_CAR_PART_IDS) {
    const entry = context.partsTaxonomyById[partId]
    if (!entry || entry.depthClass === 'surface') continue
    const installed = roughCar.parts[partId].installed
    if (!installed || !canRepair(installed.band, entry)) continue
    const catalogPart = context.partsById[installed.partId]
    if (!catalogPart) continue
    // Repair level 1 (worst-case tooling): matches the fresh-shop assumption
    // `freshToolTiers()` already applies to the surface loop above, and
    // `planPartRepair`'s `costYen` is repair-level-independent regardless.
    const plan = planPartRepair(
      installed.band,
      effectiveExpectationBand,
      1,
      entry,
      catalogPart.priceYen,
      context.economy.restoration.repairStepFraction,
      context.economy.energy.energyPerBandStepByToolTier,
    )
    if (plan.laborSlotsRequired === 0) continue
    repairCostYen += plan.costYen
    repairLaborSlots += plan.laborSlotsRequired + installLaborSlotsFor(partId, context)
  }
  // The body pipeline's own money for the two zone-derived carriers, which
  // neither loop above can plan: their bands are derived, so `planGroupRepair`
  // skips them by design. This is the same call `carCostToBandYen` makes, and
  // it is what `repairRoughProbeCar`'s zone repair below is paying for.
  if (roughCar.zoneState) {
    for (const partId of ['panels', 'paint'] as const) {
      repairCostYen += bodyPartRepairBillYen(
        partId,
        roughCar.zoneState,
        effectiveExpectationBand,
        fitmentClass,
        context.partsById,
      )
    }
  }
  // The sensible play, end to end through the real value function: buy the
  // rough car at reserve, do exactly the repair above, sell at the resulting
  // guide value.
  const roughCarGuideYen = marketValueYen(
    model,
    roughCar,
    100,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  const roughCarBuyYen = Math.round(
    roughCarGuideYen * context.economy.AUCTION_RESERVE_PRICE_FRACTION,
  )
  const repairedGuideYen = marketValueYen(
    model,
    repairRoughProbeCar(roughCar, model, context, effectiveExpectationBand),
    100,
    context.partsById,
    context.partsTaxonomyById,
    context.economy,
  )
  const sensibleFlipMarginYen = Math.round(repairedGuideYen - roughCarBuyYen - repairCostYen)

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
  }
}

export function computeRosterBalanceProbe(
  models: readonly CarModel[],
  context: SimContext,
): ModelBalanceProbeRow[] {
  return models.map((model) => computeModelBalanceProbe(model, context))
}

export interface ModelDonorBalanceProbeRow {
  modelId: string
  /** A clean, all-mint example of this model (0 km, authenticity 100),
   * valued whole through the real `marketValueYen` - the "just sell it"
   * baseline the parted-out route below is measured against. */
  wholeSaleYen: number
  /** Selling every REMOVABLE part off that same clean car through the one
   * shared used-part price atom `resolveSellPart` uses
   * (`usedPartSaleValueYen`, bands.ts), called directly rather than through a
   * throwaway `GameState` - plus scrapping the stripped shell
   * (`model.bookValueYen x economy.bands.scrapValueFraction`).
   * The "whole beats parted" gate compares this against `wholeSaleYen`
   * above, on every roster model. */
  partedYieldYen: number
  /** Total uninstall labour the parted route above actually costs - every
   * removable part's own `removeLaborSlotsFor`, summed. Not gated; disclosed
   * alongside the yen figures so it's easy to read "is this worth the bench
   * time" at a glance. */
  stripLaborSlots: number
  /**
   * On the SAME worst-case generatable car `computeModelBalanceProbe` builds
   * (`buildWorstCaseRawCar` softened by `enforceMaxBillFraction` - reused
   * here exactly, not rebuilt differently), the yield of parting out only
   * the parts strictly better than `poor` (the ones actually worth pulling
   * rather than replacing outright) plus scrapping the shell.
   *
   * DISCLOSURE ONLY, and never a gate: it is a GROSS yield with no purchase
   * price deducted, on an all-scrap construction with every zone at one
   * severity, so setting it against a NET repair margin puts two accounting
   * bases and two cars that no catalogue can deal side by side. The donor law
   * is gated where it belongs, on real `generateAuctionCarInstance` lots at
   * one buy price, net against net (`balanceProbes.test.ts`).
   */
  partedYieldOfWorstCaseYen: number
}

/**
 * A clean (0 km, all-mint stock, authenticity 100), honest example of
 * `model` - the "what a healthy example of this tier looks like" probe,
 * shared by `computeDonorBalanceProbe` (the whole-vs-parted question) and
 * `computeSymptomBalanceProbe` (the blind-buy guardrail - a symptom's damage
 * is applied ON TOP of this same clean baseline, never a worst-case one,
 * since the whole point of a symptom is a surprise on a car that otherwise
 * looks fine).
 */
function buildCleanProbeCar(
  model: CarModel,
  context: SimContext,
  idPrefix: string,
  provenanceNote: string,
): CarInstance {
  return buildUniformBandCar(model, context, {
    carId: `${idPrefix}-${model.id}`,
    band: 'mint',
    year: model.spec.yearFrom,
    mileageKm: 0,
    provenanceNote,
  })
}

/**
 * The teardown game's donor-economy law: is a clean car ever worth more
 * parted out than sold whole? It must never be - a player should never be
 * better off destroying a good car for scrap parts, which is the whole
 * reason `usedPartSaleFraction`/`scrapValueFraction` are haircuts, not
 * parity prices.
 */
export function computeDonorBalanceProbe(
  model: CarModel,
  context: SimContext,
): ModelDonorBalanceProbeRow {
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
    partedYieldYen += usedPartSaleValueYen(part.priceYen, 'mint', context.economy)
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
    partedYieldOfWorstCaseYen += usedPartSaleValueYen(
      part.priceYen,
      installed.band,
      context.economy,
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

export function computeRosterDonorBalanceProbe(
  models: readonly CarModel[],
  context: SimContext,
): ModelDonorBalanceProbeRow[] {
  return models.map((model) => computeDonorBalanceProbe(model, context))
}

/** One cause's edge: `marketValueYen` if this cause turns out true, minus
 * what the room's sheet actually charges - positive means this cause is a
 * pleasant surprise (the car is worth more than paid), negative means it
 * costs more than it turned out to be worth. */
export interface SymptomCauseEdgeRow {
  causeId: string
  edgeYen: number
}

export interface SymptomBalanceProbeRow {
  symptomId: string
  fitmentClass: PartFitmentClass
  apparentValueYen: number
  expectedTrueValueYen: number
  sheetGuideValueYen: number
  /** `expectedTrueValueYen - sheetGuideValueYen` - the average edge of
   * buying this symptomatic lot blind, with no test run at all. Zero by
   * construction (the sheet IS the all-cause expectation); a nonzero value
   * means the two estimators have drifted apart. */
  blindBuyEvYen: number
  edgePerCauseYen: SymptomCauseEdgeRow[]
}

const SYMPTOM_PROBE_FITMENT_CLASSES: readonly PartFitmentClass[] = [
  'entry',
  'everyday',
  'enthusiast',
  'flagship',
]

/**
 * The diagnosis system's blind-buy guardrail - for every symptom, on a
 * representative clean car per tier (`buildCleanProbeCar`, shared with
 * `computeDonorBalanceProbe` above - a symptom is a surprise on an
 * otherwise-healthy car, not a worst-case wreck), how good a bet is buying
 * without running a single test?
 *
 * The sheet IS the all-cause expectation (the room prices the odds, with no
 * premium on top), so `blindBuyEvYen = expectedTrueValueYen -
 * sheetGuideValueYen` is 0 by construction: buying blind is a fair-odds bet,
 * never -EV and never a windfall. Both figures are still measured through
 * the real estimator calls so any drift between the two entry points fails
 * the probe instead of passing silently. `edgePerCauseYen` must show at
 * least one cause on each side of zero for every symptom - some causes worse
 * than the sheet price, some better - or the symptom's own weight spread
 * isn't creating real uncertainty. Not bot-derived: every number is a direct
 * call into the real sim functions (`diagnosis.ts`), the same "closed-form,
 * cheap enough for every balance run" standing as `computeRosterBalanceProbe`
 * above.
 */
export function computeSymptomBalanceProbe(context: SimContext): SymptomBalanceProbeRow[] {
  const neutralState = createInitialGameState(context, 0)
  const rows: SymptomBalanceProbeRow[] = []

  for (const symptom of context.symptoms) {
    for (const fitmentClass of SYMPTOM_PROBE_FITMENT_CLASSES) {
      const model = context.models.find((m) => fitmentClassForTier(m.tier) === fitmentClass)
      if (!model) continue

      const clean = buildCleanProbeCar(model, context, `symptom-${symptom.id}`, 'symptom probe')
      // Every cause in a real symptom addresses the same part - any
      // cause's own `carPartId` names the slot to record.
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
 * The hire coherence probe, closed-form, one row per reputation tier. Every
 * figure is a direct call into the real wage formula (`deriveStaffWageYen`),
 * the contract coefficients, the introduction-fee rule, and the live
 * content rates, so it can never drift from what the game does.
 *
 * A contract-assigned member MUST net a profit (that is the point of the
 * assignment), but a modest one, and the same hands billed out must always
 * beat the retainer. The bounds, measured here and asserted (exhaustively
 * across each tier's whole budget cube) in `staffProbes.test.ts`:
 *
 * - Bound A (net profit), every candidate every tier: `weeklyContract` in
 *   `[1.05, 1.40] x weeklyWage`. Each row carries the tier's two binding
 *   candidates - the lowest ratio (nearest 1.05) and the highest (nearest
 *   1.40); the probe finds them by walking the cube, so it stays correct if
 *   the coefficients move.
 * - Bound B (honest work beats the retainer), every candidate:
 *   `weeklyContract <= HIRE_BOUND_B_BILLABLE_FRACTION x (laborSlotsPerDay x
 *   7 x serviceJobs.laborRateYen)`. The row carries the tier's tightest
 *   candidate (the largest contract at the fewest slots).
 * - Bound C (first hire reachable), hard-gated only at the entry tier
 *   (`boundCGated`), disclosed elsewhere: the tier's cheapest candidate's
 *   introduction fee stays within `HIRE_BOUND_C_STARTING_CASH_FRACTION` of
 *   `STARTING_CASH_YEN`.
 * - Bound D (skills worth paying for), hard-gated only at the entry tier
 *   (`boundDGated`), disclosed elsewhere: the wage premium of a max-skill
 *   candidate over a min-skill one (identical slots) stays within
 *   `HIRE_BOUND_D_SAVEABLE_MULTIPLE x` the weekly value of the labour that
 *   candidate's speed discount can save at full utilisation. Idle skills
 *   save nothing, and bound A already stops contract income from carrying
 *   the premium - so a skilled hire is only ever worth it for a shop that
 *   works.
 */
export const HIRE_BOUND_A_MIN_RATIO = 1.05
export const HIRE_BOUND_A_MAX_RATIO = 1.4
export const HIRE_BOUND_B_BILLABLE_FRACTION = 0.5
export const HIRE_BOUND_C_STARTING_CASH_FRACTION = 0.15
/**
 * Bound D: the wage premium a shop pays for a max-skill candidate over a
 * min-skill one (identical slots) must not exceed this multiple of the
 * weekly value of the labour that candidate's speed discount can save at
 * full utilisation. Skills must be worth paying for when the shop is busy;
 * the discount they buy is worth far more than the premium.
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

export interface HireBalanceProbeRow {
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

export function computeHireBalanceProbe(context: SimContext): HireBalanceProbeRow[] {
  const economy = context.economy
  const { statBudgetByTier } = economy.staff
  const entryTier = ReputationTierSchema.options[0]!
  const capC = Math.round(HIRE_BOUND_C_STARTING_CASH_FRACTION * economy.STARTING_CASH_YEN)
  const rows: HireBalanceProbeRow[] = []

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

    // Bound D: the wage premium of the all-max-skill candidate over the
    // all-min-skill one at IDENTICAL slots (the slot premium cancels, so 1
    // slot stands for both), against the weekly value of the labour the
    // tier's best hands can save at full utilisation.
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
