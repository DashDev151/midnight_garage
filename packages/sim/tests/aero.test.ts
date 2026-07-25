import {
  BUYERS,
  CARS,
  COURSES,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type Part,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { lapTimeSecondsFor } from '../src/lapModel'
import {
  aeroGripMultiplier,
  computeGrip,
  effectiveDownforce,
  gripToDisplay,
  lapTime,
} from '../src/performance'
import { computeDerivedStats } from '../src/derivedStats'
import { buildCarInstance, mintCarParts } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const AERO = ECONOMY.statFormulas.aero

const TSURUGI = COURSES.find((c) => c.id === 'tsurugi')!
const WANGAN = COURSES.find((c) => c.id === 'wangan')!

/** A fast, powerful car, so the speed-squared term has something to work with. */
const SUPRA = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')!

const aeroPart = (grade: 'street' | 'sport' | 'race'): Part =>
  PARTS.find((p) => p.carPartId === 'aero' && p.grade === grade && p.aeroFunctional)!
/** A body-panel SKU sharing the aero slot but doing nothing aerodynamic. */
const BODY_KIT = PARTS.find(
  (p) => p.carPartId === 'aero' && p.grade === 'sport' && !p.aeroFunctional,
)!

function carWithAero(part?: Part) {
  const car = buildCarInstance({ modelId: SUPRA.id, parts: mintCarParts() })
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
    expect(aeroGripMultiplier(200, AERO.byGrade.race.downforceCoeff, AERO)).toBeLessThanOrEqual(
      AERO.maxGripMultiplier,
    )
  })
})

describe('effectiveDownforce', () => {
  it('is nothing for a car with no aero fitted and no factory aero', () => {
    expect(effectiveDownforce(carWithAero(), SUPRA, CONTEXT.partsById, AERO)).toEqual({
      downforceCoeff: 0,
      dragCdDelta: 0,
    })
  })

  it('takes the fitted aero SKU grade', () => {
    const fitted = effectiveDownforce(carWithAero(aeroPart('race')), SUPRA, CONTEXT.partsById, AERO)
    expect(fitted).toEqual(AERO.byGrade.race)
  })

  it('ignores a body-panel SKU in the same slot - it is not aerodynamic', () => {
    const fitted = effectiveDownforce(carWithAero(BODY_KIT), SUPRA, CONTEXT.partsById, AERO)
    expect(fitted.downforceCoeff).toBe(0)
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
  it('changes nothing at all for every stock car, on every course', () => {
    // The regression that matters: this sprint must not silently retune the game.
    for (const model of CARS) {
      for (const course of COURSES) {
        const withoutAero = lapTime(model, course, model.spec.stockPowerPs, undefined, ECONOMY)
        const explicitNone = lapTime(model, course, model.spec.stockPowerPs, undefined, ECONOMY, {
          downforceCoeff: 0,
          dragCdDelta: 0,
        })
        expect(explicitNone, `${model.id} on ${course.id}`).toBe(withoutAero)
      }
    }
  })

  it('the drag a wing costs bites hardest on the fastest course', () => {
    // Drag scales with the square of speed, so the bayshore pays for bodywork in
    // a way a tight pass never does.
    const dragCost = (course: typeof TSURUGI) =>
      lapTime(SUPRA, course, SUPRA.spec.stockPowerPs, undefined, ECONOMY, {
        downforceCoeff: 0,
        dragCdDelta: AERO.byGrade.race.dragCdDelta,
      }) - lapTime(SUPRA, course, SUPRA.spec.stockPowerPs, undefined, ECONOMY)
    expect(dragCost(WANGAN)).toBeGreaterThan(dragCost(TSURUGI))
    expect(dragCost(WANGAN)).toBeGreaterThan(0)
  })

  it('a wing is worth least where it is paid for most', () => {
    // The trade in the shape the signed values actually produce: the net gain on
    // the bayshore is a fraction of the gain on the twisty circuit.
    const netGain = (courseId: string) =>
      lapTimeSecondsFor(carWithAero(), SUPRA, CONTEXT, courseId)! -
      lapTimeSecondsFor(carWithAero(aeroPart('race')), SUPRA, CONTEXT, courseId)!
    expect(netGain('tsurugi')).toBeGreaterThan(netGain('wangan'))
  })

  it('a better aero grade is never slower on a twisty course', () => {
    const time = (grade: 'street' | 'sport' | 'race') =>
      lapTimeSecondsFor(carWithAero(aeroPart(grade)), SUPRA, CONTEXT, 'tsurugi')!
    expect(time('sport')).toBeLessThanOrEqual(time('street'))
    expect(time('race')).toBeLessThanOrEqual(time('sport'))
  })

  it('a cosmetic body kit in the aero slot changes no lap time', () => {
    const stock = lapTimeSecondsFor(carWithAero(), SUPRA, CONTEXT, 'tsurugi')
    const bodyKit = lapTimeSecondsFor(carWithAero(BODY_KIT), SUPRA, CONTEXT, 'tsurugi')
    expect(bodyKit).toBe(stock)
  })

  it('downforce is invisible to the handling stat, however much of it a car has', () => {
    // The readout is a skidpad figure and downforce is worth nothing at a
    // standstill, so factory aero must not move it. This is what keeps valuation
    // (which reads handling) and the advanceDay goldens still.
    // Note: fitting an aero PART does move the stat, through that part's own
    // statModifiers - long-standing behaviour, unrelated to this sprint's physics.
    const car = carWithAero()
    const statsFor = (downforceCoeff: number) =>
      computeDerivedStats(
        { ...SUPRA, spec: { ...SUPRA.spec, downforceCoeff } },
        car,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomy,
        ECONOMY,
      ).handling
    expect(statsFor(0.85)).toBe(statsFor(0))
  })

  it('mechanical grip itself carries no aero term', () => {
    const grip = ECONOMY.statFormulas.grip
    const winged = { ...SUPRA, spec: { ...SUPRA.spec, downforceCoeff: 0.85 } }
    expect(computeGrip(winged, undefined, grip)).toBe(computeGrip(SUPRA, undefined, grip))
    // ...and the display curve therefore reads identically too.
    expect(gripToDisplay(computeGrip(winged, undefined, grip), grip)).toBe(
      gripToDisplay(computeGrip(SUPRA, undefined, grip), grip),
    )
  })
})
