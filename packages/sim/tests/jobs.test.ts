import {
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type CarPartId,
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
  machineAssistFeeYen,
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

// Real CARS/PARTS: an install spec must resolve against the actual catalog.
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
    // dampers is left genuinely empty: the install-part tests below need a
    // real target slot to install onto.
    dampers: { installed: null },
  },
})

/** Mirrors the repair-cost knob `repairJobGate` resolves internally, so this
 * file's own `planGroupRepair` calls predict the exact same charge. */
const REPAIR_STEP_FRACTION = CONTEXT.economy.restoration.repairStepFraction

// `car` is 'shitbox' tier: fitting catalog parts here must be shitbox-class
// SKUs or the fitment-class check refuses them first.
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
    energySpentToday: 0,
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

  it("Sprint 42: a completed install-part job on an OWNED car adds the part's pricePaidYen to the car's ledger partsYen (Sprint 92: dampers is a suspension signature slot, so the tier-1 install also owes the assist fee as repairYen)", () => {
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
      repairYen: CONTEXT.economy.machineShopAssist.feeYenByGroup.suspension,
      partsYen: 42_000,
    })
  })

  it('Sprint 42: a completed install-part job with no pricePaidYen (unknown) adds 0 partsYen, still creating the ledger entry (Sprint 92: the suspension signature-slot assist fee still lands on repairYen)', () => {
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
      repairYen: CONTEXT.economy.machineShopAssist.feeYenByGroup.suspension,
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
    expect(result.state.serviceJobLedgers[owningJob.id]).toEqual({
      repairYen: CONTEXT.economy.machineShopAssist.feeYenByGroup.suspension,
      partsYen: 42_000,
    })
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
        targetBand: 'fine',
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
      targetBand: 'fine' as const,
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
        targetBand: 'fine',
        laborSlotsRequired: 3,
      },
      CONTEXT,
    )
    const second = findOrCreateJob(
      first.state,
      {
        // 'interior' is used here since engine is entirely bench-only now.
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'interior',
        targetBand: 'fine',
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
      targetBand: 'fine' as const,
      laborSlotsRequired: 3,
    }

    it('repair proceeds at tier 1 with nothing upgraded - there is no ownership refusal anymore', () => {
      const result = findOrCreateJob(baseState({ toolTiers: testToolTiers() }), spec, CONTEXT)
      expect(result.job).not.toBeNull()
      expect(result.state.jobs).toHaveLength(1)
      expect(result.log.some((e) => e.type === 'job-blocked')).toBe(false)
    })

    it("charges exactly the group's real (tier-scaled) repair cost plus the Sprint 92 body signature-slot assist fee, deducted from cash - no consumables fee (Sprint 47)", () => {
      const plan = planGroupRepair(
        car,
        'body',
        'fine',
        testToolTiers(),
        CONTEXT.partIdsByGroup,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        REPAIR_STEP_FRACTION,
        CONTEXT.economy.energy.energyPerGradeByTier,
      )
      // The body group's signature slots owe the one-per-job assist fee too.
      const totalCostYen = plan.costYen + CONTEXT.economy.machineShopAssist.feeYenByGroup.body
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

    it('Sprint 42: creates the ledger entry and adds the full repair charge (plus the Sprint 92 body assist fee) as repairYen for an OWNED car', () => {
      const plan = planGroupRepair(
        car,
        'body',
        'fine',
        testToolTiers(),
        CONTEXT.partIdsByGroup,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        REPAIR_STEP_FRACTION,
        CONTEXT.economy.energy.energyPerGradeByTier,
      )
      const totalCostYen = plan.costYen + CONTEXT.economy.machineShopAssist.feeYenByGroup.body
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
      const secondSpec = { ...spec, componentId: 'interior' as const, laborSlotsRequired: 2 }
      const second = findOrCreateJob(first.state, secondSpec, CONTEXT)
      expect(second.state.carLedgers[car.id]!.repairYen).toBeGreaterThan(afterFirstRepairYen)
    })

    it('a tier-2 line takes fewer labor slots for the same repair cost (Sprint 47: tier no longer affects cost at all)', () => {
      const t2State = baseState({ toolTiers: testToolTiers({ body: 2 }) })
      const t2Plan = planGroupRepair(
        car,
        'body',
        'fine',
        t2State.toolTiers,
        CONTEXT.partIdsByGroup,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        REPAIR_STEP_FRACTION,
        CONTEXT.economy.energy.energyPerGradeByTier,
      )
      const t1Plan = planGroupRepair(
        car,
        'body',
        'fine',
        testToolTiers(),
        CONTEXT.partIdsByGroup,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        REPAIR_STEP_FRACTION,
        CONTEXT.economy.energy.energyPerGradeByTier,
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
        'fine',
        testToolTiers(),
        CONTEXT.partIdsByGroup,
        CONTEXT.partsById,
        CONTEXT.partsTaxonomyById,
        REPAIR_STEP_FRACTION,
        CONTEXT.economy.energy.energyPerGradeByTier,
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

    // `car`'s model is factory-NA, so fitting the FIRST turbo is a
    // conversion, gated behind engine tier 3.
    it("refuses converting a factory-NA car to forced induction below engine tier 3 (reason 'tool-tier'), allows it at tier 3", () => {
      const naCar: CarInstance = {
        ...car,
        // intake is emptied too, so this isolates the tool-tier gate rather
        // than tripping the blockedBy rule instead.
        parts: { ...car.parts, forcedInduction: { installed: null }, intake: { installed: null } },
      }
      // The turbo kit must be the shitbox-class SKU or the fitment check
      // refuses it first.
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
        targetBand: 'fine',
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
        targetBand: 'fine',
        laborSlotsRequired: 3,
      },
      CONTEXT,
    )
    const result = applyAvailableLaborToJob(created.state, created.job!.id, 2, CONTEXT)
    expect(result.laborSlotsUsed).toBe(2)
    expect(result.state.energySpentToday).toBe(2)
    expect(result.state.jobs[0]?.laborSlotsSpent).toBe(2)
  })

  it('completes and removes the job the instant it crosses its requirement', () => {
    const created = findOrCreateJob(
      baseState({ serviceBayCarIds: [car.id] }),
      {
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'fine',
        laborSlotsRequired: 2,
      },
      CONTEXT,
    )
    const result = applyAvailableLaborToJob(created.state, created.job!.id, 5, CONTEXT)
    expect(result.laborSlotsUsed).toBe(2) // clamped to what the job needed, not the offer
    expect(result.state.jobs).toHaveLength(0)
    expect(result.state.ownedCars[0]?.parts.panels.installed?.band).toBe('fine')
    expect(result.log.some((e) => e.type === 'job-completed')).toBe(true)
  })

  it('does nothing for a car not sitting in a service bay (labor never reaches it)', () => {
    const created = findOrCreateJob(
      baseState(),
      {
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'fine',
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
      targetBand: 'fine' as const,
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
      targetBand: 'fine' as const,
      laborSlotsRequired: 3,
    }
    const first = resolveJobLabor(state, spec, 1, CONTEXT)
    const second = resolveJobLabor(first.state, spec, 5, CONTEXT)
    expect(second.state.jobs).toHaveLength(0) // completed and removed
    expect(second.state.ownedCars[0]?.parts.panels.installed?.band).toBe('fine')
  })

  it('repair proceeds at tier 1 with nothing upgraded - no refusal path exists (Sprint 36)', () => {
    const state = baseState({ serviceBayCarIds: [car.id], toolTiers: testToolTiers() })
    const spec = {
      carInstanceId: car.id,
      kind: 'repair-zone' as const,
      componentId: 'body' as const,
      targetBand: 'fine' as const,
      laborSlotsRequired: 3,
    }
    const result = resolveJobLabor(state, spec, 2, CONTEXT)
    expect(result.laborSlotsUsed).toBe(2)
    expect(result.state.jobs[0]?.laborSlotsSpent).toBe(2)
    expect(result.log.some((e) => e.type === 'job-blocked')).toBe(false)
  })
})

describe('resolveRemovePart (Sprint 32 decision 7)', () => {
  it('Sprint 88: refuses to pull an assembly member off the car directly (it comes off with its assembly)', () => {
    const state = baseState()
    const before = state.ownedCars[0]!.parts.rims.installed
    expect(before).not.toBeNull()
    const result = resolveRemovePart(state, car.id, 'rims', CONTEXT)
    expect(result.laborSlotsUsed).toBe(0)
    expect(result.log).toHaveLength(0)
    expect(result.state).toBe(state) // same reference - a genuine no-op
    expect(result.state.ownedCars[0]!.parts.rims.installed).toBe(before)
    expect(result.state.partInventory.some((p) => p.id === before!.id)).toBe(false)
  })

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

  // `vacatedBaseline` is the input `refitLaborSlotsFor` compares against.
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

  /** Wraps the module-level fixture `car` as the CUSTOMER's car. */
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
    // ...and the removed part lands in OUR inventory byte-identical, its
    // ownership (`origin`) never rewritten by removal.
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

    // gearbox and clutch are gearboxAssembly members - they never come off
    // the car per-part, even once every external blocker is clear.
    const afterDriveline = resolveRemovePart(afterExhaust.state, car.id, 'driveline', CONTEXT)
    expect(afterDriveline.log).toHaveLength(1)
    const gearboxRefused = resolveRemovePart(afterDriveline.state, car.id, 'gearbox', CONTEXT)
    expect(gearboxRefused.state).toBe(afterDriveline.state)
    expect(gearboxRefused.log).toEqual([])
    expect(afterDriveline.state.ownedCars[0]?.parts.gearbox.installed).not.toBeNull()
    const clutchRefused = resolveRemovePart(afterDriveline.state, car.id, 'clutch', CONTEXT)
    expect(clutchRefused.state).toBe(afterDriveline.state)
    expect(clutchRefused.log).toEqual([])
  })

  // camsTiming is an engineAssembly member, asserted through the fee
  // function directly since it no longer comes off the car per-part.
  it('a buried ENGINE-group member owes the machine-shop assist fee below engine tier 2, free at tier 2', () => {
    const engineFee = CONTEXT.economy.machineShopAssist.feeYenByGroup.engine
    expect(engineFee).toBeGreaterThan(0)
    const tierOne = baseState({ toolTiers: testToolTiers({ engine: 1 }) })
    expect(machineAssistFeeYen('camsTiming', tierOne, CONTEXT)).toBe(engineFee)
    const tierTwo = baseState({ toolTiers: testToolTiers({ engine: 2 }) })
    expect(machineAssistFeeYen('camsTiming', tierTwo, CONTEXT)).toBe(0)
  })

  // gearbox is a gearboxAssembly member, asserted the same way as camsTiming above.
  it('a buried DRIVETRAIN-group member owes the machine-shop assist fee below drivetrain tier 2, free at tier 2', () => {
    const drivetrainFee = CONTEXT.economy.machineShopAssist.feeYenByGroup.drivetrain
    expect(drivetrainFee).toBeGreaterThan(0)
    const tierOne = baseState({ toolTiers: testToolTiers({ drivetrain: 1 }) })
    expect(machineAssistFeeYen('gearbox', tierOne, CONTEXT)).toBe(drivetrainFee)
    const tierTwo = baseState({ toolTiers: testToolTiers({ drivetrain: 2 }) })
    expect(machineAssistFeeYen('gearbox', tierTwo, CONTEXT)).toBe(0)
  })

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
   * Removal labour is the flat `energy.actionPoints.removePart` figure (zero
   * at shipped tuning) regardless of depth class; only improving a slot is
   * charged, per depth class.
   */
  it('removal costs the flat removePart figure (0 at shipped tuning) at every depth; install stays per-depth-class energy', () => {
    const byClass = CONTEXT.economy.energy.energyByClass
    expect(removeLaborSlotsFor('panels', CONTEXT)).toBe(0)
    expect(removeLaborSlotsFor('exhaust', CONTEXT)).toBe(0)
    expect(removeLaborSlotsFor('camsTiming', CONTEXT)).toBe(0)
    expect(installLaborSlotsFor('panels', CONTEXT)).toBe(byClass.surface) // 0
    expect(installLaborSlotsFor('exhaust', CONTEXT)).toBe(byClass['bolt-on']) // 10
    expect(installLaborSlotsFor('camsTiming', CONTEXT)).toBe(byClass.buried) // 20
  })

  it('a removal succeeds even when zero labour is offered today, since removal now costs nothing', () => {
    const state = baseState()
    // exhaust is a loose bolt-on: assembly members come off only via the assembly.
    const funded = resolveRemovePart(state, car.id, 'exhaust', CONTEXT, 0)
    expect(funded.laborSlotsUsed).toBe(0)
    expect(funded.log).toHaveLength(1)
    expect(funded.state.ownedCars[0]?.parts.exhaust.installed).toBeNull()
  })
})

/** Builds the vacated-slot state directly for assembly members, which
 * `resolveRemovePart` now refuses to pull off the car per-part. */
function vacateSlot(state: GameState, carInstanceId: string, carPartId: CarPartId): GameState {
  const carIndex = state.ownedCars.findIndex((c) => c.id === carInstanceId)
  if (carIndex === -1) return state
  const carAt = state.ownedCars[carIndex]!
  const installed = carAt.parts[carPartId].installed
  if (!installed) return state
  const ownedCars = [...state.ownedCars]
  ownedCars[carIndex] = {
    ...carAt,
    parts: {
      ...carAt.parts,
      [carPartId]: {
        installed: null,
        vacatedBaseline: {
          partId: installed.partId,
          band: installed.band,
          genuinePeriod: installed.genuinePeriod,
        },
      },
    },
  }
  return { ...state, ownedCars, partInventory: [...state.partInventory, installed] }
}

describe('the equivalence-priced labour model (Sprint 79 decision 1, maintainer directive 2026-07-16)', () => {
  // honda-city-e-aa is 'shitbox' tier: rims/tyres must be real shitbox-class
  // stock instances to pass `partFitsCar`'s fitment-class match.
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
    const afterBoth = vacateSlot(
      vacateSlot(state, wheelsWornCar.id, 'rims'),
      wheelsWornCar.id,
      'tyres',
    )

    const carAfterBothOff = afterBoth.ownedCars[0]!
    const tyresRefitSlots = refitLaborSlotsFor(carAfterBothOff, 'tyres', originalTyres, CONTEXT)
    expect(tyresRefitSlots).toBe(0)
    const tyresRefit = resolveJobLabor(
      afterBoth,
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
    const afterBoth = vacateSlot(
      vacateSlot(state, wheelsWornCar.id, 'rims'),
      wheelsWornCar.id,
      'tyres',
    )

    const carAfterBothOff = afterBoth.ownedCars[0]!
    const newTyresSlots = refitLaborSlotsFor(carAfterBothOff, 'tyres', newTyres, CONTEXT)
    // Bolt-on install energy: no baseline match, a genuinely different part.
    expect(newTyresSlots).toBe(CONTEXT.economy.energy.energyByClass['bolt-on'])
    const newTyresFit = resolveJobLabor(
      afterBoth,
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
    expect(newTyresFit.laborSlotsUsed).toBe(CONTEXT.economy.energy.energyByClass['bolt-on'])

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
    expect(totalLabour).toBe(CONTEXT.economy.energy.energyByClass['bolt-on'])
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
    const afterBoth = vacateSlot(
      vacateSlot(state, wheelsWornCar.id, 'rims'),
      wheelsWornCar.id,
      'tyres',
    )

    const pulledRims = afterBoth.partInventory.find((p) => p.id === originalRims.id)!
    expect(pulledRims.band).toBe('worn')
    const repair = resolveReconditionLabor(afterBoth, pulledRims.id, 'fine', Infinity, CONTEXT)
    expect(repair.laborSlotsUsed).toBeGreaterThan(0)
    const repairedRims = repair.state.partInventory.find((p) => p.id === originalRims.id)!
    expect(repairedRims.band).toBe('fine') // no longer matches the 'worn' vacated baseline

    const carAfterBothOff = repair.state.ownedCars[0]!
    const newTyresSlots = refitLaborSlotsFor(carAfterBothOff, 'tyres', newTyres, CONTEXT)
    expect(newTyresSlots).toBe(CONTEXT.economy.energy.energyByClass['bolt-on'])
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
    expect(newTyresFit.laborSlotsUsed).toBe(CONTEXT.economy.energy.energyByClass['bolt-on'])

    const carAfterNewTyres = newTyresFit.state.ownedCars[0]!
    const repairedRimsRefitSlots = refitLaborSlotsFor(
      carAfterNewTyres,
      'rims',
      repairedRims,
      CONTEXT,
    )
    // band changed by the repair - equivalence fails, so bolt-on install energy.
    expect(repairedRimsRefitSlots).toBe(CONTEXT.economy.energy.energyByClass['bolt-on'])
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
    expect(rimsRefit.laborSlotsUsed).toBe(CONTEXT.economy.energy.energyByClass['bolt-on'])

    // Three distinctly charged components: the rim's own bench-repair labour,
    // the repaired rim's own refit, and the new tyre's own install - never
    // the old loose variant's 2 (which took the rim refit for free).
    expect(rimsRefit.state.ownedCars[0]?.parts.rims.installed?.band).toBe('fine')
    expect(rimsRefit.state.ownedCars[0]?.parts.tyres.installed?.id).toBe(newTyres.id)
  })

  it('the equivalence hole: a different-SKU part at the SAME band as the vacated baseline is still charged (partId, band, and genuinePeriod must all match)', () => {
    const state = baseState({
      ownedCars: [wheelsWornCar],
      partInventory: [],
      serviceBayCarIds: [wheelsWornCar.id],
    })
    const afterRims = vacateSlot(state, wheelsWornCar.id, 'rims')
    const carAfterRimsOff = afterRims.ownedCars[0]!

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
    // charged - matching band alone is not equivalence (bolt-on install energy).
    expect(slots).toBe(CONTEXT.economy.energy.energyByClass['bolt-on'])
  })

  it('the clutch chain: gearbox blockers off free, clutch off free, a NEW clutch refit charged at the buried rate (2 slots)', () => {
    const drivetrainState = baseState({ toolTiers: testToolTiers({ drivetrain: 2 }) })
    const exhaustOff = resolveRemovePart(drivetrainState, car.id, 'exhaust', CONTEXT)
    expect(exhaustOff.laborSlotsUsed).toBe(0)
    const drivelineOff = resolveRemovePart(exhaustOff.state, car.id, 'driveline', CONTEXT)
    expect(drivelineOff.laborSlotsUsed).toBe(0)
    // gearbox and clutch are gearboxAssembly members: vacated via vacateSlot,
    // not per-part removal.
    const clutchVacated = vacateSlot(
      vacateSlot(drivelineOff.state, car.id, 'gearbox'),
      car.id,
      'clutch',
    )

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
      ...clutchVacated,
      partInventory: [...clutchVacated.partInventory, newClutch],
    }
    const carForRefit = carAfterClutchOff.ownedCars[0]!
    const clutchRefitSlots = refitLaborSlotsFor(carForRefit, 'clutch', newClutch, CONTEXT)
    // buried, no baseline match - deep work costs what it adds (buried install energy).
    expect(clutchRefitSlots).toBe(CONTEXT.economy.energy.energyByClass.buried)
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

  describe('completeJob wiring to pruneCuredCauses (cure-on-repair)', () => {
    it('a completed per-part repair-zone job that raises a resolved cause’s part past its setBand cures the symptom outright - it leaves car.symptoms entirely', () => {
      const base = carWithRevealSymptom('cause-panels')
      const resolvedCar: CarInstance = {
        ...base,
        symptoms: [{ ...base.symptoms[0]!, remainingCauseIds: ['cause-panels'] }],
      }
      const state = baseState({ ownedCars: [resolvedCar] })
      const job: Job = {
        id: 'job-cure-panels',
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: 'body',
        carPartId: 'panels',
        targetBand: 'mint',
        laborSlotsRequired: 1,
        laborSlotsSpent: 1,
      }
      const result = completeJob(state, job, CONTEXT_WITH_SYMPTOM)
      expect(result.state.ownedCars[0]!.parts.panels.installed?.band).toBe('mint')
      expect(result.state.ownedCars[0]!.symptoms).toEqual([])
    })

    it('a completed install-part job that fits a strictly-better part cures a resolved cause on that slot', () => {
      // Seats is vacated directly so an install-part job has a real slot to fill.
      const base = carWithRevealSymptom('cause-seats')
      const resolvedCar: CarInstance = {
        ...base,
        symptoms: [{ ...base.symptoms[0]!, remainingCauseIds: ['cause-seats'] }],
        parts: {
          ...base.parts,
          seats: {
            installed: null,
            vacatedBaseline: { partId: 'stub', band: 'poor', genuinePeriod: false },
          },
        },
      }
      const mintSeats: PartInstance = {
        id: 'pi-mint-seats',
        partId: PARTS.find((p) => p.carPartId === 'seats' && p.grade === 'stock')!.id,
        band: 'mint',
        genuinePeriod: false,
        origin: makeMarketOrigin(1),
      }
      const state = baseState({ ownedCars: [resolvedCar], partInventory: [mintSeats] })
      const job: Job = {
        id: 'job-cure-seats',
        carInstanceId: car.id,
        kind: 'install-part',
        componentId: 'interior',
        partInstanceId: mintSeats.id,
        laborSlotsRequired: 1,
        laborSlotsSpent: 1,
      }
      const result = completeJob(state, job, CONTEXT_WITH_SYMPTOM)
      expect(result.state.ownedCars[0]!.parts.seats.installed?.id).toBe(mintSeats.id)
      expect(result.state.ownedCars[0]!.symptoms).toEqual([])
    })
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
    const quote = reconditionQuote(invState, loosePart.id, 'fine', CONTEXT)!
    expect(quote).not.toBeNull()

    // The on-car per-part plan for the identical part - same call, same inputs.
    const plan = planGroupRepair(
      carWithPoorPanels(),
      'body',
      'fine',
      invState.toolTiers,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      REPAIR_STEP_FRACTION,
      CONTEXT.economy.energy.energyPerGradeByTier,
      'panels',
    )

    expect(quote.laborSlotsRequired).toBe(plan.laborSlotsRequired)
    expect(quote.costYen).toBe(plan.costYen)
  })

  it("Sprint 42: a bench recondition adds its full repair charge to the loose instance's pricePaidYen, not any car ledger", () => {
    const invState = baseState({ ownedCars: [], partInventory: [loosePart] })
    const quote = reconditionQuote(invState, loosePart.id, 'fine', CONTEXT)!
    // Offer a full day's energy so the energy-sized recondition completes.
    const result = resolveReconditionLabor(invState, loosePart.id, 'fine', 60, CONTEXT)
    const reconditioned = result.state.partInventory.find((p) => p.id === loosePart.id)
    expect(reconditioned?.band).toBe('fine')
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
    const quote = reconditionQuote(invState, alreadyPriced.id, 'fine', CONTEXT)!
    const result = resolveReconditionLabor(invState, alreadyPriced.id, 'fine', 10, CONTEXT)
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
      'fine',
      carState.toolTiers,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      REPAIR_STEP_FRACTION,
      CONTEXT.economy.energy.energyPerGradeByTier,
      'panels',
    )
    const carResult = resolveJobLabor(
      carState,
      {
        carInstanceId: 'car-ref',
        kind: 'repair-zone',
        componentId: 'body',
        targetBand: 'fine',
        carPartId: 'panels',
        laborSlotsRequired: onCarPlan.laborSlotsRequired,
      },
      // A full day's energy, so the energy-sized job completes.
      60,
      CONTEXT,
    )
    const carCashSpent = carState.cashYen - carResult.state.cashYen
    const carLaborSpent = carResult.state.energySpentToday
    // panels is a body signature slot: the on-car repair also owes the body
    // machine-shop assist fee, a tool-tier charge on top of the intrinsic price.
    const bodyFeeYen = CONTEXT.economy.machineShopAssist.feeYenByGroup.body
    expect(carResult.state.ownedCars[0]?.parts.panels.installed?.band).toBe('fine')
    expect(carCashSpent).toBeGreaterThan(0)
    expect(carLaborSpent).toBeGreaterThan(0)
    expect(carCashSpent).toBe(onCarPlan.costYen + bodyFeeYen)

    // In-inventory: recondition the identical loose part (same catalog part,
    // same starting band) to mint - the SAME repairStepFraction, priced off
    // the SAME instance's own catalog price, since there is no car-dependent
    // factor left to differ by.
    const invState = baseState({ ownedCars: [], partInventory: [loosePart] })
    const benchPlan = planGroupRepair(
      carWithPoorPanels(),
      'body',
      'fine',
      invState.toolTiers,
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      REPAIR_STEP_FRACTION,
      CONTEXT.economy.energy.energyPerGradeByTier,
      'panels',
    )
    const invResult = resolveReconditionLabor(invState, loosePart.id, 'fine', 60, CONTEXT)
    const invCashSpent = invState.cashYen - invResult.state.cashYen
    const invLaborSpent = invResult.state.energySpentToday
    expect(invCashSpent).toBe(benchPlan.costYen)

    // Same labor either way (tier-independent labor sizing, unchanged).
    expect(invLaborSpent).toBe(carLaborSpent)
    // The arbitrage-death assertion: the intrinsic repair price is identical
    // either way; the bench and on-car costs differ by exactly the body fee.
    expect(onCarPlan.costYen).toBe(benchPlan.costYen)
    expect(carCashSpent).toBe(invCashSpent + bodyFeeYen)
    // The loose part climbed to mint (and is no longer an open job).
    expect(invResult.state.partInventory[0]?.band).toBe('fine')
    expect(invResult.state.jobs).toHaveLength(0)
  })

  it('is sized by the same tool tier as on-car repair (no cheaper or slower bench path) - Sprint 36', () => {
    // poor -> fine is 2 grades: 2 slots at tier 1, 1 slot at tier 3, both paths.
    const t1Quote = reconditionQuote(
      baseState({ ownedCars: [], partInventory: [loosePart] }),
      loosePart.id,
      'fine',
      CONTEXT,
    )!
    const t3Quote = reconditionQuote(
      baseState({
        ownedCars: [],
        partInventory: [loosePart],
        toolTiers: testToolTiers({ body: 3 }),
      }),
      loosePart.id,
      'fine',
      CONTEXT,
    )!
    expect(t1Quote.laborSlotsRequired).toBe(2 * CONTEXT.economy.energy.energyPerGradeByTier[1])
    expect(t3Quote.laborSlotsRequired).toBe(2 * CONTEXT.economy.energy.energyPerGradeByTier[3])

    const t3Plan = planGroupRepair(
      carWithPoorPanels(),
      'body',
      'fine',
      testToolTiers({ body: 3 }),
      CONTEXT.partIdsByGroup,
      CONTEXT.partsById,
      CONTEXT.partsTaxonomyById,
      1, // repairStepFraction is irrelevant to labor sizing - only laborSlotsRequired is checked below
      CONTEXT.economy.energy.energyPerGradeByTier,
      'panels',
    )
    expect(t3Quote.laborSlotsRequired).toBe(t3Plan.laborSlotsRequired)
    // The yen cost of the work itself is tier-independent.
    expect(t3Quote.costYen).toBe(t1Quote.costYen)
  })

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
