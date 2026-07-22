import { z } from 'zod'
import { ComponentIdSchema } from './tags'

/**
 * A named, real-world craft that unlocks once the shop's specialty in
 * `componentId` clears `thresholdPoints`. A technique never touches speed,
 * cost, or quality math - it only gates which templates (`unlocksTemplateIds`)
 * can be offered/accepted at all. No state of its own; `unlockedTechniques`
 * (serviceJobs.ts) derives the unlocked set purely from `state.specialty`
 * every time, nothing is stored.
 */
export const TechniqueSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  componentId: ComponentIdSchema,
  displayName: z.string().min(1),
  thresholdPoints: z.number().int().positive(),
  unlocksTemplateIds: z.array(z.string().min(1)).min(1),
  /** One quiet line (progression bible law 4: no popups, no toasts) folded
   * into a newly-reachable signature offer's own flavor pool at generation
   * time - never a separate stateful "you just unlocked X" announcement. */
  unlockLogLine: z.string().min(1),
})

export const TechniquesSchema = z.array(TechniqueSchema).min(1)

export type Technique = z.infer<typeof TechniqueSchema>
export type Techniques = z.infer<typeof TechniquesSchema>
