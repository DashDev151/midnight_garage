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
  type Cause,
  type ConditionBand,
  type EconomyConfig,
  type Grade,
  type PartFitmentClass,
  type PartInstance,
  type PartOrigin,
  type RarityTier,
  type ReputationTier,
  type Symptom,
  type TurnoutBand,
  type UpkeepTier,
} from '@midnight-garage/content'
import {
  bandForMigratedCondition,
  bandIndex,
  carCostToBandYen,
  carCostToMintYen,
  climbBand,
  degradeBand,
  hasForcedInduction,
  isPartMissing,
} from './bands'
import { DEFAULT_CONDITION_AGE_YEARS_WHEN_UNBOUNDED } from './constants'
import type { SimContext } from './context'
import { expectationForCar, mileageFactor } from './marketValue'
import { makeCarOrigin } from './provenance'
import type { Rng } from './rng'

const COLOR_POOL = ['White', 'Black', 'Silver', 'Gunmetal', 'Red', 'Blue'] as const

/** The flavor blurb pool (`context.provenancePool`) is keyed by both upkeep
 * tier and age band: a blurb has to fit the car it describes (an 11 km car
 * can't have an unknown service history). */
const AGE_BAND_MIDDLING_FROM_YEARS = 6
const AGE_BAND_OLD_FROM_YEARS = 15

function ageBandFor(ageYears: number): AgeBand {
  if (ageYears < AGE_BAND_MIDDLING_FROM_YEARS) return 'young'
  if (ageYears < AGE_BAND_OLD_FROM_YEARS) return 'middling'
  return 'old'
}

/** A per-car upkeep roll, layered on top of the mileage-based condition
 * baseline - real cross-car variance at the same mileage. */
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

/** Weighted pick over a symptom's own `causes` list - same
 * cumulative-sum-over-one-draw shape as every other weighted roll in this
 * file. */
function pickWeightedCause(causes: readonly Cause[], rng: Rng): Cause {
  const total = causes.reduce((sum, cause) => sum + cause.weight, 0)
  const roll = rng.next() * total
  let cumulative = 0
  for (const cause of causes) {
    cumulative += cause.weight
    if (roll < cumulative) return cause
  }
  return causes[causes.length - 1]!
}

/** How many symptoms a freshly-generated car attempts: a first roll at the
 * tier's own chance, then, if that landed, a second at
 * `secondSymptomChance`, capped at `maxSymptomsPerCar`. Not how many
 * SURVIVE - `enforceMaxBillFraction` may still veto one afterward. */
function rollSymptomCount(
  fitmentClass: PartFitmentClass,
  economy: EconomyConfig,
  rng: Rng,
): number {
  const { symptomChanceByTier, secondSymptomChance, maxSymptomsPerCar } = economy.diagnosis
  if (rng.next() >= symptomChanceByTier[fitmentClass]) return 0
  if (maxSymptomsPerCar < 2 || rng.next() >= secondSymptomChance) return 1
  return 2
}

/** Whether every part on `a` and `b` shares the same installed-or-not state
 * and, if installed, the same band - the "did the Law 2 guard alter
 * anything" check. */
function bandsMatch(a: CarInstance, b: CarInstance): boolean {
  return ALL_CAR_PART_IDS.every((partId) => {
    const partA = a.parts[partId].installed
    const partB = b.parts[partId].installed
    if (!partA || !partB) return !partA === !partB
    return partA.band === partB.band
  })
}

/**
 * Rolls this car's symptoms and applies each one's damage in turn, on the
 * ALREADY Law-2-compliant car. Each cause sets its part to the WORSE of the
 * current band and the cause's own `setBand`, then `enforceMaxBillFraction`
 * re-checks the whole car; if it would move ANY band, the symptom is
 * dropped outright (deterministic keep-or-drop, no partial damage). A cause
 * targeting an already-missing slot is dropped the same way.
 * `apparentBandByPartId` records a part's band from BEFORE THE FIRST
 * symptom that damages it, never overwritten by a later one.
 */
function applySymptoms(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  carOrigin: PartOrigin,
  rng: Rng,
): {
  car: CarInstance
  symptoms: CarInstance['symptoms']
  apparentBandByPartId: CarInstance['apparentBandByPartId']
} {
  const fitmentClass = fitmentClassForTier(model.tier)
  const count = rollSymptomCount(fitmentClass, context.economy, rng)
  if (count === 0) return { car, symptoms: [], apparentBandByPartId: null }

  const pool = [...context.symptoms]
  const drawn: Symptom[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const symptom = rng.pick(pool)
    drawn.push(symptom)
    pool.splice(pool.indexOf(symptom), 1)
  }

  let working = car
  const symptoms: CarInstance['symptoms'] = []
  const apparentBandByPartId: Partial<Record<CarPartId, ConditionBand>> = {}

  for (const symptom of drawn) {
    const cause = pickWeightedCause(symptom.causes, rng)
    const installed = working.parts[cause.carPartId].installed
    if (!installed) continue // nothing to damage - drop

    const beforeBand = installed.band
    const newBand = bandIndex(cause.setBand) < bandIndex(beforeBand) ? cause.setBand : beforeBand
    const tentative: CarInstance = {
      ...working,
      parts: {
        ...working.parts,
        [cause.carPartId]: { installed: { ...installed, band: newBand } },
      },
    }
    const enforced = enforceMaxBillFraction(tentative, model, context, carOrigin)
    if (!bandsMatch(enforced, tentative)) continue // Law 2 veto - drop entirely

    working = enforced
    if (!(cause.carPartId in apparentBandByPartId)) {
      apparentBandByPartId[cause.carPartId] = beforeBand
    }
    symptoms.push({
      symptomId: symptom.id,
      trueCauseId: cause.id,
      remainingCauseIds: symptom.causes.map((c) => c.id),
      runTestIds: [],
    })
  }

  return {
    car: working,
    symptoms,
    apparentBandByPartId: symptoms.length > 0 ? apparentBandByPartId : null,
  }
}

/** The number of times any single part could ever be degraded by
 * `enforceMinWorkBill` below before it drops out of the candidate pool (see
 * that function's own doc comment) - `mint` down to one step above `scrap`.
 * Bounds the top-up loop so an unreachable floor stops cleanly rather than
 * spinning. */
const MAX_DEGRADE_STEPS_PER_PART = bandIndex('mint') - bandIndex('poor')

/** Every present, installed part on `car` eligible for one more degrade step
 * under `enforceMinWorkBill`'s never-to-scrap rule (a part already at `poor`,
 * one band above `scrap`, is excluded outright), filtered further by whether
 * its current band sits at/above `expectationBand` or strictly below it - the
 * two-pass preference order that function draws from. Iterates
 * `ALL_CAR_PART_IDS` in its own fixed order, so the candidate list is
 * deterministic for a given car state; the caller's seeded `rng.pick` is what
 * actually chooses among them. */
function degradeCandidates(
  car: CarInstance,
  expectationBand: ConditionBand,
  atOrAboveExpectation: boolean,
): CarPartId[] {
  const minDegradableIndex = bandIndex('poor') + 1
  return ALL_CAR_PART_IDS.filter((partId) => {
    const installed = car.parts[partId].installed
    if (!installed) return false
    if (bandIndex(installed.band) < minDegradableIndex) return false
    const meetsExpectation = bandIndex(installed.band) >= bandIndex(expectationBand)
    return atOrAboveExpectation ? meetsExpectation : !meetsExpectation
  })
}

/**
 * The core-loop floor (economy.json's `partsGeneration.
 * minWorkBillFractionByTier`): every generated car must carry at least this
 * much below-expectation restoration work, so there is always something
 * profitable to fix. Runs on the already symptom-rolled, already Law-2
 * (`enforceMaxBillFraction`) compliant TRUE car - the true state, not the
 * apparent one, so a masked symptom can never be mistaken for real fixable
 * work.
 *
 * While the true car's bill to its own tier's expectation band
 * (`carCostToBandYen`, `expectationForCar`) sits under the floor, one
 * installed part degrades a single band via the SAME seeded `rng` the rest
 * of generation threads: preferring a part currently at or above the
 * expectation band (`degradeCandidates` with `atOrAboveExpectation: true`),
 * falling back to a below-expectation part only once none remain. This is
 * honest visible wear, never a masked symptom - it never writes to
 * `apparentBandByPartId`. The candidate pool never offers an already-`poor`
 * part, so no part is ever forced to `scrap`; a car whose every part has
 * already bottomed out at `poor` stops at best effort rather than looping
 * forever (`MAX_DEGRADE_STEPS_PER_PART` bounds the loop).
 *
 * The top-up runs under the same Law 2 ceiling every other generation step
 * obeys: after the loop, `enforceMaxBillFraction` runs once, and if it would
 * move ANY band (the ceiling binds), the last degrade step reverts and the
 * loop stops there - best-effort floor, never a breached ceiling. The content
 * schema keeps the floor strictly under the ceiling, so this guard is a
 * backstop rather than a path real content is expected to hit.
 */
function enforceMinWorkBill(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  carOrigin: PartOrigin,
  rng: Rng,
): CarInstance {
  const { economy, partsById, partsTaxonomyById } = context
  const fitmentClass = fitmentClassForTier(model.tier)
  const floorYen = Math.round(
    model.bookValueYen * economy.partsGeneration.minWorkBillFractionByTier[fitmentClass],
  )
  const expectationBand = expectationForCar(model, economy).band
  const billBelowExpectation = (c: CarInstance) =>
    carCostToBandYen(c, model, partsById, partsTaxonomyById, economy, expectationBand)

  let working = car
  let beforeLastStep = car
  const maxSteps = ALL_CAR_PART_IDS.length * MAX_DEGRADE_STEPS_PER_PART
  for (let step = 0; step < maxSteps && billBelowExpectation(working) < floorYen; step++) {
    const preferred = degradeCandidates(working, expectationBand, true)
    const pool =
      preferred.length > 0 ? preferred : degradeCandidates(working, expectationBand, false)
    if (pool.length === 0) break // nothing left to degrade anywhere - best effort

    beforeLastStep = working
    const partId = rng.pick(pool)
    const installed = working.parts[partId].installed!
    working = {
      ...working,
      parts: {
        ...working.parts,
        [partId]: { installed: { ...installed, band: degradeBand(installed.band, 1) } },
      },
    }
  }
  if (working === car) return working // floor already met, or unreachable at step 0

  const enforced = enforceMaxBillFraction(working, model, context, carOrigin)
  return bandsMatch(enforced, working) ? enforced : beforeLastStep
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

/** Duration by rarity: a rare flash-sale roll applies to any tier first;
 * otherwise legend cars always get a long sale, uncommon/rare occasionally
 * do, and everything else gets the standard band. */
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

/** Rolls a lot's rival-turnout band, weighted by
 * `economy.auction.turnoutBandWeights` - fixed for the lot's whole life. */
function rollTurnoutBand(rng: Rng, economy: EconomyConfig): TurnoutBand {
  const weights = economy.auction.turnoutBandWeights
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
 * clamps to the first/last y outside the range, interpolates between the
 * two straddling `x` otherwise. Deliberately duplicates `marketValue.ts`'s
 * private helper of the same shape rather than importing it: that file is
 * the frozen value model, never touched even for a behavior-preserving
 * refactor.
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

/** The [min, max] mileage range (km) for a car of this age, sampled from
 * `economy.json`'s mileage curves. Age reaches nothing downstream except
 * this range - mileage is the single coherent wear driver from here on. */
function mileageRangeForAge(ageYears: number, economy: EconomyConfig): [number, number] {
  const { mileageRangeMinByAgeYears, mileageRangeMaxByAgeYears } = economy.partsGeneration
  const min = Math.round(interpolateCurve(mileageRangeMinByAgeYears, ageYears))
  const max = Math.round(interpolateCurve(mileageRangeMaxByAgeYears, ageYears))
  return [min, max]
}

/** The condition-baseline roll's [min, max] range for a car at this
 * mileage, sampled from `economy.json`'s curves. Mileage is the sole input
 * to generated condition; age influences it only indirectly, through
 * `mileageRangeForAge` above. */
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
 * How much of the upkeep tier's wear this car's mileage lets express, in
 * [0, 1]. Mileage-driven wear is already in the condition baseline; this is
 * the second, independent axis - how the previous owner treated it, which
 * cannot show up on a car that has barely turned a wheel.
 */
export function wearExposure(mileageKm: number, economy: EconomyConfig): number {
  const raw = interpolateCurve(economy.partsGeneration.wearExposureByMileageKm, mileageKm)
  return Math.max(0, Math.min(1, raw))
}

/**
 * Rolls one fresh, mint-catalog stock `PartInstance` at `band` for `partId`
 * - `null` only if the catalog genuinely has no stock entry for this
 * `CarPartId` (a defensive fallback, never expected for real content).
 * `fitmentClass` selects which class's stock SKU fills the slot - always
 * the host car's own class, so a shitbox never rolls a family-priced stock
 * part (economy-bible.md law 3).
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

/** The aftermarket-at-generation roll's own instance builder - same shape
 * as `stockInstanceFor` above, but picks a random matching catalog part at
 * a weighted grade instead of the fixed stock one, at the SAME rolled
 * `band`. `null` when the catalog has no aftermarket entry at all. */
function aftermarketInstanceFor(
  partId: CarPartId,
  band: ReturnType<typeof bandForMigratedCondition>,
  idPrefix: string,
  fitmentClass: PartFitmentClass,
  aftermarketPartByCarPartId: SimContext['aftermarketPartByCarPartId'],
  gradeWeights: EconomyConfig['partsGeneration']['aftermarketGradeWeights'],
  origin: PartOrigin,
  rng: Rng,
): PartInstance | null {
  const byGrade = aftermarketPartByCarPartId[fitmentClass]?.[partId]
  if (!byGrade) return null
  const available = (Object.entries(gradeWeights) as [Grade, number][]).filter(
    ([grade]) => byGrade[grade] !== undefined,
  )
  if (available.length === 0) return null
  const total = available.reduce((sum, [, weight]) => sum + weight, 0)
  const roll = rng.next() * total
  let cumulative = 0
  let chosenGrade: Grade = available[available.length - 1]![0]
  for (const [grade, weight] of available) {
    cumulative += weight
    if (roll < cumulative) {
      chosenGrade = grade
      break
    }
  }
  const catalogPart = byGrade[chosenGrade]!
  return { id: `${idPrefix}-${partId}`, partId: catalogPart.id, band, genuinePeriod: false, origin }
}

/** The denormalised label a `PartOrigin` carries - `"'95 Corolla"` style,
 * using the model's display name and the instance year, so it still reads
 * correctly after the donor car is sold or scrapped. */
export function carOriginLabel(model: CarModel, year: number): string {
  return `'${String(year % 100).padStart(2, '0')} ${resolveCarDisplayName(model)}`
}

/**
 * Rolls a fresh, not-yet-owned car for an auction lot. Every slot fills with
 * a fresh stock `PartInstance` at the rolled condition band by default - an
 * auction car hasn't been touched yet (GDD: "buy rough, restore/build").
 * `currentYear` (default Infinity = unrestricted) clamps the rolled model
 * year to the in-game calendar.
 *
 * One 0-100 condition baseline is rolled per car, and each of the 29 real
 * parts jitters around it, then buckets into its band via
 * `bandForMigratedCondition`. `forcedInduction` alone follows the model's
 * tag, never the missing-slot roll; every OTHER slot additionally rolls a
 * small, content-tunable chance of coming up MISSING instead of its default
 * stock fill.
 *
 * Generation is a single causal chain: `year -> ageYears -> mileage range ->
 * roll mileage -> condition range -> roll condition baseline -> per-part
 * jitter`. Mileage is the one coherent wear driver - age reaches condition
 * only through it. This is generation only, not value: `marketValue.ts` has
 * no age factor; mileage reaches value solely via `mileageFactor`.
 *
 * A per-car upkeep tier (neglected/average/cherished) is rolled once and
 * layered on top of the mileage-based baseline: it offsets the baseline,
 * reshapes the per-part jitter range, scales the missing-slot chance, and
 * picks `provenanceNote` from a tier-matched pool.
 *
 * `allowMissingSlots` (default true) lets `serviceJobs.ts`'s customer-car
 * generation pass false - a customer's car should never turn up missing an
 * unrelated part. `day` (default 0) stamps every part's `origin`.
 * `allowSymptoms` (default true) similarly lets customer-car generation
 * pass false - symptoms only spawn on auction lots.
 *
 * After the missing-slot roll, a non-missing, non-`forcedInduction` slot
 * rolls a chance to fit a weighted-grade aftermarket part
 * (`aftermarketInstanceFor`) instead of the default stock one, at the SAME
 * rolled band, capped at `maxAftermarketSlots` per car - this runs for
 * every caller, with no gating parameter.
 *
 * Once symptoms have landed, `enforceMinWorkBill` tops up the car with
 * honest visible wear until its below-expectation bill clears the tier's
 * floor - a generated auction lot always carries fixable work.
 */
export function generateAuctionCarInstance(
  model: CarModel,
  id: string,
  rng: Rng,
  context: SimContext,
  currentYear: number = Infinity,
  allowMissingSlots: boolean = true,
  day: number = 0,
  allowSymptoms: boolean = true,
): CarInstance {
  const { economy, stockPartByCarPartId } = context
  const fitmentClass = fitmentClassForTier(model.tier)
  // A current-model-year car doesn't turn up at a backyard auction. Clamp the
  // rolled year to at least `AUCTION_MIN_AGE_YEARS` old, never earlier than
  // the model's own release (a car can't predate its model).
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
  const { missingSlotBaseChance, missingSlotWeightByPart, aftermarketChance, maxAftermarketSlots } =
    economy.partsGeneration
  const { upkeepTierWeights, upkeepBaselineOffset, upkeepJitterRange, upkeepMissingMultiplier } =
    economy.partsGeneration
  // Shared across every part in the loop below (not reset per part) - the cap
  // is per car, not per slot.
  let aftermarketSlotsFitted = 0
  const upkeepTier = rollUpkeepTier(upkeepTierWeights, rng)
  // Upkeep only expresses in proportion to how far the car has actually been
  // driven - see `wearExposure`. At ~0 km a nearly-new car is near-mint; at
  // high mileage a neglected roll bites exactly as hard as before. A car can
  // be better than its baseline at any age, it just cannot be worn out before
  // it has been used.
  const exposure = wearExposure(mileageKm, economy)
  const conditionBaseline = clampCondition(
    rolledBaseline + upkeepBaselineOffset[upkeepTier] * exposure,
  )
  const [rawJitterMin, jitterMax] = upkeepJitterRange[upkeepTier]
  const jitterMin = Math.round(rawJitterMin * exposure)
  // Every part this car is born with shares this one origin - built once,
  // before any per-part loop, so the whole car reads as a single birth event.
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
      // Rolled unconditionally (even once the cap is already reached) so the
      // RNG draw sequence per slot stays uniform regardless of outcome.
      const rolledAftermarket = rng.next() < aftermarketChance
      const aftermarket =
        !rolledMissing && rolledAftermarket && aftermarketSlotsFitted < maxAftermarketSlots
          ? aftermarketInstanceFor(
              partId,
              band,
              `${id}-part`,
              fitmentClass,
              context.aftermarketPartByCarPartId,
              economy.partsGeneration.aftermarketGradeWeights,
              carOrigin,
              rng,
            )
          : null
      if (aftermarket) aftermarketSlotsFitted++
      const installed = rolledMissing
        ? null
        : (aftermarket ??
          stockInstanceFor(
            partId,
            band,
            `${id}-part`,
            fitmentClass,
            stockPartByCarPartId,
            carOrigin,
          ))
      return [partId, { installed }]
    }),
  ) as CarInstance['parts']

  const rolled: CarInstance = {
    id,
    modelId: model.id,
    year,
    mileageKm,
    color: rng.pick(COLOR_POOL),
    // The blurb must fit the car's AGE as well as its upkeep.
    provenanceNote: rng.pick(context.provenancePool[ageBandFor(ageYears)][upkeepTier]),
    authenticityPercent: rng.int(60, 95),
    parts,
    symptoms: [],
    apparentBandByPartId: null,
  }
  const softened = enforceMaxBillFraction(rolled, model, context, carOrigin)
  if (!allowSymptoms) return softened

  const {
    car: withSymptoms,
    symptoms,
    apparentBandByPartId,
  } = applySymptoms(softened, model, context, carOrigin, rng)
  const withMinWorkBill = enforceMinWorkBill(withSymptoms, model, context, carOrigin, rng)
  return { ...withMinWorkBill, symptoms, apparentBandByPartId }
}

/**
 * Economy-bible.md law 2 (no value traps): softens a freshly-rolled car
 * until `carCostToMintYen(car) <= maxBillFraction x cleanValue` - every
 * generatable lot is therefore profitably restorable. Two bounded,
 * always-convergent passes, since band damage is the common case and
 * missing slots are comparatively rare:
 *
 * 1. Up to 4 passes lifting every part at the car's single worst band by
 *    one step, re-checking the bill after each pass.
 * 2. If the bill still exceeds budget once every part is mint (only
 *    possible when a genuinely-missing slot is driving it), fills every
 *    missing slot with a fresh mint stock part - guaranteed to satisfy the
 *    guard, since the bill is then exactly zero.
 *
 * Both passes are pure functions of the already-rolled `car` (no additional
 * RNG draws), so determinism for a given seed is unaffected. The coherence
 * harness (`coherence.ts`) calls this SAME function to prove Law 2 holds
 * for every roster model.
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

/** A reputation-conditioned weighted model pick. Each candidate model's
 * weight is `economy.auction.rarityWeightsByReputation[reputationTier]?.
 * [model.tier] ?? 1`, so any tier or rarity absent from the content map
 * draws at the implicit 1 (uniform). */
function pickWeightedModel(
  models: readonly CarModel[],
  reputationTier: ReputationTier,
  economy: EconomyConfig,
  rng: Rng,
): CarModel {
  const weightsByRarity = economy.auction.rarityWeightsByReputation[reputationTier]
  const weights = models.map((model) => weightsByRarity?.[model.tier] ?? 1)
  const total = weights.reduce((sum, w) => sum + w, 0)
  const roll = rng.next() * total
  let cumulative = 0
  for (let i = 0; i < models.length; i++) {
    cumulative += weights[i]!
    if (roll < cumulative) return models[i]!
  }
  return models[models.length - 1]!
}

/**
 * Weekly catalog for one tier: one lot per eligible model that's in stock
 * this week, up to `count`. `currentYear` (default Infinity = unrestricted)
 * also excludes any model whose `yearFrom` postdates the in-game calendar,
 * so a still-unreleased model can't appear at auction (GDD 2.2). Each lot's
 * own duration is rolled independently off its model's rarity.
 *
 * `reputationTier` (default `'legend'` = no weighting) conditions the model
 * draw via `pickWeightedModel`, biasing toward the rarities
 * `economy.auction.rarityWeightsByReputation` names for that tier.
 *
 * `excludedModelIds` (default none) drops the named models from the
 * eligible pool before any draw - its one current use keeps the scripted
 * tutorial Wagon R from gaining a random twin.
 */
export function generateAuctionCatalog(
  models: readonly CarModel[],
  tier: AuctionTier,
  day: number,
  count: number,
  rng: Rng,
  context: SimContext,
  currentYear: number = Infinity,
  reputationTier: ReputationTier = 'legend',
  excludedModelIds: readonly string[] = [],
): AuctionLot[] {
  const { economy } = context
  const eligible = models.filter(
    (model) =>
      auctionTierForRarity(model.tier) === tier &&
      model.spec.yearFrom <= currentYear &&
      !excludedModelIds.includes(model.id),
  )
  if (eligible.length === 0) return []

  const lots: AuctionLot[] = []
  for (let i = 0; i < count; i++) {
    const model = pickWeightedModel(eligible, reputationTier, economy, rng)
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
      turnout: rollTurnoutBand(rng, economy),
    })
  }
  return lots
}
