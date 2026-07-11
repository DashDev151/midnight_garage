import type {
  CarInstance,
  CarModel,
  ComponentId,
  EconomyConfig,
  Part,
} from '@midnight-garage/content'

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

/**
 * Sprint 21 — the taste-free "what is this car worth" answer, shared by
 * every price in the game (`marketValueYen` = `bookValueYen x
 * conditionFactor x heat + installedPartsValueYen`). This module is
 * deliberately issue-blind: hidden, unrepaired issues never discount this
 * value (Sprint 22 adds a separate `issueAdjustedValueYen` wrapper on top).
 */

/**
 * Weighted component condition run through a floor-to-ceiling curve
 * (decision 2): `floor + (ceiling - floor) x (weighted/100)^exponent`, where
 * `weighted = sum(componentValueWeights[c] x condition_c)`. Worked examples
 * (asserted exactly in marketValue.test.ts, economy.json's first-pass
 * values: floor 0.35, ceiling 1.10, exponent 1.3):
 *   weighted 0   -> 0.35 (a wreck still has scrap/chassis value)
 *   weighted 60  -> ~0.74
 *   weighted 100 -> 1.10 (a perfect restoration clears book value)
 */
export function conditionFactor(car: CarInstance, economy: EconomyConfig): number {
  const { componentValueWeights, conditionFloor, conditionCeiling, conditionExponent } =
    economy.valuation
  const weighted = COMPONENT_IDS.reduce(
    (sum, componentId) =>
      sum + componentValueWeights[componentId] * car.components[componentId].condition,
    0,
  )
  const range = conditionCeiling - conditionFloor
  return conditionFloor + range * Math.pow(weighted / 100, conditionExponent)
}

/**
 * Installed parts add real yen, additively rather than multiplicatively
 * (decision 3 — real markets: mods return cents on the yen, they don't
 * multiply the chassis price). Per installed part instance:
 * `part.priceYen x partsRetention x (conditionPercent/100) x
 * (genuinePeriod ? genuinePeriodMultiplier : 1.0)`, summed and rounded.
 */
export function installedPartsValueYen(
  car: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): number {
  const { partsRetention, genuinePeriodMultiplier } = economy.valuation
  let total = 0
  for (const componentId of COMPONENT_IDS) {
    const installed = car.components[componentId].installed
    if (!installed) continue
    const part = partsById[installed.partId]
    if (!part) continue
    const genuineMultiplier = installed.genuinePeriod ? genuinePeriodMultiplier : 1.0
    const conditionFraction = installed.conditionPercent / 100
    total += part.priceYen * partsRetention * conditionFraction * genuineMultiplier
  }
  return Math.round(total)
}

/**
 * The single shared value answer (decision 1): `round(bookValueYen x
 * conditionFactor x (heatPercent/100)) + installedPartsValueYen`. Heat
 * applies exactly once, here (decision 6) — no other price in the game
 * multiplies by market heat a second time. Every other price (the auction
 * anchor, walk-in offers, listing asking price, buyer taste) is this value
 * times a bounded multiplier, never a competing formula.
 */
export function marketValueYen(
  model: CarModel,
  car: CarInstance,
  heatPercent: number,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): number {
  const heatFraction = heatPercent / 100
  const baseValue = Math.round(model.bookValueYen * conditionFactor(car, economy) * heatFraction)
  return baseValue + installedPartsValueYen(car, partsById, economy)
}
