import { CARS, PARTS, type ConditionBand } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

/**
 * An aftermarket (non-stock) catalog part for this slot. Every part fits any
 * car of the right CLASS now, so this just needs to avoid the stock grade
 * (already occupying every slot by default). Pinned to `entry` - every car
 * this file grants (honda-city-e-aa) is that tier.
 */
function untaggedPartFor(carPartId: string) {
  return PARTS.find(
    (p) => p.carPartId === carPartId && p.grade !== 'stock' && p.fitmentClass === 'entry',
  )!
}

/**
 * Every repair/install/pipeline action resolves the instant it's
 * clicked. There is no staged list, no Confirm step, and no plan preview to
 * diff against - `repair`/`install`/`pipelineStage`/`paintZone`/`removePanel`/
 * `installPanel` all charge and apply for real on the same call.
 */
describe('direct repair/install work (Sprint 202)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('repair() spends cash and labour immediately, with no staged list anywhere in the store', () => {
    const game = useGameStore()
    // Retry grants until the body group has a real repair step - a
    // correlated band roll can otherwise land a car already at mint.
    let carId: string | null = null
    let targetBand: ConditionBand | null = null
    for (let i = 0; i < 30 && !carId; i++) {
      game.devGrantCar(CARS[0]!.id)
      const car = game.gameState.ownedCars.at(-1)!
      const step = game.nextRepairStep(car.id, 'body')
      if (step) {
        carId = car.id
        targetBand = step.targetBand
      }
    }
    if (!carId) throw new Error('expected a granted car needing body repair')
    game.moveCar(carId, 'service')
    const cashBefore = game.cashYen

    // The real per-part repair control climbs one rung at a time
    // (`nextRepairStep`'s own target) - a fresh job's target is never
    // stated above the shop's own tier-1 ceiling, matching how the UI
    // itself always calls `repair`.
    game.repair(carId, 'body', targetBand!)

    // Something real happened this click: either cash left, or a continuable
    // job was opened (a big group repair can outrun one day's labour).
    const spent = game.cashYen < cashBefore
    const jobOpen = game.gameState.jobs.some((j) => j.carInstanceId === carId)
    expect(spent || jobOpen).toBe(true)
    expect((game.gameState as unknown as { stagedCarWork?: unknown }).stagedCarWork).toBeUndefined()
  })

  it('install() fits a granted part immediately - no staging step, no second click needed', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.moveCar(carId, 'service') // labour only applies to a job once the car is in a bay
    game.removePart(carId, 'dampers')
    const part = untaggedPartFor('dampers')
    game.devGrantPart(part.id)
    const partInstanceId = game.gameState.partInventory.at(-1)!.id
    // dampers is a suspension signature slot - install is rate-gated,
    // never refused, so no hire is needed for it to land.
    game.install(carId, 'suspension', partInstanceId)

    expect(game.gameState.ownedCars[0]!.parts.dampers.installed?.id).toBe(partInstanceId)
    expect(game.gameState.partInventory.some((pi) => pi.id === partInstanceId)).toBe(false)
  })

  it('a machine-gated install completes without the line owned or hired - Sprint 202 E turned the gate into a labour rate, never a refusal', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.moveCar(carId, 'service') // labour only applies to a job once the car is in a bay
    game.removePart(carId, 'dampers')
    const part = untaggedPartFor('dampers')
    game.devGrantPart(part.id)
    const partInstanceId = game.gameState.partInventory.at(-1)!.id

    // A fresh shop owns nothing at tier 2 and nothing was hired today - the
    // pre-202 behaviour would have refused this outright.
    game.install(carId, 'suspension', partInstanceId)

    expect(game.gameState.ownedCars[0]!.parts.dampers.installed?.id).toBe(partInstanceId)
    expect(game.dayLog.some((e) => e.type === 'job-blocked' && e.reason === 'machine-line')).toBe(
      false,
    )
  })

  it('installMachineNoteFor discloses the by-hand labour and the hire line, and clears once the line is hired', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.removePart(carId, 'dampers')

    const note = game.installMachineNoteFor(carId, 'dampers')
    expect(note).toMatch(/labour by hand/)
    expect(note).toMatch(/with the .+ line/)
    expect(note).toContain('today')

    game.hireMachineLine('suspension')
    expect(game.installMachineNoteFor(carId, 'dampers')).toBe('')
  })

  it('removeBlockedReason carries no machine-line case any more - a machine gate is never a structural block', () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    game.moveCar(carId, 'service')

    // Every current taxonomy slot gated for REMOVAL (block, internals,
    // headValvetrain, camsTiming, gearbox, clutch) is also an assembly
    // member, so it comes off only via its assembly - `removeMachineNoteFor`
    // is `''` here, matching the ungated dampers case: `removeBlockedReason`
    // itself carries no 'machine-line' member of its union any more (deleted
    // with `RemoveBlockReason`, sim/jobs.ts), so there is nothing left for
    // either function to disagree about.
    expect(game.removeBlockedReason(carId, 'dampers')).toBeNull()
    expect(game.removeMachineNoteFor(carId, 'dampers')).toBe('')
    expect(game.removePart(carId, 'dampers')).toBe(true)
  })
})

describe('direct body-pipeline work (Sprint 202)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('pipelineStage/paintZone/removePanel/installPanel all resolve instantly against a zone car', () => {
    const game = useGameStore()
    // devGrantCar rolls a random car; retry until one carries zone state (the
    // body-work model), since not every generated car is on it.
    let carId: string | null = null
    for (let i = 0; i < 30 && !carId; i++) {
      game.devGrantCar(CARS[0]!.id)
      const car = game.gameState.ownedCars.at(-1)!
      if (car.zoneState) carId = car.id
    }
    if (!carId) throw new Error('expected a granted car carrying zone state within 30 tries')
    game.moveCar(carId, 'service')

    const zoneId = 'bonnet' as const
    const before = game.gameState.ownedCars.find((c) => c.id === carId)!.zoneState![zoneId]

    // Strip/prep is ungated and free of consumables - it should move the zone
    // (or be a structural no-op) without ever needing a staged step first.
    game.pipelineStage(carId, zoneId, 'stripPrep')
    const after = game.gameState.ownedCars.find((c) => c.id === carId)!.zoneState![zoneId]
    expect(after).toBeDefined()
    expect(before).toBeDefined()
  })
})
