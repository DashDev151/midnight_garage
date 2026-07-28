import { z } from 'zod'
import { CarTierSchema } from './tags'
import { StatBlockSchema } from './stats'

export const BuyerArchetypeSchema = z.enum([
  'collector',
  'tuner',
  'stancer',
  'racer',
  'first-timer',
])

/** Taste by market position: which league of car this archetype turns up for.
 * No entry for a tier means the archetype never bids on it - there is no
 * default fallback (`interestedBuyers`, sim/bidding.ts). */
const TierPreferenceSchema = z.object({
  tier: CarTierSchema,
  weight: z.number().min(0),
})

export const BuyerSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  archetype: BuyerArchetypeSchema,
  displayName: z.string().min(1),
  statWeights: StatBlockSchema,
  tierPreferences: z.array(TierPreferenceSchema).default([]),
  priceSensitivity: z.number().min(0).max(1).default(0.5),
  /**
   * One authored line naming this archetype's want, shown alongside an
   * offer so the want IS the read (design doc `selling-rework.md` section
   * 3) - the want is the taste ceiling, surfaced rather than hidden.
   * Orchestrator-authored copy, transplanted verbatim from
   * `docs/sprints/sprint114.md`'s "Authored copy" section.
   */
  wantLine: z.string().min(1),
})

export const BuyersSchema = z.array(BuyerSchema).min(1)

export type BuyerArchetype = z.infer<typeof BuyerArchetypeSchema>
export type Buyer = z.infer<typeof BuyerSchema>
