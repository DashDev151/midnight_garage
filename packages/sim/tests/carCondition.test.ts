import {
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type Part,
  type PartInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { isPartMissing } from '../src/bands'
import { saleQualityFor, saleReputationDeltaFor } from '../src/carCondition'
import { buildCarInstance, mintCarParts, uniformCarParts } from './testFixtures'

const PARTS_TAXONOMY_BY_ID = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry]),
) as Record<CarPartId, CarPartTaxonomyEntry>
const PARTS_BY_ID = Object.fromEntries(PARTS.map((part) => [part.id, part])) as Record<string, Part>

/** The `everyday`-class race SKU for `carPartId` - the fixtures below build
 * from the same class `mintCarParts` fills a slot with, so a swapped part is
 * a real, fitting catalogue entry rather than a synthetic one. */
function aftermarketInstance(carPartId: CarPartId): PartInstance {
  const part = PARTS.find(
    (p) => p.carPartId === carPartId && p.fitmentClass === 'everyday' && p.grade === 'race',
  )
  if (!part) throw new Error(`no everyday-class race SKU for ${carPartId}`)
  return {
    id: `fixture-race-${carPartId}`,
    partId: part.id,
    band: 'mint',
    origin: { kind: 'market', day: 1 },
  }
}

/** Every `saleReputationDeltaFor` call in this file, with the four content
 * arguments it reads authenticity through spelled once. */
function deltaFor(car: Parameters<typeof saleReputationDeltaFor>[0], forModel = model): number {
  return saleReputationDeltaFor(
    car,
    forModel,
    PARTS_BY_ID,
    PARTS_TAXONOMY,
    PARTS_TAXONOMY_BY_ID,
    ECONOMY,
  )
}

/**
 * `saleReputationDeltaFor` takes a `model` parameter to decide whether an
 * empty `forcedInduction` slot is a real defect or legitimate absence.
 * `model` is factory forced (matching every fixture in this file, which
 * always fills the slot anyway); `naModel` is used only by the tests that
 * specifically exercise legitimate absence. Both carry a matching induction
 * tag beside the aspiration `hasForcedInduction` actually reads.
 */
const model: CarModel = {
  id: 'test-model',
  displayName: 'Test Model',
  brand: 'Test',
  parodyName: 'Test Model',
  parodyBrand: 'Test',
  spec: {
    chassisCode: 'TM',
    engineCode: 'TM',
    culture: 'oddball',
    yearFrom: 1990,
    yearTo: 1990,
    curbWeightKg: 1200,
    stockPowerPs: 150,
    aspiration: 'turbo',
    reliabilityBase: 90,
    styleBase: 20,
    styleCeiling: 80,
    aeroCeiling: 1,
    factoryColours: ['blue-rally', 'black', 'grey-mid'],
  },
  tier: 'everyday',
  rarity: 'common',
  origin: 'jdm',
  tags: ['FR', 'Turbo', 'Piston', '90s', 'JDM'],
  bookValueYen: 1_000_000,
}

const naModel: CarModel = {
  ...model,
  id: 'test-model-na',
  spec: { ...model.spec, aspiration: 'NA' },
  tags: ['FR', 'NA', 'Piston', '90s', 'JDM'],
}

describe('saleReputationDeltaFor (Sprint 26 decision 9: bands, not condition percent)', () => {
  it('grants the concours bonus when every part is mint and stock - authenticity is exactly 100 there', () => {
    const car = buildCarInstance({ parts: uniformCarParts('mint') })
    expect(deltaFor(car)).toBe(ECONOMY.reputation.concoursSaleBonus)
  })

  /**
   * Concours is something a player can lose by BUILDING the car. A mint,
   * otherwise-untouched example with one aftermarket block fitted reads
   * authenticity 82 (the block's own 18 of the taxonomy's 100 points, at a
   * condition factor of 1), which misses the 85 bar, so a flawless
   * swapped-engine car earns the clean bonus and no more.
   */
  it('drops a mint car from concours to clean when one aftermarket block is fitted', () => {
    const car = buildCarInstance({
      parts: mintCarParts({ block: aftermarketInstance('block') }),
    })
    expect(deltaFor(car)).toBe(ECONOMY.reputation.cleanSaleBonus)
  })

  it('does not grant concours when parts are only fine - concours needs mint regardless of originality', () => {
    const car = buildCarInstance({ parts: uniformCarParts('fine') })
    expect(deltaFor(car)).toBe(ECONOMY.reputation.cleanSaleBonus)
  })

  it('is neutral when a single part sits below cleanSaleMinBand, even though the rest are mint', () => {
    const car = mintWithOneOverride('dampers', 'worn')
    expect(deltaFor(car)).toBe(0)
  })

  it('penalizes a lemon by low cost-weighted average band factor - everything poor', () => {
    const car = buildCarInstance({ parts: uniformCarParts('poor') })
    expect(deltaFor(car)).toBe(-ECONOMY.reputation.lemonSalePenalty)
  })

  it('penalizes a lemon by a single scrap part, even with every other part mint', () => {
    const car = mintWithOneOverride('tyres', 'scrap')
    expect(deltaFor(car)).toBe(-ECONOMY.reputation.lemonSalePenalty)
  })

  it('lemon (scrap) takes precedence over concours even on an otherwise all-stock car', () => {
    // `tyres` carries authenticity weight 0, so a scrap tyre does not move
    // authenticity at all - this car still reads 100 and would otherwise be
    // concours. Lemon is checked first and wins.
    const car = mintWithOneOverride('tyres', 'scrap')
    expect(deltaFor(car)).toBe(-ECONOMY.reputation.lemonSalePenalty)
  })

  it('penalizes a lemon by a single missing (non-FI) part, even with every other part mint', () => {
    const car = mintWithOneOverride('tyres', null)
    expect(deltaFor(car)).toBe(-ECONOMY.reputation.lemonSalePenalty)
  })

  /**
   * The FI-missing-vs-FI-absent distinction, proven both directly via
   * `isPartMissing` and end-to-end via the sale outcome - a Turbo car
   * with an empty forcedInduction slot is missing a real part
   * (lemon-eligible); the same empty slot on an NA car is legitimate and
   * permanent absence (doesn't even block a clean sale).
   */
  it('an empty forcedInduction slot is MISSING on a Turbo-tagged car but legitimately absent on an NA-tagged one', () => {
    const car = buildCarInstance({ parts: mintCarParts({ forcedInduction: null }) })
    expect(isPartMissing(car, model, 'forcedInduction')).toBe(true)
    expect(isPartMissing(car, naModel, 'forcedInduction')).toBe(false)
  })

  it('an empty forcedInduction slot triggers lemon on a Turbo car but still allows concours on an NA car', () => {
    const turboCarMissingFi = buildCarInstance({
      parts: mintCarParts({ forcedInduction: null }),
    })
    expect(deltaFor(turboCarMissingFi)).toBe(-ECONOMY.reputation.lemonSalePenalty)

    const naCarMissingFi = buildCarInstance({
      parts: mintCarParts({ forcedInduction: null }),
    })
    expect(deltaFor(naCarMissingFi, naModel)).toBe(ECONOMY.reputation.concoursSaleBonus)
  })
})

describe('saleQualityFor', () => {
  it('maps each of the four possible deltas to its named outcome', () => {
    expect(saleQualityFor(-ECONOMY.reputation.lemonSalePenalty, ECONOMY)).toBe('lemon')
    expect(saleQualityFor(0, ECONOMY)).toBeNull()
    expect(saleQualityFor(ECONOMY.reputation.cleanSaleBonus, ECONOMY)).toBe('clean')
    expect(saleQualityFor(ECONOMY.reputation.concoursSaleBonus, ECONOMY)).toBe('concours')
  })
})

function mintWithOneOverride(
  partId: CarPartId,
  band: 'scrap' | 'poor' | 'worn' | 'fine' | 'mint' | null,
) {
  return buildCarInstance({ parts: mintCarParts({ [partId]: band }) })
}
