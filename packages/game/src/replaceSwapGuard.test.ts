import {
  PERSONAS,
  PROVENANCE_POOL,
  STAFF_CANDIDATES,
  STORY_MISSIONS,
  SYMPTOMS,
  TUTORIAL_STEPS,
} from '@midnight-garage/content'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCREENS_DIR = join(__dirname, 'screens')
const COMPONENTS_DIR = join(__dirname, 'components')
const REPO_ROOT = join(__dirname, '..', '..', '..')

/**
 * The remove-then-install ruling (CLAUDE.md directive): a part is never
 * swapped in one action, and player-facing copy never uses "replace" or
 * "swap" as a verb - the vocabulary is "Take it off" and "Fit". This has
 * regressed repeatedly, so the guard is the same shape as the
 * British-spelling guards (`spellingGuard.test.ts` in this package and in
 * `packages/content`): the `.vue` template TEXT (script, style, comments,
 * mustache expressions and tags all stripped, so a code identifier like
 * `replaceInPlace` or a data-test id never trips it) plus the same
 * player-facing content fields `packages/content/tests/spellingGuard.test.ts`
 * already scans, extended with the tutorial's own coach lines.
 *
 * `replaceInPlace`/`replacesOccupiedSlot` (the chassis/bodywork/paint shell
 * carriers) are a separate, deliberately out-of-scope path and still say
 * "Replace" in their own copy and code - those two identifiers are the only
 * allowlisted exception, and only as identifiers; the shell carrier's own
 * player-facing button copy already reads "Fit".
 */
const BANNED = ['replac(e|ed|es|ing)', 'swap(s|ped|ping)?'] as const

/** The visible text of a `.vue` file's template - everything a player could
 * read, with all the code and markup stripped out. Mirrors
 * `spellingGuard.test.ts`'s own extraction exactly. */
function visibleTemplateText(contents: string): string {
  return contents
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '') // mustache expressions are code, not copy
    .replace(/<[^>]*>/g, ' ') // tags (and their attribute bindings) are not copy
}

function offensesIn(label: string, text: string): string[] {
  const found: string[] = []
  for (const pattern of BANNED) {
    const match = new RegExp(`\\b${pattern}\\b`, 'i').exec(text)
    if (match) found.push(`${label}: banned verb "${match[0]}"`)
  }
  return found
}

function vueTemplateOffenses(): string[] {
  const offenses: string[] = []
  for (const dir of [SCREENS_DIR, COMPONENTS_DIR]) {
    for (const fileName of readdirSync(dir)) {
      if (!fileName.endsWith('.vue')) continue
      const filePath = join(dir, fileName)
      const text = visibleTemplateText(readFileSync(filePath, 'utf8'))
      offenses.push(...offensesIn(relative(REPO_ROOT, filePath), text))
    }
  }
  return offenses
}

/** The same player-facing content fields `packages/content`'s own spelling
 * guard scans, plus the tutorial coach lines. */
function contentCopyOffenses(): string[] {
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

  STAFF_CANDIDATES.names.forEach((name, i) => {
    offenses.push(...offensesIn(`staffCandidates.json:names[${i}]`, name))
  })
  STAFF_CANDIDATES.bios.forEach((bio, i) => {
    offenses.push(...offensesIn(`staffCandidates.json:bios[${i}]`, bio))
  })

  for (const step of TUTORIAL_STEPS) {
    step.lines.forEach((line, i) => {
      offenses.push(...offensesIn(`tutorialSteps.json:${step.id}.lines[${i}]`, line.text))
    })
  }

  return offenses
}

describe('no "replace"/"swap" as a verb in player-facing copy (Sprint 206 B5, the remove-then-install ruling)', () => {
  it('finds none in .vue template text', () => {
    const offenses = vueTemplateOffenses()
    expect(offenses, `banned verb(s) found:\n${offenses.join('\n')}`).toEqual([])
  })

  it('finds none in content copy JSON', () => {
    const offenses = contentCopyOffenses()
    expect(offenses, `banned verb(s) found:\n${offenses.join('\n')}`).toEqual([])
  })

  /**
   * The guard checks ITSELF (same reasoning as the spelling guards): a
   * pattern that matches nothing passes just as quietly as clean copy.
   */
  it.each([
    ['replace', true],
    ['replaced', true],
    ['replaces', true],
    ['replacing', true],
    ['swap', true],
    ['swaps', true],
    ['swapped', true],
    ['swapping', true],
  ])('catches the banned verb %s', (word, shouldCatch) => {
    expect(offensesIn('probe', `Press Fit to ${word} the tyres.`).length > 0).toBe(shouldCatch)
  })

  it.each([
    // Real words that merely look like a banned stem must stay clean - the
    // enumerated suffix list (never `\w*`) is what keeps them clean.
    'replacement',
    'replaceable',
  ])('leaves %s alone', (word) => {
    expect(offensesIn('probe', `Nothing on hand as a ${word} part.`)).toEqual([])
  })
})
