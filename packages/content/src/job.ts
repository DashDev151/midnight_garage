import { z } from 'zod'
import { CarPartIdSchema, ComponentIdSchema, ConditionBandSchema } from './tags'

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
    /**
     * Sprint 28: the per-part address, mirroring `StagedActionSchema`'s own
     * addition - absent means the pre-Sprint-28 group-level job (a
     * `repair-zone` climbs every eligible part in `componentId`; an
     * `install-part` targets whichever slot the part's own catalog address
     * resolves to). Present means a `repair-zone` climbs only this one part;
     * an `install-part` is additionally validated against this exact slot.
     * Also folded into the job's own id (`jobs.ts`'s `jobIdFor`) so a
     * per-part job never collides with a group-level job, or another
     * per-part job, addressing the same group.
     */
    carPartId: CarPartIdSchema.optional(),
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
