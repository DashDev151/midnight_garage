import { CARS, COURSES, ECONOMY, type Course } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { referenceLapTimeSeconds } from '../src/lapModel'
import { lapTime } from '../src/performance'

/**
 * The reference-lap board times flavour entries (a power and a weight, no
 * chassis of their own) on a synthesised neutral chassis. That chassis is the
 * one car in the game not read from content, so nothing else asserts it is a
 * coherent car at all.
 *
 * It matters because the model reads a car's own stock power: with no measured
 * acceleration, the launch and power ratios come from a regression whose
 * predictor is power-to-weight. A chassis carrying a placeholder power figure
 * would have its behaviour predicted from a car with no engine and then be run
 * at the entry's real power, which is silently wrong rather than loudly wrong -
 * the board's absolute numbers are pinned nowhere.
 */

function courseById(id: string): Course {
  const found = COURSES.find((c) => c.id === id)
  if (!found) throw new Error(`course ${id} missing from content`)
  return found
}

const HAKONE = courseById('hakone')

describe('the reference-lap board chassis', () => {
  it('answers power: a much stronger entry is clearly and monotonically faster', () => {
    const times = [80, 150, 250, 400].map((ps) =>
      referenceLapTimeSeconds(ps, 1100, 'street', HAKONE, ECONOMY),
    )
    for (let i = 1; i < times.length; i++) {
      expect(times[i]!, `${times[i]} vs ${times[i - 1]}`).toBeLessThan(times[i - 1]!)
    }
    expect(times[0]! - times[times.length - 1]!).toBeGreaterThan(5)
  })

  it('never produces a NaN, whatever an entry states', () => {
    const entries: readonly [number, number][] = [
      [1, 4000],
      [1, 1],
      [63, 670],
      [1000, 600],
    ]
    for (const [powerPs, weightKg] of entries) {
      const time = referenceLapTimeSeconds(powerPs, weightKg, 'street', HAKONE, ECONOMY)
      expect(Number.isFinite(time), `${powerPs} PS / ${weightKg} kg gave ${time}`).toBe(true)
      expect(time).toBeGreaterThan(0)
    }
  })

  /**
   * The band is wide on purpose. It is not a pin on the board's numbers, which
   * are deliberately unpinned: it is the only assertion that catches a chassis
   * whose own spec disagrees with the lap it is timed at, because a
   * placeholder power figure floors the predicted launch plateau and leaves the
   * entry many seconds adrift of a real car of the same weight and power.
   */
  it('times an entry like a real car of the same power and weight', () => {
    const civic = CARS.find((c) => c.id === 'honda-civic-sir2-eg6')!
    const real = lapTime(civic, HAKONE, civic.spec.stockPowerPs, civic.spec.tyreCompound, ECONOMY)
    const reference = referenceLapTimeSeconds(
      civic.spec.stockPowerPs,
      civic.spec.curbWeightKg,
      'sport',
      HAKONE,
      ECONOMY,
    )
    expect(Math.abs(reference / real - 1)).toBeLessThan(0.2)
  })
})
