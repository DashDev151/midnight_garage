import {
  ECONOMY,
  PARTS_TAXONOMY,
  type Buyer,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { marketValueYen } from '../src/marketValue'
import { valuateCarForBuyer } from '../src/valuation'
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

const stockInstance: CarInstance = buildCarInstance({
  modelId: model.id,
  year: 1994,
  authenticityPercent: 95,
  parts: uniformCarParts('fine'),
})

const collector: Buyer = {
  id: 'collector',
  archetype: 'collector',
  displayName: 'Collector',
  statWeights: { power: 0.1, handling: 0.2, style: 0.3, reliability: 0.3, authenticity: 1.0 },
  tierPreferences: [{ tier: 'rare', weight: 0.8 }],
  priceSensitivity: 0.2,
  wantLine:
    'Asks who owned it before you, and who before that. Originality is the price of entry; everything else is small talk.',
}

const firstTimer: Buyer = {
  id: 'first-timer',
  archetype: 'first-timer',
  displayName: 'First-timer',
  statWeights: { power: 0.2, handling: 0.2, style: 0.1, reliability: 0.8, authenticity: 0.1 },
  tierPreferences: [{ tier: 'shitbox', weight: 1.0 }],
  priceSensitivity: 0.9,
  wantLine:
    'Needs it to start every cold morning without eating the budget. A service history beats a spoiler.',
}

function valuate(buyer: Buyer, instance: CarInstance, heatPercent = 100) {
  return valuateCarForBuyer(
    buyer,
    model,
    instance,
    {},
    PARTS_TAXONOMY,
    PARTS_TAXONOMY_BY_ID,
    heatPercent,
    ECONOMY,
  )
}

describe('valuateCarForBuyer', () => {
  it('is pure: identical inputs produce an identical value', () => {
    const a = valuate(collector, stockInstance)
    const b = valuate(collector, stockInstance)
    expect(a).toBe(b)
  })

  it('a high-authenticity car is worth more to a Collector than a First-timer', () => {
    const collectorValue = valuate(collector, stockInstance)
    const firstTimerValue = valuate(firstTimer, stockInstance)
    expect(collectorValue).toBeGreaterThan(firstTimerValue)
  })

  it('never returns a negative value', () => {
    const wornOut = buildCarInstance({
      modelId: model.id,
      parts: uniformCarParts('scrap'),
      authenticityPercent: 0,
    })
    const value = valuate(firstTimer, wornOut)
    expect(value).toBeGreaterThanOrEqual(0)
  })

  /**
   * Value and taste are two separate, testable pieces - `valuateCarForBuyer`
   * is exactly `marketValueYen x taste`, so a buyer's valuation of a fixed
   * car must always land within `[1 - tasteSpread, 1 + tasteSpread]` of
   * that car's taste-free market value.
   */
  describe('taste (marketValue x bounded taste multiplier)', () => {
    const spread = ECONOMY.valuation.tasteSpread

    it('stays within [1 - tasteSpread, 1 + tasteSpread] of marketValueYen for any buyer', () => {
      const value = marketValueYen(model, stockInstance, 100, {}, PARTS_TAXONOMY_BY_ID, ECONOMY)
      for (const buyer of [collector, firstTimer]) {
        const valuation = valuate(buyer, stockInstance)
        expect(valuation).toBeGreaterThanOrEqual(Math.round(value * (1 - spread)))
        expect(valuation).toBeLessThanOrEqual(Math.round(value * (1 + spread)))
      }
    })

    it('is monotonic in stat fit: a buyer weighting every stat outvalues one weighting none', () => {
      const value = marketValueYen(model, stockInstance, 100, {}, PARTS_TAXONOMY_BY_ID, ECONOMY)
      const enthusiast: Buyer = {
        ...collector,
        statWeights: { power: 1, handling: 1, style: 1, reliability: 1, authenticity: 1 },
      }
      const indifferent: Buyer = {
        ...collector,
        statWeights: { power: 0, handling: 0, style: 0, reliability: 0, authenticity: 0 },
      }
      const enthusiastValue = valuate(enthusiast, stockInstance)
      const indifferentValue = valuate(indifferent, stockInstance)
      expect(enthusiastValue).toBeGreaterThan(indifferentValue)
      // indifferent (normalizedStatScore undefined -> 0 via the sum-of-weights
      // guard) lands at the taste floor.
      expect(indifferentValue).toBe(Math.round(value * (1 - spread)))
    })
  })
})
