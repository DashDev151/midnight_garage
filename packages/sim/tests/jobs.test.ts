import {
  CARS,
  EQUIPMENT,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type GameState,
  type Job,
  type PartInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  applyAvailableLaborToJob,
  applyLaborToJob,
  completeJob,
  createJob,
  findOrCreateJob,
  isJobComplete,
  repairJobGate,
  resolveJobLabor,
} from '../src/jobs'
import { planGroupRepair } from '../src/bands'
import { buildSimContext } from '../src/context'
import { buildCarInstance, groupCarParts } from './testFixtures'

// Real CARS/PARTS (not empty arrays) since Sprint 24 fix 2: `findOrCreateJob`
// now validates install-part fit against the actual model/part catalog, so
// an install spec needs both to resolve to something real.
const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY, [], undefined, [], EQUIPMENT)

/** Equipment ids covering the components these tests repair - owned by default so job-creation
 * tests aren't incidentally blocked by the Sprint 13 equipment gate, which has its own tests below. */
const WELDER = EQUIPMENT.find((e) => e.componentIds.includes('body'))!
const ENGINE_CRANE = EQUIPMENT.find((e) => e.componentIds.includes('engine'))!

const car: CarInstance = buildCarInstance({
  id: 'car-0001',
  modelId: 'honda-city-e-aa',
  year: 1984,
  mileageKm: 100_000,
  authenticityPercent: 90,
  parts: groupCarParts({
    engine: 'worn',
    drivetrain: 'worn',
    suspension: 'worn',
    body: 'poor',
    interior: 'worn',
  }),
})

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
    carsForSale: [],
    pendingOffers: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    parkingCarIds: [],
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: [WELDER.id, ENGINE_CRANE.id],
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    ...overrides,
  }
}

describe('createJob / applyLaborToJob / isJobComplete', () => {
  it('creates a job with zero labor spent', () => {
    const job = createJob(
      {
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'mint',
        laborSlotsRequired: 3,
      },
      'job-1',
    )
    expect(job.laborSlotsSpent).toBe(0)
    expect(isJobComplete(job)).toBe(false)
  })

  it('applyLaborToJob clamps at laborSlotsRequired', () => {
    const job = createJob(
      {
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'mint',
        laborSlotsRequired: 3,
      },
      'job-1',
    )
    const progressed = applyLaborToJob(job, 10)
    expect(progressed.laborSlotsSpent).toBe(3)
    expect(isJobComplete(progressed)).toBe(true)
  })
})

describe('completeJob', () => {
  it('a completed repair-zone job climbs every non-scrap part in the group to the target band', () => {
    const job: Job = {
      id: 'job-1',
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId: 'body',
      targetBand: 'mint',
      laborSlotsRequired: 3,
      laborSlotsSpent: 3,
    }
    const result = completeJob(baseState(), job, CONTEXT)
    expect(result.blockedByOccupiedSlot).toBe(false)
    const parts = result.state.ownedCars[0]!.parts
    expect(parts.panels.band).toBe('mint')
    expect(parts.paint.band).toBe('mint')
    expect(parts.underbody.band).toBe('mint')
    expect(parts.aero.band).toBe('mint')
    // Untouched group.
    expect(parts.block.band).toBe('worn')
  })

  it('a completed install-part job moves the part from inventory onto its slot, setting it mint (Sprint 13)', () => {
    const job: Job = {
      id: 'job-2',
      carInstanceId: car.id,
      kind: 'install-part',
      componentId: 'suspension',
      partInstanceId: sparePart.id,
      laborSlotsRequired: 1,
      laborSlotsSpent: 1,
    }
    const result = completeJob(baseState(), job, CONTEXT)
    expect(result.blockedByOccupiedSlot).toBe(false)
    // The catalog part's own carPartId (dampers) is the real target slot.
    expect(result.state.ownedCars[0]?.parts.dampers.installed?.id).toBe(sparePart.id)
    expect(result.state.ownedCars[0]?.parts.dampers.band).toBe('mint')
    expect(result.state.partInventory).toHaveLength(0)
  })

  it('an install-part job into an occupied slot is blocked, not overwritten', () => {
    const occupiedCar: CarInstance = {
      ...car,
      parts: {
        ...car.parts,
        dampers: {
          band: 'worn',
          fitted: true,
          installed: {
            id: 'pi-existing',
            partId: 'tanuki-n1-coilovers',
            band: 'fine',
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
    const result = completeJob(baseState({ ownedCars: [occupiedCar] }), job, CONTEXT)
    expect(result.blockedByOccupiedSlot).toBe(true)
    expect(result.state.ownedCars[0]?.parts.dampers.installed?.id).toBe('pi-existing')
    expect(result.state.partInventory).toHaveLength(1)
  })
})

describe('findOrCreateJob (Sprint 11)', () => {
  it('creates a new job when none is open for this car+component', () => {
    const result = findOrCreateJob(
      baseState(),
      {
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'mint',
        laborSlotsRequired: 3,
      },
      CONTEXT,
    )
    expect(result.job).not.toBeNull()
    expect(result.job!.laborSlotsSpent).toBe(0)
    expect(result.state.jobs).toHaveLength(1)
  })

  it('returns the same already-open job on a repeat call, not a duplicate', () => {
    const spec = {
      carInstanceId: car.id,
      kind: 'repair-zone' as const,
      componentId: 'body' as const,
      targetBand: 'mint' as const,
      laborSlotsRequired: 3,
    }
    const first = findOrCreateJob(baseState(), spec, CONTEXT)
    const second = findOrCreateJob(first.state, spec, CONTEXT)
    expect(second.job!.id).toBe(first.job!.id)
    expect(second.state.jobs).toHaveLength(1)
  })

  it('a different component on the same car gets its own job', () => {
    const first = findOrCreateJob(
      baseState(),
      {
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'mint',
        laborSlotsRequired: 3,
      },
      CONTEXT,
    )
    const second = findOrCreateJob(
      first.state,
      {
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'engine',
        targetBand: 'mint',
        laborSlotsRequired: 2,
      },
      CONTEXT,
    )
    expect(second.job!.id).not.toBe(first.job!.id)
    expect(second.state.jobs).toHaveLength(2)
  })

  describe('the equipment + consumables + repair-cost gate (Sprint 13; cost added Sprint 26)', () => {
    const spec = {
      carInstanceId: car.id,
      kind: 'repair-zone' as const,
      componentId: 'body' as const,
      targetBand: 'mint' as const,
      laborSlotsRequired: 3,
    }

    it('refuses to create the job (and logs why) when the equipment is not owned', () => {
      const result = findOrCreateJob(baseState({ ownedEquipmentIds: [] }), spec, CONTEXT)
      expect(result.job).toBeNull()
      expect(result.state.jobs).toHaveLength(0)
      expect(result.log).toEqual([
        {
          type: 'job-blocked',
          jobId: `job-${car.id}-repair-zone-body`,
          reason: 'equipment-missing',
        },
      ])
    })

    it("charges consumables plus the group's real repair cost, deducted from cash", () => {
      const plan = planGroupRepair(
        car,
        'body',
        'mint',
        [WELDER.id, ENGINE_CRANE.id],
        CONTEXT.partIdsByGroup,
        CONTEXT.partsTaxonomyById,
        CONTEXT.equipmentById,
      )
      const totalCostYen = WELDER.consumablesCostYen + plan.costYen
      const cashBefore = baseState().cashYen
      const result = findOrCreateJob(baseState(), spec, CONTEXT)
      expect(result.job).not.toBeNull()
      expect(result.state.cashYen).toBe(cashBefore - totalCostYen)
      expect(result.log).toEqual([
        {
          type: 'job-created',
          jobId: result.job!.id,
          carInstanceId: car.id,
          kind: 'repair-zone',
          costYen: totalCostYen,
        },
      ])
    })

    it('does not re-charge when a repeat call continues the existing job', () => {
      const first = findOrCreateJob(baseState(), spec, CONTEXT)
      const second = findOrCreateJob(first.state, spec, CONTEXT)
      expect(second.state.cashYen).toBe(first.state.cashYen)
      expect(second.log).toEqual([])
    })

    it('refuses silently (no log) when equipment is owned but the total cost is unaffordable', () => {
      const plan = planGroupRepair(
        car,
        'body',
        'mint',
        [WELDER.id, ENGINE_CRANE.id],
        CONTEXT.partIdsByGroup,
        CONTEXT.partsTaxonomyById,
        CONTEXT.equipmentById,
      )
      const totalCostYen = WELDER.consumablesCostYen + plan.costYen
      const broke = baseState({ cashYen: totalCostYen - 1 })
      const result = findOrCreateJob(broke, spec, CONTEXT)
      expect(result.job).toBeNull()
      expect(result.state).toBe(broke)
      expect(result.log).toEqual([])
    })

    it('refuses silently when the group has nothing left to repair (already fully mint)', () => {
      const mintCar = buildCarInstance({ id: car.id, modelId: car.modelId })
      const result = findOrCreateJob(baseState({ ownedCars: [mintCar] }), spec, CONTEXT)
      expect(result.job).toBeNull()
      expect(result.log).toEqual([])
    })

    it('install-part job creation is never gated by equipment', () => {
      const result = findOrCreateJob(
        baseState({ ownedEquipmentIds: [] }),
        {
          carInstanceId: car.id,
          kind: 'install-part',
          componentId: 'suspension',
          partInstanceId: sparePart.id,
          laborSlotsRequired: 1,
        },
        CONTEXT,
      )
      expect(result.job).not.toBeNull()
    })
  })

  describe('the install-fit gate (Sprint 24 fix 2; scrap-block added Sprint 26)', () => {
    it('refuses a part that does not fit the target group, state unchanged', () => {
      const wrongPart = PARTS.find((p) => p.carPartId === 'ignitionEcu')!
      const wrongInstance: PartInstance = {
        id: 'pi-wrong',
        partId: wrongPart.id,
        band: 'mint',
        genuinePeriod: false,
      }
      const state = baseState({ partInventory: [sparePart, wrongInstance] })
      const result = findOrCreateJob(
        state,
        {
          carInstanceId: car.id,
          kind: 'install-part',
          componentId: 'suspension',
          partInstanceId: wrongInstance.id,
          laborSlotsRequired: 1,
        },
        CONTEXT,
      )
      expect(result.job).toBeNull()
      expect(result.state).toBe(state)
      expect(result.log).toEqual([
        {
          type: 'job-blocked',
          jobId: 'job-car-0001-install-part-suspension',
          reason: 'part-does-not-fit',
        },
      ])
      // Nothing moved - inventory and the car's own parts are untouched.
      expect(result.state.partInventory).toHaveLength(2)
      expect(result.state.ownedCars[0]?.parts.dampers.installed).toBeNull()
    })

    it('refuses a partInstanceId that does not exist in inventory', () => {
      const result = findOrCreateJob(
        baseState(),
        {
          carInstanceId: car.id,
          kind: 'install-part',
          componentId: 'suspension',
          partInstanceId: 'not-a-real-instance',
          laborSlotsRequired: 1,
        },
        CONTEXT,
      )
      expect(result.job).toBeNull()
    })

    it('refuses a scrap PartInstance universally, even though it fits the group (decision 6)', () => {
      const scrapInstance: PartInstance = {
        id: 'pi-scrap',
        partId: sparePart.partId,
        band: 'scrap',
        genuinePeriod: false,
      }
      const state = baseState({ partInventory: [scrapInstance] })
      const result = findOrCreateJob(
        state,
        {
          carInstanceId: car.id,
          kind: 'install-part',
          componentId: 'suspension',
          partInstanceId: scrapInstance.id,
          laborSlotsRequired: 1,
        },
        CONTEXT,
      )
      expect(result.job).toBeNull()
    })
  })
})

describe('repairJobGate (Sprint 13; real cost added Sprint 26)', () => {
  it('passes install-part specs through untouched, regardless of equipment', () => {
    const state = baseState({ ownedEquipmentIds: [] })
    const gate = repairJobGate(
      state,
      {
        carInstanceId: car.id,
        kind: 'install-part',
        componentId: 'suspension',
        partInstanceId: sparePart.id,
        laborSlotsRequired: 1,
      },
      CONTEXT,
    )
    expect(gate).toEqual({ ok: true, state })
  })

  it('refuses when every part in the target group is scrap - nothing repairable', () => {
    const scrapCar = buildCarInstance({
      id: car.id,
      modelId: car.modelId,
      parts: groupCarParts({ body: 'scrap' }),
    })
    const gate = repairJobGate(
      baseState({ ownedCars: [scrapCar] }),
      {
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'mint',
        laborSlotsRequired: 1,
      },
      CONTEXT,
    )
    expect(gate.ok).toBe(false)
  })
})

describe('applyAvailableLaborToJob (Sprint 11)', () => {
  it('applies up to the offered labor, clamped to what the job needs, and books the daily spend', () => {
    const created = findOrCreateJob(
      baseState({ serviceBayCarIds: [car.id] }),
      {
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'mint',
        laborSlotsRequired: 3,
      },
      CONTEXT,
    )
    const result = applyAvailableLaborToJob(created.state, created.job!.id, 2, CONTEXT)
    expect(result.laborSlotsUsed).toBe(2)
    expect(result.state.laborSlotsSpentToday).toBe(2)
    expect(result.state.jobs[0]?.laborSlotsSpent).toBe(2)
  })

  it('completes and removes the job the instant it crosses its requirement', () => {
    const created = findOrCreateJob(
      baseState({ serviceBayCarIds: [car.id] }),
      {
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'mint',
        laborSlotsRequired: 2,
      },
      CONTEXT,
    )
    const result = applyAvailableLaborToJob(created.state, created.job!.id, 5, CONTEXT)
    expect(result.laborSlotsUsed).toBe(2) // clamped to what the job needed, not the offer
    expect(result.state.jobs).toHaveLength(0)
    expect(result.state.ownedCars[0]?.parts.panels.band).toBe('mint')
    expect(result.log.some((e) => e.type === 'job-completed')).toBe(true)
  })

  it('does nothing for a car not sitting in a service bay (labor never reaches it)', () => {
    const created = findOrCreateJob(
      baseState(),
      {
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'mint',
        laborSlotsRequired: 3,
      },
      CONTEXT,
    )
    const result = applyAvailableLaborToJob(created.state, created.job!.id, 2, CONTEXT)
    expect(result.laborSlotsUsed).toBe(0)
    expect(result.state.jobs[0]?.laborSlotsSpent).toBe(0)
    expect(result.log.some((e) => e.type === 'job-blocked')).toBe(true)
  })

  it('is a no-op for an unknown job id', () => {
    const state = baseState()
    const result = applyAvailableLaborToJob(state, 'no-such-job', 5, CONTEXT)
    expect(result).toEqual({ state, log: [], laborSlotsUsed: 0 })
  })
})

describe('resolveJobLabor (Sprint 11) - the instant player-facing resolver', () => {
  it('composes find-or-create + apply-labor in one call', () => {
    const state = baseState({ serviceBayCarIds: [car.id] })
    const spec = {
      carInstanceId: car.id,
      kind: 'repair-zone' as const,
      componentId: 'body' as const,
      targetBand: 'mint' as const,
      laborSlotsRequired: 3,
    }
    const result = resolveJobLabor(state, spec, 2, CONTEXT)
    expect(result.laborSlotsUsed).toBe(2)
    expect(result.state.jobs[0]?.laborSlotsSpent).toBe(2)
  })

  it('a repeat click continues the same job instead of creating a duplicate', () => {
    const state = baseState({ serviceBayCarIds: [car.id] })
    const spec = {
      carInstanceId: car.id,
      kind: 'repair-zone' as const,
      componentId: 'body' as const,
      targetBand: 'mint' as const,
      laborSlotsRequired: 3,
    }
    const first = resolveJobLabor(state, spec, 1, CONTEXT)
    const second = resolveJobLabor(first.state, spec, 5, CONTEXT)
    expect(second.state.jobs).toHaveLength(0) // completed and removed
    expect(second.state.ownedCars[0]?.parts.panels.band).toBe('mint')
  })

  it('returns the gate-refusal log and does nothing when equipment is missing', () => {
    const state = baseState({ serviceBayCarIds: [car.id], ownedEquipmentIds: [] })
    const spec = {
      carInstanceId: car.id,
      kind: 'repair-zone' as const,
      componentId: 'body' as const,
      targetBand: 'mint' as const,
      laborSlotsRequired: 3,
    }
    const result = resolveJobLabor(state, spec, 2, CONTEXT)
    expect(result.laborSlotsUsed).toBe(0)
    expect(result.state.jobs).toHaveLength(0)
    expect(
      result.log.some((e) => e.type === 'job-blocked' && e.reason === 'equipment-missing'),
    ).toBe(true)
  })
})
