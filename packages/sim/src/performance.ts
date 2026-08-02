import {
  layoutTagOf,
  type CarInstance,
  type CarModel,
  type Course,
  type EconomyConfig,
  type Part,
  type PhysicalDial,
  type TyreCompound,
} from '@midnight-garage/content'

/**
 * How much of each physical dial a car's parts still deliver, 1.0 being a car
 * in good order. The measured figures every formula below is built on describe
 * a stock car in good order, so this is the one place condition enters the
 * physics, and every dial is exactly 1.0 at mint.
 *
 * `derivedStats.ts` computes these from the taxonomy's `physicalWeights`; this
 * file only spends them.
 */
export type ConditionFactors = Readonly<Record<PhysicalDial, number>>

/** A car whose every physical dial is in good order - the neutral element, and
 * what a caller that has no condition to state gets. */
export const MINT_CONDITION_FACTORS: ConditionFactors = {
  grip: 1,
  braking: 1,
  driveline: 1,
  aero: 1,
}

/**
 * What the parts a car is BUILT from do to the same physics, as multipliers of
 * its stock figure. The counterpart of `ConditionFactors`: that says how much
 * of a dial the car's parts still deliver, this says how much the fitted grade
 * delivers in the first place, and the two multiply.
 *
 * `derivedStats.ts` assembles these from each installed SKU's
 * `physicalModifiers`; this file only spends them. Power and downforce are
 * absent for the same reason they are absent from the content schema: each
 * already reaches the model by exactly one other path.
 */
export interface BuildFactors {
  /** Mechanical grip, before the compound the tyres supply. */
  grip: number
  /** The braking coefficient, on top of the rubber. */
  braking: number
  /** The fraction of kerb weight the build carries. */
  mass: number
}

/** A car built entirely from stock parts - the neutral element, and what a
 * caller with no build to state gets. */
export const STOCK_BUILD_FACTORS: BuildFactors = { grip: 1, braking: 1, mass: 1 }

/** The handling model's content block - every grip, balance, and display-curve
 * constant. */
type GripConfig = EconomyConfig['statFormulas']['grip']

/** The pace/lap model's content block - every physics constant of the
 * quasi-static point-mass sim, the direction-change term, the geometric
 * corner-grip ceiling, and the no-measurement fallback regressions. */
type PaceConfig = EconomyConfig['statFormulas']['pace']

/** The aero model's content block - the downforce coefficient, its ceiling, and
 * what each aero grade provides. */
type AeroConfig = EconomyConfig['statFormulas']['aero']

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function dot(coefficients: readonly number[], predictors: readonly number[]): number {
  let sum = 0
  for (let i = 0; i < coefficients.length; i++) sum += coefficients[i]! * predictors[i]!
  return sum
}

/** The powered axle set, derived from the layout tag: FF drives the front, AWD
 * all four, and FR/MR/RR all drive the rear. */
export type Drivetrain = 'FWD' | 'RWD' | 'AWD'

/** Where the engine sits, derived from the layout tag. */
export type EnginePosition = 'front' | 'mid' | 'rear'

export function drivetrainOf(model: CarModel): Drivetrain {
  const layout = layoutTagOf(model)
  if (layout === 'FF') return 'FWD'
  if (layout === 'AWD') return 'AWD'
  return 'RWD'
}

export function enginePositionOf(model: CarModel): EnginePosition {
  const layout = layoutTagOf(model)
  if (layout === 'MR') return 'mid'
  if (layout === 'RR') return 'rear'
  return 'front'
}

/** The tyre's section width (mm) from `spec.stockTyre`'s first three-digit
 * group (e.g. `225/50R16` -> 225), falling back when a model states no tyre. */
function tyreWidthMm(model: CarModel, grip: GripConfig): number {
  const stockTyre = model.spec.stockTyre
  const match = stockTyre?.match(/\d{3}/)
  return match ? Number(match[0]) : grip.width.fallbackMm
}

/** Front track width (mm): Kei cars run narrow, a wide-tyred car runs wide, and
 * everything else runs the standard track. */
export function trackOf(model: CarModel, grip: GripConfig): number {
  if (model.tags.includes('Kei')) return grip.track.keiMm
  return tyreWidthMm(model, grip) >= grip.track.wideWidthThresholdMm
    ? grip.track.wideMm
    : grip.track.standardMm
}

/** The era rubber-chemistry mu ceiling for a build year. */
function eraRubberMu(yearFrom: number, grip: GripConfig): number {
  for (const band of grip.eraRubberBands) {
    if (yearFrom < band.beforeYear) return band.mu
  }
  return grip.eraRubberDefaultMu
}

/**
 * The effective compound tier a car's grip is computed at: the fitted tyre
 * part's grade decides it (street/sport/race lift the tier), and a stock tyre
 * (or an empty/unresolved tyre slot) keeps the model's own stock
 * `spec.tyreCompound`. Undefined only when a model states no stock compound.
 */
export function effectiveCompound(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  grip: GripConfig,
): TyreCompound | undefined {
  const installed = car.parts.tyres.installed
  if (installed) {
    const part = partsById[installed.partId]
    if (part) {
      const mapped = grip.gradeToCompound[part.grade]
      if (mapped) return mapped
    }
  }
  return model.spec.tyreCompound
}

/**
 * Predicted mechanical lateral g on the skidpad: compound chemistry (era x
 * tyre-tier x contact-patch width) times centre-of-mass weight transfer times
 * the drivetrain-layout bonus. Mass-independent to first order, so it carries
 * no weight term. Returned raw (never clamped).
 *
 * A car with a measured lateral pair does NOT take its grip from here. This is
 * the predictor for a car that carries no measurement, and - through the ratio
 * of its value on two compounds - the model of how a measured car responds to a
 * change of tyre.
 */
export function computeGrip(
  model: CarModel,
  compound: TyreCompound | undefined,
  grip: GripConfig,
): number {
  const eraMu = eraRubberMu(model.spec.yearFrom, grip)
  const compoundMu = eraMu + (compound == null ? 0 : grip.tierDelta[compound])

  const width = tyreWidthMm(model, grip)
  const widthEff = clamp(
    (compoundMu - grip.width.effMuFloor) / grip.width.effMuSpan,
    grip.width.effMin,
    grip.width.effMax,
  )
  const widthAdj =
    clamp(
      (width - grip.width.referenceMm) / grip.width.divisor,
      grip.width.adjMin,
      grip.width.adjMax,
    ) * widthEff
  const mu = compoundMu + widthAdj

  const comHeight = model.spec.comHeightMm ?? grip.comHeightFallbackMm
  const comRatio = comHeight / trackOf(model, grip)
  const transfer = clamp(
    1 - grip.transfer.slope * (comRatio - grip.transfer.reference),
    grip.transfer.floor,
    grip.transfer.ceiling,
  )

  let layout = grip.layout.base
  if (drivetrainOf(model) === 'AWD') {
    const activeYaw = model.spec.activeYaw === 'attesa' || model.spec.activeYaw === 'ayc'
    layout += activeYaw ? grip.layout.awdActive : grip.layout.awdPassive
  } else if (enginePositionOf(model) === 'mid') {
    layout += grip.layout.mid
  }

  return mu * transfer * layout
}

/**
 * Cornering balance in `[clampMin, clampMax]`: a negative value understeers
 * (nose-heavy, FWD), a positive one is tail-happy (rear-biased, rear/mid
 * engine). Front-weight bias sets the base; drivetrain and engine position
 * shift it.
 */
export function balanceOf(model: CarModel, grip: GripConfig): number {
  const b = grip.balance
  const front = model.spec.weightDistributionFront ?? b.frontFallback
  let value = (b.frontReference - front) / b.frontDivisor

  const drivetrain = drivetrainOf(model)
  if (drivetrain === 'FWD') value += b.fwd
  else if (drivetrain === 'RWD') value += b.rwd

  const enginePosition = enginePositionOf(model)
  if (enginePosition === 'rear') value += b.rear
  else if (enginePosition === 'mid') value += b.mid

  return clamp(value, b.clampMin, b.clampMax)
}

/**
 * Maps a car's EFFECTIVE lateral g onto the 0-100 handling readout: mechanical
 * grip plus whatever downforce the car makes at the curve's reference speed,
 * through two linear segments - a steep stock segment that keeps stock cars'
 * resolution, and a gentle modified segment above the best stock grip that
 * spreads built cars without an early cap. Clamped to `[0, 100]`.
 *
 * Reading effective rather than mechanical grip is what lets a wing move the
 * number: downforce is the one upgrade that carries a build past the top of the
 * range, and a mechanical-only readout could not see it. A car with no
 * downforce reads exactly as it did.
 */
export function gripToDisplay(
  mu: number,
  downforceCoeff: number,
  grip: GripConfig,
  aero: AeroConfig,
): number {
  const c = grip.displayCurve
  const g = mu * aeroGripMultiplier(c.displayReferenceSpeedKmh / 3.6, downforceCoeff, aero)
  const stockSlope = (c.stockHighDisplay - c.stockLowDisplay) / (c.stockHighG - c.stockLowG)
  const modifiedSlope =
    (c.modifiedHighDisplay - c.stockHighDisplay) / (c.modifiedHighG - c.stockHighG)
  const raw =
    g <= c.stockHighG
      ? c.stockLowDisplay + (g - c.stockLowG) * stockSlope
      : c.stockHighDisplay + (g - c.stockHighG) * modifiedSlope
  return clamp(raw, 0, 100)
}

/**
 * The speeds the measured pairs are read at. Lateral g is quoted at 97 and
 * 193 km/h; braking and acceleration at 97 and 161. The pairs may not be mixed:
 * downforce goes as speed SQUARED, so reading a 193 km/h lateral figure as a
 * 161 km/h one inflates that term by 44 per cent.
 */
const V97_MS = 97 / 3.6
const V161_MS = 161 / 3.6
const V193_MS = 193 / 3.6

/**
 * Numerical-method constants - properties of the marching and solving schemes,
 * not economy levers, so they stay in code rather than content: the speed step
 * of the acceleration integral, the bisection brackets for the two acceleration
 * unknowns (0.03 g to 4 g of launch, 0.5 kW to 4 MW of wheel power, wide enough
 * that hitting one means "no solution" rather than "the bracket was mean"), the
 * top-speed root bracket, halving counts, the straight integrator's low-speed
 * floor (keeps `power / (m * v)` finite off a standstill), the standing-start
 * time step, and the runaway guards the physics never reaches.
 */
const ACCEL_STEP_MS = 0.1
const LAUNCH_LO_MS2 = 0.3
const LAUNCH_HI_MS2 = 40
const POWER_LO_W = 500
const POWER_HI_W = 4e6
const VTOP_LO_MS = 1
const VTOP_HI_MS = 200
const BISECTION_HALVINGS = 60
const JOINT_INNER_HALVINGS = 50
const JOINT_OUTER_HALVINGS = 45
const IN_STEP_HALVINGS = 40
const STRAIGHT_MIN_SPEED_MS = 3
const DRAG_STEP_S = 5e-4
const INTEGRATOR_MAX_STEPS = 100000
const DRAG_MAX_STEPS = 4e6

/**
 * Floors on the two predicted acceleration halves, keeping a wild extrapolation
 * of the fallback regression physical. They bind on no shipped car.
 */
const LAUNCH_FLOOR_MS2 = 0.5
const POWER_FLOOR_W = 2e3

/** Drag coefficient for a model that omits one. Every playable car states it. */
const DRAG_CD_FALLBACK = 0.34
/** Power-to-weight floor for the acceleration regression's logged predictor, so
 * a synthesised model carrying no real power figure cannot produce a NaN. */
const MIN_POWER_TO_WEIGHT = 1

/**
 * Aerodynamic frontal area (m^2): the real published body box (width x height,
 * mm -> m) scaled by `frontalAreaCoeff` when both dimensions are known, else
 * the fleet fallback.
 *
 * For a car whose `dragCd` was back-solved from a measured top speed, an error
 * here cancels exactly: the same area divides the back-solve and multiplies the
 * drag area, so what reaches the sim is the `CdA` the measured top speed
 * implies.
 */
export function frontalAreaM2(model: CarModel, pace: PaceConfig): number {
  const { widthMm, heightMm } = model.spec
  if (widthMm != null && heightMm != null) {
    return pace.frontalAreaCoeff * (widthMm / 1000) * (heightMm / 1000)
  }
  return pace.frontalAreaFallbackM2
}

/**
 * Splits a lateral-g pair read at two speeds into the two quantities that
 * produced it. With `grip(v) = mu (1 + k v^2)`, two readings carry two
 * unknowns, so no assumption is needed about how much of the higher figure was
 * downforce.
 *
 * The guard is what stops the split double-counting: if the faster reading is
 * not strictly greater, there is no measurable rise, so `k` is zero and the
 * mechanical grip IS the raw reading.
 */
export function aeroFit(lateralG97: number, lateralG193: number): { mu: number; k: number } {
  if (!(lateralG193 > lateralG97)) return { k: 0, mu: lateralG97 }
  const ratio = lateralG193 / lateralG97
  const k = (ratio - 1) / (V193_MS * V193_MS - ratio * V97_MS * V97_MS)
  return { k, mu: lateralG97 / (1 + k * V97_MS * V97_MS) }
}

/** What a car's bodywork does aerodynamically: how much downforce it makes and
 * what that costs in drag. All-zero means no aero at all, which reduces every
 * formula below to the pre-aero model exactly. */
export interface AeroEffect {
  /** Downforce coefficient - grip gained per (m/s)^2, scaled by `downforceK`. */
  downforceCoeff: number
  /** Drag coefficient added to the car's own `dragCd`. */
  dragCdDelta: number
}

const NO_AERO: AeroEffect = { downforceCoeff: 0, dragCdDelta: 0 }

/** The car's own measured mechanical grip and downforce, from its lateral pair.
 * `null` when the car publishes no lateral reading at all. */
function measuredGripOf(
  model: CarModel,
  aero: AeroConfig,
): { mu: number; downforceCoeff: number } | null {
  const { lateralG97, lateralG193 } = model.spec
  if (lateralG97 == null) return null
  const fit = aeroFit(lateralG97, lateralG193 ?? lateralG97)
  return { mu: fit.mu, downforceCoeff: fit.k / aero.downforceK }
}

/**
 * The downforce coefficient the car's own bodywork makes. A measured lateral
 * pair states it (the speed-dependent half of the fit); otherwise it is
 * whatever factory aero the model declares, which is nothing on almost every
 * road car.
 */
export function factoryDownforceCoeff(model: CarModel, aero: AeroConfig): number {
  return measuredGripOf(model, aero)?.downforceCoeff ?? model.spec.downforceCoeff ?? 0
}

/**
 * The mechanical lateral grip a car actually corners on, fitted with
 * `compound` and worn to `conditionFactor`. Where a car publishes a measured
 * lateral pair, the measurement IS its stock grip and the formula supplies only
 * the PROPORTION a change of tyre moves it by; with no measurement the ratio is
 * taken against the formula itself and the result is the formula's own value
 * exactly.
 *
 * The lap and the handling readout both read grip from here, so a measured
 * car's displayed handling and its lap time can never disagree about how much
 * grip it has - which is why the grip dial's condition factor is applied here
 * rather than at either call site.
 */
export function effectiveGrip(
  model: CarModel,
  compound: TyreCompound | undefined,
  grip: GripConfig,
  aero: AeroConfig,
  conditionFactor = 1,
): number {
  const formulaStockMu = computeGrip(model, model.spec.tyreCompound, grip)
  const stockMu = measuredGripOf(model, aero)?.mu ?? formulaStockMu
  return stockMu * (computeGrip(model, compound, grip) / formulaStockMu) * conditionFactor
}

function factoryAeroOf(model: CarModel, aero: AeroConfig): AeroEffect {
  const downforceCoeff = factoryDownforceCoeff(model, aero)
  return downforceCoeff > 0 ? { downforceCoeff, dragCdDelta: 0 } : NO_AERO
}

/**
 * The aero grip multiplier at speed `v`: `1 + downforceK * coeff * v^2`, bounded
 * by `maxGripMultiplier`. Exactly 1 (no effect) at a standstill or with no aero.
 */
export function aeroGripMultiplier(v: number, downforceCoeff: number, aero: AeroConfig): number {
  if (downforceCoeff <= 0) return 1
  return Math.min(1 + aero.downforceK * downforceCoeff * v * v, aero.maxGripMultiplier)
}

/**
 * The aero a car is actually running: a fitted aero-functional SKU ADDS its
 * grade's downforce to whatever the car's own body already makes, and brings
 * its drag with it. The factory figure is a floor, not something a bolt-on
 * replaces: a wing replaces the spoiler it sits where, never the underbody and
 * shape the car was drawn with, so no fitted part can leave a car generating
 * less grip than it did bare. Anything else, including a cosmetic or
 * body-panel SKU in the aero slot, leaves the car on its own factory downforce
 * at no extra drag, since a published Cd already includes the factory bodywork.
 *
 * The car's own `spec.aeroCeiling` scales what the FITTED part adds, so the
 * same wing is transformative on a body with real aerodynamic potential and
 * nearly inert on one without. It scales that addition ONLY: the factory floor
 * is untouched, so a stock car reads exactly as it is measured, and the drag
 * arrives in full whatever the body, which is what makes a wing on the wrong
 * car a straight loss rather than a small gain.
 */
export function effectiveDownforce(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  aero: AeroConfig,
): AeroEffect {
  const installed = car.parts.aero?.installed
  if (installed) {
    const part = partsById[installed.partId]
    if (part?.aeroFunctional) {
      const graded = aero.byGrade[part.grade]
      return {
        downforceCoeff:
          factoryDownforceCoeff(model, aero) + graded.downforceCoeff * model.spec.aeroCeiling,
        dragCdDelta: graded.dragCdDelta,
      }
    }
  }
  return factoryAeroOf(model, aero)
}

/**
 * The braking coefficient a stopping distance implies. A stop is an integral,
 * not a constant-deceleration formula, because braking grip rises with speed
 * for the same reason lateral grip does: with `a(v) = bmu g (1 + k v^2)`,
 * `d(V) = d0 + ln(1 + k V^2) / (2 g k bmu)`. The `k -> 0` limit is the
 * schoolbook expression, taken explicitly because the log form divides by zero
 * there.
 *
 * `brakeDeadDistanceM` is the metres covered before full retardation arrives.
 * Returns `null` for a stop shorter than that dead distance, which no real
 * measurement is.
 */
export function brakeMuFrom(
  distanceM: number,
  speedMs: number,
  downforceCoeff: number,
  pace: PaceConfig,
  aero: AeroConfig,
): number | null {
  const effective = distanceM - pace.brakeDeadDistanceM
  if (!(effective > 0)) return null
  const k = Math.max(0, downforceCoeff) * aero.downforceK
  if (k <= 1e-9) return (speedMs * speedMs) / (2 * pace.gravity * effective)
  return Math.log(1 + k * speedMs * speedMs) / (2 * pace.gravity * k * effective)
}

/**
 * Time (s) to accelerate from `v0` to `v1` under the curve the lap sim
 * integrates, `a(v) = min(aLaunch, pEff / (m v)) - drag`, marched in SPEED and
 * quadrated by Simpson's rule on `dt = dv / a`. Starting from rest is safe: the
 * power-limited branch diverges at a standstill, but the launch plateau is what
 * binds there. The last step is cut to land exactly on the target.
 *
 * `strict` makes an unreachable target return Infinity rather than a truncated
 * time. Every solve sets it: a truncated time is SMALLER than the true one,
 * which inverts the monotonicity the bisections depend on.
 */
function accelIntegral(
  m: number,
  cdA: number,
  launchAccel: number,
  effectivePowerW: number,
  v0: number,
  v1: number,
  strict: boolean,
  pace: PaceConfig,
): number {
  const rollingForce = pace.rollingResistance * m * pace.gravity
  const acc = (u: number): number => {
    const powerLimited = u <= 0 ? Infinity : effectivePowerW / (m * u)
    // 0.5 is the 1/2 in the drag equation (1/2 rho Cd A v^2), a physical
    // constant, not a lever.
    return (
      Math.min(powerLimited, launchAccel) - (0.5 * pace.airDensity * cdA * u * u + rollingForce) / m
    )
  }
  let v = v0
  let t = 0
  for (let i = 0; i < INTEGRATOR_MAX_STEPS && v < v1 - 1e-12; i++) {
    const h = Math.min(ACCEL_STEP_MS, v1 - v)
    const a0 = acc(v)
    const a1 = acc(v + h / 2)
    const a2 = acc(v + h)
    if (a0 <= 0 || a1 <= 0 || a2 <= 0) return strict ? Infinity : t
    t += (h / 6) * (1 / a0 + 4 / a1 + 1 / a2)
    v += h
  }
  return t
}

/** Bisection on a strictly decreasing `f`: both acceleration unknowns lower
 * every time they touch, so each solve is one monotone search. */
function bisect(
  f: (x: number) => number,
  lo: number,
  hi: number,
  target: number,
  halvings: number,
): number {
  for (let i = 0; i < halvings; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** The launch plateau and the effective through-the-gears wheel power. */
interface AccelSolution {
  launchAccel: number
  effectivePowerW: number
}

/**
 * Splits a pair of published acceleration times into the two unknowns of the
 * curve. Neither is a claim about WHY a car falls short of its crank figure: a
 * gearing loss and an overstated power figure are indistinguishable from a lap
 * time, and the solve does not need to know which is which.
 *
 * Above the launch crossover the curve is pure power, so the 97-to-161 segment
 * fixes `pEff` on its own and the 0-97 then fixes the plateau: two
 * one-dimensional solves, and the decoupling is exact. When the crossover lands
 * ABOVE 97 km/h the car is still traction-limited through that segment, so the
 * pair has to be solved jointly - an inner solve for power against the 0-161, an
 * outer for the plateau against the 0-97.
 */
export function solveAccel(
  m: number,
  cdA: number,
  t97: number,
  t161: number,
  pace: PaceConfig,
): AccelSolution {
  let effectivePowerW = bisect(
    (p) => accelIntegral(m, cdA, Infinity, p, V97_MS, V161_MS, true, pace),
    POWER_LO_W,
    POWER_HI_W,
    t161 - t97,
    BISECTION_HALVINGS,
  )
  let launchAccel = bisect(
    (a) => accelIntegral(m, cdA, a, effectivePowerW, 0, V97_MS, true, pace),
    LAUNCH_LO_MS2,
    LAUNCH_HI_MS2,
    t97,
    BISECTION_HALVINGS,
  )
  if (effectivePowerW / (m * launchAccel) > V97_MS) {
    const inner = (a: number): number =>
      bisect(
        (p) => accelIntegral(m, cdA, a, p, 0, V161_MS, true, pace),
        POWER_LO_W,
        POWER_HI_W,
        t161,
        JOINT_INNER_HALVINGS,
      )
    launchAccel = bisect(
      (a) => accelIntegral(m, cdA, a, inner(a), 0, V97_MS, true, pace),
      LAUNCH_LO_MS2,
      LAUNCH_HI_MS2,
      t97,
      JOINT_OUTER_HALVINGS,
    )
    effectivePowerW = inner(launchAccel)
  }
  return { launchAccel, effectivePowerW }
}

/**
 * One measurement leaves one free parameter. Rather than discard it, the launch
 * plateau comes from the fallback regression and the power is solved to
 * reproduce the published 0-97 exactly. These are cars too slow to reach
 * 161 km/h at all, so they are power-limited over almost the whole run and the
 * power is what the datum actually pins.
 */
export function solveAccelFromT97(
  m: number,
  cdA: number,
  t97: number,
  launchAccel: number,
  pace: PaceConfig,
): number {
  return bisect(
    (p) => accelIntegral(m, cdA, launchAccel, p, 0, V97_MS, true, pace),
    POWER_LO_W,
    POWER_HI_W,
    t97,
    BISECTION_HALVINGS,
  )
}

/** Predictors of the braking fallback: `[1, decades since 1990, AWD]`. */
function brakePredictors(model: CarModel): number[] {
  return [1, (model.spec.yearFrom - 1990) / 10, drivetrainOf(model) === 'AWD' ? 1 : 0]
}

/** Predictors of the acceleration fallback: `[1, AWD, FWD, ln(PS per tonne)]`. */
function accelPredictors(model: CarModel): number[] {
  const drivetrain = drivetrainOf(model)
  const powerToWeight = (model.spec.stockPowerPs * 1000) / Math.max(1, model.spec.curbWeightKg)
  return [
    1,
    drivetrain === 'AWD' ? 1 : 0,
    drivetrain === 'FWD' ? 1 : 0,
    Math.log(Math.max(MIN_POWER_TO_WEIGHT, powerToWeight)),
  ]
}

/**
 * How a car behaves at stock, expressed as DIMENSIONLESS RATIOS wherever the
 * quantity scales with something the car can change.
 *
 * The measured figures are the stock car's, and a player's car is not stock.
 * Freezing the solved constants would mean a turbo changed nothing; re-solving
 * needs measured times for a modified car, which do not exist and never will.
 * So the ratios are carried and the car's own current grip and power supply the
 * scale - which is the shape the fallback regressions already predict in, so
 * measured and predicted cars answer in the same currency. At stock the bridge
 * is an exact identity and the car reproduces its own measurements.
 */
interface StockBehaviour {
  /** Mechanical lateral grip at stock. */
  mu: number
  /** Factory downforce coefficient. */
  downforceCoeff: number
  /** Braking coefficient as a multiple of mechanical grip. */
  brakeRatio: number
  /** Launch plateau as a multiple of `mu * g`. */
  launchRatio: number
  /** Effective through-the-gears wheel power as a fraction of crank wheel power. */
  powerRatio: number
}

/**
 * The stock solve is a nested bisection over a Simpson quadrature, and it is a
 * property of the MODEL rather than of a particular car, so it is memoised on
 * the values it reads. Keying on values rather than on the object is what lets
 * two records of the same model with different mass, power or drag each get
 * their own honest solve.
 */
const STOCK_CACHE = new Map<string, StockBehaviour>()

function stockCacheKey(
  model: CarModel,
  formulaStockMu: number,
  pace: PaceConfig,
  aero: AeroConfig,
): string {
  const s = model.spec
  return [
    model.id,
    formulaStockMu,
    s.curbWeightKg,
    s.stockPowerPs,
    s.yearFrom,
    s.dragCd,
    s.widthMm,
    s.heightMm,
    s.lateralG97,
    s.lateralG193,
    s.braking97To0M,
    s.zeroTo97S,
    s.zeroTo161S,
    s.downforceCoeff,
    drivetrainOf(model),
    pace.gravity,
    pace.airDensity,
    pace.drivelineEfficiency,
    pace.rollingResistance,
    pace.psWatts,
    pace.driverMassKg,
    pace.frontalAreaCoeff,
    pace.frontalAreaFallbackM2,
    pace.brakeDeadDistanceM,
    pace.fallback.brake,
    pace.fallback.accelLaunch,
    pace.fallback.accelPower,
    aero.downforceK,
  ].join('|')
}

function solveStockBehaviour(
  model: CarModel,
  formulaStockMu: number,
  pace: PaceConfig,
  aero: AeroConfig,
): StockBehaviour {
  const s = model.spec
  const g = pace.gravity
  const measured = measuredGripOf(model, aero)
  const mu = measured?.mu ?? formulaStockMu
  const downforceCoeff = measured?.downforceCoeff ?? s.downforceCoeff ?? 0

  const m = s.curbWeightKg + pace.driverMassKg
  const cdA = (s.dragCd ?? DRAG_CD_FALLBACK) * frontalAreaM2(model, pace)
  const crankPowerW = Math.max(1, s.stockPowerPs * pace.psWatts * pace.drivelineEfficiency)

  const measuredBrakeMu =
    s.braking97To0M != null
      ? brakeMuFrom(s.braking97To0M, V97_MS, downforceCoeff, pace, aero)
      : null
  const brakeMu = measuredBrakeMu ?? mu * dot(pace.fallback.brake, brakePredictors(model))

  const predictors = accelPredictors(model)
  const predictedLaunch = Math.max(
    LAUNCH_FLOOR_MS2,
    dot(pace.fallback.accelLaunch, predictors) * mu * g,
  )

  let solution: AccelSolution
  if (s.zeroTo97S != null && s.zeroTo161S != null) {
    solution = solveAccel(m, cdA, s.zeroTo97S, s.zeroTo161S, pace)
  } else if (s.zeroTo97S != null) {
    solution = {
      launchAccel: predictedLaunch,
      effectivePowerW: solveAccelFromT97(m, cdA, s.zeroTo97S, predictedLaunch, pace),
    }
  } else {
    solution = {
      launchAccel: predictedLaunch,
      effectivePowerW: Math.max(
        POWER_FLOOR_W,
        dot(pace.fallback.accelPower, predictors) * crankPowerW,
      ),
    }
  }

  return {
    mu,
    downforceCoeff,
    brakeRatio: brakeMu / mu,
    launchRatio: solution.launchAccel / (mu * g),
    powerRatio: solution.effectivePowerW / crankPowerW,
  }
}

function stockBehaviourOf(
  model: CarModel,
  formulaStockMu: number,
  pace: PaceConfig,
  aero: AeroConfig,
): StockBehaviour {
  const key = stockCacheKey(model, formulaStockMu, pace, aero)
  const hit = STOCK_CACHE.get(key)
  if (hit) return hit
  const solved = solveStockBehaviour(model, formulaStockMu, pace, aero)
  STOCK_CACHE.set(key, solved)
  return solved
}

/** The pre-computed per-car constants a run reads once. SI throughout: mass kg,
 * power W, accelerations m/s^2, area m^2. */
export interface CarBlock {
  /** Kerb mass plus the driver, kg. */
  m: number
  /** Crank wheel power after driveline losses, W. Top speed runs on this. */
  crankPowerW: number
  /** Effective through-the-gears wheel power, W. Acceleration runs on this. */
  effectivePowerW: number
  /** Mechanical lateral grip coefficient. */
  mu: number
  /** Braking grip coefficient, a separate quantity from `mu`. */
  brakeMu: number
  /** Longitudinal launch-traction plateau, m/s^2. */
  launchAccel: number
  /** Drag area Cd x frontal area, m^2. */
  cdA: number
  /** Downforce coefficient in play (0 = no aero). */
  downforceCoeff: number
}

/**
 * Assembles a car's run constants at its CURRENT power, fitted compound, fitted
 * part grades and parts condition. The stock solve supplies the ratios; the
 * car's own figures supply the scale, so a turbo raises effective power and a
 * stickier tyre raises grip, braking and launch together in the proportion the
 * grip formula predicts.
 *
 * Each dial lands on exactly one quantity here, and the condition factor and
 * the build factor land on the same one, which is what keeps a dial assembled
 * in a single place. Grip is already inside `mu` (so it reaches braking and
 * launch the same way a change of tyre does), braking is what the brake
 * HARDWARE is worth on top of the rubber, mass scales the kerb weight the
 * driver is added to, the driveline dial is the fraction of crank power that
 * still reaches the road, and the aero dial is how much downforce the bodywork
 * still makes. No dial for power on either side: `powerPs` is the car's CURRENT
 * power and already carries both the engine's condition and its parts.
 *
 * Exported so a caller can read the derived quantities a lap actually runs on
 * (grip, braking, launch, effective power, drag area, mass) rather than
 * re-deriving them from the measurements: there is one assembly of them and
 * this is it.
 */
export function carBlock(
  model: CarModel,
  powerPs: number,
  compound: TyreCompound | undefined,
  pace: PaceConfig,
  grip: GripConfig,
  aero: AeroConfig,
  aeroEffect: AeroEffect,
  condition: ConditionFactors,
  build: BuildFactors,
): CarBlock {
  const formulaStockMu = computeGrip(model, model.spec.tyreCompound, grip)
  const stock = stockBehaviourOf(model, formulaStockMu, pace, aero)
  const mu = effectiveGrip(model, compound, grip, aero, condition.grip * build.grip)

  const crankPowerW = powerPs * pace.psWatts * pace.drivelineEfficiency * condition.driveline
  const cdA =
    ((model.spec.dragCd ?? DRAG_CD_FALLBACK) + aeroEffect.dragCdDelta) * frontalAreaM2(model, pace)

  return {
    m: model.spec.curbWeightKg * build.mass + pace.driverMassKg,
    crankPowerW,
    effectivePowerW: stock.powerRatio * crankPowerW,
    mu,
    brakeMu: stock.brakeRatio * mu * condition.braking * build.braking,
    launchAccel: stock.launchRatio * mu * pace.gravity,
    cdA,
    downforceCoeff: aeroEffect.downforceCoeff * condition.aero,
  }
}

/**
 * The usable mechanical grip through a corner of `radiusM`. Unbounded grip pays
 * a fast car twice - once in apex speed and once in a cheaper direction change -
 * but through a tight corner the car is bounded by steering lock, wheelbase and
 * width rather than by the contact patch. The ceiling rises with radius, so it
 * bites hardest in a hairpin and releases on an open sweeper, and it caps
 * mechanical grip only: downforce is solved on top of the capped value.
 */
export function cornerMu(mu: number, radiusM: number, pace: PaceConfig): number {
  return Math.min(mu, pace.geoMu * Math.pow(radiusM / pace.geoR, pace.geoT))
}

/**
 * Grip-limited apex speed (m/s) for a corner of `radiusM`. Without aero this is
 * the familiar `sqrt(mu g r)`. With aero it is implicit - the grip depends on the
 * very speed being solved for - but it closes in one step: from
 * `v^2 = mu (1 + K v^2) g r` with `K = downforceK * coeff`,
 * `v^2 = mu g r / (1 - mu K g r)`. A non-positive denominator means downforce
 * outruns the demand, so the multiplier ceiling governs instead; the same ceiling
 * applies whenever the solved multiplier would exceed it.
 */
function apexSpeed(
  mu: number,
  radiusM: number,
  downforceCoeff: number,
  pace: PaceConfig,
  aero: AeroConfig,
): number {
  const base = mu * pace.gravity * radiusM
  if (downforceCoeff <= 0) return Math.sqrt(base)
  const k = aero.downforceK * downforceCoeff
  const denominator = 1 - mu * k * pace.gravity * radiusM
  if (denominator <= 0) return Math.sqrt(base * aero.maxGripMultiplier)
  const solved = base / denominator
  return Math.sqrt(1 + k * solved > aero.maxGripMultiplier ? base * aero.maxGripMultiplier : solved)
}

/**
 * Terminal speed (m/s): the root at which crank wheel thrust exactly balances
 * aero plus rolling drag, then capped at the published top speed when known.
 * Net acceleration falls monotonically with speed, so this is a bisection rather
 * than a march. It runs on CRANK power, never on the solved effective power: a
 * top speed IS steady state at peak-power rpm.
 */
function vTopOf(block: CarBlock, model: CarModel, pace: PaceConfig): number {
  const net = (v: number): number =>
    block.crankPowerW / (block.m * v) -
    (0.5 * pace.airDensity * block.cdA * v * v + pace.rollingResistance * block.m * pace.gravity) /
      block.m

  let vTop: number
  if (net(VTOP_LO_MS) <= 0) vTop = VTOP_LO_MS
  else if (net(VTOP_HI_MS) > 0) vTop = VTOP_HI_MS
  else {
    let lo = VTOP_LO_MS
    let hi = VTOP_HI_MS
    for (let i = 0; i < BISECTION_HALVINGS; i++) {
      const mid = (lo + hi) / 2
      if (net(mid) > 0) lo = mid
      else hi = mid
    }
    vTop = (lo + hi) / 2
  }
  const topSpeedKmh = model.spec.topSpeedKmh
  if (topSpeedKmh != null) vTop = Math.min(vTop, topSpeedKmh / 3.6)
  return vTop
}

/** The car's own net acceleration at a speed: whichever of traction and power
 * binds, less aero and rolling drag. */
function netAccel(block: CarBlock, u: number, pace: PaceConfig): number {
  const resistance =
    (0.5 * pace.airDensity * block.cdA * u * u + pace.rollingResistance * block.m * pace.gravity) /
    block.m
  return Math.min(block.effectivePowerW / (block.m * u), block.launchAccel) - resistance
}

/**
 * Time (s) to cover one straight of `length` m, entering at `vIn` and arriving
 * at the next corner's apex speed `vOut`. The march is in SPEED and it ends at
 * whichever comes first, the brake point or terminal speed; both exits are
 * solved for INSIDE the step that crosses them, because a step is roughly 15 m
 * at motorway speed and breaking at the first step past the brake point would
 * charge the car for braking from a speed it never reached.
 *
 * Braking runs on the car's own measured braking coefficient, not on lateral
 * grip. Downforce still helps it, and more the faster the car is going.
 */
function straightTime(
  block: CarBlock,
  vIn: number,
  vOut: number,
  length: number,
  vCap: number,
  pace: PaceConfig,
  aero: AeroConfig,
): number {
  const brakeAccelAt = (u: number): number =>
    block.brakeMu * aeroGripMultiplier(u, block.downforceCoeff, aero) * pace.gravity
  const brakeDistanceAt = (u: number): number =>
    u > vOut ? (u * u - vOut * vOut) / (2 * brakeAccelAt(u)) : 0
  const brakeTimeAt = (u: number): number => (u > vOut ? (u - vOut) / brakeAccelAt(u) : 0)

  let v = Math.max(vIn, STRAIGHT_MIN_SPEED_MS)
  let x = 0
  let t = 0
  let stride = pace.integrationStep

  // Simpson's rule over a fraction `s` of the current stride. Both integrands
  // (dt = dv/a and dx = v dv/a) steepen sharply as acceleration falls towards
  // the cruise threshold, which is exactly where an endpoint rule spends its
  // error, so the two extra evaluations per step buy the convergence.
  const stepTo = (s: number): { dt: number; dx: number } => {
    const h = s * stride
    const a0 = netAccel(block, v, pace)
    const a1 = netAccel(block, v + h / 2, pace)
    const a2 = netAccel(block, v + h, pace)
    return {
      dt: (h / 6) * (1 / a0 + 4 / a1 + 1 / a2),
      dx: (h / 6) * (v / a0 + (4 * (v + h / 2)) / a1 + (v + h) / a2),
    }
  }
  // Bisection on a monotone crossing inside the step, exact in double precision.
  const crossing = (hi: number, holds: (s: number) => boolean): number => {
    let lo = 0
    for (let i = 0; i < IN_STEP_HALVINGS; i++) {
      const mid = (lo + hi) / 2
      if (holds(mid)) lo = mid
      else hi = mid
    }
    return hi
  }
  // At terminal speed the car coasts the rest of the straight, then brakes in.
  const coast = (): number => (length - x - brakeDistanceAt(v)) / v + brakeTimeAt(v)

  // The car can enter faster than the following corner allows, in which case the
  // whole straight is braking. This cannot recur inside the loop: every step
  // stops at the brake point, so the invariant holds at the top of the next one.
  if (brakeDistanceAt(v) >= length) return brakeTimeAt(v)

  for (let i = 0; i < INTEGRATOR_MAX_STEPS; i++) {
    if (v >= vCap - 1e-9 || netAccel(block, v, pace) <= pace.cruiseThreshold) return t + coast()
    stride = Math.min(pace.integrationStep, vCap - v)
    const reachesEnd = netAccel(block, v + stride, pace) > pace.cruiseThreshold
    const sc = reachesEnd
      ? 1
      : crossing(1, (s) => netAccel(block, v + s * stride, pace) > pace.cruiseThreshold)
    const step = stepTo(sc)
    if (x + step.dx + brakeDistanceAt(v + sc * stride) >= length) {
      const sb = crossing(sc, (s) => x + stepTo(s).dx + brakeDistanceAt(v + s * stride) < length)
      return t + stepTo(sb).dt + brakeTimeAt(v + sb * stride)
    }
    x += step.dx
    t += step.dt
    v += sc * stride
    if (sc < 1) return t + coast()
  }
  return t
}

/**
 * A flying lap of a segmented course: each corner taken at its grip-limited
 * apex speed, plus the direction-change charge, plus the straight that follows
 * it. The lap wraps, so the last straight leads into the first corner's apex.
 *
 * The direction-change charge is the seconds spent turning the car IN, which a
 * point-mass sim steering an arc at a fixed apex speed never accounts for.
 * `1/mu` is its price, because the transient uses the same contact patch the
 * steady-state corner does, which makes it a grip-limited cost and nothing
 * else; the grip it divides by is the ceiling-limited one, since a car with
 * more grip than a hairpin can use does not change direction any sooner for
 * having it. It deliberately carries no mass term: mass is already priced
 * through apex speed, braking distance and corner exit, and a fourth linear
 * charge made the term a heavy-car handicap rather than a transition model.
 */
function lapWalk(
  block: CarBlock,
  segments: readonly (readonly [number, number, number])[],
  vTop: number,
  pace: PaceConfig,
  aero: AeroConfig,
): number {
  const n = segments.length
  const apex = segments.map((s) =>
    Math.min(
      apexSpeed(cornerMu(block.mu, s[0], pace), s[0], block.downforceCoeff, pace, aero),
      vTop,
    ),
  )

  let total = 0
  for (let i = 0; i < n; i++) {
    const [radiusM, angleDeg, straightM] = segments[i]!
    total += (radiusM * angleDeg * Math.PI) / 180 / apex[i]!
    const tight =
      (angleDeg / pace.agilityAngleReferenceDeg) *
      clamp(
        pace.agilityRadiusReferenceM / radiusM,
        pace.agilityTightnessMin,
        pace.agilityTightnessMax,
      )
    total += (pace.agilityWeight / cornerMu(block.mu, radiusM, pace)) * tight
    total += straightTime(block, apex[i]!, apex[(i + 1) % n]!, straightM, vTop, pace, aero)
  }
  return total
}

/**
 * A standing-start run over `lengthM`, marched in TIME rather than in speed
 * because the quantity being integrated to a target is distance. The step is far
 * inside convergence. Raw: the protocol offset is applied by the caller.
 */
function dragRun(block: CarBlock, lengthM: number, vCap: number, pace: PaceConfig): number {
  let v = 0.1
  let x = 0
  let t = 0
  for (let i = 0; i < DRAG_MAX_STEPS && x < lengthM; i++) {
    v = Math.min(vCap, v + Math.max(0, netAccel(block, v, pace)) * DRAG_STEP_S)
    x += v * DRAG_STEP_S
    t += DRAG_STEP_S
  }
  return t
}

/**
 * Time (raw seconds, unrounded) for `model` over `course` at `powerPs` on
 * `compound` tyres. `aeroEffect` defaults to the car's own factory bodywork,
 * `condition` to a car in good order and `build` to a car of stock parts, which
 * together are the state the measured figures describe.
 *
 * A `lap` course is walked corner by corner; a `standing-km` course is run flat
 * out from rest by its own evaluator, because a road with no corners cannot be
 * written as a list of them.
 */
export function lapTime(
  model: CarModel,
  course: Course,
  powerPs: number,
  compound: TyreCompound | undefined,
  economy: EconomyConfig,
  aeroEffect?: AeroEffect,
  condition: ConditionFactors = MINT_CONDITION_FACTORS,
  build: BuildFactors = STOCK_BUILD_FACTORS,
): number {
  const pace = economy.statFormulas.pace
  const grip = economy.statFormulas.grip
  const aero = economy.statFormulas.aero

  const effect = aeroEffect ?? factoryAeroOf(model, aero)
  const block = carBlock(model, powerPs, compound, pace, grip, aero, effect, condition, build)
  const vTop = vTopOf(block, model, pace)

  if (course.kind === 'standing-km') {
    // THE ONE PLACE THE PROTOCOL OFFSET IS EVER APPLIED, and it is reachable
    // only from here. It is a calibration of a hand-driven measurement against
    // canned figures, not physics, so it must never touch a lap: the lap
    // courses are accurate WITH the straight-line pessimism in place, because
    // it cancels against a direction-change weight fitted with it present.
    return dragRun(block, course.lengthM ?? 0, vTop, pace) * (1 - pace.dragOffsetPct / 100)
  }
  return lapWalk(block, course.segments, vTop, pace, aero)
}
