/**
 * The per-axle tyre model: a brush-style lateral curve inside a friction
 * circle. This is the drive mode's headline mechanism (spec section 6): one
 * grip budget per axle, shared between longitudinal and lateral force, which
 * is the whole reason FWD, RWD and AWD feel different.
 *
 * Two deliberate improvements over the spec's hard clamp:
 *
 * - The lateral curve is progressive: linear rise, rounded peak, then a
 *   gentle falloff to a retained plateau. Breakaway telegraphs itself and a
 *   slide is catchable rather than binary.
 * - Peak slip angle scales with the grip coefficient, so a stickier compound
 *   widens the window before letting go. The plan's "a better build is more
 *   forgiving, not just faster" (section 2) falls out of the physics instead
 *   of being scripted.
 */
import { DRIVE_CONFIG } from './config'

export interface AxleForces {
  /** Longitudinal force actually delivered, N (positive = drive). */
  fLong: number
  /** Lateral force actually delivered, N (positive = left, ISO body frame). */
  fLat: number
  /** Longitudinal budget usage 0..1; at 1 the tyre is spinning or locked. */
  longUsage: number
  /** Lateral saturation: slip angle over peak slip. Above 1 the axle slides. */
  latSaturation: number
}

/**
 * Normalised lateral force for a slip ratio `x = alpha / alphaPeak`:
 * a parabola to the peak, then a linear falloff to the retained plateau.
 * Odd in `x`; C1 everywhere except the peak, which is deliberate: the crest
 * is where the driver should feel the edge.
 */
export function lateralCurve(x: number, retain: number): number {
  const cfg = DRIVE_CONFIG.tyre
  const ax = Math.abs(x)
  const s = Math.sign(x)
  if (ax <= 1) return s * ax * (2 - ax)
  const fall = Math.min(1, (ax - 1) / cfg.falloffWidth)
  return s * (1 - (1 - retain) * fall)
}

/**
 * Forces one axle delivers this step.
 *
 * @param slipAngleRad axle slip angle
 * @param loadN vertical load on the axle (weight transfer already applied)
 * @param muLat lateral grip coefficient in force at this axle, aero included
 * @param muLong longitudinal coefficient (drive grip when driving, the
 *   calibrated braking coefficient when braking)
 * @param fLongDemand longitudinal force asked of the axle, N
 * @param peakSlipPerMu peak slip angle per unit of grip coefficient, rad
 * @param retain post-peak retained fraction (assists widen this)
 */
export function axleForces(
  slipAngleRad: number,
  loadN: number,
  muLat: number,
  muLong: number,
  fLongDemand: number,
  peakSlipPerMu: number,
  retain: number,
): AxleForces {
  const cfg = DRIVE_CONFIG.tyre
  const longCap = Math.max(1, muLong * loadN)
  const longUsage = Math.min(1, Math.abs(fLongDemand) / longCap)
  const fLong = Math.sign(fLongDemand) * longUsage * longCap

  // The circle: longitudinal usage eats the lateral budget. At full usage a
  // saturated driven or locked tyre keeps a sliver of lateral authority so a
  // powerslide steers rather than becoming a puck.
  const latScale = Math.sqrt(Math.max(0.003, 1 - longUsage * longUsage * cfg.saturationPoint))
  const muLatEff = muLat * latScale
  const alphaPeak = Math.max(0.02, peakSlipPerMu * muLatEff)
  const x = slipAngleRad / alphaPeak
  // The tyre force on the car OPPOSES the slip: a wheel sliding left is pushed
  // right. The sign convention lives here and nowhere else.
  const fLat = -lateralCurve(x, retain) * muLatEff * loadN

  return { fLong, fLat, longUsage, latSaturation: Math.abs(x) }
}
