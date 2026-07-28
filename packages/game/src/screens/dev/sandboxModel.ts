import {
  ALL_CAR_PART_IDS,
  GradeSchema,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type ConditionBand,
  type Grade,
  type RarityTier,
  type StatBlock,
} from '@midnight-garage/content'
import {
  buildFactors,
  carBlock,
  carOriginLabel,
  computeDerivedStats,
  currentGameYear,
  drivetrainOf,
  effectiveCompound,
  effectiveDownforce,
  enginePositionOf,
  hasForcedInduction,
  lapBlockers,
  lapTimeSecondsFor,
  makeCarOrigin,
  marketValueYen,
  mileageRangeForAge,
  normalizedPowerScore,
  partFitsCar,
  physicalConditionFactors,
  stockInstanceFor,
  type ConditionFactors,
  type Drivetrain,
  type EnginePosition,
  type SimContext,
} from '@midnight-garage/sim'
import { SANDBOX_ROSTER, type SandboxTierSource } from './sandboxCars'

/**
 * THE PERFORMANCE SANDBOX'S MODEL LAYER.
 *
 * Every number this returns is the output of a named function in
 * `packages/sim`, called on the real content: there is no second expression of
 * the physics or of what a car is worth here, and there must never be one. If a
 * figure is wanted that the sim does not already compute, the sim is where it
 * gets computed.
 *
 * The 26 in-game cars are read from `context.modelsById`. The other 59 come
 * from `sandboxCars.ts`, generated from the spec book by
 * `tools/sandbox/generateCars.mjs`; the sim never sees a difference between
 * them, because both are plain `CarModel`s passed in explicitly.
 *
 * Stateless by design: the screen owns the build, the tier overrides, the
 * mileage and heat in force, and the caching (Vue computeds already memoise on
 * their dependencies).
 */

/** Neutral market heat: at 100 a retail figure is the car's own worth and
 * nothing the market is doing that week. Where the heat control starts. */
export const DEFAULT_HEAT_PERCENT = 100

/** The heat control's bounds, in per cent, either side of neutral. */
export const HEAT_PERCENT_RANGE = [50, 150] as const

/** The mileage control's bounds, in km: past both ends of
 * `valuation.mileageFactorCurve`, so the whole curve and both of its flat
 * tails are reachable. */
export const MILEAGE_RANGE_KM = [0, 250_000] as const

export const CONDITION_BANDS = ['scrap', 'poor', 'worn', 'fine', 'mint'] as const
/** The condition control's six positions: the five bands, plus an empty slot. */
export const SLOT_STATES = ['missing', ...CONDITION_BANDS] as const
export type SlotState = (typeof SLOT_STATES)[number]
export const GRADES = GradeSchema.options
export const TIERS = [
  'shitbox',
  'common',
  'uncommon',
  'rare',
  'gaisha',
  'legend',
] as const satisfies readonly RarityTier[]

/** One slot of a sandbox build: a fitted part at a condition band and a grade,
 * or an empty slot. */
export type Slot = { band: ConditionBand; grade: Grade } | { missing: true }
export type SandboxBuild = Record<CarPartId, Slot>

/** True for an empty slot and for a slot that is not there at all, so the false
 * branch is a fitted part with both axes set. */
export function isMissing(slot: Slot | undefined): slot is { missing: true } | undefined {
  return !slot || 'missing' in slot
}

/** A slot's two axes flattened for display and comparison. */
export function slotView(slot: Slot | undefined): { state: SlotState; grade: Grade } {
  if (isMissing(slot)) return { state: 'missing', grade: 'stock' }
  return { state: slot.band, grade: slot.grade }
}

/** What the spec book measured, for display beside what the model derives from
 * it. Null where the car publishes nothing. */
export interface MeasuredFigures {
  lateralG97: number | null
  lateralG193: number | null
  braking97To0M: number | null
  braking161To0M: number | null
  zeroTo97S: number | null
  zeroTo161S: number | null
  topSpeedKmh: number | null
  stockPowerPs: number
  curbWeightKg: number
  weightDistributionFront: number | null
  dragCd: number | null
  measuredFrom: string | null
}

export interface SandboxCar {
  id: string
  displayName: string
  year: number
  /** The spec book's roster section, e.g. `Kei`, `FR / Drift`, `Hyper wave`. */
  section: string
  /** False for the 59 research entries that are not in the game. */
  inGame: boolean
  /** The tier the car starts at, before any override. */
  defaultTier: RarityTier
  /** Where `defaultTier` came from: the car's real `cars.json` value, a mapping
   * derived from the in-game 26, or a judgement call. */
  tierSource: SandboxTierSource
  drivetrain: Drivetrain
  enginePosition: EnginePosition
  aspiration: string | null
  /** The mileage the control starts this car at, before any change. */
  defaultMileageKm: number
  measured: MeasuredFigures
  /** The model at its default tier. Use `modelAtTier` to move it. */
  model: CarModel
}

/**
 * The mileage a car's control starts at: the midpoint of the range the auction
 * generator would roll for a car of this age (`mileageRangeForAge`, off
 * `economy.json`'s own curves), with age taken against the campaign's opening
 * year. A car newer than that reads as age zero and gets the curve's lowest
 * mileage. Mileage is a property of one car instance rather than of the model,
 * so the screen owns the figure in force and this is only where it begins.
 */
export function defaultMileageKm(model: CarModel, context: SimContext): number {
  const ageYears = Math.max(0, currentGameYear('unknown') - model.spec.yearFrom)
  const [min, max] = mileageRangeForAge(ageYears, context.economy)
  return Math.round((min + max) / 2)
}

/** All 85 in spec-book order: the 26 real ones from content, the 59 research
 * entries from the generated roster. */
export function sandboxCars(context: SimContext): SandboxCar[] {
  const cars: SandboxCar[] = []
  for (const entry of SANDBOX_ROSTER) {
    const model = entry.model ?? context.modelsById[entry.id]
    if (!model) continue
    const spec = model.spec
    cars.push({
      id: model.id,
      displayName: model.displayName,
      year: spec.yearFrom,
      section: entry.section,
      inGame: entry.inGame,
      defaultTier: model.tier,
      tierSource: entry.tierSource,
      drivetrain: drivetrainOf(model),
      enginePosition: enginePositionOf(model),
      aspiration: spec.aspiration ?? null,
      defaultMileageKm: defaultMileageKm(model, context),
      measured: {
        lateralG97: spec.lateralG97 ?? null,
        lateralG193: spec.lateralG193 ?? null,
        braking97To0M: spec.braking97To0M ?? null,
        braking161To0M: spec.braking161To0M ?? null,
        zeroTo97S: spec.zeroTo97S ?? null,
        zeroTo161S: spec.zeroTo161S ?? null,
        topSpeedKmh: spec.topSpeedKmh ?? null,
        stockPowerPs: spec.stockPowerPs,
        curbWeightKg: spec.curbWeightKg,
        weightDistributionFront: spec.weightDistributionFront ?? null,
        dragCd: spec.dragCd ?? null,
        measuredFrom: spec.measuredFrom ?? null,
      },
      model,
    })
  }
  return cars
}

/**
 * The car at a chosen roster tier. Tier decides nothing about the physics on
 * its own: it selects which of the four shared fitment classes of parts the car
 * can be offered. Returns a copy, so `cars.json`'s own 26 are never mutated.
 */
export function modelAtTier(car: SandboxCar, tier: RarityTier): CarModel {
  return tier === car.model.tier ? car.model : { ...car.model, tier }
}

/**
 * Which grades each slot can actually take on this car: the catalogue filtered
 * by `partFitsCar`, the sim's one fit rule (right slot, required tags, and the
 * car's own fitment class). Keyed in taxonomy order, grades in ladder order.
 */
export function fittableGrades(
  model: CarModel,
  context: SimContext,
): Record<CarPartId, readonly Grade[]> {
  const result = {} as Record<CarPartId, readonly Grade[]>
  for (const entry of context.partsTaxonomy) {
    result[entry.id] = GRADES.filter((grade) =>
      context.parts.some(
        (part) =>
          part.grade === grade &&
          partFitsCar(part, model, entry.group, context.partsTaxonomyById, entry.id),
      ),
    )
  }
  return result
}

/**
 * Every slot mint and stock: the state the car's measured figures describe.
 * `forcedInduction` is empty on a car with no factory turbo or supercharger,
 * which is legitimate absence rather than a defect, and is exactly what the
 * game's own generator does with that slot.
 */
export function defaultBuild(model: CarModel): SandboxBuild {
  const build = {} as SandboxBuild
  for (const partId of ALL_CAR_PART_IDS) {
    build[partId] =
      partId === 'forcedInduction' && !hasForcedInduction(model)
        ? { missing: true }
        : { band: 'mint', grade: 'stock' }
  }
  return build
}

/**
 * A `CarInstance` for `model` in the state `build` describes.
 *
 * Stock slots go through `stockInstanceFor` (`auctions.ts`), the same helper
 * every generated car fills a slot with; an aftermarket slot takes the
 * catalogue's own SKU for that part, class and grade and carries the identical
 * `PartInstance` shape.
 *
 * `authenticityPercent` is 100 rather than the auction generator's 60 to 95
 * roll: a sandbox car with every original part fitted IS untouched, and
 * anything that moves the number from there is then visibly the build's doing.
 */
export function buildCarInstance(
  model: CarModel,
  build: SandboxBuild,
  mileageKm: number,
  context: SimContext,
): CarInstance {
  const fitmentClass = fitmentClassForTier(model.tier)
  const id = `sandbox-${model.id}`
  const origin = makeCarOrigin(id, carOriginLabel(model, model.spec.yearFrom), 0)
  const parts = {} as CarInstance['parts']

  for (const partId of ALL_CAR_PART_IDS) {
    const slot = build[partId]
    if (isMissing(slot)) {
      parts[partId] = { installed: null }
      continue
    }
    if (slot.grade === 'stock') {
      parts[partId] = {
        installed: stockInstanceFor(
          partId,
          slot.band,
          `${id}-part`,
          fitmentClass,
          context.stockPartByCarPartId,
          origin,
        ),
      }
      continue
    }
    const part = context.aftermarketPartByCarPartId[fitmentClass]?.[partId]?.[slot.grade]
    parts[partId] = {
      installed: part
        ? {
            id: `${id}-part-${partId}`,
            partId: part.id,
            band: slot.band,
            genuinePeriod: false,
            origin,
          }
        : null,
    }
  }

  return {
    id,
    modelId: model.id,
    year: model.spec.yearFrom,
    mileageKm,
    color: 'White',
    provenanceNote: '',
    authenticityPercent: 100,
    parts,
    symptoms: [],
    apparentBandByPartId: null,
  }
}

/** The derived quantities a lap actually runs on, read straight off `carBlock`,
 * the sim's own assembly of them. */
export interface PhysicalFigures {
  /** Mechanical lateral grip coefficient. */
  mechanicalGrip: number
  /** Downforce coefficient in play; 0 is a car with no aero at all. */
  downforceCoeff: number
  /** Braking grip coefficient, a separate quantity from mechanical grip. */
  brakingCoeff: number
  /** Longitudinal launch-traction plateau, m/s^2. */
  launchAccelMs2: number
  /** Effective through-the-gears wheel power, W. */
  effectiveWheelPowerW: number
  /** Drag area, Cd by frontal area, m^2. */
  dragAreaM2: number
  /** Kerb mass as built, plus the driver, kg. */
  massKg: number
}

/** A part currently stopping the car being driven at all. */
export interface Blocker {
  partId: CarPartId
  displayName: string
  reason: string
}

/**
 * What the car is worth, full retail: `marketValueYen`, the market value of the
 * car, not a buyer's taste-adjusted offer.
 *
 * BOTH ARE NULL FOR THE 59 RESEARCH ENTRIES, and that is the whole reason this
 * type is nullable. `marketValueYen` is built on the model's `bookValueYen`,
 * which a research entry does not have; the generated model carries a
 * placeholder there because the physics never reads it, and putting a book value
 * on a car the game does not sell would be inventing an economy number. A
 * missing value is an honest answer and a fabricated one is not.
 */
export interface CarValue {
  /** The same car with every slot mint and stock, at the same mileage and the
   * same market heat. */
  stockMintYen: number | null
  /** This build. */
  currentYen: number | null
}

export interface Evaluation {
  stats: StatBlock
  /** `stats.power` on the 0 to 100 scale the other four stats already read on:
   * the sim's own `normalizedPowerScore`, as a percentage. Uncapped, so a car
   * past the normalisation ceiling reads past 100. */
  powerScore: number
  physical: PhysicalFigures
  conditionFactors: ConditionFactors
  /** Seconds per course, or null on a course this build cannot run. */
  laps: Record<string, number | null>
  /** Empty when the car can run. */
  blockers: Blocker[]
  value: CarValue
}

/** Why a slot is stopping the car, in the words the state warrants. */
function blockerReason(partId: CarPartId, build: SandboxBuild): string {
  const slot = build[partId]
  if (isMissing(slot)) return 'nothing fitted'
  if (slot.band === 'scrap') return 'scrap'
  return 'no catalogue part fits this slot'
}

/**
 * Everything the screen shows for one build, from the same functions the game
 * calls: `computeDerivedStats` for the five stats, `normalizedPowerScore` for
 * power on the other four's scale, `carBlock` for the physical quantities the
 * lap runs on, `physicalConditionFactors` for the four dials,
 * `lapTimeSecondsFor` per course, `lapBlockers` for why a car cannot run, and
 * `marketValueYen` for what it is worth.
 *
 * `mileageKm` and `heatPercent` are the instance and the market the car is
 * PRICED at: both reach `marketValueYen` and nothing else, so neither can move
 * a stat, a physical figure or a lap time.
 */
export function evaluateBuild(
  model: CarModel,
  build: SandboxBuild,
  priceable: boolean,
  mileageKm: number,
  heatPercent: number,
  context: SimContext,
): Evaluation {
  const { economy, partsById, partsTaxonomy, partsTaxonomyById } = context
  const car = buildCarInstance(model, build, mileageKm, context)

  const stats = computeDerivedStats(model, car, partsById, partsTaxonomy, economy)
  const condition = physicalConditionFactors(car, model, partsTaxonomy, economy)
  const block = carBlock(
    model,
    stats.power,
    effectiveCompound(car, model, partsById, economy.statFormulas.grip),
    economy.statFormulas.pace,
    economy.statFormulas.grip,
    economy.statFormulas.aero,
    effectiveDownforce(car, model, partsById, economy.statFormulas.aero),
    condition,
    buildFactors(car, partsById),
  )

  const laps: Record<string, number | null> = {}
  for (const course of context.courses) {
    laps[course.id] = lapTimeSecondsFor(car, model, context, course.id)
  }

  const blockers: Blocker[] = lapBlockers(car, context).map((partId) => ({
    partId,
    displayName: partsTaxonomyById[partId].displayName,
    reason: blockerReason(partId, build),
  }))

  const stockMint = buildCarInstance(model, defaultBuild(model), mileageKm, context)
  const valueOf = (instance: CarInstance): number | null =>
    priceable
      ? marketValueYen(model, instance, heatPercent, partsById, partsTaxonomyById, economy)
      : null

  return {
    stats,
    powerScore: normalizedPowerScore(stats.power, economy) * 100,
    physical: {
      mechanicalGrip: block.mu,
      downforceCoeff: block.downforceCoeff,
      brakingCoeff: block.brakeMu,
      launchAccelMs2: block.launchAccel,
      effectiveWheelPowerW: block.effectivePowerW,
      dragAreaM2: block.cdA,
      massKg: block.m,
    },
    conditionFactors: condition,
    laps,
    blockers,
    value: { stockMintYen: valueOf(stockMint), currentYen: valueOf(car) },
  }
}

/**
 * THE BUILD CODE.
 *
 * The router runs on memory history with no URL coupling (the game ships in an
 * itch.io iframe where URL routing fights the embedding), so a build is shared
 * as a string that is copied rather than as a link. One character per slot: six
 * condition positions by four tiers is 21 states including missing, so all 29
 * components cost 29 characters.
 */
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const CODE_VERSION = 'v1'

export interface DecodedBuildCode {
  carId: string
  tier: RarityTier
  build: SandboxBuild
}

export function encodeBuildCode(carId: string, tier: RarityTier, build: SandboxBuild): string {
  let slots = ''
  for (const partId of ALL_CAR_PART_IDS) {
    const slot = build[partId]
    if (isMissing(slot)) {
      slots += CODE_ALPHABET[0]
      continue
    }
    const band = CONDITION_BANDS.indexOf(slot.band)
    const grade = GRADES.indexOf(slot.grade)
    slots += band < 0 || grade < 0 ? CODE_ALPHABET[0] : CODE_ALPHABET[1 + band * 4 + grade]
  }
  return [CODE_VERSION, carId, tier, slots].join('|')
}

/** Null on anything that is not a build code this version wrote for a car that
 * exists. A pasted string is never trusted into the screen's state. */
export function decodeBuildCode(
  code: string,
  cars: readonly SandboxCar[],
): DecodedBuildCode | null {
  const parts = code.trim().split('|')
  if (parts.length !== 4) return null
  const [version, carId, tier, slots] = parts
  if (version !== CODE_VERSION || !carId || !slots) return null
  const car = cars.find((entry) => entry.id === carId)
  if (!car) return null
  if (!tier || !(TIERS as readonly string[]).includes(tier)) return null
  if (slots.length !== ALL_CAR_PART_IDS.length) return null

  const build = defaultBuild(car.model)
  for (const [i, partId] of ALL_CAR_PART_IDS.entries()) {
    const index = CODE_ALPHABET.indexOf(slots[i] ?? '')
    if (index < 0 || index > CONDITION_BANDS.length * 4) return null
    if (index === 0) {
      build[partId] = { missing: true }
      continue
    }
    const n = index - 1
    const band = CONDITION_BANDS[Math.floor(n / 4)]
    const grade = GRADES[n % 4]
    if (!band || !grade) return null
    build[partId] = { band, grade }
  }
  return { carId, tier: tier as RarityTier, build }
}
