import rosterCsv from '../../../../../docs/design/midnight-garage-roster.csv?raw'

/**
 * The 94-car roster's colour-relevant columns, read straight from
 * `docs/design/midnight-garage-roster.csv` at build time via Vite's raw
 * import, so the paint palette dev screen's car selector covers every
 * authored car rather than only the 26 shipped in `cars.json`. Dev-only:
 * reached solely through that screen, which the router keeps behind the
 * `import.meta.env.DEV` gate, so a production build never loads the CSV.
 */
export interface RosterCarColours {
  rosterNo: number
  /** The shipped `cars.json` id, or an empty string on the 68 not yet built. */
  id: string
  displayName: string
  /** Palette ids in authored order; a two-tone entry joins both halves with
   * `+` and is one string here, not two. */
  pool: readonly string[]
  /** How confidently the pool is sourced: catalogue, partial, list, typical,
   * thin or provisional, per the consolidated colour research. */
  basis: string
}

/** RFC 4180 fields: quoted values may hold commas, newlines and "" escapes.
 * The roster's `notes` and `flavour` columns need exactly this, so a plain
 * `split(',')` would misread every row that has one. */
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

function readRosterCars(): RosterCarColours[] {
  const rows = parseCsv(rosterCsv)
  const header = rows[0]
  if (!header) throw new Error('roster CSV: file is empty')
  const columnAt = (column: string): number => {
    const index = header.indexOf(column)
    if (index < 0) throw new Error(`roster CSV: no column named ${column}`)
    return index
  }
  const rosterNoAt = columnAt('rosterNo')
  const idAt = columnAt('id')
  const displayNameAt = columnAt('displayName')
  const poolAt = columnAt('factoryColours')
  const basisAt = columnAt('factoryColoursBasis')

  return rows
    .slice(1)
    .map((cells) => ({
      rosterNo: Number(cells[rosterNoAt] ?? ''),
      id: cells[idAt] ?? '',
      displayName: cells[displayNameAt] ?? '',
      pool: (cells[poolAt] ?? '').split('|').filter((token) => token !== ''),
      basis: cells[basisAt] ?? '',
    }))
    .sort((a, b) => a.rosterNo - b.rosterNo)
}

/** All 94 roster cars, ordered by roster number (the roster's own price order). */
export const ROSTER_CARS: readonly RosterCarColours[] = readRosterCars()

/**
 * What each `factoryColoursBasis` value means, transcribed from the basis
 * table at the top of "The per-car pools" in
 * `docs/design/reference/colour-palette-consolidated.md`. Basis is the
 * honesty signal on a pool: it says how much of it is real research and how
 * much is a placeholder.
 */
export const FACTORY_COLOURS_BASIS_LEGEND: Record<string, string> = {
  catalogue:
    "A dated per-grade catalogue, a factory press release, or a production registry: the research's own top-confidence tier.",
  partial:
    'Real sources with named gaps: cross-referenced codes, sampled periods, or one market only.',
  list: 'The shallow research pass found a real colour list for this car or its exact model family and era.',
  typical:
    'The shallow pass found no list. The pool is a labelled placeholder: what a car of this maker, class, price and era was ordinarily sold in.',
  thin: 'One colour name is attested and the rest of the palette is not established.',
  provisional:
    'The research established that a list exists and how long it is, but did not record the names. The pool is a construction and must not be shipped as researched.',
}
