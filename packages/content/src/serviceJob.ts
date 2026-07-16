import { z } from 'zod'
import { CarInstanceSchema } from './carInstance'
import { RequirementSpecSchema } from './requirement'
import { ToolTierSchema } from './toolLines'

/**
 * One task within a service-job template (Sprint 72: outcome-based). What
 * the customer's car must end up in, not what the player must DO to it - a
 * `RequirementSpec` (`requirement.ts`), evaluated fresh every time via
 * `evaluateRequirement` (sim). Any route that leaves the car in the required
 * state satisfies it: repair-and-refit, buy-new, or a donor-pulled part all
 * count equally (decision 4) - closing the old `action`-based split (this
 * schema no longer distinguishes `repair`/`install` at all; a pure band
 * requirement and a band-plus-grade requirement are both just a
 * `slotCondition`).
 *
 * `minToolTier` (Sprint 36): the tool tier this task's group needs before
 * the work can be offered without a hint or accepted at all - the
 * capability ceiling along the bolt-on vs built line (progression bible).
 * Defaults to 1 (no ceiling); Sprint 37 authors the real values. Stays on
 * the task wrapper, not inside the requirement - it gates OFFERABILITY
 * (`taskToolDeficit`), not the end state itself.
 */
export const ServiceJobTaskSchema = z.object({
  requirement: RequirementSpecSchema,
  minToolTier: ToolTierSchema.default(1),
})

export const ServiceJobTasksSchema = z.array(ServiceJobTaskSchema).min(1)

/** The four progression gates a template unlocks at (Sprint 29 decision 2):
 * 1 at `unknown`, 2 at `local`, 3 at `known`, 4 at `respected` - see
 * `sim/constants.ts`'s `SERVICE_JOB_TIER_MIN_REPUTATION` for the mapping. */
export const ServiceJobTierSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
])

/**
 * A themed, multi-task service-job template (Sprint 29 schema v2 - replaces
 * the Sprint 11 single-`work` + authored `payoutRangeYen` shape). `tasks`
 * names the vocabulary of work a generated offer needs done; payout is
 * DERIVED from those tasks and the specific customer car at generation time
 * (`serviceJobs.ts`'s `deriveServiceJobPayoutYen`), never authored here.
 * `flavorPool` needs at least 2 entries so generation has real variety, and
 * every line must describe only the parts this template's own `tasks`
 * touch - never a component the job doesn't actually work on (Sprint 11
 * decision 5's rule, extended to the multi-task shape).
 */
export const ServiceJobTypeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  tier: ServiceJobTierSchema,
  tasks: ServiceJobTasksSchema,
  flavorPool: z.array(z.string().min(1)).min(2, 'each template needs at least 2 flavor variants'),
  /** Days the player has to finish + hand back a job of this template once
   * accepted, counted from the customer car's arrival (Sprint 25 task 2) -
   * replaces the old flat `SERVICE_JOB_DEADLINE_DAYS` constant, one value
   * per template instead of one value for every job in the game. */
  deadlineDays: z.number().int().positive(),
  /** Reputation for completing (multiplied by the priciest installed part's
   * grade, if this template has any install tasks - `reputationForCompletion`,
   * serviceJobs.ts). */
  baseReputation: z.number().int().nonnegative(),
  /** Sprint 39: a signature template's gate - the id of the `Technique`
   * (techniques.json) that must be unlocked (the shop's specialty in that
   * technique's group clears its `thresholdPoints`) before this template can
   * ever be offered or accepted. Absent for every ordinary template. */
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
  /** Captured from the template at generation time (Sprint 29) - stamps
   * `dueOnDay` at accept time; kept on the job afterward as a record, same
   * as `baseReputation`. */
  deadlineDays: z.number().int().positive(),
  /** Day the offer leaves the board if not accepted. */
  expiresOnDay: z.number().int().positive(),
  /**
   * Day the customer's car actually arrives in the shop, once accepted (null
   * while still an offer, and null again once arrival day is reached - Sprint
   * 25 task 2: acceptance no longer places the car instantly). While this is
   * still a future day, the car sits in its claimed slot but is not yet
   * workable - see `isServiceJobInTransit`.
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
