import {
  CARS,
  EQUIPMENT,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type GameState,
  type PartInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { planGroupRepair } from '../src/bands'
import { buildSimContext } from '../src/context'
import { clearStagedWork, confirmStagedWork } from '../src/stagedWork'
import { buildCarInstance, groupCarParts } from './testFixtures'

// Real CARS/PARTS (Sprint 24 fix 2: findOrCreateJob validates install-part
// fit against the real catalog, so an install spec needs both to resolve).
const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY, [], undefined, [], EQUIPMENT)

/** Equipment covering the components these tests repair - owned by default so confirm tests
 * aren't incidentally blocked by the equipment gate, which has its own dedicated test below. */
const WELDER = EQUIPMENT.find((e) => e.componentIds.includes('body'))!
const ENGINE_CRANE = EQUIPMENT.find((e) => e.componentIds.includes('engine'))!
const OWNED_EQUIPMENT_IDS = [WELDER.id, ENGINE_CRANE.id]

const car: CarInstance = buildCarInstance({
  id: 'car-0001',
  modelId: 'honda-city-e-aa',
  year: 1984,
  mileageKm: 100_000,
  authenticityPercent: 90,
  parts: groupCarParts({ body: 'poor', engine: 'worn', suspension: 'worn' }),
})

/** Real labor-slot plans for this fixture car, computed the same way
 * `confirmStagedWork` itself does - tests assert against these rather than
 * a hand-guessed number, so a `parts-taxonomy.json`/equipment retune can't
 * silently desync the fixture from the assertions. */
function planFor(groupId: 'body' | 'engine' | 'suspension') {
  return planGroupRepair(
    car,
    groupId,
    'mint',
    OWNED_EQUIPMENT_IDS,
    CONTEXT.partIdsByGroup,
    CONTEXT.partsTaxonomyById,
    CONTEXT.equipmentById,
  )
}

const sparePart: PartInstance = {
  id: 'pi-0001',
  partId: 'tanuki-street-coilovers',
  band: 'mint',
  genuinePeriod: false,
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 42,
    cashYen: 5_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    serviceJobOffers: [],
    activeServiceJobs: [],
    ownedCars: [car],
    partInventory: [sparePart],
    staff: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    activeListings: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [car.id],
    parkingCarIds: [],
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: OWNED_EQUIPMENT_IDS,
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
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
    expect(result.state.ownedCars[0]?.parts.panels.band).toBe('mint')
    expect(result.state.ownedCars[0]?.parts.aero.band).toBe('mint')
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
    const enginePlan = planFor('engine')
    // Enough for body (staged first) to complete fully, plus exactly 1 slot
    // spillover for engine (staged second) - a real, continuable partial job.
    const offeredLabor = bodyPlan.laborSlotsRequired + 1
    const state = baseState({
      stagedCarWork: {
        [car.id]: [
          { kind: 'repair', componentId: 'body', targetBand: 'mint' },
          { kind: 'repair', componentId: 'engine', targetBand: 'mint' },
        ],
      },
    })
    const result = confirmStagedWork(state, car.id, offeredLabor, CONTEXT)
    expect(result.state.ownedCars[0]?.parts.panels.band).toBe('mint')
    expect(result.state.ownedCars[0]?.parts.block.band).toBe('worn') // not yet repaired
    const engineJob = result.state.jobs.find((j) => j.componentId === 'engine')
    expect(engineJob).toBeDefined()
    expect(engineJob?.laborSlotsSpent).toBe(1)
    expect(engineJob?.laborSlotsRequired).toBe(enginePlan.laborSlotsRequired)
  })

  it('the equipment gate still refuses a staged repair at confirm time', () => {
    const state = baseState({
      ownedEquipmentIds: [], // neither WELDER nor ENGINE_CRANE owned
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }] },
    })
    const result = confirmStagedWork(state, car.id, 3, CONTEXT)
    expect(result.state.ownedCars[0]?.parts.panels.band).toBe('poor') // unchanged
    expect(result.state.jobs).toHaveLength(0)
    expect(
      result.log.some((e) => e.type === 'job-blocked' && e.reason === 'equipment-missing'),
    ).toBe(true)
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
