/**
 * The synthetic gearbox. The performance model carries no torque curve and no
 * ratios (plan section 1c), and its `effectivePowerW` is BY DEFINITION the
 * mean through-the-gears wheel power, already calibrated against measured
 * acceleration. So the gearbox here is presentation-layer physics: an rpm
 * needle, shift points, a power envelope that breathes as the revs sweep, and
 * a shift cut, with the envelope NORMALISED so its mean over a gear sweep is
 * exactly 1. Net acceleration therefore still integrates to the calibrated
 * figure and the lap-time acceptance test stays honest.
 *
 * `redlineRpm` from the spec sets the dial's scale only; where it is display
 * data, this is display usage. Nothing here invents a torque curve.
 */
import type { CarModel } from '@midnight-garage/content'
import { DRIVE_CONFIG } from './config'

export interface Gearbox {
  gearCount: number
  /** Road speed (m/s) at redline in each gear, index 0 = first. */
  redlineSpeeds: readonly number[]
  redlineRpm: number
  idleRpm: number
  /** Envelope samples over rpm fraction 0..1 (65 points), mean-1 normalised
   * over the top-gear-sweep window. */
  envelope: readonly number[]
  shiftUpAtF: number
  shiftDownAtF: number
  shiftCutS: number
  minGearHoldS: number
  clutchBelowMs: number
}

export interface GearboxState {
  gear: number
  /** Seconds of shift torque cut remaining. */
  cutS: number
  /** Seconds the current gear has been held. */
  heldS: number
  rpm: number
}

export function createGearboxState(box: Gearbox): GearboxState {
  return { gear: 1, cutS: 0, heldS: box.minGearHoldS, rpm: box.idleRpm }
}

function isRotary(model: CarModel): boolean {
  return model.spec.engineConfig === 'rotary-2' || model.spec.engineConfig === 'rotary-3'
}

function redlineOf(model: CarModel): number {
  const cfg = DRIVE_CONFIG.gearbox
  if (model.spec.redlineRpm) return model.spec.redlineRpm
  if (isRotary(model)) return cfg.redlineFallback.rotary
  return model.spec.aspiration === 'NA' ? cfg.redlineFallback.na : cfg.redlineFallback.turbo
}

const ENVELOPE_SAMPLES = 65

/**
 * Builds a car's gearbox from its terminal speed. Ratios are geometric between
 * a short first gear and a top gear that runs out just past `vMaxMs`, which is
 * how period five-speeds were actually stacked.
 */
export function buildGearbox(model: CarModel, vMaxMs: number): Gearbox {
  const cfg = DRIVE_CONFIG.gearbox
  const first = Math.min(
    cfg.firstGearMaxMs,
    Math.max(cfg.firstGearMinMs, vMaxMs * cfg.firstGearTopFraction),
  )
  const top = vMaxMs * cfg.topGearOverrun
  const n = cfg.gearCount
  const redlineSpeeds: number[] = []
  for (let i = 0; i < n; i++) {
    redlineSpeeds.push(first * Math.pow(top / first, i / (n - 1)))
  }

  const shape = model.spec.aspiration === 'NA' ? cfg.envelope.na : cfg.envelope.turbo
  const raw = (f: number): number => {
    const t = Math.min(1, Math.max(0, (f - shape.rampStart) / (shape.rampEnd - shape.rampStart)))
    return shape.low + (1 - shape.low) * Math.pow(t, shape.shape)
  }
  // Normalise to mean 1 over the sweep a gear actually covers (from the rev
  // drop after an upshift to the redline), so the calibrated mean power holds.
  const sweepFrom = redlineSpeeds[n - 2]! / redlineSpeeds[n - 1]!
  let sum = 0
  const meanSamples = 200
  for (let i = 0; i < meanSamples; i++) {
    sum += raw(sweepFrom + ((i + 0.5) / meanSamples) * (1 - sweepFrom))
  }
  const norm = meanSamples / sum
  const envelope: number[] = []
  for (let i = 0; i < ENVELOPE_SAMPLES; i++) {
    envelope.push(raw(i / (ENVELOPE_SAMPLES - 1)) * norm)
  }

  return {
    gearCount: n,
    redlineSpeeds,
    redlineRpm: redlineOf(model),
    idleRpm: cfg.idleRpm,
    envelope,
    shiftUpAtF: cfg.shiftUpAtF,
    shiftDownAtF: cfg.shiftDownAtF,
    shiftCutS: cfg.shiftCutS,
    minGearHoldS: cfg.minGearHoldS,
    clutchBelowMs: cfg.clutchBelowMs,
  }
}

export function envelopeAt(box: Gearbox, f: number): number {
  const x = Math.min(1, Math.max(0, f)) * (ENVELOPE_SAMPLES - 1)
  const i = Math.min(ENVELOPE_SAMPLES - 2, Math.floor(x))
  const t = x - i
  return box.envelope[i]! * (1 - t) + box.envelope[i + 1]! * t
}

/** Rpm fraction (0..1 of redline) for a road speed in a gear. */
function rpmFraction(box: Gearbox, gear: number, speedMs: number): number {
  return Math.min(1.02, Math.max(0, speedMs / box.redlineSpeeds[gear - 1]!))
}

/**
 * Advances gear state and returns the power multiplier for this step. Auto
 * shifts with hysteresis and a hold time so it never hunts; a shift cuts
 * drive for `shiftCutS`. Below the clutch speed the multiplier is 1 (a
 * slipping clutch delivers whatever the launch-traction plateau can use).
 */
export function stepGearbox(
  box: Gearbox,
  gb: GearboxState,
  speedMs: number,
  throttle: number,
  dt: number,
): number {
  gb.heldS += dt
  gb.cutS = Math.max(0, gb.cutS - dt)

  let f = rpmFraction(box, gb.gear, speedMs)
  if (gb.heldS >= box.minGearHoldS) {
    if (f >= box.shiftUpAtF && gb.gear < box.gearCount) {
      gb.gear += 1
      gb.cutS = box.shiftCutS
      gb.heldS = 0
    } else if (f <= box.shiftDownAtF && gb.gear > 1) {
      const fDown = rpmFraction(box, gb.gear - 1, speedMs)
      if (fDown < box.shiftUpAtF) {
        gb.gear -= 1
        gb.cutS = throttle > 0.1 ? box.shiftCutS : 0
        gb.heldS = 0
      }
    }
    f = rpmFraction(box, gb.gear, speedMs)
  }

  gb.rpm = Math.max(box.idleRpm, f * box.redlineRpm)

  if (gb.cutS > 0) return 0
  if (speedMs < box.clutchBelowMs) return 1
  return envelopeAt(box, f)
}
