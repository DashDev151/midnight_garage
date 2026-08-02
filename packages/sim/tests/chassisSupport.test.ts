import {
  BUYERS,
  CARS,
  COURSES,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ConditionBand,
  type EconomyConfig,
  type Grade,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { computeDerivedStats, physicalFactorsFor } from '../src/derivedStats'
import { lapTimeSecondsFor } from '../src/lapModel'
import { STOCK_BUILD_FACTORS } from '../src/performance'
import { usableGripFraction } from '../src/support'
import { carWithGrades } from './testFixtures'

/**
 * GRIP A BUILD CANNOT USE.
 *
 * A proportion of the grip a build gained is unusable while the brakes,
 * steering and chassis that control it sit below the grade of the parts that
 * made it. This file holds the properties that make that a fair rule rather
 * than a tax: the grade ladder never inverts, a stock car is untouched, a
 * downgrade is left alone, letting a car rot is not an escape, and every
 * support part is worth buying on its own.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

/**
 * The same content with this model switched off - every loss fraction at zero,
 * which by the formula's own shape leaves `usable` equal to what the build
 * makes. Comparing against it isolates the chassis-support loss from
 * everything else a build does, so a difference here is this model and nothing
 * else.
 */
const ECONOMY_WITHOUT_LOSS: EconomyConfig = (() => {
  const config = structuredClone(ECONOMY) as EconomyConfig
  config.statFormulas.chassisSupport.lossByGrade.street = 0
  config.statFormulas.chassisSupport.lossByGrade.sport = 0
  config.statFormulas.chassisSupport.lossByGrade.race = 0
  return config
})()

const CONTEXT_WITHOUT_LOSS = { ...CONTEXT, economy: ECONOMY_WITHOUT_LOSS }

/** The five slots whose fitted grade decides how much grip a build makes. */
const GRIP_SLOTS: readonly CarPartId[] = ['tyres', 'dampers', 'springs', 'antiRollBars', 'aero']

/** The four slots that carry the shortfall, brakes counting as two. */
const SUPPORT_SLOTS: readonly CarPartId[] = [
  'brakePadsDiscs',
  'brakeCalipersLines',
  'steering',
  'chassis',
]

const BUILD_GRADES: readonly Grade[] = ['street', 'sport', 'race']

/**
 * The eleven support levels the ladder is proved over: the eight subsets of
 * {brakes, steering, chassis} fitted at the build's own grade, plus all three
 * fitted uniformly at street, sport and race. The last three are the cases a
 * subset cannot express - support that is present but not good enough.
 */
const SUPPORT_SUBSETS: readonly (readonly CarPartId[])[] = [
  [],
  ['brakePadsDiscs', 'brakeCalipersLines'],
  ['steering'],
  ['chassis'],
  ['brakePadsDiscs', 'brakeCalipersLines', 'steering'],
  ['brakePadsDiscs', 'brakeCalipersLines', 'chassis'],
  ['steering', 'chassis'],
  SUPPORT_SLOTS,
]

const S13 = CARS.find((car) => car.id === 'nissan-silvia-s13')!
const FD3S = CARS.find((car) => car.id === 'mazda-rx7-fd3s')!

/** The four cars the design was measured on, one per tier. */
const MEASURED_CARS: readonly CarModel[] = [
  CARS.find((car) => car.id === 'suzuki-alto-works-ha21s')!,
  S13,
  FD3S,
  CARS.find((car) => car.id === 'nissan-skyline-gtr-bnr32')!,
]

/** The three shipped cars whose factory rubber beats what a street tyre SKU
 * maps to, so fitting street tyres genuinely makes them worse. */
const DOWNGRADE_CARS: readonly CarModel[] = [
  FD3S,
  CARS.find((car) => car.id === 'toyota-supra-rz-jza80')!,
  CARS.find((car) => car.id === 'toyota-aristo-30v-jzs147')!,
]

function gradesFor(slots: readonly CarPartId[], grade: Grade): Partial<Record<CarPartId, Grade>> {
  return Object.fromEntries(slots.map((slot) => [slot, grade]))
}

/** A car with every grip slot at `gripGrade` and the named support slots at
 * `supportGrade`, everything else stock, all of it at one condition band. */
function built(
  model: CarModel,
  gripGrade: Grade,
  support: readonly CarPartId[] = [],
  supportGrade: Grade = gripGrade,
  band: ConditionBand = 'mint',
): CarInstance {
  return carWithGrades(
    model,
    CONTEXT,
    { ...gradesFor(GRIP_SLOTS, gripGrade), ...gradesFor(support, supportGrade) },
    band,
  )
}

function handlingOf(model: CarModel, car: CarInstance, economy: EconomyConfig): number {
  return computeDerivedStats(model, car, CONTEXT.partsById, PARTS_TAXONOMY, economy).handling
}

/** The handling readout with the model in force and with it switched off. */
function handlingPair(model: CarModel, car: CarInstance): { on: number; off: number } {
  return {
    on: handlingOf(model, car, ECONOMY),
    off: handlingOf(model, car, ECONOMY_WITHOUT_LOSS),
  }
}

function lapsOf(model: CarModel, car: CarInstance, context: typeof CONTEXT): (number | null)[] {
  return COURSES.map((course) => lapTimeSecondsFor(car, model, context, course.id))
}

describe('a stock car is exactly untouched', () => {
  it('leaves the build factors at the stock identity on all 26 shipped cars', () => {
    for (const model of CARS) {
      const car = carWithGrades(model, CONTEXT, {})
      expect(
        usableGripFraction(
          car,
          model,
          CONTEXT.partsById,
          ECONOMY,
          physicalFactorsFor(car, model, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY).condition,
          STOCK_BUILD_FACTORS,
        ),
        model.id,
      ).toBe(1)
      expect(
        physicalFactorsFor(car, model, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY).build,
        model.id,
      ).toEqual(STOCK_BUILD_FACTORS)
    }
  })

  it('reads the same handling and the same four lap times as it would with the model off, all 26', () => {
    for (const model of CARS) {
      const car = carWithGrades(model, CONTEXT, {})
      const { on, off } = handlingPair(model, car)
      expect(on, model.id).toBe(off)
      expect(lapsOf(model, car, CONTEXT), model.id).toEqual(
        lapsOf(model, car, CONTEXT_WITHOUT_LOSS),
      )
    }
  })

  it('stays untouched at every condition band, so a tired stock car is not charged either', () => {
    for (const band of ['fine', 'worn', 'poor', 'scrap'] as const) {
      for (const model of CARS) {
        const car = carWithGrades(model, CONTEXT, {}, band)
        const { on, off } = handlingPair(model, car)
        expect(on, `${model.id} @${band}`).toBe(off)
      }
    }
  })
})

describe('the grade ladder never inverts', () => {
  /**
   * 26 cars x 11 support levels x 2 adjacent pairs = 572 comparisons, the
   * property the whole design rests on: race rubber is always better than
   * sport, which is always better than street. It is simply LESS better when
   * nothing supports it, because a proportion of a larger gain is still
   * larger. A flat penalty broke this on 327 builds, which is why the loss is
   * proportional.
   */
  it('street reads below sport reads below race, on every car at every support level', () => {
    const levels: { label: string; grades: (grade: Grade) => Partial<Record<CarPartId, Grade>> }[] =
      [
        ...SUPPORT_SUBSETS.map((subset) => ({
          label: `own grade: ${subset.join('+') || 'nothing'}`,
          grades: (grade: Grade) => ({
            ...gradesFor(GRIP_SLOTS, grade),
            ...gradesFor(subset, grade),
          }),
        })),
        ...BUILD_GRADES.map((supportGrade) => ({
          label: `all support at ${supportGrade}`,
          grades: (grade: Grade) => ({
            ...gradesFor(GRIP_SLOTS, grade),
            ...gradesFor(SUPPORT_SLOTS, supportGrade),
          }),
        })),
      ]

    const violations: string[] = []
    for (const model of CARS) {
      for (const level of levels) {
        const rungs = BUILD_GRADES.map((grade) =>
          handlingOf(model, carWithGrades(model, CONTEXT, level.grades(grade)), ECONOMY),
        )
        for (let i = 1; i < rungs.length; i++) {
          if (!(rungs[i]! > rungs[i - 1]!)) {
            violations.push(
              `${model.id} / ${level.label}: ${BUILD_GRADES[i]} ${rungs[i]} is not above ${BUILD_GRADES[i - 1]} ${rungs[i - 1]}`,
            )
          }
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('an unsupported race build still beats a fully supported sport one, on every car', () => {
    for (const model of CARS) {
      const unsupportedRace = handlingOf(model, built(model, 'race'), ECONOMY)
      const supportedSport = handlingOf(model, built(model, 'sport', SUPPORT_SLOTS), ECONOMY)
      expect(unsupportedRace, model.id).toBeGreaterThan(supportedSport)
    }
  })
})

describe('every support part is worth buying on its own', () => {
  /**
   * The brake share splits across both brake slots rather than reading the
   * worse of the two, so the FIRST brake part a player buys returns something.
   * Reading the worse of them made pads worth exactly nothing and calipers
   * worth five, which reads as a bug at the parts counter.
   */
  it('adding one support part to an unsupported race build raises handling, on every car', () => {
    const purchases: readonly (readonly CarPartId[])[] = [
      ['brakePadsDiscs'],
      ['brakeCalipersLines'],
      ['brakePadsDiscs', 'brakeCalipersLines'],
      ['steering'],
      ['chassis'],
    ]
    for (const model of CARS) {
      const unsupported = handlingOf(model, built(model, 'race'), ECONOMY)
      for (const purchase of purchases) {
        const fitted = handlingOf(model, built(model, 'race', purchase), ECONOMY)
        expect(fitted, `${model.id} + ${purchase.join('+')}`).toBeGreaterThan(unsupported)
      }
    }
  })

  it('a fully supported build recovers every point, on every car', () => {
    for (const model of CARS) {
      const { on, off } = handlingPair(model, built(model, 'race', SUPPORT_SLOTS))
      expect(on, model.id).toBe(off)
      expect(lapsOf(model, built(model, 'race', SUPPORT_SLOTS), CONTEXT), model.id).toEqual(
        lapsOf(model, built(model, 'race', SUPPORT_SLOTS), CONTEXT_WITHOUT_LOSS),
      )
    }
  })

  /**
   * Gain is measured in EFFECTIVE grip, so a wing pays towards the bar it
   * raises. Measured in mechanical grip alone it would raise `required` to
   * race, be worth the largest single handling gain in the game, and be
   * charged nothing at all.
   */
  it('a race wing on its own is charged, on every car', () => {
    for (const model of CARS) {
      const wing = carWithGrades(model, CONTEXT, { aero: 'race' })
      const { on, off } = handlingPair(model, wing)
      expect(on, model.id).toBeLessThan(off)
    }
  })
})

describe('a downgrade stays a downgrade', () => {
  /**
   * Three shipped cars left the factory on rubber better than a street SKU
   * maps to, so street tyres genuinely make them worse. There is no extra
   * grip to support, so the model has nothing to say: clamping the gain to
   * zero would erase the downgrade, and letting a negative gain through the
   * multiply would make missing support IMPROVE the car.
   */
  it('street tyres read identically with the model and without it', () => {
    for (const model of DOWNGRADE_CARS) {
      const downgraded = carWithGrades(model, CONTEXT, { tyres: 'street' })
      const { on, off } = handlingPair(model, downgraded)
      expect(on, model.id).toBe(off)
      expect(on, model.id).toBeLessThan(
        handlingOf(model, carWithGrades(model, CONTEXT, {}), ECONOMY),
      )
      expect(lapsOf(model, downgraded, CONTEXT), model.id).toEqual(
        lapsOf(model, downgraded, CONTEXT_WITHOUT_LOSS),
      )
    }
  })

  it('missing support does not improve a downgraded car', () => {
    for (const model of DOWNGRADE_CARS) {
      const unsupported = handlingOf(
        model,
        carWithGrades(model, CONTEXT, { tyres: 'street' }),
        ECONOMY,
      )
      for (const supportGrade of BUILD_GRADES) {
        const supported = handlingOf(
          model,
          carWithGrades(model, CONTEXT, {
            tyres: 'street',
            ...gradesFor(['brakePadsDiscs', 'brakeCalipersLines', 'steering'], supportGrade),
          }),
          ECONOMY,
        )
        expect(supported, `${model.id} support at ${supportGrade}`).toBe(unsupported)
      }
    }
  })
})

describe('rot is not a way out', () => {
  /**
   * The factory reference is read at the car's OWN condition, so a tired car
   * is charged its share of the smaller gain a tired car really makes. Read
   * against a mint reference, every rough car would show no gain at all and
   * dodge the model entirely, which would make letting a car rot an exploit.
   */
  it('an unsupported race build still loses at every band below mint, on the measured cars', () => {
    for (const model of MEASURED_CARS) {
      for (const band of ['fine', 'worn', 'poor'] as const) {
        const { on, off } = handlingPair(model, built(model, 'race', [], 'race', band))
        expect(on, `${model.id} @${band}`).toBeLessThan(off)
      }
    }
  })
})

describe('the lap and the readout read one number', () => {
  /**
   * The loss lands on mechanical grip, which is the quantity the display curve
   * reads and the quantity the lap corners, brakes and launches on. So the two
   * move together by construction: nothing is applied twice and nothing has to
   * be kept in step by hand.
   */
  it('handling never rises and no lap ever falls, across the build sweep', () => {
    for (const model of MEASURED_CARS) {
      for (const gripGrade of BUILD_GRADES) {
        for (const subset of SUPPORT_SUBSETS) {
          const car = built(model, gripGrade, subset)
          const { on, off } = handlingPair(model, car)
          expect(
            on,
            `${model.id} ${gripGrade} / ${subset.join('+') || 'nothing'}`,
          ).toBeLessThanOrEqual(off)
          const lapsOn = lapsOf(model, car, CONTEXT)
          const lapsOff = lapsOf(model, car, CONTEXT_WITHOUT_LOSS)
          for (const [index, course] of COURSES.entries()) {
            expect(
              lapsOn[index]!,
              `${model.id} ${gripGrade} / ${subset.join('+') || 'nothing'} / ${course.id}`,
            ).toBeGreaterThanOrEqual(lapsOff[index]!)
          }
        }
      }
    }
  })

  it('an unsupported race build reads lower AND laps slower on every course', () => {
    for (const model of MEASURED_CARS) {
      const car = built(model, 'race')
      const { on, off } = handlingPair(model, car)
      expect(on, model.id).toBeLessThan(off)
      const lapsOn = lapsOf(model, car, CONTEXT)
      const lapsOff = lapsOf(model, car, CONTEXT_WITHOUT_LOSS)
      for (const [index, course] of COURSES.entries()) {
        expect(lapsOn[index]!, `${model.id} / ${course.id}`).toBeGreaterThan(lapsOff[index]!)
      }
    }
  })
})
