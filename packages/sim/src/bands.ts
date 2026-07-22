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
  type ToolTiers,
} from '@midnight-garage/content'
import { crewEnergySaved, perfectionistCostMultiplier, type CrewSkillContext } from './crewSkills'

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
 * real defect or legitimate, permanent absence. */
export function hasForcedInduction(model: CarModel): boolean {
  return model.tags.includes('Turbo') || model.tags.includes('Supercharged')
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

/** The whole-car form of `costToBandYen`: what it costs to bring every part
 * of `car` up to `targetBand`. `carCostToMintYen` is this at `'mint'`. */
export function carCostToBandYen(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
  targetBand: ConditionBand,
): number {
  const { repairStepFraction } = economy.restoration
  const carFitmentClass = fitmentClassForTier(model.tier)
  let total = 0
  for (const partId of Object.keys(car.parts) as CarPartId[]) {
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    const installed = car.parts[partId].installed
    if (installed) {
      const catalogPart = partsById[installed.partId]
      if (!catalogPart) continue
      total += costToBandYen(
        installed.band,
        targetBand,
        entry,
        catalogPart.priceYen,
        repairStepFraction,
        catalogPart.fitmentClass,
      )
    } else if (isPartMissing(car, model, partId)) {
      total += entry.stockReplacementPriceYenByClass[carFitmentClass]
    }
  }
  return total
}

/** Sum of `costToMintYen` across one group only - what a group-level repair
 * job actually costs to fully mint, scoped to `groupId`. */
export function groupCostToMintYen(
  car: CarInstance,
  model: CarModel,
  groupId: ComponentId,
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const { repairStepFraction } = economy.restoration
  const carFitmentClass = fitmentClassForTier(model.tier)
  let total = 0
  for (const partId of partIdsByGroup[groupId]) {
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    const installed = car.parts[partId].installed
    if (installed) {
      const catalogPart = partsById[installed.partId]
      if (!catalogPart) continue
      total += costToMintYen(
        installed.band,
        entry,
        catalogPart.priceYen,
        repairStepFraction,
        catalogPart.fitmentClass,
      )
    } else if (isPartMissing(car, model, partId)) {
      total += entry.stockReplacementPriceYenByClass[carFitmentClass]
    }
  }
  return total
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

/** The group's tool-line TIER is the repair level - exactly 1, 2, or 3,
 * never an open multiplier. */
export function repairLevelForGroup(toolTiers: ToolTiers, groupId: ComponentId): 1 | 2 | 3 {
  return toolTiers[groupId]
}

/** The labour ENERGY a repair of `grades` grades costs at `repairLevel`:
 * `grades x energyPerGradeByTier[repairLevel]`, with no ceiling - a higher
 * tier is a genuine fraction of the work, not a rounded-up whole slot. */
export function energyToClimb(
  grades: number,
  repairLevel: 1 | 2 | 3,
  energyPerGradeByTier: EconomyConfig['energy']['energyPerGradeByTier'],
): number {
  if (grades <= 0) return 0
  return grades * energyPerGradeByTier[repairLevel]
}

/** The best band a REPAIR can climb a part to at `repairLevel` - gates
 * REPAIR only; buying and fitting a mint replacement part is untouched at
 * every tier. */
export function repairCeilingForLevel(
  repairLevel: 1 | 2 | 3,
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
 * identity, so on-car repair and in-inventory reconditioning share one
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
  repairLevel: 1 | 2 | 3,
  taxonomyEntry: CarPartTaxonomyEntry,
  partPriceYen: number,
  repairStepFraction: number,
  energyPerGradeByTier: EconomyConfig['energy']['energyPerGradeByTier'],
  repairCeiling?: ConditionBand,
): PartRepairPlan {
  if (!canRepair(band, taxonomyEntry)) return { laborSlotsRequired: 0, costYen: 0 }
  const effectiveTarget = repairCeiling ? clampRepairTarget(targetBand, repairCeiling) : targetBand
  const grades = gradesBetween(band, effectiveTarget)
  return {
    laborSlotsRequired: energyToClimb(grades, repairLevel, energyPerGradeByTier),
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
}

/**
 * What a group-level repair-to-`targetBand` action costs and takes, before
 * any job exists - every caller that prices or sizes group repair goes
 * through this rather than re-deriving the per-part sum.
 *
 * `onlyPartId`, when set, restricts the plan to that one part; a tool line
 * still covers the whole group, so a per-part repair doesn't get its own tier.
 *
 * A `bolt-on`/`buried` part is bench-only and excluded from on-car
 * candidates here; bench recondition (`resolveReconditionLabor`) is
 * unaffected, since a pulled part still repairs off the car.
 *
 * The optional `crew` context applies the benched crew's live effects to a
 * non-empty plan: the speed discount cuts `laborSlotsRequired`, and a
 * benched perfectionist trims `costYen`. Omitted, this is the raw
 * restoration cost the bots and coherence probes measure.
 *
 * The optional `repairBandCeilingByTier` clamps the achievable REPAIR target
 * to the group's own tool tier; on-car job creation refuses an explicit
 * above-ceiling target outright rather than clamping here.
 */
export function planGroupRepair(
  car: CarInstance,
  groupId: ComponentId,
  targetBand: ConditionBand,
  toolTiers: ToolTiers,
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  repairStepFraction: number,
  energyPerGradeByTier: EconomyConfig['energy']['energyPerGradeByTier'],
  onlyPartId?: CarPartId,
  crew?: CrewSkillContext,
  repairBandCeilingByTier?: EconomyConfig['repairBandCeilingByTier'],
): GroupRepairPlan {
  const repairLevel = repairLevelForGroup(toolTiers, groupId)
  const effectiveTarget = repairBandCeilingByTier
    ? clampRepairTarget(targetBand, repairBandCeilingByTier[repairLevel])
    : targetBand
  let laborSlotsRequired = 0
  let costYen = 0
  const partIds: CarPartId[] = []
  const candidateIds = presentPartIdsInGroup(car, groupId, partIdsByGroup).filter(
    (partId) => !onlyPartId || partId === onlyPartId,
  )
  for (const partId of candidateIds) {
    // candidateIds is already filtered to present slots (presentPartIdsInGroup
    // above), so `installed` is never null here.
    const installed = car.parts[partId].installed!
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    if (entry.depthClass !== 'surface') continue // bench-only - see doc comment above
    const catalogPart = partsById[installed.partId]
    if (!catalogPart) continue
    const plan = planPartRepair(
      installed.band,
      effectiveTarget,
      repairLevel,
      entry,
      catalogPart.priceYen,
      repairStepFraction,
      energyPerGradeByTier,
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
  return { laborSlotsRequired, costYen, partIds }
}

/**
 * The worst REPAIRABLE, sub-mint, on-car present-part band within `groupId`
 * - the group "Repair all" control's own floor. Distinct from the group's
 * worst-band DISPLAY chip, which correctly includes scrap/non-repairable/
 * bench-only parts as real information; feeding THAT into the picker would
 * offer a dead repair target that silently no-ops. Null when nothing in the
 * group is both repairable and below mint.
 */
export function worstRepairableBandInGroup(
  car: CarInstance,
  groupId: ComponentId,
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
): ConditionBand | null {
  let worst: ConditionBand | null = null
  for (const partId of presentPartIdsInGroup(car, groupId, partIdsByGroup)) {
    const installed = car.parts[partId].installed!
    const entry = partsTaxonomyById[partId]
    if (!entry || entry.depthClass !== 'surface' || !canRepair(installed.band, entry)) continue
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
