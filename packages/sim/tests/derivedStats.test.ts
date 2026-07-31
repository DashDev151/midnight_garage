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
    // The roster's own authored pair for this car: 43 points of headroom
    // between how it looks stock and the best it could ever look.
    styleBase: 23,
    styleCeiling: 66,
  },
  tier: 'entry',
  rarity: 'common',
  origin: 'jdm',
  tags: ['FF', 'NA', 'Piston', '80s', 'JDM'],
  bookValueYen: 180_000,
}

const baseInstance: CarInstance = buildCarInstance({ modelId: model.id })

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
  })

  it('an installed part fully applies its modifiers at mint', () => {
    const instance: CarInstance = {
      ...baseInstance,
      parts: {
        ...baseInstance.parts,
        dampers: {
          installed: {
            id: 'pi-0001',
            partId: coilovers.id,
            band: 'mint',
            origin: { kind: 'market', day: 1 },
          },
        },
      },
    }
    const withPart = stats(instance, { [coilovers.id]: coilovers })
    const stock = stats(baseInstance)
    expect(withPart.handling).toBe(stock.handling + 8)
    // Style is the one modifier that is not an addition: the part's 3 points
    // are spent CLOSING the gap between this car's own base and its own
    // ceiling, so 3 of the 60 saturation points buys 5 per cent of the 43
    // points of headroom rather than 3 points outright. `style.test.ts` owns
    // the shape; what belongs here is that a fitted part still reaches it.
    const { styleBase, styleCeiling } = model.spec
    const reach = 3 / ECONOMY.statFormulas.styleSaturationPoints
    expect(withPart.style).toBe(Math.round(styleBase + (styleCeiling - styleBase) * reach))
    expect(withPart.style).toBeGreaterThan(stock.style)
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
            origin: { kind: 'market', day: 1 },
          },
        },
      },
    }
    const result = stats(instance, { [brokenPart.id]: brokenPart })
    expect(result.power).toBe(0)
  })

  /**
   * A part's own `grade` is the whole originality signal; no SKU carries an
   * authenticity number. Authenticity's own behaviour lives in
   * `authenticity.test.ts`; what belongs here is that this function never
   * lets an installed SKU adjust it.
   */
  it('lets no installed SKU adjust authenticity - it is derived from the slots, never accumulated', () => {
    const loudPart: Part = {
      ...coilovers,
      id: 'race-coilovers',
      statModifiers: {
        powerFraction: { 'high-strung-na': 0, 'lazy-na': 0, forced: 0 },
        handling: 20,
        style: 0,
      },
    }
    const instance: CarInstance = {
      ...baseInstance,
      parts: {
        ...baseInstance.parts,
        dampers: {
          installed: {
            id: 'pi-0003',
            partId: loudPart.id,
            band: 'mint',
            origin: { kind: 'market', day: 1 },
          },
        },
      },
    }
    // The same slot, same band, resolved against a catalogue that knows the
    // SKU and one that does not: handling moves (the SKU carries a modifier),
    // authenticity does not (nothing about that SKU is an authenticity
    // number - only whether it resolves to `grade: 'stock'`, which it never
    // does either way here).
    const known = stats(instance, { [loudPart.id]: loudPart })
    const unknown = stats(instance, {})
    expect(known.handling).toBeGreaterThan(unknown.handling)
    expect(known.authenticity).toBe(unknown.authenticity)
  })

  it('every previously-inert group now measurably affects a stat via its own band', () => {
    const baseline = stats(baseInstance)

    const scrapBrakes = buildCarInstance({
      modelId: model.id,
      parts: mintCarParts({ brakePadsDiscs: 'scrap' }),
    })
    expect(stats(scrapBrakes).handling).toBeLessThan(baseline.handling)

    const scrapRims = buildCarInstance({
      modelId: model.id,
      parts: mintCarParts({ rims: 'scrap' }),
    })
    expect(stats(scrapRims).style).toBeLessThan(baseline.style)

    const scrapSeats = buildCarInstance({
      modelId: model.id,
      parts: mintCarParts({ seats: 'scrap' }),
    })
    expect(stats(scrapSeats).style).toBeLessThan(baseline.style)
  })

  it('a legitimately-empty forced-induction slot on this NA model drops out of the power weighting instead of dragging it down', () => {
    // `model` (Honda City, tags include 'NA') makes an empty forcedInduction
    // slot legitimate absence, not a defect.
    const naCar = buildCarInstance({
      modelId: model.id,
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
      parts: mintCarParts({ rims: 'scrap' }),
    })
    const missingRims = buildCarInstance({
      modelId: model.id,
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
