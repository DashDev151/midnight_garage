import { BUYERS, CARS, HIDDEN_ISSUES, PARTS, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { resolveBuyPart } from '../src/parts'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES)
const CHEAPEST = [...PARTS].sort((a, b) => a.priceYen - b.priceYen)[0]!

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 10_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
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
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: [],
    ...overrides,
  }
}

describe('resolveBuyPart (Sprint 11 instant resolver)', () => {
  it('deducts the price and adds an immediately-installable part instance', () => {
    const state = baseState()
    const result = resolveBuyPart(state, CHEAPEST.id, CONTEXT)
    expect(result.state.cashYen).toBe(state.cashYen - CHEAPEST.priceYen)
    expect(result.state.partInventory).toHaveLength(1)
    expect(result.state.partInventory[0]).toMatchObject({
      partId: CHEAPEST.id,
      conditionPercent: 100,
    })
    expect(result.log).toEqual([
      {
        type: 'part-bought',
        partId: CHEAPEST.id,
        partInstanceId: result.state.partInventory[0]!.id,
        priceYen: CHEAPEST.priceYen,
      },
    ])
  })

  it('is a no-op when unaffordable', () => {
    const state = baseState({ cashYen: 0 })
    const result = resolveBuyPart(state, CHEAPEST.id, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('is a no-op for an unknown part id', () => {
    const state = baseState()
    const result = resolveBuyPart(state, 'no-such-part', CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('two purchases in a row produce two distinct instance ids', () => {
    const state = baseState()
    const first = resolveBuyPart(state, CHEAPEST.id, CONTEXT)
    const second = resolveBuyPart(first.state, CHEAPEST.id, CONTEXT)
    expect(second.state.partInventory).toHaveLength(2)
    const ids = second.state.partInventory.map((p) => p.id)
    expect(new Set(ids).size).toBe(2)
  })
})
