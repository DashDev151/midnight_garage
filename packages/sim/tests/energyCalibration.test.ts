import {
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type GameState,
  type StaffMember,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { planGroupRepair } from '../src/bands'
import { buildSimContext } from '../src/context'
import { energyMax } from '../src/laborSlots'
import { buildCarInstance, groupCarParts, testSpecialty, testToolTiers } from './testFixtures'

/**
 * A calibration probe, closed-form (no bots, no RNG) - the honest check
 * that the continuous daily labour bar is calibrated so day-1 is
 * unchanged and tools + staff are the loosening levers. Every figure is a
 * direct call into the real `energyMax` / `planGroupRepair`, so it can
 * never drift from what the game does.
 *
 * "Throughput" here is grade-climbs a shop can afford in one day: the
 * daily energy pool divided by the per-grade repair cost at its tools.
 * Day-1 is a fresh solo tier-1 shop; late game is a full bench on tier-3
 * tools. The ratio between them is DISCLOSED (not force-pinned) so the
 * loosening curve stays honest.
 */
const CONTEXT = buildSimContext([], PARTS, [], PARTS_TAXONOMY)
const { basePoolPoints, pointsPerLabour, energyPerGradeByTier: EPG } = ECONOMY.energy

/** A minimal GameState carrying only what `energyMax` reads (its staff roster);
 * every other field is a neutral placeholder. */
function stateWithStaff(staff: StaffMember[]): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 0,
    reputationTier: 'unknown',
    reputationPoints: 0,
    specialty: testSpecialty(),
    ownedCars: [],
    partInventory: [],
    staff,
    staffAds: [],
    jobs: [],
    marketHeat: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
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
    carLedgers: {},
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    storyMissions: [],
  }
}

const benchMember = (laborSlotsPerDay: 1 | 2): StaffMember => ({
  id: `crew-${laborSlotsPerDay}`,
  displayName: 'Crew',
  stats: { engine: 1, chassis: 1, body: 1 },
  laborSlotsPerDay,
  assignment: 'bench',
  pendingAssignment: null,
  weeklyWageYen: 40_000,
  trait: 'night-owl',
})

/** A representative fresh-shop repair: a worn body group (all-surface, so the
 * whole group is on-car workable) climbed to fine at the given tool tier. */
function bodyRepairEnergy(tier: 1 | 2 | 3): number {
  const car = buildCarInstance({ parts: groupCarParts({ body: 'worn' }) })
  return planGroupRepair(
    car,
    'body',
    'fine',
    testToolTiers({ body: tier }),
    CONTEXT.partIdsByGroup,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    ECONOMY.restoration.repairStepFraction,
    EPG,
  ).laborSlotsRequired
}

describe('Sprint 94 energy-bar calibration (day-1 unchanged; tools + staff loosen)', () => {
  it('a fresh solo tier-1 shop starts with the day-1-unchanged base pool (old PLAYER_BASE_LABOR_SLOTS x pointsPerLabour = 6 x 10)', () => {
    expect(energyMax(stateWithStaff([]), ECONOMY)).toBe(basePoolPoints)
    expect(basePoolPoints).toBe(6 * pointsPerLabour)
    // Tier 1 costs exactly one labour per grade - the old one-slot-per-grade,
    // so day-1's repair pacing is byte-identical to the pre-Sprint-94 model.
    expect(EPG[1]).toBe(pointsPerLabour)
  })

  it('day-1 is not softlocked: the daily pool affords a representative worn-body repair with room to spare', () => {
    const daily = energyMax(stateWithStaff([]), ECONOMY)
    const repair = bodyRepairEnergy(1)
    expect(repair).toBeGreaterThan(0)
    // A full worn->fine surface-body repair fits inside one day's labour - a
    // fresh shop completes meaningful work on day 1 (and has energy left over).
    expect(repair).toBeLessThanOrEqual(daily)
  })

  it('owning better tools measurably raises throughput: the same repair costs strictly less energy at tier 3', () => {
    expect(bodyRepairEnergy(3)).toBeLessThan(bodyRepairEnergy(1))
    // Genuine fraction, not a rounded whole slot: tier-3 per-grade cost is below tier-1's.
    expect(EPG[3]).toBeLessThan(EPG[1])
  })

  it('benching staff measurably raises the pool: a 2-slot member adds 2 x pointsPerLabour energy', () => {
    const solo = energyMax(stateWithStaff([]), ECONOMY)
    const withCrew = energyMax(stateWithStaff([benchMember(2)]), ECONOMY)
    expect(withCrew).toBe(solo + 2 * pointsPerLabour)
    expect(withCrew).toBeGreaterThan(solo)
  })

  it('discloses the day-1 vs late-game throughput ratio (honest loosening), and the loosening is real', () => {
    // Throughput = grade-climbs affordable per day = daily energy / per-grade cost.
    const day1Daily = energyMax(stateWithStaff([]), ECONOMY)
    const day1Throughput = day1Daily / EPG[1]

    // Late game: a full bench of 2-slot members on tier-3 tools.
    const fullBench = Array.from({ length: ECONOMY.staff.maxStaff }, () => benchMember(2))
    const lateDaily = energyMax(stateWithStaff(fullBench), ECONOMY)
    const lateThroughput = lateDaily / EPG[3]

    const ratio = lateThroughput / day1Throughput
    // The honest day-1 -> late-game loosening curve, pinned as assertions (not a
    // console disclosure - sim has no DOM/node lib). Day-1 is exactly the old 6
    // grades/day; late game (tier-3 + a full 2-slot bench) is 35.
    expect(day1Throughput).toBe(6)
    expect(lateThroughput).toBe(35)
    // The gate: the loosening is real (late game genuinely out-works day 1) but
    // not absurd (an order of magnitude is the sane ceiling for this arc).
    expect(ratio).toBeGreaterThan(1)
    expect(ratio).toBeLessThan(10)
  })
})
