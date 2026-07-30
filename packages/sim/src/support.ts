import {
  ALL_CAR_PART_IDS,
  SubsystemSchema,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type EconomyConfig,
  type Part,
  type Subsystem,
} from '@midnight-garage/content'
import { engineCharacterOf } from './derivedStats'

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
  /** The grade-only specification this slot supports with. Never
   * band-scaled: specification does not decay, a worn forged conrod is
   * still stronger than a stock cast one. */
  spec: number
}

const ZERO_CONTRIBUTION: SlotContribution = { gain: 0, spec: 0 }

/**
 * One slot's demand and support inputs. Both read the fitted GRADE only,
 * never the band - see `SlotContribution.gain`'s own doc comment for why
 * demand no longer band-scales. A slot the catalogue cannot resolve -
 * empty, or an installed part id the catalogue no longer knows - contributes
 * nothing on either side, matching `buildFactors`'s existing rule that an
 * unknown part id can never silently move anything.
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
  const spec = economy.statFormulas.support.specByGrade[part.grade]
  return { gain, spec }
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
 * small naturally-aspirated gain than a large forced-induction one. A
 * stock car sits at exactly 1.0 on every subsystem by construction: every
 * gain is 0, so `demand = 1` everywhere, the margin term is `margin * 0 =
 * 0` regardless of the margin's value, and every spec is 0, so `support =
 * demand = 1` everywhere.
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
  const engineCharacter = engineCharacterOf(model, economy)
  const contributions = {} as Record<CarPartId, SlotContribution>
  let totalGain = 0
  for (const partId of ALL_CAR_PART_IDS) {
    const contribution = slotContribution(car, partId, partsById, economy, engineCharacter)
    contributions[partId] = contribution
    totalGain += contribution.gain
  }

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
