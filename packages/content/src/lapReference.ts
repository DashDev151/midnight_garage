import { z } from 'zod'
import { GradeSchema } from './tags'

/**
 * Sprint 77 (story missions II, the reference-lap board): a fictional,
 * diegetic comparable car the board renders alongside the player's own
 * (never-shown) candidate time - a shop car, a touge regular's build, a
 * magazine feature car. Times are NEVER authored here; they're always the
 * live output of `lapModel.ts`'s `lapTimeSecondsFor`/`selectBoardRows`
 * running against `powerPs`/`weightKg`/`tyreGrade`, so retuning
 * `economy.lapModel`'s coefficients retunes the whole board for free
 * (decision 3's "synthetic, never authored" ruling).
 *
 * Exactly one entry in the pool is the GRIP ANCHOR (`anchor: true`) - "the
 * magazine's long-termer", rendered once per tyre grade (four rows) so the
 * player reads the grade deltas off one identical car; it carries no
 * `tyreGrade` of its own since it isn't fixed to one. Every other (pool)
 * entry is `anchor: false` and carries a real `tyreGrade` - the discriminated
 * union enforces this split structurally, not just by content convention.
 */
const LapReferenceCarFields = {
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  name: z.string().min(1),
  powerPs: z.number().int().positive(),
  weightKg: z.number().int().positive(),
}

export const LapReferenceEntrySchema = z.discriminatedUnion('anchor', [
  z.object({ anchor: z.literal(true), ...LapReferenceCarFields }),
  z.object({ anchor: z.literal(false), ...LapReferenceCarFields, tyreGrade: GradeSchema }),
])

export const LapReferencesSchema = z.array(LapReferenceEntrySchema).min(1)

export type LapReferenceEntry = z.infer<typeof LapReferenceEntrySchema>
