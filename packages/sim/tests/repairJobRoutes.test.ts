import {
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  WORKBENCH,
  type CarInstance,
  type CarPartId,
  type GameState,
  type PartInstance,
  type PartRecipes,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  benchForGroup,
  energyPlanFor,
  repairJobCards,
  resolveRepairStep,
  stepBenchFor,
  toolTierOnBench,
  type RepairTarget,
} from '../src/repairJobs'
import { buildSimContext } from '../src/context'
import { makeMarketOrigin } from '../src/provenance'
import {
  buildCarInstance,
  groupCarParts,
  testSceneStanding,
  testToolShopsOwned,
  testToolTiers,
} from './testFixtures'

// Real CARS/PARTS/PARTS_TAXONOMY: recipes must resolve against the actual
// catalog and workbench content, not a synthetic stand-in.
const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)

/** A full `GameState`, every field at its new-game floor unless overridden.
 * Nothing is pre-hired and no shop is owned - each test states exactly the
 * access it means to exercise. */
function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 42,
    cashYen: 5_000_000,
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

function stockPartId(carPartId: CarPartId): string {
  return PARTS.find((p) => p.carPartId === carPartId && p.grade === 'stock')!.id
}

describe('rebuild route at tool tier 1: block (3 non-welded tier-2 steps)', () => {
  // block's rebuild recipe (parts-washer, flex-hone, micrometer) is three
  // tier-2, non-welded steps on the engine bench.
  const instance: PartInstance = {
    id: 'pi-block-rebuild',
    partId: stockPartId('block'),
    band: 'poor',
    origin: makeMarketOrigin(1),
  }
  const target: RepairTarget = { kind: 'loose', partInstanceId: instance.id }

  function looseOnBench(overrides: Partial<GameState> = {}): GameState {
    return baseState({
      partInventory: [instance],
      benchParts: { [benchForGroup('engine')]: [instance.id] },
      ...overrides,
    })
  }

  it('slogs every step at three times the step energy with nothing owned or hired', () => {
    const state = looseOnBench()
    expect(energyPlanFor(state, CONTEXT, target, 'rebuild')).toEqual([12, 12, 12])

    const first = resolveRepairStep(state, target, 'rebuild', CONTEXT, 100)
    expect(first.outcome).toBe('stepped')
    expect(first.state.energySpentToday).toBe(12)
    expect(first.state.jobs[0]).toMatchObject({ laborSlotsSpent: 1, laborSlotsRequired: 3 })
  })

  it('costs the plain step energy once the engine line is hired for the day', () => {
    const state = looseOnBench({ machineHirePaidDayByGroup: { engine: 1 } })
    expect(energyPlanFor(state, CONTEXT, target, 'rebuild')).toEqual([4, 4, 4])

    const first = resolveRepairStep(state, target, 'rebuild', CONTEXT, 100)
    expect(first.outcome).toBe('stepped')
    expect(first.state.energySpentToday).toBe(4)
  })
})

describe('the welded step: exhaust rebuild borrows the body corner MIG', () => {
  // exhaust's own taxonomy group is 'engine' (it sits on the engine bench),
  // but its rebuild step 0 (mig-welder, requiresMachine) carries an explicit
  // bench override onto body-trim-bench, so it asks the BODY line for its
  // tier, not the engine line the part itself is worked on.
  const instance: PartInstance = {
    id: 'pi-exhaust-rebuild',
    partId: stockPartId('exhaust'),
    band: 'poor',
    origin: makeMarketOrigin(1),
  }
  const target: RepairTarget = { kind: 'loose', partInstanceId: instance.id }

  function onEngineBench(overrides: Partial<GameState> = {}): GameState {
    return baseState({
      partInventory: [instance],
      benchParts: { [benchForGroup('engine')]: [instance.id] },
      ...overrides,
    })
  }

  it('refuses needs-machine at tool tier 1 with nothing hired', () => {
    const result = resolveRepairStep(onEngineBench(), target, 'rebuild', CONTEXT, 100)
    expect(result.outcome).toEqual({ refused: 'needs-machine' })
  })

  it('hiring the ENGINE line does not unlock it', () => {
    const state = onEngineBench({ machineHirePaidDayByGroup: { engine: 1 } })
    const result = resolveRepairStep(state, target, 'rebuild', CONTEXT, 100)
    expect(result.outcome).toEqual({ refused: 'needs-machine' })
  })

  it('runs when the BODY group is hired today', () => {
    const state = onEngineBench({ machineHirePaidDayByGroup: { body: 1 } })
    const result = resolveRepairStep(state, target, 'rebuild', CONTEXT, 100)
    expect(result.outcome).toBe('stepped')
    expect(result.state.jobs[0]?.laborSlotsSpent).toBe(1)
  })

  it('runs when the body line is owned at tool tier 2', () => {
    const state = onEngineBench({ toolTiers: testToolTiers({ body: 2 }) })
    const result = resolveRepairStep(state, target, 'rebuild', CONTEXT, 100)
    expect(result.outcome).toBe('stepped')
  })
})

describe('restore requires the covering shop whatever the tool tier: block', () => {
  const instance: PartInstance = {
    id: 'pi-block-restore',
    partId: stockPartId('block'),
    band: 'worn',
    origin: makeMarketOrigin(1),
  }
  const target: RepairTarget = { kind: 'loose', partInstanceId: instance.id }

  function looseOnBench(overrides: Partial<GameState> = {}): GameState {
    return baseState({
      partInventory: [instance],
      benchParts: { [benchForGroup('engine')]: [instance.id] },
      ...overrides,
    })
  }

  it('refuses needs-shop at tool tier 2 without the machine shop', () => {
    const state = looseOnBench({ toolTiers: testToolTiers({ engine: 2 }) })
    const result = resolveRepairStep(state, target, 'restore', CONTEXT, 100)
    expect(result.outcome).toEqual({ refused: 'needs-shop' })
  })

  it('runs with the machine shop owned, and its shop-tier steps resolve as owned', () => {
    const state = looseOnBench({ toolShopsOwned: testToolShopsOwned('engine') })
    const restoreCard = repairJobCards(state, CONTEXT, target).find((c) => c.kind === 'restore')!
    expect(restoreCard.offered).toBe(true)
    expect(restoreCard.route).toBe('own')
    expect(restoreCard.steps.every((step) => !step.slogged)).toBe(true)

    const first = resolveRepairStep(state, target, 'restore', CONTEXT, 100)
    expect(first.outcome).toBe('stepped')
    const second = resolveRepairStep(first.state, target, 'restore', CONTEXT, 100)
    expect(second.outcome).toBe('completed')
    expect(second.state.partInventory.find((p) => p.id === instance.id)?.band).toBe('mint')
  })
})

describe('restore on rims needs the chassis shop (it covers wheels)', () => {
  const instance: PartInstance = {
    id: 'pi-rims-restore',
    partId: stockPartId('rims'),
    band: 'poor',
    origin: makeMarketOrigin(1),
  }
  const target: RepairTarget = { kind: 'loose', partInstanceId: instance.id }

  function looseOnBench(overrides: Partial<GameState> = {}): GameState {
    return baseState({
      partInventory: [instance],
      benchParts: { [benchForGroup('wheels')]: [instance.id] },
      ...overrides,
    })
  }

  it('the chassis shop is what testToolShopsOwned resolves wheels to', () => {
    expect(testToolShopsOwned('wheels')).toEqual(['chassis-shop'])
  })

  it('refuses needs-shop without the chassis shop, even at chassis-bench tool tier 2', () => {
    const state = looseOnBench({ toolTiers: testToolTiers({ wheels: 2 }) })
    const result = resolveRepairStep(state, target, 'restore', CONTEXT, 100)
    expect(result.outcome).toEqual({ refused: 'needs-shop' })
  })

  it('completes all three steps to mint once the chassis shop is owned', () => {
    const state = looseOnBench({ toolShopsOwned: testToolShopsOwned('wheels') })
    const step1 = resolveRepairStep(state, target, 'restore', CONTEXT, 100)
    expect(step1.outcome).toBe('stepped')
    const step2 = resolveRepairStep(step1.state, target, 'restore', CONTEXT, 100)
    expect(step2.outcome).toBe('stepped')
    const step3 = resolveRepairStep(step2.state, target, 'restore', CONTEXT, 100)
    expect(step3.outcome).toBe('completed')
    expect(step3.state.partInventory.find((p) => p.id === instance.id)?.band).toBe('mint')
    expect(step3.state.jobs).toHaveLength(0)
  })
})

describe('interruption across days: chassis rebuild (fixed surface, runs installed)', () => {
  // chassis is `removable: false`, so its rebuild runs on the car - no
  // bench placement needed. Its recipe is angle-grinder (tier-2, not
  // welded) then mig-welder (tier-2, requiresMachine), both on the body
  // line, so the second step can only ever be owned, hired, or refused -
  // never slogged.
  const workingCar: CarInstance = buildCarInstance({
    id: 'car-chassis-rebuild',
    modelId: 'test-model',
    parts: groupCarParts({ body: 'poor' }),
  })
  const target: RepairTarget = {
    kind: 'installed',
    carInstanceId: workingCar.id,
    carPartId: 'chassis',
  }

  it('persists the partial job, refuses the welded step once the hire lapses, and moves the band only on the last step', () => {
    const day1 = baseState({
      ownedCars: [workingCar],
      machineHirePaidDayByGroup: { body: 1 },
    })

    const stepped = resolveRepairStep(day1, target, 'rebuild', CONTEXT, 100)
    expect(stepped.outcome).toBe('stepped')
    expect(stepped.state.energySpentToday).toBe(4)
    expect(stepped.state.jobs).toHaveLength(1)
    expect(stepped.state.jobs[0]).toMatchObject({ laborSlotsSpent: 1, laborSlotsRequired: 2 })
    expect(stepped.state.ownedCars[0]?.parts.chassis.installed?.band).toBe('poor')

    // The day turns over: yesterday's body hire no longer covers today.
    const day2 = { ...stepped.state, day: 2, energySpentToday: 0 }
    const refused = resolveRepairStep(day2, target, 'rebuild', CONTEXT, 100)
    expect(refused.outcome).toEqual({ refused: 'needs-machine' })
    expect(refused.state).toBe(day2)
    expect(refused.state.jobs[0]?.laborSlotsSpent).toBe(1)

    // Re-hire the body line for day 2 and finish the job.
    const rehired = { ...day2, machineHirePaidDayByGroup: { body: 2 } }
    const completed = resolveRepairStep(rehired, target, 'rebuild', CONTEXT, 100)
    expect(completed.outcome).toBe('completed')
    expect(completed.state.jobs).toHaveLength(0)
    expect(completed.state.ownedCars[0]?.parts.chassis.installed?.band).toBe('fine')
  })
})

describe('invariant sweep: all 23 recipes, all three kinds', () => {
  const recipeEntries = Object.entries(WORKBENCH.recipes) as [CarPartId, PartRecipes][]

  it('covers all 23 recipes', () => {
    expect(recipeEntries).toHaveLength(23)
  })

  it('every Service step resolves at tool tier 1 (service is always route own)', () => {
    for (const [carPartId, recipes] of recipeEntries) {
      const group = CONTEXT.partsTaxonomyById[carPartId]!.group
      for (const step of recipes.service) {
        const bench = stepBenchFor(step, group)
        expect(
          toolTierOnBench(WORKBENCH, bench, step.tool),
          `${carPartId} service step "${step.tool}"`,
        ).toBe(1)
      }
    }
  })

  it('shop-tier tools appear only in restore recipes', () => {
    for (const [carPartId, recipes] of recipeEntries) {
      const group = CONTEXT.partsTaxonomyById[carPartId]!.group
      for (const kind of ['service', 'rebuild'] as const) {
        for (const step of recipes[kind]) {
          const bench = stepBenchFor(step, group)
          expect(
            toolTierOnBench(WORKBENCH, bench, step.tool),
            `${carPartId} ${kind} step "${step.tool}"`,
          ).not.toBe('shop')
        }
      }
    }
  })
})
