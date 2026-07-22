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
 * A still-genuinely-unfinished repair-touching offer (same caveat as
 * `findUnfinishedOffer`, narrowed to a band-only task specifically - the task
 * shape is now `requirement`-based, so "repair-shaped" means "no `minGrade`").
 * Also narrowed to a SURFACE-depth part; the work loop only knows the simple
 * on-car group `repair()` verb, which bench-only rules refuse for a bolt-on or
 * buried slot (that needs the separate remove/recondition/reinstall flow
 * instead, out of scope for this completion-flow test). Before generation
 * changes (an extra symptom-count roll per car, shifting every subsequent random
 * draw) the RNG stream never handed this test a buried-part template; narrowing
 * the search directly is more robust than depending on which offer a seed
 * produces.
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

/** End days until `findUnfinishedOffer` finds something, bounded. A fresh
 * career's board is Yuki-only while the tutorial runs, so both warps skip the
 * walkthrough first. The gate lifts at the next generation point, which the End
 * Day loop then reaches. */
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
   * This used to pin day-1 offers. A fresh tutorial career now deliberately
   * opens Yuki-only, so the correct behaviour is a gated day 1 and offers
   * resuming once the walkthrough is skipped. The original guarantee lives on
   * for non-tutorial careers in the sim's own tests
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
    // Max every tool line so the work loop below keeps its all-equipment
    // pacing (fastest repair level) inside the 20-day cap - this test is about
    // completion plus payout, not tier-1 throughput.
    for (const line of game.toolLineViews) game.devSetToolTier(line.componentId, 3)
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

  /**
   * The store threads `gameState.specialty` through to
   * `advanceDay` (and so to fresh offer generation) purely by passing the
   * whole `GameState` object - no dedicated wiring code, so this is an
   * end-to-end proof the pipeline actually works through the real store,
   * not just the sim function tested directly in `serviceJobs.test.ts`.
   */
  it('a fresh offer generated while a specialty dominates and clears the threshold draws its flavor from the word-of-mouth copy pool', () => {
    const game = useGameStore()
    game.newGame(1)
    // The radial-offer gate would keep the
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
