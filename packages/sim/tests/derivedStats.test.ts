import { ECONOMY, type CarInstance, type CarModel, type Part } from '@midnight-garage/content'
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
  hiddenIssues: [],
  authenticityPercent: 90,
  components: {
    engine: { condition: 100, installed: null },
    forcedInduction: { condition: 100, installed: null },
    drivetrain: { condition: 100, installed: null },
    suspension: { condition: 100, installed: null },
    brakes: { condition: 100, installed: null },
    wheels: { condition: 100, installed: null },
    body: { condition: 100, installed: null },
    interior: { condition: 100, installed: null },
  },
}

const coilovers: Part = {
  id: 'tanuki-street-coilovers',
  brand: 'Tanuki',
  name: 'Street Coilovers',
  componentId: 'suspension',
  grade: 'street',
  requiredTags: [],
  statModifiers: { power: 0, handling: 8, style: 3, reliability: 0, authenticity: 0 },
  priceYen: 70_000,
}

describe('computeDerivedStats', () => {
  it('a stock car at full condition returns the platform baseline', () => {
    const stats = computeDerivedStats(model, baseInstance, {}, {}, ECONOMY)
    expect(stats.power).toBe(model.spec.stockPowerPs)
    expect(stats.authenticity).toBe(90)
  })

  it('a genuine-period installed part fully applies its modifiers', () => {
    const instance: CarInstance = {
      ...baseInstance,
      components: {
        ...baseInstance.components,
        suspension: {
          condition: 100,
          installed: {
            id: 'pi-0001',
            partId: coilovers.id,
            conditionPercent: 100,
            genuinePeriod: true,
          },
        },
      },
    }
    const withPart = computeDerivedStats(
      model,
      instance,
      { [coilovers.id]: coilovers },
      {},
      ECONOMY,
    )
    const stock = computeDerivedStats(model, baseInstance, {}, {}, ECONOMY)
    expect(withPart.handling).toBe(stock.handling + 8)
    expect(withPart.style).toBe(stock.style + 3)
  })

  it('a worn part contributes proportionally less benefit', () => {
    const instance: CarInstance = {
      ...baseInstance,
      components: {
        ...baseInstance.components,
        suspension: {
          condition: 100,
          installed: {
            id: 'pi-0002',
            partId: coilovers.id,
            conditionPercent: 50,
            genuinePeriod: true,
          },
        },
      },
    }
    const worn = computeDerivedStats(model, instance, { [coilovers.id]: coilovers }, {}, ECONOMY)
    const stock = computeDerivedStats(model, baseInstance, {}, {}, ECONOMY)
    expect(worn.handling).toBe(stock.handling + 4)
  })

  it('power never goes negative even with a large negative part modifier', () => {
    const brokenPart: Part = {
      ...coilovers,
      id: 'broken-engine-part',
      componentId: 'engine',
      statModifiers: { power: -500, handling: 0, style: 0, reliability: 0, authenticity: 0 },
    }
    const instance: CarInstance = {
      ...baseInstance,
      components: {
        ...baseInstance.components,
        engine: {
          condition: 100,
          installed: {
            id: 'pi-0004',
            partId: brokenPart.id,
            conditionPercent: 100,
            genuinePeriod: true,
          },
        },
      },
    }
    const stats = computeDerivedStats(model, instance, { [brokenPart.id]: brokenPart }, {}, ECONOMY)
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
      components: {
        ...baseInstance.components,
        suspension: {
          condition: 100,
          installed: {
            id: 'pi-0003',
            partId: modifiedPart.id,
            conditionPercent: 100,
            genuinePeriod: false,
          },
        },
      },
    }
    const partsById = { [modifiedPart.id]: modifiedPart }
    const stats = computeDerivedStats(model, instance, partsById, {}, ECONOMY)
    expect(stats.authenticity).toBe(75)
  })

  /**
   * Sprint 12 decision 4: brakes/wheels/forcedInduction never had a
   * condition-to-stat pathway before the zones+slots -> components
   * migration (only interior condition also fed nothing). Wiring their new
   * condition fields into stats now would be a disguised balance change
   * smuggled into a refactor — this guards that they stay inert until
   * Sprint 13 gives repair-vs-replace on those components real stakes.
   */
  it('brakes/wheels/forcedInduction/interior condition changes produce zero stat delta', () => {
    const baseline = computeDerivedStats(model, baseInstance, {}, {}, ECONOMY)
    const damaged: CarInstance = {
      ...baseInstance,
      components: {
        ...baseInstance.components,
        brakes: { condition: 5, installed: null },
        wheels: { condition: 5, installed: null },
        forcedInduction: { condition: 5, installed: null },
        interior: { condition: 5, installed: null },
      },
    }
    expect(computeDerivedStats(model, damaged, {}, {}, ECONOMY)).toEqual(baseline)
  })
})
