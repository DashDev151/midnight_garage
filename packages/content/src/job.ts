import { z } from 'zod'
import { CarPartIdSchema, ComponentIdSchema, ConditionBandSchema } from './tags'

/**
 * Every job is either a group-level repair (climb every non-mint, non-scrap
 * part in the group toward the target band), an install (one catalog part onto
 * one part slot within the group), or a `recondition-part` (the same banded
 * repair, but climbing a loose `PartInstance` sitting in `partInventory`
 * rather than one installed on a car). A recondition job carries `partInstanceId`
 * + `targetBand` and its `carInstanceId` holds the loose part's own id (there
 * is no car), so it never resolves against a real car or a service bay.
 */
export const JobKindSchema = z.enum(['repair-zone', 'install-part', 'recondition-part'])

export const JobSchema = z
  .object({
    id: z.string().min(1),
    carInstanceId: z.string().min(1),
    kind: JobKindSchema,
    componentId: ComponentIdSchema,
    partInstanceId: z.string().min(1).optional(),
    /** Set for `repair-zone` and `recondition-part` jobs - how far the
     * addressed part(s) climb on completion. */
    targetBand: ConditionBandSchema.optional(),
    /**
     * The per-part address, mirroring `StagedActionSchema`'s own addition -
     * absent means group-level job (a `repair-zone` climbs every eligible part
     * in `componentId`; an `install-part` targets whichever slot the part's own
     * catalog address resolves to). Present means a `repair-zone` climbs only
     * this one part; an `install-part` is additionally validated against this
     * exact slot. Also folded into the job's own id so a per-part job never
     * collides with a group-level job or another per-part job addressing the
     * same group.
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
