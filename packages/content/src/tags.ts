import { z } from 'zod'

/**
 * Closed set of platform tags (GDD 4.4). Tags drive part compatibility,
 * buyer preferences, and event suitability - kept as an enum, not free
 * strings, so a typo can never silently create an unmatched tag.
 */
export const TagSchema = z.enum([
  // layout
  'FR',
  'FF',
  'AWD',
  'MR',
  'RR',
  // induction
  'NA',
  'Turbo',
  'Supercharged',
  // engine family
  'Piston',
  'Rotary',
  // class
  'Kei',
  // decade
  '70s',
  '80s',
  '90s',
  '00s',
  // origin
  'JDM',
  'Gaisha',
])

/**
 * The 8 real car components (Sprint 12 - replaces the old split of 5
 * `condition` zones + 7 `buildSheet` slots, which had different key sets and
 * no shared identity; see docs/design/repair-replace-progression.md). Every
 * component has both a condition and an optional installed part.
 */
export const ComponentIdSchema = z.enum([
  'engine',
  'forcedInduction',
  'drivetrain',
  'suspension',
  'brakes',
  'wheels',
  'body',
  'interior',
])

export const GradeSchema = z.enum(['stock', 'street', 'sport', 'race'])

export const RarityTierSchema = z.enum([
  'shitbox',
  'common',
  'uncommon',
  'rare',
  'gaisha',
  'legend',
])

export const ReputationTierSchema = z.enum(['unknown', 'local', 'known', 'respected', 'legend'])

export type Tag = z.infer<typeof TagSchema>
export type ComponentId = z.infer<typeof ComponentIdSchema>
export type Grade = z.infer<typeof GradeSchema>
export type RarityTier = z.infer<typeof RarityTierSchema>
export type ReputationTier = z.infer<typeof ReputationTierSchema>
