import {
  EQUIPMENT,
  type CarInstance,
  type GameState,
  type PartInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { clearStagedWork, confirmStagedWork } from '../src/stagedWork'

const CONTEXT = buildSimContext([], [], [], [], [], undefined, [], EQUIPMENT)

/** Equipment covering the components these tests repair — owned by default so confirm tests
 * aren't incidentally blocked by the equipment gate, which has its own dedicated test below. */
const WELDER = EQUIPMENT.find((e) => e.componentIds.includes('body'))!
const ENGINE_CRANE = EQUIPMENT.find((e) => e.componentIds.includes('engine'))!

function emptyComponents(): CarInstance['components'] {
  return {
    engine: { condition: 40, installed: null },
    forcedInduction: { condition: 100, installed: null },
    drivetrain: { condition: 40, installed: null },
    suspension: { condition: 40, installed: null },
    brakes: { condition: 100, installed: null },
    wheels: { condition: 100, installed: null },
    body: { condition: 30, installed: null },
    interior: { condition: 40, installed: null },
  }
}

const car: CarInstance = {
  id: 'car-0001',
  modelId: 'honda-city-e-aa',
  year: 1984,
  mileageKm: 100_000,
  color: 'White',
  provenanceNote: '',
  hiddenIssues: [],
  authenticityPercent: 90,
  components: emptyComponents(),
}

const sparePart: PartInstance = {
  id: 'pi-0001',
  partId: 'tanuki-street-coilovers',
  conditionPercent: 100,
  genuinePeriod: false,
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 42,
    cashYen: 1_000_000,
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
    ownedEquipmentIds: [WELDER.id, ENGINE_CRANE.id],
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    ...overrides,
  }
}

describe('clearStagedWork', () => {
  it('drops the given car’s staged entry, leaving others untouched', () => {
    const state = baseState({
      stagedCarWork: {
        [car.id]: [{ kind: 'repair', componentId: 'body' }],
        'other-car': [{ kind: 'repair', componentId: 'engine' }],
      },
    })
    const next = clearStagedWork(state, car.id)
    expect(next.stagedCarWork[car.id]).toBeUndefined()
    expect(next.stagedCarWork['other-car']).toEqual([{ kind: 'repair', componentId: 'engine' }])
  })

  it('is a no-op (same reference) when the car has no staged entry', () => {
    const state = baseState()
    expect(clearStagedWork(state, car.id)).toBe(state)
  })
})

describe('confirmStagedWork', () => {
  it('resolves a single staged repair through the normal job/labor machinery', () => {
    const state = baseState({
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'body' }] },
    })
    // body at condition 30 needs repairLaborSlotsFor(30) = ceil(70/30) = 3 slots.
    const result = confirmStagedWork(state, car.id, 3, CONTEXT)
    expect(result.state.ownedCars[0]?.components.body.condition).toBe(100)
    expect(result.log.some((e) => e.type === 'job-completed')).toBe(true)
  })

  it('resolves a staged install for the exact part instance staged', () => {
    const state = baseState({
      stagedCarWork: {
        [car.id]: [{ kind: 'install', componentId: 'suspension', partInstanceId: sparePart.id }],
      },
    })
    const result = confirmStagedWork(state, car.id, 5, CONTEXT)
    expect(result.state.ownedCars[0]?.components.suspension.installed?.id).toBe(sparePart.id)
    expect(result.state.partInventory).toHaveLength(0)
  })

  it('shares one labor budget across multiple staged actions, in staged order', () => {
    const state = baseState({
      stagedCarWork: {
        [car.id]: [
          { kind: 'repair', componentId: 'body' }, // needs 3 slots (condition 30)
          { kind: 'repair', componentId: 'engine' }, // needs 2 slots (condition 40)
        ],
      },
    })
    // Only 4 available: body (staged first) gets its full 3 and completes;
    // engine gets whatever's left (1), leaving a normal continuable job.
    const result = confirmStagedWork(state, car.id, 4, CONTEXT)
    expect(result.state.ownedCars[0]?.components.body.condition).toBe(100)
    expect(result.state.ownedCars[0]?.components.engine.condition).toBe(40) // not yet repaired
    const engineJob = result.state.jobs.find((j) => j.componentId === 'engine')
    expect(engineJob).toBeDefined()
    expect(engineJob?.laborSlotsSpent).toBe(1)
    expect(engineJob?.laborSlotsRequired).toBe(2)
  })

  it('the equipment gate still refuses a staged repair at confirm time', () => {
    const state = baseState({
      ownedEquipmentIds: [], // neither WELDER nor ENGINE_CRANE owned
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'body' }] },
    })
    const result = confirmStagedWork(state, car.id, 3, CONTEXT)
    expect(result.state.ownedCars[0]?.components.body.condition).toBe(30) // unchanged
    expect(result.state.jobs).toHaveLength(0)
    expect(
      result.log.some((e) => e.type === 'job-blocked' && e.reason === 'equipment-missing'),
    ).toBe(true)
  })

  it('clears the staged list unconditionally, even when an action only partially labors', () => {
    const state = baseState({
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'body' }] },
    })
    const result = confirmStagedWork(state, car.id, 1, CONTEXT) // needs 3, only 1 available
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
