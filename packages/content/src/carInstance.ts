import { z } from 'zod'
import { PartInstanceSchema } from './part'

/** One real car component: its wear (0-100) and whatever part is installed on it, if any. */
const ComponentSchema = z.object({
  condition: z.number().min(0).max(100),
  installed: PartInstanceSchema.nullable().default(null),
})

/**
 * The 8 real car components (Sprint 12 — replaces the old split
 * `condition`/`buildSheet` maps, which had different key sets and no shared
 * identity between them; see docs/design/repair-replace-progression.md).
 */
const ComponentsSchema = z.object({
  engine: ComponentSchema,
  forcedInduction: ComponentSchema,
  drivetrain: ComponentSchema,
  suspension: ComponentSchema,
  brakes: ComponentSchema,
  wheels: ComponentSchema,
  body: ComponentSchema,
  interior: ComponentSchema,
})

const RevealedIssueSchema = z.object({
  issueId: z.string().min(1),
  revealed: z.boolean().default(false),
})

export const CarInstanceSchema = z.object({
  id: z.string().min(1),
  modelId: z.string().min(1),
  year: z.number().int(),
  mileageKm: z.number().int().nonnegative(),
  color: z.string().min(1),
  provenanceNote: z.string().default(''),
  hiddenIssues: z.array(RevealedIssueSchema).default([]),
  authenticityPercent: z.number().min(0).max(100),
  components: ComponentsSchema,
})

export type CarInstance = z.infer<typeof CarInstanceSchema>
export type CarComponent = z.infer<typeof ComponentSchema>
