import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCREENS_DIR = join(__dirname, 'screens')
const COMPONENTS_DIR = join(__dirname, 'components')
const DAY_LOG_FORMAT = join(__dirname, 'utils', 'dayLogFormat.ts')
const REPO_ROOT = join(__dirname, '..', '..', '..')

/**
 * Player-visible copy uses British spelling (CLAUDE.md directive 18). This
 * guard fails if any American form leaks into the text a
 * player actually reads - the `.vue` template TEXT nodes (script and style
 * blocks, HTML tags with their attribute bindings, mustache expressions, and
 * comments all stripped, so a code identifier like `laborSlotsRequired` or a
 * CSS `color:` never trips it) plus the string literals of `dayLogFormat.ts`
 * (the one non-component player-copy surface). Code identifiers themselves are
 * exempt per directive 18 (renaming persisted `labor*` save fields is a
 * migration for zero player value); only what renders is checked.
 */
/**
 * Each entry is a regex source, matched case-insensitively between word
 * boundaries.
 *
 * Inflections are enumerated explicitly rather than with `\w*`, which would
 * trip on "laboratory" (a real word that starts with "labor") - a bare
 * `\blabor\b` would also miss "labored", since the boundary requires nothing
 * after "labor".
 *
 * `tire` deliberately does NOT enumerate `-d`/`-ing`: "a tired engine" is
 * genuine car idiom, not the American spelling of "tyre".
 */
const BANNED = [
  'labor(s|ed|ing|er|ers)?',
  'tires?',
  'color(s|ed|ing|ful|less)?',
  'gray(s|ed|ing|ish|er|est)?',
] as const

/** The visible text of a `.vue` file's template - everything a player could
 * read, with all the code and markup stripped out. */
function visibleTemplateText(contents: string): string {
  return contents
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '') // mustache expressions are code, not copy
    .replace(/<[^>]*>/g, ' ') // tags (and their attribute bindings) are not copy
}

/** The contents of every backtick template literal in a `.ts` file - the
 * player copy `dayLogFormat.ts` assembles all lives in these (interpolated
 * strings). Single/double-quoted strings are deliberately NOT scanned: they
 * are code identifiers (a `DayLogEntry` type discriminant like
 * `'labor-overbooked'`, a `case` label), exempt per directive 18. */
function templateLiterals(contents: string): string {
  const matches = contents.matchAll(/`([^`\\]*)`/g)
  return [...matches].map((m) => m[1] ?? '').join('\n')
}

function offensesIn(relativePath: string, text: string): string[] {
  const found: string[] = []
  for (const pattern of BANNED) {
    // Report the word actually found, not the pattern - "labored" is a far
    // more useful failure message than "labor(s|ed|ing|er|ers)?".
    const match = new RegExp(`\\b${pattern}\\b`, 'i').exec(text)
    if (match) found.push(`${relativePath}: American spelling "${match[0]}"`)
  }
  return found
}

function findOffenses(): string[] {
  const offenses: string[] = []
  for (const dir of [SCREENS_DIR, COMPONENTS_DIR]) {
    for (const fileName of readdirSync(dir)) {
      if (!fileName.endsWith('.vue')) continue
      const filePath = join(dir, fileName)
      const text = visibleTemplateText(readFileSync(filePath, 'utf8'))
      offenses.push(...offensesIn(relative(REPO_ROOT, filePath), text))
    }
  }
  const dayLogText = templateLiterals(readFileSync(DAY_LOG_FORMAT, 'utf8'))
  offenses.push(...offensesIn(relative(REPO_ROOT, DAY_LOG_FORMAT), dayLogText))
  return offenses
}

describe('British spelling in player-visible copy (Sprint 63, CLAUDE.md directive 18)', () => {
  it('contains no American spellings', () => {
    const offenses = findOffenses()
    expect(offenses, `American spelling(s) found:\n${offenses.join('\n')}`).toEqual([])
  })

  /**
   * The guard checks ITSELF, because a guard that matches nothing
   * passes just as quietly as a clean codebase. That is not hypothetical - a
   * bare `\blabor\b` can never match "labored" (the boundary
   * requires nothing after "labor"), so a real American spelling could sit
   * undetected with this test green the whole time. These cases are the proof the
   * instrument works; without them "0 offenses" means nothing.
   */
  it.each([
    ['labored', true],
    ['laboring', true],
    ['laborer', true],
    ['colored', true],
    ['coloring', true],
    ['colorful', true],
    ['gray', true],
    ['grayish', true],
    ['tires', true],
    ['tire', true],
  ])('catches the American spelling %s', (word, shouldCatch) => {
    expect(offensesIn('probe.vue', `Fit the ${word} on the bench.`).length > 0).toBe(shouldCatch)
  })

  it.each([
    // British forms - must never trip.
    'laboured',
    'labouring',
    'labourer',
    'coloured',
    'colouring',
    'colourful',
    'grey',
    'greyish',
    'tyres',
    'tyre',
    // Real English words that merely LOOK like a banned stem. "a tired
    // engine" is genuine car idiom, not the American spelling of "tyre";
    // "laboratory" starts with "labor". Enumerated inflections (rather than
    // `\w*`) are what keep these clean.
    'laboratory',
    'tired',
    'tiring',
  ])('leaves %s alone', (word) => {
    expect(offensesIn('probe.vue', `Fit the ${word} on the bench.`)).toEqual([])
  })
})
