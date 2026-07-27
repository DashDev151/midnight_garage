import {
  BUYERS,
  CARS,
  COURSES,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarModel,
  type ConditionBand,
  type Course,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { computeDerivedStats, physicalConditionFactors } from '../src/derivedStats'
import { lapTimeSecondsFor } from '../src/lapModel'
import { MINT_CONDITION_FACTORS, lapTime, type ConditionFactors } from '../src/performance'
import { buildCarInstance, groupCarParts, mintCarParts, uniformCarParts } from './testFixtures'

/**
 * Condition reaching the physics: what a worn car actually loses, and - just as
 * importantly - what a car in good order does NOT lose. The measured figures
 * every lap runs on describe a stock car in good order, so mint has to be an
 * exact identity or the model stops reproducing its own measurements.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

const CIVIC = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!
const GTR = CARS.find((c) => c.id === 'nissan-skyline-gtr-bnr32')!

const BANDS_BEST_FIRST: readonly ConditionBand[] = ['mint', 'fine', 'worn', 'poor', 'scrap']

function carAt(model: CarModel, parts: CarInstance['parts']): CarInstance {
  return buildCarInstance({ modelId: model.id, parts })
}

function factorsFor(model: CarModel, car: CarInstance): ConditionFactors {
  return physicalConditionFactors(car, model, PARTS_TAXONOMY, ECONOMY)
}

/** A stock-power, stock-compound lap, so the only thing varying between two
 * calls is the condition of the parts. */
function stockLap(model: CarModel, course: Course, condition: ConditionFactors): number {
  return lapTime(
    model,
    course,
    model.spec.stockPowerPs,
    model.spec.tyreCompound,
    ECONOMY,
    undefined,
    condition,
  )
}

describe('a car in good order is untouched by the condition model', () => {
  it('every physical dial is exactly 1 on a fully mint car', () => {
    expect(factorsFor(CIVIC, carAt(CIVIC, mintCarParts()))).toEqual(MINT_CONDITION_FACTORS)
  })

  it('every shipped car reproduces its measured figures exactly at mint, on every course', () => {
    for (const model of CARS) {
      const condition = factorsFor(model, carAt(model, mintCarParts()))
      for (const course of COURSES) {
        const withoutCondition = lapTime(
          model,
          course,
          model.spec.stockPowerPs,
          model.spec.tyreCompound,
          ECONOMY,
        )
        expect(stockLap(model, course, condition), `${model.id} / ${course.id} moved at mint`).toBe(
          withoutCondition,
        )
      }
    }
  })
})

describe('a worn engine is charged exactly once', () => {
  const worn = carAt(CIVIC, groupCarParts({ engine: 'worn' }))

  it('no physical dial answers to the engine at all', () => {
    expect(factorsFor(CIVIC, worn)).toEqual(MINT_CONDITION_FACTORS)
  })

  it('engine condition reaches the lap only through the power figure', () => {
    const stats = computeDerivedStats(CIVIC, worn, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
    expect(stats.power).toBeLessThan(CIVIC.spec.stockPowerPs)

    for (const course of COURSES) {
      const throughPowerOnly = lapTime(
        CIVIC,
        course,
        stats.power,
        CIVIC.spec.tyreCompound,
        ECONOMY,
        undefined,
        MINT_CONDITION_FACTORS,
      )
      const throughEverything = lapTime(
        CIVIC,
        course,
        stats.power,
        CIVIC.spec.tyreCompound,
        ECONOMY,
        undefined,
        factorsFor(CIVIC, worn),
      )
      expect(throughEverything, `${course.id} charged the engine twice`).toBe(throughPowerOnly)
      // The single charge is real: the same car at stock power is faster.
      expect(throughPowerOnly).toBeGreaterThan(stockLap(CIVIC, course, MINT_CONDITION_FACTORS))
    }
  })
})

/**
 * Braking is DERIVED from mechanical grip in the model
 * (`brakeMu = brakeRatio * mu * brakingFactor`), so the two dials are not
 * independent and their part sets have to stay disjoint. A part weighted on
 * both would reach braking twice, once through `mu` and once through the dial,
 * and the only way to see it is with the two part groups in different bands.
 */
describe('the grip and braking dials never charge the same part twice', () => {
  it('no taxonomy part carries weight on both grip and braking', () => {
    const both = PARTS_TAXONOMY.filter(
      (entry) => entry.physicalWeights.grip > 0 && entry.physicalWeights.braking > 0,
    ).map((entry) => entry.id)
    expect(both).toEqual([])
  })

  it('scrap tyres with mint brakes cost braking exactly the grip factor and nothing more', () => {
    const scrapTyres = factorsFor(CIVIC, carAt(CIVIC, mintCarParts({ tyres: 'scrap' })))
    // `brakeMu` is `brakeRatio * mu * braking`, so a braking factor of exactly 1
    // IS the claim: the rubber reaches braking once, through `mu`.
    expect(scrapTyres.braking).toBe(1)
    expect(scrapTyres.grip).toBeLessThan(1)
  })

  it('scrap brakes with mint tyres cost braking alone', () => {
    const scrapBrakes = factorsFor(
      CIVIC,
      carAt(CIVIC, mintCarParts({ brakePadsDiscs: 'scrap', brakeCalipersLines: 'scrap' })),
    )
    expect(scrapBrakes.grip).toBe(1)
    expect(scrapBrakes.braking).toBeLessThan(1)
  })
})

describe('worn parts cost real lap time', () => {
  it('scrap tyres alone lose grip and lap time on every course', () => {
    const scrapTyres = factorsFor(CIVIC, carAt(CIVIC, mintCarParts({ tyres: 'scrap' })))
    expect(scrapTyres.grip).toBeLessThan(1)
    expect(scrapTyres.driveline).toBe(1)
    expect(scrapTyres.aero).toBe(1)

    for (const course of COURSES) {
      const mint = stockLap(CIVIC, course, MINT_CONDITION_FACTORS)
      expect(stockLap(CIVIC, course, scrapTyres), `${course.id}`).toBeGreaterThan(mint)
    }
  })

  it('degrades monotonically band by band, on every course and both drivetrains', () => {
    for (const model of [CIVIC, GTR]) {
      const times = BANDS_BEST_FIRST.map((band) => ({
        band,
        condition: factorsFor(model, carAt(model, uniformCarParts(band))),
      }))
      for (const course of COURSES) {
        const laps = times.map((entry) => stockLap(model, course, entry.condition))
        for (let i = 1; i < laps.length; i++) {
          expect(
            laps[i]!,
            `${model.id} / ${course.id}: ${times[i]!.band} is not slower than ${times[i - 1]!.band}`,
          ).toBeGreaterThan(laps[i - 1]!)
        }
      }
    }
  })

  /**
   * The provisional curves' whole magnitude in one number, and the guard that
   * catches either failure mode: a dial that stopped reaching the physics (the
   * loss collapses towards zero) or one applied twice (it roughly doubles). The
   * band is the measured spread across the shipped roster and all four courses.
   */
  it('a fully scrap car loses between 3 and 15 per cent of its pace', () => {
    for (const model of CARS) {
      const scrap = factorsFor(model, carAt(model, uniformCarParts('scrap')))
      for (const course of COURSES) {
        const mint = stockLap(model, course, MINT_CONDITION_FACTORS)
        const lost = (stockLap(model, course, scrap) - mint) / mint
        const detail = `${model.id} / ${course.id} lost ${(lost * 100).toFixed(2)}%`
        expect(lost, detail).toBeGreaterThan(0.03)
        expect(lost, detail).toBeLessThan(0.15)
      }
    }
  })
})

describe('the game-facing lap reads a real car condition', () => {
  it('a poor-suspension car laps slower than the same car mint', () => {
    const mint = lapTimeSecondsFor(carAt(CIVIC, mintCarParts()), CIVIC, CONTEXT, 'hakone')!
    const tired = carAt(CIVIC, groupCarParts({ suspension: 'poor', wheels: 'poor' }))
    expect(lapTimeSecondsFor(tired, CIVIC, CONTEXT, 'hakone')!).toBeGreaterThan(mint)
  })

  it('the handling readout falls with the same grip the lap runs on', () => {
    const mintStats = computeDerivedStats(
      CIVIC,
      carAt(CIVIC, mintCarParts()),
      CONTEXT.partsById,
      PARTS_TAXONOMY,
      ECONOMY,
    )
    const tiredStats = computeDerivedStats(
      CIVIC,
      carAt(CIVIC, mintCarParts({ tyres: 'poor' })),
      CONTEXT.partsById,
      PARTS_TAXONOMY,
      ECONOMY,
    )
    expect(tiredStats.handling).toBeLessThan(mintStats.handling)
  })
})
