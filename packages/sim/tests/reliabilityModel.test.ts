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
import { computeDerivedStats, reliabilityIntensityFactor } from '../src/derivedStats'
import { supportVerdict, totalGainFractionOf } from '../src/support'
import { carWithGrades } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const ECONOMY = CONTEXT.economy

const FORCED_CAR = CARS.find((c) => c.id === 'nissan-180sx-rps13')!
const CARINA = CARS.find((c) => c.id === 'toyota-carina-at150')!
const FD = CARS.find((c) => c.id === 'mazda-rx7-fd3s')!

/** Every CarPartId that carries a non-zero `statWeights.reliability` in the
 * taxonomy - read from content, never a hand-written list, matching the
 * severity ceiling's own rule. 20 parts, total weight 30: five chassis/wheels
 * parts carry reliability weight ADDITIVE to their existing handling/style
 * weight - tyres, brakeCalipersLines and steering at 2, brakePadsDiscs and
 * springs at 1 - because a car cannot stop or steer reliably on cords and a
 * weeping brake line either. */
const RELIABILITY_WEIGHTED_PARTS: CarPartId[] = PARTS_TAXONOMY.filter(
  (entry) => (entry.statWeights.reliability ?? 0) > 0,
).map((entry) => entry.id)

/** The severity ceiling's own per-part cap fraction at `scrap`/`poor`,
 * derived from content rather than hand-computed, so a lever retune can
 * never silently desync this file's expectations from the formula. */
function ceilingCapFraction(weight: number, band: 'poor' | 'scrap'): number {
  const { reliabilityCeiling, reliabilityCeilingWeightReference } = ECONOMY.statFormulas.condition
  return (
    1 - (1 - reliabilityCeiling[band]) * Math.min(1, weight / reliabilityCeilingWeightReference)
  )
}

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

  /**
   * `spec.reliabilityBase` stays an absolute ceiling nothing exceeds, but a
   * build that makes more power sits below it in proportion to how much
   * more, whether or not it is supported - see `reliabilityIntensityFactor`
   * in `derivedStats.ts`. A fully supported race build therefore no longer
   * reads exactly stock; both cars fit every gain slot `ALL_RACE` names, so
   * both move strictly below their own base.
   */
  it('a fully supported race build, mint now reads strictly below stock on both Carina and FD - the base is a ceiling, not a plateau', () => {
    const carinaRace = stats(carWithGrades(CARINA, CONTEXT, ALL_RACE, 'mint'), CARINA).reliability
    const fdRace = stats(carWithGrades(FD, CONTEXT, ALL_RACE, 'mint'), FD).reliability
    expect(carinaRace).toBe(82)
    expect(fdRace).toBe(59)
    expect(carinaRace).toBeLessThan(CARINA.spec.reliabilityBase)
    expect(fdRace).toBeLessThan(FD.spec.reliabilityBase)
  })

  it('stock, all worn reads 65 / 52 - exactly the ratio of the two bases (100:80 == 65:52)', () => {
    const carinaWorn = stats(carWithGrades(CARINA, CONTEXT, {}, 'worn'), CARINA).reliability
    const fdWorn = stats(carWithGrades(FD, CONTEXT, {}, 'worn'), FD).reliability
    expect(carinaWorn).toBe(65)
    expect(fdWorn).toBe(52)
    expect(carinaWorn * FD.spec.reliabilityBase).toBe(fdWorn * CARINA.spec.reliabilityBase)
  })

  it('stock, one grenade reads 40 / 32 - the severity ceiling at 0.40 of each base (cooling, weight 3, takes the ceiling full strength)', () => {
    const carinaGrenade = stats(
      withPartBand(carWithGrades(CARINA, CONTEXT, {}, 'mint'), 'cooling', 'scrap'),
      CARINA,
    ).reliability
    const fdGrenade = stats(
      withPartBand(carWithGrades(FD, CONTEXT, {}, 'mint'), 'cooling', 'scrap'),
      FD,
    ).reliability
    expect(carinaGrenade).toBe(40)
    expect(fdGrenade).toBe(32)
  })

  // Character-specific rows, pinned on a real 'forced' car (nissan-180sx-rps13,
  // base 92), for the two lower headlines. At a higher `stockSupportMargin`
  // the margin's own floor would sit above the `dangerous` line for every
  // demand the shipped catalogue can produce, so a bare race turbo alone
  // would read `strained` and never `dangerous`; at the current value it
  // reads `dangerous`, and both mint figures reflect that. Both mint
  // figures also carry the build-intensity factor, on top of the
  // coherence shortfall already reflected here.
  const HEADLINE_BUILDS: Record<
    'raceTurboAlone' | 'maximalNoSupport',
    Partial<Record<CarPartId, 'race'>>
  > = {
    raceTurboAlone: { forcedInduction: 'race' },
    maximalNoSupport: RACE_GAIN_ONLY,
  }
  const MINT_EXPECTED: Record<'raceTurboAlone' | 'maximalNoSupport', number> = {
    raceTurboAlone: 41,
    maximalNoSupport: 31,
  }
  const GRENADE_EXPECTED: Record<'raceTurboAlone' | 'maximalNoSupport', number> = {
    raceTurboAlone: 0,
    maximalNoSupport: 0,
  }

  for (const key of ['raceTurboAlone', 'maximalNoSupport'] as const) {
    it(`${key} at mint: reads ${MINT_EXPECTED[key]} on the base-92 forced car`, () => {
      const car = carWithGrades(FORCED_CAR, CONTEXT, HEADLINE_BUILDS[key], 'mint')
      expect(stats(car).reliability).toBe(MINT_EXPECTED[key])
    })

    it(`${key}, one grenade: reads ${GRENADE_EXPECTED[key]} - the severity ceiling (0.40) and the lower margin's own coherence shortfall now clamp the car to the floor`, () => {
      const car = withPartBand(
        carWithGrades(FORCED_CAR, CONTEXT, HEADLINE_BUILDS[key], 'mint'),
        'cooling',
        'scrap',
      )
      expect(stats(car).reliability).toBe(GRENADE_EXPECTED[key])
    })
  }

  /**
   * Change 4 (demand reads grade, not band) makes the doc's own illustrative
   * condition sweep directly reachable by uniformly ageing one real car -
   * the coupling that used to shrink demand as the same part aged, and so
   * lift the headline back up while the sweep was trying to lower it, is
   * gone. The headline now holds at exactly 0.635 (dangerous, cylinder
   * pressure) at every band; only `conditionFactor` moves. The
   * build-intensity factor (`stressCoefficient`) reads GRADE only, same as
   * support, so it too holds constant across this sweep, and every figure
   * below sits lower across the board for that fixed cost.
   */
  it('a race turbo alone, aged uniformly: the headline never moves, only condition does', () => {
    const bands = ['mint', 'fine', 'worn', 'poor', 'scrap'] as const
    const expected = { mint: 41, fine: 29, worn: 12, poor: 0, scrap: 0 }
    for (const band of bands) {
      const car = carWithGrades(FORCED_CAR, CONTEXT, HEADLINE_BUILDS.raceTurboAlone, band)
      expect(stats(car).reliability, band).toBe(expected[band])
    }
  })

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
  /**
   * Also the `stockSupportMargin` regression guard: the margin only ever
   * multiplies `demand[s] - 1`, which is exactly 0 on a stock car regardless
   * of the margin's own value, so this identity survives untouched.
   * `supportRatios.test.ts`'s own stock-identity test asserts the same
   * property one layer down, on the raw ratios.
   */
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

  /**
   * A fully supported race build reads STRICTLY BELOW stock on every car
   * that fits any gain part - `ALL_RACE` fits at least one gain slot on
   * every shipped car (every car has `camsTiming`, `intake`, `exhaust` at
   * minimum), so `totalGainFractionOf` is strictly positive and
   * `reliabilityIntensityFactor` strictly below 1 on all 26.
   */
  it('a fully supported race build now reads strictly below stock on every car that fits any gain part, all 26 shipped cars', () => {
    for (const model of CARS) {
      const stockCar = carWithGrades(model, CONTEXT, {}, 'mint')
      const raceCar = carWithGrades(model, CONTEXT, ALL_RACE, 'mint')
      const totalGain = totalGainFractionOf(raceCar, model, CONTEXT.partsById, ECONOMY)
      expect(totalGain, model.id).toBeGreaterThan(0)
      expect(stats(raceCar, model).reliability, model.id).toBeLessThan(
        stats(stockCar, model).reliability,
      )
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

/**
 * The build-intensity factor (`stressCoefficient`):
 * `reliabilityIntensityFactor` is the OUTER multiplier
 * `derivedStats.ts.computeDerivedStats` applies on top of the existing
 * condition-plus-coherence budget - `1 - stressCoefficient *
 * totalGainFraction`, clamped to `[0, 1]`. `totalGainFractionOf`
 * (`support.ts`) is the single accumulator both this term and
 * `supportRatios`'s own demand terms read; there is no second copy of the
 * sum anywhere.
 */
describe('reliability model: the build-intensity factor', () => {
  it('is exactly 1 at zero total gain, asserted directly rather than inferred', () => {
    expect(reliabilityIntensityFactor(0, 0, ECONOMY)).toBe(1)
  })

  it('a stock car has exactly zero total gain, all 26 shipped cars', () => {
    for (const model of CARS) {
      const car = carWithGrades(model, CONTEXT, {}, 'mint')
      expect(totalGainFractionOf(car, model, CONTEXT.partsById, ECONOMY), model.id).toBe(0)
    }
  })

  it('is monotone: more total gain never raises the factor, and it never leaves [0, 1] however large or negative the input', () => {
    const gains = [0, 0.1, 0.25, 0.5, 0.95, 1, 2, 10, 1000]
    let previous = Infinity
    for (const gain of gains) {
      const factor = reliabilityIntensityFactor(gain, 0, ECONOMY)
      expect(factor).toBeLessThanOrEqual(previous)
      expect(factor).toBeGreaterThanOrEqual(0)
      expect(factor).toBeLessThanOrEqual(1)
      previous = factor
    }
    // The defensive clamp's other edge: a gain that would (mathematically)
    // push the factor above 1 - never reachable from real content today,
    // since no fitted part carries a negative `powerFraction`, but the
    // clamp must hold regardless of what a future content change does.
    expect(reliabilityIntensityFactor(-5, 0, ECONOMY)).toBe(1)
  })

  it('reliability itself never rises when total gain rises, all else equal (fixed mint condition and coherence)', () => {
    // The camsTiming ladder alone on a lazy-na car: condition is fixed at
    // mint throughout, and each step both raises total gain and can only
    // lower or hold the support headline - never raise it - so this is a
    // real-build confirmation of the same monotonicity the direct factor
    // test above proves in isolation.
    const grades: Array<'street' | 'sport' | 'race'> = ['street', 'sport', 'race']
    let previousGain = -1
    let previousReliability = Infinity
    for (const grade of grades) {
      const car = carWithGrades(CARINA, CONTEXT, { camsTiming: grade }, 'mint')
      const gain = totalGainFractionOf(car, CARINA, CONTEXT.partsById, ECONOMY)
      const reliability = stats(car, CARINA).reliability
      expect(gain).toBeGreaterThan(previousGain)
      expect(reliability).toBeLessThanOrEqual(previousReliability)
      previousGain = gain
      previousReliability = reliability
    }
  })

  /**
   * The street/sport/race creep (design intent behind `stressCoefficient`):
   * one representative car per engine character, each ladder read both
   * unsupported (the power slot alone) and supported (its own dual-role
   * supporting slots fitted to the same grade) - both sequences monotone
   * non-increasing. Support no longer guarantees a HIGHER reading than
   * going without it: the supporting slots are gain parts too (dual-role),
   * so fitting them adds their own total-gain cost, which can outweigh what
   * they buy back through coherence once a build was already adequate
   * without them (the AE86's street rung, below, is exactly this case) -
   * this sequence pins that finding rather than asserting the stronger,
   * false claim that support always helps.
   */
  it('the street/sport/race creep is monotone non-increasing, one car per engine character, both supported and unsupported', () => {
    const cases: Array<{
      label: string
      model: (typeof CARS)[number]
      powerSlot: CarPartId
      supportSlots: CarPartId[]
    }> = [
      {
        label: 'forced (180sx, forcedInduction / cylinder pressure)',
        model: FORCED_CAR,
        powerSlot: 'forcedInduction',
        supportSlots: ['internals', 'block'],
      },
      {
        label: 'high-strung-na (AE86, camsTiming / every subsystem)',
        model: CARS.find((c) => c.id === 'toyota-sprinter-trueno-ae86')!,
        powerSlot: 'camsTiming',
        supportSlots: [
          'headValvetrain',
          'internals',
          'block',
          'fuelSystem',
          'cooling',
          'clutch',
          'gearbox',
          'driveline',
          'differential',
        ],
      },
      {
        label: 'lazy-na (Carina, camsTiming / revs)',
        model: CARINA,
        powerSlot: 'camsTiming',
        supportSlots: ['headValvetrain', 'internals'],
      },
    ]
    const grades: Array<'street' | 'sport' | 'race'> = ['street', 'sport', 'race']
    for (const { label, model, powerSlot, supportSlots } of cases) {
      let previousAlone = Infinity
      let previousSupported = Infinity
      for (const grade of grades) {
        const aloneCar = carWithGrades(model, CONTEXT, { [powerSlot]: grade }, 'mint')
        const aloneReliability = stats(aloneCar, model).reliability
        expect(aloneReliability, `${label} alone ${grade}`).toBeLessThanOrEqual(previousAlone)
        previousAlone = aloneReliability

        const supportedGrades: Partial<Record<CarPartId, 'street' | 'sport' | 'race'>> = {
          [powerSlot]: grade,
        }
        for (const slot of supportSlots) supportedGrades[slot] = grade
        const supportedCar = carWithGrades(model, CONTEXT, supportedGrades, 'mint')
        const supportedReliability = stats(supportedCar, model).reliability
        expect(supportedReliability, `${label} supported ${grade}`).toBeLessThanOrEqual(
          previousSupported,
        )
        previousSupported = supportedReliability
      }
    }
  })

  /**
   * The AE86's own `camsTiming` ladder, exact figures: the verification
   * checkpoint the signed `stressCoefficient` proposal was checked against
   * before implementation. "Alone" is `camsTiming` fitted on its own,
   * nothing else. "Supported" fits `camsTiming` at the ladder grade plus
   * every dual-role and pure-support slot across all five subsystems at the
   * SAME grade - `headValvetrain`/`internals` (revs), `block` (cylinder
   * pressure), `fuelSystem` (fuelling), `cooling` (heat),
   * `clutch`/`gearbox`/`driveline`/`differential` (torque transmission) -
   * everything the build could plausibly stress, matched to the power mod's
   * own grade, everything else stock.
   */
  it("the AE86's camsTiming ladder reads 93/84/72 alone and 92/89/87 fully supported (street/sport/race)", () => {
    const ae86 = CARS.find((c) => c.id === 'toyota-sprinter-trueno-ae86')!
    const supportSlots: CarPartId[] = [
      'headValvetrain',
      'internals',
      'block',
      'fuelSystem',
      'cooling',
      'clutch',
      'gearbox',
      'driveline',
      'differential',
    ]
    const aloneExpected = { street: 93, sport: 84, race: 72 }
    const supportedExpected = { street: 92, sport: 89, race: 87 }
    for (const grade of ['street', 'sport', 'race'] as const) {
      const aloneCar = carWithGrades(ae86, CONTEXT, { camsTiming: grade }, 'mint')
      expect(stats(aloneCar, ae86).reliability, `alone ${grade}`).toBe(aloneExpected[grade])

      const supportedGrades: Partial<Record<CarPartId, 'street' | 'sport' | 'race'>> = {
        camsTiming: grade,
      }
      for (const slot of supportSlots) supportedGrades[slot] = grade
      const supportedCar = carWithGrades(ae86, CONTEXT, supportedGrades, 'mint')
      expect(stats(supportedCar, ae86).reliability, `supported ${grade}`).toBe(
        supportedExpected[grade],
      )
    }
  })
})

describe('reliability model: the grenade rule', () => {
  for (const partId of RELIABILITY_WEIGHTED_PARTS) {
    const weight = PARTS_TAXONOMY.find((entry) => entry.id === partId)!.statWeights.reliability!
    const capFraction = ceilingCapFraction(weight, 'scrap')
    it(`one ${partId} (weight ${weight}) at scrap, all others mint, caps the car at ${Math.round(capFraction * 100)}% of its base`, () => {
      const car = withPartBand(carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint'), partId, 'scrap')
      expect(stats(car).reliability).toBe(Math.round(FORCED_CAR.spec.reliabilityBase * capFraction))
    })
  }

  it('repairing any of the other twenty weighted parts does not move the grenade cap', () => {
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
    expect(stats(othersMint).reliability).toBe(
      Math.round(FORCED_CAR.spec.reliabilityBase * ceilingCapFraction(3, 'scrap')),
    )
  })

  /**
   * The ceiling reads each part's own relevance rather than throwing the
   * magnitude away: a weight-1 part at `poor` must leave the car strictly
   * more reliable than a weight-3 part at `poor` on the same car, same
   * build - a flat lookup on the worst band alone would cap both exactly
   * alike.
   */
  it('a weight-1 part at poor leaves the car strictly more reliable than a weight-3 part at poor', () => {
    const lightPoor = stats(
      withPartBand(carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint'), 'springs', 'poor'),
    ).reliability
    const heavyPoor = stats(
      withPartBand(carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint'), 'cooling', 'poor'),
    ).reliability
    expect(lightPoor).toBeGreaterThan(heavyPoor)
  })
})

describe('reliability model: zero-weight parts cannot trip the ceiling', () => {
  // dampers, paint and rims carry no statWeights.reliability - unlike
  // springs and tyres, which now do (see the dedicated tyres test below).
  const ZERO_WEIGHT_PARTS: CarPartId[] = ['dampers', 'paint', 'rims']

  it('scrap dampers, paint or rims leave reliability exactly unmoved', () => {
    const baseline = stats(carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint')).reliability
    for (const partId of ZERO_WEIGHT_PARTS) {
      const car = withPartBand(carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint'), partId, 'scrap')
      expect(stats(car).reliability, partId).toBe(baseline)
    }
  })

  /**
   * Tyres carry reliability weight 2: a car cannot stop or steer reliably
   * on cords, so its tyres' condition must be able to move this stat, not
   * only the handling one.
   */
  it('a car on poor tyres is strictly less reliable than the same car on mint tyres', () => {
    const mint = stats(carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint')).reliability
    const poorTyres = stats(
      withPartBand(carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint'), 'tyres', 'poor'),
    ).reliability
    expect(poorTyres).toBeLessThan(mint)
  })
})

describe('reliability model: a missing part vs a legitimately absent one', () => {
  it('a missing (non-FI) reliability-bearing part trips the ceiling exactly like scrap', () => {
    const car = withPartMissing(carWithGrades(FORCED_CAR, CONTEXT, {}, 'mint'), 'internals')
    const weight = PARTS_TAXONOMY.find((entry) => entry.id === 'internals')!.statWeights
      .reliability!
    expect(stats(car).reliability).toBe(
      Math.round(FORCED_CAR.spec.reliabilityBase * ceilingCapFraction(weight, 'scrap')),
    )
  })

  it('a legitimately absent forced-induction slot never trips the ceiling; a missing one on a turbo car does, all 26 cars', () => {
    const fiWeight = PARTS_TAXONOMY.find((entry) => entry.id === 'forcedInduction')!.statWeights
      .reliability!
    const capFraction = ceilingCapFraction(fiWeight, 'scrap')
    for (const model of CARS) {
      const car = withPartMissing(carWithGrades(model, CONTEXT, {}, 'mint'), 'forcedInduction')
      const result = stats(car, model).reliability
      if (hasForcedInduction(model)) {
        expect(result, model.id).toBe(Math.round(model.spec.reliabilityBase * capFraction))
      } else {
        expect(result, model.id).toBe(model.spec.reliabilityBase)
      }
    }
  })
})

describe('reliability model: the floor', () => {
  /** The five gain-only slots (no support role in any subsystem) - the
   * demand-worst, condition-worst construction the "worst buildable car"
   * needs: fitted race-grade so demand is maximal, and (since Change 4 made
   * demand read grade rather than band) scrapping them costs nothing on the
   * demand side any more, so every reliability-bearing part - the five gain
   * slots included - can sit at `scrap` at once without softening the
   * headline. Support stays at 0 throughout, since nothing above stock
   * grade is fitted anywhere. */
  const PURE_GAIN_SLOTS_RACE: Partial<Record<CarPartId, 'race'>> = {
    camsTiming: 'race',
    intake: 'race',
    exhaust: 'race',
    ignitionEcu: 'race',
    forcedInduction: 'race',
  }

  it('the worst buildable car reads exactly 0', () => {
    const car = carWithGrades(FORCED_CAR, CONTEXT, PURE_GAIN_SLOTS_RACE, 'scrap')
    expect(stats(car).reliability).toBe(0)
  })

  /**
   * Proves the floor is doing real work rather than never being tested at
   * all: `computeDerivedStats` clamps the combined shortfall to `[0, 1]`
   * before scaling by the car's own base, so a bare
   * `toBeGreaterThanOrEqual(0)` on the CLAMPED output can never fail
   * regardless of what the formula underneath actually computes - the
   * defect this test exists to avoid. This instead recomputes the PRE-CLAMP
   * quantity independently: `conditionFactor` is trivially the uniform
   * `scrap` band factor here (every reliability-weighted part on this build
   * shares one band, so the weighted mean equals that band's factor
   * regardless of how weight is distributed); `coherenceFactor` comes from
   * the real, exported `supportVerdict`. Asserting their sum is strictly
   * below 1 proves the pre-clamp value is genuinely negative, so the floor
   * clamp is load-bearing here, not idle.
   */
  it('the worst buildable car would read a genuinely negative combined shortfall before the floor clamps it to 0', () => {
    const car = carWithGrades(FORCED_CAR, CONTEXT, PURE_GAIN_SLOTS_RACE, 'scrap')
    const conditionFactor = ECONOMY.bands.bandFactors.scrap
    const { adequateAtOrAbove } = ECONOMY.statFormulas.support.thresholds
    const { coherenceExponent } = ECONOMY.statFormulas.support
    const headline = supportVerdict(car, FORCED_CAR, CONTEXT.partsById, ECONOMY).headline
    const coherenceFactor = Math.min(1, headline / adequateAtOrAbove) ** coherenceExponent
    expect(conditionFactor + coherenceFactor).toBeLessThan(1)
  })

  /**
   * `computeDerivedStats` already clamps `reliability` to `[0, 100]` before
   * returning it, so a bare `toBeGreaterThanOrEqual(0)` here can never fail
   * regardless of the formula underneath. This pins the actual, falsifiable
   * measurement across all 26 cars instead. At the current
   * `stockSupportMargin`, every one of the 26 floors at exactly 0; at a
   * higher margin the build's headline sits just above the `dangerous` line
   * on most cars, so five - the roster's smallest total gain fraction -
   * would round up to 1 rather than 0.
   */
  it('a maximal-gain, zero-support, all-scrap build is pinned per car, all 26', () => {
    const EXPECTED: Record<string, number> = {
      'honda-beat-pp1': 0,
      'honda-city-e-aa': 0,
      'honda-city-turbo-ii-aa': 0,
      'honda-civic-sir2-eg6': 0,
      'honda-crx-sir-ef8': 0,
      'honda-prelude-si-vtec-bb4': 0,
      'mazda-rx7-fd3s': 0,
      'mazda-savanna-rx7-fc3s': 0,
      'nissan-180sx-rps13': 0,
      'nissan-cefiro-a31': 0,
      'nissan-fairlady-z-z32': 0,
      'nissan-silvia-ks-s14': 0,
      'nissan-silvia-s13': 0,
      'nissan-skyline-gtr-bnr32': 0,
      'nissan-sunny-b12': 0,
      'subaru-impreza-wrx-sti-gc8': 0,
      'suzuki-alto-works-ha21s': 0,
      'suzuki-wagon-r-ct21s': 0,
      'toyota-aristo-30v-jzs147': 0,
      'toyota-carina-at150': 0,
      'toyota-chaser-tourer-v-jzx90': 0,
      'toyota-mr2-aw11': 0,
      'toyota-mr2-sw20': 0,
      'toyota-sera-exy10': 0,
      'toyota-sprinter-trueno-ae86': 0,
      'toyota-supra-rz-jza80': 0,
    }
    expect(Object.keys(EXPECTED).sort()).toEqual(CARS.map((c) => c.id).sort())
    for (const model of CARS) {
      const car = carWithGrades(model, CONTEXT, RACE_GAIN_ONLY, 'scrap')
      expect(stats(car, model).reliability, model.id).toBe(EXPECTED[model.id])
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

  /**
   * "Monotonicity in both axes" was true on a STOCK build even under
   * band-scaled demand, because a stock car has no gain part fitted at all
   * - band-scaling demand never had anything to shrink there. The defect
   * this sweep guards against only ever showed on a build with a fitted
   * GAIN part: ageing that part shrank its own band-scaled demand at the
   * same time condition fell, so the coherence factor rose and could
   * outrun the condition drop (band-scaled demand read 33, 34, 36 - RISING
   * - before cratering to 0 at poor, on this exact build). Demand reading
   * grade removes the coupling; this sweeps the fitted gain build's OWN
   * forced-induction band, on a representative car of each of the three
   * engine characters plus two more, and asserts the defect stays gone.
   */
  it("reliability never rises when a single fitted gain part's band worsens (RACE_GAIN_ONLY, several cars, all three engine characters)", () => {
    const reps = [
      'nissan-180sx-rps13', // forced
      'mazda-rx7-fd3s', // forced
      'toyota-sprinter-trueno-ae86', // high-strung-na
      'honda-beat-pp1', // high-strung-na
      'toyota-carina-at150', // lazy-na
    ] as const
    const bands = ['mint', 'fine', 'worn', 'poor', 'scrap'] as const
    for (const carId of reps) {
      const model = CARS.find((c) => c.id === carId)!
      let previous = Infinity
      for (const band of bands) {
        const car = withPartBand(
          carWithGrades(model, CONTEXT, RACE_GAIN_ONLY, 'mint'),
          'forcedInduction',
          band,
        )
        const value = stats(car, model).reliability
        expect(value, `${carId} at ${band}`).toBeLessThanOrEqual(previous)
        previous = value
      }
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

/**
 * Reliability reads a car's parts for their CONDITION and their GRADE, never
 * for a stat delta, and the retirement of the last additive stat column (the
 * flat per-part handling number) must therefore leave it bit-for-bit alone.
 * The build below is the sharp case: every slot that used to carry that
 * column, fitted at race grade, so if the two ever shared a path this table
 * is where it would show. Both figures were measured before the column was
 * removed and are asserted with strict equality.
 */
describe('reliability model: unmoved by the handling retirement', () => {
  /** The thirteen chassis, wheel, body and interior slots - none of them a
   * gain slot, so a mint build of them reads exactly the car's own base and
   * the whole table below is condition alone. */
  const RACE_CHASSIS: Partial<Record<CarPartId, 'race'>> = {
    gearbox: 'race',
    differential: 'race',
    chassis: 'race',
    dampers: 'race',
    springs: 'race',
    antiRollBars: 'race',
    steering: 'race',
    brakePadsDiscs: 'race',
    brakeCalipersLines: 'race',
    rims: 'race',
    panels: 'race',
    aero: 'race',
    seats: 'race',
  }

  it("at mint reads exactly the car's own base, all 26 shipped cars", () => {
    for (const model of CARS) {
      const car = carWithGrades(model, CONTEXT, RACE_CHASSIS, 'mint')
      expect(stats(car, model).reliability, model.id).toBe(model.spec.reliabilityBase)
    }
  })

  it('at worn reads the same 26 figures it read before, strict equality', () => {
    const WORN_EXPECTED: Record<string, number> = {
      'honda-beat-pp1': 59,
      'honda-city-e-aa': 64,
      'honda-city-turbo-ii-aa': 57,
      'honda-civic-sir2-eg6': 63,
      'honda-crx-sir-ef8': 62,
      'honda-prelude-si-vtec-bb4': 62,
      'mazda-rx7-fd3s': 52,
      'mazda-savanna-rx7-fc3s': 53,
      'nissan-180sx-rps13': 60,
      'nissan-cefiro-a31': 60,
      'nissan-fairlady-z-z32': 55,
      'nissan-silvia-ks-s14': 60,
      'nissan-silvia-s13': 60,
      'nissan-skyline-gtr-bnr32': 59,
      'nissan-sunny-b12': 64,
      'subaru-impreza-wrx-sti-gc8': 56,
      'suzuki-alto-works-ha21s': 59,
      'suzuki-wagon-r-ct21s': 64,
      'toyota-aristo-30v-jzs147': 62,
      'toyota-carina-at150': 65,
      'toyota-chaser-tourer-v-jzx90': 61,
      'toyota-mr2-aw11': 60,
      'toyota-mr2-sw20': 59,
      'toyota-sera-exy10': 62,
      'toyota-sprinter-trueno-ae86': 61,
      'toyota-supra-rz-jza80': 61,
    }
    expect(Object.keys(WORN_EXPECTED).sort()).toEqual(CARS.map((c) => c.id).sort())
    for (const model of CARS) {
      const car = carWithGrades(model, CONTEXT, RACE_CHASSIS, 'worn')
      expect(stats(car, model).reliability, model.id).toBe(WORN_EXPECTED[model.id])
    }
  })
})

describe('reliability model: statFormulas.reliabilityCap is retired', () => {
  it('economy.json no longer carries statFormulas.reliabilityCap', () => {
    expect('reliabilityCap' in ECONOMY.statFormulas).toBe(false)
  })
})
