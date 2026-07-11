import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const EM_DASH = String.fromCharCode(0x2014)

const REPO_ROOT = join(__dirname, '..', '..', '..')
const PACKAGES_ROOT = join(REPO_ROOT, 'packages')

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo'])

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      collectFiles(fullPath, out)
    } else {
      out.push(fullPath)
    }
  }
  return out
}

function findEmDashOffenses(): string[] {
  const offenses: string[] = []
  for (const filePath of collectFiles(PACKAGES_ROOT)) {
    const contents = readFileSync(filePath, 'utf8')
    if (!contents.includes(EM_DASH)) continue
    const relativePath = relative(REPO_ROOT, filePath)
    contents.split('\n').forEach((line, index) => {
      if (line.includes(EM_DASH)) {
        offenses.push(`${relativePath}:${index + 1}`)
      }
    })
  }
  return offenses
}

/**
 * CLAUDE.md directive 15: the em dash is banned everywhere, permanently
 * (maintainer directive 2026-07-11, after a repo-wide purge). This test is
 * the enforcement mechanism so the ban can never silently regress.
 */
describe('no em dashes anywhere under packages/', () => {
  it('contains zero em dash (U+2014) characters', () => {
    const offenses = findEmDashOffenses()
    expect(offenses, `em dash found at:\n${offenses.join('\n')}`).toEqual([])
  })
})
