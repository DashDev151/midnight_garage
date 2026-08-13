/**
 * THE ARCADE REGISTER. The sim's full drive model (per-axle friction
 * circle, real gearbox, aero, load transfer, calibrated brakes) with the
 * feel lessons applied as causes, converged in the artifact loop:
 *  - the lateral curve rises to a rounded peak then HOLDS (no cliff)
 *  - a wide slip window, rear-first saturation on RWD, front on FWD
 *  - grip mapped up into the arcade range from the car's real mu
 *  - full steering authority at all speeds, prototype input slew
 *  - assists optional and default to a whisper
 *  - gearshifts soft-cut to 0.55, never to zero, so drifts survive
 *  - longitudinal tyre forces act along the BODY axis: never rotate
 *    them through arcade-sized steering angles or braking while
 *    steering yanks the nose the wrong way
 *
 * Everything here is pure and deterministic: one state object stepped at
 * a fixed 120 Hz by the caller.
 */
import type { DriveParams } from '@midnight-garage/sim'
import { aeroGripMultiplier } from '@midnight-garage/sim'

export const ARCADE_DT_S = 1 / 120

export interface ArcadeTune {
  /** Multiplier on the car's real mu into gameplay range. */
  grip: number
  /** Multiplier on the derived peak slip window. */
  slip: number
  /** Post-peak retained fraction; 1 is a perfect hold. */
  hold: number
  /** 0..1 assist level: TC, ABS, yaw damp, countersteer. */
  assist: number
  /** Multiplier on engine power. */
  power: number
}

/** The values the tuning loop converged on; the artifact's defaults. */
export const DEFAULT_TUNE: ArcadeTune = { grip: 1.7, slip: 2.3, hold: 0.985, assist: 0.1, power: 1.0 }

export interface ArcadeConfig {
  stepHz: number
  slipFloorMs: number
  blendBelowMs: number
  lowSpeedDampPerS: number
  counterSteerDeadRad: number
  counterSteerGain: number
  tcCap: number
  absCap: number
  yawDampPerS: number
  saturationPoint: number
  rearBiasSafety: number
  handbrakeRearForceFraction: number
  handbrakeRearGripCut: number
  offRoadGrip: number
  offRoadDragMs2: number
  /** Friction-circle coupling multiplier under braking (<1 keeps more
   * lateral grip while decelerating, the EBD-era behaviour). */
  brakeSaturationRelief: number
}

export interface ArcadeInput {
  /** -1 right .. 1 left, before slew. */
  steer: number
  throttle: number
  brake: number
  handbrake: boolean
  /** Engages the tiny reverse gear when near a standstill. */
  reverse?: boolean
}

/** The slider-sets-max-speed control law: cruise up to the target,
 * coast (with a light trim brake) when over it, and drive the small
 * reverse gear for negative targets. The dedicated brake overrides
 * all of this at the call site. Pure, so the mapping is testable. */
export function speedTargetControl(
  targetMs: number,
  vLongMs: number,
): { throttle: number; brake: number; reverse: boolean } {
  if (targetMs < -0.05) {
    if (vLongMs > 0.3) return { throttle: 0, brake: 0.6, reverse: false }
    return { throttle: Math.max(0, Math.min(1, (vLongMs - targetMs) / 1.2)), brake: 0, reverse: true }
  }
  const err = targetMs - vLongMs
  return {
    throttle: Math.max(0, Math.min(1, err / 5)),
    brake: err < -2.5 ? Math.min(0.35, (-err - 2.5) / 9) : 0,
    reverse: false,
  }
}

export interface ArcadeState {
  xM: number
  yM: number
  headingRad: number
  vLongMs: number
  vLatMs: number
  yawRadS: number
  steerNorm: number
  steerRad: number
  prevThrottle: number
  liftPulse: number
  gear: number
  gearCutS: number
  gearHeldS: number
  rpm: number
  axFilteredMs2: number
  speedMs: number
  latSatFront: number
  latSatRear: number
  sliding: boolean
}

export interface ArcadeCar {
  params: DriveParams
  /** mu and brakeMu after the arcade grip mapping. */
  mu: number
  brakeMu: number
  peakSlipPerMuFront: number
  peakSlipPerMuRear: number
}

/** Applies the tune's register mapping to a car's real derived params. */
export function arcadeCarFor(params: DriveParams, tune: ArcadeTune): ArcadeCar {
  const frontBias = params.drivetrain === 'FWD' ? 0.88 : 1
  const rearBias = params.drivetrain === 'RWD' ? 0.88 : 1
  return {
    params,
    mu: params.block.mu * tune.grip,
    brakeMu: params.block.brakeMu * Math.min(1.35, 0.6 + tune.grip * 0.45),
    peakSlipPerMuFront: (params.peakSlipPerMuFront * tune.slip * frontBias) / tune.grip,
    peakSlipPerMuRear: (params.peakSlipPerMuRear * tune.slip * rearBias) / tune.grip,
  }
}

export function createArcadeState(params: DriveParams): ArcadeState {
  return {
    xM: 0,
    yM: 0,
    headingRad: 0,
    vLongMs: 0,
    vLatMs: 0,
    yawRadS: 0,
    steerNorm: 0,
    steerRad: 0,
    prevThrottle: 0,
    liftPulse: 0,
    gear: 1,
    gearCutS: 0,
    gearHeldS: params.gearbox.minGearHoldS,
    rpm: params.gearbox.idleRpm,
    axFilteredMs2: 0,
    speedMs: 0,
    latSatFront: 0,
    latSatRear: 0,
    sliding: false,
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** Rise to a rounded peak, then hold at `retain`. */
export function lateralCurve(x: number, retain: number): number {
  const ax = Math.abs(x)
  const s = Math.sign(x)
  if (ax <= 1) return s * ax * (2 - ax)
  return s * (1 - (1 - retain) * Math.min(1, (ax - 1) / 0.6))
}

interface AxleOut {
  fLong: number
  fLat: number
  latSat: number
}

function axleForces(
  cfg: ArcadeConfig,
  alpha: number,
  loadN: number,
  muLat: number,
  muLong: number,
  demand: number,
  peakSlipPerMu: number,
  retain: number,
  brakeReliefMul = 1,
): AxleOut {
  const longCap = Math.max(1, muLong * loadN)
  const longUsage = Math.min(1, Math.abs(demand) / longCap)
  const fLong = Math.sign(demand) * longUsage * longCap
  const satP = cfg.saturationPoint * (demand < 0 ? brakeReliefMul : 1)
  const latScale = Math.sqrt(Math.max(0.003, 1 - longUsage * longUsage * satP))
  const muLatEff = muLat * latScale
  const alphaPeak = Math.max(0.02, peakSlipPerMu * muLatEff)
  const x = alpha / alphaPeak
  return { fLong, fLat: -lateralCurve(x, retain) * muLatEff * loadN, latSat: Math.abs(x) }
}

function envelopeAt(envelope: readonly number[], f: number): number {
  const n = envelope.length
  const x = clamp(f, 0, 1) * (n - 1)
  const i = Math.min(n - 2, Math.floor(x))
  const t = x - i
  return envelope[i]! * (1 - t) + envelope[i + 1]! * t
}

function stepGearbox(state: ArcadeState, params: DriveParams, throttle: number, dt: number): number {
  const box = params.gearbox
  const v = Math.max(0, state.vLongMs)
  state.gearHeldS += dt
  state.gearCutS = Math.max(0, state.gearCutS - dt)
  const frac = (gear: number): number => Math.min(1.02, Math.max(0, v / box.redlineSpeeds[gear - 1]!))
  let f = frac(state.gear)
  if (state.gearHeldS >= box.minGearHoldS) {
    if (f >= box.shiftUpAtF && state.gear < box.gearCount) {
      state.gear += 1
      state.gearCutS = box.shiftCutS
      state.gearHeldS = 0
    } else if (f <= box.shiftDownAtF && state.gear > 1 && frac(state.gear - 1) < box.shiftUpAtF) {
      state.gear -= 1
      state.gearCutS = throttle > 0.1 ? box.shiftCutS : 0
      state.gearHeldS = 0
    }
    f = frac(state.gear)
  }
  state.rpm = Math.max(box.idleRpm, f * box.redlineRpm)
  const env = v < box.clutchBelowMs ? 1 : envelopeAt(box.envelope, f)
  // The soft cut: a shift never kills a drift.
  return state.gearCutS > 0 ? env * 0.55 : env
}

export function stepArcade(
  state: ArcadeState,
  car: ArcadeCar,
  cfg: ArcadeConfig,
  tune: ArcadeTune,
  input: ArcadeInput,
  surfaceGrip: number,
  surfaceDragMs2: number,
  gradePerM: number,
  dt: number,
  latGradePerM = 0,
): void {
  const P = car.params
  const g = P.gravity
  const m = P.block.m
  const A = clamp(tune.assist, 0, 1)
  const speed = Math.hypot(state.vLongMs, state.vLatMs)
  // Downforce raises grip with speed exactly as the sim and the
  // artifact do: only cars with real aero (the R32) feel it.
  const aeroMult = aeroGripMultiplier(speed, P.block.downforceCoeff, P.aeroConfig)
  const mu = car.mu * aeroMult * surfaceGrip

  // Steering with hands, not a solenoid. Two changes over the old
  // 3.4/s symmetric slew:
  //  1) ASYMMETRY: winding lock ON is slow (full travel ~0.5 s), so
  //     turn-in builds; coming back to centre is quick (~0.22 s), so
  //     corrections feel immediate.
  //  2) SPEED-SENSITIVE LOCK: the usable steering angle shrinks with
  //     speed (full at walking pace, ~57 % at 80 km/h, ~31 % at
  //     150), which is what real steering feels like through the
  //     tyres and what kills the twitch. The counter-steer assist
  //     term is NOT scaled: stability keeps its authority.
  const lock = Math.min(P.steerLockRad, 0.6)
  const speedScale = 1 / (1 + Math.pow(speed / 22, 1.7) * 0.75)
  const t0 = clamp(input.steer, -1, 1)
  const movingOut = Math.abs(t0) > Math.abs(state.steerNorm) && Math.sign(t0 || state.steerNorm) === Math.sign(state.steerNorm || t0)
  const rate = (movingOut ? 2.0 : 4.5) * dt
  if (t0 > state.steerNorm) state.steerNorm = Math.min(state.steerNorm + rate, t0)
  else if (t0 < state.steerNorm) state.steerNorm = Math.max(state.steerNorm - rate, t0)
  if (t0 === 0) {
    if (state.steerNorm > 0) state.steerNorm = Math.max(0, state.steerNorm - rate)
    else if (state.steerNorm < 0) state.steerNorm = Math.min(0, state.steerNorm + rate)
  }
  const beta = Math.atan2(state.vLatMs, Math.max(Math.abs(state.vLongMs), cfg.slipFloorMs))
  const betaEx = beta - clamp(beta, -cfg.counterSteerDeadRad, cfg.counterSteerDeadRad)
  state.steerRad = clamp(state.steerNorm * lock * speedScale + A * cfg.counterSteerGain * betaEx, -0.62, 0.62)
  const delta = state.steerRad

  const transfer = (m * state.axFilteredMs2 * P.cgHeightM) / P.wheelbaseM
  const floor = 0.06 * m * g
  const fzF = Math.max(floor, m * g * P.weightFront - transfer)
  const fzR = Math.max(floor, m * g * (1 - P.weightFront) + transfer)

  const mult = stepGearbox(state, P, input.throttle, dt)
  const powerN = (P.block.effectivePowerW * tune.power * mult) / Math.max(state.vLongMs, 2.5)
  const revActive = !!input.reverse && state.vLongMs <= 0.25
  const driveTotal =
    input.throttle * Math.min(powerN, P.driveCapN * Math.max(1, tune.grip * 0.7)) * surfaceGrip
  // The tiny reverse gear: a fraction of the drive cap, backwards.
  const effDrive = revActive ? -input.throttle * 0.3 * P.driveCapN * surfaceGrip : driveTotal

  const moving = Math.abs(state.vLongMs) > 0.15
  const bs = state.vLongMs < 0 ? -1 : 1
  const brakeTotal = moving ? input.brake * m * g * car.brakeMu * aeroMult * surfaceGrip : 0
  const loadShareF = fzF / (fzF + fzR)
  const rearShare = (1 - loadShareF) * cfg.rearBiasSafety
  const hbN = input.handbrake && moving ? m * g * car.brakeMu * cfg.handbrakeRearForceFraction * surfaceGrip : 0

  // Engine braking: near-closed throttle drags the DRIVEN axle. This
  // is what makes a lift do something: weight moves forward and the
  // driven wheels give up some of their circle. Steady part-throttle
  // stays clean via the 0.35 threshold.
  const engBF = Math.max(0, 0.35 - input.throttle) / 0.35
  // MSR (engine drag torque control): engine braking yields as the
  // driven axle starts to slip, and hands over to the wheel brakes
  // as pedal pressure rises. Without this, engine drag stacks on the
  // rear under trail braking and quietly undoes the EBD.
  const msr = (1 - 0.7 * Math.min(1, state.latSatRear)) * (1 - 0.5 * input.brake)
  const engB = engBF * msr * 0.22 * P.driveCapN * Math.min(1, Math.max(0, state.vLongMs - 1.5) / 8) * surfaceGrip
  // ATTESA-style AWD: torque migrates forward as the rear slips, so
  // power-on corners stay planted instead of sliding wide.
  let splitF = P.driveSplitFront
  if (P.drivetrain === 'AWD') splitF = Math.min(0.68, splitF + 0.5 * Math.min(1, state.latSatRear))
  // EBD: yield rear braking as rear slip develops, so the rear axle
  // keeps its sideways grip instead of snapping loose.
  const ebd = 1 - 0.62 * Math.min(1, state.latSatRear)
  let dF = effDrive * splitF - engB * splitF - brakeTotal * bs * (1 - rearShare)
  let dR = effDrive * (1 - splitF) - engB * (1 - splitF) - brakeTotal * bs * rearShare * ebd - hbN
  const muF = (dF >= 0 ? car.mu : car.brakeMu * aeroMult) * surfaceGrip
  const muR = (dR >= 0 ? car.mu : car.brakeMu * aeroMult) * surfaceGrip
  const tc = 1 - A * (1 - cfg.tcCap)
  const ab = 1 - A * (1 - cfg.absCap)
  // ABS is ALWAYS ON, like every car since the nineties: brake demand
  // never consumes the whole circle, so the front keeps steering
  // authority under a fully held (binary keyboard) brake. Total force
  // still never exceeds mu x Fz: the grip model is intact.
  const absF = Math.min(ab, 0.86)
  const absR = Math.min(ab, 0.92)
  if (dF > 0) dF = Math.min(dF, tc * muF * fzF)
  else dF = Math.max(dF, -absF * muF * fzF)
  if (dR > 0) dR = Math.min(dR, tc * muR * fzR)
  else if (!input.handbrake) dR = Math.max(dR, -absR * muR * fzR)

  const vxs = Math.max(Math.abs(state.vLongMs), cfg.slipFloorMs)
  const aF = Math.atan2(state.vLatMs + P.aM * state.yawRadS, vxs) - delta
  const aR = Math.atan2(state.vLatMs - P.bM * state.yawRadS, vxs)
  const muLatR = mu * (input.handbrake ? cfg.handbrakeRearGripCut : 1)
  // Brake relief is REAR-ONLY: the front circle saturates under hard
  // braking exactly like a real car (stabilising understeer), while
  // the rear keeps its sideways grip.
  const F = axleForces(cfg, aF, fzF, mu, muF, dF, car.peakSlipPerMuFront, tune.hold, 1)
  // FWD lift-off oversteer, done as a TRANSIENT this time. The old
  // version keyed on deceleration itself, so at speed mere drag kept
  // the rear permanently narrowed and every fast corner became
  // oversteer. Now: an actual throttle LIFT arms a pulse that decays
  // over ~0.7 s, and it only bites in proportion to how hard the car
  // is cornering. Steady-state FWD is an understeerer, as it should
  // be; the lift gives it the classic rotation nudge, then it is
  // done.
  if (P.drivetrain === 'FWD') {
    if (state.prevThrottle > 0.5 && input.throttle < 0.15) state.liftPulse = 1
    state.liftPulse = Math.max(0, state.liftPulse - dt / 0.7)
  } else {
    state.liftPulse = 0
  }
  state.prevThrottle = input.throttle
  let peakR = car.peakSlipPerMuRear
  if (P.drivetrain === 'FWD' && input.brake < 0.25 && state.liftPulse > 0) {
    const latDemandN = Math.min(1, Math.abs(state.vLatMs * state.yawRadS) / 4 + Math.abs(state.steerRad) / 0.4)
    peakR *= 1 - 0.3 * state.liftPulse * Math.min(1, latDemandN)
  }
  const R = axleForces(cfg, aR, fzR, muLatR, muR, dR, peakR, tune.hold, cfg.brakeSaturationRelief)

  const blend = clamp(speed / cfg.blendBelowMs, 0, 1)
  const fLatF = F.fLat * blend
  const fLatR = R.fLat * blend
  const drag = 0.5 * P.airDensity * P.block.cdA * state.vLongMs * Math.abs(state.vLongMs)
  const rollFade = Math.min(1, speed / 0.5)
  const roll = P.rollingResistance * m * g * Math.sign(state.vLongMs) * rollFade
  const off = surfaceDragMs2 * m * Math.sign(state.vLongMs) * rollFade

  // Body-axis longitudinal; lateral through cos(delta) only.
  const cD = Math.cos(delta)
  const fx = F.fLong + R.fLong - drag - roll - off - m * g * gradePerM
  const fyF = fLatF * cD
  let yawN = P.aM * fyF - P.bM * fLatR
  const rKin = (state.vLongMs * Math.tan(delta)) / P.wheelbaseM
  const rCap = (mu * g) / Math.max(speed, 1)
  const rBound = Math.min(Math.abs(rKin), 1.05 * rCap)
  yawN +=
    -A *
    cfg.yawDampPerS *
    P.izz *
    (Math.sign(state.yawRadS) * Math.max(0, Math.abs(state.yawRadS) - rBound)) *
    blend
  // ESC under braking: brake-scaled yaw governance, the same
  // intervention every modern stability system makes. Only yaw IN
  // EXCESS of the steered rate is damped, so trail rotation the
  // driver asks for survives; the snap beyond it does not.
  const escX = Math.sign(state.yawRadS) * Math.max(0, Math.abs(state.yawRadS) - 1.15 * Math.abs(rKin) - 0.12)
  yawN += -input.brake * 3.1 * P.izz * escX * blend

  const ax = fx / m + state.yawRadS * state.vLatMs
  const ay = (fyF + fLatR) / m - state.yawRadS * state.vLongMs
  state.vLongMs = Math.max(revActive ? -3.6 : 0, state.vLongMs + ax * dt)
  // Gravity pulls down the cross-slope: a car parked on a bank drifts.
  state.vLatMs += (ay - g * latGradePerM) * dt
  state.yawRadS += (yawN / P.izz) * dt

  const settle = cfg.lowSpeedDampPerS * (1 - blend) * dt
  state.vLatMs -= state.vLatMs * Math.min(1, settle)
  state.yawRadS += (rKin - state.yawRadS) * Math.min(1, settle)

  state.headingRad += state.yawRadS * dt
  const cH = Math.cos(state.headingRad)
  const sH = Math.sin(state.headingRad)
  state.xM += (state.vLongMs * cH - state.vLatMs * sH) * dt
  state.yM += (state.vLongMs * sH + state.vLatMs * cH) * dt
  state.axFilteredMs2 += (fx / m - state.axFilteredMs2) * (dt / 0.045)
  // Keyed on TOTAL speed: a sideways slide bleeds out through the
  // tyres instead of hitting a wall when vLong alone crosses zero.
  if (state.speedMs < 0.35 && input.brake > 0.2 && Math.abs(effDrive) < 1) {
    state.vLongMs = 0
    state.vLatMs = 0
    state.yawRadS *= 0.5
  }
  state.speedMs = Math.hypot(state.vLongMs, state.vLatMs)
  state.latSatFront = F.latSat
  state.latSatRear = R.latSat
  state.sliding = (F.latSat > 1 || R.latSat > 1) && state.speedMs > 3
}
