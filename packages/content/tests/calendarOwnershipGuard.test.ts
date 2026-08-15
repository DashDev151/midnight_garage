import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(__dirname, '..', '..', '..')
const PACKAGES_ROOT = join(REPO_ROOT, 'packages')
const PACKAGE_NAMES = ['content', 'game', 'sim'] as const

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo', 'tests'])
const SCAN_EXTENSIONS = ['.ts', '.vue']
/** Colocated test files (the game package's `*.garage.test.ts` style) live
 * under `src/` without a `tests/` directory to skip - excluded by name
 * instead, the same belt-and-suspenders exclusion
 * `retiredIdentifiers.test.ts` uses. */
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|vue)$/

/** The one file allowed to turn `state.day` into a day of the week or a
 * month - `calendar.ts` IS the derivation this guard protects (sprint149.md:
 * "calendar.ts must be the only place state.day is turned into a week or a
 * month"). Matched by basename, same idiom `duplicateFormulaBan.test.ts`
 * uses for its own one exempt file. */
const EXEMPT_FILES = new Set(['calendar.ts'])

/**
 * A day-of-week/week-boundary pattern that must never appear outside
 * `calendar.ts` - the exact defect this sprint fixes: three modules each
 * independently decided what a week was (`advanceDay.ts`'s `next.day % 7 ===
 * 0`, `finances.ts`'s `state.day % 7 !== 0`, `marketHeat.ts`'s the same),
 * none of them naming the rule. A file that needs "is this the end of the
 * week" now calls `calendar.ts`'s `isEndOfWeek`/`isDayOfWeek`-family
 * exports instead of re-deriving it. `daysPerMonth` retired with the month
 * concept (sprint204.md, superseded by the season), so its own pattern
 * retired alongside it.
 */
const BANNED_PATTERNS: readonly RegExp[] = [
  // The literal defect: a day value taken modulo 7, in any spacing.
  /%\s*7\b/,
  // A lazy equivalent that reads the calendar's own week length but still
  // does the modulo arithmetic locally instead of calling a calendar
  // function - the ownership the guard exists to protect, not just the
  // magic number.
  /%\s*(?:context\.)?economy\.calendar\.daysPerWeek\b/,
]

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      collectFiles(fullPath, out)
    } else if (
      SCAN_EXTENSIONS.some((ext) => fullPath.endsWith(ext)) &&
      !TEST_FILE_PATTERN.test(entry)
    ) {
      out.push(fullPath)
    }
  }
  return out
}

const ALL_FILES: readonly string[] = PACKAGE_NAMES.flatMap((name) =>
  collectFiles(join(PACKAGES_ROOT, name, 'src')),
)

describe('calendar.ts is the only place a day becomes a week or a month (sprint149.md)', () => {
  it.each(BANNED_PATTERNS.map((pattern) => [pattern.source, pattern] as const))(
    'no source file outside calendar.ts matches /%s/',
    (_source, pattern) => {
      const offenses: string[] = []
      for (const filePath of ALL_FILES) {
        const base = filePath.split(/[\\/]/).pop() ?? filePath
        if (EXEMPT_FILES.has(base)) continue
        const lines = readFileSync(filePath, 'utf8').split('\n')
        lines.forEach((line, i) => {
          if (pattern.test(line)) {
            offenses.push(`${relative(REPO_ROOT, filePath)}:${i + 1}: ${line.trim()}`)
          }
        })
      }
      expect(
        offenses,
        `calendar.ts must be the only deriver of a day-of-week or a month (sprint149.md). ` +
          `Found a private week/month calculation at:\n${offenses.join('\n')}`,
      ).toEqual([])
    },
  )

  it('calendar.ts itself is exempt (it IS the derivation)', () => {
    expect(EXEMPT_FILES.has('calendar.ts')).toBe(true)
  })
})
