import { describe, expect, it } from 'vitest'
import failureModes from '../data/failureModes.json'
import symptoms from '../data/symptoms.json'
import {
  FAILURE_MODES,
  FailureModesSchema,
  resolveSymptomCauses,
  SYMPTOMS,
  SymptomsContentSchema,
} from '../src'

/**
 * The shared failure-mode registry (`failureModes.json` + `FailureModeSchema`)
 * and the join that resolves each symptom's cause references against it -
 * registry integrity, dangling-reference rejection, and a valid join proving
 * the resolved shape matches the registry entry it points at.
 */

const PARSED_REGISTRY = FailureModesSchema.parse(failureModes)

describe('failure-mode registry content', () => {
  it('parses cleanly', () => {
    expect(PARSED_REGISTRY.length).toBeGreaterThan(0)
  })

  it('every registry id is unique', () => {
    const ids = PARSED_REGISTRY.map((mode) => mode.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('rejects a registry with a duplicate id', () => {
    const withDuplicate = [...failureModes, failureModes[0]]
    expect(FailureModesSchema.safeParse(withDuplicate).success).toBe(false)
  })

  it("every symptom's cause references a real failureModeId", () => {
    const registryIds = new Set(PARSED_REGISTRY.map((mode) => mode.id))
    const content = SymptomsContentSchema.parse(symptoms)
    for (const symptom of content) {
      for (const cause of symptom.causes) {
        expect(
          registryIds.has(cause.failureModeId),
          `"${symptom.id}" references unknown failureModeId "${cause.failureModeId}"`,
        ).toBe(true)
      }
    }
  })
})

describe('the content-load registry join', () => {
  it('resolves every symptom cause to its registry entry (a valid join)', () => {
    const registryById = new Map(PARSED_REGISTRY.map((mode) => [mode.id, mode]))
    for (const symptom of SYMPTOMS) {
      for (const cause of symptom.causes) {
        const registryEntry = registryById.get(cause.id)
        expect(
          registryEntry,
          `"${symptom.id}"'s cause "${cause.id}" has no registry entry`,
        ).toBeDefined()
        expect(cause.carPartId).toBe(registryEntry!.carPartId)
        expect(cause.setBand).toBe(registryEntry!.setBand)
      }
    }
  })

  it('FAILURE_MODES matches a fresh parse of the same registry file', () => {
    expect(FAILURE_MODES).toEqual(PARSED_REGISTRY)
  })

  it('fails loudly on a dangling failureModeId reference', () => {
    const registryById = new Map(PARSED_REGISTRY.map((mode) => [mode.id, mode]))
    const danglingSymptom = {
      id: 'fixture-symptom',
      cardLine: 'Fixture symptom for the dangling-reference test.',
      causes: [
        { failureModeId: 'no-such-failure-mode', weight: 60 },
        { failureModeId: PARSED_REGISTRY[0]!.id, weight: 40 },
      ],
      tests: [],
    }
    expect(() => resolveSymptomCauses(danglingSymptom, registryById)).toThrow(
      /references unknown failureModeId "no-such-failure-mode"/,
    )
  })

  it('resolves cleanly when every reference is registered', () => {
    const registryById = new Map(PARSED_REGISTRY.map((mode) => [mode.id, mode]))
    const [first, second] = PARSED_REGISTRY
    const validSymptom = {
      id: 'fixture-symptom',
      cardLine: 'Fixture symptom for the clean-join test.',
      causes: [
        { failureModeId: first!.id, weight: 60 },
        { failureModeId: second!.id, weight: 40 },
      ],
      tests: [],
    }
    const resolved = resolveSymptomCauses(validSymptom, registryById)
    expect(resolved.causes).toEqual([
      { ...first, weight: 60 },
      { ...second, weight: 40 },
    ])
  })
})
