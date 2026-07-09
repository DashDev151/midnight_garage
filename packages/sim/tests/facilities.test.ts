import {
  BUYERS,
  CARS,
  FACILITIES,
  HIDDEN_ISSUES,
  PARTS,
  type CarInstance,
  type GameState,
  type ServiceJob,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { generateAuctionCarInstance } from '../src/auctions'
import { buildSimContext } from '../src/context'
import {
  applyBayPurchase,
  applyBayPurchases,
  applyMoves,
  hasParkingSpace,
  moveCar,
  nextBayPriceYen,
  parkingOccupancy,
  releaseCarFromServiceBay,
  swapCars,
} from '../src/facilities'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES, [], FACILITIES)

function emptyBuildSheet(): CarInstance['buildSheet'] {
  return {
    engine: null,
    forcedInduction: null,
    drivetrain: null,
    suspension: null,
    brakes: null,
    bodyAero: null,
    wheelsInterior: null,
  }
}

function ownedCar(id: string): CarInstance {
  return {
    id,
    modelId: 'honda-city-e-aa',
    year: 1984,
    mileageKm: 100_000,
    color: 'White',
    provenanceNote: '',
    condition: { engine: 80, drivetrain: 80, suspension: 80, body: 80, interior: 80 },
    hiddenIssues: [],
    authenticityPercent: 90,
    buildSheet: emptyBuildSheet(),
  }
}

function serviceCar(id: string): ServiceJob {
  const car = generateAuctionCarInstance(CARS[0]!, CONTEXT.hiddenIssuesByZone, id, createRng(1))
  return {
    id: `svc-${id}`,
    typeId: 'repair-engine',
    customerName: 'Test Customer',
    description: 'test',
    work: { kind: 'repair', zone: 'engine' },
    car: { ...car, id },
    payoutYen: 20_000,
    baseReputation: 1,
    expiresOnDay: 30,
    dueOnDay: 10,
  }
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(CONTEXT, 1), ...overrides }
}

describe('parkingOccupancy / hasParkingSpace', () => {
  it('counts every shop car not in a service bay', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1'), ownedCar('car-2')],
      activeServiceJobs: [serviceCar('car-3')],
      serviceBayCarIds: ['car-1'],
    })
    expect(parkingOccupancy(state)).toBe(2) // car-2 and car-3; car-1 is in the bay
  })

  it('is full once occupancy reaches parkingBayCount', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1'), ownedCar('car-2'), ownedCar('car-3')],
      parkingBayCount: 3,
    })
    expect(hasParkingSpace(state)).toBe(false)
  })

  it('has space below capacity', () => {
    const state = baseState({ ownedCars: [ownedCar('car-1')], parkingBayCount: 3 })
    expect(hasParkingSpace(state)).toBe(true)
  })
})

describe('releaseCarFromServiceBay', () => {
  it('drops the id if present', () => {
    const state = baseState({ serviceBayCarIds: ['car-1', 'car-2'] })
    const next = releaseCarFromServiceBay(state, 'car-1')
    expect(next.serviceBayCarIds).toEqual(['car-2'])
  })

  it('is a no-op (same reference) if the car is not in a bay', () => {
    const state = baseState({ serviceBayCarIds: ['car-2'] })
    const next = releaseCarFromServiceBay(state, 'car-1')
    expect(next).toBe(state)
  })
})

describe('moveCar', () => {
  it('moves an owned car into a free service bay', () => {
    const state = baseState({ ownedCars: [ownedCar('car-1')], serviceBayCount: 1 })
    const result = moveCar(state, 'car-1', 'service')
    expect(result.changed).toBe(true)
    expect(result.state.serviceBayCarIds).toEqual(['car-1'])
  })

  it('refuses to move into a full service bay', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1'), ownedCar('car-2')],
      serviceBayCount: 1,
      serviceBayCarIds: ['car-1'],
    })
    const result = moveCar(state, 'car-2', 'service')
    expect(result.changed).toBe(false)
    expect(result.state).toBe(state)
  })

  it('moves a car back to parking, freeing the bay', () => {
    const state = baseState({ ownedCars: [ownedCar('car-1')], serviceBayCarIds: ['car-1'] })
    const result = moveCar(state, 'car-1', 'parking')
    expect(result.changed).toBe(true)
    expect(result.state.serviceBayCarIds).toEqual([])
  })

  it('refuses to move out of the service bay when parking is already full', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1'), ownedCar('car-2'), ownedCar('car-3'), ownedCar('car-4')],
      parkingBayCount: 3,
      serviceBayCarIds: ['car-1'],
    })
    // 3 cars already fill parking (car-2/3/4); pulling car-1 out has nowhere to go.
    const result = moveCar(state, 'car-1', 'parking')
    expect(result.changed).toBe(false)
  })

  it('is a no-op for a car already at the destination', () => {
    const state = baseState({ ownedCars: [ownedCar('car-1')], serviceBayCarIds: ['car-1'] })
    const result = moveCar(state, 'car-1', 'service')
    expect(result.changed).toBe(false)
  })

  it('is a no-op for a car not in the shop at all', () => {
    const state = baseState()
    const result = moveCar(state, 'ghost-car', 'service')
    expect(result.changed).toBe(false)
  })

  it('works for a service-job car, not just an owned one', () => {
    const state = baseState({ activeServiceJobs: [serviceCar('car-1')] })
    const result = moveCar(state, 'car-1', 'service')
    expect(result.changed).toBe(true)
  })
})

describe('swapCars (Sprint 11, round-2 playtest #3)', () => {
  it('exchanges a service-bay car and a parking car even when the shop is exactly full', () => {
    // 1 service bay, 1 parking bay, both occupied — a direct move in either
    // direction is illegal (zero slack anywhere), but a swap's net change in
    // each location is zero, so it must still succeed.
    const state = baseState({
      ownedCars: [ownedCar('service-car'), ownedCar('parking-car')],
      serviceBayCount: 1,
      parkingBayCount: 1,
      serviceBayCarIds: ['service-car'],
    })
    expect(moveCar(state, 'parking-car', 'service').changed).toBe(false) // sanity: direct move fails
    const result = swapCars(state, 'service-car', 'parking-car')
    expect(result.changed).toBe(true)
    expect(result.state.serviceBayCarIds).toEqual(['parking-car'])
  })

  it('is a no-op if the claimed service car is not actually in a bay', () => {
    const state = baseState({ ownedCars: [ownedCar('car-1'), ownedCar('car-2')] })
    const result = swapCars(state, 'car-1', 'car-2')
    expect(result.changed).toBe(false)
    expect(result.state).toBe(state)
  })

  it('is a no-op if the claimed parking car is actually also in a service bay', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1'), ownedCar('car-2')],
      serviceBayCount: 2,
      serviceBayCarIds: ['car-1', 'car-2'],
    })
    const result = swapCars(state, 'car-1', 'car-2')
    expect(result.changed).toBe(false)
  })

  it('is a no-op if the parking car is not in the shop at all', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1')],
      serviceBayCarIds: ['car-1'],
    })
    const result = swapCars(state, 'car-1', 'ghost-car')
    expect(result.changed).toBe(false)
  })

  it('preserves total occupancy — the net change in each location is zero', () => {
    const state = baseState({
      ownedCars: [ownedCar('service-car'), ownedCar('parking-car')],
      serviceBayCount: 1,
      parkingBayCount: 1,
      serviceBayCarIds: ['service-car'],
    })
    const before = { service: state.serviceBayCarIds.length, parking: parkingOccupancy(state) }
    const result = swapCars(state, 'service-car', 'parking-car')
    const after = {
      service: result.state.serviceBayCarIds.length,
      parking: parkingOccupancy(result.state),
    }
    expect(after).toEqual(before)
  })
})

describe('applyMoves', () => {
  it('applies a free, unlimited shuffle within one day, logging only real changes', () => {
    const state = baseState({ ownedCars: [ownedCar('car-1')], serviceBayCount: 1 })
    const result = applyMoves(state, [
      { carInstanceId: 'car-1', to: 'service' },
      { carInstanceId: 'car-1', to: 'parking' },
      { carInstanceId: 'car-1', to: 'service' },
    ])
    expect(result.state.serviceBayCarIds).toEqual(['car-1'])
    expect(result.log).toHaveLength(3) // every move actually changed the location
  })

  it('drops a move that cannot apply without logging it', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1'), ownedCar('car-2')],
      serviceBayCount: 1,
      serviceBayCarIds: ['car-1'],
    })
    const result = applyMoves(state, [{ carInstanceId: 'car-2', to: 'service' }])
    expect(result.log).toHaveLength(0)
    expect(result.state.serviceBayCarIds).toEqual(['car-1'])
  })
})

describe('nextBayPriceYen', () => {
  it('is the first price at the start count', () => {
    const state = baseState()
    expect(nextBayPriceYen(state, 'service', FACILITIES)).toBe(FACILITIES.service.bayPricesYen[0])
  })

  it('is null once maxCount is reached', () => {
    const state = baseState({ serviceBayCount: FACILITIES.service.maxCount })
    expect(nextBayPriceYen(state, 'service', FACILITIES)).toBeNull()
  })
})

describe('applyBayPurchase / applyBayPurchases', () => {
  it('buys a bay, deducts cash, and the new bay is usable', () => {
    const price = FACILITIES.service.bayPricesYen[0]!
    const state = baseState({ cashYen: price })
    const result = applyBayPurchase(state, 'service', FACILITIES)
    expect(result.applied).toBe(true)
    expect(result.state.cashYen).toBe(0)
    expect(result.state.serviceBayCount).toBe(FACILITIES.service.startCount + 1)
    expect(result.log).toEqual([{ type: 'bay-purchased', kind: 'service', priceYen: price }])
  })

  it('refuses when unaffordable, with no state change', () => {
    const state = baseState({ cashYen: 0 })
    const result = applyBayPurchase(state, 'service', FACILITIES)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('refuses at the max count even with unlimited cash', () => {
    const state = baseState({ cashYen: 999_999_999, serviceBayCount: FACILITIES.service.maxCount })
    const result = applyBayPurchase(state, 'service', FACILITIES)
    expect(result.applied).toBe(false)
  })

  it('a batch purchase re-prices each subsequent bay off the escalating ladder', () => {
    const state = baseState({ cashYen: 999_999_999 })
    const result = applyBayPurchases(state, [{ kind: 'service' }, { kind: 'service' }], FACILITIES)
    expect(result.state.serviceBayCount).toBe(FACILITIES.service.startCount + 2)
    expect(result.log).toHaveLength(2)
    expect(result.log[0]).toMatchObject({ priceYen: FACILITIES.service.bayPricesYen[0] })
    expect(result.log[1]).toMatchObject({ priceYen: FACILITIES.service.bayPricesYen[1] })
  })
})
