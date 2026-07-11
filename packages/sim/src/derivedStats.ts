import type {
  CarInstance,
  CarModel,
  ComponentId,
  EconomyConfig,
  HiddenIssue,
  Part,
  StatBlock,
} from '@midnight-garage/content'
import { effectiveComponentCondition } from './issues'

const COMPONENT_IDS: readonly ComponentId[] = [
  'engine',
  'forcedInduction',
  'drivetrain',
  'suspension',
  'brakes',
  'wheels',
  'body',
  'interior',
]

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * First-pass, transparent linear formula (GDD 4.2: "no hidden math the
 * player can't reason about"), pending real numbers from the Sprint 3
 * balance harness. `partsById` resolves each installed PartInstance's
 * statModifiers from the parts catalog — sim has no data loader of its
 * own, so the caller supplies it (built once from data/parts.json, or a
 * small test fixture).
 *
 * Sprint 12: only engine/suspension/body/drivetrain condition ever fed a
 * stat formula before the zones+slots -> components migration — brakes,
 * wheels, and forcedInduction never had a condition-to-stat pathway (only
 * their installed part's own statModifiers counted), and interior condition
 * never fed anything either. Deliberately kept that way here: wiring the 3
 * new condition fields into stats now would be a disguised balance change
 * smuggled into a refactor. They're tracked and readable; nothing consumes
 * them for stats until Sprint 13 gives repair-vs-replace on those
 * components real stakes.
 *
 * Sprint 21 decision 8: the five magic numbers below (power's condition
 * floor, handling's base/weight-divisor, style's cap, reliability's cap)
 * moved to `economy.json.statFormulas` — same values, zero behavior change.
 * Value no longer flows through these formulas at all (see marketValue.ts);
 * they now decide buyer *taste* only (valuation.ts), so whether the caps
 * themselves should rise is a taste-tuning question, deferred.
 *
 * Sprint 22 decision 2: every condition read here is EFFECTIVE condition —
 * a component whose raw `condition` is 100 but carries an unrepaired hidden
 * issue still drags these stats down, the same as any other low-condition
 * component. `issuesById` resolves each rolled issue's componentId (the
 * instance stores only `issueId`).
 */
export function computeDerivedStats(
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  issuesById: Readonly<Record<string, HiddenIssue>>,
  economy: EconomyConfig,
): StatBlock {
  const { components } = instance
  const { powerConditionFloor, handlingBase, handlingWeightDivisor, styleCap, reliabilityCap } =
    economy.statFormulas
  const effective = (componentId: ComponentId) =>
    effectiveComponentCondition(instance, componentId, issuesById)
  const engineConditionFraction = effective('engine') / 100
  const powerConditionScale =
    powerConditionFloor + (1 - powerConditionFloor) * engineConditionFraction
  let power = model.spec.stockPowerPs * powerConditionScale
  let handling =
    handlingBase * (effective('suspension') / 100) - model.spec.curbWeightKg / handlingWeightDivisor
  let style = (effective('body') / 100) * styleCap
  const reliabilityCondition = (effective('engine') + effective('drivetrain')) / 200
  let reliability = reliabilityCap * reliabilityCondition
  let authenticity = instance.authenticityPercent

  for (const componentId of COMPONENT_IDS) {
    const installed = components[componentId].installed
    if (!installed) continue
    const part = partsById[installed.partId]
    if (!part) continue

    const wear = installed.conditionPercent / 100
    power += part.statModifiers.power * wear
    handling += part.statModifiers.handling * wear
    style += part.statModifiers.style * wear
    reliability += part.statModifiers.reliability * wear
    // GDD 5.3: genuine period parts add authenticity; reproductions never
    // add it, though a non-genuine part's *penalty* (a negative modifier)
    // still applies — modification away from stock hurts either way.
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
