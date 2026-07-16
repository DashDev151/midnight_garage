import { z } from 'zod'
import { CarPartIdSchema, ConditionBandSchema, GradeSchema } from './tags'

/**
 * Sprint 72 (outcome-based service jobs): a `RequirementSpec` is an end-state
 * predicate over a car, not an action - "this slot must hold at least this
 * band (and grade)", never "repair this" or "install that". Any route that
 * leaves the car in the required state satisfies it (decision 4). Lives here,
 * in content, so `ServiceJobTaskSchema` can validate against it as data; the
 * actual evaluator (`evaluateRequirement`) lives in `packages/sim/src/
 * requirements.ts`, which imports this type - the same content/sim split
 * every other schema-vs-behaviour pair in this codebase already follows.
 *
 * One primitive ships this sprint: `slotCondition`. Story missions
 * (Sprint 76) add their own primitives (lap-time ceiling, taste match, budget
 * cap, deadline) to this SAME union - the shared module the component-
 * hierarchy and story-builds specs both name.
 */
export const RequirementSpecSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('slotCondition'),
    carPartId: CarPartIdSchema,
    /** The slot's installed part must be at least this band. An empty or
     * scrap-band slot always fails, regardless of `minGrade` (decision 1). */
    minBand: ConditionBandSchema,
    /** When present, the installed part's own catalog grade must also be at
     * least this - the former `install` task's requirement. Absent for a
     * pure band requirement (the former `repair` task). */
    minGrade: GradeSchema.optional(),
  }),
])

export type RequirementSpec = z.infer<typeof RequirementSpecSchema>
