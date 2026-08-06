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
   *
   * Measured through `lapTime` rather than the game-facing entry point on
   * purpose: a fully scrap car sets no time at all, since every part that stops
   * a car outright is ruined, so the only way to read what the dials are worth
   * at the bottom of the range is to spend them directly. That makes this a
   * probe of the curves rather than of a state a car can reach.
   */
  /**
   * The floor is 10 per cent everywhere except on the two lowest-powered
   * vehicles in the roster, and only because the physics genuinely runs out
   * rather than because a dial stopped reaching it. The Wangan is the fastest
   * course; a 38 PS kei truck and a 55 PS boxy 4x4 are already drag-limited
   * there at MINT, so the condition dials have less pace left to take away than
   * on any other car. Measured: Acty 8.85 per cent, Jimny 9.03 per cent.
   *
   * Keyed on the car's own stock power rather than named ids, so the rule
   * describes the physical reason and a future 40 PS vehicle is covered without
   * a third exemption. The ceiling stays 50 per cent for everything.
   */
  const LOW_POWER_PS = 60
  const floorFor = (model: CarModel): number =>
    model.spec.stockPowerPs <= LOW_POWER_PS ? 0.08 : 0.1

  it('a fully scrap car loses between 10 and 50 per cent of its pace', () => {
    for (const model of CARS) {
      const scrap = factorsFor(model, carAt(model, uniformCarParts('scrap')))
      for (const course of COURSES) {
        const mint = stockLap(model, course, MINT_CONDITION_FACTORS)
        const lost = (stockLap(model, course, scrap) - mint) / mint
        const detail = `${model.id} / ${course.id} lost ${(lost * 100).toFixed(2)}%`
        expect(lost, detail).toBeGreaterThan(floorFor(model))
        expect(lost, detail).toBeLessThan(0.5)
      }
    }
  })
})

/**
 * Wear is gradual until it is not. Most parts only cost pace when they are
 * ruined, and the dials above say how much; the parts marked `scrapDisablesCar`
 * are function-or-fail, and at scrap they stop the car being driven at all
 * rather than slow it down. The set is read from the taxonomy rather than
 * restated here, so a part added to the game cannot escape the rule, and the
 * flag itself is pinned so the rule cannot be half-removed by editing content.
 *
 * The pair of cases is the point: the same component is BOTH. A worn ignition
 * misfires under load, which is a real power loss the stat curves carry, and a
 * scrap one does not start.
 */
describe('a part that fails outright, rather than fading, means no lap time', () => {
  const DISABLING_IDS = PARTS_TAXONOMY.filter((entry) => entry.scrapDisablesCar).map(
    (entry) => entry.id,
  )

  it('exactly the parts a car cannot run, drive or be controlled without carry the flag', () => {
    expect([...DISABLING_IDS].sort()).toEqual([
      'block',
      'brakeCalipersLines',
      'brakePadsDiscs',
      'camsTiming',
      'clutch',
      'cooling',
      'differential',
      'driveline',
      'fuelSystem',
      'gearbox',
      'headValvetrain',
      'ignitionEcu',
      'internals',
      'steering',
      'tyres',
    ])
  })

  it.each(DISABLING_IDS)('a scrap %s sets no time on any course', (partId) => {
    const car = carAt(CIVIC, mintCarParts({ [partId]: 'scrap' }))
    for (const course of COURSES) {
      expect(
        lapTimeSecondsFor(car, CIVIC, CONTEXT, course.id),
        `${partId} / ${course.id}`,
      ).toBeNull()
    }
  })

  it.each(DISABLING_IDS)('a missing %s sets no time either', (partId) => {
    const car = carAt(CIVIC, mintCarParts({ [partId]: null }))
    expect(lapTimeSecondsFor(car, CIVIC, CONTEXT, 'hakone')).toBeNull()
  })

  it('a car one band above the floor everywhere still sets a time, and a slow one', () => {
    const overrides = Object.fromEntries(DISABLING_IDS.map((partId) => [partId, 'poor' as const]))
    const car = carAt(CIVIC, mintCarParts(overrides))
    const time = lapTimeSecondsFor(car, CIVIC, CONTEXT, 'hakone')
    expect(time).not.toBeNull()
    const mint = lapTimeSecondsFor(carAt(CIVIC, mintCarParts()), CIVIC, CONTEXT, 'hakone')!
    expect(time!).toBeGreaterThan(mint)
  })

  /**
   * Which dials can ever see a scrap contribution at all. Both carriers of
   * `braking` and all four of `driveline` stop the car outright at scrap, so
   * those two scrap entries are unreachable by construction and there is nothing
   * in them to tune; `grip` and `aero` each keep carriers that only fade, so
   * their scrap entries are live. Pinned because it is invisible in the curves
   * themselves and a reader would otherwise spend time on a dead number.
   */
  it('the braking and driveline scrap entries are unreachable, grip and aero are not', () => {
    const carriersAllGate = (dial: 'grip' | 'braking' | 'driveline' | 'aero'): boolean => {
      const carriers = PARTS_TAXONOMY.filter((entry) => entry.physicalWeights[dial] > 0)
      expect(carriers.length, dial).toBeGreaterThan(0)
      return carriers.every((entry) => entry.scrapDisablesCar)
    }
    expect(carriersAllGate('braking')).toBe(true)
    expect(carriersAllGate('driveline')).toBe(true)
    expect(carriersAllGate('grip')).toBe(false)
    expect(carriersAllGate('aero')).toBe(false)
  })

  /**
   * `powerConditionFloor` is 0.5, so a car with every power-weighted part at
   * scrap still computes 57.5% of stock power - a cracked block and destroyed
   * internals making over half the horsepower. Reaching that number requires
   * `internals`, `camsTiming` and `ignitionEcu` all at scrap, and all three stop
   * the car outright, so no car that can be driven ever runs on it. The floor
   * now only binds at `worn` and `poor`, where 82.5% and 70% of stock power are
   * what a tired engine should make.
   */
  it('the power-condition floor is unreachable by any car that can be driven', () => {
    const deadEngine = carAt(CIVIC, groupCarParts({ engine: 'scrap' }))
    const stats = computeDerivedStats(CIVIC, deadEngine, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
    const floorPower =
      CIVIC.spec.stockPowerPs *
      (ECONOMY.statFormulas.powerConditionFloor +
        (1 - ECONOMY.statFormulas.powerConditionFloor) * ECONOMY.bands.bandFactors.scrap)
    expect(stats.power).toBe(Math.round(floorPower))
    for (const course of COURSES) {
      expect(lapTimeSecondsFor(deadEngine, CIVIC, CONTEXT, course.id), course.id).toBeNull()
    }
  })

  /**
   * The other half of the distinction, and the reason it is drawn on physics
   * rather than on importance. Blown dampers make a car unpleasant and unsafe at
   * speed; it still drives, and the grip dial already charges it about 8% of
   * mechanical grip. A destroyed turbo still runs, badly, on the atmospheric
   * side of its own plumbing.
   */
  it('a scrap damper or a destroyed turbo is a slow car, not a dead one', () => {
    for (const partId of ['dampers', 'forcedInduction'] as const) {
      const time = lapTimeSecondsFor(
        carAt(CIVIC, mintCarParts({ [partId]: 'scrap' })),
        CIVIC,
        CONTEXT,
        'hakone',
      )
      expect(time, partId).not.toBeNull()
      expect(time!, partId).toBeGreaterThan(
        lapTimeSecondsFor(carAt(CIVIC, mintCarParts()), CIVIC, CONTEXT, 'hakone')!,
      )
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
