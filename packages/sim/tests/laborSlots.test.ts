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

const staffMember = (hustle: number): StaffMember => ({
  id: `staff-${hustle}`,
  displayName: 'Test Mechanic',
  stats: { engine: 1, chassis: 1, body: 1, hustle },
  weeklyWageYen: 40_000,
  trait: 'perfectionist',
})

describe('availableLaborSlots', () => {
  it('is the player base with no staff', () => {
    expect(availableLaborSlots(baseState([]))).toBe(PLAYER_BASE_LABOR_SLOTS)
  })

  it('grants +1 slot per staff member at or above the Hustle threshold', () => {
    expect(availableLaborSlots(baseState([staffMember(4)]))).toBe(PLAYER_BASE_LABOR_SLOTS + 1)
    expect(availableLaborSlots(baseState([staffMember(4), staffMember(5)]))).toBe(
      PLAYER_BASE_LABOR_SLOTS + 2,
    )
  })

  it('grants no bonus for staff below the Hustle threshold', () => {
    expect(availableLaborSlots(baseState([staffMember(3)]))).toBe(PLAYER_BASE_LABOR_SLOTS)
  })
})
