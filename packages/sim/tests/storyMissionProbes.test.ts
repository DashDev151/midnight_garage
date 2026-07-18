import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  STORY_MISSIONS,
  TOOL_LINES,
  fitmentClassForTier,
  type CarInstance,
  type CarPartId,
  type ConditionBand,
  type Grade,
  type Part,
  type PartFitmentClass,
  type RequirementSpec,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { carCostToBandYen, hasForcedInduction } from '../src/bands'
import { buildSimContext } from '../src/context'
import { computeDerivedStats } from '../src/derivedStats'
import { lapTimeSecondsFor } from '../src/lapModel'
import { marketValueYen } from '../src/marketValue'
import { gradeMissionCar } from '../src/missions'
import { createInitialGameState } from '../src/newGame'
import { machineAssistFeeYen, naToTurboConversionBlocked } from '../src/jobs'
import { valuateCarForBuyer } from '../src/valuation'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

function mission(id: string) {
  const found = STORY_MISSIONS.find((m) => m.id === id)
  if (!found) throw new Error(`fixture mission "${id}" missing from seed content`)
  return found
}

/**
 * Sprint 78 decision 1 (the threshold formula rule): every numeric target is
 * derived from its mission's own probe build through these fixed formulas -
 * restated here, independently of any authoring step, so a test that
 * recomputes them from a FRESH measurement and compares against the
 * authored content can never silently drift from the rule that produced it.
 */
const floor90 = (measured: number): number => Math.floor(0.9 * measured)
const round2At97Percent = (measuredRatio: number): number =>
  Math.round(0.97 * measuredRatio * 100) / 100
const ceil1AtTwoPercentSlower = (measuredSeconds: number): number =>
  Math.ceil(measuredSeconds * 1.02 * 10) / 10
const ceil1000 = (yen: number): number => Math.ceil(yen / 1000) * 1000
const budgetCapYenFor = (probeCostYen: number): number => ceil1000(1.1 * probeCostYen)
const payoutYenFor = (probeCostYen: number): number => ceil1000(1.3 * probeCostYen)

/** Every real part slot at `band`, using the model's OWN fitment class (not
 * the generic 'common'-only test fixtures) - repair cost and market value
 * both scale with a part's real per-class catalog price, so a rare-tier
 * probe needs rare-class stock parts to price honestly. */
function stockCarPartsAt(
  fitmentClass: PartFitmentClass,
  band: ConditionBand,
): CarInstance['parts'] {
  const result = {} as CarInstance['parts']
  for (const partId of ALL_CAR_PART_IDS) {
    const stockPart = CONTEXT.stockPartByCarPartId[fitmentClass][partId]
    result[partId] = {
      installed: {
        id: `probe-stock-${partId}`,
        partId: stockPart.id,
        band,
        genuinePeriod: false,
        origin: { kind: 'market', day: 1 },
      },
    }
  }
  return result
}

function aftermarketPart(carPartId: CarPartId, grade: Grade, fitmentClass: PartFitmentClass): Part {
  const part = PARTS.find(
    (p) => p.carPartId === carPartId && p.grade === grade && p.fitmentClass === fitmentClass,
  )
  if (!part)
    throw new Error(`no catalog "${grade}" "${carPartId}" part for fitment class "${fitmentClass}"`)
  return part
}

interface AftermarketFit {
  carPartId: CarPartId
  part: Part
}

/**
 * Sprint 76 decision 5 / Sprint 78 decision 1: one probe recipe - a "before"
 * car (uniform `worn`, all stock, the model's own fitment class) and an
 * "after" car (uniform `endBand`, with `aftermarket` slots carrying a real
 * catalog part at that grade instead of a repaired stock one). Probe cost
 * `C` = the before car's `marketValueYen` (the purchase proxy) + every
 * aftermarket part's own catalog price + the repair-atom cost of every
 * OTHER slot from `worn` to `endBand` (`carCostToBandYen` - a slot getting a
 * brand new part is never ALSO charged to repair the part it's replacing).
 */
function buildProbe(modelId: string, endBand: ConditionBand, aftermarket: AftermarketFit[] = []) {
  const model = CARS.find((c) => c.id === modelId)!
  const fitmentClass = fitmentClassForTier(model.tier)
  const startCar: CarInstance = {
    id: `probe-start-${modelId}`,
    modelId,
    year: 1990,
    mileageKm: 120_000,
    color: 'White',
    provenanceNote: '',
    authenticityPercent: 80,
    symptoms: [],
    apparentBandByPartId: null,
    parts: stockCarPartsAt(fitmentClass, 'worn'),
  }
  const purchaseYen = marketValueYen(
    model,
    startCar,
    100,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    CONTEXT.economy,
  )

  const repairBasisParts = { ...startCar.parts }
  let partsYen = 0
  for (const { carPartId, part } of aftermarket) {
    partsYen += part.priceYen
    repairBasisParts[carPartId] = {
      installed: { ...startCar.parts[carPartId].installed!, band: endBand },
    }
  }
  const repairYen = carCostToBandYen(
    { ...startCar, parts: repairBasisParts },
    model,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    CONTEXT.economy,
    endBand,
  )

  const afterParts = { ...stockCarPartsAt(fitmentClass, endBand) }
  for (const { carPartId, part } of aftermarket) {
    afterParts[carPartId] = {
      installed: {
        id: `probe-after-${carPartId}`,
        partId: part.id,
        band: endBand,
        genuinePeriod: false,
        origin: { kind: 'market', day: 1 },
      },
    }
  }
  const afterCar: CarInstance = { ...startCar, id: `probe-after-${modelId}`, parts: afterParts }

  return { model, afterCar, probeCostYen: purchaseYen + repairYen + partsYen }
}

function statThresholdMin(target: ReturnType<typeof mission>, stat: string): number {
  const requirement = target.requirements.find(
    (r): r is Extract<RequirementSpec, { kind: 'statThreshold' }> =>
      r.kind === 'statThreshold' && r.stat === stat,
  )
  if (!requirement)
    throw new Error(`mission "${target.id}" has no statThreshold(${stat}) requirement`)
  return requirement.min
}

function tasteMatchMultiplier(target: ReturnType<typeof mission>, buyerId: string): number {
  const requirement = target.requirements.find(
    (r): r is Extract<RequirementSpec, { kind: 'tasteMatch' }> =>
      r.kind === 'tasteMatch' && r.buyerId === buyerId,
  )
  if (!requirement)
    throw new Error(`mission "${target.id}" has no tasteMatch(${buyerId}) requirement`)
  return requirement.minMultiplier
}

function lapTimeCeilingMaxSeconds(target: ReturnType<typeof mission>): number {
  const requirement = target.requirements.find(
    (r): r is Extract<RequirementSpec, { kind: 'lapTimeCeiling' }> => r.kind === 'lapTimeCeiling',
  )
  if (!requirement) throw new Error(`mission "${target.id}" has no lapTimeCeiling requirement`)
  return requirement.maxSeconds
}

/** Asserts a probe car passes `gradeMissionCar` and that the mission's own
 * `budgetCapYen`/`payoutYen` are EXACTLY the formula's output against the
 * freshly-measured `probeCostYen` - not just "clears the floor" (Sprint 76's
 * looser check), locked exactly per decision 1's "content and probe can
 * never drift" instruction. */
function assertPassesAndBudgetLocked(
  missionId: string,
  afterCar: CarInstance,
  probeCostYen: number,
) {
  const state = { ...createInitialGameState(CONTEXT, 1), ownedCars: [afterCar] }
  const report = gradeMissionCar(state, missionId, afterCar.id, CONTEXT)
  expect(report.pass, JSON.stringify(report.lines)).toBe(true)

  const target = mission(missionId)
  expect(target.budgetCapYen, `${missionId} budgetCapYen`).toBe(budgetCapYenFor(probeCostYen))
  expect(target.payoutYen, `${missionId} payoutYen`).toBe(payoutYenFor(probeCostYen))
}

/**
 * Sprint 78 (story missions III, the campaign): one satisfiability probe per
 * authored mission, per decision 1's own instruction - each asserts BOTH
 * that the probe build actually passes `gradeMissionCar` AND that every
 * formula-derived content field (thresholds, budget, payout) exactly
 * reproduces the fixed formula against a freshly-measured probe build, so
 * content and probe can never quietly drift apart. Replaces Sprint 76's
 * `placeholder-a`/`placeholder-b` probes outright (directive 17 case (a):
 * the placeholders are deleted, an intentional content replacement, not a
 * regression).
 */
describe('story mission satisfiability probes (Sprint 78 decision 1)', () => {
  it('four-wheels: an honest NA wagon-r is roadworthy with its forcedInduction slot legitimately empty (no phantom turbo)', () => {
    const { model, afterCar, probeCostYen } = buildProbe('suzuki-wagon-r-ct21s', 'worn')
    // Sprint 90: the Wagon R is naturally aspirated, so the honest build leaves
    // its forcedInduction slot empty. Grade THAT car - the mask this sprint
    // removes pre-filled the slot so roadworthy would pass; roadworthy now
    // grades the legitimately-absent slot as sound, so no phantom turbo is
    // needed. The budget/payout pin still rides on the probe recipe's own cost
    // (`probeCostYen`, unchanged), which the authored content was derived from.
    expect(hasForcedInduction(model)).toBe(false)
    const honestCar: CarInstance = {
      ...afterCar,
      parts: { ...afterCar.parts, forcedInduction: { installed: null } },
    }
    assertPassesAndBudgetLocked('four-wheels', honestCar, probeCostYen)
  })

  it('wont-strand-her: a city repaired to fine, all stock, clears the reliability floor', () => {
    const { model, afterCar, probeCostYen } = buildProbe('honda-city-e-aa', 'fine')
    const stats = computeDerivedStats(
      model,
      afterCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.economy,
    )
    expect(mission('wont-strand-her').requirements).toEqual(
      expect.arrayContaining([
        { kind: 'statThreshold', stat: 'reliability', min: floor90(stats.reliability) },
      ]),
    )
    assertPassesAndBudgetLocked('wont-strand-her', afterCar, probeCostYen)
  })

  it('first-proper-car: a civic-eg6 repaired to fine, all stock, clears the reliability floor and the first-timer taste match', () => {
    const { model, afterCar, probeCostYen } = buildProbe('honda-civic-sir2-eg6', 'fine')
    const stats = computeDerivedStats(
      model,
      afterCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.economy,
    )
    const buyer = BUYERS.find((b) => b.id === 'first-timer')!
    const value = marketValueYen(
      model,
      afterCar,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const valuated = valuateCarForBuyer(
      buyer,
      model,
      afterCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.partsTaxonomyById,
      100,
      CONTEXT.economy,
    )
    const target = mission('first-proper-car')
    expect(statThresholdMin(target, 'reliability')).toBe(floor90(stats.reliability))
    expect(tasteMatchMultiplier(target, 'first-timer')).toBe(round2At97Percent(valuated / value))
    assertPassesAndBudgetLocked('first-proper-car', afterCar, probeCostYen)
  })

  it('make-it-pull: a civic-eg6 built to mint with sport intake/exhaust/ignitionEcu/camsTiming clears the power floor', () => {
    const fitmentClass = fitmentClassForTier(
      CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!.tier,
    )
    const aftermarket: AftermarketFit[] = (
      ['intake', 'exhaust', 'ignitionEcu', 'camsTiming'] as CarPartId[]
    ).map((carPartId) => ({ carPartId, part: aftermarketPart(carPartId, 'sport', fitmentClass) }))
    const { model, afterCar, probeCostYen } = buildProbe(
      'honda-civic-sir2-eg6',
      'mint',
      aftermarket,
    )
    const stats = computeDerivedStats(
      model,
      afterCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.economy,
    )
    expect(statThresholdMin(mission('make-it-pull'), 'power')).toBe(floor90(stats.power))
    assertPassesAndBudgetLocked('make-it-pull', afterCar, probeCostYen)
  })

  it('the-column-clock: an ae86 built to mint with street tyres and sport intake/exhaust clears the lap ceiling', () => {
    const fitmentClass = fitmentClassForTier(
      CARS.find((c) => c.id === 'toyota-sprinter-trueno-ae86')!.tier,
    )
    const aftermarket: AftermarketFit[] = [
      { carPartId: 'tyres', part: aftermarketPart('tyres', 'street', fitmentClass) },
      { carPartId: 'intake', part: aftermarketPart('intake', 'sport', fitmentClass) },
      { carPartId: 'exhaust', part: aftermarketPart('exhaust', 'sport', fitmentClass) },
    ]
    const { model, afterCar, probeCostYen } = buildProbe(
      'toyota-sprinter-trueno-ae86',
      'mint',
      aftermarket,
    )
    const timeSeconds = lapTimeSecondsFor(afterCar, model, CONTEXT)!
    expect(timeSeconds).not.toBeNull()
    expect(lapTimeCeilingMaxSeconds(mission('the-column-clock'))).toBe(
      ceil1AtTwoPercentSlower(timeSeconds),
    )
    assertPassesAndBudgetLocked('the-column-clock', afterCar, probeCostYen)
  })

  it('low-and-loud: a silvia-s14 built to mint with sport aero/rims and street seats clears the style floor and the stancer taste match', () => {
    const fitmentClass = fitmentClassForTier(
      CARS.find((c) => c.id === 'nissan-silvia-ks-s14')!.tier,
    )
    const aftermarket: AftermarketFit[] = [
      { carPartId: 'aero', part: aftermarketPart('aero', 'sport', fitmentClass) },
      { carPartId: 'rims', part: aftermarketPart('rims', 'sport', fitmentClass) },
      { carPartId: 'seats', part: aftermarketPart('seats', 'street', fitmentClass) },
    ]
    const { model, afterCar, probeCostYen } = buildProbe(
      'nissan-silvia-ks-s14',
      'mint',
      aftermarket,
    )
    const stats = computeDerivedStats(
      model,
      afterCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.economy,
    )
    const buyer = BUYERS.find((b) => b.id === 'stancer')!
    const value = marketValueYen(
      model,
      afterCar,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const valuated = valuateCarForBuyer(
      buyer,
      model,
      afterCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.partsTaxonomyById,
      100,
      CONTEXT.economy,
    )
    const target = mission('low-and-loud')
    expect(statThresholdMin(target, 'style')).toBe(floor90(stats.style))
    expect(tasteMatchMultiplier(target, 'stancer')).toBe(round2At97Percent(valuated / value))
    assertPassesAndBudgetLocked('low-and-loud', afterCar, probeCostYen)
  })

  /**
   * Task 3: the 180SX is factory-turbocharged (`tags` includes `'Turbo'`),
   * so `naToTurboConversionBlocked` (`jobs.ts`) must NOT fire for fitting
   * `forcedInduction@sport` here - that gate exists only for the FIRST
   * NA-to-turbo conversion, and `hasForcedInduction(model)` (`bands.ts`)
   * already reads true for this model, short-circuiting the gate to false
   * regardless of the shop's own tool tier.
   */
  it('street-power-street-manners: a 180sx built to mint with sport intake/exhaust/ignitionEcu/forcedInduction clears power, reliability, and the tuner taste match; the forced-induction fit is never gated as a fresh NA-to-turbo conversion', () => {
    const model = CARS.find((c) => c.id === 'nissan-180sx-rps13')!
    expect(model.tags).toContain('Turbo')

    const fitmentClass = fitmentClassForTier(model.tier)
    const aftermarket: AftermarketFit[] = (
      ['intake', 'exhaust', 'ignitionEcu', 'forcedInduction'] as CarPartId[]
    ).map((carPartId) => ({ carPartId, part: aftermarketPart(carPartId, 'sport', fitmentClass) }))
    const { afterCar, probeCostYen } = buildProbe('nissan-180sx-rps13', 'mint', aftermarket)

    const state = { ...createInitialGameState(CONTEXT, 1), ownedCars: [afterCar] }
    expect(naToTurboConversionBlocked('forcedInduction', model, state, CONTEXT)).toBe(false)

    const stats = computeDerivedStats(
      model,
      afterCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.economy,
    )
    const buyer = BUYERS.find((b) => b.id === 'tuner')!
    const value = marketValueYen(
      model,
      afterCar,
      100,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy,
    )
    const valuated = valuateCarForBuyer(
      buyer,
      model,
      afterCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.partsTaxonomyById,
      100,
      CONTEXT.economy,
    )
    const target = mission('street-power-street-manners')
    expect(statThresholdMin(target, 'power')).toBe(floor90(stats.power))
    expect(statThresholdMin(target, 'reliability')).toBe(floor90(stats.reliability))
    expect(tasteMatchMultiplier(target, 'tuner')).toBe(round2At97Percent(valuated / value))
    assertPassesAndBudgetLocked('street-power-street-manners', afterCar, probeCostYen)
  })

  it('under-one-fifteen: a rx7-fd3s built to mint with sport tyres/intake/exhaust/ignitionEcu clears the lap ceiling', () => {
    const fitmentClass = fitmentClassForTier(CARS.find((c) => c.id === 'mazda-rx7-fd3s')!.tier)
    const aftermarket: AftermarketFit[] = (
      ['tyres', 'intake', 'exhaust', 'ignitionEcu'] as CarPartId[]
    ).map((carPartId) => ({ carPartId, part: aftermarketPart(carPartId, 'sport', fitmentClass) }))
    const { model, afterCar, probeCostYen } = buildProbe('mazda-rx7-fd3s', 'mint', aftermarket)
    const timeSeconds = lapTimeSecondsFor(afterCar, model, CONTEXT)!
    expect(timeSeconds).not.toBeNull()
    expect(lapTimeCeilingMaxSeconds(mission('under-one-fifteen'))).toBe(
      ceil1AtTwoPercentSlower(timeSeconds),
    )
    assertPassesAndBudgetLocked('under-one-fifteen', afterCar, probeCostYen)
  })
})

/**
 * Sprint 85 decision 6 (machine-shop assist v1): the two coherence probes the
 * sprint doc calls for. Closed-form, no bot careers (directive 21) - pure
 * arithmetic against the shipped content.
 */
describe('machine-shop assist coherence (Sprint 85 decision 6)', () => {
  // A fresh shop: every tool line at tier 1, so every buried engine/drivetrain
  // slot is machine-gated and the assist fee applies.
  const TIER1_STATE = createInitialGameState(CONTEXT, 1)

  /**
   * Probe (a): each assist fee is positive (renting always beats being walled
   * out) and, over `probeAmortisationOps` operations, never dearer than buying
   * the tier-2 machine outright (owning beats renting once past that volume).
   * The engine fee sits EXACTLY at the boundary (15,000 x 40 = 600,000, the
   * engine crane's own price), so the bound is `<=`, not a strict `<`.
   */
  it('each assist fee is positive and amortises within its tier-2 machine price', () => {
    const { feeYenByGroup, probeAmortisationOps } = CONTEXT.economy.machineShopAssist
    for (const group of ['engine', 'drivetrain'] as const) {
      const fee = feeYenByGroup[group]
      const machinePriceYen = TOOL_LINES[group].tiers[1]!.upgradePriceYen // tier 2
      expect(fee, `${group} assist fee must be > 0`).toBeGreaterThan(0)
      expect(
        fee * probeAmortisationOps,
        `${group}: renting ${probeAmortisationOps}x must not exceed buying the machine (${machinePriceYen})`,
      ).toBeLessThanOrEqual(machinePriceYen)
    }
  })

  /**
   * Probe (b): make-it-pull is the only authored mission whose satisfiability
   * recipe fits an aftermarket part into a machine-gated (buried engine/
   * drivetrain) slot - the sport camsTiming. Building it means removing the
   * stock cams (gated) then installing the sport cams (gated): two engine-fee
   * operations. The mission must stay satisfiable within its authored budget
   * with those fees included, which the budget's 10% headroom absorbs.
   */
  it('make-it-pull stays within budget once the buried camsTiming assist fees are included', () => {
    const fitmentClass = fitmentClassForTier(
      CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!.tier,
    )
    const aftermarket: AftermarketFit[] = (
      ['intake', 'exhaust', 'ignitionEcu', 'camsTiming'] as CarPartId[]
    ).map((carPartId) => ({ carPartId, part: aftermarketPart(carPartId, 'sport', fitmentClass) }))
    const { probeCostYen } = buildProbe('honda-civic-sir2-eg6', 'mint', aftermarket)

    const camsFee = machineAssistFeeYen('camsTiming', TIER1_STATE, CONTEXT)
    expect(camsFee, 'camsTiming must be machine-gated at tier 1').toBeGreaterThan(0)
    const totalAssistYen = 2 * camsFee // remove the stock cams + install the sport cams
    expect(probeCostYen + totalAssistYen).toBeLessThanOrEqual(mission('make-it-pull').budgetCapYen)
  })

  /**
   * The other authored aftermarket slots are all bolt-on, surface, or not an
   * engine/drivetrain slot, so no machine-shop assist fee ever applies to their
   * builds - the "where a gated operation appears" qualifier in probe (b) is
   * genuinely make-it-pull alone among the shipped campaign.
   */
  it('no other authored aftermarket slot is machine-gated (fee is 0)', () => {
    const nonGated: CarPartId[] = [
      'intake',
      'exhaust',
      'ignitionEcu',
      'forcedInduction',
      'tyres',
      'aero',
      'rims',
      'seats',
    ]
    for (const carPartId of nonGated) {
      expect(
        machineAssistFeeYen(carPartId, TIER1_STATE, CONTEXT),
        `${carPartId} should not be machine-gated`,
      ).toBe(0)
    }
  })
})
