import {
  BUYERS,
  CARS,
  COURSES,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type Course,
  type Part,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { lapTimeSecondsFor } from '../src/lapModel'
import {
  aeroGripMultiplier,
  computeGrip,
  effectiveDownforce,
  factoryDownforceCoeff,
  gripToDisplay,
  lapTime,
} from '../src/performance'
import { computeDerivedStats } from '../src/derivedStats'
import { buildCarInstance, mintCarParts } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const AERO = ECONOMY.statFormulas.aero
const GRIP = ECONOMY.statFormulas.grip

function courseById(id: string): Course {
  const found = COURSES.find((c) => c.id === id)
  if (!found) throw new Error(`course ${id} missing from content`)
  return found
}

const HAKONE = courseById('hakone')
const WANGAN = courseById('wangan')
const MISAKI = courseById('misaki')
const YATABE = courseById('yatabe')

/** A fast, powerful car, so the speed-squared term has something to work with.
 * Its lateral pair rises with speed, so it carries measured factory downforce. */
const SUPRA = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')!
/** A car with no measured lateral pair at all, so its aero is whatever the
 * model declares and nothing is fitted by measurement behind the test's back. */
const CIVIC = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!
const SUPRA_CLASS = fitmentClassForTier(SUPRA.tier)

const aeroPart = (grade: 'street' | 'sport' | 'race'): Part =>
  PARTS.find((p) => p.carPartId === 'aero' && p.grade === grade && p.aeroFunctional)!
/** A cosmetic body kit: it changes what the car looks like, not what it does,
 * so it lives on the `panels` body slot rather than on `aero`. */
const BODY_KIT = PARTS.find(
  (p) => p.carPartId === 'panels' && p.grade === 'sport' && p.fitmentClass === SUPRA_CLASS,
)!

/** Fits `part` into its own catalogue slot at mint, leaving every other slot
 * on the mint stock baseline. */
function carWithAero(part?: Part, modelId: string = SUPRA.id) {
  const car = buildCarInstance({ modelId, parts: mintCarParts() })
  if (part) {
    car.parts[part.carPartId].installed = {
      id: `fixture-${part.id}`,
      partId: part.id,
      band: 'mint',
      origin: { kind: 'market' as const, day: 1 },
    }
  }
  return car
}

/** The same car with a second SKU fitted on top - the pair this file cares
 * about is a functional wing plus a cosmetic kit. */
function alsoFitting(car: ReturnType<typeof carWithAero>, part: Part) {
  const next = { ...car, parts: { ...car.parts } }
  next.parts[part.carPartId] = {
    installed: {
      id: `fixture-${part.id}`,
      partId: part.id,
      band: 'mint',
      origin: { kind: 'market' as const, day: 1 },
    },
  }
  return next
}

describe('aeroGripMultiplier', () => {
  it('is exactly 1 with no aero, at any speed', () => {
    expect(aeroGripMultiplier(0, 0, AERO)).toBe(1)
    expect(aeroGripMultiplier(80, 0, AERO)).toBe(1)
  })

  it('is exactly 1 at a standstill even with a full race wing', () => {
    expect(aeroGripMultiplier(0, AERO.byGrade.race.downforceCoeff, AERO)).toBe(1)
  })

  it('grows with the square of speed', () => {
    const coeff = AERO.byGrade.race.downforceCoeff
    const slow = aeroGripMultiplier(25, coeff, AERO)
    const fast = aeroGripMultiplier(50, coeff, AERO)
    expect(slow).toBeGreaterThan(1)
    // Four times the speed-squared, so four times the gain over 1.
    expect(fast - 1).toBeCloseTo(4 * (slow - 1), 6)
  })

  it('never exceeds the configured ceiling', () => {
    expect(aeroGripMultiplier(400, AERO.byGrade.race.downforceCoeff, AERO)).toBeLessThanOrEqual(
      AERO.maxGripMultiplier,
    )
  })
})

describe('effectiveDownforce', () => {
  it('is nothing for a car with no aero fitted, no measured lift and no declared aero', () => {
    expect(
      effectiveDownforce(carWithAero(undefined, CIVIC.id), CIVIC, CONTEXT.partsById, AERO),
    ).toEqual({ downforceCoeff: 0, dragCdDelta: 0 })
  })

  it('is the measured factory downforce for a car whose lateral grip rises with speed', () => {
    const factory = effectiveDownforce(carWithAero(), SUPRA, CONTEXT.partsById, AERO)
    expect(factory.downforceCoeff).toBeGreaterThan(0)
    expect(factory.downforceCoeff).toBe(factoryDownforceCoeff(SUPRA, AERO))
    // A published drag figure already includes the factory bodywork, so the
    // factory item never charges drag on top of it.
    expect(factory.dragCdDelta).toBe(0)
  })

  it('adds the fitted aero SKU grade to the factory figure, and takes its drag whole', () => {
    const fitted = effectiveDownforce(carWithAero(aeroPart('race')), SUPRA, CONTEXT.partsById, AERO)
    expect(fitted.downforceCoeff).toBe(
      factoryDownforceCoeff(SUPRA, AERO) +
        AERO.byGrade.race.downforceCoeff * SUPRA.spec.aeroCeiling,
    )
    expect(fitted.dragCdDelta).toBe(AERO.byGrade.race.dragCdDelta)
  })

  it('is untouched by a cosmetic body kit, which occupies a body slot of its own', () => {
    // The kit says what the car looks like and the wing says what it does. They
    // shared the `aero` slot once, which meant fitting the first silently
    // returned the car to factory downforce; they are separate addresses now.
    expect(BODY_KIT.carPartId).toBe('panels')
    const kitOnly = effectiveDownforce(carWithAero(BODY_KIT), SUPRA, CONTEXT.partsById, AERO)
    expect(kitOnly.downforceCoeff).toBe(factoryDownforceCoeff(SUPRA, AERO))
    expect(kitOnly.dragCdDelta).toBe(0)
    const wingAndKit = alsoFitting(carWithAero(aeroPart('race')), BODY_KIT)
    expect(effectiveDownforce(wingAndKit, SUPRA, CONTEXT.partsById, AERO)).toEqual(
      effectiveDownforce(carWithAero(aeroPart('race')), SUPRA, CONTEXT.partsById, AERO),
    )
  })

  it('better aero grades make more downforce and cost more drag', () => {
    const grades = ['street', 'sport', 'race'] as const
    const fitted = grades.map((g) => AERO.byGrade[g])
    for (let i = 1; i < fitted.length; i++) {
      expect(fitted[i]!.downforceCoeff).toBeGreaterThan(fitted[i - 1]!.downforceCoeff)
      expect(fitted[i]!.dragCdDelta).toBeGreaterThan(fitted[i - 1]!.dragCdDelta)
    }
  })
})

describe('the per-car aero ceiling', () => {
  const RACE_WING = aeroPart('race')

  it('adds a wing scaled by the car’s own ceiling to its factory floor, and never scales its drag', () => {
    for (const model of CARS) {
      const fitted = effectiveDownforce(
        carWithAero(RACE_WING, model.id),
        model,
        CONTEXT.partsById,
        AERO,
      )
      expect(fitted.downforceCoeff, model.id).toBe(
        factoryDownforceCoeff(model, AERO) +
          AERO.byGrade.race.downforceCoeff * model.spec.aeroCeiling,
      )
      // The drag arrives in full whatever the body, which is what makes a wing
      // on the wrong car a straight loss rather than merely a weak gain.
      expect(fitted.dragCdDelta, model.id).toBe(AERO.byGrade.race.dragCdDelta)
    }
  })

  /**
   * The floor half of the same rule, on every car and every grade: what the
   * body already makes is never taken away, so no fitted part can leave a car
   * generating less grip than it did bare. This is what a bolt-on wing really
   * does - it replaces the spoiler it sits where, never the underbody and the
   * shape the car was drawn with.
   */
  it('never leaves a car with less downforce than its own bodywork makes, on all 26 at every grade', () => {
    for (const model of CARS) {
      const bare = factoryDownforceCoeff(model, AERO)
      for (const grade of ['street', 'sport', 'race'] as const) {
        const fitted = effectiveDownforce(
          carWithAero(aeroPart(grade), model.id),
          model,
          CONTEXT.partsById,
          AERO,
        )
        expect(fitted.downforceCoeff, `${model.id}/${grade}`).toBeGreaterThanOrEqual(bare)
      }
    }
  })

  /**
   * The worst case the roster has, pinned by name. The City E's measured
   * lateral pair fits the largest factory downforce of any shipped car
   * (1.0038), and a race wing's own contribution on that body is 0.36, so
   * while a fitted part REPLACED the factory figure the best wing in the game
   * took the car from 41 handling down to 30. Fitting aero to a car that
   * already makes some is now a gain, as it should always have been.
   */
  it('lifts the Honda City E rather than taking its own bodywork off it', () => {
    const CITY = CARS.find((c) => c.id === 'honda-city-e-aa')!
    const handlingWith = (part?: Part) =>
      computeDerivedStats(
        CITY,
        carWithAero(part, CITY.id),
        CONTEXT.partsById,
        PARTS_TAXONOMY,
        ECONOMY,
      ).handling
    expect(factoryDownforceCoeff(CITY, AERO)).toBeCloseTo(1.0038, 4)
    expect(handlingWith()).toBe(41)
    expect(handlingWith(aeroPart('street'))).toBe(41)
    expect(handlingWith(aeroPart('sport'))).toBe(42)
    expect(handlingWith(RACE_WING)).toBe(45)
  })

  /**
   * A stock car carries no aero SKU, so there is nothing for the ceiling to
   * scale and it must read exactly as it is measured. Asserted against the same
   * car on a model whose ceiling is forced to zero, which would flatten every
   * factory figure if the fitted and factory paths were ever joined: 15 of the
   * 26 shipped cars carry measured factory downforce and 13 of those sit below
   * a ceiling of 1.0, so the check has real teeth rather than being vacuous.
   */
  it('leaves a stock car exactly where it was, on all 26 and every course', () => {
    for (const model of CARS) {
      const stock = carWithAero(undefined, model.id)
      const grounded = { ...model, spec: { ...model.spec, aeroCeiling: 0 } }
      const asShipped = effectiveDownforce(stock, model, CONTEXT.partsById, AERO)
      expect(asShipped.downforceCoeff, model.id).toBe(factoryDownforceCoeff(model, AERO))
      expect(asShipped.dragCdDelta, model.id).toBe(0)
      expect(effectiveDownforce(stock, grounded, CONTEXT.partsById, AERO), model.id).toEqual(
        asShipped,
      )
      for (const course of COURSES) {
        expect(
          lapTimeSecondsFor(stock, grounded, CONTEXT, course.id),
          `${model.id} on ${course.id}`,
        ).toBe(lapTimeSecondsFor(stock, model, CONTEXT, course.id))
      }
    }
  })

  /**
   * The widest pair the roster offers, a kei box at 0.20 against an FD at 1.00,
   * with the SAME race wing on both so the only thing that differs is the body
   * it is bolted to. The FD keeps all 1.2 of the grade's downforce on top of
   * the 0.2476 its own body makes; the Wagon R keeps 0.24 of it on top of
   * nothing, and pays the full drag either way.
   *
   * Which is why the lap goes the way it does: the FD takes two and a half
   * seconds out of Misaki and the Wagon R LOSES half a second there and a second
   * on the bayshore. A wing on a kei van is not a small gain, it is a cost.
   *
   * Both cars are otherwise stock, so both are also carrying the chassis-support
   * loss in full: a race wing raises what the brakes, steering and shell have to
   * cope with, and neither car has any of it. That is what turns the FD's pass
   * lap - slow switchbacks where downforce buys almost nothing - from a gain into
   * a cost.
   */
  describe('a wing on a Wagon R against the same wing on an FD', () => {
    const WAGON_R = CARS.find((c) => c.id === 'suzuki-wagon-r-ct21s')!
    const FD = CARS.find((c) => c.id === 'mazda-rx7-fd3s')!

    const downforceWith = (model: typeof WAGON_R) =>
      effectiveDownforce(carWithAero(RACE_WING, model.id), model, CONTEXT.partsById, AERO)
        .downforceCoeff

    /** The shown lap time (the figure the player reads) stock, then winged. */
    const shownTimes = (model: typeof WAGON_R, courseId: string) => ({
      stock: lapTimeSecondsFor(carWithAero(undefined, model.id), model, CONTEXT, courseId)!,
      winged: lapTimeSecondsFor(carWithAero(RACE_WING, model.id), model, CONTEXT, courseId)!,
    })

    it('gives the FD five times the wing it gives the Wagon R, on top of a floor the kei box has none of', () => {
      expect(WAGON_R.spec.aeroCeiling).toBe(0.2)
      expect(FD.spec.aeroCeiling).toBe(1)
      // The Wagon R's own body makes nothing, so what the ceiling keeps is the
      // whole of its downforce; the FD's wing lands on a real factory figure.
      expect(factoryDownforceCoeff(WAGON_R, AERO)).toBe(0)
      expect(factoryDownforceCoeff(FD, AERO)).toBeCloseTo(0.2476, 4)
      expect(downforceWith(WAGON_R)).toBeCloseTo(0.24, 10)
      expect(downforceWith(FD)).toBeCloseTo(factoryDownforceCoeff(FD, AERO) + 1.2, 10)
    })

    it('costs the Wagon R time on every course', () => {
      expect(shownTimes(WAGON_R, 'misaki')).toEqual({ stock: 143.4, winged: 149.4 })
      expect(shownTimes(WAGON_R, 'wangan')).toEqual({ stock: 192.8, winged: 202.1 })
      expect(shownTimes(WAGON_R, 'hakone')).toEqual({ stock: 143, winged: 144.4 })
      expect(shownTimes(WAGON_R, 'yatabe')).toEqual({ stock: 36.1, winged: 37 })
    })

    it('buys the FD real time where the corners are fast, and costs it where they are not', () => {
      expect(shownTimes(FD, 'misaki')).toEqual({ stock: 106.2, winged: 103.8 })
      expect(shownTimes(FD, 'wangan')).toEqual({ stock: 134.8, winged: 131.6 })
      // The pass is 11 m switchbacks taken far too slowly for downforce to pay,
      // and the grip an unsupported build cannot use is charged there all the
      // same, so a bare wing loses the FD time on the mountain.
      expect(shownTimes(FD, 'hakone')).toEqual({ stock: 113.7, winged: 115.6 })
      // The standing kilometre has no corners to pay the drag back, so even the
      // FD loses there. Downforce is worth nothing in a straight line.
      expect(shownTimes(FD, 'yatabe')).toEqual({ stock: 24.3, winged: 24.8 })
    })
  })
})

describe('aero in the lap model', () => {
  it("a lap's default aero effect is the car's own factory bodywork, on every car and course", () => {
    for (const model of CARS) {
      for (const course of COURSES) {
        const byDefault = lapTime(model, course, model.spec.stockPowerPs, undefined, ECONOMY)
        const explicitFactory = lapTime(
          model,
          course,
          model.spec.stockPowerPs,
          undefined,
          ECONOMY,
          { downforceCoeff: factoryDownforceCoeff(model, AERO), dragCdDelta: 0 },
        )
        expect(explicitFactory, `${model.id} on ${course.id}`).toBe(byDefault)
      }
    }
  })

  it('the drag a wing costs bites hardest on the fastest course', () => {
    // Drag scales with the square of speed, so the bayshore pays for bodywork in
    // a way a tight pass never does. Downforce is held at the car's own factory
    // figure on both sides, so this measures drag alone.
    const factory = factoryDownforceCoeff(SUPRA, AERO)
    const dragCost = (course: Course) =>
      lapTime(SUPRA, course, SUPRA.spec.stockPowerPs, undefined, ECONOMY, {
        downforceCoeff: factory,
        dragCdDelta: AERO.byGrade.race.dragCdDelta,
      }) -
      lapTime(SUPRA, course, SUPRA.spec.stockPowerPs, undefined, ECONOMY, {
        downforceCoeff: factory,
        dragCdDelta: 0,
      })
    expect(dragCost(WANGAN)).toBeGreaterThan(dragCost(HAKONE))
    expect(dragCost(WANGAN)).toBeGreaterThan(0)
  })

  /**
   * Downforce goes as the square of speed and drag is its price, so what a wing
   * is worth is decided entirely by how fast the corners are taken. Measured as
   * a FRACTION of the lap, because the gain accrues corner by corner and the
   * four courses are nowhere near the same length: Wangan wins more raw seconds
   * than Misaki purely by being the longer lap.
   */
  it('a wing pays where the corners are fast, pays little where they are slow, and costs where there are none', () => {
    const gainFraction = (course: Course) => {
      const bare = lapTime(SUPRA, course, SUPRA.spec.stockPowerPs, SUPRA.spec.tyreCompound, ECONOMY)
      const winged = lapTime(
        SUPRA,
        course,
        SUPRA.spec.stockPowerPs,
        SUPRA.spec.tyreCompound,
        ECONOMY,
        AERO.byGrade.race,
      )
      return (bare - winged) / bare
    }
    const misaki = gainFraction(MISAKI)
    const wangan = gainFraction(WANGAN)
    const hakone = gainFraction(HAKONE)
    const yatabe = gainFraction(YATABE)

    // Fast circuit corners first, the bayshore's sweepers next, the pass's
    // switchbacks a distant third, and the standing kilometre a straight loss.
    expect(misaki).toBeGreaterThan(wangan)
    expect(wangan).toBeGreaterThan(hakone)
    expect(hakone).toBeGreaterThan(0)
    expect(yatabe).toBeLessThan(0)
    // The pass is taken far too slowly for aero to do much: its corners are
    // 11 m switchbacks, and the wing returns under half what it does at Misaki.
    expect(hakone).toBeLessThan(misaki / 2)
  })

  it('a better aero grade is never slower where the corners are fast', () => {
    const time = (grade: 'street' | 'sport' | 'race') =>
      lapTimeSecondsFor(carWithAero(aeroPart(grade)), SUPRA, CONTEXT, 'misaki')!
    expect(time('sport')).toBeLessThanOrEqual(time('street'))
    expect(time('race')).toBeLessThanOrEqual(time('sport'))
  })

  it('a cosmetic body kit changes no lap time, fitted alone or over a race wing', () => {
    const stock = lapTimeSecondsFor(carWithAero(), SUPRA, CONTEXT, 'misaki')
    const bodyKit = lapTimeSecondsFor(carWithAero(BODY_KIT), SUPRA, CONTEXT, 'misaki')
    expect(stock).not.toBeNull()
    expect(bodyKit).toBe(stock)
    const wing = lapTimeSecondsFor(carWithAero(aeroPart('race')), SUPRA, CONTEXT, 'misaki')
    const wingAndKit = lapTimeSecondsFor(
      alsoFitting(carWithAero(aeroPart('race')), BODY_KIT),
      SUPRA,
      CONTEXT,
      'misaki',
    )
    expect(wingAndKit).toBe(wing)
  })

  it('a car making downforce reads HIGHER on the handling stat', () => {
    // The readout is effective grip at a reference speed, not a skidpad figure,
    // so the one upgrade that carries a build past the top of the grip range is
    // visible in the number. A car with no downforce reads exactly as before.
    const car = carWithAero(undefined, CIVIC.id)
    const statsFor = (downforceCoeff: number) =>
      computeDerivedStats(
        { ...CIVIC, spec: { ...CIVIC.spec, downforceCoeff } },
        car,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomy,
        ECONOMY,
      ).handling
    expect(statsFor(AERO.byGrade.race.downforceCoeff)).toBeGreaterThan(statsFor(0))
  })

  it('mechanical grip carries no aero term, but the readout built on it does', () => {
    const winged = { ...CIVIC, spec: { ...CIVIC.spec, downforceCoeff: 0.85 } }
    const mu = computeGrip(CIVIC, undefined, GRIP)
    expect(computeGrip(winged, undefined, GRIP)).toBe(mu)
    expect(gripToDisplay(mu, 0.85, GRIP, AERO)).toBeGreaterThan(gripToDisplay(mu, 0, GRIP, AERO))
  })
})
