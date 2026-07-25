import {
  layoutTagOf,
  type CarInstance,
  type CarModel,
  type Course,
  type EconomyConfig,
  type Part,
  type TyreCompound,
} from '@midnight-garage/content'

/** The handling model's content block - every grip, balance, and display-curve
 * constant. */
type GripConfig = EconomyConfig['statFormulas']['grip']

/** The pace/lap model's content block - every physics constant of the
 * quasi-static point-mass sim, the launch and agility terms, and the
 * engine-archetype torque-delivery factors. */
type PaceConfig = EconomyConfig['statFormulas']['pace']

/** The aero model's content block - the downforce coefficient, its ceiling, and
 * what each aero grade provides. */
type AeroConfig = EconomyConfig['statFormulas']['aero']

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
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
 * Uncapped mechanical lateral g on the skidpad: compound chemistry (era x
 * tyre-tier x contact-patch width) times centre-of-mass weight transfer times
 * the drivetrain-layout bonus. Mass-independent to first order, so it carries
 * no weight term. Returned raw (never clamped) so the same figure feeds both
 * the display curve and any downstream lap/aero model.
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
 * Maps a mechanical lateral g onto the 0-100 handling readout through two
 * linear segments: a steep stock segment that keeps stock cars' resolution,
 * and a gentle modified segment above the best stock grip that spreads built
 * cars without an early cap. Clamped to `[0, 100]`.
 */
export function gripToDisplay(g: number, grip: GripConfig): number {
  const c = grip.displayCurve
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
 * Numerical-method constants for the lap integrator - properties of the
 * marching scheme, not economy levers, so they stay in code rather than
 * content: the top-speed speed-march bounds and its step, the straight
 * integrator's low-speed floor (keeps `power / (m * v)` finite off a standstill),
 * the RWD longitudinal-transfer slip guard (a rear-drive car cannot transfer
 * more than this share onto the driven axle), and the integrator's hard step
 * cap (a runaway guard the physics never reaches).
 */
const VTOP_MARCH_MIN_MS = 20
const VTOP_MARCH_MAX_MS = 150
const VTOP_MARCH_STEP_MS = 0.5
const STRAIGHT_MIN_SPEED_MS = 3
const RWD_SLIP_GUARD = 0.9
const INTEGRATOR_MAX_STEPS = 100000

/**
 * Spec fallbacks the calibration prototype defaulted inline. Only reached by a
 * model that omits the field; every playable car states all three, so these
 * never bind on the shipped roster.
 */
const WEIGHT_DIST_FRONT_FALLBACK = 55
const WHEELBASE_FALLBACK_MM = 2500
const DRAG_CD_FALLBACK = 0.34

/**
 * Aerodynamic frontal area (m^2): the real published body box (width x height,
 * mm -> m) scaled by `frontalAreaCoeff` when both dimensions are known, else
 * the fleet fallback. Mirrors the prototype's `frontalArea`.
 */
export function frontalAreaM2(model: CarModel, pace: PaceConfig): number {
  const { widthMm, heightMm } = model.spec
  if (widthMm != null && heightMm != null) {
    return pace.frontalAreaCoeff * (widthMm / 1000) * (heightMm / 1000)
  }
  return pace.frontalAreaFallbackM2
}

/**
 * The engine's torque-delivery archetype, keying `pace.delivery` (1 = instant
 * corner-exit pull, lower = laggier). A rotary is split by induction, a
 * twin-turbo by whether it is the sequential 2JZ-GTE, and the VTEC screamers
 * are recognised by engine code; everything else falls to a plain or big
 * naturally-aspirated curve. A faithful port of the prototype's `archOf` (its
 * `superch`/`seqTwinR` are this map's `supercharged`/`seqTwinRotary`).
 */
export function deliveryArchetype(model: CarModel): keyof PaceConfig['delivery'] {
  const engineConfig = model.spec.engineConfig ?? ''
  const aspiration = model.spec.aspiration
  const engineCode = model.spec.engineCode

  if (engineConfig.startsWith('rotary')) {
    return aspiration != null && aspiration.includes('turbo') ? 'seqTwinRotary' : 'rotaryNA'
  }
  if (aspiration === 'twin-turbo') return /2JZ-GTE/.test(engineCode) ? 'seqTwin' : 'parallelTwin'
  if (aspiration === 'turbo') return 'singleTurbo'
  if (aspiration === 'supercharged') return 'supercharged'
  if (/B16|B18C|H22|F20C|K20A|C30A/.test(engineCode)) return 'vtecNA'
  if (engineConfig === 'V8' || engineConfig === 'V10' || engineConfig === 'V12') return 'bigNA'
  return 'plainNA'
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

/**
 * The aero grip multiplier at speed `v`: `1 + downforceK * coeff * v^2`, bounded
 * by `maxGripMultiplier`. Exactly 1 (no effect) at a standstill or with no aero,
 * which is why downforce never touches the skidpad-based handling stat.
 */
export function aeroGripMultiplier(v: number, downforceCoeff: number, aero: AeroConfig): number {
  if (downforceCoeff <= 0) return 1
  return Math.min(1 + aero.downforceK * downforceCoeff * v * v, aero.maxGripMultiplier)
}

/**
 * The aero a car is actually running: a fitted aero-functional SKU provides its
 * grade's downforce and drag, and REPLACES the factory figure (it occupies the
 * same slot - the factory item came off). Anything else, including a cosmetic or
 * body-panel SKU in the aero slot, leaves the car on its own `spec.downforceCoeff`
 * at no extra drag, since a published Cd already includes the factory bodywork.
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
    if (part?.aeroFunctional) return aero.byGrade[part.grade]
  }
  const factory = model.spec.downforceCoeff ?? 0
  return factory > 0 ? { downforceCoeff: factory, dragCdDelta: 0 } : NO_AERO
}

/** The pre-computed per-car constants a lap march reads once (the prototype's
 * `carBlock`). SI throughout: mass kg, power W, accelerations m/s^2, area m^2. */
interface CarBlock {
  /** Kerb mass plus the driver, kg. */
  m: number
  /** Wheel power after driveline losses, W. */
  powerW: number
  /** Mechanical lateral grip coefficient (the game's `computeGrip`). */
  mu: number
  /** Longitudinal launch-traction ceiling, m/s^2. */
  aGrip: number
  /** Drag area Cd x frontal area, m^2. */
  cdA: number
  /** Corner-exit torque-delivery factor for this engine archetype. */
  deliveryFactor: number
  /** Downforce coefficient in play (0 = no aero). */
  downforceCoeff: number
}

/** Assembles a car's lap constants: mass, wheel power, grip, the
 * drivetrain-dependent launch-traction ceiling, drag area, and delivery
 * factor. Faithful port of the prototype's `carBlock`. */
function carBlock(
  model: CarModel,
  powerPs: number,
  compound: TyreCompound | undefined,
  pace: PaceConfig,
  grip: GripConfig,
  aeroEffect: AeroEffect,
): CarBlock {
  const g = pace.gravity
  const m = model.spec.curbWeightKg + pace.driverMassKg
  const powerW = powerPs * pace.psWatts * pace.drivelineEfficiency
  const mu = computeGrip(model, compound, grip)

  const front = model.spec.weightDistributionFront ?? WEIGHT_DIST_FRONT_FALLBACK
  const rearBias = 1 - front / 100
  const frontBias = front / 100
  const comHeight = model.spec.comHeightMm ?? grip.comHeightFallbackMm
  const wheelbase = model.spec.wheelbaseMm ?? WHEELBASE_FALLBACK_MM
  const comRatio = comHeight / wheelbase
  const launchCap = pace.launchCapCoeff * mu

  const drivetrain = drivetrainOf(model)
  let launchAccel: number
  if (drivetrain === 'AWD') {
    launchAccel = mu * pace.awdLaunchFactor
  } else if (drivetrain === 'RWD') {
    launchAccel = Math.min(
      (mu * rearBias) / (1 - Math.min(RWD_SLIP_GUARD, mu * comRatio)),
      launchCap,
    )
  } else {
    launchAccel = Math.min((mu * frontBias) / (1 + mu * comRatio), launchCap)
  }
  const aGrip = Math.min(mu, launchAccel) * g

  const cdA =
    ((model.spec.dragCd ?? DRAG_CD_FALLBACK) + aeroEffect.dragCdDelta) * frontalAreaM2(model, pace)
  const deliveryFactor = pace.delivery[deliveryArchetype(model)]
  return { m, powerW, mu, aGrip, cdA, deliveryFactor, downforceCoeff: aeroEffect.downforceCoeff }
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

/** Terminal speed (m/s): march up until aero + rolling drag cancels available
 * wheel acceleration, then cap at the published top speed when known. Faithful
 * port of the prototype's `vTopOf`. */
function vTopOf(block: CarBlock, model: CarModel, pace: PaceConfig): number {
  const g = pace.gravity
  let vTop = VTOP_MARCH_MIN_MS
  for (let v = VTOP_MARCH_MIN_MS; v < VTOP_MARCH_MAX_MS; v += VTOP_MARCH_STEP_MS) {
    // 0.5 is the 1/2 in the drag equation (1/2 rho Cd A v^2), a physical
    // constant, not a lever.
    const aRes =
      (0.5 * pace.airDensity * block.cdA * v * v + pace.rollingResistance * block.m * g) / block.m
    if (block.powerW / (block.m * v) - aRes <= 0) {
      vTop = v
      break
    }
    vTop = v
  }
  const topSpeedKmh = model.spec.topSpeedKmh
  if (topSpeedKmh != null) vTop = Math.min(vTop, topSpeedKmh / 3.6)
  return vTop
}

/** Time (s) to cover one straight of `length` m, entering at `vIn` and braking
 * down to `vOut` by its end: a forward Euler march under delivery-ramped wheel
 * force minus aero + rolling drag, coasting once acceleration falls below the
 * cruise threshold and grip-braking into the next corner. Faithful port of the
 * prototype's `straightTime`. */
function straightTime(
  block: CarBlock,
  vIn: number,
  vOut: number,
  length: number,
  pace: PaceConfig,
  aero: AeroConfig,
): number {
  const g = pace.gravity
  const dv = pace.integrationStep
  const vFull = pace.deliverySaturationSpeed
  const rollingForce = pace.rollingResistance * block.m * g
  // Braking shares the tyre's friction budget with cornering, so downforce helps
  // it too - and more the faster the car is going.
  const brakeAccelAt = (speed: number) =>
    block.mu * aeroGripMultiplier(speed, block.downforceCoeff, aero) * g

  let v = Math.max(vIn, STRAIGHT_MIN_SPEED_MS)
  let x = 0
  let t = 0
  for (let i = 0; i < INTEGRATOR_MAX_STEPS; i++) {
    const aBrake = brakeAccelAt(v)
    const brakeDist = v > vOut ? (v * v - vOut * vOut) / (2 * aBrake) : 0
    if (x + brakeDist >= length) {
      if (v > vOut) t += (v - vOut) / aBrake
      break
    }
    const aPow = block.powerW / (block.m * v)
    const deliveryRamp = block.deliveryFactor + (1 - block.deliveryFactor) * Math.min(1, v / vFull)
    const aEng = Math.min(aPow, block.aGrip) * deliveryRamp
    const aRes = (0.5 * pace.airDensity * block.cdA * v * v + rollingForce) / block.m
    const a = aEng - aRes
    if (a <= pace.cruiseThreshold) {
      // Coast the remaining distance at terminal speed, then brake in. The
      // prototype also advanced x here; omitted because x is never read again
      // past this break, so the lap time is identical.
      const cruise = length - x - brakeDist
      if (cruise > 0) t += cruise / v
      if (v > vOut) t += (v - vOut) / aBrake
      break
    }
    const dt = dv / a
    x += v * dt
    t += dt
    v += dv
  }
  return t
}

/**
 * Quasi-static lap time (raw seconds, unrounded) for `model` over `course` at
 * `powerPs` on `compound` tyres. A point-mass march: each corner is taken at
 * its grip-limited apex speed `sqrt(mu g r)` (capped at top speed), plus a
 * transition/agility cost that bites heavy, low-grip cars in tight corners
 * (a point mass has no yaw of its own), plus the straight that follows it
 * marched under the pace physics. Faithful port of the prototype's `lap`.
 */
export function lapTime(
  model: CarModel,
  course: Course,
  powerPs: number,
  compound: TyreCompound | undefined,
  economy: EconomyConfig,
  aeroEffect: AeroEffect = NO_AERO,
): number {
  const pace = economy.statFormulas.pace
  const grip = economy.statFormulas.grip
  const aero = economy.statFormulas.aero

  const block = carBlock(model, powerPs, compound, pace, grip, aeroEffect)
  const vTop = vTopOf(block, model, pace)

  const segments = course.segments
  const n = segments.length
  const apex = segments.map((s) =>
    Math.min(apexSpeed(block.mu, s[0], block.downforceCoeff, pace, aero), vTop),
  )

  let total = 0
  for (let i = 0; i < n; i++) {
    const [radiusM, angleDeg, straightM] = segments[i]!
    const arc = (radiusM * angleDeg * Math.PI) / 180
    total += arc / apex[i]!
    const tight =
      (angleDeg / pace.agilityAngleReferenceDeg) *
      clamp(
        pace.agilityRadiusReferenceM / radiusM,
        pace.agilityTightnessMin,
        pace.agilityTightnessMax,
      )
    total += ((pace.agilityWeight * (block.m / pace.agilityReferenceMassKg)) / block.mu) * tight
    const vIn = Math.min(apex[i]!, vTop)
    const vOut = Math.min(apex[(i + 1) % n]!, vTop)
    total += straightTime(block, vIn, vOut, straightM, pace, aero)
  }
  return total
}
