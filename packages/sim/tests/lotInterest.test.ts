import { BUYERS, CARS, HIDDEN_ISSUES } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeLotInterest, type AuctionBidder } from '../src/bidding'
import { generateAuctionCatalog, groupHiddenIssuesByZone } from '../src/auctions'
import { createRng } from '../src/rng'

const HIDDEN_ISSUES_BY_ZONE = groupHiddenIssuesByZone(HIDDEN_ISSUES)
const AI_BIDDERS: AuctionBidder[] = BUYERS.map((buyer) => ({ id: buyer.id, buyer }))

function sampleLot(modelId: string, tier: 'local-yard' | 'regional' | 'premium', seed: number) {
  const model = CARS.find((c) => c.id === modelId)
  if (!model) throw new Error('fixture car missing')
  const [lot] = generateAuctionCatalog(
    [model],
    tier,
    HIDDEN_ISSUES_BY_ZONE,
    7,
    1,
    7,
    createRng(seed),
  )
  if (!lot) throw new Error('expected a lot')
  return { lot, model }
}

describe('computeLotInterest', () => {
  it('is deterministic and pure', () => {
    const { lot, model } = sampleLot('honda-city-e-aa', 'local-yard', 1)
    const a = computeLotInterest(lot, model, AI_BIDDERS, {})
    const b = computeLotInterest(lot, model, AI_BIDDERS, {})
    expect(a).toEqual(b)
  })

  it('reports a level and a non-negative contender count', () => {
    const { lot, model } = sampleLot('honda-city-e-aa', 'local-yard', 2)
    const interest = computeLotInterest(lot, model, AI_BIDDERS, {})
    expect(['quiet', 'warm', 'hot', 'frenzy']).toContain(interest.level)
    expect(interest.contenders).toBeGreaterThanOrEqual(0)
  })

  it('brackets the estimate low <= high, and both are zero when nobody is interested', () => {
    const { lot, model } = sampleLot('mazda-savanna-rx7-fc3s', 'regional', 3)
    const interest = computeLotInterest(lot, model, AI_BIDDERS, {})
    expect(interest.estimateLowYen).toBeLessThanOrEqual(interest.estimateHighYen)
    if (interest.contenders === 0) {
      expect(interest.estimateHighYen).toBe(0)
    } else {
      expect(interest.estimateHighYen).toBeGreaterThan(0)
    }
  })

  it('higher precision narrows the estimate band (the auction-scout hook)', () => {
    const { lot, model } = sampleLot('toyota-supra-rz-jza80', 'premium', 4)
    const fuzzy = computeLotInterest(lot, model, AI_BIDDERS, {}, 0)
    const sharp = computeLotInterest(lot, model, AI_BIDDERS, {}, 1)
    if (fuzzy.contenders >= 1) {
      const fuzzyWidth = fuzzy.estimateHighYen - fuzzy.estimateLowYen
      const sharpWidth = sharp.estimateHighYen - sharp.estimateLowYen
      expect(sharpWidth).toBeLessThanOrEqual(fuzzyWidth)
    }
  })

  it('no eligible bidders reads as quiet with a zero estimate', () => {
    const { lot, model } = sampleLot('honda-city-e-aa', 'local-yard', 5)
    const interest = computeLotInterest(lot, model, [], {}) // no rivals at all
    expect(interest.level).toBe('quiet')
    expect(interest.contenders).toBe(0)
    expect(interest.estimateHighYen).toBe(0)
  })
})
