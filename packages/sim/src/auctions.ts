import {
  ALL_CAR_PART_IDS,
  CARE_PROFILES,
  CarTierSchema,
  DAMAGE_GRADES,
  fitmentClassForTier,
  resolveCarDisplayName,
  type AgeBand,
  type AuctionLot,
  type AuctionTier,
  type CareProfile,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarRarity,
  type CarTier,
  type Cause,
  type ConditionBand,
  type DamageGrade,
  type DamagePattern,
  type EconomyConfig,
  type Grade,
  type PartFitmentClass,
  type PartInstance,
  type PartOrigin,
  type Symptom,
  type TurnoutBand,
} from '@midnight-garage/content'
import {
  bandForMigratedCondition,
  bandIndex,
  carCostToMintYen,
  climbBand,
  degradeBand,
  hasForcedInduction,
  isPartMissing,
} from './bands'
import {
  applyDerivedBodyBands,
  degradeZoneCarrierOneStep,
  generatedPaintGrade,
  hasZoneDegradeHeadroom,
  hasZoneImproveHeadroom,
  improveZoneCarrierOneStep,
  isBodyDerivedPart,
  METAL_ZONE_IDS,
  PANEL_ZONE_IDS,
  rollZoneStates,
  setZoneCarrierToAtLeastBand,
} from './bodyPipeline'
import { DEFAULT_CONDITION_AGE_YEARS_WHEN_UNBOUNDED } from './constants'
import type { SimContext } from './context'
import {
  patternConditionOffsets,
  pickPatternGroup,
  pickPatternZone,
  rollDamagePattern,
  symptomDrawWeight,
  zoneDamageOrder,
} from './damagePatterns'
import { defaultVerifiedSlots } from './knowledge'
import { cleanValueYen } from './marketValue'
import { makeCarOrigin } from './provenance'
import { pickWeighted, type Rng } from './rng'

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
 *
 * WHICH symptom is drawn is weighted by the car's own damage `pattern`
 * (`symptomDrawWeight`, damagePatterns.ts) rather than picked uniformly, so a
 * car that went in the front is likelier to present a front-end symptom than a
 * gearbox whine. That is the same weighting the damage budget spends against,
 * which is what makes a car's visible damage and its hidden fault two halves of
 * one event instead of two unrelated rolls.
 *
 * The pattern is read from the car's HISTORY and never from its parts. History
 * is the cause; the damage and the symptom are both effects of it, and
 * inferring one effect from the other would be circular.
 *
 * The pattern still decides only WHERE. It sets no band (the cause's own
 * `setBand` does, as a floor), creates no symptom (this function does, subject
 * to the Law 2 veto below) and writes no `apparentBandByPartId`.
 */
function applySymptoms(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  carOrigin: PartOrigin,
  pattern: DamagePattern,
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
  const bias = context.economy.partsGeneration.damageGrades.patternSymptomBias
  for (let i = 0; i < count && pool.length > 0; i++) {
    const symptom = pickWeighted(
      pool,
      (candidate) => symptomDrawWeight(candidate, pattern, context.partsTaxonomyById, bias),
      rng,
    )
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
    // A body-derived carrier's damage moves the underlying zone state (never
    // the band directly, per the single-writer rule) - a symptom cause is a
    // real hidden defect, so unlike the money-only degrade/improve passes it
    // legitimately touches metal too (`setZoneCarrierToAtLeastBand`). WHICH
    // zone it lands on is drawn from the pattern: it used to be a fixed
    // `bonnet` to save an RNG draw, which put every rust patch and every
    // respray in the game on the same panel.
    const tentative: CarInstance =
      working.zoneState && isBodyDerivedPart(cause.carPartId)
        ? applyDerivedBodyBands(
            {
              ...working,
              zoneState: setZoneCarrierToAtLeastBand(
                working.zoneState,
                cause.carPartId,
                cause.setBand,
                // `bodywork` writes metal, which only a metal zone carries;
                // `paint` is a finish any of the nine zones can take.
                pickPatternZone(
                  cause.carPartId === 'bodywork' ? METAL_ZONE_IDS : PANEL_ZONE_IDS,
                  pattern,
                  rng,
                ),
              ),
            },
            model,
            context,
          )
        : {
            ...working,
            parts: {
              ...working.parts,
              [cause.carPartId]: {
                installed: {
                  ...installed,
                  band:
                    bandIndex(cause.setBand) < bandIndex(beforeBand) ? cause.setBand : beforeBand,
                },
              },
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

/**
 * The worst-case number of times a zone-aware step (`degradeZoneCarrierOneStep`
 * or `improveZoneCarrierOneStep`) can move real headroom for the two body
 * carriers COMBINED, in EITHER direction, before every zone field is at its
 * bound: putting up to 9 zones back on the repairable ladder (one step each,
 * whether the panel was gone, past saving, or both) + `bodywork`'s surface (6
 * metal zones x 2) + `paint`'s finish (9 zones x 3). One
 * `degradeCandidates`/worst-band selection of a body carrier only ever
 * advances ONE zone one step (never the whole part at once, unlike an
 * ordinary part's `degradeBand`/`climbBand`), so a flat per-part bound would
 * undercount these two parts' true room and could cut the Law 2 softening
 * pass short before real, cheap headroom (e.g. an untouched zone's surface)
 * was ever used.
 */
const MAX_ZONE_STATE_STEPS =
  PANEL_ZONE_IDS.length + METAL_ZONE_IDS.length * 2 + PANEL_ZONE_IDS.length * 3

/** Every present, installed part on `car` eligible for one more degrade step
 * under the damage budget's never-to-scrap rule: a part already at `poor`,
 * one band above `scrap`, is excluded outright. Iterates `ALL_CAR_PART_IDS`
 * in its own fixed order, so the candidate list is deterministic for a given
 * car state; the caller narrows it to the least-damaged candidates and its
 * seeded `rng.pick` chooses among those. */
function degradeCandidates(car: CarInstance): CarPartId[] {
  const minDegradableIndex = bandIndex('poor') + 1
  return ALL_CAR_PART_IDS.filter((partId) => {
    const installed = car.parts[partId].installed
    if (!installed) return false
    // A zone-backed part's derived BAND can saturate at `poor` from `metal`
    // alone (a degrade step never touches metal - it is money-free), so
    // eligibility here reads the real money headroom in the zones directly
    // rather than the coarser band index every ordinary part uses.
    return car.zoneState && isBodyDerivedPart(partId)
      ? hasZoneDegradeHeadroom(car.zoneState, partId)
      : bandIndex(installed.band) >= minDegradableIndex
  })
}

/** The candidates in `pool` carrying the least damage: those sharing the
 * highest band index present. Confining each budget step to this set spreads
 * the budget across the car, so every eligible part is dropped to a level
 * before any part is taken below it. Preserves `ALL_CAR_PART_IDS` order, so
 * the caller's seeded `rng.pick` over the result stays deterministic. */
function shallowestCandidates(car: CarInstance, pool: readonly CarPartId[]): CarPartId[] {
  const bandIndexOf = (partId: CarPartId) => bandIndex(car.parts[partId].installed!.band)
  let shallowest = -1
  for (const partId of pool) {
    const idx = bandIndexOf(partId)
    if (idx > shallowest) shallowest = idx
  }
  return pool.filter((partId) => bandIndexOf(partId) === shallowest)
}

/** One candidate's degrade step, applied to `working` - the zone-aware
 * branch for a derived body carrier, or a plain band step otherwise. A body
 * carrier's step lands on whichever zone the car's damage pattern implicates,
 * which is how a shunt reads as a shunt rather than as bodywork spread evenly
 * around the shell. Pure in `working`: never mutates it, always returns a fresh
 * `CarInstance` (it does draw on `rng` for the zone). */
function degradeOnePart(
  working: CarInstance,
  model: CarModel,
  context: SimContext,
  pattern: DamagePattern,
  rng: Rng,
  partId: CarPartId,
): CarInstance {
  if (working.zoneState && isBodyDerivedPart(partId)) {
    const zoneState = degradeZoneCarrierOneStep(working.zoneState, partId, (candidates) =>
      pickPatternZone(candidates, pattern, rng),
    )
    return applyDerivedBodyBands({ ...working, zoneState }, model, context)
  }
  const installed = working.parts[partId].installed!
  return {
    ...working,
    parts: {
      ...working.parts,
      [partId]: { installed: { ...installed, band: degradeBand(installed.band, 1) } },
    },
  }
}

/** One candidate's degrade step, taken only if the result still clears the
 * SAME Law 2 ceiling every other generation step obeys - the softened car if
 * it does, `null` if the ceiling would push a band straight back. */
function degradeUnderCeiling(
  working: CarInstance,
  model: CarModel,
  context: SimContext,
  carOrigin: PartOrigin,
  pattern: DamagePattern,
  rng: Rng,
  partId: CarPartId,
): CarInstance | null {
  const candidate = degradeOnePart(working, model, context, pattern, rng, partId)
  const softened = enforceMaxBillFraction(candidate, model, context, carOrigin)
  return bandsMatch(softened, candidate) ? softened : null
}

/**
 * How well a car of this kind tends to have been looked after: its culture
 * picks a care profile, and its tier shifts that choice ONE STEP along the
 * `CARE_PROFILES` ladder - a flagship toward `cherished`, an entry car toward
 * `worked`, everyday and enthusiast left where culture put them.
 *
 * Culture is the primary axis because it captures how a car was USED. Tier
 * correlates with care but conflates it with price (a cheap Kyusha is
 * cherished, an expensive drift car is hammered), so it only nudges: an R32
 * is still a car people drove hard, but it cost enough that someone cared.
 *
 * Deliberately keyed on `CarTier` rather than through `fitmentClassForTier`.
 * The two value sets are identical today, but that function is the seam for
 * "which parts basket is this car charged for", a different question from
 * "how well was it looked after"; binding this shift to it would make a future
 * divergence silently wrong in a place nobody would think to look.
 */
export function careProfileFor(model: CarModel, economy: EconomyConfig): CareProfile {
  const base = economy.partsGeneration.damageGrades.careProfileByCulture[model.spec.culture]
  const index = CARE_PROFILES.indexOf(base)
  if (model.tier === 'flagship') return CARE_PROFILES[Math.max(0, index - 1)]!
  if (model.tier === 'entry') return CARE_PROFILES[Math.min(CARE_PROFILES.length - 1, index + 1)]!
  return base
}

/**
 * Rolls this car's HISTORY: what happened to it, drawn from the grade
 * distribution its own care profile carries
 * (`partsGeneration.damageGrades.careProfiles`). There is no roster-wide table
 * any more, because nobody wrecks a 2000GT and nobody handles an Acty with
 * white gloves; the roster-wide mix is what the 94 authored cultures add up
 * to, not a number anyone sets.
 *
 * Still NOT a per-venue table. `auction.carTierWeightsByAuctionTier` already
 * decides which price bands a room sells (the local yard is 70 per cent entry
 * cars, the collector network 70 per cent flagship), so the roughness gradient
 * across rooms emerges from the mix the rooms already have - and now from the
 * cultures inside that mix as well. A per-venue roll would count the same fact
 * a third time.
 */
export function rollDamageGrade(model: CarModel, economy: EconomyConfig, rng: Rng): DamageGrade {
  const weights = economy.partsGeneration.damageGrades.careProfiles[careProfileFor(model, economy)]
  const total = DAMAGE_GRADES.reduce((sum, grade) => sum + weights[grade], 0)
  const roll = rng.next() * total
  let cumulative = 0
  for (const grade of DAMAGE_GRADES) {
    cumulative += weights[grade]
    if (roll < cumulative) return grade
  }
  return DAMAGE_GRADES[DAMAGE_GRADES.length - 1]!
}

/**
 * Demotes a rolled `project` grade to `rough` when the car is under BOTH
 * `projectGateMaxAgeYears` and `projectGateMaxMileageKm` - a young,
 * barely-driven car cannot yet have been given up on, however the grade roll
 * landed. Either threshold alone leaves it eligible: a heavily driven young
 * car, or a lightly driven old one, still stays in the pool for the worst
 * grade. Every other grade passes through unchanged.
 */
export function gateProjectGrade(
  grade: DamageGrade,
  ageYears: number,
  mileageKm: number,
  economy: EconomyConfig,
): DamageGrade {
  if (grade !== 'project') return grade
  const { projectGateMaxAgeYears, projectGateMaxMileageKm } = economy.partsGeneration.damageGrades
  if (ageYears < projectGateMaxAgeYears && mileageKm < projectGateMaxMileageKm) return 'rough'
  return grade
}

/**
 * How many band steps of the car's damage budget its symptoms have already
 * spent: for every part `applySymptoms` damaged, the distance between the
 * band it recorded as apparent (the part's state BEFORE that symptom) and the
 * band the part actually holds now.
 *
 * Without this the budget would stack on top of a symptom's damage and a
 * symptomatic car would come out systematically rougher than an honest one,
 * for no reason a player could ever see - a symptom is a LABEL on damage, not
 * a second helping of it.
 */
export function damageStepsSpentBySymptoms(
  car: CarInstance,
  apparentBandByPartId: CarInstance['apparentBandByPartId'],
): number {
  if (!apparentBandByPartId) return 0
  let steps = 0
  for (const [partId, apparentBand] of Object.entries(apparentBandByPartId)) {
    if (!apparentBand) continue
    const installed = car.parts[partId as CarPartId].installed
    if (!installed) continue
    steps += Math.max(0, bandIndex(apparentBand) - bandIndex(installed.band))
  }
  return steps
}

/**
 * Spends `steps` band steps of honest visible wear on `car`, one installed
 * part at a time via the SAME seeded `rng` the rest of generation threads.
 * This is the whole of how much damage a generated lot carries beyond what its
 * own mileage produced (docs/design/systems/generation-damage.md, layer 1),
 * and it replaces the old bill-chasing floor: a yen target had no limit and
 * had to break far more of a cheap car's parts to reach the same number, which
 * is why entry-tier lots arrived as wrecks. The bill now falls out of the
 * parts' own prices instead.
 *
 * Three properties are load-bearing and each one, broken, inverts the
 * diagnosis game silently:
 *
 * - it runs AFTER `applySymptoms`, never before;
 * - it never writes `apparentBandByPartId`. Budget damage is honest visible
 *   wear that the room prices in full, not a second hidden defect; and
 * - the caller has already deducted `damageStepsSpentBySymptoms` from `steps`.
 *
 * Each step degrades one of the LEAST-damaged eligible parts
 * (`shallowestCandidates`), never a uniform pick over the whole pool, so the
 * budget spreads before it deepens: nothing is taken below a band until
 * everything eligible has reached it. That is what separates a small budget
 * from a large one in KIND rather than only in amount - ten steps drop ten
 * different parts one band each (real work, nothing ruined), while a project
 * car's budget covers the whole car and only then starts a second lap. A
 * uniform pick could instead land on one part repeatedly and ruin it while
 * its neighbours stayed untouched.
 *
 * WHICH of those least-damaged candidates takes the step is drawn from the
 * car's damage `pattern` rather than uniformly (docs/design/systems/
 * generation-damage.md, layer 3), and a body carrier's step lands on the zone
 * the pattern implicates. The shallow-first rule is unchanged and still binds
 * first, so the pattern decides the ORDER within a level and therefore where a
 * budget that runs out mid-level stopped: a shunted car reaches the bonnet, the
 * wings and the engine bay before its budget is spent, and its gearbox and
 * cabin are what the budget never got to.
 *
 * The candidate pool never offers an already-`poor` part, so no part is ever
 * forced to `scrap`, and every step runs under the same Law 2 ceiling the rest
 * of generation obeys (`degradeUnderCeiling`): a step that would breach it is
 * dropped and the next candidate tried, and the budget stops at best effort
 * once the pool is empty or the ceiling refuses every remaining candidate.
 */
export function spendDamageBudget(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  carOrigin: PartOrigin,
  pattern: DamagePattern,
  rng: Rng,
  steps: number,
): CarInstance {
  let working = car
  for (let step = 0; step < steps; step++) {
    let pool = degradeCandidates(working)
    if (pool.length === 0) break // nothing left to degrade anywhere - best effort

    // Try candidates until one clears the Law 2 ceiling, dropping any that
    // would breach it and trying the next rather than giving up the whole step
    // outright - a single unlucky pick (e.g. the one candidate already hugging
    // the ceiling) must never spend the budget short when another candidate
    // could still have carried it.
    let applied = false
    while (pool.length > 0 && !applied) {
      // The pattern draws the GROUP, and the shallow-first rule then spreads
      // within it. Weighting the individual candidates instead measures as
      // doing nothing: shallow-first finishes a level whatever order it takes
      // it in (see `pickPatternGroup`).
      const group = pickPatternGroup(pool, pattern, context.partsTaxonomyById, rng)
      const inGroup = pool.filter((id) => context.partsTaxonomyById[id].group === group)
      const partId = rng.pick(shallowestCandidates(working, inGroup))
      const stepped = degradeUnderCeiling(working, model, context, carOrigin, pattern, rng, partId)
      if (stepped) {
        working = stepped
        applied = true
      } else {
        pool = pool.filter((id) => id !== partId)
      }
    }
    if (!applied) break // every remaining candidate would breach the ceiling
  }
  return working
}

/**
 * Whether `model` can turn up at `tier` at all. Every car is eligible in every
 * room by default, so which room a car appears in is a probability rather than
 * a rule; two things still rule a car out outright:
 *
 * - the room deals in price bands, and a band the room weights at zero
 *   (`economy.auction.carTierWeightsByAuctionTier`) never appears there - no
 *   flagship at a local yard, no entry car at a collector network; and
 * - GDD 9.2 confines a `legend` to the rep-gated Collector Network.
 *
 * GDD 4.5's separate rule that a gaisha import never reaches a regular auction
 * catalogue is an ORIGIN rule, and belongs to the Import Broker channel that
 * will read `CarModel.origin` (see TODO.md); every shipped car is `jdm`, so no
 * catalogue can currently breach it.
 */
export function canAppearAtAuctionTier(
  model: CarModel,
  tier: AuctionTier,
  economy: EconomyConfig,
): boolean {
  if (model.rarity === 'legend' && tier !== 'collector-network') return false
  return economy.auction.carTierWeightsByAuctionTier[tier][model.tier] > 0
}

/** Duration by rarity: a flash-sale roll applies to any car first; otherwise
 * legend cars always get a long sale, uncommon/rare occasionally do, and
 * everything else gets the standard band. */
export function rollAuctionDurationDays(
  rarity: CarRarity,
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
export function mileageRangeForAge(ageYears: number, economy: EconomyConfig): [number, number] {
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
 * the host car's own class, so an entry-tier car never rolls a family-priced
 * stock part (economy-bible.md law 3).
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
  return { id: `${idPrefix}-${partId}`, partId: catalogPart.id, band, origin }
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
  return { id: `${idPrefix}-${partId}`, partId: catalogPart.id, band, origin }
}

/** A specific-grade aftermarket instance, at the SAME rolled `band` - the
 * paint slot's own fit, which follows the whole-car paint-history roll
 * (`generatedPaintGrade`) rather than the weighted-grade mechanism
 * `aftermarketInstanceFor` above uses for every other slot. `null` when the
 * catalog has no entry at exactly this grade. */
function aftermarketInstanceAtGrade(
  partId: CarPartId,
  band: ReturnType<typeof bandForMigratedCondition>,
  idPrefix: string,
  fitmentClass: PartFitmentClass,
  aftermarketPartByCarPartId: SimContext['aftermarketPartByCarPartId'],
  grade: Grade,
  origin: PartOrigin,
): PartInstance | null {
  const catalogPart = aftermarketPartByCarPartId[fitmentClass]?.[partId]?.[grade]
  if (!catalogPart) return null
  return { id: `${idPrefix}-${partId}`, partId: catalogPart.id, band, origin }
}

/**
 * The hidden non-stock roll (docs/design/systems/knowledge-and-diagnosis.md
 * section 9, sprint215.md task E): separate from, and layered on top of, the
 * always-revealed aftermarket roll above - one ESTIMATED slot (never one of
 * `defaultVerifiedSlots`'s always-visible ones) whose true installed part
 * becomes a non-stock SKU at its own already-rolled band. Only ever picks a
 * slot still carrying its stock-grade default, so it can never collide with
 * the ordinary aftermarket roll's own pick. The knowledge model
 * (`knowledge.ts`'s `knowledgeViewOf`) is what actually hides this from the
 * player pre-verification - generation only decides WHETHER and WHERE, at
 * the same rolled band the slot already carries, on the same `aftermarketInstanceFor`
 * grade-weighting every other aftermarket fit in this file uses.
 *
 * Chance scales by the culture's own multiplier (tuner/enthusiast scenes
 * modify more) and by the same `aftermarketChanceMultiplierByGrade[history]`
 * the ordinary aftermarket roll reads - one "how modified is this car" axis,
 * not two. A `null` `fitmentClass` entry (an eligible slot with no aftermarket
 * catalog entry at all) simply leaves the slot alone.
 *
 * `aftermarketSlotsFitted` is the ordinary aftermarket roll's own count for
 * this car (the per-part loop above): a hidden fit is still an aftermarket
 * fit, so it counts against the SAME `maxAftermarketSlots` cap rather than a
 * second, independent one - "someone's old project" stays meaningfully
 * modified, not entirely rebuilt, whether the player can see it yet or not.
 */
export function rollHiddenNonStock(
  car: CarInstance,
  model: CarModel,
  fitmentClass: PartFitmentClass,
  history: DamageGrade,
  idPrefix: string,
  origin: PartOrigin,
  context: SimContext,
  rng: Rng,
  aftermarketSlotsFitted: number,
): CarInstance {
  const { hiddenNonStock, damageGrades, maxAftermarketSlots } = context.economy.partsGeneration
  const chance = Math.min(
    1,
    hiddenNonStock.baseChance *
      hiddenNonStock.cultureMultiplier[model.spec.culture] *
      damageGrades.aftermarketChanceMultiplierByGrade[history],
  )
  // Rolled unconditionally, even when no slot ends up eligible, so the RNG
  // draw sequence per car stays uniform regardless of outcome.
  const hit = rng.next() < chance
  if (!hit || aftermarketSlotsFitted >= maxAftermarketSlots) return car

  const alwaysVisible = new Set(defaultVerifiedSlots(context))
  const eligible = ALL_CAR_PART_IDS.filter((partId) => {
    if (alwaysVisible.has(partId)) return false
    const installed = car.parts[partId].installed
    if (!installed) return false
    return context.partsById[installed.partId]?.grade === 'stock'
  })
  if (eligible.length === 0) return car

  const partId = rng.pick(eligible)
  const installed = car.parts[partId].installed!
  const hidden = aftermarketInstanceFor(
    partId,
    installed.band,
    idPrefix,
    fitmentClass,
    context.aftermarketPartByCarPartId,
    context.economy.partsGeneration.aftermarketGradeWeights,
    origin,
    rng,
  )
  if (!hidden) return car
  return { ...car, parts: { ...car.parts, [partId]: { ...car.parts[partId], installed: hidden } } }
}

/** The denormalised label a `PartOrigin` carries - `"'95 Corolla"` style,
 * using the model's display name and the instance year, so it still reads
 * correctly after the donor car is sold or scrapped. */
export function carOriginLabel(model: CarModel, year: number): string {
  return `'${String(year % 100).padStart(2, '0')} ${resolveCarDisplayName(model)}`
}

/**
 * The condition offset this car's damage pattern applies to each slot, in
 * condition percent: the whole of how the pattern reaches a car's condition
 * roll, and the reason a shunted car's engine bay reads as a shunt rather than
 * as an ordinary car with a slightly unlucky bonnet.
 *
 * Two slots are held out and take no offset, both for the same reason - the
 * offsets sum to zero across the slots they are computed over, and a slot whose
 * rolled band is then thrown away would break that:
 *
 * - the zone-derived body carriers, whose band `applyDerivedBodyBands`
 *   overwrites from the zone table moments later (the pattern reaches the shell
 *   through `zoneDamageOrder` instead); and
 * - `forcedInduction` on a car that never had any, which fills no slot at all.
 */
function patternOffsetByPartId(
  carHasForcedInduction: boolean,
  pattern: DamagePattern,
  context: SimContext,
): Record<string, number> {
  const offsetable = ALL_CAR_PART_IDS.filter(
    (partId) =>
      !isBodyDerivedPart(partId) && (partId !== 'forcedInduction' || carHasForcedInduction),
  )
  return patternConditionOffsets(
    offsetable,
    pattern,
    context.partsTaxonomyById,
    context.economy.partsGeneration.patternConditionSwingPercent,
  )
}

/**
 * Rolls a fresh, not-yet-owned car for an auction lot. Every slot fills with
 * a fresh stock `PartInstance` at the rolled condition band by default - an
 * auction car hasn't been touched yet (GDD: "buy rough, restore/build").
 * `currentYear` (default Infinity = unrestricted) clamps the rolled model
 * year to the in-game calendar.
 *
 * One 0-100 condition baseline is rolled per car, and each of the 29 real
 * parts jitters around it and takes its damage pattern's own offset
 * (`patternOffsetByPartId`), then buckets into its band via
 * `bandForMigratedCondition`. `forcedInduction` follows the model's tag,
 * never the missing-slot roll, and `paint` follows the whole-car paint-
 * history roll below instead (`generatedPaintGrade`); every OTHER slot
 * additionally rolls a small, content-tunable chance of coming up MISSING
 * instead of its default stock fill.
 *
 * The car's own factory colour is rolled once, from the model's
 * `spec.factoryColours` pool, and feeds `rollZoneStates`'s own paint-history
 * roll: one of four whole-car states (still factory, resprayed, one
 * mismatched panel, one bare panel), weighted by the car's culture
 * (`partsGeneration.paintHistoryByCulture` -> `paintHistory`). The state sets
 * every panel zone's colour and decides the paint slot's SKU grade - stock
 * unless the whole car is uniformly resprayed to a colour it did not leave
 * the factory in, which is always the cheap street job.
 *
 * Generation is a single causal chain: `year -> ageYears -> mileage range ->
 * roll mileage -> condition range -> roll condition baseline -> per-part
 * jitter`. Mileage is the one coherent wear driver - age reaches condition
 * only through it. This is generation only, not value: `marketValue.ts` has
 * no age factor; mileage reaches value solely via `mileageFactor`.
 *
 * THE CAR'S HISTORY IS ROLLED ONCE, EARLY, AND EVERYTHING ELSE ABOUT ITS
 * CONDITION IS AN EFFECT OF IT (docs/design/systems/generation-damage.md,
 * layer 2). Its culture and tier select a care profile (`careProfileFor`) and
 * the history is drawn from that profile's grade distribution, gated by age
 * and mileage (`gateProjectGrade`), because a young, barely-driven car cannot
 * yet have been given up on. Four things then read it, and none of them rolls
 * independently:
 *
 * - the UPKEEP TIER it reads as (`damageGrades.upkeepTierByGrade`), which
 *   offsets the mileage-based condition baseline, reshapes the per-part jitter
 *   range, scales the missing-slot chance, and picks `provenanceNote` from a
 *   tier-matched pool. There is no separate upkeep roll: it and the history
 *   answered the same question, and rolling both let a car someone had given
 *   up on carry a cherished blurb;
 * - the AFTERMARKET CHANCE per slot, scaled by
 *   `damageGrades.aftermarketChanceMultiplierByGrade`, so a car that was
 *   driven hard is likelier to have been modified than one that was garaged;
 *   and
 * - the DAMAGE BUDGET in band steps (`damageGrades.bandStepsByGrade`), spent
 *   as honest visible wear after the symptoms have landed
 *   (`spendDamageBudget`), less whatever those symptoms already spent; and
 * - the DAMAGE PATTERN (`damageGrades.patternWeightsByGrade`), which is the
 *   sole answer to WHERE (layer 3). One weighting over part slots, drawn once
 *   here and read by three consumers: the condition roll is OFFSET by it
 *   (`patternOffsetByPartId`), the budget spends against it, and the symptom
 *   draw weights each candidate by how much its causes sit in the groups it
 *   implicates. That single join is why a car that went in the front has
 *   front-end damage AND presents a front-end symptom, rather than a ruined
 *   nose and an unrelated gearbox whine. The offset is the load-bearing one of
 *   the three: the budget is only about a fifth of a car's band steps, so a
 *   pattern that reached the budget alone could barely move a group's total.
 *
 * The direction of causation is the whole point and it only runs one way: the
 * history causes the damage, the parts and the symptom, and none of them is
 * ever read back to infer the history.
 *
 * `allowMissingSlots` (default true) lets `serviceJobs.ts`'s customer-car
 * generation pass false - a customer's car should never turn up missing an
 * unrelated part, nor with one of its body panels gone. `day` (default 0)
 * stamps every part's `origin`.
 * `allowSymptoms` (default true) similarly lets customer-car generation
 * pass false - symptoms only spawn on auction lots.
 *
 * After the missing-slot roll, a non-missing, non-`forcedInduction`,
 * non-`paint` slot rolls its history-scaled chance to fit a weighted-grade
 * aftermarket part (`aftermarketInstanceFor`) instead of the default stock
 * one, at the SAME rolled band, capped at `maxAftermarketSlots` per car -
 * this runs for every caller, with no gating parameter.
 */
/**
 * The `[oldest, youngest]` model years a generated car of this model can carry
 * in a campaign at `currentYear` - the whole of the rule, and the only place it
 * is written.
 *
 * The window is the car's own production run, so a Hakosuka built 1969 to 1972
 * can never turn up on a 1977 plate. Two clamps narrow the top of it and
 * neither can ever open it: a current-model-year car doesn't reach a backyard
 * auction, so the newest year is at least `AUCTION_MIN_AGE_YEARS` old; and
 * `yearFrom` wins outright if that pushes the window shut, because a car cannot
 * predate its own model. An infinite `currentYear` means no campaign is known,
 * and only the production run applies.
 *
 * That `yearFrom` clamp is unreachable from an auction catalogue, whose own
 * eligibility filter (`generateAuctionCatalog`) already drops every model too
 * new to satisfy the floor. It binds for the callers that generate a car
 * without that filter and must still produce one: a service-job customer's car
 * (`serviceJobs.ts`), which admits any model already released, and the
 * whole-roster sweeps behind the play-ranking probe (`plays.ts`) and the
 * economy bench. A 1994 model in a 1995 campaign generates as a 1994 car there,
 * age 1, which is why the clamp stays.
 */
export function generatedYearRangeFor(
  model: CarModel,
  currentYear: number,
  economy: EconomyConfig,
): [number, number] {
  const youngestAllowedYear = Number.isFinite(currentYear)
    ? Math.min(model.spec.yearTo, currentYear - economy.AUCTION_MIN_AGE_YEARS)
    : model.spec.yearTo
  return [model.spec.yearFrom, Math.max(model.spec.yearFrom, youngestAllowedYear)]
}

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
  const [oldestYear, youngestYear] = generatedYearRangeFor(model, currentYear, economy)
  const year = rng.int(oldestYear, youngestYear)
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
  const { upkeepBaselineOffset, upkeepJitterRange, upkeepMissingMultiplier } =
    economy.partsGeneration
  const { upkeepTierByGrade, aftermarketChanceMultiplierByGrade } =
    economy.partsGeneration.damageGrades
  // Shared across every part in the loop below (not reset per part) - the cap
  // is per car, not per slot.
  let aftermarketSlotsFitted = 0
  // THE HISTORY, rolled here rather than at the end of generation because
  // everything below is an effect of it. Age and mileage are already known, so
  // the gate can run immediately: a car under both thresholds cannot have been
  // given up on yet, whatever the profile rolled.
  const history = gateProjectGrade(
    rollDamageGrade(model, economy, rng),
    ageYears,
    mileageKm,
    economy,
  )
  // WHERE that history left its mark, drawn immediately after it because the
  // two are one fact: the history says how rough the car is and the pattern
  // says what happened to it. Both the damage budget and the symptom draw read
  // this one weighting, which is what stops a car's visible damage and its
  // hidden fault describing two unrelated events.
  const pattern = rollDamagePattern(history, economy, context.damagePatterns, rng)
  // How the car was treated is READ OFF the history rather than rolled beside
  // it: they are one fact, and two rolls let a car someone had given up on
  // carry a "one careful owner" blurb.
  const upkeepTier = upkeepTierByGrade[history]
  // A hard-driven car is likelier to have been modified than a garaged one.
  // Clamped because the multiplier and the base chance are authored
  // independently and their product is still a probability.
  const slotAftermarketChance = Math.min(
    1,
    aftermarketChance * aftermarketChanceMultiplierByGrade[history],
  )
  // Upkeep only expresses in proportion to how far the car has actually been
  // driven - see `wearExposure`. At ~0 km a nearly-new car is near-mint; at
  // high mileage a neglected history bites exactly as hard as before. A car can
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

  // How far the car's story moves each slot off that shared baseline.
  const patternOffset = patternOffsetByPartId(carHasForcedInduction, pattern, context)

  // The paint slot's own fit follows the whole-car paint-history roll rather
  // than the generic per-slot missing/aftermarket mechanism every other slot
  // below uses, so both are drawn here, ahead of the per-slot loop: the car's
  // factory colour, then the zone colours/primed state it rolls into
  // (`rollZoneStates`), then the SKU grade that state implies
  // (`generatedPaintGrade`).
  const factoryColour = rng.pick(model.spec.factoryColours)
  const zoneState = rollZoneStates(
    fitmentClass,
    economy,
    rng,
    zoneDamageOrder(PANEL_ZONE_IDS, pattern, rng),
    history,
    allowMissingSlots,
    factoryColour,
    model.spec.culture,
  )
  const paintGrade = generatedPaintGrade(zoneState, factoryColour)

  const parts = Object.fromEntries(
    ALL_CAR_PART_IDS.map((partId) => {
      const percent = clampCondition(
        conditionBaseline + rng.int(jitterMin, jitterMax) + (patternOffset[partId] ?? 0),
      )
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

      // The paint SKU generation fits is exactly what the paint-history roll
      // above already decided (stock or street, never a randomly weighted
      // grade), so this slot never draws the generic missing/aftermarket
      // rolls below - a resprayed car is always the cheap solid job, never a
      // metallic or pearl one nobody chose to pay for.
      if (partId === 'paint') {
        const installed =
          paintGrade === 'stock'
            ? stockInstanceFor(
                partId,
                band,
                `${id}-part`,
                fitmentClass,
                stockPartByCarPartId,
                carOrigin,
              )
            : (aftermarketInstanceAtGrade(
                partId,
                band,
                `${id}-part`,
                fitmentClass,
                context.aftermarketPartByCarPartId,
                paintGrade,
                carOrigin,
              ) ??
              stockInstanceFor(
                partId,
                band,
                `${id}-part`,
                fitmentClass,
                stockPartByCarPartId,
                carOrigin,
              ))
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
      const rolledAftermarket = rng.next() < slotAftermarketChance
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
    factoryColour,
    // The blurb must fit the car's AGE as well as its upkeep.
    provenanceNote: rng.pick(context.provenancePool[ageBandFor(ageYears)][upkeepTier]),
    parts,
    symptoms: [],
    apparentBandByPartId: null,
    // The work model's own roll (docs/design/systems/workshop-rework.md) - independent
    // of the per-part jitter loop above, which still fills `bodywork` with a
    // stock part (never missing or aftermarket, since those SKUs are
    // retired/migrated); the projection below immediately overwrites that
    // jittered band with the real, zone-derived one. `paint` alone in that
    // loop follows this same zone state's colours rather than a stock
    // default, since its SKU grade is exactly what those colours already say.
    // The zone severities the tier tables rolled, ARRANGED by the pattern:
    // the same damage, on the panels the car's own story implicates. The
    // history rides along because it alone decides whether the panel the
    // pattern hit hardest is past saving rather than merely bent, and a
    // customer's own car never turns up with a panel gone, exactly as it never
    // turns up missing an unrelated slot.
    zoneState,
    history,
    damagePattern: pattern.id,
  }
  // Runs BEFORE the Law 2 ceiling (`enforceMaxBillFraction`) below, exactly
  // where the ordinary aftermarket roll above already sits in the per-part
  // loop: a hidden non-stock SKU can genuinely cost more than the stock
  // part it replaces (`partCostToBandYen` prices off the INSTALLED part's
  // own catalogue price), so the ceiling has to see the real fitted part to
  // stay a real ceiling. Also respects `maxAftermarketSlots` against the
  // ordinary roll's own count - one shared cap on how modified a car is
  // allowed to be, visible or hidden.
  const withHidden = rollHiddenNonStock(
    rolled,
    model,
    fitmentClass,
    history,
    `${id}-part`,
    carOrigin,
    context,
    rng,
    aftermarketSlotsFitted,
  )
  const withDerivedBands = applyDerivedBodyBands(withHidden, model, context)
  const softened = enforceMaxBillFraction(withDerivedBands, model, context, carOrigin)
  if (!allowSymptoms) return softened

  const {
    car: withSymptoms,
    symptoms,
    apparentBandByPartId,
  } = applySymptoms(softened, model, context, carOrigin, pattern, rng)
  // Spend what the history bought, less what the symptoms above already spent.
  // The order is load-bearing: the budget runs AFTER symptoms and never writes
  // `apparentBandByPartId`, so budget damage is honest wear the room prices in
  // full rather than a second hidden defect.
  //
  // The history names how rough the car is FOR ITS AGE; the raw step count
  // still needs scaling by how much life the car has actually had, or a car
  // fresh off the lot rolling `used` would take the same steps as a
  // decades-old one rolling `used`. Reuses `wearExposure` - the same
  // mileage-driven axis that already gates upkeep jitter above. `minWorkSteps`
  // floors the scaled result so a barely-driven car never generates with
  // nothing to fix at all: the core-loop law guarantees SOME work on every lot,
  // and ten steps spread across the car is a handful of parts dropped one band
  // each, not a ruined one - it lands well under what it takes to reach `poor`.
  const budgetSteps = Math.max(
    economy.partsGeneration.damageGrades.minWorkSteps,
    Math.round(economy.partsGeneration.damageGrades.bandStepsByGrade[history] * exposure),
  )
  const remainingSteps = Math.max(
    0,
    budgetSteps - damageStepsSpentBySymptoms(withSymptoms, apparentBandByPartId),
  )
  const damaged = spendDamageBudget(
    withSymptoms,
    model,
    context,
    carOrigin,
    pattern,
    rng,
    remainingSteps,
  )
  return { ...damaged, symptoms, apparentBandByPartId }
}

/**
 * Economy-bible.md law 2 (no value traps): softens a freshly-rolled car
 * until `carCostToMintYen(car) <= maxBillFraction x cleanValue` - every
 * generatable lot is therefore profitably restorable. `cleanValue` is
 * `cleanValueYen` at a fixed, heat-neutral 100 - car generation has no live
 * market heat to read (`SimContext` carries static content only, not the
 * evolving per-model heat in `GameState`), and Law 2's guarantee is meant to
 * hold as a closed-form invariant independent of whatever heat a car later
 * experiences on the market, not just at the moment it happens to be rolled.
 * Two bounded, always-convergent passes, since band damage is the common
 * case and missing slots are comparatively rare:
 *
 * 1. Up to 4 passes lifting every part at the car's single worst band by
 *    one step, re-checking the bill after each pass.
 * 2. If the bill still exceeds budget once every part is mint (only
 *    possible when a genuinely-missing slot is driving it), fills every
 *    missing slot with a fresh mint stock part - guaranteed to satisfy the
 *    guard, since the bill is then exactly zero.
 *
 * Both passes are pure functions of the already-rolled `car` (no additional
 * RNG draws), so determinism for a given seed is unaffected. The
 * balance-probe harness (`balanceProbes.ts`) calls this SAME function to
 * prove Law 2 holds for every roster model.
 */
export function enforceMaxBillFraction(
  car: CarInstance,
  model: CarModel,
  context: SimContext,
  origin: PartOrigin,
): CarInstance {
  const { economy, partsById, partsTaxonomyById, stockPartByCarPartId } = context
  const fitmentClass = fitmentClassForTier(model.tier)
  const cleanValue = cleanValueYen(model.bookValueYen, car.mileageKm, 100, economy)
  const maxBillYen = economy.partsGeneration.maxBillFraction * cleanValue
  const billFor = (c: CarInstance) =>
    carCostToMintYen(c, model, partsById, partsTaxonomyById, economy)

  let working = car
  // The ordinary 4-pass worst-case (every non-zone part shares one of 4
  // non-mint bands, so they always climb together) is already generously
  // covered by `ALL_CAR_PART_IDS.length`; a zone-backed carrier only ever
  // advances ONE zone one step per pass (never the whole part), so a car on
  // the zone model gets `MAX_ZONE_STATE_STEPS` more passes on top - the same
  // bound the zone-aware degrade step is itself sized against.
  const maxPasses = ALL_CAR_PART_IDS.length + (car.zoneState ? MAX_ZONE_STATE_STEPS : 0)
  for (let pass = 0; pass < maxPasses && billFor(working) > maxBillYen; pass++) {
    let worstBandIdx: number | null = null
    for (const partId of ALL_CAR_PART_IDS) {
      const installed = working.parts[partId].installed
      if (!installed) continue
      // An exhausted zone-backed carrier (no more money headroom to improve)
      // never counts toward the worst-band search, even short of `mint`:
      // metal never moves here, so a high-metal zone can pin a derived band
      // below `mint` PERMANENTLY - left in, it would wrongly stay the
      // eternal "worst part" forever and starve every other part still
      // genuinely climbable of its own passes.
      if (
        working.zoneState &&
        isBodyDerivedPart(partId) &&
        !hasZoneImproveHeadroom(working.zoneState, partId)
      ) {
        continue
      }
      const idx = bandIndex(installed.band)
      if (worstBandIdx === null || idx < worstBandIdx) worstBandIdx = idx
    }
    if (worstBandIdx === null || worstBandIdx >= bandIndex('mint')) break
    let parts = working.parts
    let zoneState = working.zoneState
    for (const partId of ALL_CAR_PART_IDS) {
      const installed = parts[partId].installed
      if (!installed || bandIndex(installed.band) !== worstBandIdx) continue
      // A derived body carrier never climbs its OWN band directly - the zone
      // state underneath it improves by one step instead, and the projection
      // re-derives the band from that afterward (the single-writer rule).
      if (zoneState && isBodyDerivedPart(partId)) {
        if (!hasZoneImproveHeadroom(zoneState, partId)) continue // exhausted - see the search above
        zoneState = improveZoneCarrierOneStep(zoneState, partId)
        continue
      }
      parts = {
        ...parts,
        [partId]: { installed: { ...installed, band: climbBand(installed.band, 1) } },
      }
    }
    working = { ...working, parts, zoneState }
    if (zoneState) working = applyDerivedBodyBands(working, model, context)
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
 * Stage one of the catalogue draw: which price band this lot is, rolled
 * straight from the room's own signed distribution
 * (`economy.auction.carTierWeightsByAuctionTier`). Local Yard's row of
 * 70/28/2/0 therefore means exactly that - 70 lots in 100 are entry cars -
 * regardless of how many models sit in each band.
 *
 * `stocked` carries only the bands that have an eligible model to offer today.
 * A band with none is dropped from the roll rather than re-rolled: the two
 * give the identical distribution (dropping renormalises exactly as an
 * unbounded re-roll converges to), but dropping costs one draw and cannot fail
 * to terminate. It cannot arise on the shipped roster, where every band the
 * table weights above zero has cars.
 */
function rollCarTier(
  stocked: readonly CarTier[],
  tier: AuctionTier,
  economy: EconomyConfig,
  rng: Rng,
): CarTier {
  const row = economy.auction.carTierWeightsByAuctionTier[tier]
  const total = stocked.reduce((sum, carTier) => sum + row[carTier], 0)
  const roll = rng.next() * total
  let cumulative = 0
  for (const carTier of stocked) {
    cumulative += row[carTier]
    if (roll < cumulative) return carTier
  }
  return stocked[stocked.length - 1]!
}

/**
 * Stage two: which car, given the band. Weighted by scarcity alone
 * (`economy.auction.rarityDrawMultiplier`), so a rare car is rare among its
 * own price peers rather than shunted into a different room. The band is
 * already decided by the time this runs, so this can never move the room's
 * band mix.
 */
function pickModelByRarity(
  models: readonly CarModel[],
  economy: EconomyConfig,
  rng: Rng,
): CarModel {
  const { rarityDrawMultiplier } = economy.auction
  const weights = models.map((model) => rarityDrawMultiplier[model.rarity])
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
 * Weekly catalog for one tier: `count` lots, each drawn in two stages - the
 * room rolls a price band from its own signed distribution, then picks a car
 * within that band by scarcity (`rollCarTier`, `pickModelByRarity`). A model
 * the room never offers (`canAppearAtAuctionTier`) is out of the pool
 * entirely. `currentYear` (default Infinity = unrestricted) also excludes any
 * model that cannot yet produce a car the age floor allows: a model is out of
 * the pool until its `yearFrom` is at least `AUCTION_MIN_AGE_YEARS` behind the
 * in-game calendar, so a still-unreleased model can't appear at auction (GDD
 * 2.2) and neither can a current-model-year one. Every model this filter keeps
 * therefore satisfies `generatedYearRangeFor`'s upper clamp outright, so no lot
 * a room offers is ever younger than the floor. Each lot's own duration is
 * rolled independently off its model's rarity.
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
  excludedModelIds: readonly string[] = [],
): AuctionLot[] {
  const { economy } = context
  const eligible = models.filter(
    (model) =>
      canAppearAtAuctionTier(model, tier, economy) &&
      model.spec.yearFrom <= currentYear - economy.AUCTION_MIN_AGE_YEARS &&
      !excludedModelIds.includes(model.id),
  )
  if (eligible.length === 0) return []

  // Grouped once, in the enum's own fixed order, so the roll below is
  // deterministic for a given seed whatever order `models` arrived in.
  const poolByCarTier = new Map<CarTier, CarModel[]>()
  for (const carTier of CarTierSchema.options) {
    const pool = eligible.filter((model) => model.tier === carTier)
    if (pool.length > 0) poolByCarTier.set(carTier, pool)
  }
  const stocked = [...poolByCarTier.keys()]

  const lots: AuctionLot[] = []
  for (let i = 0; i < count; i++) {
    const carTier = rollCarTier(stocked, tier, economy, rng)
    const model = pickModelByRarity(poolByCarTier.get(carTier)!, economy, rng)
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
      expiresOnDay: day + rollAuctionDurationDays(model.rarity, rng, economy),
      turnout: rollTurnoutBand(rng, economy),
    })
  }
  return lots
}
