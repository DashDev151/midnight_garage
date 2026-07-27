import {
  BUYERS,
  CARS,
  COURSES,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
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

const aeroPart = (grade: 'street' | 'sport' | 'race'): Part =>
  PARTS.find((p) => p.carPartId === 'aero' && p.grade === grade && p.aeroFunctional)!
/** A body-panel SKU sharing the aero slot but doing nothing aerodynamic. */
const BODY_KIT = PARTS.find(
  (p) => p.carPartId === 'aero' && p.grade === 'sport' && !p.aeroFunctional,
)!

function carWithAero(part?: Part, modelId: string = SUPRA.id) {
  const car = buildCarInstance({ modelId, parts: mintCarParts() })
  if (part) {
    car.parts.aero.installed = {
      id: `fixture-${part.id}`,
      partId: part.id,
      band: 'mint',
      genuinePeriod: false,
      origin: { kind: 'market' as const, day: 1 },
    }
  }
  return car
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

  it('takes the fitted aero SKU grade', () => {
    const fitted = effectiveDownforce(carWithAero(aeroPart('race')), SUPRA, CONTEXT.partsById, AERO)
    expect(fitted).toEqual(AERO.byGrade.race)
  })

  it('ignores a body-panel SKU in the same slot - it is not aerodynamic', () => {
    // The car keeps exactly the aero it came with: a cosmetic kit neither adds
    // downforce nor removes the factory figure.
    const fitted = effectiveDownforce(carWithAero(BODY_KIT), SUPRA, CONTEXT.partsById, AERO)
    expect(fitted.downforceCoeff).toBe(factoryDownforceCoeff(SUPRA, AERO))
    expect(fitted.dragCdDelta).toBe(0)
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

  it('a cosmetic body kit in the aero slot changes no lap time', () => {
    const stock = lapTimeSecondsFor(carWithAero(), SUPRA, CONTEXT, 'misaki')
    const bodyKit = lapTimeSecondsFor(carWithAero(BODY_KIT), SUPRA, CONTEXT, 'misaki')
    expect(stock).not.toBeNull()
    expect(bodyKit).toBe(stock)
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
