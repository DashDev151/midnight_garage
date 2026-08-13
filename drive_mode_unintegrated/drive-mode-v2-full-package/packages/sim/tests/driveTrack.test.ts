import { COURSES } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { DRIVE_CONFIG } from '../src/drive/config'
import { buildTrack, locateOnTrack, pointAtStation, surfaceAtLateral, wrapPose } from '../src/drive/track'
import { createDriveState } from '../src/drive/physics'
import { CARS, ECONOMY } from '@midnight-garage/content'
import { carBlock, factoryDownforceCoeff, MINT_CONDITION_FACTORS, STOCK_BUILD_FACTORS } from '../src/performance'
import { driveParamsFor } from '../src/drive/params'

const HAKONE = COURSES.find((c) => c.id === 'hakone')!
const WANGAN = COURSES.find((c) => c.id === 'wangan')!

/** One lap's length straight from the calibrated segment data. */
function segmentLength(course: typeof HAKONE): number {
  return course.segments.reduce((acc, [r, deg, straight]) => acc + (r * deg * Math.PI) / 180 + straight, 0)
}

describe('drive track ribbon', () => {
  it('carries the calibrated lap length exactly', () => {
    for (const course of [HAKONE, WANGAN]) {
      const track = buildTrack(course, 1)
      expect(track.lapLengthM).toBeCloseTo(segmentLength(course), 6)
    }
  })

  it('samples corners at the calibrated signed curvature', () => {
    const track = buildTrack(HAKONE, 1)
    const [firstRadius] = HAKONE.segments[0]!
    const first = track.samples[0]!
    expect(Math.abs(first.curvature)).toBeCloseTo(1 / firstRadius, 6)
    expect(first.cornerRadiusM).toBe(firstRadius)
    // Alternating default signs: first corner turns right (negative).
    expect(Math.sign(first.curvature)).toBe(-1)
    const anyLeft = track.samples.some((s) => s.curvature > 0)
    expect(anyLeft).toBe(true)
  })

  it('locates centreline points back to their own station', () => {
    const track = buildTrack(HAKONE, 1)
    for (const stationM of [0, 50, 333, track.lapLengthM * 0.5, track.lapLengthM - 10]) {
      const p = pointAtStation(track, stationM)
      const fix = locateOnTrack(track, p.xM, p.yM, 0)
      expect(fix.stationM).toBeCloseTo(p.stationM, 4)
      expect(Math.abs(fix.lateralM)).toBeLessThan(1e-6)
    }
  })

  it('grades the surface by lateral offset', () => {
    const track = buildTrack(HAKONE, 1)
    expect(surfaceAtLateral(track, 0).grip).toBe(1)
    expect(surfaceAtLateral(track, track.halfWidthM + 0.5).grip).toBe(DRIVE_CONFIG.track.offRoadGrip)
  })

  it('wraps a pose one lap back by the rigid lap transform', () => {
    const model = CARS.find((c) => c.id === 'toyota-sprinter-trueno-ae86')!
    const aero = ECONOMY.statFormulas.aero
    const block = carBlock(
      model,
      model.spec.stockPowerPs,
      model.spec.tyreCompound,
      ECONOMY.statFormulas.pace,
      ECONOMY.statFormulas.grip,
      aero,
      { downforceCoeff: factoryDownforceCoeff(model, aero), dragCdDelta: 0 },
      MINT_CONDITION_FACTORS,
      STOCK_BUILD_FACTORS,
    )
    const params = driveParamsFor(model, block, ECONOMY)
    const track = buildTrack(HAKONE, 2)
    const state = createDriveState(
      params,
      track.lapNextStart.xM,
      track.lapNextStart.yM,
      track.lapDeltaHeadingRad,
    )
    wrapPose(track, state)
    expect(state.xM).toBeCloseTo(track.lapStart.xM, 6)
    expect(state.yM).toBeCloseTo(track.lapStart.yM, 6)
    expect(state.headingRad).toBeCloseTo(0, 6)
  })
})
