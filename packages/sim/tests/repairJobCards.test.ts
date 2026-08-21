import {
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type CarInstance,
  type CarPartId,
  type ConditionBand,
  type GameState,
  type PartInstance,
  type ServiceJob,
  type StaffMember,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { bandIndex, costToBandYen } from '../src/bands'
import { buildSimContext } from '../src/context'
import { crewEnergySaved } from '../src/crewSkills'
import { defaultVerifiedSlots, isSlotVerified, priorBand } from '../src/knowledge'
import { makeMarketOrigin } from '../src/provenance'
import {
  REPAIR_JOB_KINDS,
  energyPlanFor,
  repairJobCards,
  repairJobIdFor,
  resolvePlaceOnBench,
  resolveRepairStep,
  targetBandFor,
  type RepairTarget,
} from '../src/repairJobs'
import { buildCarInstance, mintCarParts, testSceneStanding, testToolTiers } from './testFixtures'

// Real CARS/PARTS/PARTS_TAXONOMY: every price, recipe and taxonomy fact below
// is read off the actual catalog and workbench content, never hand-invented.
const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)

const MODEL_ID = 'honda-city-e-aa'

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 42,
    cashYen: 1_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    sceneStanding: testSceneStanding(),
    serviceJobOffers: [],
    activeServiceJobs: [],
    ownedCars: [],
    partInventory: [],
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
    forecourtBayCount: 2,
    forecourtCarIds: [null, null],
    graceParkingCarId: null,
    energySpentToday: 0,
    benchParts: {},
    lift: { owned: false, hirePaidDay: null },
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    toolShopsOwned: [],
    serviceJobLedgers: {},
    inspectionVisit: null,
    workbenchPartId: null,
    machinePartId: null,
    storyMissions: [],
    machineHirePaidDayByGroup: {},
    ...overrides,
  }
}

/**
 * `chassis` is the fixture of choice throughout this file: a fixed-surface
 * body part (`removable: false`), so Rebuild and Restore both work it
 * installed, on the car, with no bench placement to stage first. Its recipe
 * (workbench.json) is two tier-2 Rebuild steps (one `requiresMachine`) and
 * three shop-tier Restore steps, which is exactly the spread the route and
 * money cases below need.
 */
function chassisCar(id: string, band: ConditionBand = 'poor'): CarInstance {
  return buildCarInstance({ id, modelId: MODEL_ID, parts: mintCarParts({ chassis: band }) })
}

function customerServiceJob(id: string, car: CarInstance): ServiceJob {
  return {
    id,
    typeId: 'small-bodywork-touchup',
    customerName: 'Test Customer',
    description: 'Chassis rot.',
    tasks: [
      {
        kind: 'slotCondition',
        requirement: { kind: 'slotCondition', carPartId: 'chassis', minBand: 'fine' },
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
}

function sumPlan(plan: readonly number[]): number {
  return plan.reduce((sum, points) => sum + points, 0)
}

const REBUILD_TARGET = targetBandFor('rebuild', CONTEXT)
const SERVICE_TARGET = targetBandFor('service', CONTEXT)

describe('money', () => {
  it('charges the parts bill for the band distance crossed exactly once, and posts it to the car ledger', () => {
    const car = chassisCar('car-money-owned')
    const state = baseState({ ownedCars: [car], toolTiers: testToolTiers({ body: 2 }) })
    const target: RepairTarget = { kind: 'installed', carInstanceId: car.id, carPartId: 'chassis' }

    const installed = car.parts.chassis.installed!
    const catalogPart = CONTEXT.partsById[installed.partId]!
    const entry = CONTEXT.partsTaxonomyById.chassis
    // poor -> fine is two band steps, per the doc's own worked example.
    expect(bandIndex(REBUILD_TARGET) - bandIndex(installed.band)).toBe(2)
    const expectedBillYen = costToBandYen(
      installed.band,
      REBUILD_TARGET,
      entry,
      catalogPart.priceYen,
      CONTEXT.economy.restoration.repairStepFraction,
      catalogPart.fitmentClass,
    )
    expect(expectedBillYen).toBeGreaterThan(0)

    const step1 = resolveRepairStep(state, target, 'rebuild', CONTEXT, 999)
    expect(step1.outcome).toBe('stepped')
    expect(step1.state.cashYen).toBe(state.cashYen - expectedBillYen)
    expect(step1.state.carLedgers[car.id]).toEqual({
      purchaseYen: null,
      repairYen: expectedBillYen,
      partsYen: 0,
      listingFeesYen: 0,
    })
    // The band only moves on the last step.
    expect(step1.state.ownedCars[0]?.parts.chassis.installed?.band).toBe('poor')

    const step2 = resolveRepairStep(step1.state, target, 'rebuild', CONTEXT, 999)
    expect(step2.outcome).toBe('completed')
    // Charged once: step 2 moves no more cash and adds nothing further to the ledger.
    expect(step2.state.cashYen).toBe(step1.state.cashYen)
    expect(step2.state.carLedgers[car.id]?.repairYen).toBe(expectedBillYen)
    expect(step2.state.ownedCars[0]?.parts.chassis.installed?.band).toBe(REBUILD_TARGET)
  })

  it('posts the same charge to the service jobs own ledger, not any car ledger, on a customers car', () => {
    const customerCar = chassisCar('car-money-customer')
    const serviceJob = customerServiceJob('svc-money-test', customerCar)
    const state = baseState({
      ownedCars: [],
      activeServiceJobs: [serviceJob],
      toolTiers: testToolTiers({ body: 2 }),
    })
    const target: RepairTarget = {
      kind: 'installed',
      carInstanceId: customerCar.id,
      carPartId: 'chassis',
    }

    const installed = customerCar.parts.chassis.installed!
    const catalogPart = CONTEXT.partsById[installed.partId]!
    const entry = CONTEXT.partsTaxonomyById.chassis
    const expectedBillYen = costToBandYen(
      installed.band,
      REBUILD_TARGET,
      entry,
      catalogPart.priceYen,
      CONTEXT.economy.restoration.repairStepFraction,
      catalogPart.fitmentClass,
    )

    const step1 = resolveRepairStep(state, target, 'rebuild', CONTEXT, 999)
    expect(step1.outcome).toBe('stepped')
    expect(step1.state.carLedgers).toEqual({})
    expect(step1.state.serviceJobLedgers[serviceJob.id]).toEqual({
      repairYen: expectedBillYen,
      partsYen: 0,
    })
  })
})

describe('crew', () => {
  it('lowers the jobs total energy by exactly the benched crews discount, never dropping a step below one point', () => {
    const stockInternals = PARTS.find(
      (p) => p.carPartId === 'internals' && p.grade === 'stock' && p.fitmentClass === 'everyday',
    )!
    const instance: PartInstance = {
      id: 'pi-internals-crew',
      partId: stockInternals.id,
      band: 'poor',
      origin: makeMarketOrigin(1),
    }
    const target: RepairTarget = { kind: 'loose', partInstanceId: instance.id }
    const state = baseState({
      partInventory: [instance],
      toolTiers: testToolTiers({ engine: 2 }), // every tier-2 step owned outright, none slogged
    })

    const basePlan = energyPlanFor(state, CONTEXT, target, 'rebuild')
    expect(basePlan).toHaveLength(3) // internals.rebuild is 3 steps (workbench.json)
    const baseTotal = sumPlan(basePlan)
    expect(baseTotal).toBe(3 * CONTEXT.economy.energy.energyPerStepPoints)

    const engineCrew: StaffMember = {
      id: 'crew-engine',
      displayName: 'Engine crew',
      stats: { engine: 5, chassis: 1, body: 1 },
      laborSlotsPerDay: 1,
      assignment: 'bench',
      pendingAssignment: null,
      weeklyWageYen: 4000,
      trait: 'night-owl',
    }
    const crewedState = { ...state, staff: [engineCrew] }
    const crewedPlan = energyPlanFor(crewedState, CONTEXT, target, 'rebuild')
    const crewedTotal = sumPlan(crewedPlan)

    const expectedSaved = crewEnergySaved(baseTotal, 'engine', crewedState.staff, CONTEXT.economy)
    expect(expectedSaved).toBeGreaterThan(0)
    expect(crewedTotal).toBe(baseTotal - expectedSaved)
    expect(crewedPlan.every((points) => points >= 1)).toBe(true)
  })
})

describe('cards', () => {
  it('sums the live plan for the remaining steps, drops partsYen to zero once started, and shows only what is left', () => {
    const car = chassisCar('car-card-remaining')
    const state = baseState({ ownedCars: [car], toolTiers: testToolTiers({ body: 2 }) })
    const target: RepairTarget = { kind: 'installed', carInstanceId: car.id, carPartId: 'chassis' }

    const before = repairJobCards(state, CONTEXT, target).find((c) => c.kind === 'rebuild')!
    expect(before.stepsDone).toBe(0)
    expect(before.steps.map((s) => s.tool)).toEqual(['angle-grinder', 'mig-welder'])
    expect(before.energyPoints).toBe(sumPlan(energyPlanFor(state, CONTEXT, target, 'rebuild')))
    expect(before.partsYen).toBeGreaterThan(0)

    const stepped = resolveRepairStep(state, target, 'rebuild', CONTEXT, 999)
    expect(stepped.outcome).toBe('stepped')

    const after = repairJobCards(stepped.state, CONTEXT, target).find((c) => c.kind === 'rebuild')!
    expect(after.stepsDone).toBe(1)
    // Only the remaining step shows - the one already ticked is gone from the card.
    expect(after.steps.map((s) => s.tool)).toEqual(['mig-welder'])
    const remainingPlan = energyPlanFor(stepped.state, CONTEXT, target, 'rebuild').slice(1)
    expect(after.energyPoints).toBe(sumPlan(remainingPlan))
    expect(after.partsYen).toBe(0)
  })
})

describe('route aggregation', () => {
  it("'own' - every remaining step is owned outright", () => {
    const car = chassisCar('car-route-own')
    // Chassis Service is a single tier-1 step, always owned - no tool-tier
    // setup needed.
    const state = baseState({ ownedCars: [car] })
    const target: RepairTarget = { kind: 'installed', carInstanceId: car.id, carPartId: 'chassis' }

    const card = repairJobCards(state, CONTEXT, target).find((c) => c.kind === 'service')!
    expect(card.offered).toBe(true)
    expect(card.route).toBe('own')
    expect(card.lockedReason).toBeUndefined()
    expect(card.hireFeeYen).toBeNull()
  })

  it("'hired-today' - a remaining step rides todays hire of the group", () => {
    const car = chassisCar('car-route-hired')
    const state = baseState({ ownedCars: [car], day: 1, machineHirePaidDayByGroup: { body: 1 } })
    const target: RepairTarget = { kind: 'installed', carInstanceId: car.id, carPartId: 'chassis' }

    const card = repairJobCards(state, CONTEXT, target).find((c) => c.kind === 'rebuild')!
    expect(card.offered).toBe(true)
    expect(card.route).toBe('hired-today')
    expect(card.lockedReason).toBeUndefined()
    expect(card.hireFeeYen).toBeNull()
  })

  it("'hire' - a requiresMachine step nobody owns or has hired routes to hire, naming the fee", () => {
    const car = chassisCar('car-route-hire')
    // Default tool tiers (1) and no hire today: the rebuild's own MIG step
    // (requiresMachine) can never be slogged, so it locks toward a hire.
    const state = baseState({ ownedCars: [car] })
    const target: RepairTarget = { kind: 'installed', carInstanceId: car.id, carPartId: 'chassis' }

    const card = repairJobCards(state, CONTEXT, target).find((c) => c.kind === 'rebuild')!
    expect(card.offered).toBe(true)
    expect(card.route).toBe('hire')
    expect(card.lockedReason).toBeUndefined()
    expect(card.hireFeeYen).toBe(CONTEXT.economy.toolHire.feeYenByGroup.body)
  })

  it("'slog' - every remaining tier-2, non-machine step is worked by hand", () => {
    const stockInternals = PARTS.find(
      (p) => p.carPartId === 'internals' && p.grade === 'stock' && p.fitmentClass === 'everyday',
    )!
    const instance: PartInstance = {
      id: 'pi-internals-slog',
      partId: stockInternals.id,
      band: 'poor',
      origin: makeMarketOrigin(1),
    }
    // internals.rebuild is three tier-2 steps, none requiresMachine - unowned
    // and unhired, every one slogs rather than locking.
    const state = resolvePlaceOnBench(
      baseState({ partInventory: [instance] }),
      instance.id,
      CONTEXT,
    )
    const target: RepairTarget = { kind: 'loose', partInstanceId: instance.id }

    const card = repairJobCards(state, CONTEXT, target).find((c) => c.kind === 'rebuild')!
    expect(card.offered).toBe(true)
    expect(card.route).toBe('slog')
    expect(card.lockedReason).toBeUndefined()
    expect(card.hireFeeYen).toBeNull()
  })

  it("'locked' - a shop tool nobody owns locks the job outright, naming needs-shop", () => {
    const car = chassisCar('car-route-locked', 'worn')
    // Every chassis Restore step is shop-tier (workbench.json); toolShopsOwned
    // is empty by default, so level stays below 3 and the whole job locks.
    const state = baseState({ ownedCars: [car] })
    const target: RepairTarget = { kind: 'installed', carInstanceId: car.id, carPartId: 'chassis' }

    const card = repairJobCards(state, CONTEXT, target).find((c) => c.kind === 'restore')!
    // Restore's own card-level gate refuses for the identical reason (no
    // covering shop), so 'offered' is false here alongside the route - both
    // readings of the same missing shop, not a contradiction.
    expect(card.offered).toBe(false)
    expect(card.refusal).toBe('needs-shop')
    expect(card.route).toBe('locked')
    expect(card.lockedReason).toBe('needs-shop')
    expect(card.hireFeeYen).toBeNull()
  })
})

describe('job identity', () => {
  it('a service job and a rebuild job on the same part are two distinct jobs that do not interfere', () => {
    const car = chassisCar('car-identity')
    const state = baseState({ ownedCars: [car], toolTiers: testToolTiers({ body: 2 }) })
    const target: RepairTarget = { kind: 'installed', carInstanceId: car.id, carPartId: 'chassis' }

    const serviceId = repairJobIdFor(target, 'service', CONTEXT)
    const rebuildId = repairJobIdFor(target, 'rebuild', CONTEXT)
    expect(serviceId).not.toBe(rebuildId)

    // Start the two-step rebuild, but leave it mid-way.
    const afterRebuildStep1 = resolveRepairStep(state, target, 'rebuild', CONTEXT, 999)
    expect(afterRebuildStep1.outcome).toBe('stepped')
    const rebuildJob = afterRebuildStep1.state.jobs.find((job) => job.id === rebuildId)!
    expect(rebuildJob.laborSlotsSpent).toBe(1)
    expect(rebuildJob.targetBand).toBe(REBUILD_TARGET)

    // Complete the one-step service job on the same part.
    const afterService = resolveRepairStep(afterRebuildStep1.state, target, 'service', CONTEXT, 999)
    expect(afterService.outcome).toBe('completed')
    expect(afterService.state.ownedCars[0]?.parts.chassis.installed?.band).toBe(SERVICE_TARGET)
    expect(afterService.state.jobs.some((job) => job.id === serviceId)).toBe(false)

    // The rebuild job is untouched by the service job's own completion: same
    // progress, same locked target band.
    const rebuildJobAfter = afterService.state.jobs.find((job) => job.id === rebuildId)!
    expect(rebuildJobAfter.laborSlotsSpent).toBe(1)
    expect(rebuildJobAfter.targetBand).toBe(REBUILD_TARGET)
  })

  it('resuming the rebuild after the interleaved service still finishes to its own locked target band', () => {
    const car = chassisCar('car-identity-resume')
    const state = baseState({ ownedCars: [car], toolTiers: testToolTiers({ body: 2 }) })
    const target: RepairTarget = { kind: 'installed', carInstanceId: car.id, carPartId: 'chassis' }

    const afterRebuildStep1 = resolveRepairStep(state, target, 'rebuild', CONTEXT, 999)
    const afterService = resolveRepairStep(afterRebuildStep1.state, target, 'service', CONTEXT, 999)
    expect(afterService.state.ownedCars[0]?.parts.chassis.installed?.band).toBe(SERVICE_TARGET)

    const afterRebuildStep2 = resolveRepairStep(afterService.state, target, 'rebuild', CONTEXT, 999)
    expect(afterRebuildStep2.outcome).toBe('completed')
    // The rebuild delivers ITS OWN target band, never the service job's,
    // whatever the part's band happened to sit at in between.
    expect(afterRebuildStep2.state.ownedCars[0]?.parts.chassis.installed?.band).toBe(REBUILD_TARGET)
    expect(afterRebuildStep2.state.jobs).toHaveLength(0)
  })
})

/**
 * A card quotes what the player KNOWS; the work charges what is true
 * (knowledge-and-diagnosis.md section 1). `intake` is the fixture here
 * because it is an ordinary hidden slot: not `depthClass: 'surface'` and
 * neither `tyres` nor `rims`, so it is exactly the kind of slot an acquired
 * car starts ESTIMATED on, and its Service recipe runs in situ, so a job can
 * be run to completion on it without a removal (which would verify it) in
 * between.
 */
describe('knowledge', () => {
  const TRUE_BAND: ConditionBand = 'poor'
  const MODEL = CARS.find((model) => model.id === MODEL_ID)!
  // The model's OWN stock intake, so masking a slot back to the expected
  // stock part changes nothing about the price and the only thing these
  // cases can be reading is the band.
  const STOCK_INTAKE = CONTEXT.stockPartByCarPartId[fitmentClassForTier(MODEL.tier)].intake

  const UNVERIFIED_SLOTS = defaultVerifiedSlots(CONTEXT)
  const VERIFIED_SLOTS: CarPartId[] = [...UNVERIFIED_SLOTS, 'intake']

  function intakeCar(
    id: string,
    verifiedSlots: CarPartId[],
    band: ConditionBand = TRUE_BAND,
  ): CarInstance {
    return buildCarInstance({
      id,
      modelId: MODEL_ID,
      verifiedSlots,
      parts: mintCarParts({
        intake: {
          id: `pi-${id}-intake`,
          partId: STOCK_INTAKE.id,
          band,
          origin: makeMarketOrigin(1),
        },
      }),
    })
  }

  function intakeTarget(car: CarInstance): RepairTarget {
    return { kind: 'installed', carInstanceId: car.id, carPartId: 'intake' }
  }

  function cardsFor(car: CarInstance) {
    return repairJobCards(baseState({ ownedCars: [car] }), CONTEXT, intakeTarget(car))
  }

  function billYen(from: ConditionBand, to: ConditionBand): number {
    return costToBandYen(
      from,
      to,
      CONTEXT.partsTaxonomyById.intake,
      STOCK_INTAKE.priceYen,
      CONTEXT.economy.restoration.repairStepFraction,
      STOCK_INTAKE.fitmentClass,
    )
  }

  it('quotes the guess on a slot the player has not verified, and the truth once they have', () => {
    const unverified = intakeCar('car-knowledge-quote', UNVERIFIED_SLOTS)
    const verified = intakeCar('car-knowledge-quote-verified', VERIFIED_SLOTS)
    expect(isSlotVerified(unverified, 'intake')).toBe(false)
    expect(isSlotVerified(verified, 'intake')).toBe(true)

    // The fixture only means anything while the guess and the truth disagree.
    const guessBand = priorBand(unverified, 'intake', CONTEXT)
    expect(guessBand).not.toBe(TRUE_BAND)

    const unverifiedCards = cardsFor(unverified)
    const verifiedCards = cardsFor(verified)
    for (const kind of REPAIR_JOB_KINDS) {
      const targetBand = targetBandFor(kind, CONTEXT)
      expect(unverifiedCards.find((card) => card.kind === kind)!.partsYen).toBe(
        billYen(guessBand, targetBand),
      )
      expect(verifiedCards.find((card) => card.kind === kind)!.partsYen).toBe(
        billYen(TRUE_BAND, targetBand),
      )
    }

    // Restore is the kind where both figures are real money, so the leak this
    // closes shows up as a wrong number rather than as a zero.
    const quotedYen = unverifiedCards.find((card) => card.kind === 'restore')!.partsYen
    const trueYen = verifiedCards.find((card) => card.kind === 'restore')!.partsYen
    expect(quotedYen).toBeGreaterThan(0)
    expect(quotedYen).toBeLessThan(trueYen)
  })

  it('charges the true bill whatever the card quoted, and verifies the slot on the band write', () => {
    const unverified = intakeCar('car-knowledge-charge', UNVERIFIED_SLOTS)
    const state = baseState({ ownedCars: [unverified] })
    const target = intakeTarget(unverified)
    const trueBillYen = billYen(TRUE_BAND, SERVICE_TARGET)
    expect(trueBillYen).toBeGreaterThan(0)

    const card = cardsFor(unverified).find((entry) => entry.kind === 'service')!
    expect(card.offered).toBe(true)
    // The guess says this part is already past the Service target, so the
    // quote is nothing at all - and the shop still charges for the real work.
    expect(card.partsYen).toBe(billYen(priorBand(unverified, 'intake', CONTEXT), SERVICE_TARGET))
    expect(card.partsYen).toBeLessThan(trueBillYen)

    const step0 = resolveRepairStep(state, target, 'service', CONTEXT, 999)
    expect(step0.outcome).toBe('stepped')
    expect(step0.state.cashYen).toBe(state.cashYen - trueBillYen)
    expect(step0.state.carLedgers[unverified.id]?.repairYen).toBe(trueBillYen)

    const step1 = resolveRepairStep(step0.state, target, 'service', CONTEXT, 999)
    expect(step1.outcome).toBe('completed')
    expect(step1.state.cashYen).toBe(step0.state.cashYen)
    const finished = step1.state.ownedCars[0]!
    expect(finished.parts.intake.installed?.band).toBe(SERVICE_TARGET)
    expect(isSlotVerified(finished, 'intake')).toBe(true)

    // Verified from the start: the same money leaves the till, and this time
    // the card said so up front.
    const verified = intakeCar('car-knowledge-charge-verified', VERIFIED_SLOTS)
    const verifiedState = baseState({ ownedCars: [verified] })
    expect(cardsFor(verified).find((entry) => entry.kind === 'service')!.partsYen).toBe(trueBillYen)
    const verifiedStep0 = resolveRepairStep(
      verifiedState,
      intakeTarget(verified),
      'service',
      CONTEXT,
      999,
    )
    expect(verifiedStep0.outcome).toBe('stepped')
    expect(verifiedStep0.state.cashYen).toBe(verifiedState.cashYen - trueBillYen)
    expect(verifiedStep0.state.carLedgers[verified.id]?.repairYen).toBe(trueBillYen)
  })

  it('quotes the same energy whatever the band is, so no card can leak a condition through energy', () => {
    const poorSlot = intakeCar('car-knowledge-energy-poor', UNVERIFIED_SLOTS, 'poor')
    const fineSlot = intakeCar('car-knowledge-energy-fine', UNVERIFIED_SLOTS, 'fine')

    const poorCards = cardsFor(poorSlot)
    const fineCards = cardsFor(fineSlot)
    for (const kind of REPAIR_JOB_KINDS) {
      const poorCard = poorCards.find((card) => card.kind === kind)!
      const fineCard = fineCards.find((card) => card.kind === kind)!
      expect(poorCard.energyPoints).toBeGreaterThan(0)
      expect(poorCard.energyPoints).toBe(fineCard.energyPoints)
      expect(poorCard.removalEnergyPoints).toBe(fineCard.removalEnergyPoints)
      expect(poorCard.steps.map((step) => step.tool)).toEqual(
        fineCard.steps.map((step) => step.tool),
      )
    }
  })
})
