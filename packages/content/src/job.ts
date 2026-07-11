import { z } from 'zod'
import { ComponentIdSchema } from './tags'

/**
 * `fix-issue` (Sprint 22) is a repair with a real per-issue cash cost, on top
 * of consumables - `repair-zone`/`install-part` never charge more than
 * consumables, so it's its own kind rather than a repair-zone variant.
 */
export const JobKindSchema = z.enum(['repair-zone', 'install-part', 'fix-issue'])

export const JobSchema = z
  .object({
    id: z.string().min(1),
    carInstanceId: z.string().min(1),
    kind: JobKindSchema,
    componentId: ComponentIdSchema,
    partInstanceId: z.string().min(1).optional(),
    issueId: z.string().min(1).optional(),
    laborSlotsRequired: z.number().int().positive(),
    laborSlotsSpent: z.number().int().nonnegative().default(0),
  })
  .refine((job) => job.kind !== 'install-part' || job.partInstanceId !== undefined, {
    message: 'install-part jobs require partInstanceId',
    path: ['partInstanceId'],
  })
  .refine((job) => job.kind !== 'fix-issue' || job.issueId !== undefined, {
    message: 'fix-issue jobs require issueId',
    path: ['issueId'],
  })
  .refine((job) => job.laborSlotsSpent <= job.laborSlotsRequired, {
    message: 'laborSlotsSpent cannot exceed laborSlotsRequired',
    path: ['laborSlotsSpent'],
  })

export const JobsSchema = z.array(JobSchema)

export type JobKind = z.infer<typeof JobKindSchema>
export type Job = z.infer<typeof JobSchema>
