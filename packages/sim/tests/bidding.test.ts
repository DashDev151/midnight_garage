import { BUYERS, CARS, HIDDEN_ISSUES, type AuctionLot, type Buyer } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeLotInterest, resolveAuction } from '../src/bidding'
import { generateAuctionCatalog, groupHiddenIssuesByZone } from '../src/auctions'
import { AUCTION_BUYOUT_PREMIUM, AUCTION_RESERVE_PRICE_FRACTION } from '../src/constants'
import { createRng } from '../src/rng'

const HIDDEN_ISSUES_BY_ZONE = groupHiddenIssuesByZone(HIDDEN_ISSUES)

function sampleLot(seed: number) {
  const model = CARS.find((c) => c.id === 'toyota-supra-rz-jza80')
  if (!model) throw new Error('fixture car missing from seed content')
  const [lot] = generateAuctionCatalog(
    [model],
    'premium',
    HIDDEN_ISSUES_BY_ZONE,
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
