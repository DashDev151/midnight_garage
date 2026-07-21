import {
  ECONOMY,
  PARTS_TAXONOMY,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { isPartMissing } from '../src/bands'
import { saleQualityFor, saleReputationDeltaFor } from '../src/carCondition'
import { buildCarInstance, mintCarParts, uniformCarParts } from './testFixtures'

const PARTS_TAXONOMY_BY_ID = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry]),
) as Record<CarPartId, CarPartTaxonomyEntry>

/**
 * Sprint 32: `saleReputationDeltaFor` gained a `model` parameter to decide
 * whether an empty `forcedInduction` slot is a real defect or legitimate
 * absence. `model` is Turbo-tagged (matching every fixture in this file,
 * which always fills the slot anyway); `naModel` is used only by the tests
 * that specifically exercise legitimate absence.
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
    yearFrom: 1990,
    curbWeightKg: 1200,
    stockPowerPs: 150,
  },
  tier: 'common',
  tags: ['FR', 'Turbo', 'Piston', '90s', 'JDM'],
  bookValueYen: 1_000_000,
}

const naModel: CarModel = {
  ...model,
  id: 'test-model-na',
  tags: ['FR', 'NA', 'Piston', '90s', 'JDM'],
}

describe('saleReputationDeltaFor (Sprint 26 decision 9: bands, not condition percent)', () => {
  it('grants the concours bonus when every part is mint and authenticity clears its bar', () => {
    const car = buildCarInstance({ parts: uniformCarParts('mint'), authenticityPercent: 90 })
    expect(saleReputationDeltaFor(car, model, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      ECONOMY.reputation.concoursSaleBonus,
    )
  })

  it('grants the clean bonus when every part clears cleanSaleMinBand but authenticity does not', () => {
    const car = buildCarInstance({ parts: uniformCarParts('fine'), authenticityPercent: 50 })
    expect(saleReputationDeltaFor(car, model, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      ECONOMY.reputation.cleanSaleBonus,
    )
  })

  it('does not grant concours when parts are only fine, even with high authenticity - concours needs mint', () => {
    const car = buildCarInstance({ parts: uniformCarParts('fine'), authenticityPercent: 95 })
    expect(saleReputationDeltaFor(car, model, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      ECONOMY.reputation.cleanSaleBonus,
    )
  })

  it('is neutral when a single part sits below cleanSaleMinBand, even though the rest are mint', () => {
    const car = mintWithOneOverride('dampers', 'worn')
    expect(saleReputationDeltaFor(car, model, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(0)
  })

  it('penalizes a lemon by low cost-weighted average band factor - everything poor', () => {
    const car = buildCarInstance({ parts: uniformCarParts('poor') })
    expect(saleReputationDeltaFor(car, model, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      -ECONOMY.reputation.lemonSalePenalty,
    )
  })

  it('penalizes a lemon by a single scrap part, even with every other part mint', () => {
    const car = mintWithOneOverride('tyres', 'scrap')
    expect(saleReputationDeltaFor(car, model, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      -ECONOMY.reputation.lemonSalePenalty,
    )
  })

  it('lemon (scrap) takes precedence over concours even when authenticity clears its bar', () => {
    const car = mintWithOneOverride('tyres', 'scrap', 95)
    expect(saleReputationDeltaFor(car, model, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      -ECONOMY.reputation.lemonSalePenalty,
    )
  })

  /**
   * Sprint 32 decision 3: a MISSING part fails clean/concours and triggers
   * lemon exactly like a scrap part does - a stripped car can't pass as
   * well-kept just because a slot is empty instead of merely worn.
   */
  it('penalizes a lemon by a single missing (non-FI) part, even with every other part mint', () => {
    const car = mintWithOneOverride('tyres', null)
    expect(saleReputationDeltaFor(car, model, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      -ECONOMY.reputation.lemonSalePenalty,
    )
  })

  /**
   * Sprint 32 decisions 2-3: the FI-missing-vs-FI-absent distinction, proven
   * both directly via `isPartMissing` and end-to-end via the sale outcome -
   * a Turbo car with an empty forcedInduction slot is missing a real part
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
      authenticityPercent: 90,
    })
    expect(saleReputationDeltaFor(turboCarMissingFi, model, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      -ECONOMY.reputation.lemonSalePenalty,
    )

    const naCarMissingFi = buildCarInstance({
      parts: mintCarParts({ forcedInduction: null }),
      authenticityPercent: 90,
    })
    expect(saleReputationDeltaFor(naCarMissingFi, naModel, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      ECONOMY.reputation.concoursSaleBonus,
    )
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
  authenticityPercent = 90,
) {
  const parts = mintCarParts({ [partId]: band })
  return buildCarInstance({ parts, authenticityPercent })
}
