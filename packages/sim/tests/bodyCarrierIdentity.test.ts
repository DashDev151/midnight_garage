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
  type Part,
  type PartInstance,
  type ZoneState,
  type ZoneStates,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  PANEL_ZONE_IDS,
  applyDerivedBodyBands,
  deriveBodyBands,
  refitCarrierZoneStates,
  setZoneCarrierToAtLeastBand,
} from '../src/bodyPipeline'
import { buildSimContext } from '../src/context'
import { completeJob, createJob, installFitGate, resolveRemovePart } from '../src/jobs'
import { makeMarketOrigin } from '../src/provenance'
import { buildCarInstance, mintCarParts, testSpecialty, testToolTiers } from './testFixtures'

/**
 * A body value carrier holds a real SKU (sprint163.md). `panels`, `paint` and
 * `underbody` were the only slots in the game that could hold nothing but the
 * factory item, so a body kit had nowhere to live and 23 of the 100
 * authenticity points could never be lost. What is FITTED there is now a
 * choice; the BAND still derives from zone state and nothing else.
 */

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY, [], FACILITIES)
const MODEL: CarModel = CARS.find((c) => c.id === 'nissan-silvia-s13')!
const FITMENT_CLASS = fitmentClassForTier(MODEL.tier)

const BODY_KIT: Part = PARTS.find(
  (p) => p.carPartId === 'panels' && p.grade === 'sport' && p.fitmentClass === FITMENT_CLASS,
)!
const UNDERGLOW: Part = PARTS.find(
  (p) => p.carPartId === 'underbody' && p.grade === 'street' && p.fitmentClass === FITMENT_CLASS,
)!

function zone(overrides: Partial<ZoneState> = {}): ZoneState {
  return { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false, ...overrides }
}

function zonesWith(overrides: Partial<Record<string, ZoneState>> = {}): ZoneStates {
  const states = {} as Record<string, ZoneState>
  for (const zoneId of [...PANEL_ZONE_IDS, 'chassis']) states[zoneId] = zone()
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
    specialty: testSpecialty(),
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
    toolTiers: testToolTiers({ body: 3 }),
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
    machineHirePaidDayByGroup: {},
  }
}

/** Fits `part` through the real install job the workshop uses, and returns the
 * car it leaves behind. */
function fitThroughJob(car: CarInstance, part: Part): CarInstance {
  const instance = kitInstance(part)
  const state = stateWith(car, [instance])
  const gate = installFitGate(
    state,
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
  const result = completeJob(state, job, CONTEXT)
  expect(result.blockedReason).toBeNull()
  return result.state.ownedCars[0]!
}

describe('a body carrier takes a non-stock SKU', () => {
  it('lets the install gate through on an occupied carrier and refuses an occupied ordinary slot', () => {
    const car = carOnZoneModel()
    const kit = kitInstance(BODY_KIT)
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
    const result = resolveRemovePart(state, car.id, 'panels', CONTEXT)
    expect(result.laborSlotsUsed).toBe(0)
    expect(result.state.partInventory).toEqual([])
    expect(result.state.ownedCars[0]!.parts.panels.installed).not.toBeNull()
  })

  it('holds the fitted kit and re-derives the band from the zones underneath it', () => {
    const fitted = fitThroughJob(carOnZoneModel(), BODY_KIT)
    expect(fitted.parts.panels.installed?.partId).toBe(BODY_KIT.id)
    expect(fitted.parts.panels.installed?.band).toBe(deriveBodyBands(fitted.zoneState!).panels)
  })
})

describe('fitting a kit is a panel swap', () => {
  it('leaves every zone the carrier covers on fresh metal and a bare finish', () => {
    const rough = zonesWith({
      bonnet: zone({ metal: 3, surface: 2, finish: 3 }),
      left: zone({ metal: 2, surface: 1, finish: 2, colour: 'kaido-blue' }),
      chassis: zone({ metal: 1, finish: 2 }),
    })
    const fitted = fitThroughJob(carOnZoneModel(rough), BODY_KIT)
    for (const zoneId of PANEL_ZONE_IDS) {
      const after = fitted.zoneState![zoneId]
      expect(after.metal, zoneId).toBe(0)
      expect(after.surface, zoneId).toBe(0)
      expect(after.finish, zoneId).toBe(3)
      expect(after.colour, zoneId).toBeUndefined()
    }
    // The chassis is the `underbody` carrier's zone, not the `panels`
    // carrier's, so a body kit leaves it exactly as it found it.
    expect(fitted.zoneState!.chassis).toEqual(rough.chassis)
  })

  it('leaves the car owing its paint: panels read mint, paint reads poor', () => {
    const fitted = fitThroughJob(carOnZoneModel(), BODY_KIT)
    expect(fitted.parts.panels.installed?.band).toBe('mint')
    expect(fitted.parts.paint.installed?.band).toBe('poor')
  })

  it('sends an underbody kit to the chassis zone and nowhere else', () => {
    const rough = zonesWith({
      bonnet: zone({ metal: 2, surface: 1, finish: 2 }),
      chassis: zone({ metal: 2, finish: 3 }),
    })
    const fitted = fitThroughJob(carOnZoneModel(rough), UNDERGLOW)
    expect(fitted.parts.underbody.installed?.partId).toBe(UNDERGLOW.id)
    expect(fitted.zoneState!.chassis).toEqual(zone({ finish: 3 }))
    expect(fitted.zoneState!.bonnet).toEqual(rough.bonnet)
  })

  it('refits nothing for a paint SKU, which is a finish rather than a part that arrives', () => {
    const rough = zonesWith({ bonnet: zone({ metal: 2, surface: 1, finish: 3 }) })
    expect(refitCarrierZoneStates(rough, 'paint', 'mint')).toEqual(rough)
  })
})

describe('a dented widebody is a widebody that is dented', () => {
  it('keeps the fitted kit while the damage drives the band down', () => {
    const fitted = fitThroughJob(carOnZoneModel(), BODY_KIT)
    expect(fitted.parts.panels.installed?.band).toBe('mint')

    const dented: CarInstance = {
      ...fitted,
      zoneState: setZoneCarrierToAtLeastBand(fitted.zoneState!, 'panels', 'poor', 'left'),
    }
    const settled = applyDerivedBodyBands(dented, MODEL, CONTEXT)
    expect(settled.parts.panels.installed?.partId).toBe(BODY_KIT.id)
    expect(settled.parts.panels.installed?.band).toBe('poor')
  })

  it('survives every re-derivation, however many times the bands settle', () => {
    let car = fitThroughJob(carOnZoneModel(), BODY_KIT)
    for (let i = 0; i < 5; i++) car = applyDerivedBodyBands(car, MODEL, CONTEXT)
    expect(car.parts.panels.installed?.partId).toBe(BODY_KIT.id)
  })

  it('never un-fits a kit when the zones are repaired back', () => {
    const dented = carOnZoneModel(zonesWith({ left: zone({ metal: 3, surface: 2, finish: 3 }) }))
    const fitted = fitThroughJob(dented, BODY_KIT)
    const repaired = applyDerivedBodyBands({ ...fitted, zoneState: zonesWith() }, MODEL, CONTEXT)
    expect(repaired.parts.panels.installed?.partId).toBe(BODY_KIT.id)
    expect(repaired.parts.panels.installed?.band).toBe('mint')
  })
})
