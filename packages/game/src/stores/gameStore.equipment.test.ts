import { EQUIPMENT, CARS } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

const WELDER = EQUIPMENT.find((e) => e.componentIds.includes('body'))!

describe('equipment in the store (Sprint 13)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('a new game owns no equipment; the catalog lists every item as unowned', () => {
    const game = useGameStore()
    expect(game.equipmentCatalog).toHaveLength(EQUIPMENT.length)
    expect(game.equipmentCatalog.every((e) => !e.owned)).toBe(true)
    expect(game.hasEquipmentForComponent('body')).toBe(false)
  })

  it('buyEquipment deducts cash and the item is owned immediately', () => {
    const game = useGameStore()
    const cashBefore = game.cashYen
    expect(game.buyEquipment(WELDER.id)).toBe(true)
    expect(game.cashYen).toBe(cashBefore - WELDER.priceYen)
    expect(game.hasEquipmentForComponent('body')).toBe(true)
    expect(game.equipmentCatalog.find((e) => e.id === WELDER.id)?.owned).toBe(true)
  })

  it('buyEquipment refuses when unaffordable, with no state change', () => {
    const game = useGameStore()
    game.devGiveCash(-game.cashYen) // drain to zero
    expect(game.buyEquipment(WELDER.id)).toBe(false)
    expect(game.hasEquipmentForComponent('body')).toBe(false)
  })

  it('repair() no-ops on a component whose equipment is not owned', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')

    const cashBefore = game.cashYen
    game.repair(car.id, 'body')
    // No job created, no consumables charged — the gate refuses before any
    // job exists, mirroring the existing `condition >= 100` early-return.
    expect(game.carDetail(car.id)?.jobs).toHaveLength(0)
    expect(game.cashYen).toBe(cashBefore)
  })

  it('repair() proceeds normally once the equipment is owned', () => {
    const game = useGameStore()
    game.buyEquipment(WELDER.id)
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')

    game.repair(car.id, 'body')
    // A single day's labor may be enough to finish the job outright (in
    // which case it's already gone from the in-progress list) — either an
    // open job or a completed repair proves the gate let it through.
    const detail = game.carDetail(car.id)
    const jobOpened = detail?.jobs.some((j) => j.componentId === 'body') ?? false
    const jobFinished = detail?.car.components.body.condition === 100
    expect(jobOpened || jobFinished).toBe(true)
  })

  it('devGrantEquipment bypasses price for tests/dev, is idempotent', () => {
    const game = useGameStore()
    const cashBefore = game.cashYen
    game.devGrantEquipment(WELDER.id)
    game.devGrantEquipment(WELDER.id) // repeat call, no duplicate / no double charge
    expect(game.cashYen).toBe(cashBefore)
    expect(game.gameState.ownedEquipmentIds).toEqual([WELDER.id])
  })
})
