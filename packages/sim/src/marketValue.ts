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
 * The restoration-bill deduction (Sprint 54 decision 1, economy-bible.md law
 * 1 - replaces Sprint 47's two-slope premium): ONE slope, always above 1 -
 * `marketRepairDiscount` (1.2 first-pass) yen of guide value per yen of
 * `billToMintYen` (`carCostToMintYen`, bands.ts - the SAME mint-referenced
 * bill the player sees on screen as "restoration bill remaining"; Sprint 47's
 * separate fine-referenced `carValuationBillYen` retires, so the displayed
 * number and the priced number are now identical). At `billToMintYen = 0`
 * (fully restored, no missing/scrap/worn parts) this returns exactly
 * `cleanValue` - a fully restored car can never be worth more than the
 * identical clean car; the ceiling is structural, not a clamp. A small
 * backstop floor (scrap-value fraction of clean, the same "pennies on the
 * yen" rate a single scrapped part sells for) guards only against a
 * near-total-scrap car's bill driving the raw formula negative - Law 2 (the
 * generation-time bill guard, auctions.ts) guarantees no generated car's
 * bill is ever large enough to actually reach this floor.
 *
 * `cleanValue = bookValueYen * mileageFactor * (heatPercent / 100)` (heat
 * applies exactly once - the Sprint 21 heat-once law; mileage joined it
 * Sprint 30 - a maintainer decision after Sprint 30 dropped the matching age
 * factor, so a car's registration year no longer scales value at all).
 */
function instanceBaseValueYen(
  model: CarModel,
  car: CarInstance,
  heatPercent: number,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const { marketRepairDiscount } = economy.valuation
  const cleanValue =
    model.bookValueYen * mileageFactor(car.mileageKm, economy) * (heatPercent / 100)
  const billToMintYen = carCostToMintYen(car, model, partsById, partsTaxonomyById, economy)
  const backstopFloor = economy.bands.scrapValueFraction * cleanValue
  return Math.max(backstopFloor, cleanValue - marketRepairDiscount * billToMintYen)
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
 * Sprint 60 (economy-bible.md law 5 - the foundation law): the multiplier
 * applied to the aftermarket premium before it counts toward market value,
 * = the factor of the SINGLE WORST foundational part on the car. One
 * deathtrap element (scrap brakes, a missing tyre, a rusted-through
 * underbody) poisons the whole premium - a mean would let chrome buy back
 * trust a real buyer would never extend. Foundational parts and their
 * per-state factors are content (`valuation.foundation`); a slot with no
 * installed part reads as `missing` (its own worst state). Pure over
 * `(car, economy)` - reads only condition bands and missing state.
 */
export function foundationFactor(car: CarInstance, economy: EconomyConfig): number {
  const { parts, factorByState } = economy.valuation.foundation
  let worst = 1
  for (const partId of parts) {
    const installed = car.parts[partId].installed
    const state = installed ? installed.band : 'missing'
    const factor = factorByState[state]
    if (factor < worst) worst = factor
  }
  return worst
}

/**
 * The single shared value answer (Sprint 27 decision 1): `round(instanceValue)
 * + foundationFactor x installedPartsValueYen`, where `instanceValue` is
 * `instanceBaseValueYen` above - clean value (mileage/heat scaled, Sprint 30
 * decision 1; a maintainer decision after Sprint 30 dropped car age from the
 * value model entirely) minus the hassle-weighted restoration bill, floored.
 * Heat applies exactly once, inside clean value (decision 6, unchanged from
 * Sprint 21) - no other price in the game multiplies by market heat a
 * second time. Sprint 60 (law 5): the aftermarket premium is scaled by
 * `foundationFactor` - a buyer withholds what they'd pay for the extras until
 * the car's foundations (brakes, tyres, steering, chassis, rust) are sound;
 * the base term is untouched, so the repair economy (Law 1) is unchanged and
 * fixing a failed foundation part returns its own repair value PLUS the
 * released premium. Every other price (the auction anchor, walk-in offers,
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
    instanceBaseValueYen(model, car, heatPercent, partsById, partsTaxonomyById, economy),
  )
  const premiumYen = installedPartsValueYen(car, partsById, economy)
  return baseValue + Math.round(foundationFactor(car, economy) * premiumYen)
}
