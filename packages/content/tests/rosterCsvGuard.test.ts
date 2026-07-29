import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import cars from '../data/cars.json'

/**
 * `docs/design/midnight-garage-roster.csv` is the single source of truth for
 * the full 94-car roster: one row per car, every per-car value the game has.
 * `cars.json` is the shipped subset, 26 of the 94, and it is a copy of those
 * rows. This guard reads the CSV directly and fails the moment the two
 * disagree, in either direction, so neither can drift quietly.
 *
 * It exists because they already did drift once: three documents each held
 * part of the roster, none agreed, and the tier labels ended up alternating
 * down one price ladder instead of forming bands. Making the CSV canonical by
 * convention did not prevent that. This makes it canonical in fact.
 *
 * Two fields are deliberately allowed to differ, and both are recorded below
 * rather than skipped: `tier` (a known, deferred content change) and
 * `variantLabel` against `displayName` (two different jobs, not one field
 * copied twice).
 *
 * The three tuning-arc constants - `reliabilityBase`, `styleBase` and
 * `aeroCeiling` - are asserted ONLY once they exist on the shipped model, so
 * this guard grows teeth as Sprints 136 and 140 land rather than needing to be
 * rewritten when they do.
 */
const ROSTER_CSV_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'design',
  'midnight-garage-roster.csv',
)

const EXPECTED_ROW_COUNT = 94
const TIERS = ['entry', 'everyday', 'enthusiast', 'flagship']
/**
 * `uid` is the row's permanent identity: assigned once, never reused, never
 * renumbered. `rosterNo` cannot do that job because the roster is ordered by
 * price, so inserting one car renumbers every row below it. A new car takes the
 * next free uid whatever its price.
 */
const UID_PATTERN = /^MG-\d{3}$/
const RELIABILITY_FLOOR = 65
const RELIABILITY_CEILING = 100

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

interface RosterRow {
  get: (column: string) => string
  num: (column: string) => number
}

function readRoster(): RosterRow[] {
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

const roster = readRoster()
const byId = new Map(roster.filter((r) => r.get('id') !== '').map((r) => [r.get('id'), r]))
const shipped = cars as ReadonlyArray<Record<string, unknown>>

describe('the roster CSV is well formed', () => {
  it('holds every car exactly once, numbered 1 to 94', () => {
    expect(roster).toHaveLength(EXPECTED_ROW_COUNT)
    const numbers = roster.map((r) => r.num('rosterNo'))
    expect(numbers).toEqual(Array.from({ length: EXPECTED_ROW_COUNT }, (_, i) => i + 1))
  })

  it('gives every car a unique, well-formed uid', () => {
    const uids = roster.map((r) => r.get('uid'))
    for (const uid of uids) expect(uid).toMatch(UID_PATTERN)
    expect(new Set(uids).size, 'two cars share a uid').toBe(uids.length)
  })

  it('gives every car a name, a price, a tier and a culture', () => {
    for (const row of roster) {
      const where = `roster row ${row.get('rosterNo')} (${row.get('variantLabel')})`
      expect(row.get('displayName'), where).not.toBe('')
      expect(row.get('variantLabel'), where).not.toBe('')
      expect(row.get('culture'), where).not.toBe('')
      expect(TIERS, where).toContain(row.get('tier'))
      expect(row.num('priceYen'), where).toBeGreaterThan(0)
      expect(['researched', 'STAND-IN'], where).toContain(row.get('priceStatus'))
      expect(['jdm', 'gaisha'], where).toContain(row.get('origin'))
    }
  })

  it('gives every car a reliability base inside the authored band', () => {
    for (const row of roster) {
      const base = row.num('reliabilityBase')
      const where = `roster row ${row.get('rosterNo')} (${row.get('variantLabel')})`
      expect(Number.isInteger(base), where).toBe(true)
      expect(base, where).toBeGreaterThanOrEqual(RELIABILITY_FLOOR)
      expect(base, where).toBeLessThanOrEqual(RELIABILITY_CEILING)
    }
  })

  it('uses ids that are unique, and only on cars marked as built', () => {
    const ids = roster.map((r) => r.get('id')).filter((id) => id !== '')
    expect(new Set(ids).size).toBe(ids.length)
    for (const row of roster) {
      expect(row.get('id') === '' ? 'no' : 'yes', `roster row ${row.get('rosterNo')}`).toBe(
        row.get('builtInContent'),
      )
    }
  })
})

describe('cars.json agrees with the roster CSV', () => {
  it('ships exactly the cars the roster says are built', () => {
    const shippedIds = shipped.map((car) => car.id as string).sort()
    const builtInCsv = roster
      .filter((r) => r.get('builtInContent') === 'yes')
      .map((r) => r.get('id'))
      .sort()
    expect(shippedIds).toEqual(builtInCsv)
  })

  it('prices every shipped car at the roster figure', () => {
    for (const car of shipped) {
      const row = byId.get(car.id as string)!
      expect(car.bookValueYen, car.id as string).toBe(row.num('priceYen'))
    }
  })

  it('never ships a stand-in price', () => {
    for (const car of shipped) {
      const row = byId.get(car.id as string)!
      expect(row.get('priceStatus'), `${car.id as string} ships an unresearched price`).toBe(
        'researched',
      )
    }
  })

  it('names, sources and classifies every shipped car as the roster does', () => {
    for (const car of shipped) {
      const id = car.id as string
      const row = byId.get(id)!
      expect(car.displayName, id).toBe(row.get('displayName'))
      expect(car.brand, id).toBe(row.get('brand'))
      expect(car.parodyName, id).toBe(row.get('parodyName'))
      expect(car.parodyBrand, id).toBe(row.get('parodyBrand'))
      expect(car.rarity, id).toBe(row.get('rarity'))
      expect(car.origin, id).toBe(row.get('origin'))
    }
  })

  it('carries the same physical spec as the roster', () => {
    const NUMERIC = [
      'yearFrom',
      'stockPowerPs',
      'peakTorqueNm',
      'displacementCc',
      'curbWeightKg',
      'weightDistributionFront',
      'wheelbaseMm',
      'dragCd',
    ] as const
    for (const car of shipped) {
      const id = car.id as string
      const row = byId.get(id)!
      const spec = car.spec as Record<string, unknown>
      expect(spec.chassisCode, id).toBe(row.get('chassisCode'))
      expect(spec.engineCode, id).toBe(row.get('engineCode'))
      expect(spec.engineConfig, id).toBe(row.get('engineConfig'))
      expect(spec.aspiration, id).toBe(row.get('aspiration'))
      for (const field of NUMERIC) {
        expect(spec[field], `${id}.spec.${field}`).toBe(row.num(field))
      }
    }
  })

  it('tiers every shipped car exactly as the roster does', () => {
    for (const car of shipped) {
      const id = car.id as string
      expect(car.tier, id).toBe(byId.get(id)!.get('tier'))
    }
  })

  it('keeps every shipped car inside its own tier price band', () => {
    const BANDS: Record<string, [number, number]> = {
      entry: [100_000, 420_000],
      everyday: [440_000, 820_000],
      enthusiast: [750_000, 2_380_000],
      flagship: [2_450_000, Number.POSITIVE_INFINITY],
    }
    for (const car of shipped) {
      const id = car.id as string
      const band = BANDS[car.tier as string]!
      const price = car.bookValueYen as number
      expect(price, `${id} is ${car.tier as string} at Y${price}`).toBeGreaterThanOrEqual(band[0])
      expect(price, `${id} is ${car.tier as string} at Y${price}`).toBeLessThanOrEqual(band[1])
    }
  })
})

describe('the tuning-arc constants, once they reach content', () => {
  const CONSTANTS = [
    { field: 'reliabilityBase', column: 'reliabilityBase' },
    { field: 'styleBase', column: 'styleBase' },
    { field: 'aeroCeiling', column: 'aeroCeiling' },
  ] as const

  for (const { field, column } of CONSTANTS) {
    it(`matches the roster on ${field} for every car that carries it`, () => {
      for (const car of shipped) {
        const spec = car.spec as Record<string, unknown>
        if (spec[field] === undefined) continue
        const id = car.id as string
        const authored = byId.get(id)!.get(column)
        expect(authored, `${id}: ${column} is in cars.json but blank in the roster CSV`).not.toBe(
          '',
        )
        expect(spec[field], `${id}.spec.${field}`).toBe(Number(authored))
      }
    })
  }
})
