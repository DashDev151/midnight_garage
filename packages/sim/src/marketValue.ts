import {
  ALL_CAR_PART_IDS,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type EconomyConfig,
  type Part,
} from '@midnight-garage/content'
import { carCostToMintYen } from './bands'

/**
 * Sprint 27 - the taste-free "what is this car worth" answer, shared by
 * every price in the game: `marketValueYen` = `instanceValue +
 * installedPartsValueYen`, where `instanceValue` is clean value (book value
 * scaled by mileage and market heat - Sprint 30 decision 1 added mileage;
 * a maintainer decision after Sprint 30 dropped car age from the value model
 * entirely, so a car's registration year is flavor text only now) minus a
 * hassle-weighted restoration bill, floored. Replaces the Sprint 26
 * cost-weighted band-factor shim entirely.
 */

/**
 * Piecewise-linear interpolation over ascending `[x, y]` breakpoints (Sprint
 * 30 decision 1): clamps to the first/last y outside the breakpoint range,
 * linearly interpolates between the two straddling `x` otherwise. Shared by
 * every curve-shaped factor in this module - `mileageFactor` below is the
 * only current user, but the shape ("designer draws a curve in JSON") is
 * generic.
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
 * Decision 1: mileage discounts clean value along `economy.json`'s
 * `valuation.mileageFactorCurve` - a small low-mileage bonus that flattens to
 * 1.0, then falls off with mileage, clamped to the first/last factor outside
 * the breakpoint range.
 */
export function mileageFactor(mileageKm: number, economy: EconomyConfig): number {
  return interpolateCurve(economy.valuation.mileageFactorCurve, mileageKm)
}

/**
 * The restoration-bill deduction (decision 1):
 * `max(floor, cleanValue - hassleFactor * restorationBill)`, where
 * `cleanValue = bookValueYen * mileageFactor * (heatPercent / 100)` (heat
 * applies exactly once - the Sprint 21 heat-once law - nowhere else in the
 * game multiplies by market heat a second time; mileage joined it Sprint 30 -
 * a maintainer decision after Sprint 30 dropped the matching age factor, so
 * a car's registration year no longer scales value at all) and
 * `restorationBill` is `carCostToMintYen` (bands.ts): the sum of every
 * present part's real cost to bring to mint - an unfitted forced-induction
 * slot contributes zero (an NA car isn't "missing" a turbo), and a scrap
 * part prices at its `stockReplacementPriceYen` (bands.ts decision 5), since
 * scrap has no repair path to draw a step cost from. `hassleFactor` (above
 * 1.0) means a buyer discounts MORE than the raw bill - real buyers price in
 * the hassle of getting work done, not just the parts-and-labor total.
 * `floor = floorFraction * cleanValue` - a wreck whose bill would drive it
 * below zero still has scrap-level worth, never literally nothing.
 */
function instanceBaseValueYen(
  model: CarModel,
  car: CarInstance,
  heatPercent: number,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const { hassleFactor, floorFraction } = economy.valuation
  const cleanValue =
    model.bookValueYen * mileageFactor(car.mileageKm, economy) * (heatPercent / 100)
  const restorationBill = carCostToMintYen(car, model, partsTaxonomyById)
  const floor = floorFraction * cleanValue
  return Math.max(floor, cleanValue - hassleFactor * restorationBill)
}

/**
 * Installed parts add real yen, additively rather than multiplicatively
 * (decision 3 - real markets: mods return cents on the yen, they don't
 * multiply the chassis price). Per installed part instance:
 * `part.priceYen x partsRetention x (genuinePeriod ? genuinePeriodMultiplier
 * : 1.0)`, summed and rounded.
 *
 * Sprint 34 (double-count fix, option A): NO `bandFactor(installed.band)`
 * discount here - a part's condition is priced exactly once, through the
 * restoration bill (`carCostToMintYen` inside `instanceBaseValueYen`), which
 * already counts every installed part's band. Applying it here too penalized
 * a worn aftermarket part on both sides, a swing exceeding the part's own
 * value. An aftermarket part therefore contributes its full retained mint
 * worth here, with one exception: a `scrap` part contributes ZERO - it cannot
 * be restored (`bands.ts` `canRepair`), and the bill already replaces it at
 * its stock price, so counting any retained value on top would double-count
 * it back in.
 *
 * Sprint 32 decision 4: a `grade === 'stock'` installed part contributes
 * NOTHING here - stock is the baseline every slot starts from, not an
 * upgrade, so an all-stock-mint car's value is exactly clean value (never
 * above it) and only genuine street/sport/race aftermarket pushes above
 * book. This is also why the old `isPartPresent` gate is gone: `installed`
 * being non-null already IS "present" now (Sprint 26's `fitted` flag no
 * longer exists), so checking it directly is enough.
 */
export function installedPartsValueYen(
  car: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): number {
  const { partsRetention, genuinePeriodMultiplier } = economy.valuation
  let total = 0
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = car.parts[partId].installed
    if (!installed) continue
    if (installed.band === 'scrap') continue
    const part = partsById[installed.partId]
    if (!part || part.grade === 'stock') continue
    const genuineMultiplier = installed.genuinePeriod ? genuinePeriodMultiplier : 1.0
    total += part.priceYen * partsRetention * genuineMultiplier
  }
  return Math.round(total)
}

/**
 * The single shared value answer (Sprint 27 decision 1): `round(instanceValue)
 * + installedPartsValueYen`, where `instanceValue` is `instanceBaseValueYen`
 * above - clean value (mileage/heat scaled, Sprint 30 decision 1; a
 * maintainer decision after Sprint 30 dropped car age from the value model
 * entirely) minus the hassle-weighted restoration bill, floored. Heat
 * applies exactly once, inside clean value (decision 6, unchanged from
 * Sprint 21) - no other price in the game multiplies by market heat a
 * second time. Every other price (the auction anchor, walk-in offers,
 * listing asking price, buyer taste, bot walk-away targets) is this value
 * times a bounded multiplier, never a competing formula.
 */
export function marketValueYen(
  model: CarModel,
  car: CarInstance,
  heatPercent: number,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const baseValue = Math.round(
    instanceBaseValueYen(model, car, heatPercent, partsTaxonomyById, economy),
  )
  return baseValue + installedPartsValueYen(car, partsById, economy)
}
