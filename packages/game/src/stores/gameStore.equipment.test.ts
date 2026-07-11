import { EQUIPMENT, CARS } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

/** Ungated per the Sprint 16 ladder (day-1 accessible) - the plain purchase
 * flow's fixture, so these tests aren't entangled with the reputation gate. */
const TIRE_MACHINE = EQUIPMENT.find((e) => e.componentIds.includes('wheels'))!
/** Reputation-gated per the Sprint 16 ladder (requires 'known') - used
 * specifically to exercise the gate below. */
const WELDER = EQUIPMENT.find((e) => e.componentIds.includes('body'))!

describe('equipment in the store (Sprint 13)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('a new game owns no equipment; the catalog lists every item as unowned', () => {
    const game = useGameStore()
    expect(game.equipmentCatalog).toHaveLength(EQUIPMENT.length)
    expect(game.equipmentCatalog.every((e) => !e.owned)).toBe(true)
    expect(game.hasEquipmentForComponent('wheels')).toBe(false)
  })

  it('buyEquipment deducts cash and the item is owned immediately', () => {
    const game = useGameStore()
    const cashBefore = game.cashYen
    expect(game.buyEquipment(TIRE_MACHINE.id)).toBe(true)
    expect(game.cashYen).toBe(cashBefore - TIRE_MACHINE.priceYen)
    expect(game.hasEquipmentForComponent('wheels')).toBe(true)
    expect(game.equipmentCatalog.find((e) => e.id === TIRE_MACHINE.id)?.owned).toBe(true)
  })

  it('buyEquipment refuses when unaffordable, with no state change', () => {
    const game = useGameStore()
    game.devGiveCash(-game.cashYen) // drain to zero
    expect(game.buyEquipment(TIRE_MACHINE.id)).toBe(false)
    expect(game.hasEquipmentForComponent('wheels')).toBe(false)
  })

  it('repair() no-ops on a component whose equipment is not owned', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')

    const cashBefore = game.cashYen
    game.repair(car.id, 'wheels')
    // No job created, no consumables charged - the gate refuses before any
    // job exists, mirroring the existing `condition >= 100` early-return.
    expect(game.carDetail(car.id)?.jobs).toHaveLength(0)
    expect(game.cashYen).toBe(cashBefore)
  })

  it('repair() proceeds normally once the equipment is owned', () => {
    const game = useGameStore()
    game.buyEquipment(TIRE_MACHINE.id)
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')

    game.repair(car.id, 'wheels')
    // A single day's labor may be enough to finish the job outright (in
    // which case it's already gone from the in-progress list) - either an
    // open job or a completed repair proves the gate let it through.
    const detail = game.carDetail(car.id)
    const jobOpened = detail?.jobs.some((j) => j.componentId === 'wheels') ?? false
    const jobFinished = detail?.groupBands.wheels === 'mint'
    expect(jobOpened || jobFinished).toBe(true)
  })

  it('devGrantEquipment bypasses price for tests/dev, is idempotent', () => {
    const game = useGameStore()
    const cashBefore = game.cashYen
    game.devGrantEquipment(TIRE_MACHINE.id)
    game.devGrantEquipment(TIRE_MACHINE.id) // repeat call, no duplicate / no double charge
    expect(game.cashYen).toBe(cashBefore)
    expect(game.gameState.ownedEquipmentIds).toEqual([TIRE_MACHINE.id])
  })

  describe('reputation gate (Sprint 16)', () => {
    it('refuses a reputation-gated item before the tier is reached, even with unlimited cash', () => {
      const game = useGameStore()
      game.devGiveCash(WELDER.priceYen)
      expect(game.gameState.reputationTier).toBe('unknown')
      expect(game.buyEquipment(WELDER.id)).toBe(false)
      expect(game.hasEquipmentForComponent('body')).toBe(false)
    })

    it('succeeds once the required reputation tier is reached', () => {
      const game = useGameStore()
      game.devGiveCash(WELDER.priceYen)
      game.gameState = { ...game.gameState, reputationTier: 'known' }
      expect(game.buyEquipment(WELDER.id)).toBe(true)
      expect(game.hasEquipmentForComponent('body')).toBe(true)
    })
  })
})
