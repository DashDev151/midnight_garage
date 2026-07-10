import type { CarInstance } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { averageConditionPercent, saleReputationDeltaFor } from '../src/carCondition'
import { LEMON_SALE_REPUTATION_PENALTY, QUALITY_SALE_REPUTATION_BONUS } from '../src/constants'

function carWith(overrides: {
  authenticityPercent?: number
  conditions?: Partial<Record<keyof CarInstance['components'], number>>
}): CarInstance {
  const base = 90
  const conditions = overrides.conditions ?? {}
  return {
    id: 'car-0001',
    modelId: 'honda-city-e-aa',
    year: 1990,
    mileageKm: 100_000,
    color: 'White',
    provenanceNote: '',
    hiddenIssues: [],
    authenticityPercent: overrides.authenticityPercent ?? 90,
    components: {
      engine: { condition: conditions.engine ?? base, installed: null },
      forcedInduction: { condition: conditions.forcedInduction ?? base, installed: null },
      drivetrain: { condition: conditions.drivetrain ?? base, installed: null },
      suspension: { condition: conditions.suspension ?? base, installed: null },
      brakes: { condition: conditions.brakes ?? base, installed: null },
      wheels: { condition: conditions.wheels ?? base, installed: null },
      body: { condition: conditions.body ?? base, installed: null },
      interior: { condition: conditions.interior ?? base, installed: null },
    },
  }
}

describe('averageConditionPercent', () => {
  it('averages all 8 components evenly', () => {
    const car = carWith({ conditions: { engine: 100, brakes: 0 } })
    // 6 components at 90, one at 100, one at 0 -> (6*90 + 100 + 0) / 8
    expect(averageConditionPercent(car)).toBeCloseTo((6 * 90 + 100 + 0) / 8)
  })

  it('is 100 when every component is pristine', () => {
    const car = carWith({
      conditions: {
        engine: 100,
        forcedInduction: 100,
        drivetrain: 100,
        suspension: 100,
        brakes: 100,
        wheels: 100,
        body: 100,
        interior: 100,
      },
    })
    expect(averageConditionPercent(car)).toBe(100)
  })
})

describe('saleReputationDeltaFor', () => {
  it('grants the quality bonus when average condition and authenticity both clear the bar', () => {
    const car = carWith({ authenticityPercent: 90 }) // every component at 90
    expect(saleReputationDeltaFor(car)).toBe(QUALITY_SALE_REPUTATION_BONUS)
  })

  it('is neutral when condition clears the bar but authenticity does not', () => {
    const car = carWith({ authenticityPercent: 50 })
    expect(saleReputationDeltaFor(car)).toBe(0)
  })

  it('is neutral for an ordinary, unremarkable sale', () => {
    const car = carWith({ conditions: { engine: 60 }, authenticityPercent: 60 })
    expect(saleReputationDeltaFor(car)).toBe(0)
  })

  it('penalizes a lemon by low average condition', () => {
    const car = carWith({
      conditions: {
        engine: 30,
        forcedInduction: 30,
        drivetrain: 30,
        suspension: 30,
        brakes: 30,
        wheels: 30,
        body: 30,
        interior: 30,
      },
    })
    expect(saleReputationDeltaFor(car)).toBe(-LEMON_SALE_REPUTATION_PENALTY)
  })

  it('penalizes a lemon by a single severely damaged component, even with a fine average', () => {
    const car = carWith({ conditions: { engine: 5 } }) // 7 components at 90, one at 5
    // Above LEMON_MAX_AVERAGE_CONDITION (40) on its own — the single-component
    // rule is the only thing that can catch this car.
    expect(averageConditionPercent(car)).toBeGreaterThan(40)
    expect(saleReputationDeltaFor(car)).toBe(-LEMON_SALE_REPUTATION_PENALTY)
  })

  it('lemon takes precedence over quality when a car with a dead component still averages high enough', () => {
    // Seven components at 96+, one at <=10: averages >=85 (the review-found overlap case).
    const car = carWith({
      conditions: {
        engine: 96,
        forcedInduction: 96,
        drivetrain: 96,
        suspension: 96,
        brakes: 96,
        wheels: 96,
        body: 96,
        interior: 10,
      },
      authenticityPercent: 90,
    })
    expect(averageConditionPercent(car)).toBeGreaterThanOrEqual(85)
    expect(saleReputationDeltaFor(car)).toBe(-LEMON_SALE_REPUTATION_PENALTY)
  })
})
