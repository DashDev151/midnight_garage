import {
  layoutTagOf,
  type CarInstance,
  type CarModel,
  type EconomyConfig,
  type Part,
  type TyreCompound,
} from '@midnight-garage/content'

/** The handling model's content block - every grip, balance, and display-curve
 * constant. */
type GripConfig = EconomyConfig['statFormulas']['grip']

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
