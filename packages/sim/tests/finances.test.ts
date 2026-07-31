import { ECONOMY, type GameState, type StaffMember } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { applyWeeklyRentAndWages, computeWeeklyRentYen } from '../src/finances'
import { testSpecialty, testToolTiers } from './testFixtures'

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

describe('applyWeeklyRentAndWages', () => {
  it('does nothing off a 7-day boundary', () => {
    const result = applyWeeklyRentAndWages(stateOnDay(3), ECONOMY)
    expect(result.log).toHaveLength(0)
    expect(result.state.cashYen).toBe(1_000_000)
  })

  it('deducts rent on day 7', () => {
    const rentYen = computeWeeklyRentYen(OPENING_BAY_COUNTS, ECONOMY)
    const result = applyWeeklyRentAndWages(stateOnDay(7), ECONOMY)
    expect(result.state.cashYen).toBe(1_000_000 - rentYen)
    expect(result.log).toEqual([{ type: 'rent-paid', amountYen: -rentYen }])
  })

  it('deducts rent and every staff wage on day 14', () => {
    const rentYen = computeWeeklyRentYen(OPENING_BAY_COUNTS, ECONOMY)
    const result = applyWeeklyRentAndWages(stateOnDay(14, [staffMember]), ECONOMY)
    expect(result.state.cashYen).toBe(1_000_000 - rentYen - staffMember.weeklyWageYen)
    expect(result.log).toEqual([
      { type: 'rent-paid', amountYen: -rentYen },
      { type: 'wage-paid', staffId: staffMember.id, amountYen: -staffMember.weeklyWageYen },
    ])
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
