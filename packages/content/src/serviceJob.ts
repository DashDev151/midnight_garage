import { z } from 'zod'
import { CarInstanceSchema } from './carInstance'
import { SlotConditionRequirementSchema } from './requirement'
import { ToolTierSchema } from './toolLines'

/**
 * One task within a service-job template. What the customer's car must end
 * up in, not what the player must DO to it - a `RequirementSpec`
 * (`requirement.ts`), evaluated fresh every time via `evaluateRequirement`
 * (sim). Any route that leaves the car in the required state satisfies it:
 * repair-and-refit, buy-new, or a donor-pulled part all count equally.
 *
 * `minToolTier` is the tool tier this task's group needs before the work can
 * be offered without a hint or accepted at all - the capability ceiling.
 * Defaults to 1 (no ceiling). Stays on the task wrapper, not inside the
 * requirement - it gates OFFERABILITY (`taskToolDeficit`), not the end state
 * itself.
 *
 * `requirement` is pinned to `SlotConditionRequirementSchema` specifically,
 * not the full `RequirementSpec` union - a service-job task only ever
 * authors a slot/band/grade requirement, so its own type stays concrete
 * rather than every reader needing a `kind` narrowing check for sibling kinds
 * it can never actually see. `evaluateRequirement` (sim) still accepts it
 * directly - a `SlotConditionRequirement` is one member of `RequirementSpec`,
 * so it is always assignable where the wider union is expected.
 */
export const ServiceJobTaskSchema = z.object({
  requirement: SlotConditionRequirementSchema,
  minToolTier: ToolTierSchema.default(1),
})

export const ServiceJobTasksSchema = z.array(ServiceJobTaskSchema).min(1)

/** The four progression gates a template unlocks at: 1 at `unknown`, 2 at
 * `local`, 3 at `known`, 4 at `respected`. */
export const ServiceJobTierSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
])

/**
 * A themed, multi-task service-job template. `tasks` names the vocabulary of
 * work a generated offer needs done; payout is DERIVED from those tasks and
 * the specific customer car at generation time (`serviceJobs.ts`'s
 * `deriveServiceJobPayoutYen`), never authored here. `flavorPool` needs at
 * least 2 entries so generation has real variety, and every line must
 * describe only the parts this template's own `tasks` touch - never a
 * component the job doesn't actually work on.
 */
export const ServiceJobTypeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  tier: ServiceJobTierSchema,
  tasks: ServiceJobTasksSchema,
  flavorPool: z.array(z.string().min(1)).min(2, 'each template needs at least 2 flavor variants'),
  /** Days the player has to finish + hand back a job of this template once
   * accepted, counted from the customer car's arrival - one value per
   * template instead of a global constant. */
  deadlineDays: z.number().int().positive(),
  /** Reputation for completing (multiplied by the priciest installed part's
   * grade, if this template has any install tasks - `reputationForCompletion`,
   * serviceJobs.ts). */
  baseReputation: z.number().int().nonnegative(),
  /** A signature template's gate - the id of the `Technique` (techniques.json)
   * that must be unlocked before this template can ever be offered or accepted.
   * Absent for every ordinary template. */
  requiresTechnique: z.string().min(1).optional(),
})

export const ServiceJobTypesSchema = z.array(ServiceJobTypeSchema).min(1)

/** Customer names, decoupled entirely from job type - a name has nothing to do with what's broken. */
export const ServiceJobCustomerNamesSchema = z.array(z.string().min(1)).min(1)

/**
 * A live offered/accepted service job - a snapshot of the generated
 * composition (template + derived payout + picked name + picked flavor line)
 * plus the actual customer car (offered ones show it; accepted ones have it
 * in the shop). The work itself is tracked on the car via the normal
 * job/labor system, not here - `tasks` only names what's required.
 */
export const ServiceJobSchema = z.object({
  id: z.string().min(1),
  typeId: z.string().min(1),
  customerName: z.string().min(1),
  description: z.string().min(1),
  tasks: ServiceJobTasksSchema,
  /** The customer's car - worked on in the shop, never owned. */
  car: CarInstanceSchema,
  payoutYen: z.number().int().positive(),
  baseReputation: z.number().int().nonnegative(),
  /** Captured from the template at generation time - stamps `dueOnDay` at
   * accept time; kept on the job afterward as a record, same as `baseReputation`. */
  deadlineDays: z.number().int().positive(),
  /** Day the offer leaves the board if not accepted. */
  expiresOnDay: z.number().int().positive(),
  /**
   * Day the customer's car actually arrives in the shop, once accepted (null
   * while still an offer, and null again once arrival day is reached).
   * While this is still a future day, the car sits in its claimed slot but is
   * not yet workable - see `isServiceJobInTransit`.
   */
  arrivesOnDay: z.number().int().positive().nullable().default(null),
  /**
   * Work deadline once accepted (null while still an offer). By this day the
   * job must be handed back or it auto-resolves: paid if the work is done,
   * failed (reputation penalty, no pay) if not. Counted from `arrivesOnDay`,
   * not from acceptance, so the in-transit day never silently shortens it.
   */
  dueOnDay: z.number().int().positive().nullable().default(null),
})

export const ServiceJobsSchema = z.array(ServiceJobSchema)

export type ServiceJobTask = z.infer<typeof ServiceJobTaskSchema>
export type ServiceJobTier = z.infer<typeof ServiceJobTierSchema>
export type ServiceJobType = z.infer<typeof ServiceJobTypeSchema>
export type ServiceJob = z.infer<typeof ServiceJobSchema>
