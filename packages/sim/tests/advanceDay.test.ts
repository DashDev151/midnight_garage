import { emptyDayActions, type DayActions } from '../src/actions'
import { BUYERS, CARS, PARTS, PARTS_TAXONOMY, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { advanceDay } from '../src/advanceDay'
import { planGroupRepair, restorationCostFactorForTier } from '../src/bands'
import { buildSimContext } from '../src/context'
import { hashState } from '../src/hashState'
import { createInitialGameState } from '../src/newGame'
import { groupCarParts, testSpecialty, testToolTiers } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

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
    specialty: testSpecialty(),
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
        authenticityPercent: 88,
        parts: {
          ...groupCarParts({
            engine: 'worn',
            drivetrain: 'worn',
            suspension: 'worn',
            body: 'worn',
            interior: 'worn',
          }),
          // Sprint 32: every slot defaults to a filled stock part now, so
          // day 3's scripted install-part job (below) needs a genuinely
          // empty target slot - a group-level install into an
          // already-occupied slot is refused by the tightened
          // installFitGate. dampers is the suspension-group part the script
          // installs the spare coilovers onto.
          dampers: { installed: null },
        },
      },
    ],
    partInventory: [
      {
        id: 'pi-0001',
        partId: 'tanuki-street-coilovers',
        band: 'mint',
        genuinePeriod: false,
      },
    ],
    staff: [],
    jobs: [],
    marketHeat: Object.fromEntries(POC_10_MODEL_IDS.map((id) => [id, 100])),
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    // car-0001 starts parked (Sprint 17: parking is a real, explicit slot
    // now, not "any owned car not in a service bay") - day 1's scripted
    // move-to-service action needs a real source slot to move it out of.
    parkingCarIds: ['car-0001', null, null],
    laborSlotsSpentToday: 0,
    // Sprint 36: every tool line is owned at tier 1 from day one - the
    // scripted day-1 body repair just runs at the tier-1 repair level; the
    // job's caller-sized 3 labor slots below are the fixture's own script,
    // not a plan-derived figure.
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
  }
}

const noActions: DayActions = emptyDayActions()

/**
 * Scripted 30-day career: day 1 moves the car into the (sole, starting)
 * service bay and opens a repair-zone job (body group, target mint, 3
 * slots) and works it to completion, then opens an install-part job for the
 * spare coilovers and completes it; the remaining days pass idle so weekly
 * rent (days 7/14/21/28) and market-heat drift exercise on schedule. Seed 42
 * per the roadmap's own golden-master example. The car stays in the service
 * bay for the rest of the career (moves are free, but nothing here needs to
 * move it back out) - labor only reaches a job whose car is in a service bay.
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
          targetBand: 'mint',
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
    // Sprint 41 re-pins this hash (was 7a495efd): tier-scaled repair costs
    // change the day-1 body repair's real cash charge (and every other
    // repair cost downstream), a real cash-flow change, not a logic bug -
    // every other assertion in this file (cash deltas, part installs,
    // catalog refresh) still passes against the same scripted career.
    // Sprint 38 re-pins this hash (was 7eb02198): the hashed state's SHAPE
    // changed (the new `specialty` record added to GameState) - the offer
    // SEQUENCE itself is unaffected at all-zero specialty (proven directly
    // in serviceJobs.test.ts's "byte-identical to pre-Sprint-38 behavior"
    // tests), so this is a pure state-shape change, not a draw-order or
    // value-model change.
    // Sprint 42 re-pins this hash (was ad88a86b): the hashed state's SHAPE
    // changed again (the new `carLedgers` record added to GameState). Pure
    // bookkeeping, not an economic change: a day-by-day cashYen/ownedCars/
    // partInventory trace of this exact scripted career, captured against
    // this working tree and against a `git worktree` checkout of the
    // pre-Sprint-42 commit, diffed byte-identical before this hash was
    // touched (see sprint42.md's Exit for the full comparison).
    const finalState = runCareer(30)
    expect(finalState.day).toBe(31)
    expect(hashState(finalState)).toBe('37b5ace7')
  })

  it('the same 30-day script from the same seed is fully deterministic', () => {
    const a = hashState(runCareer(30))
    const b = hashState(runCareer(30))
    expect(a).toBe(b)
  })

  it('the repair-zone job completes and restores the body group to mint', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.parts.panels.installed?.band).toBe('mint')
    expect(car?.parts.aero.installed?.band).toBe('mint')
  })

  it('the install-part job moves the spare coilovers onto the dampers slot', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.parts.dampers.installed?.partId).toBe('tanuki-street-coilovers')
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
    // The day-1 body repair also charges the body tool line's tier-1
    // per-job consumables cost once (Sprint 36: tier-sourced, replacing the
    // old equipment flat fee), plus (Sprint 26) the group's real per-grade
    // repair cost, on top of rent. Rent charges on days 7/14/21/28 within a
    // 30-day career (four times) at economy.json's WEEKLY_RENT_YEN.
    const consumablesCostYen = CONTEXT.toolLineFor('body').tiers[0]!.consumablesCostYen
    // car-0001 is honda-city-e-aa - shitbox tier (Sprint 41 tier-scaled repair costs).
    const bodyPlan = planGroupRepair(
      initialState().ownedCars[0]!,
      'body',
      'mint',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      restorationCostFactorForTier('shitbox', CONTEXT.economy),
    )
    const rentChargeCount = 4
    expect(finalState.cashYen).toBe(
      1_200_000 -
        consumablesCostYen -
        bodyPlan.costYen -
        rentChargeCount * CONTEXT.economy.WEEKLY_RENT_YEN,
    )
  })
})

/**
 * A second golden master covering the money path the job-loop career above
 * never touches: winning a lot at auction and selling the car. Pinned by
 * hash so a regression here trips the golden test, not only the unit tests.
 * (External review 2026-07, 5b.)
 */
describe('advanceDay golden master - acquisition and sale path', () => {
  function acquisitionCareer(): { won: GameState; sold: GameState } {
    let state = createInitialGameState(CONTEXT, 42)
    let guard = 0
    while (state.activeAuctionLots.length === 0 && guard++ < 30) {
      state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
    }
    const lot = state.activeAuctionLots.find((l) => l.tier === 'local-yard')
    if (!lot) throw new Error('expected a local-yard lot to appear')
    // An over-market bid - well above any realistic demand ceiling - takes
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

    // Sprint 31: selling is no longer instant - mark the car for sale, wait
    // for the daily offer draw to produce a live offer, then accept it.
    state = advanceDay(
      won,
      { ...noActions, setForSale: [{ carInstanceId: car.id, forSale: true }] },
      won.seed + won.day,
      CONTEXT,
    ).state
    guard = 0
    while (!state.pendingOffers.some((o) => o.carInstanceId === car.id) && guard++ < 60) {
      state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
    }
    if (!state.pendingOffers.some((o) => o.carInstanceId === car.id)) {
      throw new Error('expected an offer to arrive within 60 days')
    }
    const sold = advanceDay(
      state,
      { ...noActions, acceptOffers: [{ carInstanceId: car.id }] },
      state.seed + state.day,
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
    // Re-pinned for Sprint 41 (was 8c2d16c4): tier-scaled repair/restoration
    // costs (and the hassleFactor/floorFraction retune) change this career's
    // real cash flow and sale value - a real economy change, not a logic
    // bug (`won.ownedCars`/`sold.ownedCars`/`sold.cashYen > 0` above still
    // hold).
    // Re-pinned for Sprint 38 (was ce6e0f11): same cause as the 30-day
    // career above - the hashed state's SHAPE gained `specialty`; no draw-
    // order or value-model change (sale price math is untouched).
    // Re-pinned for Sprint 42 (was 7317802d): same cause as the 30-day
    // career's own Sprint 42 re-pin above - the hashed state's SHAPE gained
    // `carLedgers`, byte-identical day-by-day cash trace proven against the
    // pre-Sprint-42 commit before this hash was touched.
    expect(hashState(acquisitionCareer().sold)).toBe('13501bbf')
  })
})

describe('advanceDay: the daily offer draw and acceptance (Sprint 31)', () => {
  it('a for-sale car eventually draws a live offer, logged as offer-received', () => {
    let state: GameState = {
      ...initialState(),
      day: 10,
      carsForSale: [{ carInstanceId: 'car-0001', sinceDay: 10 }],
    }
    let sawOffer = false
    for (let i = 0; i < 60 && !sawOffer; i++) {
      const result = advanceDay(state, noActions, state.seed + state.day, CONTEXT)
      state = result.state
      if (state.pendingOffers.some((o) => o.carInstanceId === 'car-0001')) {
        sawOffer = true
        expect(result.log).toContainEqual(
          expect.objectContaining({ type: 'offer-received', carInstanceId: 'car-0001' }),
        )
      }
    }
    expect(sawOffer).toBe(true)
  })

  it("accepting today's offer sells the car through the walk-in resolution path", () => {
    const state: GameState = {
      ...initialState(),
      day: 10,
      carsForSale: [{ carInstanceId: 'car-0001', sinceDay: 10 }],
      pendingOffers: [{ carInstanceId: 'car-0001', buyerId: 'first-timer', priceYen: 400_000 }],
    }
    const cashBefore = state.cashYen
    const { state: next, log } = advanceDay(
      state,
      { ...noActions, acceptOffers: [{ carInstanceId: 'car-0001' }] },
      state.seed + state.day,
      CONTEXT,
    )
    expect(next.ownedCars).toHaveLength(0)
    expect(next.cashYen).toBe(cashBefore + 400_000)
    expect(log).toContainEqual(
      expect.objectContaining({ type: 'car-sold', channel: 'walk-in-offer', priceYen: 400_000 }),
    )
  })

  it('an unaccepted offer expires at End Day - it never survives into the next advanceDay call (no-reflex rule)', () => {
    const state: GameState = {
      ...initialState(),
      day: 10,
      carsForSale: [], // not (re-)marked for sale, so nothing replaces the stale offer below
      pendingOffers: [{ carInstanceId: 'car-0001', buyerId: 'first-timer', priceYen: 400_000 }],
    }
    const { state: next } = advanceDay(state, noActions, state.seed + state.day, CONTEXT)
    expect(next.pendingOffers.some((o) => o.carInstanceId === 'car-0001')).toBe(false)
    // The car itself is untouched (never sold) - the offer just lapsed.
    expect(next.ownedCars).toHaveLength(1)
  })
})
