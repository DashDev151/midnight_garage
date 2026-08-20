import {
  ECONOMY,
  ReputationTierSchema,
  SERVICE_JOB_TYPES,
  STORY_MISSIONS,
  type GameState,
  type Grade,
  type ReputationTier,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { applyReputationDelta, deriveReputationTier, reputationAtLeast } from '../src/reputation'
import { saleReputationBonusFor } from '../src/selling'
import { reputationForCompletion } from '../src/serviceJobs'
import { testSceneStanding, testToolTiers } from './testFixtures'

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
      sceneStanding: testSceneStanding(),
      ownedCars: [],
      partInventory: [],
      staff: [],
      staffAds: [],
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
      forecourtBayCount: 2,
      forecourtCarIds: [null, null],
      graceParkingCarId: null,
      energySpentToday: 0,
      benchParts: {},
      lift: { owned: false, hirePaidDay: null },
      toolTiers: testToolTiers(),
      pendingPartOrders: [],
      cartPartIds: [],
      marketLedger: { lotSupply: {}, playerSales: {} },
      carLedgers: {},
      toolShopsOwned: [],
      machineListing: null,
      nextMachineListingDay: null,
      serviceJobLedgers: {},
      inspectionVisit: null,
      workbenchPartId: null,
      machinePartId: null,
      storyMissions: [],
    }
  }

  it('adds a positive delta and re-derives the tier', () => {
    const next = applyReputationDelta(stateWith(10), 10, ECONOMY)
    expect(next.reputationPoints).toBe(20)
    expect(next.reputationTier).toBe(deriveReputationTier(20, ECONOMY))
  })

  it('crossing a tier threshold updates reputationTier, not just reputationPoints', () => {
    const justBelow = stateWith(ECONOMY.reputation.tierThresholds.known - 1)
    expect(justBelow.reputationTier).toBe('local')
    const next = applyReputationDelta(justBelow, 1, ECONOMY)
    expect(next.reputationPoints).toBe(ECONOMY.reputation.tierThresholds.known)
    expect(next.reputationTier).toBe('known')
  })

  it('the zero floor survives as a guard, though nothing in the game reaches it any more', () => {
    // Kept defensive rather than trusted: every live caller now passes a
    // nonnegative delta (the three blocks below), so this branch is
    // unreachable through play.
    const next = applyReputationDelta(stateWith(3), -10, ECONOMY)
    expect(next.reputationPoints).toBe(0)
    expect(next.reputationTier).toBe('unknown')
  })
})

/**
 * Reputation only ever rises (progression bible, fifth amendment). There are
 * exactly three things in the game that write it, and this asserts each one
 * can only ever add, over the real shipped content rather than a fixture.
 * The behavioural halves live where the resolvers do: a sale to a buyer who
 * did not get what they came for (`selling.test.ts`) and a job handed back
 * unfinished (`serviceJobs.test.ts`) both leave the point total untouched.
 */
describe('nothing in the game lowers reputation', () => {
  const GRADES: readonly Grade[] = ['stock', 'street', 'sport', 'race']

  it('a sale pays a nonnegative bonus for every possible outcome, including no outcome at all', () => {
    for (const outcome of ['satisfied', 'delighted', 'nothing'] as const) {
      expect(saleReputationBonusFor(outcome, ECONOMY)).toBeGreaterThanOrEqual(0)
    }
    // And the two rungs are ordered, so pleasing a buyer more never pays less.
    expect(saleReputationBonusFor('delighted', ECONOMY)).toBeGreaterThan(
      saleReputationBonusFor('satisfied', ECONOMY),
    )
    expect(saleReputationBonusFor('nothing', ECONOMY)).toBe(0)
  })

  it('every service-job template on the board can only add, at every part grade', () => {
    for (const template of SERVICE_JOB_TYPES) {
      expect(template.baseReputation).toBeGreaterThan(0)
      for (const grade of GRADES) {
        expect(reputationForCompletion(template.baseReputation, grade)).toBeGreaterThan(0)
      }
    }
  })

  it('every shipped story mission pays a nonnegative reward', () => {
    for (const mission of STORY_MISSIONS) {
      expect(mission.reputationReward).toBeGreaterThanOrEqual(0)
    }
  })
})
