import { z } from 'zod'
import { PartInstanceSchema } from './part'

const ConditionSchema = z.object({
  engine: z.number().min(0).max(100),
  drivetrain: z.number().min(0).max(100),
  suspension: z.number().min(0).max(100),
  body: z.number().min(0).max(100),
  interior: z.number().min(0).max(100),
})

const BuildSheetSchema = z.object({
  engine: PartInstanceSchema.nullable().default(null),
  forcedInduction: PartInstanceSchema.nullable().default(null),
  drivetrain: PartInstanceSchema.nullable().default(null),
  suspension: PartInstanceSchema.nullable().default(null),
  brakes: PartInstanceSchema.nullable().default(null),
  bodyAero: PartInstanceSchema.nullable().default(null),
  wheelsInterior: PartInstanceSchema.nullable().default(null),
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
  condition: ConditionSchema,
  hiddenIssues: z.array(RevealedIssueSchema).default([]),
  authenticityPercent: z.number().min(0).max(100),
  buildSheet: BuildSheetSchema,
})

export type CarInstance = z.infer<typeof CarInstanceSchema>
