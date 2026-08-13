import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  TOOL_LINES,
  type ServiceJob,
} from '@midnight-garage/content'
import {
  buildSimContext,
  gradeAtLeast,
  isBodyDerivedPart,
  isServiceTaskDone,
  SERVICE_JOB_ARRIVAL_DELAY_DAYS,
} from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'

// Mirrors the store's own SimContext (gameStore.ts) - `isServiceTaskDone`
// needs the full context, not just a parts lookup.
const context = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
  TOOL_LINES,
  ECONOMY,
)

/**
 * A still-genuinely-unfinished offer. A job's task list can mix repair and
 * install now, so "any offer at all" is no longer enough - some templates are
 * install-only. A randomly-rolled customer car can occasionally already satisfy
 * an easy repair task by chance; the condition curve skews generated cars toward
 * better condition, so "has a repair task" alone does not rule this out.
 */
function findUnfinishedOffer(game: ReturnType<typeof useGameStore>): ServiceJob | undefined {
  return game.serviceJobOffers.find((o) =>
    o.tasks.some((t) => !isServiceTaskDone(o.car, t, context)),
  )
}

/**
 * A still-genuinely-unfinished offer EVERY task of which the work loop below
 * can actually perform (same "already satisfied by chance" caveat as
 * `findUnfinishedOffer`), and at least one of them repair-shaped - the task
 * shape is `requirement`-based, so "repair-shaped" means "no `minGrade`".
 *
 * The loop knows three verbs: buy-and-install for a graded task, the on-car
 * group `repair()` for a band-only task on a part that never comes off, and the
 * bench route (pull it, carry it to the workshop floor, recondition it, refit
 * it) for a band-only task on a removable one. `bodywork` and `paint` are out
 * either way: their band is DERIVED from the car's zone state, so direct repair
 * refuses them and that work goes through the zone pipeline's own staged
 * stages, which is real and tested elsewhere but not what this
 * completion-and-payout test drives.
 */
function loopCanFinishTask(job: ServiceJob, task: ServiceJob['tasks'][number]): boolean {
  if (task.requirement.minGrade) return true // the buy-and-install path
  const carPartId = task.requirement.carPartId
  const entry = context.partsTaxonomyById[carPartId]
  if (!entry || !entry.repairable) return false
  if (job.car.zoneState && isBodyDerivedPart(carPartId)) return false
  if (entry.removable === false) return true // repaired in place
  // Bench work: the loop can pull it and put it back only if nothing sits on
  // top of it and it is not worked as part of an assembly.
  return (
    entry.blockedBy.length === 0 && !context.assemblies.some((a) => a.members.includes(carPartId))
  )
}

function findUnfinishedRepairOffer(game: ReturnType<typeof useGameStore>): ServiceJob | undefined {
  return game.serviceJobOffers.find(
    (o) =>
      o.tasks.every((t) => loopCanFinishTask(o, t)) &&
      o.tasks.some((t) => !t.requirement.minGrade) &&
      o.tasks.some((t) => !isServiceTaskDone(o.car, t, context)),
  )
}

/** End days until `findUnfinishedOffer` finds something, bounded. */
function warpToUnfinishedOffer(game: ReturnType<typeof useGameStore>) {
  for (let i = 0; i < 20 && !findUnfinishedOffer(game); i++) game.endDay()
}

/** End days until `findUnfinishedRepairOffer` finds something, bounded. */
function warpToRepairOffer(game: ReturnType<typeof useGameStore>) {
  for (let i = 0; i < 60 && !findUnfinishedRepairOffer(game); i++) game.endDay()
}

describe('service jobs in the store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /**
   * A new career opens in open play (no tutorial career), so the
   * normal day-1 job batch is on the board from the start.
   */
  it('the board carries the normal job batch on day 1 of a new career', () => {
    const game = useGameStore()
    game.newGame(1)
    expect(game.serviceJobOffers.length).toBeGreaterThan(0)
  })

  it('accepting brings the customer car into the shop instantly, owning nothing', () => {
    const game = useGameStore()
    game.newGame(1)
    // Nothing gates acceptance at tier 1 - every shipped template defaults to
    // minToolTier 1, so no tool setup is needed here.
    warpToUnfinishedOffer(game)
    const offer = findUnfinishedOffer(game)
    if (!offer) throw new Error('expected an unfinished offer on the board')
    game.acceptServiceJob(offer.id)

    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(true)
    expect(game.ownedCarCount).toBe(0)
    // The car is now workable through the normal car-detail flow.
    expect(game.carDetail(offer.car.id)?.serviceJob?.workDone).toBe(false)
  })

  it('doing the repair work then clicking Complete pays out immediately and gains reputation', () => {
    const game = useGameStore()
    game.newGame(1)
    // Own every shop so the work loop below keeps its all-equipment pacing
    // (fastest repair level) inside the 20-day cap - this test is about
    // completion plus payout, not tier-1 throughput.
    for (const shop of game.toolShopViews) game.devSetToolShopOwned(shop.id, true)
    warpToRepairOffer(game)
    const offer = findUnfinishedRepairOffer(game)
    if (!offer) throw new Error('expected a repair-touching offer on the board')

    const repBefore = game.reputationPoints
    game.acceptServiceJob(offer.id)
    // The car claims its parking slot instantly but is not actually workable
    // until it arrives the following day.
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
        const { carPartId, minGrade } = task.requirement
        const componentId = game.groupForCarPart(carPartId)
        if (!componentId) continue
        if (!minGrade) {
          if (context.partsTaxonomyById[carPartId]?.removable === false) {
            game.repair(carId, componentId)
          } else {
            // Every removable part is bench work: pull it into the warehouse,
            // carry it to the workshop floor, climb it a rung at a time, and
            // put it back on the car.
            game.removePart(carId, carPartId)
            const loose = game.gameState.partInventory.at(-1)
            if (loose) {
              game.gameState = { ...game.gameState, workbenchPartId: loose.id }
              for (let rung = 0; rung < 4; rung++) {
                const step = game.nextReconditionStep(loose.id)
                if (!step) break
                const before = game.gameState.partInventory.find((p) => p.id === loose.id)?.band
                game.reconditionPart(loose.id, step.targetBand)
                const after = game.gameState.partInventory.find((p) => p.id === loose.id)?.band
                if (after === before) break // out of labour today
              }
              game.gameState = { ...game.gameState, workbenchPartId: null }
              game.install(carId, componentId, loose.id, carPartId)
            }
          }
        } else {
          // At least minGrade, not exactly - the catalog doesn't guarantee
          // an exact-grade option for every part (isServiceTaskDone itself
          // only ever requires "at least", so this mirrors real completion).
          const part = game.partsCatalog.find(
            (p) => p.carPartId === carPartId && gradeAtLeast(p.grade, minGrade),
          )
          if (part) {
            game.devGrantPart(part.id)
            const granted = game
              .installablePartsForPart(carId, carPartId)
              .find((pi) => pi.partId === part.id)
            if (granted) game.install(carId, componentId, granted.id, carPartId)
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
    // The completion report reads real spend off the job's own ledger. This
    // career did real (charged) repair/install work, so at least one of the two
    // cost lines should be a real, non-zero number, and the net profit is
    // exactly payout minus what was actually spent.
    const result = game.lastJobResult
    expect(result?.outcome).toBe('paid')
    expect((result?.repairCostYen ?? 0) + (result?.partsCostYen ?? 0)).toBeGreaterThan(0)
    expect(result?.netProfitYen).toBe(
      (result?.payoutYen ?? 0) - (result?.repairCostYen ?? 0) - (result?.partsCostYen ?? 0),
    )
  })

  it('clicking Complete before the work is done fails the job immediately, no pay', () => {
    const game = useGameStore()
    game.newGame(1)
    warpToRepairOffer(game)
    const offer = findUnfinishedRepairOffer(game)
    if (!offer) throw new Error('expected a repair-touching offer on the board')
    game.acceptServiceJob(offer.id)
    // Let the car actually arrive first. This test is about "work not done,"
    // not "car not here yet" (that is the in-transit guard's own test below).
    // completeServiceJob now correctly refuses the latter rather than silently
    // failing the job.
    game.endDay()

    const cashBefore = game.cashYen
    const outcome = game.completeServiceJob(offer.id) // work not done
    expect(outcome).toBe('failed')
    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(false) // car leaves
    expect(game.cashYen).toBe(cashBefore) // no payout
  })

  /**
   * `completeServiceJob` refuses (no state change) while the customer's car is
   * still in transit. This is unreachable through the real UI (the Complete Job
   * button only renders once `inTransit` is false), but a direct store call
   * must still be safe.
   */
  it('clicking Complete before the car has even arrived refuses, no-op (the in-transit guard)', () => {
    const game = useGameStore()
    game.newGame(1)
    warpToRepairOffer(game)
    const offer = findUnfinishedRepairOffer(game)
    if (!offer) throw new Error('expected a repair-touching offer on the board')
    game.acceptServiceJob(offer.id)
    expect(game.carDetail(offer.car.id)?.serviceJob?.inTransit).toBe(true)

    const cashBefore = game.cashYen
    const outcome = game.completeServiceJob(offer.id)
    expect(outcome).toBe('in-transit')
    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(true) // still there
    expect(game.cashYen).toBe(cashBefore)
  })

  it('an untouched job auto-fails at its deadline (no pay)', () => {
    const game = useGameStore()
    game.newGame(1)
    warpToRepairOffer(game)
    const offer = findUnfinishedRepairOffer(game)
    if (!offer) throw new Error('expected a repair-touching offer on the board')
    const deadlineDays = offer.deadlineDays // per-template, not a flat constant
    game.acceptServiceJob(offer.id)

    const cashBefore = game.cashYen
    // Never touch the car; run past the deadline (counted from arrival,
    // one extra day beyond the deadline length itself).
    for (let i = 0; i <= SERVICE_JOB_ARRIVAL_DELAY_DAYS + deadlineDays; i++) {
      game.endDay()
    }

    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(false)
    expect(game.cashYen).toBeLessThanOrEqual(cashBefore) // never paid (rent may also apply)
  })

  /**
   * Work staged
   * against an in-transit car is rejected. `moveCar`/`swapCars` get the
   * same guard - covered separately in gameStore's own move tests - this
   * is specifically the staging path.
   */
  it('staging work against an in-transit car is rejected', () => {
    const game = useGameStore()
    game.newGame(1)
    warpToRepairOffer(game)
    const offer = findUnfinishedRepairOffer(game)
    if (!offer) throw new Error('expected a repair-touching offer on the board')
    const repairTask = offer.tasks.find((t) => !t.requirement.minGrade)!
    const componentId = game.groupForCarPart(repairTask.requirement.carPartId)!
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
