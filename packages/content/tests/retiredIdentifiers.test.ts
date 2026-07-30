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
 * instead, matching the same "no test fixtures" scope a `tests/` directory
 * skip would otherwise give for free. */
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|vue)$/

interface RetiredIdentifier {
  /** The dotted-path or bare identifier text. Matched at word boundaries (a
   * literal `.` in this text is escaped, never treated as regex "any
   * character"), so `.aspiration` cannot match inside `carAspiration`. */
  identifier: string
  /** The sprint that retired it. */
  retiredInSprint: number
  /** One line: what replaced it and why the old name must not come back. */
  reason: string
  /** Package names (from `PACKAGE_NAMES`) this identifier is banned under.
   * Defaults to all three - narrow this only when the retirement is
   * genuinely package-scoped, as `spec.aspiration` is (a dev-only screen in
   * `packages/game` legitimately still reads the raw spec field for
   * display; only sim logic may never read it). */
  scopedToPackages?: ReadonlyArray<(typeof PACKAGE_NAMES)[number]>
}

/**
 * Every identifier this codebase has deliberately retired. A revived
 * reference - a stale merge, a copy-pasted snippet, a doc example turned
 * real code - fails this fast, narrow test instead of waiting for
 * `pnpm typecheck` during a push to catch it, the exact gap
 * `PartsMarketScreen.vue`'s stale `statModifiers.reliability` read sat in
 * for two sprints after that field left the schema. Each entry carries the
 * sprint that retired it and the one-line reason, the same ledger-comment
 * shape `economyApprovalGate.test.ts` uses for pinned values.
 *
 * Its value over typecheck is reach and cost, not power: it catches a
 * retired name inside a string literal, a `Record<string, X>` index or a
 * comment, none of which the compiler can see, and it runs as one narrow
 * file rather than a whole-program compile.
 */
const RETIRED_IDENTIFIERS: readonly RetiredIdentifier[] = [
  {
    identifier: 'statModifiers.power',
    retiredInSprint: 135,
    reason:
      'Replaced by statModifiers.powerFraction (proportional, per-engine-character power) - a flat PS delta could not tell an NA Beat from a twin-turbo Supra apart.',
  },
  {
    identifier: 'statModifiers.reliability',
    retiredInSprint: 136,
    reason:
      'A part does not add reliability outright: reliability is condition plus the support-ratio coherence factor (support.ts), never a sum of per-part deltas.',
  },
  {
    identifier: 'reliabilityCap',
    retiredInSprint: 136,
    reason:
      'Replaced by CarModel.spec.reliabilityBase (a per-car value) - the flat 70 ceiling had no per-car meaning.',
  },
  {
    identifier: 'priceSensitivity',
    retiredInSprint: 143,
    reason:
      'Authored, schema-validated and test-asserted with zero readers anywhere in gameplay; Sprint 146 re-authors the buyer schema from a clean slate rather than carrying a dead lever forward unexamined.',
  },
  {
    identifier: 'spec.aspiration',
    retiredInSprint: 135,
    reason:
      'A duplicate representation of induction with nothing guarding that it agrees with tags; hasForcedInduction is the one source of truth sim code may read. Folded in from engineCharacter.test.ts rather than left as a second, hand-rolled guard.',
    scopedToPackages: ['sim'],
  },
]

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

const FILES_BY_PACKAGE: Readonly<Record<(typeof PACKAGE_NAMES)[number], string[]>> =
  Object.fromEntries(
    PACKAGE_NAMES.map((name) => [name, collectFiles(join(PACKAGES_ROOT, name, 'src'))]),
  ) as Record<(typeof PACKAGE_NAMES)[number], string[]>

function findOffenses(entry: RetiredIdentifier): string[] {
  const pattern = new RegExp(`\\b${escapeRegExp(entry.identifier)}\\b`)
  const packages = entry.scopedToPackages ?? PACKAGE_NAMES
  const offenses: string[] = []
  for (const pkg of packages) {
    for (const filePath of FILES_BY_PACKAGE[pkg]) {
      const lines = readFileSync(filePath, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (pattern.test(line)) {
          offenses.push(`${relative(REPO_ROOT, filePath)}:${i + 1}`)
        }
      })
    }
  }
  return offenses
}

describe('the retired-identifier ledger', () => {
  it.each(RETIRED_IDENTIFIERS.map((entry) => [entry.identifier, entry] as const))(
    'no source file reads or names %s',
    (_identifier, entry) => {
      const offenses = findOffenses(entry)
      expect(
        offenses,
        `${entry.identifier} (retired sprint ${entry.retiredInSprint}: ${entry.reason}) found at:\n${offenses.join('\n')}`,
      ).toEqual([])
    },
  )

  it('.aspiration is matched at a word boundary, not as a substring of carAspiration', () => {
    const pattern = new RegExp(`\\b${escapeRegExp('spec.aspiration')}\\b`)
    expect(pattern.test('const carAspiration = 1')).toBe(false)
    expect(pattern.test('return spec.aspiration')).toBe(true)
  })
})
