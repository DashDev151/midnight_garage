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

/**
 * Sprint 22: severity is rolled once, at car generation, and stays fixed for
 * the life of the instance — `revealed` only controls whether the PLAYER has
 * seen it yet (inspection, or a post-purchase discovery beat), never whether
 * it mechanically applies. `repaired` is the only thing a `fix-issue` job
 * ever flips; it never touches the component's own `condition`.
 */
const RevealedIssueSchema = z.object({
  issueId: z.string().min(1),
  revealed: z.boolean().default(false),
  severityPercent: z.number().int().min(0).max(100).default(0),
  repaired: z.boolean().default(false),
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
