import {
  fitmentClassForTier,
  type CarInstance,
  type CarModel,
  type CarPartId,
  type CarPartTaxonomyEntry,
  type ComponentId,
  type ConditionBand,
  type EconomyConfig,
  type Part,
  type PartFitmentClass,
  type ToolLevel,
  type ToolLevels,
} from '@midnight-garage/content'
import {
  bodyPartRepairBillByZoneYen,
  bodyPartRepairBillYen,
  isBodyDerivedPart,
  type ZoneBillLine,
} from './bodyPipeline'
import { crewEnergySaved, perfectionistCostMultiplier, type CrewSkillContext } from './crewSkills'
import { partFixCostYen, sumFixCosts, type FixCostContext, type PartFixCost } from './repairJobs'

/** The banded parts model's core math - band ordering, climbing, repair
 * cost, and the cost-weighted value shim; every other sim module that
 * touches a part's condition goes through this file. */

/** Worst to best - scrap is index 0 (unrepairable), mint is the ceiling. */
const BAND_ORDER: readonly ConditionBand[] = ['scrap', 'poor', 'worn', 'fine', 'mint']

export function bandIndex(band: ConditionBand): number {
  return BAND_ORDER.indexOf(band)
}

export function bandFactor(band: ConditionBand, economy: EconomyConfig): number {
  return economy.bands.bandFactors[band]
}

/** Grades between two bands (always >= 0; `to` is normally 'mint' or a
 * player-staged target above `from`). */
export function gradesBetween(from: ConditionBand, to: ConditionBand): number {
  return Math.max(0, bandIndex(to) - bandIndex(from))
}

/** Climbs `grades` steps toward mint, capped there - never returns anything
 * below `from` and never below `scrap`'s terminal floor (scrap never calls
 * this; see `canRepair`). */
export function climbBand(from: ConditionBand, grades: number): ConditionBand {
  const nextIndex = Math.min(BAND_ORDER.length - 1, bandIndex(from) + Math.max(0, grades))
  return BAND_ORDER[nextIndex]!
}

/** Degrades `grades` steps toward scrap, floored there - the wear-direction
 * mirror of `climbBand`. Callers that must never actually reach `scrap`
 * (generation-time wear top-up) enforce that by excluding an already-`poor`
 * part from their candidate pool before calling this, rather than relying on
 * this floor - this clamp is a defensive backstop, not the real guard. */
export function degradeBand(from: ConditionBand, grades: number): ConditionBand {
  const nextIndex = Math.max(0, bandIndex(from) - Math.max(0, grades))
  return BAND_ORDER[nextIndex]!
}

/** The ONE repairability predicate: scrap is terminal, and a non-repairable
 * consumable (tyres, brakePadsDiscs, clutch) is replace-only at every band.
 * Every planner calls this rather than re-deriving either check locally. */
export function canRepair(band: ConditionBand, taxonomyEntry: CarPartTaxonomyEntry): boolean {
  return band !== 'scrap' && taxonomyEntry.repairable
}

/** Every band strictly BELOW `target`, excluding scrap (terminal, never a
 * valid "still needs repair" roll). Empty when `target` is `poor` or `scrap`. */
export function bandsBelowExcludingScrap(target: ConditionBand): ConditionBand[] {
  const targetIndex = bandIndex(target)
  return BAND_ORDER.filter((band, i) => band !== 'scrap' && i < targetIndex)
}

/** The atom valuation: cost to bring one part to mint (`costToBandYen` at
 * `targetBand = 'mint'`), reused by every price/payout calc. */
export function costToMintYen(
  band: ConditionBand,
  taxonomyEntry: CarPartTaxonomyEntry,
  partPriceYen: number,
  repairStepFraction: number,
  fitmentClass: PartFitmentClass,
): number {
  return costToBandYen(band, 'mint', taxonomyEntry, partPriceYen, repairStepFraction, fitmentClass)
}

/** The general form of `costToMintYen` (which is just this at `targetBand =
 * 'mint'`): cost to bring ONE part up to `targetBand`, zero if already
 * there or better. Exists so `marketValueYen` can split the restoration
 * bill at the car's tier expectation band: `costToBandYen(b, t) + (cost
 * above t) === costToMintYen(b)` for every band. */
export function costToBandYen(
  band: ConditionBand,
  targetBand: ConditionBand,
  taxonomyEntry: CarPartTaxonomyEntry,
  partPriceYen: number,
  repairStepFraction: number,
  fitmentClass: PartFitmentClass,
): number {
  if (bandIndex(band) >= bandIndex(targetBand)) return 0
  if (band === 'scrap') return taxonomyEntry.stockReplacementPriceYenByClass[fitmentClass]
  if (!taxonomyEntry.repairable) {
    return bandIndex(band) >= bandIndex('fine')
      ? 0
      : taxonomyEntry.stockReplacementPriceYenByClass[fitmentClass]
  }
  return Math.round(gradesBetween(band, targetBand) * repairStepFraction * partPriceYen)
}

/**
 * What a used part fetches over the counter: its own catalogue price, scaled
 * by the resale condition curve (`teardown.resaleBandFactors`) and the
 * used-part haircut (`teardown.usedPartSaleFraction`). Zero for a scrap
 * part, which has no counter value at all - `scrapValueYen` is its only
 * route. The one formula every sale price, preview and probe reads, so the
 * button's price tag and the coherence table can never disagree.
 *
 * The resale curve is deliberately steeper than `bands.bandFactors`, which
 * prices repair and car value: that gap is what makes reconditioning a poor
 * part to worn worth doing before selling it, and repairing past worn not.
 */
export function usedPartSaleValueYen(
  partPriceYen: number,
  band: ConditionBand,
  economy: EconomyConfig,
): number {
  if (band === 'scrap') return 0
  const { resaleBandFactors, usedPartSaleFraction } = economy.teardown
  return Math.round(partPriceYen * resaleBandFactors[band] * usedPartSaleFraction)
}

/** A scrap PartInstance's sale payout: "pennies on the yen" against its
 * stock-equivalent replacement cost, at the scrapped instance's own class. */
export function scrapValueYen(
  taxonomyEntry: CarPartTaxonomyEntry,
  economy: EconomyConfig,
  fitmentClass: PartFitmentClass,
): number {
  return Math.round(
    taxonomyEntry.stockReplacementPriceYenByClass[fitmentClass] * economy.bands.scrapValueFraction,
  )
}

/** True when `model` has forced induction from the factory - the one
 * platform fact that decides whether an empty `forcedInduction` slot is a
 * real defect or legitimate, permanent absence, and the fact
 * `engineCharacterOf` answers first.
 *
 * Read from `spec.aspiration`, the car's own induction field, which is
 * required on every model and authored per car. `NA` is the only naturally
 * aspirated value the enum carries, so anything else is forced. The
 * induction TAG is a platform facet for display and matching and never a
 * second answer to this question. */
export function hasForcedInduction(model: CarModel): boolean {
  return model.spec.aspiration !== 'NA'
}

/** True when `partId`'s slot is physically occupied. False for both a
 * genuinely missing slot and a legitimately-empty one (e.g. forced
 * induction on an NA car) - repair eligibility only needs this fact. */
export function isPartPresent(car: CarInstance, partId: CarPartId): boolean {
  return car.parts[partId].installed !== null
}

/** True when `partId`'s empty slot is a real defect (a stolen wheel, a
 * gutted cat, a missing turbo on a factory-turbo car) rather than
 * legitimate absence. Always false for an occupied slot; value/condition/
 * stat helpers price a missing slot as the worst possible state. */
export function isPartMissing(car: CarInstance, model: CarModel, partId: CarPartId): boolean {
  if (car.parts[partId].installed !== null) return false
  if (partId === 'forcedInduction' && !hasForcedInduction(model)) return false
  return true
}

/** Every part actually present on `car` within `groupId` - normally every
 * part the taxonomy assigns to that group, minus any empty slot (missing or
 * legitimately-absent alike - see `isPartPresent`'s own doc comment). */
export function presentPartIdsInGroup(
  car: CarInstance,
  groupId: ComponentId,
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>,
): CarPartId[] {
  return partIdsByGroup[groupId].filter((partId) => isPartPresent(car, partId))
}

/** Sum of `costToMintYen` across every part on `car` - the restoration bill
 * `marketValueYen` deducts from clean value. A MISSING slot prices at a
 * full stock-replacement cost; a legitimately-absent slot contributes zero. */
export function carCostToMintYen(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  return carCostToBandYen(car, model, partsById, partsTaxonomyById, economy, 'mint')
}

/** A slot whose money is a straight purchase rather than a job: a fresh part
 * for a genuinely empty slot, or the body pipeline's own bill for a
 * zone-derived carrier. Neither hires a day. */
function purchaseFix(partsYen: number): PartFixCost {
  return { jobKind: 'replace', partsYen, hireFeeYen: 0, hireLine: null }
}

/**
 * What bringing ONE slot of `car` up to `targetBand` costs - the atom the
 * whole-car bill sums and the per-slot breakdown reports unsummed, so the two
 * can never answer differently for the same slot.
 *
 * An occupied slot is priced by `partFixCostYen`, the shared fix price. The
 * atom also names the day's hire whichever job reaches the target would want,
 * and the whole-car sum deliberately spends only the PARTS half of it: a day is
 * plant access rather than a per-car input (`carCostToBandYen`).
 *
 * Null when the slot is not a line on the bill at all: an installed SKU the
 * catalogue cannot resolve, or a legitimately empty slot (forced induction on
 * a naturally aspirated car). Both contribute nothing, which is why the sum
 * skips a null.
 */
function partFixToBand(
  car: CarInstance,
  model: CarModel,
  partId: CarPartId,
  entry: CarPartTaxonomyEntry,
  partsById: Readonly<Record<string, Part>>,
  fixContext: FixCostContext,
  targetBand: ConditionBand,
  carFitmentClass: PartFitmentClass,
): PartFixCost | null {
  // A body value carrier on the zone model prices through the pipeline
  // (materials + panels, money only - labour is never priced in yen): the
  // generic per-part formula below never sees it.
  if (car.zoneState && isBodyDerivedPart(partId)) {
    return purchaseFix(
      bodyPartRepairBillYen(partId, car.zoneState, targetBand, carFitmentClass, partsById),
    )
  }
  const installed = car.parts[partId].installed
  if (installed) {
    const catalogPart = partsById[installed.partId]
    if (!catalogPart) return null
    return partFixCostYen(entry, catalogPart, installed.band, targetBand, fixContext)
  }
  if (isPartMissing(car, model, partId)) {
    return purchaseFix(entry.stockReplacementPriceYenByClass[carFitmentClass])
  }
  return null
}

/** Every slot of `car` that carries a taxonomy entry, in the car's own key
 * order - the one walk the whole-car bill and its breakdown share. */
function billablePartIds(
  car: CarInstance,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
): CarPartId[] {
  return (Object.keys(car.parts) as CarPartId[]).filter((partId) => partsTaxonomyById[partId])
}

/**
 * The whole-car form of `costToBandYen`: the PARTS it takes to bring every slot
 * of `car` up to `targetBand`, and never a day's tool hire.
 *
 * A hire day is not a per-car cost and is deliberately left out of every
 * whole-car bill. A day buys a whole tool LINE for a whole DAY
 * (`toolHire.maxHiredLinesPerDay` is one, and `toolHire.amortisationDays` is
 * what it is measured against), so it is plant access spread over everything
 * the shop does that day rather than an input to one car; and a step that is
 * merely tier 2 can always be done by hand at `toolHire.slogMultiplier` energy
 * for no yen at all, so most of those days are never bought. The one bill that
 * genuinely buys a day is a customer QUOTE, which is a job rather than a car:
 * `serviceJobCostBreakdown` folds it in there, per line, through `sumFixCosts`.
 *
 * `carCostToMintYen` is this at `'mint'`.
 */
export function carCostToBandYen(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
  targetBand: ConditionBand,
): number {
  const carFitmentClass = fitmentClassForTier(model.tier)
  const fixContext: FixCostContext = { economy }
  const fixes: PartFixCost[] = []
  for (const partId of billablePartIds(car, partsTaxonomyById)) {
    const fix = partFixToBand(
      car,
      model,
      partId,
      partsTaxonomyById[partId]!,
      partsById,
      fixContext,
      targetBand,
      carFitmentClass,
    )
    if (fix) fixes.push(fix)
  }
  return sumFixCosts(fixes).partsYen
}

/** One slot's own share of the whole-car restoration bill. */
export interface CarBillLine {
  partId: CarPartId
  /** What bringing this slot to the target costs in PARTS. Zero for a slot
   * already at or above it. Never a hire day: a whole-car bill buys no days at
   * all (`carCostToBandYen`). */
  yen: number
  /** Where the money falls across the nine body zones - present only for the
   * two body value carriers (`bodywork`, `paint`) on a car carrying
   * `zoneState`, and summing to `yen`. */
  zones?: ZoneBillLine[]
}

/** The restoration bill, slot by slot, with the total it sums to. */
export interface CarBillBreakdown {
  lines: CarBillLine[]
  /** The lines summed, exactly `carCostToBandYen` for the same car and
   * target. */
  totalYen: number
}

/**
 * `carCostToBandYen` unsummed: the same bill, slot by slot, and per zone for
 * the two body carriers. The lines sum exactly to `totalYen`, which equals
 * `carCostToBandYen` for the same car and target, because both walk the same
 * slots through the same `partFixToBand` atom and total them through the same
 * `sumFixCosts` (`tests/carBillBreakdown.test.ts` holds both per roster
 * model).
 *
 * The bill is a literal sum over slots, and every multiplier the value
 * formula applies to it (`marketRepairDiscount`, the tier's `beyondDiscount`)
 * is band-independent, so it scales each line identically: a caller may scale
 * these lines to show what one slot's condition costs the car's price. Scaling
 * the lines and then summing can differ from scaling the sum by a fraction of
 * a yen, since a discount is not exactly representable in binary; the lines
 * themselves are exact.
 */
export function carCostToBandBreakdown(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
  targetBand: ConditionBand,
): CarBillBreakdown {
  const carFitmentClass = fitmentClassForTier(model.tier)
  const fixContext: FixCostContext = { economy }
  const lines: CarBillLine[] = []
  const fixes: PartFixCost[] = []
  for (const partId of billablePartIds(car, partsTaxonomyById)) {
    const fix = partFixToBand(
      car,
      model,
      partId,
      partsTaxonomyById[partId]!,
      partsById,
      fixContext,
      targetBand,
      carFitmentClass,
    )
    if (!fix) continue
    fixes.push(fix)
    const zones =
      car.zoneState && isBodyDerivedPart(partId)
        ? bodyPartRepairBillByZoneYen(partId, car.zoneState, targetBand, carFitmentClass, partsById)
        : undefined
    lines.push({ partId, yen: fix.partsYen, ...(zones ? { zones } : {}) })
  }
  return { lines, totalYen: sumFixCosts(fixes).partsYen }
}

/** Sum of the shared fix price across one group only - what a group-level
 * repair job actually costs to fully mint, scoped to `groupId`. The parts
 * alone, like every other whole-car and whole-group bill. */
export function groupCostToMintYen(
  car: CarInstance,
  model: CarModel,
  groupId: ComponentId,
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const carFitmentClass = fitmentClassForTier(model.tier)
  const fixContext: FixCostContext = { economy }
  const fixes: PartFixCost[] = []
  for (const partId of partIdsByGroup[groupId]) {
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    const fix = partFixToBand(
      car,
      model,
      partId,
      entry,
      partsById,
      fixContext,
      'mint',
      carFitmentClass,
    )
    if (fix) fixes.push(fix)
  }
  return sumFixCosts(fixes).partsYen
}

/**
 * A 0-1 mean of every present part's band factor, weighted by its own
 * class-scoped stock value (not `costToMintYen`, which is 0 for any mint
 * part - weighting by that would make a scrap turbo and scrap brake pads on
 * an otherwise-mint car score identically). A MISSING slot counts at a 0
 * band factor, worse than scrap.
 */
export function costWeightedBandFactor(
  car: CarInstance,
  model: CarModel,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const carFitmentClass = fitmentClassForTier(model.tier)
  let weightedSum = 0
  let totalWeight = 0
  for (const partId of Object.keys(car.parts) as CarPartId[]) {
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    const installed = car.parts[partId].installed
    if (!installed && !isPartMissing(car, model, partId)) continue // legitimately absent
    const weight = entry.stockReplacementPriceYenByClass[carFitmentClass]
    const factor = installed ? bandFactor(installed.band, economy) : 0
    weightedSum += weight * factor
    totalWeight += weight
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 1
}

/** The group's tool LEVEL is the repair level - exactly 1, 2, or 3, never an
 * open multiplier. `toolLevelsFor` (toolLines.ts) is what turns the rungs and
 * shops owned into these levels. */
export function repairLevelForGroup(toolLevels: ToolLevels, groupId: ComponentId): ToolLevel {
  return toolLevels[groupId]
}

/** The labour ENERGY a repair of `grades` band steps costs at `repairLevel`:
 * `grades x energyPerBandStepByToolTier[repairLevel]`, with no ceiling - a
 * higher tier is a genuine fraction of the work, not a rounded-up whole
 * slot. */
export function energyToClimb(
  grades: number,
  repairLevel: ToolLevel,
  energyPerBandStepByToolTier: EconomyConfig['energy']['energyPerBandStepByToolTier'],
): number {
  if (grades <= 0) return 0
  return grades * energyPerBandStepByToolTier[repairLevel]
}

/** The best band a REPAIR can climb a part to at `repairLevel` - gates
 * REPAIR only; buying and fitting a mint replacement part is untouched at
 * every tier. */
export function repairCeilingForLevel(
  repairLevel: ToolLevel,
  economy: EconomyConfig,
): ConditionBand {
  return economy.repairBandCeilingByTier[repairLevel]
}

/** Clamps a repair target DOWN to the tier ceiling (never raises it) - the one
 * clamp every repair planner routes an above-ceiling target through, so "how
 * far can this tier finish a repair" is decided in exactly one place. */
export function clampRepairTarget(
  targetBand: ConditionBand,
  ceiling: ConditionBand,
): ConditionBand {
  return bandIndex(targetBand) <= bandIndex(ceiling) ? targetBand : ceiling
}

export interface PartRepairPlan {
  /** Labour ENERGY to climb this one part from `band` to `targetBand`, or 0
   * when there is nothing to climb. Named `laborSlotsRequired` for
   * continuity with the `Job` field it sizes; the unit is energy points. */
  laborSlotsRequired: number
  /** Yen cost of the work itself - independent of repair level; 0 when
   * nothing climbs. */
  costYen: number
}

/**
 * The per-part repair atom - the single source of the repair cost/labor
 * formula, priced off the part's OWN catalog price, never the host car's
 * identity, so on-car repair and bench repair share one
 * repair economy and never a car-dependent discount. Scrap, a non-repairable
 * consumable, or a part already at/above the target yields a zero plan.
 *
 * The optional `repairCeiling` clamps the achievable REPAIR target down to
 * the shop's tool tier; omitted, this is the unbounded repair a customer
 * quote deliberately still prices regardless of the shop's own tier.
 */
export function planPartRepair(
  band: ConditionBand,
  targetBand: ConditionBand,
  repairLevel: ToolLevel,
  taxonomyEntry: CarPartTaxonomyEntry,
  partPriceYen: number,
  repairStepFraction: number,
  energyPerBandStepByToolTier: EconomyConfig['energy']['energyPerBandStepByToolTier'],
  repairCeiling?: ConditionBand,
): PartRepairPlan {
  if (!canRepair(band, taxonomyEntry)) return { laborSlotsRequired: 0, costYen: 0 }
  const effectiveTarget = repairCeiling ? clampRepairTarget(targetBand, repairCeiling) : targetBand
  const grades = gradesBetween(band, effectiveTarget)
  return {
    laborSlotsRequired: energyToClimb(grades, repairLevel, energyPerBandStepByToolTier),
    costYen: Math.round(grades * repairStepFraction * partPriceYen),
  }
}

export interface GroupRepairPlan {
  /** Total labour ENERGY to climb every eligible part to `targetBand`. */
  laborSlotsRequired: number
  /** Total yen cost of the work itself, independent of repair level. */
  costYen: number
  /** Parts that will actually move - excludes scrap (unrepairable) and
   * anything already at or above `targetBand`. Empty means there is nothing
   * to repair in this group right now. */
  partIds: CarPartId[]
  /** In-scope parts a repair can never move at all: scrap, or a taxonomy
   * entry that is replaced rather than repaired. A part that is simply
   * already at or above `targetBand` appears in neither list, which is what
   * separates "past saving" from "nothing left to do" for a caller that has
   * to explain an empty `partIds`. */
  unrepairablePartIds: CarPartId[]
}

/**
 * What a group-level repair-to-`targetBand` action costs and takes, before
 * any job exists - every caller that prices or sizes group repair goes
 * through this rather than re-deriving the per-part sum.
 *
 * `onlyPartId`, when set, restricts the plan to that one part; a tool line
 * still covers the whole group, so a per-part repair doesn't get its own tier.
 *
 * A REMOVABLE part is bench-only and excluded from on-car candidates here: it
 * comes off, goes to the warehouse, and is repaired on its group's bench
 * (`resolveRepairStep`, repairJobs.ts). Only the three fixed body carriers
 * (`chassis`, `bodywork`, `paint`) are repaired in place, because they never
 * come off.
 *
 * The optional `crew` context applies the benched crew's live effects to a
 * non-empty plan: the speed discount cuts `laborSlotsRequired`, and a
 * benched perfectionist trims `costYen`. Omitted, this is the raw
 * restoration cost the bots and coherence probes measure.
 *
 * The tool-tier ceiling is not applied here: on-car job creation refuses an
 * explicit above-ceiling target outright (`repairJobGate`, jobs.ts) rather
 * than quietly clamping the plan under the caller.
 */
export function planGroupRepair(
  car: CarInstance,
  groupId: ComponentId,
  targetBand: ConditionBand,
  toolLevels: ToolLevels,
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  repairStepFraction: number,
  energyPerBandStepByToolTier: EconomyConfig['energy']['energyPerBandStepByToolTier'],
  onlyPartId?: CarPartId,
  crew?: CrewSkillContext,
): GroupRepairPlan {
  const repairLevel = repairLevelForGroup(toolLevels, groupId)
  let laborSlotsRequired = 0
  let costYen = 0
  const partIds: CarPartId[] = []
  const unrepairablePartIds: CarPartId[] = []
  const candidateIds = presentPartIdsInGroup(car, groupId, partIdsByGroup).filter(
    (partId) => !onlyPartId || partId === onlyPartId,
  )
  for (const partId of candidateIds) {
    // A body value carrier's band is derived from zone state on a car that's
    // on the zone model - direct repair never touches it; work the zone's
    // pipeline stages instead (`bodyPipeline.ts`).
    if (car.zoneState && isBodyDerivedPart(partId)) continue
    // candidateIds is already filtered to present slots (presentPartIdsInGroup
    // above), so `installed` is never null here.
    const installed = car.parts[partId].installed!
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    if (entry.removable) continue // bench-only - see doc comment above
    // Past saving, and named as such: a scrap or replace-only part sizes to a
    // zero plan below exactly as an already-good one does, and only this
    // split tells the two apart.
    if (!canRepair(installed.band, entry)) {
      unrepairablePartIds.push(partId)
      continue
    }
    const catalogPart = partsById[installed.partId]
    if (!catalogPart) continue
    const plan = planPartRepair(
      installed.band,
      targetBand,
      repairLevel,
      entry,
      catalogPart.priceYen,
      repairStepFraction,
      energyPerBandStepByToolTier,
    )
    // `laborSlotsRequired > 0` is exactly "repairable and below the target"
    // (scrap, a non-repairable consumable, and nothing-to-climb all size to 0 energy).
    if (plan.laborSlotsRequired === 0) continue
    laborSlotsRequired += plan.laborSlotsRequired
    costYen += plan.costYen
    partIds.push(partId)
  }
  if (crew && partIds.length > 0) {
    laborSlotsRequired -= crewEnergySaved(laborSlotsRequired, groupId, crew.staff, crew.economy)
    costYen = Math.round(costYen * perfectionistCostMultiplier(crew.staff, crew.economy))
  }
  return { laborSlotsRequired, costYen, partIds, unrepairablePartIds }
}

/**
 * The worst REPAIRABLE, sub-mint, on-car present-part band within `groupId`
 * - the group "Repair all" control's own floor, and so scoped to what can
 * actually be repaired on the car: the fixed body carriers, never a removable
 * part (which is bench work, `planGroupRepair` above). Distinct from the
 * group's worst-band DISPLAY chip, which correctly includes scrap,
 * non-repairable and bench-only parts as real information; feeding THAT into
 * the picker would offer a dead repair target that silently no-ops. Null when
 * nothing in the group is both repairable and below mint.
 */
export function worstRepairableBandInGroup(
  car: CarInstance,
  groupId: ComponentId,
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
): ConditionBand | null {
  let worst: ConditionBand | null = null
  for (const partId of presentPartIdsInGroup(car, groupId, partIdsByGroup)) {
    if (car.zoneState && isBodyDerivedPart(partId)) continue // derived - never a repair target
    const installed = car.parts[partId].installed!
    const entry = partsTaxonomyById[partId]
    if (!entry || entry.removable || !canRepair(installed.band, entry)) continue
    if (bandIndex(installed.band) >= bandIndex('mint')) continue
    if (worst === null || bandIndex(installed.band) < bandIndex(worst)) worst = installed.band
  }
  return worst
}

/** Save-migration mapping: a 0-100 condition percent becomes a band via
 * `economy.bands.migrationThresholds` - mint at or above the first
 * breakpoint, descending to poor at or above the last, scrap below that. */
export function bandForMigratedCondition(
  conditionPercent: number,
  economy: EconomyConfig,
): ConditionBand {
  const { mint, fine, worn, poor } = economy.bands.migrationThresholds
  if (conditionPercent >= mint) return 'mint'
  if (conditionPercent >= fine) return 'fine'
  if (conditionPercent >= worn) return 'worn'
  if (conditionPercent >= poor) return 'poor'
  return 'scrap'
}
