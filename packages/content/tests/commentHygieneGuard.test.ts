import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Comments document what the code does, never the process of writing it
 * (CLAUDE.md directive 10): no sprint numbers, dates, decision references,
 * playtest references, or maintainer attributions inside any comment.
 * History lives in git log and docs/sprints. This guard keeps the pattern
 * from creeping back; string literals and test titles are out of scope.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..')
const PACKAGES_ROOT = join(REPO_ROOT, 'packages')

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo'])
const SCAN_EXTENSIONS = ['.ts', '.vue']

/** Files whose comments legitimately point at the gating law itself. */
const EXEMPT_FILES = new Set(['economyApprovalGate.test.ts', 'commentHygieneGuard.test.ts'])

const FORBIDDEN = [
  /\bSprint \d/i,
  /\b20\d\d-\d\d-\d\d/,
  /\bdecision \d/i,
  /playtest/i,
  /maintainer/i,
]

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) collectFiles(fullPath, out)
    else if (SCAN_EXTENSIONS.some((ext) => fullPath.endsWith(ext))) out.push(fullPath)
  }
  return out
}

/**
 * Extracts the comment portions of a line, tracking block-comment state
 * across lines. Deliberately pragmatic: `//` inside a string literal is
 * treated as a comment start unless it is part of `://` (URLs); the
 * codebase's own conventions make richer lexing unnecessary.
 */
function commentTextOf(line: string, state: { inBlock: boolean }): string {
  let text = ''
  let rest = line
  if (state.inBlock) {
    const end = rest.indexOf('*/')
    if (end === -1) return rest
    text += rest.slice(0, end)
    rest = rest.slice(end + 2)
    state.inBlock = false
  }
  for (;;) {
    const block = rest.indexOf('/*')
    let lineIdx = -1
    let searchFrom = 0
    for (;;) {
      const candidate = rest.indexOf('//', searchFrom)
      if (candidate === -1) break
      if (candidate > 0 && rest[candidate - 1] === ':') {
        searchFrom = candidate + 2
        continue
      }
      lineIdx = candidate
      break
    }
    const html = rest.indexOf('<!--')
    const starts = [block, lineIdx, html].filter((i) => i !== -1)
    if (starts.length === 0) return text
    const first = Math.min(...starts)
    if (first === lineIdx) return text + rest.slice(first + 2)
    if (first === html) {
      const end = rest.indexOf('-->', first + 4)
      if (end === -1) return text + rest.slice(first + 4)
      text += rest.slice(first + 4, end)
      rest = rest.slice(end + 3)
      continue
    }
    const end = rest.indexOf('*/', first + 2)
    if (end === -1) {
      state.inBlock = true
      return text + rest.slice(first + 2)
    }
    text += rest.slice(first + 2, end)
    rest = rest.slice(end + 2)
  }
}

function findOffenses(): string[] {
  const offenses: string[] = []
  for (const filePath of collectFiles(PACKAGES_ROOT)) {
    const base = filePath.split(/[\\/]/).pop() ?? filePath
    if (EXEMPT_FILES.has(base)) continue
    const lines = readFileSync(filePath, 'utf8').split('\n')
    const state = { inBlock: false }
    lines.forEach((line, i) => {
      const comment = commentTextOf(line, state)
      if (!comment) return
      for (const pattern of FORBIDDEN) {
        if (pattern.test(comment)) {
          offenses.push(
            `${relative(REPO_ROOT, filePath)}:${i + 1} ${pattern} in "${comment.trim().slice(0, 80)}"`,
          )
          break
        }
      }
    })
  }
  return offenses
}

describe('the comment hygiene guard', () => {
  it('no comment under packages/ carries process narrative', () => {
    expect(findOffenses()).toEqual([])
  })
})
