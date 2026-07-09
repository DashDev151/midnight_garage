import { z } from 'zod'
import { CarInstanceSchema } from './carInstance'
import { SlotSchema, ZoneSchema } from './tags'

/**
 * What a customer job actually asks for. The player satisfies it with the
 * normal build/repair system on the customer's car:
 *  - `repair` a condition zone back to 100 (labor only), or
 *  - `install` a part into a slot (buy the part at the market, then fit it).
 */
export const ServiceJobWorkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('repair'), zone: ZoneSchema }),
  z.object({ kind: z.literal('install'), slot: SlotSchema }),
])

/**
 * A service-job template (GDD Act 1 "job cards"). A customer brings a car the
 * player never owns; on acceptance the car enters the shop and the player does
 * the required work (buying parts + assigning labor exactly like an owned car),
 * getting paid a fixed `payoutYen` on completion.
 */
export const ServiceJobTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  customerName: z.string().min(1),
  description: z.string().min(1),
  work: ServiceJobWorkSchema,
  payoutYen: z.number().int().positive(),
  /** Reputation for completing (multiplied by the installed part's grade for install jobs). */
  baseReputation: z.number().int().nonnegative(),
})

export const ServiceJobTemplatesSchema = z.array(ServiceJobTemplateSchema).min(1)

/**
 * A live offered/accepted service job — a snapshot of its template plus the
 * actual customer car (offered ones show it; accepted ones have it in the shop).
 * The work is tracked on the car via the normal job/labor system, not here.
 */
export const ServiceJobSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
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
export type ServiceJobTemplate = z.infer<typeof ServiceJobTemplateSchema>
export type ServiceJob = z.infer<typeof ServiceJobSchema>
