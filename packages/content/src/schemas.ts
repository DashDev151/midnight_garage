import { z } from 'zod'

export const RarityTierSchema = z.enum([
  'shitbox',
  'common',
  'uncommon',
  'rare',
  'gaisha',
  'legend',
])

/**
 * Naming Layer (GDD 2.4): `spec` holds real, immutable data that is
 * unprotectable fact; `displayName` and `brand` are the only fields a
 * parody-name flip may touch. Full indirection lands in Sprint 1.
 */
export const CarModelSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  displayName: z.string().min(1),
  brand: z.string().min(1),
  spec: z.object({
    chassisCode: z.string().min(1),
    engineCode: z.string().min(1),
    yearFrom: z.number().int().gte(1955).lte(2010),
    curbWeightKg: z.number().int().positive(),
    stockPowerPs: z.number().int().positive(),
    drivetrain: z.enum(['FR', 'FF', 'AWD', 'MR', 'RR']),
  }),
  tier: RarityTierSchema,
  tags: z.array(z.string()),
})

export const CarModelsSchema = z.array(CarModelSchema).min(1)

export type RarityTier = z.infer<typeof RarityTierSchema>
export type CarModel = z.infer<typeof CarModelSchema>
