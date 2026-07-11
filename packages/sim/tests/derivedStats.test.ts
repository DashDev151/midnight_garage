import {
  ECONOMY,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarModel,
  type Part,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeDerivedStats } from '../src/derivedStats'
import { buildCarInstance, mintCarParts } from './testFixtures'

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
}

const baseInstance: CarInstance = buildCarInstance({ modelId: model.id, authenticityPercent: 90 })

const coilovers: Part = {
  id: 'tanuki-street-coilovers',
  brand: 'Tanuki',
  name: 'Street Coilovers',
  carPartId: 'dampers',
  grade: 'street',
  requiredTags: [],
  statModifiers: { power: 0, handling: 8, style: 3, reliability: 0, authenticity: 0 },
  priceYen: 70_000,
}

function stats(instance: CarInstance, partsById: Record<string, Part> = {}) {
  return computeDerivedStats(model, instance, partsById, PARTS_TAXONOMY, ECONOMY)
}

describe('computeDerivedStats', () => {
  it('a stock car with every part mint returns the platform baseline', () => {
    const result = stats(baseInstance)
    expect(result.power).toBe(model.spec.stockPowerPs)
    expect(result.authenticity).toBe(90)
  })

  it('a genuine-period installed part fully applies its modifiers', () => {
    const instance: CarInstance = {
      ...baseInstance,
      parts: {
        ...baseInstance.parts,
        dampers: {
          band: 'mint',
          fitted: true,
          installed: { id: 'pi-0001', partId: coilovers.id, band: 'mint', genuinePeriod: true },
        },
      },
    }
    const withPart = stats(instance, { [coilovers.id]: coilovers })
    const stock = stats(baseInstance)
    expect(withPart.handling).toBe(stock.handling + 8)
    expect(withPart.style).toBe(stock.style + 3)
  })

  it('a worn installed part contributes proportionally less benefit than a mint one', () => {
    const mintInstalled: CarInstance = {
      ...baseInstance,
      parts: {
        ...baseInstance.parts,
        dampers: {
          band: 'mint',
          fitted: true,
          installed: { id: 'pi-0001', partId: coilovers.id, band: 'mint', genuinePeriod: true },
        },
      },
    }
    const wornInstalled: CarInstance = {
      ...baseInstance,
      parts: {
        ...baseInstance.parts,
        dampers: {
          band: 'mint',
          fitted: true,
          installed: { id: 'pi-0002', partId: coilovers.id, band: 'worn', genuinePeriod: true },
        },
      },
    }
    const stock = stats(baseInstance)
    const mint = stats(mintInstalled, { [coilovers.id]: coilovers })
    const worn = stats(wornInstalled, { [coilovers.id]: coilovers })
    expect(worn.handling).toBeGreaterThan(stock.handling)
    expect(worn.handling).toBeLessThan(mint.handling)
  })

  it('power never goes negative even with a large negative part modifier', () => {
    const brokenPart: Part = {
      ...coilovers,
      id: 'broken-engine-part',
      carPartId: 'block',
      statModifiers: { power: -500, handling: 0, style: 0, reliability: 0, authenticity: 0 },
    }
    const instance: CarInstance = {
      ...baseInstance,
      parts: {
        ...baseInstance.parts,
        block: {
          band: 'mint',
          fitted: true,
          installed: { id: 'pi-0004', partId: brokenPart.id, band: 'mint', genuinePeriod: true },
        },
      },
    }
    const result = stats(instance, { [brokenPart.id]: brokenPart })
    expect(result.power).toBe(0)
  })

  it('a non-genuine part with a negative authenticity modifier still penalizes authenticity', () => {
    const modifiedPart: Part = {
      ...coilovers,
      id: 'race-coilovers',
      statModifiers: { power: 0, handling: 20, style: 0, reliability: 0, authenticity: -15 },
    }
    const instance: CarInstance = {
      ...baseInstance,
      parts: {
        ...baseInstance.parts,
        dampers: {
          band: 'mint',
          fitted: true,
          installed: { id: 'pi-0003', partId: modifiedPart.id, band: 'mint', genuinePeriod: false },
        },
      },
    }
    const result = stats(instance, { [modifiedPart.id]: modifiedPart })
    expect(result.authenticity).toBe(75)
  })

  /**
   * Sprint 26 decision 8: every real part now feeds at least one stat -
   * replaces the old Sprint 12 "brakes/wheels/forcedInduction/interior are
   * inert" guard, which described a real gap that this sprint deliberately
   * closes. Each of these previously-dead groups now measurably moves a
   * stat when its own band changes.
   */
  it('every previously-inert group now measurably affects a stat via its own band', () => {
    const baseline = stats(baseInstance)

    const scrapBrakes = buildCarInstance({
      modelId: model.id,
      authenticityPercent: 90,
      parts: mintCarParts({ brakePadsDiscs: { band: 'scrap' } }),
    })
    expect(stats(scrapBrakes).handling).toBeLessThan(baseline.handling)

    const scrapRims = buildCarInstance({
      modelId: model.id,
      authenticityPercent: 90,
      parts: mintCarParts({ rims: { band: 'scrap' } }),
    })
    expect(stats(scrapRims).style).toBeLessThan(baseline.style)

    const scrapSeats = buildCarInstance({
      modelId: model.id,
      authenticityPercent: 90,
      parts: mintCarParts({ seats: { band: 'scrap' } }),
    })
    expect(stats(scrapSeats).style).toBeLessThan(baseline.style)
  })

  it('an unfitted forced-induction slot drops out of the power weighting instead of dragging it down', () => {
    const naCar = buildCarInstance({
      modelId: model.id,
      authenticityPercent: 90,
      parts: mintCarParts({ forcedInduction: { fitted: false, band: 'scrap' } }),
    })
    // A scrap-but-unfitted FI slot must not count against power at all -
    // this car should score identically to a fully-mint, FI-absent baseline.
    expect(stats(naCar).power).toBe(model.spec.stockPowerPs)
  })
})
