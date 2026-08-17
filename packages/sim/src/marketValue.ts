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
import { zonePanelValueYen } from './bodyPipeline'
import { coherenceFactorForCar } from './derivedStats'
import { machiningPremiumYenOf } from './machining'

/**
 * The taste-free "what is this car worth" answer, shared by every price in
 * the game: `marketValueYen` = `stagedValue + excellencePremiumYen +
 * creditedPremiumYen`, where `stagedValue` is clean value (book value scaled
 * by mileage and market heat; car age plays no part - a car's registration
 * year is flavor text only) minus a hassle-weighted restoration bill, floored
 * (Stage B), then discounted for an unsupported build's own failure risk
 * (Stage C, the coherence discount); `excellencePremiumYen` is sprint213.md's
 * excellence premium, a small state-gated bonus above book for an example
 * that is genuinely fine-throughout, coherent and fresh; `creditedPremiumYen`
 * is the installed-parts premium, scaled by a retention curve that rewards a
 * coherent build and penalises an incoherent one (Stage D), by the foundation
 * factor, and by the tier's own aftermarket return. See
 * `docs/design/systems/sale-value-system.md` section 3 for the design of
 * record.
 */

/**
 * Piecewise-linear interpolation over ascending `[x, y]` breakpoints: clamps
 * to the first/last y outside the range, interpolates between the two
 * straddling `x` otherwise. Shared by every curve-shaped factor keyed on this
 * shape ("designer draws a curve in JSON") - `mileageFactor` below reads it,
 * and `calendar.ts`'s `currentGameYear` reuses it for `campaignYearCurve`
 * (sprint204.md) rather than keeping a second interpolator.
 */
export function interpolateCurve(
  breakpoints: readonly (readonly [number, number])[],
  x: number,
): number {
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
 * `valuation.mileageFactorCurve` - flat at 1.0 across the low-mileage band,
 * then falling off with mileage. It never returns more than 1: mileage can
 * only take value away, and a little of it takes less away than a lot. */
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
/** Stage B's competing figures, before the `Math.max` between them: what the
 * restoration bill leaves of clean value, and the backstop floor under it.
 * Read as a pair by `isOnScrapFloor` below, which is the one question their
 * ORDER answers; `cleanValue` and `billBelowYen` are also read directly by
 * `excellencePremiumYen`, which needs the same two figures its gate and its
 * scale are built from, never a second computation of either. */
function instanceBaseTerms(
  model: CarModel,
  car: CarInstance,
  heatPercent: number,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): { rawYen: number; backstopFloorYen: number; cleanValue: number; billBelowYen: number } {
  const fitmentClass = fitmentClassForTier(model.tier)
  const marketRepairDiscount = economy.valuation.marketRepairDiscount[fitmentClass]!
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

  return {
    backstopFloorYen: economy.bands.scrapValueFraction * cleanValue,
    rawYen:
      cleanValue - marketRepairDiscount * billBelowYen - expectation.beyondDiscount * billAboveYen,
    cleanValue,
    billBelowYen,
  }
}

/**
 * Whether this car's price is pinned to Stage B's backstop floor rather than
 * derived from its own restoration bill: the bill has driven the raw formula
 * below the scrap-value fraction of clean value, so `Math.max` returns the
 * floor and the bill stops reaching the price at all.
 *
 * On such a car every counterfactual is fictional. Repairing a slot moves the
 * bill but not the price, so a per-slot line, a repair's own value delta, and
 * anything read off them describe arithmetic the car is no longer being priced
 * by. A caller showing those figures has to say so instead of printing them.
 *
 * A generated lot never reaches here: the generation-time bill guard (Law 2,
 * auctions.ts) caps a rolled car's bill well short of it. A car stripped or
 * wrecked in play can.
 */
export function isOnScrapFloor(
  model: CarModel,
  car: CarInstance,
  heatPercent: number,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): boolean {
  const { rawYen, backstopFloorYen } = instanceBaseTerms(
    model,
    car,
    heatPercent,
    partsById,
    partsTaxonomyById,
    economy,
  )
  return backstopFloorYen > rawYen
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
 * chassis price. Per installed part instance: `part.priceYen x retention`,
 * summed and rounded. `retention` is the caller's own Stage D figure
 * (`retentionFor` above) - this function only spends it, so its summation
 * shape stays exactly what it was when the retention it multiplied by was a
 * flat constant.
 *
 * NO `bandFactor(installed.band)` discount here - a part's condition is
 * priced exactly once, through the restoration bill (`carCostToMintYen`
 * inside `instanceBaseValueYen`), which already counts every installed
 * part's band. A `scrap` part contributes ZERO - it cannot be restored, and
 * the bill already replaces it at its stock price, so counting any retained
 * value on top would double-count it.
 *
 * An UNMACHINED `grade === 'stock'` installed part contributes NOTHING here -
 * stock is the baseline every slot starts from, not an upgrade, so an
 * all-stock-mint car's value is exactly clean value and only street/sport/race
 * aftermarket pushes above book, regardless of `retention`'s value.
 *
 * Machining is the one thing that puts a stock part above that baseline, and
 * it contributes its PREMIUM alone rather than the part's price: the block is
 * still the block the car came with, and what was added to it is the machine
 * work. Skipping a stock part outright would make the value ruling inert on
 * exactly the restoration case machining exists for. On an aftermarket part
 * the premium rides on top of the catalogue price, since both are real and
 * neither is the other.
 *
 * The premium is what was DONE to the part, never the power it makes - a car
 * is never worth more because it is faster, and this reaches money through the
 * part's own price exactly as the part itself does.
 *
 * **`bodywork` is read off the car's nine zones rather than off its carrier
 * SKU**, on a car that has a `zoneState` - the same exception `stylePercentOf`
 * and `buildFactors` (derivedStats.ts) make, for the same reason: every panel
 * SKU is zone-scoped and reaches a car through `zoneState[zoneId].panelGrade`,
 * never through `car.parts.bodywork.installed.partId`, so the carrier's own
 * (always stock) SKU cannot answer what a body kit cost. `zonePanelValueYen`
 * (bodyPipeline.ts) sums the nine, and the sum joins the total on exactly the
 * terms every other fitted part does - the same retention, and then the same
 * foundation and `aftermarketReturn` scaling in `premiumCredit` below. The
 * carrier's own catalogue price is not added beside it: a carrier is always
 * stock, and stock is worth nothing here.
 *
 * The panels are priced at the CARRIER'S fitment class, which is the car's
 * own: `applyDerivedBodyBands` fills that slot from
 * `stockPartByCarPartId[fitmentClassForTier(model.tier)]`, the slot is
 * `removable: false` so nothing else can ever get into it, and a player buys
 * panels for the car in front of them. So this needs no `CarModel` to ask a
 * question the car already answers.
 */
export function installedPartsValueYen(
  car: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  retention: number,
  economy: EconomyConfig,
): number {
  let total = 0
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = car.parts[partId].installed
    if (!installed) continue
    if (installed.band === 'scrap') continue
    const part = partsById[installed.partId]
    if (!part) continue
    const premiumYen = machiningPremiumYenOf(installed, part, economy)
    const catalogueYen = part.grade === 'stock' ? 0 : part.priceYen
    const zonePanelYen =
      partId === 'bodywork' && car.zoneState
        ? zonePanelValueYen(car.zoneState, partsById, part.fitmentClass)
        : 0
    total += (catalogueYen + zonePanelYen + premiumYen) * retention
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

/** Both halves of Stage D's contribution to a car's price. */
interface PremiumCredit {
  /** The yen the installed-parts premium adds to market value at this car's
   * own foundation factor - the term `marketValueYen` sums. */
  creditedYen: number
  /** The yen a failing foundation holds back: what the same premium would
   * credit with the foundations sound (factor 1), less `creditedYen`. Exactly
   * the amount `marketValueYen` gains when the foundations are put right and
   * nothing else about the car changes. Zero on a sound foundation, and zero
   * on a car carrying no premium to withhold. */
  withheldYen: number
}

/**
 * Stage D priced once: the installed-parts premium
 * (`installedPartsValueYen` at the coherence-driven retention curve), scaled
 * by the tier's own `aftermarketReturn`, then gated by law 5's
 * `foundationFactor`. The credited and withheld halves come out of the same
 * arithmetic, so a warning that quotes the second can never overstate what
 * fixing the foundations returns through the first.
 *
 * `soundYen` is that same product at a foundation factor of 1 - the top of
 * the factor's range, since `factorByState` reads 1 at `worn` and above - so
 * the two figures are one expression read at two foundation factors rather
 * than two expressions that have to be kept in step.
 */
function premiumCredit(
  model: CarModel,
  car: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
  coherenceFactor: number,
): PremiumCredit {
  const retention = retentionFor(coherenceFactor, economy)
  const premiumYen = installedPartsValueYen(car, partsById, retention, economy)
  const { aftermarketReturn } = expectationForCar(model, economy)
  const creditedYen = Math.round(foundationFactor(car, economy) * aftermarketReturn * premiumYen)
  const soundYen = Math.round(1 * aftermarketReturn * premiumYen)
  return { creditedYen, withheldYen: soundYen - creditedYen }
}

/**
 * The yen a failing foundation withholds from this car's price (law 5) - what
 * the aftermarket premium would credit with the foundations sound, less what
 * it credits at the car's actual `foundationFactor`. The player-facing
 * foundation warning quotes this figure, and it is the same `premiumCredit`
 * term `marketValueYen` sums, so the warning and the price cannot disagree.
 */
export function foundationWithheldYen(
  model: CarModel,
  car: CarInstance,
  partsById: Readonly<Record<string, Part>>,
  economy: EconomyConfig,
): number {
  const coherenceFactor = coherenceFactorForCar(car, model, partsById, economy)
  return premiumCredit(model, car, partsById, economy, coherenceFactor).withheldYen
}

/**
 * Sprint213.md item 3: the excellence premium. `marketValueYen`'s Stage B
 * floor used to be a genuine ceiling as well - "a fully restored car can
 * never be worth more than the identical clean car" - which left no room for
 * a truly sorted example to price above book the way a real one does. This
 * is the fix: a small additive premium, gated and scaled entirely by facts
 * the rest of the formula already computed, so it can never apply to a car
 * that has not actually earned it.
 *
 * GATED on `billBelowYen === 0`: every billable slot already at or above
 * this tier's own `expectationByTier[tier].band` - genuinely "fine
 * throughout" as a real qualitative category (the same figure Stage B's own
 * restoration bill already computed), not an approximation, and not
 * continuous - a car either qualifies or it doesn't, the same convention
 * `isTasteMatched`'s own threshold uses elsewhere in this pricing stack. A
 * car that has not yet earned the category gets exactly zero, no partial
 * credit for "almost there".
 *
 * SCALED continuously by two facts a qualifying car still varies on:
 * `coherenceFactor` ("coherent" - the same build-support figure Stage C's
 * discount and Stage D's retention curve already read) and `mileageFactor`
 * ("fresh" - low mileage prices near 1, high mileage tapers toward the
 * mileage curve's own floor). Both are already [0, 1]-ish multipliers
 * elsewhere in this file, reused verbatim rather than re-derived.
 *
 * The ceiling itself, `excellenceByTier[tier]`, is a fraction of `cleanValue`
 * - the same "book, scaled by mileage and heat" baseline the whole formula
 * is anchored to - so "modestly above book" reads directly off the tier's
 * own authored fraction.
 */
export function excellencePremiumYen(
  model: CarModel,
  cleanValue: number,
  billBelowYen: number,
  coherenceFactor: number,
  mileageKm: number,
  economy: EconomyConfig,
): number {
  if (billBelowYen > 0) return 0
  const fitmentClass = fitmentClassForTier(model.tier)
  const ceilingFraction = economy.valuation.excellenceByTier[fitmentClass]!
  if (ceilingFraction <= 0) return 0
  const freshness = mileageFactor(mileageKm, economy)
  return Math.round(cleanValue * ceilingFraction * coherenceFactor * freshness)
}

/**
 * The single shared value answer: `stagedValue + excellencePremiumYen +
 * foundationFactor x aftermarketReturn x installedPartsValueYen`.
 *
 * `stagedValue` is Stage C applied to Stage B's own `Math.max(backstopFloorYen,
 * rawYen)` (clean value mileage/heat scaled minus the hassle-weighted
 * restoration bill, floored - heat applies exactly once, inside clean value,
 * no other price in the game multiplies by market heat a second time): the
 * market discounts an unsupported build's own failure risk,
 * `coherenceDiscount = coherenceDiscountWeight * (1 - coherenceFactor) *
 * coherenceTolerance`, zero on a stock or fully-coherent build since
 * `coherenceFactor` is 1 there.
 *
 * `excellencePremiumYen` (above) is the one place a car can price ABOVE
 * `stagedValue`'s own ceiling - gated on genuinely earning the category, so
 * it can never turn "identical to clean" into "greater than clean" by
 * accident.
 *
 * The aftermarket premium (Stage D) is `premiumCredit` above:
 * `installedPartsValueYen`, itself scaled by the coherence-driven retention
 * curve (`retentionFor`), then
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
 * a buyer's own tolerance (the Show Crowd ignores the discount entirely, the
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
  const terms = instanceBaseTerms(model, car, heatPercent, partsById, partsTaxonomyById, economy)
  const baseValue = Math.round(Math.max(terms.backstopFloorYen, terms.rawYen))

  const coherenceFactor = coherenceFactorForCar(car, model, partsById, economy)
  const coherenceDiscount =
    economy.valuation.coherenceDiscountWeight * (1 - coherenceFactor) * coherenceTolerance
  const stagedValue = Math.round(baseValue * (1 - coherenceDiscount))

  const excellenceYen = excellencePremiumYen(
    model,
    terms.cleanValue,
    terms.billBelowYen,
    coherenceFactor,
    car.mileageKm,
    economy,
  )

  return (
    stagedValue +
    excellenceYen +
    premiumCredit(model, car, partsById, economy, coherenceFactor).creditedYen
  )
}
