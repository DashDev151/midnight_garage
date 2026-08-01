import {
  ComponentIdSchema,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type ComponentId,
  type DamageGrade,
  type DamagePattern,
  type EconomyConfig,
  type PanelZoneId,
  type Symptom,
} from '@midnight-garage/content'
import { pickWeighted, type Rng } from './rng'

/**
 * A damage pattern is a WEIGHTING OVER PART SLOTS and nothing else
 * (docs/design/systems/generation-damage.md, layer 3). This module is the whole
 * of how that weighting is read; the two things that read it -
 * `spendDamageBudget` and `applySymptoms`, both in `auctions.ts` - share every
 * function here rather than each deriving its own notion of "where".
 *
 * The direction of causation only runs one way and it is the point of the
 * layer: the car's rolled HISTORY draws a pattern, and the pattern is the cause
 * of both the damage the car carries and the symptom it presents. Nothing here
 * ever reads a car's parts to infer anything, because damage and symptom are
 * both effects of the same event rather than evidence of each other.
 */

const COMPONENT_IDS = ComponentIdSchema.options

/**
 * Which pattern this car's history left behind, drawn from the grade's own
 * authored row (`damageGrades.patternWeightsByGrade`). A `tidy` car mostly has
 * no story at all and draws `garaged`; a `project` car got that way for a
 * reason and mostly draws the shunt or the let-go engine.
 *
 * One draw off the same seeded stream every other generation roll uses.
 */
export function rollDamagePattern(
  history: DamageGrade,
  economy: EconomyConfig,
  patterns: readonly DamagePattern[],
  rng: Rng,
): DamagePattern {
  const weights = economy.partsGeneration.damageGrades.patternWeightsByGrade[history]
  return pickWeighted(patterns, (pattern) => weights[pattern.id], rng)
}

/**
 * How hard this pattern pulls on one taxonomy group, RELATIVE to an even
 * weighting: exactly 1 for a pattern that implicates every group equally, above
 * 1 for a group it ruins, below 1 for one it leaves alone. Normalising here is
 * what lets a pattern's weights be authored as plain readable numbers (they sum
 * to 100 by convention, and are never required to) while every consumer reads a
 * comparable quantity.
 */
export function relativeGroupWeight(pattern: DamagePattern, group: ComponentId): number {
  const { groups } = pattern.slotWeights
  const total = COMPONENT_IDS.reduce((sum, id) => sum + groups[id], 0)
  if (total <= 0) return 1
  return (groups[group] / total) * COMPONENT_IDS.length
}

/**
 * Which taxonomy group this pattern's next step of damage lands in, drawn from
 * its own group row over the groups `candidates` actually still offers.
 *
 * THE DRAW IS OVER GROUPS, NOT OVER SLOTS, and that is load-bearing. Weighting
 * the individual slots inside the damage budget's least-damaged set instead
 * measures as doing nothing at all: the shallow-first rule takes every eligible
 * part to a band before it takes any part below it, so a per-slot weighting
 * only ever reorders a level it is going to finish anyway. Drawing the group
 * first and letting shallow-first spread WITHIN it keeps both properties that
 * matter: the budget still never ruins one part while its neighbours sit mint,
 * and a shunted car's gearbox is genuinely what the budget never got to.
 *
 * A group with no live candidate left is dropped from the roll rather than
 * re-rolled, exactly as `rollCarTier` drops an unstocked price band: identical
 * distribution, one draw, and it cannot fail to terminate.
 */
export function pickPatternGroup(
  candidates: readonly CarPartId[],
  pattern: DamagePattern,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  rng: Rng,
): ComponentId {
  const available = COMPONENT_IDS.filter((group) =>
    candidates.some((partId) => partsTaxonomyById[partId].group === group),
  )
  return pickWeighted(available, (group) => pattern.slotWeights.groups[group], rng)
}

/** Which of `candidates` this pattern's damage lands on, weighted by its own
 * body-zone row - the fix for damage that used to land on `bonnet` every single
 * time, whatever had happened to the car. */
export function pickPatternZone(
  candidates: readonly PanelZoneId[],
  pattern: DamagePattern,
  rng: Rng,
): PanelZoneId {
  return pickWeighted(candidates, (zoneId) => pattern.slotWeights.zones[zoneId], rng)
}

/**
 * The five panel zones ordered worst-first for this pattern: a weighted draw
 * without replacement, so the zones it implicates most tend to come out at the
 * front. `rollZoneStates` deals its already-rolled severities along this order,
 * which is how a car ends up damaged at the front rather than evenly all over
 * while carrying exactly the damage its tier tables rolled for it.
 */
export function zoneDamageOrder(
  zones: readonly PanelZoneId[],
  pattern: DamagePattern,
  rng: Rng,
): PanelZoneId[] {
  const remaining = [...zones]
  const order: PanelZoneId[] = []
  while (remaining.length > 0) {
    const zoneId = pickWeighted(remaining, (id) => pattern.slotWeights.zones[id], rng)
    order.push(zoneId)
    remaining.splice(remaining.indexOf(zoneId), 1)
  }
  return order
}

/**
 * How many condition percent this pattern moves each of `partIds` by: down on
 * the groups it implicates, up on the groups it spares, and summing to exactly
 * zero across the list. Generation adds these to the per-part condition roll,
 * which is the pattern's main grip on where a car's damage sits.
 *
 * It needs one, and the reason is arithmetic. The damage BUDGET is a minority
 * of a car's band steps (measured at about a fifth of them) and the condition
 * roll is the rest; a pattern that reached only the budget could not move a
 * group's total by much however exactly it spent it. Nor is REARRANGING the
 * rolled percents enough on its own: every part jitters around one baseline, so
 * a car's own spread is narrow, and handing the worst ten of twenty-six rolled
 * conditions to a single group measures at 1.22x that group's flat share, which
 * is the hard ceiling on any permutation. Moving the roll clears it.
 *
 * The offset is centred on the part-count-weighted mean, so it redistributes
 * condition rather than adding any: a grenaded car's engine is worse than the
 * car it sits in AND its interior is better, which is both the honest reading
 * of the event and what keeps the pattern answering WHERE while the history
 * still owns HOW MUCH. A pattern that implicates every group equally weights
 * every group at exactly 1, every offset is exactly zero, and the condition
 * roll is left precisely as it was.
 *
 * Weighting per PART rather than per group is load-bearing: `relativeGroupWeight`
 * is a property of the group, so every slot inside it moves together and a
 * group holding one slot cannot soak the same swing as one holding ten.
 */
export function patternConditionOffsets(
  partIds: readonly CarPartId[],
  pattern: DamagePattern,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  swingPercent: number,
): Record<string, number> {
  if (partIds.length === 0) return {}
  const relative = partIds.map((partId) =>
    relativeGroupWeight(pattern, partsTaxonomyById[partId].group),
  )
  const mean = relative.reduce((sum, value) => sum + value, 0) / relative.length
  const offsets: Record<string, number> = {}
  partIds.forEach((partId, index) => {
    offsets[partId] = -swingPercent * (relative[index]! - mean)
  })
  return offsets
}

/**
 * How much this symptom's causes sit in the groups the pattern implicates,
 * relative to an even weighting: the weighted mean of `relativeGroupWeight`
 * over the symptom's own cause list, using each cause's authored odds.
 *
 * A symptom with several causes spread across the car (the damp footwell, whose
 * causes run from the heater matrix to a rotten bulkhead seam) therefore reads
 * as partly implicated by several patterns, which is true of the symptom itself.
 */
export function symptomPatternAffinity(
  symptom: Symptom,
  pattern: DamagePattern,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
): number {
  const totalWeight = symptom.causes.reduce((sum, cause) => sum + cause.weight, 0)
  if (totalWeight <= 0) return 1
  let affinity = 0
  for (const cause of symptom.causes) {
    const group = partsTaxonomyById[cause.carPartId].group
    affinity += (cause.weight / totalWeight) * relativeGroupWeight(pattern, group)
  }
  return affinity
}

/**
 * One candidate symptom's draw weight on a car carrying this pattern: a linear
 * blend between an even draw and a fully pattern-proportional one, governed by
 * the single `patternSymptomBias` lever.
 *
 * At bias 0 this is the uniform draw the game had before layer 3; at bias 1 a
 * symptom's odds are strictly its affinity, which would make a car's fault
 * nearly a function of its history. The blend keeps every symptom REACHABLE on
 * every car (the floor is `1 - bias` of an even draw, and no authored pattern
 * weights a group at zero), because a front-end car that turns out to have a
 * tired gearbox is a real car, and a diagnosis game where the history gives the
 * answer away is not a game.
 */
export function symptomDrawWeight(
  symptom: Symptom,
  pattern: DamagePattern,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  bias: number,
): number {
  return 1 - bias + bias * symptomPatternAffinity(symptom, pattern, partsTaxonomyById)
}
