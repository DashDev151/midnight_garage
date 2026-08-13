/**
 * Turns a `courses.json` course into a drivable ribbon: a sampled centreline
 * with heading and signed curvature, a station lookup, and a grip sample by
 * lateral offset. The radii and lengths are exactly the calibrated segment
 * data the lap model runs on; the ONLY thing invented here is the turn
 * direction of each corner, which the point-mass model never carried. The
 * geometry notes in the content already say these courses are behavioural
 * facsimiles; a drivable one is a drivable interpretation on the same terms.
 *
 * The ribbon does not geometrically close (choosing signs that close a lap
 * would change the calibrated radii), so a lap course is generated for a
 * number of laps and `wrapPose` teleports the car back one lap-length by the
 * rigid transform between identical lap frames. The car's body-frame state is
 * untouched, so the wrap is seamless.
 */
import type { Course } from '@midnight-garage/content'
import { DRIVE_CONFIG } from './config'
import { TARMAC, type DriveState, type SurfaceSample } from './physics'

export interface TrackSample {
  xM: number
  yM: number
  headingRad: number
  /** Signed curvature, 1/m, positive left. Zero on a straight. */
  curvature: number
  /** The corner radius of the segment this sample sits in, or null on a
   * straight. Carries the calibrated radius for the ghost's grip ceiling. */
  cornerRadiusM: number | null
  stationM: number
}

export interface Track {
  courseId: string
  samples: readonly TrackSample[]
  sampleSpacingM: number
  /** One lap's length, m. */
  lapLengthM: number
  laps: number
  halfWidthM: number
  /** Rigid transform from lap `l+1`'s frame back to lap `l`'s. */
  lapDeltaHeadingRad: number
  lapStart: { xM: number; yM: number }
  lapNextStart: { xM: number; yM: number }
}

/** Default turn directions: alternating, which reads as a touge and keeps the
 * ribbon from curling into itself immediately. Purely presentational; every
 * radius and length is the calibrated value regardless of sign. */
function turnSigns(course: Course): number[] {
  return course.segments.map((_, i) => (i % 2 === 0 ? -1 : 1))
}

export function buildTrack(course: Course, laps = 1, signsOverride?: readonly number[]): Track {
  const ds = DRIVE_CONFIG.track.sampleSpacingM
  const signs = signsOverride ?? turnSigns(course)
  const samples: TrackSample[] = []

  let x = 0
  let y = 0
  let heading = 0
  let station = 0
  let lapLengthM = 0
  let lapNextStart = { xM: 0, yM: 0 }
  let lapDeltaHeadingRad = 0

  const emit = (curvature: number, radius: number | null): void => {
    samples.push({ xM: x, yM: y, headingRad: heading, curvature, cornerRadiusM: radius, stationM: station })
  }

  for (let lap = 0; lap < laps; lap++) {
    if (lap === 1) {
      lapNextStart = { xM: x, yM: y }
      lapDeltaHeadingRad = heading
    }
    for (let i = 0; i < course.segments.length; i++) {
      const [radiusM, angleDeg, straightM] = course.segments[i]!
      const sign = signs[i % signs.length]!
      const arcLen = (radiusM * angleDeg * Math.PI) / 180
      const steps = Math.max(2, Math.ceil(arcLen / ds))
      const dTheta = ((sign * angleDeg * Math.PI) / 180) / steps
      const stepLen = arcLen / steps
      for (let k = 0; k < steps; k++) {
        emit(sign / radiusM, radiusM)
        // Advance along the chord of this sub-arc: rotate half, step, rotate half.
        heading += dTheta / 2
        x += Math.cos(heading) * stepLen
        y += Math.sin(heading) * stepLen
        heading += dTheta / 2
        station += stepLen
      }
      const straightSteps = Math.max(1, Math.ceil(straightM / ds))
      const sLen = straightM / straightSteps
      for (let k = 0; k < straightSteps; k++) {
        emit(0, null)
        x += Math.cos(heading) * sLen
        y += Math.sin(heading) * sLen
        station += sLen
      }
    }
    if (lap === 0) lapLengthM = station
  }
  emit(0, null)

  const halfWidthById = DRIVE_CONFIG.track.halfWidthById as Record<string, number | undefined>
  return {
    courseId: course.id,
    samples,
    sampleSpacingM: ds,
    lapLengthM,
    laps,
    halfWidthM: halfWidthById[course.id] ?? DRIVE_CONFIG.track.halfWidthDefaultM,
    lapDeltaHeadingRad,
    lapStart: { xM: 0, yM: 0 },
    lapNextStart,
  }
}

export interface TrackFix {
  /** Distance along the ribbon, m. */
  stationM: number
  /** Signed lateral offset from the centreline, m, positive left. */
  lateralM: number
  headingRad: number
  curvature: number
  index: number
}

/**
 * Locates a world position on the ribbon by local search from a hint index,
 * widening if the hint has gone stale. O(window) per call at 120 Hz.
 */
export function locateOnTrack(track: Track, xM: number, yM: number, hintIndex: number): TrackFix {
  const s = track.samples
  const n = s.length
  const search = (from: number, to: number): number => {
    let best = from
    let bestD = Infinity
    for (let i = Math.max(0, from); i <= Math.min(n - 1, to); i++) {
      const dx = xM - s[i]!.xM
      const dy = yM - s[i]!.yM
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }
  let idx = search(hintIndex - 40, hintIndex + 40)
  if (idx <= Math.max(0, hintIndex - 40) + 1 || idx >= Math.min(n - 1, hintIndex + 40) - 1) {
    idx = search(0, n - 1)
  }
  const p = s[idx]!
  const cos = Math.cos(p.headingRad)
  const sin = Math.sin(p.headingRad)
  const dx = xM - p.xM
  const dy = yM - p.yM
  const along = dx * cos + dy * sin
  const lateral = -dx * sin + dy * cos
  return {
    stationM: p.stationM + along,
    lateralM: lateral,
    headingRad: p.headingRad,
    curvature: p.curvature,
    index: idx,
  }
}

/** Centreline point at a station (clamped to the ribbon). */
export function pointAtStation(track: Track, stationM: number): TrackSample {
  const i = Math.max(
    0,
    Math.min(track.samples.length - 1, Math.round(stationM / track.sampleSpacingM)),
  )
  return track.samples[i]!
}

/** What the ground is worth at a lateral offset from the centreline. */
export function surfaceAtLateral(track: Track, lateralM: number): SurfaceSample {
  if (Math.abs(lateralM) <= track.halfWidthM) return TARMAC
  return { grip: DRIVE_CONFIG.track.offRoadGrip, extraDragMs2: DRIVE_CONFIG.track.offRoadDragMs2 }
}

/**
 * When the car has run into the final generated lap, teleports it back one
 * lap-length by the rigid transform between lap frames. Body-frame velocity
 * and yaw are untouched, so the manoeuvre in progress carries across.
 */
export function wrapPose(track: Track, state: DriveState): void {
  const dh = track.lapDeltaHeadingRad
  const cos = Math.cos(-dh)
  const sin = Math.sin(-dh)
  const dx = state.xM - track.lapNextStart.xM
  const dy = state.yM - track.lapNextStart.yM
  state.xM = track.lapStart.xM + dx * cos - dy * sin
  state.yM = track.lapStart.yM + dx * sin + dy * cos
  state.headingRad -= dh
}
