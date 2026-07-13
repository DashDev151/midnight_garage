import {
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type Part,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { carValuationBillYen } from '../src/bands'
import { installedPartsValueYen, marketValueYen, mileageFactor } from '../src/marketValue'
import { buildCarInstance, mintCarParts, uniformCarParts } from './testFixtures'

const PARTS_TAXONOMY_BY_ID = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry]),
) as Record<CarPartId, CarPartTaxonomyEntry>

/**
 * Sprint 44: repair cost derives from an installed instance's own catalog
 * price, so every real fixture car (built via `mintCarParts`/`uniformCarParts`,
 * which install real stock parts) needs a real `partsById` to price its
 * restoration bill correctly - an empty map would silently skip every
 * repairable part's contribution rather than reflecting the real formula.
 */
const PARTS_BY_ID: Readonly<Record<string, Part>> = Object.fromEntries(
  PARTS.map((part) => [part.id, part]),
)

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

/** An NA-tagged variant of `model` (Sprint 32) - for the tests that
 * specifically exercise a legitimately-empty `forcedInduction` slot rather
 * than a real defect. */
const naModel: CarModel = {
  ...model,
  id: 'test-supra-na',
  tags: ['FR', 'NA', 'Piston', '90s', 'JDM'],
}

/**
 * Sprint 30: every fixture in this file rolls (via `testFixtures.ts`'s
 * `buildCarInstance` default) `mileageKm: 60_000` - the exact neutral point
 * of `economy.json`'s `mileageFactorCurve` (factor 1.0), so every test below
 * still isolates the restoration-bill formula the same way it did
 * pre-Sprint-30, unless it's explicitly testing mileage. Car age no longer
 * factors into value at all (post-Sprint-30 maintainer decision) - `year` is
 * stored/displayed flavor text only, so this fixture's `year` value is
 * arbitrary.
 */
const CAR_YEAR = 1994

function carAtUniformBand(band: 'scrap' | 'poor' | 'worn' | 'fine' | 'mint'): CarInstance {
  return buildCarInstance({
    modelId: model.id,
    year: CAR_YEAR,
    authenticityPercent: 90,
    parts: uniformCarParts(band),
  })
}

/** A plain buildCarInstance car at `CAR_YEAR`/the neutral mileage point, for
 * fixtures that don't need `carAtUniformBand`'s uniform-band shape. */
function neutralCar(overrides: Partial<CarInstance> = {}): CarInstance {
  return buildCarInstance({ modelId: model.id, year: CAR_YEAR, ...overrides })
}

/**
 * Sprint 47 decision 3's two-slope formula, read straight from
 * `economy.json` rather than hardcoded, so a retune doesn't make this test
 * lie about what `marketValueYen` actually does. Sprint 30: also folds in
 * `mileageFactor` via the real exported function (rather than assuming it
 * away), even though every fixture in this file keeps it at 1.0.
 */
function expectedBaseValueYen(
  car: CarInstance,
  forModel: CarModel,
  heatPercent = 100,
  partsById: Readonly<Record<string, Part>> = PARTS_BY_ID,
): number {
  const { valuationPremiumNear, valuationPremiumFar, valuationPremiumThresholdFraction } =
    ECONOMY.valuation
  const cleanValue =
    forModel.bookValueYen * mileageFactor(car.mileageKm, ECONOMY) * (heatPercent / 100)
  const valuationBill = carValuationBillYen(car, forModel, partsById, PARTS_TAXONOMY_BY_ID, ECONOMY)
  const thresholdBill = valuationPremiumThresholdFraction * cleanValue
  const nearBill = Math.min(valuationBill, thresholdBill)
  const farBill = Math.max(0, valuationBill - thresholdBill)
  const deduction = valuationPremiumNear * nearBill + valuationPremiumFar * farBill
  const backstopFloor = ECONOMY.bands.scrapValueFraction * cleanValue
  return Math.round(Math.max(backstopFloor, cleanValue - deduction))
}

describe('marketValueYen (Sprint 27: restoration-bill deduction)', () => {
  it('is pure: identical inputs produce an identical value', () => {
    const car = carAtUniformBand('worn')
    const a = marketValueYen(model, car, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY)
    const b = marketValueYen(model, car, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY)
    expect(a).toBe(b)
  })

  it('an all-stock-mint car (zero restoration bill, stock contributes no installed-parts value) is worth exactly book value at heat 100', () => {
    const stockCar = neutralCar({ parts: mintCarParts() })
    // Sprint 32 decision 4: stock is the baseline, not an upgrade - it must
    // contribute nothing to installed-parts value, or this car would price
    // above book despite carrying no real aftermarket parts.
    expect(installedPartsValueYen(stockCar, {}, ECONOMY)).toBe(0)
    expect(marketValueYen(model, stockCar, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      model.bookValueYen,
    )
  })

  it('a missing (non-FI) part lowers value by exactly valuationPremiumNear x its stock replacement price (well inside the near region for this fixture)', () => {
    const stockCar = neutralCar({ parts: mintCarParts() })
    const missingBrakesCar = neutralCar({ parts: mintCarParts({ brakePadsDiscs: null }) })
    const stockValue = marketValueYen(
      model,
      stockCar,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const missingValue = marketValueYen(
      model,
      missingBrakesCar,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const expectedDiffYen = Math.round(
      ECONOMY.valuation.valuationPremiumNear *
        PARTS_TAXONOMY_BY_ID.brakePadsDiscs.stockReplacementPriceYen,
    )
    expect(stockValue - missingValue).toBe(expectedDiffYen)
    expect(missingValue).toBeLessThan(stockValue)
  })

  it('matches the closed-form clean-value-minus-hassle-weighted-bill formula across every band', () => {
    for (const band of ['scrap', 'poor', 'worn', 'fine', 'mint'] as const) {
      const car = carAtUniformBand(band)
      expect(marketValueYen(model, car, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
        expectedBaseValueYen(car, model),
      )
    }
  })

  it('is monotonically non-increasing in restoration bill: a worse band is never worth more', () => {
    const valueFor = (band: 'scrap' | 'poor' | 'worn' | 'fine' | 'mint') =>
      marketValueYen(model, carAtUniformBand(band), 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY)
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
   * must differ in value by exactly `valuationPremiumNear *
   * (stockReplacementPriceYen(FI) - stockReplacementPriceYen(brakePadsDiscs))`
   * (well inside the near region for this fixture) - FI being the costlier
   * part by content, so the turbo car is worth strictly less.
   */
  it("differs by valuationPremiumNear x the stock-price gap between a scrap-turbo car and a scrap-brakes car (the maintainer's worked case)", () => {
    const scrapTurboCar = neutralCar({
      parts: mintCarParts({ forcedInduction: 'scrap' }),
    })
    const scrapBrakesCar = neutralCar({
      parts: mintCarParts({ brakePadsDiscs: 'scrap' }),
    })

    const fiPriceYen = PARTS_TAXONOMY_BY_ID.forcedInduction.stockReplacementPriceYen
    const brakesPriceYen = PARTS_TAXONOMY_BY_ID.brakePadsDiscs.stockReplacementPriceYen
    expect(fiPriceYen).toBeGreaterThan(brakesPriceYen)

    const turboValue = marketValueYen(
      model,
      scrapTurboCar,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const brakesValue = marketValueYen(
      model,
      scrapBrakesCar,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const expectedDiffYen = Math.round(
      ECONOMY.valuation.valuationPremiumNear * (fiPriceYen - brakesPriceYen),
    )
    expect(brakesValue - turboValue).toBe(expectedDiffYen)
    expect(turboValue).toBeLessThan(brakesValue)
  })

  it('a legitimately-empty forcedInduction slot on an NA model contributes zero to the bill', () => {
    const naCarWithEmptyFi = neutralCar({
      parts: mintCarParts({ forcedInduction: null }),
    })
    const fullyStockCar = neutralCar({ parts: mintCarParts() })
    expect(
      marketValueYen(naModel, naCarWithEmptyFi, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY),
    ).toBe(marketValueYen(naModel, fullyStockCar, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY))
  })

  it('hits the small scrap-value backstop floor only for a near-total-scrap car - not the wide dead zone the old hard floor created', () => {
    const wreck = neutralCar({ modelId: cheapModel.id, parts: uniformCarParts('scrap') })
    const valuationBill = carValuationBillYen(
      wreck,
      cheapModel,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const cleanValue = cheapModel.bookValueYen
    const { valuationPremiumNear, valuationPremiumFar, valuationPremiumThresholdFraction } =
      ECONOMY.valuation
    const thresholdBill = valuationPremiumThresholdFraction * cleanValue
    const rawDeduction =
      valuationPremiumNear * Math.min(valuationBill, thresholdBill) +
      valuationPremiumFar * Math.max(0, valuationBill - thresholdBill)
    // Sanity: this all-scrap fixture must actually drive the raw (unclamped)
    // value below the backstop floor, otherwise the floor never engages and
    // the test proves nothing.
    expect(cleanValue - rawDeduction).toBeLessThan(ECONOMY.bands.scrapValueFraction * cleanValue)
    const expectedFloor = Math.round(ECONOMY.bands.scrapValueFraction * cleanValue)
    expect(marketValueYen(cheapModel, wreck, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      expectedFloor,
    )
  })

  it('heat applies exactly once: an all-mint car scales linearly with heat', () => {
    const mintCar = neutralCar({ parts: mintCarParts() })
    const at100 = marketValueYen(model, mintCar, 100, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY)
    const at120 = marketValueYen(model, mintCar, 120, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY)
    expect(at120).toBe(Math.round(at100 * 1.2))
  })

  it('heat applies exactly once for a part-worn car too, matching the closed-form formula at each heat', () => {
    const car = carAtUniformBand('worn')
    for (const heatPercent of [80, 100, 120]) {
      expect(
        marketValueYen(model, car, heatPercent, PARTS_BY_ID, PARTS_TAXONOMY_BY_ID, ECONOMY),
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
    // Sprint 44: repair cost derives from the installed part's own catalog
    // price, so a swapped-in part contributes to the bill unless it sits at
    // `mint` (0 contribution at any price) - the dampers slot must be mint on
    // BOTH cars, not just the swapped one, to isolate the installed-parts-
    // value addition (the one thing this test is meant to prove) from any
    // restoration-bill change. The rest of each car stays 'fine' so its own
    // (real, price-derived) bill contribution is identical in both `car` and
    // `withPart` - the merged `partsById` below resolves those real stock
    // parts the same way for both calls.
    const partsById = { ...PARTS_BY_ID, [suspensionKit.id]: suspensionKit }
    const fineCar = carAtUniformBand('fine')
    const car: CarInstance = {
      ...fineCar,
      parts: { ...fineCar.parts, dampers: { installed: mintCarParts().dampers.installed } },
    }
    const withPart: CarInstance = {
      ...car,
      parts: {
        ...car.parts,
        dampers: {
          installed: {
            id: 'pi-0001',
            partId: suspensionKit.id,
            band: 'mint',
            genuinePeriod: false,
          },
        },
      },
    }
    const bare = marketValueYen(model, car, 100, partsById, PARTS_TAXONOMY_BY_ID, ECONOMY)
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

describe('mileageFactor (Sprint 30 decision 1)', () => {
  it('is 1.0 at 60k, falls off toward the 180k roll ceiling, and clamps beyond it', () => {
    expect(mileageFactor(60_000, ECONOMY)).toBe(1.0)
    const at120k = mileageFactor(120_000, ECONOMY)
    const at180k = mileageFactor(180_000, ECONOMY)
    expect(at120k).toBeLessThan(1.0)
    expect(at180k).toBeLessThan(at120k)
    expect(mileageFactor(250_000, ECONOMY)).toBe(at180k)
  })

  it('a higher-mileage car is worth strictly less than an otherwise-identical low-mileage one', () => {
    // Car age no longer affects value (post-Sprint-30 maintainer decision) -
    // both fixtures share the same `year`, so mileage is the only variable
    // this test isolates.
    const freshCar = neutralCar({ parts: mintCarParts(), mileageKm: 30_000 })
    const wornMileageCar = neutralCar({ parts: mintCarParts(), mileageKm: 180_000 })
    const freshValue = marketValueYen(
      model,
      freshCar,
      100,
      PARTS_BY_ID,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    const wornValue = marketValueYen(
      model,
      wornMileageCar,
      100,
      PARTS_BY_ID,
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
          installed: { id: 'pi-0001', partId: suspensionKit.id, band, genuinePeriod },
        },
      },
    }
  }

  it('applies partsRetention (no band discount, Sprint 34 double-count fix) to a non-genuine part', () => {
    const car = carWithInstalledPart('fine', false)
    const expected = Math.round(suspensionKit.priceYen * ECONOMY.valuation.partsRetention)
    expect(installedPartsValueYen(car, partsById, ECONOMY)).toBe(expected)
  })

  it('applies genuinePeriodMultiplier on top for a genuine-period part (still no band discount)', () => {
    const car = carWithInstalledPart('fine', true)
    const expected = Math.round(
      suspensionKit.priceYen *
        ECONOMY.valuation.partsRetention *
        ECONOMY.valuation.genuinePeriodMultiplier,
    )
    expect(installedPartsValueYen(car, partsById, ECONOMY)).toBe(expected)
  })

  it('does not band-discount an aftermarket part: a worn part contributes the same installed-parts value as a mint one (Sprint 34 - condition is priced only by the restoration bill now)', () => {
    const expected = Math.round(suspensionKit.priceYen * ECONOMY.valuation.partsRetention)
    expect(installedPartsValueYen(carWithInstalledPart('worn', false), partsById, ECONOMY)).toBe(
      expected,
    )
    expect(installedPartsValueYen(carWithInstalledPart('mint', false), partsById, ECONOMY)).toBe(
      expected,
    )
  })

  it('a scrap aftermarket part contributes zero (Sprint 34: it cannot be restored, and the bill already replaces it at stock price)', () => {
    expect(installedPartsValueYen(carWithInstalledPart('scrap', false), partsById, ECONOMY)).toBe(0)
  })

  it('counts condition exactly once: restoring a worn aftermarket part raises car value only through the shrinking restoration bill, not through installed-parts value (Sprint 34 de-dup)', () => {
    const wornCar = carWithInstalledPart('worn', false)
    const restoredCar = carWithInstalledPart('mint', false)
    // Installed-parts value is band-independent now, so restoring the part
    // changes nothing on that channel...
    expect(installedPartsValueYen(restoredCar, partsById, ECONOMY)).toBe(
      installedPartsValueYen(wornCar, partsById, ECONOMY),
    )
    const wornValue = marketValueYen(model, wornCar, 100, partsById, PARTS_TAXONOMY_BY_ID, ECONOMY)
    const restoredValue = marketValueYen(
      model,
      restoredCar,
      100,
      partsById,
      PARTS_TAXONOMY_BY_ID,
      ECONOMY,
    )
    // ...yet the car is still worth more restored, and the entire gain equals
    // the shrinking restoration bill (the single condition channel).
    expect(restoredValue).toBeGreaterThan(wornValue)
    const billGainYen =
      expectedBaseValueYen(restoredCar, model, 100, partsById) -
      expectedBaseValueYen(wornCar, model, 100, partsById)
    expect(restoredValue - wornValue).toBe(billGainYen)
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
