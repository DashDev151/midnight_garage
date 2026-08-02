import {
  ALL_CAR_PART_IDS,
  GradeSchema,
  SubsystemSchema,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type EconomyConfig,
  type Grade,
  type Part,
  type Subsystem,
} from '@midnight-garage/content'
import { engineCharacterOf } from './derivedStats'
import { machiningSpecOf } from './machining'
import {
  aeroGripMultiplier,
  effectiveCompound,
  effectiveDownforce,
  effectiveGrip,
  factoryDownforceCoeff,
  type BuildFactors,
  type ConditionFactors,
} from './performance'

/**
 * The headline support verdict for a build: the lowest of the five
 * subsystem ratios, which subsystem it belongs to, and which band that
 * ratio falls in. `subsystem` is deterministic on a tie - see
 * `supportVerdict`'s own doc comment.
 */
export interface SupportVerdict {
  headline: number
  band: 'adequate' | 'strained' | 'dangerous'
  subsystem: Subsystem
}

interface SlotContribution {
  /** The GRADE-only output fraction this slot drives demand with -
   * `powerFraction[engineCharacter]`, never band-scaled and never
   * multiplied by stock power (a fraction of output, not a PS figure).
   * Reads grade, matching `spec` below: band-scaling demand let a worn gain
   * part demand LESS of the bottom end its own hardware is rated for, which
   * raised the coherence factor - and so reliability - as the part aged.
   * The fitted grade is what sets what the build asks of the car; wear
   * already has its own route into reliability, through the condition
   * mean. */
  gain: number
  /** The specification this slot supports with: what the fitted GRADE gives,
   * plus what has been machined into the part on top of it. Never
   * band-scaled: specification does not decay, a worn forged conrod is
   * still stronger than a stock cast one, and a wire-ringed deck stays
   * wire-ringed. Machining belongs to exactly that category, which is why it
   * adds here rather than anywhere else. */
  spec: number
}

const ZERO_CONTRIBUTION: SlotContribution = { gain: 0, spec: 0 }

/**
 * One slot's demand and support inputs. Both read the fitted GRADE, never the
 * band - see `SlotContribution.gain`'s own doc comment for why demand no
 * longer band-scales. A slot the catalogue cannot resolve - empty, or an
 * installed part id the catalogue no longer knows - contributes nothing on
 * either side, matching `buildFactors`'s existing rule that an unknown part id
 * can never silently move anything.
 *
 * `spec` takes a second source: whatever has been machined into the fitted
 * part. It is ADDED to the grade's own contribution rather than replacing it,
 * which is the smallest opening that makes machining reach support at all - a
 * machined original part still carries grade `stock`, whose `specByGrade` is
 * 0, so without this the two power-free operations would be literally inert.
 * `gain` deliberately takes no machining term: the machining charge on
 * reliability is levied once, on the build-intensity factor
 * (`reliabilityIntensityFactor`, derivedStats.ts).
 */
function slotContribution(
  car: CarInstance,
  partId: CarPartId,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
  engineCharacter: ReturnType<typeof engineCharacterOf>,
): SlotContribution {
  const installed = car.parts[partId].installed
  if (!installed) return ZERO_CONTRIBUTION
  const part = partsById[installed.partId]
  if (!part) return ZERO_CONTRIBUTION
  const gain = part.statModifiers.powerFraction[engineCharacter]
  const spec =
    economy.statFormulas.support.specByGrade[part.grade] + machiningSpecOf(installed, economy)
  return { gain, spec }
}

/**
 * Every slot's demand/support inputs, walked once, plus the sum of every
 * fitted part's own `gain` across the whole car (`totalGain`). This is the
 * ONE accumulation both `supportRatios` (below) and `totalGainFractionOf`
 * read - never duplicated, so a future change to the walk (a new slot, a
 * changed contribution rule) cannot desync the two callers.
 */
function computeContributions(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): { contributions: Record<CarPartId, SlotContribution>; totalGain: number } {
  const engineCharacter = engineCharacterOf(model, economy)
  const contributions = {} as Record<CarPartId, SlotContribution>
  let totalGain = 0
  for (const partId of ALL_CAR_PART_IDS) {
    const contribution = slotContribution(car, partId, partsById, economy, engineCharacter)
    contributions[partId] = contribution
    totalGain += contribution.gain
  }
  return { contributions, totalGain }
}

/**
 * The sum of every fitted part's own `powerFraction[engineCharacter]`
 * across every car part slot - how much total power gain a build asks of
 * the car, independent of what supports it. `supportRatios` needs exactly
 * this figure as the driver behind three of its five demand terms
 * (`fuelling`, `heat`, `torqueTransmission`); this is the SAME
 * `computeContributions` walk, exposed so the reliability derivation's
 * build-intensity term (`derivedStats.ts`) reads one implementation rather
 * than recomputing the sum a second time. Exactly 0 on a stock car (no
 * aftermarket part fitted anywhere).
 */
export function totalGainFractionOf(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): number {
  return computeContributions(car, model, partsById, economy).totalGain
}

/**
 * The five per-subsystem support ratios, `ratio = support / demand`
 * (design section 6). Demand is what the build's own gains ask of a
 * subsystem; support is what the fitted specification on that subsystem's
 * named slots provides, ON TOP OF the car's own factory headroom.
 *
 * The factory headroom is `stockSupportMargin * (demand[s] - 1)`,
 * proportional to what the build actually demands rather than a flat
 * constant - a flat headroom would cover proportionally far more of a
 * small naturally-aspirated gain than a large forced-induction one. An
 * unmachined stock car sits at exactly 1.0 on every subsystem by
 * construction: every gain is 0, so `demand = 1` everywhere, the margin term
 * is `margin * 0 = 0` regardless of the margin's value, and every spec is 0,
 * so `support = demand = 1` everywhere. Machining is what can lift a stock
 * slot's spec off 0, and only where a player has put it.
 *
 * The dual-role convention (design section 6c) is structural here, not
 * merely documented: within one subsystem a slot is a demander or a
 * supporter, never both, but the SAME slot may demand one subsystem while
 * supporting a different one (a bored block raises fuelling/heat/torque
 * demand through its own gain while supporting cylinder pressure through
 * its own grade).
 */
export function supportRatios(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): Record<Subsystem, number> {
  const { contributions, totalGain } = computeContributions(car, model, partsById, economy)

  const { demandWeights, demandDrivers, supportWeights, stockSupportMargin } =
    economy.statFormulas.support

  // WHICH slot(s) drive a subsystem's demand is content (`demandDrivers`),
  // not a hard-coded fact of this function - a future part joins a
  // subsystem's demand side by editing `economy.json`, never this file.
  const driverGain = (subsystem: Subsystem): number => {
    const driver = demandDrivers[subsystem]
    return driver.kind === 'total' ? totalGain : contributions[driver.slot].gain
  }

  const demand = {} as Record<Subsystem, number>
  for (const subsystem of SubsystemSchema.options) {
    demand[subsystem] = 1 + demandWeights[subsystem] * driverGain(subsystem)
  }

  // The factory-headroom baseline: proportional to each subsystem's OWN
  // demand, computed after `demand` above so it can read it.
  const stockSupport = (subsystem: Subsystem): number =>
    1 + stockSupportMargin * (demand[subsystem] - 1)

  const support: Record<Subsystem, number> = {
    cylinderPressure:
      stockSupport('cylinderPressure') +
      supportWeights.cylinderPressure.internals * contributions.internals.spec +
      supportWeights.cylinderPressure.block * contributions.block.spec,
    fuelling:
      stockSupport('fuelling') + supportWeights.fuelling.fuelSystem * contributions.fuelSystem.spec,
    heat: stockSupport('heat') + supportWeights.heat.cooling * contributions.cooling.spec,
    revs:
      stockSupport('revs') +
      supportWeights.revs.headValvetrain * contributions.headValvetrain.spec +
      supportWeights.revs.internals * contributions.internals.spec,
    torqueTransmission:
      stockSupport('torqueTransmission') +
      supportWeights.torqueTransmission.clutch * contributions.clutch.spec +
      supportWeights.torqueTransmission.gearbox * contributions.gearbox.spec +
      supportWeights.torqueTransmission.driveline * contributions.driveline.spec +
      supportWeights.torqueTransmission.differential * contributions.differential.spec,
  }

  const ratios = {} as Record<Subsystem, number>
  for (const subsystem of SubsystemSchema.options) {
    ratios[subsystem] = support[subsystem] / demand[subsystem]
  }
  return ratios
}

/**
 * The headline verdict: the minimum of the five subsystem ratios, the band
 * it falls in, and which subsystem is named. Ties break in
 * `SubsystemSchema`'s declared order (cylinderPressure, fuelling, heat,
 * revs, torqueTransmission), so the named subsystem is deterministic - a
 * non-deterministic name would make the readout flicker between otherwise
 * identical builds.
 */
export function supportVerdict(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): SupportVerdict {
  const ratios = supportRatios(car, model, partsById, economy)
  let subsystem: Subsystem = SubsystemSchema.options[0]!
  let headline = ratios[subsystem]
  for (const candidate of SubsystemSchema.options) {
    if (ratios[candidate] < headline) {
      headline = ratios[candidate]
      subsystem = candidate
    }
  }
  const { adequateAtOrAbove, strainedAtOrAbove } = economy.statFormulas.support.thresholds
  const band =
    headline >= adequateAtOrAbove
      ? 'adequate'
      : headline >= strainedAtOrAbove
        ? 'strained'
        : 'dangerous'
  return { headline, band, subsystem }
}

/**
 * The five slots whose fitted grade decides how much cornering grip a build
 * makes, and therefore how much the rest of the car is asked to cope with.
 */
const GRIP_SLOTS: readonly CarPartId[] = ['tyres', 'dampers', 'springs', 'antiRollBars', 'aero']

/** The two slots that share the brake half of the chassis-support shortfall. */
const BRAKE_SLOTS: readonly CarPartId[] = ['brakePadsDiscs', 'brakeCalipersLines']

/**
 * Where one slot's fitted SKU sits on the grade ladder, as an index into
 * `GradeSchema.options`. An empty slot, or one carrying a part id the
 * catalogue cannot resolve, reads `stock` - the same rule `buildFactors`
 * follows, so an unknown SKU can never silently move the physics.
 */
function gradeRankOf(
  car: CarInstance,
  partId: CarPartId,
  partsById: Readonly<Record<string, Part>>,
): number {
  const installed = car.parts[partId].installed
  const grade: Grade = (installed && partsById[installed.partId]?.grade) || 'stock'
  return GradeSchema.options.indexOf(grade)
}

/**
 * The fraction of the mechanical grip a build makes that it can actually use:
 * 1 when the parts controlling the grip are up to the grade of the parts that
 * made it, and less than 1 when they are not. `derivedStats.ts` folds this
 * into the build's own grip factor, so the handling readout and the lap time
 * spend one number and cannot contradict each other.
 *
 *     required = highest grade fitted across `GRIP_SLOTS`
 *     missing  = sum of `share` over the support slots below `required`
 *     usable   = factory + gain * (1 - lossByGrade[required] * missing)
 *
 * A steering rack does not create grip, it lets a car use grip it already
 * has, which is why this is a proportion of what the build GAINED rather than
 * an amount subtracted from what it makes. A proportion of a bigger gain is
 * still bigger, so a race build unsupported cannot fall below a supported
 * sport one: the ladder holds by construction rather than by tuning, which a
 * flat penalty does not.
 *
 * Three properties the arithmetic delivers rather than special-cases:
 *
 * - **A stock car is exactly untouched**, twice over. Its `required` grade is
 *   `stock`, whose loss is pinned at 0, and its gain is 0 because a stock
 *   build IS the factory reference it is measured against.
 * - **A downgrade passes through whole.** Three shipped cars leave the
 *   factory on rubber better than a street SKU maps to, so fitting street
 *   tyres genuinely makes them worse. Their gain is negative and the early
 *   return leaves them alone: clamping the gain to zero would erase the
 *   downgrade, and multiplying a negative gain would let missing support
 *   IMPROVE the car.
 * - **Rot is not an exit.** The factory reference is read at the car's OWN
 *   condition, so a tired car shows the smaller gain a tired car really
 *   makes, and loses its share of that. Against a mint reference every rough
 *   car would show no gain at all and dodge the model entirely.
 *
 * Gain is measured in EFFECTIVE grip - mechanical grip times the downforce
 * multiplier at the display curve's own reference speed - and converted back
 * to mechanical grip on the way out. A wing loads a car at speed and demands
 * brakes and steering exactly as rubber does; measured mechanically it would
 * be the single largest handling upgrade in the game and exempt from the
 * whole model.
 */
export function usableGripFraction(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
  condition: ConditionFactors,
  build: BuildFactors,
): number {
  const { grip, aero, chassisSupport } = economy.statFormulas

  let requiredRank = 0
  for (const slot of GRIP_SLOTS) {
    requiredRank = Math.max(requiredRank, gradeRankOf(car, slot, partsById))
  }
  const lossFraction = chassisSupport.lossByGrade[GradeSchema.options[requiredRank]!]
  if (lossFraction <= 0) return 1

  const { brakes, steering, chassis } = chassisSupport.share
  let missingShare = 0
  for (const slot of BRAKE_SLOTS) {
    if (gradeRankOf(car, slot, partsById) < requiredRank)
      missingShare += brakes / BRAKE_SLOTS.length
  }
  if (gradeRankOf(car, 'steering', partsById) < requiredRank) missingShare += steering
  if (gradeRankOf(car, 'chassis', partsById) < requiredRank) missingShare += chassis
  if (missingShare <= 0) return 1

  const referenceSpeedMs = grip.displayCurve.displayReferenceSpeedKmh / 3.6
  const effectiveAt = (mu: number, downforceCoeff: number): number =>
    mu * aeroGripMultiplier(referenceSpeedMs, downforceCoeff * condition.aero, aero)

  const factory = effectiveAt(
    effectiveGrip(model, model.spec.tyreCompound, grip, aero, condition.grip),
    factoryDownforceCoeff(model, aero),
  )
  const built = effectiveAt(
    effectiveGrip(
      model,
      effectiveCompound(car, model, partsById, grip),
      grip,
      aero,
      condition.grip * build.grip,
    ),
    effectiveDownforce(car, model, partsById, aero).downforceCoeff,
  )

  const gain = built - factory
  if (!(gain > 0) || !(built > 0)) return 1
  return Math.max(0, Math.min(1, 1 - (gain * lossFraction * missingShare) / built))
}
