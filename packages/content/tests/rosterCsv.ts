import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * READING `docs/design/midnight-garage-roster.csv`, ONCE.
 *
 * The roster CSV is the single source of truth for all 94 cars and two guards
 * read it: `rosterCsvGuard.test.ts` checks the file is well formed, and
 * `carsGeneratedFromRoster.test.ts` checks `cars.json` is a faithful generated
 * copy of the rows marked as built. They share this reader rather than each
 * carrying a parser, so "what a roster row is" has one definition.
 */
export const ROSTER_CSV_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'design',
  'midnight-garage-roster.csv',
)

/** RFC 4180 fields: quoted values may hold commas, newlines and "" escapes. */
export function parseCsv(text: string): string[][] {
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

export interface RosterRow {
  get: (column: string) => string
  num: (column: string) => number
}

export function readRoster(): RosterRow[] {
  const rows = parseCsv(readFileSync(ROSTER_CSV_PATH, 'utf8'))
  const header = rows[0]
  if (!header) throw new Error('roster CSV: file is empty')
  return rows.slice(1).map((cells) => {
    if (cells.length !== header.length) {
      throw new Error(
        `roster CSV: row ${cells[0] ?? '?'} has ${cells.length} cells, expected ${header.length}`,
      )
    }
    const get = (column: string): string => {
      const index = header.indexOf(column)
      if (index < 0) throw new Error(`roster CSV: no column named ${column}`)
      return cells[index] ?? ''
    }
    return { get, num: (column: string) => Number(get(column)) }
  })
}
