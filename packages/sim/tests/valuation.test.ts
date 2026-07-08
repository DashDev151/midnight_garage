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
  condition: { engine: 90, drivetrain: 90, suspension: 90, body: 90, interior: 90 },
  hiddenIssues: [],
  authenticityPercent: 95,
  buildSheet: {
    engine: null,
    forcedInduction: null,
    drivetrain: null,
    suspension: null,
    brakes: null,
    bodyAero: null,
    wheelsInterior: null,
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
      condition: { engine: 0, drivetrain: 0, suspension: 0, body: 0, interior: 0 },
      authenticityPercent: 0,
    }
    const value = valuateCarForBuyer({ ...firstTimer, priceSensitivity: 1 }, model, wornOut, {})
    expect(value).toBeGreaterThanOrEqual(0)
  })
})
