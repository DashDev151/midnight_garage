import {
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type GameState,
  type PartInstance,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  resolveFitAssemblyMember,
  resolveRemoveAssembly,
  resolveRemoveAssemblyMember,
} from '../src/assemblies'
import { buildSimContext } from '../src/context'
import {
  accessActionPoints,
  accessRoute,
  installLaborSlotsFor,
  resolveRemovePart,
} from '../src/jobs'
import { makeMarketOrigin } from '../src/provenance'
import { energyPlanFor, resolvePlaceOnBench, type RepairTarget } from '../src/repairJobs'
import { buildCarInstance, mintCarParts, testSceneStanding, testToolTiers } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)

/**
 * Access to a part is a labour RATE, never a wall. `accessRoute` prices a
 * buried slot at base labour once its group's rig is owned (tool level 2+)
 * or hired for the day, and at `toolHire.slogMultiplier` times base by hand;
 * a non-buried slot is always open, at base labour, whatever the tools.
 * `accessActionPoints` applies that rate to a labour figure, then - for a
 * step worked on the car, on an `underCar` slot, with the lift owned or
 * hired for the day - takes `lift.underCarStepDiscountPoints` off, floored
 * at one point. Bench work never sees that discount.
 */

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

describe('accessRoute - a buried removal priced by tool level', () => {
  it('costs six points slogged at tool level 1, two with the line hired today, two owned at tool level 2', () => {
    const entry = CONTEXT.partsTaxonomyById.block
    expect(entry.depthClass).toBe('buried')
    expect(entry.underCar).toBe(false) // keeps this case clear of the lift discount
    const removePart = CONTEXT.economy.energy.actionPoints.removePart
    const slog = CONTEXT.economy.toolHire.slogMultiplier

    const level1 = baseState()
    expect(accessRoute(level1, CONTEXT, entry)).toEqual({ route: 'slog', multiplier: slog })
    expect(accessActionPoints(removePart, entry, level1, CONTEXT)).toBe(6)

    const hiredToday = baseState({ machineHirePaidDayByGroup: { engine: 1 } })
    expect(accessRoute(hiredToday, CONTEXT, entry)).toEqual({ route: 'hired', multiplier: 1 })
    expect(accessActionPoints(removePart, entry, hiredToday, CONTEXT)).toBe(2)

    const owned = baseState({ toolTiers: testToolTiers({ engine: 2 }) })
    expect(accessRoute(owned, CONTEXT, entry)).toEqual({ route: 'own', multiplier: 1 })
    expect(accessActionPoints(removePart, entry, owned, CONTEXT)).toBe(2)
  })
})

describe('accessRoute - a non-buried removal', () => {
  it('always costs the base two points, open at every tool state', () => {
    const entry = CONTEXT.partsTaxonomyById.intake
    expect(entry.depthClass).toBe('bolt-on')
    expect(entry.underCar).toBe(false)
    const removePart = CONTEXT.economy.energy.actionPoints.removePart

    const states = [
      baseState(),
      baseState({ machineHirePaidDayByGroup: { engine: 1 } }),
      baseState({ toolTiers: testToolTiers({ engine: 2 }) }),
    ]
    for (const state of states) {
      expect(accessRoute(state, CONTEXT, entry)).toEqual({ route: 'open', multiplier: 1 })
      expect(accessActionPoints(removePart, entry, state, CONTEXT)).toBe(removePart)
    }
  })
})

describe('accessRoute - a buried install', () => {
  it('costs six points with the rig and eighteen slogged', () => {
    const entry = CONTEXT.partsTaxonomyById.block
    const install = installLaborSlotsFor('block', CONTEXT)
    expect(install).toBe(CONTEXT.economy.energy.energyByClass.buried)
    expect(install).toBe(6)

    const owned = baseState({ toolTiers: testToolTiers({ engine: 2 }) })
    expect(accessActionPoints(install, entry, owned, CONTEXT)).toBe(6)

    const level1 = baseState()
    expect(accessActionPoints(install, entry, level1, CONTEXT)).toBe(18)
  })
})

describe('accessRoute - the lift on an under-car slot', () => {
  it('knocks a point off removal and refit, floored at one, whether the lift is owned or hired today', () => {
    const entry = CONTEXT.partsTaxonomyById.dampers
    expect(entry.underCar).toBe(true)
    expect(entry.depthClass).toBe('bolt-on') // open route: isolates the lift's own effect from the slog multiplier
    const removePart = CONTEXT.economy.energy.actionPoints.removePart
    const refit = installLaborSlotsFor('dampers', CONTEXT)
    const discount = CONTEXT.economy.lift.underCarStepDiscountPoints
    expect(discount).toBe(1)

    const noLift = baseState()
    expect(accessActionPoints(removePart, entry, noLift, CONTEXT)).toBe(removePart)
    expect(accessActionPoints(refit, entry, noLift, CONTEXT)).toBe(refit)

    const owned = baseState({ lift: { owned: true, hirePaidDay: null } })
    expect(accessActionPoints(removePart, entry, owned, CONTEXT)).toBe(removePart - discount)
    expect(accessActionPoints(refit, entry, owned, CONTEXT)).toBe(refit - discount)

    const hiredToday = baseState({ lift: { owned: false, hirePaidDay: 1 } })
    expect(accessActionPoints(removePart, entry, hiredToday, CONTEXT)).toBe(removePart - discount)
    expect(accessActionPoints(refit, entry, hiredToday, CONTEXT)).toBe(refit - discount)
  })
})

describe('accessRoute - the lift and bench work', () => {
  it('never discounts a step worked loose on the bench, even for an under-car part', () => {
    const car = buildCarInstance({
      id: 'car-bench-lift',
      modelId: 'honda-city-e-aa',
      // springs and rims cleared too - dampers' own blockedBy list, so
      // the removal below is not refused for an unrelated reason.
      parts: mintCarParts({ dampers: 'poor', springs: null, rims: null }),
    })
    expect(CONTEXT.partsTaxonomyById.dampers.underCar).toBe(true)

    const state = baseState({ ownedCars: [car] })
    const partInstanceId = car.parts.dampers.installed!.id
    const removed = resolveRemovePart(state, car.id, 'dampers', CONTEXT)
    const benched = resolvePlaceOnBench(removed.state, partInstanceId, CONTEXT)
    const target: RepairTarget = { kind: 'loose', partInstanceId }

    const planWithoutLift = energyPlanFor(benched, CONTEXT, target, 'rebuild')
    const planWithLift = energyPlanFor(
      { ...benched, lift: { owned: true, hirePaidDay: null } },
      CONTEXT,
      target,
      'rebuild',
    )
    expect(planWithoutLift.length).toBeGreaterThan(0)
    expect(planWithLift).toEqual(planWithoutLift)
  })
})

describe('accessRoute - a whole car stripped and rebuilt', () => {
  /** Every slot that can actually come off, priced through the live resolver:
   * the removal at `removePart`, the refit at the slot's own depth class. The
   * shell's fixed carriers are skipped - they are repaired in place and never
   * leave the car. */
  function stripAndRebuild(state: GameState): { teardown: number; rebuild: number } {
    let teardown = 0
    let rebuild = 0
    for (const entry of Object.values(CONTEXT.partsTaxonomyById)) {
      if (!entry.removable) continue
      const removePart = CONTEXT.economy.energy.actionPoints.removePart
      teardown += accessActionPoints(removePart, entry, state, CONTEXT)
      rebuild += accessActionPoints(installLaborSlotsFor(entry.id, CONTEXT), entry, state, CONTEXT)
    }
    return { teardown, rebuild }
  }

  it('by hand is days of work rather than a wall, with the teardown inside a single day', () => {
    const dayPool = CONTEXT.economy.energy.basePoolPoints
    const byHand = stripAndRebuild(baseState())

    // Pulling the whole car apart by hand is a day's work: long, and finishable
    // in one sitting.
    expect(byHand.teardown).toBeLessThanOrEqual(dayPool)
    const handTotal = byHand.teardown + byHand.rebuild
    // Putting it all back is the bulk of it - the strip and rebuild together
    // spread over several days, and never so far that no shop could face it.
    expect(handTotal).toBeGreaterThan(dayPool)
    expect(handTotal).toBeLessThanOrEqual(4 * dayPool)
  })

  it('is worth more than a full day of labour with every rig owned, and still real work', () => {
    const dayPool = CONTEXT.economy.energy.basePoolPoints
    const byHand = stripAndRebuild(baseState())
    const withRigs = stripAndRebuild(
      baseState({
        toolTiers: testToolTiers({
          engine: 2,
          drivetrain: 2,
          suspension: 2,
          wheels: 2,
          body: 2,
          interior: 2,
        }),
      }),
    )

    const handTotal = byHand.teardown + byHand.rebuild
    const rigTotal = withRigs.teardown + withRigs.rebuild
    // The cash-versus-labour trade the whole access model exists to create:
    // the rigs buy back more than a whole day's pool on one car.
    expect(handTotal - rigTotal).toBeGreaterThan(dayPool)
    // And they never make the job free - only the buried slots ever slogged.
    expect(rigTotal).toBeGreaterThan(dayPool)
  })
})

describe('accessRoute - tyre fitting', () => {
  const fittingTyre = PARTS.find(
    (p) => p.carPartId === 'tyres' && p.fitmentClass === 'entry' && p.grade === 'street',
  )!

  function newTyre(id: string): PartInstance {
    return { id, partId: fittingTyre.id, band: 'mint', origin: makeMarketOrigin(1) }
  }

  it('costs two points with the wheels line owned or hired today, six points by hand', () => {
    const scenarios = [
      { label: 'owned', toolTiers: testToolTiers({ wheels: 2 }), hired: {}, expected: 2 },
      { label: 'hired-today', toolTiers: testToolTiers(), hired: { wheels: 1 }, expected: 2 },
      { label: 'by-hand', toolTiers: testToolTiers(), hired: {}, expected: 6 },
    ] as const

    for (const scenario of scenarios) {
      const car = buildCarInstance({
        id: `car-tyre-${scenario.label}`,
        modelId: 'honda-city-e-aa',
      })
      const tyreId = `pi-new-tyre-${scenario.label}`
      const state = baseState({
        ownedCars: [car],
        partInventory: [newTyre(tyreId)],
        toolTiers: scenario.toolTiers,
        machineHirePaidDayByGroup: scenario.hired,
      })
      const off = resolveRemoveAssembly(state, car.id, 'wheelAssembly', CONTEXT)
      const container = off.state.assemblyInventory![0]!
      const pulled = resolveRemoveAssemblyMember(off.state, container.id, 'tyres', CONTEXT)
      const fit = resolveFitAssemblyMember(pulled.state, container.id, 'tyres', tyreId, CONTEXT)
      expect(fit.ok, scenario.label).toBe(true)
      expect(fit.state.energySpentToday - pulled.state.energySpentToday, scenario.label).toBe(
        scenario.expected,
      )
    }
  })
})
