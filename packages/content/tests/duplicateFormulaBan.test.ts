import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(__dirname, '..', '..', '..')
const SIM_SRC_ROOT = join(REPO_ROOT, 'packages', 'sim', 'src')

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo', 'tests'])

/** The one file allowed to combine the two - the canonical clean-value
 * formula itself. */
const EXEMPT_FILES = new Set(['marketValue.ts'])

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      collectFiles(fullPath, out)
    } else if (fullPath.endsWith('.ts')) {
      out.push(fullPath)
    }
  }
  return out
}

/**
 * Directive 16, enforced for the value stack. Discovery for this sprint
 * found exactly one valuation function (`marketValueYen`, marketValue.ts)
 * that everything imports, so there is nothing to compare it to and a
 * parity test would be pointless. The real risk this guards against is a
 * SECOND formula appearing - the service-jobs rework is the precedent for
 * why: a whole second "job" system was built alongside the existing
 * job/labor system instead of reusing it.
 *
 * `bookValueYen` alone is legitimate anywhere (scrap fractions, grading
 * ratios) - the ban is on the COMBINATION with `mileageFactor(`, since
 * together they are the one clean-value formula `marketValue.ts` owns:
 * `cleanValue = bookValueYen * mileageFactor(mileageKm, economy)`.
 */
describe('the duplicate-formula ban (directive 16, the value stack)', () => {
  it('no file outside marketValue.ts combines bookValueYen with mileageFactor(', () => {
    const offenders: string[] = []
    for (const filePath of collectFiles(SIM_SRC_ROOT)) {
      const base = filePath.split(/[\\/]/).pop() ?? filePath
      if (EXEMPT_FILES.has(base)) continue
      const contents = readFileSync(filePath, 'utf8')
      if (contents.includes('bookValueYen') && contents.includes('mileageFactor(')) {
        const lines = contents.split('\n')
        const bookLine = lines.findIndex((l) => l.includes('bookValueYen')) + 1
        const mileageLine = lines.findIndex((l) => l.includes('mileageFactor(')) + 1
        offenders.push(
          `${relative(REPO_ROOT, filePath)} (bookValueYen:${bookLine}, mileageFactor(:${mileageLine})`,
        )
      }
    }
    expect(offenders).toEqual([])
  })
})
