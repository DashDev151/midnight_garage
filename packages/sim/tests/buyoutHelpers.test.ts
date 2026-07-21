import { BUYERS, CARS, PARTS, PARTS_TAXONOMY, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { emptyDayActions } from '../src/actions'
import { anchorValueYen, computeBuyoutPriceYen } from '../src/bidding'
import { generateAuctionCatalog } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { acquireLot, auctionAcquisitionBudget, walkAwayTargetYen } from '../src/bots/buyoutHelpers'
import { bellNormal, createRng, hashStringToSeed } from '../src/rng'
import { testSpecialty, testToolTiers } from './testFixtures'

// Real PARTS (not []): generation now fills every slot with a real stock
// PartInstance by default (Sprint 32) - an empty catalog would make every
// part read as MISSING, crushing every generated car's value to the floor
// and making this file's value-anchor assertions meaningless.
const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

function sampleLot(modelId: string, tier: 'local-yard' | 'regional' | 'premium', seed: number) {
  const model = CARS.find((c) => c.id === modelId)
  if (!model) throw new Error('fixture car missing')
  const [lot] = generateAuctionCatalog([model], tier, 7, 1, createRng(seed), CONTEXT)
  if (!lot) throw new Error('expected a lot')
  return { lot: { ...lot, id: `${modelId}-${seed}` }, model }
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 999_999_999,
    reputationTier: 'unknown',
    reputationPoints: 0,
    specialty: testSpecialty(),
    ownedCars: [],
    partInventory: [],
    staff: [],
    staffAds: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    carsForSale: [],
    pendingOffers: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
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
    ...overrides,
  }
}

describe('walkAwayTargetYen (instanceValue x multiplier x private spread)', () => {
  /** Mirrors `walkAwayTargetYen`'s own seeded spread exactly, so the test
   * proves the wiring (anchor x multiplier x spread) rather than re-deriving
   * a competing formula. */
  function expectedTargetYen(
    lot: ReturnType<typeof sampleLot>['lot'],
    state: GameState,
    strategyMultiplier: number,
  ): number {
    const anchor = anchorValueYen(lot, state, CONTEXT)
    const spreadRng = createRng(hashStringToSeed(`walk-away:${lot.id}`))
    const spreadMultiplier = bellNormal(1, CONTEXT.economy.valuation.walkAwaySpread, spreadRng)
    return Math.round(anchor * strategyMultiplier * spreadMultiplier)
  }

  it('is the value anchor times the strategy multiplier times a private per-lot spread', () => {
    const { lot } = sampleLot('toyota-supra-rz-jza80', 'premium', 1)
    const state = baseState({ activeAuctionLots: [lot] })
    expect(walkAwayTargetYen(lot, state, CONTEXT, 1.1)).toBe(expectedTargetYen(lot, state, 1.1))
  })

  it('is deterministic for the same lot id - repeated calls agree', () => {
    const { lot } = sampleLot('toyota-supra-rz-jza80', 'premium', 2)
    const state = baseState({ activeAuctionLots: [lot] })
    const a = walkAwayTargetYen(lot, state, CONTEXT, 1.0)
    const b = walkAwayTargetYen(lot, state, CONTEXT, 1.0)
    expect(a).toBe(b)
  })

  it('bounds the spread to +/- 6 standard deviations of walkAwaySpread (bellNormal Irwin-Hall bound)', () => {
    const { lot } = sampleLot('toyota-supra-rz-jza80', 'premium', 3)
    const state = baseState({ activeAuctionLots: [lot] })
    const anchor = anchorValueYen(lot, state, CONTEXT)
    const spread = CONTEXT.economy.valuation.walkAwaySpread
    const target = walkAwayTargetYen(lot, state, CONTEXT, 1.0)
    expect(target).toBeGreaterThanOrEqual(Math.round(anchor * (1 - 6 * spread)))
    expect(target).toBeLessThanOrEqual(Math.round(anchor * (1 + 6 * spread)))
  })
})

describe('acquireLot (buy this lot outright, under a walk-away target)', () => {
  it('queues a buyout when its price is within the walk-away target', () => {
    const { lot } = sampleLot('honda-city-e-aa', 'local-yard', 200)
    const state = baseState()
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget()
    const priceYen = computeBuyoutPriceYen(lot, state, CONTEXT)
    const acted = acquireLot(state, lot, priceYen, actions, CONTEXT, budget, 1.2)
    expect(acted).toBe(true)
    expect(actions.buyoutLots).toEqual([{ lotId: lot.id }])
    expect(budget.cashCommitted).toBe(priceYen)
  })

  it('walks away (queues nothing) when the buyout price would exceed the target', () => {
    const { lot } = sampleLot('honda-city-e-aa', 'local-yard', 201)
    const state = baseState()
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget()
    const priceYen = computeBuyoutPriceYen(lot, state, CONTEXT)
    const acted = acquireLot(state, lot, priceYen - 1, actions, CONTEXT, budget, 1.2)
    expect(acted).toBe(false)
    expect(actions.buyoutLots).toEqual([])
    expect(budget.cashCommitted).toBe(0)
  })

  it('returns false and queues nothing when unaffordable under the cash buffer', () => {
    const { lot } = sampleLot('honda-city-e-aa', 'local-yard', 203)
    const state = baseState({ cashYen: 1 })
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget()
    const priceYen = computeBuyoutPriceYen(lot, state, CONTEXT)
    const acted = acquireLot(state, lot, priceYen, actions, CONTEXT, budget, 1.2)
    expect(acted).toBe(false)
    expect(actions.buyoutLots).toEqual([])
    expect(budget.cashCommitted).toBe(0)
  })

  it('accumulates cashCommitted across repeated calls sharing one budget, never overcommitting', () => {
    const { lot: lot1 } = sampleLot('honda-city-e-aa', 'local-yard', 204)
    const { lot: lot2 } = sampleLot('honda-city-e-aa', 'local-yard', 205)
    const probeState = baseState()
    const price1 = computeBuyoutPriceYen(lot1, probeState, CONTEXT)
    const price2 = computeBuyoutPriceYen(lot2, probeState, CONTEXT)
    // Math.ceil, not Math.round: acquireLot's own gate is `cashYen >=
    // (committed + price) * cashBufferMultiplier` - a plain round can land
    // fractionally under that exact product and fail the boundary by a
    // rounding artifact unrelated to what this test actually exercises
    // (that both buyouts fit together under one shared budget).
    const state = baseState({ cashYen: Math.ceil((price1 + price2) * 1.2) })
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget()
    const first = acquireLot(state, lot1, price1, actions, CONTEXT, budget, 1.2)
    const second = acquireLot(state, lot2, price2, actions, CONTEXT, budget, 1.2)
    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(budget.cashCommitted).toBe(price1 + price2)
  })
})

describe('auctionAcquisitionBudget', () => {
  it('starts empty every call - buyout resolves the same day, nothing persists across ticks', () => {
    expect(auctionAcquisitionBudget()).toEqual({ cashCommitted: 0 })
  })
})
