/**
 * The drive step: a single rigid body on two slip-angle axles (the Marco
 * Monster lineage the spec names), integrated at a fixed 120 Hz. Pure TS,
 * deterministic, no rendering imports; the renderer consumes the published
 * state and nothing else.
 *
 * Body frame: x forward, y left, yaw positive anticlockwise. No reverse gear;
 * reverse is explicitly out of the first build's scope.
 *
 * What the model deliberately includes, because each is load-bearing for feel:
 *
 * - Longitudinal weight transfer through a first-order lag (the suspension
 *   surrogate). It feeds the friction circle, which is what makes lift-off
 *   tuck-in and brake rotation exist.
 * - One grip budget per axle, split between drive and cornering by the
 *   friction circle (`tyre.ts`). This is the whole of why FWD, RWD and AWD
 *   diverge.
 * - Braking on the car's own calibrated `brakeMu`, distributed by live axle
 *   load, so a full-pedal stop reproduces the measured deceleration exactly.
 * - Aero as a grip multiplier on lateral and braking force, through the same
 *   `aeroGripMultiplier` the lap model runs on.
 * - Assists that scale with the build (plan section 2): TC and ABS hold usage
 *   just inside the budget, a yaw damper leans the car toward its kinematic
 *   yaw rate, and countersteer help steers against body slip. All fade
 *   linearly to nothing as the assist level drops.
 */
import { aeroGripMultiplier } from '../performance'
import { DRIVE_CONFIG } from './config'
import { createGearboxState, stepGearbox, type GearboxState } from './gearbox'
import type { DriveParams } from './params'
import { axleForces } from './tyre'

export interface DriveInput {
  /** Steering, -1..1, positive left. */
  steer: number
  /** Throttle, 0..1. */
  throttle: number
  /** Brake, 0..1. */
  brake: number
  handbrake: boolean
  /** Assist level, 0 (raw) to 1 (full help). */
  assistLevel: number
}

/** What the ground under the car is worth, sampled by the caller (track or
 * surface mask); physics stays pure of geometry. */
export interface SurfaceSample {
  /** Grip multiplier: 1 on tarmac. */
  grip: number
  /** Extra rolling deceleration off the tarmac, m/s^2. */
  extraDragMs2: number
}

export const TARMAC: SurfaceSample = { grip: 1, extraDragMs2: 0 }

export interface DriveState {
  xM: number
  yM: number
  headingRad: number
  /** Body-frame velocity, m/s. */
  vLongMs: number
  vLatMs: number
  yawRateRadS: number
  /** Current road-wheel angle, rad. */
  steerRad: number
  gearbox: GearboxState
  /** Filtered longitudinal acceleration driving load transfer, m/s^2. */
  axFilterMs2: number
  /** Published telemetry. */
  speedMs: number
  rpm: number
  gear: number
  /** Per-axle lateral saturation; above 1 the axle is sliding. */
  frontSlip: number
  rearSlip: number
  /** Per-axle longitudinal budget usage, 0..1. */
  frontUsage: number
  rearUsage: number
  /** Body slip angle, rad. */
  bodySlipRad: number
}

export const DRIVE_DT_S = 1 / DRIVE_CONFIG.stepHz

export function createDriveState(params: DriveParams, x = 0, y = 0, heading = 0): DriveState {
  return {
    xM: x,
    yM: y,
    headingRad: heading,
    vLongMs: 0,
    vLatMs: 0,
    yawRateRadS: 0,
    steerRad: 0,
    gearbox: createGearboxState(params.gearbox),
    axFilterMs2: 0,
    speedMs: 0,
    rpm: params.gearbox.idleRpm,
    gear: 1,
    frontSlip: 0,
    rearSlip: 0,
    frontUsage: 0,
    rearUsage: 0,
    bodySlipRad: 0,
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Speed-sensitive steering lock: the kinematic angle that would ask for
 * `ayCapFactor` times the current lateral grip ceiling, PLUS an allowance of
 * the front tyre's own peak slip angle (the wheel must point past the path
 * to load the tyre at all), never more than the mechanical lock. At walking
 * pace this is simply full lock; at speed a pegged key means "peak grip plus
 * a slither", which is what makes digital input drivable. Exported because
 * the ghost divides its pursuit angle by it to recover a -1..1 steer input.
 */
export function steerLockFor(params: DriveParams, vLongMs: number, muLatBase: number): number {
  const cfg = DRIVE_CONFIG.steering
  const ayCap = cfg.ayCapFactor * muLatBase * params.gravity
  const vSq = Math.max(vLongMs, 1) ** 2
  const kinematic = Math.atan((ayCap * params.wheelbaseM) / vSq)
  const slipAllowance = cfg.slipAllowanceFactor * params.peakSlipPerMuFront * muLatBase
  return Math.min(params.steerLockRad, kinematic + slipAllowance)
}

/**
 * Advances the state by one fixed step. `dt` should be `DRIVE_DT_S`; it is a
 * parameter so tests can probe convergence.
 */
export function stepDrive(
  state: DriveState,
  params: DriveParams,
  input: DriveInput,
  surface: SurfaceSample,
  dt: number = DRIVE_DT_S,
): void {
  const cfg = DRIVE_CONFIG
  const { block } = params
  const g = params.gravity
  const m = block.m
  const A = clamp(input.assistLevel, 0, 1)
  const speedAbs = Math.hypot(state.vLongMs, state.vLatMs)
  const aeroMult = aeroGripMultiplier(speedAbs, block.downforceCoeff, params.aeroConfig)
  const muLatBase = block.mu * aeroMult * surface.grip

  // Steering: speed-sensitive lock so the wheel cannot ask for wildly more
  // lateral than grip can answer, a ramped slew for keyboard input, and the
  // countersteer assist folded into the target.
  const lock = steerLockFor(params, state.vLongMs, muLatBase)
  const beta = Math.atan2(state.vLatMs, Math.max(Math.abs(state.vLongMs), cfg.lowSpeed.slipFloorMs))
  const betaExcess = beta - clamp(beta, -cfg.assists.counterSteerDeadRad, cfg.assists.counterSteerDeadRad)
  let steerTarget = input.steer * lock + A * cfg.assists.counterSteerGain * betaExcess
  steerTarget = clamp(steerTarget, -params.steerLockRad, params.steerLockRad)
  const steering = Math.abs(steerTarget) >= Math.abs(state.steerRad)
  const slew = (steering ? cfg.steering.rateRadPerS : cfg.steering.returnRateRadPerS) * dt
  state.steerRad += clamp(steerTarget - state.steerRad, -slew, slew)
  const delta = state.steerRad

  // Axle loads with filtered longitudinal transfer.
  const transfer = (m * state.axFilterMs2 * params.cgHeightM) / params.wheelbaseM
  const loadFloor = 0.06 * m * g
  const fzF = Math.max(loadFloor, m * g * params.weightFront - transfer)
  const fzR = Math.max(loadFloor, m * g * (1 - params.weightFront) + transfer)

  // Drive force: calibrated effective power through the gearbox envelope,
  // capped at the calibrated launch-traction plateau. The plateau is a
  // measured whole-car figure, so it is not aero-assisted.
  const powerMult = stepGearbox(params.gearbox, state.gearbox, Math.max(0, state.vLongMs), input.throttle, dt)
  const powerN = (block.effectivePowerW * powerMult) / Math.max(state.vLongMs, 2.5)
  const driveTotal = input.throttle * Math.min(powerN, params.driveCapN) * surface.grip

  // Braking: the calibrated coefficient, aero-assisted as in the lap model,
  // split across the axles by live load but with the rear biased safely UNDER
  // ideal (as period cars were set up): an exactly-ideal rear is at its limit
  // with zero lateral budget, and every braked turn-in becomes a rear slide.
  const moving = state.vLongMs > 0.15
  const brakeTotal = moving ? input.brake * m * g * block.brakeMu * aeroMult * surface.grip : 0
  const loadShareF = fzF / (fzF + fzR)
  const rearShare = (1 - loadShareF) * cfg.brakes.rearBiasSafety
  const handbrakeN = input.handbrake && moving
    ? m * g * block.brakeMu * cfg.handbrake.rearForceFraction * surface.grip
    : 0

  // Per-axle longitudinal demands and grip coefficients. Drive traction uses
  // the mechanical coefficient; braking uses the car's own braking figure.
  let demandF = driveTotal * params.driveSplitFront - brakeTotal * (1 - rearShare)
  let demandR = driveTotal * (1 - params.driveSplitFront) - brakeTotal * rearShare - handbrakeN
  const muLongF = (demandF >= 0 ? block.mu : block.brakeMu * aeroMult) * surface.grip
  const muLongR = (demandR >= 0 ? block.mu : block.brakeMu * aeroMult) * surface.grip

  // TC and ABS: hold usage just inside the budget so the lateral half of the
  // circle survives. Both fade with the assist level.
  const tcFrac = 1 - A * (1 - cfg.assists.tcCap)
  const absFrac = 1 - A * (1 - cfg.assists.absCap)
  if (demandF > 0) demandF = Math.min(demandF, tcFrac * muLongF * fzF)
  else demandF = Math.max(demandF, -absFrac * muLongF * fzF)
  if (demandR > 0) demandR = Math.min(demandR, tcFrac * muLongR * fzR)
  else if (!input.handbrake) demandR = Math.max(demandR, -absFrac * muLongR * fzR)

  // Slip angles (yaw-rate term included) and tyre forces.
  const vxs = Math.max(Math.abs(state.vLongMs), cfg.lowSpeed.slipFloorMs)
  const alphaF = Math.atan2(state.vLatMs + params.aM * state.yawRateRadS, vxs) - delta
  const alphaR = Math.atan2(state.vLatMs - params.bM * state.yawRateRadS, vxs)
  const retain = cfg.tyre.slideRetain + A * cfg.assists.retainBonus
  const muLatR = muLatBase * (input.handbrake ? cfg.handbrake.rearGripCut : 1)
  const front = axleForces(alphaF, fzF, muLatBase, muLongF, demandF, params.peakSlipPerMuFront, retain)
  const rear = axleForces(alphaR, fzR, muLatR, muLongR, demandR, params.peakSlipPerMuRear, retain)

  // Low-speed blend: fade tyre lateral authority out below walking pace and
  // pull yaw toward the kinematic rate, so the slip-angle model never
  // squirms at a standstill.
  const blend = clamp(speedAbs / cfg.lowSpeed.blendBelowMs, 0, 1)
  const fLatF = front.fLat * blend
  const fLatR = rear.fLat * blend

  // Resistances.
  const dragN = 0.5 * params.airDensity * block.cdA * state.vLongMs * Math.abs(state.vLongMs)
  const rollFade = Math.min(1, speedAbs / 0.5)
  const rollN = params.rollingResistance * m * g * Math.sign(state.vLongMs) * rollFade
  const offRoadN = surface.extraDragMs2 * m * Math.sign(state.vLongMs) * rollFade

  // Body forces and yaw moment.
  const cosD = Math.cos(delta)
  const sinD = Math.sin(delta)
  const fx = front.fLong * cosD - fLatF * sinD + rear.fLong - dragN - rollN - offRoadN
  const fyFront = fLatF * cosD + front.fLong * sinD
  const fy = fyFront + fLatR
  let yawN = params.aM * fyFront - params.bM * fLatR

  // Stability assist: a one-sided yaw damper. It bleeds off yaw beyond the
  // grip-bounded kinematic rate but NEVER adds rotation: a cranked wheel at
  // hairpin speed asks for more kinematic yaw than the path has (the slip
  // allowance is in the angle), and a two-sided damper would spin the car up
  // to it.
  const rKin = (state.vLongMs * Math.tan(delta)) / params.wheelbaseM
  const rGripCap = (muLatBase * g) / Math.max(speedAbs, 1)
  const rBound = Math.min(Math.abs(rKin), 1.05 * rGripCap)
  const yawExcess =
    Math.sign(state.yawRateRadS) * Math.max(0, Math.abs(state.yawRateRadS) - rBound)
  yawN += -A * cfg.assists.yawDampPerS * params.izz * yawExcess * blend

  // Semi-implicit integration in the rotating body frame.
  const ax = fx / m + state.yawRateRadS * state.vLatMs
  const ay = fy / m - state.yawRateRadS * state.vLongMs
  state.vLongMs = Math.max(0, state.vLongMs + ax * dt)
  state.vLatMs += ay * dt
  state.yawRateRadS += (yawN / params.izz) * dt

  // Kinematic damping in the blend zone keeps the car settled when crawling.
  const settle = cfg.lowSpeed.dampPerS * (1 - blend) * dt
  state.vLatMs -= state.vLatMs * Math.min(1, settle)
  state.yawRateRadS += (rKin - state.yawRateRadS) * Math.min(1, settle)

  state.headingRad += state.yawRateRadS * dt
  const cosH = Math.cos(state.headingRad)
  const sinH = Math.sin(state.headingRad)
  state.xM += (state.vLongMs * cosH - state.vLatMs * sinH) * dt
  state.yM += (state.vLongMs * sinH + state.vLatMs * cosH) * dt

  // Load-transfer lag tracks force-derived longitudinal acceleration only
  // (the Coriolis term moves no weight).
  state.axFilterMs2 += ((fx / m) - state.axFilterMs2) * (dt / cfg.loadTransferTauS)

  // A full stop under brakes stays a full stop.
  if (!moving && input.brake > 0.2 && driveTotal < 1) {
    state.vLongMs = 0
    state.vLatMs = 0
    state.yawRateRadS *= 0.5
  }

  state.speedMs = Math.hypot(state.vLongMs, state.vLatMs)
  state.rpm = state.gearbox.rpm
  state.gear = state.gearbox.gear
  state.frontSlip = front.latSaturation
  state.rearSlip = rear.latSaturation
  state.frontUsage = front.longUsage
  state.rearUsage = rear.longUsage
  state.bodySlipRad = beta
}
