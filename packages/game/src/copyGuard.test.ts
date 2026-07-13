import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCREENS_DIR = join(__dirname, 'screens')
const REPO_ROOT = join(__dirname, '..', '..', '..')

const HELP_HINT_RE = /<HelpHint\b[^>]*>([\s\S]*?)<\/HelpHint>/g

/**
 * Sprint 51 decision 5: dev-facing/internal words that must never leak into
 * player-visible HelpHint copy - "gate" (mechanic jargon), "staged" (retired
 * Sprint 48 terminology), "dev" (internal tooling). Sprint 52 rewrote
 * UpgradesScreen's copy wholesale, so it is no longer exempt from any check.
 */
const BANNED_WORDS = ['gate', 'staged', 'dev'] as const

function findOffenses(): string[] {
  const offenses: string[] = []
  for (const fileName of readdirSync(SCREENS_DIR)) {
    if (!fileName.endsWith('.vue')) continue
    const filePath = join(SCREENS_DIR, fileName)
    const contents = readFileSync(filePath, 'utf8')
    const relativePath = relative(REPO_ROOT, filePath)
    for (const match of contents.matchAll(HELP_HINT_RE)) {
      const hintText = match[1] ?? ''
      for (const word of BANNED_WORDS) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(hintText)) {
          offenses.push(`${relativePath}: "${word}" in HelpHint copy`)
        }
      }
    }
  }
  return offenses
}

describe('no dev-speak in player-visible HelpHint copy (Sprint 51 decision 5)', () => {
  it('contains none of the banned words', () => {
    const offenses = findOffenses()
    expect(offenses, `banned word(s) found:\n${offenses.join('\n')}`).toEqual([])
  })
})
