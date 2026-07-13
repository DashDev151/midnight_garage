import {
  BUYERS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type AuctionLot,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { emptyDayActions } from '../src/actions'
import { anchorValueYen, nextRaiseYen } from '../src/bidding'
import { generateAuctionCatalog } from '../src/auctions'
import { buildSimContext } from '../src/context'
import {
  acquireLot,
  activeBidCount,
  auctionAcquisitionBudget,
  walkAwayTargetYen,
} from '../src/bots/buyoutHelpers'
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
    laborSlotsSpentToday: 0,
    toolTiers: testToolTiers(),
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    carLedgers: {},
    ...overrides,
  }
}

describe('walkAwayTargetYen (Sprint 27: instanceValue x multiplier x private spread)', () => {
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

describe('acquireLot (Sprint 20 - join/continue a war under a target)', () => {
  it('queues a raise when the next valid raise is within the walk-away target', () => {
    const { lot } = sampleLot('honda-city-e-aa', 'local-yard', 200)
    const state = baseState()
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget(state)
    const raiseToYen = nextRaiseYen(lot, state, CONTEXT)
    const acted = acquireLot(state, lot, raiseToYen, actions, CONTEXT, budget, 1.2)
    expect(acted).toBe(true)
    expect(actions.bidsOnLots).toEqual([{ lotId: lot.id, maxBidYen: raiseToYen }])
    expect(budget.cashCommitted).toBe(raiseToYen)
  })

  it('walks away (queues nothing) when the next raise would exceed the target', () => {
    const { lot } = sampleLot('honda-city-e-aa', 'local-yard', 201)
    const state = baseState()
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget(state)
    const raiseToYen = nextRaiseYen(lot, state, CONTEXT)
    const acted = acquireLot(state, lot, raiseToYen - 1, actions, CONTEXT, budget, 1.2)
    expect(acted).toBe(false)
    expect(actions.bidsOnLots).toEqual([])
    expect(budget.cashCommitted).toBe(0)
  })

  it('holds (queues nothing) when this bot already leads the lot', () => {
    const { lot } = sampleLot('honda-city-e-aa', 'local-yard', 202)
    const leading: AuctionLot = { ...lot, currentBidYen: 500_000, leadingBidder: 'player' }
    const state = baseState()
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget(state)
    const acted = acquireLot(state, leading, 10_000_000, actions, CONTEXT, budget, 1.2)
    expect(acted).toBe(false)
    expect(actions.bidsOnLots).toEqual([])
  })

  it('never buys out - buyoutLots is never populated regardless of target size', () => {
    const { lot } = sampleLot('toyota-supra-rz-jza80', 'premium', 300)
    const state = baseState()
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget(state)
    acquireLot(state, lot, 999_999_999, actions, CONTEXT, budget, 1.2)
    expect(actions.buyoutLots).toEqual([])
  })

  it('returns false and queues nothing when unaffordable under the cash buffer', () => {
    const { lot } = sampleLot('honda-city-e-aa', 'local-yard', 203)
    const state = baseState({ cashYen: 1 })
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget(state)
    const raiseToYen = nextRaiseYen(lot, state, CONTEXT)
    const acted = acquireLot(state, lot, raiseToYen, actions, CONTEXT, budget, 1.2)
    expect(acted).toBe(false)
    expect(actions.bidsOnLots).toEqual([])
    expect(budget.cashCommitted).toBe(0)
  })

  it('accumulates cashCommitted across repeated calls sharing one budget, never overcommitting', () => {
    const { lot: lot1 } = sampleLot('honda-city-e-aa', 'local-yard', 204)
    const { lot: lot2 } = sampleLot('honda-city-e-aa', 'local-yard', 205)
    // Sprint 27: reserve (hence the unopened-lot nextRaise) is guide-value-
    // based, not cash-dependent, so computing the raises against a probe state
    // and then funding the real state off them is safe - reserveYen never
    // reads cashYen.
    const probeState = baseState()
    const raise1 = nextRaiseYen(lot1, probeState, CONTEXT)
    const raise2 = nextRaiseYen(lot2, probeState, CONTEXT)
    // Math.ceil, not Math.round: acquireLot's own gate is `cashYen >=
    // (committed + raise) * cashBufferMultiplier` - a plain round can land
    // fractionally under that exact product and fail the boundary by a
    // rounding artifact unrelated to what this test actually exercises
    // (that both raises fit together under one shared budget).
    const state = baseState({ cashYen: Math.ceil((raise1 + raise2) * 1.2) })
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget(state)
    const first = acquireLot(state, lot1, raise1, actions, CONTEXT, budget, 1.2)
    const second = acquireLot(state, lot2, raise2, actions, CONTEXT, budget, 1.2)
    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(budget.cashCommitted).toBe(raise1 + raise2)
  })

  it('raises again on a lot it was outbid on, as long as still under target', () => {
    const { lot } = sampleLot('honda-city-e-aa', 'local-yard', 206)
    const outbid: AuctionLot = {
      ...lot,
      currentBidYen: 300_000,
      leadingBidder: 'rival',
      playerHasBid: true,
      quietDays: 0,
    }
    const state = baseState()
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget(state)
    const raiseToYen = nextRaiseYen(outbid, state, CONTEXT)
    const acted = acquireLot(state, outbid, raiseToYen, actions, CONTEXT, budget, 1.2)
    expect(acted).toBe(true)
    expect(actions.bidsOnLots).toEqual([{ lotId: outbid.id, maxBidYen: raiseToYen }])
  })
})

describe('auctionAcquisitionBudget', () => {
  it('only counts lots the bot currently leads, not every lot it has ever bid on', () => {
    const leading: AuctionLot = {
      ...sampleLot('honda-city-e-aa', 'local-yard', 207).lot,
      currentBidYen: 300_000,
      leadingBidder: 'player',
    }
    const losing: AuctionLot = {
      ...sampleLot('honda-city-e-aa', 'local-yard', 208).lot,
      currentBidYen: 400_000,
      leadingBidder: 'rival',
      playerHasBid: true,
    }
    const state = baseState({ activeAuctionLots: [leading, losing] })
    expect(auctionAcquisitionBudget(state).cashCommitted).toBe(300_000)
  })
})

describe('activeBidCount', () => {
  it('counts every lot with playerHasBid, including ones currently being lost', () => {
    const leading: AuctionLot = {
      ...sampleLot('honda-city-e-aa', 'local-yard', 209).lot,
      currentBidYen: 300_000,
      leadingBidder: 'player',
      playerHasBid: true,
    }
    const losing: AuctionLot = {
      ...sampleLot('honda-city-e-aa', 'local-yard', 210).lot,
      currentBidYen: 400_000,
      leadingBidder: 'rival',
      playerHasBid: true,
    }
    const untouched: AuctionLot = sampleLot('honda-city-e-aa', 'local-yard', 211).lot
    const state = baseState({ activeAuctionLots: [leading, losing, untouched] })
    expect(activeBidCount(state)).toBe(2)
  })
})
