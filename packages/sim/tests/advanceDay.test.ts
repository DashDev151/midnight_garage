import { emptyDayActions, type DayActions } from '../src/actions'
import {
  BUYERS,
  CARS,
  EQUIPMENT,
  HIDDEN_ISSUES,
  PARTS,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { advanceDay } from '../src/advanceDay'
import { buildSimContext } from '../src/context'
import { hashState } from '../src/hashState'
import { createInitialGameState } from '../src/newGame'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES, [], undefined, [], EQUIPMENT)

/** The equipment the scripted career's day-1 body repair needs (Sprint 13). */
const WELDER_ID = EQUIPMENT.find((e) => e.componentIds.includes('body'))!.id

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
        hiddenIssues: [
          { issueId: 'rusted-rails', revealed: false, severityPercent: 0, repaired: false },
        ],
        authenticityPercent: 88,
        components: {
          engine: { condition: 55, installed: null },
          forcedInduction: { condition: 100, installed: null },
          drivetrain: { condition: 60, installed: null },
          suspension: { condition: 50, installed: null },
          brakes: { condition: 100, installed: null },
          wheels: { condition: 100, installed: null },
          body: { condition: 40, installed: null },
          interior: { condition: 45, installed: null },
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
    // car-0001 starts parked (Sprint 17: parking is a real, explicit slot
    // now, not "any owned car not in a service bay") — day 1's scripted
    // move-to-service action needs a real source slot to move it out of.
    parkingCarIds: ['car-0001', null, null],
    laborSlotsSpentToday: 0,
    // Pre-granted, not purchased through the script — the scripted day-1
    // body repair (below) needs it, and this fixture predates equipment
    // as a concept; hand-placing it here matches how the spare coilovers
    // above are also hand-placed rather than bought through the sim.
    ownedEquipmentIds: [WELDER_ID],
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
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
        {
          carInstanceId: 'car-0001',
          kind: 'repair-zone',
          componentId: 'body',
          laborSlotsRequired: 3,
        },
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
          componentId: 'suspension',
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
    // Re-pinned Sprint 20 (auction rework II): the AuctionLot schema, the
    // overnight-step/hammer mechanics, and WEEKLY_RENT_YEN (90,000 -> 0) all
    // change this hash even though this script never places a bid — weekly
    // catalog refresh and the day-boundary auction resolution loop both
    // still run every day regardless.
    // Re-pinned again Sprint 21 (value model): marketValueYen replaces the
    // old capped-stat valuation pipeline everywhere (auction anchor, market
    // heat's own weekly update rule, and the new marketLedger field on
    // GameState), so this hash moves even though the script itself is
    // unchanged.
    // Re-pinned again Sprint 22 (hidden issues): severity is now rolled at
    // car generation (a new rng draw inside generateAuctionCarInstance), and
    // effective condition (issues.ts) now feeds derivedStats/marketValue/
    // reputation everywhere raw condition used to — moves the hash even
    // though this script never touches an issue directly.
    // Re-pinned again Sprint 23 (progression pacing + rent): WEEKLY_RENT_YEN
    // restored (0 -> 20,000) and this career's 30 days cross 4 weekly rent
    // boundaries, so cashYen (and the hash) moves even though the script
    // itself is unchanged; the clean/concours reputation-bonus split and
    // retuned baseReputation values are also in scope for any future career
    // that sells a car or works a service job, though this specific script
    // does neither.
    const finalState = runCareer(30)
    expect(finalState.day).toBe(31)
    expect(hashState(finalState)).toBe('d0c08928')
  })

  it('the same 30-day script from the same seed is fully deterministic', () => {
    const a = hashState(runCareer(30))
    const b = hashState(runCareer(30))
    expect(a).toBe(b)
  })

  it('the repair-zone job completes and restores the body component', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.components.body.condition).toBe(100)
  })

  it('the install-part job moves the spare coilovers onto the suspension component', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.components.suspension.installed?.partId).toBe('tanuki-street-coilovers')
    expect(finalState.partInventory).toHaveLength(0)
  })

  it('weekly auction catalogs refresh even when no bids are placed', () => {
    const finalState = runCareer(30)
    expect(finalState.activeAuctionLots.length).toBeGreaterThan(0)
    const tiers = new Set(finalState.activeAuctionLots.map((lot) => lot.tier))
    expect(tiers.has('local-yard')).toBe(true)
  })

  it('rent is charged again, every 7 days (Sprint 23 decision 4: restored from 0)', () => {
    const finalState = runCareer(30)
    // Sprint 13: the day-1 body repair also charges its equipment's flat
    // consumables cost once, on top of rent. Rent charges on days 7/14/21/28
    // within a 30-day career (four times) at economy.json's WEEKLY_RENT_YEN.
    const consumablesCostYen = EQUIPMENT.find((e) => e.id === WELDER_ID)!.consumablesCostYen
    const rentChargeCount = 4
    expect(finalState.cashYen).toBe(
      1_200_000 - consumablesCostYen - rentChargeCount * CONTEXT.economy.WEEKLY_RENT_YEN,
    )
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
    // An over-market bid — well above any realistic demand ceiling — takes
    // the lead immediately and stays there (the overnight step's
    // at-or-above-ceiling branch is silence, not a counter-raise), so this
    // hammers to the player once quietDays or the backstop resolves it
    // (Sprint 20: bidding no longer resolves the instant it's placed).
    state = advanceDay(
      state,
      { ...noActions, bidsOnLots: [{ lotId: lot.id, maxBidYen: lot.bookValueYen * 3 }] },
      state.seed + state.day,
      CONTEXT,
    ).state
    guard = 0
    while (state.activeAuctionLots.some((l) => l.id === lot.id) && guard++ < 30) {
      state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
    }
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
    // Re-pinned Sprint 20 (auction rework II): the new open-bidding schema,
    // demand-ceiling-anchored clearing, and WEEKLY_RENT_YEN -> 0 all change
    // this career's exact won price and final state.
    // Re-pinned again Sprint 21 (value model): the auction anchor and the
    // walk-in sale price both now flow through marketValueYen, moving both
    // the winning bid and the sale price this career resolves to.
    // Re-pinned again Sprint 22 (hidden issues): the auction anchor now
    // carries a model risk discount and severity is rolled at generation,
    // shifting the won price; the walk-in sale reads issue-adjusted value.
    expect(hashState(acquisitionCareer().sold)).toBe('78f34c53')
  })
})

describe('advanceDay resolves a public listing with its captured reputation delta (Sprint 15)', () => {
  it('applies the pending reputationDeltaOnSale alongside the cash payout, once, on resolvesOnDay', () => {
    const state: GameState = {
      ...initialState(),
      day: 10,
      ownedCars: [],
      reputationPoints: 0,
      activeListings: [
        {
          id: 'listing-5-car-x',
          carInstanceId: 'car-x',
          modelId: 'honda-city-e-aa',
          askingPriceYen: 400_000,
          resolvesOnDay: 10,
          reputationDeltaOnSale: 3,
        },
      ],
    }
    const cashBefore = state.cashYen
    const { state: next, log } = advanceDay(state, noActions, state.seed + state.day, CONTEXT)
    expect(next.cashYen).toBe(cashBefore + 400_000)
    expect(next.reputationPoints).toBe(3)
    expect(next.activeListings).toHaveLength(0)
    expect(log).toContainEqual(
      expect.objectContaining({
        type: 'car-sold',
        channel: 'list-publicly',
        priceYen: 400_000,
        reputationDelta: 3,
      }),
    )
  })

  it('logs the applied loss, not the nominal penalty, when resolution would floor reputationPoints at zero (Sprint 24 fix 3)', () => {
    const state: GameState = {
      ...initialState(),
      day: 10,
      ownedCars: [],
      reputationPoints: 2,
      activeListings: [
        {
          id: 'listing-5-car-x',
          carInstanceId: 'car-x',
          modelId: 'honda-city-e-aa',
          askingPriceYen: 400_000,
          resolvesOnDay: 10,
          reputationDeltaOnSale: -5,
        },
      ],
    }
    const { state: next, log } = advanceDay(state, noActions, state.seed + state.day, CONTEXT)
    expect(next.reputationPoints).toBe(0)
    expect(log).toContainEqual(
      expect.objectContaining({
        type: 'car-sold',
        channel: 'list-publicly',
        reputationDelta: -2,
        saleQuality: 'lemon',
      }),
    )
  })

  it('a not-yet-due listing stays pending and applies nothing', () => {
    const state: GameState = {
      ...initialState(),
      day: 10,
      ownedCars: [],
      activeListings: [
        {
          id: 'listing-5-car-x',
          carInstanceId: 'car-x',
          modelId: 'honda-city-e-aa',
          askingPriceYen: 400_000,
          resolvesOnDay: 20,
          reputationDeltaOnSale: -5,
        },
      ],
    }
    const { state: next } = advanceDay(state, noActions, state.seed + state.day, CONTEXT)
    expect(next.activeListings).toHaveLength(1)
    expect(next.reputationPoints).toBe(0)
  })
})
