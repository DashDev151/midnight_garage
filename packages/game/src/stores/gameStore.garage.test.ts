import { CARS, PARTS, type Slot } from '@midnight-garage/content'
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
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    const before = car.condition.engine
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

    expect(game.gameState.ownedCars[0]!.condition.engine).toBe(100)
    // The job is consumed once complete.
    expect(game.carDetail(car.id)!.jobs).toHaveLength(0)
  })

  it('a repeat click continues the same job for a zone, not a duplicate', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.repair(car.id, 'body')
    game.repair(car.id, 'body')
    expect(game.carDetail(car.id)!.jobs).toHaveLength(1)
  })

  it('never spends more than the daily labor slots across repairs in one day', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')
    const perDay = game.laborSlotsPerDay
    // Repair all five zones instantly — collectively far more labor than one day.
    for (const zone of ['engine', 'drivetrain', 'suspension', 'body', 'interior'] as const) {
      game.repair(car.id, zone)
    }
    // After spending today's budget, total labor spent across jobs cannot exceed it.
    const spent = game.gameState.jobs.reduce((s, j) => s + j.laborSlotsSpent, 0)
    expect(spent).toBeLessThanOrEqual(perDay)
    expect(spent).toBeGreaterThan(0)
    expect(game.laborSlotsRemainingToday).toBe(0)
  })
})

describe('garage: instant part install', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('installs a compatible part instantly, moving it to the build sheet and changing stats', () => {
    const game = useGameStore()
    // Find a real power part and a model whose tags satisfy its requiredTags.
    // Power has no upper clamp, so an install is guaranteed to move that axis.
    let pair: { partId: string; slot: Slot; modelId: string } | undefined
    for (const part of PARTS) {
      if (part.statModifiers.power <= 0) continue
      const model = CARS.find((c) => part.requiredTags.every((t) => c.tags.includes(t)))
      if (model) {
        pair = { partId: part.id, slot: part.slot, modelId: model.id }
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
    // The compatibility filter offers exactly this part for the slot.
    const offered = game.installablePartsFor(car.id, pair.slot)
    expect(offered.some((pi) => pi.id === partInstance.id)).toBe(true)

    game.install(car.id, pair.slot, partInstance.id) // a single-slot job, completes instantly

    const after = game.gameState.ownedCars[0]!
    expect(after.buildSheet[pair.slot]?.partId).toBe(pair.partId)
    expect(game.gameState.partInventory).toHaveLength(0) // consumed from inventory
    expect(game.carDetail(car.id)!.stats.power).toBeGreaterThan(powerBefore)
  })

  it('installablePartsFor excludes a slot that is already occupied', () => {
    const game = useGameStore()
    const part = PARTS.find((p) => p.requiredTags.length === 0)!
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')
    game.devGrantPart(part.id)
    const partInstance = game.gameState.partInventory[0]!
    game.install(car.id, part.slot, partInstance.id)
    // Slot now filled - a second grant of the same part is not offered for it.
    game.devGrantPart(part.id)
    expect(game.installablePartsFor(car.id, part.slot)).toHaveLength(0)
  })
})
