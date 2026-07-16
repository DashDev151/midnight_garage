import { z } from 'zod'

/**
 * Sprint 73 (diagnosis I): a diagnostic test's own cost - a flat registry of
 * "what this test is called and how many minutes it burns from a visit's
 * budget" (`economy.diagnosis.visitMinutes`, spent by Sprint 74's inspection
 * verb). Which symptom a test applies to, its cause partition, and its
 * result copy are NOT here - those live on the symptom's own `tests` entry
 * (`symptom.ts`'s `TestApplicationSchema`), since a partition only makes
 * sense in the context of the specific cause list it narrows.
 */
export const DiagnosticTestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  minutes: z.number().int().positive(),
})

export const DiagnosticTestsSchema = z.array(DiagnosticTestSchema).min(1)

export type DiagnosticTest = z.infer<typeof DiagnosticTestSchema>
