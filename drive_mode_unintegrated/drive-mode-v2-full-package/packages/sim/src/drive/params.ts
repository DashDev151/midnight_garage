/**
 * Assembles everything the drive step reads about one car, once. The physical
 * half comes straight from `carBlock()` (there is one assembly of a car's
 * physics and this is it, per the plan section 1b); the handling half (yaw
 * inertia, weight split, CG height, steering, drive split) is DERIVED from
 * spec geometry the model already carries, with layout-typical fallbacks,
 * rather than hand-authored per car. Directive 24 is satisfied by
 * construction: every roster car gets a value the moment it has a spec.
 */
import type { CarModel, EconomyConfig } from '@midnight-garage/content'
import {
  drivetrainOf,
  enginePositionOf,
  vTopOf,
  type CarBlock,
  type Drivetrain,
} from '../performance'
import { DRIVE_CONFIG } from './config'
import { buildGearbox, type Gearbox } from './gearbox'

export interface DriveParams {
  block: CarBlock
  drivetrain: Drivetrain
  /** Wheelbase, m. */
  wheelbaseM: number
  /** CG to front axle, m (`a` in bicycle-model terms). */
  aM: number
  /** CG to rear axle, m (`b`). */
  bM: number
  /** CG height, m. */
  cgHeightM: number
  /** Static front weight fraction. */
  weightFront: number
  /** Yaw inertia, kg m^2. */
  izz: number
  /** Peak slip angle per unit of grip coefficient, rad, per axle. */
  peakSlipPerMuFront: number
  peakSlipPerMuRear: number
  /** Fraction of drive force sent to the front axle. */
  driveSplitFront: number
  /** Total drive-traction plateau, N (the calibrated launch limit). */
  driveCapN: number
  steerLockRad: number
  gearbox: Gearbox
  /** Terminal speed, m/s, from the performance model's own solver. */
  vMaxMs: number
  /** Constants the step reads every frame, lifted from the economy content so
   * drive mode and the lap model can never disagree about the air. */
  gravity: number
  airDensity: number
  rollingResistance: number
  aeroConfig: EconomyConfig['statFormulas']['aero']
  paceConfig: EconomyConfig['statFormulas']['pace']
}

/** Static front weight fraction: the spec's own figure when it states one,
 * otherwise a layout-typical value from drivetrain and engine position. */
function weightFrontOf(model: CarModel, drivetrain: Drivetrain): number {
  if (model.spec.weightDistributionFront != null) {
    return model.spec.weightDistributionFront / 100
  }
  const byLayout = DRIVE_CONFIG.geometry.weightFrontByLayout
  if (drivetrain === 'FWD') return byLayout.FF
  if (drivetrain === 'AWD') return byLayout.AWD
  const pos = enginePositionOf(model)
  if (pos === 'mid') return byLayout.MR
  if (pos === 'rear') return byLayout.RR
  return byLayout.FR
}

/**
 * Builds a car's drive parameters. `block` must come from `carBlock()` at the
 * car's current power, compound, condition and build; this function adds only
 * what the point-mass model genuinely cannot supply.
 */
export function driveParamsFor(
  model: CarModel,
  block: CarBlock,
  economy: EconomyConfig,
): DriveParams {
  const geo = DRIVE_CONFIG.geometry
  const pace = economy.statFormulas.pace
  const drivetrain = drivetrainOf(model)

  const wheelbaseM = (model.spec.wheelbaseMm ?? geo.wheelbaseFallbackMm) / 1000
  const weightFront = weightFrontOf(model, drivetrain)
  const cgHeightM =
    (model.spec.comHeightMm ??
      geo.comHeightFraction * (model.spec.heightMm ?? geo.heightFallbackMm)) / 1000

  const izz =
    block.m *
    wheelbaseM *
    wheelbaseM *
    geo.yawInertiaK *
    geo.yawInertiaByEngine[enginePositionOf(model)]

  const tyre = DRIVE_CONFIG.tyre
  const perMu = tyre.peakSlipBaseRad / tyre.referenceMu
  const vMaxMs = vTopOf(block, model, pace)

  return {
    block,
    drivetrain,
    wheelbaseM,
    aM: wheelbaseM * (1 - weightFront),
    bM: wheelbaseM * weightFront,
    cgHeightM,
    weightFront,
    izz,
    peakSlipPerMuFront: perMu * tyre.peakSlipBalanceFront,
    peakSlipPerMuRear: perMu * tyre.peakSlipBalanceRear,
    driveSplitFront: DRIVE_CONFIG.driveSplitFront[drivetrain],
    driveCapN: block.m * block.launchAccel,
    steerLockRad: DRIVE_CONFIG.steering.lockRad,
    gearbox: buildGearbox(model, vMaxMs),
    vMaxMs,
    gravity: pace.gravity,
    airDensity: pace.airDensity,
    rollingResistance: pace.rollingResistance,
    aeroConfig: economy.statFormulas.aero,
    paceConfig: pace,
  }
}
