import {
  BUYERS,
  CARS,
  HIDDEN_ISSUES,
  PARTS,
  type GameState,
  type MarketLedger,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { bumpLotSupply, bumpPlayerSales, updateMarketHeat } from '../src/marketHeat'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES)
const { HEAT_MIN, HEAT_MAX } = CONTEXT.economy.marketPressure

// Two real, distinct model ids - used as "the model under test" / "the
// untouched control" across the probes below.
const MODEL_A = 'honda-city-e-aa'
const MODEL_B = 'toyota-supra-rz-jza80'

function stateOnDay(
  day: number,
  marketHeat: Record<string, number>,
  marketLedger: MarketLedger = { lotSupply: {}, playerSales: {} },
): GameState {
  return {
    day,
    seed: 42,
    cashYen: 0,
    reputationTier: 'unknown',
    reputationPoints: 0,
    serviceJobOffers: [],
    activeServiceJobs: [],
    ownedCars: [],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat,
    marketLedger,
    activeAuctionLots: [],
    activeListings: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    parkingCarIds: [],
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: [],
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
  }
}

describe('bumpLotSupply / bumpPlayerSales', () => {
  it('bumpLotSupply increments one entry per modelId occurrence in the list', () => {
    const state = stateOnDay(1, {})
    const bumped = bumpLotSupply(state, [MODEL_A, MODEL_A, MODEL_B])
    expect(bumped.marketLedger.lotSupply[MODEL_A]).toBe(2)
    expect(bumped.marketLedger.lotSupply[MODEL_B]).toBe(1)
  })

  it('bumpLotSupply is a no-op for an empty list', () => {
    const state = stateOnDay(1, {})
    expect(bumpLotSupply(state, [])).toBe(state)
  })

  it('bumpPlayerSales accumulates across repeated calls', () => {
    let state = stateOnDay(1, {})
    state = bumpPlayerSales(state, MODEL_A)
    state = bumpPlayerSales(state, MODEL_A)
    state = bumpPlayerSales(state, MODEL_A)
    expect(state.marketLedger.playerSales[MODEL_A]).toBe(3)
  })

  it('bumping one model never touches another model’s counters', () => {
    const state = bumpPlayerSales(stateOnDay(1, {}), MODEL_A)
    expect(state.marketLedger.playerSales[MODEL_B]).toBeUndefined()
  })
})

describe('updateMarketHeat', () => {
  it('does nothing off a 7-day boundary', () => {
    const state = stateOnDay(3, { [MODEL_A]: 100 })
    const result = updateMarketHeat(state, CONTEXT)
    expect(result.log).toHaveLength(0)
    expect(result.state.marketHeat).toEqual({ [MODEL_A]: 100 })
    expect(result.state).toBe(state)
  })

  it('is deterministic: a pure function of state and context, no hidden randomness', () => {
    const state = stateOnDay(7, { [MODEL_A]: 100, [MODEL_B]: 100 })
    const a = updateMarketHeat(state, CONTEXT)
    const b = updateMarketHeat(state, CONTEXT)
    expect(a.state.marketHeat).toEqual(b.state.marketHeat)
    expect(a.log).toEqual(b.log)
  })

  it('touches every model in context, defaulting a model with no prior entry to base 100', () => {
    const state = stateOnDay(7, {})
    const result = updateMarketHeat(state, CONTEXT)
    expect(Object.keys(result.state.marketHeat).length).toBe(CONTEXT.models.length)
  })

  it('clamps every model’s new heat to [HEAT_MIN, HEAT_MAX], even under sustained extreme pressure', () => {
    // Heavily re-flood MODEL_A's playerSales every week for 50 weeks straight
    // - the target heat is clamped before smoothing, so heat itself can never
    // leave [HEAT_MIN, HEAT_MAX] even under this sustained worst case.
    let state = stateOnDay(7, { [MODEL_A]: 100 })
    for (let week = 0; week < 50; week++) {
      for (let i = 0; i < 30; i++) state = bumpPlayerSales(state, MODEL_A)
      const result = updateMarketHeat(state, CONTEXT)
      state = result.state
      const heat = state.marketHeat[MODEL_A]!
      expect(heat).toBeGreaterThanOrEqual(HEAT_MIN)
      expect(heat).toBeLessThanOrEqual(HEAT_MAX)
      state = { ...state, day: state.day + 7 }
    }
    // Sustained flooding this heavy should have driven heat down near the floor.
    expect(state.marketHeat[MODEL_A]).toBeLessThan(85)
  })

  /**
   * Flood probe (sprint21.md Testing bullet): bumping playerSales on one
   * model pulls its heat down within a couple of weekly updates, while an
   * untouched control model isn't pulled down the same way. The playerSales
   * bump (20x, well beyond the +/-12 wave amplitude any single model can
   * contribute) dwarfs the per-model wave-phase noise, so this holds
   * regardless of MODEL_A/MODEL_B's own (unpredicted) wave phases.
   */
  it('flood probe: heavy playerSales on one model drops its heat below an untouched control', () => {
    let flooded = stateOnDay(7, { [MODEL_A]: 100, [MODEL_B]: 100 })
    for (let i = 0; i < 20; i++) flooded = bumpPlayerSales(flooded, MODEL_A)

    const week1 = updateMarketHeat(flooded, CONTEXT).state
    const week2 = updateMarketHeat({ ...week1, day: 14 }, CONTEXT).state

    expect(week2.marketHeat[MODEL_A]!).toBeLessThan(100)
    expect(week2.marketHeat[MODEL_A]!).toBeLessThan(week2.marketHeat[MODEL_B]!)
  })

  /**
   * Scarcity probe: a model with near-zero lotSupply gets a flat bonus
   * toward its target heat; a model the catalog keeps producing (lotSupply
   * well above SCARCITY_THRESHOLD) gets neither the bonus nor is it
   * penalized by the supply-glut weight. Over a couple of updates the
   * scarce model should end up running hotter than the flooded one.
   */
  it('scarcity probe: a model absent from catalogs runs hotter than one the catalog keeps producing', () => {
    let floodedSupply = stateOnDay(7, { [MODEL_A]: 100, [MODEL_B]: 100 })
    for (let i = 0; i < 20; i++) {
      floodedSupply = bumpLotSupply(floodedSupply, [MODEL_B])
    }
    // MODEL_A's ledger stays empty (scarce); MODEL_B is flooded with supply.

    const week1 = updateMarketHeat(floodedSupply, CONTEXT).state
    const week2 = updateMarketHeat({ ...week1, day: 14 }, CONTEXT).state

    expect(week2.marketHeat[MODEL_A]!).toBeGreaterThan(week2.marketHeat[MODEL_B]!)
  })
})
