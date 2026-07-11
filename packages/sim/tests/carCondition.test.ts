import {
  ECONOMY,
  PARTS_TAXONOMY,
  type CarPartId,
  type CarPartTaxonomyEntry,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { saleQualityFor, saleReputationDeltaFor } from '../src/carCondition'
import { LEMON_SALE_REPUTATION_PENALTY } from '../src/constants'
import { buildCarInstance, uniformCarParts } from './testFixtures'

const PARTS_TAXONOMY_BY_ID = Object.fromEntries(
  PARTS_TAXONOMY.map((entry) => [entry.id, entry]),
) as Record<CarPartId, CarPartTaxonomyEntry>

describe('saleReputationDeltaFor (Sprint 26 decision 9: bands, not condition percent)', () => {
  it('grants the concours bonus when every part is mint and authenticity clears its bar', () => {
    const car = buildCarInstance({ parts: uniformCarParts('mint'), authenticityPercent: 90 })
    expect(saleReputationDeltaFor(car, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      ECONOMY.reputation.concoursSaleBonus,
    )
  })

  it('grants the clean bonus when every part clears cleanSaleMinBand but authenticity does not', () => {
    const car = buildCarInstance({ parts: uniformCarParts('fine'), authenticityPercent: 50 })
    expect(saleReputationDeltaFor(car, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      ECONOMY.reputation.cleanSaleBonus,
    )
  })

  it('does not grant concours when parts are only fine, even with high authenticity - concours needs mint', () => {
    const car = buildCarInstance({ parts: uniformCarParts('fine'), authenticityPercent: 95 })
    expect(saleReputationDeltaFor(car, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      ECONOMY.reputation.cleanSaleBonus,
    )
  })

  it('is neutral when a single part sits below cleanSaleMinBand, even though the rest are mint', () => {
    const car = mintWithOneOverride('dampers', 'worn')
    expect(saleReputationDeltaFor(car, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(0)
  })

  it('penalizes a lemon by low cost-weighted average band factor - everything poor', () => {
    const car = buildCarInstance({ parts: uniformCarParts('poor') })
    expect(saleReputationDeltaFor(car, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      -LEMON_SALE_REPUTATION_PENALTY,
    )
  })

  it('penalizes a lemon by a single scrap part, even with every other part mint', () => {
    const car = mintWithOneOverride('tyres', 'scrap')
    expect(saleReputationDeltaFor(car, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      -LEMON_SALE_REPUTATION_PENALTY,
    )
  })

  it('lemon (scrap) takes precedence over concours even when authenticity clears its bar', () => {
    const car = mintWithOneOverride('tyres', 'scrap', 95)
    expect(saleReputationDeltaFor(car, PARTS_TAXONOMY_BY_ID, ECONOMY)).toBe(
      -LEMON_SALE_REPUTATION_PENALTY,
    )
  })
})

describe('saleQualityFor', () => {
  it('maps each of the four possible deltas to its named outcome', () => {
    expect(saleQualityFor(-LEMON_SALE_REPUTATION_PENALTY, ECONOMY)).toBe('lemon')
    expect(saleQualityFor(0, ECONOMY)).toBeNull()
    expect(saleQualityFor(ECONOMY.reputation.cleanSaleBonus, ECONOMY)).toBe('clean')
    expect(saleQualityFor(ECONOMY.reputation.concoursSaleBonus, ECONOMY)).toBe('concours')
  })
})

function mintWithOneOverride(
  partId: CarPartId,
  band: 'scrap' | 'poor' | 'worn' | 'fine' | 'mint',
  authenticityPercent = 90,
) {
  const parts = uniformCarParts('mint')
  parts[partId] = { ...parts[partId], band }
  return buildCarInstance({ parts, authenticityPercent })
}
