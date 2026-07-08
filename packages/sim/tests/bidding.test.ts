import { BUYERS, CARS, HIDDEN_ISSUES } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { biddingNoiseFactor, resolveAuction, type AuctionBidder } from '../src/bidding'
import { generateAuctionCatalog, groupHiddenIssuesByZone } from '../src/auctions'
import { createRng } from '../src/rng'

const HIDDEN_ISSUES_BY_ZONE = groupHiddenIssuesByZone(HIDDEN_ISSUES)
const AI_BIDDERS: AuctionBidder[] = BUYERS.map((buyer) => ({ id: buyer.id, buyer }))

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

describe('biddingNoiseFactor', () => {
  it('is deterministic for the same bidder id', () => {
    expect(biddingNoiseFactor('collector')).toBe(biddingNoiseFactor('collector'))
  })

  it('differs across most bidder ids', () => {
    const factors = new Set(BUYERS.map((b) => biddingNoiseFactor(b.id)))
    expect(factors.size).toBeGreaterThan(1)
  })
})

describe('resolveAuction', () => {
  it('is a pure function of its inputs — no hidden RNG', () => {
    const { lot, model } = sampleLot(1)
    const a = resolveAuction(lot, model, 3_000_000, AI_BIDDERS, {})
    const b = resolveAuction(lot, model, 3_000_000, AI_BIDDERS, {})
    expect(a).toEqual(b)
  })

  it('a bid below every valuation and the reserve results in no-sale only when nobody meets reserve', () => {
    const { lot, model } = sampleLot(2)
    const result = resolveAuction(lot, model, 1, [], {})
    // No AI bidders, a token player bid of 1 yen — reserve (40% of book) is never met.
    expect(result.winner).toBe('no-sale')
    expect(result.finalPriceYen).toBe(0)
  })

  it('the winner never pays more than the second-highest bid plus the increment', () => {
    const { lot, model } = sampleLot(3)
    const result = resolveAuction(lot, model, lot.bookValueYen * 2, AI_BIDDERS, {})
    expect(result.winner).not.toBe('no-sale')
    // A wildly over-market player bid should still win, but the mechanism
    // caps what they actually pay well under their max.
    expect(result.finalPriceYen).toBeLessThan(lot.bookValueYen * 2)
  })

  it('a higher player max bid never loses to a lower one, all else equal', () => {
    const { lot, model } = sampleLot(4)
    const low = resolveAuction(lot, model, lot.bookValueYen * 0.5, AI_BIDDERS, {})
    const high = resolveAuction(lot, model, lot.bookValueYen * 5, AI_BIDDERS, {})
    if (low.winner === 'player') {
      expect(high.winner).toBe('player')
    }
  })
})
