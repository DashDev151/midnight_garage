import type { CarInstance, CarModel, Part } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeDerivedStats } from '../src/derivedStats'

const model: CarModel = {
  id: 'honda-city-e-aa',
  displayName: 'Honda City E (AA)',
  brand: 'Honda',
  parodyName: 'Citee E (AA)',
  parodyBrand: 'Handa',
  spec: {
    chassisCode: 'AA',
    engineCode: 'ER',
    yearFrom: 1981,
    curbWeightKg: 690,
    stockPowerPs: 61,
  },
  tier: 'shitbox',
  tags: ['FF', 'NA', 'Piston', '80s', 'JDM'],
  bookValueYen: 180_000,
  hiddenIssueWeights: [],
}

const baseInstance: CarInstance = {
  id: 'car-0001',
  modelId: model.id,
  year: 1984,
  mileageKm: 100_000,
  color: 'White',
  provenanceNote: '',
  condition: { engine: 100, drivetrain: 100, suspension: 100, body: 100, interior: 100 },
  hiddenIssues: [],
  authenticityPercent: 90,
  buildSheet: {
    engine: null,
    forcedInduction: null,
    drivetrain: null,
    suspension: null,
    brakes: null,
    bodyAero: null,
    wheelsInterior: null,
  },
}

const coilovers: Part = {
  id: 'tanuki-street-coilovers',
  brand: 'Tanuki',
  name: 'Street Coilovers',
  slot: 'suspension',
  grade: 'street',
  requiredTags: [],
  statModifiers: { power: 0, handling: 8, style: 3, reliability: 0, authenticity: 0 },
  priceYen: 70_000,
}

describe('computeDerivedStats', () => {
  it('a stock car at full condition returns the platform baseline', () => {
    const stats = computeDerivedStats(model, baseInstance, {})
    expect(stats.power).toBe(model.spec.stockPowerPs)
    expect(stats.authenticity).toBe(90)
  })

  it('a genuine-period installed part fully applies its modifiers', () => {
    const instance: CarInstance = {
      ...baseInstance,
      buildSheet: {
        ...baseInstance.buildSheet,
        suspension: {
          id: 'pi-0001',
          partId: coilovers.id,
          conditionPercent: 100,
          genuinePeriod: true,
        },
      },
    }
    const withPart = computeDerivedStats(model, instance, { [coilovers.id]: coilovers })
    const stock = computeDerivedStats(model, baseInstance, {})
    expect(withPart.handling).toBe(stock.handling + 8)
    expect(withPart.style).toBe(stock.style + 3)
  })

  it('a worn part contributes proportionally less benefit', () => {
    const instance: CarInstance = {
      ...baseInstance,
      buildSheet: {
        ...baseInstance.buildSheet,
        suspension: {
          id: 'pi-0002',
          partId: coilovers.id,
          conditionPercent: 50,
          genuinePeriod: true,
        },
      },
    }
    const worn = computeDerivedStats(model, instance, { [coilovers.id]: coilovers })
    const stock = computeDerivedStats(model, baseInstance, {})
    expect(worn.handling).toBe(stock.handling + 4)
  })

  it('power never goes negative even with a large negative part modifier', () => {
    const brokenPart: Part = {
      ...coilovers,
      id: 'broken-engine-part',
      slot: 'engine',
      statModifiers: { power: -500, handling: 0, style: 0, reliability: 0, authenticity: 0 },
    }
    const instance: CarInstance = {
      ...baseInstance,
      buildSheet: {
        ...baseInstance.buildSheet,
        engine: {
          id: 'pi-0004',
          partId: brokenPart.id,
          conditionPercent: 100,
          genuinePeriod: true,
        },
      },
    }
    const stats = computeDerivedStats(model, instance, { [brokenPart.id]: brokenPart })
    expect(stats.power).toBe(0)
  })

  it('a non-genuine part with a negative authenticity modifier still penalizes authenticity', () => {
    const modifiedPart: Part = {
      ...coilovers,
      id: 'race-coilovers',
      statModifiers: { power: 0, handling: 20, style: 0, reliability: 0, authenticity: -15 },
    }
    const instance: CarInstance = {
      ...baseInstance,
      buildSheet: {
        ...baseInstance.buildSheet,
        suspension: {
          id: 'pi-0003',
          partId: modifiedPart.id,
          conditionPercent: 100,
          genuinePeriod: false,
        },
      },
    }
    const stats = computeDerivedStats(model, instance, { [modifiedPart.id]: modifiedPart })
    expect(stats.authenticity).toBe(75)
  })
})
