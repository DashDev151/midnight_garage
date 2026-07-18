import { z } from 'zod'
import { ComponentIdSchema } from './tags'
import { RequirementSpecSchema } from './requirement'

/**
 * Sprint 76 (story missions I): one hand-authored campaign commission - a
 * strictly linear beat gated on reputation, not a service-job offer (never
 * counts against `offerCountCapByDay`). `requirements` names every
 * end-state predicate the delivered car must satisfy (`requirements.ts`'s
 * `evaluateRequirement`, exactly like a service-job task); `budgetCapYen` is
 * the single authored source for the spend ceiling - `data.ts` mirrors it
 * into a matching `budgetCap` entry appended to `requirements` at load, so a
 * mission never carries two numbers that have to be kept in sync by hand.
 *
 * Sprint 85 decision 2 (playtest 18, maintainer ruling): story missions are
 * unfailable - offered, accepted, delivered at the player's leisure. The
 * `deadlineDays`/`lapseReputationPenalty`/`reofferDays` fields and the whole
 * lapse/reoffer state machine are gone; the budget cap and requirements are
 * the entire challenge. Radial (service) jobs keep their own deadlines.
 *
 * Two placeholder missions (`placeholder-a`/`placeholder-b`) ship this
 * sprint to run the whole machine end to end; the real campaign replaces
 * both in Sprint 78.
 */
export const StoryMissionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  personaId: z.string().min(1),
  title: z.string().min(1),
  /** The customer's own ask, 2-4 sentences, player-facing. */
  requestCopy: z.string().min(1),
  /** The reputation-point floor this mission unlocks at - missions sort by
   * this field for the strictly linear campaign order. */
  gateReputationPoints: z.number().int().nonnegative(),
  requirements: z.array(RequirementSpecSchema),
  /** The single authored spend ceiling - see the module doc above for how
   * this becomes a `budgetCap` requirement, not a hand-duplicated one. */
  budgetCapYen: z.number().int().positive(),
  payoutYen: z.number().int().positive(),
  /** Fraction of `payoutYen` awarded as a tip when every `statThreshold`
   * requirement clears its `min` by at least `tipTriggerFraction` AND every
   * `lapTimeCeiling` requirement clears its `maxSeconds` by at least
   * `lapTipTriggerFraction` (Sprint 79 decision 6 - a mission naming neither
   * kind never tips, never vacuously). */
  tipFraction: z.number().min(0).max(1).default(0.1),
  tipTriggerFraction: z.number().min(0).max(1).default(0.15),
  /** Sprint 79: the lap-time twin of `tipTriggerFraction` - how far under a
   * `lapTimeCeiling` requirement's `maxSeconds` counts as overdelivery, not
   * just clearing the bar. Kept tighter than the stat-threshold default (3%
   * vs 15%) so the probe build itself (2% under its own derived ceiling,
   * Sprint 78's formula) does not tip; beating the reference build does. */
  lapTipTriggerFraction: z.number().min(0).max(1).default(0.03),
  reputationReward: z.number().int().nonnegative(),
  /** The specialty groups `reputationReward` splits across on delivery
   * (`applySpecialtyDelta`). */
  specialtyGroups: z.array(ComponentIdSchema).min(1),
  deliveredCopy: z.string().min(1),
  overdeliveredCopy: z.string().min(1),
})

export const StoryMissionsSchema = z.array(StoryMissionSchema)

export type StoryMission = z.infer<typeof StoryMissionSchema>
