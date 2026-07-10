import type { GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { driftMarketHeat } from '../src/marketHeat'
import { createRng } from '../src/rng'

function stateOnDay(day: number, marketHeat: Record<string, number>): GameState {
  return {
    day,
    seed: 42,
    cashYen: 0,
    reputationTier: 'unknown',
    reputationPoints: 0,
    serviceJobOffers: [],
    activeServiceJobs: [],
    ownedCars: [],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat,
    activeAuctionLots: [],
    activeListings: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    parkingCarIds: [],
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: [],
    pendingPartOrders: [],
    cartPartIds: [],
  }
}

describe('driftMarketHeat', () => {
  it('does nothing off a 7-day boundary', () => {
    const result = driftMarketHeat(stateOnDay(3, { 'model-a': 100 }), createRng(1))
    expect(result.log).toHaveLength(0)
    expect(result.state.marketHeat).toEqual({ 'model-a': 100 })
  })

  it('is deterministic for the same seed on a 7-day boundary', () => {
    const state = stateOnDay(7, { 'model-a': 100, 'model-b': 100, 'model-c': 100 })
    const a = driftMarketHeat(state, createRng(99))
    const b = driftMarketHeat(state, createRng(99))
    expect(a.state.marketHeat).toEqual(b.state.marketHeat)
    expect(a.log).toEqual(b.log)
  })

  it('never drifts a model below 0', () => {
    const result = driftMarketHeat(stateOnDay(7, { 'model-a': 1 }), createRng(1))
    const value = result.state.marketHeat['model-a'] ?? -1
    expect(value).toBeGreaterThanOrEqual(0)
  })
})
