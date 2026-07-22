import { describe, expect, it } from 'vitest'
import {
  ECONOMY,
  LAP_REFERENCES,
  PERSONAS,
  PROVENANCE_POOL,
  STAFF_CANDIDATES,
  STORY_MISSIONS,
  SYMPTOMS,
} from '../src/data'

/**
 * Extends the game package's own spelling guard
 * (`packages/game/src/spellingGuard.test.ts`) to CONTENT's own player-facing
 * string fields - the same `BANNED` pattern list, the same word-boundary
 * matching, one shared standard for every surface a player actually reads
 * regardless of which package it lives in. Covers:
 *
 * - `symptoms.json`'s `cardLine` (the free lot-card line) and every test's
 *   `resultCopy` pair.
 * - `provenance.json`'s whole flavour pool.
 * - `economy.json`'s `diagnosis.saleRevealCopy` templates.
 * - `storyMissions.json`'s title/request/delivered/overdelivered/lapsed
 *   copy and `personas.json`'s name/intro.
 * - `lapReferences.json`'s entry names.
 *
 * Deliberately field-targeted, not a blanket scan of every string in every
 * JSON file (unlike `noEmDash.test.ts`'s repo-wide sweep) - a content id
 * (`carPartId`, `setBand`, a symptom's own kebab-case `id`) is a code
 * identifier, not player copy, and must stay exempt per directive 18 exactly
 * as it is in the game package's own guard.
 */
const BANNED = [
  'labor(s|ed|ing|er|ers)?',
  'tires?',
  'color(s|ed|ing|ful|less)?',
  'gray(s|ed|ing|ish|er|est)?',
] as const

function offensesIn(label: string, text: string): string[] {
  const found: string[] = []
  for (const pattern of BANNED) {
    // Report the word actually found, not the pattern - a far more useful
    // failure message, matching the game package's own guard.
    const match = new RegExp(`\\b${pattern}\\b`, 'i').exec(text)
    if (match) found.push(`${label}: American spelling "${match[0]}"`)
  }
  return found
}

function findOffenses(): string[] {
  const offenses: string[] = []

  for (const symptom of SYMPTOMS) {
    offenses.push(...offensesIn(`symptoms.json:${symptom.id}.cardLine`, symptom.cardLine))
    for (const test of symptom.tests) {
      test.resultCopy.forEach((copy, i) => {
        const label = `symptoms.json:${symptom.id}.tests[${test.testId}].resultCopy[${i}]`
        offenses.push(...offensesIn(label, copy))
      })
    }
  }

  for (const [ageBand, byUpkeep] of Object.entries(PROVENANCE_POOL)) {
    for (const [upkeepTier, notes] of Object.entries(byUpkeep)) {
      notes.forEach((note, i) => {
        offenses.push(...offensesIn(`provenance.json:${ageBand}.${upkeepTier}[${i}]`, note))
      })
    }
  }

  offenses.push(
    ...offensesIn(
      'economy.json:diagnosis.saleRevealCopy.buyerWon',
      ECONOMY.diagnosis.saleRevealCopy.buyerWon,
    ),
    ...offensesIn(
      'economy.json:diagnosis.saleRevealCopy.playerWon',
      ECONOMY.diagnosis.saleRevealCopy.playerWon,
    ),
  )

  // The campaign's own player-facing copy.
  for (const mission of STORY_MISSIONS) {
    offenses.push(...offensesIn(`storyMissions.json:${mission.id}.title`, mission.title))
    offenses.push(
      ...offensesIn(`storyMissions.json:${mission.id}.requestCopy`, mission.requestCopy),
    )
    offenses.push(
      ...offensesIn(`storyMissions.json:${mission.id}.deliveredCopy`, mission.deliveredCopy),
    )
    offenses.push(
      ...offensesIn(
        `storyMissions.json:${mission.id}.overdeliveredCopy`,
        mission.overdeliveredCopy,
      ),
    )
  }
  for (const persona of PERSONAS) {
    offenses.push(...offensesIn(`personas.json:${persona.id}.name`, persona.name))
    offenses.push(...offensesIn(`personas.json:${persona.id}.intro`, persona.intro))
  }

  // The reference-lap board's fictional names.
  for (const entry of LAP_REFERENCES) {
    offenses.push(...offensesIn(`lapReferences.json:${entry.id}.name`, entry.name))
  }

  // The job-ad candidate name and bio pools.
  STAFF_CANDIDATES.names.forEach((name, i) => {
    offenses.push(...offensesIn(`staffCandidates.json:names[${i}]`, name))
  })
  STAFF_CANDIDATES.bios.forEach((bio, i) => {
    offenses.push(...offensesIn(`staffCandidates.json:bios[${i}]`, bio))
  })

  return offenses
}

describe('British spelling in content-side player copy (Sprint 75 decision 5)', () => {
  it('contains no American spellings', () => {
    const offenses = findOffenses()
    expect(offenses, `American spelling(s) found:\n${offenses.join('\n')}`).toEqual([])
  })

  /**
   * The guard checks ITSELF (same reasoning as the game package's own
   * guard): a pattern list that matches nothing passes just as quietly as
   * clean content. These cases are the proof the instrument works.
   */
  it.each([
    ['labored', true],
    ['laboring', true],
    ['colored', true],
    ['gray', true],
    ['tires', true],
  ])('catches the American spelling %s', (word, shouldCatch) => {
    expect(offensesIn('probe', `Fit the ${word} on the bench.`).length > 0).toBe(shouldCatch)
  })

  it.each([
    'laboured',
    'labouring',
    'coloured',
    'grey',
    'tyres',
    // Real English words that merely look like a banned stem - same
    // exemptions the game package's own guard already establishes.
    'laboratory',
    'tired',
  ])('leaves %s alone', (word) => {
    expect(offensesIn('probe', `Fit the ${word} on the bench.`)).toEqual([])
  })
})
