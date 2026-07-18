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
  assemblyMachineAssistFeeYen,
  benchSwapFeeYen,
  dissolveAssembliesForCar,
  externalBlockersFor,
  resolveBuildAssembly,
  resolveRefitAssembly,
  resolveRemoveAssembly,
  resolveSwapAssemblyMember,
} from '../src/assemblies'
import { buildSimContext } from '../src/context'
import { findLoosePart, machineAssistFeeYen, resolveReconditionLabor } from '../src/jobs'
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

const WHEELS_FEE = CONTEXT.economy.machineShopAssist.feeYenByGroup.wheels
const ENGINE_FEE = CONTEXT.economy.machineShopAssist.feeYenByGroup.engine
const DRIVETRAIN_FEE = CONTEXT.economy.machineShopAssist.feeYenByGroup.drivetrain

function def(assemblyId: AssemblyId) {
  return CONTEXT.assembliesById[assemblyId]
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

// --- shared wheels fixture (mirrors the Sprint 79 jobs.test.ts fixture) ------
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

describe('assembly definitions and derived gates (Sprint 87)', () => {
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

  it('the assembly machine fee is one fee per distinct machine group, or 0 when owned', () => {
    const tier1 = baseState()
    expect(assemblyMachineAssistFeeYen(def('engineAssembly'), tier1, CONTEXT)).toBe(ENGINE_FEE)
    expect(assemblyMachineAssistFeeYen(def('gearboxAssembly'), tier1, CONTEXT)).toBe(DRIVETRAIN_FEE)
    expect(assemblyMachineAssistFeeYen(def('wheelAssembly'), tier1, CONTEXT)).toBe(0)

    const owned = baseState({ toolTiers: testToolTiers({ engine: 2, drivetrain: 2 }) })
    expect(assemblyMachineAssistFeeYen(def('engineAssembly'), owned, CONTEXT)).toBe(0)
    expect(assemblyMachineAssistFeeYen(def('gearboxAssembly'), owned, CONTEXT)).toBe(0)
  })

  it('the wheels bench fee applies only to a tyre swap, and only at tier 1', () => {
    const tier1 = baseState()
    expect(benchSwapFeeYen('tyres', tier1, CONTEXT)).toBe(WHEELS_FEE)
    expect(benchSwapFeeYen('rims', tier1, CONTEXT)).toBe(0)
    expect(
      benchSwapFeeYen('tyres', baseState({ toolTiers: testToolTiers({ wheels: 2 }) }), CONTEXT),
    ).toBe(0)
    // The wheels fee is NOT the buried-slot machine gate: machineAssistFeeYen('tyres') stays 0.
    expect(machineAssistFeeYen('tyres', tier1, CONTEXT)).toBe(0)
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
    // rims free (equivalence), new tyre charged 1 bolt-on slot.
    expect(on.laborSlotsUsed).toBe(1)
    expect(off.laborSlotsUsed + on.laborSlotsUsed).toBe(1)
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
    const repair = resolveReconditionLabor(off.state, originalRims.id, 'mint', Infinity, CONTEXT)
    expect(repair.laborSlotsUsed).toBeGreaterThan(0)
    expect(findLoosePart(repair.state, originalRims.id)!.band).toBe('mint')

    const swap = resolveSwapAssemblyMember(repair.state, container.id, 'tyres', tyre.id, CONTEXT)
    const on = resolveRefitAssembly(swap.state, container.id, CONTEXT)
    expect(on.ok).toBe(true)
    // Repaired rims no longer match the worn baseline (1) + new tyre (1) = 2.
    expect(on.laborSlotsUsed).toBe(2)
    expect(on.state.ownedCars[0]!.parts.rims.installed!.band).toBe('mint')
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
    // gearbox repaired (mint != worn) charged buried (2); clutch unchanged (0).
    expect(on.laborSlotsUsed).toBe(2)
  })
})

describe('worked example: the tyre change (binding total, Sprint 87)', () => {
  it('total 1 labour slot end to end; one wheels fee when renting, none when owning the tyre machine', () => {
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

      const totalLabour = off.laborSlotsUsed + on.laborSlotsUsed
      expect(totalLabour).toBe(1)
      const feePaid = state.cashYen - on.state.cashYen
      expect(feePaid).toBe(wheelsTier >= 2 ? 0 : WHEELS_FEE)
    }
  })
})

describe('worked example: worn internals (binding total, Sprint 87)', () => {
  it('remove 0 + refit 2 = 2 assembly labour; two engine fees (30,000) when renting, none when owning', () => {
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
      // Only internals is charged (2 buried); block/head/cams free by equivalence.
      expect(on.laborSlotsUsed).toBe(2)

      // Two engine assist fees end to end when renting, none when owning.
      const removeFee = state.cashYen - off.state.cashYen
      const refitFee = repair.state.cashYen - on.state.cashYen
      expect(removeFee).toBe(engineTier >= 2 ? 0 : ENGINE_FEE)
      expect(refitFee).toBe(engineTier >= 2 ? 0 : ENGINE_FEE)
      expect(removeFee + refitFee).toBe(engineTier >= 2 ? 0 : 2 * ENGINE_FEE)

      if (engineTier === 1) {
        // The fees post to the car ledger, so mission budget caps see them.
        expect(on.state.carLedgers[car.id]!.repairYen).toBeGreaterThanOrEqual(2 * ENGINE_FEE)
      }
    }
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
    // No baseline on the car (slots were empty) - both members charge install labour.
    expect(on.laborSlotsUsed).toBe(2)
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

describe('renting never makes a standard tyre/brake service job loss-making (Sprint 87 decision 3b)', () => {
  // The bread-and-butter tyre/brake service templates - the jobs a fresh shop
  // without the tyre machine actually eats the wheels fee on.
  const TEMPLATE_IDS = [
    'tyre-fit-and-balance',
    'brake-pads-service',
    'tyres-and-pads-service',
    'brake-system-overhaul',
  ]

  it('worst-margin payout clears parts + the wheels fee, for every shitbox and common roster model', () => {
    const tier1 = baseState() // wheels tier 1 - the wheels fee applies to a tyre op
    const marginMin = CONTEXT.economy.serviceJobs.marginMin
    const shitboxCommonModels = CARS.filter((m) => {
      const fitmentClass = fitmentClassForTier(m.tier)
      return fitmentClass === 'shitbox' || fitmentClass === 'common'
    })
    const failures: string[] = []
    for (const id of TEMPLATE_IDS) {
      const template = SERVICE_JOB_TYPES.find((t) => t.id === id)!
      // One wheels fitting fee per tyre task; a brake-only job pulls the wheel
      // assembly for free (no tyre op), so it never eats the wheels fee.
      const wheelsFee = template.tasks.some((t) => t.requirement.carPartId === 'tyres')
        ? benchSwapFeeYen('tyres', tier1, CONTEXT)
        : 0
      // Worst repairable starting band for any band-only task - maximises the
      // repair-side cost the payout has to cover.
      const overrides: Partial<Record<CarPartId, 'poor'>> = {}
      for (const task of template.tasks) {
        if (!task.requirement.minGrade) overrides[task.requirement.carPartId] = 'poor'
      }
      for (const model of shitboxCommonModels) {
        const car = buildCarInstance({ modelId: model.id, parts: mintCarParts(overrides) })
        const payout = deriveServiceJobPayoutYen(template.tasks, car, model, CONTEXT, marginMin)
        const cost =
          serviceJobCostBreakdown(template.tasks, car, model, CONTEXT).taskCostYen + wheelsFee
        if (payout <= cost) {
          failures.push(`${id} x ${model.id}: payout ${payout} <= parts+fee ${cost}`)
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
})

describe('the engine assembly fee equals one engine machine fee (Sprint 87 decision 3c)', () => {
  it('a make-it-pull-style buried camsTiming build costs the same two engine fees at the assembly level', () => {
    const tier1 = baseState()
    // The make-it-pull satisfiability probe (storyMissionProbes.test.ts) pins
    // `2 * machineAssistFeeYen('camsTiming')` as the buried-slot assist cost of
    // fitting the sport cams. At the assembly level, that is exactly one engine
    // fee per direction of the engine-assembly round trip.
    const perMemberFee = machineAssistFeeYen('camsTiming', tier1, CONTEXT)
    expect(assemblyMachineAssistFeeYen(def('engineAssembly'), tier1, CONTEXT)).toBe(perMemberFee)
    const roundTrip = 2 * assemblyMachineAssistFeeYen(def('engineAssembly'), tier1, CONTEXT)
    expect(roundTrip).toBe(2 * perMemberFee)
  })
})
