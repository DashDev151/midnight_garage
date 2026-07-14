import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCREENS_DIR = join(__dirname, 'screens')
const COMPONENTS_DIR = join(__dirname, 'components')
const DAY_LOG_FORMAT = join(__dirname, 'utils', 'dayLogFormat.ts')
const REPO_ROOT = join(__dirname, '..', '..', '..')

/**
 * Sprint 63 (CLAUDE.md directive 18): player-visible copy uses British
 * spelling. This guard fails if any American form leaks into the text a
 * player actually reads - the `.vue` template TEXT nodes (script and style
 * blocks, HTML tags with their attribute bindings, mustache expressions, and
 * comments all stripped, so a code identifier like `laborSlotsRequired` or a
 * CSS `color:` never trips it) plus the string literals of `dayLogFormat.ts`
 * (the one non-component player-copy surface). Code identifiers themselves are
 * exempt per directive 18 (renaming persisted `labor*` save fields is a
 * migration for zero player value); only what renders is checked.
 */
const BANNED = ['labor', 'tire', 'tires', 'color', 'gray'] as const

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
  for (const word of BANNED) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) {
      found.push(`${relativePath}: American spelling "${word}"`)
    }
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
})
