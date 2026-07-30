import {
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarPartId,
  type ConditionBand,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { hasForcedInduction } from '../src/bands'
import { buildSimContext } from '../src/context'
import { computeDerivedStats } from '../src/derivedStats'
import { carWithGrades } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const ECONOMY = CONTEXT.economy

const FORCED_CAR = CARS.find((c) => c.id === 'nissan-180sx-rps13')!
const CARINA = CARS.find((c) => c.id === 'toyota-carina-at150')!
const FD = CARS.find((c) => c.id === 'mazda-rx7-fd3s')!

/** Every CarPartId that carries a non-zero `statWeights.reliability` in the
 * taxonomy - read from content, never a hand-written list, matching the
 * severity ceiling's own rule. 15 parts, total weight 22 (design doc). */
const RELIABILITY_WEIGHTED_PARTS: CarPartId[] = PARTS_TAXONOMY.filter(
  (entry) => (entry.statWeights.reliability ?? 0) > 0,
).map((entry) => entry.id)

/** The maximal forced-induction build, race grade throughout (Task 6 item 5's
 * first worked table) - every demand and support slot at race. */
const ALL_RACE: Partial<Record<CarPartId, 'race'>> = {
  block: 'race',
  internals: 'race',
  headValvetrain: 'race',
  camsTiming: 'race',
  intake: 'race',
  exhaust: 'race',
  fuelSystem: 'race',
  ignitionEcu: 'race',
  cooling: 'race',
  forcedInduction: 'race',
  gearbox: 'race',
  clutch: 'race',
  driveline: 'race',
  differential: 'race',
}

/** The gain-only slots of a "maximal build, no support at all" - every
 * demand slot at race, nothing supporting any of it. */
const RACE_GAIN_ONLY: Partial<Record<CarPartId, 'race'>> = {
  block: 'race',
  internals: 'race',
  headValvetrain: 'race',
  camsTiming: 'race',
  intake: 'race',
  exhaust: 'race',
  ignitionEcu: 'race',
  forcedInduction: 'race',
}

/** Sets one part's band on an otherwise already-built car, without
 * disturbing anything else - `carWithGrades` only offers one uniform band
 * for the whole car, so the grenade/missing-part tests compose on top of it
 * with a direct override. */
function withPartBand(car: CarInstance, partId: CarPartId, band: ConditionBand): CarInstance {
  const installed = car.parts[partId].installed
  if (!installed) throw new Error(`fixture car has no installed part at ${partId}`)
  return { ...car, parts: { ...car.parts, [partId]: { installed: { ...installed, band } } } }
}

function withPartMissing(car: CarInstance, partId: CarPartId): CarInstance {
  return { ...car, parts: { ...car.parts, [partId]: { installed: null } } }
}

function stats(car: CarInstance, model = FORCED_CAR) {
  return computeDerivedStats(model, car, CONTEXT.partsById, PARTS_TAXONOMY, ECONOMY)
}

describe('reliability model: the full table, pinned', () => {
  // Character-independent rows (headline 1.0 either way): the doc's own
  // "two cars at the ends of Lever 7" points table.
  it("stock, mint reads exactly the car's own base, on both Carina (100) and FD (80)", () => {
    expect(stats(carWithGrades(CARINA, CONTEXT, {}, 'mint'), CARINA).reliability).toBe(100)
    expect(stats(carWithGrades(FD, CONTEXT, {}, 'mint'), FD).reliability).toBe(80)
  })

  it('a fully supported race build, mint reads exactly the same as stock, on both Carina and FD', () => {
    expect(stats(carWithGrades(CARINA, CONTEXT, ALL_RACE, 'mint'), CARINA).reliability).toBe(100)
    expect(stats(carWithGrades(FD, CONTEXT, ALL_RACE, 'mint'), FD).reliability).toBe(80)
  })

  it('stock, all worn reads 65 / 52 - exactly the ratio of the two bases (100:80 == 65:52)', () => {
    const carinaWorn = stats(carWithGrades(CARINA, CONTEXT, {}, 'worn'), CARINA).reliability
    const fdWorn = stats(carWithGrades(FD, CONTEXT, {}, 'worn'), FD).reliability
    expect(carinaWorn).toBe(65)
    expect(fdWorn).toBe(52)
    expect(carinaWorn * FD.spec.reliabilityBase).toBe(fdWorn * CARINA.spec.reliabilityBase)
  })

  it('stock, one grenade reads 25 / 20 - the severity ceiling at 0.25 of each base', () => {
    const carinaGrenade = stats(
      withPartBand(carWithGrades(CARINA, CONTEXT, {}, 'mint'), 'cooling', 'scrap'),
      CARINA,
    ).reliability
    const fdGrenade = stats(
      withPartBand(carWithGrades(FD, CONTEXT, {}, 'mint'), 'cooling', 'scrap'),
      FD,
    ).reliability
    expect(carinaGrenade).toBe(25)
    expect(fdGrenade).toBe(20)
  })

  // Character-specific rows, pinned on a real 'forced' car (nissan-180sx-rps13,
  // base 92), for the two lower headlines this sprint is judged on.
  const HEADLINE_BUILDS: Record<
    'raceTurboAlone' | 'maximalNoSupport',
    Partial<Record<CarPartId, 'race'>>
  > = {
    raceTurboAlone: { forcedInduction: 'race' },
    maximalNoSupport: RACE_GAIN_ONLY,
  }
  const MINT_EXPECTED: Record<'raceTurboAlone' | 'maximalNoSupport', number> = {
    raceTurboAlone: 39,
    maximalNoSupport: 33,
  }

  for (const key of ['raceTurboAlone', 'maximalNoSupport'] as const) {
    it(`${key} at mint: reads ${MINT_EXPECTED[key]} on the base-92 forced car`, () => {
      const car = carWithGrades(FORCED_CAR, CONTEXT, HEADLINE_BUILDS[key], 'mint')
      expect(stats(car).reliability).toBe(MINT_EXPECTED[key])
    })

    it(`${key}, one grenade: reads 0 (below the dangerous line, condition adds nothing back)`, () => {
      const car = withPartBand(
        carWithGrades(FORCED_CAR, CONTEXT, HEADLINE_BUILDS[key], 'mint'),
        'cooling',
        'scrap',
      )
      expect(stats(car).reliability).toBe(0)
    })
  }

  /**
   * The doc's own illustrative condition sweep at a FIXED low headline
   * (0.588/0.539 at fine/worn/poor) is not reachable by uniformly ageing a
   * single real car: demand is band-scaled (correctly, by design - "a blown
   * turbo must stop demanding a bottom end"), and the turbo/gain parts that
   * set a low headline ARE ALSO reliability-weighted parts, so ageing them
   * uniformly SHRINKS demand and lifts the headline at the same time it
   * lowers conditionFactor. Measured directly: a uniformly-`fine` race-turbo
   * -alone build reads 31, not the doc's illustrative 25, because the worn
   * turbo is simultaneously demanding less boost. That is the model working
   * as specified, not a defect - flagged here rather than silently pinning a
   * number the formula cannot actually produce from one real build.
   *
   * What IS honestly buildable and pinned instead: hold the build's own
   * gain-bearing slot at mint (the headline stays locked at 0.588) while
   * every other reliability-weighted part ages uniformly - a maintained
   * engine on a tired chassis/drivetrain.
   */
  it('a race turbo kept mint on a car ageing everywhere else: the incoherent build still loses more than the coherent baseline', () => {
    const fineEverywhereElse = withPartBand(
      carWithGrades(FORCED_CAR, CONTEXT, HEADLINE_BUILDS.raceTurboAlone, 'fine'),
      'forcedInduction',
      'mint',
    )
    const stockFine = carWithGrades(FORCED_CAR, CONTEXT, {}, 'fine')
    expect(stats(fineEverywhereElse).reliability).toBeLessThan(stats(stockFine).reliability)
  })
})

describe('reliability model: the base is the ceiling', () => {
  it('a stock mint car reads exactly its own spec.reliabilityBase, all 26 shipped cars', () => {
    for (const model of CARS) {
      const car = carWithGrades(model, CONTEXT, {}, 'mint')
      expect(stats(car, model).reliability, model.id).toBe(model.spec.reliabilityBase)
    }
  })

  it('the 26 authored bases match Lever 7 exactly', () => {
    const LEVER_7: Record<string, number> = {
      'toyota-carina-at150': 100,
      'honda-city-e-aa': 99,
      'nissan-sunny-b12': 98,
      'suzuki-wagon-r-ct21s': 98,
      'honda-civic-sir2-eg6': 97,
      'honda-crx-sir-ef8': 96,
      'toyota-sera-exy10': 95,
      'honda-prelude-si-vtec-bb4': 95,
      'toyota-aristo-30v-jzs147': 95,
      'toyota-supra-rz-jza80': 94,
      'toyota-chaser-tourer-v-jzx90': 94,
      'toyota-sprinter-trueno-ae86': 94,
      'nissan-cefiro-a31': 93,
      'toyota-mr2-aw11': 93,
      'nissan-silvia-s13': 92,
      'nissan-180sx-rps13': 92,
      'nissan-silvia-ks-s14': 92,
      'suzuki-alto-works-ha21s': 91,
      'honda-beat-pp1': 91,
      'toyota-mr2-sw20': 90,
      'nissan-skyline-gtr-bnr32': 90,
      'honda-city-turbo-ii-aa': 88,
      'subaru-impreza-wrx-sti-gc8': 86,
      'nissan-fairlady-z-z32': 84,
      'mazda-savanna-rx7-fc3s': 82,
      'mazda-rx7-fd3s': 80,
    }
    expect(Object.keys(LEVER_7).sort()).toEqual(CARS.map((c) => c.id).sort())
    for (const model of CARS) {
      expect(model.spec.reliabilityBase, model.id).toBe(LEVER_7[model.id])
    }
  })

  it('a fully supported race build reads exactly the same as stock, all 26 shipped cars', () => {
    for (const model of CARS) {
      const stockCar = carWithGrades(model, CONTEXT, {}, 'mint')
      const raceCar = carWithGrades(model, CONTEXT, ALL_RACE, 'mint')
      expect(stats(raceCar, model).reliability, model.id).toBe(stats(stockCar, model).reliability)
    }
  })

  it("nothing anywhere exceeds the car's own base, across every build in this file's fixtures", () => {
    const builds: Partial<Record<CarPartId, 'race'>>[] = [{}, ALL_RACE, RACE_GAIN_ONLY]
    for (const model of CARS) {
      for (const grades of builds) {
        for (const band of ['mint', 'fine', 'worn', 'poor', 'scrap'] as const) {
          const car = carWithGrades(model, CONTEXT, grades, band)
          expect(stats(car, model).reliability).toBeLessThanOrEqual(model.spec.reliabilityBase)
        }
      }
    }
  })
})

describe('reliability model: the grenade rule', () => {
  for (const partId of RELIABILITY_WEIGHTED_PARTS) {
    it(`one ${partId} at scrap, all others mint, caps the car at 25% of its base`, () => {
      const car = withPartBand(carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint'), partId, 'scrap')
      expect(stats(car).reliability).toBe(Math.round(FORCED_CAR.spec.reliabilityBase * 0.25))
    })
  }

  it('repairing any of the other fourteen weighted parts does not move the grenade cap', () => {
    const grenadePart: CarPartId = 'cooling'
    const othersFine = withPartBand(
      carWithGrades(FORCED_CAR, CONTEXT, {}, 'fine'),
      grenadePart,
      'scrap',
    )
    const othersMint = withPartBand(
      carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint'),
      grenadePart,
      'scrap',
    )
    expect(stats(othersFine).reliability).toBe(stats(othersMint).reliability)
    expect(stats(othersMint).reliability).toBe(Math.round(FORCED_CAR.spec.reliabilityBase * 0.25))
  })
})

describe('reliability model: zero-weight parts cannot trip the ceiling', () => {
  const ZERO_WEIGHT_PARTS: CarPartId[] = ['springs', 'paint', 'tyres']

  it('scrap springs, paint or tyres leave reliability exactly unmoved', () => {
    const baseline = stats(carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint')).reliability
    for (const partId of ZERO_WEIGHT_PARTS) {
      const car = withPartBand(carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint'), partId, 'scrap')
      expect(stats(car).reliability, partId).toBe(baseline)
    }
  })
})

describe('reliability model: a missing part vs a legitimately absent one', () => {
  it('a missing (non-FI) reliability-bearing part trips the ceiling exactly like scrap', () => {
    const car = withPartMissing(carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint'), 'internals')
    expect(stats(car).reliability).toBe(Math.round(FORCED_CAR.spec.reliabilityBase * 0.25))
  })

  it('a legitimately absent forced-induction slot never trips the ceiling; a missing one on a turbo car does, all 26 cars', () => {
    for (const model of CARS) {
      const car = withPartMissing(carWithGrades(model, CONTEXT, {}, 'mint'), 'forcedInduction')
      const result = stats(car, model).reliability
      if (hasForcedInduction(model)) {
        expect(result, model.id).toBe(Math.round(model.spec.reliabilityBase * 0.25))
      } else {
        expect(result, model.id).toBe(model.spec.reliabilityBase)
      }
    }
  })
})

describe('reliability model: the floor', () => {
  /** The five gain-only slots (no support role in any subsystem) - the
   * demand-worst, condition-best construction the "worst buildable car"
   * needs: at MINT band they demand their full amount (a worn gain part
   * would demand LESS and only raise the headline back up), while every
   * other reliability-weighted part sits at scrap, capping conditionFactor
   * through the severity ceiling. Support stays at 0 throughout, since
   * nothing above stock grade is fitted anywhere. */
  const PURE_GAIN_SLOTS_RACE: Partial<Record<CarPartId, 'race'>> = {
    camsTiming: 'race',
    intake: 'race',
    exhaust: 'race',
    ignitionEcu: 'race',
    forcedInduction: 'race',
  }

  it('the worst buildable car reads exactly 0', () => {
    let car = carWithGrades(FORCED_CAR, CONTEXT, PURE_GAIN_SLOTS_RACE, 'scrap')
    for (const partId of Object.keys(PURE_GAIN_SLOTS_RACE) as CarPartId[]) {
      car = withPartBand(car, partId, 'mint')
    }
    expect(stats(car).reliability).toBe(0)
  })

  it('no input produces a negative reliability figure', () => {
    for (const model of CARS) {
      const car = carWithGrades(model, CONTEXT, RACE_GAIN_ONLY, 'scrap')
      expect(stats(car, model).reliability).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('reliability model: monotonicity', () => {
  it('reliability never rises when a band worsens (fixed stock build)', () => {
    const bands = ['mint', 'fine', 'worn', 'poor', 'scrap'] as const
    let previous = Infinity
    for (const band of bands) {
      const value = stats(carWithGrades(FORCED_CAR, CONTEXT, {}, band)).reliability
      expect(value).toBeLessThanOrEqual(previous)
      previous = value
    }
  })

  it('reliability never rises when the headline support ratio falls (fixed mint condition)', () => {
    const buildsByDescendingHeadline: Partial<Record<CarPartId, 'race'>>[] = [
      {},
      ALL_RACE,
      { forcedInduction: 'race' },
      RACE_GAIN_ONLY,
    ]
    let previous = Infinity
    for (const grades of buildsByDescendingHeadline) {
      const value = stats(carWithGrades(FORCED_CAR, CONTEXT, grades, 'mint')).reliability
      expect(value).toBeLessThanOrEqual(previous)
      previous = value
    }
  })
})

describe('reliability model: statFormulas.reliabilityCap is retired', () => {
  it('economy.json no longer carries statFormulas.reliabilityCap', () => {
    expect('reliabilityCap' in ECONOMY.statFormulas).toBe(false)
  })
})
