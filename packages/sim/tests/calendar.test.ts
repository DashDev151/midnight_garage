import { ReputationTierSchema, type ReputationTier } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { currentGameYear, reputationAtLeast } from '../src/calendar'

describe('currentGameYear', () => {
  it('starts the campaign in 1995 at unknown reputation (GDD 2.2)', () => {
    expect(currentGameYear('unknown')).toBe(1995)
  })

  it('advances 2 years per reputation tier, in tier order', () => {
    const tiers = ReputationTierSchema.options
    const years = tiers.map((tier) => currentGameYear(tier))
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBe(years[i - 1]! + 2)
    }
    expect(currentGameYear('legend')).toBe(1995 + 2 * (tiers.length - 1))
  })
})

describe('reputationAtLeast', () => {
  it('is true when current tier is the same as the minimum', () => {
    expect(reputationAtLeast('known', 'known')).toBe(true)
  })

  it('is true when current tier outranks the minimum, false when it falls short', () => {
    expect(reputationAtLeast('legend', 'respected')).toBe(true)
    expect(reputationAtLeast('local', 'respected')).toBe(false)
  })

  it('agrees with tier order for every pair (no off-by-one at the boundaries)', () => {
    const tiers = ReputationTierSchema.options
    tiers.forEach((current: ReputationTier, i) => {
      tiers.forEach((min: ReputationTier, j) => {
        expect(reputationAtLeast(current, min)).toBe(i >= j)
      })
    })
  })
})
