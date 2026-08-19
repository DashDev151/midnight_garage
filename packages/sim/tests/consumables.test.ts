import {
  CARS,
  MATERIALS,
  PARTS,
  PARTS_TAXONOMY,
  paintStockKey,
  type CarInstance,
  type DayLogEntry,
  type GameState,
  type Grade,
  type PipelineStageId,
  type ZoneId,
  type ZoneState,
  type ZoneStates,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { METAL_ZONE_IDS, TRIM_ZONE_IDS } from '../src/bodyPipeline'
import { buildSimContext } from '../src/context'
import {
  consumeStock,
  firstShortfall,
  hasStockFor,
  paintConsumableRequirement,
  resolveBuyConsumableTin,
  resolveBuyPaintTin,
  stageConsumables,
} from '../src/consumables'
import { resolvePipelinePaintAction, resolvePipelineStageAction } from '../src/pipelineActions'
import { buildCarInstance, mintCarParts, testSceneStanding, testToolTiers } from './testFixtures'

/** Resolves one generic pipeline stage on each zone in turn, against a
 * single shared labour budget - threads state and remaining labour through
 * exactly as clicking each zone's stage button in turn would. */
function resolveStagesInTurn(
  state: GameState,
  carId: string,
  stages: readonly { zoneId: ZoneId; stage: Exclude<PipelineStageId, 'paint'> }[],
  laborAvailable: number,
): { state: GameState; log: DayLogEntry[] } {
  let current = state
  let remaining = laborAvailable
  const log: DayLogEntry[] = []
  for (const { zoneId, stage } of stages) {
    const result = resolvePipelineStageAction(
      current,
      carId,
      { kind: 'pipeline-stage', stage, zoneId },
      CONTEXT,
      remaining,
    )
    current = result.state
    remaining -= result.laborSlotsUsed
    log.push(...result.log)
  }
  return { state: current, log }
}

/** The paint-stage analogue of `resolveStagesInTurn`. */
function resolvePaintInTurn(
  state: GameState,
  carId: string,
  zoneIds: readonly ZoneId[],
  colour: string,
  grade: Grade,
  laborAvailable: number,
): { state: GameState; log: DayLogEntry[] } {
  let current = state
  let remaining = laborAvailable
  const log: DayLogEntry[] = []
  for (const zoneId of zoneIds) {
    const result = resolvePipelinePaintAction(
      current,
      carId,
      { kind: 'pipeline-paint', zoneId, colour, grade },
      CONTEXT,
      remaining,
    )
    current = result.state
    remaining -= result.laborSlotsUsed
    log.push(...result.log)
  }
  return { state: current, log }
}

const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)
const TOOL_TIERS = testToolTiers({ body: 2 })

/** All nine zones clean (mint, unprimed, present) - the shared starting point
 * every zoneState fixture below overrides from (mirrors `stagedWork.test.ts`'s
 * own `cleanZoneStates`). */
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
    toolTiers: TOOL_TIERS,
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
    ...overrides,
  }
}

describe('buying a tin raises stock; using one lowers it', () => {
  it('resolveBuyConsumableTin credits the whole usesPerTin at once and charges its price', () => {
    const state = baseState()
    const result = resolveBuyConsumableTin(state, 'primer', CONTEXT)
    expect(result.log).toEqual([
      { type: 'consumable-bought', consumableKey: 'primer', usesAdded: 9, priceYen: 5_850 },
    ])
    expect(result.state.cashYen).toBe(state.cashYen - 5_850)
    expect(result.state.consumableStock).toEqual({ primer: 9 })
  })

  it('refuses on insufficient cash, spending and crediting nothing', () => {
    const state = baseState({ cashYen: 100 })
    const result = resolveBuyConsumableTin(state, 'primer', CONTEXT)
    expect(result.log).toEqual([])
    expect(result.state).toBe(state)
  })

  it('consumeStock draws down exactly the requested uses, leaving other keys untouched', () => {
    const stock = { filler: 4, paper: 4, primer: 9 }
    const next = consumeStock(stock, [{ key: 'filler', uses: 1 }])
    expect(next).toEqual({ filler: 3, paper: 4, primer: 9 })
  })

  it('a paper tin credits a pack of 10 uses at 3,200 yen, out of step with the 4-use filler tin', () => {
    const state = baseState()
    const result = resolveBuyConsumableTin(state, 'paper', CONTEXT)
    expect(result.log).toEqual([
      { type: 'consumable-bought', consumableKey: 'paper', usesAdded: 10, priceYen: 3_200 },
    ])
    expect(result.state.cashYen).toBe(state.cashYen - 3_200)
    expect(result.state.consumableStock).toEqual({ paper: 10 })
  })

  it('a second purchase of the same tin stacks onto the existing stock', () => {
    const first = resolveBuyConsumableTin(baseState(), 'filler', CONTEXT)
    const second = resolveBuyConsumableTin(first.state, 'filler', CONTEXT)
    expect(second.state.consumableStock).toEqual({ filler: 8 })
  })
})

describe('a stage refuses when its consumable is out, naming what is missing', () => {
  it('hasStockFor is false and firstShortfall names the empty key', () => {
    const stock = { filler: 0, paper: 4 }
    const requirements = stageConsumables('fillAndSand')
    expect(hasStockFor(stock, requirements)).toBe(false)
    expect(firstShortfall(stock, requirements)).toEqual({ key: 'filler', uses: 1 })
  })

  it('a fillAndSand stage refuses at Confirm with no shelf stock, spending nothing and changing nothing', () => {
    const zoneState = cleanZoneStates({
      bonnet: { metal: 0, surface: 1, finish: 0, panelMissing: false, primed: false },
    })
    const car: CarInstance = buildCarInstance({
      id: 'car-shortfall-0001',
      modelId: 'honda-city-e-aa',
      year: 1984,
      mileageKm: 100_000,
      parts: mintCarParts(),
      zoneState,
    })
    const state = baseState({
      ownedCars: [car],
      serviceBayCarIds: [car.id],
      bodyBayCarId: car.id,
    })
    const result = resolvePipelineStageAction(
      state,
      car.id,
      { kind: 'pipeline-stage', stage: 'fillAndSand', zoneId: 'bonnet' },
      CONTEXT,
      10,
    )
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.state.ownedCars[0]?.zoneState?.bonnet.surface).toBe(1) // untouched
    expect(result.log).toEqual([
      {
        type: 'job-blocked',
        jobId: 'pipeline-car-shortfall-0001-fillAndSand-bonnet',
        reason: 'out-of-stock',
      },
    ])
  })

  it('the leftover case: one filler tin does exactly four panels, one paper pack outlasts two filler tins', () => {
    const zoneState = cleanZoneStates({
      bonnet: { metal: 0, surface: 1, finish: 0, panelMissing: false, primed: false },
      boot: { metal: 0, surface: 1, finish: 0, panelMissing: false, primed: false },
      'left-front': { metal: 0, surface: 1, finish: 0, panelMissing: false, primed: false },
    })
    const car: CarInstance = buildCarInstance({
      id: 'car-leftover-0001',
      modelId: 'honda-city-e-aa',
      year: 1984,
      mileageKm: 100_000,
      parts: mintCarParts(),
      zoneState,
    })
    // One filler tin (4 uses) is exactly enough for the whole car by design;
    // one paper pack (10 uses) is deliberately not a multiple of it, so the
    // two tins fall out of step rather than running out together. This car
    // only needed three panels' worth of either.
    const filler = resolveBuyConsumableTin(baseState(), 'filler', CONTEXT)
    const paper = resolveBuyConsumableTin(filler.state, 'paper', CONTEXT)
    expect(paper.state.consumableStock).toEqual({ filler: 4, paper: 10 })

    const state: GameState = {
      ...paper.state,
      ownedCars: [car],
      serviceBayCarIds: [car.id],
      bodyBayCarId: car.id,
    }
    const result = resolveStagesInTurn(
      state,
      car.id,
      [
        { zoneId: 'bonnet', stage: 'fillAndSand' },
        { zoneId: 'boot', stage: 'fillAndSand' },
        { zoneId: 'left-front', stage: 'fillAndSand' },
      ],
      60,
    )
    expect(result.state.ownedCars[0]?.zoneState?.bonnet.surface).toBe(0)
    expect(result.state.ownedCars[0]?.zoneState?.boot.surface).toBe(0)
    expect(result.state.ownedCars[0]?.zoneState?.['left-front'].surface).toBe(0)
    // One panel's worth of filler remains, and seven uses of paper - neither
    // tin was ever this one car's to spend in full.
    expect(result.state.consumableStock).toEqual({ filler: 1, paper: 7 })
    // No cash moved at Confirm - both tins were already paid for.
    expect(result.state.cashYen).toBe(state.cashYen)
  })
})

describe('paint stock is colour-specific', () => {
  it('paintConsumableRequirement keys on finish and colour, not on grade alone', () => {
    expect(paintConsumableRequirement('stock', 'white')).toEqual({
      key: paintStockKey('solid', 'white'),
      uses: 1,
    })
    expect(paintConsumableRequirement('sport', 'blue-rally')).toEqual({
      key: paintStockKey('metallic', 'blue-rally'),
      uses: 1,
    })
  })

  it('a tin bought in one colour does not cover another, even at the same finish', () => {
    const bought = resolveBuyPaintTin(baseState(), 'solid', 'small', 'white', CONTEXT)
    expect(bought.state.consumableStock).toEqual({ [paintStockKey('solid', 'white')]: 3 })
    expect(
      hasStockFor(bought.state.consumableStock!, [paintConsumableRequirement('street', 'white')]),
    ).toBe(true)
    expect(
      hasStockFor(bought.state.consumableStock!, [
        paintConsumableRequirement('street', 'blue-rally'),
      ]),
    ).toBe(false)
  })

  it('resolveBuyPaintTin refuses an id outside the 34-colour palette', () => {
    const state = baseState()
    const result = resolveBuyPaintTin(state, 'solid', 'small', 'not-a-real-colour', CONTEXT)
    expect(result.log).toEqual([])
    expect(result.state).toBe(state)
  })
})

describe('the full-respray total holds against the old per-use charge', () => {
  const PAINT_ZONE_IDS = [...METAL_ZONE_IDS, ...TRIM_ZONE_IDS]
  const PAINT_PER_USE_YEN = MATERIALS.find((m) => m.id === 'paint')!.priceYen

  function primedRespray(): CarInstance {
    const metalPrimed: ZoneState = {
      metal: 0,
      surface: 0,
      finish: 3,
      panelMissing: false,
      primed: true,
    }
    const trimPrimed: ZoneState = { finish: 3, panelMissing: false, primed: true }
    const overrides: Partial<Record<string, ZoneState>> = {}
    for (const zoneId of METAL_ZONE_IDS) overrides[zoneId] = metalPrimed
    for (const zoneId of TRIM_ZONE_IDS) overrides[zoneId] = trimPrimed
    const zoneState = cleanZoneStates(overrides)
    return buildCarInstance({
      id: 'car-respray-0001',
      modelId: 'honda-city-e-aa',
      year: 1984,
      mileageKm: 100_000,
      factoryColour: 'white',
      parts: mintCarParts(),
      zoneState,
    })
  }

  it('nine zones at the old per-use price sum to what the design doc calls the respray total', () => {
    // The "before" figure: what confirming a paint stage on all nine zones
    // charged directly, one zone at a time, prior to consumables-as-stock.
    expect(PAINT_ZONE_IDS.length * PAINT_PER_USE_YEN).toBe(12_600)
  })

  it('buying three small tins (no bulk discount taken) costs exactly the old total, and Confirm spends no further cash', () => {
    const car = primedRespray()
    let state = baseState({ ownedCars: [car], serviceBayCarIds: [car.id], bodyBayCarId: car.id })
    for (let i = 0; i < 3; i++) {
      const bought = resolveBuyPaintTin(state, 'solid', 'small', 'blue-rally', CONTEXT)
      expect(bought.log.length).toBe(1)
      state = bought.state
    }
    const spentBuyingTins = 5_000_000 - state.cashYen
    expect(spentBuyingTins).toBe(12_600)
    expect(state.consumableStock).toEqual({ [paintStockKey('solid', 'blue-rally')]: 9 })

    const result = resolvePaintInTurn(state, car.id, PAINT_ZONE_IDS, 'blue-rally', 'street', 200)
    for (const zoneId of PAINT_ZONE_IDS) {
      expect(result.state.ownedCars[0]?.zoneState?.[zoneId].colour).toBe('blue-rally')
    }
    // No cash moves at Confirm - the whole respray was already paid for.
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.state.consumableStock).toEqual({ [paintStockKey('solid', 'blue-rally')]: 0 })
  })

  it('buying one large tin instead costs 1,250 yen less - the bulk discount, and nothing else moves', () => {
    const car = primedRespray()
    const state = baseState({ ownedCars: [car], serviceBayCarIds: [car.id], bodyBayCarId: car.id })
    const bought = resolveBuyPaintTin(state, 'solid', 'large', 'blue-rally', CONTEXT)
    const spentBuyingTin = state.cashYen - bought.state.cashYen
    expect(spentBuyingTin).toBe(11_350)
    expect(12_600 - spentBuyingTin).toBe(1_250)

    const result = resolvePaintInTurn(
      bought.state,
      car.id,
      PAINT_ZONE_IDS,
      'blue-rally',
      'street',
      200,
    )
    expect(result.state.cashYen).toBe(bought.state.cashYen)
    expect(result.state.consumableStock).toEqual({ [paintStockKey('solid', 'blue-rally')]: 0 })
  })
})
