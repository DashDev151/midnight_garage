import { z } from 'zod'
import { ComponentIdSchema, ConditionBandSchema } from './tags'

/**
 * One piece of work the player intends to do on a car but hasn't committed to
 * yet (Sprint 18) - staged freely, at zero cost, until Confirm resolves the
 * whole list at once through the existing job/labor system. Mirrors
 * `ServiceJobWorkSchema`'s repair/install split, but carries the specific
 * `partInstanceId` for an install stage (the drag gesture onto a component
 * row *is* the part choice - there's no separate picker step).
 *
 * Sprint 26: `fix-issue` is retired with the hidden-issue system. A repair
 * stage gains `targetBand` (decision 5) - the player chooses how far to
 * climb, not always mint; Confirm climbs every non-mint, non-scrap part in
 * the group toward it, labor allowing (group-level "bridge", decision 13).
 */
export const StagedActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('repair'),
    componentId: ComponentIdSchema,
    targetBand: ConditionBandSchema,
  }),
  z.object({
    kind: z.literal('install'),
    componentId: ComponentIdSchema,
    partInstanceId: z.string().min(1),
  }),
])

export const StagedActionsSchema = z.array(StagedActionSchema)

export type StagedAction = z.infer<typeof StagedActionSchema>
