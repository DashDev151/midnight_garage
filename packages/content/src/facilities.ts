import { z } from 'zod'

/** The two physical capacities a shop has (Sprint 09). */
export const BayKindSchema = z.enum(['service', 'parking'])

/**
 * One bay kind's progression: how many you start with, the hard ceiling, and
 * the yen price of each purchasable bay in order (the Nth-purchased bay's
 * price is `bayPricesYen[N-1]`). Array length must equal `maxCount -
 * startCount` — every purchasable step needs a price.
 */
const BayFacilitySchema = z
  .object({
    startCount: z.number().int().positive(),
    maxCount: z.number().int().positive(),
    bayPricesYen: z.array(z.number().int().positive()),
  })
  .refine((f) => f.bayPricesYen.length === f.maxCount - f.startCount, {
    message: 'bayPricesYen length must equal maxCount - startCount',
  })

export const FacilitiesSchema = z.object({
  service: BayFacilitySchema,
  parking: BayFacilitySchema,
})

export type BayKind = z.infer<typeof BayKindSchema>
export type BayFacility = z.infer<typeof BayFacilitySchema>
export type Facilities = z.infer<typeof FacilitiesSchema>
