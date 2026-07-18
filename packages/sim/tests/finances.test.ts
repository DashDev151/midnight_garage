import { ECONOMY, type GameState, type StaffMember } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { applyWeeklyRentAndWages } from '../src/finances'
import { testSpecialty, testToolTiers } from './testFixtures'

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
    const result = applyWeeklyRentAndWages(stateOnDay(7), ECONOMY)
    expect(result.state.cashYen).toBe(1_000_000 - ECONOMY.WEEKLY_RENT_YEN)
    expect(result.log).toEqual([{ type: 'rent-paid', amountYen: -ECONOMY.WEEKLY_RENT_YEN }])
  })

  it('deducts rent and every staff wage on day 14', () => {
    const result = applyWeeklyRentAndWages(stateOnDay(14, [staffMember]), ECONOMY)
    expect(result.state.cashYen).toBe(
      1_000_000 - ECONOMY.WEEKLY_RENT_YEN - staffMember.weeklyWageYen,
    )
    expect(result.log).toEqual([
      { type: 'rent-paid', amountYen: -ECONOMY.WEEKLY_RENT_YEN },
      { type: 'wage-paid', staffId: staffMember.id, amountYen: -staffMember.weeklyWageYen },
    ])
  })
})
