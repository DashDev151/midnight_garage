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
import {
  buildCarInstance,
  groupCarParts,
  testSceneStanding,
  testToolLevels,
  testToolTiers,
} from './testFixtures'

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
const { basePoolPoints, pointsPerLabour, energyPerBandStepByToolTier: EPG } = ECONOMY.energy

/** A minimal GameState carrying only what `energyMax` reads (its staff roster);
 * every other field is a neutral placeholder. */
function stateWithStaff(staff: StaffMember[]): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 0,
    reputationTier: 'unknown',
    reputationPoints: 0,
    sceneStanding: testSceneStanding(),
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
    forecourtBayCount: 2,
    forecourtCarIds: [null, null],
    graceParkingCarId: null,
    energySpentToday: 0,
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    carLedgers: {},
    toolShopsOwned: [],
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    workbenchPartId: null,
    machinePartId: null,
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
    testToolLevels({ body: tier }),
    CONTEXT.partIdsByGroup,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    ECONOMY.restoration.repairStepFraction,
    EPG,
  ).laborSlotsRequired
}

describe('energy-bar calibration (a day holds more than it used to; tools + staff loosen further)', () => {
  /**
   * The base pool was raised from 6 labour slots to 8 because a day ran out
   * too soon to finish anything satisfying. Every labour COST is untouched:
   * only the pool grew, so the same work simply fits.
   */
  it('a fresh solo tier-1 shop starts on the base pool of 8 labour slots', () => {
    expect(energyMax(stateWithStaff([]), ECONOMY)).toBe(basePoolPoints)
    expect(basePoolPoints).toBe(8 * pointsPerLabour)
    // Sprint213.md item 4 (labour-cost deflation) trims tier 1's per-band-step
    // cost again, from half a labour slot to two-fifths of one: a clean
    // entry-tier rebuild now runs a fraction of its old point cost without
    // touching any repair's yen cost at all.
    expect(EPG[1]).toBe(4)
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
    // The honest day-1 to late-game loosening curve, pinned as assertions (not
    // a console disclosure - sim has no DOM/node lib). Sprint213.md item 4
    // trimmed EPG[1] 5 -> 4 and EPG[3] 3 -> 2 (the whole tool-tier curve
    // shifted down by one, preserving its own shape - see economy.json's own
    // comment on the interlock), so day 1 now climbs 20 grades (80 / 4) and
    // late game 80 (160 / 2).
    expect(day1Throughput).toBe(20)
    expect(lateThroughput).toBe(80)
    // The gate: the loosening is real (late game genuinely out-works day 1) but
    // not absurd (an order of magnitude is the sane ceiling for this arc).
    expect(ratio).toBeGreaterThan(1)
    expect(ratio).toBeLessThan(10)
  })
})
