import {
  BUYERS,
  CARS,
  HIDDEN_ISSUES,
  type AuctionLot,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { emptyDayActions } from '../src/actions'
import { anchorValueYen, nextRaiseYen } from '../src/bidding'
import { generateAuctionCatalog, groupHiddenIssuesByComponent } from '../src/auctions'
import { buildSimContext } from '../src/context'
import {
  acquireLot,
  activeBidCount,
  auctionAcquisitionBudget,
  walkAwayTargetYen,
} from '../src/bots/buyoutHelpers'
import { createRng } from '../src/rng'

const CONTEXT = buildSimContext(CARS, [], BUYERS, HIDDEN_ISSUES)
const HIDDEN_ISSUES_BY_COMPONENT = groupHiddenIssuesByComponent(HIDDEN_ISSUES)

function sampleLot(modelId: string, tier: 'local-yard' | 'regional' | 'premium', seed: number) {
  const model = CARS.find((c) => c.id === modelId)
  if (!model) throw new Error('fixture car missing')
  const [lot] = generateAuctionCatalog(
    [model],
    tier,
    HIDDEN_ISSUES_BY_COMPONENT,
    7,
    1,
    createRng(seed),
    CONTEXT.economy,
  )
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
    ownedCars: [],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: [],
    activeListings: [],
    serviceJobOffers: [],
    activeServiceJobs: [],
    serviceBayCount: 1,
    parkingBayCount: 3,
    serviceBayCarIds: [],
    parkingCarIds: [],
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: [],
    pendingPartOrders: [],
    cartPartIds: [],
    stagedCarWork: {},
    marketLedger: { lotSupply: {}, playerSales: {} },
    ...overrides,
  }
}

describe('walkAwayTargetYen', () => {
  it('is the value anchor times the strategy multiplier', () => {
    const { lot } = sampleLot('toyota-supra-rz-jza80', 'premium', 1)
    const state = baseState({ activeAuctionLots: [lot] })
    const anchor = anchorValueYen(lot, state, CONTEXT)
    expect(walkAwayTargetYen(lot, state, CONTEXT, 1.1)).toBe(Math.round(anchor * 1.1))
  })
})

describe('acquireLot (Sprint 20 — join/continue a war under a target)', () => {
  it('queues a raise when the next valid raise is within the walk-away target', () => {
    const { lot } = sampleLot('honda-city-e-aa', 'local-yard', 200)
    const state = baseState()
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget(state)
    const raiseToYen = nextRaiseYen(lot, CONTEXT.economy)
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
    const raiseToYen = nextRaiseYen(lot, CONTEXT.economy)
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

  it('never buys out — buyoutLots is never populated regardless of target size', () => {
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
    const raiseToYen = nextRaiseYen(lot, CONTEXT.economy)
    const acted = acquireLot(state, lot, raiseToYen, actions, CONTEXT, budget, 1.2)
    expect(acted).toBe(false)
    expect(actions.bidsOnLots).toEqual([])
    expect(budget.cashCommitted).toBe(0)
  })

  it('accumulates cashCommitted across repeated calls sharing one budget, never overcommitting', () => {
    const { lot: lot1 } = sampleLot('honda-city-e-aa', 'local-yard', 204)
    const { lot: lot2 } = sampleLot('honda-city-e-aa', 'local-yard', 205)
    const raise1 = nextRaiseYen(lot1, CONTEXT.economy)
    const raise2 = nextRaiseYen(lot2, CONTEXT.economy)
    const state = baseState({ cashYen: Math.round((raise1 + raise2) * 1.2) })
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
    const raiseToYen = nextRaiseYen(outbid, CONTEXT.economy)
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
