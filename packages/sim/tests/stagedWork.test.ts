import {
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type GameState,
  type PartInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { planGroupRepair } from '../src/bands'
import { buildSimContext } from '../src/context'
import { clearStagedWork, confirmStagedWork, previewPlannedWork } from '../src/stagedWork'
import { buildCarInstance, groupCarParts, testSpecialty, testToolTiers } from './testFixtures'

// Real CARS/PARTS (Sprint 24 fix 2: findOrCreateJob validates install-part
// fit against the real catalog, so an install spec needs both to resolve).
const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)

/** Sprint 36: a mixed-tier shop (body at 2, engine at 3) so the plans these
 * tests derive exercise real tier-sized labor, not just the tier-1 floor. */
const TOOL_TIERS = testToolTiers({ body: 2, engine: 3 })

const car: CarInstance = buildCarInstance({
  id: 'car-0001',
  modelId: 'honda-city-e-aa',
  year: 1984,
  mileageKm: 100_000,
  authenticityPercent: 90,
  parts: {
    // Sprint 71: 'interior' (surface, still on-car-repairable) joins the
    // fixture - 'engine' is bench-only now, so the two-staged-actions test
    // below needs a second on-car-repairable group to spill labor onto.
    ...groupCarParts({ body: 'poor', engine: 'worn', suspension: 'worn', interior: 'worn' }),
    // Sprint 32: every slot defaults to a filled stock part now, so the
    // staged-install test below needs a genuinely empty target slot (a
    // group-level install into an already-occupied slot is refused by the
    // tightened installFitGate) - dampers is the suspension-group part it
    // installs onto.
    dampers: { installed: null },
  },
})

/** Real labor-slot plans for this fixture car, computed the same way
 * `confirmStagedWork` itself does - tests assert against these rather than
 * a hand-guessed number, so a `parts-taxonomy.json`/tool-line retune can't
 * silently desync the fixture from the assertions. */
function planFor(groupId: 'body' | 'engine' | 'suspension' | 'interior') {
  return planGroupRepair(
    car,
    groupId,
    'mint',
    TOOL_TIERS,
    CONTEXT.partIdsByGroup,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    CONTEXT.economy.restoration.repairStepFraction,
  )
}

// Sprint 53: `car` (honda-city-e-aa) is 'shitbox' tier - the fitment-class
// gate refuses a mismatched-class spare part.
const sparePart: PartInstance = {
  id: 'pi-0001',
  partId: 'shitbox-tanuki-street-coilovers',
  band: 'mint',
  genuinePeriod: false,
  origin: { kind: 'market', day: 1 },
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 42,
    cashYen: 5_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    specialty: testSpecialty(),
    serviceJobOffers: [],
    activeServiceJobs: [],
    ownedCars: [car],
    partInventory: [sparePart],
    staff: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [car.id],
    parkingCarIds: [],
    graceParkingCarId: null,
    laborSlotsSpentToday: 0,
    toolTiers: TOOL_TIERS,
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    ...overrides,
  }
}

describe('clearStagedWork', () => {
  it('drops the given car’s staged entry, leaving others untouched', () => {
    const state = baseState({
      stagedCarWork: {
        [car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }],
        'other-car': [{ kind: 'repair', componentId: 'engine', targetBand: 'mint' }],
      },
    })
    const next = clearStagedWork(state, car.id)
    expect(next.stagedCarWork[car.id]).toBeUndefined()
    expect(next.stagedCarWork['other-car']).toEqual([
      { kind: 'repair', componentId: 'engine', targetBand: 'mint' },
    ])
  })

  it('is a no-op (same reference) when the car has no staged entry', () => {
    const state = baseState()
    expect(clearStagedWork(state, car.id)).toBe(state)
  })
})

describe('confirmStagedWork', () => {
  it('resolves a single staged repair through the normal job/labor machinery', () => {
    const plan = planFor('body')
    const state = baseState({
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }] },
    })
    const result = confirmStagedWork(state, car.id, plan.laborSlotsRequired, CONTEXT)
    expect(result.state.ownedCars[0]?.parts.panels.installed?.band).toBe('mint')
    expect(result.state.ownedCars[0]?.parts.aero.installed?.band).toBe('mint')
    expect(result.log.some((e) => e.type === 'job-completed')).toBe(true)
  })

  it('resolves a staged install for the exact part instance staged', () => {
    const state = baseState({
      stagedCarWork: {
        [car.id]: [{ kind: 'install', componentId: 'suspension', partInstanceId: sparePart.id }],
      },
    })
    const result = confirmStagedWork(state, car.id, 5, CONTEXT)
    expect(result.state.ownedCars[0]?.parts.dampers.installed?.id).toBe(sparePart.id)
    expect(result.state.partInventory).toHaveLength(0)
  })

  it('shares one labor budget across multiple staged actions, in staged order', () => {
    const bodyPlan = planFor('body')
    const interiorPlan = planFor('interior')
    // Enough for body (staged first) to complete fully, plus exactly 1 slot
    // spillover for interior (staged second) - a real, continuable partial
    // job. Sprint 71: 'interior' stands in for the old 'engine' fixture -
    // engine is bench-only now.
    const offeredLabor = bodyPlan.laborSlotsRequired + 1
    const state = baseState({
      stagedCarWork: {
        [car.id]: [
          { kind: 'repair', componentId: 'body', targetBand: 'mint' },
          { kind: 'repair', componentId: 'interior', targetBand: 'mint' },
        ],
      },
    })
    const result = confirmStagedWork(state, car.id, offeredLabor, CONTEXT)
    expect(result.state.ownedCars[0]?.parts.panels.installed?.band).toBe('mint')
    expect(result.state.ownedCars[0]?.parts.seats.installed?.band).toBe('worn') // not yet repaired
    const interiorJob = result.state.jobs.find((j) => j.componentId === 'interior')
    expect(interiorJob).toBeDefined()
    expect(interiorJob?.laborSlotsSpent).toBe(1)
    expect(interiorJob?.laborSlotsRequired).toBe(interiorPlan.laborSlotsRequired)
  })

  it('the affordability gate still refuses a staged repair at confirm time (Sprint 36: the only gate left)', () => {
    const state = baseState({
      cashYen: 0, // can't cover consumables + the repair's real cost
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }] },
    })
    const result = confirmStagedWork(state, car.id, 3, CONTEXT)
    expect(result.state.ownedCars[0]?.parts.panels.installed?.band).toBe('poor') // unchanged
    expect(result.state.jobs).toHaveLength(0)
  })

  it('clears the staged list unconditionally, even when an action only partially labors', () => {
    const state = baseState({
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }] },
    })
    const result = confirmStagedWork(state, car.id, 1, CONTEXT) // less than the real plan needs
    expect(result.state.stagedCarWork[car.id]).toBeUndefined()
    expect(result.state.jobs[0]?.laborSlotsSpent).toBe(1) // left behind, continuable
  })

  it('is a no-op for a car with no staged entry', () => {
    const state = baseState()
    const result = confirmStagedWork(state, car.id, 5, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})

describe('previewPlannedWork (Sprint 48)', () => {
  it('projects a planned group repair without spending cash, labor, or creating a job', () => {
    const state = baseState({
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }] },
    })
    const preview = previewPlannedWork(state, car.id, CONTEXT)
    expect(preview?.parts.panels.installed?.band).toBe('mint')
    expect(preview?.parts.aero.installed?.band).toBe('mint')
    // Nothing in state itself changed - this is a pure projection.
    expect(state.cashYen).toBe(5_000_000)
    expect(state.jobs).toHaveLength(0)
    expect(state.ownedCars[0]?.parts.panels.installed?.band).toBe('poor')
  })

  it('projects a planned per-part repair, leaving sibling parts in the group untouched', () => {
    const state = baseState({
      stagedCarWork: {
        [car.id]: [
          { kind: 'repair', componentId: 'body', targetBand: 'mint', carPartId: 'panels' },
        ],
      },
    })
    const preview = previewPlannedWork(state, car.id, CONTEXT)
    expect(preview?.parts.panels.installed?.band).toBe('mint')
    expect(preview?.parts.aero.installed?.band).toBe('poor') // untouched - not the addressed part
  })

  it('projects a planned install onto the addressed slot', () => {
    const state = baseState({
      stagedCarWork: {
        [car.id]: [{ kind: 'install', componentId: 'suspension', partInstanceId: sparePart.id }],
      },
    })
    const preview = previewPlannedWork(state, car.id, CONTEXT)
    expect(preview?.parts.dampers.installed?.id).toBe(sparePart.id)
    // The real inventory is untouched - a preview never mutates state.
    expect(state.partInventory).toHaveLength(1)
  })

  it('projects multiple staged actions together, in order', () => {
    const state = baseState({
      stagedCarWork: {
        [car.id]: [
          { kind: 'repair', componentId: 'body', targetBand: 'fine' },
          { kind: 'install', componentId: 'suspension', partInstanceId: sparePart.id },
        ],
      },
    })
    const preview = previewPlannedWork(state, car.id, CONTEXT)
    expect(preview?.parts.panels.installed?.band).toBe('fine')
    expect(preview?.parts.dampers.installed?.id).toBe(sparePart.id)
  })

  it('is a no-op projection (returns the real car unchanged) for a car with nothing planned', () => {
    const state = baseState()
    const preview = previewPlannedWork(state, car.id, CONTEXT)
    expect(preview?.parts.panels.installed?.band).toBe('poor')
  })

  it('returns null for an unknown car', () => {
    const state = baseState()
    expect(previewPlannedWork(state, 'no-such-car', CONTEXT)).toBeNull()
  })
})
