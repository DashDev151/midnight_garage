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

export const SpecialtyCopySchema = z.record(ComponentIdSchema, SpecialtyCopyLinesSchema)

export type SpecialtyCopyLines = z.infer<typeof SpecialtyCopyLinesSchema>
export type SpecialtyCopy = z.infer<typeof SpecialtyCopySchema>
