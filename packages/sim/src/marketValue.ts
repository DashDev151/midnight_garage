import {
  ALL_CAR_PART_IDS,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type EconomyConfig,
  type Part,
} from '@midnight-garage/content'
import { carCostToBandYen, carCostToMintYen } from './bands'

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
 * 1; re-sloped by Sprint 66 decision 7 as the law's tier-keyed amendment).
 *
 * The bill is the SAME mint-referenced `carCostToMintYen` the player sees on
 * screen as "restoration bill remaining" (Sprint 47's separate fine-referenced
 * `carValuationBillYen` retired in Sprint 54, so the displayed number and the
 * priced number are identical). Sprint 66 SPLITS that bill at the car's tier
 * expectation band (`valuation.expectationByTier`) and discounts the halves at
 * different rates:
 *
 *   base = cleanValue
 *        - marketRepairDiscount x billBelowExpectation
 *        - beyondDiscount       x billAboveExpectation
 *
 * Below the band the rate is `marketRepairDiscount` (1.5), `.min(1)`-enforced:
 * Law 1's guarantee that every repair yen returns more than itself is absolute
 * over the whole range the economy asks a player to repair. Above the band the
 * rate is the tier's own `beyondDiscount`, deliberately allowed below 1 -
 * restoring a shitbox kei to mint is passion spend, not investment. See the
 * `expectationByTier` schema doc for the full rationale.
 *
 * Two properties fall out rather than needing clamps:
 * - At `billToMintYen = 0` BOTH halves are zero, so this returns exactly
 *   `cleanValue`. A fully restored car can never be worth more than the
 *   identical clean car - Sprint 54's ceiling, structurally intact.
 * - The halves are `carCostToBandYen(expectation)` and the remainder, both
 *   derived from the one `costToBandYen` atom, so they always sum to the
 *   displayed bill exactly. The split can never invent or lose a yen.
 *
 * A small backstop floor (scrap-value fraction of clean, the same "pennies on
 * the yen" rate a single scrapped part sells for) guards only against a
 * near-total-scrap car's bill driving the raw formula negative - Law 2 (the
 * generation-time bill guard, auctions.ts) guarantees no generated car's bill
 * is ever large enough to actually reach it, and `beyondDiscount <=
 * marketRepairDiscount` (schema-enforced) means this split can only ever raise
 * the raw value, never push it closer to the floor.
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

  const expectation = expectationForCar(model, economy)
  const billToMintYen = carCostToMintYen(car, model, partsById, partsTaxonomyById, economy)
  const billBelowYen = carCostToBandYen(
    car,
    model,
    partsById,
    partsTaxonomyById,
    economy,
    expectation.band,
  )
  const billAboveYen = billToMintYen - billBelowYen

  const backstopFloor = economy.bands.scrapValueFraction * cleanValue
  const raw =
    cleanValue - marketRepairDiscount * billBelowYen - expectation.beyondDiscount * billAboveYen
  return Math.max(backstopFloor, raw)
}

/**
 * The market's expectation of this car (Sprint 66, economy-bible.md law 1 as
 * amended): which condition band it is worth repairing to, how much a yen
 * spent past that returns, and how much of an aftermarket premium the market
 * credits on this kind of car at all.
 *
 * Keyed on the car's fitment class, which IS its roster tier
 * (`fitmentClassForTier`) - the same identity Law 3's parts pricing uses, so a
 * car's expectations and its parts costs can never disagree about what kind of
 * car it is.
 */
export function expectationForCar(model: CarModel, economy: EconomyConfig) {
  const fitmentClass = fitmentClassForTier(model.tier)
  const expectation = economy.valuation.expectationByTier[fitmentClass]
  if (!expectation) {
    // The schema requires every class, so this is unreachable with real
    // content; failing loudly beats silently pricing a car as if it had no
    // expectations at all.
    throw new Error(`valuation.expectationByTier is missing fitment class "${fitmentClass}"`)
  }
  return expectation
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
 * released premium.
 *
 * Sprint 66 (law 5 as amended) adds the premium's second multiplier,
 * `aftermarketReturn` - the tier's own answer to "is this the kind of car
 * anyone pays extra to modify?". A race turbo on a kei returns a fraction of
 * its cost; on a rare car, all of it. The two multipliers ask different
 * questions and compose: `foundationFactor` is about whether this SPECIFIC car
 * is trustworthy, `aftermarketReturn` about whether this KIND of car rewards
 * modification. Both are capped at 1, so the premium term can only ever be
 * withheld, never inflated.
 *
 * Every other price (the auction anchor, walk-in offers, listing asking price,
 * buyer taste, bot walk-away targets) is this value times a bounded
 * multiplier, never a competing formula.
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
  const creditedPremiumYen =
    foundationFactor(car, economy) *
    expectationForCar(model, economy).aftermarketReturn *
    premiumYen
  return baseValue + Math.round(creditedPremiumYen)
}
