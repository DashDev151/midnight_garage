import {
  ALL_CAR_PART_IDS,
  type AuctionLot,
  type AuctionTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type EconomyConfig,
  type PartInstance,
  type RarityTier,
  type TurnoutBand,
} from '@midnight-garage/content'
import { bandForMigratedCondition, hasForcedInduction } from './bands'
import { CAR_CONDITION_JITTER, DEFAULT_CONDITION_AGE_YEARS_WHEN_UNBOUNDED } from './constants'
import type { SimContext } from './context'
import type { Rng } from './rng'

const COLOR_POOL = ['White', 'Black', 'Silver', 'Gunmetal', 'Red', 'Blue'] as const

const PROVENANCE_POOL = [
  'one-owner, garage kept',
  'dealer trade-in, service history unknown',
  'estate sale, low mileage claimed',
  'daily driver, honest wear',
] as const

/**
 * GDD 4.5: Gaisha is sourced only via the (unbuilt) Import Broker, "no
 * auction luck" - it never appears in a regular auction catalog. Legend
 * appears only at the rep-gated Collector Network (GDD 9.2: rare, mostly
 * story leads, occasionally an auction).
 */
export function auctionTierForRarity(tier: RarityTier): AuctionTier | null {
  switch (tier) {
    case 'shitbox':
    case 'common':
      return 'local-yard'
    case 'uncommon':
      return 'regional'
    case 'rare':
      return 'premium'
    case 'legend':
      return 'collector-network'
    case 'gaisha':
      return null
  }
}

/**
 * Duration by rarity (Sprint 19 decision 1): a rare flash-sale roll applies
 * to any tier first (an occasional short event, not tied to one rarity);
 * otherwise legend cars always get a long sale, uncommon/rare occasionally
 * do, and everything else gets the standard band. First-pass day ranges,
 * openly adjustable (content/economy.json, Sprint 20 step 0).
 */
export function rollAuctionDurationDays(
  rarity: RarityTier,
  rng: Rng,
  economy: EconomyConfig,
): number {
  if (rng.next() < economy.AUCTION_FLASH_CHANCE) return economy.AUCTION_DURATION_FLASH_DAYS
  const [longMin, longMax] = economy.AUCTION_DURATION_LONG_RANGE_DAYS
  if (rarity === 'legend') return rng.int(longMin, longMax)
  if (
    (rarity === 'uncommon' || rarity === 'rare') &&
    rng.next() < economy.AUCTION_LONG_CHANCE_UNCOMMON_RARE
  ) {
    return rng.int(longMin, longMax)
  }
  const [stdMin, stdMax] = economy.AUCTION_DURATION_STANDARD_RANGE_DAYS
  return rng.int(stdMin, stdMax)
}

function clampCondition(value: number): number {
  return Math.max(0, Math.min(100, value))
}

const TURNOUT_BANDS: readonly TurnoutBand[] = ['thin', 'steady', 'packed']

/**
 * Rolls a lot's rival-turnout band (Sprint 30 decision 3), weighted by
 * `economy.auctionInterest.turnoutBandWeights` - fixed for the lot's whole
 * life (see `TurnoutBandSchema`'s own doc comment, content/auction.ts).
 * `bidding.ts`'s `turnoutBidderCount` turns this into an actual rival-cohort
 * count.
 */
function rollTurnoutBand(rng: Rng, economy: EconomyConfig): TurnoutBand {
  const weights = economy.auctionInterest.turnoutBandWeights
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total <= 0) return 'steady'
  let roll = rng.next() * total
  for (let i = 0; i < TURNOUT_BANDS.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) return TURNOUT_BANDS[i]!
  }
  return TURNOUT_BANDS[TURNOUT_BANDS.length - 1]!
}

/**
 * Piecewise-linear interpolation over ascending `[x, y]` breakpoints -
 * clamps to the first/last y outside the breakpoint range, linearly
 * interpolates between the two straddling `x` otherwise. Deliberately
 * duplicates `marketValue.ts`'s private helper of the same shape rather than
 * importing it: `marketValue.ts` is the frozen value model this sprint is
 * explicitly forbidden from touching (sprint33.md), even for a
 * behavior-preserving refactor, so this stays a small local copy instead.
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
 * Sprint 34: the [min, max] mileage range (km) for a car of this age, sampled
 * from `economy.json`'s `partsGeneration.mileageRangeMinByAgeYears`/
 * `MaxByAgeYears` curves. Age reaches nothing downstream except this range
 * (design decision 1) - from here, mileage is the single coherent wear driver
 * (it is also the sole value-side wear signal, via `marketValue.ts`'s
 * `mileageFactor`). Rounded to whole km since `rng.int` requires integer
 * bounds; the two curves never cross, so `min <= max` holds at every age.
 */
function mileageRangeForAge(ageYears: number, economy: EconomyConfig): [number, number] {
  const { mileageRangeMinByAgeYears, mileageRangeMaxByAgeYears } = economy.partsGeneration
  const min = Math.round(interpolateCurve(mileageRangeMinByAgeYears, ageYears))
  const max = Math.round(interpolateCurve(mileageRangeMaxByAgeYears, ageYears))
  return [min, max]
}

/**
 * Sprint 34: the condition-baseline roll's [min, max] range for a car at this
 * mileage, sampled from `economy.json`'s
 * `partsGeneration.conditionBaselineMinByMileageKm`/`MaxByMileageKm` curves -
 * replaces Sprint 33's age-keyed `conditionBaselineRangeForAge` (single-system,
 * directive 16). Mileage is now the sole input to generated condition; age
 * influences it only indirectly, through `mileageRangeForAge` above. Rounded
 * to whole percentage points since `rng.int` requires integer bounds; the two
 * curves never cross, so `min <= max` holds at every mileage.
 */
function conditionBaselineRangeForMileage(
  mileageKm: number,
  economy: EconomyConfig,
): [number, number] {
  const { conditionBaselineMinByMileageKm, conditionBaselineMaxByMileageKm } =
    economy.partsGeneration
  const min = Math.round(interpolateCurve(conditionBaselineMinByMileageKm, mileageKm))
  const max = Math.round(interpolateCurve(conditionBaselineMaxByMileageKm, mileageKm))
  return [min, max]
}

/**
 * Rolls one fresh, mint-catalog stock `PartInstance` at `band` for `partId`
 * (Sprint 32 decision 6's default fill) - `undefined` only if the catalog
 * genuinely has no stock entry for this `CarPartId`, which decision 1
 * guarantees never happens for a real 29-part taxonomy id; kept as a
 * defensive fallback (an empty slot) rather than a throw, matching this
 * file's existing tolerance for a not-yet-fully-seeded catalog in tests.
 */
function stockInstanceFor(
  partId: CarPartId,
  band: ReturnType<typeof bandForMigratedCondition>,
  idPrefix: string,
  stockPartByCarPartId: SimContext['stockPartByCarPartId'],
): PartInstance | null {
  const catalogPart = stockPartByCarPartId[partId]
  if (!catalogPart) return null
  return { id: `${idPrefix}-${partId}`, partId: catalogPart.id, band, genuinePeriod: false }
}

/**
 * Rolls a fresh, not-yet-owned car for an auction lot. Every slot fills with
 * a fresh stock `PartInstance` at the rolled condition band by default
 * (Sprint 32 decision 6) - an auction car hasn't been touched yet (GDD: "buy
 * rough, restore/build"), so it starts on its factory baseline, not
 * aftermarket. `currentYear` (Sprint 10, default Infinity = unrestricted)
 * clamps the rolled model year to the in-game calendar - see calendar.ts.
 *
 * Sprint 12: part condition is not rolled independently per part - a car
 * that rolled a pristine engine and a wrecked transmission with no
 * relationship between them read as arbitrary rather than "this car has had
 * a hard life." One 0-100 baseline is rolled per car, and each of the 29
 * real parts (Sprint 26) jitters around it (CAR_CONDITION_JITTER), then
 * buckets into its condition band via `bandForMigratedCondition` (bands.ts)
 * - the same percent-to-band mapping the save migration uses, reused here
 * rather than authoring a second one (directive 16). The band is rolled for
 * EVERY part unconditionally, including one that ends up empty, so the RNG
 * draw sequence stays uniform regardless of what a slot ends up holding.
 *
 * Sprint 26 decision 2 / Sprint 32 decision 6(a): `forcedInduction` alone
 * follows the model's tag, never the missing-slot roll below - a stock
 * turbo (at the rolled band) on a Turbo/Supercharged model, `null` on NA.
 * Sprint 32 decision 6(b): every OTHER slot additionally rolls a small,
 * content-tunable (`economy.partsGeneration`) chance of coming up MISSING
 * (`null`) instead of its default stock fill - the stripped-car case,
 * weighted toward the cosmetically/physically pluckable slots and never
 * `block`/`chassis` (their catalog weight is 0). Decision 10: a lot's
 * rolled bands are plain, always-visible state now - there is no reveal
 * machinery left to layer on top.
 *
 * Sprint 34: generation is a single causal chain, `year -> ageYears ->
 * mileage range -> roll mileage -> condition range -> roll condition baseline
 * -> per-part jitter`. `year` rolls first, its age picks a mileage range
 * (`mileageRangeForAge`) from which `mileageKm` is rolled, and that mileage
 * picks the condition-baseline range (`conditionBaselineRangeForMileage`) -
 * replacing Sprint 33's direct age->condition curve and the old flat
 * `rng.int(30_000, 180_000)` mileage draw, which were independent (a 1-year-old
 * could roll 180,000 km, a 30-year-old 30,000 km, equal odds). Age now reaches
 * condition only through mileage, so mileage is the one coherent wear driver.
 * `currentYear` not being finite (most callers with no real calendar context -
 * see that param's own doc note below) falls back to a fixed
 * `DEFAULT_CONDITION_AGE_YEARS_WHEN_UNBOUNDED` (constants.ts) rather than an
 * infinite/undefined age. This is generation only, not value - `marketValue.ts`
 * never re-gained an age factor (a maintainer decision after Sprint 30 removed
 * it there specifically); mileage reaches value solely via `mileageFactor`.
 */
export function generateAuctionCarInstance(
  model: CarModel,
  id: string,
  rng: Rng,
  context: SimContext,
  currentYear: number = Infinity,
): CarInstance {
  const { economy, stockPartByCarPartId } = context
  const year = Math.min(model.spec.yearFrom + rng.int(0, 8), currentYear)
  const ageYears = Number.isFinite(currentYear)
    ? Math.max(0, currentYear - year)
    : DEFAULT_CONDITION_AGE_YEARS_WHEN_UNBOUNDED
  const [mileageMin, mileageMax] = mileageRangeForAge(ageYears, economy)
  const mileageKm = rng.int(mileageMin, mileageMax)
  const [baselineMin, baselineMax] = conditionBaselineRangeForMileage(mileageKm, economy)
  const conditionBaseline = rng.int(baselineMin, baselineMax)
  const carHasForcedInduction = hasForcedInduction(model)
  const { missingSlotBaseChance, missingSlotWeightByPart } = economy.partsGeneration

  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      const percent = clampCondition(
        conditionBaseline + rng.int(-CAR_CONDITION_JITTER, CAR_CONDITION_JITTER),
      )
      const band = bandForMigratedCondition(percent, economy)

      if (partId === 'forcedInduction') {
        const installed = carHasForcedInduction
          ? stockInstanceFor(partId, band, `${id}-part`, stockPartByCarPartId)
          : null
        return [partId, { installed }]
      }

      const missingChance = missingSlotBaseChance * missingSlotWeightByPart[partId]
      const rolledMissing = rng.next() < missingChance
      const installed = rolledMissing
        ? null
        : stockInstanceFor(partId, band, `${id}-part`, stockPartByCarPartId)
      return [partId, { installed }]
    }),
  ) as CarInstance['parts']

  return {
    id,
    modelId: model.id,
    year,
    mileageKm,
    color: rng.pick(COLOR_POOL),
    provenanceNote: rng.pick(PROVENANCE_POOL),
    authenticityPercent: rng.int(60, 95),
    parts,
  }
}

/**
 * Weekly catalog for one tier: one lot per eligible model that's in stock
 * this week, up to `count`. `currentYear` (Sprint 10, default Infinity =
 * unrestricted) also excludes any model whose `yearFrom` postdates the
 * in-game calendar - see calendar.ts - so a still-unreleased model can't
 * appear at auction (GDD 2.2: "new model years appear at auction over time").
 * Each lot's own duration is rolled independently off its model's rarity
 * (Sprint 19 decision 1).
 */
export function generateAuctionCatalog(
  models: readonly CarModel[],
  tier: AuctionTier,
  day: number,
  count: number,
  rng: Rng,
  context: SimContext,
  currentYear: number = Infinity,
): AuctionLot[] {
  const { economy } = context
  const eligible = models.filter(
    (model) => auctionTierForRarity(model.tier) === tier && model.spec.yearFrom <= currentYear,
  )
  if (eligible.length === 0) return []

  const lots: AuctionLot[] = []
  for (let i = 0; i < count; i++) {
    const model = rng.pick(eligible)
    const lotId = `lot-${day}-${tier}-${i}`
    const car = generateAuctionCarInstance(model, `car-${lotId}`, rng, context, currentYear)
    lots.push({
      id: lotId,
      tier,
      modelId: model.id,
      car,
      bookValueYen: model.bookValueYen,
      expiresOnDay: day + rollAuctionDurationDays(model.tier, rng, economy),
      currentBidYen: 0,
      leadingBidder: null,
      quietDays: 0,
      playerHasBid: false,
      turnout: rollTurnoutBand(rng, economy),
    })
  }
  return lots
}
