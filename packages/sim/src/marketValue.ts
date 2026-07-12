import {
  ALL_CAR_PART_IDS,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type EconomyConfig,
  type Part,
} from '@midnight-garage/content'
import { bandFactor, carCostToMintYen, isPartPresent } from './bands'

/**
 * Sprint 27 - the taste-free "what is this car worth" answer, shared by
 * every price in the game: `marketValueYen` = `instanceValue +
 * installedPartsValueYen`, where `instanceValue` is clean value (book value
 * scaled by age, mileage, and market heat - Sprint 30 decision 1 adds the
 * first two) minus a hassle-weighted restoration bill, floored. Replaces the
 * Sprint 26 cost-weighted band-factor shim entirely.
 */

/**
 * Piecewise-linear interpolation over ascending `[x, y]` breakpoints (Sprint
 * 30 decision 1): clamps to the first/last y outside the breakpoint range,
 * linearly interpolates between the two straddling `x` otherwise. Shared by
 * `ageFactor` and `mileageFactor` below - the same "designer draws a curve in
 * JSON" shape for both, so this lives once rather than twice.
 */
function interpolateCurve(breakpoints: readonly (readonly [number, number])[], x: number): number {
  const first = breakpoints[0]!
  if (x <= first[0]) return first[1]
  const last = breakpoints[breakpoints.length - 1]!
  if (x >= last[0]) return last[1]
  for (let i = 1; i < breakpoints.length; i++) {
    const [x1, y1] = breakpoints[i - 1]!
    const [x2, y2] = breakpoints[i]!
    if (x <= x2) {
      const t = (x - x1) / (x2 - x1)
      return y1 + t * (y2 - y1)
    }
  }
  return last[1]
}

/**
 * Decision 1: a car's age (`currentYear - car.year`, floored at 0 - a car
 * "from the future" relative to the in-game calendar can't happen in normal
 * play, but a hand-edited save or a fixture might) discounts clean value
 * along `economy.json`'s `valuation.ageFactorCurve` - gentle decline for the
 * first decade, then flatter (a 25-year-old JDM icon isn't worth less than a
 * 10-year-old one the way a modern used car would be; it's a future
 * classic). `currentYear` is the in-game calendar year
 * (`calendar.ts`'s `currentGameYear(state.reputationTier)`), threaded in by
 * every caller rather than read from state here - this module stays a pure
 * function of its arguments, same as every other value primitive in it.
 */
export function ageFactor(carYear: number, currentYear: number, economy: EconomyConfig): number {
  const ageYears = Math.max(0, currentYear - carYear)
  return interpolateCurve(economy.valuation.ageFactorCurve, ageYears)
}

/**
 * Decision 1: mileage discounts clean value along `economy.json`'s
 * `valuation.mileageFactorCurve` - roughly flat (even a small bonus) below
 * `auctions.ts`'s 30k roll floor, falling off toward its 180k roll ceiling.
 */
export function mileageFactor(mileageKm: number, economy: EconomyConfig): number {
  return interpolateCurve(economy.valuation.mileageFactorCurve, mileageKm)
}

/**
 * The restoration-bill deduction (decision 1):
 * `max(floor, cleanValue - hassleFactor * restorationBill)`, where
 * `cleanValue = bookValueYen * ageFactor * mileageFactor * (heatPercent /
 * 100)` (heat applies exactly once - the Sprint 21 heat-once law - nowhere
 * else in the game multiplies by market heat a second time; age/mileage join
 * it Sprint 30) and `restorationBill` is `carCostToMintYen` (bands.ts): the
 * sum of every present part's real cost to bring to mint - an unfitted
 * forced-induction slot contributes zero (an NA car isn't "missing" a
 * turbo), and a scrap part prices at its `stockReplacementPriceYen`
 * (bands.ts decision 5), since scrap has no repair path to draw a step cost
 * from. `hassleFactor` (above 1.0) means a buyer discounts MORE than the raw
 * bill - real buyers price in the hassle of getting work done, not just the
 * parts-and-labor total. `floor = floorFraction * cleanValue` - a wreck
 * whose bill would drive it below zero still has scrap-level worth, never
 * literally nothing.
 */
function instanceBaseValueYen(
  model: CarModel,
  car: CarInstance,
  heatPercent: number,
  currentYear: number,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const { hassleFactor, floorFraction } = economy.valuation
  const cleanValue =
    model.bookValueYen *
    ageFactor(car.year, currentYear, economy) *
    mileageFactor(car.mileageKm, economy) *
    (heatPercent / 100)
  const restorationBill = carCostToMintYen(car, partsTaxonomyById)
  const floor = floorFraction * cleanValue
  return Math.max(floor, cleanValue - hassleFactor * restorationBill)
}

/**
 * Installed parts add real yen, additively rather than multiplicatively
 * (decision 3 - real markets: mods return cents on the yen, they don't
 * multiply the chassis price). Per installed part instance:
 * `part.priceYen x partsRetention x bandFactor(installed.band) x
 * (genuinePeriod ? genuinePeriodMultiplier : 1.0)`, summed and rounded.
 * Sprint 26: `bandFactor` replaces the old `conditionPercent / 100`.
 */
export function installedPartsValueYen(
  car: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): number {
  const { partsRetention, genuinePeriodMultiplier } = economy.valuation
  let total = 0
  for (const partId of ALL_CAR_PART_IDS) {
    if (!isPartPresent(car, partId)) continue
    const installed = car.parts[partId].installed
    if (!installed) continue
    const part = partsById[installed.partId]
    if (!part) continue
    const genuineMultiplier = installed.genuinePeriod ? genuinePeriodMultiplier : 1.0
    total +=
      part.priceYen * partsRetention * bandFactor(installed.band, economy) * genuineMultiplier
  }
  return Math.round(total)
}

/**
 * The single shared value answer (Sprint 27 decision 1): `round(instanceValue)
 * + installedPartsValueYen`, where `instanceValue` is `instanceBaseValueYen`
 * above - clean value (now age/mileage/heat scaled, Sprint 30 decision 1)
 * minus the hassle-weighted restoration bill, floored. Heat applies exactly
 * once, inside clean value (decision 6, unchanged from Sprint 21) - no other
 * price in the game multiplies by market heat a second time. Every other
 * price (the auction anchor, walk-in offers, listing asking price, buyer
 * taste, bot walk-away targets) is this value times a bounded multiplier,
 * never a competing formula. `currentYear` is the in-game calendar year
 * (`calendar.ts`'s `currentGameYear`), needed only for `ageFactor` - every
 * caller already has a `GameState` to derive it from.
 */
export function marketValueYen(
  model: CarModel,
  car: CarInstance,
  heatPercent: number,
  currentYear: number,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const baseValue = Math.round(
    instanceBaseValueYen(model, car, heatPercent, currentYear, partsTaxonomyById, economy),
  )
  return baseValue + installedPartsValueYen(car, partsById, economy)
}
