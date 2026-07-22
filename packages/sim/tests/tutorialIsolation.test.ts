import {
  BUYERS,
  CARS,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  TUTORIAL_LOT,
  type AuctionLot,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { emptyDayActions } from '../src/actions'
import { advanceDay } from '../src/advanceDay'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import { installTutorial } from '../src/tutorial'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
)

/**
 * The tutorial's sim-side isolation. While the walkthrough runs, the
 * first loop must be exactly the taught loop - no radial service-job
 * offers competing with Yuki's mission, and no random twin of the
 * scripted Wagon R muddying "the {model} on the block". Both gates live
 * at the generation call sites / eligible pool, so these tests drive the
 * REAL paths: `createInitialGameState`'s day-1 batch and `advanceDay`'s
 * daily arrivals, never a mocked generator.
 */

/** The exact production new-career path (gameStore.newGame): the tutorial
 * intent enters at creation, so the day-1 board generates through the Sprint
 * 95 gates; `installTutorial` then offers the mission and seeds the scripted
 * lot, as it always has. */
function newTutorialCareer(seed: number): GameState {
  return installTutorial(createInitialGameState(CONTEXT, seed, { tutorial: true }), CONTEXT)
}

/** One End Day with no player actions, on the store's own per-day seed
 * convention (`state.seed + state.day`). */
function endDay(state: GameState): GameState {
  return advanceDay(state, emptyDayActions(), state.seed + state.day, CONTEXT).state
}

/** Advances up to `maxDays`, stopping the moment the job board is non-empty -
 * the daily offer count is a weighted draw that can legitimately roll zero, so
 * a single day proves nothing about the gate either way. */
function advanceUntilOffers(state: GameState, maxDays: number): GameState {
  let next = state
  for (let i = 0; i < maxDays && next.serviceJobOffers.length === 0; i++) next = endDay(next)
  return next
}

/** Every active lot carrying the tutorial model EXCEPT the scripted lot
 * itself - the scripted injection is allowed (it is the tutorial); a random
 * twin is the bug. */
function unscriptedTutorialModelLots(state: GameState): AuctionLot[] {
  return state.activeAuctionLots.filter(
    (lot) => lot.modelId === TUTORIAL_LOT.modelId && lot.id !== TUTORIAL_LOT.lotId,
  )
}

describe('the radial-offer gate (Sprint 95 decision 4)', () => {
  it('a fresh tutorial career opens with an empty job board (Yuki-only)', () => {
    const career = newTutorialCareer(1)
    expect(career.serviceJobOffers).toEqual([])
    // The gate holds from creation: mission offered, nothing radial beside it.
    expect(career.storyMissions[0]?.missionId).toBe(TUTORIAL_LOT.missionId)
  })

  it('the board stays empty across advanced days while the mission is undelivered', () => {
    let state = newTutorialCareer(1)
    for (let i = 0; i < 6; i++) {
      state = endDay(state)
      expect(state.serviceJobOffers).toEqual([])
    }
  })

  it('skipping the tutorial lifts the gate at the next generation point', () => {
    const gated = endDay(endDay(newTutorialCareer(1)))
    expect(gated.serviceJobOffers).toEqual([])
    const skipped: GameState = { ...gated, tutorialStatus: 'skipped' }
    const after = advanceUntilOffers(skipped, 10)
    expect(after.serviceJobOffers.length).toBeGreaterThan(0)
  })

  it("finishing the tutorial ('done') lifts the gate the same way", () => {
    const done: GameState = { ...newTutorialCareer(1), tutorialStatus: 'done' }
    const after = advanceUntilOffers(done, 10)
    expect(after.serviceJobOffers.length).toBeGreaterThan(0)
  })

  it("delivering the mission lifts the gate even while tutorialStatus is still 'active'", () => {
    const career = newTutorialCareer(1)
    const delivered: GameState = {
      ...career,
      storyMissions: career.storyMissions.map((r) =>
        r.missionId === TUTORIAL_LOT.missionId ? { ...r, status: 'delivered' as const } : r,
      ),
    }
    expect(delivered.tutorialStatus).toBe('active')
    const after = advanceUntilOffers(delivered, 10)
    expect(after.serviceJobOffers.length).toBeGreaterThan(0)
  })

  it('a non-tutorial career (tutorialStatus absent) still seeds day-1 offers as before', () => {
    const state = createInitialGameState(CONTEXT, 1)
    expect(state.tutorialStatus).toBeUndefined()
    expect(state.serviceJobOffers.length).toBeGreaterThan(0)
    // The options parameter's default changes nothing for existing callers.
    expect(createInitialGameState(CONTEXT, 7)).toEqual(createInitialGameState(CONTEXT, 7, {}))
  })
})

describe('the tutorial-model auction exclusion (Sprint 95 decision 5)', () => {
  it('no random lot ever carries the tutorial model while the tutorial is active (seed sweep)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let state = newTutorialCareer(seed)
      expect(unscriptedTutorialModelLots(state)).toEqual([])
      // A daily arrival posted tonight is visible in the state this call
      // returns and cannot hammer before the NEXT call, so checking after
      // every End Day sees each random lot at least once.
      for (let day = 0; day < 3; day++) {
        state = endDay(state)
        expect(unscriptedTutorialModelLots(state)).toEqual([])
      }
    }
  })

  it('the same seeds do roll the tutorial model when no tutorial is active (the exclusion does real work)', () => {
    let rolled = 0
    for (let seed = 1; seed <= 30; seed++) {
      const state = createInitialGameState(CONTEXT, seed)
      rolled += state.activeAuctionLots.filter((l) => l.modelId === TUTORIAL_LOT.modelId).length
    }
    expect(rolled).toBeGreaterThan(0)
  })

  it('after a skip the model spawns freely again', () => {
    const career = newTutorialCareer(1)
    expect(unscriptedTutorialModelLots(career)).toEqual([])
    let state: GameState = { ...career, tutorialStatus: 'skipped' }
    let respawned = false
    for (let day = 0; day < 40 && !respawned; day++) {
      state = endDay(state)
      respawned = unscriptedTutorialModelLots(state).length > 0
    }
    expect(respawned).toBe(true)
  })
})
