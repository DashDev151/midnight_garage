import { z } from 'zod'
import { RequirementSpecSchema } from './requirement'

/**
 * A scene's Respected-stage payload (docs/sprints/sprint_archive/scene-standing-arc.md step
 * 6): a generated brief from a named customer in that scene, graded on the
 * scene's own buyer `statTargets` exactly like a story mission's
 * `requirements` (`evaluateRequirement`, sim/requirements.ts) - never a
 * second requirement language. `GameState.sceneCommissions` keys one of
 * these per `BuyerArchetype`, so there is no separate `scene` field here and
 * no separate tag for the delivered car's scene credit to disagree with.
 *
 * Unfailable and undated like a story mission: `offered` until accepted,
 * then `active` until delivered, at which point the whole record clears back
 * to `null` and a fresh one can generate. `payoutYen` is deliberately absent
 * - a commission pays `economy.sceneCommissions.payoutMultiplier` times
 * whatever the car actually handed over would fetch on the open market
 * (`resolveDeliverSceneCommission`, sim/sceneCommissions.ts), so it never
 * quotes a car nobody has chosen yet.
 */
export const SceneCommissionSchema = z.object({
  customerName: z.string().min(1),
  /** The customer's own ask, player-facing - reuses that scene's own
   * authored `Buyer.wantLine` verbatim, so the brief and the buyer can never
   * drift apart. */
  requestCopy: z.string().min(1),
  requirements: z.array(RequirementSpecSchema).min(1),
  status: z.enum(['offered', 'active']),
  postedOnDay: z.number().int().positive(),
  acceptedOnDay: z.number().int().positive().nullable(),
})

export type SceneCommission = z.infer<typeof SceneCommissionSchema>
