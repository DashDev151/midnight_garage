import {
  ECONOMY,
  ReputationTierSchema,
  type GameState,
  type ReputationTier,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  applyReputationDelta,
  currentGameYear,
  deriveReputationTier,
  reputationAtLeast,
} from '../src/calendar'
import { testSpecialty, testToolTiers } from './testFixtures'

describe('currentGameYear', () => {
  it('starts the campaign in 1995 at unknown reputation (GDD 2.2)', () => {
    expect(currentGameYear('unknown')).toBe(1995)
  })

  it('advances 2 years per reputation tier, in tier order', () => {
    const tiers = ReputationTierSchema.options
    const years = tiers.map((tier) => currentGameYear(tier))
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBe(years[i - 1]! + 2)
    }
    expect(currentGameYear('legend')).toBe(1995 + 2 * (tiers.length - 1))
  })
})

describe('reputationAtLeast', () => {
  it('is true when current tier is the same as the minimum', () => {
    expect(reputationAtLeast('known', 'known')).toBe(true)
  })

  it('is true when current tier outranks the minimum, false when it falls short', () => {
    expect(reputationAtLeast('legend', 'respected')).toBe(true)
    expect(reputationAtLeast('local', 'respected')).toBe(false)
  })

  it('agrees with tier order for every pair (no off-by-one at the boundaries)', () => {
    const tiers = ReputationTierSchema.options
    tiers.forEach((current: ReputationTier, i) => {
      tiers.forEach((min: ReputationTier, j) => {
        expect(reputationAtLeast(current, min)).toBe(i >= j)
      })
    })
  })
})

describe('deriveReputationTier (Sprint 15)', () => {
  it('returns unknown below every threshold', () => {
    expect(deriveReputationTier(0, ECONOMY)).toBe('unknown')
    expect(deriveReputationTier(ECONOMY.reputation.tierThresholds.local - 1, ECONOMY)).toBe(
      'unknown',
    )
  })

  it('lands exactly on a tier at its threshold, not one below', () => {
    const tiers = ReputationTierSchema.options
    for (const tier of tiers) {
      expect(deriveReputationTier(ECONOMY.reputation.tierThresholds[tier], ECONOMY)).toBe(tier)
    }
  })

  it('stays on a tier one point below the next threshold', () => {
    expect(deriveReputationTier(ECONOMY.reputation.tierThresholds.known - 1, ECONOMY)).toBe('local')
    expect(deriveReputationTier(ECONOMY.reputation.tierThresholds.legend - 1, ECONOMY)).toBe(
      'respected',
    )
  })

  it('reaches legend at and above the top threshold', () => {
    expect(deriveReputationTier(ECONOMY.reputation.tierThresholds.legend, ECONOMY)).toBe('legend')
    expect(deriveReputationTier(ECONOMY.reputation.tierThresholds.legend + 1_000, ECONOMY)).toBe(
      'legend',
    )
  })
})

describe('applyReputationDelta (Sprint 15)', () => {
  function stateWith(reputationPoints: number): GameState {
    return {
      day: 1,
      seed: 1,
      cashYen: 0,
      reputationTier: deriveReputationTier(reputationPoints, ECONOMY),
      reputationPoints,
      specialty: testSpecialty(),
      ownedCars: [],
      partInventory: [],
      staff: [],
      jobs: [],
      marketHeat: {},
      activeAuctionLots: [],
      carsForSale: [],
      pendingOffers: [],
      serviceJobOffers: [],
      activeServiceJobs: [],
      serviceBayCount: 1,
      parkingBayCount: 3,
      serviceBayCarIds: [],
      parkingCarIds: [],
      graceParkingCarId: null,
      laborSlotsSpentToday: 0,
      toolTiers: testToolTiers(),
      pendingPartOrders: [],
      cartPartIds: [],
      stagedCarWork: {},
      marketLedger: { lotSupply: {}, playerSales: {} },
      carLedgers: {},
      machineListing: null,
      nextMachineListingDay: null,
      serviceJobLedgers: {},
    }
  }

  it('adds a positive delta and re-derives the tier', () => {
    const next = applyReputationDelta(stateWith(10), 10, ECONOMY)
    expect(next.reputationPoints).toBe(20)
    expect(next.reputationTier).toBe(deriveReputationTier(20, ECONOMY))
  })

  it('clamps a negative delta at zero rather than going negative', () => {
    const next = applyReputationDelta(stateWith(3), -10, ECONOMY)
    expect(next.reputationPoints).toBe(0)
    expect(next.reputationTier).toBe('unknown')
  })

  it('crossing a tier threshold updates reputationTier, not just reputationPoints', () => {
    const justBelow = stateWith(ECONOMY.reputation.tierThresholds.known - 1)
    expect(justBelow.reputationTier).toBe('local')
    const next = applyReputationDelta(justBelow, 1, ECONOMY)
    expect(next.reputationPoints).toBe(ECONOMY.reputation.tierThresholds.known)
    expect(next.reputationTier).toBe('known')
  })
})
