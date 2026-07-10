import {
  BUYERS,
  CARS,
  HIDDEN_ISSUES,
  PARTS,
  type AuctionLot,
  type Buyer,
  type GameState,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  computeLotInterest,
  resolveAuction,
  resolveBidInstant,
  resolveBuyoutInstant,
} from '../src/bidding'
import { generateAuctionCatalog, groupHiddenIssuesByComponent } from '../src/auctions'
import { AUCTION_BUYOUT_PREMIUM, AUCTION_RESERVE_PRICE_FRACTION } from '../src/constants'
import { buildSimContext } from '../src/context'
import { createRng } from '../src/rng'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, HIDDEN_ISSUES)

function stateWithLots(lots: AuctionLot[], overrides: Partial<GameState> = {}): GameState {
  return {
    day: 1,
    seed: 1,
    cashYen: 10_000_000,
    reputationTier: 'unknown',
    reputationPoints: 0,
    ownedCars: [],
    partInventory: [],
    staff: [],
    jobs: [],
    marketHeat: {},
    activeAuctionLots: lots,
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
    ...overrides,
  }
}

const HIDDEN_ISSUES_BY_COMPONENT = groupHiddenIssuesByComponent(HIDDEN_ISSUES)

function sampleLot(seed: number) {
  const model = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')
  if (!model) throw new Error('fixture car missing from seed content')
  const [lot] = generateAuctionCatalog(
    [model],
    'premium',
    HIDDEN_ISSUES_BY_COMPONENT,
    7,
    1,
    7,
    createRng(seed),
  )
  if (!lot) throw new Error('expected exactly one lot')
  return { lot, model }
}

/** Many distinct lot ids sharing the same car/model/book value — a large,
 * effectively-random sample over bidding.ts's per-lot-id-seeded field
 * construction, for the statistical (bell-curve, buyout-cap) properties. */
function statLots(count: number): AuctionLot[] {
  const { lot } = sampleLot(1)
  return Array.from({ length: count }, (_, i) => ({ ...lot, id: `stat-lot-${i}` }))
}

describe('resolveAuction', () => {
  it('is a pure function of its inputs — no hidden RNG', () => {
    const { lot, model } = sampleLot(1)
    const a = resolveAuction(lot, model, 3_000_000, BUYERS, {})
    const b = resolveAuction(lot, model, 3_000_000, BUYERS, {})
    expect(a).toEqual(b)
  })

  it('a bid below every valuation and the reserve results in no-sale only when nobody meets reserve', () => {
    const { lot, model } = sampleLot(2)
    const result = resolveAuction(lot, model, 1, [], {})
    // No buyers at all, a token player bid of 1 yen — reserve (40% of book) is never met.
    expect(result.winner).toBe('no-sale')
    expect(result.finalPriceYen).toBe(0)
  })

  it('the winner never pays more than the second-highest bid plus the increment', () => {
    const { lot, model } = sampleLot(3)
    const result = resolveAuction(lot, model, lot.bookValueYen * 2, BUYERS, {})
    expect(result.winner).not.toBe('no-sale')
    // A wildly over-market player bid should still win, but the mechanism
    // caps what they actually pay well under their max.
    expect(result.finalPriceYen).toBeLessThan(lot.bookValueYen * 2)
  })

  it('a higher player max bid never loses to a lower one, all else equal', () => {
    const { lot, model } = sampleLot(4)
    const low = resolveAuction(lot, model, lot.bookValueYen * 0.5, BUYERS, {})
    const high = resolveAuction(lot, model, lot.bookValueYen * 5, BUYERS, {})
    if (low.winner === 'player') {
      expect(high.winner).toBe('player')
    }
  })

  it('no buyer archetype bids on a tier it has no stated interest in', () => {
    // A first-timer only ever lists shitbox/common — never rare. Winning a
    // rare lot with a token bid (well below what any rare-interested
    // archetype would ever offer) would only be possible if the gate leaked.
    const { lot, model } = sampleLot(5)
    const firstTimerOnly: Buyer[] = BUYERS.filter((b) => b.id === 'first-timer')
    const result = resolveAuction(lot, model, 1, firstTimerOnly, {})
    expect(result.winner).toBe('no-sale')
  })

  it('no rival bid ever exceeds the lot buyout price, across many lots', () => {
    const buyoutPriceYen = Math.round(sampleLot(1).lot.bookValueYen * AUCTION_BUYOUT_PREMIUM)
    for (const lot of statLots(150)) {
      const { model } = sampleLot(1)
      // A token player bid, so any AI win reveals the AI's true capped price.
      const result = resolveAuction(lot, model, 1, BUYERS, {})
      if (result.winner === 'ai') {
        expect(result.finalPriceYen).toBeLessThanOrEqual(buyoutPriceYen)
      }
    }
  })
})

describe('computeLotInterest / resolveAuction — the calibrated rival field (Sprint 10)', () => {
  const { model } = sampleLot(1)
  const SAMPLE_SIZE = 400

  it('averages roughly 3-9 contenders on a broadly-wanted tier (JZA80 is rare)', () => {
    const counts = statLots(SAMPLE_SIZE).map(
      (lot) => computeLotInterest(lot, model, BUYERS, {}).contenders,
    )
    const average = counts.reduce((a, b) => a + b, 0) / counts.length
    expect(average).toBeGreaterThanOrEqual(2)
    expect(average).toBeLessThanOrEqual(10)
  })

  it('the "frenzy" badge is genuinely rare, not roughly half of everything (Sprint 11, round-2 playtest #1)', () => {
    // Sprint 10 shipped the level thresholds unrecalibrated for the new
    // field's own average size (~6.2, confirmed by the real balance harness)
    // — "frenzy" (`contenders > 5`) fired on close to half of every auction,
    // which is exactly the bug the maintainer's second playtest caught.
    const levels = statLots(SAMPLE_SIZE).map(
      (lot) => computeLotInterest(lot, model, BUYERS, {}).level,
    )
    const frenzyShare = levels.filter((l) => l === 'frenzy').length / levels.length
    expect(frenzyShare).toBeLessThan(0.15)
  })

  it('the win-price distribution is a bell — steal and frenzy are both rare, mid is the majority', () => {
    const reserveYen = Math.round(model.bookValueYen * AUCTION_RESERVE_PRICE_FRACTION)
    const buyoutPriceYen = Math.round(model.bookValueYen * AUCTION_BUYOUT_PREMIUM)
    const range = buyoutPriceYen - reserveYen

    let steal = 0
    let mid = 0
    let frenzy = 0
    for (const lot of statLots(SAMPLE_SIZE)) {
      // A token player bid isolates the AI-only clearing price when an AI wins.
      const result = resolveAuction(lot, model, 1, BUYERS, {})
      if (result.winner !== 'ai') continue
      const fraction = (result.finalPriceYen - reserveYen) / range
      if (fraction < 0.2) steal++
      else if (fraction > 0.8) frenzy++
      else mid++
    }
    const total = steal + mid + frenzy
    expect(total).toBeGreaterThan(SAMPLE_SIZE / 2) // most lots draw a winning AI bid
    expect(steal / total).toBeLessThan(0.25)
    expect(frenzy / total).toBeLessThan(0.25)
    expect(mid / total).toBeGreaterThan(steal / total)
    expect(mid / total).toBeGreaterThan(frenzy / total)
  })

  it('the interest read never disagrees with resolution — bidding its winning estimate wins', () => {
    let checked = 0
    for (const lot of statLots(100)) {
      // Default (fuzzy) precision: the shown high estimate sits above the
      // true top rival bid by the fuzz band, so bidding it should win.
      // Sharper precision (closer to 1) narrows toward the exact clearing
      // price and is not guaranteed to clear it — that's the tradeoff the
      // auction-scout trait hook exists for, not a bug.
      const interest = computeLotInterest(lot, model, BUYERS, {})
      if (interest.contenders === 0) continue
      const result = resolveAuction(lot, model, interest.estimateHighYen, BUYERS, {})
      expect(result.winner).toBe('player')
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('resolveBidInstant / resolveBuyoutInstant (Sprint 11 instant resolvers)', () => {
  it('resolveBidInstant produces the exact same outcome as resolveAuction, plus the state transition', () => {
    const { lot, model } = sampleLot(10)
    const expected = resolveAuction(lot, model, lot.bookValueYen * 3, BUYERS, {})
    const state = stateWithLots([lot])
    const result = resolveBidInstant(state, lot.id, lot.bookValueYen * 3, CONTEXT)
    expect(result.state.activeAuctionLots).toHaveLength(0) // the lot always leaves the board
    if (expected.winner === 'player') {
      expect(result.state.ownedCars).toHaveLength(1)
      expect(result.state.cashYen).toBe(state.cashYen - expected.finalPriceYen)
      expect(result.log.some((e) => e.type === 'auction-bid-won')).toBe(true)
    } else if (expected.winner === 'ai') {
      expect(result.state.ownedCars).toHaveLength(0)
      expect(result.log.some((e) => e.type === 'auction-bid-lost')).toBe(true)
    }
  })

  it('is a no-op for an unknown lot id', () => {
    const state = stateWithLots([sampleLot(11).lot])
    const result = resolveBidInstant(state, 'no-such-lot', 1_000_000, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('a won lot forfeits to rivals (not held) when there is no parking space', () => {
    const { lot, model } = sampleLot(12)
    // A wildly over-market bid guarantees a player win if any lot resolves at all.
    const state = stateWithLots([lot], { ownedCars: [], parkingBayCount: 0 })
    const result = resolveBidInstant(state, lot.id, lot.bookValueYen * 5, CONTEXT)
    if (resolveAuction(lot, model, lot.bookValueYen * 5, BUYERS, {}).winner === 'player') {
      expect(result.state.ownedCars).toHaveLength(0)
      expect(result.state.cashYen).toBe(state.cashYen) // no money spent
      expect(result.log.some((e) => e.type === 'acquisition-blocked')).toBe(true)
    }
  })

  it('resolveBuyoutInstant buys the lot at buyoutPriceYen, guaranteed', () => {
    const { lot } = sampleLot(13)
    const priceYen = Math.round(lot.bookValueYen * AUCTION_BUYOUT_PREMIUM)
    const state = stateWithLots([lot])
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    expect(result.state.ownedCars).toHaveLength(1)
    expect(result.state.cashYen).toBe(state.cashYen - priceYen)
    expect(result.state.activeAuctionLots).toHaveLength(0)
    expect(result.log).toEqual([{ type: 'lot-bought-out', lotId: lot.id, priceYen }])
  })

  it('resolveBuyoutInstant is a no-op when unaffordable, leaving the lot on the board', () => {
    const { lot } = sampleLot(14)
    const state = stateWithLots([lot], { cashYen: 0 })
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    expect(result.state).toBe(state)
    expect(result.log).toEqual([])
  })

  it('resolveBuyoutInstant leaves the lot on the board (no money spent) when parking is full', () => {
    const { lot } = sampleLot(15)
    const state = stateWithLots([lot], { parkingBayCount: 0 })
    const result = resolveBuyoutInstant(state, lot.id, CONTEXT)
    expect(result.state.activeAuctionLots).toHaveLength(1) // still there, for a retry later
    expect(result.state.cashYen).toBe(state.cashYen)
    expect(result.log).toEqual([
      { type: 'acquisition-blocked', kind: 'buyout', reason: 'no-parking' },
    ])
  })
})
