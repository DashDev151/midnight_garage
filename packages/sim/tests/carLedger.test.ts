import type { GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { carLedgerFor, deleteCarLedger, setCarLedger, updateCarLedger } from '../src/carLedger'
import { testSpecialty, testToolTiers } from './testFixtures'

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 0,
    reputationTier: 'unknown',
    reputationPoints: 0,
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
    ...overrides,
  }
}

describe('carLedgerFor (Sprint 42)', () => {
  it('returns the unknown-purchase default when no entry exists', () => {
    expect(carLedgerFor(baseState(), 'car-1')).toEqual({
      purchaseYen: null,
      repairYen: 0,
      partsYen: 0,
    })
  })

  it('returns the real entry when one exists', () => {
    const state = baseState({
      carLedgers: { 'car-1': { purchaseYen: 500_000, repairYen: 10_000, partsYen: 0 } },
    })
    expect(carLedgerFor(state, 'car-1')).toEqual({
      purchaseYen: 500_000,
      repairYen: 10_000,
      partsYen: 0,
    })
  })
})

describe('setCarLedger / updateCarLedger / deleteCarLedger (Sprint 42)', () => {
  it('setCarLedger overwrites (or creates) an entry outright', () => {
    const state = baseState()
    const result = setCarLedger(state, 'car-1', {
      purchaseYen: 900_000,
      repairYen: 0,
      partsYen: 0,
    })
    expect(result.carLedgers).toEqual({
      'car-1': { purchaseYen: 900_000, repairYen: 0, partsYen: 0 },
    })
    expect(state.carLedgers).toEqual({}) // input untouched
  })

  it('updateCarLedger folds an accumulation onto an existing entry', () => {
    const state = baseState({
      carLedgers: { 'car-1': { purchaseYen: 900_000, repairYen: 0, partsYen: 0 } },
    })
    const result = updateCarLedger(state, 'car-1', (l) => ({
      ...l,
      repairYen: l.repairYen + 5_000,
    }))
    expect(result.carLedgers['car-1']).toEqual({
      purchaseYen: 900_000,
      repairYen: 5_000,
      partsYen: 0,
    })
  })

  it('updateCarLedger creates a fresh unknown-purchase entry when none existed', () => {
    const result = updateCarLedger(baseState(), 'car-1', (l) => ({
      ...l,
      partsYen: l.partsYen + 12_000,
    }))
    expect(result.carLedgers['car-1']).toEqual({
      purchaseYen: null,
      repairYen: 0,
      partsYen: 12_000,
    })
  })

  it('deleteCarLedger removes an existing entry', () => {
    const state = baseState({
      carLedgers: { 'car-1': { purchaseYen: 900_000, repairYen: 0, partsYen: 0 } },
    })
    const result = deleteCarLedger(state, 'car-1')
    expect(result.carLedgers).toEqual({})
  })

  it('deleteCarLedger is a no-op (same reference) when there is nothing to remove', () => {
    const state = baseState()
    expect(deleteCarLedger(state, 'car-1')).toBe(state)
  })
})
