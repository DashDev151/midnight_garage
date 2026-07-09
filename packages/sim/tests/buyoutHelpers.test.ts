import { BUYERS, CARS, HIDDEN_ISSUES, type GameState } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { emptyDayActions } from '../src/actions'
import { generateAuctionCatalog, groupHiddenIssuesByComponent } from '../src/auctions'
import { buildSimContext } from '../src/context'
import { AUCTION_BUYOUT_PREMIUM } from '../src/constants'
import { acquireLot, auctionAcquisitionBudget, shouldBuyout } from '../src/bots/buyoutHelpers'
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
    7,
    createRng(seed),
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
    laborSlotsSpentToday: 0,
    ownedEquipmentIds: [],
    pendingPartOrders: [],
    cartPartIds: [],
    ...overrides,
  }
}

describe('shouldBuyout', () => {
  it('buys out a much smaller share of quiet shitbox lots than hotly-contested premium ones', () => {
    // shitbox tier draws exactly one interested archetype (first-timer), so
    // it's rarely competitive; 'rare' (JZA80) draws four. A relative
    // comparison over a broad sample is the honest claim — not "shitbox
    // lots never trigger it" (a single interested bidder's noise can still
    // occasionally push the estimate close to buyout), just "far less often."
    const shitboxModel = CARS.find((c) => c.id === 'honda-city-e-aa')!
    const shitboxShare =
      Array.from({ length: 80 }, (_, i) =>
        shouldBuyout(
          sampleLot('honda-city-e-aa', 'local-yard', 200 + i).lot,
          shitboxModel,
          CONTEXT,
        ),
      ).filter(Boolean).length / 80

    const rareModel = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')!
    const rareShare =
      Array.from({ length: 80 }, (_, i) =>
        shouldBuyout(
          sampleLot('toyota-supra-rz-jza80', 'premium', 300 + i).lot,
          rareModel,
          CONTEXT,
        ),
      ).filter(Boolean).length / 80

    expect(rareShare).toBeGreaterThan(shitboxShare)
  })

  it('does buy out at least some hotly-contested premium lots', () => {
    // A broad sample over many seeds should trigger the buyout branch at
    // least sometimes if the mechanism engages at all, without asserting an
    // exact fraction (that's what the real harness run measures, not a unit
    // test's job).
    const model = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')!
    const results = Array.from({ length: 80 }, (_, i) =>
      shouldBuyout(sampleLot('toyota-supra-rz-jza80', 'premium', 300 + i).lot, model, CONTEXT),
    )
    expect(results.some(Boolean)).toBe(true)
  })
})

describe('acquireLot', () => {
  it('queues a bid when shouldBuyout is false', () => {
    const { lot, model } = sampleLot('honda-city-e-aa', 'local-yard', 200)
    const state = baseState()
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget()
    const acted = acquireLot(state, lot, model, lot.bookValueYen, actions, CONTEXT, budget, 1.2)
    expect(acted).toBe(true)
    expect(actions.bidsOnLots).toEqual([{ lotId: lot.id, maxBidYen: lot.bookValueYen }])
    expect(actions.buyoutLots).toEqual([])
    expect(budget.cashCommitted).toBe(lot.bookValueYen)
  })

  it('queues a buyout instead of a bid when shouldBuyout is true', () => {
    // Find a seed in the hot sample above where shouldBuyout actually fires.
    const model = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')!
    let lot
    for (let i = 0; i < 80; i++) {
      const candidate = sampleLot('toyota-supra-rz-jza80', 'premium', 300 + i).lot
      if (shouldBuyout(candidate, model, CONTEXT)) {
        lot = candidate
        break
      }
    }
    if (!lot) throw new Error('expected at least one buyout-triggering sample')

    const state = baseState()
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget()
    const buyoutPriceYen = Math.round(lot.bookValueYen * AUCTION_BUYOUT_PREMIUM)
    const acted = acquireLot(state, lot, model, lot.bookValueYen, actions, CONTEXT, budget, 1.2)
    expect(acted).toBe(true)
    expect(actions.buyoutLots).toEqual([{ lotId: lot.id }])
    expect(actions.bidsOnLots).toEqual([])
    expect(budget.cashCommitted).toBe(buyoutPriceYen)
  })

  it('returns false and queues nothing when unaffordable', () => {
    const { lot, model } = sampleLot('honda-city-e-aa', 'local-yard', 200)
    const state = baseState({ cashYen: 1 })
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget()
    const acted = acquireLot(state, lot, model, lot.bookValueYen, actions, CONTEXT, budget, 1.2)
    expect(acted).toBe(false)
    expect(actions.bidsOnLots).toEqual([])
    expect(actions.buyoutLots).toEqual([])
    expect(budget.cashCommitted).toBe(0)
  })

  it('never buys out when no model is passed (falls back to bidding)', () => {
    const { lot } = sampleLot('honda-city-e-aa', 'local-yard', 200)
    const state = baseState()
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget()
    acquireLot(state, lot, undefined, lot.bookValueYen, actions, CONTEXT, budget, 1.2)
    expect(actions.buyoutLots).toEqual([])
    expect(actions.bidsOnLots).toEqual([{ lotId: lot.id, maxBidYen: lot.bookValueYen }])
  })

  it('accumulates cashCommitted across repeated calls sharing one budget', () => {
    const { lot: lot1, model } = sampleLot('honda-city-e-aa', 'local-yard', 201)
    const { lot: lot2 } = sampleLot('honda-city-e-aa', 'local-yard', 202)
    const state = baseState()
    const actions = emptyDayActions()
    const budget = auctionAcquisitionBudget()
    acquireLot(state, lot1, model, lot1.bookValueYen, actions, CONTEXT, budget, 1.2)
    acquireLot(state, lot2, model, lot2.bookValueYen, actions, CONTEXT, budget, 1.2)
    expect(budget.cashCommitted).toBe(lot1.bookValueYen + lot2.bookValueYen)
  })
})
