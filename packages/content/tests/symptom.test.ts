import { describe, expect, it } from 'vitest'
import diagnosticTests from '../data/diagnosticTests.json'
import symptoms from '../data/symptoms.json'
import { CarPartIdSchema, DiagnosticTestsSchema, SymptomsSchema, type Symptom } from '../src'

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
