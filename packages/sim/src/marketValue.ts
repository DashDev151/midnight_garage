import {
  ALL_CAR_PART_IDS,
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type ConditionBand,
  type EconomyConfig,
  type Part,
} from '@midnight-garage/content'
import {
  carCostToBandYen,
  carCostToMintYen,
  clampRepairTarget,
  repairCeilingForLevel,
} from './bands'
import { coherenceFactorFor } from './derivedStats'
import { supportVerdict } from './support'

/**
 * The taste-free "what is this car worth" answer, shared by every price in
 * the game: `marketValueYen` = `stagedValue + creditedPremiumYen`, where
 * `stagedValue` is clean value (book value scaled by mileage and market
 * heat; car age plays no part - a car's registration year is flavor text
 * only) minus a hassle-weighted restoration bill, floored (Stage B), then
 * discounted for an unsupported build's own failure risk (Stage C, the
 * coherence discount); `creditedPremiumYen` is the installed-parts premium,
 * scaled by a retention curve that rewards a coherent build and penalises an
 * incoherent one (Stage D), by the foundation factor, and by the tier's own
 * aftermarket return. See `docs/design/systems/sale-value-system.md` section
 * 3 for the design of record.
 */

/**
 * Piecewise-linear interpolation over ascending `[x, y]` breakpoints: clamps
 * to the first/last y outside the range, interpolates between the two
 * straddling `x` otherwise. Shared by every curve-shaped factor in this
 * module - `mileageFactor` below is the only current user, but the shape
 * ("designer draws a curve in JSON") is generic.
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

/** Mileage discounts clean value along `economy.json`'s
 * `valuation.mileageFactorCurve` - a small low-mileage bonus that flattens
 * to 1.0, then falls off with mileage. */
export function mileageFactor(mileageKm: number, economy: EconomyConfig): number {
  return interpolateCurve(economy.valuation.mileageFactorCurve, mileageKm)
}

/**
 * Stage A of `marketValueYen`: a car's clean value before any restoration
 * bill is deducted - `bookValueYen` scaled by the mileage curve and by
 * current market heat (`heatPercent`, 100 = neutral). This is the single
 * definition of a car's clean value in the codebase;
 * `duplicateFormulaBan.test.ts` bans every other file under
 * `packages/sim/src` from re-deriving it by combining `bookValueYen` with
 * `mileageFactor(` directly - callers that need it at a fixed, heat-neutral
 * baseline (a generation-time guard, a closed-form roster probe) pass
 * `heatPercent: 100` rather than reimplementing the formula.
 */
export function cleanValueYen(
  bookValueYen: number,
  mileageKm: number,
  heatPercent: number,
  economy: EconomyConfig,
): number {
  return bookValueYen * mileageFactor(mileageKm, economy) * (heatPercent / 100)
}

/**
 * The restoration-bill deduction (economy-bible.md law 1).
 *
 * The bill is the SAME mint-referenced `carCostToMintYen` the player sees on
 * screen as "restoration bill remaining". The bill SPLITS at the car's tier
 * expectation band (`valuation.expectationByTier`) and discounts the halves
 * at different rates:
 *
 *   base = cleanValue
 *        - marketRepairDiscount x billBelowExpectation
 *        - beyondDiscount       x billAboveExpectation
 *
 * Below the band the rate is `marketRepairDiscount` (>= 1): Law 1's
 * guarantee that every repair yen returns more than itself, over the whole
 * range the economy asks a player to repair. Above the band the rate is the
 * tier's own `beyondDiscount`, deliberately allowed below 1 - restoring a
 * shitbox kei to mint is passion spend, not investment. See the
 * `expectationByTier` schema doc for the full rationale.
 *
 * Two properties fall out rather than needing clamps:
 * - At `billToMintYen = 0` BOTH halves are zero, so this returns exactly
 *   `cleanValue`. A fully restored car can never be worth more than the
 *   identical clean car.
 * - The halves are `carCostToBandYen(expectation)` and the remainder, both
 *   derived from the one `costToBandYen` atom, so they always sum to the
 *   displayed bill exactly. The split can never invent or lose a yen.
 *
 * A small backstop floor (scrap-value fraction of clean, the same "pennies
 * on the yen" rate a single scrapped part sells for) guards only against a
 * near-total-scrap car's bill driving the raw formula negative - the
 * generation-time bill guard (Law 2, auctions.ts) guarantees no generated
 * car's bill is ever large enough to actually reach it.
 *
 * `cleanValue = cleanValueYen(bookValueYen, mileageKm, heatPercent, economy)` -
 * heat applies exactly once, and car age plays no part in it at all.
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
  const cleanValue = cleanValueYen(model.bookValueYen, car.mileageKm, heatPercent, economy)

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
 * The market's expectation of this car (economy-bible.md law 1): which
 * condition band it is worth repairing to, how much a yen spent past that
 * returns, and how much of an aftermarket premium the market credits on
 * this kind of car at all.
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
 * How far it is worth repairing `model`: the band the market expects of its
 * tier (`expectationForCar`), clamped down to what a fresh shop's tier-1 tools
 * can actually finish (`repairCeilingForLevel`). Every yen spent past the
 * expectation returns only `beyondDiscount` on the yen, so this band is where
 * repair stops paying for itself and passion spend begins; the clamp is a
 * no-op for any tier whose expectation already sits at or below the tier-1
 * ceiling. The one target both "the sensible play" probes plan to.
 */
export function sensibleRepairTargetBand(model: CarModel, economy: EconomyConfig): ConditionBand {
  return clampRepairTarget(
    expectationForCar(model, economy).band,
    repairCeilingForLevel(1, economy),
  )
}

/**
 * Stage D's retention curve (design section 3D): a part's contribution
 * toward market value scales linearly with how well the whole build is
 * supported - `retentionFloor` at `coherenceFactor` 0 to `retentionCeiling`
 * at `coherenceFactor` 1. Replaces the old flat retention constant: a
 * bodged build's parts are worth a fraction of their catalog price, a
 * coherent one's are worth MORE than it (`retentionCeiling` is deliberately
 * above 1). Not reduced by buyer tolerance (Stage C's own dial) - a bodged
 * install is a bodged install to everyone, never a matter of taste.
 */
export function retentionFor(coherenceFactor: number, economy: EconomyConfig): number {
  const { retentionFloor, retentionCeiling } = economy.valuation
  return retentionFloor + (retentionCeiling - retentionFloor) * coherenceFactor
}

/**
 * Installed parts add real yen, additively rather than multiplicatively -
 * real markets: mods return cents on the yen, they don't multiply the
 * chassis price. Per installed part instance: `part.priceYen x retention x
 * (genuinePeriod ? genuinePeriodMultiplier : 1.0)`, summed and rounded.
 * `retention` is the caller's own Stage D figure (`retentionFor` above) -
 * this function only spends it, so its summation shape stays exactly what it
 * was when the retention it multiplied by was a flat constant.
 *
 * NO `bandFactor(installed.band)` discount here - a part's condition is
 * priced exactly once, through the restoration bill (`carCostToMintYen`
 * inside `instanceBaseValueYen`), which already counts every installed
 * part's band. A `scrap` part contributes ZERO - it cannot be restored, and
 * the bill already replaces it at its stock price, so counting any retained
 * value on top would double-count it.
 *
 * A `grade === 'stock'` installed part contributes NOTHING here - stock is
 * the baseline every slot starts from, not an upgrade, so an all-stock-mint
 * car's value is exactly clean value and only genuine street/sport/race
 * aftermarket pushes above book, regardless of `retention`'s value.
 */
export function installedPartsValueYen(
  car: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
  retention: number,
): number {
  const { genuinePeriodMultiplier } = economy.valuation
  let total = 0
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = car.parts[partId].installed
    if (!installed) continue
    if (installed.band === 'scrap') continue
    const part = partsById[installed.partId]
    if (!part || part.grade === 'stock') continue
    const genuineMultiplier = installed.genuinePeriod ? genuinePeriodMultiplier : 1.0
    total += part.priceYen * retention * genuineMultiplier
  }
  return Math.round(total)
}

/**
 * Economy-bible.md law 5 (the foundation law): the multiplier applied to
 * the aftermarket premium before it counts toward market value = the factor
 * of the SINGLE WORST foundational part on the car. One deathtrap element
 * (scrap brakes, a missing tyre, a rusted-through underbody) poisons the
 * whole premium - a mean would let chrome buy back trust a real buyer would
 * never extend. Foundational parts and their per-state factors are content
 * (`valuation.foundation`); a slot with no installed part reads as
 * `missing` (its own worst state).
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
 * The single shared value answer: `stagedValue + foundationFactor x
 * aftermarketReturn x installedPartsValueYen`.
 *
 * `stagedValue` is Stage C applied to `instanceBaseValueYen` (Stage B, clean
 * value mileage/heat scaled minus the hassle-weighted restoration bill,
 * floored - heat applies exactly once, inside clean value, no other price in
 * the game multiplies by market heat a second time): the market discounts an
 * unsupported build's own failure risk,
 * `coherenceDiscount = coherenceDiscountWeight * (1 - coherenceFactor) *
 * coherenceTolerance`, zero on a stock or fully-coherent build since
 * `coherenceFactor` is 1 there.
 *
 * The aftermarket premium (Stage D) is `installedPartsValueYen`, itself
 * scaled by the coherence-driven retention curve (`retentionFor`), then
 * scaled again by `foundationFactor` (law 5: a buyer withholds what they'd
 * pay for the extras until the car's foundations - brakes, tyres, steering,
 * chassis, rust - are sound; the base term is untouched, so fixing a failed
 * foundation part returns its own repair value PLUS the released premium)
 * and by `aftermarketReturn`, the tier's own answer to "is this the kind of
 * car anyone pays extra to modify?" - a race turbo on a kei returns a
 * fraction of its cost, on a rare car all of it. `foundationFactor` and
 * `aftermarketReturn` are both capped at 1, so they can only ever withhold
 * the premium, never inflate it; `retentionCeiling` is the one place the
 * premium is deliberately allowed to exceed the parts' own catalog price.
 *
 * `coherenceTolerance` defaults to 1.0 - the market's own view, not an
 * accident. Every buyer-agnostic caller (the auction anchor, diagnosis
 * pricing, the balance probes, taste-blind exits) gets this default and is
 * correct; only `valuateCarForBuyer` and `valuateCarForBuyerViaChannel` pass
 * a buyer's own tolerance (the stancer ignores the discount entirely, the
 * tuner halves it), read from `economy.valuation.tolerance`.
 *
 * Every other price (the auction anchor, walk-in offers, listing asking
 * price, buyer taste, bot walk-away targets) is this value times a bounded
 * multiplier, never a competing formula.
 */
export function marketValueYen(
  model: CarModel,
  car: CarInstance,
  heatPercent: number,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
  coherenceTolerance = 1.0,
): number {
  const baseValue = Math.round(
    instanceBaseValueYen(model, car, heatPercent, partsById, partsTaxonomyById, economy),
  )

  const coherenceFactor = coherenceFactorFor(
    supportVerdict(car, model, partsById, economy).headline,
    economy,
  )
  const coherenceDiscount =
    economy.valuation.coherenceDiscountWeight * (1 - coherenceFactor) * coherenceTolerance
  const stagedValue = Math.round(baseValue * (1 - coherenceDiscount))

  const retention = retentionFor(coherenceFactor, economy)
  const premiumYen = installedPartsValueYen(car, partsById, economy, retention)
  const creditedPremiumYen =
    foundationFactor(car, economy) *
    expectationForCar(model, economy).aftermarketReturn *
    premiumYen
  return stagedValue + Math.round(creditedPremiumYen)
}
