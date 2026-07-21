import { describe, expect, it } from 'vitest'
import diagnosticTests from '../data/diagnosticTests.json'
import symptoms from '../data/symptoms.json'
import {
  CarPartIdSchema,
  DiagnosticTestsSchema,
  SymptomSchema,
  SymptomsSchema,
  type Symptom,
} from '../src'

/**
 * Sprint 73 (diagnosis I): the symptom/cause/test content guards task 1
 * calls for - schema parse, id uniqueness, weights summing to 100, every
 * cause addressing a real `CarPartId`, every test partition covering its
 * symptom's full cause list exactly once, and at least 2 causes per symptom
 * (the schema's own `.min(2)` already enforces the last one structurally,
 * re-asserted here as a content-level sanity check).
 */

const PARSED_SYMPTOMS: Symptom[] = SymptomsSchema.parse(symptoms)
const PARSED_TESTS = DiagnosticTestsSchema.parse(diagnosticTests)

describe('symptom/cause/test content (Sprint 73)', () => {
  it('parses cleanly against both schemas', () => {
    expect(PARSED_SYMPTOMS.length).toBeGreaterThan(0)
    expect(PARSED_TESTS.length).toBeGreaterThan(0)
  })

  it('every symptom id is unique', () => {
    const ids = PARSED_SYMPTOMS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every diagnostic test id is unique', () => {
    const ids = PARSED_TESTS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every symptom has at least 2 causes', () => {
    for (const symptom of PARSED_SYMPTOMS) {
      expect(symptom.causes.length, `"${symptom.id}" has too few causes`).toBeGreaterThanOrEqual(2)
    }
  })

  it("every symptom's cause weights sum to 100", () => {
    for (const symptom of PARSED_SYMPTOMS) {
      const total = symptom.causes.reduce((sum, cause) => sum + cause.weight, 0)
      expect(total, `"${symptom.id}"'s cause weights sum to ${total}, not 100`).toBe(100)
    }
  })

  it('every cause id is unique within its own symptom', () => {
    for (const symptom of PARSED_SYMPTOMS) {
      const ids = symptom.causes.map((c) => c.id)
      expect(new Set(ids).size, `"${symptom.id}" has a duplicate cause id`).toBe(ids.length)
    }
  })

  it('every cause addresses a real CarPartId', () => {
    for (const symptom of PARSED_SYMPTOMS) {
      for (const cause of symptom.causes) {
        expect(
          CarPartIdSchema.safeParse(cause.carPartId).success,
          `"${symptom.id}"'s cause "${cause.id}" addresses unknown part "${cause.carPartId}"`,
        ).toBe(true)
      }
    }
  })

  it("every test's testId is registered in diagnosticTests.json", () => {
    const testIds = new Set(PARSED_TESTS.map((t) => t.id))
    for (const symptom of PARSED_SYMPTOMS) {
      for (const test of symptom.tests) {
        expect(
          testIds.has(test.testId),
          `"${symptom.id}" references unregistered test "${test.testId}"`,
        ).toBe(true)
      }
    }
  })

  it("every test's partition covers its symptom's full cause list exactly once (no gaps, no overlaps)", () => {
    for (const symptom of PARSED_SYMPTOMS) {
      const causeIds = symptom.causes.map((c) => c.id).sort()
      for (const test of symptom.tests) {
        const partitionIds = [...test.partition[0], ...test.partition[1]].sort()
        expect(
          partitionIds,
          `"${symptom.id}"'s test "${test.testId}" partition does not exactly cover its cause list`,
        ).toEqual(causeIds)
        // No overlap between the two groups.
        const overlap = test.partition[0].filter((id) => test.partition[1].includes(id))
        expect(overlap, `"${symptom.id}"'s test "${test.testId}" has an overlapping cause`).toEqual(
          [],
        )
      }
    }
  })

  it('every symptom has at least one test', () => {
    for (const symptom of PARSED_SYMPTOMS) {
      expect(symptom.tests.length, `"${symptom.id}" has no tests at all`).toBeGreaterThan(0)
    }
  })
})

/**
 * Sprint 106 (routed diagnosis): `unlockedBy` chain integrity, checked by
 * `SymptomSchema`'s own `superRefine`. Hand-built fixtures rather than real
 * content, since the point is the shape of the chain, not any particular
 * symptom's causes - `buildTestSymptom` below only needs enough of a valid
 * symptom (2 causes, well-formed partitions) for the chain rules themselves
 * to be the only thing under test.
 */
function buildTestSymptom(
  tests: Array<{ testId: string; unlockedBy?: { testId: string; group?: 0 | 1 } }>,
): unknown {
  return {
    id: 'unlock-chain-symptom',
    cardLine: 'Fixture symptom for unlock-chain tests.',
    causes: [
      { id: 'cause-a', carPartId: 'headValvetrain', setBand: 'worn', weight: 50 },
      { id: 'cause-b', carPartId: 'headValvetrain', setBand: 'poor', weight: 50 },
    ],
    tests: tests.map(({ testId, unlockedBy }) => ({
      testId,
      partition: [['cause-a'], ['cause-b']],
      resultCopy: ['Result A.', 'Result B.'],
      ...(unlockedBy ? { unlockedBy } : {}),
    })),
  }
}

describe("SymptomSchema's unlockedBy chain integrity (Sprint 106)", () => {
  it('accepts a valid 2-layer chain: a root plus one test it unlocks', () => {
    const symptom = buildTestSymptom([
      { testId: 'root' },
      { testId: 'child', unlockedBy: { testId: 'root', group: 0 } },
    ])
    expect(SymptomSchema.safeParse(symptom).success).toBe(true)
  })

  it('rejects an unlockedBy.testId that names no other test on the symptom', () => {
    const symptom = buildTestSymptom([
      { testId: 'root' },
      { testId: 'child', unlockedBy: { testId: 'no-such-test', group: 0 } },
    ])
    expect(SymptomSchema.safeParse(symptom).success).toBe(false)
  })

  it('rejects a test that is unlockedBy itself', () => {
    const symptom = buildTestSymptom([
      { testId: 'root' },
      { testId: 'self-locked', unlockedBy: { testId: 'self-locked', group: 0 } },
    ])
    expect(SymptomSchema.safeParse(symptom).success).toBe(false)
  })

  it('rejects a cycle between two tests each unlocked by the other', () => {
    const symptom = buildTestSymptom([
      { testId: 'root' },
      { testId: 'a', unlockedBy: { testId: 'b', group: 0 } },
      { testId: 'b', unlockedBy: { testId: 'a', group: 0 } },
    ])
    expect(SymptomSchema.safeParse(symptom).success).toBe(false)
  })

  it('rejects an unlock chain deeper than 3 (a root sits at depth 1)', () => {
    const symptom = buildTestSymptom([
      { testId: 't1' },
      { testId: 't2', unlockedBy: { testId: 't1', group: 0 } },
      { testId: 't3', unlockedBy: { testId: 't2', group: 0 } },
      { testId: 't4', unlockedBy: { testId: 't3', group: 0 } },
    ])
    expect(SymptomSchema.safeParse(symptom).success).toBe(false)
  })

  it('rejects a symptom whose every test is locked (no root test to start from)', () => {
    const symptom = buildTestSymptom([
      { testId: 'a', unlockedBy: { testId: 'b', group: 0 } },
      { testId: 'b', unlockedBy: { testId: 'a', group: 0 } },
    ])
    expect(SymptomSchema.safeParse(symptom).success).toBe(false)
  })
})

/**
 * `unlockedBy.group` is optional (a group-less entry opens once the named
 * sibling has run at all, either outcome - the "whole board opens after a
 * first look" case). The chain-integrity rules above key off `testId` alone,
 * so they apply identically whether `group` is present or absent.
 */
describe("SymptomSchema's unlockedBy chain integrity with a group-less unlockedBy", () => {
  it('accepts a valid 2-layer chain whose unlockedBy carries no group', () => {
    const symptom = buildTestSymptom([
      { testId: 'root' },
      { testId: 'child', unlockedBy: { testId: 'root' } },
    ])
    expect(SymptomSchema.safeParse(symptom).success).toBe(true)
  })

  it('rejects a group-less unlockedBy.testId that names no other test on the symptom', () => {
    const symptom = buildTestSymptom([
      { testId: 'root' },
      { testId: 'child', unlockedBy: { testId: 'no-such-test' } },
    ])
    expect(SymptomSchema.safeParse(symptom).success).toBe(false)
  })

  it('rejects a test that is group-lessly unlockedBy itself', () => {
    const symptom = buildTestSymptom([
      { testId: 'root' },
      { testId: 'self-locked', unlockedBy: { testId: 'self-locked' } },
    ])
    expect(SymptomSchema.safeParse(symptom).success).toBe(false)
  })

  it('rejects a cycle between two tests each group-lessly unlocked by the other', () => {
    const symptom = buildTestSymptom([
      { testId: 'root' },
      { testId: 'a', unlockedBy: { testId: 'b' } },
      { testId: 'b', unlockedBy: { testId: 'a' } },
    ])
    expect(SymptomSchema.safeParse(symptom).success).toBe(false)
  })

  it('rejects a symptom whose every test is group-lessly locked (no root test to start from)', () => {
    const symptom = buildTestSymptom([
      { testId: 'a', unlockedBy: { testId: 'b' } },
      { testId: 'b', unlockedBy: { testId: 'a' } },
    ])
    expect(SymptomSchema.safeParse(symptom).success).toBe(false)
  })
})
