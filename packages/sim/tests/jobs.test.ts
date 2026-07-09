import type { CarInstance, GameState, Job, PartInstance } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  applyAvailableLaborToJob,
  applyLaborToJob,
  completeJob,
  createJob,
  findOrCreateJob,
  isJobComplete,
  resolveJobLabor,
} from '../src/jobs'

function emptyComponents() {
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
    cashYen: 0,
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
    serviceBayCarIds: [],
    laborSlotsSpentToday: 0,
    ...overrides,
  }
}

describe('createJob / applyLaborToJob / isJobComplete', () => {
  it('creates a job with zero labor spent', () => {
    const job = createJob(
      { carInstanceId: car.id, kind: 'repair-zone', componentId: 'body', laborSlotsRequired: 3 },
      'job-1',
    )
    expect(job.laborSlotsSpent).toBe(0)
    expect(isJobComplete(job)).toBe(false)
  })

  it('applyLaborToJob clamps at laborSlotsRequired', () => {
    const job = createJob(
      { carInstanceId: car.id, kind: 'repair-zone', componentId: 'body', laborSlotsRequired: 3 },
      'job-1',
    )
    const progressed = applyLaborToJob(job, 10)
    expect(progressed.laborSlotsSpent).toBe(3)
    expect(isJobComplete(progressed)).toBe(true)
  })
})

describe('completeJob', () => {
  it('a completed repair-zone job restores the component to 100', () => {
    const job: Job = {
      id: 'job-1',
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId: 'body',
      laborSlotsRequired: 3,
      laborSlotsSpent: 3,
    }
    const result = completeJob(baseState(), job)
    expect(result.blockedByOccupiedSlot).toBe(false)
    expect(result.state.ownedCars[0]?.components.body.condition).toBe(100)
    expect(result.state.ownedCars[0]?.components.engine.condition).toBe(40)
  })

  it('a completed install-part job moves the part from inventory onto the component', () => {
    const job: Job = {
      id: 'job-2',
      carInstanceId: car.id,
      kind: 'install-part',
      componentId: 'suspension',
      partInstanceId: sparePart.id,
      laborSlotsRequired: 1,
      laborSlotsSpent: 1,
    }
    const result = completeJob(baseState(), job)
    expect(result.blockedByOccupiedSlot).toBe(false)
    expect(result.state.ownedCars[0]?.components.suspension.installed?.id).toBe(sparePart.id)
    expect(result.state.partInventory).toHaveLength(0)
  })

  it('an install-part job into an occupied component is blocked, not overwritten', () => {
    const occupiedCar: CarInstance = {
      ...car,
      components: {
        ...emptyComponents(),
        suspension: {
          condition: 40,
          installed: {
            id: 'pi-existing',
            partId: 'tanuki-n1-coilovers',
            conditionPercent: 80,
            genuinePeriod: true,
          },
        },
      },
    }
    const job: Job = {
      id: 'job-3',
      carInstanceId: car.id,
      kind: 'install-part',
      componentId: 'suspension',
      partInstanceId: sparePart.id,
      laborSlotsRequired: 1,
      laborSlotsSpent: 1,
    }
    const result = completeJob(baseState({ ownedCars: [occupiedCar] }), job)
    expect(result.blockedByOccupiedSlot).toBe(true)
    expect(result.state.ownedCars[0]?.components.suspension.installed?.id).toBe('pi-existing')
    expect(result.state.partInventory).toHaveLength(1)
  })
})

describe('findOrCreateJob (Sprint 11)', () => {
  it('creates a new job when none is open for this car+component', () => {
    const result = findOrCreateJob(baseState(), {
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId: 'body',
      laborSlotsRequired: 3,
    })
    expect(result.job.laborSlotsSpent).toBe(0)
    expect(result.state.jobs).toHaveLength(1)
  })

  it('returns the same already-open job on a repeat call, not a duplicate', () => {
    const spec = {
      carInstanceId: car.id,
      kind: 'repair-zone' as const,
      componentId: 'body' as const,
      laborSlotsRequired: 3,
    }
    const first = findOrCreateJob(baseState(), spec)
    const second = findOrCreateJob(first.state, spec)
    expect(second.job.id).toBe(first.job.id)
    expect(second.state.jobs).toHaveLength(1)
  })

  it('a different component on the same car gets its own job', () => {
    const first = findOrCreateJob(baseState(), {
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId: 'body',
      laborSlotsRequired: 3,
    })
    const second = findOrCreateJob(first.state, {
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId: 'engine',
      laborSlotsRequired: 2,
    })
    expect(second.job.id).not.toBe(first.job.id)
    expect(second.state.jobs).toHaveLength(2)
  })
})

describe('applyAvailableLaborToJob (Sprint 11)', () => {
  it('applies up to the offered labor, clamped to what the job needs, and books the daily spend', () => {
    const created = findOrCreateJob(baseState({ serviceBayCarIds: [car.id] }), {
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId: 'body',
      laborSlotsRequired: 3,
    })
    const result = applyAvailableLaborToJob(created.state, created.job.id, 2)
    expect(result.laborSlotsUsed).toBe(2)
    expect(result.state.laborSlotsSpentToday).toBe(2)
    expect(result.state.jobs[0]?.laborSlotsSpent).toBe(2)
  })

  it('completes and removes the job the instant it crosses its requirement', () => {
    const created = findOrCreateJob(baseState({ serviceBayCarIds: [car.id] }), {
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId: 'body',
      laborSlotsRequired: 2,
    })
    const result = applyAvailableLaborToJob(created.state, created.job.id, 5)
    expect(result.laborSlotsUsed).toBe(2) // clamped to what the job needed, not the offer
    expect(result.state.jobs).toHaveLength(0)
    expect(result.state.ownedCars[0]?.components.body.condition).toBe(100)
    expect(result.log.some((e) => e.type === 'job-completed')).toBe(true)
  })

  it('does nothing for a car not sitting in a service bay (labor never reaches it)', () => {
    const created = findOrCreateJob(baseState(), {
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId: 'body',
      laborSlotsRequired: 3,
    })
    const result = applyAvailableLaborToJob(created.state, created.job.id, 2)
    expect(result.laborSlotsUsed).toBe(0)
    expect(result.state.jobs[0]?.laborSlotsSpent).toBe(0)
    expect(result.log.some((e) => e.type === 'job-blocked')).toBe(true)
  })

  it('is a no-op for an unknown job id', () => {
    const state = baseState()
    const result = applyAvailableLaborToJob(state, 'no-such-job', 5)
    expect(result).toEqual({ state, log: [], laborSlotsUsed: 0 })
  })
})

describe('resolveJobLabor (Sprint 11) — the instant player-facing resolver', () => {
  it('composes find-or-create + apply-labor in one call', () => {
    const state = baseState({ serviceBayCarIds: [car.id] })
    const spec = {
      carInstanceId: car.id,
      kind: 'repair-zone' as const,
      componentId: 'body' as const,
      laborSlotsRequired: 3,
    }
    const result = resolveJobLabor(state, spec, 2)
    expect(result.laborSlotsUsed).toBe(2)
    expect(result.state.jobs[0]?.laborSlotsSpent).toBe(2)
  })

  it('a repeat click continues the same job instead of creating a duplicate', () => {
    const state = baseState({ serviceBayCarIds: [car.id] })
    const spec = {
      carInstanceId: car.id,
      kind: 'repair-zone' as const,
      componentId: 'body' as const,
      laborSlotsRequired: 3,
    }
    const first = resolveJobLabor(state, spec, 1)
    const second = resolveJobLabor(first.state, spec, 5)
    expect(second.state.jobs).toHaveLength(0) // completed and removed
    expect(second.state.ownedCars[0]?.components.body.condition).toBe(100)
  })
})
