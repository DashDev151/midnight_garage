import { z } from 'zod'
import { SellingChannelIdSchema } from './economy'
import { ServiceJobTasksSchema } from './serviceJob'
import { CarPartIdSchema, ConditionBandSchema } from './tags'

/**
 * The stand owner's one-off scripted service job - a fixed customer car and
 * task list, deterministic under any career seed (no RNG draws), on exactly
 * the footing `TutorialLotRecipeSchema` (`tutorial.ts`) builds the scripted
 * tutorial lot. Never rolled from the board: `packages/sim/src/
 * scriptedServiceJob.ts` builds a concrete `ServiceJob` from this recipe and
 * injects it directly.
 */

/** One part-slot band override on the scripted car, layered over `baseBand` -
 * same shape as `TutorialLotRecipeSchema`'s own override. */
const ScriptedServiceJobPartOverrideSchema = z.object({
  carPartId: CarPartIdSchema,
  band: ConditionBandSchema,
})

/** The scripted job's own diagnosis beat - a real generated-shape symptom
 * whose `trueCauseId` is authored rather than rolled, on exactly the footing
 * `TutorialLotRecipeSchema`'s `TutorialSymptomSchema` already works.
 * `apparent` records each damaged part's pre-symptom band exactly as
 * generation's `apparentBandByPartId` would. Optional: an ordinary service
 * job (and the scripted job before this field existed) carries none. */
const ScriptedServiceJobSymptomSchema = z.object({
  symptomId: z.string().min(1),
  trueCauseId: z.string().min(1),
  apparent: z.array(ScriptedServiceJobPartOverrideSchema).min(1),
})

export const ScriptedServiceJobRecipeSchema = z.object({
  jobId: z.string().min(1),
  carId: z.string().min(1),
  modelId: z.string().min(1),
  year: z.number().int(),
  mileageKm: z.number().int().nonnegative(),
  color: z.string().min(1),
  /** Reused verbatim from `provenance.json`'s pool - not invented copy. */
  provenanceNote: z.string().min(1),
  customerName: z.string().min(1),
  /** The customer's own ask, one or two lines, same voice as a template's
   * `flavorPool` entries. */
  description: z.string().min(1),
  /** The day the ensure-function first posts this job's offer - before it,
   * every ensure call is a no-op. Lets a scripted job land a few days into a
   * career (once the shop the player plausibly has by then exists) rather
   * than competing with day one. */
  appearsOnDay: z.number().int().positive(),
  /** The band every slot starts at before `partOverrides` are applied. */
  baseBand: ConditionBandSchema,
  partOverrides: z.array(ScriptedServiceJobPartOverrideSchema).min(1),
  tasks: ServiceJobTasksSchema,
  baseReputation: z.number().int().nonnegative(),
  deadlineDays: z.number().int().positive(),
  /** How many days the offer sits on the board before expiring unaccepted -
   * harmless either way, since the ensure-function re-posts it the very next
   * day while its unlock is still unclaimed. */
  offerLifetimeDays: z.number().int().positive(),
  /**
   * The fixed margin `deriveServiceJobPayoutYen` (sim) prices this job's
   * payout with, in place of a random roll - deterministic content needs a
   * chosen value rather than an rng draw. Picked from
   * `economy.serviceJobs`'s own `[marginMin, marginMax]` range, so the
   * payout lands on the same formula, and therefore the same scale, every
   * ordinary tier-1 job's payout does.
   */
  marginRoll: z.number().positive(),
  /** The selling channel completing this job unlocks - never `shopFront` or
   * `tradeNetwork`, both open from day one. */
  unlocksSellingChannel: SellingChannelIdSchema.refine(
    (channelId): boolean => channelId !== 'shopFront' && channelId !== 'tradeNetwork',
    {
      message:
        "unlocksSellingChannel can never be 'shopFront' or 'tradeNetwork' - both are open from day one",
    },
  ),
  /** The scripted car's one deterministic diagnosis beat - the tutorial-
   * adjacent chance to use the inspection flow on work that cannot be
   * failed. Absent for an ordinary honest scripted car. */
  symptom: ScriptedServiceJobSymptomSchema.optional(),
  /** The handback line shown in place of the generic paid-outcome flavour
   * line, in the character's own voice. Absent for every ordinary job. */
  handbackCopy: z.string().min(1).optional(),
  /** The plain what-changed facts the handback modal lists once this job
   * pays out - a Tier 2 community job's world-change, stated so the player
   * can point at it (`docs/design/systems/community-jobs.md`). Absent for
   * every ordinary job. */
  unlockFacts: z.array(z.string().min(1)).optional(),
})

export type ScriptedServiceJobRecipe = z.infer<typeof ScriptedServiceJobRecipeSchema>
