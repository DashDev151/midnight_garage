import {
  CARS,
  PARTS,
  PARTS_TAXONOMY,
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
  installLaborSlotsFor,
  naToTurboConversionBlocked,
  reconditionQuote,
  refitLaborSlotsFor,
  removeBlockReason,
  removeLaborSlotsFor,
  repairJobGate,
  isJobComplete,
  resolveJobLabor,
  resolveReconditionLabor,
  resolveRemovePart,
} from '../src/jobs'
import { planGroupRepair } from '../src/bands'
import { buildSimContext } from '../src/context'
import { makeCarOrigin, makeMarketOrigin } from '../src/provenance'
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

/** The one global repair-cost knob `repairJobGate` itself resolves internally
 * (Sprint 44: derived from the installed part's own price, never the host
 * car's tier) - reused here so these tests' own `planGroupRepair` calls
 * predict the exact same charge. */
const REPAIR_STEP_FRACTION = CONTEXT.economy.restoration.repairStepFraction

// Sprint 53: `car` (honda-city-e-aa) is 'shitbox' tier - every fitting
// catalog part in this file's fixtures must be the shitbox-class SKU, or
// the new fitment-class check refuses it before any of these tests' own
// gates are ever reached.
const sparePart: PartInstance = {
  id: 'pi-0001',
  partId: 'shitbox-tanuki-street-coilovers',
  band: 'mint',
  genuinePeriod: false,
  origin: makeMarketOrigin(1),
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
    laborSlotsSpentToday: 0,
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

  it('an install-part job completed on a CUSTOMER service-job car creates no CAR ledger entry (never owned) but does update its own job ledger (Sprint 57)', () => {
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
      tasks: [
        {
          requirement: {
            kind: 'slotCondition',
            carPartId: 'dampers',
            minBand: 'fine',
            minGrade: 'stock',
          },
          minToolTier: 1,
        },
      ],
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
    expect(result.state.serviceJobLedgers[owningJob.id]).toEqual({ repairYen: 0, partsYen: 42_000 })
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
            origin: makeMarketOrigin(1),
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
        // Sprint 71: 'interior' (surface, still on-car-repairable) stands in
        // for the old 'engine' fixture - engine is now entirely bench-only.
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'interior',
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

    it("charges exactly the group's real (tier-scaled) repair cost, deducted from cash - no consumables fee (Sprint 47)", () => {
      const plan = planGroupRepair(
        car,
        'body',
        'mint',
        testToolTiers(),
        CONTEXT.partIdsByGroup,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        REPAIR_STEP_FRACTION,
      )
      const totalCostYen = plan.costYen
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

    it('Sprint 42: creates the ledger entry and adds the full repair charge as repairYen for an OWNED car', () => {
      const plan = planGroupRepair(
        car,
        'body',
        'mint',
        testToolTiers(),
        CONTEXT.partIdsByGroup,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        REPAIR_STEP_FRACTION,
      )
      const totalCostYen = plan.costYen
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
      // same car's ledger. Sprint 71: 'interior' (still on-car-repairable)
      // stands in for the old 'engine' fixture - engine is bench-only now.
      const secondSpec = { ...spec, componentId: 'interior' as const, laborSlotsRequired: 2 }
      const second = findOrCreateJob(first.state, secondSpec, CONTEXT)
      expect(second.state.carLedgers[car.id]!.repairYen).toBeGreaterThan(afterFirstRepairYen)
    })

    it('a tier-2 line takes fewer labor slots for the same repair cost (Sprint 47: tier no longer affects cost at all)', () => {
      const t2State = baseState({ toolTiers: testToolTiers({ body: 2 }) })
      const t2Plan = planGroupRepair(
        car,
        'body',
        'mint',
        t2State.toolTiers,
        CONTEXT.partIdsByGroup,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        REPAIR_STEP_FRACTION,
      )
      const t1Plan = planGroupRepair(
        car,
        'body',
        'mint',
        testToolTiers(),
        CONTEXT.partIdsByGroup,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        REPAIR_STEP_FRACTION,
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
      expect(result.state.cashYen).toBe(cashBefore - t2Plan.costYen)
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
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        REPAIR_STEP_FRACTION,
      )
      const totalCostYen = plan.costYen
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
        origin: makeMarketOrigin(1),
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
        // Sprint 71: forcedInduction is blockedBy intake (fitting a turbo
        // means the intake has to come off first) - emptied here too, so
        // this test isolates the tool-tier gate it's actually about rather
        // than tripping the new blocker rule instead.
        parts: { ...car.parts, forcedInduction: { installed: null }, intake: { installed: null } },
      }
      // Sprint 53: naCar (honda-city-e-aa) is 'shitbox' tier - the turbo kit
      // must be the shitbox-class SKU or the new fitment check refuses it
      // before ever reaching the tool-tier gate this test is about.
      const turboKit = PARTS.find(
        (p) =>
          p.carPartId === 'forcedInduction' && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
      )!
      const turboInstance: PartInstance = {
        id: 'pi-turbo',
        partId: turboKit.id,
        band: 'mint',
        genuinePeriod: false,
        origin: makeMarketOrigin(1),
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
        origin: makeMarketOrigin(1),
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
        tasks: [
          {
            requirement: { kind: 'slotCondition', carPartId: 'dampers', minBand: 'fine' },
            minToolTier: 1,
          },
        ],
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
        origin: makeCarOrigin(customerCar.id, 'Customer Car', 0),
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

    /**
     * Sprint 71 decision 4 (the symmetric blocker rule): install validates
     * `blockedBy` exactly like uninstall does - `forcedInduction` is
     * `blockedBy: ['intake']`, so fitting a turbo kit is refused while the
     * default-filled stock intake is still on, reason 'blocked-by', and
     * allowed the moment `intake` is pulled.
     */
    it("refuses installing onto a slot whose blockedBy list is still occupied, reason 'blocked-by', allows it once the blocker is cleared", () => {
      const naCar: CarInstance = {
        ...car,
        parts: { ...car.parts, forcedInduction: { installed: null } }, // intake stays occupied
      }
      const turboKit = PARTS.find(
        (p) =>
          p.carPartId === 'forcedInduction' && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
      )!
      const turboInstance: PartInstance = {
        id: 'pi-turbo-blocked',
        partId: turboKit.id,
        band: 'mint',
        genuinePeriod: false,
        origin: makeMarketOrigin(1),
      }
      const spec = {
        carInstanceId: naCar.id,
        kind: 'install-part' as const,
        componentId: 'engine' as const,
        partInstanceId: turboInstance.id,
        carPartId: 'forcedInduction' as const,
        laborSlotsRequired: 1,
      }
      // Tier 3 so this isolates the blocker gate from the NA-to-turbo
      // conversion gate (already its own test above).
      const blocked = findOrCreateJob(
        baseState({
          ownedCars: [naCar],
          partInventory: [turboInstance],
          toolTiers: testToolTiers({ engine: 3 }),
        }),
        spec,
        CONTEXT,
      )
      expect(blocked.job).toBeNull()
      expect(blocked.log).toEqual([
        {
          type: 'job-blocked',
          jobId: 'job-car-0001-install-part-engine-forcedInduction',
          reason: 'blocked-by',
        },
      ])

      const clearedIntakeCar: CarInstance = {
        ...naCar,
        parts: { ...naCar.parts, intake: { installed: null } },
      }
      const allowed = findOrCreateJob(
        baseState({
          ownedCars: [clearedIntakeCar],
          partInventory: [turboInstance],
          toolTiers: testToolTiers({ engine: 3 }),
        }),
        spec,
        CONTEXT,
      )
      expect(allowed.job).not.toBeNull()
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

  /**
   * Sprint 71 decision 2 (the teardown game): a bolt-on/buried slot is
   * bench-only - an on-car repair-zone job addressed at it (per-part or the
   * whole group) is refused outright, reason 'bench-only', regardless of
   * cash or tool tier. `dampers` (bolt-on, on the module-level `car` fixture,
   * band 'worn' per its suspension-group override) is the exact
   * `depthClass !== 'surface'` case this decision introduces.
   */
  it("refuses an on-car repair-zone job addressed at a bolt-on/buried part, reason 'bench-only'", () => {
    const dampersCar: CarInstance = {
      ...car,
      parts: {
        ...car.parts,
        dampers: { installed: { ...sparePart, id: 'pi-worn-dampers', band: 'worn' } },
      },
    }
    const gate = repairJobGate(
      baseState({ ownedCars: [dampersCar] }),
      {
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'suspension',
        carPartId: 'dampers',
        targetBand: 'mint',
        laborSlotsRequired: 1,
      },
      CONTEXT,
    )
    expect(gate).toEqual({
      ok: false,
      log: [
        {
          type: 'job-blocked',
          jobId: 'job-car-0001-repair-zone-suspension-dampers',
          reason: 'bench-only',
        },
      ],
    })
  })

  it('charges cash for a customer service-job car exactly as before, records NO car ledger entry (never owned), but does update its own job ledger (Sprint 57)', () => {
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
      tasks: [
        {
          requirement: { kind: 'slotCondition', carPartId: 'panels', minBand: 'fine' },
          minToolTier: 1,
        },
      ],
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
      const chargedYen = cashBefore - gate.state.cashYen
      expect(chargedYen).toBeGreaterThan(0) // real charge still happens
      expect(gate.state.carLedgers).toEqual({}) // but no CAR ledger for a car we don't own
      expect(gate.state.serviceJobLedgers[owningJob.id]).toEqual({
        repairYen: chargedYen,
        partsYen: 0,
      })
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
  // Directive 17 case (a), sprint85 decision 1: the OLD test asserted removing
  // an aftermarket part "reverts the slot to a fresh mint stock instance" -
  // a mechanism Sprint 79 redefined and Sprint 85 deletes outright (the
  // phantom-mint spawn, playtest 15/16/20). Rewritten to the new contract:
  // the slot goes genuinely empty, whatever grade the removed part was.
  it('removing an aftermarket part empties the slot - no phantom mint stock spawns (Sprint 85)', () => {
    const aftermarketInstance: PartInstance = {
      id: 'pi-aftermarket-dampers',
      partId: 'tanuki-street-coilovers', // grade 'street' - aftermarket
      band: 'worn',
      genuinePeriod: false,
      origin: makeMarketOrigin(1),
    }
    const carWithAftermarket: CarInstance = {
      ...car,
      parts: { ...car.parts, dampers: { installed: aftermarketInstance } },
    }
    const state = baseState({ ownedCars: [carWithAftermarket], partInventory: [] })
    const result = resolveRemovePart(state, car.id, 'dampers', CONTEXT)

    expect(result.state.ownedCars[0]?.parts.dampers.installed).toBeNull()
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

  // Regression (a), sprint85 decision 1: the emptied slot carries the REMOVED
  // instance's own identity as its `vacatedBaseline` ({partId, band,
  // genuinePeriod}), never a synthesised mint-stock baseline. This is exactly
  // the input `refitLaborSlotsFor` compares against, which the phantom-mint
  // spawn corrupted on a second removal (playtest 15/20).
  it("removal stamps the removed aftermarket part's own identity as the vacated baseline (regression)", () => {
    const aftermarketInstance: PartInstance = {
      id: 'pi-aftermarket-dampers-baseline',
      partId: 'tanuki-street-coilovers',
      band: 'worn',
      genuinePeriod: false,
      origin: makeMarketOrigin(2),
    }
    const carWithAftermarket: CarInstance = {
      ...car,
      parts: { ...car.parts, dampers: { installed: aftermarketInstance } },
    }
    const state = baseState({ ownedCars: [carWithAftermarket], partInventory: [] })
    const result = resolveRemovePart(state, car.id, 'dampers', CONTEXT)

    const slot = result.state.ownedCars[0]!.parts.dampers
    expect(slot.installed).toBeNull()
    expect(slot.vacatedBaseline).toEqual({
      partId: 'tanuki-street-coilovers',
      band: 'worn',
      genuinePeriod: false,
    })
    expect(result.state.partInventory).toEqual([aftermarketInstance])
  })

  // Regression (b), sprint85 decision 1 (playtest 16): the full chain. With
  // the phantom-mint spawn gone, the vacated baseline holds the aftermarket
  // part's identity, so a genuinely NEW mint stock part of the stock SKU
  // installed into that vacancy fails the equivalence match and is charged
  // FULL install labour - never the free refit the corrupted baseline used to
  // grant (which is why item 16's new tyres cost 0). `refitLaborSlotsFor`
  // itself is correct and untouched.
  it('a new mint stock part installed into a vacated aftermarket slot is charged full install labour, not a free refit (regression)', () => {
    const aftermarketInstance: PartInstance = {
      id: 'pi-aftermarket-dampers-chain',
      partId: 'tanuki-street-coilovers',
      band: 'worn',
      genuinePeriod: false,
      origin: makeMarketOrigin(3),
    }
    const stockDampers = CONTEXT.stockPartByCarPartId.shitbox!.dampers!
    const newStockInstance: PartInstance = {
      id: 'pi-new-stock-dampers',
      partId: stockDampers.id,
      band: 'mint',
      genuinePeriod: false,
      origin: makeMarketOrigin(4),
    }
    const carWithAftermarket: CarInstance = {
      ...car,
      parts: { ...car.parts, dampers: { installed: aftermarketInstance } },
    }
    const state = baseState({
      ownedCars: [carWithAftermarket],
      partInventory: [newStockInstance],
      serviceBayCarIds: [car.id],
    })

    const removed = resolveRemovePart(state, car.id, 'dampers', CONTEXT)
    const carAfterRemove = removed.state.ownedCars[0]!
    // The equivalence input: the baseline is the aftermarket part, so a mint
    // stock SKU is a genuinely DIFFERENT part - full install labour, not 0.
    const fullInstall = installLaborSlotsFor('dampers', CONTEXT)
    expect(fullInstall).toBeGreaterThan(0)
    expect(refitLaborSlotsFor(carAfterRemove, 'dampers', newStockInstance, CONTEXT)).toBe(
      fullInstall,
    )

    const installed = resolveJobLabor(
      removed.state,
      {
        carInstanceId: car.id,
        kind: 'install-part',
        componentId: 'suspension',
        partInstanceId: newStockInstance.id,
        laborSlotsRequired: fullInstall,
      },
      Infinity,
      CONTEXT,
    )
    expect(installed.laborSlotsUsed).toBe(fullInstall)
    expect(installed.state.ownedCars[0]?.parts.dampers.installed?.id).toBe(newStockInstance.id)
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
    tasks: [
      {
        requirement: { kind: 'slotCondition', carPartId: 'panels', minBand: 'fine' },
        minToolTier: 1,
      },
    ],
    car,
    payoutYen: 10_000,
    baseReputation: 5,
    deadlineDays: 5,
    expiresOnDay: 30,
    arrivesOnDay: null,
    dueOnDay: 8,
  }

  it('Sprint 35 decision 2: removing a part from a CUSTOMER car keeps it in inventory, with its origin unchanged', () => {
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
    // ...and the removed part lands in OUR inventory completely unchanged.
    // Sprint 70 retired the customerJobId tag this test used to check for:
    // ownership is now a fact the instance was born with (`origin`), never
    // stamped by removal, so the pulled instance is byte-identical to the
    // one that was on the car.
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

  /**
   * Sprint 70 (parts provenance, ground up): `resolveRemovePart` no longer
   * decides whose part it is - Sprint 68's `baselineInstalledPartIds`-vs-tag
   * dance (and the two theft bugs it patched, TODO.md's "parts provenance"
   * diagnosis) is retired along with the `customerJobId` tag itself. Ownership
   * is now a fact stamped once at birth (`origin`) and never rewritten, so
   * removal is a pure passthrough regardless of who actually fitted the part
   * or which slot it sat in - directive-17 case (a): the OLD test asserted a
   * mechanism (tag-stamping via baseline comparison) that no longer exists;
   * the real behaviour it was protecting (a player-bought part stays player-
   * owned even after being pulled back off a customer's car) is still true,
   * just structurally so now rather than something this function computes.
   */
  it("a market-bought part fitted onto a customer's car keeps its market origin when pulled back off - it was never the customer's", () => {
    const marketBought: PartInstance = {
      id: 'pi-player-bought',
      partId: 'tanuki-street-coilovers',
      band: 'worn',
      genuinePeriod: false,
      origin: makeMarketOrigin(3),
    }
    const customerCar: CarInstance = {
      ...car,
      parts: { ...car.parts, dampers: { installed: marketBought } },
    }
    const job: ServiceJob = { ...customerServiceJob, id: 'svc-market-part', car: customerCar }
    const state = baseState({ ownedCars: [], activeServiceJobs: [job], partInventory: [] })
    const result = resolveRemovePart(state, customerCar.id, 'dampers', CONTEXT)
    expect(result.state.partInventory).toEqual([marketBought])
  })

  it('Sprint 35: removing the same part from an OWNED car keeps its origin unchanged too', () => {
    const originalInstance = car.parts.panels.installed!
    const state = baseState({ partInventory: [] }) // ownedCars: [car] by default
    const result = resolveRemovePart(state, car.id, 'panels', CONTEXT)
    expect(result.state.partInventory).toEqual([originalInstance])
  })

  it('Sprint 42: removal never refunds the ledger - repairYen/partsYen already spent stay spent, and the pulled instance keeps its own pricePaidYen', () => {
    const aftermarketInstance: PartInstance = {
      id: 'pi-aftermarket-dampers-2',
      partId: 'tanuki-street-coilovers',
      band: 'worn',
      genuinePeriod: false,
      origin: makeMarketOrigin(1),
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

  /**
   * Sprint 71 decision 4 (the symmetric blocker rule) and decision 1's own
   * framing of the engine-internals chain as "the deepest job in the game" -
   * the drivetrain side is the same shape at a shallower depth: clutch
   * blocked by gearbox; gearbox blocked by driveline AND exhaust. The
   * module-level `car` fixture has every drivetrain part filled (`worn`, via
   * its `groupCarParts` override), so every blocker starts genuinely
   * occupied.
   */
  it("refuses removing 'clutch' until 'gearbox' is off, and 'gearbox' until 'driveline' + 'exhaust' are both off", () => {
    const state = baseState({ toolTiers: testToolTiers({ drivetrain: 2 }) })

    expect(removeBlockReason(car, 'clutch', CONTEXT)).toEqual({
      kind: 'blocked-by',
      blockedBy: ['gearbox'],
    })
    const clutchBlocked = resolveRemovePart(state, car.id, 'clutch', CONTEXT)
    expect(clutchBlocked.state).toBe(state)
    expect(clutchBlocked.log).toEqual([])

    expect(removeBlockReason(car, 'gearbox', CONTEXT)).toEqual({
      kind: 'blocked-by',
      blockedBy: ['driveline', 'exhaust'],
    })
    const gearboxBlocked = resolveRemovePart(state, car.id, 'gearbox', CONTEXT)
    expect(gearboxBlocked.state).toBe(state)
    expect(gearboxBlocked.log).toEqual([])

    // Clear exhaust (bolt-on, no blockers of its own) - gearbox is still
    // blocked by driveline alone.
    const afterExhaust = resolveRemovePart(state, car.id, 'exhaust', CONTEXT)
    expect(afterExhaust.log).toHaveLength(1)
    const stillBlocked = resolveRemovePart(afterExhaust.state, car.id, 'gearbox', CONTEXT)
    expect(stillBlocked.log).toEqual([])

    // Clear driveline too - gearbox is now removable.
    const afterDriveline = resolveRemovePart(afterExhaust.state, car.id, 'driveline', CONTEXT)
    expect(afterDriveline.log).toHaveLength(1)
    const gearboxOff = resolveRemovePart(afterDriveline.state, car.id, 'gearbox', CONTEXT)
    expect(gearboxOff.log).toHaveLength(1)
    expect(gearboxOff.state.ownedCars[0]?.parts.gearbox.installed).toBeNull()

    // Reassembly order matters (decision 4): clutch is removable now too.
    const clutchOff = resolveRemovePart(gearboxOff.state, car.id, 'clutch', CONTEXT)
    expect(clutchOff.log).toHaveLength(1)
    expect(clutchOff.state.ownedCars[0]?.parts.clutch.installed).toBeNull()
  })

  /**
   * Sprint 85 decision 6 (directive 17 case (a)): the buried ENGINE-group
   * machine gate is no longer a hard wall. Below engine tier 2, uninstalling
   * `camsTiming` now SUCCEEDS at the machine-shop assist fee (charged to cash
   * and posted to the car ledger), and `removeBlockReason` no longer reports it
   * blocked. Owning the tier-2 machine removes the fee. `camsTiming`'s own
   * blocker (`cooling`) is cleared first so this isolates the machine fee from
   * the symmetric blocker rule.
   */
  it('uninstalling a buried ENGINE-group slot below engine tier 2 succeeds at the machine-shop assist fee, and free at tier 2', () => {
    const tierOne = baseState({ toolTiers: testToolTiers({ engine: 1 }) })
    const afterCooling = resolveRemovePart(tierOne, car.id, 'cooling', CONTEXT)
    expect(afterCooling.log).toHaveLength(1)

    // No longer a blocked reason - the machine gate became a fee.
    expect(removeBlockReason(afterCooling.state.ownedCars[0]!, 'camsTiming', CONTEXT)).toBeNull()

    const engineFee = CONTEXT.economy.machineShopAssist.feeYenByGroup.engine
    expect(engineFee).toBeGreaterThan(0)
    const cashBefore = afterCooling.state.cashYen
    const gated = resolveRemovePart(afterCooling.state, car.id, 'camsTiming', CONTEXT)
    expect(gated.log).toHaveLength(1)
    expect(gated.state.ownedCars[0]?.parts.camsTiming.installed).toBeNull()
    // The fee is charged to cash and posted to the car ledger's repairYen.
    expect(gated.state.cashYen).toBe(cashBefore - engineFee)
    expect(gated.state.carLedgers[car.id]?.repairYen).toBe(engineFee)

    // Owning the machine (tier 2) removes the fee.
    const tierTwo = { ...afterCooling.state, toolTiers: testToolTiers({ engine: 2 }) }
    const free = resolveRemovePart(tierTwo, car.id, 'camsTiming', CONTEXT)
    expect(free.log).toHaveLength(1)
    expect(free.state.cashYen).toBe(tierTwo.cashYen)
  })

  /**
   * Sprint 85 decision 6: the drivetrain side, with `gearbox`'s own blockers
   * (`driveline`, `exhaust`) already clear so the machine fee is isolated from
   * the blocker chain. Below drivetrain tier 2 the removal succeeds at the
   * drivetrain assist fee; at tier 2 it is free.
   */
  it('uninstalling a buried DRIVETRAIN-group slot below drivetrain tier 2 succeeds at the machine-shop assist fee once its blockers are clear', () => {
    const tierOne = baseState({ toolTiers: testToolTiers({ drivetrain: 1 }) })
    const afterExhaust = resolveRemovePart(tierOne, car.id, 'exhaust', CONTEXT)
    const afterDriveline = resolveRemovePart(afterExhaust.state, car.id, 'driveline', CONTEXT)
    expect(afterDriveline.log).toHaveLength(1)

    const drivetrainFee = CONTEXT.economy.machineShopAssist.feeYenByGroup.drivetrain
    const cashBefore = afterDriveline.state.cashYen
    const gated = resolveRemovePart(afterDriveline.state, car.id, 'gearbox', CONTEXT)
    expect(gated.log).toHaveLength(1)
    expect(gated.state.ownedCars[0]?.parts.gearbox.installed).toBeNull()
    expect(gated.state.cashYen).toBe(cashBefore - drivetrainFee)

    const tierTwo = { ...afterDriveline.state, toolTiers: testToolTiers({ drivetrain: 2 }) }
    const free = resolveRemovePart(tierTwo, car.id, 'gearbox', CONTEXT)
    expect(free.log).toHaveLength(1)
    expect(free.state.cashYen).toBe(tierTwo.cashYen)
  })

  /**
   * Sprint 85 decision 6: the install side of the same gate. Fitting a buried
   * ENGINE-group part below engine tier 2 charges the machine-shop assist fee
   * at completion (`completeJob`) - the crane is needed to lower it in too -
   * and owning the machine makes it free. The part price is not cash here (a
   * dev-granted part was never bought through `resolveBuyPart`), so only the
   * fee moves cash.
   */
  it('installing a buried ENGINE-group part below engine tier 2 charges the assist fee at completion, free at tier 2', () => {
    const engineFee = CONTEXT.economy.machineShopAssist.feeYenByGroup.engine
    const stockCams = CONTEXT.stockPartByCarPartId.shitbox!.camsTiming!
    const newCams: PartInstance = {
      id: 'pi-new-cams',
      partId: stockCams.id,
      band: 'mint',
      genuinePeriod: false,
      origin: makeMarketOrigin(1),
      pricePaidYen: 20_000,
    }
    // camsTiming empty and its blocker (cooling) off, so the install is legal.
    const carReady: CarInstance = {
      ...car,
      parts: { ...car.parts, cooling: { installed: null }, camsTiming: { installed: null } },
    }
    const spec = {
      carInstanceId: car.id,
      kind: 'install-part' as const,
      componentId: 'engine' as const,
      partInstanceId: newCams.id,
      laborSlotsRequired: installLaborSlotsFor('camsTiming', CONTEXT),
    }
    const tierOneState = baseState({
      ownedCars: [carReady],
      partInventory: [newCams],
      serviceBayCarIds: [car.id],
      toolTiers: testToolTiers({ engine: 1 }),
    })
    const cashBefore = tierOneState.cashYen
    const installed = resolveJobLabor(tierOneState, spec, Infinity, CONTEXT)
    expect(installed.state.ownedCars[0]?.parts.camsTiming.installed?.id).toBe(newCams.id)
    expect(installed.state.cashYen).toBe(cashBefore - engineFee)
    expect(installed.state.carLedgers[car.id]?.repairYen).toBe(engineFee)

    // At tier 2 the same install owes no assist fee.
    const tierTwoState = baseState({
      ownedCars: [carReady],
      partInventory: [newCams],
      serviceBayCarIds: [car.id],
      toolTiers: testToolTiers({ engine: 2 }),
    })
    const freeInstall = resolveJobLabor(tierTwoState, spec, Infinity, CONTEXT)
    expect(freeInstall.state.ownedCars[0]?.parts.camsTiming.installed?.id).toBe(newCams.id)
    expect(freeInstall.state.cashYen).toBe(tierTwoState.cashYen)
  })

  /**
   * Sprint 79 (the equivalence-priced labour model, maintainer directive
   * 2026-07-16): `removeSlotsByClass` is zeroed at every depth - removal and
   * like-for-like reassembly are free; only IMPROVING a slot is charged.
   * Directive 17 case (a): this test used to assert remove costing 0/1/2 by
   * depth class - that is now intentionally wrong, since removal is always
   * free regardless of depth.
   */
  it('removal costs 0 labour at every depth class; install stays per-depth-class: 0 surface, 1 bolt-on, 2 buried', () => {
    expect(removeLaborSlotsFor('panels', CONTEXT)).toBe(0)
    expect(removeLaborSlotsFor('exhaust', CONTEXT)).toBe(0)
    expect(removeLaborSlotsFor('camsTiming', CONTEXT)).toBe(0)
    expect(installLaborSlotsFor('panels', CONTEXT)).toBe(0)
    expect(installLaborSlotsFor('exhaust', CONTEXT)).toBe(1)
    expect(installLaborSlotsFor('camsTiming', CONTEXT)).toBe(2)
  })

  /**
   * Sprint 79: directive 17 case (a) again - the old test proved a removal
   * could be labour-starved (camsTiming needed 2 slots, offering 1 refused
   * it). Removal is now genuinely free, so the same scenario must now
   * succeed even when NO labour is offered at all - the intentional new
   * correct behaviour, not a regression.
   */
  it('a removal succeeds even when zero labour is offered today, since removal now costs nothing', () => {
    const tierTwo = baseState({ toolTiers: testToolTiers({ engine: 2 }) })
    const afterCooling = resolveRemovePart(tierTwo, car.id, 'cooling', CONTEXT)

    const funded = resolveRemovePart(afterCooling.state, car.id, 'camsTiming', CONTEXT, 0)
    expect(funded.laborSlotsUsed).toBe(0)
    expect(funded.log).toHaveLength(1)
    expect(funded.state.ownedCars[0]?.parts.camsTiming.installed).toBeNull()
  })
})

describe('the equivalence-priced labour model (Sprint 79 decision 1, maintainer directive 2026-07-16)', () => {
  // honda-city-e-aa is 'shitbox' tier (Sprint 53) - `partFitsCar` requires an
  // exact fitment-class match, so the car's rims/tyres must be real
  // shitbox-class stock instances, not `testFixtures.ts`'s generic
  // common-class default (which is fixture convenience only, never checked
  // against a real model's tier).
  const stockRims = CONTEXT.stockPartByCarPartId.shitbox!.rims!
  const stockTyres = CONTEXT.stockPartByCarPartId.shitbox!.tyres!
  const originalRims: PartInstance = {
    id: 'pi-original-rims',
    partId: stockRims.id,
    band: 'worn',
    genuinePeriod: false,
    origin: makeCarOrigin('car-wheels-worn', 'Test Car', 0),
  }
  const originalTyres: PartInstance = {
    id: 'pi-original-tyres',
    partId: stockTyres.id,
    band: 'worn',
    genuinePeriod: false,
    origin: makeCarOrigin('car-wheels-worn', 'Test Car', 0),
  }
  const wheelsWornCar: CarInstance = buildCarInstance({
    id: 'car-wheels-worn',
    modelId: 'honda-city-e-aa',
    parts: mintCarParts({ rims: originalRims, tyres: originalTyres }),
  })
  const fittingTyre = PARTS.find(
    (p) => p.carPartId === 'tyres' && p.fitmentClass === 'shitbox' && p.grade === 'street',
  )!
  const fittingRims = PARTS.find(
    (p) => p.carPartId === 'rims' && p.fitmentClass === 'shitbox' && p.grade === 'street',
  )!

  it('contract case 1: pull rims, pull tyres, refit both as they were - 0 labour total', () => {
    const state = baseState({
      ownedCars: [wheelsWornCar],
      partInventory: [],
      serviceBayCarIds: [wheelsWornCar.id],
    })
    const rimsOff = resolveRemovePart(state, wheelsWornCar.id, 'rims', CONTEXT)
    expect(rimsOff.laborSlotsUsed).toBe(0)
    const tyresOff = resolveRemovePart(rimsOff.state, wheelsWornCar.id, 'tyres', CONTEXT)
    expect(tyresOff.laborSlotsUsed).toBe(0)

    const carAfterBothOff = tyresOff.state.ownedCars[0]!
    const tyresRefitSlots = refitLaborSlotsFor(carAfterBothOff, 'tyres', originalTyres, CONTEXT)
    expect(tyresRefitSlots).toBe(0)
    const tyresRefit = resolveJobLabor(
      tyresOff.state,
      {
        carInstanceId: wheelsWornCar.id,
        kind: 'install-part',
        componentId: 'wheels',
        partInstanceId: originalTyres.id,
        laborSlotsRequired: tyresRefitSlots,
      },
      Infinity,
      CONTEXT,
    )
    expect(tyresRefit.laborSlotsUsed).toBe(0)

    const carAfterTyresRefit = tyresRefit.state.ownedCars[0]!
    const rimsRefitSlots = refitLaborSlotsFor(carAfterTyresRefit, 'rims', originalRims, CONTEXT)
    expect(rimsRefitSlots).toBe(0)
    const rimsRefit = resolveJobLabor(
      tyresRefit.state,
      {
        carInstanceId: wheelsWornCar.id,
        kind: 'install-part',
        componentId: 'wheels',
        partInstanceId: originalRims.id,
        laborSlotsRequired: rimsRefitSlots,
      },
      Infinity,
      CONTEXT,
    )
    expect(rimsRefit.laborSlotsUsed).toBe(0)
    expect(rimsRefit.state.ownedCars[0]?.parts.rims.installed?.id).toBe(originalRims.id)
    expect(rimsRefit.state.ownedCars[0]?.parts.tyres.installed?.id).toBe(originalTyres.id)
  })

  it('contract case 2: pull rims, pull tyres, fit NEW tyres, refit rims - new-tyre install only', () => {
    const newTyres: PartInstance = {
      id: 'pi-new-tyres',
      partId: fittingTyre.id,
      band: 'mint',
      genuinePeriod: false,
      origin: makeMarketOrigin(1),
    }
    const state = baseState({
      ownedCars: [wheelsWornCar],
      partInventory: [newTyres],
      serviceBayCarIds: [wheelsWornCar.id],
    })
    const rimsOff = resolveRemovePart(state, wheelsWornCar.id, 'rims', CONTEXT)
    const tyresOff = resolveRemovePart(rimsOff.state, wheelsWornCar.id, 'tyres', CONTEXT)

    const carAfterBothOff = tyresOff.state.ownedCars[0]!
    const newTyresSlots = refitLaborSlotsFor(carAfterBothOff, 'tyres', newTyres, CONTEXT)
    expect(newTyresSlots).toBe(1) // bolt-on, no baseline match - a genuinely different part
    const newTyresFit = resolveJobLabor(
      tyresOff.state,
      {
        carInstanceId: wheelsWornCar.id,
        kind: 'install-part',
        componentId: 'wheels',
        partInstanceId: newTyres.id,
        laborSlotsRequired: newTyresSlots,
      },
      Infinity,
      CONTEXT,
    )
    expect(newTyresFit.laborSlotsUsed).toBe(1)

    const carAfterNewTyres = newTyresFit.state.ownedCars[0]!
    const rimsRefitSlots = refitLaborSlotsFor(carAfterNewTyres, 'rims', originalRims, CONTEXT)
    expect(rimsRefitSlots).toBe(0)
    const rimsRefit = resolveJobLabor(
      newTyresFit.state,
      {
        carInstanceId: wheelsWornCar.id,
        kind: 'install-part',
        componentId: 'wheels',
        partInstanceId: originalRims.id,
        laborSlotsRequired: rimsRefitSlots,
      },
      Infinity,
      CONTEXT,
    )
    expect(rimsRefit.laborSlotsUsed).toBe(0)

    const totalLabour = newTyresFit.laborSlotsUsed + rimsRefit.laborSlotsUsed
    expect(totalLabour).toBe(1)
  })

  it('contract case 3: pull rims, pull tyres, bench-repair rims, fit NEW tyres, refit the repaired rims - rim repair labour + rim refit + new-tyre install (supersedes the loose variant, which would have charged only 2)', () => {
    const newTyres: PartInstance = {
      id: 'pi-new-tyres-2',
      partId: fittingTyre.id,
      band: 'mint',
      genuinePeriod: false,
      origin: makeMarketOrigin(1),
    }
    const state = baseState({
      ownedCars: [wheelsWornCar],
      partInventory: [newTyres],
      serviceBayCarIds: [wheelsWornCar.id],
    })
    const rimsOff = resolveRemovePart(state, wheelsWornCar.id, 'rims', CONTEXT)
    const tyresOff = resolveRemovePart(rimsOff.state, wheelsWornCar.id, 'tyres', CONTEXT)

    const pulledRims = tyresOff.state.partInventory.find((p) => p.id === originalRims.id)!
    expect(pulledRims.band).toBe('worn')
    const repair = resolveReconditionLabor(tyresOff.state, pulledRims.id, 'mint', Infinity, CONTEXT)
    expect(repair.laborSlotsUsed).toBeGreaterThan(0)
    const repairedRims = repair.state.partInventory.find((p) => p.id === originalRims.id)!
    expect(repairedRims.band).toBe('mint') // no longer matches the 'worn' vacated baseline

    const carAfterBothOff = repair.state.ownedCars[0]!
    const newTyresSlots = refitLaborSlotsFor(carAfterBothOff, 'tyres', newTyres, CONTEXT)
    expect(newTyresSlots).toBe(1)
    const newTyresFit = resolveJobLabor(
      repair.state,
      {
        carInstanceId: wheelsWornCar.id,
        kind: 'install-part',
        componentId: 'wheels',
        partInstanceId: newTyres.id,
        laborSlotsRequired: newTyresSlots,
      },
      Infinity,
      CONTEXT,
    )
    expect(newTyresFit.laborSlotsUsed).toBe(1)

    const carAfterNewTyres = newTyresFit.state.ownedCars[0]!
    const repairedRimsRefitSlots = refitLaborSlotsFor(
      carAfterNewTyres,
      'rims',
      repairedRims,
      CONTEXT,
    )
    expect(repairedRimsRefitSlots).toBe(1) // band changed by the repair - equivalence fails
    const rimsRefit = resolveJobLabor(
      newTyresFit.state,
      {
        carInstanceId: wheelsWornCar.id,
        kind: 'install-part',
        componentId: 'wheels',
        partInstanceId: repairedRims.id,
        laborSlotsRequired: repairedRimsRefitSlots,
      },
      Infinity,
      CONTEXT,
    )
    expect(rimsRefit.laborSlotsUsed).toBe(1)

    // Three distinctly charged components: the rim's own bench-repair labour,
    // the repaired rim's own refit, and the new tyre's own install - never
    // the old loose variant's 2 (which took the rim refit for free).
    expect(rimsRefit.state.ownedCars[0]?.parts.rims.installed?.band).toBe('mint')
    expect(rimsRefit.state.ownedCars[0]?.parts.tyres.installed?.id).toBe(newTyres.id)
  })

  it('the equivalence hole: a different-SKU part at the SAME band as the vacated baseline is still charged (partId, band, and genuinePeriod must all match)', () => {
    const state = baseState({
      ownedCars: [wheelsWornCar],
      partInventory: [],
      serviceBayCarIds: [wheelsWornCar.id],
    })
    const rimsOff = resolveRemovePart(state, wheelsWornCar.id, 'rims', CONTEXT)
    const carAfterRimsOff = rimsOff.state.ownedCars[0]!

    // Same band ('worn') as the vacated baseline, but a genuinely different
    // catalog part (an aftermarket rim, not the stock one that came off).
    const differentSkuSameBand: PartInstance = {
      id: 'pi-different-sku',
      partId: fittingRims.id,
      band: 'worn',
      genuinePeriod: false,
      origin: makeMarketOrigin(1),
    }
    expect(differentSkuSameBand.partId).not.toBe(originalRims.partId)
    expect(differentSkuSameBand.band).toBe(originalRims.band)
    const slots = refitLaborSlotsFor(carAfterRimsOff, 'rims', differentSkuSameBand, CONTEXT)
    expect(slots).toBe(1) // charged - matching band alone is not equivalence
  })

  /**
   * Sprint 79 decision 1's clutch illustration, verbatim in spirit: blockers
   * off free, clutch out free, a NEW clutch's refit charged at its buried
   * class (2 slots). `clutch` is `repairable: false` in the shipped taxonomy
   * (Sprint 71), so "bench rebuild" is tested here via the only real route a
   * clutch actually has - buy-new, not bench-repair - which still proves the
   * doc's point: an improved (here, replaced) slot always costs, deep work
   * costs exactly the value it adds.
   */
  it('the clutch chain: gearbox blockers off free, clutch off free, a NEW clutch refit charged at the buried rate (2 slots)', () => {
    const drivetrainState = baseState({ toolTiers: testToolTiers({ drivetrain: 2 }) })
    const exhaustOff = resolveRemovePart(drivetrainState, car.id, 'exhaust', CONTEXT)
    expect(exhaustOff.laborSlotsUsed).toBe(0)
    const drivelineOff = resolveRemovePart(exhaustOff.state, car.id, 'driveline', CONTEXT)
    expect(drivelineOff.laborSlotsUsed).toBe(0)
    const gearboxOff = resolveRemovePart(drivelineOff.state, car.id, 'gearbox', CONTEXT)
    expect(gearboxOff.laborSlotsUsed).toBe(0)
    const clutchOff = resolveRemovePart(gearboxOff.state, car.id, 'clutch', CONTEXT)
    expect(clutchOff.laborSlotsUsed).toBe(0)

    const fittingClutch = PARTS.find(
      (p) => p.carPartId === 'clutch' && p.fitmentClass === 'shitbox' && p.grade === 'stock',
    )!
    const newClutch: PartInstance = {
      id: 'pi-new-clutch',
      partId: fittingClutch.id,
      band: 'mint',
      genuinePeriod: false,
      origin: makeMarketOrigin(1),
    }
    const carAfterClutchOff = {
      ...clutchOff.state,
      partInventory: [...clutchOff.state.partInventory, newClutch],
    }
    const carForRefit = carAfterClutchOff.ownedCars[0]!
    const clutchRefitSlots = refitLaborSlotsFor(carForRefit, 'clutch', newClutch, CONTEXT)
    expect(clutchRefitSlots).toBe(2) // buried, no baseline match - deep work costs what it adds
  })
})

describe('resolveRemovePart wiring to revealOnRemoval (Sprint 74 decision 4): the reveal-on-removal rule', () => {
  /** Two causes on two different real, always-installed parts of the module
   * `car` fixture (`panels`/`seats`, both surface, both freely removable) -
   * just enough to prove the owned-car branch of `resolveRemovePart`
   * actually reaches `revealOnRemoval`, both branches. */
  const REVEAL_TEST_SYMPTOM = {
    id: 'reveal-test-symptom',
    cardLine: 'Reveal test symptom.',
    causes: [
      { id: 'cause-panels', carPartId: 'panels' as const, setBand: 'poor' as const, weight: 50 },
      { id: 'cause-seats', carPartId: 'seats' as const, setBand: 'poor' as const, weight: 50 },
    ],
    tests: [],
  }
  const CONTEXT_WITH_SYMPTOM = buildSimContext(
    CARS,
    PARTS,
    [],
    PARTS_TAXONOMY,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    [REVEAL_TEST_SYMPTOM],
  )

  function carWithRevealSymptom(trueCauseId: string): CarInstance {
    return {
      ...car,
      symptoms: [
        {
          symptomId: 'reveal-test-symptom',
          trueCauseId,
          remainingCauseIds: ['cause-panels', 'cause-seats'],
          runTestIds: [],
        },
      ],
    }
  }

  it('removing the part the true cause targets reveals it: the part-removed log entry gains revealedCauseId, and the symptom collapses to [trueCauseId]', () => {
    const state = baseState({ ownedCars: [carWithRevealSymptom('cause-panels')] })
    const result = resolveRemovePart(state, car.id, 'panels', CONTEXT_WITH_SYMPTOM)
    expect(result.log).toEqual([
      {
        type: 'part-removed',
        carInstanceId: car.id,
        carPartId: 'panels',
        partInstanceId: car.parts.panels.installed!.id,
        revealedCauseId: 'cause-panels',
      },
    ])
    expect(result.state.ownedCars[0]!.symptoms[0]!.remainingCauseIds).toEqual(['cause-panels'])
  })

  it('removing a part the true cause does NOT target silently narrows without a reveal line: no revealedCauseId key on the log entry, the other candidate is eliminated', () => {
    const state = baseState({ ownedCars: [carWithRevealSymptom('cause-panels')] })
    const result = resolveRemovePart(state, car.id, 'seats', CONTEXT_WITH_SYMPTOM)
    expect(result.log).toEqual([
      {
        type: 'part-removed',
        carInstanceId: car.id,
        carPartId: 'seats',
        partInstanceId: car.parts.seats.installed!.id,
      },
    ])
    expect(result.log[0]).not.toHaveProperty('revealedCauseId')
    expect(result.state.ownedCars[0]!.symptoms[0]!.remainingCauseIds).toEqual(['cause-panels'])
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
    origin: makeMarketOrigin(1),
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

  it('the recondition quote matches the on-car per-part repair plan for the identical part, exactly - Sprint 44: one shared formula, no car-dependent factor to isolate from', () => {
    const invState = baseState({ ownedCars: [], partInventory: [loosePart] })
    const quote = reconditionQuote(invState, loosePart.id, 'mint', CONTEXT)!
    expect(quote).not.toBeNull()

    // The on-car per-part plan for the identical part - Sprint 44: cost
    // derives from the installed instance's own catalog price, never a
    // car/tier factor, so the bench and on-car formulas are simply the same
    // call with the same inputs.
    const plan = planGroupRepair(
      carWithPoorPanels(),
      'body',
      'mint',
      invState.toolTiers,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      REPAIR_STEP_FRACTION,
      'panels',
    )

    expect(quote.laborSlotsRequired).toBe(plan.laborSlotsRequired)
    expect(quote.costYen).toBe(plan.costYen)
  })

  it("Sprint 42: a bench recondition adds its full repair charge to the loose instance's pricePaidYen, not any car ledger", () => {
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

  it('reconditioning and on-car repair of the identical part cost and take exactly the same cash and labor - Sprint 44: repair price is intrinsic to the part, never the host car, structurally closing the donor-car arbitrage a car-dependent factor would allow', () => {
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
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      REPAIR_STEP_FRACTION,
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
    expect(carCashSpent).toBe(onCarPlan.costYen)

    // In-inventory: recondition the identical loose part (same catalog part,
    // same starting band) to mint - the SAME repairStepFraction, priced off
    // the SAME instance's own catalog price, since there is no car-dependent
    // factor left to differ by.
    const invState = baseState({ ownedCars: [], partInventory: [loosePart] })
    const benchPlan = planGroupRepair(
      carWithPoorPanels(),
      'body',
      'mint',
      invState.toolTiers,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      REPAIR_STEP_FRACTION,
      'panels',
    )
    const invResult = resolveReconditionLabor(invState, loosePart.id, 'mint', 6, CONTEXT)
    const invCashSpent = invState.cashYen - invResult.state.cashYen
    const invLaborSpent = invResult.state.laborSlotsSpentToday
    expect(invCashSpent).toBe(benchPlan.costYen)

    // Same labor either way (tier-independent labor sizing, unchanged).
    expect(invLaborSpent).toBe(carLaborSpent)
    // Same repair cash too - the arbitrage-death assertion: a Sprint 41-style
    // car-tier factor would have made these differ (e.g. a shitbox car
    // repairing far cheaper than the bench); Sprint 44 makes them identical,
    // since price is intrinsic to the part, not to whether or which car it's
    // bolted to.
    expect(carCashSpent).toBe(invCashSpent)
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
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1, // repairStepFraction is irrelevant to labor sizing - only laborSlotsRequired is checked below
      'panels',
    )
    expect(t3Quote.laborSlotsRequired).toBe(t3Plan.laborSlotsRequired)
    // The yen cost of the work itself is tier-independent (decision 7), and
    // Sprint 47 removed the per-tier consumables fee entirely - the two
    // quotes cost exactly the same.
    expect(t3Quote.costYen).toBe(t1Quote.costYen)
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
      origin: makeMarketOrigin(1),
    }
    const state = baseState({ ownedCars: [], partInventory: [wornTyres] })

    expect(reconditionQuote(state, wornTyres.id, 'mint', CONTEXT)).toBeNull()

    const result = resolveReconditionLabor(state, wornTyres.id, 'mint', 6, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.laborSlotsUsed).toBe(0)
    expect(result.state.partInventory[0]?.band).toBe('worn') // unchanged
  })
})
