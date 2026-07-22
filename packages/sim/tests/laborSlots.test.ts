import { ECONOMY, type GameState, type StaffMember } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { energyMax } from '../src/laborSlots'
import { testSpecialty, testToolTiers } from './testFixtures'

// The daily labour pool is energy POINTS, not integer slots -
// `basePoolPoints` for a solo shop, plus each benched member's
// `laborSlotsPerDay x pointsPerLabour`. Directive 17 case (a): the
// assertions below re-derive off the same content knobs the sim reads.
const BASE = ECONOMY.energy.basePoolPoints
const PER_SLOT = ECONOMY.energy.pointsPerLabour

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

describe('energyMax (crew model, R3; Sprint 94 energy bar)', () => {
  it('is the content base pool with no staff', () => {
    expect(energyMax(baseState([]), ECONOMY)).toBe(BASE)
  })

  it('adds each bench-assigned member their own laborSlotsPerDay x pointsPerLabour (a pair of hands raises the pool)', () => {
    expect(energyMax(baseState([staffMember(1)]), ECONOMY)).toBe(BASE + 1 * PER_SLOT)
    expect(energyMax(baseState([staffMember(2)]), ECONOMY)).toBe(BASE + 2 * PER_SLOT)
    expect(energyMax(baseState([staffMember(2), staffMember(1)]), ECONOMY)).toBe(
      BASE + 3 * PER_SLOT,
    )
  })

  it('adds nothing for a contract-assigned member (their labour is on the fleet)', () => {
    expect(energyMax(baseState([staffMember(2, 'contract')]), ECONOMY)).toBe(BASE)
    // Mixed crew: only the benched member counts.
    expect(
      energyMax(baseState([staffMember(2, 'contract'), staffMember(1, 'bench')]), ECONOMY),
    ).toBe(BASE + 1 * PER_SLOT)
  })
})
