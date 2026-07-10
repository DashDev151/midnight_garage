import { z } from 'zod'
import { ComponentIdSchema } from './tags'

/**
 * One piece of work the player intends to do on a car but hasn't committed to
 * yet (Sprint 18) — staged freely, at zero cost, until Confirm resolves the
 * whole list at once through the existing job/labor system. Mirrors
 * `ServiceJobWorkSchema`'s repair/install split, but carries the specific
 * `partInstanceId` for an install stage (the drag gesture onto a component
 * row *is* the part choice — there's no separate picker step).
 */
export const StagedActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('repair'), componentId: ComponentIdSchema }),
  z.object({
    kind: z.literal('install'),
    componentId: ComponentIdSchema,
    partInstanceId: z.string().min(1),
  }),
])

export const StagedActionsSchema = z.array(StagedActionSchema)

export type StagedAction = z.infer<typeof StagedActionSchema>
