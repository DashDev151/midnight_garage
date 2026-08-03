import { ReputationTierSchema, type ReputationTier } from '@midnight-garage/content'

/**
 * The photo wall shows reputation with no number at all - "a new shop has
 * three curling snapshots, a legend has a wall you cannot see the paint
 * through" - so the count a screen stamps up cannot come from a fresh
 * threshold, only from the tier the game already carries. `ReputationTier`
 * has exactly five rungs (`ReputationTierSchema`, content); this reads a
 * shop's rank among them and scales the one number the design already
 * names for the bottom rung - three snapshots for a brand new shop - by
 * that rank, so a legend's wall carries five times the coverage a new
 * shop's does without a second scale being invented anywhere.
 */
const TIER_ORDER = ReputationTierSchema.options
const NEW_SHOP_PHOTO_COUNT = 3

export function photoCountForReputationTier(tier: ReputationTier): number {
  const rank = Math.max(0, TIER_ORDER.indexOf(tier))
  return NEW_SHOP_PHOTO_COUNT * (rank + 1)
}
