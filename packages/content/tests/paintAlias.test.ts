import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import paintAliases from '../data/paintAliases.json'
import paintColours from '../data/paintColours.json'
import { PaintAliasSchema, PaintAliasesSchema } from '../src'

const EM_DASH = String.fromCharCode(0x2014)

/** RFC 4180 fields: quoted values may hold commas, newlines and "" escapes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1)
}

/** Every uid the roster CSV knows about, read straight from the file so a
 * typo'd alias binding has something real to fail against. */
function rosterUids(): Set<string> {
  const rows = parseCsv(
    readFileSync(
      join(__dirname, '..', '..', '..', 'docs', 'design', 'midnight-garage-roster.csv'),
      'utf8',
    ),
  )
  const header = rows[0]
  if (!header) throw new Error('roster CSV: file is empty')
  const uidAt = header.indexOf('uid')
  return new Set(rows.slice(1).map((row) => row[uidAt] ?? ''))
}

/**
 * The iconic-colour alias table: schema parse, the 37 researched aliases,
 * unique kebab-case ids, every `colourId` resolving to a real palette entry,
 * every `cars` entry a well-formed uid that actually exists in the roster,
 * and both names free of the em dash.
 */
describe('paintAliases.json', () => {
  it('validates against the paint alias schema', () => {
    const result = PaintAliasesSchema.safeParse(paintAliases)
    if (!result.success) throw new Error(result.error.message)
    expect(result.data.length).toBe(37)
  })

  it('every id is unique', () => {
    const ids = paintAliases.map((alias) => alias.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every id is kebab-case', () => {
    for (const alias of paintAliases) {
      expect(alias.id, `${alias.id} is not kebab-case`).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('every colourId resolves to a real palette colour, both halves of a two-tone included', () => {
    const paletteIds = new Set(paintColours.map((colour) => colour.id))
    for (const alias of paintAliases) {
      for (const id of alias.colourId.split('+')) {
        expect(paletteIds.has(id), `${alias.id} points at unknown colour "${id}"`).toBe(true)
      }
    }
  })

  it('every cars entry is a well-formed roster uid', () => {
    for (const alias of paintAliases) {
      expect(alias.cars.length, `${alias.id} has no cars`).toBeGreaterThan(0)
      for (const uid of alias.cars) {
        expect(uid, `${alias.id} has a malformed uid`).toMatch(/^MG-\d{3}$/)
      }
    }
  })

  it('every cars entry names a uid that actually exists in the roster CSV', () => {
    const uids = rosterUids()
    for (const alias of paintAliases) {
      for (const uid of alias.cars) {
        expect(uids.has(uid), `${alias.id} names uid ${uid}, which is not in the roster`).toBe(true)
      }
    }
  })

  it('every realName and parodyName is non-empty and free of the em dash', () => {
    for (const alias of paintAliases) {
      expect(alias.realName.trim().length, `${alias.id} has an empty realName`).toBeGreaterThan(0)
      expect(alias.realName.includes(EM_DASH), `${alias.id} realName carries an em dash`).toBe(
        false,
      )
      expect(alias.parodyName.trim().length, `${alias.id} has an empty parodyName`).toBeGreaterThan(
        0,
      )
      expect(alias.parodyName.includes(EM_DASH), `${alias.id} parodyName carries an em dash`).toBe(
        false,
      )
    }
  })

  it.each(['', 'Bad Id', 'UPPER-CASE', 'has_underscore'])('rejects the malformed id "%s"', (id) => {
    const result = PaintAliasSchema.safeParse({
      id,
      realName: 'Probe Real',
      parodyName: 'Probe Parody',
      colourId: 'white',
      cars: ['MG-001'],
    })
    expect(result.success).toBe(false)
  })
})
