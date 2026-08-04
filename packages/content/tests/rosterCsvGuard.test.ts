import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import cars from '../data/cars.json'
import { BUYERS, CAR_CULTURES, PAINT_ALIASES } from '../src'

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
 * The four tuning-arc constants - `reliabilityBase`, `styleBase`,
 * `styleCeiling` and `aeroCeiling` - are asserted ONLY once they exist on the
 * shipped model, so this guard grows teeth as each lands rather than needing to
 * be rewritten when it does. All four are on the shipped model and all four are
 * therefore asserted against the CSV on every one of the 26.
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
/**
 * Style is a pair, not a single value: `styleBase` is how the car looks stock
 * and `styleCeiling` is the best it could ever look, with the GAP between them
 * the thing aftermarket parts buy. Both are authored per car across the whole
 * roster and both live on the same 0-to-100 scale the stat is read on, so one
 * band holds both. The authored spread runs 15 to 88 on the base and 42 to 96
 * on the ceiling; the band is deliberately wider than either, because it is
 * here to catch a typo or a stale scale, not to re-adjudicate authoring.
 */
const STYLE_FLOOR = 0
const STYLE_CEILING = 100
/**
 * The aero ceiling is a 0-to-1 fraction of what a fitted aero part delivers.
 * The authored column runs from `AERO_JOKE_FLOOR`, which is the Wagon R's and
 * is deliberately the bottom of the roster, up to a full 1.0.
 */
const AERO_FLOOR = 0
const AERO_CEILING = 1
const AERO_JOKE_FLOOR = 0.2
/** One `factoryColours` token: a palette id, or two joined by `+` for a
 * factory two-tone. Mirrors `CarModelSchema.spec.factoryColours`'s own
 * regex exactly, so the CSV and the schema can never quietly disagree on
 * what a valid cell looks like. */
const FACTORY_COLOUR_TOKEN = /^[a-z0-9-]+(\+[a-z0-9-]+)?$/
/** How confidently each car's `factoryColours` pool is sourced, from a
 * manufacturer catalogue down to a thin or provisional guess. */
const FACTORY_COLOURS_BASES = ['catalogue', 'list', 'partial', 'provisional', 'thin', 'typical']

/**
 * The CSV's `culture` column is written for a human reading a spreadsheet
 * ("Honest transport", "Front-drive tuner"); `CarCultureSchema` is the kebab
 * form of the same vocabulary. Normalising rather than carrying a second
 * lookup table keeps the vocabulary in exactly one place: if a label ever
 * stops normalising onto a real culture, the test below says so.
 */
function cultureIdFor(label: string): string {
  return label.trim().toLowerCase().replace(/ /g, '-')
}

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

  /**
   * Culture is what a car was USED for, authored for all 94 rows and the input
   * to the care profile its history is rolled from
   * (`partsGeneration.damageGrades.careProfileByCulture`). A label the schema
   * does not know would leave a car with no profile at all, so every row is
   * checked, not only the 26 that ship.
   */
  it('gives every car a culture the schema knows', () => {
    for (const row of roster) {
      const where = `roster row ${row.get('rosterNo')} (${row.get('variantLabel')})`
      expect(CAR_CULTURES as readonly string[], where).toContain(cultureIdFor(row.get('culture')))
    }
  })

  /**
   * The production window, authored at both ends for all 94 rows. A car
   * generates inside it and nowhere else, so a missing or inverted end would
   * put a Hakosuka on a 1977 plate.
   */
  it('gives every car a closed production window', () => {
    for (const row of roster) {
      const where = `roster row ${row.get('rosterNo')} (${row.get('variantLabel')})`
      for (const column of ['yearFrom', 'yearTo'] as const) {
        expect(row.get(column), `${where}: ${column} is blank`).not.toBe('')
        expect(Number.isInteger(row.num(column)), `${where}: ${column}`).toBe(true)
      }
      expect(row.num('yearTo'), `${where}: yearTo below yearFrom`).toBeGreaterThanOrEqual(
        row.num('yearFrom'),
      )
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

  it('gives every car a style base and ceiling inside the authored band', () => {
    for (const row of roster) {
      const where = `roster row ${row.get('rosterNo')} (${row.get('variantLabel')})`
      for (const column of ['styleBase', 'styleCeiling'] as const) {
        const value = row.num(column)
        expect(row.get(column), `${where}: ${column} is blank`).not.toBe('')
        expect(Number.isInteger(value), `${where}: ${column}`).toBe(true)
        expect(value, `${where}: ${column}`).toBeGreaterThanOrEqual(STYLE_FLOOR)
        expect(value, `${where}: ${column}`).toBeLessThanOrEqual(STYLE_CEILING)
      }
    }
  })

  /**
   * `aeroCeiling` is a fraction rather than a score: it multiplies what a fitted
   * aero part's downforce is worth on that body, so 1.0 is "the part performs as
   * authored" and there is no reading above it. Every row carries one, because a
   * blank would parse as 0 and silently make a car's wing inert.
   */
  it('gives every car an aero ceiling inside the authored band', () => {
    for (const row of roster) {
      const where = `roster row ${row.get('rosterNo')} (${row.get('variantLabel')})`
      const value = row.num('aeroCeiling')
      expect(row.get('aeroCeiling'), `${where}: aeroCeiling is blank`).not.toBe('')
      expect(value, where).toBeGreaterThanOrEqual(AERO_FLOOR)
      expect(value, where).toBeLessThanOrEqual(AERO_CEILING)
    }
  })

  /**
   * The two ends of the column are authored decisions rather than emergent
   * values, so they are pinned here in the same way the style counts below are:
   * a count moving is not automatically a failure, but it IS a decision, and it
   * gets re-pinned alongside the authoring change that moved it.
   */
  it('floors the column on the Wagon R and holds the full-effect club at eight', () => {
    const lowest = Math.min(...roster.map((r) => r.num('aeroCeiling')))
    expect(lowest).toBe(AERO_JOKE_FLOOR)
    expect(
      roster.filter((r) => r.num('aeroCeiling') === lowest).map((r) => r.get('variantLabel')),
    ).toContain('Suzuki Wagon R (CT21S)')
    expect(roster.filter((r) => r.num('aeroCeiling') === AERO_CEILING)).toHaveLength(8)
  })

  /**
   * The gap is the product: a car with a high base and no headroom is a
   * restoration car and one with a low base and a large ceiling is a building
   * car. An inverted pair would mean fitting parts made a car look WORSE the
   * closer it got to its own best, which the formula has no way to express.
   */
  it('never authors a style ceiling below its own base', () => {
    for (const row of roster) {
      const where = `roster row ${row.get('rosterNo')} (${row.get('variantLabel')})`
      expect(row.num('styleCeiling'), where).toBeGreaterThanOrEqual(row.num('styleBase'))
    }
  })

  /**
   * The authoring pass's own sanity checks, pinned so the roster and the
   * buyer table can never drift apart quietly. They are readable straight off
   * the two style columns because the formula makes them so
   * (`packages/sim/tests/style.test.ts` proves both identities on all 26
   * shipped cars): a stock mint car scores exactly its `styleBase`, and a
   * fully dressed mint car scores exactly its `styleCeiling`. So "satisfies a
   * buyer stock" is `styleBase >= target` and "can never satisfy one" is
   * `styleCeiling < target`.
   *
   * A count moving is not automatically a failure, but it IS a decision:
   * re-pin it alongside the authoring change that moved it.
   */
  describe('what the authored pair means against the buyer table', () => {
    const targetOf = (id: string): number => {
      const buyer = BUYERS.find((b) => b.id === id)
      if (!buyer) throw new Error(`no buyer named ${id}`)
      return buyer.statTargets.style.target * 100
    }
    const showCrowd = targetOf('show-crowd')
    const tuner = targetOf('tuner')

    it('lets 23 of the 94 satisfy the Show Crowd stock, none of them entry tier', () => {
      const satisfy = roster.filter((r) => r.num('styleBase') >= showCrowd)
      expect(satisfy).toHaveLength(23)
      expect(satisfy.filter((r) => r.get('tier') === 'entry')).toHaveLength(0)
      // A beautiful car straight out of the box is a late-game purchase: all
      // but the AZ-1 cost 850,000 yen or more.
      expect(
        satisfy.filter((r) => r.num('priceYen') < 850_000).map((r) => r.get('variantLabel')),
      ).toEqual(['Autozam AZ-1 (PG6SA)'])
    })

    it('leaves exactly two cars unable to reach the tuner at any build', () => {
      const unreachable = roster
        .filter((r) => r.num('styleCeiling') < tuner)
        .map((r) => r.get('variantLabel'))
      expect(unreachable.sort()).toEqual(['Honda Acty (HA4 Truck)', 'Suzuki Wagon R (CT21S)'])
    })

    it('leaves seven cars unable to reach the Show Crowd at any build, all of them entry', () => {
      const unreachable = roster.filter((r) => r.num('styleCeiling') < showCrowd)
      expect(unreachable).toHaveLength(7)
      expect(unreachable.every((r) => r.get('tier') === 'entry')).toBe(true)
    })
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

  /**
   * `factoryColours` is a pipe-separated list rather than a scalar, the
   * first roster column shaped that way, and `factoryColoursBasis` is its
   * provenance, the same pattern `priceYen`/`priceStatus` already holds.
   * Every one of the 94 rows carries both, including the three cars that
   * cannot be honestly authored (they carry `provisional` or `thin` rather
   * than an invented catalogue).
   */
  it('gives every car a factory colour pool and a basis for it', () => {
    for (const row of roster) {
      const where = `roster row ${row.get('rosterNo')} (${row.get('variantLabel')})`
      const cell = row.get('factoryColours')
      expect(cell, `${where}: factoryColours is blank`).not.toBe('')
      for (const token of cell.split('|')) {
        expect(token, `${where}: factoryColours token "${token}"`).toMatch(FACTORY_COLOUR_TOKEN)
      }
      expect(FACTORY_COLOURS_BASES, where).toContain(row.get('factoryColoursBasis'))
    }
  })

  /**
   * An iconic name binds a colour to the cars that carried it, so every car it
   * names must actually have that colour in its authored pool. The two lists
   * are transcribed from different tables of the same research and can
   * disagree: Midnight Purple's own table listed four cars "where the window
   * allows", and the per-car research had already resolved that phrase against
   * two of them. The pool is the side that decides.
   */
  it('never binds an iconic name to a car whose pool lacks that colour', () => {
    const poolsByUid = new Map(
      roster.map((row) => [row.get('uid'), row.get('factoryColours').split('|')]),
    )
    for (const alias of PAINT_ALIASES) {
      for (const uid of alias.cars) {
        const pool = poolsByUid.get(uid)
        expect(
          pool,
          `${alias.id} names roster car ${uid}, which is not in the roster`,
        ).toBeDefined()
        expect(
          pool,
          `${alias.id} claims roster car ${uid} carried "${alias.colourId}", but its pool does not`,
        ).toContain(alias.colourId)
      }
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

  it('carries the roster row uid onto every shipped car', () => {
    for (const car of shipped) {
      const id = car.id as string
      const row = byId.get(id)!
      expect(car.uid, id).toBe(row.get('uid'))
    }
  })

  it('gives every shipped car the culture the roster authored for it', () => {
    for (const car of shipped) {
      const id = car.id as string
      const spec = car.spec as Record<string, unknown>
      expect(spec.culture, `${id}.spec.culture`).toBe(cultureIdFor(byId.get(id)!.get('culture')))
    }
  })

  /**
   * The array's ORDER is authored, not incidental: it is the research's own
   * order and `spec.factoryColours` must carry it exactly, not merely the
   * same set of colours.
   */
  it('gives every shipped car the factory colour pool the roster authored for it, in order', () => {
    for (const car of shipped) {
      const id = car.id as string
      const spec = car.spec as Record<string, unknown>
      const authored = byId.get(id)!.get('factoryColours').split('|')
      expect(spec.factoryColours, `${id}.spec.factoryColours`).toEqual(authored)
    }
  })

  it('carries the same physical spec as the roster', () => {
    const NUMERIC = [
      'yearFrom',
      'yearTo',
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
    { field: 'styleCeiling', column: 'styleCeiling' },
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
