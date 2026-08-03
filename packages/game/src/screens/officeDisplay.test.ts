import { ReputationTierSchema } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { photoCountForReputationTier } from './officeDisplay'

/**
 * The photo wall needs no reputation number of its own: the count comes
 * from the tier's rank among the five the game already has, scaled by the
 * three-snapshot starting count the design names for a new shop. A new
 * shop reads exactly three, matching the sample the art module bakes in
 * for the same reason, and every rung above it carries visibly more.
 */
describe('photoCountForReputationTier', () => {
  it('gives a new shop exactly three photographs', () => {
    expect(photoCountForReputationTier('unknown')).toBe(3)
  })

  it('grows strictly with every rung, one multiple of three per tier', () => {
    const counts = ReputationTierSchema.options.map((tier) => photoCountForReputationTier(tier))
    expect(counts).toEqual([3, 6, 9, 12, 15])
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeGreaterThan(counts[i - 1]!)
  })
})
