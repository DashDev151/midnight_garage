import { SERVICE_JOB_DEADLINE_DAYS } from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

/** End days until service-job offers appear (first weekly board), bounded. */
function warpToOffers(game: ReturnType<typeof useGameStore>) {
  for (let i = 0; i < 20 && game.serviceJobOffers.length === 0; i++) game.endDay()
}

/**
 * End days (crossing weekly refreshes as needed) until a repair-kind offer
 * appears. Sprint 11's pool-based generation (12 types, ~5 repair-zone / 7
 * install-slot) means a single day's small batch can legitimately contain
 * zero repair offers — unlike the old 8-template system's repair majority,
 * `warpToOffers`'s "any offer at all" check is no longer enough.
 */
function warpToRepairOffer(game: ReturnType<typeof useGameStore>) {
  for (let i = 0; i < 30 && !game.serviceJobOffers.some((o) => o.work.kind === 'repair'); i++) {
    game.endDay()
  }
}

describe('service jobs in the store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('offers are already on the board on day 1 (Sprint 10: no empty first week)', () => {
    const game = useGameStore()
    game.newGame(1)
    expect(game.serviceJobOffers.length).toBeGreaterThan(0)
  })

  it('accepting brings the customer car into the shop instantly, owning nothing', () => {
    const game = useGameStore()
    game.newGame(1)
    warpToOffers(game)
    const offer = game.serviceJobOffers[0]!
    game.acceptServiceJob(offer.id)

    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(true)
    expect(game.ownedCarCount).toBe(0)
    // The car is now workable through the normal car-detail flow.
    expect(game.carDetail(offer.car.id)?.serviceJob?.workDone).toBe(false)
  })

  it('doing the repair then clicking Complete pays out immediately and gains reputation', () => {
    const game = useGameStore()
    game.newGame(1)
    warpToRepairOffer(game)
    const offer = game.serviceJobOffers.find((o) => o.work.kind === 'repair')
    if (!offer) throw new Error('expected a repair offer on the board')
    const zone = offer.work.kind === 'repair' ? offer.work.zone : 'engine'

    const repBefore = game.reputationPoints
    game.acceptServiceJob(offer.id)

    const carId = offer.car.id
    // The customer's car lands in parking on acceptance — move it into the
    // service bay so repairs below can actually receive labor.
    game.moveCar(carId, 'service')
    let outcome: string | undefined
    for (let i = 0; i < 12; i++) {
      const view = game.carDetail(carId)?.serviceJob
      if (!view) break
      if (view.workDone) {
        outcome = game.completeServiceJob(offer.id) // immediate — no End Day involved
        break
      }
      game.repair(carId, zone) // instant — spends today's labor right now
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
    warpToRepairOffer(game)
    const offer = game.serviceJobOffers.find((o) => o.work.kind === 'repair')
    if (!offer) throw new Error('expected a repair offer on the board')
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
    warpToRepairOffer(game)
    const offer = game.serviceJobOffers.find((o) => o.work.kind === 'repair')
    if (!offer) throw new Error('expected a repair offer on the board')
    game.acceptServiceJob(offer.id)

    const cashBefore = game.cashYen
    // Never touch the car; run past the deadline.
    for (let i = 0; i <= SERVICE_JOB_DEADLINE_DAYS; i++) game.endDay()

    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(false)
    expect(game.cashYen).toBeLessThanOrEqual(cashBefore) // never paid (rent may also apply)
  })
})
