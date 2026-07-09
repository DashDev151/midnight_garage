import type { Buyer, CarInstance, CarModel } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
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
    const a = valuateCarForBuyer(collector, model, stockInstance, {})
    const b = valuateCarForBuyer(collector, model, stockInstance, {})
    expect(a).toBe(b)
  })

  it('a high-authenticity car is worth more to a Collector than a First-timer', () => {
    const collectorValue = valuateCarForBuyer(collector, model, stockInstance, {})
    const firstTimerValue = valuateCarForBuyer(firstTimer, model, stockInstance, {})
    expect(collectorValue).toBeGreaterThan(firstTimerValue)
  })

  it('higher priceSensitivity depresses value', () => {
    const lowSensitivity: Buyer = { ...collector, priceSensitivity: 0 }
    const highSensitivity: Buyer = { ...collector, priceSensitivity: 1 }
    const low = valuateCarForBuyer(lowSensitivity, model, stockInstance, {})
    const high = valuateCarForBuyer(highSensitivity, model, stockInstance, {})
    expect(high).toBeLessThan(low)
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
    const value = valuateCarForBuyer({ ...firstTimer, priceSensitivity: 1 }, model, wornOut, {})
    expect(value).toBeGreaterThanOrEqual(0)
  })
})
