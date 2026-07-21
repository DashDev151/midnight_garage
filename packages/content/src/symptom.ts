import { z } from 'zod'
import { FailureModeSchema, type FailureMode } from './failureMode'

/**
 * A symptom's own authored reference to one entry in the shared failure-mode
 * registry (`failureMode.ts`): which failure mode it can point to, and its
 * share of the weighted roll among the symptom's other causes (weights need
 * not be pre-normalized to exactly 100, but should sum to ~100 across a
 * symptom's own cause list - same convention as `economy.ts`'s
 * `serviceJobs.dailyOfferCountWeights`). The weight lives on the reference,
 * not the registry entry, because odds are contextual: the same failure mode
 * is likelier under one symptom than another. This is the shape `causes`
 * carries in `symptoms.json`; it is never what sim/game consume directly.
 */
export const CauseSchema = z.object({
  failureModeId: z.string().min(1),
  weight: z.number().positive(),
})

/**
 * The resolved cause shape sim/game consume: the referenced failure mode's
 * own identity (`id`/`carPartId`/`setBand`) joined
 * with this symptom's own contextual weight. Produced at content-load time
 * (`data.ts`) by resolving each symptom's `CauseSchema` references against
 * the registry; `symptoms.json` never carries this shape directly. `setBand`
 * is a floor, never a ceiling: generation (`auctions.ts`) sets the true band
 * to the WORSE of the part's already-rolled band and this value, so a cause
 * never makes an already-worse part better.
 */
export const ResolvedCauseSchema = FailureModeSchema.extend({
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
 * unlock depth at most 3) is validated by `checkTestChainIntegrity` below,
 * shared by both symptom schemas, not here.
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

export type TestApplication = z.infer<typeof TestApplicationSchema>

/**
 * The `unlockedBy` chain-integrity check, shared by both the raw-content and
 * resolved symptom schemas below since it only ever looks at
 * `tests` - unaffected by whether `causes` is a reference or a resolved
 * cause. Whenever the symptom has any tests at all: every `unlockedBy.testId`
 * names another test of this same symptom (not itself, not an unknown id);
 * no chain cycles; at least one root test (a test with no `unlockedBy`)
 * exists to start from; and no chain runs deeper than 3 (a root sits at
 * depth 1).
 */
function checkTestChainIntegrity(
  symptom: { id: string; tests: TestApplication[] },
  ctx: z.RefinementCtx,
): void {
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
}

/**
 * The shape shared by both the raw-content and resolved symptom schemas,
 * parameterized only over the cause schema - free and public on the lot card
 * (`cardLine`), an open weighted cause table (`causes`), and the tests that
 * narrow it (`tests`). At least 2 causes, so there is always real ambiguity
 * to price and test.
 */
function symptomShape<C extends z.ZodTypeAny>(causeSchema: C) {
  return z.object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
    cardLine: z.string().min(1),
    causes: z.array(causeSchema).min(2),
    tests: z.array(TestApplicationSchema),
  })
}

/**
 * A symptom exactly as authored in `symptoms.json`: `causes` is a list of
 * `CauseSchema` references into the failure-mode registry, not yet resolved.
 * Used only to validate/parse the raw content file (`data.ts`) before the
 * registry join; sim/game never see this shape.
 */
export const SymptomContentSchema = symptomShape(CauseSchema).superRefine(checkTestChainIntegrity)
export const SymptomsContentSchema = z.array(SymptomContentSchema).min(1)

/**
 * A player-facing symptom a generated car can carry, with `causes` resolved
 * against the failure-mode registry (`ResolvedCauseSchema`) - the shape
 * sim/game consume. `data.ts` produces this from `SymptomContentSchema`'s
 * parsed output; never parsed directly from `symptoms.json`.
 */
export const SymptomSchema = symptomShape(ResolvedCauseSchema).superRefine(checkTestChainIntegrity)
export const SymptomsSchema = z.array(SymptomSchema).min(1)

export type CauseRef = z.infer<typeof CauseSchema>
export type Cause = z.infer<typeof ResolvedCauseSchema>
export type SymptomContent = z.infer<typeof SymptomContentSchema>
export type Symptom = z.infer<typeof SymptomSchema>

/**
 * Joins a raw-content symptom's cause references against the failure-mode
 * registry, producing the resolved shape sim/game consume. `data.ts` calls
 * this once per symptom at content-load time; tests call it directly to
 * prove the join (and its dangling-reference failure) without needing the
 * full content-loading pipeline. Fails loudly (throws) rather than silently
 * dropping a cause, since a dangling reference is a content bug.
 */
export function resolveSymptomCauses(
  symptom: SymptomContent,
  registry: ReadonlyMap<string, FailureMode>,
): Symptom {
  return {
    ...symptom,
    causes: symptom.causes.map((cause) => {
      const failureMode = registry.get(cause.failureModeId)
      if (!failureMode) {
        throw new Error(
          `symptom "${symptom.id}" references unknown failureModeId "${cause.failureModeId}"`,
        )
      }
      return { ...failureMode, weight: cause.weight }
    }),
  }
}
