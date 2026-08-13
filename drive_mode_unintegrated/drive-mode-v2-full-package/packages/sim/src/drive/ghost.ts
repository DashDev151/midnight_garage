/**
 * The scripted ghost driver and the acceptance harness around it. The ghost
 * exists to prove the plan's headline claim: a clean lap of the drive model
 * should land within a few percent of `lapTime()` for the same car on the
 * same course, because both run on the same `carBlock()` physics.
 *
 * The speed plan is the lap model's own maths re-read along the ribbon:
 * `cornerMu` for the geometric grip ceiling, `apexSpeed` for the aero-aware
 * apex, `vTopOf` (already in `DriveParams.vMaxMs`) for the straights, all
 * scaled by a clean-lap fraction, then a circular backward braking pass at
 * the car's own aero-assisted braking rate. Nothing about the car is invented
 * here; only the driving is.
 */
import type { CarModel, Course, EconomyConfig } from '@midnight-garage/content'
import {
  aeroGripMultiplier,
  apexSpeed,
  carBlock,
  cornerMu,
  factoryDownforceCoeff,
  lapTime,
  MINT_CONDITION_FACTORS,
  STOCK_BUILD_FACTORS,
} from '../performance'
import { DRIVE_CONFIG } from './config'
import { driveParamsFor, type DriveParams } from './params'
import {
  createDriveState,
  DRIVE_DT_S,
  stepDrive,
  steerLockFor,
  type DriveInput,
} from './physics'
import { buildTrack, locateOnTrack, pointAtStation, surfaceAtLateral, type Track } from './track'

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Allowed speed per single-lap sample index; circular over one lap. */
export type GhostProfile = readonly number[]

/**
 * Builds the ghost's speed plan for one lap of the track. Corner samples get
 * the lap model's own apex speed under the geometric grip ceiling; straights
 * get the car's terminal speed; everything is scaled to a clean lap and then
 * limited backwards (twice, because the plan is circular) so no target is
 * ever unreachable under the car's own braking.
 */
export function buildGhostProfile(track: Track, params: DriveParams): GhostProfile {
  const cfg = DRIVE_CONFIG.ghost
  const { block, paceConfig, aeroConfig } = params
  const nLap = Math.round(track.lapLengthM / track.sampleSpacingM)
  const ds = track.sampleSpacingM
  const v: number[] = new Array(nLap)

  for (let i = 0; i < nLap; i++) {
    const sample = track.samples[Math.min(i, track.samples.length - 1)]!
    const r = sample.cornerRadiusM
    if (r == null) {
      v[i] = params.vMaxMs * cfg.cleanFraction
    } else {
      const mu = cornerMu(block.mu, r, paceConfig)
      const apex = apexSpeed(mu, r, block.downforceCoeff, paceConfig, aeroConfig)
      v[i] = Math.min(apex, params.vMaxMs) * cfg.cornerFractionByDrivetrain[params.drivetrain]
    }
  }

  // Backward braking pass, friction-circle aware: where the road curves, the
  // lateral demand at the allowed speed is spent first and only the remaining
  // budget slows the car, which is exactly why hairpin approaches begin so
  // early. Two passes because the plan is a loop and the first pass cannot
  // see across the seam until the seam itself has been limited.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = nLap - 1; i >= 0; i--) {
      const j = (i + 1) % nLap
      const next = v[j]!
      const budget =
        block.brakeMu * aeroGripMultiplier(next, block.downforceCoeff, aeroConfig) * params.gravity
      const latNeed = next * next * Math.abs(track.samples[j]!.curvature)
      const aLong =
        cfg.brakePlanFraction * Math.sqrt(Math.max(0, budget * budget - latNeed * latNeed))
      v[i] = Math.min(v[i]!, Math.sqrt(next * next + 2 * Math.max(0.4, aLong) * ds))
    }
  }
  return v
}

/** Allowed speed at a continuous station, linearly interpolated, circular. */
function profileAt(profile: GhostProfile, track: Track, stationM: number): number {
  const n = profile.length
  const s = ((stationM % track.lapLengthM) + track.lapLengthM) % track.lapLengthM
  const f = s / track.sampleSpacingM
  const i = Math.floor(f) % n
  const t = f - Math.floor(f)
  return profile[i]! * (1 - t) + profile[(i + 1) % n]! * t
}

export interface GhostDriver {
  hintIndex: number
  lastLateralM: number
  /** Smoothed steer command, -1..1. */
  steerFilt: number
  /** Smoothed brake command, 0..1: a squeezed pedal, not a stamped one. */
  brakeFilt: number
  /** U-turn mode latch, with hysteresis so it cannot thrash. */
  uTurn: boolean
  /** Rejoin mode latch: drive gently back to the line, then race again. */
  rejoin: boolean
  /** The most recent track fix, for the caller's surface sampling and lap timing. */
  stationM: number
  lateralM: number
}

export function createGhostDriver(): GhostDriver {
  return {
    hintIndex: 0,
    lastLateralM: 0,
    steerFilt: 0,
    brakeFilt: 0,
    uTurn: false,
    rejoin: false,
    stationM: 0,
    lateralM: 0,
  }
}

/**
 * One control decision: pure pursuit toward a lookahead point on the
 * centreline, a small lateral P/D trim, and proportional speed tracking of
 * the profile. Returns the input for the next physics step and updates the
 * driver's track fix as a side effect.
 */
export function ghostInput(
  ghost: GhostDriver,
  state: {
    xM: number
    yM: number
    headingRad: number
    vLongMs: number
    vLatMs: number
    speedMs: number
    yawRateRadS: number
    frontSlip: number
  },
  track: Track,
  profile: GhostProfile,
  params: DriveParams,
  dt: number,
): DriveInput {
  const cfg = DRIVE_CONFIG.ghost
  const fix = locateOnTrack(track, state.xM, state.yM, ghost.hintIndex)
  ghost.hintIndex = fix.index
  ghost.stationM = fix.stationM
  ghost.lateralM = fix.lateralM

  // A proper slide is handled by countersteer and patience, not by modes: a
  // pedal stamped mid-slide locks everything, and the rejoin latch must not
  // engage until the car is travelling roughly the way it points again.
  const slideFrac = Math.abs(state.vLatMs) / Math.max(state.speedMs, 1)
  const sliding = slideFrac > 0.3 && state.speedMs > 5

  // Rejoin latch: well off the line, racing logic (short lookahead, full
  // throttle, hard numbers) produces an unstable slalom back to the track.
  // The rejoin mode drives gently to the line instead, then racing resumes.
  if (ghost.rejoin) {
    if (Math.abs(fix.lateralM) < cfg.rejoin.exitLatM) ghost.rejoin = false
  } else if (Math.abs(fix.lateralM) > cfg.rejoin.enterLatM && !sliding) {
    ghost.rejoin = true
  }

  // Path tracking: the track's own curvature a short preview ahead is fed
  // forward, and a lateral PD (position, rate and heading error) closes the
  // loop. Pure pursuit conflates heading and position through one target
  // point and hops across the apexes of chained corners, which is exactly
  // the chicane wobble this replaced.
  const previewM = clamp(cfg.previewGainS * state.speedMs, cfg.previewMinM, cfg.previewMaxM)
  const preview = pointAtStation(track, fix.stationM + previewM)
  // The feed-forward curvature is AVERAGED over the preview window rather
  // than sampled at its end: segment-boundary curvature is a step, and
  // feeding the step straight to the wheel is a turn-in jerk that knocks a
  // near-peak rear axle loose at speed. The average is a natural ease-in.
  let kSum = 0
  for (let i = 0; i < 4; i++) {
    kSum += pointAtStation(track, fix.stationM + ((i + 1) / 4) * previewM).curvature
  }
  const kFF = kSum / 4
  let headErr = state.headingRad - preview.headingRad
  while (headErr > Math.PI) headErr -= 2 * Math.PI
  while (headErr < -Math.PI) headErr += 2 * Math.PI

  // Facing the wrong way after a spin: no reverse gear exists, so the ghost
  // turns about on full lock at walking throttle until the track is well
  // ahead again. Latched with hysteresis so it cannot thrash at the
  // boundary, flipping U-turns forever.
  if (ghost.uTurn) {
    if (Math.abs(headErr) < 0.7 || state.speedMs > 14) ghost.uTurn = false
  } else if (Math.abs(headErr) > 2.4 && state.speedMs < 8) {
    ghost.uTurn = true
  }
  if (ghost.uTurn) {
    ghost.lastLateralM = fix.lateralM
    ghost.steerFilt = -Math.sign(headErr) * cfg.steerMax
    ghost.brakeFilt = 0
    return { steer: ghost.steerFilt, throttle: 0.5, brake: 0, handbrake: false, assistLevel: 1 }
  }

  const latRate = (fix.lateralM - ghost.lastLateralM) / Math.max(dt, 1e-6)
  ghost.lastLateralM = fix.lateralM
  // Commanded curvature: track feed-forward minus the error terms. Position
  // and rate divide by v^2 (curvature per lateral acceleration), heading by
  // v (a heading error is a lateral RATE of v * sin(err)). Each correction's
  // lateral-acceleration authority is CAPPED as a fraction of grip: without
  // the caps the same gains that damp one car at one speed command
  // near-limit lateral for another, and the ghost either snakes or spins.
  const aeroMultEarly = aeroGripMultiplier(
    state.speedMs,
    params.block.downforceCoeff,
    params.aeroConfig,
  )
  const muLatEarly = params.block.mu * aeroMultEarly
  const vSq = Math.max(state.speedMs * state.speedMs, 25)
  const kapCap = (frac: number): number => (frac * muLatEarly * params.gravity) / vSq
  const posKappa = clamp(
    (cfg.track2.latGain * fix.lateralM + cfg.track2.rateGain * latRate) / vSq,
    -kapCap(cfg.track2.posAyFrac),
    kapCap(cfg.track2.posAyFrac),
  )
  const headKappa = clamp(
    (cfg.track2.headGain * headErr) / Math.max(state.speedMs, 5),
    -kapCap(cfg.track2.headAyFrac),
    kapCap(cfg.track2.headAyFrac),
  )
  // Yaw damping against the PATH, strictly ONE-SIDED: only yaw beyond what
  // the path itself carries is damped (the rear walking out), and the term
  // can never add turn-in. A symmetric version reads the previewed corner
  // before the car has rotated and overdrives entry by the whole shortfall,
  // which snaps the rear at speed.
  const pathYawBound = 1.1 * Math.abs(state.speedMs * kFF) + 0.05
  const yawExcess =
    Math.sign(state.yawRateRadS) * Math.max(0, Math.abs(state.yawRateRadS) - pathYawBound)
  const yawKappa = clamp(
    (cfg.track2.yawGain * yawExcess) / Math.max(state.speedMs, 5),
    -kapCap(cfg.track2.yawAyFrac),
    kapCap(cfg.track2.yawAyFrac),
  )
  const pursuitKappa = kFF - posKappa - headKappa - yawKappa

  // The wheel angle is built from the wanted path curvature plus an explicit
  // slip-angle feed-forward: the front must point past the path by the slip
  // the demanded lateral force needs. Commanding angle directly against a
  // slip-padded lock makes input map to slip at speed, and the ghost weaves
  // itself into a spin on the straights.
  const aeroMult = aeroGripMultiplier(state.speedMs, params.block.downforceCoeff, params.aeroConfig)
  const muLat = params.block.mu * aeroMult
  const ayDemand = state.speedMs * state.speedMs * pursuitKappa
  const latFrac = clamp(ayDemand / Math.max(1, muLat * params.gravity), -1, 1)
  const slipFF = latFrac * params.peakSlipPerMuFront * muLat
  const lock = steerLockFor(params, state.vLongMs, muLat)
  let steerRaw = clamp(
    (Math.atan(pursuitKappa * params.wheelbaseM) + slipFF) / Math.max(lock, 1e-3),
    -cfg.steerMax,
    cfg.steerMax,
  )
  ghost.steerFilt += (steerRaw - ghost.steerFilt) * Math.min(1, dt / cfg.steerTauS)
  // Anti-saturation, applied at the OUTPUT so it acts the very step the
  // front lets go: past the peak, more angle is LESS force, so a saturated
  // front is answered by unwinding toward peak, never by stacking lock
  // (which is the understeer death loop).
  const unwind =
    state.frontSlip > cfg.frontSlipUnwindAt
      ? Math.max(0.35, cfg.frontSlipUnwindAt / state.frontSlip)
      : 1
  const steer = ghost.steerFilt * unwind

  // Speed tracking: the profile already carries every future braking need
  // (backward pass), so a proportional follow with a small deadband is enough.
  // Speed control. Braking is FED FORWARD from the plan itself: the pedal is
  // set from the deceleration the plan requires over a short horizon, with a
  // proportional trim on top, so the ghost tracks the plan instead of chasing
  // it from behind (a pure P controller arrives at every hairpin a couple of
  // m/s hot, which is precisely a spin).
  // Rejoin aims for a gentle speed, approached progressively: demanding
  // walking pace outright while still fast is a full-pedal slam mid-error,
  // which is its own spin.
  const vHere = ghost.rejoin
    ? Math.min(
        profileAt(profile, track, fix.stationM),
        Math.max(cfg.rejoin.speedMs, state.speedMs - 8),
      )
    : profileAt(profile, track, fix.stationM)
  const horizonM = clamp(0.8 * state.speedMs, 5, 26)
  const vAhead = profileAt(profile, track, fix.stationM + horizonM)
  const aNeed = (state.speedMs * state.speedMs - vAhead * vAhead) / (2 * horizonM)
  const aeroBrakeMult = aeroGripMultiplier(state.speedMs, params.block.downforceCoeff, params.aeroConfig)
  const aAvail = params.block.brakeMu * aeroBrakeMult * params.gravity
  const feedForward = Math.max(0, aNeed) / aAvail
  const err = vHere - state.speedMs

  const wantsBrake = aNeed > 0.15 * aAvail || state.speedMs > vHere * cfg.brakeTriggerRatio
  // No steering-based pedal cap here: the plan's backward pass is already
  // friction-circle aware, so the fed-forward pedal is the circle-respecting
  // demand. Capping it again just makes the ghost arrive hot.
  // The pedal is circle-limited against the PATH's curvature, mirroring the
  // plan's backward pass: however hot the arrival, the pedal can only spend
  // what cornering leaves, or the correction itself folds the rear axle.
  const latFracPath = clamp(
    (state.speedMs * state.speedMs * Math.abs(pursuitKappa)) / aAvail,
    0,
    1,
  )
  const circleCap = Math.sqrt(Math.max(0.06, 1 - latFracPath * latFracPath))
  const brakeWanted = wantsBrake
    ? Math.min(circleCap, clamp(feedForward + clamp(-err, 0, 4) * cfg.brakeGain, 0, 1))
    : 0
  // Squeezed on, released instantly: onset steps punch through the load
  // transfer lag and snap the light rear axle loose.
  if (brakeWanted > ghost.brakeFilt) {
    ghost.brakeFilt += (brakeWanted - ghost.brakeFilt) * Math.min(1, dt / cfg.brakeTauS)
  } else {
    ghost.brakeFilt = brakeWanted
  }
  let brake = ghost.brakeFilt
  if (sliding) {
    brake = Math.min(brake, 0.15)
    ghost.brakeFilt = brake
  }
  // Mid-corner throttle is eased with steering for the same circle reason;
  // the driven axle keeps some lateral budget. Rejoining is gentler still.
  const steerCap = Math.max(0.3, 1 - cfg.throttleSteerCut * Math.abs(steer))
  const throttleCap = ghost.rejoin ? Math.min(steerCap, cfg.rejoin.throttleCap) : steerCap
  let throttle =
    brake > 0 || sliding ? 0 : Math.min(throttleCap, clamp(err * cfg.throttleGain, 0, 1))
  // Creep escape: near a standstill every cap yields to simply getting the
  // car moving again, or the grass drag can pin a weak car forever.
  if (state.speedMs < 3 && brake === 0 && !sliding) throttle = Math.max(throttle, 0.9)

  return { steer, throttle, brake, handbrake: false, assistLevel: 1 }
}

export interface GhostRunResult {
  /** The ghost's flying lap, s. */
  driveLapS: number
  /** The point-mass lap model's figure for the same car and course, s. */
  modelLapS: number
  /** driveLapS / modelLapS. */
  ratio: number
  /** Worst absolute lateral offset seen on the timed lap, m. */
  maxLateralM: number
  /** Where and when the run ended, for diagnosing failures. */
  endStationM: number
  endTimeS: number
  endLateralM: number
}

/**
 * Runs the full acceptance drill for one stock car on one lap course: build
 * the same `carBlock()` the lap model uses, drive a standing warm-up lap and
 * then a flying timed lap, and compare against `lapTime()`. Lap boundaries
 * are interpolated station crossings, so timing is sub-step accurate.
 */
export function runGhostLap(model: CarModel, course: Course, economy: EconomyConfig): GhostRunResult {
  const aero = economy.statFormulas.aero
  const powerPs = model.spec.stockPowerPs
  const compound = model.spec.tyreCompound
  const block = carBlock(
    model,
    powerPs,
    compound,
    economy.statFormulas.pace,
    economy.statFormulas.grip,
    aero,
    { downforceCoeff: factoryDownforceCoeff(model, aero), dragCdDelta: 0 },
    MINT_CONDITION_FACTORS,
    STOCK_BUILD_FACTORS,
  )
  const params = driveParamsFor(model, block, economy)
  const modelLapS = lapTime(model, course, powerPs, compound, economy)

  const track = buildTrack(course, 2)
  const profile = buildGhostProfile(track, params)
  const state = createDriveState(params, 0, 0, 0)
  const ghost = createGhostDriver()

  const lapL = track.lapLengthM
  const timeoutS = 4 * modelLapS + 120
  let t = 0
  let prevStation = 0
  let tLapStart: number | null = null
  let driveLapS = Infinity
  let maxLateralM = 0

  while (t < timeoutS) {
    const input = ghostInput(ghost, state, track, profile, params, DRIVE_DT_S)
    const surface = surfaceAtLateral(track, ghost.lateralM)
    stepDrive(state, params, input, surface, DRIVE_DT_S)
    t += DRIVE_DT_S

    const station = ghost.stationM
    if (tLapStart != null) maxLateralM = Math.max(maxLateralM, Math.abs(ghost.lateralM))
    const crossed = (mark: number): number | null =>
      prevStation < mark && station >= mark
        ? t - DRIVE_DT_S + (DRIVE_DT_S * (mark - prevStation)) / Math.max(1e-6, station - prevStation)
        : null
    const startCross = crossed(lapL)
    if (startCross != null) tLapStart = startCross
    const endCross = crossed(2 * lapL)
    if (endCross != null && tLapStart != null) {
      driveLapS = endCross - tLapStart
      break
    }
    prevStation = station
  }

  return {
    driveLapS,
    modelLapS,
    ratio: driveLapS / modelLapS,
    maxLateralM,
    endStationM: ghost.stationM,
    endTimeS: t,
    endLateralM: ghost.lateralM,
  }
}
