import { describe, expect, it } from 'vitest'
import courses from '../data/courses.json'
import { CoursesSchema } from '../src'

/**
 * The lap-model course content guards: schema parse, the five shipped courses,
 * and unique ids across the list. The lap times a car runs on each course are
 * the live output of the sim's lap model (the boundary law: content never
 * depends on sim), so no timing is asserted here.
 */
const PARSED = CoursesSchema.parse(courses)

describe('lap-model course content (Sprint 124)', () => {
  it('parses cleanly', () => {
    expect(PARSED.length).toBeGreaterThan(0)
  })

  it('ships exactly the five courses', () => {
    expect(PARSED.map((course) => course.id)).toEqual([
      'kirifuri',
      'usui',
      'wangan',
      'tsurugi',
      'misaki',
    ])
  })

  it('every id is unique', () => {
    const ids = PARSED.map((course) => course.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every course has at least one segment', () => {
    for (const course of PARSED) {
      expect(course.segments.length, `${course.id} has no segments`).toBeGreaterThan(0)
    }
  })
})
