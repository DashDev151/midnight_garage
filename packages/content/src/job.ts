import { z } from 'zod'
import { CarPartIdSchema, ComponentIdSchema, ConditionBandSchema } from './tags'

/**
 * Every job is either a group-level repair (climb every non-mint, non-scrap
 * part in the group toward the target band), an install (one catalog part onto
 * one part slot within the group), or a `dyno-session` (a run on the
 * rolling road).
 *
 * A `dyno-session` is the one kind that changes nothing about what it
 * addresses: it costs labour and books the car onto the rollers, and every
 * part, band and stat on that car is untouched by completing it. It carries no
 * `partInstanceId` and no `targetBand`, and its `carInstanceId` is a real car
 * in a real service bay, so it gates on the bay like any other car job.
 *
 * A `machine-part` applies one named machining operation
 * (`machiningOperationId`) to a loose `PartInstance` on the machine in the
 * machine shop. It moves no band and swaps no part: it appends the operation
 * to that instance's own record, and the work travels with the part back onto
 * whatever car it is fitted to. `carPartId` is the slot the part addresses,
 * which is what says a port-and-polish belongs to a head and not a gearbox;
 * `carInstanceId` holds the loose part's own id, so it never resolves
 * against a car or a service bay.
 *
 * `'service' | 'rebuild' | 'restore'` are the three repair job kinds
 * (`RepairJobKindSchema`, workbench.ts), one recipe ladder per part per
 * kind. A repair job reuses this schema's own `laborSlotsRequired`/
 * `laborSlotsSpent` fields (the recipe's step count and the steps done) and
 * carries no field these other kinds don't already declare - the engine
 * that builds and resolves them lives in `packages/sim/src/repairJobs.ts`.
 */
export const JobKindSchema = z.enum([
  'repair-zone',
  'install-part',
  'dyno-session',
  'machine-part',
  'service',
  'rebuild',
  'restore',
])

export const JobSchema = z
  .object({
    id: z.string().min(1),
    carInstanceId: z.string().min(1),
    kind: JobKindSchema,
    componentId: ComponentIdSchema,
    partInstanceId: z.string().min(1).optional(),
    /** Set for `repair-zone` jobs - how far the addressed part(s) climb on
     * completion. */
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
    /** Which `economy.machining.operations` entry a `machine-part` job is
     * doing. The one payload no other kind carries: every other job's effect
     * is fully described by its kind, its address and its `targetBand`. */
    machiningOperationId: z.string().min(1).optional(),
    laborSlotsRequired: z.number().int().positive(),
    laborSlotsSpent: z.number().int().nonnegative().default(0),
  })
  .refine((job) => job.kind !== 'install-part' || job.partInstanceId !== undefined, {
    message: 'install-part jobs require partInstanceId',
    path: ['partInstanceId'],
  })
  .refine(
    (job) =>
      job.kind !== 'machine-part' ||
      (job.machiningOperationId !== undefined &&
        job.carPartId !== undefined &&
        job.partInstanceId !== undefined),
    {
      message: 'machine-part jobs require machiningOperationId, carPartId and partInstanceId',
      path: ['machiningOperationId'],
    },
  )
  .refine((job) => job.laborSlotsSpent <= job.laborSlotsRequired, {
    message: 'laborSlotsSpent cannot exceed laborSlotsRequired',
    path: ['laborSlotsSpent'],
  })

export const JobsSchema = z.array(JobSchema)

export type JobKind = z.infer<typeof JobKindSchema>
export type Job = z.infer<typeof JobSchema>
