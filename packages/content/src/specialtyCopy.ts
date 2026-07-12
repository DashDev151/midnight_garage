import { z } from 'zod'
import { ComponentIdSchema } from './tags'

/**
 * Sprint 38: the word-of-mouth flavor pool a generated offer draws from
 * INSTEAD of its template's own `flavorPool` when the in-lane specialty
 * premium applies (`serviceJobs.ts`'s offer generation) - the one diegetic
 * surface specialty gets (progression bible law 4: no meters, no bars).
 * At least 2 lines per group for real variety, same floor as a template's
 * own `flavorPool`.
 */
export const SpecialtyCopyLinesSchema = z.array(z.string().min(1)).min(2)

/**
 * Sprint 39: `lines` is the Sprint 38 word-of-mouth pool; `titleName` is the
 * derived shop title's copy for this group ("the engine house") - shown as
 * plain text alongside reputation (`shopTitle`, serviceJobs.ts), never a
 * meter. Not player save data - a content file, parsed fresh, no save-law
 * migration concerns even though its shape changed this sprint.
 */
export const SpecialtyCopyEntrySchema = z.object({
  lines: SpecialtyCopyLinesSchema,
  titleName: z.string().min(1),
})

export const SpecialtyCopySchema = z.record(ComponentIdSchema, SpecialtyCopyEntrySchema)

export type SpecialtyCopyLines = z.infer<typeof SpecialtyCopyLinesSchema>
export type SpecialtyCopyEntry = z.infer<typeof SpecialtyCopyEntrySchema>
export type SpecialtyCopy = z.infer<typeof SpecialtyCopySchema>
