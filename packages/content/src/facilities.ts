import { z } from 'zod'
import { ReputationTierSchema } from './tags'

/**
 * The three physical capacities a shop has. `service` and `parking` are
 * storage: any owned car may sit there. `forecourt` is display only - a slot
 * a car occupies exactly while listed on a channel that needs a buyer to
 * come and look at it (sprint148.md); it is never a manual move target and
 * never counts toward acquisition capacity.
 */
export const BayKindSchema = z.enum(['service', 'parking', 'forecourt'])

/**
 * Every kind of slot a car can be dragged/dropped or moved into, `BayKind`'s
 * three rented facilities plus the fixed, unpurchasable single body bay
 * (sprint208.md: "the garage gains a dedicated body bay... same slot
 * idiom"). Kept apart from `BayKind` on purpose: the body bay carries no
 * rent, no price ladder and no reputation gate - it is bundled with the shop
 * from day one - so it must never enter the rent/purchase economy
 * (`computeWeeklyRentYen` sums over `BayKindSchema.options`,
 * `FacilitiesSchema`/`nextBayPriceYen` price only the three rented kinds).
 * `SlotKind` is what the move machinery (`moveCarToSlot`/`moveCar` and their
 * session-event payloads) addresses; anything that reads a bay count for
 * money stays on `BayKind`.
 */
export const SlotKindSchema = z.enum(['service', 'parking', 'forecourt', 'body'])

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
  forecourt: BayFacilitySchema,
})

export type BayKind = z.infer<typeof BayKindSchema>
export type SlotKind = z.infer<typeof SlotKindSchema>
export type BayFacility = z.infer<typeof BayFacilitySchema>
export type Facilities = z.infer<typeof FacilitiesSchema>
