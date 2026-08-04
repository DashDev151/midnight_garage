import {
  BUYERS,
  ALL_CAR_PART_IDS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ConditionBand,
  type EngineCharacter,
  type Grade,
  type MachiningOperation,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { computeDerivedStats, engineCharacterOf, machiningCost } from '../src/derivedStats'
import { machiningOf, machiningPremiumYenOf } from '../src/machining'
import { machiningGateReason, resolveMachiningLabor } from '../src/machiningJobs'
import { installedPartsValueYen, retentionFor } from '../src/marketValue'
import { resolveJobLabor, resolveReconditionLabor } from '../src/jobs'
import {
  resolveRefitAssembly,
  resolveRemoveAssembly,
  resolveRemoveAssemblyMember,
} from '../src/assemblies'
import { supportRatios, supportVerdict } from '../src/support'
import { createInitialGameState } from '../src/newGame'
import { buildCarInstance, mintCarParts, testToolTiers, type CarPartOverride } from './testFixtures'

/**
 * Machining: the third way a part gets better. This file is the mechanism's
 * acceptance test - the authored ladder measured through the real derivation,
 * the interleaving property that keeps the money ladder meaningful, the
 * travelling and repair-surviving behaviour the `PartInstance` record exists
 * to guarantee, the gate, support, authenticity and value.
 *
 * The design of record is `docs/design/systems/machining-system-design.md` and
 * the numbers are `docs/design/systems/machining-performance-table.md`. Every
 * figure below is read from content rather than restated, except the ladder
 * itself, which is the authored table and is the thing being checked.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)
// This file is about the four original engine-only operations specifically
// (the ladder, the support-only pair, the gate, the workshop flow). The
// catalogue they live in (`economy.machining.operations`) is now shared with
// the six scene-gated craft operations (`scene` set on every one of them,
// absent on these nine), which are their own concern with their own tests.
const operations = ECONOMY.machining.operations.filter((o) => o.scene === undefined)
const OPERATION_IDS = operations.map((o) => o.id)

/** One model per engine character, so every ladder assertion below is
 * measured on a real car rather than an invented one. */
function modelOfCharacter(character: EngineCharacter): CarModel {
  const found = CARS.find((model) => engineCharacterOf(model, ECONOMY) === character)
  if (!found) throw new Error(`no shipped car reads as ${character}`)
  return found
}

const MODEL_BY_CHARACTER: Readonly<Record<EngineCharacter, CarModel>> = {
  'high-strung-na': modelOfCharacter('high-strung-na'),
  'lazy-na': modelOfCharacter('lazy-na'),
  forced: modelOfCharacter('forced'),
}

/** The eight power-bearing slots, and whether a car's own factory induction
 * puts `forcedInduction` inside its ladder. An NA car's turbo fit is a
 * conversion and sits outside the ladder, which is the shipped convention
 * (`proportionalPower.test.ts`). */
const LADDER_SLOTS: readonly CarPartId[] = [
  'block',
  'internals',
  'headValvetrain',
  'camsTiming',
  'intake',
  'exhaust',
  'ignitionEcu',
]
const FORCED_INDUCTION: CarPartId = 'forcedInduction'

function skuFor(model: CarModel, carPartId: CarPartId, grade: Grade) {
  const fitmentClass = fitmentClassForTier(model.tier)
  const found = PARTS.find(
    (part) =>
      part.carPartId === carPartId &&
      part.grade === grade &&
      part.fitmentClass === fitmentClass &&
      part.zoneId == null &&
      part.requiredTags.every((tag) => model.tags.includes(tag)),
  )
  if (!found) throw new Error(`no ${grade} ${carPartId} SKU fits ${model.id}`)
  return found
}

/**
 * A car built to `grade` across every ladder slot, with every machining
 * operation applied to the four machinable slots when `machined` is set. The
 * one fixture the whole ladder is measured on.
 */
function ladderCar(model: CarModel, grade: Grade, machined: boolean): CarInstance {
  const slots =
    engineCharacterOf(model, ECONOMY) === 'forced'
      ? [...LADDER_SLOTS, FORCED_INDUCTION]
      : LADDER_SLOTS
  const overrides: Partial<Record<CarPartId, CarPartOverride>> = {}
  for (const carPartId of slots) {
    const sku =
      grade === 'stock' ? skuFor(model, carPartId, 'stock') : skuFor(model, carPartId, grade)
    overrides[carPartId] = {
      id: `ladder-${carPartId}`,
      partId: sku.id,
      band: 'mint',
      origin: { kind: 'market', day: 1 },
      ...(machined
        ? { machining: OPERATION_IDS.filter((id) => operationById(id).carPartId === carPartId) }
        : {}),
    }
  }
  return buildCarInstance({ modelId: model.id, parts: mintCarParts(overrides) })
}

function operationById(id: string): MachiningOperation {
  const found = operations.find((o) => o.id === id)
  if (!found) throw new Error(`no machining operation ${id}`)
  return found
}

/** The car's power as a multiple of its own stock power - the quantity the
 * authored ladder is expressed in. */
function ladderMultiple(model: CarModel, grade: Grade, machined: boolean): number {
  const power = computeDerivedStats(
    model,
    ladderCar(model, grade, machined),
    CONTEXT.partsById,
    PARTS_TAXONOMY,
    ECONOMY,
  ).power
  return power / model.spec.stockPowerPs
}

/** `car` with `operationIds` recorded on whatever is fitted in `carPartId`. */
function machinedCar(car: CarInstance, carPartId: CarPartId, operationIds: string[]): CarInstance {
  const installed = car.parts[carPartId].installed!
  return {
    ...car,
    parts: {
      ...car.parts,
      [carPartId]: {
        ...car.parts[carPartId],
        installed: { ...installed, machining: [...machiningOf(installed), ...operationIds] },
      },
    },
  }
}

describe('the operations catalogue', () => {
  it('is the nine authored operations across the four machinable slots', () => {
    expect(operations).toHaveLength(9)
    expect([...new Set(operations.map((o) => o.carPartId))].sort()).toEqual([
      'block',
      'camsTiming',
      'headValvetrain',
      'internals',
    ])
  })

  it('sums to the authored machining base on every engine character', () => {
    const total = (character: EngineCharacter) =>
      operations.reduce((sum, o) => sum + o.powerFraction[character], 0)
    expect(total('high-strung-na')).toBeCloseTo(0.08, 6)
    expect(total('lazy-na')).toBeCloseTo(0.105, 6)
    expect(total('forced')).toBeCloseTo(0.2, 6)
  })

  it('sums to 48 authenticity points on a fully machined engine', () => {
    expect(operations.reduce((sum, o) => sum + o.authenticityCost, 0)).toBe(48)
  })

  it('leaves the two support-only operations with no power on any character', () => {
    for (const id of ['deck-o-ring', 'con-rod-peening']) {
      const operation = operationById(id)
      expect(operation.powerFraction['high-strung-na'], id).toBe(0)
      expect(operation.powerFraction['lazy-na'], id).toBe(0)
      expect(operation.powerFraction.forced, id).toBe(0)
      expect(operation.spec, id).toBeGreaterThan(0)
    }
  })

  it('gives milling no power at all on a forced engine, where compression is the wrong lever', () => {
    expect(operationById('head-skim').powerFraction.forced).toBe(0)
    expect(operationById('head-skim').powerFraction['high-strung-na']).toBeGreaterThan(0)
  })
})

/**
 * Test 2 of the sprint: the ladder measured through `computeDerivedStats`
 * itself, never through a hand-summed table.
 *
 * The four MACHINED rungs are what this sprint authors, and they are asserted
 * against the performance table exactly. The four PARTS rungs are the shipped
 * catalogue's own totals: the table's re-authored per-slot parts figures are
 * NOT in this build (the catalogue rise is halted on a partPricing collision,
 * recorded in `sprint168.md`'s Exit), so the parts rungs here are measured
 * from the catalogue as it stands. Every machining STEP is the authored one
 * regardless, since machining's own figures are independent of the catalogue.
 */
describe('the ladder, measured through the real derivation', () => {
  const MACHINING_BASE: Readonly<Record<EngineCharacter, number>> = {
    'high-strung-na': 0.08,
    'lazy-na': 0.105,
    forced: 0.2,
  }
  const GRADES: readonly Grade[] = ['stock', 'street', 'sport', 'race']

  for (const character of ['high-strung-na', 'lazy-na', 'forced'] as const) {
    const model = MODEL_BY_CHARACTER[character]
    for (const grade of GRADES) {
      it(`${character} (${model.id}), ${grade}: machining adds exactly the authored step`, () => {
        const plain = ladderMultiple(model, grade, false)
        const machined = ladderMultiple(model, grade, true)
        const expectedStep = MACHINING_BASE[character] * ECONOMY.machining.gradeMultiplier[grade]
        // Power is rounded to whole PS, so the step is checked to within the
        // rounding of the two figures it is the difference of.
        const roundingSlack = 1.5 / model.spec.stockPowerPs
        expect(
          Math.abs(machined - plain - expectedStep),
          `${grade}: x${plain.toFixed(4)} to x${machined.toFixed(4)}, expected step ${expectedStep}`,
        ).toBeLessThanOrEqual(roundingSlack)
      })
    }
  }

  it('scales the step with the grade of the part machined: stock 1.0, street 1.0, sport 1.25, race 1.5', () => {
    expect(ECONOMY.machining.gradeMultiplier).toEqual({
      stock: 1,
      street: 1,
      sport: 1.25,
      race: 1.5,
    })
  })

  it('reports the whole eight-rung ladder, per character', () => {
    const rows: string[] = []
    for (const character of ['high-strung-na', 'lazy-na', 'forced'] as const) {
      const model = MODEL_BY_CHARACTER[character]
      const cells = GRADES.flatMap((grade) => [
        `${grade} x${ladderMultiple(model, grade, false).toFixed(3)}`,
        `${grade} machined x${ladderMultiple(model, grade, true).toFixed(3)}`,
      ])
      rows.push(`${character} (${model.id}): ${cells.join(', ')}`)
    }
    // The measured table is carried in the assertion message so it stays
    // visible in the run rather than only in a document.
    expect(rows, rows.join('\n')).toHaveLength(3)
  })
})

/**
 * Tests 3 and 11 of the sprint. Stock-machined below street falls out of the
 * rule for free, since the machining base is half that very step. The top of
 * the ladder does not: sport-machined below race holds only because 1.25 times
 * the base is smaller than the sport-to-race step, so it is asserted rather
 * than trusted.
 */
describe('machining never reaches the next grade up', () => {
  const RUNGS: readonly [Grade, Grade][] = [
    ['stock', 'street'],
    ['street', 'sport'],
    ['sport', 'race'],
  ]

  for (const character of ['high-strung-na', 'lazy-na', 'forced'] as const) {
    const model = MODEL_BY_CHARACTER[character]
    for (const [lower, upper] of RUNGS) {
      it(`${character}: ${lower} machined stays below ${upper}`, () => {
        const machined = ladderMultiple(model, lower, true)
        const next = ladderMultiple(model, upper, false)
        expect(
          machined,
          `${lower} machined x${machined.toFixed(4)} against ${upper} x${next.toFixed(4)}`,
        ).toBeLessThan(next)
      })
    }
  }

  it('pins the tuned margin at the top of the naturally aspirated ladder', () => {
    // Unlike the stock-machined case, this end of the ladder is tuned rather
    // than structural: it holds because 1.25 times the machining base is
    // smaller than the sport-to-race step, and it would stop holding if the
    // grade steps were ever compressed. The margin is measured and asserted.
    const model = MODEL_BY_CHARACTER['high-strung-na']
    const margin = ladderMultiple(model, 'race', false) - ladderMultiple(model, 'sport', true)
    expect(margin, `measured margin ${margin.toFixed(4)}`).toBeGreaterThan(0)
    expect(margin).toBeLessThan(0.1)
  })
})

describe('support', () => {
  const model = MODEL_BY_CHARACTER.forced

  /** A car with a race turbo fitted and nothing supporting it, so cylinder
   * pressure is the weakest link and an operation on the block or the rods
   * has somewhere to land. */
  function strainedCar(): CarInstance {
    return buildCarInstance({
      modelId: model.id,
      parts: mintCarParts({
        forcedInduction: {
          id: 'strain-turbo',
          partId: skuFor(model, 'forcedInduction', 'race').id,
          band: 'mint',
          origin: { kind: 'market', day: 1 },
        },
      }),
    })
  }

  it('leaves an unmachined stock car at exactly 1.0 on every subsystem', () => {
    const stock = buildCarInstance({ modelId: model.id, parts: mintCarParts() })
    const verdict = supportVerdict(stock, model, CONTEXT.partsById, ECONOMY)
    expect(verdict.headline).toBe(1)
  })

  it('lets the two power-free operations move a build verdict on a stock part', () => {
    const before = supportVerdict(strainedCar(), model, CONTEXT.partsById, ECONOMY)
    const oRinged = machinedCar(strainedCar(), 'block', ['deck-o-ring'])
    const peened = machinedCar(oRinged, 'internals', ['con-rod-peening'])
    const after = supportVerdict(peened, model, CONTEXT.partsById, ECONOMY)
    expect(before.subsystem).toBe('cylinderPressure')
    expect(after.headline).toBeGreaterThan(before.headline)
  })

  it('adds an operation spec on top of the fitted grade rather than replacing it', () => {
    const withRaceBlock = buildCarInstance({
      modelId: model.id,
      parts: mintCarParts({
        forcedInduction: {
          id: 'strain-turbo',
          partId: skuFor(model, 'forcedInduction', 'race').id,
          band: 'mint',
          origin: { kind: 'market', day: 1 },
        },
        block: {
          id: 'race-block',
          partId: skuFor(model, 'block', 'race').id,
          band: 'mint',
          origin: { kind: 'market', day: 1 },
        },
      }),
    })
    // A race block already contributes the top of `specByGrade`, so the
    // operation is measured on the subsystem it actually supplies rather than
    // on the headline, which a race block may already have lifted off the
    // weakest link.
    const plain = supportRatios(withRaceBlock, model, CONTEXT.partsById, ECONOMY).cylinderPressure
    const machined = supportRatios(
      machinedCar(withRaceBlock, 'block', ['deck-o-ring']),
      model,
      CONTEXT.partsById,
      ECONOMY,
    ).cylinderPressure
    expect(machined).toBeGreaterThan(plain)
  })

  it('never lets a fully machined stock block out-support a race one', () => {
    const { specByGrade } = ECONOMY.statFormulas.support
    const blockOperations = operations.filter((o) => o.carPartId === 'block')
    const machinedStockSpec = blockOperations.reduce((sum, o) => sum + o.spec, 0)
    expect(machinedStockSpec).toBeLessThan(specByGrade.race)
    expect(machinedStockSpec).toBeGreaterThan(specByGrade.sport)
  })
})

describe('reliability', () => {
  const model = MODEL_BY_CHARACTER.forced

  it('charges a little for machining, and only through the power term', () => {
    const stock = buildCarInstance({ modelId: model.id, parts: mintCarParts() })
    const base = computeDerivedStats(model, stock, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
    let machined = stock
    for (const operation of operations) {
      machined = machinedCar(machined, operation.carPartId, [operation.id])
    }
    const after = computeDerivedStats(model, machined, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
    const lostFraction = (base.reliability - after.reliability) / base.reliability
    const expected = ECONOMY.machining.reliabilityCostPerOperation * operations.length
    expect(after.reliability).toBeLessThan(base.reliability)
    expect(lostFraction, `lost ${(lostFraction * 100).toFixed(2)} per cent`).toBeLessThan(0.06)
    expect(Math.abs(lostFraction - expected)).toBeLessThan(0.01)
  })
})

describe('value', () => {
  const model = MODEL_BY_CHARACTER.forced
  const retention = retentionFor(1, ECONOMY)

  it('is worth more machined, on the car', () => {
    const stock = buildCarInstance({ modelId: model.id, parts: mintCarParts() })
    const plain = installedPartsValueYen(stock, CONTEXT.partsById, retention, ECONOMY)
    const machined = installedPartsValueYen(
      machinedCar(stock, 'block', ['bore-and-hone', 'decking']),
      CONTEXT.partsById,
      retention,
      ECONOMY,
    )
    expect(plain).toBe(0)
    expect(machined).toBeGreaterThan(0)
  })

  it('is worth more machined, loose', () => {
    const blockSku = skuFor(model, 'block', 'stock')
    const instance = {
      id: 'loose-block',
      partId: blockSku.id,
      band: 'mint' as ConditionBand,
      origin: { kind: 'market' as const, day: 1 },
      machining: ['bore-and-hone', 'decking'],
    }
    const premium = machiningPremiumYenOf(instance, blockSku, ECONOMY)
    expect(premium).toBeCloseTo(
      blockSku.priceYen * ECONOMY.machining.valuePremiumPerOperation * 2,
      6,
    )
  })

  it('leaves an unmachined car exactly where it was', () => {
    const stock = buildCarInstance({ modelId: model.id, parts: mintCarParts() })
    expect(installedPartsValueYen(stock, CONTEXT.partsById, retention, ECONOMY)).toBe(0)
  })
})

// --- the workshop --------------------------------------------------------

/** The three slots the taxonomy says sit on top of the engine assembly - what
 * has to be off the car before the four machinable slots can move. */
const ENGINE_COVER_SLOTS: readonly CarPartId[] = ['intake', 'exhaust', 'cooling']

/**
 * A car filled with the model's OWN fitment class of stock parts, which is
 * what `partFitsCar` requires of anything installed on it, with `emptySlots`
 * left genuinely empty.
 */
function stockCarFor(
  model: CarModel,
  id: string,
  emptySlots: readonly CarPartId[] = [],
): CarInstance {
  const fitmentClass = fitmentClassForTier(model.tier)
  const overrides: Partial<Record<CarPartId, CarPartOverride>> = {}
  for (const partId of ALL_CAR_PART_IDS) {
    if (emptySlots.includes(partId)) {
      overrides[partId] = null
      continue
    }
    const part = CONTEXT.stockPartByCarPartId[fitmentClass][partId]
    if (!part) continue
    overrides[partId] = {
      id: `${id}-${partId}`,
      partId: part.id,
      band: 'mint',
      origin: { kind: 'car', carInstanceId: id, carLabel: 'Test Car', day: 0 },
    }
  }
  return buildCarInstance({ id, modelId: model.id, parts: mintCarParts(overrides) })
}

/**
 * A new game with a car granted, put in the service bay, and the engine line
 * at whatever tier the test needs.
 *
 * `openBlock` empties the three slots the taxonomy says sit on top of the
 * block (`intake`, `exhaust`, `cooling`), so a removal test can reach it
 * through the real `resolveRemovePart` rather than around it.
 */
function shopWith(modelId: string, engineTier: 1 | 2 | 3, openBlock = false) {
  const state = createInitialGameState(CONTEXT, 1)
  const model = CARS.find((c) => c.id === modelId)!
  const car = stockCarFor(model, 'car-test-0001', openBlock ? ENGINE_COVER_SLOTS : [])
  return {
    model,
    car,
    state: {
      ...state,
      cashYen: 5_000_000,
      ownedCars: [car],
      serviceBayCarIds: [car.id],
      parkingCarIds: [],
      forecourtCarIds: [],
      graceParkingCarId: null,
      toolTiers: testToolTiers({ engine: engineTier }),
    },
  }
}

/** `car` with `carPartId`'s fitted part worn down, so a repair has something
 * to climb. Bands are the one thing a unit test has to set by hand; the
 * machining record below is always written by the real resolver. */
function wornInSlot(car: CarInstance, carPartId: CarPartId, band: ConditionBand): CarInstance {
  return {
    ...car,
    parts: {
      ...car.parts,
      [carPartId]: {
        ...car.parts[carPartId],
        installed: { ...car.parts[carPartId].installed!, band },
      },
    },
  }
}

describe('the gate', () => {
  it('refuses below the engine line tier that owns the machine-shop tooling', () => {
    // Every rung below the one that owns the tooling, read from content so a
    // moved gate re-runs this rather than silently narrowing it.
    const belowTooling = ([1, 2, 3] as const).filter(
      (tier) => tier < ECONOMY.machining.minEngineToolTier,
    )
    expect(belowTooling.length).toBeGreaterThan(0)
    for (const tier of belowTooling) {
      const { state, car } = shopWith('toyota-supra-rz-jza80', tier)
      expect(machiningGateReason(state, car.id, 'bore-and-hone', CONTEXT), `tier ${tier}`).toBe(
        'tool-tier',
      )
    }
  })

  it('allows it at the tooling tier', () => {
    const { state, car } = shopWith('toyota-supra-rz-jza80', ECONOMY.machining.minEngineToolTier)
    expect(machiningGateReason(state, car.id, 'bore-and-hone', CONTEXT)).toBeNull()
  })

  it('refuses every band below mint', () => {
    for (const band of ['scrap', 'poor', 'worn', 'fine'] as const) {
      const { state, car } = shopWith('toyota-supra-rz-jza80', 3)
      const worn: CarInstance = {
        ...car,
        parts: {
          ...car.parts,
          block: { installed: { ...car.parts.block.installed!, band } },
        },
      }
      const withWorn = { ...state, ownedCars: [worn] }
      expect(machiningGateReason(withWorn, worn.id, 'bore-and-hone', CONTEXT), band).toBe(
        'not-mint',
      )
    }
  })

  it('refuses a car that is not in the service bay, and one it has never heard of', () => {
    const { state, car } = shopWith('toyota-supra-rz-jza80', 3)
    expect(
      machiningGateReason({ ...state, serviceBayCarIds: [] }, car.id, 'bore-and-hone', CONTEXT),
    ).toBe('not-in-service-bay')
    expect(machiningGateReason(state, 'no-such-car', 'bore-and-hone', CONTEXT)).toBe('not-found')
  })

  it('refuses an operation already on the part', () => {
    const { state, car } = shopWith('toyota-supra-rz-jza80', 3)
    const done = machinedCar(car, 'block', ['bore-and-hone'])
    expect(
      machiningGateReason({ ...state, ownedCars: [done] }, done.id, 'bore-and-hone', CONTEXT),
    ).toBe('already-applied')
  })
})

describe('doing the work', () => {
  it('spends the authored labour and writes the operation onto the fitted part', () => {
    const { state, car } = shopWith('toyota-supra-rz-jza80', 3)
    const result = resolveMachiningLabor(state, car.id, 'bore-and-hone', 60, CONTEXT)
    expect(result.laborSlotsUsed).toBe(operationById('bore-and-hone').labourPoints)
    expect(machiningOf(result.state.ownedCars[0]!.parts.block.installed)).toEqual(['bore-and-hone'])
    expect(result.log.some((entry) => entry.type === 'part-machined')).toBe(true)
    expect(result.state.jobs).toHaveLength(0)
  })

  it('costs no money at all', () => {
    const { state, car } = shopWith('toyota-supra-rz-jza80', 3)
    const result = resolveMachiningLabor(state, car.id, 'bore-and-hone', 60, CONTEXT)
    expect(result.state.cashYen).toBe(state.cashYen)
  })

  it('carries across days rather than needing a whole operation of labour at once', () => {
    const { state, car } = shopWith('toyota-supra-rz-jza80', 3)
    const partial = resolveMachiningLabor(state, car.id, 'bore-and-hone', 2, CONTEXT)
    expect(partial.laborSlotsUsed).toBe(2)
    expect(machiningOf(partial.state.ownedCars[0]!.parts.block.installed)).toEqual([])
    const finished = resolveMachiningLabor(partial.state, car.id, 'bore-and-hone', 60, CONTEXT)
    expect(machiningOf(finished.state.ownedCars[0]!.parts.block.installed)).toEqual([
      'bore-and-hone',
    ])
  })

  it('refuses silently when the gate refuses, spending nothing', () => {
    const { state, car } = shopWith('toyota-supra-rz-jza80', 1)
    const result = resolveMachiningLabor(state, car.id, 'bore-and-hone', 60, CONTEXT)
    expect(result.laborSlotsUsed).toBe(0)
    expect(result.state).toBe(state)
  })
})

/**
 * The failure the `PartInstance` choice exists to prevent. Seventeen
 * production sites rebuild a car's slot as a fresh `{ installed }` literal; a
 * record kept beside `installed` would be erased by the next piece of work.
 *
 * Driven through the REAL repair path for an engine part rather than a
 * constructed state, because a constructed state is exactly what would not
 * have caught it. The four machinable slots are all buried, and a buried part
 * is bench-only (`planGroupRepair` skips every non-surface slot by name), so
 * its real repair is: pull it, recondition it loose, put it back. That round
 * trip drives three of the seventeen sites - `resolveRemovePart`'s
 * `{ installed: null, vacatedBaseline }`, `updateLoosePart`'s instance
 * rewrite, and `applyJobToCar`'s `{ installed: partInstance }`.
 */
describe('machining survives a repair', () => {
  it('is still on the block after the engine comes out, is reconditioned and goes back', () => {
    const { state, car } = shopWith('toyota-supra-rz-jza80', 3, true)
    const machined = resolveMachiningLabor(state, car.id, 'bore-and-hone', 60, CONTEXT).state
    const blockId = machined.ownedCars[0]!.parts.block.installed!.id
    const worn = { ...machined, ownedCars: [wornInSlot(machined.ownedCars[0]!, 'block', 'worn')] }

    const pulled = resolveRemoveAssembly(worn, car.id, 'engineAssembly', CONTEXT)
    expect(pulled.ok, 'the engine came out').toBe(true)
    const container = pulled.state.assemblyInventory![0]!
    expect(machiningOf(container.members.block)).toEqual(['bore-and-hone'])

    const reconditioned = resolveReconditionLabor(pulled.state, blockId, 'mint', 600, CONTEXT)
    const benched = reconditioned.state.assemblyInventory![0]!.members.block!
    expect(benched.band, 'the bench repair actually climbed the band').toBe('mint')
    expect(machiningOf(benched)).toEqual(['bore-and-hone'])

    const refitted = resolveRefitAssembly(reconditioned.state, container.id, CONTEXT)
    expect(refitted.ok, 'the engine went back in').toBe(true)
    const block = refitted.state.ownedCars[0]!.parts.block.installed!
    expect(block.band).toBe('mint')
    expect(machiningOf(block)).toEqual(['bore-and-hone'])
  })
})

/**
 * The travel ruling, through the real remove-and-fit path. A machined block
 * removed and fitted to another car is still machined.
 */
describe('machining travels with the part', () => {
  it('comes off one car and goes onto another still machined', () => {
    const { state, car, model } = shopWith('toyota-supra-rz-jza80', 3, true)
    const machined = resolveMachiningLabor(state, car.id, 'bore-and-hone', 60, CONTEXT).state

    // A second car of the same model, with the block slot and everything on
    // top of it empty, so the machined block has somewhere to go.
    const target = stockCarFor(model, 'car-target-0002', ['block', ...ENGINE_COVER_SLOTS])
    const twoCars = {
      ...machined,
      ownedCars: [...machined.ownedCars, target],
      serviceBayCarIds: [car.id, target.id],
    }

    // The four engine slots come off as one unit, so the block reaches the
    // parts bin by being pulled out of its own container on the bench.
    const pulled = resolveRemoveAssembly(twoCars, car.id, 'engineAssembly', CONTEXT)
    expect(pulled.ok, 'the engine came out').toBe(true)
    const containerId = pulled.state.assemblyInventory![0]!.id
    const binned = resolveRemoveAssemblyMember(pulled.state, containerId, 'block', CONTEXT)
    expect(binned.ok, 'the block reached the parts bin').toBe(true)
    const loose = binned.state.partInventory.find((p) => machiningOf(p).includes('bore-and-hone'))
    expect(loose, 'and it was still machined when it got there').toBeDefined()

    const fitted = resolveJobLabor(
      binned.state,
      {
        carInstanceId: target.id,
        kind: 'install-part',
        componentId: 'engine',
        partInstanceId: loose!.id,
        laborSlotsRequired: 6,
      },
      600,
      CONTEXT,
    )
    const donor = fitted.state.ownedCars.find((c) => c.id === car.id)!
    const receiver = fitted.state.ownedCars.find((c) => c.id === target.id)!
    expect(machiningOf(receiver.parts.block.installed)).toEqual(['bore-and-hone'])
    // And the authenticity cost travels with it: the car that lost the block
    // is original again, the car that gained it is not.
    expect(machiningCost(donor, CONTEXT.partsById, ECONOMY)).toBe(0)
    expect(machiningCost(receiver, CONTEXT.partsById, ECONOMY)).toBe(
      operationById('bore-and-hone').authenticityCost,
    )
  })
})
