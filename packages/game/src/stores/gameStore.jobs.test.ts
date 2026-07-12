import { PARTS, type ServiceJob } from '@midnight-garage/content'
import {
  gradeAtLeast,
  isServiceTaskDone,
  SERVICE_JOB_ARRIVAL_DELAY_DAYS,
} from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

const PARTS_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p]))

/** End days until service-job offers appear on the board, bounded. */
function warpToOffers(game: ReturnType<typeof useGameStore>) {
  for (let i = 0; i < 20 && game.serviceJobOffers.length === 0; i++) game.endDay()
}

/**
 * A still-genuinely-unfinished repair-touching offer (Sprint 29: a job's
 * task list can mix repair and install now, so "any offer at all" is no
 * longer enough - some templates are install-only; and a randomly-rolled
 * customer car can occasionally already satisfy an easy repair task by
 * chance, which "has a repair task" alone doesn't rule out).
 */
function findUnfinishedRepairOffer(game: ReturnType<typeof useGameStore>): ServiceJob | undefined {
  return game.serviceJobOffers.find(
    (o) =>
      o.tasks.some((t) => t.action === 'repair') &&
      o.tasks.some((t) => !isServiceTaskDone(o.car, t, PARTS_BY_ID)),
  )
}

/** End days until `findUnfinishedRepairOffer` finds something, bounded. */
function warpToRepairOffer(game: ReturnType<typeof useGameStore>) {
  for (let i = 0; i < 60 && !findUnfinishedRepairOffer(game); i++) game.endDay()
}

describe('service jobs in the store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('offers are already on the board on day 1 (Sprint 10: no empty first day)', () => {
    const game = useGameStore()
    game.newGame(1)
    expect(game.serviceJobOffers.length).toBeGreaterThan(0)
  })

  it('accepting brings the customer car into the shop instantly, owning nothing', () => {
    const game = useGameStore()
    game.newGame(1)
    // Sprint 13: accepting an offer with a repair task now requires owning its equipment.
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    warpToOffers(game)
    const offer = game.serviceJobOffers[0]!
    game.acceptServiceJob(offer.id)

    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(true)
    expect(game.ownedCarCount).toBe(0)
    // The car is now workable through the normal car-detail flow.
    expect(game.carDetail(offer.car.id)?.serviceJob?.workDone).toBe(false)
  })

  it('doing the repair work then clicking Complete pays out immediately and gains reputation', () => {
    const game = useGameStore()
    game.newGame(1)
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    warpToRepairOffer(game)
    const offer = findUnfinishedRepairOffer(game)
    if (!offer) throw new Error('expected a repair-touching offer on the board')

    const repBefore = game.reputationPoints
    game.acceptServiceJob(offer.id)
    // Sprint 25 task 2: the car claims its parking slot instantly but isn't
    // actually workable until it arrives the following day.
    game.endDay()

    const carId = offer.car.id
    // The customer's car lands in parking on arrival - move it into the
    // service bay so repairs below can actually receive labor.
    game.moveCar(carId, 'service')
    let outcome: string | undefined
    for (let i = 0; i < 20; i++) {
      const view = game.carDetail(carId)?.serviceJob
      if (!view) break
      if (view.workDone) {
        outcome = game.completeServiceJob(offer.id) // immediate - no End Day involved
        break
      }
      // Work every task instantly: repair via the group-level action,
      // install by buying+installing the cheapest fitting part at grade.
      for (const task of offer.tasks) {
        const componentId = game.groupForCarPart(task.carPartId)
        if (!componentId) continue
        if (task.action === 'repair') {
          game.repair(carId, componentId)
        } else {
          // At least minGrade, not exactly - the catalog doesn't guarantee
          // an exact-grade option for every part (isServiceTaskDone itself
          // only ever requires "at least", so this mirrors real completion).
          const part = game.partsCatalog.find(
            (p) => p.carPartId === task.carPartId && gradeAtLeast(p.grade, task.minGrade),
          )
          if (part) {
            game.devGrantPart(part.id)
            const granted = game
              .installablePartsForPart(carId, task.carPartId)
              .find((pi) => pi.partId === part.id)
            if (granted) game.install(carId, componentId, granted.id, task.carPartId)
          }
        }
      }
      const after = game.carDetail(carId)?.serviceJob
      if (after?.workDone) {
        outcome = game.completeServiceJob(offer.id)
        break
      }
      game.endDay() // replenishes tomorrow's labor budget
    }

    expect(outcome).toBe('paid')
    expect(game.reputationPoints).toBeGreaterThan(repBefore)
    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(false)
    expect(game.ownedCarCount).toBe(0)
  })

  it('clicking Complete before the work is done fails the job immediately, no pay', () => {
    const game = useGameStore()
    game.newGame(1)
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    warpToRepairOffer(game)
    const offer = findUnfinishedRepairOffer(game)
    if (!offer) throw new Error('expected a repair-touching offer on the board')
    game.acceptServiceJob(offer.id)

    const cashBefore = game.cashYen
    const outcome = game.completeServiceJob(offer.id) // work not done
    expect(outcome).toBe('failed')
    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(false) // car leaves
    expect(game.cashYen).toBe(cashBefore) // no payout
  })

  it('an untouched job auto-fails at its deadline (no pay)', () => {
    const game = useGameStore()
    game.newGame(1)
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    warpToRepairOffer(game)
    const offer = findUnfinishedRepairOffer(game)
    if (!offer) throw new Error('expected a repair-touching offer on the board')
    const deadlineDays = offer.deadlineDays // Sprint 29: per-template now, not a flat constant
    game.acceptServiceJob(offer.id)

    const cashBefore = game.cashYen
    // Never touch the car; run past the deadline (counted from arrival,
    // Sprint 25 task 2 - one extra day beyond the deadline length itself).
    for (let i = 0; i <= SERVICE_JOB_ARRIVAL_DELAY_DAYS + deadlineDays; i++) {
      game.endDay()
    }

    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(false)
    expect(game.cashYen).toBeLessThanOrEqual(cashBefore) // never paid (rent may also apply)
  })

  /**
   * Sprint 25 task 2, the sprint doc's own required test: work staged
   * against an in-transit car is rejected. `moveCar`/`swapCars` get the
   * same guard - covered separately in gameStore's own move tests - this
   * is specifically the staging path.
   */
  it('staging work against an in-transit car is rejected', () => {
    const game = useGameStore()
    game.newGame(1)
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    warpToRepairOffer(game)
    const offer = findUnfinishedRepairOffer(game)
    if (!offer) throw new Error('expected a repair-touching offer on the board')
    const repairTask = offer.tasks.find((t) => t.action === 'repair')!
    const componentId = game.groupForCarPart(repairTask.carPartId)!
    game.acceptServiceJob(offer.id)

    const carId = offer.car.id
    expect(game.carDetail(carId)?.serviceJob?.arrivesOnDay).not.toBeNull()

    const staged = game.stageAction(carId, { kind: 'repair', componentId, targetBand: 'mint' })
    expect(staged).toBe(false)
    expect(game.carDetail(carId)?.stagedActions).toEqual([])

    const moved = game.moveCar(carId, 'service')
    expect(moved).toBe(false)

    // Once it actually arrives, staging works normally.
    game.endDay()
    expect(game.carDetail(carId)?.serviceJob?.arrivesOnDay).toBeNull()
    expect(game.stageAction(carId, { kind: 'repair', componentId, targetBand: 'mint' })).toBe(true)
  })
})
