import { CARS, PARTS, type CarPartId, type ComponentId } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

/**
 * The Sprint 05 garage logic, updated for Sprint 11's instant actions: repair
 * and install resolve the moment they're clicked, spending whatever labor is
 * available right now. Sprint 26 re-based on bands: a "zone" is now a group
 * of real parts, and repair climbs every non-mint, non-scrap part in it to
 * the target band (mint by default) rather than lifting one flat percent.
 * These assert real outcomes (a group actually reaches mint, stats actually
 * change, labor is actually capped), not just that methods run.
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

  it('repairing completes and lifts the group to mint, possibly over several days', () => {
    const game = useGameStore()
    // Sprint 36: no ownership gate exists anymore - max every line's tier so
    // this test keeps its old all-equipment pacing (the fastest repair
    // level), staying a test of completion mechanics rather than of tier-1
    // throughput against the 20-day loop cap below.
    for (const line of game.toolLineViews) game.devSetToolTier(line.componentId, 3)
    // Correlated band rolls (Sprint 12/26) can occasionally land a group
    // fully mint even on a "rough" car - retry grants until the engine
    // group specifically needs work, since that's what this test exercises.
    let car = game.gameState.ownedCars.at(-1)
    for (let i = 0; i < 30 && (!car || game.carDetail(car.id)!.groupBands.engine === 'mint'); i++) {
      game.devGrantCar(CARS[0]!.id)
      car = game.gameState.ownedCars.at(-1)!
    }
    if (!car) throw new Error('expected a granted car')
    expect(game.carDetail(car.id)!.groupBands.engine).not.toBe('mint') // generated cars are rough

    // A dev-granted car lands in parking like any real acquisition - labor
    // only reaches a car in the service bay.
    game.moveCar(car.id, 'service')
    game.repair(car.id, 'engine')

    // Keep ending days and re-issuing the repair click until the group
    // clears mint or we've clearly exceeded any reasonable career length -
    // a real regression (never finishing) fails loudly instead of hanging.
    for (let day = 0; day < 20 && game.carDetail(car.id)!.groupBands.engine !== 'mint'; day++) {
      game.endDay()
      game.repair(car.id, 'engine')
    }

    expect(game.carDetail(car.id)!.groupBands.engine).toBe('mint')
    // The job is consumed once complete.
    expect(game.carDetail(car.id)!.jobs).toHaveLength(0)
  })

  it('a repeat click continues the same job for a group, not a duplicate', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.repair(car.id, 'body')
    game.repair(car.id, 'body')
    expect(game.carDetail(car.id)!.jobs.length).toBeLessThanOrEqual(1)
  })

  it('never spends more than the daily labor slots across repairs in one day', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')
    const perDay = game.laborSlotsPerDay
    // Repair every real group instantly - collectively far more labor than one day.
    for (const componentId of ['engine', 'drivetrain', 'suspension', 'body', 'interior'] as const) {
      game.repair(car.id, componentId)
    }
    expect(game.gameState.laborSlotsSpentToday).toBeLessThanOrEqual(perDay)
    expect(game.laborSlotsRemainingToday).toBeGreaterThanOrEqual(0)
  })
})

describe('garage: instant part install', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('installs a compatible part instantly, moving it to the build sheet and changing stats', () => {
    const game = useGameStore()
    // Find a real power part and a model whose tags satisfy its requiredTags.
    // Power has no upper clamp, so an install is guaranteed to move that axis.
    let pair:
      | { partId: string; componentId: ComponentId; carPartId: CarPartId; modelId: string }
      | undefined
    for (const part of PARTS) {
      if (part.statModifiers.power <= 0) continue
      const model = CARS.find((c) => part.requiredTags.every((t) => c.tags.includes(t)))
      const componentId = game.groupForCarPart(part.carPartId)
      if (model && componentId) {
        pair = { partId: part.id, componentId, carPartId: part.carPartId, modelId: model.id }
        break
      }
    }
    if (!pair) throw new Error('seed content has no compatible power part/model pair')

    game.devGrantCar(pair.modelId)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')
    // Sprint 32: every slot starts filled with a stock part by default -
    // empty this one first so the group-level install has somewhere to land.
    game.removePart(car.id, pair.carPartId)
    game.devGrantPart(pair.partId)
    const partInstance = game.gameState.partInventory.at(-1)!

    const powerBefore = game.carDetail(car.id)!.stats.power
    // The compatibility filter offers exactly this part for its group.
    const offered = game.installablePartsFor(car.id, pair.componentId)
    expect(offered.some((pi) => pi.id === partInstance.id)).toBe(true)

    game.install(car.id, pair.componentId, partInstance.id) // a single-part job, completes instantly

    const after = game.gameState.ownedCars[0]!
    expect(after.parts[pair.carPartId].installed?.partId).toBe(pair.partId)
    // Consumed from inventory - only the displaced stock part (dropped by
    // removePart above) is left.
    expect(game.gameState.partInventory.some((pi) => pi.id === partInstance.id)).toBe(false)
    expect(game.carDetail(car.id)!.stats.power).toBeGreaterThan(powerBefore)
  })

  it('installablePartsFor is empty while every slot in the group is occupied, and offers a fitting part once one opens up', () => {
    const game = useGameStore()
    const part = PARTS.find((p) => p.carPartId === 'seats' && p.grade !== 'stock')!
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    game.moveCar(car.id, 'service')
    // Sprint 32: generation fills every slot by default - the whole
    // `interior` group (seats, dashGauges) starts fully occupied.
    expect(game.installablePartsFor(car.id, 'interior')).toEqual([])

    game.removePart(car.id, 'seats')
    game.devGrantPart(part.id)
    const partInstance = game.gameState.partInventory.at(-1)!
    // `seats` is open again - the group as a whole now accepts a fitting install.
    expect(
      game.installablePartsFor(car.id, 'interior').some((pi) => pi.id === partInstance.id),
    ).toBe(true)

    game.install(car.id, 'interior', partInstance.id)
    // Filled again - `dashGauges` is still occupied too, so the group is
    // fully occupied once more.
    expect(game.installablePartsFor(car.id, 'interior')).toEqual([])
  })
})
