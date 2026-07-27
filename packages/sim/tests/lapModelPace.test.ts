import {
  CARS,
  COURSES as CONTENT_COURSES,
  ECONOMY,
  type CarModel,
  type Course,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { deliveryArchetype, frontalAreaM2, lapTime } from '../src/performance'

/**
 * Unit tests for the quasi-static lap model in `performance.ts`: a golden pin on
 * the lap times the shipped model produces, plus the two helpers that feed it.
 */

function COURSE_BY_ID(id: string): Course {
  const found = CONTENT_COURSES.find((c) => c.id === id)
  if (!found) throw new Error(`course ${id} missing from content`)
  return found
}

/**
 * Six playable cars spanning the roster's range and every delivery archetype
 * that the shipped fleet exercises: a kei single-turbo, an NA RWD icon, an NA
 * VTEC front-driver, a twin-turbo rotary, a twin-turbo AWD flagship, and the
 * sequential-twin 2JZ. Each name matches a `cars.json` `displayName`.
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
    kirifuri: 238.4,
    usui: 125.8,
    wangan: 239.8,
    tsurugi: 101.9,
    misaki: 137.4,
  },
  'Toyota Sprinter Trueno (AE86)': {
    kirifuri: 236.0,
    usui: 119.6,
    wangan: 218.0,
    tsurugi: 95.7,
    misaki: 119.6,
  },
  'Honda Civic SiR-II (EG6)': {
    kirifuri: 233.1,
    usui: 116.6,
    wangan: 204.8,
    tsurugi: 92.7,
    misaki: 112.6,
  },
  'Mazda RX-7 (FD3S)': {
    kirifuri: 225.8,
    usui: 111.1,
    wangan: 193.2,
    tsurugi: 88.1,
    misaki: 107.7,
  },
  'Nissan Skyline GT-R (BNR32)': {
    kirifuri: 229.9,
    usui: 111.9,
    wangan: 192.9,
    tsurugi: 89.1,
    misaki: 107.1,
  },
  'Toyota Supra RZ (JZA80)': {
    kirifuri: 226.9,
    usui: 110.1,
    wangan: 187.9,
    tsurugi: 87.2,
    misaki: 104.7,
  },
}

/**
 * Golden pin on the shipped lap model: each sample car is timed on every shipped
 * course at stock power on its stock compound, and must land within 0.1 s of its
 * pinned time. The pin is a regression net over `performance.ts` and over the
 * `statFormulas.pace` and `statFormulas.grip` levers in `economy.json`, so that
 * an unintended change to either shows up as a failing lap time rather than as
 * silently different race results.
 *
 * These numbers pin the model as currently shipped. Re-pinning them is the
 * expected outcome of any deliberate change to the pace or grip levers, made
 * with the maintainer approval CLAUDE.md directive 22 requires for those levers.
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

describe('deliveryArchetype maps the shipped fleet the way the prototype does', () => {
  const cases: Array<[string, string]> = [
    ['Suzuki Alto Works (HA21S)', 'singleTurbo'],
    ['Toyota Sprinter Trueno (AE86)', 'plainNA'],
    ['Honda Civic SiR-II (EG6)', 'vtecNA'],
    ['Mazda RX-7 (FD3S)', 'seqTwinRotary'],
    ['Nissan Skyline GT-R (BNR32)', 'parallelTwin'],
    ['Toyota Supra RZ (JZA80)', 'seqTwin'],
  ]
  for (const [name, archetype] of cases) {
    it(`${name} -> ${archetype}`, () => {
      expect(deliveryArchetype(modelByName(name))).toBe(archetype)
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
