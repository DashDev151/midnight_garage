import type { GameState, StaffMember } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { PLAYER_BASE_LABOR_SLOTS } from '../src/constants'
import { availableLaborSlots } from '../src/laborSlots'
import { testSpecialty, testToolTiers } from './testFixtures'

function baseState(staff: StaffMember[]): GameState {
  return {
    day: 1,
    seed: 42,
    cashYen: 0,
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
    laborSlotsSpentToday: 0,
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

const staffMember = (
  laborSlotsPerDay: 1 | 2,
  assignment: StaffMember['assignment'] = 'bench',
): StaffMember => ({
  id: `staff-${laborSlotsPerDay}-${assignment}`,
  displayName: 'Test Mechanic',
  stats: { engine: 1, chassis: 1, body: 1 },
  laborSlotsPerDay,
  assignment,
  pendingAssignment: null,
  weeklyWageYen: 40_000,
  trait: 'perfectionist',
})

describe('availableLaborSlots (crew model, R3)', () => {
  it('is the player base with no staff', () => {
    expect(availableLaborSlots(baseState([]))).toBe(PLAYER_BASE_LABOR_SLOTS)
  })

  it('adds each bench-assigned member their own laborSlotsPerDay (a pair of hands is a pair of hands)', () => {
    expect(availableLaborSlots(baseState([staffMember(1)]))).toBe(PLAYER_BASE_LABOR_SLOTS + 1)
    expect(availableLaborSlots(baseState([staffMember(2)]))).toBe(PLAYER_BASE_LABOR_SLOTS + 2)
    expect(availableLaborSlots(baseState([staffMember(2), staffMember(1)]))).toBe(
      PLAYER_BASE_LABOR_SLOTS + 3,
    )
  })

  it('adds nothing for a contract-assigned member (their labour is on the fleet)', () => {
    expect(availableLaborSlots(baseState([staffMember(2, 'contract')]))).toBe(
      PLAYER_BASE_LABOR_SLOTS,
    )
    // Mixed crew: only the benched member counts.
    expect(
      availableLaborSlots(baseState([staffMember(2, 'contract'), staffMember(1, 'bench')])),
    ).toBe(PLAYER_BASE_LABOR_SLOTS + 1)
  })
})
