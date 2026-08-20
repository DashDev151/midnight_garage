import {
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type ConditionBand,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { costToBandYen } from '../src/bands'
import { buildSimContext } from '../src/context'
import { resolveRemovePart } from '../src/jobs'
import {
  benchForGroup,
  benchPartIds,
  energyPlanFor,
  repairJobCards,
  resolvePlaceOnBench,
  resolveRepairStep,
  targetBandFor,
  type RepairTarget,
} from '../src/repairJobs'
import {
  buildCarInstance,
  mintCarParts,
  testSceneStanding,
  testToolShopsOwned,
  testToolTiers,
} from './testFixtures'

// Real CARS/PARTS/PARTS_TAXONOMY: a repair job resolves against the actual
// catalogue and the actual workbench recipes.
const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)

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
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    workbenchPartId: null,
    machinePartId: null,
    storyMissions: [],
    machineHirePaidDayByGroup: {},
    ...overrides,
  }
}

describe('repairJobCards - the offer matrix', () => {
  it('offers exactly the kinds whose target band is still ahead of the current band, refuses a non-repairable part at every band, and refuses an empty slot', () => {
    // chassis: removable false, so rebuild/restore run in place (no
    // needs-bench refusal to confound the band read); the covering body
    // shop is owned so restore's own needs-shop gate never confounds it
    // either - this test is about the band ladder alone.
    const stateFor = (band: ConditionBand): GameState =>
      baseState({
        ownedCars: [
          buildCarInstance({
            id: 'car-offer-matrix',
            modelId: 'honda-city-e-aa',
            parts: mintCarParts({ chassis: band }),
          }),
        ],
        toolShopsOwned: testToolShopsOwned('body'),
      })

    const target: RepairTarget = {
      kind: 'installed',
      carInstanceId: 'car-offer-matrix',
      carPartId: 'chassis',
    }

    const offeredKinds = (band: ConditionBand) =>
      repairJobCards(stateFor(band), CONTEXT, target)
        .filter((card) => card.offered)
        .map((card) => card.kind)

    expect(offeredKinds('mint')).toEqual([])
    expect(offeredKinds('fine')).toEqual(['restore'])
    expect(offeredKinds('worn')).toEqual(['rebuild', 'restore'])
    expect(offeredKinds('poor')).toEqual(['service', 'rebuild', 'restore'])
    expect(offeredKinds('scrap')).toEqual([])

    // clutch: repairable: false in the taxonomy - refused at every band,
    // independent of the body shop set up above (clutch is drivetrain).
    const clutchState = baseState({
      ownedCars: [
        buildCarInstance({
          id: 'car-clutch',
          modelId: 'honda-city-e-aa',
          parts: mintCarParts({ clutch: 'poor' }),
        }),
      ],
    })
    const clutchCards = repairJobCards(clutchState, CONTEXT, {
      kind: 'installed',
      carInstanceId: 'car-clutch',
      carPartId: 'clutch',
    })
    expect(clutchCards.every((card) => !card.offered)).toBe(true)
    expect(clutchCards.every((card) => card.refusal === 'not-repairable')).toBe(true)

    // An empty slot: dampers left vacant.
    const emptySlotState = baseState({
      ownedCars: [
        buildCarInstance({
          id: 'car-empty',
          modelId: 'honda-city-e-aa',
          parts: mintCarParts({ dampers: null }),
        }),
      ],
    })
    const emptyCards = repairJobCards(emptySlotState, CONTEXT, {
      kind: 'installed',
      carInstanceId: 'car-empty',
      carPartId: 'dampers',
    })
    expect(emptyCards.every((card) => !card.offered)).toBe(true)
  })
})

describe('resolveRepairStep - service in situ on a buried part', () => {
  it('pays the buried surcharge on step 0 only, completes to worn, charges the parts bill once, and refuses for short cash without ticking or mutating state', () => {
    const car = buildCarInstance({
      id: 'car-buried',
      modelId: 'honda-city-e-aa',
      parts: mintCarParts({ block: 'poor' }),
    })
    const target: RepairTarget = { kind: 'installed', carInstanceId: car.id, carPartId: 'block' }
    const state = baseState({ ownedCars: [car] })

    expect(CONTEXT.partsTaxonomyById.block.depthClass).toBe('buried')

    const plan = energyPlanFor(state, CONTEXT, target, 'service')
    expect(plan).toEqual([
      CONTEXT.economy.energy.energyPerStepPoints + CONTEXT.economy.energy.energyByClass.buried,
      CONTEXT.economy.energy.energyPerStepPoints,
    ])

    const catalogPart = CONTEXT.partsById[car.parts.block.installed!.partId]!
    const billYen = costToBandYen(
      'poor',
      'worn',
      CONTEXT.partsTaxonomyById.block,
      catalogPart.priceYen,
      CONTEXT.economy.restoration.repairStepFraction,
      catalogPart.fitmentClass,
    )

    const step0 = resolveRepairStep(state, target, 'service', CONTEXT, plan[0]!)
    expect(step0.outcome).toBe('stepped')
    expect(step0.state.jobs[0]?.laborSlotsSpent).toBe(1)
    expect(step0.state.jobs[0]?.laborSlotsRequired).toBe(2)
    expect(step0.state.energySpentToday).toBe(plan[0])
    expect(step0.state.cashYen).toBe(state.cashYen - billYen)
    expect(step0.state.carLedgers[car.id]?.repairYen).toBe(billYen)
    // The band does not move until the last step.
    expect(step0.state.ownedCars[0]?.parts.block.installed?.band).toBe('poor')
    expect(step0.log).toEqual([
      {
        type: 'repair-step',
        payload: {
          carInstanceId: car.id,
          carPartId: 'block',
          jobKind: 'service',
          stepIndex: 0,
          copy: 'Degrease it in the bay',
          slogged: false,
          energyPoints: plan[0],
        },
      },
    ])

    const step1 = resolveRepairStep(step0.state, target, 'service', CONTEXT, plan[1]!)
    expect(step1.outcome).toBe('completed')
    expect(step1.state.energySpentToday).toBe(plan[0]! + plan[1]!)
    // No second charge - the parts bill was already taken on step 0.
    expect(step1.state.cashYen).toBe(step0.state.cashYen)
    expect(step1.state.jobs).toHaveLength(0)
    expect(step1.state.ownedCars[0]?.parts.block.installed?.band).toBe(
      targetBandFor('service', CONTEXT),
    )
    expect(step1.log).toEqual([
      {
        type: 'repair-step',
        payload: {
          carInstanceId: car.id,
          carPartId: 'block',
          jobKind: 'service',
          stepIndex: 1,
          copy: 'Chase the threads, drive in new core plugs',
          slogged: false,
          energyPoints: plan[1],
        },
      },
      {
        type: 'repair-job-completed',
        payload: {
          carInstanceId: car.id,
          carPartId: 'block',
          jobKind: 'service',
          targetBand: targetBandFor('service', CONTEXT),
        },
      },
    ])

    // A shop short of the parts bill is refused outright, with no job
    // opened and no cash moved.
    const brokeState = baseState({ ownedCars: [car], cashYen: billYen - 1 })
    const cashRefusal = resolveRepairStep(brokeState, target, 'service', CONTEXT, plan[0]!)
    expect(cashRefusal.outcome).toEqual({ refused: 'no-cash' })
    expect(cashRefusal.state).toBe(brokeState)
    expect(cashRefusal.log).toEqual([])
  })
})

describe('resolveRepairStep - service on a bolt-on installed part', () => {
  it('carries no buried surcharge - every step costs the base step energy alone', () => {
    const car = buildCarInstance({
      id: 'car-bolt-on',
      modelId: 'honda-city-e-aa',
      parts: mintCarParts({ intake: 'poor' }),
    })
    const target: RepairTarget = { kind: 'installed', carInstanceId: car.id, carPartId: 'intake' }
    const state = baseState({ ownedCars: [car] })

    expect(CONTEXT.partsTaxonomyById.intake.depthClass).toBe('bolt-on')

    const plan = energyPlanFor(state, CONTEXT, target, 'service')
    expect(plan).toEqual([
      CONTEXT.economy.energy.energyPerStepPoints,
      CONTEXT.economy.energy.energyPerStepPoints,
    ])

    const step0 = resolveRepairStep(state, target, 'service', CONTEXT, plan[0]!)
    expect(step0.outcome).toBe('stepped')
    expect(step0.log).toEqual([
      {
        type: 'repair-step',
        payload: {
          carInstanceId: car.id,
          carPartId: 'intake',
          jobKind: 'service',
          stepIndex: 0,
          copy: 'Blast it out with carb cleaner',
          slogged: false,
          energyPoints: CONTEXT.economy.energy.energyPerStepPoints,
        },
      },
    ])
  })
})

describe('resolveRepairStep - rebuild on an installed removable part', () => {
  it('refuses needs-bench while still installed, then runs once removed and placed on its own bench', () => {
    const car = buildCarInstance({
      id: 'car-dampers',
      modelId: 'honda-city-e-aa',
      // springs and rims cleared too - dampers' own blockedBy list, so
      // removal below is not refused for an unrelated reason.
      parts: mintCarParts({ dampers: 'poor', springs: null, rims: null }),
    })
    const state = baseState({ ownedCars: [car] })
    const installedTarget: RepairTarget = {
      kind: 'installed',
      carInstanceId: car.id,
      carPartId: 'dampers',
    }

    const installedRefusal = resolveRepairStep(state, installedTarget, 'rebuild', CONTEXT, 999)
    expect(installedRefusal.outcome).toEqual({ refused: 'needs-bench' })
    expect(installedRefusal.state).toBe(state)

    const originalDampersId = car.parts.dampers.installed!.id
    const removed = resolveRemovePart(state, car.id, 'dampers', CONTEXT)
    expect(removed.state.ownedCars[0]?.parts.dampers.installed).toBeNull()
    expect(removed.state.partInventory.some((p) => p.id === originalDampersId)).toBe(true)

    const benched = resolvePlaceOnBench(removed.state, originalDampersId, CONTEXT)
    expect(benchPartIds(benched, benchForGroup('suspension'))).toContain(originalDampersId)

    const looseTarget: RepairTarget = { kind: 'loose', partInstanceId: originalDampersId }
    const looseStep = resolveRepairStep(benched, looseTarget, 'rebuild', CONTEXT, 999)
    expect(looseStep.outcome).toBe('stepped')
    expect(looseStep.state.jobs).toHaveLength(1)
    expect(looseStep.state.jobs[0]?.kind).toBe('rebuild')
    expect(looseStep.state.jobs[0]?.laborSlotsSpent).toBe(1)
  })
})

describe('resolveRepairStep - chassis is a fixed surface', () => {
  it('rebuilds while installed and is never refused for want of a bench', () => {
    const car = buildCarInstance({
      id: 'car-chassis',
      modelId: 'honda-city-e-aa',
      parts: mintCarParts({ chassis: 'poor' }),
    })
    const target: RepairTarget = { kind: 'installed', carInstanceId: car.id, carPartId: 'chassis' }
    const state = baseState({ ownedCars: [car] })

    expect(CONTEXT.partsTaxonomyById.chassis.removable).toBe(false)

    const rebuildCard = repairJobCards(state, CONTEXT, target).find((c) => c.kind === 'rebuild')
    expect(rebuildCard?.offered).toBe(true)
    expect(rebuildCard?.refusal).toBeUndefined()

    const step = resolveRepairStep(state, target, 'rebuild', CONTEXT, 999)
    expect(step.outcome).toBe('stepped')
  })
})

describe('resolveRepairStep - the energy pool', () => {
  it('refuses no-energy without ticking a step, charging cash, or mutating state', () => {
    const car = buildCarInstance({
      id: 'car-energy',
      modelId: 'honda-city-e-aa',
      parts: mintCarParts({ intake: 'poor' }),
    })
    const target: RepairTarget = { kind: 'installed', carInstanceId: car.id, carPartId: 'intake' }
    const state = baseState({ ownedCars: [car] })

    const plan = energyPlanFor(state, CONTEXT, target, 'service')
    const short = plan[0]! - 1

    const result = resolveRepairStep(state, target, 'service', CONTEXT, short)
    expect(result.outcome).toEqual({ refused: 'no-energy' })
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
    expect(state.jobs).toHaveLength(0)
    expect(state.cashYen).toBe(1_000_000)
  })
})
