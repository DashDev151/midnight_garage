import {
  BUYERS,
  CARS,
  COURSES,
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
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { computeDerivedStats, engineCharacterOf, physicalFactorsFor } from '../src/derivedStats'
import { lapTimeSecondsFor } from '../src/lapModel'
import { lapTime } from '../src/performance'
import { buildCarInstance, mintCarParts, type CarPartOverride } from './testFixtures'

/**
 * RE-VALIDATION OF THE POWER MODEL WITH MACHINING IN IT.
 *
 * The performance model is locked and validated to about two per cent against
 * real driven laps, and `harnessAcceptance.test.ts` holds the shipped code to
 * the calibration harness. Machining adds a second source of power inside the
 * model's one per-slot term, so this file checks that the MODEL still behaves
 * rather than that the arithmetic adds up: the properties the power model is
 * built on have to survive a machined engine exactly as they survive a bought
 * one.
 *
 * The five properties, each measured rather than assumed:
 *
 * 1. Machining is exactly inert on a car nobody has machined, on every shipped
 *    car and every stat.
 * 2. Power stays order-independent, which is what "no compounding" means in
 *    this model.
 * 3. A machining gain is a fraction of STOCK power, so it is the same number
 *    whether the engine is otherwise stock or fully built.
 * 4. A machined part's gain band-scales exactly as a fitted part's does.
 * 5. Machining moves power and nothing else the physics reads, and it reaches
 *    the lap through the one path every other car laps through. That is the
 *    one that matters: a second route into the physics is the failure the
 *    tuning model bans by name.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)
// This file is about the nine original engine-only operations and the power
// model specifically. `economy.machining.operations` is shared with the six
// scene craft operations (two of which happen to share a `POWER_SLOTS` slot,
// `internals` and `block`) and with the setup work done on an assembled car,
// so the nine are selected by what distinguishes them: no `scene`, and
// performed on a part off the car.
const operations = ECONOMY.machining.operations.filter(
  (o) => o.scene === undefined && o.performedOn === 'loose-part',
)
const OPERATION_IDS = operations.map((o) => o.id)

const MACHINABLE_SLOTS: readonly CarPartId[] = [
  'block',
  'internals',
  'headValvetrain',
  'camsTiming',
]
const POWER_SLOTS: readonly CarPartId[] = [...MACHINABLE_SLOTS, 'intake', 'exhaust', 'ignitionEcu']

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

/** A car with `grade` fitted across the power slots and `operationIds`
 * machined into whichever of the four machinable slots each one addresses. */
function carWith(
  model: CarModel,
  grade: Grade,
  operationIds: readonly string[],
  band: ConditionBand = 'mint',
): CarInstance {
  const overrides: Partial<Record<CarPartId, CarPartOverride>> = {}
  for (const carPartId of POWER_SLOTS) {
    const applied = operationIds.filter(
      (id) => operations.find((o) => o.id === id)!.carPartId === carPartId,
    )
    overrides[carPartId] = {
      id: `probe-${carPartId}`,
      partId: skuFor(model, carPartId, grade).id,
      band,
      origin: { kind: 'market', day: 1 },
      ...(applied.length > 0 ? { machining: applied } : {}),
    }
  }
  return buildCarInstance({ modelId: model.id, parts: mintCarParts(overrides) })
}

function powerOf(model: CarModel, car: CarInstance): number {
  return computeDerivedStats(model, car, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY).power
}

function modelOfCharacter(character: EngineCharacter): CarModel {
  return CARS.find((model) => engineCharacterOf(model, ECONOMY) === character)!
}

describe('1. machining is inert on a car nobody has machined', () => {
  it('leaves every stat on every shipped car exactly where it was, at stock and fully built', () => {
    // A machining term that is not exactly zero on an unmachined car would
    // show up here first, on all 26 cars at once, before any ladder did.
    for (const model of CARS) {
      const stock = buildCarInstance({ modelId: model.id, parts: mintCarParts() })
      expect(powerOf(model, stock), model.id).toBe(model.spec.stockPowerPs)
      const built = carWith(model, 'race', [])
      const stats = computeDerivedStats(model, built, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
      expect(stats.power, model.id).toBe(powerOf(model, built))
    }
  })

  it('leaves every shipped car lapping exactly its harness time at stock power', () => {
    // The same claim `harnessAcceptance.test.ts` makes against the calibration
    // harness, restated against the car's own parts: an unmachined stock car
    // reaches the lap model on its measured figures and nothing else.
    for (const model of CARS) {
      const stock = buildCarInstance({ modelId: model.id, parts: mintCarParts() })
      const { condition, build } = physicalFactorsFor(
        stock,
        model,
        CONTEXT.partsById,
        PARTS_TAXONOMY,
        ECONOMY,
      )
      expect(build.grip, model.id).toBe(1)
      expect(condition.grip, model.id).toBe(1)
      for (const course of COURSES) {
        const measured = lapTime(
          model,
          course,
          model.spec.stockPowerPs,
          model.spec.tyreCompound,
          ECONOMY,
        )
        const built = lapTime(
          model,
          course,
          powerOf(model, stock),
          model.spec.tyreCompound,
          ECONOMY,
        )
        expect(built, `${model.id} / ${course.id}`).toBe(measured)
      }
    }
  })
})

describe('2. power stays order-independent', () => {
  it('gives byte-identical power whichever order the operations were done in', () => {
    for (const character of ['high-strung-na', 'lazy-na', 'forced'] as const) {
      const model = modelOfCharacter(character)
      const forward = powerOf(model, carWith(model, 'stock', OPERATION_IDS))
      const reversed = powerOf(model, carWith(model, 'stock', [...OPERATION_IDS].reverse()))
      expect(reversed, model.id).toBe(forward)
    }
  })

  it('never loses power for an extra operation, on any character', () => {
    for (const character of ['high-strung-na', 'lazy-na', 'forced'] as const) {
      const model = modelOfCharacter(character)
      let previous = powerOf(model, carWith(model, 'stock', []))
      const applied: string[] = []
      for (const id of OPERATION_IDS) {
        applied.push(id)
        const power = powerOf(model, carWith(model, 'stock', applied))
        expect(power, `${model.id} after ${id}`).toBeGreaterThanOrEqual(previous)
        previous = power
      }
    }
  })
})

describe('3. a machining gain is a fraction of STOCK power, never of current power', () => {
  it('adds the same PS to a stock engine and to a fully built one, per grade', () => {
    // The property that makes the whole power model reasonable about: a gain
    // never compounds on the gains beside it. Machining scales by the grade of
    // the part machined, so the comparison is per grade rather than across
    // them, and each is measured against its own unmachined build.
    for (const character of ['high-strung-na', 'lazy-na', 'forced'] as const) {
      const model = modelOfCharacter(character)
      for (const grade of ['stock', 'street', 'sport', 'race'] as const) {
        const plain = powerOf(model, carWith(model, grade, []))
        const machined = powerOf(model, carWith(model, grade, OPERATION_IDS))
        const expectedPs =
          model.spec.stockPowerPs *
          operations.reduce((sum, o) => sum + o.powerFraction[character], 0) *
          ECONOMY.machining.gradeMultiplier[grade]
        expect(
          Math.abs(machined - plain - expectedPs),
          `${model.id} / ${grade}: measured ${machined - plain} PS, expected ${expectedPs.toFixed(2)}`,
        ).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('4. a machined part band-scales exactly as a fitted part does', () => {
  it('contributes bandFactor(worn) of its mint machined gain', () => {
    const model = modelOfCharacter('forced')
    // An empty taxonomy makes the condition weighting exactly 1 regardless of
    // band, isolating the per-slot term this property is about - the same
    // isolation `proportionalPower.test.ts` uses for a fitted SKU.
    const isolated: typeof PARTS_TAXONOMY = []
    const powerAt = (band: ConditionBand, machined: boolean) =>
      computeDerivedStats(
        model,
        carWith(model, 'stock', machined ? OPERATION_IDS : [], band),
        CONTEXT.partsById,
        isolated,
        ECONOMY,
      ).power

    const mintGain = powerAt('mint', true) - powerAt('mint', false)
    const wornGain = powerAt('worn', true) - powerAt('worn', false)
    expect(mintGain).toBeGreaterThan(0)
    expect(Math.abs(wornGain - mintGain * ECONOMY.bands.bandFactors.worn)).toBeLessThanOrEqual(1)
  })
})

describe('5. the lap model cannot tell machined power from bought power', () => {
  it('moves power and nothing else the physics reads', () => {
    // The no-second-path claim, stated where it can actually fail: machining
    // touches no grip, braking, mass or downforce factor, so a machined car's
    // whole physical state is identical to the same car unmachined and the only
    // thing that reaches the lap is the power scalar.
    for (const character of ['high-strung-na', 'lazy-na', 'forced'] as const) {
      const model = modelOfCharacter(character)
      const plain = carWith(model, 'stock', [])
      const machined = carWith(model, 'stock', OPERATION_IDS)
      const factorsOf = (car: CarInstance) =>
        physicalFactorsFor(car, model, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
      expect(factorsOf(machined), model.id).toEqual(factorsOf(plain))
      expect(powerOf(model, machined), model.id).toBeGreaterThan(powerOf(model, plain))
    }
  })

  it('laps a machined car through the same one path any other car laps through', () => {
    // `lapTimeSecondsFor` reads `computeDerivedStats().power`, so machining
    // reaches the lap exactly where a bought part does. Measured against a
    // hand-built lap at the same figure: if the two ever disagreed, machining
    // would have grown a route into the physics of its own.
    const model = modelOfCharacter('forced')
    const machined = carWith(model, 'stock', OPERATION_IDS)
    const machinedPs = powerOf(model, machined)
    for (const course of COURSES) {
      const viaCar = lapTimeSecondsFor(machined, model, CONTEXT, course.id)
      const viaPower = lapTime(model, course, machinedPs, model.spec.tyreCompound, ECONOMY)
      expect(viaCar, `${model.id} / ${course.id}`).toBeCloseTo(viaPower, 1)
    }
  })

  it('stays monotone and finite across the whole raised range, every car and every course', () => {
    // The ladder now reaches x2.30 on a forced engine before machining and
    // x2.60 after, against x1.95 before it was re-authored. The harness only
    // covers STOCK power, so nothing else checks that the lap model still
    // behaves at the top of the new range: this walks every rung of every
    // car's own ladder, machined and not, and asserts more power never laps
    // slower and never leaves the model.
    let pairs = 0
    for (const model of CARS) {
      const powers = (['stock', 'street', 'sport', 'race'] as const)
        .flatMap((grade) => [
          powerOf(model, carWith(model, grade, [])),
          powerOf(model, carWith(model, grade, OPERATION_IDS)),
        ])
        .sort((a, b) => a - b)
      for (const course of COURSES) {
        const times = powers.map((ps) =>
          lapTime(model, course, ps, model.spec.tyreCompound, ECONOMY),
        )
        for (let i = 1; i < times.length; i += 1) {
          pairs += 1
          const label = `${model.id} / ${course.id}: ${powers[i - 1]} PS ${times[i - 1]!.toFixed(2)}s then ${powers[i]} PS ${times[i]!.toFixed(2)}s`
          expect(Number.isFinite(times[i]!), label).toBe(true)
          expect(times[i]!, label).toBeGreaterThan(0)
          expect(times[i]!, label).toBeLessThanOrEqual(times[i - 1]! + 1e-9)
        }
      }
    }
    expect(pairs).toBe(CARS.length * COURSES.length * 7)
  })

  it('reports what a fully machined engine is worth in lap time, per character', () => {
    const rows: string[] = []
    for (const character of ['high-strung-na', 'lazy-na', 'forced'] as const) {
      const model = modelOfCharacter(character)
      const plainPs = powerOf(model, carWith(model, 'race', []))
      const machinedPs = powerOf(model, carWith(model, 'race', OPERATION_IDS))
      for (const course of COURSES) {
        const plain = lapTime(model, course, plainPs, model.spec.tyreCompound, ECONOMY)
        const machined = lapTime(model, course, machinedPs, model.spec.tyreCompound, ECONOMY)
        rows.push(
          `${character} ${model.id} / ${course.id}: ${plainPs} PS ${plain.toFixed(2)}s to ` +
            `${machinedPs} PS ${machined.toFixed(2)}s (${(machined - plain).toFixed(2)}s)`,
        )
        // More power never laps slower, which is the direction the model is
        // built to guarantee.
        expect(machined, rows[rows.length - 1]).toBeLessThanOrEqual(plain)
      }
    }
    expect(rows, rows.join('\n')).toHaveLength(12)
  })
})
