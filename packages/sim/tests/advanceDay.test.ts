import { emptyDayActions, type DayActions } from '../src/actions'
import { BUYERS, CARS, HIDDEN_ISSUES, PARTS, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { advanceDay } from '../src/advanceDay'
import { buildSimContext } from '../src/context'
import { hashState } from '../src/hashState'
import { createInitialGameState } from '../src/newGame'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES)

const POC_10_MODEL_IDS = [
  'honda-city-e-aa',
  'suzuki-wagon-r-ct21s',
  'honda-civic-sir2-eg6',
  'toyota-sprinter-trueno-ae86',
  'nissan-180sx-rps13',
  'toyota-chaser-tourer-v-jzx90',
  'nissan-silvia-ks-s14',
  'mazda-savanna-rx7-fc3s',
  'mazda-rx7-fd3s',
  'toyota-supra-rz-jza80',
]

function initialState(): GameState {
  return {
    day: 1,
    seed: 42,
    cashYen: 1_200_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    serviceJobOffers: [],
    activeServiceJobs: [],
    ownedCars: [
      {
        id: 'car-0001',
        modelId: 'honda-city-e-aa',
        year: 1984,
        mileageKm: 128_000,
        color: 'Sodium Amber',
        provenanceNote: 'one-owner, garage kept, Gunma plates',
        condition: { engine: 55, drivetrain: 60, suspension: 50, body: 40, interior: 45 },
        hiddenIssues: [{ issueId: 'rusted-rails', revealed: false }],
        authenticityPercent: 88,
        buildSheet: {
          engine: null,
          forcedInduction: null,
          drivetrain: null,
          suspension: null,
          brakes: null,
          bodyAero: null,
          wheelsInterior: null,
        },
      },
    ],
    partInventory: [
      {
        id: 'pi-0001',
        partId: 'tanuki-street-coilovers',
        conditionPercent: 100,
        genuinePeriod: false,
      },
    ],
    staff: [],
    jobs: [],
    marketHeat: Object.fromEntries(POC_10_MODEL_IDS.map((id) => [id, 100])),
    activeAuctionLots: [],
    activeListings: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
  }
}

const noActions: DayActions = emptyDayActions()

/**
 * Scripted 30-day career: day 1 moves the car into the (sole, starting)
 * service bay and opens a repair-zone job (body, 3 slots) and works it to
 * completion, then opens an install-part job for the spare coilovers and
 * completes it; the remaining days pass idle so weekly rent (days
 * 7/14/21/28) and market-heat drift exercise on schedule. Seed 42 per the
 * roadmap's own golden-master example. The car stays in the service bay for
 * the rest of the career (moves are free, but nothing here needs to move it
 * back out) — labor only reaches a job whose car is in a service bay.
 */
function scriptedActionsForDay(day: number): DayActions {
  if (day === 1) {
    return {
      ...noActions,
      moveCars: [{ carInstanceId: 'car-0001', to: 'service' }],
      createJobs: [
        { carInstanceId: 'car-0001', kind: 'repair-zone', zone: 'body', laborSlotsRequired: 3 },
      ],
      laborAssignments: [{ jobId: 'job-1-0', laborSlots: 2 }],
    }
  }
  if (day === 2) {
    return { ...noActions, laborAssignments: [{ jobId: 'job-1-0', laborSlots: 1 }] }
  }
  if (day === 3) {
    return {
      ...noActions,
      createJobs: [
        {
          carInstanceId: 'car-0001',
          kind: 'install-part',
          slot: 'suspension',
          partInstanceId: 'pi-0001',
          laborSlotsRequired: 1,
        },
      ],
      laborAssignments: [{ jobId: 'job-3-0', laborSlots: 1 }],
    }
  }
  return noActions
}

function runCareer(days: number): GameState {
  let state = initialState()
  for (let day = 1; day <= days; day++) {
    const actions = scriptedActionsForDay(day)
    const result = advanceDay(state, actions, state.seed + state.day, CONTEXT)
    state = result.state
  }
  return state
}

describe('advanceDay golden master', () => {
  it('a scripted 30-day career reproduces an exact state hash', () => {
    const finalState = runCareer(30)
    expect(finalState.day).toBe(31)
    expect(hashState(finalState)).toBe('49b9eb4a')
  })

  it('the same 30-day script from the same seed is fully deterministic', () => {
    const a = hashState(runCareer(30))
    const b = hashState(runCareer(30))
    expect(a).toBe(b)
  })

  it('the repair-zone job completes and restores the body zone', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.condition.body).toBe(100)
  })

  it('the install-part job moves the spare coilovers into the build sheet', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.buildSheet.suspension?.partId).toBe('tanuki-street-coilovers')
    expect(finalState.partInventory).toHaveLength(0)
  })

  it('weekly auction catalogs refresh even when no bids are placed', () => {
    const finalState = runCareer(30)
    expect(finalState.activeAuctionLots.length).toBeGreaterThan(0)
    const tiers = new Set(finalState.activeAuctionLots.map((lot) => lot.tier))
    expect(tiers.has('local-yard')).toBe(true)
  })

  it('rent is deducted on every 7-day boundary through day 30', () => {
    const finalState = runCareer(30)
    const rentPayments = 4 // days 7, 14, 21, 28
    expect(finalState.cashYen).toBe(1_200_000 - rentPayments * 90_000)
  })
})

/**
 * A second golden master covering the money path the job-loop career above
 * never touches: winning a lot at auction (with the handover/lemon rule
 * applied) and selling the car. Pinned by hash so a regression here trips
 * the golden test, not only the unit tests. (External review 2026-07, 5b.)
 */
describe('advanceDay golden master — acquisition and sale path', () => {
  function acquisitionCareer(): { won: GameState; sold: GameState } {
    let state = createInitialGameState(CONTEXT, 42)
    let guard = 0
    while (state.activeAuctionLots.length === 0 && guard++ < 30) {
      state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
    }
    const lot = state.activeAuctionLots.find((l) => l.tier === 'local-yard')
    if (!lot) throw new Error('expected a local-yard lot to appear')
    // An over-market max bid wins under second-price resolution.
    state = advanceDay(
      state,
      { ...noActions, bidsOnLots: [{ lotId: lot.id, maxBidYen: lot.bookValueYen * 3 }] },
      state.seed + state.day,
      CONTEXT,
    ).state
    const won = state
    const car = won.ownedCars[0]
    if (!car) throw new Error('expected to win the lot')
    const sold = advanceDay(
      won,
      { ...noActions, sellViaWalkIn: [{ carInstanceId: car.id }] },
      won.seed + won.day,
      CONTEXT,
    ).state
    return { won, sold }
  }

  it('wins a lot at auction, then sells the car', () => {
    const { won, sold } = acquisitionCareer()
    expect(won.ownedCars).toHaveLength(1)
    expect(sold.ownedCars).toHaveLength(0)
    expect(sold.cashYen).toBeGreaterThan(0)
  })

  it('reproduces an exact state hash (deterministic acquisition->sale)', () => {
    expect(hashState(acquisitionCareer().sold)).toBe('afc3eaf7')
  })
})
