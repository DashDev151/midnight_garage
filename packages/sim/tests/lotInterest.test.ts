import { BUYERS, CARS, HIDDEN_ISSUES } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { computeLotInterest } from '../src/bidding'
import { generateAuctionCatalog, groupHiddenIssuesByComponent } from '../src/auctions'
import { createRng } from '../src/rng'

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
  )
  if (!lot) throw new Error('expected a lot')
  return { lot, model }
}

describe('computeLotInterest', () => {
  it('is deterministic and pure', () => {
    const { lot, model } = sampleLot('honda-city-e-aa', 'local-yard', 1)
    const a = computeLotInterest(lot, model, BUYERS, {})
    const b = computeLotInterest(lot, model, BUYERS, {})
    expect(a).toEqual(b)
  })

  it('reports a level and a non-negative contender count', () => {
    const { lot, model } = sampleLot('honda-city-e-aa', 'local-yard', 2)
    const interest = computeLotInterest(lot, model, BUYERS, {})
    expect(['quiet', 'warm', 'hot', 'frenzy']).toContain(interest.level)
    expect(interest.contenders).toBeGreaterThanOrEqual(0)
  })

  it('brackets the estimate low <= high, and both are zero when nobody is interested', () => {
    const { lot, model } = sampleLot('mazda-savanna-rx7-fc3s', 'regional', 3)
    const interest = computeLotInterest(lot, model, BUYERS, {})
    expect(interest.estimateLowYen).toBeLessThanOrEqual(interest.estimateHighYen)
    if (interest.contenders === 0) {
      expect(interest.estimateHighYen).toBe(0)
    } else {
      expect(interest.estimateHighYen).toBeGreaterThan(0)
    }
  })

  it('higher precision narrows the estimate band (the auction-scout hook)', () => {
    const { lot, model } = sampleLot('toyota-supra-rz-jza80', 'premium', 4)
    const fuzzy = computeLotInterest(lot, model, BUYERS, {}, 0)
    const sharp = computeLotInterest(lot, model, BUYERS, {}, 1)
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

  it('gates by stated tier interest — a collector (legend/gaisha/rare/uncommon only) never reads interest on a shitbox', () => {
    const { lot, model } = sampleLot('honda-city-e-aa', 'local-yard', 6)
    expect(model.tier).toBe('shitbox')
    const collectorOnly = BUYERS.filter((b) => b.id === 'collector')
    const interest = computeLotInterest(lot, model, collectorOnly, {})
    expect(interest.level).toBe('quiet')
    expect(interest.contenders).toBe(0)
  })

  describe('the calibrated field size (Sprint 10 decision 4b/4f)', () => {
    it('scales its mean contender count with how many archetypes want the tier', () => {
      // 'rare' (JZA80) draws four interested archetypes (collector, tuner,
      // stancer, racer); 'shitbox' (City) draws exactly one (first-timer).
      // A broadly-wanted tier should show a visibly bigger average field.
      const SAMPLE = 250
      const rareTotal = Array.from({ length: SAMPLE }, (_, i) => {
        const { lot, model } = sampleLot('toyota-supra-rz-jza80', 'premium', 100 + i)
        return computeLotInterest({ ...lot, id: `rare-${i}` }, model, BUYERS, {}).contenders
      }).reduce((a, b) => a + b, 0)
      const shitboxTotal = Array.from({ length: SAMPLE }, (_, i) => {
        const { lot, model } = sampleLot('honda-city-e-aa', 'local-yard', 100 + i)
        return computeLotInterest({ ...lot, id: `shitbox-${i}` }, model, BUYERS, {}).contenders
      }).reduce((a, b) => a + b, 0)
      expect(rareTotal / SAMPLE).toBeGreaterThan(shitboxTotal / SAMPLE)
    })
  })
})
