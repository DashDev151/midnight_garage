import { CARS, ECONOMY, type CarModel, type Course } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { deliveryArchetype, frontalAreaM2, lapTime } from '../src/performance'
import lapDataJson from '../../../docs/design/lapsim/lapsim-data.json'

/**
 * Faithfulness harness for the quasi-static lap model ported into
 * `performance.ts`. The ground truth is the calibration prototype
 * `docs/design/lapsim/lapsim-report.cjs`, whose output is captured in
 * `lapsim-data.json` (85 cars x 4 courses, times rounded to 0.1 s). The port
 * must reproduce those numbers: for a spread of in-game cars we re-run
 * `lapTime` against the prototype's own four course geometries and assert every
 * course lands within 0.2 s of the prototype's recorded time. A miss here is a
 * bug in the port, never a reason to loosen the tolerance.
 */

/** The prototype's four course geometries (COURSES in lapsim-report.cjs),
 * `[radius m, angle deg, following straight m]` per segment. Course ids are
 * test-local; only the segment shape drives the physics. */
const COURSES: Record<'Touge' | 'Mountain' | 'Wangan' | 'Circuit', Course> = {
  Touge: {
    id: 'touge',
    name: 'Touge',
    segments: [
      [18, 150, 90],
      [45, 90, 70],
      [20, 140, 80],
      [55, 80, 120],
      [110, 60, 150],
      [18, 160, 70],
      [50, 90, 100],
      [130, 50, 180],
    ],
  },
  Mountain: {
    id: 'mountain',
    name: 'Mountain',
    segments: [
      [60, 80, 200],
      [140, 60, 280],
      [22, 150, 150],
      [50, 90, 180],
      [120, 70, 250],
      [300, 40, 400],
      [55, 85, 160],
      [150, 55, 300],
      [20, 140, 120],
      [130, 60, 220],
    ],
  },
  Wangan: {
    id: 'wangan',
    name: 'Wangan',
    segments: [
      [320, 35, 1200],
      [160, 50, 700],
      [400, 30, 1500],
      [350, 40, 900],
      [180, 45, 600],
    ],
  },
  Circuit: {
    id: 'circuit',
    name: 'Circuit',
    segments: [
      [55, 90, 200],
      [130, 70, 250],
      [20, 150, 140],
      [300, 40, 380],
      [50, 85, 180],
      [140, 60, 240],
      [280, 45, 320],
      [60, 80, 160],
    ],
  },
}

type CourseKey = keyof typeof COURSES
const COURSE_KEYS = Object.keys(COURSES) as CourseKey[]

/** One prototype data row: the car name and its four recorded lap times. */
interface LapDataCar {
  n: string
  t: Record<CourseKey, number>
}

const lapData = lapDataJson as { cars: LapDataCar[] }

const dataByName = new Map(lapData.cars.map((c) => [c.n, c]))

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

/**
 * Six playable cars spanning the roster's range and every delivery archetype
 * that the shipped fleet exercises: a kei single-turbo, an NA RWD icon, an NA
 * VTEC front-driver, a twin-turbo rotary, a twin-turbo AWD flagship, and the
 * sequential-twin 2JZ. Each name matches both a `cars.json` `displayName` and a
 * `lapsim-data.json` `n`.
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

describe('lapTime port faithfulness vs the calibration prototype', () => {
  it('all six sample cars carry the data the prototype fed the model', () => {
    for (const name of SAMPLE_CAR_NAMES) {
      const model = modelByName(name)
      expect(dataByName.has(name), `"${name}" absent from lapsim-data.json`).toBe(true)
      // The prototype's stock inputs: stock power and the stock tyre compound.
      expect(model.spec.stockPowerPs).toBeGreaterThan(0)
      expect(model.spec.tyreCompound).toBeDefined()
    }
  })

  for (const name of SAMPLE_CAR_NAMES) {
    it(`reproduces the prototype's four lap times (<= 0.2 s) for ${name}`, () => {
      const model = modelByName(name)
      const expected = dataByName.get(name)
      expect(expected, `"${name}" absent from lapsim-data.json`).toBeDefined()

      for (const key of COURSE_KEYS) {
        const ours = round1(
          lapTime(model, COURSES[key], model.spec.stockPowerPs, model.spec.tyreCompound, ECONOMY),
        )
        const theirs = expected!.t[key]
        expect(
          Math.abs(ours - theirs),
          `${name} / ${key}: port ${ours}s vs prototype ${theirs}s (delta ${(ours - theirs).toFixed(2)}s)`,
        ).toBeLessThanOrEqual(0.2)
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
