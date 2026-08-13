/** Drive mode: the real-time handling model. Pure TS, no rendering imports;
 * the game consumes `DriveState` telemetry and renders it however it likes. */
export { DRIVE_CONFIG, type DriveConfig } from './config'
export { buildGearbox, envelopeAt, type Gearbox, type GearboxState } from './gearbox'
export { driveParamsFor, type DriveParams } from './params'
export {
  createDriveState,
  DRIVE_DT_S,
  steerLockFor,
  stepDrive,
  TARMAC,
  type DriveInput,
  type DriveState,
  type SurfaceSample,
} from './physics'
export {
  buildTrack,
  locateOnTrack,
  pointAtStation,
  surfaceAtLateral,
  wrapPose,
  type Track,
  type TrackFix,
  type TrackSample,
} from './track'
export { driveParamsForInstance, driveSetupFor, type DriveSetup } from './instance'
export {
  buildGhostProfile,
  createGhostDriver,
  ghostInput,
  runGhostLap,
  type GhostDriver,
  type GhostProfile,
  type GhostRunResult,
} from './ghost'
