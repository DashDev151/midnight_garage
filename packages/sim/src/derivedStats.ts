import {
  ALL_CAR_PART_IDS,
  type CarInstance,
  type CarModel,
  type CarPartTaxonomyEntry,
  type EconomyConfig,
  type Part,
  type StatBlock,
} from '@midnight-garage/content'
import { bandFactor, isPartPresent } from './bands'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

type StatKey = 'power' | 'handling' | 'style' | 'reliability'

/**
 * Sprint 26 decision 8: how well a stat is served by the car's real parts -
 * a weighted mean of `bandFactor` across every taxonomy part that
 * contributes to `stat` at all (`statWeights[stat] > 0`), weighted by that
 * part's own weight. Self-derives from `parts-taxonomy.json`'s `statWeights`
 * rather than a second, hand-maintained list of "which parts feed power" -
 * one source of truth (content law), so a part's stat contribution can never
 * drift out of sync between the taxonomy and this formula. An unfitted
 * forced-induction slot (`isPartPresent`) simply drops out of `power`'s
 * weighted mean, same as decision 8's "FI when fitted." Returns 1 (as if
 * every contributing part were mint) when nothing on the car contributes to
 * `stat` at all, so a degenerate taxonomy entry never divides by zero.
 */
function weightedBandFactorForStat(
  car: CarInstance,
  stat: StatKey,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): number {
  let weightedSum = 0
  let totalWeight = 0
  for (const entry of partsTaxonomy) {
    const weight = entry.statWeights[stat]
    if (!weight || !isPartPresent(car, entry.id)) continue
    weightedSum += weight * bandFactor(car.parts[entry.id].band, economy)
    totalWeight += weight
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 1
}

/**
 * First-pass, transparent linear formula (GDD 4.2: "no hidden math the
 * player can't reason about"), pending real numbers from the balance
 * harness. `partsById` resolves each installed PartInstance's
 * statModifiers from the parts catalog - sim has no data loader of its
 * own, so the caller supplies it.
 *
 * Sprint 21 decision 8: the five magic numbers below (power's condition
 * floor, handling's base/weight-divisor, style's cap, reliability's cap)
 * live in `economy.json.statFormulas`.
 *
 * Sprint 26 decision 8: every condition input is now
 * `weightedBandFactorForStat` above, self-derived from the taxonomy's own
 * `statWeights` rather than a fixed per-stat component list - power from
 * engine parts (ignitionEcu, camsTiming, intake, exhaust, internals, FI
 * when fitted), handling from suspension and tyres, reliability from engine
 * and drivetrain with cooling emphasized (its own higher authored weight),
 * style from body, interior, and rims. The old `effectiveComponentCondition`
 * (hidden-issue-aware) read is gone with the paused issue system - a part's
 * `band` is now the single, un-adjusted truth this formula reads.
 */
export function computeDerivedStats(
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  economy: EconomyConfig,
): StatBlock {
  const { powerConditionFloor, handlingBase, handlingWeightDivisor, styleCap, reliabilityCap } =
    economy.statFormulas

  const powerFraction = weightedBandFactorForStat(instance, 'power', partsTaxonomy, economy)
  const powerConditionScale = powerConditionFloor + (1 - powerConditionFloor) * powerFraction
  let power = model.spec.stockPowerPs * powerConditionScale

  const handlingFraction = weightedBandFactorForStat(instance, 'handling', partsTaxonomy, economy)
  let handling = handlingBase * handlingFraction - model.spec.curbWeightKg / handlingWeightDivisor

  const styleFraction = weightedBandFactorForStat(instance, 'style', partsTaxonomy, economy)
  let style = styleFraction * styleCap

  const reliabilityFraction = weightedBandFactorForStat(
    instance,
    'reliability',
    partsTaxonomy,
    economy,
  )
  let reliability = reliabilityCap * reliabilityFraction

  let authenticity = instance.authenticityPercent

  for (const partId of ALL_CAR_PART_IDS) {
    const installed = instance.parts[partId].installed
    if (!installed) continue
    const part = partsById[installed.partId]
    if (!part) continue

    const wear = bandFactor(installed.band, economy)
    power += part.statModifiers.power * wear
    handling += part.statModifiers.handling * wear
    style += part.statModifiers.style * wear
    reliability += part.statModifiers.reliability * wear
    // GDD 5.3: genuine period parts add authenticity; reproductions never
    // add it, though a non-genuine part's *penalty* (a negative modifier)
    // still applies - modification away from stock hurts either way.
    authenticity += installed.genuinePeriod
      ? part.statModifiers.authenticity
      : Math.min(0, part.statModifiers.authenticity)
  }

  return {
    power: Math.round(Math.max(0, power)),
    handling: Math.round(clamp(handling, 0, 100)),
    style: Math.round(clamp(style, 0, 100)),
    reliability: Math.round(clamp(reliability, 0, 100)),
    authenticity: Math.round(clamp(authenticity, 0, 100)),
  }
}
