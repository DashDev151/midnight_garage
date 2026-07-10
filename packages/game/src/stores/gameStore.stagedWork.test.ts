import { CARS, PARTS } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { decodeSave, encodeSave } from '../save/saveCodec'
import { useGameStore } from './gameStore'

/** A part with no required tags always fits any car — avoids incidental tag mismatches. */
function untaggedPartFor(componentId: string) {
  return PARTS.find((p) => p.componentId === componentId && p.requiredTags.length === 0)!
}

describe('staged repair/install work (Sprint 18)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('staging and unstaging a repair cost nothing', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    const carId = game.gameState.ownedCars[0]!.id
    const cashBefore = game.cashYen

    expect(game.stageAction(carId, { kind: 'repair', componentId: 'body' })).toBe(true)
    expect(game.stagedActionsFor(carId)).toEqual([{ kind: 'repair', componentId: 'body' }])
    expect(game.cashYen).toBe(cashBefore)
    expect(game.gameState.jobs).toHaveLength(0) // nothing real yet

    game.unstageAction(carId, 'body')
    expect(game.stagedActionsFor(carId)).toEqual([])
    expect(game.cashYen).toBe(cashBefore)
  })

  it('refuses to stage over a component with an open job (decision 4)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    // Inject an open job directly rather than depending on this car's rolled
    // condition and today's labor budget happening to leave one incomplete.
    game.gameState = {
      ...game.gameState,
      jobs: [
        {
          id: 'job-test-body',
          carInstanceId: carId,
          kind: 'repair-zone',
          componentId: 'body',
          laborSlotsRequired: 3,
          laborSlotsSpent: 1,
        },
      ],
    }

    expect(game.stageAction(carId, { kind: 'repair', componentId: 'body' })).toBe(false)
  })

  it('re-staging over an already-staged component replaces it (decision 8)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const componentId = 'suspension'
    const partA = untaggedPartFor(componentId)
    game.devGrantPart(partA.id)
    const partAInstanceId = game.gameState.partInventory[0]!.id

    game.stageAction(carId, { kind: 'install', componentId, partInstanceId: partAInstanceId })
    expect(game.isPartStagedAnywhere(partAInstanceId)).toBe(true)

    // Staging a repair over the same component displaces the install stage —
    // the displaced part becomes stageable again.
    game.stageAction(carId, { kind: 'repair', componentId })
    expect(game.stagedActionsFor(carId)).toEqual([{ kind: 'repair', componentId }])
    expect(game.isPartStagedAnywhere(partAInstanceId)).toBe(false)
  })

  it('a part staged on one car is unavailable to stage on another until unstaged (decision 3)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    game.devGrantCar(CARS[1]?.id ?? CARS[0]!.id)
    const [carA, carB] = game.gameState.ownedCars
    const componentId = 'suspension'
    const part = untaggedPartFor(componentId)
    game.devGrantPart(part.id)
    const partInstanceId = game.gameState.partInventory[0]!.id

    expect(game.stageAction(carA!.id, { kind: 'install', componentId, partInstanceId })).toBe(true)
    expect(game.stageableParts.some((p) => p.instance.id === partInstanceId)).toBe(false)
    expect(game.stageAction(carB!.id, { kind: 'install', componentId, partInstanceId })).toBe(false)

    game.unstageAction(carA!.id, componentId)
    expect(game.stageableParts.some((p) => p.instance.id === partInstanceId)).toBe(true)
    expect(game.stageAction(carB!.id, { kind: 'install', componentId, partInstanceId })).toBe(true)
  })

  it('confirmCarWork resolves every staged action through the real job/labor system, then clears the list', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.moveCar(carId, 'service')

    const componentId = 'suspension'
    const part = untaggedPartFor(componentId)
    game.devGrantPart(part.id)
    const partInstanceId = game.gameState.partInventory[0]!.id
    game.stageAction(carId, { kind: 'install', componentId, partInstanceId })

    game.confirmCarWork(carId)

    expect(game.stagedActionsFor(carId)).toEqual([])
    expect(game.gameState.ownedCars[0]!.components[componentId].installed?.id).toBe(partInstanceId)
    expect(game.gameState.partInventory).toHaveLength(0)
  })

  it('confirmCarWork still refuses a staged repair without the equipment (Sprint 13 gate)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id) // no equipment granted
    const carId = game.gameState.ownedCars[0]!.id
    game.moveCar(carId, 'service')
    game.stageAction(carId, { kind: 'repair', componentId: 'body' })

    game.confirmCarWork(carId)

    expect(game.stagedActionsFor(carId)).toEqual([])
    expect(game.gameState.jobs).toHaveLength(0)
    expect(
      game.dayLog.some((e) => e.type === 'job-blocked' && e.reason === 'equipment-missing'),
    ).toBe(true)
  })

  it('selling the car drops its staged work (decision 7)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.stageAction(carId, { kind: 'repair', componentId: 'body' })

    game.sellWalkIn(carId)

    expect(game.gameState.stagedCarWork[carId]).toBeUndefined()
  })

  it('the staged-work map survives a save round-trip', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.stageAction(carId, { kind: 'repair', componentId: 'body' })

    const decoded = decodeSave(encodeSave(game.gameState))
    expect(decoded.stagedCarWork).toEqual(game.gameState.stagedCarWork)
  })
})
