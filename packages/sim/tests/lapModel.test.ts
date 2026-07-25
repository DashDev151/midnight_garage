import {
  BUYERS,
  CARS,
  COURSES,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  type Course,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { buildSimContext } from '../src/context'
import { lapTimeSecondsFor, referenceLapTimeSeconds, selectBoardRows } from '../src/lapModel'
import { buildCarInstance, mintCarParts } from './testFixtures'

const CONTEXT = buildSimContext(CARS, PARTS, BUYERS, PARTS_TAXONOMY)

const KIRIFURI = COURSES.find((c) => c.id === 'kirifuri')!
const WANGAN = COURSES.find((c) => c.id === 'wangan')!

/** A real, fully-specified model: the lap model reads the whole spec sheet
 * (grip, drag, dimensions, layout), so a stub car cannot exercise it. */
const CIVIC = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!
const AE86 = CARS.find((c) => c.id === 'toyota-sprinter-trueno-ae86')!

const STREET_TYRES = PARTS.find(
  (p) => p.carPartId === 'tyres' && p.grade === 'street' && p.fitmentClass === 'common',
)!
const RACE_TYRES = PARTS.find(
  (p) => p.carPartId === 'tyres' && p.grade === 'race' && p.fitmentClass === 'common',
)!

function tyreInstance(part: (typeof PARTS)[number], band: 'mint' | 'scrap' = 'mint') {
  return {
    id: `fixture-${part.id}`,
    partId: part.id,
    band,
    genuinePeriod: false,
    origin: { kind: 'market' as const, day: 1 },
  }
}

function carOn(model: (typeof CARS)[number], tyres?: ReturnType<typeof tyreInstance>) {
  const car = buildCarInstance({ modelId: model.id, parts: mintCarParts() })
  if (tyres) car.parts.tyres.installed = tyres
  return car
}

describe('lapTimeSecondsFor (grip-and-pace model, Sprint 124)', () => {
  it('returns a real time for a car with tyres on a known course', () => {
    const car = carOn(CIVIC)
    const result = lapTimeSecondsFor(car, CIVIC, CONTEXT, 'kirifuri')
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
    // One decimal place, like every surfaced time.
    expect(result!).toBe(Math.round(result! * 10) / 10)
  })

  it('returns null when the tyres slot is empty - nothing to grip the road with', () => {
    const car = carOn(CIVIC)
    car.parts.tyres.installed = null
    expect(lapTimeSecondsFor(car, CIVIC, CONTEXT, 'kirifuri')).toBeNull()
  })

  it('returns null on a scrap-band tyre set', () => {
    const car = carOn(CIVIC, tyreInstance(STREET_TYRES, 'scrap'))
    expect(lapTimeSecondsFor(car, CIVIC, CONTEXT, 'kirifuri')).toBeNull()
  })

  it('returns null for an unknown course', () => {
    const car = carOn(CIVIC)
    expect(lapTimeSecondsFor(car, CIVIC, CONTEXT, 'no-such-course')).toBeNull()
  })

  it('is deterministic - the same car and course always time the same', () => {
    const car = carOn(CIVIC)
    const first = lapTimeSecondsFor(car, CIVIC, CONTEXT, 'kirifuri')
    const second = lapTimeSecondsFor(car, CIVIC, CONTEXT, 'kirifuri')
    expect(first).toBe(second)
  })

  it('is course-dependent - a tight pass and a bayshore run are different laps', () => {
    const car = carOn(CIVIC)
    const touge = lapTimeSecondsFor(car, CIVIC, CONTEXT, 'kirifuri')!
    const bayshore = lapTimeSecondsFor(car, CIVIC, CONTEXT, 'wangan')!
    expect(touge).not.toBe(bayshore)
  })

  it('times every shipped course', () => {
    const car = carOn(CIVIC)
    for (const course of COURSES) {
      const time = lapTimeSecondsFor(car, CIVIC, CONTEXT, course.id)
      expect(time, `course ${course.id}`).not.toBeNull()
      expect(time!, `course ${course.id}`).toBeGreaterThan(0)
    }
  })

  it('grippier tyres never make a car slower', () => {
    const street = lapTimeSecondsFor(
      carOn(CIVIC, tyreInstance(STREET_TYRES)),
      CIVIC,
      CONTEXT,
      'kirifuri',
    )!
    const race = lapTimeSecondsFor(
      carOn(CIVIC, tyreInstance(RACE_TYRES)),
      CIVIC,
      CONTEXT,
      'kirifuri',
    )!
    expect(race).toBeLessThanOrEqual(street)
  })

  it('the quicker car is quicker: a Civic SiR beats an AE86 on the same course', () => {
    const civic = lapTimeSecondsFor(carOn(CIVIC), CIVIC, CONTEXT, 'kirifuri')!
    const ae86 = lapTimeSecondsFor(carOn(AE86), AE86, CONTEXT, 'kirifuri')!
    expect(civic).toBeLessThan(ae86)
  })
})

describe('referenceLapTimeSeconds (the board primitive)', () => {
  it('is monotonic in power: more power is never slower', () => {
    const slow = referenceLapTimeSeconds(120, 1000, 'street', KIRIFURI, ECONOMY)
    const fast = referenceLapTimeSeconds(200, 1000, 'street', KIRIFURI, ECONOMY)
    expect(fast).toBeLessThan(slow)
  })

  it('is monotonic in weight: lighter is never slower', () => {
    const heavy = referenceLapTimeSeconds(150, 1200, 'street', KIRIFURI, ECONOMY)
    const light = referenceLapTimeSeconds(150, 950, 'street', KIRIFURI, ECONOMY)
    expect(light).toBeLessThan(heavy)
  })

  it('is monotonic in tyre grade: a better grade is never slower', () => {
    const grades = ['stock', 'street', 'sport', 'race'] as const
    const times = grades.map((g) => referenceLapTimeSeconds(150, 1000, g, KIRIFURI, ECONOMY))
    for (let i = 1; i < times.length; i++) {
      const previous = times[i - 1]!
      expect(times[i]!, `${grades[i]} vs ${grades[i - 1]}`).toBeLessThanOrEqual(previous)
    }
  })

  it('power matters more on the bayshore than on the pass', () => {
    const gain = (course: Course) =>
      referenceLapTimeSeconds(120, 1000, 'street', course, ECONOMY) -
      referenceLapTimeSeconds(220, 1000, 'street', course, ECONOMY)
    expect(gain(WANGAN)).toBeGreaterThan(gain(KIRIFURI))
  })
})

describe('selectBoardRows (Sprint 77 decision 4)', () => {
  const anchor = {
    id: 'anchor-car',
    name: "The magazine's long-termer",
    powerPs: 150,
    weightKg: 1000,
  }

  // A hand-built pool: 3 street-grade entries (so the same-grade straddle has
  // real slower/faster options), plus a couple of other-grade entries used
  // only by the padding tests below.
  const pool = [
    {
      id: 'street-a',
      name: 'Street A',
      powerPs: 140,
      weightKg: 1100,
      tyreGrade: 'street' as const,
    },
    {
      id: 'street-b',
      name: 'Street B',
      powerPs: 160,
      weightKg: 1000,
      tyreGrade: 'street' as const,
    },
    { id: 'street-c', name: 'Street C', powerPs: 180, weightKg: 950, tyreGrade: 'street' as const },
    { id: 'sport-a', name: 'Sport A', powerPs: 150, weightKg: 1000, tyreGrade: 'sport' as const },
    { id: 'stock-a', name: 'Stock A', powerPs: 100, weightKg: 1200, tyreGrade: 'stock' as const },
  ]

  const timeOf = (
    powerPs: number,
    weightKg: number,
    grade: 'stock' | 'street' | 'sport' | 'race',
  ) => referenceLapTimeSeconds(powerPs, weightKg, grade, KIRIFURI, ECONOMY)

  it('always appends exactly the 4 anchor rows, one per tyre grade', () => {
    const rows = selectBoardRows(pool, anchor, null, 90, ECONOMY, KIRIFURI)
    const anchorRows = rows.filter((r) => r.isAnchor)
    expect(anchorRows).toHaveLength(4)
    expect(new Set(anchorRows.map((r) => r.tyreGrade))).toEqual(
      new Set(['stock', 'street', 'sport', 'race']),
    )
    expect(anchorRows.every((r) => r.name === anchor.name)).toBe(true)
  })

  it('with a candidate: picks the 2 nearest slower and 2 nearest faster from the SAME tyre grade', () => {
    // A candidate timed between street-b and street-c straddles the street
    // entries from both sides.
    const candidateTime = (timeOf(160, 1000, 'street') + timeOf(180, 950, 'street')) / 2
    const rows = selectBoardRows(
      pool,
      anchor,
      { timeSeconds: candidateTime, tyreGrade: 'street' },
      90,
      ECONOMY,
      KIRIFURI,
    )
    const poolRows = rows.filter((r) => !r.isAnchor)
    expect(poolRows.length).toBeGreaterThan(0)
    expect(poolRows.length).toBeLessThanOrEqual(4)
    // At least one comparable on each side of the candidate.
    expect(poolRows.some((r) => r.timeSeconds < candidateTime)).toBe(true)
    expect(poolRows.some((r) => r.timeSeconds > candidateTime)).toBe(true)
  })

  it('pads from other grades when the same grade cannot supply both sides', () => {
    // A candidate faster than every street entry has no faster same-grade
    // comparable, so the faster side pads from the rest of the pool.
    const fastest = Math.min(...pool.map((p) => timeOf(p.powerPs, p.weightKg, p.tyreGrade)))
    const rows = selectBoardRows(
      pool,
      anchor,
      { timeSeconds: fastest - 5, tyreGrade: 'street' },
      90,
      ECONOMY,
      KIRIFURI,
    )
    expect(rows.filter((r) => !r.isAnchor).length).toBeGreaterThan(0)
  })

  it('with no candidate: takes the 4 pool entries nearest the mission ceiling, fastest-first', () => {
    const target = timeOf(150, 1000, 'street')
    const rows = selectBoardRows(pool, anchor, null, target, ECONOMY, KIRIFURI)
    const poolRows = rows.filter((r) => !r.isAnchor)
    expect(poolRows).toHaveLength(4)
    const times = poolRows.map((r) => r.timeSeconds)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('never surfaces the candidate car itself, only the comparables', () => {
    const candidateTime = timeOf(155, 1000, 'street')
    const rows = selectBoardRows(
      pool,
      anchor,
      { timeSeconds: candidateTime, tyreGrade: 'street' },
      90,
      ECONOMY,
      KIRIFURI,
    )
    const ids = new Set(rows.map((r) => r.id))
    for (const row of rows) {
      expect(row.id).not.toBe('candidate')
    }
    expect(ids.size).toBe(rows.length)
  })

  it('is deterministic', () => {
    const first = selectBoardRows(pool, anchor, null, 90, ECONOMY, KIRIFURI)
    const second = selectBoardRows(pool, anchor, null, 90, ECONOMY, KIRIFURI)
    expect(first).toEqual(second)
  })

  it('retimes the whole board when the course changes', () => {
    const pass = selectBoardRows(pool, anchor, null, 90, ECONOMY, KIRIFURI)
    const bayshore = selectBoardRows(pool, anchor, null, 90, ECONOMY, WANGAN)
    expect(pass.map((r) => r.timeSeconds)).not.toEqual(bayshore.map((r) => r.timeSeconds))
  })
})
