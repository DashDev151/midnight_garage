import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import cars from '../data/cars.json'
import { CarModelsSchema, type CarModel } from '../src'

/**
 * The car spec book is the single upstream for every physical figure a shipped
 * car carries: `docs/design/car-performance/car-spec-book.html` is where a
 * value is argued about and ruled on, and `cars.json` is a copy of it. This
 * guard reads the book directly and fails the moment the two disagree, in
 * either direction, so neither can drift quietly.
 *
 * Covered: the measured pairs (lateral g, braking distance, acceleration) and
 * the six fields the book supersedes (year, kerb weight, power, front weight
 * distribution, drag coefficient, top speed), plus the provenance marker.
 *
 * Not covered, deliberately: the Naming Layer's `displayName`/`brand`/parody
 * strings and the chassis and engine codes, which are ours and not the book's.
 *
 * The lateral pair is all or nothing: a lone lateral reading cannot separate
 * mechanical grip from downforce and there is no one-reading path for it.
 * Braking and acceleration are slower-led: the 97 km/h figure is carried
 * whenever the book has one, because the model spends it through its
 * one-measurement path, and the 161 km/h figure only ever appears beside it.
 */
const SPEC_BOOK_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'design',
  'car-performance',
  'car-spec-book.html',
)

interface SpecBookEntry {
  id: string
  y: number
  ps: number
  kg: number
  fr: number
  cd: number
  top?: number | null
  g97?: number | null
  g193?: number | null
  b97?: number | null
  b161?: number | null
  z97?: number | null
  z161?: number | null
  src: string
  gOvr?: string
  fz?: { a100?: number | null }
}

/** Reads the book's `CARS` array exactly as the lap harness does. */
function readSpecBook(): SpecBookEntry[] {
  const html = readFileSync(SPEC_BOOK_PATH, 'utf8')
  const body = /const CARS = \[([\s\S]*?)\n\];/.exec(html)
  if (!body) throw new Error('car spec book: no CARS array found')
  const entries = eval('[' + body[1] + ']') as SpecBookEntry[]
  // The book stores 0-97 km/h as z97 and 0-161 km/h inside the verbatim `fz`
  // panel record as a100 (0-100 mph). Lift the second so both halves of the
  // acceleration pair read off one object whatever the record's shape.
  for (const entry of entries) {
    if (entry.z161 == null && entry.fz?.a100 != null) entry.z161 = entry.fz.a100
  }
  return entries
}

function provenanceOf(entry: SpecBookEntry): string {
  if (entry.gOvr != null) return 'forza-panel-override'
  return entry.src === 'forza' ? 'forza-panel' : 'modelled'
}

function describeValue(value: number | string | undefined): string {
  return value === undefined ? 'absent' : String(value)
}

interface PairHalf {
  field: string
  content: number | undefined
  book: number | null | undefined
}

function halfMismatch(id: string, half: PairHalf, expected: number | undefined): string[] {
  if (half.content === expected) return []
  return [
    `${id}.${half.field}: content ${describeValue(half.content)}, ` +
      `spec book ${describeValue(expected)}`,
  ]
}

/** An indivisible pair: the content carries both halves or neither. */
function pairMismatches(id: string, first: PairHalf, second: PairHalf): string[] {
  const complete = first.book != null && second.book != null
  return [first, second].flatMap((half) =>
    halfMismatch(id, half, complete ? (half.book ?? undefined) : undefined),
  )
}

/** A slower-led pair: the slower half stands on its own, the faster one does
 * not. */
function slowerLedMismatches(id: string, slower: PairHalf, faster: PairHalf): string[] {
  const slowerExpected = slower.book ?? undefined
  const fasterExpected = slowerExpected != null ? (faster.book ?? undefined) : undefined
  return [...halfMismatch(id, slower, slowerExpected), ...halfMismatch(id, faster, fasterExpected)]
}

function mismatchesFor(model: CarModel, entry: SpecBookEntry): string[] {
  const spec = model.spec
  const found: string[] = []
  const check = (
    field: string,
    content: number | string | undefined,
    book: number | string | undefined,
  ): void => {
    if (content !== book) {
      found.push(
        `${model.id}.${field}: content ${describeValue(content)}, spec book ${describeValue(book)}`,
      )
    }
  }

  check('yearFrom', spec.yearFrom, entry.y)
  check('curbWeightKg', spec.curbWeightKg, entry.kg)
  check('stockPowerPs', spec.stockPowerPs, entry.ps)
  check('weightDistributionFront', spec.weightDistributionFront, entry.fr)
  check('dragCd', spec.dragCd, entry.cd)
  check('topSpeedKmh', spec.topSpeedKmh, entry.top ?? undefined)
  check('measuredFrom', spec.measuredFrom, provenanceOf(entry))

  found.push(
    ...pairMismatches(
      model.id,
      { field: 'lateralG97', content: spec.lateralG97, book: entry.g97 },
      { field: 'lateralG193', content: spec.lateralG193, book: entry.g193 },
    ),
    ...slowerLedMismatches(
      model.id,
      { field: 'braking97To0M', content: spec.braking97To0M, book: entry.b97 },
      { field: 'braking161To0M', content: spec.braking161To0M, book: entry.b161 },
    ),
    ...slowerLedMismatches(
      model.id,
      { field: 'zeroTo97S', content: spec.zeroTo97S, book: entry.z97 },
      { field: 'zeroTo161S', content: spec.zeroTo161S, book: entry.z161 },
    ),
  )
  return found
}

const MODELS = CarModelsSchema.parse(cars)
const SPEC_BOOK = readSpecBook()

describe('the car spec book guard', () => {
  it('every shipped car exists in the spec book', () => {
    const missing = MODELS.filter((model) => !SPEC_BOOK.some((entry) => entry.id === model.id)).map(
      (model) => model.id,
    )
    expect(missing).toEqual([])
  })

  it('every measured and superseded figure matches the spec book exactly', () => {
    const mismatches = MODELS.flatMap((model) => {
      const entry = SPEC_BOOK.find((candidate) => candidate.id === model.id)
      return entry ? mismatchesFor(model, entry) : []
    })
    expect(
      mismatches,
      'cars.json and the car spec book disagree. The book is the upstream: ' +
        're-run `node scripts/importSpecBook.cjs` rather than editing cars.json by hand.',
    ).toEqual([])
  })

  it('every car declares where its figures came from', () => {
    const undeclared = MODELS.filter((model) => model.spec.measuredFrom === undefined).map(
      (model) => model.id,
    )
    expect(undeclared).toEqual([])
  })
})
