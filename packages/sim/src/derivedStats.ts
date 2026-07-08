import type { CarInstance, CarModel, Part, Slot, StatBlock } from '@midnight-garage/content'

const SLOTS: readonly Slot[] = [
  'engine',
  'forcedInduction',
  'drivetrain',
  'suspension',
  'brakes',
  'bodyAero',
  'wheelsInterior',
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
 */
export function computeDerivedStats(
  model: CarModel,
  instance: CarInstance,
  partsById: Readonly<Record<string, Part>>,
): StatBlock {
  let power = model.spec.stockPowerPs * (0.5 + 0.5 * (instance.condition.engine / 100))
  let handling = 50 * (instance.condition.suspension / 100) - model.spec.curbWeightKg / 50
  let style = (instance.condition.body / 100) * 20
  let reliability = 70 * ((instance.condition.engine + instance.condition.drivetrain) / 200)
  let authenticity = instance.authenticityPercent

  for (const slot of SLOTS) {
    const installed = instance.buildSheet[slot]
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
