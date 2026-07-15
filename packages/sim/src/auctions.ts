import {
  ALL_CAR_PART_IDS,
  fitmentClassForTier,
  resolveCarDisplayName,
  type AgeBand,
  type AuctionLot,
  type AuctionTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type EconomyConfig,
  type PartFitmentClass,
  type PartInstance,
  type PartOrigin,
  type RarityTier,
  type TurnoutBand,
  type UpkeepTier,
} from '@midnight-garage/content'
import {
  bandForMigratedCondition,
  bandIndex,
  carCostToMintYen,
  climbBand,
  hasForcedInduction,
  isPartMissing,
} from './bands'
import { DEFAULT_CONDITION_AGE_YEARS_WHEN_UNBOUNDED } from './constants'
import type { SimContext } from './context'
import { mileageFactor } from './marketValue'
import { makeCarOrigin } from './provenance'
import type { Rng } from './rng'

const COLOR_POOL = ['White', 'Black', 'Silver', 'Gunmetal', 'Red', 'Blue'] as const

/**
 * Sprint 47 decision 4: the flavor blurb correlates with the car's real rolled
 * upkeep tier (it used to be one flat pool with no mechanical meaning at all) -
 * the variance is legible pre-bid, not hidden.
 *
 * Sprint 66 (playtest 2026-07-15 item 6a): keyed by AGE BAND as well. Keying on
 * upkeep alone put "dealer trade-in, service history unknown" on a 1995 car
 * with 11 km on it - the maintainer's verbatim "how can the service history be
 * unknown?". A blurb has to fit the car it is describing: a nearly-new car has
 * a short, known history; only an old one can have been parked up for years.
 *
 * Sprint 70: the pool itself moved to `packages/content/data/provenance.json`
 * (`context.provenancePool`) - the content law now covers it (it was
 * previously hardcoded here). `AgeBand`/`UpkeepTier` are content types now too.
 */
const AGE_BAND_MIDDLING_FROM_YEARS = 6
const AGE_BAND_OLD_FROM_YEARS = 15

function ageBandFor(ageYears: number): AgeBand {
  if (ageYears < AGE_BAND_MIDDLING_FROM_YEARS) return 'young'
  if (ageYears < AGE_BAND_OLD_FROM_YEARS) return 'middling'
  return 'old'
}

/** Sprint 47 decision 4: a per-car upkeep roll, layered on top of the
 * mileage-based condition baseline - real cross-car variance at the same
 * mileage, so a car isn't interchangeably mediocre with every other car of
 * the same age. */
function rollUpkeepTier(weights: Readonly<Record<UpkeepTier, number>>, rng: Rng): UpkeepTier {
  const entries = Object.entries(weights) as [UpkeepTier, number][]
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  const roll = rng.next() * total
  let cumulative = 0
  for (const [tier, weight] of entries) {
    cumulative += weight
    if (roll < cumulative) return tier
  }
  return entries[entries.length - 1]![0]
}

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
 * Sprint 66 (playtest 2026-07-15 item 6a): how much of the upkeep tier's wear
 * this car's mileage lets express, in [0, 1]
 * (`partsGeneration.wearExposureByMileageKm`).
 *
 * Mileage-driven wear is ALREADY in the condition baseline above; this governs
 * the second, independent axis - how the previous owner treated it - which
 * simply cannot have shown up on a car that has barely turned a wheel. Without
 * it, a `neglected` roll applied its full -22 baseline offset and -30 jitter to
 * an 11 km car and produced `poor` parts on a nearly-new vehicle.
 */
export function wearExposure(mileageKm: number, economy: EconomyConfig): number {
  const raw = interpolateCurve(economy.partsGeneration.wearExposureByMileageKm, mileageKm)
  return Math.max(0, Math.min(1, raw))
}

/**
 * Rolls one fresh, mint-catalog stock `PartInstance` at `band` for `partId`
 * (Sprint 32 decision 6's default fill) - `undefined` only if the catalog
 * genuinely has no stock entry for this `CarPartId`, which decision 1
 * guarantees never happens for a real 29-part taxonomy id; kept as a
 * defensive fallback (an empty slot) rather than a throw, matching this
 * file's existing tolerance for a not-yet-fully-seeded catalog in tests.
 * Exported (Sprint 40): `serviceJobs.ts`'s generation-forcing step reuses
 * this exact stock-instance shape rather than standing up a second one.
 *
 * Sprint 53: `fitmentClass` selects which class's stock SKU fills the slot -
 * always the host car's own class, so a shitbox never rolls a family-priced
 * stock part (economy-bible.md law 3).
 *
 * Sprint 70: `origin` is required (every caller is generating this part as
 * part of a specific car's birth, so it always has one to stamp).
 */
export function stockInstanceFor(
  partId: CarPartId,
  band: ReturnType<typeof bandForMigratedCondition>,
  idPrefix: string,
  fitmentClass: PartFitmentClass,
  stockPartByCarPartId: SimContext['stockPartByCarPartId'],
  origin: PartOrigin,
): PartInstance | null {
  const catalogPart = stockPartByCarPartId[fitmentClass]?.[partId]
  if (!catalogPart) return null
  return { id: `${idPrefix}-${partId}`, partId: catalogPart.id, band, genuinePeriod: false, origin }
}

/** The denormalised label a `PartOrigin` carries (Sprint 70 decision 1) -
 * `"'95 Corolla"` style, using the model's display name and the instance
 * year, so it still reads correctly after the donor car is sold or scrapped. */
export function carOriginLabel(model: CarModel, year: number): string {
  return `'${String(year % 100).padStart(2, '0')} ${resolveCarDisplayName(model)}`
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
 * real parts (Sprint 26) jitters around it (a per-upkeep-tier range since
 * Sprint 47, see below), then buckets into its condition band via
 * `bandForMigratedCondition` (bands.ts)
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
 *
 * Sprint 47 decision 4: a per-car upkeep tier (neglected/average/cherished,
 * `economy.partsGeneration.upkeepTierWeights`) is rolled once and layered ON
 * TOP of the mileage-based baseline above - it offsets the baseline, reshapes
 * the per-part jitter range (a wider, harsher-tailed spread for neglected, a
 * tighter and gentler one for cherished, replacing the old flat symmetric
 * `CAR_CONDITION_JITTER`), and scales the missing-slot chance. Two cars at the
 * identical mileage can now be a genuine wreck or genuinely sound, not
 * interchangeably mediocre - the tier also picks `provenanceNote` from a
 * tier-matched pool, so the variance reads pre-bid instead of only after the
 * condition report is opened.
 *
 * Sprint 47 decision 7: `allowMissingSlots` (default `true`, unchanged for
 * every existing auction-lot caller) lets `serviceJobs.ts`'s customer-car
 * generation pass `false` - a customer's car should never turn up missing a
 * part unrelated to the job it's booked for; only `forceTasksOutstanding`'s
 * install-task branch empties a slot on a customer car, deliberately.
 *
 * Sprint 70: `day` (default 0 - unchanged for every existing test/dev-tool
 * caller with no real calendar) is the in-game day this car is generated on -
 * stamped onto every part's `origin` (`makeCarOrigin`) alongside this car's
 * own id and denormalised label, built once here and threaded down to every
 * `stockInstanceFor` call this function makes.
 */
export function generateAuctionCarInstance(
  model: CarModel,
  id: string,
  rng: Rng,
  context: SimContext,
  currentYear: number = Infinity,
  allowMissingSlots: boolean = true,
  day: number = 0,
): CarInstance {
  const { economy, stockPartByCarPartId } = context
  const fitmentClass = fitmentClassForTier(model.tier)
  // Sprint 66 (item 6a): a current-model-year car doesn't turn up at a backyard
  // auction. Clamp the rolled year to at least `AUCTION_MIN_AGE_YEARS` old,
  // never earlier than the model's own release (a car can't predate its model,
  // so a just-released model still generates at its release year).
  const youngestAllowedYear = Number.isFinite(currentYear)
    ? Math.max(model.spec.yearFrom, currentYear - economy.AUCTION_MIN_AGE_YEARS)
    : Infinity
  const year = Math.min(model.spec.yearFrom + rng.int(0, 8), youngestAllowedYear)
  const ageYears = Number.isFinite(currentYear)
    ? Math.max(0, currentYear - year)
    : DEFAULT_CONDITION_AGE_YEARS_WHEN_UNBOUNDED
  const [mileageMin, mileageMax] = mileageRangeForAge(ageYears, economy)
  const mileageKm = rng.int(mileageMin, mileageMax)
  const [baselineMin, baselineMax] = conditionBaselineRangeForMileage(mileageKm, economy)
  const rolledBaseline = rng.int(baselineMin, baselineMax)
  const carHasForcedInduction = hasForcedInduction(model)
  const { missingSlotBaseChance, missingSlotWeightByPart } = economy.partsGeneration
  const { upkeepTierWeights, upkeepBaselineOffset, upkeepJitterRange, upkeepMissingMultiplier } =
    economy.partsGeneration
  const upkeepTier = rollUpkeepTier(upkeepTierWeights, rng)
  // Sprint 66 (item 6a): upkeep only expresses in proportion to how far the car
  // has actually been driven - see `wearExposure`. At ~0 km the offset and the
  // negative jitter tail both vanish, so a nearly-new car is near-mint whoever
  // owned it; at high mileage a neglected roll bites exactly as hard as before.
  // The POSITIVE jitter bound is untouched: a car can be better than its
  // baseline at any age, it just cannot be worn out before it has been used.
  const exposure = wearExposure(mileageKm, economy)
  const conditionBaseline = clampCondition(
    rolledBaseline + upkeepBaselineOffset[upkeepTier] * exposure,
  )
  const [rawJitterMin, jitterMax] = upkeepJitterRange[upkeepTier]
  const jitterMin = Math.round(rawJitterMin * exposure)
  // Sprint 70: every part this car is born with shares this one origin -
  // built once, before any per-part loop, so the whole car reads as a single
  // birth event.
  const carOrigin = makeCarOrigin(id, carOriginLabel(model, year), day)

  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      const percent = clampCondition(conditionBaseline + rng.int(jitterMin, jitterMax))
      const band = bandForMigratedCondition(percent, economy)

      if (partId === 'forcedInduction') {
        const installed = carHasForcedInduction
          ? stockInstanceFor(
              partId,
              band,
              `${id}-part`,
              fitmentClass,
              stockPartByCarPartId,
              carOrigin,
            )
          : null
        return [partId, { installed }]
      }

      const missingChance = allowMissingSlots
        ? missingSlotBaseChance *
          missingSlotWeightByPart[partId] *
          upkeepMissingMultiplier[upkeepTier]
        : 0
      const rolledMissing = rng.next() < missingChance
      const installed = rolledMissing
        ? null
        : stockInstanceFor(
            partId,
            band,
            `${id}-part`,
            fitmentClass,
            stockPartByCarPartId,
            carOrigin,
          )
      return [partId, { installed }]
    }),
  ) as CarInstance['parts']

  const rolled: CarInstance = {
    id,
    modelId: model.id,
    year,
    mileageKm,
    color: rng.pick(COLOR_POOL),
    // Sprint 66 (item 6a): the blurb must fit the car's AGE as well as its
    // upkeep - keying on upkeep alone put "service history unknown" on an
    // 11 km car.
    provenanceNote: rng.pick(context.provenancePool[ageBandFor(ageYears)][upkeepTier]),
    authenticityPercent: rng.int(60, 95),
    parts,
  }
  return enforceMaxBillFraction(rolled, model, context, carOrigin)
}

/**
 * Sprint 54 decision 4 (economy-bible.md law 2 - no value traps): softens a
 * freshly-rolled car until `carCostToMintYen(car) <= maxBillFraction x
 * cleanValue` (at neutral, heat-100 reference - generation doesn't know a
 * model's future live heat) - every generatable lot is therefore profitably
 * restorable. Two bounded, always-convergent passes, in this order because
 * band damage is the common case and missing slots are comparatively rare
 * (preserves "a missing slot is reachable" as the normal outcome, not
 * something this guard silently erases):
 *
 * 1. Up to 4 passes lifting every part currently at the car's single worst
 *    band by one step (scrap -> poor -> worn -> fine -> mint is at most 4
 *    climbs for any part), re-checking the bill after each pass. This
 *    softens ordinary condition damage, the common trap cause.
 * 2. If the bill still exceeds budget once every part is mint (only possible
 *    when one or more genuinely-missing slots are themselves driving the
 *    bill - a mint slot contributes nothing, so nothing further to climb),
 *    fills every genuinely-missing slot with a fresh mint stock part.
 *    Guaranteed to satisfy the guard: at that point every present part is
 *    mint and no real defect remains, so the bill is exactly zero (or the
 *    cost of a legitimately-absent forcedInduction slot on an NA car, which
 *    is also zero).
 *
 * Both passes are pure functions of the already-rolled `car` (no additional
 * RNG draws), so determinism for a given seed is unaffected.
 *
 * Exported (Sprint 55): the coherence harness calls this SAME function
 * against a deliberately worse-than-generation-could-ever-roll car for every
 * roster model, proving Law 2 holds everywhere rather than re-deriving its
 * math a second time (`coherence.ts`).
 *
 * Sprint 70: `origin` is the fresh part's stamp when the missing-slot fill
 * pass fires - the same origin every other part on `car` already carries
 * (this is still generation, softening a car that hasn't left the birth
 * process yet).
 */
export function enforceMaxBillFraction(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  origin: PartOrigin,
): CarInstance {
  const { economy, partsById, partsTaxonomyById, stockPartByCarPartId } = context
  const fitmentClass = fitmentClassForTier(model.tier)
  const cleanValue = model.bookValueYen * mileageFactor(car.mileageKm, economy)
  const maxBillYen = economy.partsGeneration.maxBillFraction * cleanValue
  const billFor = (c: CarInstance) =>
    carCostToMintYen(c, model, partsById, partsTaxonomyById, economy)

  let working = car
  for (let pass = 0; pass < ALL_CAR_PART_IDS.length && billFor(working) > maxBillYen; pass++) {
    let worstBandIdx: number | null = null
    for (const partId of ALL_CAR_PART_IDS) {
      const installed = working.parts[partId].installed
      if (!installed) continue
      const idx = bandIndex(installed.band)
      if (worstBandIdx === null || idx < worstBandIdx) worstBandIdx = idx
    }
    if (worstBandIdx === null || worstBandIdx >= bandIndex('mint')) break
    let parts = working.parts
    for (const partId of ALL_CAR_PART_IDS) {
      const installed = parts[partId].installed
      if (!installed || bandIndex(installed.band) !== worstBandIdx) continue
      parts = {
        ...parts,
        [partId]: { installed: { ...installed, band: climbBand(installed.band, 1) } },
      }
    }
    working = { ...working, parts }
  }

  if (billFor(working) > maxBillYen) {
    let parts = working.parts
    for (const partId of ALL_CAR_PART_IDS) {
      if (parts[partId].installed) continue
      if (!isPartMissing(working, model, partId)) continue // legitimately-absent FI - leave alone
      const fresh = stockInstanceFor(
        partId,
        'mint',
        `${car.id}-softened`,
        fitmentClass,
        stockPartByCarPartId,
        origin,
      )
      if (fresh) parts = { ...parts, [partId]: { installed: fresh } }
    }
    working = { ...working, parts }
  }

  return working
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
    const car = generateAuctionCarInstance(
      model,
      `car-${lotId}`,
      rng,
      context,
      currentYear,
      true,
      day,
    )
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
