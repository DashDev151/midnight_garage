import { CARS, PARTS } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { decodeSave, encodeSave } from '../save/saveCodec'
import { useGameStore } from './gameStore'

/**
 * An aftermarket (non-stock) catalog part for this slot - every part fits
 * any car of the right CLASS now (Sprint 32 decision 1 drops requiredTags;
 * Sprint 53 adds the fitment-class check), so this just needs to avoid the
 * stock grade (already occupying every slot by default). Pinned to
 * `shitbox` - every car this file grants (`CARS[0]`/`CARS[1]`,
 * honda-city-e-aa/suzuki-wagon-r-ct21s) is that tier.
 */
function untaggedPartFor(carPartId: string) {
  return PARTS.find(
    (p) => p.carPartId === carPartId && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
  )!
}

describe('staged repair/install work (Sprint 18; re-based on bands, Sprint 26)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('staging and unstaging a repair cost nothing', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const cashBefore = game.cashYen

    expect(
      game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' }),
    ).toBe(true)
    expect(game.stagedActionsFor(carId)).toEqual([
      { kind: 'repair', componentId: 'body', targetBand: 'mint' },
    ])
    expect(game.cashYen).toBe(cashBefore)
    expect(game.gameState.jobs).toHaveLength(0) // nothing real yet

    game.unstageAction(carId, 'body')
    expect(game.stagedActionsFor(carId)).toEqual([])
    expect(game.cashYen).toBe(cashBefore)
  })

  it('the planned estimate sums the labour the planned work will actually cost (Sprint 63)', () => {
    const game = useGameStore()
    // A car whose body group genuinely needs repair, so a real plan exists.
    let car = game.gameState.ownedCars.at(-1)
    for (let i = 0; i < 30 && (!car || game.carDetail(car.id)!.groupBands.body === 'mint'); i++) {
      game.devGrantCar(CARS[0]!.id)
      car = game.gameState.ownedCars.at(-1)!
    }
    if (!car) throw new Error('expected a granted car needing body repair')
    const carId = car.id

    expect(game.carDetail(carId)!.plannedEstimate).toBeNull() // nothing planned yet

    const step = game.nextRepairStep(carId, 'body')!
    game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: step.targetBand })

    const estimate = game.carDetail(carId)!.plannedEstimate!
    // The estimate's planned labour equals the plan's own labour figure (the
    // same accounting confirmStagedWork uses), and rides beside the yen total.
    expect(estimate.plannedLaborSlots).toBe(step.laborSlotsRequired)
    expect(estimate.plannedLaborSlots).toBeGreaterThan(0)
    expect(estimate.plannedRepairCostYen).toBe(step.costYen)
  })

  it('refuses to stage over a component with an open job (decision 4)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    // Inject an open job directly rather than depending on this car's rolled
    // bands and today's labor budget happening to leave one incomplete.
    game.gameState = {
      ...game.gameState,
      jobs: [
        {
          id: 'job-test-body',
          carInstanceId: carId,
          kind: 'repair-zone',
          componentId: 'body',
          targetBand: 'mint',
          laborSlotsRequired: 3,
          laborSlotsSpent: 1,
        },
      ],
    }

    expect(
      game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' }),
    ).toBe(false)
  })

  it('re-staging over an already-staged component replaces it (decision 8)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const componentId = 'suspension'
    game.removePart(carId, 'dampers')
    const partA = untaggedPartFor('dampers')
    game.devGrantPart(partA.id)
    const partAInstanceId = game.gameState.partInventory.at(-1)!.id

    game.stageAction(carId, { kind: 'install', componentId, partInstanceId: partAInstanceId })
    expect(game.isPartStagedAnywhere(partAInstanceId)).toBe(true)

    // Staging a repair over the same component displaces the install stage -
    // the displaced part becomes stageable again.
    game.stageAction(carId, { kind: 'repair', componentId, targetBand: 'mint' })
    expect(game.stagedActionsFor(carId)).toEqual([
      { kind: 'repair', componentId, targetBand: 'mint' },
    ])
    expect(game.isPartStagedAnywhere(partAInstanceId)).toBe(false)
  })

  it('a part staged on one car is unavailable to stage on another until unstaged (decision 3)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    game.devGrantCar(CARS[1]?.id ?? CARS[0]!.id)
    const [carA, carB] = game.gameState.ownedCars
    const componentId = 'suspension'
    game.removePart(carA!.id, 'dampers')
    game.removePart(carB!.id, 'dampers')
    const part = untaggedPartFor('dampers')
    game.devGrantPart(part.id)
    const partInstanceId = game.gameState.partInventory.at(-1)!.id

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
    const carId = game.gameState.ownedCars[0]!.id
    game.moveCar(carId, 'service')

    const componentId = 'suspension'
    game.removePart(carId, 'dampers')
    const part = untaggedPartFor('dampers')
    game.devGrantPart(part.id)
    const partInstanceId = game.gameState.partInventory.at(-1)!.id
    game.stageAction(carId, { kind: 'install', componentId, partInstanceId })

    game.confirmCarWork(carId)

    expect(game.stagedActionsFor(carId)).toEqual([])
    expect(game.gameState.ownedCars[0]!.parts.dampers.installed?.id).toBe(partInstanceId)
    // Only the displaced stock dampers instance (dropped by removePart
    // above) is left - the confirmed install consumed the granted part.
    expect(game.gameState.partInventory.some((pi) => pi.id === partInstanceId)).toBe(false)
  })

  it('confirmCarWork starts a staged repair at tier 1 with nothing upgraded (the Sprint 13 equipment gate is retired)', () => {
    const game = useGameStore()
    // Correlated band rolls can land a group fully mint even on a rough car -
    // retry grants until the body group actually needs work.
    let car = game.gameState.ownedCars.at(-1)
    for (let i = 0; i < 30 && (!car || game.carDetail(car.id)!.groupBands.body === 'mint'); i++) {
      game.devGrantCar(CARS[0]!.id)
      car = game.gameState.ownedCars.at(-1)!
    }
    if (!car) throw new Error('expected a granted car')
    game.moveCar(car.id, 'service')
    const cashBefore = game.cashYen
    game.stageAction(car.id, { kind: 'repair', componentId: 'body', targetBand: 'mint' })

    game.confirmCarWork(car.id)

    expect(game.stagedActionsFor(car.id)).toEqual([])
    // The repair really started: the group's repair bill was charged (no
    // consumables fee since Sprint 47). No refusal path exists anymore -
    // nothing gets job-blocked.
    expect(game.cashYen).toBeLessThan(cashBefore)
    expect(game.dayLog.some((e) => e.type === 'job-blocked')).toBe(false)
  })

  it('selling the car drops its staged work (decision 7)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' })

    // Sprint 31: selling now goes through a live pending offer rather than
    // an instant roll - inject one directly (same pattern the "open job"
    // test above uses) rather than depending on the probabilistic daily draw.
    game.gameState = {
      ...game.gameState,
      carsForSale: [{ carInstanceId: carId, sinceDay: game.gameState.day }],
      pendingOffers: [{ carInstanceId: carId, buyerId: 'first-timer', priceYen: 300_000 }],
    }
    game.acceptOffer(carId)

    expect(game.gameState.stagedCarWork[carId]).toBeUndefined()
  })

  it('refuses to stage a part onto a component it does not fit (Sprint 24 fix 2)', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    // An engine-only part staged onto suspension - a real mismatch.
    const wrongPart = PARTS.find((p) => p.carPartId === 'ignitionEcu')!
    game.devGrantPart(wrongPart.id)
    const partInstanceId = game.gameState.partInventory[0]!.id

    expect(
      game.stageAction(carId, { kind: 'install', componentId: 'suspension', partInstanceId }),
    ).toBe(false)
    expect(game.stagedActionsFor(carId)).toEqual([])
  })

  it('the staged-work map survives a save round-trip', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' })

    const decoded = decodeSave(encodeSave(game.gameState))
    expect(decoded.stagedCarWork).toEqual(game.gameState.stagedCarWork)
  })
})
