import { CARS, FACILITIES } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

describe('facilities (bays) in the store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('a new game starts with the content-configured bay counts, empty', () => {
    const game = useGameStore()
    expect(game.serviceBayCount).toBe(FACILITIES.service.startCount)
    expect(game.parkingCapacity).toBe(FACILITIES.parking.startCount)
    expect(game.serviceBayFreeCount).toBe(FACILITIES.service.startCount)
    expect(game.serviceBaysView).toEqual(Array(FACILITIES.service.startCount).fill(null))
    expect(game.parkingView).toEqual([])
  })

  it('a granted car lands in parking, never straight into a bay', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id

    expect(game.parkingView.some((c) => c.carId === carId)).toBe(true)
    expect(game.serviceBaysView.every((slot) => slot === null)).toBe(true)
    expect(game.parkingOccupancyCount).toBe(1)
  })

  it('moveCar is instant, free, and reversible any number of times', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const cashBefore = game.cashYen

    expect(game.moveCar(carId, 'service')).toBe(true)
    expect(game.serviceBaysView.some((slot) => slot?.carId === carId)).toBe(true)
    expect(game.moveCar(carId, 'parking')).toBe(true)
    expect(game.moveCar(carId, 'service')).toBe(true)
    expect(game.cashYen).toBe(cashBefore) // free
  })

  it('moveCar refuses an unknown car and a full service bay', () => {
    const game = useGameStore()
    expect(game.moveCar('ghost-car', 'service')).toBe(false)

    game.devGrantCar(CARS[0]!.id)
    game.devGrantCar(CARS[1]?.id ?? CARS[0]!.id)
    const [carA, carB] = game.gameState.ownedCars
    game.moveCar(carA!.id, 'service') // fills the sole starting bay
    expect(game.moveCar(carB!.id, 'service')).toBe(false)
  })

  it('buyBay deducts cash and the new bay is usable immediately', () => {
    const game = useGameStore()
    const price = game.nextBayPrice('service')!
    const cashBefore = game.cashYen

    expect(game.buyBay('service')).toBe(true)
    expect(game.cashYen).toBe(cashBefore - price)
    expect(game.serviceBayCount).toBe(FACILITIES.service.startCount + 1)

    game.devGrantCar(CARS[0]!.id)
    game.devGrantCar(CARS[1]?.id ?? CARS[0]!.id)
    const [carA, carB] = game.gameState.ownedCars
    expect(game.moveCar(carA!.id, 'service')).toBe(true)
    expect(game.moveCar(carB!.id, 'service')).toBe(true) // the bought bay fits it
  })

  it('buyBay refuses when unaffordable', () => {
    const game = useGameStore()
    game.devGiveCash(-game.cashYen) // drain to zero
    expect(game.buyBay('service')).toBe(false)
    expect(game.serviceBayCount).toBe(FACILITIES.service.startCount)
  })

  it('parkingFull reflects live occupancy against capacity', () => {
    const game = useGameStore()
    expect(game.parkingFull).toBe(false)
    for (let i = 0; i < FACILITIES.parking.startCount; i++) {
      game.devGrantCar(CARS[i % CARS.length]!.id)
    }
    expect(game.parkingFull).toBe(true)
  })
})
