import { z } from 'zod'
import { CarPartIdSchema, ConditionBandSchema } from './tags'

/**
 * Sprint 73 (diagnosis I, the fear-priced board): one possible root cause of a
 * symptom - the part it actually damages, the band that damage sets, and its
 * share of the weighted roll among the symptom's other causes (weights need
 * not be pre-normalized to exactly 100, but should sum to ~100 across a
 * symptom's own cause list - same convention as `economy.ts`'s
 * `serviceJobs.dailyOfferCountWeights`). `setBand` is a floor, never a
 * ceiling: generation (`auctions.ts`) sets the true band to the WORSE of the
 * part's already-rolled band and this value (decision 2), so a cause never
 * makes an already-worse part better.
 */
export const CauseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  carPartId: CarPartIdSchema,
  setBand: ConditionBandSchema,
  weight: z.number().positive(),
})

/**
 * One diagnostic test's APPLICATION to a specific symptom (Sprint 73): which
 * globally-registered test (`diagnosticTest.ts`'s `DiagnosticTestSchema`, by
 * `testId`) narrows this symptom's cause list, how it partitions the causes
 * into exactly two groups, and the player-facing result line for each group.
 * A cause id must appear in exactly one partition group - `integrity`-style
 * content tests enforce full, non-overlapping coverage of the symptom's own
 * `causes` list. `resultCopy[i]` describes the outcome when the true cause
 * falls in `partition[i]`.
 */
export const TestApplicationSchema = z.object({
  testId: z.string().min(1),
  partition: z.tuple([z.array(z.string().min(1)).min(1), z.array(z.string().min(1)).min(1)]),
  resultCopy: z.tuple([z.string().min(1), z.string().min(1)]),
})

/**
 * A player-facing symptom a generated car can carry (Sprint 73 decision 4):
 * free and public on the lot card (`cardLine`), with an open weighted cause
 * table (`causes`) and the tests that narrow it (`tests` - Sprint 74 wires
 * the verb that actually runs one; the content ships now per decision 4's
 * own instruction). At least 2 causes, so there is always real ambiguity to
 * price and test.
 */
export const SymptomSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  cardLine: z.string().min(1),
  causes: z.array(CauseSchema).min(2),
  tests: z.array(TestApplicationSchema),
})

export const SymptomsSchema = z.array(SymptomSchema).min(1)

export type Cause = z.infer<typeof CauseSchema>
export type TestApplication = z.infer<typeof TestApplicationSchema>
export type Symptom = z.infer<typeof SymptomSchema>
