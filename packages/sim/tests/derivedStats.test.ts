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
    reliabilityBase: 99,
    // The retired flat styleCap's own value: a mint stock car authored here
    // reads style exactly 20, so this fixture doubles as the smoke test
    // below for styleBase replacing that cap.
    styleBase: 20,
  },
  tier: 'entry',
  rarity: 'common',
  origin: 'jdm',
  tags: ['FF', 'NA', 'Piston', '80s', 'JDM'],
  bookValueYen: 180_000,
}

const baseInstance: CarInstance = buildCarInstance({ modelId: model.id, authenticityPercent: 90 })

const coilovers: Part = {
  id: 'tanuki-street-coilovers',
  brand: 'Tanuki',
  name: 'Street Coilovers',
  carPartId: 'dampers',
  fitmentClass: 'entry',
  grade: 'street',
  requiredTags: [],
  statModifiers: {
    powerFraction: { 'high-strung-na': 0, 'lazy-na': 0, forced: 0 },
    handling: 8,
    style: 3,
    authenticity: 0,
  },
  physicalModifiers: { grip: 1, braking: 1, mass: 1 },
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
    // `model` has no `displacementCc`, so it derives `lazy-na` (Task 1's
    // documented fallback) - the fraction below is authored against that
    // character, deliberately many multiples of stock power to prove the floor.
    const brokenPart: Part = {
      ...coilovers,
      id: 'broken-engine-part',
      carPartId: 'block',
      statModifiers: {
        powerFraction: { 'high-strung-na': 0, 'lazy-na': -10, forced: 0 },
        handling: 0,
        style: 0,
        authenticity: 0,
      },
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
      statModifiers: {
        powerFraction: { 'high-strung-na': 0, 'lazy-na': 0, forced: 0 },
        handling: 20,
        style: 0,
        authenticity: -15,
      },
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
    // slot legitimate absence, not a defect.
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

/**
 * The smoke test for `styleBase` replacing the flat `styleCap` as style's
 * stock contribution: a car authored at 20 (the cap's own former value) must
 * read identically to before, and two cars that previously tied on style
 * (any two stock cars, under the flat cap) must now differ.
 */
describe('styleBase replaces the flat styleCap', () => {
  it('a mint stock car authored at styleBase 20 reads style exactly 20 - unchanged from the retired flat cap', () => {
    expect(stats(baseInstance).style).toBe(20)
  })

  it('a Toyota 2000GT and a Nissan S-Cargo no longer score identically on style', () => {
    // Neither ships in cars.json, so their real authored roster values (15
    // and 12, docs/design/midnight-garage-roster.csv) are read onto this
    // fixture's own mint chassis, isolating the one thing under test.
    const twoThousandGt: CarModel = {
      ...model,
      id: 'toyota-2000gt-mf10',
      spec: { ...model.spec, styleBase: 15 },
    }
    const sCargo: CarModel = {
      ...model,
      id: 'nissan-s-cargo',
      spec: { ...model.spec, styleBase: 12 },
    }
    const gtStyle = computeDerivedStats(
      twoThousandGt,
      baseInstance,
      {},
      PARTS_TAXONOMY,
      ECONOMY,
    ).style
    const cargoStyle = computeDerivedStats(sCargo, baseInstance, {}, PARTS_TAXONOMY, ECONOMY).style
    expect(gtStyle).toBe(15)
    expect(cargoStyle).toBe(12)
    expect(gtStyle).not.toBe(cargoStyle)
  })
})
