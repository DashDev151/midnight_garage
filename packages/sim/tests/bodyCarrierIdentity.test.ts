import {
  BUYERS,
  CARS,
  FACILITIES,
  PARTS,
  PARTS_TAXONOMY,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type GameState,
  type MetalZoneState,
  type Part,
  type PartInstance,
  type ZoneState,
  type ZoneStates,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  METAL_ZONE_IDS,
  PANEL_ZONE_IDS,
  TRIM_ZONE_IDS,
  applyDerivedBodyBands,
  deriveBodyBands,
  isMetalZoneState,
  refitCarrierZoneStates,
  setZoneCarrierToAtLeastBand,
} from '../src/bodyPipeline'
import { generateAuctionCarInstance } from '../src/auctions'
import { buildSimContext } from '../src/context'
import {
  completeJob,
  createJob,
  findOrCreateJob,
  hasMachineLineFor,
  installFitGate,
  resolveHireMachineLine,
  resolveRemovePart,
} from '../src/jobs'
import { makeMarketOrigin } from '../src/provenance'
import { createRng } from '../src/rng'
import {
  buildCarInstance,
  mintCarParts,
  testSceneStanding,
  testToolShopsOwned,
  testToolTiers,
} from './testFixtures'

/**
 * A body value carrier holds a real SKU. `bodywork` and `paint` are the two
 * slots in the game whose BAND is derived from `zoneState` rather than
 * carried directly; what is FITTED there is a real choice, so a body kit
 * reads as modified. `chassis` sits beside them in the body group and is
 * also never removable, but its band is a normal per-part one - only its
 * install is gated the same way, not its band.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)
const MODEL: CarModel = CARS.find((c) => c.id === 'nissan-silvia-s13')!
const FITMENT_CLASS = fitmentClassForTier(MODEL.tier)

// `bodywork` no longer has a whole-car aftermarket SKU at all - every non-stock
// entry now carries a `zoneId` (a bonnet, a bumper, a skirt), and there is no
// single kit left that replaces the whole slot through the normal install-job
// path. `paint` is the one derived carrier whose whole-car ladder is
// untouched by the zone rework, so it is what exercises "install a non-stock
// SKU onto a `removable: false` slot through the real job pipeline" below;
// `refitCarrierZoneStates('bodywork', ...)` itself is still tested directly,
// as the pure function it is.
const PAINT_KIT: Part = PARTS.find(
  (p) => p.carPartId === 'paint' && p.grade === 'sport' && p.fitmentClass === FITMENT_CLASS,
)!
const CHASSIS_KIT: Part = PARTS.find(
  (p) => p.carPartId === 'chassis' && p.grade === 'street' && p.fitmentClass === FITMENT_CLASS,
)!

function metalZone(overrides: Partial<MetalZoneState> = {}): MetalZoneState {
  return { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false, ...overrides }
}

function trimZone(overrides: Partial<ZoneState> = {}): ZoneState {
  return { finish: 0, panelMissing: false, primed: false, ...overrides }
}

function zonesWith(overrides: Partial<Record<string, ZoneState>> = {}): ZoneStates {
  const states = {} as Record<string, ZoneState>
  for (const zoneId of METAL_ZONE_IDS) states[zoneId] = metalZone()
  for (const zoneId of TRIM_ZONE_IDS) states[zoneId] = trimZone()
  return { ...states, ...overrides } as ZoneStates
}

function carOnZoneModel(zoneState: ZoneStates = zonesWith()): CarInstance {
  const car = buildCarInstance({
    id: 'car-0001',
    modelId: MODEL.id,
    year: 1991,
    parts: mintCarParts(),
    zoneState,
  })
  return applyDerivedBodyBands(car, MODEL, CONTEXT)
}

function kitInstance(part: Part, id = 'pi-kit'): PartInstance {
  return { id, partId: part.id, band: 'mint', origin: makeMarketOrigin(1) }
}

function stateWith(car: CarInstance, inventory: PartInstance[]): GameState {
  return {
    day: 1,
    seed: 42,
    cashYen: 1_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    sceneStanding: testSceneStanding(),
    serviceJobOffers: [],
    activeServiceJobs: [],
    ownedCars: [car],
    partInventory: inventory,
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
    toolTiers: testToolTiers({ body: 2 }),
    pendingPartOrders: [],
    cartPartIds: [],
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    toolShopsOwned: testToolShopsOwned('body'),
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    workbenchPartId: null,
    machinePartId: null,
    storyMissions: [],
    machineHirePaidDayByGroup: {},
  }
}

/** Fits `part` through the real install job the workshop uses, and returns the
 * car it leaves behind. */
function fitThroughJob(
  car: CarInstance,
  part: Part,
  state: GameState = stateWith(car, []),
): CarInstance {
  const instance = kitInstance(part)
  const withPart: GameState = { ...state, partInventory: [...state.partInventory, instance] }
  const gate = installFitGate(
    withPart,
    {
      carInstanceId: car.id,
      kind: 'install-part',
      componentId: 'body',
      partInstanceId: instance.id,
      carPartId: part.carPartId,
      laborSlotsRequired: 0,
    },
    CONTEXT,
  )
  expect(gate.ok, `installFitGate refused ${part.id}`).toBe(true)
  const job = createJob(
    {
      carInstanceId: car.id,
      kind: 'install-part',
      componentId: 'body',
      partInstanceId: instance.id,
      carPartId: part.carPartId,
      laborSlotsRequired: 0,
    },
    'job-1',
  )
  const result = completeJob(withPart, job, CONTEXT)
  expect(result.blockedReason).toBeNull()
  return result.state.ownedCars[0]!
}

describe('a body carrier takes a non-stock SKU', () => {
  it('lets the install gate through on an occupied carrier and refuses an occupied ordinary slot', () => {
    const car = carOnZoneModel()
    const kit = kitInstance(PAINT_KIT)
    const coilovers = PARTS.find(
      (p) => p.carPartId === 'dampers' && p.grade === 'street' && p.fitmentClass === FITMENT_CLASS,
    )!
    const damper = kitInstance(coilovers, 'pi-damper')
    const state = stateWith(car, [kit, damper])
    const specFor = (instance: PartInstance, componentId: 'body' | 'suspension') => ({
      carInstanceId: car.id,
      kind: 'install-part' as const,
      componentId,
      partInstanceId: instance.id,
      laborSlotsRequired: 0,
    })
    expect(installFitGate(state, specFor(kit, 'body'), CONTEXT).ok).toBe(true)
    // `dampers` starts filled with its stock part, and an ordinary slot still
    // has to be emptied before anything goes into it.
    expect(installFitGate(state, specFor(damper, 'suspension'), CONTEXT).ok).toBe(false)
  })

  it('keeps the carrier unremovable, so the shell never lands in the parts bin', () => {
    const car = carOnZoneModel()
    const state = stateWith(car, [])
    const result = resolveRemovePart(state, car.id, 'bodywork', CONTEXT)
    expect(result.laborSlotsUsed).toBe(0)
    expect(result.state.partInventory).toEqual([])
    expect(result.state.ownedCars[0]!.parts.bodywork.installed).not.toBeNull()
  })

  it('holds the fitted kit and re-derives the band from the zones underneath it', () => {
    const fitted = fitThroughJob(carOnZoneModel(), PAINT_KIT)
    expect(fitted.parts.paint.installed?.partId).toBe(PAINT_KIT.id)
    expect(fitted.parts.paint.installed?.band).toBe(deriveBodyBands(fitted.zoneState!).paint)
  })
})

describe('the bodywork carrier is never filled with a single-zone panel', () => {
  it('offers no zone panel as a whole-slot aftermarket entry in any fitment class', () => {
    for (const byCarPartId of Object.values(CONTEXT.aftermarketPartByCarPartId)) {
      for (const [carPartId, byGrade] of Object.entries(byCarPartId)) {
        for (const part of Object.values(byGrade)) {
          expect(part.zoneId, `${carPartId} -> ${part.id}`).toBeUndefined()
        }
      }
    }
  })

  it('never generates a car wearing a zone panel as its bodyshell', () => {
    for (const model of CARS) {
      for (let seed = 1; seed <= 25; seed++) {
        const car = generateAuctionCarInstance(model, `body-${seed}`, createRng(seed), CONTEXT)
        const fitted = car.parts.bodywork.installed
        if (!fitted) continue
        const part = CONTEXT.partsById[fitted.partId]
        expect(part?.zoneId, `${model.id} seed ${seed}: ${fitted.partId}`).toBeUndefined()
      }
    }
  })
})

describe('refitCarrierZoneStates: fitting a bodywork kit is a fresh panel everywhere', () => {
  it('leaves every one of the nine zones the carrier covers on a fresh, bare finish', () => {
    const rough = zonesWith({
      bonnet: metalZone({ metal: 3, surface: 2, finish: 3 }),
      'left-front': metalZone({ metal: 2, surface: 1, finish: 2, colour: 'kaido-blue' }),
      skirts: trimZone({ finish: 2, colour: 'kaido-blue' }),
    })
    const refitted = refitCarrierZoneStates(rough, 'bodywork', 'mint')
    for (const zoneId of PANEL_ZONE_IDS) {
      const after = refitted[zoneId]
      expect(after.finish, zoneId).toBe(3)
      expect(after.panelMissing, zoneId).toBe(false)
      expect(after.colour, zoneId).toBeUndefined()
      if (isMetalZoneState(after)) {
        expect(after.metal, zoneId).toBe(0)
        expect(after.surface, zoneId).toBe(0)
      }
    }
  })

  it('refits nothing for a paint SKU, which is a finish rather than a part that arrives', () => {
    const rough = zonesWith({ bonnet: metalZone({ metal: 2, surface: 1, finish: 3 }) })
    expect(refitCarrierZoneStates(rough, 'paint', 'mint')).toEqual(rough)
  })
})

describe('a resprayed car stays resprayed while the shell around it is dented', () => {
  it('keeps the fitted paint kit while the damage drives its own band down', () => {
    const fitted = fitThroughJob(carOnZoneModel(), PAINT_KIT)
    expect(fitted.parts.paint.installed?.band).toBe('mint')

    const dented: CarInstance = {
      ...fitted,
      zoneState: setZoneCarrierToAtLeastBand(fitted.zoneState!, 'paint', 'poor', 'left-front'),
    }
    const settled = applyDerivedBodyBands(dented, MODEL, CONTEXT)
    expect(settled.parts.paint.installed?.partId).toBe(PAINT_KIT.id)
    expect(settled.parts.paint.installed?.band).toBe('poor')
  })

  it('survives every re-derivation, however many times the bands settle', () => {
    let car = fitThroughJob(carOnZoneModel(), PAINT_KIT)
    for (let i = 0; i < 5; i++) car = applyDerivedBodyBands(car, MODEL, CONTEXT)
    expect(car.parts.paint.installed?.partId).toBe(PAINT_KIT.id)
  })

  it('never un-fits the kit when the zones are repaired back', () => {
    const dented = carOnZoneModel(
      zonesWith({ 'left-front': metalZone({ metal: 3, surface: 2, finish: 3 }) }),
    )
    const fitted = fitThroughJob(dented, PAINT_KIT)
    const repaired = applyDerivedBodyBands({ ...fitted, zoneState: zonesWith() }, MODEL, CONTEXT)
    expect(repaired.parts.paint.installed?.partId).toBe(PAINT_KIT.id)
    expect(repaired.parts.paint.installed?.band).toBe('mint')
  })
})

/**
 * `chassis` is a normal per-part carrier, not zone-derived, but it shares
 * `bodywork`'s `removable: false` status and its group's signature-slot
 * machine gate: fitting a stiffening kit is an install like any other, priced
 * at the machine-less labour rate without the body line and at base labour
 * with it - the same `machineLaborMultiplier` mechanism every gated slot
 * uses, reused rather than a second gate built for this one slot.
 */
describe('the chassis stiffening kits price against the body line', () => {
  it('installs by hand without the body line, sized at the machine-less labour rate on job creation', () => {
    const car = carOnZoneModel()
    const state = stateWith(car, [])
    const gated: GameState = { ...state, toolTiers: testToolTiers(), toolShopsOwned: [] } // body tier 1, nothing hired
    const kit = kitInstance(CHASSIS_KIT)
    const withKit: GameState = { ...gated, partInventory: [kit] }
    const multiplier = CONTEXT.economy.machineShopAssist.machinelessLaborMultiplier
    const spec = {
      carInstanceId: car.id,
      kind: 'install-part' as const,
      componentId: 'body' as const,
      partInstanceId: kit.id,
      carPartId: 'chassis' as const,
      laborSlotsRequired: 2,
    }
    const gate = installFitGate(withKit, spec, CONTEXT)
    expect(gate.ok).toBe(true)
    // The machine gate is a rate at creation, never a completion wall: the
    // job is created at multiplied labour and completes normally.
    const created = findOrCreateJob(withKit, spec, CONTEXT)
    expect(created.job).not.toBeNull()
    expect(created.job!.laborSlotsRequired).toBe(spec.laborSlotsRequired * multiplier)
    const result = completeJob(created.state, created.job!, CONTEXT)
    expect(result.blockedReason).toBeNull()
    expect(result.state.ownedCars[0]!.parts.chassis.installed?.partId).toBe(CHASSIS_KIT.id)
  })

  it('installs once the body line is hired for the day', () => {
    const car = carOnZoneModel()
    const state = stateWith(car, [])
    const untiered: GameState = { ...state, toolTiers: testToolTiers(), toolShopsOwned: [] }
    const hired = resolveHireMachineLine(untiered, 'body', CONTEXT)
    expect(hasMachineLineFor('body', hired.state, CONTEXT)).toBe(true)
    const fitted = fitThroughJob(car, CHASSIS_KIT, hired.state)
    expect(fitted.parts.chassis.installed?.partId).toBe(CHASSIS_KIT.id)
  })

  it('installs freely once the body line is owned outright', () => {
    // `carOnZoneModel`'s state owns the shop covering the body line by
    // default, so the gate never fires here at all.
    const fitted = fitThroughJob(carOnZoneModel(), CHASSIS_KIT)
    expect(fitted.parts.chassis.installed?.partId).toBe(CHASSIS_KIT.id)
  })
})
