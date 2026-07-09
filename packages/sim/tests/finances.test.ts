import type { GameState, StaffMember } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { WEEKLY_RENT_YEN } from '../src/constants'
import { applyWeeklyRentAndWages } from '../src/finances'

const staffMember: StaffMember = {
  id: 'staff-0001',
  displayName: 'Test Mechanic',
  stats: { engine: 1, chassis: 1, body: 1, hustle: 1 },
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
    pendingPartOrders: [],
    cartPartIds: [],
  }
}

describe('applyWeeklyRentAndWages', () => {
  it('does nothing off a 7-day boundary', () => {
    const result = applyWeeklyRentAndWages(stateOnDay(3))
    expect(result.log).toHaveLength(0)
    expect(result.state.cashYen).toBe(1_000_000)
  })

  it('deducts rent on day 7', () => {
    const result = applyWeeklyRentAndWages(stateOnDay(7))
    expect(result.state.cashYen).toBe(1_000_000 - WEEKLY_RENT_YEN)
    expect(result.log).toEqual([{ type: 'rent-paid', amountYen: -WEEKLY_RENT_YEN }])
  })

  it('deducts rent and every staff wage on day 14', () => {
    const result = applyWeeklyRentAndWages(stateOnDay(14, [staffMember]))
    expect(result.state.cashYen).toBe(1_000_000 - WEEKLY_RENT_YEN - staffMember.weeklyWageYen)
    expect(result.log).toEqual([
      { type: 'rent-paid', amountYen: -WEEKLY_RENT_YEN },
      { type: 'wage-paid', staffId: staffMember.id, amountYen: -staffMember.weeklyWageYen },
    ])
  })
})
