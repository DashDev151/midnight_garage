import { CARS, COURSES, ECONOMY, type Course } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { lapTime } from '../src/performance'
import HARNESS_TIMES from './harnessReferenceTimes.json'

/**
 * THE ACCEPTANCE TEST FOR THE PHYSICS MODEL.
 *
 * `harnessReferenceTimes.json` is the calibration harness's own computed time
 * for every shipped car on every shipped course, at stock power on its stock
 * tyre. The harness is the reference implementation of the model and it is
 * validated against real driven laps; this file asserts that the game
 * reproduces it.
 *
 * This is a check against a known answer, not a golden pin of the game's own
 * output: a failure here means the port has drifted from the model, and the fix
 * is in `performance.ts`, never in the tolerance. The tolerance is 0.2 s rather
 * than 0.1 because the fixture itself is rounded to a tenth.
 */

const TOLERANCE_SECONDS = 0.2

/**
 * THE SHIPPED CARS THE HARNESS HAS NEVER RUN, named one by one.
 *
 * A car reaches this fixture through the spec book: `lapsim-report.cjs` reads
 * the book's `CARS` array, walks a lap for every entry it finds and writes the
 * times to `lapsim-data.json`, which `scripts/generateHarnessReferenceTimes.cjs`
 * filters down to the shipped set. These three have no spec-book entry at all,
 * so the harness has never computed a time for them and there is no known
 * answer here to check against. Their figures are manufacturer research
 * (`docs/design/reference/roster-research-provenance.csv`), not panel readings.
 *
 * They are listed rather than derived, and the list is checked in both
 * directions below, so a car cannot fall out of the fixture unnoticed and a
 * name cannot rot here after the car it excuses is gone. They enter the fixture
 * in the pass that adds them to the book and re-runs the harness, which TODO.md
 * holds beside the performance re-validation.
 */
const NEVER_RUN_BY_THE_HARNESS: ReadonlySet<string> = new Set([
  'toyota-corolla-15-se-ae91',
  'suzuki-jimny-ja11',
  'toyota-land-cruiser-70-lj71',
])

/** The fixture's course names, in the order it lists them, to the shipped ids. */
const COURSE_ID_BY_HARNESS_NAME: Readonly<Record<string, string>> = {
  Hakone: 'hakone',
  Wangan: 'wangan',
  Misaki: 'misaki',
  Yatabe: 'yatabe',
}

function courseById(id: string): Course {
  const found = COURSES.find((c) => c.id === id)
  if (!found) throw new Error(`course ${id} missing from content`)
  return found
}

const REFERENCE = HARNESS_TIMES as Readonly<Record<string, Record<string, number>>>

describe('the shipped model reproduces the calibration harness', () => {
  it('covers every shipped car the harness has run, and every shipped course', () => {
    expect(Object.keys(REFERENCE).sort()).toEqual(
      CARS.map((c) => c.id)
        .filter((id) => !NEVER_RUN_BY_THE_HARNESS.has(id))
        .sort(),
    )
    expect(
      Object.keys(COURSE_ID_BY_HARNESS_NAME)
        .map((n) => COURSE_ID_BY_HARNESS_NAME[n])
        .sort(),
    ).toEqual(COURSES.map((c) => c.id).sort())
  })

  it('excuses only cars that actually ship', () => {
    const stale = [...NEVER_RUN_BY_THE_HARNESS].filter((id) => !CARS.some((c) => c.id === id))
    expect(stale, 'a named exemption no longer names a shipped car').toEqual([])
  })

  for (const model of CARS.filter((c) => !NEVER_RUN_BY_THE_HARNESS.has(c.id))) {
    const expected = REFERENCE[model.id]
    it(`${model.displayName} matches the harness on all four courses`, () => {
      expect(expected).toBeDefined()
      for (const [harnessName, courseId] of Object.entries(COURSE_ID_BY_HARNESS_NAME)) {
        const reference = expected![harnessName]!
        const ours = lapTime(
          model,
          courseById(courseId),
          model.spec.stockPowerPs,
          model.spec.tyreCompound,
          ECONOMY,
        )
        expect(
          Math.abs(ours - reference),
          `${model.id} / ${courseId}: game ${ours.toFixed(2)}s vs harness ${reference}s (delta ${(ours - reference).toFixed(2)}s)`,
        ).toBeLessThanOrEqual(TOLERANCE_SECONDS)
      }
    })
  }
})
