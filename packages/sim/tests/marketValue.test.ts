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
import { carCostToMintYen } from '../src/bands'
import {
  ageFactor,
  installedPartsValueYen,
  marketValueYen,
  mileageFactor,
} from '../src/marketValue'
import { buildCarInstance, mintCarParts, uniformCarParts } from './testFixtures'

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

/** A cheap-book fixture (shitbox-range) - the only way to actually trip the
 * floor clamp: the Supra's book value is high enough that even an all-scrap
 * restoration bill doesn't out-discount it (see the floor test below). */
const cheapModel: CarModel = { ...model, id: 'test-shitbox', bookValueYen: 300_000 }

/**
 * Sprint 30: every fixture in this file rolls `year: 1994` and (via
 * `testFixtures.ts`'s `buildCarInstance` default) `mileageKm: 60_000` - the
 * exact neutral point of `economy.json`'s `mileageFactorCurve` (factor 1.0).
 * Passing this same year as `currentYear` keeps `ageFactor` at 1.0 too, so
 * every test below still isolates the restoration-bill formula the same way
 * it did pre-Sprint-30, unless it's explicitly testing age/mileage.
 */
const CURRENT_YEAR = 1994

function carAtUniformBand(band: 'scrap' | 'poor' | 'worn' | 'fine' | 'mint'): CarInstance {
  return buildCarInstance({
    modelId: model.id,
    year: CURRENT_YEAR,
    authenticityPercent: 90,
    parts: uniformCarParts(band),
  })
}

/** A plain buildCarInstance car at `CURRENT_YEAR`/the neutral mileage point,
 * for fixtures that don't need `carAtUniformBand`'s uniform-band shape. */
function neutralCar(overrides: Partial<CarInstance> = {}): CarInstance {
  return buildCarInstance({ modelId: model.id, year: CURRENT_YEAR, ...overrides })
}

/**
 * Sprint 27 decision 1's formula, read straight from `economy.json` rather
 * than hardcoded, so a retune of `hassleFactor`/`floorFraction` doesn't make
 * this test lie about what `marketValueYen` actually does. Mirrors the
 * pre-Sprint-27 `expectedFactor` helper's own reasoning. Sprint 30: also
 * folds in `ageFactor`/`mileageFactor` via the real exported functions
 * (rather than assuming them away), even though every fixture in this file
 * keeps both at 1.0.
 */
function expectedBaseValueYen(
  car: CarInstance,
  forModel: CarModel,
  heatPercent = 100,
  currentYear = CURRENT_YEAR,
): number {
  const { hassleFactor, floorFraction } = ECONOMY.valuation
  const cleanValue =
    forModel.bookValueYen *
    ageFactor(car.year, currentYear, ECONOMY) *
    mileageFactor(car.mileageKm, ECONOMY) *
    (heatPercent / 100)
  const restorationBill = carCostToMintYen(car, PARTS_TAXONOMY_BY_ID)
  const floor = floorFraction * cleanValue
  return Math.round(Math.max(floor, cleanValue - hassleFactor * restorationBill))
}

describe('marketValueYen (Sprint 27: restoration-bill deduction)', () => {
  it('is pure: identical inputs produce an identical value', () => {
    const car = carAtUniformBand('worn')
    const a = marketValueYen(model, car, 100, CURRENT_YEAR, {}, PARTS_TAXONOMY_BY_ID, ECONOMY)
    const b = marketValueYen(model, car, 100, CURRENT_YEAR, {}, PARTS_TAXONOMY_BY_ID, ECONOMY)
    expect(a).toBe(b)
  })

  it('an all-mint car (zero restoration bill) is worth exactly clean value at heat 100', () => {
    const mintCar = neutralCar({ parts: mintCarParts() })
    expect(
      marketValueYen(model, mintCar, 100, CURRENT_YEAR, {}, PARTS_TAXONOMY_BY_ID, ECONOMY),
    ).toBe(model.bookValueYen)
  })

  it('matches the closed-form clean-value-minus-hassle-weighted-bill formula across every band', () => {
    for (const band of ['scrap', 'poor', 'worn', 'fine', 'mint'] as const) {
      const car = carAtUniformBand(band)
      expect(marketValueYen(model, car, 100, CURRENT_YEAR, {}, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
        expectedBaseValueYen(car, model),
      )
    }
  })

  it('is monotonically non-increasing in restoration bill: a worse band is never worth more', () => {
    const valueFor = (band: 'scrap' | 'poor' | 'worn' | 'fine' | 'mint') =>
      marketValueYen(
        model,
        carAtUniformBand(band),
        100,
        CURRENT_YEAR,
        {},
        PARTS_TAXONOMY_BY_ID,
        ECONOMY,
      )
    const scrap = valueFor('scrap')
    const poor = valueFor('poor')
    const worn = valueFor('worn')
    const fine = valueFor('fine')
    const mint = valueFor('mint')
    expect(scrap).toBeLessThanOrEqual(poor)
    expect(poor).toBeLessThanOrEqual(worn)
    expect(worn).toBeLessThanOrEqual(fine)
    expect(fine).toBeLessThanOrEqual(mint)
  })

  /**
   * Sprint 27 decision 5, verbatim: two otherwise-identical cars, one with a
   * scrap forcedInduction (fitted) and the other with scrap brakePadsDiscs,
   * must differ in value by exactly `hassleFactor * (stockReplacementPriceYen(FI)
   * - stockReplacementPriceYen(brakePadsDiscs))` - FI being the costlier part
   * by content, so the turbo car is worth strictly less.
   */
  it("differs by hassleFactor x the stock-price gap between a scrap-turbo car and a scrap-brakes car (the maintainer's worked case)", () => {
    const scrapTurboCar = neutralCar({
      parts: mintCarParts({ forcedInduction: { band: 'scrap' } }),
    })
    const scrapBrakesCar = neutralCar({
      parts: mintCarParts({ brakePadsDiscs: { band: 'scrap' } }),
    })

    const fiPriceYen = PARTS_TAXONOMY_BY_ID.forcedInduction.stockReplacementPriceYen
    const brakesPriceYen = PARTS_TAXONOMY_BY_ID.brakePadsDiscs.stockReplacementPriceYen
    expect(fiPriceYen).toBeGreaterThan(brakesPriceYen)

    const turboValue = marketValueYen(
      model,
      scrapTurboCar,
      100,
      CURRENT_YEAR,
      {},
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const brakesValue = marketValueYen(
      model,
      scrapBrakesCar,
      100,
      CURRENT_YEAR,
      {},
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const expectedDiffYen = Math.round(
      ECONOMY.valuation.hassleFactor * (fiPriceYen - brakesPriceYen),
    )
    expect(brakesValue - turboValue).toBe(expectedDiffYen)
    expect(turboValue).toBeLessThan(brakesValue)
  })

  it('an unfitted forcedInduction slot contributes zero to the bill regardless of its rolled band', () => {
    const naCarWithScrapFi = neutralCar({
      parts: mintCarParts({ forcedInduction: { band: 'scrap', fitted: false } }),
    })
    const fullyMintCar = neutralCar({ parts: mintCarParts() })
    expect(
      marketValueYen(model, naCarWithScrapFi, 100, CURRENT_YEAR, {}, PARTS_TAXONOMY_BY_ID, ECONOMY),
    ).toBe(
      marketValueYen(model, fullyMintCar, 100, CURRENT_YEAR, {}, PARTS_TAXONOMY_BY_ID, ECONOMY),
    )
  })

  it('clamps at floorFraction x cleanValue when the restoration bill would drive it below zero', () => {
    const wreck = neutralCar({ modelId: cheapModel.id, parts: uniformCarParts('scrap') })
    const restorationBill = carCostToMintYen(wreck, PARTS_TAXONOMY_BY_ID)
    const cleanValue = cheapModel.bookValueYen
    // Sanity: this fixture must actually exceed clean value once weighted by
    // hassleFactor, otherwise the floor never engages and the test proves
    // nothing.
    expect(ECONOMY.valuation.hassleFactor * restorationBill).toBeGreaterThan(cleanValue)
    const expectedFloor = Math.round(ECONOMY.valuation.floorFraction * cleanValue)
    expect(
      marketValueYen(cheapModel, wreck, 100, CURRENT_YEAR, {}, PARTS_TAXONOMY_BY_ID, ECONOMY),
    ).toBe(expectedFloor)
  })

  it('heat applies exactly once: an all-mint car scales linearly with heat', () => {
    const mintCar = neutralCar({ parts: mintCarParts() })
    const at100 = marketValueYen(
      model,
      mintCar,
      100,
      CURRENT_YEAR,
      {},
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const at120 = marketValueYen(
      model,
      mintCar,
      120,
      CURRENT_YEAR,
      {},
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    expect(at120).toBe(Math.round(at100 * 1.2))
  })

  it('heat applies exactly once for a part-worn car too, matching the closed-form formula at each heat', () => {
    const car = carAtUniformBand('worn')
    for (const heatPercent of [80, 100, 120]) {
      expect(
        marketValueYen(model, car, heatPercent, CURRENT_YEAR, {}, PARTS_TAXONOMY_BY_ID, ECONOMY),
      ).toBe(expectedBaseValueYen(car, model, heatPercent))
    }
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
    const bare = marketValueYen(model, car, 100, CURRENT_YEAR, {}, PARTS_TAXONOMY_BY_ID, ECONOMY)
    const withInstalled = marketValueYen(
      model,
      withPart,
      100,
      CURRENT_YEAR,
      partsById,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const partValue = installedPartsValueYen(withPart, partsById, ECONOMY)
    expect(withInstalled).toBe(bare + partValue)
  })
})

describe('ageFactor / mileageFactor (Sprint 30 decision 1)', () => {
  it('ageFactor is 1.0 at age 0 and non-increasing as the car ages', () => {
    expect(ageFactor(1994, 1994, ECONOMY)).toBe(1.0)
    const at5 = ageFactor(1989, 1994, ECONOMY)
    const at10 = ageFactor(1984, 1994, ECONOMY)
    const at30 = ageFactor(1964, 1994, ECONOMY)
    expect(at5).toBeLessThanOrEqual(1.0)
    expect(at10).toBeLessThanOrEqual(at5)
    expect(at30).toBeLessThanOrEqual(at10)
  })

  it('ageFactor clamps at the curve endpoints - never negative age, never past the oldest breakpoint', () => {
    // A car "from the future" relative to currentYear (shouldn't happen in
    // normal play) clamps to age 0, not a negative age.
    expect(ageFactor(2000, 1994, ECONOMY)).toBe(ageFactor(1994, 1994, ECONOMY))
    // Older than the curve's last breakpoint holds at that breakpoint's factor.
    expect(ageFactor(1900, 1994, ECONOMY)).toBe(ageFactor(1964, 1994, ECONOMY))
  })

  it('mileageFactor is 1.0 at 60k, falls off toward the 180k roll ceiling, and clamps beyond it', () => {
    expect(mileageFactor(60_000, ECONOMY)).toBe(1.0)
    const at120k = mileageFactor(120_000, ECONOMY)
    const at180k = mileageFactor(180_000, ECONOMY)
    expect(at120k).toBeLessThan(1.0)
    expect(at180k).toBeLessThan(at120k)
    expect(mileageFactor(250_000, ECONOMY)).toBe(at180k)
  })

  it('a higher-mileage, older car is worth strictly less than an otherwise-identical low-mileage, newer one', () => {
    const freshCar = neutralCar({ parts: mintCarParts(), year: 1994, mileageKm: 30_000 })
    const wornMileageCar = neutralCar({ parts: mintCarParts(), year: 1980, mileageKm: 180_000 })
    const freshValue = marketValueYen(model, freshCar, 100, 1994, {}, PARTS_TAXONOMY_BY_ID, ECONOMY)
    const wornValue = marketValueYen(
      model,
      wornMileageCar,
      100,
      1994,
      {},
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    expect(wornValue).toBeLessThan(freshValue)
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
