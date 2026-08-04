import { ECONOMY, type GameState, type StaffMember } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { applyWeeklyRentAndWages, computeWeeklyRentYen } from '../src/finances'
import { testSceneStanding, testSpecialty, testToolTiers } from './testFixtures'

/** The opening (day-1) bay counts, mirroring `FACILITIES.*.startCount` -
 * same figures `stateOnDay`'s fixture below places a fresh career at. */
const OPENING_BAY_COUNTS = { service: 1, parking: 3, forecourt: 2 } as const

const staffMember: StaffMember = {
  id: 'staff-0001',
  displayName: 'Test Mechanic',
  stats: { engine: 1, chassis: 1, body: 1 },
  laborSlotsPerDay: 1,
  assignment: 'bench',
  pendingAssignment: null,
  weeklyWageYen: 45_000,
  trait: 'perfectionist',
}

function stateOnDay(day: number, staff: StaffMember[] = []): GameState {
  return {
    day,
    seed: 42,
    cashYen: 1_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    specialty: testSpecialty(),
    sceneStanding: testSceneStanding(),
    serviceJobOffers: [],
    activeServiceJobs: [],
    ownedCars: [],
    partInventory: [],
    staff,
    staffAds: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    parkingCarIds: [],
    forecourtBayCount: 2,
    forecourtCarIds: [null, null],
    graceParkingCarId: null,
    energySpentToday: 0,
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
  }
}

/** The two landmark days rent/wages now fall on (sprint149.md:
 * `calendar.rentDayOfWeek`/`calendar.paydayOfWeek`), plus a day that is
 * neither. Read from ECONOMY rather than hard-coded, so a lever change
 * can't silently desync these tests from the content it exercises. */
const RENT_DAY = ECONOMY.calendar.rentDayOfWeek
const PAYDAY = ECONOMY.calendar.paydayOfWeek
const NEITHER_DAY = [1, 2, 3, 4, 5, 6, 7].find((d) => d !== RENT_DAY && d !== PAYDAY)!

describe('applyWeeklyRentAndWages', () => {
  it('does nothing on a day that is neither rent day nor payday', () => {
    const result = applyWeeklyRentAndWages(stateOnDay(NEITHER_DAY), ECONOMY)
    expect(result.log).toHaveLength(0)
    expect(result.state.cashYen).toBe(1_000_000)
  })

  it('deducts rent on calendar.rentDayOfWeek, alone', () => {
    const rentYen = computeWeeklyRentYen(OPENING_BAY_COUNTS, ECONOMY)
    const result = applyWeeklyRentAndWages(stateOnDay(RENT_DAY, [staffMember]), ECONOMY)
    expect(result.state.cashYen).toBe(1_000_000 - rentYen)
    expect(result.log).toEqual([{ type: 'rent-paid', amountYen: -rentYen }])
  })

  it('deducts every staff wage on calendar.paydayOfWeek, alone - not bundled with rent', () => {
    const result = applyWeeklyRentAndWages(stateOnDay(PAYDAY, [staffMember]), ECONOMY)
    expect(result.state.cashYen).toBe(1_000_000 - staffMember.weeklyWageYen)
    expect(result.log).toEqual([
      { type: 'wage-paid', staffId: staffMember.id, amountYen: -staffMember.weeklyWageYen },
    ])
  })

  it('rent day 8 (the next week) still charges rent alone - rentDayOfWeek repeats every daysPerWeek days', () => {
    const rentYen = computeWeeklyRentYen(OPENING_BAY_COUNTS, ECONOMY)
    const result = applyWeeklyRentAndWages(
      stateOnDay(RENT_DAY + ECONOMY.calendar.daysPerWeek, [staffMember]),
      ECONOMY,
    )
    expect(result.state.cashYen).toBe(1_000_000 - rentYen)
    expect(result.log).toEqual([{ type: 'rent-paid', amountYen: -rentYen }])
  })
})

/**
 * The sprint's own honesty check (sprint149.md "the one thing to get
 * right"): rent and wages moved off one shared 7-day boundary onto their
 * own named days, but the AMOUNT charged per week must not change - only
 * which day it lands on. This proves the 28-day total (four weeks, exactly
 * four rent charges and four wage charges regardless of phase) equals what
 * the pre-sprint flat `day % 7 === 0` cadence would have charged: both
 * rent and wages firing together, once a week, four times.
 */
describe('the 28-day rent+wages total is unchanged from the pre-sprint cadence (sprint149.md)', () => {
  it('sums to exactly 4 x (rent + wages) over days 1-28, whichever days they now land on', () => {
    const rentYen = computeWeeklyRentYen(OPENING_BAY_COUNTS, ECONOMY)
    let totalChargedYen = 0
    for (let day = 1; day <= 28; day++) {
      const result = applyWeeklyRentAndWages(stateOnDay(day, [staffMember]), ECONOMY)
      totalChargedYen -= result.log.reduce((sum, entry) => sum + entry.amountYen, 0)
    }
    expect(totalChargedYen).toBe(4 * (rentYen + staffMember.weeklyWageYen))
  })

  it('holds over a 28-day span that does NOT start on day 1 either', () => {
    const rentYen = computeWeeklyRentYen(OPENING_BAY_COUNTS, ECONOMY)
    let totalChargedYen = 0
    for (let day = 53; day <= 80; day++) {
      const result = applyWeeklyRentAndWages(stateOnDay(day, [staffMember]), ECONOMY)
      totalChargedYen -= result.log.reduce((sum, entry) => sum + entry.amountYen, 0)
    }
    expect(totalChargedYen).toBe(4 * (rentYen + staffMember.weeklyWageYen))
  })
})

describe('computeWeeklyRentYen (sprint148: rent scales with what you own)', () => {
  it('is exactly 20,000 at the opening bay counts (base 6000 + 5000x1 + 2000x3 + 1500x2)', () => {
    expect(computeWeeklyRentYen(OPENING_BAY_COUNTS, ECONOMY)).toBe(20_000)
  })

  it('rises by the per-bay rate after a purchase of each kind', () => {
    const base = computeWeeklyRentYen(OPENING_BAY_COUNTS, ECONOMY)
    expect(computeWeeklyRentYen({ ...OPENING_BAY_COUNTS, service: 2 }, ECONOMY)).toBe(
      base + ECONOMY.rent.perBayWeeklyYen.service,
    )
    expect(computeWeeklyRentYen({ ...OPENING_BAY_COUNTS, parking: 4 }, ECONOMY)).toBe(
      base + ECONOMY.rent.perBayWeeklyYen.parking,
    )
    expect(computeWeeklyRentYen({ ...OPENING_BAY_COUNTS, forecourt: 3 }, ECONOMY)).toBe(
      base + ECONOMY.rent.perBayWeeklyYen.forecourt,
    )
  })
})
