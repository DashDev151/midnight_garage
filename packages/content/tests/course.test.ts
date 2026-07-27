import { describe, expect, it } from 'vitest'
import courses from '../data/courses.json'
import { CoursesSchema } from '../src'

/**
 * The lap-model course content guards: schema parse, the four calibrated
 * courses, unique ids, and the shape each kind of course is allowed to take.
 * The lap times a car runs on each course are the live output of the sim's lap
 * model (the boundary law: content never depends on sim), so no timing is
 * asserted here.
 */
const PARSED = CoursesSchema.parse(courses)

describe('lap-model course content', () => {
  it('parses cleanly', () => {
    expect(PARSED.length).toBeGreaterThan(0)
  })

  it('ships exactly the four calibrated courses', () => {
    expect(PARSED.map((course) => course.id)).toEqual(['hakone', 'wangan', 'misaki', 'yatabe'])
  })

  it('every id is unique', () => {
    const ids = PARSED.map((course) => course.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  /**
   * A road with no corners cannot be written as a list of them: a `standing-km`
   * carries no segments at all (a zero-angle segment would still be entered at
   * an apex speed, making the run a flying kilometre) and states its own
   * `lengthM` instead, while a `lap` course is measured entirely by its shape.
   */
  it('a lap course is a list of corners; a standing-km is a length with none', () => {
    for (const course of PARSED) {
      if (course.kind === 'lap') {
        expect(course.segments.length, `${course.id} has no segments`).toBeGreaterThan(0)
        expect(course.lengthM, `${course.id} states a length as well as a shape`).toBeUndefined()
      } else {
        expect(course.segments.length, `${course.id} carries segments`).toBe(0)
        expect(course.lengthM, `${course.id} states no length`).toBeGreaterThan(0)
      }
    }
  })
})
