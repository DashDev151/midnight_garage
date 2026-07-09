import type { GameState, StaffMember } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { availableLaborSlots } from '../src/laborSlots'

function baseState(staff: StaffMember[]): GameState {
  return {
    day: 1,
    seed: 42,
    cashYen: 0,
    reputationTier: 'unknown',
    reputationPoints: 0,
    serviceJobOffers: [],
    activeServiceJobs: [],
    ownedCars: [],
    partInventory: [],
    staff,
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    activeListings: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: [],
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
  it('is 2 with no staff (player base only)', () => {
    expect(availableLaborSlots(baseState([]))).toBe(2)
  })

  it('grants +1 slot per staff member at or above the Hustle threshold', () => {
    expect(availableLaborSlots(baseState([staffMember(4)]))).toBe(3)
    expect(availableLaborSlots(baseState([staffMember(4), staffMember(5)]))).toBe(4)
  })

  it('grants no bonus for staff below the Hustle threshold', () => {
    expect(availableLaborSlots(baseState([staffMember(3)]))).toBe(2)
  })
})
