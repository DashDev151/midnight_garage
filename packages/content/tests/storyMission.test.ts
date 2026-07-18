import { describe, expect, it } from 'vitest'
import personas from '../data/personas.json'
import storyMissions from '../data/storyMissions.json'
import { ComponentIdSchema, PersonasSchema, StoryMissionsSchema, type StoryMission } from '../src'

/**
 * Sprint 76 (story missions I): the content guards task 2 calls for - schema
 * parse, id uniqueness, ascending gate order (the strictly linear campaign),
 * valid specialty groups, and non-empty copy fields. Parses the raw authored
 * JSON directly (not `STORY_MISSIONS` from `src/data.ts`), since that export
 * mirrors `budgetCapYen` into an extra `requirements` entry at load - this
 * file is checking the AUTHORED content, before that mirror is applied.
 */
const PARSED_MISSIONS: StoryMission[] = StoryMissionsSchema.parse(storyMissions)
const PARSED_PERSONAS = PersonasSchema.parse(personas)

describe('story mission/persona content (Sprint 76)', () => {
  it('parses cleanly against both schemas', () => {
    expect(PARSED_MISSIONS.length).toBeGreaterThan(0)
    expect(PARSED_PERSONAS.length).toBeGreaterThan(0)
  })

  it('every mission id is unique', () => {
    const ids = PARSED_MISSIONS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every persona id is unique', () => {
    const ids = PARSED_PERSONAS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every mission references a real persona', () => {
    const personaIds = new Set(PARSED_PERSONAS.map((p) => p.id))
    for (const mission of PARSED_MISSIONS) {
      expect(
        personaIds.has(mission.personaId),
        `mission "${mission.id}" references unknown persona "${mission.personaId}"`,
      ).toBe(true)
    }
  })

  it('gateReputationPoints is strictly non-decreasing in authored order (the linear campaign)', () => {
    let previousGate = -1
    for (const mission of PARSED_MISSIONS) {
      expect(
        mission.gateReputationPoints,
        `mission "${mission.id}"'s gate (${mission.gateReputationPoints}) is below the previous mission's (${previousGate})`,
      ).toBeGreaterThanOrEqual(previousGate)
      previousGate = mission.gateReputationPoints
    }
  })

  it('every specialtyGroups entry is a real ComponentId', () => {
    for (const mission of PARSED_MISSIONS) {
      for (const group of mission.specialtyGroups) {
        expect(
          ComponentIdSchema.safeParse(group).success,
          `mission "${mission.id}" names unknown specialty group "${group}"`,
        ).toBe(true)
      }
    }
  })

  it('every mission has at least one requirement', () => {
    for (const mission of PARSED_MISSIONS) {
      expect(
        mission.requirements.length,
        `mission "${mission.id}" has no requirements`,
      ).toBeGreaterThan(0)
    }
  })

  it('every copy field is non-empty', () => {
    for (const mission of PARSED_MISSIONS) {
      for (const field of ['title', 'requestCopy', 'deliveredCopy', 'overdeliveredCopy'] as const) {
        expect(mission[field].length, `mission "${mission.id}".${field} is empty`).toBeGreaterThan(
          0,
        )
      }
    }
    for (const persona of PARSED_PERSONAS) {
      expect(persona.name.length, `persona "${persona.id}".name is empty`).toBeGreaterThan(0)
      expect(persona.intro.length, `persona "${persona.id}".intro is empty`).toBeGreaterThan(0)
    }
  })

  it('budgetCapYen and payoutYen are both positive', () => {
    for (const mission of PARSED_MISSIONS) {
      expect(mission.budgetCapYen, `mission "${mission.id}"'s budgetCapYen`).toBeGreaterThan(0)
      expect(mission.payoutYen, `mission "${mission.id}"'s payoutYen`).toBeGreaterThan(0)
    }
  })
})
