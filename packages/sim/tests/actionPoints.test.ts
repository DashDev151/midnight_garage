import {
  BUYERS,
  CARS,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  type AuctionLot,
  type GameState,
  type PartInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  resolveBuildAssembly,
  resolveRefitAssembly,
  resolveRemoveAssembly,
  resolveRemoveAssemblyMember,
  resolveSwapAssemblyMember,
} from '../src/assemblies'
import { buildSimContext, type SimContext } from '../src/context'
import { beginInspectionVisit, resolveOwnedWorkup } from '../src/diagnosis'
import { moveCar } from '../src/facilities'
import { resolveRemovePart } from '../src/jobs'
import { resolveScrapPart } from '../src/parts'
import { makeMarketOrigin } from '../src/provenance'
import { resolveScrapShell } from '../src/selling'
import { buildCarInstance, mintCarParts, testSpecialty, testToolTiers } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)

type ActionPointKey = keyof SimContext['economy']['energy']['actionPoints']

/** A non-zero figure no other knob shares, so a spend of exactly this amount
 * proves the overridden dial (and only it) drove the charge. */
const COST = 7

/** The real context with ONE actionPoints key raised to `COST` - the shipped
 * economy otherwise untouched, so every other cost stays at its default. */
function ctxWith(key: ActionPointKey): SimContext {
  return {
    ...CONTEXT,
    economy: {
      ...CONTEXT.economy,
      energy: {
        ...CONTEXT.economy.energy,
        actionPoints: { ...CONTEXT.economy.energy.actionPoints, [key]: COST },
      },
    },
  }
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

// shitbox class - honda-city-e-aa (every `ownedCar` fixture below) is
// 'shitbox' tier, and a bench-fitted part must match the car's own class.
const stockTyresId = CONTEXT.stockPartByCarPartId.shitbox!.tyres!.id
const stockRimsId = CONTEXT.stockPartByCarPartId.shitbox!.rims!.id

function binPart(id: string, partId: string, band: PartInstance['band'] = 'mint'): PartInstance {
  return { id, partId, band, genuinePeriod: false, origin: makeMarketOrigin(1) }
}

/** An owned fixture car (every slot a mint stock part unless overridden). */
function ownedCar(id: string, parts = mintCarParts()) {
  return buildCarInstance({ id, modelId: 'honda-city-e-aa', parts })
}

describe('shipped defaults', () => {
  it('workup and inspectionVisit cost 10; every other action is free', () => {
    expect(CONTEXT.economy.energy.actionPoints).toEqual({
      removePart: 0,
      removeAssembly: 0,
      refitAssembly: 0,
      refitUnchangedMember: 0,
      benchFitMember: 0,
      benchRemoveMember: 0,
      benchBuildAssembly: 0,
      moveCar: 0,
      scrapShell: 0,
      scrapPart: 0,
      workup: 10,
      inspectionVisit: 10,
    })
  })
})

describe('every action gates on the labour bar and spends its own figure when raised', () => {
  it('removePart: on-car removal charges the figure, refuses short of it', () => {
    const car = ownedCar('car-rm')
    const state = baseState({ ownedCars: [car] })
    const ctx = ctxWith('removePart')

    const done = resolveRemovePart(state, car.id, 'exhaust', ctx, COST)
    expect(done.laborSlotsUsed).toBe(COST)
    expect(done.state.energySpentToday).toBe(state.energySpentToday + COST)
    expect(done.log).toHaveLength(1)

    const refused = resolveRemovePart(state, car.id, 'exhaust', ctx, COST - 1)
    expect(refused.laborSlotsUsed).toBe(0)
    expect(refused.log).toEqual([])
    expect(refused.state).toBe(state)
  })

  it('removeAssembly: pulling an assembly to the bench charges the figure, refuses short of it', () => {
    const car = ownedCar('car-ra')
    const state = baseState({ ownedCars: [car] })
    const ctx = ctxWith('removeAssembly')

    const done = resolveRemoveAssembly(state, car.id, 'wheelAssembly', ctx, COST)
    expect(done.ok).toBe(true)
    expect(done.laborSlotsUsed).toBe(COST)
    expect(done.state.energySpentToday).toBe(state.energySpentToday + COST)

    const refused = resolveRemoveAssembly(state, car.id, 'wheelAssembly', ctx, COST - 1)
    expect(refused.ok).toBe(false)
    expect(refused.state).toBe(state)
  })

  it('refitAssembly: the refit operation itself charges the figure once, refuses short of it', () => {
    const car = ownedCar('car-rf')
    const state = baseState({ ownedCars: [car] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    const ctx = ctxWith('refitAssembly')

    // Both members refit unchanged (equivalence, still free), so the whole
    // charge is the operation-level figure.
    const done = resolveRefitAssembly(off.state, container.id, ctx, COST)
    expect(done.ok).toBe(true)
    expect(done.laborSlotsUsed).toBe(COST)
    expect(done.state.energySpentToday).toBe(off.state.energySpentToday + COST)

    const refused = resolveRefitAssembly(off.state, container.id, ctx, COST - 1)
    expect(refused.ok).toBe(false)
    expect(refused.state).toBe(off.state)
  })

  it('refitUnchangedMember: an as-it-came-off member charges the figure, refuses short of it', () => {
    // Only rims are fitted, so the refit carries exactly one unchanged member.
    const car = ownedCar('car-ru', mintCarParts({ tyres: null }))
    const state = baseState({ ownedCars: [car] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    const ctx = ctxWith('refitUnchangedMember')

    const done = resolveRefitAssembly(off.state, container.id, ctx, COST)
    expect(done.ok).toBe(true)
    expect(done.laborSlotsUsed).toBe(COST)
    expect(done.state.energySpentToday).toBe(off.state.energySpentToday + COST)

    const refused = resolveRefitAssembly(off.state, container.id, ctx, COST - 1)
    expect(refused.ok).toBe(false)
    expect(refused.state).toBe(off.state)
  })

  it('benchFitMember: fitting a part into a benched assembly charges the figure, refuses short of it', () => {
    const car = ownedCar('car-bf')
    const spare = binPart('pi-spare-tyre', stockTyresId)
    const state = baseState({ ownedCars: [car], partInventory: [spare] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    const ctx = ctxWith('benchFitMember')

    const done = resolveSwapAssemblyMember(off.state, container.id, 'tyres', spare.id, ctx, COST)
    expect(done.ok).toBe(true)
    expect(done.state.energySpentToday).toBe(off.state.energySpentToday + COST)

    const refused = resolveSwapAssemblyMember(
      off.state,
      container.id,
      'tyres',
      spare.id,
      ctx,
      COST - 1,
    )
    expect(refused.ok).toBe(false)
    expect(refused.state).toBe(off.state)
  })

  it('benchRemoveMember: pulling a member off a benched assembly charges the figure, refuses short of it', () => {
    const car = ownedCar('car-br')
    const state = baseState({ ownedCars: [car] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    const ctx = ctxWith('benchRemoveMember')

    const done = resolveRemoveAssemblyMember(off.state, container.id, 'tyres', ctx, COST)
    expect(done.ok).toBe(true)
    expect(done.state.energySpentToday).toBe(off.state.energySpentToday + COST)

    const refused = resolveRemoveAssemblyMember(off.state, container.id, 'tyres', ctx, COST - 1)
    expect(refused.ok).toBe(false)
    expect(refused.state).toBe(off.state)
  })

  it('benchBuildAssembly: building from loose parts charges the figure, refuses short of it', () => {
    const rims = binPart('pi-loose-rims', stockRimsId)
    const tyres = binPart('pi-loose-tyres', stockTyresId)
    const state = baseState({ partInventory: [rims, tyres] })
    const members = { rims: rims.id, tyres: tyres.id }
    const ctx = ctxWith('benchBuildAssembly')

    const done = resolveBuildAssembly(state, 'wheelAssembly', members, ctx, COST)
    expect(done.ok).toBe(true)
    expect(done.state.energySpentToday).toBe(state.energySpentToday + COST)

    const refused = resolveBuildAssembly(state, 'wheelAssembly', members, ctx, COST - 1)
    expect(refused.ok).toBe(false)
    expect(refused.state).toBe(state)
  })

  it('moveCar: a bay/parking move charges the figure, refuses short of it', () => {
    const car = ownedCar('car-mv')
    const state = baseState({ ownedCars: [car], parkingCarIds: [car.id] })
    const economy = ctxWith('moveCar').economy

    const done = moveCar(state, car.id, 'service', economy, COST)
    expect(done.changed).toBe(true)
    expect(done.state.energySpentToday).toBe(state.energySpentToday + COST)

    const refused = moveCar(state, car.id, 'service', economy, COST - 1)
    expect(refused.changed).toBe(false)
    expect(refused.state).toBe(state)
  })

  it('scrapShell: scrapping a shell charges the figure, refuses short of it', () => {
    const car = ownedCar('car-ss')
    const state = baseState({ ownedCars: [car], parkingCarIds: [car.id] })
    const ctx = ctxWith('scrapShell')

    const done = resolveScrapShell(state, car.id, ctx, COST)
    expect(done.log).toHaveLength(1)
    expect(done.state.energySpentToday).toBe(state.energySpentToday + COST)

    const refused = resolveScrapShell(state, car.id, ctx, COST - 1)
    expect(refused.log).toEqual([])
    expect(refused.state).toBe(state)
  })

  it('scrapPart: scrapping a bin part charges the figure, refuses short of it', () => {
    const scrap = binPart('pi-scrap', stockTyresId, 'scrap')
    const state = baseState({ partInventory: [scrap] })
    const ctx = ctxWith('scrapPart')

    const done = resolveScrapPart(state, scrap.id, ctx, COST)
    expect(done.log).toHaveLength(1)
    expect(done.state.energySpentToday).toBe(state.energySpentToday + COST)

    const refused = resolveScrapPart(state, scrap.id, ctx, COST - 1)
    expect(refused.log).toEqual([])
    expect(refused.state).toBe(state)
  })

  it('workup: the owned-car workup charges its own figure, refuses without free labour', () => {
    const symptom = CONTEXT.symptoms[0]!
    const car = buildCarInstance({
      id: 'car-wk',
      modelId: 'honda-city-e-aa',
      symptoms: [
        {
          symptomId: symptom.id,
          trueCauseId: symptom.causes[0]!.id,
          remainingCauseIds: symptom.causes.map((c) => c.id),
          runTestIds: [],
        },
      ],
    })
    const ctx = ctxWith('workup')

    const state = baseState({ ownedCars: [car] })
    const done = resolveOwnedWorkup(state, car.id, ctx)
    expect(done.outcome).toBe('done')
    expect(done.state.energySpentToday).toBe(state.energySpentToday + COST)

    const drained = baseState({
      ownedCars: [car],
      energySpentToday: ctx.economy.energy.basePoolPoints - (COST - 1),
    })
    const refused = resolveOwnedWorkup(drained, car.id, ctx)
    expect(refused.outcome).toBe('no-labor-slot')
    expect(refused.state).toBe(drained)
  })

  it('inspectionVisit: starting a yard visit charges its own figure, refuses without free labour', () => {
    const model = CONTEXT.modelsById['honda-city-e-aa']!
    const lot: AuctionLot = {
      id: 'lot-ap',
      tier: 'local-yard',
      modelId: model.id,
      car: buildCarInstance({ id: 'lot-ap-car', modelId: model.id }),
      bookValueYen: model.bookValueYen,
      expiresOnDay: 8,
      turnout: 'steady',
    }
    const ctx = ctxWith('inspectionVisit')

    const state = baseState({ activeAuctionLots: [lot] })
    const done = beginInspectionVisit(state, 'local-yard', ctx)
    expect(done.outcome).toBe('started')
    expect(done.state.energySpentToday).toBe(state.energySpentToday + COST)

    const drained = baseState({
      activeAuctionLots: [lot],
      energySpentToday: ctx.economy.energy.basePoolPoints - (COST - 1),
    })
    const refused = beginInspectionVisit(drained, 'local-yard', ctx)
    expect(refused.outcome).toBe('no-labor-slot')
    expect(refused.state).toBe(drained)
  })
})
