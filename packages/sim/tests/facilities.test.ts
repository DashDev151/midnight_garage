import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
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
  assignToParking,
  assignToShop,
  hasAcquisitionSpace,
  hasGraceSpace,
  hasOwnedShopSpace,
  hasParkingSpace,
  hasServiceBaySpace,
  moveCar,
  moveCarToSlot,
  nextBayMinReputationTier,
  nextBayPriceYen,
  parkingOccupancy,
  releaseCarFromShop,
  resolveGraceParking,
  serviceBayOccupancy,
  swapCars,
} from '../src/facilities'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'
import { buildCarInstance } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)

function ownedCar(id: string) {
  return buildCarInstance({
    id,
    modelId: 'honda-city-e-aa',
    year: 1984,
    mileageKm: 100_000,
    authenticityPercent: 90,
  })
}

function serviceCar(id: string): ServiceJob {
  const car = generateAuctionCarInstance(CARS[0]!, id, createRng(1), CONTEXT)
  return {
    id: `svc-${id}`,
    typeId: 'repair-engine',
    customerName: 'Test Customer',
    description: 'test',
    tasks: [{ action: 'repair', carPartId: 'block', targetBand: 'mint', minToolTier: 1 }],
    car: { ...car, id },
    payoutYen: 20_000,
    baseReputation: 1,
    deadlineDays: 7,
    expiresOnDay: 30,
    arrivesOnDay: null,
    dueOnDay: 10,
  }
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return { ...createInitialGameState(CONTEXT, 1), ...overrides }
}

describe('parkingOccupancy / hasParkingSpace', () => {
  it('counts every real, explicitly-placed parking slot (Sprint 17: parking is real indexed state now)', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1'), ownedCar('car-2')],
      activeServiceJobs: [serviceCar('car-3')],
      serviceBayCarIds: ['car-1'],
      parkingCarIds: ['car-2', 'car-3', null],
    })
    expect(parkingOccupancy(state)).toBe(2)
  })

  it('is full once occupancy reaches parkingBayCount', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1'), ownedCar('car-2'), ownedCar('car-3')],
      parkingBayCount: 3,
      parkingCarIds: ['car-1', 'car-2', 'car-3'],
    })
    expect(hasParkingSpace(state)).toBe(false)
  })

  it('has space below capacity', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1')],
      parkingBayCount: 3,
      parkingCarIds: ['car-1', null, null],
    })
    expect(hasParkingSpace(state)).toBe(true)
  })
})

describe('assignToParking (Sprint 17)', () => {
  it('places a car in the first empty parking slot', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1')],
      parkingCarIds: [null, null, null],
    })
    const next = assignToParking(state, 'car-1')
    expect(next.parkingCarIds).toEqual(['car-1', null, null])
  })

  it('appends a new slot if parking is genuinely full (the dev-console overflow path)', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1')],
      parkingBayCount: 1,
      parkingCarIds: ['car-0'],
    })
    const next = assignToParking(state, 'car-1')
    expect(next.parkingCarIds).toEqual(['car-0', 'car-1'])
  })

  it('is idempotent for a car that already has a slot', () => {
    const state = baseState({ ownedCars: [ownedCar('car-1')], parkingCarIds: ['car-1', null] })
    const next = assignToParking(state, 'car-1')
    expect(next).toBe(state)
  })
})

describe('serviceBayOccupancy / hasServiceBaySpace (Sprint 45)', () => {
  it('counts every real, explicitly-placed service-bay slot', () => {
    const state = baseState({ serviceBayCount: 3, serviceBayCarIds: ['car-1', null, 'car-2'] })
    expect(serviceBayOccupancy(state)).toBe(2)
  })

  it('is full once occupancy reaches serviceBayCount', () => {
    const state = baseState({ serviceBayCount: 1, serviceBayCarIds: ['car-1'] })
    expect(hasServiceBaySpace(state)).toBe(false)
  })

  it('has space below capacity', () => {
    const state = baseState({ serviceBayCount: 2, serviceBayCarIds: ['car-1', null] })
    expect(hasServiceBaySpace(state)).toBe(true)
  })
})

describe('hasOwnedShopSpace / hasGraceSpace / hasAcquisitionSpace (Sprint 45)', () => {
  it('hasOwnedShopSpace is true if EITHER parking or a service bay is open', () => {
    const parkingOnly = baseState({
      parkingBayCount: 1,
      parkingCarIds: [null],
      serviceBayCount: 1,
      serviceBayCarIds: ['car-1'],
    })
    expect(hasOwnedShopSpace(parkingOnly)).toBe(true)

    const bayOnly = baseState({
      parkingBayCount: 1,
      parkingCarIds: ['car-1'],
      serviceBayCount: 1,
      serviceBayCarIds: [null],
    })
    expect(hasOwnedShopSpace(bayOnly)).toBe(true)
  })

  it('hasOwnedShopSpace is false only when both parking and every service bay are full', () => {
    const state = baseState({
      parkingBayCount: 1,
      parkingCarIds: ['car-1'],
      serviceBayCount: 1,
      serviceBayCarIds: ['car-2'],
    })
    expect(hasOwnedShopSpace(state)).toBe(false)
  })

  it('hasGraceSpace is true only when nothing is double-parked', () => {
    expect(hasGraceSpace(baseState({ graceParkingCarId: null }))).toBe(true)
    expect(hasGraceSpace(baseState({ graceParkingCarId: 'car-1' }))).toBe(false)
  })

  it('hasAcquisitionSpace is true whenever real capacity OR the grace slot is free', () => {
    const graceOnly = baseState({
      parkingBayCount: 1,
      parkingCarIds: ['car-1'],
      serviceBayCount: 1,
      serviceBayCarIds: ['car-2'],
      graceParkingCarId: null,
    })
    expect(hasAcquisitionSpace(graceOnly)).toBe(true)
  })

  it('hasAcquisitionSpace is false only once parking, every service bay, AND the grace slot are full', () => {
    const full = baseState({
      parkingBayCount: 1,
      parkingCarIds: ['car-1'],
      serviceBayCount: 1,
      serviceBayCarIds: ['car-2'],
      graceParkingCarId: 'car-3',
    })
    expect(hasAcquisitionSpace(full)).toBe(false)
  })
})

describe('assignToShop (Sprint 45 decision 1+2: the real acquisition placement cascade)', () => {
  it('places into parking first when it has room', () => {
    const state = baseState({
      parkingBayCount: 2,
      parkingCarIds: [null, null],
      serviceBayCount: 1,
      serviceBayCarIds: [null],
    })
    const next = assignToShop(state, 'car-1')
    expect(next.parkingCarIds).toEqual(['car-1', null])
    expect(next.serviceBayCarIds).toEqual([null])
    expect(next.graceParkingCarId).toBeNull()
  })

  it('falls back to a service bay once parking is full', () => {
    const state = baseState({
      parkingBayCount: 1,
      parkingCarIds: ['car-0'],
      serviceBayCount: 1,
      serviceBayCarIds: [null],
    })
    const next = assignToShop(state, 'car-1')
    expect(next.parkingCarIds).toEqual(['car-0'])
    expect(next.serviceBayCarIds).toEqual(['car-1'])
    expect(next.graceParkingCarId).toBeNull()
  })

  it('falls back to the grace slot only once parking AND every service bay are full', () => {
    const state = baseState({
      parkingBayCount: 1,
      parkingCarIds: ['car-0'],
      serviceBayCount: 1,
      serviceBayCarIds: ['car-00'],
    })
    const next = assignToShop(state, 'car-1')
    expect(next.parkingCarIds).toEqual(['car-0'])
    expect(next.serviceBayCarIds).toEqual(['car-00'])
    expect(next.graceParkingCarId).toBe('car-1')
  })
})

describe('resolveGraceParking (Sprint 45 decision 3: day-boundary migrate-then-fine)', () => {
  it('is a no-op (same state, empty log) when nothing is double-parked', () => {
    const state = baseState({ graceParkingCarId: null })
    const result = resolveGraceParking(state, ECONOMY)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('migrates into parking, without charging the fine, once a parking slot has opened up', () => {
    const state = baseState({
      graceParkingCarId: 'car-1',
      parkingBayCount: 1,
      parkingCarIds: [null],
      serviceBayCount: 1,
      serviceBayCarIds: ['car-2'],
      cashYen: 1_000_000,
    })
    const result = resolveGraceParking(state, ECONOMY)
    expect(result.state.graceParkingCarId).toBeNull()
    expect(result.state.parkingCarIds).toEqual(['car-1'])
    expect(result.state.cashYen).toBe(1_000_000) // unfined - it moved before the fine check
    expect(result.log).toEqual([{ type: 'car-moved', carInstanceId: 'car-1', to: 'parking' }])
  })

  it('migrates into a service bay (not parking) when only a bay has opened up', () => {
    const state = baseState({
      graceParkingCarId: 'car-1',
      parkingBayCount: 1,
      parkingCarIds: ['car-0'],
      serviceBayCount: 1,
      serviceBayCarIds: [null],
      cashYen: 1_000_000,
    })
    const result = resolveGraceParking(state, ECONOMY)
    expect(result.state.graceParkingCarId).toBeNull()
    expect(result.state.serviceBayCarIds).toEqual(['car-1'])
    expect(result.state.cashYen).toBe(1_000_000)
    expect(result.log).toEqual([{ type: 'car-moved', carInstanceId: 'car-1', to: 'service' }])
  })

  it('charges the daily fine, unconditionally, when the slot is still occupied and nothing opened up', () => {
    const state = baseState({
      graceParkingCarId: 'car-1',
      parkingBayCount: 1,
      parkingCarIds: ['car-0'],
      serviceBayCount: 1,
      serviceBayCarIds: ['car-2'],
      cashYen: 1_000_000,
    })
    const result = resolveGraceParking(state, ECONOMY)
    expect(result.state.graceParkingCarId).toBe('car-1') // still double-parked
    expect(result.state.cashYen).toBe(1_000_000 - ECONOMY.DOUBLE_PARKING_FINE_YEN)
    expect(result.log).toEqual([
      {
        type: 'double-parking-fine',
        carInstanceId: 'car-1',
        amountYen: ECONOMY.DOUBLE_PARKING_FINE_YEN,
      },
    ])
  })
})

describe('releaseCarFromShop (Sprint 17: renamed - releases from wherever the car actually sits)', () => {
  it('clears the slot if the car is in a service bay', () => {
    const state = baseState({ serviceBayCarIds: ['car-1', 'car-2'] })
    const next = releaseCarFromShop(state, 'car-1')
    expect(next.serviceBayCarIds).toEqual([null, 'car-2'])
  })

  it('clears the slot if the car is parked', () => {
    const state = baseState({ parkingCarIds: ['car-1', 'car-2', null] })
    const next = releaseCarFromShop(state, 'car-1')
    expect(next.parkingCarIds).toEqual([null, 'car-2', null])
  })

  it('clears the grace slot if the car is double-parked (Sprint 45)', () => {
    const state = baseState({ graceParkingCarId: 'car-1' })
    const next = releaseCarFromShop(state, 'car-1')
    expect(next.graceParkingCarId).toBeNull()
  })

  it('is a no-op (same reference) if the car has no slot anywhere', () => {
    const state = baseState({ serviceBayCarIds: ['car-2'], parkingCarIds: ['car-3'] })
    const next = releaseCarFromShop(state, 'car-1')
    expect(next).toBe(state)
  })
})

describe('moveCar', () => {
  it('moves a parked car into a free service bay', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1')],
      serviceBayCount: 1,
      parkingCarIds: ['car-1'],
    })
    const result = moveCar(state, 'car-1', 'service')
    expect(result.changed).toBe(true)
    expect(result.state.serviceBayCarIds).toEqual(['car-1'])
    expect(result.state.parkingCarIds).toEqual([null])
  })

  it('refuses to move into a full service bay', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1'), ownedCar('car-2')],
      serviceBayCount: 1,
      serviceBayCarIds: ['car-1'],
      parkingCarIds: ['car-2'],
    })
    const result = moveCar(state, 'car-2', 'service')
    expect(result.changed).toBe(false)
    expect(result.state).toBe(state)
  })

  it('moves a car back to parking, freeing the bay', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1')],
      serviceBayCarIds: ['car-1'],
      parkingCarIds: [null, null, null],
    })
    const result = moveCar(state, 'car-1', 'parking')
    expect(result.changed).toBe(true)
    expect(result.state.serviceBayCarIds).toEqual([null])
    expect(result.state.parkingCarIds).toEqual(['car-1', null, null])
  })

  it('refuses to move out of the service bay when parking is already full', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1'), ownedCar('car-2'), ownedCar('car-3'), ownedCar('car-4')],
      parkingBayCount: 3,
      serviceBayCarIds: ['car-1'],
      parkingCarIds: ['car-2', 'car-3', 'car-4'],
    })
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

  it('is a no-op for a real shop car that has no slot anywhere yet (the placement invariant)', () => {
    // Every real acquisition path (auction win, buyout, service-job accept,
    // dev grant) assigns a parking slot the moment a car enters the shop
    // (assignToParking) - a car that's in ownedCars/activeServiceJobs but
    // in neither array shouldn't be reachable in real play. moveCar/
    // moveCarToSlot deliberately don't paper over that with an implicit
    // fallback, so a violation here is loud, not silently "handled".
    const state = baseState({ ownedCars: [ownedCar('car-1')] }) // no slot assigned
    const result = moveCar(state, 'car-1', 'service')
    expect(result.changed).toBe(false)
  })

  it('works for a service-job car, not just an owned one', () => {
    const car = serviceCar('car-1')
    const state = baseState({ activeServiceJobs: [car], parkingCarIds: [car.car.id] })
    const result = moveCar(state, car.car.id, 'service')
    expect(result.changed).toBe(true)
  })
})

describe('moveCarToSlot (Sprint 17 positional fix)', () => {
  it('places a car in the exact empty slot targeted, not just "the first one"', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1')],
      serviceBayCount: 3,
      serviceBayCarIds: [null, null, null],
      parkingCarIds: ['car-1'],
    })
    const result = moveCarToSlot(state, 'car-1', 'service', 2)
    expect(result.changed).toBe(true)
    expect(result.state.serviceBayCarIds).toEqual([null, null, 'car-1'])
  })

  it('swapping onto an occupied slot exchanges both cars’ positions, same section', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-a'), ownedCar('car-b')],
      serviceBayCount: 2,
      serviceBayCarIds: ['car-a', 'car-b'],
    })
    const result = moveCarToSlot(state, 'car-a', 'service', 1)
    expect(result.changed).toBe(true)
    expect(result.state.serviceBayCarIds).toEqual(['car-b', 'car-a'])
  })

  it('swapping onto an occupied slot exchanges both cars’ positions, cross section', () => {
    const state = baseState({
      ownedCars: [ownedCar('service-car'), ownedCar('parking-car')],
      serviceBayCarIds: ['service-car'],
      parkingCarIds: ['parking-car', null],
    })
    const result = moveCarToSlot(state, 'service-car', 'parking', 0)
    expect(result.changed).toBe(true)
    expect(result.state.parkingCarIds).toEqual(['service-car', null])
    expect(result.state.serviceBayCarIds).toEqual(['parking-car'])
  })

  it('dropping onto its own slot is a no-op', () => {
    const state = baseState({ ownedCars: [ownedCar('car-1')], serviceBayCarIds: ['car-1'] })
    const result = moveCarToSlot(state, 'car-1', 'service', 0)
    expect(result.changed).toBe(false)
  })

  it('refuses a slot index beyond the bay count', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1')],
      serviceBayCount: 1,
      parkingCarIds: ['car-1'],
    })
    const result = moveCarToSlot(state, 'car-1', 'service', 5)
    expect(result.changed).toBe(false)
  })

  it('tolerates a bay array shorter than its count (implicit trailing empty slots)', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1')],
      serviceBayCount: 2,
      serviceBayCarIds: [], // shorter than serviceBayCount - index 1 is implicitly empty
      parkingCarIds: ['car-1'],
    })
    const result = moveCarToSlot(state, 'car-1', 'service', 1)
    expect(result.changed).toBe(true)
    expect(result.state.serviceBayCarIds).toEqual([null, 'car-1'])
  })
})

describe('swapCars (Sprint 11, round-2 playtest #3)', () => {
  it('exchanges a service-bay car and a parking car even when the shop is exactly full', () => {
    // 1 service bay, 1 parking bay, both occupied - a direct move in either
    // direction is illegal (zero slack anywhere), but a swap's net change in
    // each location is zero, so it must still succeed.
    const state = baseState({
      ownedCars: [ownedCar('service-car'), ownedCar('parking-car')],
      serviceBayCount: 1,
      parkingBayCount: 1,
      serviceBayCarIds: ['service-car'],
      parkingCarIds: ['parking-car'],
    })
    expect(moveCar(state, 'parking-car', 'service').changed).toBe(false) // sanity: direct move fails
    const result = swapCars(state, 'service-car', 'parking-car')
    expect(result.changed).toBe(true)
    expect(result.state.serviceBayCarIds).toEqual(['parking-car'])
    expect(result.state.parkingCarIds).toEqual(['service-car'])
  })

  it('is a no-op if the claimed service car is not actually in a bay', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1'), ownedCar('car-2')],
      parkingCarIds: ['car-1', 'car-2'],
    })
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

  it('preserves total occupancy - the net change in each location is zero', () => {
    const state = baseState({
      ownedCars: [ownedCar('service-car'), ownedCar('parking-car')],
      serviceBayCount: 1,
      parkingBayCount: 1,
      serviceBayCarIds: ['service-car'],
      parkingCarIds: ['parking-car'],
    })
    const before = {
      service: state.serviceBayCarIds.filter((id) => id !== null).length,
      parking: parkingOccupancy(state),
    }
    const result = swapCars(state, 'service-car', 'parking-car')
    const after = {
      service: result.state.serviceBayCarIds.filter((id) => id !== null).length,
      parking: parkingOccupancy(result.state),
    }
    expect(after).toEqual(before)
  })
})

describe('applyMoves', () => {
  it('applies a free, unlimited shuffle within one day, logging only real changes', () => {
    const state = baseState({
      ownedCars: [ownedCar('car-1')],
      serviceBayCount: 1,
      parkingCarIds: ['car-1'],
    })
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
      parkingCarIds: ['car-2'],
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

describe('nextBayMinReputationTier (Sprint 16)', () => {
  it('reports the ladder’s first rung requirement at a fresh, unranked game', () => {
    const state = baseState()
    expect(nextBayMinReputationTier(state, 'service', FACILITIES)).toBe(
      FACILITIES.service.minReputationTier[0],
    )
  })

  it('is null once the tier is already met', () => {
    const state = baseState({ reputationTier: FACILITIES.service.minReputationTier[0]! })
    expect(nextBayMinReputationTier(state, 'service', FACILITIES)).toBeNull()
  })

  it('is null once maxCount is reached (nothing left to gate)', () => {
    const state = baseState({ serviceBayCount: FACILITIES.service.maxCount })
    expect(nextBayMinReputationTier(state, 'service', FACILITIES)).toBeNull()
  })
})

describe('applyBayPurchase / applyBayPurchases', () => {
  it('buys a bay, deducts cash, and the new bay is usable, once reputation clears the gate', () => {
    const price = FACILITIES.service.bayPricesYen[0]!
    const rung1Tier = FACILITIES.service.minReputationTier[0]!
    const state = baseState({ cashYen: price, reputationTier: rung1Tier })
    const result = applyBayPurchase(state, 'service', FACILITIES)
    expect(result.applied).toBe(true)
    expect(result.state.cashYen).toBe(0)
    expect(result.state.serviceBayCount).toBe(FACILITIES.service.startCount + 1)
    expect(result.log).toEqual([{ type: 'bay-purchased', kind: 'service', priceYen: price }])
  })

  it('appends a new empty slot so the array keeps tracking the bought count', () => {
    const price = FACILITIES.service.bayPricesYen[0]!
    const rung1Tier = FACILITIES.service.minReputationTier[0]!
    const state = baseState({ cashYen: price, reputationTier: rung1Tier })
    const result = applyBayPurchase(state, 'service', FACILITIES)
    expect(result.state.serviceBayCarIds).toHaveLength(state.serviceBayCarIds.length + 1)
    expect(result.state.serviceBayCarIds.at(-1)).toBeNull()
  })

  it('refuses when unaffordable, with no state change', () => {
    const rung1Tier = FACILITIES.service.minReputationTier[0]!
    const state = baseState({ cashYen: 0, reputationTier: rung1Tier })
    const result = applyBayPurchase(state, 'service', FACILITIES)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('refuses at the max count even with unlimited cash', () => {
    const state = baseState({
      cashYen: 999_999_999,
      reputationTier: 'legend',
      serviceBayCount: FACILITIES.service.maxCount,
    })
    const result = applyBayPurchase(state, 'service', FACILITIES)
    expect(result.applied).toBe(false)
  })

  it('refuses a reputation-gated rung even with unlimited cash', () => {
    const state = baseState({ cashYen: 999_999_999, reputationTier: 'unknown' })
    const result = applyBayPurchase(state, 'service', FACILITIES)
    expect(result.applied).toBe(false)
    expect(result.state).toBe(state)
  })

  it('a batch purchase re-prices each subsequent bay off the escalating ladder', () => {
    const state = baseState({ cashYen: 999_999_999, reputationTier: 'legend' })
    const result = applyBayPurchases(state, [{ kind: 'service' }, { kind: 'service' }], FACILITIES)
    expect(result.state.serviceBayCount).toBe(FACILITIES.service.startCount + 2)
    expect(result.log).toHaveLength(2)
    expect(result.log[0]).toMatchObject({ priceYen: FACILITIES.service.bayPricesYen[0] })
    expect(result.log[1]).toMatchObject({ priceYen: FACILITIES.service.bayPricesYen[1] })
  })
})
