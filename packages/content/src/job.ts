import { z } from 'zod'
import { CarPartIdSchema, ComponentIdSchema, ConditionBandSchema } from './tags'

/**
 * `fix-issue` (Sprint 22) is retired: the hidden-issue system it belonged to
 * is paused and removed (Sprint 26, maintainer decision 2026-07-11). Every
 * job is either a group-level repair (climb every non-mint, non-scrap part in
 * the group toward the target band), an install (one catalog part onto one
 * part slot within the group), or - Sprint 35 - a `recondition-part` (the
 * same banded repair, but climbing a loose `PartInstance` sitting in
 * `partInventory` rather than one installed on a car). A recondition job
 * carries `partInstanceId` + `targetBand` and its `carInstanceId` holds the
 * loose part's own id (there is no car - see the resolver in `jobs.ts`), so
 * it never resolves against a real car or a service bay.
 */
export const JobKindSchema = z.enum(['repair-zone', 'install-part', 'recondition-part'])

export const JobSchema = z
  .object({
    id: z.string().min(1),
    carInstanceId: z.string().min(1),
    kind: JobKindSchema,
    componentId: ComponentIdSchema,
    partInstanceId: z.string().min(1).optional(),
    /** Set for `repair-zone` and `recondition-part` jobs (Sprint 26 decision
     * 5 / Sprint 35) - how far the addressed part(s) climb on completion. */
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
  .refine((job) => job.kind !== 'recondition-part' || job.partInstanceId !== undefined, {
    message: 'recondition-part jobs require partInstanceId',
    path: ['partInstanceId'],
  })
  .refine((job) => job.kind !== 'recondition-part' || job.targetBand !== undefined, {
    message: 'recondition-part jobs require targetBand',
    path: ['targetBand'],
  })
  .refine((job) => job.laborSlotsSpent <= job.laborSlotsRequired, {
    message: 'laborSlotsSpent cannot exceed laborSlotsRequired',
    path: ['laborSlotsSpent'],
  })

export const JobsSchema = z.array(JobSchema)

export type JobKind = z.infer<typeof JobKindSchema>
export type Job = z.infer<typeof JobSchema>
