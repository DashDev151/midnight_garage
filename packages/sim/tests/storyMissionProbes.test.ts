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
import { isAuctionTierUnlocked } from '../src/catalogs'
import { buildSimContext } from '../src/context'
import { resolveBuyPart } from '../src/parts'
import { computeDerivedStats } from '../src/derivedStats'
import { lapTimeSecondsFor } from '../src/lapModel'
import { marketValueYen } from '../src/marketValue'
import { gradeMissionCar, resolveDeliverMission } from '../src/missions'
import { createInitialGameState } from '../src/newGame'
import { accessRoute, naToTurboConversionBlocked, signatureOpFeeYen } from '../src/jobs'
import { valuateCarForBuyer } from '../src/valuation'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

function mission(id: string) {
  const found = STORY_MISSIONS.find((m) => m.id === id)
  if (!found) throw new Error(`fixture mission "${id}" missing from seed content`)
  return found
}

/**
 * The threshold formula rule: every numeric target is derived from its
 * mission's own probe build through these fixed formulas - restated here,
 * independently of any authoring step, so a test that recomputes them from
 * a FRESH measurement and compares against the authored content can never
 * silently drift from the rule that produced it.
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
        origin: { kind: 'market', day: 1 },
      },
    }
  }
  return result
}

/** The slot's OWN native aftermarket SKU, never a migrated one sharing the
 * same (carPartId, grade, fitmentClass) address - `aero` now also carries
 * the six migrated panel/underbody kits (`priceBasisPartId` set, since they
 * price from their own original basis), so a plain match is ambiguous
 * there; every probe in this file means the slot's own family. */
function aftermarketPart(carPartId: CarPartId, grade: Grade, fitmentClass: PartFitmentClass): Part {
  const part = PARTS.find(
    (p) =>
      p.carPartId === carPartId &&
      p.grade === grade &&
      p.fitmentClass === fitmentClass &&
      p.priceBasisPartId === undefined,
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
 * One probe recipe - a "before" car (uniform `worn`, all stock, the
 * model's own fitment class) and an "after" car (uniform `endBand`, with
 * `aftermarket` slots carrying a real catalog part at that grade instead
 * of a repaired stock one). Probe cost `C` = the before car's
 * `marketValueYen` (the purchase proxy) + every aftermarket part's own
 * catalog price + the repair-atom cost of every OTHER slot from `worn` to
 * `endBand` (`carCostToBandYen` - a slot getting a brand new part is never
 * ALSO charged to repair the part it's replacing).
 *
 * `carCostToBandYen` is the tier-INDEPENDENT restoration bill, so the probe
 * cost is unchanged by the repair ceiling - a mint `endBand` slot is always
 * reachable at any tier by BUYING a mint part and fitting it (an install,
 * never repair-gated), which is precisely the price this bill already
 * carries. The tier-1 repair cap only changes the COST of the alternative
 * genuine-period repair route, never whether the required band can be
 * produced - the satisfiability of that is asserted directly in its own
 * describe below.
 */
function buildProbe(modelId: string, endBand: ConditionBand, aftermarket: AftermarketFit[] = []) {
  const model = CARS.find((c) => c.id === modelId)!
  const fitmentClass = fitmentClassForTier(model.tier)
  const startCar: CarInstance = {
    id: `probe-start-${modelId}`,
    modelId,
    year: 1990,
    mileageKm: 120_000,
    factoryColour: model.spec.factoryColours[0]!,
    provenanceNote: '',
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
 * one-price contract: the client pays a single price (`budgetCapYen ===
 * payoutYen`), that price is still the unchanged 1.3x formula reward
 * (`payoutYen === payoutYenFor(probeCostYen)`), and a sensible probe build
 * fits inside it at a positive margin (`probeCostYen < payoutYen`). */
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
 * One satisfiability probe per authored mission - each asserts BOTH that
 * the probe build actually passes `gradeMissionCar` AND that every
 * formula-derived content field (thresholds, budget, payout) exactly
 * reproduces the fixed formula against a freshly-measured probe build, so
 * content and probe can never quietly drift apart.
 */
describe('story mission satisfiability probes (Sprint 78 decision 1)', () => {
  // Every build job carries ONE contract price, not a spend cap below a
  // separate reward.
  it('every story mission is one-price: budgetCapYen === payoutYen', () => {
    for (const target of STORY_MISSIONS) {
      expect(target.budgetCapYen, `${target.id} budgetCapYen === payoutYen`).toBe(target.payoutYen)
    }
  })

  it('four-wheels (off-formula, Sprint 91): an honest NA wagon-r is roadworthy, and the hand-tuned intro economics sit deliberately below the generic 1.1x/1.3x formula', () => {
    const { model, afterCar, probeCostYen } = buildProbe('suzuki-wagon-r-ct21s', 'worn')
    // The Wagon R is naturally aspirated, so the honest build leaves its
    // forcedInduction slot empty (no phantom turbo). Grade THAT car -
    // roadworthy grades the legitimately-absent slot as sound.
    expect(hasForcedInduction(model)).toBe(false)
    const honestCar: CarInstance = {
      ...afterCar,
      parts: { ...afterCar.parts, forcedInduction: { installed: null } },
    }
    const state = { ...createInitialGameState(CONTEXT, 1), ownedCars: [honestCar] }
    const report = gradeMissionCar(state, 'four-wheels', honestCar.id, CONTEXT)
    expect(report.pass, JSON.stringify(report.lines)).toBe(true)

    // four-wheels is deliberately OFF the generic 1.1x/1.3x formula pin -
    // the intro mission is a near-break-even teacher, not a fat-margin
    // flip, so it does NOT call assertPassesAndPriceLocked. The direction
    // is the guard: both its cap and its payout sit strictly BELOW what the
    // generic formula would author.
    const target = mission('four-wheels')
    expect(target.budgetCapYen).toBeLessThan(budgetCapYenFor(probeCostYen))
    expect(target.payoutYen).toBeLessThan(payoutYenFor(probeCostYen))

    // The near-break-even PROFIT guard (profit in (0, 15000], and one mistake
    // still inside her money) lives in tutorialProbe.test.ts, which measures
    // the REAL taught build: bought at the fear-discounted auction reserve for
    // ~133,724 total spend. This generic probe's cost proxy is instead the
    // worn car's full marketValueYen (~154,175), which overstates the
    // discounted-reserve price a player actually pays and so cannot express
    // the intro mission's break-even economics - only the off-formula
    // direction asserted above.
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

  it('first-proper-car: a civic-eg6 repaired to fine, all stock, clears the reliability floor and the daily-drivers taste match', () => {
    const { model, afterCar, probeCostYen } = buildProbe('honda-civic-sir2-eg6', 'fine')
    const stats = computeDerivedStats(
      model,
      afterCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.economy,
    )
    const buyer = BUYERS.find((b) => b.id === 'daily-drivers')!
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
    expect(tasteMatchMultiplier(target, 'daily-drivers')).toBe(round2At97Percent(valuated / value))
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
    const timeSeconds = lapTimeSecondsFor(afterCar, model, CONTEXT, 'hakone')!
    expect(timeSeconds).not.toBeNull()
    expect(lapTimeCeilingMaxSeconds(mission('the-column-clock'))).toBe(
      ceil1AtTwoPercentSlower(timeSeconds),
    )
    assertPassesAndPriceLocked('the-column-clock', afterCar, probeCostYen)
  })

  it('low-and-loud: a silvia-s14 built to mint with sport aero/rims and street seats clears the style floor and the show-crowd taste match', () => {
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
    const buyer = BUYERS.find((b) => b.id === 'show-crowd')!
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
    expect(tasteMatchMultiplier(target, 'show-crowd')).toBe(round2At97Percent(valuated / value))
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
  it('street-power-street-manners: a 180sx built to mint with sport power AND sport support throughout clears power, reliability, and the tuner taste match; the forced-induction fit is never gated as a fresh NA-to-turbo conversion', () => {
    const model = CARS.find((c) => c.id === 'nissan-180sx-rps13')!
    expect(model.tags).toContain('Turbo')

    const fitmentClass = fitmentClassForTier(model.tier)
    // The power shape (intake/exhaust/ignitionEcu/forcedInduction) alone reads a
    // dangerous 0.678 headline, torque-transmission bound - a real car that makes
    // more power than its drivetrain, fuelling, cooling and bottom end can take.
    // The mission is named for building power WITH manners, so the probe also
    // supports every relevant slot at the SAME sport grade as the power parts,
    // reaching an adequate 0.966 headline (cylinder-pressure bound).
    const aftermarket: AftermarketFit[] = (
      [
        'intake',
        'exhaust',
        'ignitionEcu',
        'forcedInduction',
        'internals',
        'block',
        'fuelSystem',
        'cooling',
        'clutch',
        'gearbox',
        'driveline',
        'differential',
      ] as CarPartId[]
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
    // The power floor is a hand-set PROVISIONAL lever, not a `floor90(measured)`
    // pin like the rest of this file: it was scaled off the reference car's own
    // measured power so the mission keeps the difficulty it was designed at, and
    // it wants retuning once the aftermarket path decides what a build is worth.
    // So it is asserted the way the guarantor floors below are - pinned against
    // drift, and proven to be clearable by the probe build with room to spare.
    expect(statThresholdMin(target, 'power')).toBe(180)
    expect(stats.power).toBeGreaterThan(statThresholdMin(target, 'power'))
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
    const timeSeconds = lapTimeSecondsFor(afterCar, model, CONTEXT, 'hakone')!
    expect(timeSeconds).not.toBeNull()
    expect(lapTimeCeilingMaxSeconds(mission('under-one-fifteen'))).toBe(
      ceil1AtTwoPercentSlower(timeSeconds),
    )
    assertPassesAndPriceLocked('under-one-fifteen', afterCar, probeCostYen)
  })
})

/**
 * The two guarantor missions (auction-tier unlock rewards). Their stat
 * floors (reliability >= 58, style >= 50) and band floor ('fine') are
 * hand-authored levers, not `floor90(measured)` pins like the missions
 * above - so these probes assert the floor clears with margin rather than
 * reproducing it exactly. `payoutYen`/`budgetCapYen` stay on the SAME
 * formula-derived, one-price contract as every other mission: each probe
 * recomputes `payoutYenFor(probeCostYen)` fresh and pins it against the
 * authored content, so the two numbers can never quietly drift apart.
 * Neither probe uses `buildProbe` - both mix bands/aftermarket in a shape
 * that helper doesn't support (a uniform target band across the whole car).
 */
describe('guarantor mission probes (auction-tier unlock rewards)', () => {
  it('the-fleet-spare: a crx-sir-ef8 with every reliability-weighted part at fine (cosmetics left worn) clears reliability >= 58; formula-derived payout 237,000 yen', () => {
    const modelId = 'honda-crx-sir-ef8'
    const model = CARS.find((c) => c.id === modelId)!
    const fitmentClass = fitmentClassForTier(model.tier)
    const startCar: CarInstance = {
      id: 'probe-fleet-spare-start',
      modelId,
      year: 1990,
      mileageKm: 120_000,
      factoryColour: model.spec.factoryColours[0]!,
      provenanceNote: '',
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

    // Fleet duty cares about mechanicals, not trim - every reliability-fed
    // slot goes to fine; the four purely cosmetic slots stay worn (0 repair
    // cost there, and nothing grades them).
    const WORN_COSMETIC: CarPartId[] = ['paint', 'aero', 'seats', 'dashGauges']
    const afterParts = { ...stockCarPartsAt(fitmentClass, 'fine') }
    for (const partId of WORN_COSMETIC) {
      afterParts[partId] = { installed: { ...afterParts[partId].installed!, band: 'worn' } }
    }
    const afterCar: CarInstance = { ...startCar, id: 'probe-fleet-spare-after', parts: afterParts }

    let repairYen = 0
    for (const entry of PARTS_TAXONOMY) {
      if (WORN_COSMETIC.includes(entry.id)) continue
      repairYen += Math.round(0.1 * CONTEXT.stockPartByCarPartId[fitmentClass][entry.id].priceYen)
    }
    const probeCostYen = purchaseYen + repairYen

    const stats = computeDerivedStats(
      model,
      afterCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.economy,
    )
    expect(stats.reliability).toBeGreaterThanOrEqual(58)

    const state = { ...createInitialGameState(CONTEXT, 1), ownedCars: [afterCar] }
    const report = gradeMissionCar(state, 'the-fleet-spare', afterCar.id, CONTEXT)
    expect(report.pass, JSON.stringify(report.lines)).toBe(true)

    const target = mission('the-fleet-spare')
    expect(target.budgetCapYen, 'the-fleet-spare one-price: budgetCapYen === payoutYen').toBe(
      target.payoutYen,
    )
    expect(target.payoutYen, `the-fleet-spare payoutYen (formula-derived)`).toBe(
      payoutYenFor(probeCostYen),
    )
  })

  it('the-showroom-standard: a cefiro-a31 with every part fine-or-better, race aero/rims/seats, and 4 mechanicals minted clears style >= 50; formula-derived payout 926,000 yen', () => {
    const modelId = 'nissan-cefiro-a31'
    const model = CARS.find((c) => c.id === modelId)!
    const fitmentClass = fitmentClassForTier(model.tier)
    const startCar: CarInstance = {
      id: 'probe-showroom-start',
      modelId,
      year: 1990,
      mileageKm: 120_000,
      factoryColour: model.spec.factoryColours[0]!,
      provenanceNote: '',
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

    // The showroom body kit: `bodywork`/`paint` carry no aftermarket grades any
    // more (they are derived body value carriers - `bodyPipeline.ts`); the
    // showroom look now comes from the widened aero slot plus rims and seats,
    // at race grade to clear the style floor (sport alone falls short once
    // the body pair can no longer stack their own separate bonuses on top of
    // aero's). A further mechanical polish (4
    // engine-group parts to mint) is a forecourt-honest "we treated her right
    // underneath too", still fine-or-better either way.
    const AFTERMARKET_SWAP: CarPartId[] = ['aero', 'rims', 'seats']
    const MINT_UPGRADE: CarPartId[] = ['block', 'exhaust', 'fuelSystem', 'clutch']

    const afterParts = { ...stockCarPartsAt(fitmentClass, 'fine') }
    let partsYen = 0
    for (const carPartId of AFTERMARKET_SWAP) {
      const part = aftermarketPart(carPartId, 'race', fitmentClass)
      partsYen += part.priceYen
      afterParts[carPartId] = {
        installed: {
          id: `probe-showroom-after-${carPartId}`,
          partId: part.id,
          band: 'fine',
          origin: { kind: 'market', day: 1 },
        },
      }
    }
    for (const partId of MINT_UPGRADE) {
      afterParts[partId] = { installed: { ...afterParts[partId].installed!, band: 'mint' } }
    }
    const afterCar: CarInstance = { ...startCar, id: 'probe-showroom-after', parts: afterParts }

    let repairYen = 0
    for (const entry of PARTS_TAXONOMY) {
      if (AFTERMARKET_SWAP.includes(entry.id)) continue // aftermarket - priced via partsYen, not repaired
      const grades = MINT_UPGRADE.includes(entry.id) ? 2 : 1 // worn -> mint or worn -> fine
      repairYen += Math.round(
        grades * 0.1 * CONTEXT.stockPartByCarPartId[fitmentClass][entry.id].priceYen,
      )
    }
    const probeCostYen = purchaseYen + repairYen + partsYen

    const stats = computeDerivedStats(
      model,
      afterCar,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomy,
      CONTEXT.economy,
    )
    expect(stats.style).toBeGreaterThanOrEqual(50)

    const state = { ...createInitialGameState(CONTEXT, 1), ownedCars: [afterCar] }
    const report = gradeMissionCar(state, 'the-showroom-standard', afterCar.id, CONTEXT)
    expect(report.pass, JSON.stringify(report.lines)).toBe(true)

    const target = mission('the-showroom-standard')
    expect(target.budgetCapYen, 'the-showroom-standard one-price: budgetCapYen === payoutYen').toBe(
      target.payoutYen,
    )
    // The payout is formula-derived from the honest showroom recipe above
    // (race aero/rims/seats plus the four minted mechanicals): the two body
    // carriers hold no aftermarket grades, so the showroom look rides the
    // widened aero slot and cabin/wheel dress rather than stacking body-part
    // bonuses.
    expect(target.payoutYen, `the-showroom-standard payoutYen (formula-derived)`).toBe(
      payoutYenFor(probeCostYen),
    )
  })

  /**
   * Immediate stocking: delivering a guarantor mission unlocks its tier the
   * SAME day, with lots already on the board - the "come by Thursday needs
   * a stocked room" rule, reusing the fleet-spare probe car above to drive
   * a real delivery through `resolveDeliverMission`.
   */
  it('delivering the-fleet-spare unlocks regional THAT SAME DAY with lots already on the board', () => {
    const modelId = 'honda-crx-sir-ef8'
    const model = CARS.find((c) => c.id === modelId)!
    const fitmentClass = fitmentClassForTier(model.tier)
    const startCar: CarInstance = {
      id: 'probe-deliver-start',
      modelId,
      year: 1990,
      mileageKm: 120_000,
      factoryColour: model.spec.factoryColours[0]!,
      provenanceNote: '',
      symptoms: [],
      apparentBandByPartId: null,
      parts: stockCarPartsAt(fitmentClass, 'worn'),
    }
    const WORN_COSMETIC: CarPartId[] = ['paint', 'aero', 'seats', 'dashGauges']
    const afterParts = { ...stockCarPartsAt(fitmentClass, 'fine') }
    for (const partId of WORN_COSMETIC) {
      afterParts[partId] = { installed: { ...afterParts[partId].installed!, band: 'worn' } }
    }
    const deliverableCar: CarInstance = { ...startCar, id: 'probe-deliver-car', parts: afterParts }

    const base = createInitialGameState(CONTEXT, 1)
    const state = {
      ...base,
      ownedCars: [deliverableCar],
      storyMissions: [
        { missionId: 'the-fleet-spare', status: 'active' as const, acceptedOnDay: 1 },
      ],
    }
    expect(isAuctionTierUnlocked(state, CONTEXT, 'regional')).toBe(false)

    const result = resolveDeliverMission(state, 'the-fleet-spare', deliverableCar.id, CONTEXT)
    expect(
      result.log.some((entry) => entry.type === 'mission-delivered'),
      JSON.stringify(result.log),
    ).toBe(true)

    expect(isAuctionTierUnlocked(result.state, CONTEXT, 'regional')).toBe(true)
    const regionalLots = result.state.activeAuctionLots.filter((l) => l.tier === 'regional')
    expect(regionalLots.length).toBeGreaterThan(0)
    expect(regionalLots.every((l) => l.tier === 'regional' && l.expiresOnDay > state.day)).toBe(
      true,
    )
    // Stocked for TODAY, not tomorrow - the day the mission actually resolved.
    expect(regionalLots.every((l) => l.id.startsWith(`lot-${state.day}-regional-`))).toBe(true)
  })

  it('delivering the-showroom-standard unlocks premium THAT SAME DAY with lots already on the board', () => {
    const modelId = 'nissan-cefiro-a31'
    const model = CARS.find((c) => c.id === modelId)!
    const fitmentClass = fitmentClassForTier(model.tier)
    const startCar: CarInstance = {
      id: 'probe-deliver-showroom-start',
      modelId,
      year: 1990,
      mileageKm: 120_000,
      factoryColour: model.spec.factoryColours[0]!,
      provenanceNote: '',
      symptoms: [],
      apparentBandByPartId: null,
      parts: stockCarPartsAt(fitmentClass, 'worn'),
    }
    // `bodywork`/`paint` carry no aftermarket grades any more - see the
    // satisfiability probe above for the full reasoning; race grade
    // aero/rims/seats clears the style floor here too.
    const AFTERMARKET_SWAP: CarPartId[] = ['aero', 'rims', 'seats']
    const MINT_UPGRADE: CarPartId[] = ['block', 'exhaust', 'fuelSystem', 'clutch']
    const afterParts = { ...stockCarPartsAt(fitmentClass, 'fine') }
    for (const carPartId of AFTERMARKET_SWAP) {
      const part = aftermarketPart(carPartId, 'race', fitmentClass)
      afterParts[carPartId] = {
        installed: {
          id: `probe-deliver-showroom-${carPartId}`,
          partId: part.id,
          band: 'fine',
          origin: { kind: 'market', day: 1 },
        },
      }
    }
    for (const partId of MINT_UPGRADE) {
      afterParts[partId] = { installed: { ...afterParts[partId].installed!, band: 'mint' } }
    }
    const deliverableCar: CarInstance = {
      ...startCar,
      id: 'probe-deliver-showroom-car',
      parts: afterParts,
    }

    const base = createInitialGameState(CONTEXT, 1)
    const state = {
      ...base,
      ownedCars: [deliverableCar],
      storyMissions: [
        { missionId: 'the-showroom-standard', status: 'active' as const, acceptedOnDay: 1 },
      ],
    }
    expect(isAuctionTierUnlocked(state, CONTEXT, 'premium')).toBe(false)

    const result = resolveDeliverMission(state, 'the-showroom-standard', deliverableCar.id, CONTEXT)
    expect(
      result.log.some((entry) => entry.type === 'mission-delivered'),
      JSON.stringify(result.log),
    ).toBe(true)

    expect(isAuctionTierUnlocked(result.state, CONTEXT, 'premium')).toBe(true)
    const premiumLots = result.state.activeAuctionLots.filter((l) => l.tier === 'premium')
    expect(premiumLots.length).toBeGreaterThan(0)
    expect(premiumLots.every((l) => l.id.startsWith(`lot-${state.day}-premium-`))).toBe(true)
  })
})

/**
 * The tool-satisfiability the missions previously lacked entirely. The five
 * mint-band missions build their car to mint; under the repair ceiling a
 * fresh (tier-1) shop cannot REPAIR a part above fine, yet mint stays
 * reachable at any tier by BUYING a mint replacement part and FITTING it
 * (an install, never gated by the repair ceiling). So no mission is ever
 * tool-locked: the cap changes the COST of the genuine-period repair
 * route, not whether the required band can be produced. Owning a group's
 * tier-2 machine is what lets a shop reach mint by cheaper repair instead
 * of buying.
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
 * The coherence probes for the machine-shop assist model. Closed-form, no
 * bot careers (directive 21) - pure arithmetic against the shipped content.
 */
describe('machine-shop assist coherence (Sprint 85 decision 6)', () => {
  // A fresh shop: every tool line at tier 1 and nothing hired, so every buried
  // engine/drivetrain slot reads `slog` and a day hire is the way out of it.
  const TIER1_STATE = createInitialGameState(CONTEXT, 1)

  /**
   * Probe (a): the toolHire fee rule. Each group's fee is derived, not
   * authored freely: fee = tier-2 machine price / amortisationDays, so
   * exactly `amortisationDays` hires (forty) buy the kit outright. That
   * makes the amortisation bound an equality up to integer rounding rather
   * than a headroom check, and a positive fee still holds (renting always
   * beats being walled out). The loop covers all six groups, so the
   * derivation and amortisation invariants are pinned for every
   * rent-or-own group at once.
   */
  it('each toolHire fee is positive and derived from its tier-2 machine price over the amortisation window', () => {
    const { feeYenByGroup, amortisationDays } = CONTEXT.economy.toolHire
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
      expect(fee, `${group} tool hire fee must be > 0`).toBeGreaterThan(0)
      expect(
        fee * amortisationDays,
        `${group}: hiring ${amortisationDays}x must not exceed buying the machine (${machinePriceYen})`,
      ).toBeLessThanOrEqual(machinePriceYen)
      expect(
        fee,
        `${group}: fee must equal the tier-2 price divided by the amortisation window`,
      ).toBe(machinePriceYen / amortisationDays)
    }
  })

  /**
   * Probe (b): make-it-pull is the only authored mission whose satisfiability
   * recipe fits an aftermarket part into a buried slot - the sport camsTiming.
   * Building it means removing the stock cams then installing the sport ones,
   * both buried engine work, and a shop at tier 1 either slogs that at triple
   * labour or hires the engine line for the day. Access is bought by the DAY,
   * so both operations sit under one fee however many of them the build needs.
   * The mission must stay satisfiable within its authored budget with that
   * day's hire included, which the one-price budget (== payout, the 1.3x
   * probe-cost margin) absorbs.
   */
  it('make-it-pull stays within budget once the engine line is hired for the buried camsTiming work', () => {
    const fitmentClass = fitmentClassForTier(
      CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!.tier,
    )
    const aftermarket: AftermarketFit[] = (
      ['intake', 'exhaust', 'ignitionEcu', 'camsTiming'] as CarPartId[]
    ).map((carPartId) => ({ carPartId, part: aftermarketPart(carPartId, 'sport', fitmentClass) }))
    const { probeCostYen } = buildProbe('honda-civic-sir2-eg6', 'mint', aftermarket)

    const cams = CONTEXT.partsTaxonomyById.camsTiming!
    expect(
      accessRoute(TIER1_STATE, CONTEXT, cams).route,
      'camsTiming must be buried, and unreachable without a rig at tier 1',
    ).toBe('slog')
    const hireYen = CONTEXT.economy.toolHire.feeYenByGroup[cams.group]
    expect(probeCostYen + hireYen).toBeLessThanOrEqual(mission('make-it-pull').budgetCapYen)
  })

  /**
   * The other authored aftermarket slots are all bolt-on or surface work, so
   * none of them is buried and none needs a rig at all - spanners reach every
   * one, and no hire fee follows from any of them. The "where a gated
   * operation appears" qualifier in probe (b) is genuinely make-it-pull alone
   * among the shipped campaign.
   */
  it('no other authored aftermarket slot needs a rig to reach (the route is open)', () => {
    const openSlots: CarPartId[] = [
      'intake',
      'exhaust',
      'ignitionEcu',
      'forcedInduction',
      'tyres',
      'aero',
      'rims',
      'seats',
    ]
    for (const carPartId of openSlots) {
      const access = accessRoute(TIER1_STATE, CONTEXT, CONTEXT.partsTaxonomyById[carPartId]!)
      expect(access.route, `${carPartId} should be reachable without a rig`).toBe('open')
      expect(access.multiplier, `${carPartId} should cost base labour`).toBe(1)
    }
  })

  /**
   * The three groups whose slots gate a REPAIR. `signatureOpFeeYen` charges
   * the group's fee on one of those slots at tier 1 and 0 once the tier-2
   * machine is owned, and never fires for a light bolt-on slot in the same
   * group - the no-over-gating check. It is also 0 for the
   * engine/drivetrain/wheels slots, whose own `machineGate` names other
   * operations entirely (`install`/`remove` on a buried slot, `bench-fit` on a
   * tyre), proving the repair predicate never leaks into - or double-charges -
   * the other three gate sites.
   */
  it('the repair-gated slots charge at tier 1, are free at tier 2, and never over-gate light or otherwise-gated work', () => {
    const { feeYenByGroup } = CONTEXT.economy.toolHire
    const groups = ['suspension', 'body', 'interior'] as const
    for (const group of groups) {
      const tier2State = {
        ...TIER1_STATE,
        toolTiers: { ...TIER1_STATE.toolTiers, [group]: 2 },
      }
      const slots = Object.values(CONTEXT.partsTaxonomyById)
        .filter((entry) => entry.group === group && entry.machineGate.includes('repair'))
        .map((entry) => entry.id)
      expect(slots.length, `${group} must name repair-gated slots`).toBeGreaterThan(0)
      for (const slot of slots) {
        expect(signatureOpFeeYen(slot, TIER1_STATE, CONTEXT), `${slot} gated at tier 1`).toBe(
          feeYenByGroup[group],
        )
        expect(signatureOpFeeYen(slot, tier2State, CONTEXT), `${slot} free once owned`).toBe(0)
      }
    }
    // Light bolt-on work in these groups gates no repair - no fee (no
    // over-gating). anti-roll bars and steering (suspension), aero (body).
    for (const light of ['antiRollBars', 'steering', 'aero'] as CarPartId[]) {
      expect(
        signatureOpFeeYen(light, TIER1_STATE, CONTEXT),
        `${light} is light bolt-on work, never a repair-gated op`,
      ).toBe(0)
    }
    // The other three gate sites keep their own operations - a repair is never
    // gated on an engine/drivetrain buried slot or on a tyre.
    for (const existing of ['camsTiming', 'gearbox', 'tyres'] as CarPartId[]) {
      expect(
        signatureOpFeeYen(existing, TIER1_STATE, CONTEXT),
        `${existing} gates its own operations, never a repair`,
      ).toBe(0)
    }
  })
})
