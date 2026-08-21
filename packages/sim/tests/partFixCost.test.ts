import {
  ALL_CAR_PART_IDS,
  BUYERS,
  CARS,
  ComponentIdSchema,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ComponentId,
  type ConditionBand,
  type Part,
  type ServiceJobTask,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  bandIndex,
  canRepair,
  carCostToBandYen,
  gradesBetween,
  groupCostToMintYen,
  planGroupRepair,
} from '../src/bands'
import { buildRoughProbeCar, computeModelBalanceProbe } from '../src/balanceProbes'
import { bodyPartRepairBillYen } from '../src/bodyPipeline'
import { buildSimContext } from '../src/context'
import {
  expectationForCar,
  restorationBillSplitFor,
  sensibleRepairTargetBand,
} from '../src/marketValue'
import { computeCarPlayRanking } from '../src/plays'
import { partFixCostYen } from '../src/repairJobs'
import { serviceJobCostBreakdown } from '../src/serviceJobs'
import { freshToolTiers } from '../src/toolLines'
import { buildCarInstance, mintCarParts } from './testFixtures'

/**
 * The agreement guard for `partFixCostYen`, the shared fix price.
 *
 * Repair-or-replace cost used to be implemented four separate times, and the
 * four drifted. They are now one function with five readers, and this file is
 * what stops them coming apart again: a constructed part, priced through every
 * reader's own public entry point, must come back at exactly the atom's
 * `partsYen + hireFeeYen`.
 *
 * A CUSTOMER QUOTE IS THE ONE READER THAT BUYS THE DAY, and it is compared
 * against the atom's `partsYen + hireFeeYen`; the other four are compared
 * against `partsYen` alone. A quote prices a JOB, and a job that needs a hired
 * day has to cover it before any margin. The other four price a CAR, and a day
 * is not a car's input: it buys a whole tool line for a whole day whatever else
 * the shop does with it. That difference between what a JOB costs and what a
 * CAR owes is asserted here rather than left to drift.
 *
 * FEW FIXES NAME A DAY AT ALL, which is the second thing the cases below hold.
 * A tier 2 tool is a rate rather than a wall: without the machine the step is
 * worked by hand at `toolHire.slogMultiplier` energy and no yen, so owning the
 * line buys speed. Only a welding step (`requiresMachine`) can never be worked
 * by hand, and only that step's day is priced. The block's Rebuild is tier 2
 * from end to end and still names nothing; the exhaust's Rebuild welds, and
 * names the body line's day.
 *
 * LABOUR is deliberately outside the comparison. Each reader keeps its own
 * labour convention on purpose (the valuation bill adds none, a customer quote
 * adds the whole teardown chain, the play probe adds removal plus install), so
 * only the per-part decision and the money are shared and only they are held
 * equal here.
 *
 * The expected figure for each case is authored from content constants rather
 * than read back off the atom (the band ladder for parts, the named tool line
 * for the day's hire), so the atom itself is checked against arithmetic the
 * test states independently, and the five readers are checked against the atom.
 */

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
)

const ECONOMY = CONTEXT.economy

/**
 * One `everyday` model carries every case. Its tier matters twice and both are
 * asserted below rather than assumed: `mintCarParts` fills a fixture slot with
 * an `everyday`-class stock SKU, and the two readers whose target band is not a
 * parameter (the play probe, the valuation split) both work to this tier's own
 * expectation band.
 */
const MODEL: CarModel = CARS.find((car) => car.id === 'eunos-roadster-na6ce')!

/** Where the parts figure comes from: the band ladder for work on the bench,
 * a class's stock replacement price for a part past saving, or nothing at all
 * for a slot already at or above the target. */
type PartsBasis = 'ladder' | 'stock-replacement' | 'nothing'

interface FixCase {
  label: string
  carPartId: CarPartId
  band: ConditionBand
  targetBand: ConditionBand
  partsBasis: PartsBasis
  /** Whether the atom answers `'replace'` rather than naming a job. True for
   * scrap and for a replace-only consumable at EVERY band, including one
   * sitting high enough that nothing is owed for it. */
  answersReplace: boolean
  /** The tool line whose day this fix cannot be worked without, named from the
   * recipe's welding step, or null when every step of it can be worked by
   * hand - which is every recipe in the ladder but two. */
  hireLine: ComponentId | null
}

function labelFor(carPartId: CarPartId, band: ConditionBand, targetBand: ConditionBand): string {
  return `${carPartId} ${band} to ${targetBand}`
}

/** A part worked on the bench: the ladder pays for the climb, and `hireLine`
 * names the line whose day the job cannot be worked without, if any. */
function bench(
  carPartId: CarPartId,
  band: ConditionBand,
  targetBand: ConditionBand,
  hireLine: ComponentId | null,
): FixCase {
  const label = labelFor(carPartId, band, targetBand)
  return {
    label,
    carPartId,
    band,
    targetBand,
    partsBasis: 'ladder',
    answersReplace: false,
    hireLine,
  }
}

/** A part past saving: bought fresh at its class's stock replacement price,
 * and a replacement never hires a day. */
function swap(carPartId: CarPartId, band: ConditionBand, targetBand: ConditionBand): FixCase {
  const label = labelFor(carPartId, band, targetBand)
  return {
    label,
    carPartId,
    band,
    targetBand,
    partsBasis: 'stock-replacement',
    answersReplace: true,
    hireLine: null,
  }
}

/** A slot the ladder owes nothing for. `answersReplace` still varies: a
 * repairable part at the target names the job that would have reached it, a
 * replace-only one is a replacement whatever band it sits at. */
function nothingOwed(
  carPartId: CarPartId,
  band: ConditionBand,
  targetBand: ConditionBand,
  answersReplace: boolean,
): FixCase {
  const label = labelFor(carPartId, band, targetBand)
  return {
    label,
    carPartId,
    band,
    targetBand,
    partsBasis: 'nothing',
    answersReplace,
    hireLine: null,
  }
}

/**
 * The constructed cases. Between them they cover a repairable part at every
 * band, a part past saving, a replace-only consumable, a Rebuild that welds and
 * several that do not, a Service that never does, a Rebuild that borrows
 * another line's machine, and a mint target on both a repairable and a
 * replace-only slot.
 */
const CASES: readonly FixCase[] = [
  // A Rebuild reaches `fine`. The block's Rebuild is tier 2 from end to end and
  // still names no day: none of its steps welds, so a garage without the kit
  // works them by hand at triple the energy and pays nothing.
  bench('block', 'worn', 'fine', null),
  bench('block', 'poor', 'fine', null),
  // A Service reaches `worn`, and every Service recipe is tier 1 throughout.
  bench('block', 'poor', 'worn', null),
  // A Restore reaches `mint` and has no hire route at all: the covering shop is
  // assumed rather than a day priced that cannot be bought.
  bench('block', 'worn', 'mint', null),
  bench('seats', 'worn', 'mint', null),
  // The exhaust's Rebuild MIGs new pipe in, which is the one thing on the
  // ladder that cannot be improvised, and the welder lives on the body corner:
  // the day it buys is the BODY line's, not the engine line the exhaust sits
  // on.
  bench('exhaust', 'poor', 'fine', 'body'),
  // A Rebuild that is tier 1 throughout hires no day at all, and neither does a
  // tier 2 one nobody has to weld their way through.
  bench('antiRollBars', 'poor', 'fine', null),
  bench('dampers', 'worn', 'fine', null),
  bench('rims', 'poor', 'fine', null),
  // Scrap is terminal, and a replace-only consumable is never worked on at any
  // band: both are bought fresh rather than repaired.
  swap('block', 'scrap', 'fine'),
  swap('block', 'scrap', 'mint'),
  swap('tyres', 'poor', 'fine'),
  swap('tyres', 'worn', 'mint'),
  // Already there, and already past it: no work, so no day to hire.
  nothingOwed('block', 'fine', 'fine', false),
  nothingOwed('block', 'mint', 'fine', false),
  // A replace-only consumable at or above `fine` is close enough to mint that
  // the ladder owes nothing for it, and it is still a replacement rather than a
  // job: one nobody is charged for.
  nothingOwed('tyres', 'fine', 'mint', true),
]

/** The fixture car for a case: every slot mint but the one under test. */
function carWithSlot(carPartId: CarPartId, band: ConditionBand): CarInstance {
  return buildCarInstance({ modelId: MODEL.id, parts: mintCarParts({ [carPartId]: band }) })
}

/** The catalogue SKU actually sitting in the fixture slot. */
function catalogPartIn(car: CarInstance, carPartId: CarPartId): Part {
  return CONTEXT.partsById[car.parts[carPartId].installed!.partId]!
}

/**
 * What the case costs in parts, derived here rather than read off the atom:
 * the band ladder for work, the class's stock replacement price for a part
 * past saving, nothing for a slot already at the target.
 */
function authoredPartsYen(testCase: FixCase, part: Part): number {
  const entry = CONTEXT.partsTaxonomyById[testCase.carPartId]!
  if (testCase.partsBasis === 'nothing') return 0
  if (testCase.partsBasis === 'stock-replacement') {
    return entry.stockReplacementPriceYenByClass[part.fitmentClass]
  }
  return Math.round(
    gradesBetween(testCase.band, testCase.targetBand) *
      ECONOMY.restoration.repairStepFraction *
      part.priceYen,
  )
}

/** The day's hire the case's own recipe cannot avoid, priced off the named
 * line. */
function authoredHireYen(testCase: FixCase): number {
  return testCase.hireLine ? ECONOMY.toolHire.feeYenByGroup[testCase.hireLine] : 0
}

function slotTask(carPartId: CarPartId, minBand: ConditionBand): ServiceJobTask {
  return { kind: 'slotCondition', requirement: { kind: 'slotCondition', carPartId, minBand } }
}

describe('partFixCostYen: the one repair-or-replace price, read by five consumers', () => {
  it('the fixture model is the tier the consumer mapping below assumes', () => {
    expect(MODEL.tier).toBe('everyday')
    // The play probe and the valuation split both work to this band without
    // taking it as a parameter, which is what lets a `fine`-target case be
    // compared against them at all.
    expect(expectationForCar(MODEL, ECONOMY).band).toBe('fine')
    expect(sensibleRepairTargetBand(MODEL, ECONOMY)).toBe('fine')
    expect(ECONOMY.repairJobs.service.target).toBe('worn')
    expect(ECONOMY.repairJobs.rebuild.target).toBe('fine')
    expect(ECONOMY.repairJobs.restore.target).toBe('mint')
  })

  it('the atom prices each constructed case at the ladder plus the named line, and every consumer answers the same figure', () => {
    const failures: string[] = []
    /** How many cases each consumer was actually compared on, and how many of
     * those hired a day, so a consumer silently dropping out of the sweep
     * fails the test rather than quietly stopping being guarded. */
    const compared: Record<string, { cases: number; withHire: number }> = {
      'bands.carCostToBandYen': { cases: 0, withHire: 0 },
      'bands.groupCostToMintYen': { cases: 0, withHire: 0 },
      'plays.computeCarPlayRanking': { cases: 0, withHire: 0 },
      'serviceJobs.serviceJobCostBreakdown': { cases: 0, withHire: 0 },
      'marketValue.restorationBillSplitFor': { cases: 0, withHire: 0 },
    }
    /** The one consumer whose figure INCLUDES the day. Every other reader
     * prices a car rather than a job and takes the parts alone. */
    const QUOTE_CONSUMER = 'serviceJobs.serviceJobCostBreakdown'

    for (const testCase of CASES) {
      const { carPartId, band, targetBand } = testCase
      const entry = CONTEXT.partsTaxonomyById[carPartId]!
      const car = carWithSlot(carPartId, band)
      const part = catalogPartIn(car, carPartId)
      const expectedParts = authoredPartsYen(testCase, part)
      const expectedHire = authoredHireYen(testCase)
      const expected = expectedParts + expectedHire

      const checkAgainst = (consumer: string, actual: number, wanted: number): void => {
        if (actual !== wanted) {
          failures.push(
            `${testCase.label}: ${consumer} priced ${actual}, expected ${wanted} ` +
              `(parts ${expectedParts} + hire ${expectedHire})`,
          )
        }
        const counter = compared[consumer]
        if (counter) {
          counter.cases += 1
          if (expectedHire > 0) counter.withHire += 1
        }
      }
      /** A car bill counts the parts and never the day. */
      const check = (consumer: string, actual: number): void =>
        checkAgainst(consumer, actual, expectedParts)
      /** A customer quote is the one reader that buys the day. */
      const checkQuote = (consumer: string, actual: number): void =>
        checkAgainst(consumer, actual, expected)

      const fix = partFixCostYen(entry, part, band, targetBand, CONTEXT)
      if (fix.partsYen !== expectedParts || fix.hireFeeYen !== expectedHire) {
        failures.push(
          `${testCase.label}: partFixCostYen answered parts ${fix.partsYen} / hire ` +
            `${fix.hireFeeYen}, expected parts ${expectedParts} / hire ${expectedHire}`,
        )
      }
      const answeredReplace = fix.jobKind === 'replace'
      if (answeredReplace !== testCase.answersReplace) {
        failures.push(
          `${testCase.label}: partFixCostYen answered ${fix.jobKind}, expected ` +
            `${testCase.answersReplace ? 'a replacement' : 'a repair job'}`,
        )
      }

      check(
        'bands.carCostToBandYen',
        carCostToBandYen(
          car,
          MODEL,
          CONTEXT.partsById,
          CONTEXT.partsTaxonomyById,
          ECONOMY,
          targetBand,
        ),
      )

      if (targetBand === 'mint') {
        check(
          'bands.groupCostToMintYen',
          groupCostToMintYen(
            car,
            MODEL,
            entry.group,
            CONTEXT.partIdsByGroup,
            CONTEXT.partsById,
            CONTEXT.partsTaxonomyById,
            ECONOMY,
          ),
        )
      }

      // The play probe prices two targets and only two: the model's own
      // sensible repair band, and mint.
      if (targetBand === 'fine' || targetBand === 'mint') {
        const ranking = computeCarPlayRanking(car, MODEL, 0, CONTEXT)
        const play = ranking.plays.find(
          (row) =>
            row.play === (targetBand === 'mint' ? 'repair-to-mint' : 'repair-to-expectation'),
        )!
        check('plays.computeCarPlayRanking', play.outlayYen)
      }

      // A customer quote takes the buy-new route for anything the atom answers
      // with a replacement, which is a different economic act and a different
      // price - see the dedicated case below.
      if (fix.jobKind !== 'replace') {
        checkQuote(
          QUOTE_CONSUMER,
          serviceJobCostBreakdown([slotTask(carPartId, targetBand)], car, MODEL, CONTEXT)
            .taskCostYen,
        )
      }

      const split = restorationBillSplitFor(
        car,
        MODEL,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        ECONOMY,
      )
      if (targetBand === 'fine') {
        check('marketValue.restorationBillSplitFor', split.belowYen)
      }
      if (targetBand === 'mint') {
        check('marketValue.restorationBillSplitFor', split.toMintYen)
      }
      // The split at the expectation band never invents or loses a yen.
      if (split.belowYen + split.aboveYen !== split.toMintYen) {
        failures.push(
          `${testCase.label}: the valuation split lost parts - below ${split.belowYen} + above ` +
            `${split.aboveYen} !== to mint ${split.toMintYen}`,
        )
      }
      if (split.aboveYen < 0) {
        failures.push(
          `${testCase.label}: the valuation split went negative above the band (${split.aboveYen})`,
        )
      }
    }

    expect(failures, `${failures.length} disagreements:\n${failures.join('\n')}`).toEqual([])
    for (const [consumer, counter] of Object.entries(compared)) {
      expect(counter.cases, `${consumer} was never compared at all`).toBeGreaterThan(0)
    }
    // The quote is only guarded on the day it buys if it was actually shown a
    // case that names one.
    expect(
      compared[QUOTE_CONSUMER]?.withHire,
      `${QUOTE_CONSUMER} was never compared on a case that hires a day`,
    ).toBeGreaterThan(0)
    // A Restore has no hire route at all, so a mint target never names a day
    // even on the one slot whose Rebuild does. Held here rather than assumed,
    // on the exhaust, because it is the only bench job on the ladder that
    // genuinely cannot be worked by hand.
    const exhaustCar = carWithSlot('exhaust', 'worn')
    const exhaustPart = catalogPartIn(exhaustCar, 'exhaust')
    const exhaustEntry = CONTEXT.partsTaxonomyById.exhaust!
    expect(
      partFixCostYen(exhaustEntry, exhaustPart, 'worn', 'fine', CONTEXT).hireFeeYen,
    ).toBeGreaterThan(0)
    expect(partFixCostYen(exhaustEntry, exhaustPart, 'worn', 'mint', CONTEXT).hireFeeYen).toBe(0)
    // And a tier 2 Rebuild that never welds names nothing at either target: the
    // block's whole recipe is tier 2 kit a garage can improvise around.
    const blockCar = carWithSlot('block', 'worn')
    const blockPart = catalogPartIn(blockCar, 'block')
    const blockEntry = CONTEXT.partsTaxonomyById.block!
    expect(partFixCostYen(blockEntry, blockPart, 'worn', 'fine', CONTEXT).hireFeeYen).toBe(0)
    expect(partFixCostYen(blockEntry, blockPart, 'worn', 'mint', CONTEXT).hireFeeYen).toBe(0)
  })

  it("charges the day's hire on the line the borrowed machine belongs to, not the part's own", () => {
    const entry = CONTEXT.partsTaxonomyById.exhaust!
    const car = carWithSlot('exhaust', 'poor')
    const part = catalogPartIn(car, 'exhaust')
    const fix = partFixCostYen(entry, part, 'poor', 'fine', CONTEXT)

    expect(entry.group).toBe('engine')
    // The exhaust's Rebuild welds, and the welder lives on the body corner.
    expect(fix.hireFeeYen).toBe(ECONOMY.toolHire.feeYenByGroup.body)
    expect(fix.hireFeeYen).not.toBe(ECONOMY.toolHire.feeYenByGroup.engine)
    expect(fix.partsYen).toBe(
      Math.round(2 * ECONOMY.restoration.repairStepFraction * part.priceYen),
    )
  })

  it('a part the atom answers with a replacement is quoted the buy-new route by a customer job, and the bill walkers still agree with the atom', () => {
    const entry = CONTEXT.partsTaxonomyById.tyres!
    const car = carWithSlot('tyres', 'poor')
    const part = catalogPartIn(car, 'tyres')
    const fix = partFixCostYen(entry, part, 'poor', 'fine', CONTEXT)

    expect(fix.jobKind).toBe('replace')
    expect(fix.hireFeeYen).toBe(0)
    expect(fix.partsYen).toBe(entry.stockReplacementPriceYenByClass[part.fitmentClass])
    expect(
      carCostToBandYen(car, MODEL, CONTEXT.partsById, CONTEXT.partsTaxonomyById, ECONOMY, 'fine'),
    ).toBe(fix.partsYen)

    // A customer job has to actually put tyres on the car, so it prices the
    // fitting catalogue tier rather than the ladder's stock-replacement
    // figure. The two are different acts and are deliberately not held equal;
    // what IS held is that the quote never prices such a task at nothing.
    const quoted = serviceJobCostBreakdown(
      [slotTask('tyres', 'fine')],
      car,
      MODEL,
      CONTEXT,
    ).taskCostYen
    expect(quoted).toBeGreaterThan(0)
  })

  it('the balance probe prices its own rough car through the same atom, and buys no hire day', () => {
    // One model per tier: parts are priced per fitment class, so a single tier
    // would guard one column.
    const modelIds = [
      'honda-today-jw1',
      'eunos-roadster-na6ce',
      'nissan-180sx-rps13',
      'toyota-supra-rz-jza80',
    ]
    const residuals: number[] = []
    /** Days named across the whole sweep. Most rough cars name none at all now
     * that only a welded step buys one, so non-vacuity is a property of the
     * sweep rather than of every model in it. */
    let daysNamedYen = 0

    for (const modelId of modelIds) {
      const model = CARS.find((car) => car.id === modelId)!
      const row = computeModelBalanceProbe(model, CONTEXT)
      const rough = buildRoughProbeCar(model, CONTEXT)
      const targetBand = sensibleRepairTargetBand(model, ECONOMY)
      const fitmentClass = fitmentClassForTier(model.tier)

      // The on-car half and the body pipeline's own bill are untouched by the
      // shared fix price; they are summed here from the same functions the
      // probe reads so the bench half can be isolated.
      let expected = 0
      for (const groupId of ComponentIdSchema.options) {
        expected += planGroupRepair(
          rough,
          groupId,
          targetBand,
          freshToolTiers(),
          CONTEXT.partIdsByGroup,
          CONTEXT.partsById,
          CONTEXT.partsTaxonomyById,
          ECONOMY.restoration.repairStepFraction,
          ECONOMY.energy.energyPerBandStepByToolTier,
        ).costYen
      }
      // The bench half is the atom's PARTS alone. The days the atom names are
      // counted here only to prove the probe left real ones on the table: a
      // restoration is a car's bill, and a car's bill buys no day. Only the
      // exhaust's welded Rebuild names one now, so a rough car whose exhaust is
      // already at the target names nothing and contributes nothing to the
      // running total below.
      const hireByLine = new Map<ComponentId, number>()
      for (const partId of ALL_CAR_PART_IDS) {
        const entry = CONTEXT.partsTaxonomyById[partId]
        if (!entry?.removable) continue
        const installed = rough.parts[partId].installed
        if (!installed || !canRepair(installed.band, entry)) continue
        if (bandIndex(installed.band) >= bandIndex(targetBand)) continue
        const catalogPart = CONTEXT.partsById[installed.partId]
        if (!catalogPart) continue
        const fix = partFixCostYen(entry, catalogPart, installed.band, targetBand, CONTEXT)
        expected += fix.partsYen
        if (fix.hireLine !== null) hireByLine.set(fix.hireLine, fix.hireFeeYen)
      }
      let hireYen = 0
      for (const feeYen of hireByLine.values()) hireYen += feeYen
      if (rough.zoneState) {
        for (const partId of ['bodywork', 'paint'] as const) {
          expected += bodyPartRepairBillYen(
            partId,
            rough.zoneState,
            targetBand,
            fitmentClass,
            CONTEXT.partsById,
          )
        }
      }

      expect(row.repairCostYen, `${modelId} repair cost`).toBe(Math.round(expected))
      daysNamedYen += hireYen

      // The three true consumables are replace-only at every band, so the
      // probe's own consumables figure is the atom's replacement prices plus
      // the flat materials bill. Materials are class-independent, so the
      // residual after taking the atom's answer off is the same on every tier
      // and needs no second copy of the materials list here.
      const consumablesFromAtom = (['tyres', 'brakePadsDiscs', 'clutch'] as const).reduce(
        (sum, partId) =>
          sum +
          partFixCostYen(
            CONTEXT.partsTaxonomyById[partId]!,
            CONTEXT.stockPartByCarPartId[fitmentClass][partId]!,
            'poor',
            'mint',
            CONTEXT,
          ).partsYen,
        0,
      )
      expect(consumablesFromAtom, `${modelId} consumables priced at nothing`).toBeGreaterThan(0)
      residuals.push(row.consumablesCostYen - consumablesFromAtom)
    }

    expect(
      daysNamedYen,
      'no model in the sweep names a hire day, so the claim above is vacuous',
    ).toBeGreaterThan(0)
    expect(
      new Set(residuals).size,
      `materials residuals differ across tiers: ${residuals.join(', ')}`,
    ).toBe(1)
    expect(residuals[0]).toBeGreaterThan(0)
  })
})
