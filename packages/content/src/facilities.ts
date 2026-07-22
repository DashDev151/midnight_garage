import { z } from 'zod'
import { ReputationTierSchema } from './tags'

/** The two physical capacities a shop has. */
export const BayKindSchema = z.enum(['service', 'parking'])

/**
 * One bay kind's progression: how many you start with, the hard ceiling, and
 * the yen price of each purchasable bay in order (the Nth-purchased bay's
 * price is `bayPricesYen[N-1]`). Array length must equal `maxCount -
 * startCount` - every purchasable step needs a price. `minReputationTier`
 * is the same shape, one entry per purchasable rung - a coarse banding, not
 * a unique threshold per rung: bays require both cash and reputation, mirroring
 * equipment's existing gate.
 */
const BayFacilitySchema = z
  .object({
    startCount: z.number().int().positive(),
    maxCount: z.number().int().positive(),
    bayPricesYen: z.array(z.number().int().positive()),
    minReputationTier: z.array(ReputationTierSchema),
  })
  .refine((f) => f.bayPricesYen.length === f.maxCount - f.startCount, {
    message: 'bayPricesYen length must equal maxCount - startCount',
  })
  .refine((f) => f.minReputationTier.length === f.bayPricesYen.length, {
    message: 'minReputationTier length must equal bayPricesYen length',
  })

export const FacilitiesSchema = z.object({
  service: BayFacilitySchema,
  parking: BayFacilitySchema,
})

export type BayKind = z.infer<typeof BayKindSchema>
export type BayFacility = z.infer<typeof BayFacilitySchema>
export type Facilities = z.infer<typeof FacilitiesSchema>
