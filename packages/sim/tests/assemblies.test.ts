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
  type GameState,
  type PartInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  assemblyMachineGateGroup,
  benchSwapGateGroup,
  dissolveAssembliesForCar,
  externalBlockersFor,
  resolveBuildAssembly,
  resolveRefitAssembly,
  resolveRemoveAssembly,
  resolveRemoveAssemblyMember,
  resolveSwapAssemblyMember,
} from '../src/assemblies'
import { buildSimContext } from '../src/context'
import {
  findLoosePart,
  machineAssistFeeYen,
  removeMachineGateGroup,
  resolveReconditionLabor,
} from '../src/jobs'
import { makeCarOrigin, makeMarketOrigin } from '../src/provenance'
import { deriveServiceJobPayoutYen, serviceJobCostBreakdown } from '../src/serviceJobs'
import { buildCarInstance, mintCarParts, testSpecialty, testToolTiers } from './testFixtures'

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
    machineHirePaidDayByGroup: { ...ALL_LINES_HIRED_DAY_1 },
    ...overrides,
  }
}

// --- shared wheels fixture (mirrors jobs.test.ts's own fixture) -------------
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
function wheelsWornCar(): CarInstance {
  return buildCarInstance({
    id: 'car-wheels-worn',
    modelId: 'honda-city-e-aa',
    parts: mintCarParts({ rims: originalRims, tyres: originalTyres }),
  })
}
const fittingTyre = PARTS.find(
  (p) => p.carPartId === 'tyres' && p.fitmentClass === 'shitbox' && p.grade === 'street',
)!
function newTyre(id: string): PartInstance {
  return {
    id,
    partId: fittingTyre.id,
    band: 'mint',
    genuinePeriod: false,
    origin: makeMarketOrigin(1),
  }
}

// A same-slot, wrong-class tyre - addresses 'tyres' exactly as `fittingTyre`
// does, but its fitmentClass is 'common' where honda-city-e-aa is 'shitbox'.
const wrongClassTyrePart = PARTS.find(
  (p) => p.carPartId === 'tyres' && p.fitmentClass === 'common' && p.grade === 'street',
)!
function wrongClassTyre(id: string): PartInstance {
  return {
    id,
    partId: wrongClassTyrePart.id,
    band: 'mint',
    genuinePeriod: false,
    origin: makeMarketOrigin(1),
  }
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

  it('benchSwapGateGroup names the wheels line for a tyre swap only, distinct from the buried-slot gate', () => {
    expect(benchSwapGateGroup('tyres')).toBe('wheels')
    expect(benchSwapGateGroup('rims')).toBeNull()
    // The wheels gate is NOT the buried-slot machine gate: machineAssistFeeYen('tyres') stays 0.
    expect(machineAssistFeeYen('tyres', baseState(), CONTEXT)).toBe(0)
  })

  it('the engine assembly gate names the same group a buried camsTiming fit needs', () => {
    expect(assemblyMachineGateGroup(def('engineAssembly'), CONTEXT)).toBe(
      removeMachineGateGroup('camsTiming', CONTEXT),
    )
  })
})

describe('the Sprint 79 contract cases, re-expressed at assembly level (Sprint 87 decision 3)', () => {
  it('contract case 1: pull the wheel assembly and refit it as it was - 0 labour total', () => {
    const car = wheelsWornCar()
    const state = baseState({ ownedCars: [car], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    expect(off.ok).toBe(true)
    expect(off.laborSlotsUsed).toBe(0)
    const container = off.state.assemblyInventory![0]!
    expect(container.members.rims!.id).toBe(originalRims.id)
    expect(container.members.tyres!.id).toBe(originalTyres.id)
    expect(off.state.ownedCars[0]!.parts.rims.installed).toBeNull()

    const on = resolveRefitAssembly(off.state, container.id, CONTEXT)
    expect(on.ok).toBe(true)
    expect(on.laborSlotsUsed).toBe(0) // both members equal their vacated baseline
    expect(on.state.assemblyInventory).toEqual([])
    expect(on.state.ownedCars[0]!.parts.rims.installed!.id).toBe(originalRims.id)
    expect(on.state.ownedCars[0]!.parts.tyres.installed!.id).toBe(originalTyres.id)
  })

  it('contract case 2: fit a NEW tyre on the bench, refit - new-tyre install only (1 labour total)', () => {
    const car = wheelsWornCar()
    const tyre = newTyre('pi-new-tyres')
    const state = baseState({ ownedCars: [car], partInventory: [tyre], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    const swap = resolveSwapAssemblyMember(off.state, container.id, 'tyres', tyre.id, CONTEXT)
    expect(swap.ok).toBe(true)
    const on = resolveRefitAssembly(swap.state, container.id, CONTEXT)
    expect(on.ok).toBe(true)
    // rims free (equivalence), new tyre charged the bolt-on install energy.
    expect(on.laborSlotsUsed).toBe(CONTEXT.economy.energy.energyByClass['bolt-on'])
    expect(off.laborSlotsUsed + on.laborSlotsUsed).toBe(
      CONTEXT.economy.energy.energyByClass['bolt-on'],
    )
    expect(on.state.ownedCars[0]!.parts.tyres.installed!.id).toBe(tyre.id)
  })

  it('contract case 3: bench-repair the rims, fit a NEW tyre, refit - rim repair labour + rim refit + new-tyre install', () => {
    const car = wheelsWornCar()
    const tyre = newTyre('pi-new-tyres-3')
    const state = baseState({ ownedCars: [car], partInventory: [tyre], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    // Bench-repair the rims MEMBER through the existing recondition path (it now
    // finds container members, so the member reconditions exactly like a bin part).
    const repair = resolveReconditionLabor(off.state, originalRims.id, 'fine', Infinity, CONTEXT)
    expect(repair.laborSlotsUsed).toBeGreaterThan(0)
    expect(findLoosePart(repair.state, originalRims.id)!.band).toBe('fine')

    const swap = resolveSwapAssemblyMember(repair.state, container.id, 'tyres', tyre.id, CONTEXT)
    const on = resolveRefitAssembly(swap.state, container.id, CONTEXT)
    expect(on.ok).toBe(true)
    // Repaired rims no longer match the worn baseline (bolt-on) + new tyre (bolt-on).
    expect(on.laborSlotsUsed).toBe(2 * CONTEXT.economy.energy.energyByClass['bolt-on'])
    expect(on.state.ownedCars[0]!.parts.rims.installed!.band).toBe('fine')
    expect(on.state.ownedCars[0]!.parts.tyres.installed!.id).toBe(tyre.id)
  })

  it('the clutch chain at gearbox-assembly level: blockers off free, a repaired member charged the buried rate', () => {
    // gearboxAssembly members are gearbox + clutch; clutch is non-repairable, so
    // the "improved member costs the buried rate" claim is tested via gearbox,
    // repaired on the bench, then refit charged 2 (buried), clutch free (equivalence).
    const gearbox = {
      id: 'pi-gbx',
      partId: CONTEXT.stockPartByCarPartId.common!.gearbox!.id,
      band: 'worn' as const,
      genuinePeriod: false,
      origin: makeCarOrigin('car-gbx', 'Test Car', 0),
    }
    const clutch = {
      id: 'pi-clu',
      partId: CONTEXT.stockPartByCarPartId.common!.clutch!.id,
      band: 'worn' as const,
      genuinePeriod: false,
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
    expect(off.laborSlotsUsed).toBe(0)
    const container = off.state.assemblyInventory![0]!
    const repair = resolveReconditionLabor(off.state, gearbox.id, 'mint', Infinity, CONTEXT)
    expect(repair.laborSlotsUsed).toBeGreaterThan(0)
    const on = resolveRefitAssembly(repair.state, container.id, CONTEXT)
    expect(on.ok).toBe(true)
    // gearbox repaired (mint != worn) charged the buried install energy; clutch unchanged (0).
    expect(on.laborSlotsUsed).toBe(CONTEXT.economy.energy.energyByClass.buried)
  })
})

describe('worked example: the tyre change (binding total)', () => {
  it('total 1 labour slot end to end; no cash moves here, whether owning or hiring the tyre machine', () => {
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
      const swap = resolveSwapAssemblyMember(off.state, container.id, 'tyres', tyre.id, CONTEXT)
      const on = resolveRefitAssembly(swap.state, container.id, CONTEXT)

      expect(swap.ok).toBe(true)
      expect(on.ok).toBe(true)
      const totalLabour = off.laborSlotsUsed + on.laborSlotsUsed
      expect(totalLabour).toBe(CONTEXT.economy.energy.energyByClass['bolt-on'])
      // The fee is gone - fitting a tyre never spends cash directly, whether
      // the wheels machine is owned or the line was hired for the day.
      expect(on.state.cashYen).toBe(state.cashYen)
    }
  })

  it('fitting a tyre on the bench refuses without the wheels line owned or hired today, and proceeds once hired', () => {
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
    const blockedSwap = resolveSwapAssemblyMember(
      off.state,
      container.id,
      'tyres',
      tyre.id,
      CONTEXT,
    )
    expect(blockedSwap.ok).toBe(false)
    expect(blockedSwap.state).toBe(off.state)

    const hired = { ...off.state, machineHirePaidDayByGroup: { wheels: off.state.day } }
    const swap = resolveSwapAssemblyMember(hired, container.id, 'tyres', tyre.id, CONTEXT)
    expect(swap.ok).toBe(true)
    expect(swap.state.assemblyInventory![0]!.members.tyres!.id).toBe(tyre.id)
  })
})

describe('worked example: worn internals (binding total)', () => {
  it('remove 0 + refit 2 = 2 assembly labour; no fee posts to the car ledger, whether renting or owning', () => {
    for (const engineTier of [1, 2] as const) {
      const internals: PartInstance = {
        id: 'pi-internals',
        partId: CONTEXT.stockPartByCarPartId.common!.internals!.id,
        band: 'worn',
        genuinePeriod: false,
        origin: makeCarOrigin('car-engine', 'Test Car', 0),
      }
      // Start with the external blockers (intake/exhaust/cooling) already stripped
      // - each comes off per-part at 0 labour (they are not assembly members), so
      // the closed-form probe pins the engine-assembly economics directly.
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
      expect(off.laborSlotsUsed).toBe(0)
      const container = off.state.assemblyInventory![0]!
      // Repair the internals member on the stand (normal cash + labour).
      const repair = resolveReconditionLabor(off.state, internals.id, 'mint', Infinity, CONTEXT)
      expect(repair.laborSlotsUsed).toBeGreaterThan(0)
      const on = resolveRefitAssembly(repair.state, container.id, CONTEXT)
      expect(on.ok).toBe(true)
      // Only internals is charged (buried install energy); block/head/cams free by equivalence.
      expect(on.laborSlotsUsed).toBe(CONTEXT.economy.energy.energyByClass.buried)

      // No machine fee posts anywhere - remove and refit both spend only the
      // internals repair cost, whether renting the engine line or owning it.
      expect(state.cashYen - off.state.cashYen).toBe(0)
      expect(repair.state.cashYen - on.state.cashYen).toBe(0)
      expect(on.state.carLedgers[car.id]!.repairYen).toBe(0)
    }
  })

  it('refuses remove and refit alike without the engine line owned or hired today, and proceeds once hired', () => {
    const internals: PartInstance = {
      id: 'pi-internals-gate',
      partId: CONTEXT.stockPartByCarPartId.common!.internals!.id,
      band: 'worn',
      genuinePeriod: false,
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

    // Remove refuses without the line.
    const blockedOff = resolveRemoveAssembly(ungated, car.id, 'engineAssembly', CONTEXT)
    expect(blockedOff.ok).toBe(false)
    expect(blockedOff.state).toBe(ungated)

    // Hired for the day: remove proceeds.
    const hired = { ...ungated, machineHirePaidDayByGroup: { engine: ungated.day } }
    const off = resolveRemoveAssembly(hired, car.id, 'engineAssembly', CONTEXT)
    expect(off.ok).toBe(true)
    const container = off.state.assemblyInventory![0]!

    // Refit checks the same gate independently against whatever state it's
    // given - refuses if that state's hire record is stripped away...
    const strippedHire = { ...off.state, machineHirePaidDayByGroup: {} }
    expect(resolveRefitAssembly(strippedHire, container.id, CONTEXT).ok).toBe(false)

    // ...and proceeds against the real, still-hired state.
    const on = resolveRefitAssembly(off.state, container.id, CONTEXT)
    expect(on.ok).toBe(true)
    expect(on.state.ownedCars[0]!.parts.internals.installed!.id).toBe(internals.id)
  })
})

describe('bench work, build-from-loose, and car-exit dissolve (Sprint 87)', () => {
  it('a benched member reconditions through the existing recondition path', () => {
    const car = wheelsWornCar()
    const state = baseState({ ownedCars: [car], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const repair = resolveReconditionLabor(off.state, originalRims.id, 'fine', Infinity, CONTEXT)
    expect(repair.laborSlotsUsed).toBeGreaterThan(0)
    expect(findLoosePart(repair.state, originalRims.id)!.band).toBe('fine')
    // Still in the container, not the bin.
    expect(repair.state.partInventory.find((p) => p.id === originalRims.id)).toBeUndefined()
  })

  it('build an assembly from loose parts and install it onto a bare car - every member charges install labour', () => {
    const bareRims: PartInstance = {
      id: 'pi-br',
      partId: stockRims.id,
      band: 'mint',
      genuinePeriod: false,
      origin: makeMarketOrigin(1),
    }
    const bareTyres: PartInstance = {
      id: 'pi-bt',
      partId: fittingTyre.id,
      band: 'mint',
      genuinePeriod: false,
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
  it('resolveSwapAssemblyMember refuses a wrong-class part into a container pulled off a car, state unchanged', () => {
    const car = wheelsWornCar()
    const wrongTyre = wrongClassTyre('pi-wrong-swap')
    const state = baseState({
      ownedCars: [car],
      partInventory: [wrongTyre],
      serviceBayCarIds: [car.id],
    })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    const swap = resolveSwapAssemblyMember(off.state, container.id, 'tyres', wrongTyre.id, CONTEXT)
    expect(swap.ok).toBe(false)
    expect(swap.state).toBe(off.state)
    // The original tyre stays put; the wrong-class one stays in the bin.
    expect(off.state.assemblyInventory![0]!.members.tyres!.id).toBe(originalTyres.id)
    expect(off.state.partInventory.some((p) => p.id === wrongTyre.id)).toBe(true)
  })

  it('resolveSwapAssemblyMember still fits a right-class part into the same slot', () => {
    const car = wheelsWornCar()
    const tyre = newTyre('pi-right-swap')
    const state = baseState({ ownedCars: [car], partInventory: [tyre], serviceBayCarIds: [car.id] })
    const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
    const container = off.state.assemblyInventory![0]!
    const swap = resolveSwapAssemblyMember(off.state, container.id, 'tyres', tyre.id, CONTEXT)
    expect(swap.ok).toBe(true)
    expect(swap.state.assemblyInventory![0]!.members.tyres!.id).toBe(tyre.id)
  })

  it('resolveRefitAssembly refuses a wrong-class member reaching a car via overrideCarId, even though the bench build never checked it', () => {
    const bareRims: PartInstance = {
      id: 'pi-br-fit',
      partId: stockRims.id,
      band: 'mint',
      genuinePeriod: false,
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

  it('worst-margin payout clears the task cost, for every shitbox and common roster model', () => {
    const marginMin = CONTEXT.economy.serviceJobs.marginMin
    const shitboxCommonModels = CARS.filter((m) => {
      const fitmentClass = fitmentClassForTier(m.tier)
      return fitmentClass === 'shitbox' || fitmentClass === 'common'
    })
    const failures: string[] = []
    for (const id of TEMPLATE_IDS) {
      const template = SERVICE_JOB_TYPES.find((t) => t.id === id)!
      // Worst repairable starting band for any band-only task - maximises the
      // repair-side cost the payout has to cover.
      const overrides: Partial<Record<CarPartId, 'poor'>> = {}
      for (const task of template.tasks) {
        if (!task.requirement.minGrade) overrides[task.requirement.carPartId] = 'poor'
      }
      for (const model of shitboxCommonModels) {
        const car = buildCarInstance({ modelId: model.id, parts: mintCarParts(overrides) })
        const payout = deriveServiceJobPayoutYen(template.tasks, car, model, CONTEXT, marginMin)
        const cost = serviceJobCostBreakdown(template.tasks, car, model, CONTEXT).taskCostYen
        if (payout <= cost) {
          failures.push(`${id} x ${model.id}: payout ${payout} <= task cost ${cost}`)
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
})
