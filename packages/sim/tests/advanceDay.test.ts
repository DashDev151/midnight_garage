import { emptyDayActions, type DayActions } from '../src/actions'
import { BUYERS, CARS, PARTS, PARTS_TAXONOMY, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { advanceDay } from '../src/advanceDay'
import { planGroupRepair } from '../src/bands'
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
          // Every slot defaults to a filled stock part, so day 3's
          // scripted install-part job (below) needs a genuinely empty
          // target slot - a group-level install into an already-occupied
          // slot is refused by installFitGate. dampers is the
          // suspension-group part the script installs the spare
          // coilovers onto.
          dampers: { installed: null },
        },
        symptoms: [],
        apparentBandByPartId: null,
      },
    ],
    partInventory: [
      {
        id: 'pi-0001',
        // honda-city-e-aa (car-0001) is 'shitbox' tier - the
        // fitment-class gate refuses a mismatched-class spare part.
        partId: 'shitbox-tanuki-street-coilovers',
        band: 'mint',
        genuinePeriod: false,
        origin: { kind: 'market', day: 1 },
      },
    ],
    staff: [],
    staffAds: [],
    jobs: [],
    marketHeat: Object.fromEntries(POC_10_MODEL_IDS.map((id) => [id, 100])),
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    // car-0001 starts parked - day 1's scripted move-to-service action
    // needs a real source slot to move it out of.
    parkingCarIds: ['car-0001', null, null],
    graceParkingCarId: null,
    energySpentToday: 0,
    // Every tool line is owned at tier 1 from day one - the scripted
    // day-1 body repair just runs at the tier-1 repair level; the job's
    // caller-sized 3 labor slots below are the fixture's own script, not
    // a plan-derived figure.
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    storyMissions: [],
    // An empty bench (no assemblies pulled) - matches
    // `createInitialGameState`'s own seed, so the golden reflects the live shape.
    assemblyInventory: [],
  }
}

const noActions: DayActions = emptyDayActions()

/**
 * Scripted 30-day career: day 1 moves the car into the (sole, starting)
 * service bay and opens a repair-zone job (body group, target fine, 3
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
          targetBand: 'fine',
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
    const finalState = runCareer(30)
    expect(finalState.day).toBe(31)
    // Adding a trait to `TraitIdSchema` widens `rollStaffCandidate`'s own
    // `rng.pick` draw, shifting which trait (and everything the shared RNG
    // stream draws afterwards) a staff-ad roll lands on partway through this
    // scripted career - an intended consequence of growing the roll pool,
    // not a regression.
    expect(hashState(finalState)).toBe('577b2daf')
  })

  it('the same 30-day script from the same seed is fully deterministic', () => {
    const a = hashState(runCareer(30))
    const b = hashState(runCareer(30))
    expect(a).toBe(b)
  })

  it('the repair-zone job completes and restores the body group to fine', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.parts.panels.installed?.band).toBe('fine')
    expect(car?.parts.aero.installed?.band).toBe('fine')
  })

  it('the install-part job moves the spare coilovers onto the dampers slot', () => {
    const finalState = runCareer(3)
    const car = finalState.ownedCars[0]
    expect(car?.parts.dampers.installed?.partId).toBe('shitbox-tanuki-street-coilovers')
    expect(finalState.partInventory).toHaveLength(0)
  })

  it('weekly auction catalogs refresh even when no bids are placed', () => {
    const finalState = runCareer(30)
    expect(finalState.activeAuctionLots.length).toBeGreaterThan(0)
    const tiers = new Set(finalState.activeAuctionLots.map((lot) => lot.tier))
    expect(tiers.has('local-yard')).toBe(true)
  })

  it('rent is charged again, every 7 days', () => {
    const finalState = runCareer(30)
    // Rent charges on days 7/14/21/28 within a 30-day career (four times) at
    // economy.json's WEEKLY_RENT_YEN. The day-1 body repair and the day-3
    // dampers install both incur machine-shop assist fees at tier 1, the
    // lowest accessible tier for signature operations on their respective
    // groups (body and suspension).
    const bodyPlan = planGroupRepair(
      initialState().ownedCars[0]!,
      'body',
      'fine',
      testToolTiers(),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      CONTEXT.economy.restoration.repairStepFraction,
      CONTEXT.economy.energy.energyPerGradeByTier,
    )
    const { body: bodyFeeYen, suspension: suspensionFeeYen } =
      CONTEXT.economy.machineShopAssist.feeYenByGroup
    const rentChargeCount = 4
    expect(finalState.cashYen).toBe(
      1_200_000 -
        bodyPlan.costYen -
        bodyFeeYen -
        suspensionFeeYen -
        rentChargeCount * CONTEXT.economy.WEEKLY_RENT_YEN,
    )
  })
})

/**
 * A second golden master covering the money path the job-loop career above
 * never touches: winning a lot at auction and selling the car. Pinned by
 * hash so a regression here trips the golden test, not only the unit tests.
 */
describe('advanceDay golden master - acquisition and sale path', () => {
  function acquisitionCareer(): { won: GameState; sold: GameState } {
    // Scripted with high starting cash to guarantee an over-market bid wins
    // against any realistic rival ceiling, independent of future tuning.
    let state = { ...createInitialGameState(CONTEXT, 42), cashYen: 5_000_000 }
    let guard = 0
    while (state.activeAuctionLots.length === 0 && guard++ < 30) {
      state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
    }
    const lot = state.activeAuctionLots.find((l) => l.tier === 'local-yard')
    if (!lot) throw new Error('expected a local-yard lot to appear')
    // The instant buyout is the acquisition channel a queued action reaches -
    // it resolves the same tick it is queued, no overnight step involved.
    state = advanceDay(
      state,
      { ...noActions, buyoutLots: [{ lotId: lot.id }] },
      state.seed + state.day,
      CONTEXT,
    ).state
    const won = state
    const car = won.ownedCars[0]
    if (!car) throw new Error('expected to win the lot')

    // Selling requires marking the car for sale, waiting for an offer, then
    // accepting it - not instant.
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
    expect(hashState(acquisitionCareer().sold)).toBe('e293217c')
  })
})

/**
 * Regression test: the day-1 opening board (`createInitialGameState` ->
 * `refreshCatalogs`) and the first daily arrivals roll
 * (`generateDailyAuctionArrivals`, called from inside the very first
 * `advanceDay`) must not stamp fresh lots with ids that collide with the
 * day-1 seed batch's own ids. Two lots sharing one id collapse into "the same
 * lot" everywhere that keys off `lotId`, causing bogus duplicate losses and
 * "randomly lost" player confusion. Fixed by generating the first day's
 * arrivals for `next.day + 1`, the same offset `generateDailyServiceJobOffers`
 * already used one call below for the identical hazard.
 */
describe('advanceDay: no colliding auction lot ids', () => {
  it('the first advanceDay call never mints an arrival lot id that collides with the day-1 seed batch', () => {
    for (let seed = 1; seed <= 50; seed++) {
      let state = createInitialGameState(CONTEXT, seed)
      state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
      const ids = state.activeAuctionLots.map((lot) => lot.id)
      expect(new Set(ids).size, `seed ${seed}: duplicate lot id in activeAuctionLots`).toBe(
        ids.length,
      )
    }
  })

  it('30 days into a career, no two active lots ever share an id', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let state = createInitialGameState(CONTEXT, seed)
      for (let day = 1; day <= 30; day++) {
        state = advanceDay(state, noActions, state.seed + state.day, CONTEXT).state
        const ids = state.activeAuctionLots.map((lot) => lot.id)
        expect(
          new Set(ids).size,
          `seed ${seed} day ${day}: duplicate lot id in activeAuctionLots`,
        ).toBe(ids.length)
      }
    }
  })
})

describe('advanceDay: inspectionVisit dies at the day boundary (Sprint 74 decision 1)', () => {
  it('an active visit with real minutes left is unconditionally cleared to null by the next advanceDay call', () => {
    const state: GameState = {
      ...createInitialGameState(CONTEXT, 1),
      inspectionVisit: { tier: 'local-yard', minutesLeft: 45 },
    }
    const result = advanceDay(state, noActions, state.seed + state.day, CONTEXT)
    expect(result.state.inspectionVisit).toBeNull()
  })

  it('stays null across the boundary when no visit was active', () => {
    const state = createInitialGameState(CONTEXT, 1)
    expect(state.inspectionVisit).toBeNull()
    const result = advanceDay(state, noActions, state.seed + state.day, CONTEXT)
    expect(result.state.inspectionVisit).toBeNull()
  })
})

describe('advanceDay: the daily offer draw and acceptance (Sprint 31)', () => {
  it('a for-sale car eventually draws a live offer, logged as offer-received', () => {
    let state: GameState = {
      ...initialState(),
      day: 10,
      carsForSale: [
        {
          carInstanceId: 'car-0001',
          sinceDay: 10,
          channelId: 'shopFront',
          weekendMeetPending: false,
        },
      ],
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
      carsForSale: [
        {
          carInstanceId: 'car-0001',
          sinceDay: 10,
          channelId: 'shopFront',
          weekendMeetPending: false,
        },
      ],
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
