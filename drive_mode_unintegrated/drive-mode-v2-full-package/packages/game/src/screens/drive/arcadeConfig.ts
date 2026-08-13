/**
 * The endless mode's fixed configuration, lifted from the sim's
 * DRIVE_CONFIG values the register still uses. One place, one shape;
 * the tune (grip, slip, hold, assist, power) stays separate and
 * player-adjustable.
 */
import { DRIVE_CONFIG } from '@midnight-garage/sim'
import type { ArcadeConfig } from './arcadePhysics'

export const ARCADE_CONFIG: ArcadeConfig = {
  stepHz: DRIVE_CONFIG.stepHz,
  slipFloorMs: DRIVE_CONFIG.lowSpeed.slipFloorMs,
  blendBelowMs: DRIVE_CONFIG.lowSpeed.blendBelowMs,
  lowSpeedDampPerS: DRIVE_CONFIG.lowSpeed.dampPerS,
  counterSteerDeadRad: DRIVE_CONFIG.assists.counterSteerDeadRad,
  counterSteerGain: DRIVE_CONFIG.assists.counterSteerGain,
  tcCap: DRIVE_CONFIG.assists.tcCap,
  absCap: DRIVE_CONFIG.assists.absCap,
  yawDampPerS: DRIVE_CONFIG.assists.yawDampPerS,
  saturationPoint: DRIVE_CONFIG.tyre.saturationPoint,
  rearBiasSafety: DRIVE_CONFIG.brakes.rearBiasSafety,
  handbrakeRearForceFraction: DRIVE_CONFIG.handbrake.rearForceFraction,
  handbrakeRearGripCut: DRIVE_CONFIG.handbrake.rearGripCut,
  offRoadGrip: DRIVE_CONFIG.track.offRoadGrip,
  offRoadDragMs2: DRIVE_CONFIG.track.offRoadDragMs2,
  brakeSaturationRelief: 0.5,
}
