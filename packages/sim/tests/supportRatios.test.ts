import {
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  SubsystemSchema,
  type CarPartId,
  type Subsystem,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { supportRatios, supportVerdict } from '../src/support'
import { carWithGrades } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)
const ECONOMY = CONTEXT.economy

/** One representative shipped car per engine character (all three named in
 * `economy.json`'s own `naHighStrungThreshold` doc comment, so these are
 * already the codebase's sanity targets). */
const FORCED_CAR = CARS.find((c) => c.id === 'nissan-180sx-rps13')!
const HIGH_STRUNG_NA_CAR = CARS.find((c) => c.id === 'honda-beat-pp1')!
const LAZY_NA_CAR = CARS.find((c) => c.id === 'toyota-carina-at150')!

/** The five gain-only slots: no supporting role in any subsystem (unlike
 * block/internals/headValvetrain, which are dual-role). These are the ones
 * the "pure gain never raises the headline" behavioural test applies to. */
const PURE_GAIN_SLOTS: CarPartId[] = [
  'camsTiming',
  'intake',
  'exhaust',
  'ignitionEcu',
  'forcedInduction',
]

describe('supportRatios: the stock-car identity', () => {
  it('all 26 shipped cars sit at exactly 1.0 on every subsystem, strict equality', () => {
    for (const model of CARS) {
      const car = carWithGrades(model, CONTEXT, {})
      const ratios = supportRatios(car, model, CONTEXT.partsById, ECONOMY)
      for (const subsystem of SubsystemSchema.options) {
        expect(ratios[subsystem], `${model.id}.${subsystem}`).toBe(1)
      }
      const verdict = supportVerdict(car, model, CONTEXT.partsById, ECONOMY)
      expect(verdict.headline, model.id).toBe(1)
      expect(verdict.band, model.id).toBe('adequate')
    }
  })

  it('a five-way tie at 1.0 names the first subsystem in declared order (determinism)', () => {
    const car = carWithGrades(FORCED_CAR, CONTEXT, {})
    const verdict = supportVerdict(car, FORCED_CAR, CONTEXT.partsById, ECONOMY)
    expect(verdict.subsystem).toBe(SubsystemSchema.options[0])
    expect(verdict.subsystem).toBe('cylinderPressure')
  })
})

describe('supportRatios: the structural disjointness test', () => {
  it('demand and support slot sets never overlap within one subsystem, read from content', () => {
    const supportWeights = ECONOMY.statFormulas.support.supportWeights
    const gainBearingSlots = new Set<CarPartId>(
      PARTS.filter((part) =>
        Object.values(part.statModifiers.powerFraction).some((v) => v !== 0),
      ).map((part) => part.carPartId),
    )
    const demandSlotsBySubsystem: Record<Subsystem, ReadonlySet<CarPartId>> = {
      cylinderPressure: new Set(['forcedInduction']),
      fuelling: gainBearingSlots,
      heat: gainBearingSlots,
      revs: new Set(['camsTiming']),
      torqueTransmission: gainBearingSlots,
    }
    for (const subsystem of SubsystemSchema.options) {
      const supportSlots = new Set(Object.keys(supportWeights[subsystem]) as CarPartId[])
      for (const slot of demandSlotsBySubsystem[subsystem]) {
        expect(
          supportSlots.has(slot),
          `${subsystem}: "${slot}" both demands and supports the same subsystem`,
        ).toBe(false)
      }
    }
  })
})

/**
 * Demand reads GRADE, not band, matching support (which always has). An
 * earlier rule had this backwards - "demand reads band, support reads
 * grade" - and band-scaling demand let a rotting gain part demand LESS of
 * the bottom end its own hardware was rated for, which raised the coherence
 * factor (and so reliability) as the part aged. See
 * `docs/sprints/tuning-arc.md`'s rewritten second correction for the fuller
 * account.
 */
describe('supportRatios: demand reads grade, not band', () => {
  it('a worn race turbo demands EXACTLY as much as a mint one (cylinder pressure ratio unchanged)', () => {
    const mintTurbo = carWithGrades(FORCED_CAR, CONTEXT, { forcedInduction: 'race' }, 'mint')
    const wornTurbo = carWithGrades(FORCED_CAR, CONTEXT, { forcedInduction: 'race' }, 'worn')
    const mintRatio = supportRatios(
      mintTurbo,
      FORCED_CAR,
      CONTEXT.partsById,
      ECONOMY,
    ).cylinderPressure
    const wornRatio = supportRatios(
      wornTurbo,
      FORCED_CAR,
      CONTEXT.partsById,
      ECONOMY,
    ).cylinderPressure
    expect(wornRatio).toBe(mintRatio)
  })

  it('a worn race fuel system supports exactly as much as a mint one (fuelling ratio unchanged)', () => {
    const mintFuel = carWithGrades(FORCED_CAR, CONTEXT, { fuelSystem: 'race' }, 'mint')
    const wornFuel = carWithGrades(FORCED_CAR, CONTEXT, { fuelSystem: 'race' }, 'worn')
    const mintRatio = supportRatios(mintFuel, FORCED_CAR, CONTEXT.partsById, ECONOMY).fuelling
    const wornRatio = supportRatios(wornFuel, FORCED_CAR, CONTEXT.partsById, ECONOMY).fuelling
    expect(wornRatio).toBe(mintRatio)
  })
})

describe('supportRatios: a pure gain part never raises the headline', () => {
  for (const [label, model] of [
    ['forced', FORCED_CAR],
    ['high-strung-na', HIGH_STRUNG_NA_CAR],
    ['lazy-na', LAZY_NA_CAR],
  ] as const) {
    for (const slot of PURE_GAIN_SLOTS) {
      for (const grade of ['street', 'sport', 'race'] as const) {
        it(`${slot} at ${grade} on a ${label} car never raises the headline above 1.0`, () => {
          const car = carWithGrades(model, CONTEXT, { [slot]: grade })
          const verdict = supportVerdict(car, model, CONTEXT.partsById, ECONOMY)
          expect(verdict.headline).toBeLessThanOrEqual(1)
        })
      }
    }
  }
})

describe('supportRatios: the two worked support tables, pinned exactly', () => {
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

  it('a maximal forced-induction build, race grade throughout: headline 1.226, adequate', () => {
    const car = carWithGrades(FORCED_CAR, CONTEXT, ALL_RACE)
    const ratios = supportRatios(car, FORCED_CAR, CONTEXT.partsById, ECONOMY)
    expect(ratios.cylinderPressure).toBeCloseTo(1.226, 3)
    expect(ratios.fuelling).toBeCloseTo(1.232, 3)
    expect(ratios.heat).toBeCloseTo(1.241, 3)
    expect(ratios.revs).toBeCloseTo(1.273, 3)
    expect(ratios.torqueTransmission).toBeCloseTo(1.251, 3)
    const verdict = supportVerdict(car, FORCED_CAR, CONTEXT.partsById, ECONOMY)
    expect(verdict.headline).toBeCloseTo(1.226, 3)
    expect(verdict.band).toBe('adequate')
  })

  /**
   * The proportional support margin (`stockSupportMargin`) lifts this
   * build off a flat headroom's figure of 0.588 (`dangerous`) to 0.815
   * (`strained`) - a bare race turbo on a stock bottom end no longer reads
   * as an emergency, only as unsupported. See the reliability rebalance
   * design notes for the full account of why a flat headroom punished this
   * build too hard.
   */
  it('a race turbo and nothing else: headline 0.815, strained, cylinder pressure named', () => {
    const car = carWithGrades(FORCED_CAR, CONTEXT, { forcedInduction: 'race' })
    const ratios = supportRatios(car, FORCED_CAR, CONTEXT.partsById, ECONOMY)
    expect(ratios.cylinderPressure).toBeCloseTo(0.815, 3)
    expect(ratios.fuelling).toBeCloseTo(0.902, 3)
    expect(ratios.heat).toBeCloseTo(0.911, 3)
    expect(ratios.revs).toBeCloseTo(1.0, 3)
    expect(ratios.torqueTransmission).toBeCloseTo(0.892, 3)
    const verdict = supportVerdict(car, FORCED_CAR, CONTEXT.partsById, ECONOMY)
    expect(verdict.headline).toBeCloseTo(0.815, 3)
    expect(verdict.band).toBe('strained')
    expect(verdict.subsystem).toBe('cylinderPressure')
  })
})

describe('supportRatios: fuel does not hold a piston together', () => {
  it('a race turbo with race fuelling and race cooling but a stock bottom end still reads strained, cylinder pressure', () => {
    const car = carWithGrades(FORCED_CAR, CONTEXT, {
      forcedInduction: 'race',
      fuelSystem: 'race',
      cooling: 'race',
    })
    const verdict = supportVerdict(car, FORCED_CAR, CONTEXT.partsById, ECONOMY)
    // Fuelling and cooling support only their OWN subsystems (well past
    // adequate here); cylinder pressure has no supporting slot at all, so
    // it stays the named shortfall regardless - the headline is identical
    // to the turbo-alone case above.
    expect(verdict.headline).toBeCloseTo(0.815, 3)
    expect(verdict.band).toBe('strained')
    expect(verdict.subsystem).toBe('cylinderPressure')
  })
})

describe('supportRatios: mild bolt-ons do not warn', () => {
  it('a street exhaust alone reads adequate on every one of the 26 shipped cars', () => {
    for (const model of CARS) {
      const car = carWithGrades(model, CONTEXT, { exhaust: 'street' })
      const verdict = supportVerdict(car, model, CONTEXT.partsById, ECONOMY)
      expect(verdict.band, model.id).toBe('adequate')
    }
  })
})
