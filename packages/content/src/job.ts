import { z } from 'zod'
import { ComponentIdSchema } from './tags'

/**
 * Every GDD 3.2 labor-slot example (inspect, coilover swap, engine
 * rebuild, full restoration) is one of these two kinds at a different
 * `laborSlotsRequired` — no larger job taxonomy needed yet.
 */
export const JobKindSchema = z.enum(['repair-zone', 'install-part'])

export const JobSchema = z
  .object({
    id: z.string().min(1),
    carInstanceId: z.string().min(1),
    kind: JobKindSchema,
    componentId: ComponentIdSchema,
    partInstanceId: z.string().min(1).optional(),
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
