import type { CarInstance, GameState, Job, PartInstance } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { applyLaborToJob, completeJob, createJob, isJobComplete } from '../src/jobs'

function emptyBuildSheet() {
  return {
    engine: null,
    forcedInduction: null,
    drivetrain: null,
    suspension: null,
    brakes: null,
    bodyAero: null,
    wheelsInterior: null,
  }
}

const car: CarInstance = {
  id: 'car-0001',
  modelId: 'honda-city-e-aa',
  year: 1984,
  mileageKm: 100_000,
  color: 'White',
  provenanceNote: '',
  condition: { engine: 40, drivetrain: 40, suspension: 40, body: 30, interior: 40 },
  hiddenIssues: [],
  authenticityPercent: 90,
  buildSheet: emptyBuildSheet(),
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
    ...overrides,
  }
}

describe('createJob / applyLaborToJob / isJobComplete', () => {
  it('creates a job with zero labor spent', () => {
    const job = createJob(
      { carInstanceId: car.id, kind: 'repair-zone', zone: 'body', laborSlotsRequired: 3 },
      'job-1',
    )
    expect(job.laborSlotsSpent).toBe(0)
    expect(isJobComplete(job)).toBe(false)
  })

  it('applyLaborToJob clamps at laborSlotsRequired', () => {
    const job = createJob(
      { carInstanceId: car.id, kind: 'repair-zone', zone: 'body', laborSlotsRequired: 3 },
      'job-1',
    )
    const progressed = applyLaborToJob(job, 10)
    expect(progressed.laborSlotsSpent).toBe(3)
    expect(isJobComplete(progressed)).toBe(true)
  })
})

describe('completeJob', () => {
  it('a completed repair-zone job restores the zone to 100', () => {
    const job: Job = {
      id: 'job-1',
      carInstanceId: car.id,
      kind: 'repair-zone',
      zone: 'body',
      laborSlotsRequired: 3,
      laborSlotsSpent: 3,
    }
    const result = completeJob(baseState(), job)
    expect(result.blockedByOccupiedSlot).toBe(false)
    expect(result.state.ownedCars[0]?.condition.body).toBe(100)
    expect(result.state.ownedCars[0]?.condition.engine).toBe(40)
  })

  it('a completed install-part job moves the part from inventory into the build sheet', () => {
    const job: Job = {
      id: 'job-2',
      carInstanceId: car.id,
      kind: 'install-part',
      slot: 'suspension',
      partInstanceId: sparePart.id,
      laborSlotsRequired: 1,
      laborSlotsSpent: 1,
    }
    const result = completeJob(baseState(), job)
    expect(result.blockedByOccupiedSlot).toBe(false)
    expect(result.state.ownedCars[0]?.buildSheet.suspension?.id).toBe(sparePart.id)
    expect(result.state.partInventory).toHaveLength(0)
  })

  it('an install-part job into an occupied slot is blocked, not overwritten', () => {
    const occupiedCar: CarInstance = {
      ...car,
      buildSheet: {
        ...emptyBuildSheet(),
        suspension: {
          id: 'pi-existing',
          partId: 'tanuki-n1-coilovers',
          conditionPercent: 80,
          genuinePeriod: true,
        },
      },
    }
    const job: Job = {
      id: 'job-3',
      carInstanceId: car.id,
      kind: 'install-part',
      slot: 'suspension',
      partInstanceId: sparePart.id,
      laborSlotsRequired: 1,
      laborSlotsSpent: 1,
    }
    const result = completeJob(baseState({ ownedCars: [occupiedCar] }), job)
    expect(result.blockedByOccupiedSlot).toBe(true)
    expect(result.state.ownedCars[0]?.buildSheet.suspension?.id).toBe('pi-existing')
    expect(result.state.partInventory).toHaveLength(1)
  })
})
