import {
  CARS,
  COURSES as CONTENT_COURSES,
  ECONOMY,
  type CarModel,
  type Course,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { frontalAreaM2, lapTime } from '../src/performance'

/**
 * Unit tests for the quasi-static lap model in `performance.ts`: a golden pin on
 * the lap times the shipped model produces, plus the frontal-area helper that
 * feeds it.
 */

function COURSE_BY_ID(id: string): Course {
  const found = CONTENT_COURSES.find((c) => c.id === id)
  if (!found) throw new Error(`course ${id} missing from content`)
  return found
}

/**
 * Six playable cars spanning the roster's range and both halves of the model's
 * input: a kei car and an NA VTEC front-driver with no measured figures at all
 * (their behaviour comes from the fallback regressions), and an NA RWD icon, a
 * twin-turbo rotary, a twin-turbo AWD flagship and the 2JZ, each carrying a full
 * measured fingerprint. Each name matches a `cars.json` `displayName`.
 */
const SAMPLE_CAR_NAMES = [
  'Suzuki Alto Works (HA21S)',
  'Toyota Sprinter Trueno (AE86)',
  'Honda Civic SiR-II (EG6)',
  'Mazda RX-7 (FD3S)',
  'Nissan Skyline GT-R (BNR32)',
  'Toyota Supra RZ (JZA80)',
]

function modelByName(name: string): CarModel {
  const model = CARS.find((c) => c.displayName === name)
  if (!model) throw new Error(`no in-game car with displayName "${name}"`)
  return model
}

/**
 * Stock lap times in seconds, per sample car, keyed by shipped course id. The
 * course geometry itself is never restated here: each id is resolved out of
 * content, so the pin always runs against the courses the game ships.
 */
const PINNED_LAP_TIMES_S: Record<string, Record<string, number>> = {
  'Suzuki Alto Works (HA21S)': {
    hakone: 133.3,
    wangan: 188.0,
    misaki: 139.3,
    yatabe: 32.3,
  },
  'Toyota Sprinter Trueno (AE86)': {
    hakone: 125.1,
    wangan: 155.3,
    misaki: 119.0,
    yatabe: 29.7,
  },
  'Honda Civic SiR-II (EG6)': {
    hakone: 122.2,
    wangan: 150.0,
    misaki: 116.3,
    yatabe: 26.9,
  },
  'Mazda RX-7 (FD3S)': {
    hakone: 113.7,
    wangan: 134.8,
    misaki: 106.2,
    yatabe: 24.3,
  },
  'Nissan Skyline GT-R (BNR32)': {
    hakone: 114.1,
    wangan: 135.6,
    misaki: 107.1,
    yatabe: 24.1,
  },
  'Toyota Supra RZ (JZA80)': {
    hakone: 112.9,
    wangan: 134.6,
    misaki: 106.0,
    yatabe: 24.0,
  },
}

/**
 * Golden pin on the shipped lap model: each sample car is timed on every shipped
 * course at stock power on its stock compound, and must land within 0.1 s of its
 * pinned time. The pin is a regression net over `performance.ts` and over the
 * `statFormulas.pace`, `statFormulas.grip` and `statFormulas.aero` levers in
 * `economy.json`, so that an unintended change to any of them shows up as a
 * failing lap time rather than as silently different race results.
 *
 * These numbers pin the model as currently shipped; they are NOT the accuracy
 * check. Whether the model is RIGHT is `harnessAcceptance.test.ts`, which
 * measures the same laps against the calibration harness's own answers.
 * Re-pinning here is the expected outcome of a deliberate change to the pace,
 * grip or aero levers, and those levers are approval-gated (CLAUDE.md directive
 * 22), so a re-pin belongs in the same change as the approval it was made under.
 */
describe('lapTime golden pin over the shipped courses', () => {
  it('pins every shipped course', () => {
    const shipped = CONTENT_COURSES.map((c) => c.id).sort()
    for (const [name, times] of Object.entries(PINNED_LAP_TIMES_S)) {
      expect(Object.keys(times).sort(), `${name} does not pin every shipped course`).toEqual(
        shipped,
      )
    }
  })

  for (const name of SAMPLE_CAR_NAMES) {
    it(`holds its pinned lap times (<= 0.1 s) for ${name}`, () => {
      const model = modelByName(name)
      const pinned = PINNED_LAP_TIMES_S[name]
      if (!pinned) throw new Error(`"${name}" has no pinned lap times`)

      for (const [courseId, expected] of Object.entries(pinned)) {
        const ours = lapTime(
          model,
          COURSE_BY_ID(courseId),
          model.spec.stockPowerPs,
          model.spec.tyreCompound,
          ECONOMY,
        )
        expect(
          Math.abs(ours - expected),
          `${name} / ${courseId}: model ${ours.toFixed(2)}s vs pin ${expected}s (delta ${(ours - expected).toFixed(2)}s)`,
        ).toBeLessThanOrEqual(0.1)
      }
    })
  }
})

describe('frontalAreaM2', () => {
  it('uses the published body box (0.82 x width x height in m) when both are known', () => {
    const ae86 = modelByName('Toyota Sprinter Trueno (AE86)')
    const pace = ECONOMY.statFormulas.pace
    expect(frontalAreaM2(ae86, pace)).toBeCloseTo(
      pace.frontalAreaCoeff * (ae86.spec.widthMm! / 1000) * (ae86.spec.heightMm! / 1000),
      10,
    )
  })

  it('falls back to the fleet frontal area when a dimension is missing', () => {
    const pace = ECONOMY.statFormulas.pace
    const noDims = {
      spec: { widthMm: undefined, heightMm: undefined },
    } as unknown as CarModel
    expect(frontalAreaM2(noDims, pace)).toBe(pace.frontalAreaFallbackM2)
  })
})
