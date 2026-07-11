import { z } from 'zod'
import { ComponentIdSchema, ConditionBandSchema } from './tags'

/**
 * `fix-issue` (Sprint 22) is retired: the hidden-issue system it belonged to
 * is paused and removed (Sprint 26, maintainer decision 2026-07-11). Every
 * job is now either a group-level repair (climb every non-mint, non-scrap
 * part in the group toward the target band) or an install (one catalog part
 * onto one part slot within the group).
 */
export const JobKindSchema = z.enum(['repair-zone', 'install-part'])

export const JobSchema = z
  .object({
    id: z.string().min(1),
    carInstanceId: z.string().min(1),
    kind: JobKindSchema,
    componentId: ComponentIdSchema,
    partInstanceId: z.string().min(1).optional(),
    /** Set for `repair-zone` jobs only (Sprint 26 decision 5) - how far
     * every eligible part in the group climbs on completion. */
    targetBand: ConditionBandSchema.optional(),
    laborSlotsRequired: z.number().int().positive(),
    laborSlotsSpent: z.number().int().nonnegative().default(0),
  })
  .refine((job) => job.kind !== 'install-part' || job.partInstanceId !== undefined, {
    message: 'install-part jobs require partInstanceId',
    path: ['partInstanceId'],
  })
  .refine((job) => job.laborSlotsSpent <= job.laborSlotsRequired, {
    message: 'laborSlotsSpent cannot exceed laborSlotsRequired',
    path: ['laborSlotsSpent'],
  })

export const JobsSchema = z.array(JobSchema)

export type JobKind = z.infer<typeof JobKindSchema>
export type Job = z.infer<typeof JobSchema>
