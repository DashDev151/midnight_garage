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
import { carCostToBandYen, hasForcedInduction, repairCeilingForLevel } from '../src/bands'
import { buildSimContext } from '../src/context'
import { resolveBuyPart } from '../src/parts'
import { computeDerivedStats } from '../src/derivedStats'
import { lapTimeSecondsFor } from '../src/lapModel'
import { marketValueYen } from '../src/marketValue'
import { gradeMissionCar } from '../src/missions'
import { createInitialGameState } from '../src/newGame'
import { machineAssistFeeYen, naToTurboConversionBlocked, signatureOpFeeYen } from '../src/jobs'
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
 *
 * Sprint 93 (the band ceiling): `carCostToBandYen` is the tier-INDEPENDENT
 * restoration bill (the market's mint-referenced value accounting), so the
 * probe cost is unchanged by the repair ceiling - a mint `endBand` slot is
 * always reachable at any tier by BUYING a mint part and fitting it (an install,
 * never repair-gated), which is precisely the price this bill already carries.
 * The tier-1 repair cap only changes the COST of the alternative genuine-period
 * repair route, never whether the required band can be produced - the
 * satisfiability of that is asserted directly in its own describe below.
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

/** Asserts a commercial probe car passes `gradeMissionCar` and holds the
 * Sprint 91 Amendment 2 one-price contract: the client pays a single price
 * (`budgetCapYen === payoutYen`), that price is still the unchanged 1.3x
 * formula reward (`payoutYen === payoutYenFor(probeCostYen)`), and a sensible
 * probe build fits inside it at a positive margin (`probeCostYen < payoutYen`).
 * The old 1.1x budget-cap pin is gone: budget no longer sits below payout, it
 * IS the payout. */
function assertPassesAndPriceLocked(
  missionId: string,
  afterCar: CarInstance,
  probeCostYen: number,
) {
  const state = { ...createInitialGameState(CONTEXT, 1), ownedCars: [afterCar] }
  const report = gradeMissionCar(state, missionId, afterCar.id, CONTEXT)
  expect(report.pass, JSON.stringify(report.lines)).toBe(true)

  const target = mission(missionId)
  expect(target.budgetCapYen, `${missionId} one-price: budgetCapYen === payoutYen`).toBe(
    target.payoutYen,
  )
  expect(target.payoutYen, `${missionId} payoutYen (unchanged 1.3x reward)`).toBe(
    payoutYenFor(probeCostYen),
  )
  expect(
    probeCostYen,
    `${missionId} probe build must leave a positive margin under the price`,
  ).toBeLessThan(target.payoutYen)
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
  // Sprint 91 Amendment 2 (the one-price model, directive 17 case (a)): every
  // build job carries ONE contract price, not a spend cap below a separate
  // reward. The dual budgetCapYenFor (1.1x) / payoutYenFor (1.3x) pin - which
  // asserted budget < payout - is intentionally replaced by budget === payout.
  it('every story mission is one-price: budgetCapYen === payoutYen', () => {
    for (const target of STORY_MISSIONS) {
      expect(target.budgetCapYen, `${target.id} budgetCapYen === payoutYen`).toBe(target.payoutYen)
    }
  })

  it('four-wheels (off-formula, Sprint 91): an honest NA wagon-r is roadworthy, and the hand-tuned intro economics sit deliberately below the generic 1.1x/1.3x formula', () => {
    const { model, afterCar, probeCostYen } = buildProbe('suzuki-wagon-r-ct21s', 'worn')
    // Sprint 90: the Wagon R is naturally aspirated, so the honest build leaves
    // its forcedInduction slot empty (no phantom turbo). Grade THAT car -
    // roadworthy grades the legitimately-absent slot as sound.
    expect(hasForcedInduction(model)).toBe(false)
    const honestCar: CarInstance = {
      ...afterCar,
      parts: { ...afterCar.parts, forcedInduction: { installed: null } },
    }
    const state = { ...createInitialGameState(CONTEXT, 1), ownedCars: [honestCar] }
    const report = gradeMissionCar(state, 'four-wheels', honestCar.id, CONTEXT)
    expect(report.pass, JSON.stringify(report.lines)).toBe(true)

    // Sprint 91 (directive 17 case (a)): four-wheels comes OFF the generic
    // 1.1x/1.3x formula pin - the intro mission is redefined from a fat-margin
    // flip into a near-break-even teacher, so it deliberately does NOT call
    // assertPassesAndBudgetLocked. The direction is the guard: both its cap and
    // its payout now sit strictly BELOW what the generic formula would author,
    // so a bump back toward the old fat formula payout fails here.
    const target = mission('four-wheels')
    expect(target.budgetCapYen).toBeLessThan(budgetCapYenFor(probeCostYen))
    expect(target.payoutYen).toBeLessThan(payoutYenFor(probeCostYen))

    // The near-break-even PROFIT/SLACK guard (profit in (0, 15000], one-mistake
    // slack >= 10000) lives in tutorialProbe.test.ts, which measures the REAL
    // taught build: bought at the fear-discounted auction reserve for ~140,489
    // total spend. This generic probe's cost proxy is instead the worn car's
    // full marketValueYen (~160,264), which overstates the discounted-reserve
    // price a player actually pays and so cannot express the intro mission's
    // break-even economics - only the off-formula direction asserted above.
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
    assertPassesAndPriceLocked('wont-strand-her', afterCar, probeCostYen)
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
    assertPassesAndPriceLocked('first-proper-car', afterCar, probeCostYen)
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
    assertPassesAndPriceLocked('make-it-pull', afterCar, probeCostYen)
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
    assertPassesAndPriceLocked('the-column-clock', afterCar, probeCostYen)
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
    assertPassesAndPriceLocked('low-and-loud', afterCar, probeCostYen)
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
    assertPassesAndPriceLocked('street-power-street-manners', afterCar, probeCostYen)
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
    assertPassesAndPriceLocked('under-one-fifteen', afterCar, probeCostYen)
  })
})

/**
 * Sprint 93 (the band ceiling): the tool-satisfiability the missions previously
 * lacked entirely. The five mint-band missions build their car to mint; under
 * the repair ceiling a fresh (tier-1) shop cannot REPAIR a part above fine, yet
 * mint stays reachable at any tier by BUYING a mint replacement part and FITTING
 * it (an install, never gated by the repair ceiling). So no mission is ever
 * tool-locked: the cap changes the COST of the genuine-period repair route, not
 * whether the required band can be produced. Owning a group's tier-2 machine is
 * what lets a shop reach mint by cheaper repair instead of buying.
 */
describe('the mint-band missions stay satisfiable at any tier (Sprint 93 band ceiling)', () => {
  const MINT_MISSIONS = [
    'make-it-pull',
    'the-column-clock',
    'low-and-loud',
    'street-power-street-manners',
    'under-one-fifteen',
  ]

  it('every mint-band mission is authored and builds its car to mint (proven passing by the probes above)', () => {
    for (const id of MINT_MISSIONS) expect(mission(id)).toBeDefined()
  })

  it('a fresh tier-1 shop caps a REPAIR at fine, yet still reaches mint by buying and fitting a part - the cap changes cost, not possibility', () => {
    const tier1 = createInitialGameState(CONTEXT, 1)
    // A fresh shop lives under the tier-1 repair ceiling: repair alone stops at
    // fine on every tool line.
    for (const tier of Object.values(tier1.toolTiers)) {
      expect(repairCeilingForLevel(tier, CONTEXT.economy)).toBe('fine')
    }
    // The always-available mint route, unchanged by the cap: resolveBuyPart yields
    // a mint instance at any tier, and fitting it is an install (no band gate).
    const stockPart = PARTS.find((p) => p.grade === 'stock')!
    const bought = resolveBuyPart(tier1, stockPart.id, CONTEXT)
    expect(bought.state.partInventory.at(-1)?.band).toBe('mint')
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
   *
   * Sprint 92 (uniform tool access): the loop now covers all six groups (it
   * previously skipped suspension, wheels, body and interior), so the
   * amortisation invariant is pinned for every rent-or-own group at once.
   */
  it('each assist fee is positive and amortises within its tier-2 machine price', () => {
    const { feeYenByGroup, probeAmortisationOps } = CONTEXT.economy.machineShopAssist
    for (const group of [
      'engine',
      'drivetrain',
      'suspension',
      'wheels',
      'body',
      'interior',
    ] as const) {
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
   * with those fees included, which the one-price budget (== payout, the 1.3x
   * probe-cost margin) absorbs.
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

  /**
   * Sprint 92 (uniform tool access, Axis 1): the three groups that gained a
   * signature-op gate this sprint. `signatureOpFeeYen` charges the group's fee
   * on a signature slot at tier 1 and 0 once the tier-2 machine is owned, and
   * never fires for a non-signature (light bolt-on) slot in the same group - the
   * no-over-gating check. It is also 0 for the engine/drivetrain/wheels slots,
   * which keep their own separate gates (`machineAssistFeeYen`/`benchSwapFeeYen`),
   * proving the new predicate never leaks into - or double-charges - the three
   * pre-existing gates, which stay byte-identical.
   */
  it('the three new signature-op gates charge at tier 1, are free at tier 2, and never over-gate light or pre-existing-gate work', () => {
    const { feeYenByGroup, signatureSlotsByGroup } = CONTEXT.economy.machineShopAssist
    const groups = ['suspension', 'body', 'interior'] as const
    for (const group of groups) {
      const tier2State = {
        ...TIER1_STATE,
        toolTiers: { ...TIER1_STATE.toolTiers, [group]: 2 },
      }
      const slots = signatureSlotsByGroup[group]!
      expect(slots.length, `${group} must name signature slots`).toBeGreaterThan(0)
      for (const slot of slots) {
        expect(signatureOpFeeYen(slot, TIER1_STATE, CONTEXT), `${slot} gated at tier 1`).toBe(
          feeYenByGroup[group],
        )
        expect(signatureOpFeeYen(slot, tier2State, CONTEXT), `${slot} free once owned`).toBe(0)
      }
    }
    // Light bolt-on work in these groups is not a signature slot - no fee (no
    // over-gating). anti-roll bars and steering (suspension), aero (body).
    for (const light of ['antiRollBars', 'steering', 'aero'] as CarPartId[]) {
      expect(
        signatureOpFeeYen(light, TIER1_STATE, CONTEXT),
        `${light} is light bolt-on work, never a signature op`,
      ).toBe(0)
    }
    // The three pre-existing gates keep their own predicates - the new signature
    // gate never fires for an engine/drivetrain buried slot or a tyre.
    for (const existing of ['camsTiming', 'gearbox', 'tyres'] as CarPartId[]) {
      expect(
        signatureOpFeeYen(existing, TIER1_STATE, CONTEXT),
        `${existing} keeps its own gate, not the new signature predicate`,
      ).toBe(0)
    }
  })
})
