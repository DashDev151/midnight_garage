/**
 * The drive feature's pure logic: lap timing by interpolated station
 * crossings, best-lap tracking, and delta formatting. Kept out of the
 * screen so it is unit-testable; the screen's canvas loop calls
 * `recordCrossing` once per physics step and renders whatever comes back.
 */
export interface DriveTimer {
  /** Sim time the current lap began; the first "lap" runs from the
   * standing start and is timed like any other. */
  lapStartS: number
  lastLapS: number | null
  bestLapS: number | null
  lapsDone: number
}

export function createDriveTimer(): DriveTimer {
  return { lapStartS: 0, lastLapS: null, bestLapS: null, lapsDone: 0 }
}

/**
 * Advances the timer for one physics step. When the station sweeps across
 * the lap line the crossing instant is interpolated inside the step, so
 * timing is sub-step accurate at any frame rate. Returns true on a
 * completed lap so the caller can wrap the pose.
 */
export function recordCrossing(
  timer: DriveTimer,
  prevStationM: number,
  stationM: number,
  lapLengthM: number,
  simTimeS: number,
  dtS: number,
): boolean {
  if (!(prevStationM < lapLengthM && stationM >= lapLengthM)) return false
  const frac = (lapLengthM - prevStationM) / Math.max(1e-6, stationM - prevStationM)
  const crossS = simTimeS - dtS + dtS * frac
  timer.lastLapS = crossS - timer.lapStartS
  timer.lapStartS = crossS
  timer.lapsDone += 1
  if (timer.bestLapS === null || timer.lastLapS < timer.bestLapS) timer.bestLapS = timer.lastLapS
  return true
}

/** "1:23.45" for long laps, "58.21" under a minute. */
export function formatLapS(s: number | null): string {
  if (s === null) return '-'
  if (s < 60) return s.toFixed(2)
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`
}

/** Signed delta against the target, e.g. "+1.42" or "-0.30"; empty without
 * both figures. */
export function formatDeltaS(lapS: number | null, targetS: number | null): string {
  if (lapS === null || targetS === null) return ''
  const d = lapS - targetS
  return `${d >= 0 ? '+' : ''}${d.toFixed(2)}`
}
