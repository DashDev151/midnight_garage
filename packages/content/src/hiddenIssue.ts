import { z } from 'zod'
import { ZoneSchema } from './tags'

export const HiddenIssueSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
    zone: ZoneSchema,
    severityMin: z.number().min(0).max(100),
    severityMax: z.number().min(0).max(100),
    hintText: z.string().min(1),
    repairCostBaseYen: z.number().int().nonnegative(),
  })
  .refine((issue) => issue.severityMin <= issue.severityMax, {
    message: 'severityMin must be <= severityMax',
    path: ['severityMin'],
  })

export const HiddenIssuesSchema = z.array(HiddenIssueSchema).min(1)

export type HiddenIssue = z.infer<typeof HiddenIssueSchema>
