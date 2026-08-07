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
import { planGroupRepair } from '../src/bands'
import { METAL_ZONE_IDS, TRIM_ZONE_IDS, zonePanelPart } from '../src/bodyPipeline'
import { buildSimContext } from '../src/context'
import {
  clearStagedWork,
  confirmStagedWork,
  isFreeInstallRefit,
  previewPlannedWork,
} from '../src/stagedWork'
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
    // The body group is the whole of what an on-car repair can still address
    // (every removable part is bench work), so the two-staged-actions test
    // below spills labour from one body carrier onto another.
    ...groupCarParts({ body: 'poor', engine: 'worn', suspension: 'worn', interior: 'poor' }),
    // Every slot defaults to a filled stock part, so the staged-install
    // test below needs a genuinely empty target slot (a group-level
    // install into an already-occupied slot is refused by installFitGate)
    // - dampers is the suspension-group part it installs onto.
    dampers: { installed: null },
  },
})

/** Real labor-slot plans for this fixture car, computed the same way
 * `confirmStagedWork` itself does - tests assert against these rather than
 * a hand-guessed number, so a `parts-taxonomy.json`/tool-line retune can't
 * silently desync the fixture from the assertions. */
function planFor(groupId: 'body' | 'engine' | 'suspension' | 'interior') {
  return planGroupRepair(
    car,
    groupId,
    'mint',
    TOOL_TIERS,
    CONTEXT.partIdsByGroup,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    CONTEXT.economy.restoration.repairStepFraction,
    CONTEXT.economy.energy.energyPerBandStepByToolTier,
  )
}

/** The same plan narrowed to one body carrier, for the per-part staged
 * addresses the shared-budget test below uses. */
function planForBodyPart(carPartId: 'panels' | 'chassis') {
  return planGroupRepair(
    car,
    'body',
    'mint',
    TOOL_TIERS,
    CONTEXT.partIdsByGroup,
    CONTEXT.partsById,
    CONTEXT.partsTaxonomyById,
    CONTEXT.economy.restoration.repairStepFraction,
    CONTEXT.economy.energy.energyPerBandStepByToolTier,
    carPartId,
  )
}

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
    stagedCarWork: {},
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

describe('clearStagedWork', () => {
  it('drops the given car’s staged entry, leaving others untouched', () => {
    const state = baseState({
      stagedCarWork: {
        [car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }],
        'other-car': [{ kind: 'repair', componentId: 'engine', targetBand: 'mint' }],
      },
    })
    const next = clearStagedWork(state, car.id)
    expect(next.stagedCarWork[car.id]).toBeUndefined()
    expect(next.stagedCarWork['other-car']).toEqual([
      { kind: 'repair', componentId: 'engine', targetBand: 'mint' },
    ])
  })

  it('is a no-op (same reference) when the car has no staged entry', () => {
    const state = baseState()
    expect(clearStagedWork(state, car.id)).toBe(state)
  })
})

describe('confirmStagedWork', () => {
  it('resolves a single staged repair through the normal job/labor machinery', () => {
    const plan = planFor('body')
    const state = baseState({
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }] },
    })
    const result = confirmStagedWork(state, car.id, plan.laborSlotsRequired, CONTEXT)
    expect(result.state.ownedCars[0]?.parts.panels.installed?.band).toBe('mint')
    expect(result.state.ownedCars[0]?.parts.aero.installed?.band).toBe('mint')
    expect(result.log.some((e) => e.type === 'job-completed')).toBe(true)
  })

  it('resolves a staged install for the exact part instance staged', () => {
    const state = baseState({
      // dampers is a suspension signature slot - the install needs the line
      // hired for the day (suspension is tier 1 in this file's TOOL_TIERS).
      machineHirePaidDayByGroup: { suspension: 1 },
      stagedCarWork: {
        [car.id]: [{ kind: 'install', componentId: 'suspension', partInstanceId: sparePart.id }],
      },
    })
    // Offer a full day's energy so the install completes.
    const result = confirmStagedWork(state, car.id, 60, CONTEXT)
    expect(result.state.ownedCars[0]?.parts.dampers.installed?.id).toBe(sparePart.id)
    expect(result.state.partInventory).toHaveLength(0)
  })

  it('shares one labor budget across multiple staged actions, in staged order', () => {
    const panelsPlan = planForBodyPart('panels')
    const chassisPlan = planForBodyPart('chassis')
    // Enough for the panels repair (staged first) to complete fully, plus
    // exactly 1 slot spillover for the chassis (staged second) - a real,
    // continuable partial job. Both are fixed body carriers, which is the
    // whole of what an on-car repair addresses now.
    const offeredLabor = panelsPlan.laborSlotsRequired + 1
    const state = baseState({
      stagedCarWork: {
        [car.id]: [
          { kind: 'repair', componentId: 'body', carPartId: 'panels', targetBand: 'mint' },
          { kind: 'repair', componentId: 'body', carPartId: 'chassis', targetBand: 'mint' },
        ],
      },
    })
    const result = confirmStagedWork(state, car.id, offeredLabor, CONTEXT)
    expect(result.state.ownedCars[0]?.parts.panels.installed?.band).toBe('mint')
    expect(result.state.ownedCars[0]?.parts.chassis.installed?.band).toBe('poor') // not yet repaired
    const chassisJob = result.state.jobs.find((j) => j.carPartId === 'chassis')
    expect(chassisJob).toBeDefined()
    expect(chassisJob?.laborSlotsSpent).toBe(1)
    expect(chassisJob?.laborSlotsRequired).toBe(chassisPlan.laborSlotsRequired)
  })

  it('the affordability gate still refuses a staged repair at confirm time (Sprint 36: the only gate left)', () => {
    const state = baseState({
      cashYen: 0, // can't cover consumables + the repair's real cost
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }] },
    })
    const result = confirmStagedWork(state, car.id, 3, CONTEXT)
    expect(result.state.ownedCars[0]?.parts.panels.installed?.band).toBe('poor') // unchanged
    expect(result.state.jobs).toHaveLength(0)
  })

  it('clears the staged list unconditionally, even when an action only partially labors', () => {
    const state = baseState({
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }] },
    })
    const result = confirmStagedWork(state, car.id, 1, CONTEXT) // less than the real plan needs
    expect(result.state.stagedCarWork[car.id]).toBeUndefined()
    expect(result.state.jobs[0]?.laborSlotsSpent).toBe(1) // left behind, continuable
  })

  it('is a no-op for a car with no staged entry', () => {
    const state = baseState()
    const result = confirmStagedWork(state, car.id, 5, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })
})

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

describe('confirmStagedWork: pipeline-remove-panel / pipeline-install-panel', () => {
  it('removing then installing harvests the old panel and fits the new one, re-projecting the derived panels band', () => {
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
      // Pre-work panels band starts deliberately wrong ('poor') so the
      // post-confirm assertion proves the derived band was re-projected from
      // zone state, not merely left at whatever the fixture set.
      parts: mintCarParts({ panels: 'poor' }),
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
      stagedCarWork: {
        [zoneCar.id]: [
          { kind: 'pipeline-remove-panel', zoneId: 'bonnet' },
          { kind: 'pipeline-install-panel', zoneId: 'bonnet', partInstanceId: newBonnetPanel.id },
        ],
      },
    })
    const result = confirmStagedWork(state, zoneCar.id, 10, CONTEXT)

    // The new panel is consumed from inventory...
    expect(result.state.partInventory.some((p) => p.id === newBonnetPanel.id)).toBe(false)

    // ...and the OLD panel is harvested into inventory in its place, at the
    // band its pre-removal metal severity (2) maps to ('worn'), addressing
    // the panels slot for the bonnet zone, with a car-kind origin.
    const harvested = result.state.partInventory.find((p) => p.partId === bonnetPanelPart.id)
    expect(harvested).toBeDefined()
    expect(harvested?.band).toBe('worn')
    expect(harvested?.origin.kind).toBe('car')
    const harvestedCatalogPart = CONTEXT.partsById[harvested!.partId]
    expect(harvestedCatalogPart?.zoneId).toBe('bonnet')
    expect(harvestedCatalogPart?.carPartId).toBe('panels')

    // The zone's metal clears to the installed mint panel's band (severity
    // 0), and the derived panels band re-projects from a now-clean bonnet
    // plus the already-clean remaining zones.
    expect(result.state.ownedCars[0]?.zoneState?.bonnet.metal).toBe(0)
    expect(result.state.ownedCars[0]?.parts.panels.installed?.band).toBe('mint')
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
      parts: mintCarParts({ panels: 'scrap' }),
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
      stagedCarWork: {
        [zoneCar.id]: [
          { kind: 'pipeline-install-panel', zoneId: 'boot', partInstanceId: newBootPanel.id },
        ],
      },
    })
    const result = confirmStagedWork(state, zoneCar.id, 10, CONTEXT)
    expect(result.state.partInventory.some((p) => p.id === newBootPanel.id)).toBe(false)
    // Nothing was there to harvest, so nothing new landed in inventory.
    expect(result.state.partInventory).toHaveLength(0)
    expect(result.state.ownedCars[0]?.zoneState?.boot.panelMissing).toBe(false)
    expect(result.state.ownedCars[0]?.zoneState?.boot.metal).toBe(0)
    expect(result.state.ownedCars[0]?.parts.panels.installed?.band).toBe('mint')
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
      stagedCarWork: {
        [zoneCar.id]: [
          { kind: 'pipeline-remove-panel', zoneId: 'boot' }, // already missing
          { kind: 'pipeline-install-panel', zoneId: 'bonnet', partInstanceId: sparePanel.id }, // already occupied
        ],
      },
    })
    const result = confirmStagedWork(state, zoneCar.id, 10, CONTEXT)
    // Neither action moved anything: the spare panel is still sitting loose,
    // the bonnet's original panel is still fitted, and boot is still missing.
    expect(result.state.partInventory).toEqual([sparePanel])
    expect(result.state.ownedCars[0]?.zoneState?.boot.panelMissing).toBe(true)
    expect(result.state.ownedCars[0]?.zoneState?.bonnet.metal).toBe(0)
  })
})

describe('confirmStagedWork: pipeline-paint', () => {
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
      stagedCarWork: {
        [zoneCar.id]: [
          { kind: 'pipeline-paint', zoneId: 'bonnet', colour: 'kaido-blue', grade: 'sport' },
        ],
      },
    })
    const result = confirmStagedWork(state, zoneCar.id, 10, CONTEXT)
    // The tin was already paid for when it was bought - confirming the
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
      stagedCarWork: {
        [zoneCar.id]: [{ kind: 'pipeline-paint', zoneId: 'boot', colour: 'white', grade: 'stock' }],
      },
    })
    const result = confirmStagedWork(state, zoneCar.id, 10, CONTEXT)
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
      stagedCarWork: {
        [zoneCar.id]: [
          { kind: 'pipeline-paint', zoneId: 'front-bumper', colour: 'kaido-blue', grade: 'stock' },
        ],
      },
    })
    const result = confirmStagedWork(state, zoneCar.id, 10, CONTEXT)
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
      stagedCarWork: {
        [zoneCar.id]: [
          { kind: 'pipeline-paint', zoneId: 'bonnet', colour: 'kaido-blue', grade: 'sport' },
        ],
      },
    })
    const result = confirmStagedWork(state, zoneCar.id, 10, CONTEXT)
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

describe('previewPlannedWork (Sprint 48)', () => {
  it('projects a planned group repair without spending cash, labor, or creating a job', () => {
    const state = baseState({
      stagedCarWork: { [car.id]: [{ kind: 'repair', componentId: 'body', targetBand: 'mint' }] },
    })
    const preview = previewPlannedWork(state, car.id, CONTEXT)
    expect(preview?.parts.panels.installed?.band).toBe('mint')
    expect(preview?.parts.aero.installed?.band).toBe('mint')
    // Nothing in state itself changed - this is a pure projection.
    expect(state.cashYen).toBe(5_000_000)
    expect(state.jobs).toHaveLength(0)
    expect(state.ownedCars[0]?.parts.panels.installed?.band).toBe('poor')
  })

  it('projects a planned per-part repair, leaving sibling parts in the group untouched', () => {
    const state = baseState({
      stagedCarWork: {
        [car.id]: [
          { kind: 'repair', componentId: 'body', targetBand: 'mint', carPartId: 'panels' },
        ],
      },
    })
    const preview = previewPlannedWork(state, car.id, CONTEXT)
    expect(preview?.parts.panels.installed?.band).toBe('mint')
    expect(preview?.parts.aero.installed?.band).toBe('poor') // untouched - not the addressed part
  })

  it('projects a planned install onto the addressed slot', () => {
    const state = baseState({
      stagedCarWork: {
        [car.id]: [{ kind: 'install', componentId: 'suspension', partInstanceId: sparePart.id }],
      },
    })
    const preview = previewPlannedWork(state, car.id, CONTEXT)
    expect(preview?.parts.dampers.installed?.id).toBe(sparePart.id)
    // The real inventory is untouched - a preview never mutates state.
    expect(state.partInventory).toHaveLength(1)
  })

  it('projects multiple staged actions together, in order', () => {
    const state = baseState({
      stagedCarWork: {
        [car.id]: [
          { kind: 'repair', componentId: 'body', targetBand: 'fine' },
          { kind: 'install', componentId: 'suspension', partInstanceId: sparePart.id },
        ],
      },
    })
    const preview = previewPlannedWork(state, car.id, CONTEXT)
    expect(preview?.parts.panels.installed?.band).toBe('fine')
    expect(preview?.parts.dampers.installed?.id).toBe(sparePart.id)
  })

  it('is a no-op projection (returns the real car unchanged) for a car with nothing planned', () => {
    const state = baseState()
    const preview = previewPlannedWork(state, car.id, CONTEXT)
    expect(preview?.parts.panels.installed?.band).toBe('poor')
  })

  it('returns null for an unknown car', () => {
    const state = baseState()
    expect(previewPlannedWork(state, 'no-such-car', CONTEXT)).toBeNull()
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
