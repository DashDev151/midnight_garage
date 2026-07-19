import {
  BUYERS,
  CARS,
  ECONOMY,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  SPECIALTY_COPY,
  TOOL_LINES,
  type ServiceJob,
} from '@midnight-garage/content'
import {
  buildSimContext,
  gradeAtLeast,
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
 * A still-genuinely-unfinished offer (Sprint 29: a job's task list can mix
 * repair and install now, so "any offer at all" is no longer enough - some
 * templates are install-only; and a randomly-rolled customer car can
 * occasionally already satisfy an easy repair task by chance - more often
 * still since Sprint 33's age-aware condition curve skews generated cars
 * toward better condition - which "has a repair task" alone doesn't rule
 * out).
 */
function findUnfinishedOffer(game: ReturnType<typeof useGameStore>): ServiceJob | undefined {
  return game.serviceJobOffers.find((o) =>
    o.tasks.some((t) => !isServiceTaskDone(o.car, t, context)),
  )
}

/**
 * A still-genuinely-unfinished repair-touching offer (same caveat as
 * `findUnfinishedOffer`, narrowed to a band-only task specifically - Sprint
 * 72 collapsed the old `action: 'repair'|'install'` split into one
 * `requirement`-based shape, so "repair-shaped" now means "no `minGrade`").
 * Sprint 73: also narrowed to a SURFACE-depth part - `warpToRepairOffer`'s
 * own work loop only knows the simple on-car group `repair()` verb, which
 * Sprint 71's bench-only rule refuses for a bolt-on/buried slot (that needs
 * the separate remove/recondition/reinstall flow instead, out of scope for
 * this completion-flow test). Before this sprint's own generation change
 * (an extra symptom-count roll per generated car, shifting every subsequent
 * random draw) the RNG stream never happened to hand this test a
 * buried-part template; narrowing the search directly is more robust than
 * depending on which offer a given seed happens to produce.
 */
function findUnfinishedRepairOffer(game: ReturnType<typeof useGameStore>): ServiceJob | undefined {
  return game.serviceJobOffers.find(
    (o) =>
      o.tasks.some(
        (t) =>
          !t.requirement.minGrade &&
          context.partsTaxonomyById[t.requirement.carPartId]?.depthClass === 'surface',
      ) && o.tasks.some((t) => !isServiceTaskDone(o.car, t, context)),
  )
}

/** End days until `findUnfinishedOffer` finds something, bounded. Sprint 95
 * (the radial-offer gate): a fresh career's board is Yuki-only while the
 * tutorial runs, so both warps skip the walkthrough first - the gate lifts at
 * the next generation point, which the End Day loop then reaches. */
function warpToUnfinishedOffer(game: ReturnType<typeof useGameStore>) {
  game.skipTutorial()
  for (let i = 0; i < 20 && !findUnfinishedOffer(game); i++) game.endDay()
}

/** End days until `findUnfinishedRepairOffer` finds something, bounded. */
function warpToRepairOffer(game: ReturnType<typeof useGameStore>) {
  game.skipTutorial()
  for (let i = 0; i < 60 && !findUnfinishedRepairOffer(game); i++) game.endDay()
}

describe('service jobs in the store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /**
   * Sprint 95 (directive 17 case (a)): this used to pin day-1 offers (Sprint
   * 10's "no empty first day"). A fresh tutorial career now deliberately
   * opens Yuki-only, so the correct behaviour is a gated day 1 and offers
   * resuming once the walkthrough is skipped. Sprint 10's original guarantee
   * lives on for non-tutorial careers in the sim's own tests
   * (`packages/sim/tests/tutorialIsolation.test.ts`).
   */
  it('the board is Yuki-only on day 1 of a tutorial career; skipping brings offers back', () => {
    const game = useGameStore()
    game.newGame(1)
    expect(game.serviceJobOffers.length).toBe(0)
    game.skipTutorial()
    for (let i = 0; i < 20 && game.serviceJobOffers.length === 0; i++) game.endDay()
    expect(game.serviceJobOffers.length).toBeGreaterThan(0)
  })

  it('accepting brings the customer car into the shop instantly, owning nothing', () => {
    const game = useGameStore()
    game.newGame(1)
    // Sprint 36: nothing gates acceptance at tier 1 - every shipped template
    // defaults to minToolTier 1, so no tool setup is needed here.
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
    // Sprint 36: max every tool line so the work loop below keeps its old
    // all-equipment pacing (fastest repair level) inside the 20-day cap -
    // this test is about completion + payout, not tier-1 throughput.
    for (const line of game.toolLineViews) game.devSetToolTier(line.componentId, 3)
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
        const { carPartId, minGrade } = task.requirement
        const componentId = game.groupForCarPart(carPartId)
        if (!componentId) continue
        if (!minGrade) {
          game.repair(carId, componentId)
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
    // Sprint 57: the completion report reads real spend off the job's own
    // ledger - this career did real (charged) repair/install work, so at
    // least one of the two cost lines should be a real, non-zero number,
    // and the net profit is exactly payout minus what was actually spent.
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
    // Sprint 40: let the car actually arrive first - this test is about
    // "work not done," not "car not here yet" (that's the in-transit guard's
    // own test below), and completeServiceJob now correctly refuses the
    // latter rather than silently failing the job.
    game.endDay()

    const cashBefore = game.cashYen
    const outcome = game.completeServiceJob(offer.id) // work not done
    expect(outcome).toBe('failed')
    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(false) // car leaves
    expect(game.cashYen).toBe(cashBefore) // no payout
  })

  /**
   * Sprint 40 defense in depth: `completeServiceJob` refuses (no state
   * change) while the customer's car is still in transit - unreachable
   * through the real UI (the Complete Job button only renders once
   * `inTransit` is false), but a direct store call must still be safe.
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

  /**
   * Sprint 38: the store threads `gameState.specialty` through to
   * `advanceDay` (and so to fresh offer generation) purely by passing the
   * whole `GameState` object - no dedicated wiring code, so this is an
   * end-to-end proof the pipeline actually works through the real store,
   * not just the sim function tested directly in `serviceJobs.test.ts`.
   */
  it('a fresh offer generated while a specialty dominates and clears the threshold draws its flavor from the word-of-mouth copy pool', () => {
    const game = useGameStore()
    game.newGame(1)
    // Sprint 95 (directive 17 case (a)): the radial-offer gate would keep the
    // End Day loop below offerless forever on a tutorial career - skip first.
    game.skipTutorial()
    game.gameState = {
      ...game.gameState,
      specialty: { engine: 100, drivetrain: 0, suspension: 0, wheels: 0, body: 0, interior: 0 },
    }
    let sawSpecialtyCopy = false
    for (let i = 0; i < 100 && !sawSpecialtyCopy; i++) {
      game.endDay()
      sawSpecialtyCopy = game.serviceJobOffers.some((o) =>
        SPECIALTY_COPY.engine.lines.includes(o.description),
      )
    }
    expect(sawSpecialtyCopy).toBe(true)
  })
})
