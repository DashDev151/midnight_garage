import { z } from 'zod'
import { CarInstanceSchema } from './carInstance'
import { ComponentIdSchema } from './tags'

/**
 * What a customer job actually asks for. The player satisfies it with the
 * normal build/repair system on the customer's car:
 *  - `repair` a component's condition back to 100 (labor only), or
 *  - `install` a part onto a component (buy the part at the market, then fit it).
 */
export const ServiceJobWorkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('repair'), componentId: ComponentIdSchema }),
  z.object({ kind: z.literal('install'), componentId: ComponentIdSchema }),
])

/**
 * A service-job type (GDD Act 1 "job cards") — one entry per repair zone or
 * install slot (Sprint 11), not one entry per customer. A generated offer
 * composes a type + an independently-picked customer name + an independently
 * -picked flavor line, so a flavor line can never be paired with a `work` it
 * wasn't written for (Sprint 10's "brakes" flavor text on a suspension job
 * bug is structurally impossible under this model — see sprint11.md decision
 * 5). `flavorPool` needs at least 2 entries so generation has real variety.
 */
export const ServiceJobTypeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  work: ServiceJobWorkSchema,
  payoutRangeYen: z
    .tuple([z.number().int().positive(), z.number().int().positive()])
    .refine(([min, max]) => min <= max, 'payoutRangeYen must be [min, max] with min <= max'),
  /** Reputation for completing (multiplied by the installed part's grade for install jobs). */
  baseReputation: z.number().int().nonnegative(),
  flavorPool: z.array(z.string().min(1)).min(2, 'each job type needs at least 2 flavor variants'),
})

export const ServiceJobTypesSchema = z.array(ServiceJobTypeSchema).min(1)

/** Customer names, decoupled entirely from job type — a name has nothing to do with what's broken. */
export const ServiceJobCustomerNamesSchema = z.array(z.string().min(1)).min(1)

/**
 * A live offered/accepted service job — a snapshot of the generated
 * composition (type + rolled payout + picked name + picked flavor line) plus
 * the actual customer car (offered ones show it; accepted ones have it in
 * the shop). The work is tracked on the car via the normal job/labor system,
 * not here.
 */
export const ServiceJobSchema = z.object({
  id: z.string().min(1),
  typeId: z.string().min(1),
  customerName: z.string().min(1),
  description: z.string().min(1),
  work: ServiceJobWorkSchema,
  /** The customer's car — worked on in the shop, never owned. */
  car: CarInstanceSchema,
  payoutYen: z.number().int().positive(),
  baseReputation: z.number().int().nonnegative(),
  /** Day the offer leaves the board if not accepted. */
  expiresOnDay: z.number().int().positive(),
  /**
   * Work deadline once accepted (null while still an offer). By this day the
   * job must be handed back or it auto-resolves: paid if the work is done,
   * failed (reputation penalty, no pay) if not.
   */
  dueOnDay: z.number().int().positive().nullable().default(null),
})

export const ServiceJobsSchema = z.array(ServiceJobSchema)

export type ServiceJobWork = z.infer<typeof ServiceJobWorkSchema>
export type ServiceJobType = z.infer<typeof ServiceJobTypeSchema>
export type ServiceJob = z.infer<typeof ServiceJobSchema>
