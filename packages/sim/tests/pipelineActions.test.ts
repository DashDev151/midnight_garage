import {
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type CarInstance,
  type GameState,
  type PartInstance,
  type ZoneState,
  type ZoneStates,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { METAL_ZONE_IDS, TRIM_ZONE_IDS, zonePanelPart } from '../src/bodyPipeline'
import { buildSimContext } from '../src/context'
import { isFreeInstallRefit } from '../src/jobs'
import {
  resolvePipelineInstallPanelAction,
  resolvePipelinePaintAction,
  resolvePipelineRemovePanelAction,
  resolvePipelineStageAction,
} from '../src/pipelineActions'
import {
  buildCarInstance,
  groupCarParts,
  mintCarParts,
  testSceneStanding,
  testToolShopsOwned,
  testToolTiers,
} from './testFixtures'

// Real CARS/PARTS: findOrCreateJob validates install-part fit against
// the real catalog, so an install spec needs both to resolve.
const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)

/** A mixed-rung shop (body and interior at tier 2) with the machine shop
 * owned, so the plans these tests derive exercise real level-sized labour
 * rather than just the tier-1 floor. */
const TOOL_TIERS = testToolTiers({ body: 2, interior: 2 })
const TOOL_SHOPS_OWNED = testToolShopsOwned('engine')

const car: CarInstance = buildCarInstance({
  id: 'car-0001',
  modelId: 'honda-city-e-aa',
  year: 1984,
  mileageKm: 100_000,
  parts: {
    ...groupCarParts({ body: 'poor', engine: 'worn', suspension: 'worn', interior: 'poor' }),
    dampers: { installed: null },
  },
})

// `car` (honda-city-e-aa) is 'entry' tier - the fitment-class gate
// refuses a mismatched-class spare part.
const sparePart: PartInstance = {
  id: 'pi-0001',
  partId: 'shitbox-tanuki-street-coilovers',
  band: 'mint',
  origin: { kind: 'market', day: 1 },
}

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
    ownedCars: [car],
    partInventory: [sparePart],
    staff: [],
    staffAds: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [car.id],
    parkingCarIds: [],
    forecourtBayCount: 2,
    forecourtCarIds: [null, null],
    graceParkingCarId: null,
    energySpentToday: 0,
    toolTiers: TOOL_TIERS,
    pendingPartOrders: [],
    cartPartIds: [],
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    toolShopsOwned: TOOL_SHOPS_OWNED,
    machineListing: null,
    nextMachineListingDay: null,
    serviceJobLedgers: {},
    inspectionVisit: null,
    workbenchPartId: null,
    machinePartId: null,
    storyMissions: [],
    ...overrides,
  }
}

/** All nine zones clean (mint, unprimed, present) - the shared starting point
 * every zoneState fixture below overrides from. */
function cleanZoneStates(overrides: Partial<Record<string, ZoneState>> = {}): ZoneStates {
  const states = {} as Record<string, ZoneState>
  for (const zoneId of METAL_ZONE_IDS) {
    states[zoneId] = { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false }
  }
  for (const zoneId of TRIM_ZONE_IDS) {
    states[zoneId] = { finish: 0, panelMissing: false, primed: false }
  }
  return { ...states, ...overrides } as ZoneStates
}

describe('resolvePipelineRemovePanelAction / resolvePipelineInstallPanelAction', () => {
  it('removing then installing harvests the old panel and fits the new one, re-projecting the derived bodywork band', () => {
    // Every zone starts clean except a damaged bonnet (metal severity 2, the
    // 'worn' rung) - the pre-removal state the old panel is harvested at.
    const zoneState = cleanZoneStates({
      bonnet: { metal: 2, surface: 0, finish: 0, panelMissing: false, primed: false },
    })
    // honda-city-e-aa is 'entry' tier, so the fitting zone-panel catalogue
    // SKU is the one `zonePanelPart` resolves for (bonnet, entry).
    const bonnetPanelPart = zonePanelPart(CONTEXT.partsById, 'bonnet', 'entry')!
    const zoneCar: CarInstance = buildCarInstance({
      id: 'car-0002',
      modelId: 'honda-city-e-aa',
      year: 1984,
      mileageKm: 100_000,
      // Pre-work bodywork band starts deliberately wrong ('poor') so the
      // post-resolve assertion proves the derived band was re-projected from
      // zone state, not merely left at whatever the fixture set.
      parts: mintCarParts({ bodywork: 'poor' }),
      zoneState,
    })
    const newBonnetPanel: PartInstance = {
      id: 'pi-panel-new-bonnet',
      partId: bonnetPanelPart.id,
      band: 'mint',
      origin: { kind: 'market', day: 1 },
    }
    const state = baseState({
      ownedCars: [zoneCar],
      serviceBayCarIds: [zoneCar.id],
      partInventory: [newBonnetPanel],
      bodyBayCarId: zoneCar.id,
    })
    const removed = resolvePipelineRemovePanelAction(
      state,
      zoneCar.id,
      { kind: 'pipeline-remove-panel', zoneId: 'bonnet' },
      CONTEXT,
      10,
    )
    const result = resolvePipelineInstallPanelAction(
      removed.state,
      zoneCar.id,
      { kind: 'pipeline-install-panel', zoneId: 'bonnet', partInstanceId: newBonnetPanel.id },
      CONTEXT,
      10,
    )

    // The new panel is consumed from inventory...
    expect(result.state.partInventory.some((p) => p.id === newBonnetPanel.id)).toBe(false)

    // ...and the OLD panel is harvested into inventory in its place, at the
    // band its pre-removal metal severity (2) maps to ('worn'), addressing
    // the bodywork slot for the bonnet zone, with a car-kind origin.
    const harvested = result.state.partInventory.find((p) => p.partId === bonnetPanelPart.id)
    expect(harvested).toBeDefined()
    expect(harvested?.band).toBe('worn')
    expect(harvested?.origin.kind).toBe('car')
    const harvestedCatalogPart = CONTEXT.partsById[harvested!.partId]
    expect(harvestedCatalogPart?.zoneId).toBe('bonnet')
    expect(harvestedCatalogPart?.carPartId).toBe('bodywork')

    // The zone's metal clears to the installed mint panel's band (severity
    // 0), and the derived bodywork band re-projects from a now-clean bonnet
    // plus the already-clean remaining zones.
    expect(result.state.ownedCars[0]?.zoneState?.bonnet.metal).toBe(0)
    expect(result.state.ownedCars[0]?.parts.bodywork.installed?.band).toBe('mint')
  })

  it('a panel removed and refitted unchanged keeps its paint; a bought panel installs bare (Sprint 202)', () => {
    // The bonnet starts painted and straight: finish 1 (fine paint), a colour,
    // sound metal. Pulling it and putting the SAME instance back must restore
    // exactly that paint state; only new or repaired panels owe a respray.
    const zoneState = cleanZoneStates({
      bonnet: {
        metal: 0,
        surface: 0,
        finish: 1,
        panelMissing: false,
        primed: false,
        colour: 'red',
      },
    })
    const zoneCar: CarInstance = buildCarInstance({
      id: 'car-0002',
      modelId: 'honda-city-e-aa',
      year: 1984,
      mileageKm: 100_000,
      parts: mintCarParts(),
      zoneState,
    })
    const state = baseState({
      ownedCars: [zoneCar],
      serviceBayCarIds: [zoneCar.id],
      bodyBayCarId: zoneCar.id,
    })
    const removed = resolvePipelineRemovePanelAction(
      state,
      zoneCar.id,
      { kind: 'pipeline-remove-panel', zoneId: 'bonnet' },
      CONTEXT,
      10,
    )
    const harvested = removed.state.partInventory.find((p) => p.origin.kind === 'car')
    expect(harvested?.panelState).toEqual({ finish: 1, primed: false, colour: 'red', surface: 0 })

    const refitted = resolvePipelineInstallPanelAction(
      removed.state,
      zoneCar.id,
      { kind: 'pipeline-install-panel', zoneId: 'bonnet', partInstanceId: harvested!.id },
      CONTEXT,
      100,
    )
    const bonnet = refitted.state.ownedCars[0]?.zoneState?.bonnet
    expect(bonnet?.finish).toBe(1)
    expect(bonnet?.colour).toBe('red')
    expect(bonnet?.primed).toBe(false)
    // The paint carrier does not read poor: the refit restored the finish.
    expect(refitted.state.ownedCars[0]?.parts.paint.installed?.band).not.toBe('poor')
  })

  it('installing into an already-empty zone needs no remove step first', () => {
    const zoneState = cleanZoneStates({
      boot: { metal: 0, surface: 0, finish: 0, panelMissing: true, primed: false },
    })
    const bootPanelPart = zonePanelPart(CONTEXT.partsById, 'boot', 'entry')!
    const zoneCar: CarInstance = buildCarInstance({
      id: 'car-0003',
      modelId: 'honda-city-e-aa',
      year: 1984,
      mileageKm: 100_000,
      parts: mintCarParts({ bodywork: 'scrap' }),
      zoneState,
    })
    const newBootPanel: PartInstance = {
      id: 'pi-panel-new-boot',
      partId: bootPanelPart.id,
      band: 'mint',
      origin: { kind: 'market', day: 1 },
    }
    const state = baseState({
      ownedCars: [zoneCar],
      serviceBayCarIds: [zoneCar.id],
      partInventory: [newBootPanel],
      bodyBayCarId: zoneCar.id,
    })
    const result = resolvePipelineInstallPanelAction(
      state,
      zoneCar.id,
      { kind: 'pipeline-install-panel', zoneId: 'boot', partInstanceId: newBootPanel.id },
      CONTEXT,
      10,
    )
    expect(result.state.partInventory.some((p) => p.id === newBootPanel.id)).toBe(false)
    // Nothing was there to harvest, so nothing new landed in inventory.
    expect(result.state.partInventory).toHaveLength(0)
    expect(result.state.ownedCars[0]?.zoneState?.boot.panelMissing).toBe(false)
    expect(result.state.ownedCars[0]?.zoneState?.boot.metal).toBe(0)
    expect(result.state.ownedCars[0]?.parts.bodywork.installed?.band).toBe('mint')
  })

  it('a remove on an already-missing zone, or an install on an already-occupied one, is a silent no-op', () => {
    const zoneState = cleanZoneStates({
      boot: { metal: 0, surface: 0, finish: 0, panelMissing: true, primed: false },
    })
    const bonnetPanelPart = zonePanelPart(CONTEXT.partsById, 'bonnet', 'entry')!
    const zoneCar: CarInstance = buildCarInstance({
      id: 'car-0004',
      modelId: 'honda-city-e-aa',
      year: 1984,
      mileageKm: 100_000,
      parts: mintCarParts(),
      zoneState,
    })
    const sparePanel: PartInstance = {
      id: 'pi-panel-spare',
      partId: bonnetPanelPart.id,
      band: 'mint',
      origin: { kind: 'market', day: 1 },
    }
    const state = baseState({
      ownedCars: [zoneCar],
      serviceBayCarIds: [zoneCar.id],
      partInventory: [sparePanel],
      bodyBayCarId: zoneCar.id,
    })
    const removedNoop = resolvePipelineRemovePanelAction(
      state,
      zoneCar.id,
      { kind: 'pipeline-remove-panel', zoneId: 'boot' }, // already missing
      CONTEXT,
      10,
    )
    const result = resolvePipelineInstallPanelAction(
      removedNoop.state,
      zoneCar.id,
      { kind: 'pipeline-install-panel', zoneId: 'bonnet', partInstanceId: sparePanel.id }, // already occupied
      CONTEXT,
      10,
    )
    // Neither action moved anything: the spare panel is still sitting loose,
    // the bonnet's original panel is still fitted, and boot is still missing.
    expect(result.state.partInventory).toEqual([sparePanel])
    expect(result.state.ownedCars[0]?.zoneState?.boot.panelMissing).toBe(true)
    expect(result.state.ownedCars[0]?.zoneState?.bonnet.metal).toBe(0)
  })

  /**
   * The nine zones are an install path like any other, and until now the only
   * one with no capability gate at all - a race over-fender could go on a
   * shop with nothing but hand tools.
   */
  it('refuses a race panel while the body line is at rung 1, and says why', () => {
    const racePanel = zonePanelPart(CONTEXT.partsById, 'boot', 'entry', 'race')!
    const zoneCar: CarInstance = buildCarInstance({
      id: 'car-0005',
      modelId: 'honda-city-e-aa',
      parts: mintCarParts(),
      zoneState: cleanZoneStates({
        boot: { metal: 0, surface: 0, finish: 0, panelMissing: true, primed: false },
      }),
    })
    const panelInstance: PartInstance = {
      id: 'pi-race-boot',
      partId: racePanel.id,
      band: 'mint',
      origin: { kind: 'market', day: 1 },
    }
    const action = {
      kind: 'pipeline-install-panel' as const,
      zoneId: 'boot' as const,
      partInstanceId: panelInstance.id,
    }
    const blocked = resolvePipelineInstallPanelAction(
      baseState({
        ownedCars: [zoneCar],
        serviceBayCarIds: [zoneCar.id],
        partInventory: [panelInstance],
        toolTiers: testToolTiers({ body: 1 }),
        bodyBayCarId: zoneCar.id,
      }),
      zoneCar.id,
      action,
      CONTEXT,
      10,
    )
    expect(blocked.log).toEqual([
      {
        type: 'job-blocked',
        jobId: `pipeline-${zoneCar.id}-install-panel-boot`,
        reason: 'tool-tier',
      },
    ])
    expect(blocked.state.ownedCars[0]?.zoneState?.boot.panelMissing).toBe(true)
    expect(blocked.state.partInventory).toEqual([panelInstance])

    const allowed = resolvePipelineInstallPanelAction(
      baseState({
        ownedCars: [zoneCar],
        serviceBayCarIds: [zoneCar.id],
        partInventory: [panelInstance],
        toolTiers: testToolTiers({ body: 2 }),
        bodyBayCarId: zoneCar.id,
      }),
      zoneCar.id,
      action,
      CONTEXT,
      10,
    )
    expect(allowed.log).toEqual([])
    expect(allowed.state.ownedCars[0]?.zoneState?.boot.panelMissing).toBe(false)
    expect(allowed.state.ownedCars[0]?.zoneState?.boot.panelGrade).toBe('race')
  })

  /** Panel bolts are hand work (sprint208.md task 5): no machine multiplier
   * survives on the install path, machine-less or not - the flat bolt-on
   * class figure either way, down from the old 9 (3 x the machine-less
   * multiplier) to 3. */
  it('charges the flat bolt-on figure regardless of the body line - panel bolts are hand work', () => {
    const bootPanelPart = zonePanelPart(CONTEXT.partsById, 'boot', 'entry')!
    const zoneCar: CarInstance = buildCarInstance({
      id: 'car-0006',
      modelId: 'honda-city-e-aa',
      year: 1984,
      mileageKm: 100_000,
      parts: mintCarParts(),
      zoneState: cleanZoneStates({
        boot: { metal: 0, surface: 0, finish: 0, panelMissing: true, primed: false },
      }),
    })
    const newBootPanel: PartInstance = {
      id: 'pi-panel-flat-boot',
      partId: bootPanelPart.id,
      band: 'mint',
      origin: { kind: 'market', day: 1 },
    }
    const action = {
      kind: 'pipeline-install-panel' as const,
      zoneId: 'boot' as const,
      partInstanceId: newBootPanel.id,
    }
    const boltOnPoints = CONTEXT.economy.energy.energyByClass['bolt-on']
    expect(boltOnPoints).toBe(3)

    const machineless = resolvePipelineInstallPanelAction(
      baseState({
        ownedCars: [zoneCar],
        serviceBayCarIds: [zoneCar.id],
        partInventory: [newBootPanel],
        bodyBayCarId: zoneCar.id,
        toolTiers: testToolTiers({ body: 1 }),
      }),
      zoneCar.id,
      action,
      CONTEXT,
      10,
    )
    expect(machineless.laborSlotsUsed).toBe(boltOnPoints)

    const withLine = resolvePipelineInstallPanelAction(
      baseState({
        ownedCars: [zoneCar],
        serviceBayCarIds: [zoneCar.id],
        partInventory: [newBootPanel],
        bodyBayCarId: zoneCar.id,
        toolTiers: testToolTiers({ body: 2 }),
      }),
      zoneCar.id,
      action,
      CONTEXT,
      10,
    )
    expect(withLine.laborSlotsUsed).toBe(boltOnPoints)
  })
})

/**
 * The body bay gate (sprint208.md): every pipeline action refuses off the
 * bay's own car, and weld - the one stage still priced at a machine rate -
 * charges the machine-less multiplier by hand and drops to base rate once
 * the body line is owned or hired.
 */
describe('the body bay gate, and the weld rate', () => {
  function weldCar(): CarInstance {
    return buildCarInstance({
      id: 'car-weld-0001',
      modelId: 'honda-city-e-aa',
      year: 1984,
      mileageKm: 100_000,
      parts: mintCarParts(),
      zoneState: cleanZoneStates({
        bonnet: { metal: 3, surface: 0, finish: 0, panelMissing: false, primed: false },
      }),
    })
  }

  it('refuses a zone stage off the body bay, naming the reason, and runs it once the car is moved in', () => {
    const zoneCar = weldCar()
    const offBay = resolvePipelineStageAction(
      baseState({ ownedCars: [zoneCar], serviceBayCarIds: [zoneCar.id] }),
      zoneCar.id,
      { kind: 'pipeline-stage', zoneId: 'bonnet', stage: 'weld' },
      CONTEXT,
      100,
    )
    expect(offBay.log).toEqual([
      {
        type: 'job-blocked',
        jobId: `pipeline-${zoneCar.id}-weld-bonnet`,
        reason: 'not-in-body-bay',
      },
    ])
    expect(offBay.state.ownedCars[0]?.zoneState?.bonnet.metal).toBe(3)

    const inBay = resolvePipelineStageAction(
      baseState({
        ownedCars: [zoneCar],
        serviceBayCarIds: [zoneCar.id],
        bodyBayCarId: zoneCar.id,
      }),
      zoneCar.id,
      { kind: 'pipeline-stage', zoneId: 'bonnet', stage: 'weld' },
      CONTEXT,
      100,
    )
    expect(inBay.state.ownedCars[0]?.zoneState?.bonnet.metal).toBe(0)
  })

  it('welds day one by hand at the machine-less multiplier (3x), and at base rate once the body line is owned', () => {
    const zoneCar = weldCar()
    const basePoints = CONTEXT.economy.energy.bodyStagePoints.weld
    expect(CONTEXT.economy.machineShopAssist.machinelessLaborMultiplier).toBe(3)

    const byHand = resolvePipelineStageAction(
      baseState({
        ownedCars: [zoneCar],
        serviceBayCarIds: [zoneCar.id],
        bodyBayCarId: zoneCar.id,
        toolTiers: testToolTiers({ body: 1 }),
      }),
      zoneCar.id,
      { kind: 'pipeline-stage', zoneId: 'bonnet', stage: 'weld' },
      CONTEXT,
      100,
    )
    expect(byHand.laborSlotsUsed).toBe(basePoints * 3)
    expect(byHand.state.ownedCars[0]?.zoneState?.bonnet.metal).toBe(0)

    const withLine = resolvePipelineStageAction(
      baseState({
        ownedCars: [zoneCar],
        serviceBayCarIds: [zoneCar.id],
        bodyBayCarId: zoneCar.id,
        toolTiers: testToolTiers({ body: 2 }),
      }),
      zoneCar.id,
      { kind: 'pipeline-stage', zoneId: 'bonnet', stage: 'weld' },
      CONTEXT,
      100,
    )
    expect(withLine.laborSlotsUsed).toBe(basePoints)
    expect(withLine.state.ownedCars[0]?.zoneState?.bonnet.metal).toBe(0)
  })
})

describe('resolvePipelinePaintAction', () => {
  const primed = { finish: 3, panelMissing: false, primed: true }

  function paintCar(): CarInstance {
    return buildCarInstance({
      id: 'car-paint-0001',
      modelId: 'honda-city-e-aa',
      year: 1984,
      mileageKm: 100_000,
      factoryColour: 'white',
      // honda-city-e-aa is 'entry' tier - the stock paint SKU that fitment
      // class resolves to.
      parts: mintCarParts({
        paint: {
          id: 'p-paint',
          partId: CONTEXT.stockPartByCarPartId.entry.paint!.id,
          band: 'fine',
          origin: { kind: 'market', day: 1 },
        },
      }),
      zoneState: cleanZoneStates({
        bonnet: { metal: 0, surface: 0, ...primed },
        boot: { metal: 0, surface: 0, ...primed },
        'front-bumper': primed,
      }),
    })
  }

  it('a sport-grade respray draws one use of the metallic tin in that colour, spends no cash, and swaps in the sport paint SKU', () => {
    const zoneCar = paintCar()
    const state = baseState({
      ownedCars: [zoneCar],
      serviceBayCarIds: [zoneCar.id],
      // One use of metallic kaido-blue on the shelf - exactly enough for
      // this one zone.
      consumableStock: { 'paint:metallic:kaido-blue': 1 },
      bodyBayCarId: zoneCar.id,
    })
    const result = resolvePipelinePaintAction(
      state,
      zoneCar.id,
      { kind: 'pipeline-paint', zoneId: 'bonnet', colour: 'kaido-blue', grade: 'sport' },
      CONTEXT,
      10,
    )
    // The tin was already paid for when it was bought - resolving the
    // stage spends stock, not cash.
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.state.consumableStock?.['paint:metallic:kaido-blue']).toBe(0)
    expect(result.state.ownedCars[0]?.zoneState?.bonnet.colour).toBe('kaido-blue')
    expect(result.state.ownedCars[0]?.zoneState?.bonnet.primed).toBe(false)
    const installed = result.state.ownedCars[0]?.parts.paint.installed
    expect(installed?.partId).toBe(CONTEXT.aftermarketPartByCarPartId.entry.paint!.sport!.id)
  })

  it('a stock-grade job in the factory colour draws the solid tin in that colour and reads back as the stock SKU', () => {
    const zoneCar = paintCar()
    const state = baseState({
      ownedCars: [zoneCar],
      serviceBayCarIds: [zoneCar.id],
      consumableStock: { 'paint:solid:white': 1 },
      bodyBayCarId: zoneCar.id,
    })
    const result = resolvePipelinePaintAction(
      state,
      zoneCar.id,
      { kind: 'pipeline-paint', zoneId: 'boot', colour: 'white', grade: 'stock' },
      CONTEXT,
      10,
    )
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.state.consumableStock?.['paint:solid:white']).toBe(0)
    expect(result.state.ownedCars[0]?.zoneState?.boot.colour).toBe('white')
    const installed = result.state.ownedCars[0]?.parts.paint.installed
    expect(installed?.partId).toBe(CONTEXT.stockPartByCarPartId.entry.paint!.id)
  })

  it('a stock-grade job in any other colour is refused outright: no spend, no zone change - even on a trim zone', () => {
    const zoneCar = paintCar()
    const state = baseState({
      ownedCars: [zoneCar],
      serviceBayCarIds: [zoneCar.id],
      // Refused on colour before stock is ever read, so the shelf is
      // deliberately left bare here.
      bodyBayCarId: zoneCar.id,
    })
    const result = resolvePipelinePaintAction(
      state,
      zoneCar.id,
      { kind: 'pipeline-paint', zoneId: 'front-bumper', colour: 'kaido-blue', grade: 'stock' },
      CONTEXT,
      10,
    )
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.state.ownedCars[0]?.zoneState?.['front-bumper']).toEqual(primed)
    expect(result.state.ownedCars[0]?.parts.paint.installed?.partId).toBe(
      CONTEXT.stockPartByCarPartId.entry.paint!.id,
    )
  })

  it('refuses a paint stage with no tin of that colour on the shelf, spending nothing and changing nothing', () => {
    const zoneCar = paintCar()
    const state = baseState({
      ownedCars: [zoneCar],
      serviceBayCarIds: [zoneCar.id],
      // The shelf holds the wrong colour entirely - not a shortfall, an
      // absence.
      consumableStock: { 'paint:metallic:white': 5 },
      bodyBayCarId: zoneCar.id,
    })
    const result = resolvePipelinePaintAction(
      state,
      zoneCar.id,
      { kind: 'pipeline-paint', zoneId: 'bonnet', colour: 'kaido-blue', grade: 'sport' },
      CONTEXT,
      10,
    )
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.state.consumableStock).toEqual(state.consumableStock)
    expect(result.state.ownedCars[0]?.zoneState?.bonnet.colour).toBeUndefined()
    expect(result.log).toEqual([
      {
        type: 'job-blocked',
        jobId: 'pipeline-car-paint-0001-paint-bonnet',
        reason: 'out-of-stock',
      },
    ])
  })
})

describe('isFreeInstallRefit (immediate free refits)', () => {
  it("is true for an install matching the target slot's own vacated baseline exactly, with no machine-gated fee", () => {
    // antiRollBars is a plain bolt-on suspension slot - never machine-gated
    // (dampers/springs are the group's own signature slots) - so refitting
    // its own real stock instance back onto itself is free at any tool tier.
    const installedAntiRollBars = car.parts.antiRollBars.installed!
    const vacatedCar: CarInstance = {
      ...car,
      parts: {
        ...car.parts,
        antiRollBars: {
          installed: null,
          vacatedBaseline: {
            partId: installedAntiRollBars.partId,
            band: installedAntiRollBars.band,
          },
        },
      },
    }
    const state = baseState({
      ownedCars: [vacatedCar],
      partInventory: [installedAntiRollBars, sparePart],
    })
    expect(
      isFreeInstallRefit(
        state,
        car.id,
        { kind: 'install', componentId: 'suspension', partInstanceId: installedAntiRollBars.id },
        CONTEXT,
      ),
    ).toBe(true)
  })

  it('is false for an install into a slot with no matching baseline - real labour, real work', () => {
    const state = baseState() // dampers: installed null, no vacatedBaseline recorded
    expect(
      isFreeInstallRefit(
        state,
        car.id,
        { kind: 'install', componentId: 'suspension', partInstanceId: sparePart.id },
        CONTEXT,
      ),
    ).toBe(false)
  })

  it('is false for an unknown car or a part instance no longer in inventory', () => {
    const state = baseState()
    expect(
      isFreeInstallRefit(
        state,
        'no-such-car',
        { kind: 'install', componentId: 'suspension', partInstanceId: sparePart.id },
        CONTEXT,
      ),
    ).toBe(false)
    expect(
      isFreeInstallRefit(
        state,
        car.id,
        { kind: 'install', componentId: 'suspension', partInstanceId: 'no-such-part' },
        CONTEXT,
      ),
    ).toBe(false)
  })
})
