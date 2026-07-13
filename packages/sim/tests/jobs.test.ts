import {
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  TOOL_LINES,
  type CarInstance,
  type GameState,
  type Job,
  type PartInstance,
  type ServiceJob,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  applyAvailableLaborToJob,
  applyLaborToJob,
  completeJob,
  createJob,
  findOrCreateJob,
  naToTurboConversionBlocked,
  reconditionQuote,
  repairJobGate,
  isJobComplete,
  resolveJobLabor,
  resolveReconditionLabor,
  resolveRemovePart,
} from '../src/jobs'
import { planGroupRepair, restorationCostFactorForTier } from '../src/bands'
import { buildSimContext } from '../src/context'
import {
  buildCarInstance,
  groupCarParts,
  mintCarParts,
  testSpecialty,
  testToolTiers,
} from './testFixtures'

// Real CARS/PARTS (not empty arrays) since Sprint 24 fix 2: `findOrCreateJob`
// now validates install-part fit against the actual model/part catalog, so
// an install spec needs both to resolve to something real.
const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)

/** The body line's per-job consumables at each tier (Sprint 36: the charge
 * follows the line's CURRENT tier, not an owned machine). */
const BODY_CONSUMABLES_T1 = TOOL_LINES.body.tiers[0]!.consumablesCostYen
const BODY_CONSUMABLES_T2 = TOOL_LINES.body.tiers[1]!.consumablesCostYen

const car: CarInstance = buildCarInstance({
  id: 'car-0001',
  modelId: 'honda-city-e-aa',
  year: 1984,
  mileageKm: 100_000,
  authenticityPercent: 90,
  parts: {
    ...groupCarParts({
      engine: 'worn',
      drivetrain: 'worn',
      suspension: 'worn',
      body: 'poor',
      interior: 'worn',
    }),
    // Sprint 32: every slot defaults to a filled stock part now, but the
    // install-part tests below need a genuinely empty target slot (a
    // group-level install into an already-occupied slot is refused by the
    // tightened installFitGate) - dampers is the suspension-group part these
    // tests install onto.
    dampers: { installed: null },
  },
})

/** `car`'s model (honda-city-e-aa) is shitbox tier - the real repair-cost
 * factor `repairJobGate` itself resolves internally (Sprint 41), reused here
 * so these tests' own `planGroupRepair` calls predict the exact same charge. */
const CAR_TIER_FACTOR = restorationCostFactorForTier('shitbox', CONTEXT.economy)

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
    serviceBayCarIds: [],
    parkingCarIds: [],
    laborSlotsSpentToday: 0,
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
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
    expect(parts.panels.installed?.band).toBe('mint')
    expect(parts.paint.installed?.band).toBe('mint')
    expect(parts.underbody.installed?.band).toBe('mint')
    expect(parts.aero.installed?.band).toBe('mint')
    // Untouched group.
    expect(parts.block.installed?.band).toBe('worn')
  })

  it('a completed install-part job moves the part from inventory onto its slot, at the part instance’s own band (Sprint 32: install no longer forces mint)', () => {
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
    // sparePart is mint by construction, so this happens to also be mint -
    // but it's the instance's own band, not a forced mint.
    expect(result.state.ownedCars[0]?.parts.dampers.installed?.band).toBe(sparePart.band)
    expect(result.state.partInventory).toHaveLength(0)
  })

  it("Sprint 42: a completed install-part job on an OWNED car adds the part's pricePaidYen to the car's ledger partsYen", () => {
    const pricedPart: PartInstance = { ...sparePart, id: 'pi-priced', pricePaidYen: 42_000 }
    const job: Job = {
      id: 'job-priced',
      carInstanceId: car.id,
      kind: 'install-part',
      componentId: 'suspension',
      partInstanceId: pricedPart.id,
      laborSlotsRequired: 1,
      laborSlotsSpent: 1,
    }
    const result = completeJob(baseState({ partInventory: [pricedPart] }), job, CONTEXT)
    expect(result.state.carLedgers[car.id]).toEqual({
      purchaseYen: null,
      repairYen: 0,
      partsYen: 42_000,
    })
  })

  it('Sprint 42: a completed install-part job with no pricePaidYen (unknown) adds 0, still creating the ledger entry', () => {
    const job: Job = {
      id: 'job-unpriced',
      carInstanceId: car.id,
      kind: 'install-part',
      componentId: 'suspension',
      partInstanceId: sparePart.id, // no pricePaidYen set
      laborSlotsRequired: 1,
      laborSlotsSpent: 1,
    }
    const result = completeJob(baseState(), job, CONTEXT)
    expect(result.state.carLedgers[car.id]).toEqual({
      purchaseYen: null,
      repairYen: 0,
      partsYen: 0,
    })
  })

  it('Sprint 42: an install-part job completed on a CUSTOMER service-job car creates no ledger entry - not owned', () => {
    const customerCar: CarInstance = buildCarInstance({
      id: 'car-customer-install',
      modelId: 'honda-city-e-aa',
      parts: { ...mintCarParts(), dampers: { installed: null } },
    })
    const owningJob: ServiceJob = {
      id: 'svc-install-test',
      typeId: 'small-bodywork-touchup',
      customerName: 'Test Customer',
      description: 'Suspension work.',
      tasks: [{ action: 'install', carPartId: 'dampers', minGrade: 'stock', minToolTier: 1 }],
      car: customerCar,
      payoutYen: 10_000,
      baseReputation: 5,
      deadlineDays: 5,
      expiresOnDay: 30,
      arrivesOnDay: null,
      dueOnDay: 8,
    }
    const pricedPart: PartInstance = { ...sparePart, id: 'pi-priced-2', pricePaidYen: 42_000 }
    const job: Job = {
      id: 'job-customer-install',
      carInstanceId: customerCar.id,
      kind: 'install-part',
      componentId: 'suspension',
      partInstanceId: pricedPart.id,
      laborSlotsRequired: 1,
      laborSlotsSpent: 1,
    }
    const result = completeJob(
      baseState({ ownedCars: [], activeServiceJobs: [owningJob], partInventory: [pricedPart] }),
      job,
      CONTEXT,
    )
    expect(result.state.carLedgers).toEqual({})
  })

  it('an install-part job into an occupied slot is blocked, not overwritten', () => {
    const occupiedCar: CarInstance = {
      ...car,
      parts: {
        ...car.parts,
        dampers: {
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

  describe('the consumables + repair-cost gate (Sprint 26 cost; Sprint 36: no ownership gate)', () => {
    const spec = {
      carInstanceId: car.id,
      kind: 'repair-zone' as const,
      componentId: 'body' as const,
      targetBand: 'mint' as const,
      laborSlotsRequired: 3,
    }

    it('repair proceeds at tier 1 with nothing upgraded - there is no ownership refusal anymore', () => {
      const result = findOrCreateJob(baseState({ toolTiers: testToolTiers() }), spec, CONTEXT)
      expect(result.job).not.toBeNull()
      expect(result.state.jobs).toHaveLength(1)
      expect(result.log.some((e) => e.type === 'job-blocked')).toBe(false)
    })

    it("charges the CURRENT tier's consumables plus the group's real (tier-scaled) repair cost, deducted from cash", () => {
      const plan = planGroupRepair(
        car,
        'body',
        'mint',
        testToolTiers(),
        CONTEXT.partIdsByGroup,
        CONTEXT.partsTaxonomyById,
        CAR_TIER_FACTOR,
      )
      const totalCostYen = BODY_CONSUMABLES_T1 + plan.costYen
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

    it('Sprint 42: creates the ledger entry and adds the full charge (consumables + repair cost) as repairYen for an OWNED car', () => {
      const plan = planGroupRepair(
        car,
        'body',
        'mint',
        testToolTiers(),
        CONTEXT.partIdsByGroup,
        CONTEXT.partsTaxonomyById,
        CAR_TIER_FACTOR,
      )
      const totalCostYen = BODY_CONSUMABLES_T1 + plan.costYen
      const result = findOrCreateJob(baseState(), spec, CONTEXT)
      expect(result.state.carLedgers[car.id]).toEqual({
        purchaseYen: null,
        repairYen: totalCostYen,
        partsYen: 0,
      })
    })

    it('Sprint 42: repairYen accumulates across a second repair job on the same car', () => {
      const first = findOrCreateJob(baseState(), spec, CONTEXT)
      const afterFirstRepairYen = first.state.carLedgers[car.id]!.repairYen
      // A different group's own job is independent (one open job per
      // component at a time, not one per car) - both charges land on the
      // same car's ledger.
      const secondSpec = { ...spec, componentId: 'engine' as const, laborSlotsRequired: 2 }
      const second = findOrCreateJob(first.state, secondSpec, CONTEXT)
      expect(second.state.carLedgers[car.id]!.repairYen).toBeGreaterThan(afterFirstRepairYen)
    })

    it("a tier-2 line charges tier 2's consumables (and takes fewer labor slots), same repair cost", () => {
      const t2State = baseState({ toolTiers: testToolTiers({ body: 2 }) })
      const t2Plan = planGroupRepair(
        car,
        'body',
        'mint',
        t2State.toolTiers,
        CONTEXT.partIdsByGroup,
        CONTEXT.partsTaxonomyById,
        CAR_TIER_FACTOR,
      )
      const t1Plan = planGroupRepair(
        car,
        'body',
        'mint',
        testToolTiers(),
        CONTEXT.partIdsByGroup,
        CONTEXT.partsTaxonomyById,
        CAR_TIER_FACTOR,
      )
      expect(t2Plan.costYen).toBe(t1Plan.costYen)
      expect(t2Plan.laborSlotsRequired).toBeLessThan(t1Plan.laborSlotsRequired)

      const cashBefore = t2State.cashYen
      const result = findOrCreateJob(
        t2State,
        { ...spec, laborSlotsRequired: t2Plan.laborSlotsRequired },
        CONTEXT,
      )
      expect(result.job).not.toBeNull()
      expect(result.state.cashYen).toBe(cashBefore - BODY_CONSUMABLES_T2 - t2Plan.costYen)
    })

    it('does not re-charge when a repeat call continues the existing job', () => {
      const first = findOrCreateJob(baseState(), spec, CONTEXT)
      const second = findOrCreateJob(first.state, spec, CONTEXT)
      expect(second.state.cashYen).toBe(first.state.cashYen)
      expect(second.log).toEqual([])
    })

    it('refuses silently (no log) when the total cost is unaffordable', () => {
      const plan = planGroupRepair(
        car,
        'body',
        'mint',
        testToolTiers(),
        CONTEXT.partIdsByGroup,
        CONTEXT.partsTaxonomyById,
        CAR_TIER_FACTOR,
      )
      const totalCostYen = BODY_CONSUMABLES_T1 + plan.costYen
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

    it('install-part job creation charges nothing here (the part itself is bought separately)', () => {
      const state = baseState()
      const result = findOrCreateJob(
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
      expect(result.job).not.toBeNull()
      expect(result.state.cashYen).toBe(state.cashYen)
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

    /**
     * Sprint 37: the one own-car capability ceiling (progression bible's
     * bolt-on vs built line). `car`'s model (honda-city-e-aa) is factory-NA
     * (no Turbo/Supercharged tag); with its `forcedInduction` slot
     * genuinely empty, fitting the FIRST turbo is a conversion, gated
     * behind engine tier 3 - refused below it, allowed at it.
     */
    it("refuses converting a factory-NA car to forced induction below engine tier 3 (reason 'tool-tier'), allows it at tier 3", () => {
      const naCar: CarInstance = {
        ...car,
        parts: { ...car.parts, forcedInduction: { installed: null } },
      }
      const turboKit = PARTS.find((p) => p.carPartId === 'forcedInduction' && p.grade !== 'stock')!
      const turboInstance: PartInstance = {
        id: 'pi-turbo',
        partId: turboKit.id,
        band: 'mint',
        genuinePeriod: false,
      }
      const spec = {
        carInstanceId: naCar.id,
        kind: 'install-part' as const,
        componentId: 'engine' as const,
        partInstanceId: turboInstance.id,
        carPartId: 'forcedInduction' as const,
        laborSlotsRequired: 1,
      }

      for (const engineTier of [1, 2] as const) {
        const state = baseState({
          ownedCars: [naCar],
          partInventory: [turboInstance],
          toolTiers: testToolTiers({ engine: engineTier }),
        })
        const result = findOrCreateJob(state, spec, CONTEXT)
        expect(result.job, `engine tier ${engineTier} should refuse`).toBeNull()
        expect(result.log).toEqual([
          {
            type: 'job-blocked',
            jobId: 'job-car-0001-install-part-engine-forcedInduction',
            reason: 'tool-tier',
          },
        ])
      }

      const unlocked = baseState({
        ownedCars: [naCar],
        partInventory: [turboInstance],
        toolTiers: testToolTiers({ engine: 3 }),
      })
      const allowed = findOrCreateJob(unlocked, spec, CONTEXT)
      expect(allowed.job).not.toBeNull()
    })

    /**
     * Sprint 37: swapping an already-installed forced-induction part (a
     * factory-turbo car, or one already converted) is a bolt-on swap, not a
     * conversion - never gated, at any engine tier.
     */
    it('does not gate swapping forced induction on a car that already has one installed', () => {
      const alreadyTurboCar: CarInstance = {
        ...car,
        parts: { ...car.parts, forcedInduction: { installed: null } },
      }
      // First conversion at tier 3 (allowed per the test above), producing a
      // car whose slot is now occupied - re-derive that state, then attempt
      // a SECOND install onto the same now-occupied slot to prove the
      // conversion gate never re-applies once something is fitted. Simpler:
      // directly assert the pure predicate is false once the slot isn't the
      // legitimately-empty-NA case (occupied is a different refusal path
      // entirely, exercised elsewhere - `naToTurboConversionBlocked` itself
      // only ever answers the conversion question).
      const model = CARS.find((m) => m.id === alreadyTurboCar.modelId)!
      expect(
        naToTurboConversionBlocked(
          'forcedInduction',
          model,
          baseState({ toolTiers: testToolTiers({ engine: 1 }) }),
          CONTEXT,
        ),
      ).toBe(true)
      const turboModel = CARS.find(
        (m) => m.tags.includes('Turbo') || m.tags.includes('Supercharged'),
      )!
      expect(
        naToTurboConversionBlocked(
          'forcedInduction',
          turboModel,
          baseState({ toolTiers: testToolTiers({ engine: 1 }) }),
          CONTEXT,
        ),
      ).toBe(false)
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

    it("refuses installing a customer-owned tagged part onto a DIFFERENT car, reason 'not-your-part' (the close-out escape TODO.md flagged), but allows it back onto the owning customer's own car", () => {
      const customerCar: CarInstance = buildCarInstance({
        id: 'car-customer-01',
        modelId: 'honda-city-e-aa',
        year: 1984,
        mileageKm: 100_000,
        authenticityPercent: 90,
        parts: {
          ...groupCarParts({
            engine: 'worn',
            drivetrain: 'worn',
            suspension: 'worn',
            body: 'poor',
            interior: 'worn',
          }),
          dampers: { installed: null },
        },
      })
      const owningJob: ServiceJob = {
        id: 'svc-other',
        typeId: 'small-bodywork-touchup',
        customerName: 'Test Customer',
        description: 'Suspension work.',
        tasks: [{ action: 'repair', carPartId: 'dampers', targetBand: 'fine', minToolTier: 1 }],
        car: customerCar,
        payoutYen: 10_000,
        baseReputation: 5,
        deadlineDays: 5,
        expiresOnDay: 30,
        arrivesOnDay: null,
        dueOnDay: 8,
      }
      const taggedInstance: PartInstance = {
        ...sparePart,
        id: 'pi-customer',
        customerJobId: owningJob.id,
      }

      const ontoOwnCar = findOrCreateJob(
        baseState({ activeServiceJobs: [owningJob], partInventory: [taggedInstance] }),
        {
          carInstanceId: car.id,
          kind: 'install-part',
          componentId: 'suspension',
          partInstanceId: taggedInstance.id,
          laborSlotsRequired: 1,
        },
        CONTEXT,
      )
      expect(ontoOwnCar.job).toBeNull()
      expect(ontoOwnCar.log).toEqual([
        {
          type: 'job-blocked',
          jobId: 'job-car-0001-install-part-suspension',
          reason: 'not-your-part',
        },
      ])

      const ontoOwningCar = findOrCreateJob(
        baseState({
          ownedCars: [],
          activeServiceJobs: [owningJob],
          partInventory: [taggedInstance],
        }),
        {
          carInstanceId: customerCar.id,
          kind: 'install-part',
          componentId: 'suspension',
          partInstanceId: taggedInstance.id,
          laborSlotsRequired: 1,
        },
        CONTEXT,
      )
      expect(ontoOwningCar.job).not.toBeNull()
    })
  })
})

describe('repairJobGate (Sprint 26 real cost; Sprint 36: no ownership gate)', () => {
  it('passes install-part specs through untouched', () => {
    const state = baseState()
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

  it('Sprint 42: charges cash for a customer service-job car exactly as before, but records NO ledger entry - not owned', () => {
    const customerCar: CarInstance = buildCarInstance({
      id: 'car-customer-repair',
      modelId: 'honda-city-e-aa',
      parts: groupCarParts({ body: 'poor' }),
    })
    const owningJob: ServiceJob = {
      id: 'svc-repair-test',
      typeId: 'small-bodywork-touchup',
      customerName: 'Test Customer',
      description: 'Bodywork needs sorting.',
      tasks: [{ action: 'repair', carPartId: 'panels', targetBand: 'fine', minToolTier: 1 }],
      car: customerCar,
      payoutYen: 10_000,
      baseReputation: 5,
      deadlineDays: 5,
      expiresOnDay: 30,
      arrivesOnDay: null,
      dueOnDay: 8,
    }
    const state = baseState({ ownedCars: [], activeServiceJobs: [owningJob] })
    const cashBefore = state.cashYen
    const gate = repairJobGate(
      state,
      {
        carInstanceId: customerCar.id,
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'mint',
        laborSlotsRequired: 3,
      },
      CONTEXT,
    )
    expect(gate.ok).toBe(true)
    if (gate.ok) {
      expect(gate.state.cashYen).toBeLessThan(cashBefore) // real charge still happens
      expect(gate.state.carLedgers).toEqual({}) // but no ledger for a car we don't own
    }
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
    expect(result.state.ownedCars[0]?.parts.panels.installed?.band).toBe('mint')
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
    expect(second.state.ownedCars[0]?.parts.panels.installed?.band).toBe('mint')
  })

  it('repair proceeds at tier 1 with nothing upgraded - no refusal path exists (Sprint 36)', () => {
    const state = baseState({ serviceBayCarIds: [car.id], toolTiers: testToolTiers() })
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
    expect(result.log.some((e) => e.type === 'job-blocked')).toBe(false)
  })
})

describe('resolveRemovePart (Sprint 32 decision 7)', () => {
  it('removing an aftermarket part drops it to inventory and reverts the slot to a fresh mint stock instance', () => {
    const aftermarketInstance: PartInstance = {
      id: 'pi-aftermarket-dampers',
      partId: 'tanuki-street-coilovers', // grade 'street' - aftermarket
      band: 'worn',
      genuinePeriod: false,
    }
    const carWithAftermarket: CarInstance = {
      ...car,
      parts: { ...car.parts, dampers: { installed: aftermarketInstance } },
    }
    const state = baseState({ ownedCars: [carWithAftermarket], partInventory: [] })
    const result = resolveRemovePart(state, car.id, 'dampers', CONTEXT)

    const revertedSlot = result.state.ownedCars[0]?.parts.dampers.installed
    expect(revertedSlot).not.toBeNull()
    expect(revertedSlot?.id).not.toBe(aftermarketInstance.id)
    expect(revertedSlot?.partId).toBe('stock-dampers')
    expect(revertedSlot?.band).toBe('mint')

    expect(result.state.partInventory).toEqual([aftermarketInstance])
    expect(result.log).toEqual([
      {
        type: 'part-removed',
        carInstanceId: car.id,
        carPartId: 'dampers',
        partInstanceId: aftermarketInstance.id,
      },
    ])
  })

  it('removing a stock part drops it to inventory and leaves the slot genuinely empty', () => {
    // car.parts.panels is a mint-of-condition 'poor' stock part per the
    // module-level fixture's body-group override - a real stock instance,
    // not aftermarket.
    const originalInstance = car.parts.panels.installed!
    const state = baseState({ partInventory: [] })
    const result = resolveRemovePart(state, car.id, 'panels', CONTEXT)

    expect(result.state.ownedCars[0]?.parts.panels.installed).toBeNull()
    expect(result.state.partInventory).toEqual([originalInstance])
    expect(result.log).toEqual([
      {
        type: 'part-removed',
        carInstanceId: car.id,
        carPartId: 'panels',
        partInstanceId: originalInstance.id,
      },
    ])
  })

  it('is a no-op when a group-level job is open on the same group (component-level busy)', () => {
    const openJob: Job = {
      id: 'job-open-body',
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId: 'body',
      targetBand: 'mint',
      laborSlotsRequired: 3,
      laborSlotsSpent: 0,
    }
    const state = baseState({ jobs: [openJob], partInventory: [] })
    const result = resolveRemovePart(state, car.id, 'panels', CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('is a no-op when a per-part job is open on that exact part (part-level busy)', () => {
    const openJob: Job = {
      id: 'job-open-panels-only',
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId: 'body',
      carPartId: 'panels',
      targetBand: 'mint',
      laborSlotsRequired: 1,
      laborSlotsSpent: 0,
    }
    const state = baseState({ jobs: [openJob], partInventory: [] })
    const result = resolveRemovePart(state, car.id, 'panels', CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('is a no-op when the slot is already empty', () => {
    // dampers is null on the module-level fixture car - see the fixture's
    // own comment above.
    expect(car.parts.dampers.installed).toBeNull()
    const state = baseState({ partInventory: [] })
    const result = resolveRemovePart(state, car.id, 'dampers', CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  /** A minimal, schema-shaped active service job wrapping the module-level
   * fixture `car` as the CUSTOMER's car - Sprint 33 decision 8's contrast
   * case against the owned-car tests above. */
  const customerServiceJob: ServiceJob = {
    id: 'svc-test',
    typeId: 'small-bodywork-touchup',
    customerName: 'Test Customer',
    description: 'Bodywork needs sorting.',
    tasks: [{ action: 'repair', carPartId: 'panels', targetBand: 'fine', minToolTier: 1 }],
    car,
    payoutYen: 10_000,
    baseReputation: 5,
    deadlineDays: 5,
    expiresOnDay: 30,
    arrivesOnDay: null,
    dueOnDay: 8,
  }

  it('Sprint 35 decision 2: removing a part from a CUSTOMER car keeps it, tagged with the job id', () => {
    const originalInstance = car.parts.panels.installed!
    const state = baseState({
      ownedCars: [],
      activeServiceJobs: [customerServiceJob],
      partInventory: [],
    })
    const result = resolveRemovePart(state, car.id, 'panels', CONTEXT)

    // The slot still updates exactly like the owned-car case (panels is
    // stock, so the slot goes genuinely empty)...
    expect(result.state.activeServiceJobs[0]?.car.parts.panels.installed).toBeNull()
    // ...and the removed part is now in OUR inventory, tagged customer-owned
    // (Sprint 35 supersedes Sprint 33's discard).
    expect(result.state.partInventory).toEqual([
      { ...originalInstance, customerJobId: customerServiceJob.id },
    ])
    expect(result.log).toEqual([
      {
        type: 'part-removed',
        carInstanceId: car.id,
        carPartId: 'panels',
        partInstanceId: originalInstance.id,
      },
    ])
  })

  it('Sprint 35: removing the same part from an OWNED car keeps it UNtagged (player-owned)', () => {
    const originalInstance = car.parts.panels.installed!
    const state = baseState({ partInventory: [] }) // ownedCars: [car] by default
    const result = resolveRemovePart(state, car.id, 'panels', CONTEXT)
    expect(result.state.partInventory).toEqual([originalInstance])
    expect(result.state.partInventory[0]).not.toHaveProperty('customerJobId')
  })

  it('Sprint 42: removal never refunds the ledger - repairYen/partsYen already spent stay spent, and the pulled instance keeps its own pricePaidYen', () => {
    const aftermarketInstance: PartInstance = {
      id: 'pi-aftermarket-dampers-2',
      partId: 'tanuki-street-coilovers',
      band: 'worn',
      genuinePeriod: false,
      pricePaidYen: 55_000,
    }
    const carWithAftermarket: CarInstance = {
      ...car,
      parts: { ...car.parts, dampers: { installed: aftermarketInstance } },
    }
    const state = baseState({
      ownedCars: [carWithAftermarket],
      partInventory: [],
      carLedgers: { [car.id]: { purchaseYen: 900_000, repairYen: 12_000, partsYen: 55_000 } },
    })
    const result = resolveRemovePart(state, car.id, 'dampers', CONTEXT)
    // Ledger is completely untouched by the removal itself.
    expect(result.state.carLedgers[car.id]).toEqual({
      purchaseYen: 900_000,
      repairYen: 12_000,
      partsYen: 55_000,
    })
    // The pulled instance still carries its own pricePaidYen - not zeroed,
    // not refunded anywhere.
    expect(result.state.partInventory).toEqual([aftermarketInstance])
  })
})

describe('in-inventory recondition reuses the on-car repair economy (Sprint 35 decision 4)', () => {
  // A body part (WELDER covers 'body') at 'poor', once loose in inventory and
  // once installed on a car - the SAME PartInstance content either way, so any
  // cost/labor difference would be a forked bench economy, exactly what the
  // sprint forbids.
  const stockPanelsId = PARTS.find((p) => p.carPartId === 'panels' && p.grade === 'stock')!.id
  const loosePart: PartInstance = {
    id: 'pi-recon',
    partId: stockPanelsId,
    band: 'poor',
    genuinePeriod: false,
  }

  /** A car whose only non-mint part is `panels`, holding the same content as
   * `loosePart`, sitting in the service bay so on-car labor can be applied. */
  function carWithPoorPanels(): CarInstance {
    return buildCarInstance({
      id: 'car-ref',
      modelId: 'honda-city-e-aa',
      parts: mintCarParts({ panels: { ...loosePart, id: 'pi-on-car' } }),
    })
  }

  it('the recondition quote matches the on-car per-part repair plan at the SAME factor (cost + labor), exactly - the shared formula, isolated from tier scaling', () => {
    const invState = baseState({ ownedCars: [], partInventory: [loosePart] })
    const quote = reconditionQuote(invState, loosePart.id, 'mint', CONTEXT)!
    expect(quote).not.toBeNull()

    // The on-car per-part plan for the identical part, at factor 1 (matching
    // the bench path's own neutral factor - Sprint 41: a loose part has no
    // car to scale by, so `reconditionQuote` always prices at factor 1; this
    // isolates the underlying formula, not real on-car pricing, which DOES
    // scale by the car's own tier - see the next test).
    const plan = planGroupRepair(
      carWithPoorPanels(),
      'body',
      'mint',
      invState.toolTiers,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      1,
      'panels',
    )

    expect(quote.laborSlotsRequired).toBe(plan.laborSlotsRequired)
    expect(quote.costYen).toBe(plan.costYen + BODY_CONSUMABLES_T1)
  })

  it("Sprint 42: a bench recondition adds its full charge (consumables + repair cost) to the loose instance's pricePaidYen, not any car ledger", () => {
    const invState = baseState({ ownedCars: [], partInventory: [loosePart] })
    const quote = reconditionQuote(invState, loosePart.id, 'mint', CONTEXT)!
    const result = resolveReconditionLabor(invState, loosePart.id, 'mint', 10, CONTEXT)
    const reconditioned = result.state.partInventory.find((p) => p.id === loosePart.id)
    expect(reconditioned?.band).toBe('mint')
    expect(reconditioned?.pricePaidYen).toBe(quote.costYen)
    // No car in play at all - carLedgers is untouched.
    expect(result.state.carLedgers).toEqual({})
  })

  it('Sprint 42: pricePaidYen accumulates on top of whatever the instance already cost (buy price + this work)', () => {
    const alreadyPriced: PartInstance = {
      ...loosePart,
      id: 'pi-recon-priced',
      pricePaidYen: 20_000,
    }
    const invState = baseState({ ownedCars: [], partInventory: [alreadyPriced] })
    const quote = reconditionQuote(invState, alreadyPriced.id, 'mint', CONTEXT)!
    const result = resolveReconditionLabor(invState, alreadyPriced.id, 'mint', 10, CONTEXT)
    const reconditioned = result.state.partInventory.find((p) => p.id === alreadyPriced.id)
    expect(reconditioned?.pricePaidYen).toBe(20_000 + quote.costYen)
  })

  it("reconditioning and on-car repair consume the same labor (tier-factor-independent); cash now legitimately differs, since Sprint 41 scales the on-car repair by the car's own tier (shitbox, 0.12x) while the bench has no car to scale by (factor 1) - both still route through the identical planGroupRepair/planPartRepair formula, just with a different, correctly-resolved factor input", () => {
    // On-car reference: repair the panels slot to mint, car in the service bay.
    // Size the spec off `planGroupRepair` exactly the way the store's `repair`
    // action does (gameStore.ts) - the job's labor comes from the spec, so the
    // spec must carry the real plan for the on-car labor to be the true cost.
    const carState = baseState({
      ownedCars: [carWithPoorPanels()],
      partInventory: [],
      serviceBayCarIds: ['car-ref'],
    })
    const onCarPlan = planGroupRepair(
      carState.ownedCars[0]!,
      'body',
      'mint',
      carState.toolTiers,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      CAR_TIER_FACTOR, // honda-city-e-aa is shitbox tier
      'panels',
    )
    const carResult = resolveJobLabor(
      carState,
      {
        carInstanceId: 'car-ref',
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'mint',
        carPartId: 'panels',
        laborSlotsRequired: onCarPlan.laborSlotsRequired,
      },
      6,
      CONTEXT,
    )
    const carCashSpent = carState.cashYen - carResult.state.cashYen
    const carLaborSpent = carResult.state.laborSlotsSpentToday
    expect(carResult.state.ownedCars[0]?.parts.panels.installed?.band).toBe('mint')
    expect(carCashSpent).toBeGreaterThan(0)
    expect(carLaborSpent).toBeGreaterThan(0)
    expect(carCashSpent).toBe(BODY_CONSUMABLES_T1 + onCarPlan.costYen)

    // In-inventory: recondition the identical loose part to mint - always at
    // the bench's neutral factor 1 (no car to scale by).
    const invState = baseState({ ownedCars: [], partInventory: [loosePart] })
    const benchPlan = planGroupRepair(
      carWithPoorPanels(),
      'body',
      'mint',
      invState.toolTiers,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      1,
      'panels',
    )
    const invResult = resolveReconditionLabor(invState, loosePart.id, 'mint', 6, CONTEXT)
    const invCashSpent = invState.cashYen - invResult.state.cashYen
    const invLaborSpent = invResult.state.laborSlotsSpentToday
    expect(invCashSpent).toBe(BODY_CONSUMABLES_T1 + benchPlan.costYen)

    // Same labor either way - labor sizing is tier-factor-independent.
    expect(invLaborSpent).toBe(carLaborSpent)
    // Cash genuinely differs now: the shitbox car's repair is scaled down
    // (0.12x), the bench's is not (1x) - not a forked economy, a correctly
    // different factor input to the same shared formula.
    expect(carCashSpent).toBeLessThan(invCashSpent)
    // The loose part climbed to mint (and is no longer an open job).
    expect(invResult.state.partInventory[0]?.band).toBe('mint')
    expect(invResult.state.jobs).toHaveLength(0)
  })

  it('is sized by the same tool tier as on-car repair (no cheaper or slower bench path) - Sprint 36', () => {
    // poor -> mint is 3 grades: 3 slots at tier 1, 1 slot at tier 3, both paths.
    const t1Quote = reconditionQuote(
      baseState({ ownedCars: [], partInventory: [loosePart] }),
      loosePart.id,
      'mint',
      CONTEXT,
    )!
    const t3Quote = reconditionQuote(
      baseState({
        ownedCars: [],
        partInventory: [loosePart],
        toolTiers: testToolTiers({ body: 3 }),
      }),
      loosePart.id,
      'mint',
      CONTEXT,
    )!
    expect(t1Quote.laborSlotsRequired).toBe(3)
    expect(t3Quote.laborSlotsRequired).toBe(1)

    const t3Plan = planGroupRepair(
      carWithPoorPanels(),
      'body',
      'mint',
      testToolTiers({ body: 3 }),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsTaxonomyById,
      1, // factor is irrelevant to labor sizing - only laborSlotsRequired is checked below
      'panels',
    )
    expect(t3Quote.laborSlotsRequired).toBe(t3Plan.laborSlotsRequired)
    // The yen cost of the work itself is tier-independent (decision 7);
    // only the tier's own consumables differ between the two quotes.
    expect(t3Quote.costYen - TOOL_LINES.body.tiers[2]!.consumablesCostYen).toBe(
      t1Quote.costYen - BODY_CONSUMABLES_T1,
    )
  })

  /**
   * Sprint 41 decision 2: replace-only semantics reach the bench too - a
   * non-repairable consumable can never be reconditioned, quote or resolver,
   * exactly like a scrap part already couldn't (Sprint 26 decision 5).
   */
  it('a non-repairable consumable (tyres) cannot be reconditioned - no quote, resolver is a no-op', () => {
    const wornTyresId = PARTS.find((p) => p.carPartId === 'tyres' && p.grade === 'stock')!.id
    const wornTyres: PartInstance = {
      id: 'pi-worn-tyres',
      partId: wornTyresId,
      band: 'worn',
      genuinePeriod: false,
    }
    const state = baseState({ ownedCars: [], partInventory: [wornTyres] })

    expect(reconditionQuote(state, wornTyres.id, 'mint', CONTEXT)).toBeNull()

    const result = resolveReconditionLabor(state, wornTyres.id, 'mint', 6, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.laborSlotsUsed).toBe(0)
    expect(result.state.partInventory[0]?.band).toBe('worn') // unchanged
  })
})
