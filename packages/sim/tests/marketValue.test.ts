import { ECONOMY, type CarInstance, type CarModel, type Part } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { conditionFactor, installedPartsValueYen, marketValueYen } from '../src/marketValue'

const model: CarModel = {
  id: 'toyota-supra-rz-jza80',
  displayName: 'Toyota Supra RZ (JZA80)',
  brand: 'Toyota',
  parodyName: 'Suprema RZ (JZA80)',
  parodyBrand: 'Toyoda',
  spec: {
    chassisCode: 'JZA80',
    engineCode: '2JZ-GTE',
    yearFrom: 1993,
    curbWeightKg: 1590,
    stockPowerPs: 280,
  },
  tier: 'rare',
  tags: ['FR', 'Turbo', 'Piston', '90s', 'JDM'],
  bookValueYen: 4_200_000,
  hiddenIssueWeights: [],
}

/** Every component at the same condition - since componentValueWeights sums
 * to 1.0, this makes `conditionFactor`'s weighted average exactly equal that
 * condition, which is what lets the worked examples below assert exactly. */
function carAtUniformCondition(condition: number): CarInstance {
  const component = { condition, installed: null }
  return {
    id: 'car-0001',
    modelId: model.id,
    year: 1994,
    mileageKm: 80_000,
    color: 'White',
    provenanceNote: '',
    hiddenIssues: [],
    authenticityPercent: 90,
    components: {
      engine: component,
      forcedInduction: component,
      drivetrain: component,
      suspension: component,
      brakes: component,
      wheels: component,
      body: component,
      interior: component,
    },
  }
}

describe('conditionFactor', () => {
  // Worked examples (sprint21.md decision 2), floor 0.35 / ceiling 1.10 /
  // exponent 1.3: weighted 0 -> 0.35, weighted 60 -> ~0.74, weighted 100 -> 1.10.
  it('weighted condition 0 returns the floor exactly (0.35)', () => {
    expect(conditionFactor(carAtUniformCondition(0), ECONOMY)).toBeCloseTo(0.35, 6)
  })

  it('weighted condition 60 returns ~0.74 (within 0.01)', () => {
    expect(conditionFactor(carAtUniformCondition(60), ECONOMY)).toBeCloseTo(0.74, 2)
  })

  it('weighted condition 100 returns the ceiling exactly (1.10)', () => {
    expect(conditionFactor(carAtUniformCondition(100), ECONOMY)).toBeCloseTo(1.1, 6)
  })

  it('is monotonically increasing in weighted condition', () => {
    const low = conditionFactor(carAtUniformCondition(20), ECONOMY)
    const mid = conditionFactor(carAtUniformCondition(50), ECONOMY)
    const high = conditionFactor(carAtUniformCondition(80), ECONOMY)
    expect(low).toBeLessThan(mid)
    expect(mid).toBeLessThan(high)
  })

  it('weights an engine far more than a wheel - same total condition delta, different impact', () => {
    const base = carAtUniformCondition(80)
    const engineDamaged: CarInstance = {
      ...base,
      components: { ...base.components, engine: { condition: 40, installed: null } },
    }
    const wheelsDamaged: CarInstance = {
      ...base,
      components: { ...base.components, wheels: { condition: 40, installed: null } },
    }
    const baseFactor = conditionFactor(base, ECONOMY)
    const engineDrop = baseFactor - conditionFactor(engineDamaged, ECONOMY)
    const wheelsDrop = baseFactor - conditionFactor(wheelsDamaged, ECONOMY)
    expect(engineDrop).toBeGreaterThan(wheelsDrop)
  })
})

describe('installedPartsValueYen', () => {
  const suspensionKit: Part = {
    id: 'tanuki-street-coilovers',
    brand: 'Tanuki',
    name: 'Street Coilovers',
    componentId: 'suspension',
    grade: 'street',
    requiredTags: [],
    statModifiers: { power: 0, handling: 8, style: 3, reliability: 0, authenticity: 0 },
    priceYen: 100_000,
  }
  const partsById = { [suspensionKit.id]: suspensionKit }

  function carWithInstalledPart(conditionPercent: number, genuinePeriod: boolean): CarInstance {
    const car = carAtUniformCondition(80)
    return {
      ...car,
      components: {
        ...car.components,
        suspension: {
          condition: 80,
          installed: {
            id: 'pi-0001',
            partId: suspensionKit.id,
            conditionPercent,
            genuinePeriod,
          },
        },
      },
    }
  }

  it('applies partsRetention x (conditionPercent / 100) to a non-genuine part', () => {
    const car = carWithInstalledPart(80, false)
    const expected = Math.round(suspensionKit.priceYen * ECONOMY.valuation.partsRetention * 0.8)
    expect(installedPartsValueYen(car, partsById, ECONOMY)).toBe(expected)
  })

  it('applies genuinePeriodMultiplier on top for a genuine-period part', () => {
    const car = carWithInstalledPart(80, true)
    const expected = Math.round(
      suspensionKit.priceYen *
        ECONOMY.valuation.partsRetention *
        0.8 *
        ECONOMY.valuation.genuinePeriodMultiplier,
    )
    expect(installedPartsValueYen(car, partsById, ECONOMY)).toBe(expected)
  })

  it('is 0 with no installed parts', () => {
    expect(installedPartsValueYen(carAtUniformCondition(80), {}, ECONOMY)).toBe(0)
  })

  it('sums contributions across multiple installed parts', () => {
    const car = carWithInstalledPart(100, false)
    const withTwo: CarInstance = {
      ...car,
      components: {
        ...car.components,
        wheels: {
          condition: 100,
          installed: {
            id: 'pi-0002',
            partId: suspensionKit.id,
            conditionPercent: 100,
            genuinePeriod: false,
          },
        },
      },
    }
    const one = installedPartsValueYen(car, partsById, ECONOMY)
    const two = installedPartsValueYen(withTwo, partsById, ECONOMY)
    expect(two).toBe(one * 2)
  })
})

describe('marketValueYen', () => {
  it('equals round(bookValue x conditionFactor x heat/100) with no installed parts', () => {
    const car = carAtUniformCondition(70)
    const factor = conditionFactor(car, ECONOMY)
    const expected = Math.round(model.bookValueYen * factor * 1.0)
    expect(marketValueYen(model, car, 100, {}, ECONOMY)).toBe(expected)
  })

  it('scales linearly with heat', () => {
    const car = carAtUniformCondition(70)
    const at100 = marketValueYen(model, car, 100, {}, ECONOMY)
    const at120 = marketValueYen(model, car, 120, {}, ECONOMY)
    expect(at120 / at100).toBeCloseTo(1.2, 1)
  })

  it('adds installed-parts value on top, additively (not multiplied into the base)', () => {
    const suspensionKit: Part = {
      id: 'tanuki-street-coilovers',
      brand: 'Tanuki',
      name: 'Street Coilovers',
      componentId: 'suspension',
      grade: 'street',
      requiredTags: [],
      statModifiers: { power: 0, handling: 8, style: 3, reliability: 0, authenticity: 0 },
      priceYen: 100_000,
    }
    const partsById = { [suspensionKit.id]: suspensionKit }
    const car = carAtUniformCondition(70)
    const withPart: CarInstance = {
      ...car,
      components: {
        ...car.components,
        suspension: {
          condition: 70,
          installed: {
            id: 'pi-0001',
            partId: suspensionKit.id,
            conditionPercent: 100,
            genuinePeriod: false,
          },
        },
      },
    }
    const bare = marketValueYen(model, car, 100, {}, ECONOMY)
    const withInstalled = marketValueYen(model, withPart, 100, partsById, ECONOMY)
    const partValue = installedPartsValueYen(withPart, partsById, ECONOMY)
    expect(withInstalled).toBe(bare + partValue)
  })
})
