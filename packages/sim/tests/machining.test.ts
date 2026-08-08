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
  type PartInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import {
  authenticityPercentOf,
  computeDerivedStats,
  engineCharacterOf,
  machiningCost,
} from '../src/derivedStats'
import { machiningAuthenticityCostOf, machiningOf, machiningPremiumYenOf } from '../src/machining'
import {
  fittedMachiningOffersFor,
  machiningGateReason,
  machiningReadingFor,
  resolveMachiningLabor,
} from '../src/machiningJobs'
import { installedPartsValueYen, retentionFor } from '../src/marketValue'
import { resolveJobLabor, resolveReconditionLabor } from '../src/jobs'
import { resolvePlaceOnStation, resolveTakeFromStation } from '../src/parts'
import { supportRatios, supportVerdict } from '../src/support'
import { championStatFor, saleOutcomeFor } from '../src/valuation'
import { createInitialGameState } from '../src/newGame'
import {
  buildCarInstance,
  mintCarParts,
  testToolShopsOwned,
  testToolTiers,
  type CarPartOverride,
} from './testFixtures'

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
// This file is about the nine original engine-only operations specifically
// (the ladder, the support-only pair, the gate, the workshop flow). The
// catalogue they live in (`economy.machining.operations`) is shared with the
// six scene craft operations and with the setup work done on an assembled
// car, so the nine are selected by what distinguishes them: no `scene`, and
// performed on a part off the car.
const operations = ECONOMY.machining.operations.filter(
  (o) => o.scene === undefined && o.performedOn === 'loose-part',
)
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

  it('sums to 5.55 authenticity points on a fully machined engine', () => {
    expect(operations.reduce((sum, o) => sum + o.authenticityCost, 0)).toBeCloseTo(5.55, 10)
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

interface LooseBlockOptions {
  band?: ConditionBand
  /** Leave the block in the warehouse instead of carrying it to the machine. */
  onMachine?: boolean
}

/**
 * A shop with one loose block in the warehouse and, unless the test says
 * otherwise, that block already on the machine. This is the whole of the setup
 * a machining test needs: an operation addresses a PART, so there is no car, no
 * service bay and no ramp anywhere in it.
 */
function shopWithLooseBlock(
  modelId: string,
  engineLevel: 1 | 2 | 3,
  options: LooseBlockOptions = {},
) {
  const state = createInitialGameState(CONTEXT, 1)
  const model = CARS.find((c) => c.id === modelId)!
  const blockSku = CONTEXT.stockPartByCarPartId[fitmentClassForTier(model.tier)].block!
  const block: PartInstance = {
    id: 'pi-loose-block',
    partId: blockSku.id,
    band: options.band ?? 'mint',
    origin: { kind: 'market', day: 1 },
  }
  return {
    model,
    blockId: block.id,
    state: {
      ...state,
      cashYen: 5_000_000,
      partInventory: [block],
      machinePartId: options.onMachine === false ? null : block.id,
      toolTiers: testToolTiers({ engine: engineLevel === 3 ? 2 : engineLevel }),
      toolShopsOwned: engineLevel >= 3 ? testToolShopsOwned('engine') : [],
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
      const { state, blockId } = shopWithLooseBlock('toyota-supra-rz-jza80', tier)
      expect(machiningGateReason(state, blockId, 'bore-and-hone', CONTEXT), `tier ${tier}`).toBe(
        'tool-tier',
      )
    }
  })

  it('allows it at the tooling tier', () => {
    const { state, blockId } = shopWithLooseBlock(
      'toyota-supra-rz-jza80',
      ECONOMY.machining.minEngineToolTier,
    )
    expect(machiningGateReason(state, blockId, 'bore-and-hone', CONTEXT)).toBeNull()
  })

  it('refuses every band below mint', () => {
    for (const band of ['scrap', 'poor', 'worn', 'fine'] as const) {
      const { state, blockId } = shopWithLooseBlock('toyota-supra-rz-jza80', 3, { band })
      expect(machiningGateReason(state, blockId, 'bore-and-hone', CONTEXT), band).toBe('not-mint')
    }
  })

  it('refuses a part still in the warehouse, and one it has never heard of', () => {
    const { state, blockId } = shopWithLooseBlock('toyota-supra-rz-jza80', 3, { onMachine: false })
    expect(machiningGateReason(state, blockId, 'bore-and-hone', CONTEXT)).toBe('not-on-machine')
    expect(machiningGateReason(state, 'no-such-part', 'bore-and-hone', CONTEXT)).toBe('not-found')
  })

  it('refuses an operation that belongs to another slot', () => {
    const { state, blockId } = shopWithLooseBlock('toyota-supra-rz-jza80', 3)
    const elsewhere = operations.find((o) => o.carPartId !== 'block')!
    expect(machiningGateReason(state, blockId, elsewhere.id, CONTEXT)).toBe('wrong-slot')
  })

  it('refuses an operation already on the part', () => {
    const { state, blockId } = shopWithLooseBlock('toyota-supra-rz-jza80', 3)
    const done = resolveMachiningLabor(state, blockId, 'bore-and-hone', 60, CONTEXT).state
    expect(machiningGateReason(done, blockId, 'bore-and-hone', CONTEXT)).toBe('already-applied')
  })
})

describe('doing the work', () => {
  it('spends the authored labour and writes the operation onto the loose part', () => {
    const { state, blockId } = shopWithLooseBlock('toyota-supra-rz-jza80', 3)
    const result = resolveMachiningLabor(state, blockId, 'bore-and-hone', 60, CONTEXT)
    expect(result.laborSlotsUsed).toBe(operationById('bore-and-hone').labourPoints)
    expect(machiningOf(result.state.partInventory[0])).toEqual(['bore-and-hone'])
    expect(result.log.some((entry) => entry.type === 'part-machined')).toBe(true)
    expect(result.state.jobs).toHaveLength(0)
  })

  it('costs no money at all', () => {
    const { state, blockId } = shopWithLooseBlock('toyota-supra-rz-jza80', 3)
    const result = resolveMachiningLabor(state, blockId, 'bore-and-hone', 60, CONTEXT)
    expect(result.state.cashYen).toBe(state.cashYen)
  })

  it('carries across days rather than needing a whole operation of labour at once', () => {
    const { state, blockId } = shopWithLooseBlock('toyota-supra-rz-jza80', 3)
    const partial = resolveMachiningLabor(state, blockId, 'bore-and-hone', 2, CONTEXT)
    expect(partial.laborSlotsUsed).toBe(2)
    expect(machiningOf(partial.state.partInventory[0])).toEqual([])
    const finished = resolveMachiningLabor(partial.state, blockId, 'bore-and-hone', 60, CONTEXT)
    expect(machiningOf(finished.state.partInventory[0])).toEqual(['bore-and-hone'])
  })

  it('refuses silently when the gate refuses, spending nothing', () => {
    const { state, blockId } = shopWithLooseBlock('toyota-supra-rz-jza80', 1)
    const result = resolveMachiningLabor(state, blockId, 'bore-and-hone', 60, CONTEXT)
    expect(result.laborSlotsUsed).toBe(0)
    expect(result.state).toBe(state)
  })
})

/**
 * The failure the `PartInstance` choice exists to prevent. Production sites
 * rebuild a part's home as a fresh literal all over the sim; a record kept
 * beside the instance would be erased by the next piece of work.
 *
 * Driven through the REAL bench path rather than a constructed state, because a
 * constructed state is exactly what would not have caught it: the machined
 * block is worn down, carried from the machine to the bench, and reconditioned
 * there, which drives `updateLoosePart`'s own instance rewrite.
 */
describe('machining survives a repair', () => {
  it('is still on the block after it is worn down and reconditioned at the bench', () => {
    const { state, blockId } = shopWithLooseBlock('toyota-supra-rz-jza80', 3)
    const machined = resolveMachiningLabor(state, blockId, 'bore-and-hone', 60, CONTEXT).state

    // Bands are the one thing a unit test sets by hand; the machining record is
    // always written by the real resolver above.
    const worn = {
      ...machined,
      partInventory: machined.partInventory.map((p) =>
        p.id === blockId ? { ...p, band: 'worn' as const } : p,
      ),
    }
    const onBench = resolvePlaceOnStation(
      resolveTakeFromStation(worn, 'machine'),
      'workbench',
      blockId,
    )
    const reconditioned = resolveReconditionLabor(onBench, blockId, 'mint', 600, CONTEXT)
    const benched = reconditioned.state.partInventory.find((p) => p.id === blockId)!
    expect(benched.band, 'the bench repair actually climbed the band').toBe('mint')
    expect(machiningOf(benched)).toEqual(['bore-and-hone'])
  })
})

/**
 * The travel ruling, through the real fit path. A block machined off the car
 * carries its work, and its authenticity cost, onto whatever car it goes on.
 */
describe('machining travels with the part', () => {
  it('goes onto a car still machined, and takes its originality cost with it', () => {
    const { state, model, blockId } = shopWithLooseBlock('toyota-supra-rz-jza80', 3)
    const machined = resolveMachiningLabor(state, blockId, 'bore-and-hone', 60, CONTEXT).state

    // A car with the block slot and everything on top of it empty, so the
    // machined block has somewhere to go.
    const target = stockCarFor(model, 'car-target-0002', ['block', ...ENGINE_COVER_SLOTS])
    const untouched = stockCarFor(model, 'car-stock-0003')
    const withCar = {
      ...machined,
      ownedCars: [target, untouched],
      serviceBayCarIds: [target.id],
    }

    const fitted = resolveJobLabor(
      withCar,
      {
        carInstanceId: target.id,
        kind: 'install-part',
        componentId: 'engine',
        partInstanceId: blockId,
        laborSlotsRequired: 6,
      },
      600,
      CONTEXT,
    )
    const receiver = fitted.state.ownedCars.find((c) => c.id === target.id)!
    const stock = fitted.state.ownedCars.find((c) => c.id === untouched.id)!
    expect(machiningOf(receiver.parts.block.installed)).toEqual(['bore-and-hone'])
    // Fitting it also cleared the machine: the part is on a car now.
    expect(fitted.state.machinePartId).toBeNull()
    expect(machiningCost(stock, CONTEXT.partsById, ECONOMY)).toBe(0)
    expect(machiningCost(receiver, CONTEXT.partsById, ECONOMY)).toBe(
      operationById('bore-and-hone').authenticityCost,
    )
  })
})

/**
 * The authenticity charge is a fact about the part's grade, and every surface
 * that quotes it reads the same function (`machiningAuthenticityCostOf`): the
 * car's own sheet, the machine shop's quote for the part on the machine, and
 * the car's own setup offers. A preview that decided it for itself is exactly
 * how the three came to disagree about a SKU the catalogue cannot resolve.
 */
describe('the authenticity charge, one rule and three quotes', () => {
  // The whole slot catalogue, scene operations included - the machine shop
  // quotes every loose-part operation the block has, so the sheet has to be
  // checked against all of them rather than this file's engine-only subset.
  const BLOCK_OPERATIONS = ECONOMY.machining.operations.filter(
    (o) => o.carPartId === 'block' && o.performedOn === 'loose-part',
  )

  it('charges a stock part its full rating, an aftermarket part nothing, and an unknown SKU nothing', () => {
    const model = MODEL_BY_CHARACTER.forced
    const stockSku = skuFor(model, 'block', 'stock')
    const raceSku = skuFor(model, 'block', 'race')
    for (const operation of BLOCK_OPERATIONS) {
      expect(machiningAuthenticityCostOf(operation, stockSku)).toBe(operation.authenticityCost)
      expect(machiningAuthenticityCostOf(operation, raceSku)).toBe(0)
      // An unknown SKU is not a stock part: there is no originality on record
      // to take away, so nothing is charged.
      expect(machiningAuthenticityCostOf(operation, undefined)).toBe(0)
    }
  })

  it("the machine shop's quote for the part on the machine is what the car is then charged", () => {
    const { state, blockId } = shopWithLooseBlock('toyota-supra-rz-jza80', 3)
    const reading = machiningReadingFor(state, CONTEXT)!
    expect(reading.partInstanceId).toBe(blockId)
    for (const offer of reading.offers) {
      expect(offer.authenticityCost, offer.operation.id).toBe(
        machiningAuthenticityCostOf(offer.operation, reading.part),
      )
    }

    const model = MODEL_BY_CHARACTER.forced
    const quotedYen = reading.offers.reduce((sum, offer) => sum + offer.authenticityCost, 0)
    const stockCar = machinedCar(
      ladderCar(model, 'stock', false),
      'block',
      BLOCK_OPERATIONS.map((o) => o.id),
    )
    expect(machiningCost(stockCar, CONTEXT.partsById, ECONOMY)).toBe(quotedYen)

    // The same operations on a race block cost the slot nothing: it had no
    // originality left to lose.
    const raceCar = machinedCar(
      ladderCar(model, 'race', false),
      'block',
      BLOCK_OPERATIONS.map((o) => o.id),
    )
    expect(machiningCost(raceCar, CONTEXT.partsById, ECONOMY)).toBe(0)
  })

  it('a setup offer on a slot holding a SKU the catalogue cannot resolve charges nothing', () => {
    const model = MODEL_BY_CHARACTER.forced
    const base = stockCarFor(model, 'car-unknown-rims-0001')
    const car: CarInstance = {
      ...base,
      parts: {
        ...base.parts,
        rims: {
          installed: {
            id: 'pi-unknown-rims',
            partId: 'no-such-sku',
            band: 'mint',
            origin: { kind: 'market', day: 1 },
          },
        },
      },
    }
    const state = {
      ...createInitialGameState(CONTEXT, 1),
      ownedCars: [car],
      serviceBayCarIds: [car.id],
      toolShopsOwned: testToolShopsOwned('wheels'),
    }
    const offers = fittedMachiningOffersFor(state, car.id, 'rims', CONTEXT)
    expect(offers.length).toBeGreaterThan(0)
    for (const offer of offers) {
      expect(offer.authenticityCost, offer.operation.id).toBe(0)
      expect(offer.operation.authenticityCost, 'the rating itself is non-zero').toBeGreaterThan(0)
    }
  })
})

/**
 * The spec the authenticity scale is sized to: machining is how a collector car
 * gains without losing its originality, so a player can apply every operation
 * the catalogue offers to one and still sell it to a Collector.
 *
 * Authenticity is the Collector's champion stat, so their target is the whole
 * budget: an original car starts at 100 and the gate sits at 90, which leaves
 * ten points for every operation on the car put together. Measured through the
 * real path rather than by re-summing the table - the same `machiningCost`
 * the radar reads, the same `saleOutcomeFor` a sale reads.
 */
describe("a fully machined collector car still clears the Collector's gate", () => {
  const COLLECTOR = BUYERS.find((buyer) => buyer.archetype === 'collector')!
  /** A rare flagship kyusha: the Collector's own top culture weight, and the
   * kind of car the work exists for. */
  const MODEL = CARS.find((car) => car.id === 'toyota-2000gt-mf10')!
  const ALL_OPERATIONS = ECONOMY.machining.operations
  /** The nine done at the machine on the engine's own castings, which is the
   * reach of a shop that has bought its machines and taken no car apart for
   * setup work. */
  const MACHINE_SHOP_ONLY = operations

  function machinedWith(applied: readonly MachiningOperation[]): CarInstance {
    let car = stockCarFor(MODEL, 'car-collector-0001')
    for (const operation of applied) car = machinedCar(car, operation.carPartId, [operation.id])
    return car
  }

  function authenticityOf(car: CarInstance): number {
    return authenticityPercentOf(car, MODEL, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
  }

  function sellTo(car: CarInstance) {
    return saleOutcomeFor(COLLECTOR, MODEL, car, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
  }

  it('is the right buyer and the right car to measure it on', () => {
    expect(championStatFor(COLLECTOR)).toBe('authenticity')
    expect(COLLECTOR.statTargets.authenticity.target).toBe(0.9)
    expect(MODEL.tier).toBe('flagship')
    // The control: untouched, the car is perfectly original and sells.
    const untouched = stockCarFor(MODEL, 'car-collector-0001')
    expect(authenticityOf(untouched)).toBe(100)
    expect(sellTo(untouched)).not.toBe('nothing')
  })

  it('sells after every one of the sixteen operations', () => {
    const car = machinedWith(ALL_OPERATIONS)
    expect(ALL_OPERATIONS).toHaveLength(16)
    expect(machiningCost(car, CONTEXT.partsById, ECONOMY)).toBeCloseTo(7.15, 10)
    expect(authenticityOf(car)).toBe(93)
    expect(sellTo(car)).not.toBe('nothing')
  })

  it('sells after the nine done at the machine', () => {
    const car = machinedWith(MACHINE_SHOP_ONLY)
    expect(MACHINE_SHOP_ONLY).toHaveLength(9)
    expect(machiningCost(car, CONTEXT.partsById, ECONOMY)).toBeCloseTo(5.55, 10)
    expect(authenticityOf(car)).toBe(94)
    expect(sellTo(car)).not.toBe('nothing')
  })

  it('leaves the same car above the Collector reliability target too', () => {
    const car = machinedWith(ALL_OPERATIONS)
    const stats = computeDerivedStats(MODEL, car, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
    expect(stats.reliability).toBe(73)
    expect(stats.reliability / 100).toBeGreaterThanOrEqual(COLLECTOR.statTargets.reliability.target)
  })

  it('costs the machining budget nothing to restore a part to factory specification', () => {
    const restored = ALL_OPERATIONS.find((o) => o.id === 'period-correct-restoration')!
    expect(restored.authenticityCost).toBe(0)
    expect(authenticityOf(machinedWith([restored]))).toBe(100)
  })
})
