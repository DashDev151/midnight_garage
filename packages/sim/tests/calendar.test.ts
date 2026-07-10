import { ReputationTierSchema, type GameState, type ReputationTier } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  applyReputationDelta,
  currentGameYear,
  deriveReputationTier,
  reputationAtLeast,
} from '../src/calendar'
import { REPUTATION_TIER_THRESHOLDS } from '../src/constants'

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
    expect(deriveReputationTier(0)).toBe('unknown')
    expect(deriveReputationTier(REPUTATION_TIER_THRESHOLDS.local - 1)).toBe('unknown')
  })

  it('lands exactly on a tier at its threshold, not one below', () => {
    const tiers = ReputationTierSchema.options
    for (const tier of tiers) {
      expect(deriveReputationTier(REPUTATION_TIER_THRESHOLDS[tier])).toBe(tier)
    }
  })

  it('stays on a tier one point below the next threshold', () => {
    expect(deriveReputationTier(REPUTATION_TIER_THRESHOLDS.known - 1)).toBe('local')
    expect(deriveReputationTier(REPUTATION_TIER_THRESHOLDS.legend - 1)).toBe('respected')
  })

  it('reaches legend at and above the top threshold', () => {
    expect(deriveReputationTier(REPUTATION_TIER_THRESHOLDS.legend)).toBe('legend')
    expect(deriveReputationTier(REPUTATION_TIER_THRESHOLDS.legend + 1_000)).toBe('legend')
  })
})

describe('applyReputationDelta (Sprint 15)', () => {
  function stateWith(reputationPoints: number): GameState {
    return {
      day: 1,
      seed: 1,
      cashYen: 0,
      reputationTier: deriveReputationTier(reputationPoints),
      reputationPoints,
      ownedCars: [],
      partInventory: [],
      staff: [],
      jobs: [],
      marketHeat: {},
      activeAuctionLots: [],
      activeListings: [],
      serviceJobOffers: [],
      activeServiceJobs: [],
      serviceBayCount: 1,
      parkingBayCount: 3,
      serviceBayCarIds: [],
      parkingCarIds: [],
      laborSlotsSpentToday: 0,
      ownedEquipmentIds: [],
      pendingPartOrders: [],
      cartPartIds: [],
      stagedCarWork: {},
    }
  }

  it('adds a positive delta and re-derives the tier', () => {
    const next = applyReputationDelta(stateWith(10), 10)
    expect(next.reputationPoints).toBe(20)
    expect(next.reputationTier).toBe(deriveReputationTier(20))
  })

  it('clamps a negative delta at zero rather than going negative', () => {
    const next = applyReputationDelta(stateWith(3), -10)
    expect(next.reputationPoints).toBe(0)
    expect(next.reputationTier).toBe('unknown')
  })

  it('crossing a tier threshold updates reputationTier, not just reputationPoints', () => {
    const justBelow = stateWith(REPUTATION_TIER_THRESHOLDS.known - 1)
    expect(justBelow.reputationTier).toBe('local')
    const next = applyReputationDelta(justBelow, 1)
    expect(next.reputationPoints).toBe(REPUTATION_TIER_THRESHOLDS.known)
    expect(next.reputationTier).toBe('known')
  })
})
