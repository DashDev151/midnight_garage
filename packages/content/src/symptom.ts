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
 *
 * `unlockedBy` (Sprint 106, the routed diagnostic tree): absent means this
 * test is a ROOT, offered from the start; present means it is offered only
 * once the named sibling test (`unlockedBy.testId`, another test of the SAME
 * symptom) has run. With `unlockedBy.group` present (0 or 1, matching that
 * parent test's own `partition` index), the sibling must also have resolved
 * to that partition group; with `unlockedBy.group` absent, the sibling
 * having run at all is enough, whichever group it resolved to - this is how
 * a whole board of follow-up tests opens after a first look. A lone
 * `TestApplicationSchema` cannot see its siblings, so the shape of every
 * chain (parent exists, no self-reference, acyclic, at least one root,
 * unlock depth at most 3) is validated by `SymptomSchema`'s own integrity
 * refinement below, not here.
 */
export const TestApplicationSchema = z.object({
  testId: z.string().min(1),
  partition: z.tuple([z.array(z.string().min(1)).min(1), z.array(z.string().min(1)).min(1)]),
  resultCopy: z.tuple([z.string().min(1), z.string().min(1)]),
  unlockedBy: z
    .object({
      testId: z.string().min(1),
      group: z.union([z.literal(0), z.literal(1)]).optional(),
    })
    .optional(),
})

/**
 * A player-facing symptom a generated car can carry (Sprint 73 decision 4):
 * free and public on the lot card (`cardLine`), with an open weighted cause
 * table (`causes`) and the tests that narrow it (`tests` - Sprint 74 wires
 * the verb that actually runs one; the content ships now per decision 4's
 * own instruction). At least 2 causes, so there is always real ambiguity to
 * price and test.
 *
 * The integrity refinement (Sprint 106) checks the shape of `tests`' own
 * `unlockedBy` chains, whenever the symptom has any tests at all: every
 * `unlockedBy.testId` names another test of this same symptom (not itself,
 * not an unknown id); no chain cycles; at least one root test (a test with
 * no `unlockedBy`) exists to start from; and no chain runs deeper than 3
 * (a root sits at depth 1).
 */
export const SymptomSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
    cardLine: z.string().min(1),
    causes: z.array(CauseSchema).min(2),
    tests: z.array(TestApplicationSchema),
  })
  .superRefine((symptom, ctx) => {
    if (symptom.tests.length === 0) return
    const testsById = new Map(symptom.tests.map((test) => [test.testId, test]))
    let hasRoot = false

    for (const test of symptom.tests) {
      if (!test.unlockedBy) {
        hasRoot = true
        continue
      }
      const parentId = test.unlockedBy.testId
      if (parentId === test.testId) {
        ctx.addIssue(`"${symptom.id}"'s test "${test.testId}" is unlockedBy itself`)
        continue
      }
      if (!testsById.has(parentId)) {
        ctx.addIssue(
          `"${symptom.id}"'s test "${test.testId}" is unlockedBy unknown test "${parentId}"`,
        )
      }
    }

    if (!hasRoot) {
      ctx.addIssue(`"${symptom.id}" has tests but no root test (every test has an unlockedBy)`)
    }

    for (const test of symptom.tests) {
      const visited = new Set<string>([test.testId])
      let currentId = test.testId
      let depth = 1
      for (;;) {
        const parentId = testsById.get(currentId)?.unlockedBy?.testId
        if (!parentId || !testsById.has(parentId)) break
        if (visited.has(parentId)) {
          ctx.addIssue(
            `"${symptom.id}"'s test "${test.testId}"'s unlock chain cycles through "${parentId}"`,
          )
          break
        }
        visited.add(parentId)
        depth += 1
        if (depth > 3) {
          ctx.addIssue(
            `"${symptom.id}"'s test "${test.testId}"'s unlock chain exceeds the maximum depth of 3`,
          )
          break
        }
        currentId = parentId
      }
    }
  })

export const SymptomsSchema = z.array(SymptomSchema).min(1)

export type Cause = z.infer<typeof CauseSchema>
export type TestApplication = z.infer<typeof TestApplicationSchema>
export type Symptom = z.infer<typeof SymptomSchema>
