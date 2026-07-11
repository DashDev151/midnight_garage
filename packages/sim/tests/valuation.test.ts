import { ECONOMY, type Buyer, type CarInstance, type CarModel } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { marketValueYen } from '../src/marketValue'
import { valuateCarForBuyer } from '../src/valuation'

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
  hiddenIssueWeights: [],
}

const stockInstance: CarInstance = {
  id: 'car-0001',
  modelId: model.id,
  year: 1994,
  mileageKm: 80_000,
  color: 'White',
  provenanceNote: '',
  hiddenIssues: [],
  authenticityPercent: 95,
  components: {
    engine: { condition: 90, installed: null },
    forcedInduction: { condition: 90, installed: null },
    drivetrain: { condition: 90, installed: null },
    suspension: { condition: 90, installed: null },
    brakes: { condition: 90, installed: null },
    wheels: { condition: 90, installed: null },
    body: { condition: 90, installed: null },
    interior: { condition: 90, installed: null },
  },
}

const collector: Buyer = {
  id: 'collector',
  archetype: 'collector',
  displayName: 'Collector',
  statWeights: { power: 0.1, handling: 0.2, style: 0.3, reliability: 0.3, authenticity: 1.0 },
  tierPreferences: [{ tier: 'rare', weight: 0.8 }],
  priceSensitivity: 0.2,
}

const firstTimer: Buyer = {
  id: 'first-timer',
  archetype: 'first-timer',
  displayName: 'First-timer',
  statWeights: { power: 0.2, handling: 0.2, style: 0.1, reliability: 0.8, authenticity: 0.1 },
  tierPreferences: [{ tier: 'shitbox', weight: 1.0 }],
  priceSensitivity: 0.9,
}

describe('valuateCarForBuyer', () => {
  it('is pure: identical inputs produce an identical value', () => {
    const a = valuateCarForBuyer(collector, model, stockInstance, {}, 100, ECONOMY)
    const b = valuateCarForBuyer(collector, model, stockInstance, {}, 100, ECONOMY)
    expect(a).toBe(b)
  })

  it('a high-authenticity car is worth more to a Collector than a First-timer', () => {
    const collectorValue = valuateCarForBuyer(collector, model, stockInstance, {}, 100, ECONOMY)
    const firstTimerValue = valuateCarForBuyer(firstTimer, model, stockInstance, {}, 100, ECONOMY)
    expect(collectorValue).toBeGreaterThan(firstTimerValue)
  })

  it('never returns a negative value', () => {
    const wornOut: CarInstance = {
      ...stockInstance,
      components: {
        engine: { condition: 0, installed: null },
        forcedInduction: { condition: 0, installed: null },
        drivetrain: { condition: 0, installed: null },
        suspension: { condition: 0, installed: null },
        brakes: { condition: 0, installed: null },
        wheels: { condition: 0, installed: null },
        body: { condition: 0, installed: null },
        interior: { condition: 0, installed: null },
      },
      authenticityPercent: 0,
    }
    const value = valuateCarForBuyer(firstTimer, model, wornOut, {}, 100, ECONOMY)
    expect(value).toBeGreaterThanOrEqual(0)
  })

  /**
   * Sprint 21: value and taste are now two separate, testable pieces —
   * `valuateCarForBuyer` is exactly `marketValueYen x taste`, so a buyer's
   * valuation of a fixed car must always land within `[1 - tasteSpread, 1 +
   * tasteSpread]` of that car's taste-free market value (decision 4).
   */
  describe('taste (marketValue x bounded taste multiplier)', () => {
    const spread = ECONOMY.valuation.tasteSpread

    it('stays within [1 - tasteSpread, 1 + tasteSpread] of marketValueYen for any buyer', () => {
      const value = marketValueYen(model, stockInstance, 100, {}, ECONOMY)
      for (const buyer of [collector, firstTimer]) {
        const valuation = valuateCarForBuyer(buyer, model, stockInstance, {}, 100, ECONOMY)
        expect(valuation).toBeGreaterThanOrEqual(Math.round(value * (1 - spread)))
        expect(valuation).toBeLessThanOrEqual(Math.round(value * (1 + spread)))
      }
    })

    it('is monotonic in stat fit: a buyer weighting every stat outvalues one weighting none', () => {
      const value = marketValueYen(model, stockInstance, 100, {}, ECONOMY)
      const enthusiast: Buyer = {
        ...collector,
        statWeights: { power: 1, handling: 1, style: 1, reliability: 1, authenticity: 1 },
      }
      const indifferent: Buyer = {
        ...collector,
        statWeights: { power: 0, handling: 0, style: 0, reliability: 0, authenticity: 0 },
      }
      const enthusiastValue = valuateCarForBuyer(enthusiast, model, stockInstance, {}, 100, ECONOMY)
      const indifferentValue = valuateCarForBuyer(
        indifferent,
        model,
        stockInstance,
        {},
        100,
        ECONOMY,
      )
      expect(enthusiastValue).toBeGreaterThan(indifferentValue)
      // indifferent (normalizedStatScore undefined -> 0 via the sum-of-weights
      // guard) lands at the taste floor.
      expect(indifferentValue).toBe(Math.round(value * (1 - spread)))
    })
  })
})
