import { z } from 'zod'
import { CarPartIdSchema, ComponentIdSchema } from './tags'
import { ToolLevelSchema } from './toolLines'

/**
 * Where a test can be run (docs/design/systems/knowledge-and-diagnosis.md
 * section 7). `yard` is the existing set: near-toolless, minute-costed at the
 * auction inspection, deliberately coarse - it separates cause families and
 * often cannot reach a single deep cause on its own. `workshop` is new: it
 * requires the car in the player's shop, costs labour points rather than
 * inspection minutes, and partitions finer - some workshop tests only unlock
 * once an access slot is vacated.
 */
export const DiagnosticTestVenueSchema = z.enum(['yard', 'workshop'])

export type DiagnosticTestVenue = z.infer<typeof DiagnosticTestVenueSchema>

/** A workshop test's capability ceiling: the named tool line must be at
 * least this level before the test can run - the same `ToolLevel` ladder
 * (`toolLevelsFor`, sim) every other capability gate in this codebase reads. */
const RequiresToolTierSchema = z.object({
  component: ComponentIdSchema,
  tier: ToolLevelSchema,
})

/**
 * A diagnostic test's own cost and gates - a flat registry of "what this test
 * is called, where it can run, and what running it costs and requires."
 * Which symptom a test applies to, its cause partition, and its result copy
 * live on the symptom's own `tests` entry (`symptom.ts`'s `TestApplicationSchema`),
 * since a partition only makes sense in the context of the specific cause list
 * it narrows.
 *
 * `minutes` is the yard-visit cost, always authored (even on a `workshop`
 * test, where it goes unread by the workshop test runner) so every existing
 * entry keeps its exact shape - `venue` defaults to `'yard'`, so all 46
 * pre-sprint-218 entries parse unchanged with zero behaviour change.
 * `laborPoints` is the workshop cost (the same energy pool every other shop
 * action spends, `economy.energy`); `requiresToolTier`/`requiresVacatedSlot`
 * are workshop-only capability/access gates. A `workshop` test must carry
 * `laborPoints`; a `yard` test may carry none of the three workshop-only
 * fields.
 */
export const DiagnosticTestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
    minutes: z.number().int().positive(),
    venue: DiagnosticTestVenueSchema.default('yard'),
    /** The tool line and level a workshop test needs before it can be run
     * at all - absent means no tool-tier ceiling beyond being in the shop. */
    requiresToolTier: RequiresToolTierSchema.optional(),
    /** A workshop test that only makes sense with this slot's part off the
     * car (a bench check, a strip-and-look) - absent means no access gate. */
    requiresVacatedSlot: CarPartIdSchema.optional(),
    /** The workshop labour cost - required on every `workshop` test, absent
     * on every `yard` test (yard tests spend inspection minutes instead). */
    laborPoints: z.number().int().positive().optional(),
  })
  .refine(
    (test) =>
      test.venue === 'workshop' ||
      (!test.requiresToolTier && !test.requiresVacatedSlot && test.laborPoints === undefined),
    {
      message: 'requiresToolTier/requiresVacatedSlot/laborPoints are workshop-only fields',
    },
  )
  .refine((test) => test.venue !== 'workshop' || test.laborPoints !== undefined, {
    message: 'a workshop test must carry laborPoints',
  })

export const DiagnosticTestsSchema = z.array(DiagnosticTestSchema).min(1)

export type DiagnosticTest = z.infer<typeof DiagnosticTestSchema>
