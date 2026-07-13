import { CARS, PARTS, PARTS_TAXONOMY, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { investorStrategy } from '../../src/bots/investor'
import { buildSimContext } from '../../src/context'
import { createRng } from '../../src/rng'
import { buildCarInstance, testSpecialty, testToolTiers } from '../testFixtures'

// Real CARS/PARTS/PARTS_TAXONOMY: the fix under test (partFitsCar against a
// specific empty CarPartId) needs the real catalog's actual price ordering -
// see the fixture car below.
const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)

/**
 * `interior` has two real slots: `dashGauges` (cheapest catalog option
 * Y30,000) and `seats` (cheapest catalog option Y95,000). The fixture below
 * leaves `dashGauges` occupied (mint stock, the Sprint 32 default) and
 * `seats` genuinely empty - the exact "multi-part group, only one open slot"
 * shape TODO.md flagged: a group-level-only part filter would happily pick
 * the cheaper `dashGauges` part even though it's the wrong slot.
 */
const car = buildCarInstance({
  id: 'car-investor-01',
  modelId: CARS[0]!.id,
  parts: { ...buildCarInstance().parts, seats: { installed: null } },
})

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 42,
    cashYen: 1_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    specialty: testSpecialty(),
    serviceJobOffers: [],
    activeServiceJobs: [],
    ownedCars: [car],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [null],
    parkingCarIds: [],
    graceParkingCarId: null,
    laborSlotsSpentToday: 0,
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    ...overrides,
  }
}

describe('investorStrategy replace-loop fixes (2026-07-12)', () => {
  it("buys the part addressed to the actually-empty slot, not the group's cheapest part, and never creates a same-tick install job", () => {
    const state = baseState()
    const actions = investorStrategy(state, CONTEXT, createRng(1))

    expect(actions.buyParts).toHaveLength(1)
    const boughtPart = PARTS.find((p) => p.id === actions.buyParts[0]!.partId)!
    // The old group-only filter would have bought the cheaper dashGauges
    // part; the fix resolves the specific empty CarPartId (seats) first.
    expect(boughtPart.carPartId).toBe('seats')

    // The same-tick bug: an install job referencing this same-tick purchase
    // would fail installFitGate every time (the part isn't in
    // state.partInventory yet) - the fix never creates one this tick.
    expect(actions.createJobs).toEqual([])
  })

  it('installs a PRIOR-tick purchase onto the exact empty slot once it is genuinely in inventory', () => {
    const boughtPartId = 'stock-seats'
    const landed = {
      id: 'part-landed-01',
      partId: boughtPartId,
      band: 'mint' as const,
      genuinePeriod: false,
    }
    const state = baseState({ partInventory: [landed] })
    const actions = investorStrategy(state, CONTEXT, createRng(1))

    expect(actions.buyParts).toEqual([])
    expect(actions.createJobs).toHaveLength(1)
    expect(actions.createJobs[0]).toMatchObject({
      carInstanceId: car.id,
      kind: 'install-part',
      componentId: 'interior',
      partInstanceId: landed.id,
      carPartId: 'seats',
    })
  })
})
