import {
  BUYERS,
  CARS,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  SERVICE_JOB_CUSTOMER_NAMES,
  SERVICE_JOB_TYPES,
  fitmentClassForTier,
  type AssemblyId,
  type CarInstance,
  type CarPartId,
  type ConditionBand,
  type GameState,
  type PartInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  assemblyMachineGateGroup,
  dissolveAssembliesForCar,
  externalBlockersFor,
  resolveBuildAssembly,
  resolveFitAssemblyMember,
  resolveRefitAssembly,
  resolveRemoveAssembly,
  resolveRemoveAssemblyMember,
} from '../src/assemblies'
import { buildSimContext } from '../src/context'
import {
  findLoosePart,
  machineAssistFeeYen,
  machineGateGroupFor,
  resolveReconditionLabor,
} from '../src/jobs'
import { createInitialGameState } from '../src/newGame'
import { resolvePlaceOnStation, resolveTakeFromStation } from '../src/parts'
import { makeCarOrigin, makeMarketOrigin } from '../src/provenance'
import { deriveServiceJobPayoutYen, serviceJobCostBreakdown } from '../src/serviceJobs'
import { buildCarInstance, mintCarParts, testSceneStanding, testToolTiers } from './testFixtures'

const CONTEXT = buildSimContext(
  CARS,
  PARTS,
  BUYERS,
  PARTS_TAXONOMY,
  SERVICE_JOB_TYPES,
  FACILITIES,
  SERVICE_JOB_CUSTOMER_NAMES,
)

function def(assemblyId: AssemblyId) {
  return CONTEXT.assembliesById[assemblyId]
}

// Every machine line hired for day 1 by default (mirrors jobs.test.ts's own
// fixture): most of this file's tests exercise labour and parts-cost
// arithmetic, not the machine-line gate itself, so the default state assumes
// every line already hired. Tests that mean to exercise the gate override
// this back to `{}` explicitly.
const ALL_LINES_HIRED_DAY_1 = {
  engine: 1,
  drivetrain: 1,
  suspension: 1,
  wheels: 1,
  body: 1,
  interior: 1,
} as const

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
    machineHirePaidDayByGroup: { ...ALL_LINES_HIRED_DAY_1 },
    ...overrides,
  }
}

// --- shared wheels fixture (mirrors jobs.test.ts's own fixture) -------------
const stockRims = CONTEXT.stockPartByCarPartId.entry!.rims!
const stockTyres = CONTEXT.stockPartByCarPartId.entry!.tyres!
const originalRims: PartInstance = {
  id: 'pi-original-rims',
  partId: stockRims.id,
  band: 'worn',
  origin: makeCarOrigin('car-wheels-worn', 'Test Car', 0),
}
const originalTyres: PartInstance = {
  id: 'pi-original-tyres',
  partId: stockTyres.id,
  band: 'worn',
  origin: makeCarOrigin('car-wheels-worn', 'Test Car', 0),
}
function wheelsWornCar(): CarInstance {
  return buildCarInstance({
    id: 'car-wheels-worn',
    modelId: 'honda-city-e-aa',
    parts: mintCarParts({ rims: originalRims, tyres: originalTyres }),
  })
}
const fittingTyre = PARTS.find(
  (p) => p.carPartId === 'tyres' && p.fitmentClass === 'entry' && p.grade === 'street',
)!
function newTyre(id: string): PartInstance {
  return {
    id,
    partId: fittingTyre.id,
    band: 'mint',
    origin: makeMarketOrigin(1),
  }
}

// A same-slot, wrong-class tyre - addresses 'tyres' exactly as `fittingTyre`
// does, but its fitmentClass is 'everyday' where honda-city-e-aa is 'entry'.
const wrongClassTyrePart = PARTS.find(
  (p) => p.carPartId === 'tyres' && p.fitmentClass === 'everyday' && p.grade === 'street',
)!
function wrongClassTyre(id: string): PartInstance {
  return {
    id,
    partId: wrongClassTyrePart.id,
    band: 'mint',
    origin: makeMarketOrigin(1),
  }
}

/**
 * Repair one member of a benched assembly the way the shop does it: pull the
 * member out into the warehouse, carry it to the workshop floor's bench, work
 * it there, carry it back and fit it into the assembly again. Storage does no
 * work and neither does a stand, so the repair itself is the only step that
 * costs anything - the member swaps in and out at
 * `benchRemoveMember`/`benchFitMember`, both zero in shipped content, which is
 * why the binding totals below are untouched by the extra journey.
 */
function benchRepairMember(
  state: GameState,
  containerId: string,
  memberSlot: CarPartId,
  partInstanceId: string,
  targetBand: ConditionBand,
): { state: GameState; laborSlotsUsed: number } {
  const pulled = resolveRemoveAssemblyMember(state, containerId, memberSlot, CONTEXT)
  const onBench = resolvePlaceOnStation(pulled.state, 'workbench', partInstanceId)
  const repair = resolveReconditionLabor(onBench, partInstanceId, targetBand, Infinity, CONTEXT)
  const back = resolveFitAssemblyMember(
    resolveTakeFromStation(repair.state, 'workbench'),
    containerId,
    memberSlot,
    partInstanceId,
    CONTEXT,
  )
  return { state: back.state, laborSlotsUsed: repair.laborSlotsUsed }
}

describe('assembly definitions and derived gates', () => {
  it('external blockers are the union of members blockedBy pointing outside the assembly', () => {
    expect([...externalBlockersFor(def('engineAssembly'), CONTEXT)].sort()).toEqual([
      'cooling',
      'exhaust',
      'intake',
    ])
    expect([...externalBlockersFor(def('gearboxAssembly'), CONTEXT)].sort()).toEqual([
      'driveline',
      'exhaust',
    ])
    expect(externalBlockersFor(def('wheelAssembly'), CONTEXT)).toEqual([])
  })

  it('assemblyMachineGateGroup names the one group an assembly shares, or null when none are machine-gated', () => {
    expect(assemblyMachineGateGroup(def('engineAssembly'), CONTEXT)).toBe('engine')
    expect(assemblyMachineGateGroup(def('gearboxAssembly'), CONTEXT)).toBe('drivetrain')
    expect(assemblyMachineGateGroup(def('wheelAssembly'), CONTEXT)).toBeNull()
  })

  it('the tyre gate names the wheels line for a bench fit and for nothing else', () => {
    expect(machineGateGroupFor('tyres', 'bench-fit', CONTEXT)).toBe('wheels')
    expect(machineGateGroupFor('rims', 'bench-fit', CONTEXT)).toBeNull()
    // Mounting rubber is the only thing the tyre machine gates: the car's own
    // slot is untouched, dismounting is free, and the fee stays 0.
    expect(machineGateGroupFor('tyres', 'install', CONTEXT)).toBeNull()
    expect(machineGateGroupFor('tyres', 'remove', CONTEXT)).toBeNull()
    expect(machineGateGroupFor('tyres', 'repair', CONTEXT)).toBeNull()
    expect(machineAssistFeeYen('tyres', baseState(), CONTEXT)).toBe(0)
  })

  it('no buried slot gates a bench fit - the crane lifts the engine, it does not build it', () => {
    for (const member of ['block', 'internals', 'headValvetrain', 'camsTiming', 'gearbox', 'clutch']
      .concat(['rims'])
      .map((id) => id as CarPartId)) {
      expect(machineGateGroupFor(member, 'bench-fit', CONTEXT), member).toBeNull()
    }
  })

  it('the engine assembly gate names the same group a buried camsTiming removal needs', () => {
    expect(assemblyMachineGateGroup(def('engineAssembly'), CONTEXT)).toBe(
      machineGateGroupFor('camsTiming', 'remove', CONTEXT),
    )
  })
})

describe('the Sprint 79 contract cases, re-expressed at assembly level (Sprint 87 decision 3)', () => {
  it('contract case 1: pull the wheel assembly and refit it as it was - the refit charges the flat assembly figure regardless', () => {
    const car = wheelsWornCar()
    const state = baseState({ ownedCars: [car], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    expect(off.ok).toBe(true)
    // Pulling an assembly costs what pulling its members costs, one by one.
    expect(off.laborSlotsUsed).toBe(2 * CONTEXT.economy.energy.actionPoints.removePart)
    const container = off.state.assemblyInventory![0]!
    expect(container.members.rims!.id).toBe(originalRims.id)
    expect(container.members.tyres!.id).toBe(originalTyres.id)
    expect(off.state.ownedCars[0]!.parts.rims.installed).toBeNull()

    const on = resolveRefitAssembly(off.state, container.id, CONTEXT)
    expect(on.ok).toBe(true)
    // Both members are unchanged, but refit is a flat set figure now - it
    // does not discount for that (sprint212.md task A).
    expect(on.laborSlotsUsed).toBe(CONTEXT.economy.energy.actionPoints.refitAssembly)
    expect(on.state.assemblyInventory).toEqual([])
    expect(on.state.ownedCars[0]!.parts.rims.installed!.id).toBe(originalRims.id)
    expect(on.state.ownedCars[0]!.parts.tyres.installed!.id).toBe(originalTyres.id)
  })

  it('contract case 2: fit a NEW tyre on the bench, refit - the flat assembly figure, same as an unchanged refit', () => {
    const car = wheelsWornCar()
    const tyre = newTyre('pi-new-tyres')
    const state = baseState({ ownedCars: [car], partInventory: [tyre], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    // The old tyres came onto the bench occupying the slot - no swap: they
    // come off into the bin before the new one can be fitted.
    const pulled = resolveRemoveAssemblyMember(off.state, container.id, 'tyres', CONTEXT)
    expect(pulled.ok).toBe(true)
    const swap = resolveFitAssemblyMember(pulled.state, container.id, 'tyres', tyre.id, CONTEXT)
    expect(swap.ok).toBe(true)
    const on = resolveRefitAssembly(swap.state, container.id, CONTEXT)
    expect(on.ok).toBe(true)
    // A new tyre changed, but refit still charges only the flat assembly
    // figure - the same as contract case 1's fully-unchanged refit.
    expect(on.laborSlotsUsed).toBe(CONTEXT.economy.energy.actionPoints.refitAssembly)
    expect(off.laborSlotsUsed + on.laborSlotsUsed).toBe(
      2 * CONTEXT.economy.energy.actionPoints.removePart +
        CONTEXT.economy.energy.actionPoints.refitAssembly,
    )
    expect(on.state.ownedCars[0]!.parts.tyres.installed!.id).toBe(tyre.id)
  })

  it('contract case 3: bench-repair the rims, fit a NEW tyre, refit - still just the flat assembly figure', () => {
    const car = wheelsWornCar()
    const tyre = newTyre('pi-new-tyres-3')
    const state = baseState({ ownedCars: [car], partInventory: [tyre], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    // Bench-repair the rims MEMBER: out of the assembly, onto the bench, worked,
    // and back into the assembly.
    const repair = benchRepairMember(off.state, container.id, 'rims', originalRims.id, 'fine')
    expect(repair.laborSlotsUsed).toBeGreaterThan(0)
    expect(findLoosePart(repair.state, originalRims.id)!.band).toBe('fine')

    // The old tyres still occupy the slot - take them off before fitting new.
    const pulled = resolveRemoveAssemblyMember(repair.state, container.id, 'tyres', CONTEXT)
    expect(pulled.ok).toBe(true)
    const swap = resolveFitAssemblyMember(pulled.state, container.id, 'tyres', tyre.id, CONTEXT)
    const on = resolveRefitAssembly(swap.state, container.id, CONTEXT)
    expect(on.ok).toBe(true)
    // Two members changed (repaired rims, new tyre) - still the one flat
    // figure, never a per-member sum (sprint212.md task A).
    expect(on.laborSlotsUsed).toBe(CONTEXT.economy.energy.actionPoints.refitAssembly)
    expect(on.state.ownedCars[0]!.parts.rims.installed!.band).toBe('fine')
    expect(on.state.ownedCars[0]!.parts.tyres.installed!.id).toBe(tyre.id)
  })

  it('the clutch chain at gearbox-assembly level: both members charged off the car, the refit charging its flat figure regardless of which member changed', () => {
    // gearboxAssembly members are gearbox + clutch; gearbox is repaired on the
    // bench so it changes and clutch does not, but the refit prices neither
    // member individually any more (sprint212.md task A).
    const gearbox = {
      id: 'pi-gbx',
      partId: CONTEXT.stockPartByCarPartId.entry!.gearbox!.id,
      band: 'worn' as const,
      origin: makeCarOrigin('car-gbx', 'Test Car', 0),
    }
    const clutch = {
      id: 'pi-clu',
      partId: CONTEXT.stockPartByCarPartId.entry!.clutch!.id,
      band: 'worn' as const,
      origin: makeCarOrigin('car-gbx', 'Test Car', 0),
    }
    const car = buildCarInstance({
      id: 'car-gbx',
      modelId: 'honda-city-e-aa',
      // driveline + exhaust are the external blockers - leave them empty so the
      // gearbox assembly is free to come off.
      parts: mintCarParts({ gearbox, clutch, driveline: null, exhaust: null }),
    })
    const state = baseState({
      ownedCars: [car],
      serviceBayCarIds: [car.id],
      toolTiers: testToolTiers({ drivetrain: 2 }),
    })
    const off = resolveRemoveAssembly(state, car.id, 'gearboxAssembly', CONTEXT)
    expect(off.ok).toBe(true)
    expect(off.laborSlotsUsed).toBe(2 * CONTEXT.economy.energy.actionPoints.removePart)
    const container = off.state.assemblyInventory![0]!
    const repair = benchRepairMember(off.state, container.id, 'gearbox', gearbox.id, 'mint')
    expect(repair.laborSlotsUsed).toBeGreaterThan(0)
    const on = resolveRefitAssembly(repair.state, container.id, CONTEXT)
    expect(on.ok).toBe(true)
    // The flat assembly figure, whether or not gearbox came back improved.
    expect(on.laborSlotsUsed).toBe(CONTEXT.economy.energy.actionPoints.refitAssembly)
  })
})

describe('worked example: the tyre change (binding total)', () => {
  it('two removals plus the new tyre install, end to end; no cash moves here, whether owning or hiring the tyre machine', () => {
    for (const wheelsTier of [1, 2] as const) {
      const car = wheelsWornCar()
      const tyre = newTyre('pi-tyre-work')
      const state = baseState({
        ownedCars: [car],
        partInventory: [tyre],
        serviceBayCarIds: [car.id],
        toolTiers: testToolTiers({ wheels: wheelsTier }),
      })
      const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
      const container = off.state.assemblyInventory![0]!
      // The old (scrap-worthy) tyres came onto the bench occupying the slot -
      // free, ungated removal before the new one can be fitted (no swap).
      const pulled = resolveRemoveAssemblyMember(off.state, container.id, 'tyres', CONTEXT)
      expect(pulled.ok).toBe(true)
      const swap = resolveFitAssemblyMember(pulled.state, container.id, 'tyres', tyre.id, CONTEXT)
      const on = resolveRefitAssembly(swap.state, container.id, CONTEXT)

      expect(swap.ok).toBe(true)
      expect(on.ok).toBe(true)
      const totalLabour = off.laborSlotsUsed + on.laborSlotsUsed
      expect(totalLabour).toBe(
        2 * CONTEXT.economy.energy.actionPoints.removePart +
          CONTEXT.economy.energy.actionPoints.refitAssembly,
      )
      // The fee is gone - fitting a tyre never spends cash directly, whether
      // the wheels machine is owned or the line was hired for the day.
      expect(on.state.cashYen).toBe(state.cashYen)
    }
  })

  it('fitting a tyre on the bench without the wheels line costs the machine-less labour rate; hired, it costs base labour', () => {
    const multiplier = CONTEXT.economy.machineShopAssist.machinelessLaborMultiplier
    const benchFit = CONTEXT.economy.energy.actionPoints.benchFitMember
    const car = wheelsWornCar()
    const tyre = newTyre('pi-tyre-gate')
    const ungated = baseState({
      ownedCars: [car],
      partInventory: [tyre],
      serviceBayCarIds: [car.id],
      toolTiers: testToolTiers({ wheels: 1 }),
      machineHirePaidDayByGroup: {},
    })
    const off = resolveRemoveAssembly(ungated, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    // The old tyres occupy the slot after removal - clear it before fitting
    // (no swap); dismounting is free and ungated either way.
    const pulled = resolveRemoveAssemblyMember(off.state, container.id, 'tyres', CONTEXT)
    expect(pulled.ok).toBe(true)
    const byHand = resolveFitAssemblyMember(pulled.state, container.id, 'tyres', tyre.id, CONTEXT)
    expect(byHand.ok).toBe(true)
    expect(byHand.state.assemblyInventory![0]!.members.tyres!.id).toBe(tyre.id)
    expect(byHand.state.energySpentToday - pulled.state.energySpentToday).toBe(
      benchFit * multiplier,
    )

    const hired = { ...pulled.state, machineHirePaidDayByGroup: { wheels: pulled.state.day } }
    const swap = resolveFitAssemblyMember(hired, container.id, 'tyres', tyre.id, CONTEXT)
    expect(swap.ok).toBe(true)
    expect(swap.state.energySpentToday - hired.energySpentToday).toBe(benchFit)
  })
})

describe('worked example: worn internals (binding total)', () => {
  it('remove charges every member, refit charges the flat assembly figure; no fee posts to the car ledger, whether renting or owning', () => {
    for (const engineTier of [1, 2] as const) {
      const internals: PartInstance = {
        id: 'pi-internals',
        partId: CONTEXT.stockPartByCarPartId.entry!.internals!.id,
        band: 'worn',
        origin: makeCarOrigin('car-engine', 'Test Car', 0),
      }
      // Start with the external blockers (intake/exhaust/cooling) already stripped
      // - each comes off per-part (they are not assembly members), so the
      // closed-form probe pins the engine-assembly economics directly.
      const car = buildCarInstance({
        id: 'car-engine',
        modelId: 'honda-city-e-aa',
        parts: mintCarParts({ internals, intake: null, exhaust: null, cooling: null }),
      })
      const state = baseState({
        ownedCars: [car],
        serviceBayCarIds: [car.id],
        toolTiers: testToolTiers({ engine: engineTier }),
      })

      const off = resolveRemoveAssembly(state, car.id, 'engineAssembly', CONTEXT)
      expect(off.ok).toBe(true)
      // Four members on the stand, each charged its own removal.
      expect(off.laborSlotsUsed).toBe(4 * CONTEXT.economy.energy.actionPoints.removePart)
      const container = off.state.assemblyInventory![0]!
      // Repair the internals member at the bench (normal cash + labour), then
      // put it back on the stand.
      const repair = benchRepairMember(off.state, container.id, 'internals', internals.id, 'mint')
      expect(repair.laborSlotsUsed).toBeGreaterThan(0)
      const on = resolveRefitAssembly(repair.state, container.id, CONTEXT)
      expect(on.ok).toBe(true)
      // The flat assembly figure, whether or not internals came back improved.
      expect(on.laborSlotsUsed).toBe(CONTEXT.economy.energy.actionPoints.refitAssembly)

      // No machine fee posts anywhere - remove and refit both spend only the
      // internals repair cost, whether renting the engine line or owning it.
      expect(state.cashYen - off.state.cashYen).toBe(0)
      expect(repair.state.cashYen - on.state.cashYen).toBe(0)
      expect(on.state.carLedgers[car.id]!.repairYen).toBe(0)
    }
  })

  it('remove and refit both proceed without the engine line at the machine-less labour rate; hired, both run at base labour', () => {
    const multiplier = CONTEXT.economy.machineShopAssist.machinelessLaborMultiplier
    const internals: PartInstance = {
      id: 'pi-internals-gate',
      partId: CONTEXT.stockPartByCarPartId.entry!.internals!.id,
      band: 'worn',
      origin: makeCarOrigin('car-engine-gate', 'Test Car', 0),
    }
    const car = buildCarInstance({
      id: 'car-engine-gate',
      modelId: 'honda-city-e-aa',
      parts: mintCarParts({ internals, intake: null, exhaust: null, cooling: null }),
    })
    const ungated = baseState({
      ownedCars: [car],
      serviceBayCarIds: [car.id],
      toolTiers: testToolTiers({ engine: 1 }),
      machineHirePaidDayByGroup: {},
    })

    // By hand: the pull proceeds at the multiplied labour rate.
    const removeBase = 4 * CONTEXT.economy.energy.actionPoints.removePart
    const byHandOff = resolveRemoveAssembly(ungated, car.id, 'engineAssembly', CONTEXT)
    expect(byHandOff.ok).toBe(true)
    expect(byHandOff.laborSlotsUsed).toBe(removeBase * multiplier)

    // Hired for the day: the same pull at base labour.
    const hired = { ...ungated, machineHirePaidDayByGroup: { engine: ungated.day } }
    const off = resolveRemoveAssembly(hired, car.id, 'engineAssembly', CONTEXT)
    expect(off.ok).toBe(true)
    expect(off.laborSlotsUsed).toBe(removeBase)
    const container = off.state.assemblyInventory![0]!

    // Refit prices the same way against whatever state it is given: the
    // stripped-hire state pays the multiplier on the flat assembly figure,
    // the still-hired one does not.
    const strippedHire = { ...off.state, machineHirePaidDayByGroup: {} }
    const byHandOn = resolveRefitAssembly(strippedHire, container.id, CONTEXT)
    expect(byHandOn.ok).toBe(true)
    expect(byHandOn.laborSlotsUsed).toBe(
      CONTEXT.economy.energy.actionPoints.refitAssembly * multiplier,
    )
    const on = resolveRefitAssembly(off.state, container.id, CONTEXT)
    expect(on.ok).toBe(true)
    expect(on.laborSlotsUsed).toBe(CONTEXT.economy.energy.actionPoints.refitAssembly)
    expect(on.state.ownedCars[0]!.parts.internals.installed!.id).toBe(internals.id)
  })
})

describe('bench work, build-from-loose, and car-exit dissolve (Sprint 87)', () => {
  it('a benched member is repaired by taking it to the bench and putting it back', () => {
    const car = wheelsWornCar()
    const state = baseState({ ownedCars: [car], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    // A stand is not a bench: the member comes out, is worked on the workshop
    // floor, and goes back into the assembly, all through the ordinary
    // recondition path.
    const repair = benchRepairMember(off.state, container.id, 'rims', originalRims.id, 'fine')
    expect(repair.laborSlotsUsed).toBeGreaterThan(0)
    expect(findLoosePart(repair.state, originalRims.id)!.band).toBe('fine')
    // Back in the container, not left loose in the warehouse.
    expect(repair.state.assemblyInventory![0]!.members.rims!.band).toBe('fine')
    expect(repair.state.partInventory.find((p) => p.id === originalRims.id)).toBeUndefined()
    // And the bench is clear again.
    expect(repair.state.workbenchPartId).toBeNull()
  })

  it('build an assembly from loose parts and install it onto a bare car - every member charges install labour', () => {
    const bareRims: PartInstance = {
      id: 'pi-br',
      partId: stockRims.id,
      band: 'mint',
      origin: makeMarketOrigin(1),
    }
    const bareTyres: PartInstance = {
      id: 'pi-bt',
      partId: fittingTyre.id,
      band: 'mint',
      origin: makeMarketOrigin(1),
    }
    const car = buildCarInstance({
      id: 'car-bare',
      modelId: 'honda-city-e-aa',
      parts: mintCarParts({ rims: null, tyres: null }),
    })
    const state = baseState({
      ownedCars: [car],
      partInventory: [bareRims, bareTyres],
      serviceBayCarIds: [car.id],
    })
    const built = resolveBuildAssembly(
      state,
      'wheelAssembly',
      { rims: bareRims.id, tyres: bareTyres.id },
      CONTEXT,
    )
    expect(built.ok).toBe(true)
    const container = built.state.assemblyInventory![0]!
    expect(container.sourceCarId).toBeNull()
    const on = resolveRefitAssembly(built.state, container.id, CONTEXT, Infinity, car.id)
    expect(on.ok).toBe(true)
    // No baseline on the car (slots were empty) - both members charge bolt-on install energy.
    expect(on.laborSlotsUsed).toBe(2 * CONTEXT.economy.energy.energyByClass['bolt-on'])
  })

  it('a mounted member pulls out of the container into the bin, free, and the slot reads empty (playtest 2026-07-19 item 25)', () => {
    const car = wheelsWornCar()
    const state = baseState({ ownedCars: [car], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!

    const pulled = resolveRemoveAssemblyMember(off.state, container.id, 'tyres', CONTEXT)
    expect(pulled.ok).toBe(true)
    expect(pulled.state.partInventory.some((p) => p.id === originalTyres.id)).toBe(true)
    expect(pulled.state.assemblyInventory![0]!.members.tyres).toBeNull()
    // Dismounting is free and ungated: cash and energy untouched (the wheels
    // gate is for fitting a tyre, never for pulling one off).
    expect(pulled.state.cashYen).toBe(off.state.cashYen)
    expect(pulled.state.energySpentToday).toBe(off.state.energySpentToday)

    // Refusals: an already-empty slot, and a missing container.
    expect(resolveRemoveAssemblyMember(pulled.state, container.id, 'tyres', CONTEXT).ok).toBe(false)
    expect(
      resolveRemoveAssemblyMember(pulled.state, 'no-such-container', 'tyres', CONTEXT).ok,
    ).toBe(false)
  })

  it('dissolving a car assembly drops its members to the parts bin', () => {
    const car = wheelsWornCar()
    const state = baseState({ ownedCars: [car], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const dissolved = dissolveAssembliesForCar(off.state, car.id)
    expect(dissolved.assemblyInventory).toEqual([])
    expect(dissolved.partInventory.map((p) => p.id).sort()).toEqual(
      [originalRims.id, originalTyres.id].sort(),
    )
  })
})

describe('the fitment law applies at the bench, not only on the car', () => {
  it('resolveFitAssemblyMember refuses a wrong-class part into a container pulled off a car, state unchanged', () => {
    const car = wheelsWornCar()
    const wrongTyre = wrongClassTyre('pi-wrong-swap')
    const state = baseState({
      ownedCars: [car],
      partInventory: [wrongTyre],
      serviceBayCarIds: [car.id],
    })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    // Empty the slot first, so this genuinely exercises the fitment check
    // rather than the occupied-slot refusal.
    const pulled = resolveRemoveAssemblyMember(off.state, container.id, 'tyres', CONTEXT)
    expect(pulled.ok).toBe(true)
    const swap = resolveFitAssemblyMember(
      pulled.state,
      container.id,
      'tyres',
      wrongTyre.id,
      CONTEXT,
    )
    expect(swap.ok).toBe(false)
    expect(swap.state).toBe(pulled.state)
    // The slot stays empty; the wrong-class one stays in the bin.
    expect(pulled.state.assemblyInventory![0]!.members.tyres).toBeNull()
    expect(pulled.state.partInventory.some((p) => p.id === wrongTyre.id)).toBe(true)
  })

  it('resolveFitAssemblyMember still fits a right-class part into the same slot', () => {
    const car = wheelsWornCar()
    const tyre = newTyre('pi-right-swap')
    const state = baseState({ ownedCars: [car], partInventory: [tyre], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    const pulled = resolveRemoveAssemblyMember(off.state, container.id, 'tyres', CONTEXT)
    expect(pulled.ok).toBe(true)
    const swap = resolveFitAssemblyMember(pulled.state, container.id, 'tyres', tyre.id, CONTEXT)
    expect(swap.ok).toBe(true)
    expect(swap.state.assemblyInventory![0]!.members.tyres!.id).toBe(tyre.id)
  })

  it('resolveFitAssemblyMember refuses outright into an occupied slot - no swap, state unchanged (Sprint 206 B1)', () => {
    const car = wheelsWornCar()
    const tyre = newTyre('pi-would-be-swap')
    const state = baseState({ ownedCars: [car], partInventory: [tyre], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    // The tyres slot still carries its original member (removal, not a
    // swap, put the whole assembly on the bench) - fitting straight over it
    // must refuse, exactly as `resolveRefitAssembly` refuses an occupied
    // car-level slot.
    expect(container.members.tyres!.id).toBe(originalTyres.id)
    const fit = resolveFitAssemblyMember(off.state, container.id, 'tyres', tyre.id, CONTEXT)
    expect(fit.ok).toBe(false)
    expect(fit.state).toBe(off.state)
    // The occupying member is still there; the new part never left the bin.
    expect(off.state.assemblyInventory![0]!.members.tyres!.id).toBe(originalTyres.id)
    expect(off.state.partInventory.some((p) => p.id === tyre.id)).toBe(true)
  })

  it('resolveRefitAssembly refuses a wrong-class member reaching a car via overrideCarId, even though the bench build never checked it', () => {
    const bareRims: PartInstance = {
      id: 'pi-br-fit',
      partId: stockRims.id,
      band: 'mint',
      origin: makeMarketOrigin(1),
    }
    const wrongTyre = wrongClassTyre('pi-wrong-refit')
    const car = buildCarInstance({
      id: 'car-bare-wrongclass',
      modelId: 'honda-city-e-aa',
      parts: mintCarParts({ rims: null, tyres: null }),
    })
    const state = baseState({
      ownedCars: [car],
      partInventory: [bareRims, wrongTyre],
      serviceBayCarIds: [car.id],
    })
    const built = resolveBuildAssembly(
      state,
      'wheelAssembly',
      { rims: bareRims.id, tyres: wrongTyre.id },
      CONTEXT,
    )
    // Building from loose bin parts never names a car, so it cannot and does
    // not check fitment - the mismatch only becomes checkable once a target
    // car is named, which is what overrideCarId does below.
    expect(built.ok).toBe(true)
    const container = built.state.assemblyInventory![0]!
    const refit = resolveRefitAssembly(built.state, container.id, CONTEXT, Infinity, car.id)
    expect(refit.ok).toBe(false)
    expect(refit.state).toBe(built.state)
    expect(refit.state.ownedCars[0]!.parts.tyres.installed).toBeNull()
  })
})

/**
 * The bench is an install path, so it answers to the same capability gate the
 * car does (`partCapabilityRequirement`, jobs.ts) - otherwise a race part a
 * shop cannot fit could simply be mounted into an assembly and carried on.
 * It is also the one refusal at the bench that says why.
 */
describe('the capability gate applies at the bench', () => {
  const raceRims = CONTEXT.aftermarketPartByCarPartId.entry.rims.race!

  function raceRimInstance(id: string): PartInstance {
    return { id, partId: raceRims.id, band: 'mint', origin: makeMarketOrigin(1) }
  }

  it('refuses a race member into a container pulled off a car while the line is at rung 1, and says so', () => {
    const car = wheelsWornCar()
    const rim = raceRimInstance('pi-race-rim')
    const state = baseState({
      ownedCars: [car],
      partInventory: [rim],
      serviceBayCarIds: [car.id],
      toolTiers: testToolTiers({ wheels: 1 }),
    })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    // Empty the slot first, so this genuinely exercises the capability gate
    // rather than the occupied-slot refusal.
    const pulled = resolveRemoveAssemblyMember(off.state, container.id, 'rims', CONTEXT)
    expect(pulled.ok).toBe(true)
    const swap = resolveFitAssemblyMember(pulled.state, container.id, 'rims', rim.id, CONTEXT)
    expect(swap.ok).toBe(false)
    expect(swap.state).toBe(pulled.state)
    expect(swap.log).toEqual([
      { type: 'job-blocked', jobId: `bench-${container.id}-rims`, reason: 'tool-tier' },
    ])
  })

  it('fits the same member once the line stands at rung 2', () => {
    const car = wheelsWornCar()
    const rim = raceRimInstance('pi-race-rim-2')
    const state = baseState({
      ownedCars: [car],
      partInventory: [rim],
      serviceBayCarIds: [car.id],
      toolTiers: testToolTiers({ wheels: 2 }),
    })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    const pulled = resolveRemoveAssemblyMember(off.state, container.id, 'rims', CONTEXT)
    expect(pulled.ok).toBe(true)
    const swap = resolveFitAssemblyMember(pulled.state, container.id, 'rims', rim.id, CONTEXT)
    expect(swap.ok).toBe(true)
    expect(swap.state.assemblyInventory![0]!.members.rims!.id).toBe(rim.id)
  })

  it('catches a bench-built assembly on its way onto a car, which is where its members first meet one', () => {
    const rim = raceRimInstance('pi-race-rim-3')
    const tyre = newTyre('pi-tyre-with-race-rim')
    const car = buildCarInstance({
      id: 'car-bare-race-rims',
      modelId: 'honda-city-e-aa',
      parts: mintCarParts({ rims: null, tyres: null }),
    })
    const state = baseState({
      ownedCars: [car],
      partInventory: [rim, tyre],
      serviceBayCarIds: [car.id],
      toolTiers: testToolTiers({ wheels: 1 }),
    })
    const built = resolveBuildAssembly(
      state,
      'wheelAssembly',
      { rims: rim.id, tyres: tyre.id },
      CONTEXT,
    )
    expect(built.ok).toBe(true)
    const container = built.state.assemblyInventory![0]!
    const refit = resolveRefitAssembly(built.state, container.id, CONTEXT, Infinity, car.id)
    expect(refit.ok).toBe(false)
    expect(refit.log).toEqual([
      {
        type: 'job-blocked',
        jobId: `assembly-refit-${container.id}-rims`,
        reason: 'tool-tier',
      },
    ])
    expect(refit.state.ownedCars[0]!.parts.rims.installed).toBeNull()
  })
})

describe('a standard tyre/brake service job payout always covers its task cost', () => {
  // The bread-and-butter tyre/brake service templates. The wheels machine
  // hire fee never lands on a single job's margin - it's a running cost, the
  // same as rent, amortised across the whole day's work rather than charged
  // per job - so the invariant left to check is the task cost itself.
  const TEMPLATE_IDS = [
    'tyre-fit-and-balance',
    'brake-pads-service',
    'tyres-and-pads-service',
    'brake-system-overhaul',
  ]

  it('worst-margin payout clears the task cost, for every entry and everyday roster model', () => {
    const marginMin = CONTEXT.economy.serviceJobs.marginMin
    const state = createInitialGameState(CONTEXT, 1)
    const entryEverydayModels = CARS.filter((m) => {
      const fitmentClass = fitmentClassForTier(m.tier)
      return fitmentClass === 'entry' || fitmentClass === 'everyday'
    })
    const failures: string[] = []
    for (const id of TEMPLATE_IDS) {
      const template = SERVICE_JOB_TYPES.find((t) => t.id === id)!
      // Worst repairable starting band for any band-only task - maximises the
      // repair-side cost the payout has to cover.
      const overrides: Partial<Record<CarPartId, 'poor'>> = {}
      for (const task of template.tasks) {
        if (task.kind === 'slotCondition' && !task.requirement.minGrade) {
          overrides[task.requirement.carPartId] = 'poor'
        }
      }
      for (const model of entryEverydayModels) {
        const car = buildCarInstance({ modelId: model.id, parts: mintCarParts(overrides) })
        const payout = deriveServiceJobPayoutYen(
          template.tasks,
          car,
          model,
          CONTEXT,
          state,
          marginMin,
        )
        const cost = serviceJobCostBreakdown(template.tasks, car, model, CONTEXT, state).taskCostYen
        if (payout <= cost) {
          failures.push(`${id} x ${model.id}: payout ${payout} <= task cost ${cost}`)
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
})
