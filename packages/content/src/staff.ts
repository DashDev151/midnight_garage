import { z } from 'zod'

export const TraitIdSchema = z.enum([
  'ex-pro-driver',
  'auction-rat',
  'perfectionist',
  'night-owl',
  'gaisha-fluent',
])

export const TraitDefinitionSchema = z.object({
  id: TraitIdSchema,
  displayName: z.string().min(1),
  description: z.string().min(1),
})

export const TraitDefinitionsSchema = z.array(TraitDefinitionSchema).min(1)

/** An individual hired staff member (GDD 7) — rolled stats, not catalog data. */
export const StaffMemberSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  stats: z.object({
    engine: z.number().int().min(1).max(5),
    chassis: z.number().int().min(1).max(5),
    body: z.number().int().min(1).max(5),
    hustle: z.number().int().min(1).max(5),
  }),
  weeklyWageYen: z.number().int().positive(),
  trait: TraitIdSchema,
})

export type TraitId = z.infer<typeof TraitIdSchema>
export type TraitDefinition = z.infer<typeof TraitDefinitionSchema>
export type StaffMember = z.infer<typeof StaffMemberSchema>
