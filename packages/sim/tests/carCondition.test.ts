import { ECONOMY, type CarInstance, type HiddenIssue } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  averageConditionPercent,
  saleQualityFor,
  saleReputationDeltaFor,
} from '../src/carCondition'
import { LEMON_SALE_REPUTATION_PENALTY } from '../src/constants'

// No fixture in this file relies on the issue CATALOG (only on the car's own
// hiddenIssues array's repaired/severityPercent fields) except where a test
// explicitly says otherwise, so an empty catalog is correct by default.
const NO_ISSUES: Readonly<Record<string, HiddenIssue>> = {}

function carWith(overrides: {
  authenticityPercent?: number
  conditions?: Partial<Record<keyof CarInstance['components'], number>>
  hiddenIssues?: CarInstance['hiddenIssues']
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
    hiddenIssues: overrides.hiddenIssues ?? [],
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
    expect(averageConditionPercent(car, NO_ISSUES)).toBeCloseTo((6 * 90 + 100 + 0) / 8)
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
    expect(averageConditionPercent(car, NO_ISSUES)).toBe(100)
  })
})

describe('saleReputationDeltaFor (Sprint 23 decision 1: clean/concours/lemon precedence)', () => {
  it('grants the concours bonus when every component and authenticity both clear their bars', () => {
    const car = carWith({ authenticityPercent: 90 }) // every component at 90 (base)
    expect(saleReputationDeltaFor(car, NO_ISSUES, ECONOMY)).toBe(
      ECONOMY.reputation.concoursSaleBonus,
    )
  })

  it('grants the clean bonus when every component clears its bar but authenticity does not', () => {
    const car = carWith({ authenticityPercent: 50 })
    expect(saleReputationDeltaFor(car, NO_ISSUES, ECONOMY)).toBe(ECONOMY.reputation.cleanSaleBonus)
  })

  it('is neutral for an ordinary, unremarkable sale', () => {
    const car = carWith({ conditions: { engine: 60 }, authenticityPercent: 60 })
    expect(saleReputationDeltaFor(car, NO_ISSUES, ECONOMY)).toBe(0)
  })

  it('is neutral when a single component sits just under the clean bar, even though the average clears it', () => {
    // Seven components at 90 (carWith's base), one at 80: average is 88.75
    // (would have passed the old average-based bar of 85) but the new rule
    // requires EVERY component to clear cleanSaleMinConditionPercent (85) -
    // this is exactly the gap Sprint 23 decision 1 closes.
    const car = carWith({ conditions: { engine: 80 } })
    expect(averageConditionPercent(car, NO_ISSUES)).toBeGreaterThanOrEqual(85)
    expect(saleReputationDeltaFor(car, NO_ISSUES, ECONOMY)).toBe(0)
  })

  it('is neutral when an unrepaired issue remains, even though every component condition clears the bar', () => {
    const car = carWith({
      hiddenIssues: [
        { issueId: 'minor-rattle', revealed: true, severityPercent: 20, repaired: false },
      ],
    })
    expect(saleReputationDeltaFor(car, NO_ISSUES, ECONOMY)).toBe(0)
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
    expect(saleReputationDeltaFor(car, NO_ISSUES, ECONOMY)).toBe(-LEMON_SALE_REPUTATION_PENALTY)
  })

  it('penalizes a lemon by a single severely damaged component, even with a fine average', () => {
    const car = carWith({ conditions: { engine: 5 } }) // 7 components at 90, one at 5
    // Above LEMON_MAX_AVERAGE_CONDITION (40) on its own - the single-component
    // rule is the only thing that can catch this car.
    expect(averageConditionPercent(car, NO_ISSUES)).toBeGreaterThan(40)
    expect(saleReputationDeltaFor(car, NO_ISSUES, ECONOMY)).toBe(-LEMON_SALE_REPUTATION_PENALTY)
  })

  it('lemon takes precedence over concours when a severe unrepaired issue hides behind perfect conditions', () => {
    // Every component at 100, authenticity 90 (would be concours on its own),
    // but a severe unrepaired issue not present in the issue catalog at all
    // (so effectiveComponentCondition can't discover it either) - proves the
    // lemon-by-issue trigger reads the car's own hiddenIssues array directly,
    // and fires ahead of clean/concours regardless.
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
      authenticityPercent: 90,
      hiddenIssues: [
        { issueId: 'ghost-issue', revealed: true, severityPercent: 50, repaired: false },
      ],
    })
    expect(saleReputationDeltaFor(car, NO_ISSUES, ECONOMY)).toBe(-LEMON_SALE_REPUTATION_PENALTY)
  })
})

describe('saleQualityFor', () => {
  it('maps each of the four possible deltas to its named outcome', () => {
    expect(saleQualityFor(-LEMON_SALE_REPUTATION_PENALTY, ECONOMY)).toBe('lemon')
    expect(saleQualityFor(0, ECONOMY)).toBeNull()
    expect(saleQualityFor(ECONOMY.reputation.cleanSaleBonus, ECONOMY)).toBe('clean')
    expect(saleQualityFor(ECONOMY.reputation.concoursSaleBonus, ECONOMY)).toBe('concours')
  })
})
