import { z } from 'zod'
import { RarityTierSchema } from './tags'
import { StatBlockSchema } from './stats'

export const BuyerArchetypeSchema = z.enum([
  'collector',
  'tuner',
  'stancer',
  'racer',
  'first-timer',
])

const TierPreferenceSchema = z.object({
  tier: RarityTierSchema,
  weight: z.number().min(0),
})

export const BuyerSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  archetype: BuyerArchetypeSchema,
  displayName: z.string().min(1),
  statWeights: StatBlockSchema,
  tierPreferences: z.array(TierPreferenceSchema).default([]),
  priceSensitivity: z.number().min(0).max(1).default(0.5),
})

export const BuyersSchema = z.array(BuyerSchema).min(1)

export type BuyerArchetype = z.infer<typeof BuyerArchetypeSchema>
export type Buyer = z.infer<typeof BuyerSchema>
