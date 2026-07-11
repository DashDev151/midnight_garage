import {
  ECONOMY,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type Part,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { conditionFactor, installedPartsValueYen, marketValueYen } from '../src/marketValue'
import { buildCarInstance, uniformCarParts } from './testFixtures'

const PARTS_TAXONOMY_BY_ID = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry]),
) as Record<CarPartId, CarPartTaxonomyEntry>

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
}

function carAtUniformBand(band: 'scrap' | 'poor' | 'worn' | 'fine' | 'mint'): CarInstance {
  return buildCarInstance({
    modelId: model.id,
    year: 1994,
    authenticityPercent: 90,
    parts: uniformCarParts(band),
  })
}

/** `conditionFactor`'s closed form at a given weighted band factor - reads
 * economy config directly rather than hardcoding a number, so a retune of
 * `economy.json` doesn't make this test lie about what the formula does. */
function expectedFactor(weighted: number): number {
  const { conditionFloor, conditionCeiling, conditionExponent } = ECONOMY.valuation
  return (
    conditionFloor + (conditionCeiling - conditionFloor) * Math.pow(weighted, conditionExponent)
  )
}

describe('conditionFactor (Sprint 26 decision 4: cost-weighted band factor)', () => {
  it('every part mint returns the ceiling exactly', () => {
    expect(conditionFactor(carAtUniformBand('mint'), PARTS_TAXONOMY_BY_ID, ECONOMY)).toBeCloseTo(
      ECONOMY.valuation.conditionCeiling,
      6,
    )
  })

  it('every part scrap matches the closed-form floor+range*scrapFactor^exponent', () => {
    const expected = expectedFactor(ECONOMY.bands.bandFactors.scrap)
    expect(conditionFactor(carAtUniformBand('scrap'), PARTS_TAXONOMY_BY_ID, ECONOMY)).toBeCloseTo(
      expected,
      6,
    )
  })

  it('is monotonically increasing from scrap to mint', () => {
    const scrap = conditionFactor(carAtUniformBand('scrap'), PARTS_TAXONOMY_BY_ID, ECONOMY)
    const poor = conditionFactor(carAtUniformBand('poor'), PARTS_TAXONOMY_BY_ID, ECONOMY)
    const worn = conditionFactor(carAtUniformBand('worn'), PARTS_TAXONOMY_BY_ID, ECONOMY)
    const fine = conditionFactor(carAtUniformBand('fine'), PARTS_TAXONOMY_BY_ID, ECONOMY)
    const mint = conditionFactor(carAtUniformBand('mint'), PARTS_TAXONOMY_BY_ID, ECONOMY)
    expect(scrap).toBeLessThan(poor)
    expect(poor).toBeLessThan(worn)
    expect(worn).toBeLessThan(fine)
    expect(fine).toBeLessThan(mint)
  })

  it('a scrap turbo (expensive to mint) drags value further than scrap brakes (cheap) on an otherwise-identical car', () => {
    // The maintainer's own worked case: cost-weighting means the same "one
    // scrap part" defect hurts differently depending on what that part
    // actually costs to bring back to mint.
    const expensivePartScrap = uniformCarParts('mint')
    expensivePartScrap.forcedInduction = { ...expensivePartScrap.forcedInduction, band: 'scrap' }
    const cheapPartScrap = uniformCarParts('mint')
    cheapPartScrap.brakePadsDiscs = { ...cheapPartScrap.brakePadsDiscs, band: 'scrap' }

    const expensiveCar = buildCarInstance({ modelId: model.id, parts: expensivePartScrap })
    const cheapCar = buildCarInstance({ modelId: model.id, parts: cheapPartScrap })

    const expensiveFactor = conditionFactor(expensiveCar, PARTS_TAXONOMY_BY_ID, ECONOMY)
    const cheapFactor = conditionFactor(cheapCar, PARTS_TAXONOMY_BY_ID, ECONOMY)
    expect(expensiveFactor).toBeLessThan(cheapFactor)
  })
})

describe('installedPartsValueYen', () => {
  const suspensionKit: Part = {
    id: 'tanuki-street-coilovers',
    brand: 'Tanuki',
    name: 'Street Coilovers',
    carPartId: 'dampers',
    grade: 'street',
    requiredTags: [],
    statModifiers: { power: 0, handling: 8, style: 3, reliability: 0, authenticity: 0 },
    priceYen: 100_000,
  }
  const partsById = { [suspensionKit.id]: suspensionKit }

  function carWithInstalledPart(
    band: 'scrap' | 'poor' | 'worn' | 'fine' | 'mint',
    genuinePeriod: boolean,
  ): CarInstance {
    const car = carAtUniformBand('mint')
    return {
      ...car,
      parts: {
        ...car.parts,
        dampers: {
          band: 'mint',
          fitted: true,
          installed: { id: 'pi-0001', partId: suspensionKit.id, band, genuinePeriod },
        },
      },
    }
  }

  it('applies partsRetention x bandFactor(installed.band) to a non-genuine part', () => {
    const car = carWithInstalledPart('fine', false)
    const expected = Math.round(
      suspensionKit.priceYen * ECONOMY.valuation.partsRetention * ECONOMY.bands.bandFactors.fine,
    )
    expect(installedPartsValueYen(car, partsById, ECONOMY)).toBe(expected)
  })

  it('applies genuinePeriodMultiplier on top for a genuine-period part', () => {
    const car = carWithInstalledPart('fine', true)
    const expected = Math.round(
      suspensionKit.priceYen *
        ECONOMY.valuation.partsRetention *
        ECONOMY.bands.bandFactors.fine *
        ECONOMY.valuation.genuinePeriodMultiplier,
    )
    expect(installedPartsValueYen(car, partsById, ECONOMY)).toBe(expected)
  })

  it('is 0 with no installed parts', () => {
    expect(installedPartsValueYen(carAtUniformBand('fine'), {}, ECONOMY)).toBe(0)
  })

  it('sums contributions across multiple installed parts', () => {
    const car = carWithInstalledPart('mint', false)
    const withTwo: CarInstance = {
      ...car,
      parts: {
        ...car.parts,
        rims: {
          band: 'mint',
          fitted: true,
          installed: {
            id: 'pi-0002',
            partId: suspensionKit.id,
            band: 'mint',
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
    const car = carAtUniformBand('fine')
    const factor = conditionFactor(car, PARTS_TAXONOMY_BY_ID, ECONOMY)
    const expected = Math.round(model.bookValueYen * factor * 1.0)
    expect(marketValueYen(model, car, 100, {}, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(expected)
  })

  it('scales linearly with heat', () => {
    const car = carAtUniformBand('fine')
    const at100 = marketValueYen(model, car, 100, {}, PARTS_TAXONOMY_BY_ID, ECONOMY)
    const at120 = marketValueYen(model, car, 120, {}, PARTS_TAXONOMY_BY_ID, ECONOMY)
    expect(at120 / at100).toBeCloseTo(1.2, 1)
  })

  it('adds installed-parts value on top, additively (not multiplied into the base)', () => {
    const suspensionKit: Part = {
      id: 'tanuki-street-coilovers',
      brand: 'Tanuki',
      name: 'Street Coilovers',
      carPartId: 'dampers',
      grade: 'street',
      requiredTags: [],
      statModifiers: { power: 0, handling: 8, style: 3, reliability: 0, authenticity: 0 },
      priceYen: 100_000,
    }
    const partsById = { [suspensionKit.id]: suspensionKit }
    const car = carAtUniformBand('fine')
    const withPart: CarInstance = {
      ...car,
      parts: {
        ...car.parts,
        dampers: {
          band: 'fine',
          fitted: true,
          installed: {
            id: 'pi-0001',
            partId: suspensionKit.id,
            band: 'mint',
            genuinePeriod: false,
          },
        },
      },
    }
    const bare = marketValueYen(model, car, 100, {}, PARTS_TAXONOMY_BY_ID, ECONOMY)
    const withInstalled = marketValueYen(
      model,
      withPart,
      100,
      partsById,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const partValue = installedPartsValueYen(withPart, partsById, ECONOMY)
    expect(withInstalled).toBe(bare + partValue)
  })
})
