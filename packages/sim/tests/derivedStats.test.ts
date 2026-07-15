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
  fitmentClass: 'shitbox',
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
          installed: {
            id: 'pi-0001',
            partId: coilovers.id,
            band: 'mint',
            genuinePeriod: true,
            origin: { kind: 'market', day: 1 },
          },
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
          installed: {
            id: 'pi-0001',
            partId: coilovers.id,
            band: 'mint',
            genuinePeriod: true,
            origin: { kind: 'market', day: 1 },
          },
        },
      },
    }
    const wornInstalled: CarInstance = {
      ...baseInstance,
      parts: {
        ...baseInstance.parts,
        dampers: {
          installed: {
            id: 'pi-0002',
            partId: coilovers.id,
            band: 'worn',
            genuinePeriod: true,
            origin: { kind: 'market', day: 1 },
          },
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
          installed: {
            id: 'pi-0004',
            partId: brokenPart.id,
            band: 'mint',
            genuinePeriod: true,
            origin: { kind: 'market', day: 1 },
          },
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
          installed: {
            id: 'pi-0003',
            partId: modifiedPart.id,
            band: 'mint',
            genuinePeriod: false,
            origin: { kind: 'market', day: 1 },
          },
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
      parts: mintCarParts({ brakePadsDiscs: 'scrap' }),
    })
    expect(stats(scrapBrakes).handling).toBeLessThan(baseline.handling)

    const scrapRims = buildCarInstance({
      modelId: model.id,
      authenticityPercent: 90,
      parts: mintCarParts({ rims: 'scrap' }),
    })
    expect(stats(scrapRims).style).toBeLessThan(baseline.style)

    const scrapSeats = buildCarInstance({
      modelId: model.id,
      authenticityPercent: 90,
      parts: mintCarParts({ seats: 'scrap' }),
    })
    expect(stats(scrapSeats).style).toBeLessThan(baseline.style)
  })

  it('a legitimately-empty forced-induction slot on this NA model drops out of the power weighting instead of dragging it down', () => {
    // `model` (Honda City, tags include 'NA') makes an empty forcedInduction
    // slot legitimate absence, not a defect (Sprint 32 decisions 2-3).
    const naCar = buildCarInstance({
      modelId: model.id,
      authenticityPercent: 90,
      parts: mintCarParts({ forcedInduction: null }),
    })
    expect(stats(naCar).power).toBe(model.spec.stockPowerPs)
  })

  it('a MISSING (non-FI) part contributes a 0 band factor to the stat it feeds, worse than scrap', () => {
    // Isolated via a single-entry taxonomy (real content spreads `style`
    // across 7 parts, so a one-part swing between scrap (0.15) and missing
    // (0) can round away against the other six staying mint) - the point
    // under test is the per-part contribution derivedStats.ts documents,
    // not the whole-car aggregate.
    const rimsOnlyTaxonomy = PARTS_TAXONOMY.filter((entry) => entry.id === 'rims')
    const scrapRims = buildCarInstance({
      modelId: model.id,
      authenticityPercent: 90,
      parts: mintCarParts({ rims: 'scrap' }),
    })
    const missingRims = buildCarInstance({
      modelId: model.id,
      authenticityPercent: 90,
      parts: mintCarParts({ rims: null }),
    })
    const scrapStyle = computeDerivedStats(model, scrapRims, {}, rimsOnlyTaxonomy, ECONOMY).style
    const missingStyle = computeDerivedStats(
      model,
      missingRims,
      {},
      rimsOnlyTaxonomy,
      ECONOMY,
    ).style
    expect(missingStyle).toBeLessThan(scrapStyle)
    expect(missingStyle).toBe(0)
  })
})
