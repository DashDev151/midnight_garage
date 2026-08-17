import {
  BUYERS,
  CARS,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SCRIPTED_SERVICE_JOB,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  TUTORIAL_LOT,
  type AuctionLot,
  type GameState,
  type ServiceJob,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { emptyDayActions } from '../src/actions'
import { advanceDay } from '../src/advanceDay'
import { generateAuctionCatalog } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { createInitialGameState } from '../src/newGame'
import { createRng } from '../src/rng'
import { excludedAuctionModelIds, installTutorial } from '../src/tutorial'

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

/** Every service-job offer EXCEPT the stand owner's scripted job - that
 * injection is permanent content for every career from the day it arrives
 * (`SCRIPTED_SERVICE_JOB.appearsOnDay`, sprint210.md), deliberately not
 * gated by the tutorial's own radial-offer gate (sprint205.md); a genuine
 * RADIAL offer beside it is what this gate exists to prevent, same reasoning
 * as `unscriptedTutorialModelLots` below for the auction side. */
function radialServiceJobOffers(state: GameState): ServiceJob[] {
  return state.serviceJobOffers.filter((o) => o.id !== SCRIPTED_SERVICE_JOB.jobId)
}

/** Advances up to `maxDays`, stopping the moment a RADIAL offer appears -
 * the daily offer count is a weighted draw that can legitimately roll zero, so
 * a single day proves nothing about the gate either way. The scripted stand
 * job is excluded from this check: it is permanent content once it arrives,
 * not gated by the tutorial at all, so it can never be what "the gate
 * lifted" means. */
function advanceUntilOffers(state: GameState, maxDays: number): GameState {
  let next = state
  for (let i = 0; i < maxDays && radialServiceJobOffers(next).length === 0; i++) next = endDay(next)
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
  it('a fresh tutorial career opens with no RADIAL offers (Yuki-only), and no scripted stand job yet either', () => {
    const career = newTutorialCareer(1)
    expect(radialServiceJobOffers(career)).toEqual([])
    // The scripted job is permanent content, not a radial offer, but it now
    // arrives a few days in rather than on day one (sprint210.md task A1) -
    // a fresh career's board is genuinely empty until then.
    expect(career.serviceJobOffers).toEqual([])
    // The gate holds from creation: mission offered, nothing radial beside it.
    expect(career.storyMissions[0]?.missionId).toBe(TUTORIAL_LOT.missionId)
  })

  it('the scripted stand job arrives on appearsOnDay regardless of the gate, radial or not', () => {
    let state = newTutorialCareer(1)
    for (let i = 0; i < SCRIPTED_SERVICE_JOB.appearsOnDay; i++) state = endDay(state)
    expect(state.serviceJobOffers.some((o) => o.id === SCRIPTED_SERVICE_JOB.jobId)).toBe(true)
  })

  it('the board stays free of radial offers across advanced days while the mission is undelivered', () => {
    let state = newTutorialCareer(1)
    for (let i = 0; i < 6; i++) {
      state = endDay(state)
      expect(radialServiceJobOffers(state)).toEqual([])
    }
  })

  it('skipping the tutorial lifts the gate at the next generation point', () => {
    const gated = endDay(endDay(newTutorialCareer(1)))
    expect(radialServiceJobOffers(gated)).toEqual([])
    const skipped: GameState = { ...gated, tutorialStatus: 'skipped' }
    const after = advanceUntilOffers(skipped, 10)
    expect(radialServiceJobOffers(after).length).toBeGreaterThan(0)
  })

  it("finishing the tutorial ('done') lifts the gate the same way", () => {
    const done: GameState = { ...newTutorialCareer(1), tutorialStatus: 'done' }
    const after = advanceUntilOffers(done, 10)
    expect(radialServiceJobOffers(after).length).toBeGreaterThan(0)
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
    expect(radialServiceJobOffers(after).length).toBeGreaterThan(0)
  })

  it('a non-tutorial career (tutorialStatus absent) still seeds day-1 offers as before', () => {
    const state = createInitialGameState(CONTEXT, 1)
    expect(state.tutorialStatus).toBeUndefined()
    // The daily offer count is a weighted draw that can legitimately roll
    // zero (see `advanceUntilOffers` above) - a single seed proves nothing
    // about the gate either way, so sweep a few and require only that the
    // gate never blocks every one of them.
    const seedsWithOffers = [1, 2, 3, 4, 5].filter(
      (seed) => radialServiceJobOffers(createInitialGameState(CONTEXT, seed)).length > 0,
    )
    expect(seedsWithOffers.length).toBeGreaterThan(0)
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

  /**
   * The exclusion does real work, measured at the one campaign year that can
   * show it. A room only offers a model whose production window has cleared
   * `AUCTION_MIN_AGE_YEARS`, and the scripted Wagon R's window opens in 1993,
   * so at the tutorial's own 1995 campaign no room offers one whatever the
   * exclusion list says. 1997 is the first campaign year that would, which
   * makes it the only year the two can be told apart. Drawn through
   * `generateAuctionCatalog`, the exact function `catalogs.ts` hands the list
   * to.
   */
  it('keeps the tutorial model out of a catalogue that would otherwise roll it', () => {
    const ELIGIBLE_YEAR = 1997
    const rollsOfTutorialModel = (excludedModelIds: readonly string[]) => {
      let count = 0
      for (let seed = 1; seed <= 30; seed++) {
        const lots = generateAuctionCatalog(
          CARS,
          'local-yard',
          1,
          10,
          createRng(seed),
          CONTEXT,
          ELIGIBLE_YEAR,
          excludedModelIds,
        )
        count += lots.filter((lot) => lot.modelId === TUTORIAL_LOT.modelId).length
      }
      return count
    }
    expect(rollsOfTutorialModel([])).toBeGreaterThan(0)
    expect(rollsOfTutorialModel([TUTORIAL_LOT.modelId])).toBe(0)
  })

  it('stops excluding the model the moment the tutorial ends', () => {
    const career = newTutorialCareer(1)
    expect(excludedAuctionModelIds(career)).toEqual([TUTORIAL_LOT.modelId])
    const skipped: GameState = { ...career, tutorialStatus: 'skipped' }
    const done: GameState = { ...career, tutorialStatus: 'done' }
    expect(excludedAuctionModelIds(skipped)).toEqual([])
    expect(excludedAuctionModelIds(done)).toEqual([])
  })
})
