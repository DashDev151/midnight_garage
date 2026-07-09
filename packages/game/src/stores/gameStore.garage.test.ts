import { CARS, PARTS, type ComponentId } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { repairLaborSlotsFor } from '../constants'
import { useGameStore } from './gameStore'

/**
 * The Sprint 05 garage logic, updated for Sprint 11's instant actions: repair
 * and install resolve the moment they're clicked, spending whatever labor is
 * available right now. These assert real outcomes (a zone actually reaches
 * 100, stats actually change, labor is actually capped), not just that
 * methods run.
 */
describe('garage: grant + detail', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('devGrantCar adds an owned car surfaced with model, name, and stats', () => {
    const game = useGameStore()
    expect(game.ownedCarCount).toBe(0)
    game.devGrantCar(CARS[0]!.id)
    expect(game.ownedCarCount).toBe(1)
    const detailed = game.carsDetailed[0]!
    expect(detailed.model.id).toBe(CARS[0]!.id)
    expect(detailed.displayName.length).toBeGreaterThan(0)
    // Derived stats are present and finite for a granted car.
    expect(Number.isFinite(detailed.stats.power)).toBe(true)
    expect(detailed.stats.authenticity).toBeGreaterThanOrEqual(0)
  })

  it('carDetail returns undefined for a car that is not owned', () => {
    const game = useGameStore()
    expect(game.carDetail('nope')).toBeUndefined()
  })
})

describe('garage: instant repair and labor', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('repairing completes and lifts the zone to 100 over the right number of days', () => {
    const game = useGameStore()
    // Sprint 13: repair now requires owning the component's equipment.
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    // Correlated condition rolls (Sprint 12) can occasionally clamp a
    // component to 100 even on a "rough" car — retry grants until the
    // engine specifically needs work, since that's what this test exercises.
    let car = game.gameState.ownedCars.at(-1)
    for (let i = 0; i < 30 && (!car || car.components.engine.condition >= 100); i++) {
      game.devGrantCar(CARS[0]!.id)
      car = game.gameState.ownedCars.at(-1)!
    }
    if (!car) throw new Error('expected a granted car')
    const before = car.components.engine.condition
    expect(before).toBeLessThan(100) // generated cars are rough

    const needed = repairLaborSlotsFor(before)
    const days = Math.ceil(needed / game.laborSlotsPerDay)

    // A dev-granted car lands in parking like any real acquisition — labor
    // only reaches a car in the service bay.
    game.moveCar(car.id, 'service')
    game.repair(car.id, 'engine')

    if (days === 1) {
      // Mild-enough damage finishes in the very first click — the job is
      // already gone, same as any other same-day completion.
      expect(game.carDetail(car.id)!.jobs).toHaveLength(0)
    } else {
      const detail = game.carDetail(car.id)!
      expect(detail.jobs).toHaveLength(1)
      expect(detail.jobs[0]!.laborSlotsRequired).toBe(needed)
      for (let i = 1; i < days; i++) {
        game.endDay() // replenish tomorrow's labor
        game.repair(car.id, 'engine') // continue the same job
      }
    }

    expect(game.carDetail(car.id)!.car.components.engine.condition).toBe(100)
    // The job is consumed once complete.
    expect(game.carDetail(car.id)!.jobs).toHaveLength(0)
  })

  it('a repeat click continues the same job for a zone, not a duplicate', () => {
    const game = useGameStore()
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.repair(car.id, 'body')
    game.repair(car.id, 'body')
    expect(game.carDetail(car.id)!.jobs).toHaveLength(1)
  })

  it('never spends more than the daily labor slots across repairs in one day', () => {
    const game = useGameStore()
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')
    const perDay = game.laborSlotsPerDay
    // Repair all five repairable components instantly — collectively far more labor than one day.
    for (const componentId of ['engine', 'drivetrain', 'suspension', 'body', 'interior'] as const) {
      game.repair(car.id, componentId)
    }
    // The live daily counter is the authoritative spend — reconstructing it
    // from remaining *open* jobs undercounts whenever a repair completes and
    // its job is removed the same day (correlated condition rolls, Sprint
    // 12, make same-cost repairs across components common).
    expect(game.gameState.laborSlotsSpentToday).toBe(perDay)
    expect(game.laborSlotsRemainingToday).toBe(0)
  })
})

describe('garage: instant part install', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('installs a compatible part instantly, moving it to the build sheet and changing stats', () => {
    const game = useGameStore()
    // Find a real power part and a model whose tags satisfy its requiredTags.
    // Power has no upper clamp, so an install is guaranteed to move that axis.
    let pair: { partId: string; componentId: ComponentId; modelId: string } | undefined
    for (const part of PARTS) {
      if (part.statModifiers.power <= 0) continue
      const model = CARS.find((c) => part.requiredTags.every((t) => c.tags.includes(t)))
      if (model) {
        pair = { partId: part.id, componentId: part.componentId, modelId: model.id }
        break
      }
    }
    if (!pair) throw new Error('seed content has no compatible power part/model pair')

    game.devGrantCar(pair.modelId)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')
    game.devGrantPart(pair.partId)
    const partInstance = game.gameState.partInventory[0]!

    const powerBefore = game.carDetail(car.id)!.stats.power
    // The compatibility filter offers exactly this part for the component.
    const offered = game.installablePartsFor(car.id, pair.componentId)
    expect(offered.some((pi) => pi.id === partInstance.id)).toBe(true)

    game.install(car.id, pair.componentId, partInstance.id) // a single-component job, completes instantly

    const after = game.gameState.ownedCars[0]!
    expect(after.components[pair.componentId].installed?.partId).toBe(pair.partId)
    expect(game.gameState.partInventory).toHaveLength(0) // consumed from inventory
    expect(game.carDetail(car.id)!.stats.power).toBeGreaterThan(powerBefore)
  })

  it('installablePartsFor excludes a component that is already occupied', () => {
    const game = useGameStore()
    const part = PARTS.find((p) => p.requiredTags.length === 0)!
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')
    game.devGrantPart(part.id)
    const partInstance = game.gameState.partInventory[0]!
    game.install(car.id, part.componentId, partInstance.id)
    // Component now filled - a second grant of the same part is not offered for it.
    game.devGrantPart(part.id)
    expect(game.installablePartsFor(car.id, part.componentId)).toHaveLength(0)
  })
})
