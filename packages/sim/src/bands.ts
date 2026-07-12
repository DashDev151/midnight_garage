import type {
  CarInstance,
  CarModel,
  CarPartId,
  CarPartTaxonomyEntry,
  ComponentId,
  ConditionBand,
  EconomyConfig,
  Equipment,
} from '@midnight-garage/content'

/**
 * Sprint 26: the banded parts model's core math - band ordering, climbing,
 * repair cost, and the cost-weighted value shim. Every other sim module
 * that touches a part's condition goes through this file rather than
 * re-deriving band arithmetic locally.
 */

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

/** Sprint 26 decision 5: scrap is terminal - repair is structurally
 * unavailable on it, under any equipment or skill. */
export function canRepair(band: ConditionBand): boolean {
  return band !== 'scrap'
}

/**
 * Sprint 26 decision 5: for a repairable band, grades-to-mint times the
 * part's `stepCostYen`; for scrap, its `stockReplacementPriceYen` instead,
 * since there is no repair path to price. This is the one atom valuation
 * (decision 4), Sprint 27 pricing, and Sprint 29 job payouts all reuse.
 */
export function costToMintYen(band: ConditionBand, taxonomyEntry: CarPartTaxonomyEntry): number {
  if (band === 'scrap') return taxonomyEntry.stockReplacementPriceYen
  return gradesBetween(band, 'mint') * taxonomyEntry.stepCostYen
}

/** Sprint 26 decision 6: a scrap PartInstance's sale payout - "pennies on
 * the yen" against its stock-equivalent replacement cost. */
export function scrapValueYen(taxonomyEntry: CarPartTaxonomyEntry, economy: EconomyConfig): number {
  return Math.round(taxonomyEntry.stockReplacementPriceYen * economy.bands.scrapValueFraction)
}

/**
 * True when `model` has forced induction from the factory (Sprint 32) - the
 * one platform fact that decides whether an empty `forcedInduction` slot is
 * a real defect (decision 3) or legitimate, permanent absence. Generation
 * (`generateAuctionCarInstance`, auctions.ts) reads this to decide whether
 * to fill the slot with a stock turbo or leave it `null`; the value/
 * condition/stat helpers below read it to decide whether an empty slot
 * costs anything.
 */
export function hasForcedInduction(model: CarModel): boolean {
  return model.tags.includes('Turbo') || model.tags.includes('Supercharged')
}

/**
 * True when `partId`'s slot is physically occupied - some `PartInstance`
 * (stock or aftermarket) is installed (Sprint 32: the slot's only condition
 * state now lives on that instance). False for both a genuinely missing
 * slot and the one legitimately-empty case (forced induction on an NA car);
 * repair eligibility (`presentPartIdsInGroup`/`planGroupRepair`) only ever
 * needs this structural fact - there is nothing to climb toward mint
 * either way an empty slot got that way.
 */
export function isPartPresent(car: CarInstance, partId: CarPartId): boolean {
  return car.parts[partId].installed !== null
}

/**
 * True when `partId`'s empty slot is a real defect (decision 3) rather than
 * legitimate absence - a stolen wheel, a gutted cat, a missing turbo on a
 * factory-turbo car. Always false for an occupied slot. The value
 * (`carCostToMintYen`/`groupCostToMintYen`), condition
 * (`costWeightedBandFactor`, `carCondition.ts`'s clean/concours checks),
 * and stat (`derivedStats.ts`) helpers all price/weight a missing slot as
 * the worst possible state (a full stock replacement, or a 0 band factor);
 * a legitimately-empty `forcedInduction` slot on an NA car instead
 * contributes nothing, unchanged from Sprint 26.
 */
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

/**
 * Sum of `costToMintYen` across every part on `car` - the restoration bill
 * `marketValueYen` deducts from clean value, and the basis for a
 * group-level repair job's total price. Sprint 32 decision 5: a filled slot
 * prices at its installed instance's own `costToMintYen`, same as before; a
 * MISSING slot (`isPartMissing`) prices at a full `stockReplacementPriceYen`
 * (buying a replacement, not climbing a band); a legitimately-absent
 * `forcedInduction` slot on an NA car contributes zero, unchanged from
 * Sprint 26.
 */
export function carCostToMintYen(
  car: CarInstance,
  model: CarModel,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
): number {
  let total = 0
  for (const partId of Object.keys(car.parts) as CarPartId[]) {
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    const installed = car.parts[partId].installed
    if (installed) {
      total += costToMintYen(installed.band, entry)
    } else if (isPartMissing(car, model, partId)) {
      total += entry.stockReplacementPriceYen
    }
  }
  return total
}

/** Sum of `costToMintYen` across one group only - what a group-level repair
 * job (Sprint 26 decision 13's "bridge") actually costs to fully mint, on
 * the same present/missing/absent basis as `carCostToMintYen` above,
 * scoped to `groupId`. */
export function groupCostToMintYen(
  car: CarInstance,
  model: CarModel,
  groupId: ComponentId,
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
): number {
  let total = 0
  for (const partId of partIdsByGroup[groupId]) {
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    const installed = car.parts[partId].installed
    if (installed) {
      total += costToMintYen(installed.band, entry)
    } else if (isPartMissing(car, model, partId)) {
      total += entry.stockReplacementPriceYen
    }
  }
  return total
}

/**
 * Sprint 26 decision 4 - the value shim: a 0-1 mean of every present part's
 * band factor, weighted by that part's own worth (`stockReplacementPriceYen`
 * - a fixed, band-independent figure, not `costToMintYen`). A part with a
 * bigger stock value (a turbo, say) drags the average further when it's bad
 * than a cheap one (brake pads) on otherwise-identical cars - the
 * maintainer's own worked case.
 *
 * Deliberately NOT weighted by `costToMintYen`: that figure is 0 for any
 * mint part by construction (decision 5 - nothing left to climb), so on a
 * car with exactly one non-mint part, a cost-to-mint weighting collapses to
 * "that one part's own factor" regardless of WHICH part it is - a scrap
 * turbo and scrap brake pads on an otherwise-mint car would score
 * identically, exactly the "obviously nonsense" case the maintainer's own
 * worked example calls out. Weighting by the part's fixed worth instead
 * keeps an expensive part's condition mattering more to the average no
 * matter what band it's currently in.
 *
 * Sprint 32: a MISSING slot (`isPartMissing`) counts at a 0 band factor -
 * worse than scrap, the worst state the average can reflect - so a
 * stripped car reads as a real lemon candidate (`carCondition.ts`), not as
 * quietly excluded the way a legitimately-absent `forcedInduction` slot on
 * an NA car still is.
 */
export function costWeightedBandFactor(
  car: CarInstance,
  model: CarModel,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  let weightedSum = 0
  let totalWeight = 0
  for (const partId of Object.keys(car.parts) as CarPartId[]) {
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    const installed = car.parts[partId].installed
    if (!installed && !isPartMissing(car, model, partId)) continue // legitimately absent
    const weight = entry.stockReplacementPriceYen
    const factor = installed ? bandFactor(installed.band, economy) : 0
    weightedSum += weight * factor
    totalWeight += weight
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 1
}

/**
 * Sprint 26 decision 7: grades climbed per labor slot for a group - the
 * best owned equipment covering it sets the level; base hand tools (nothing
 * owned) default to level 1. Exactly 1, 2, or 3, never an open multiplier.
 */
export function repairLevelForGroup(
  ownedEquipmentIds: readonly string[],
  groupId: ComponentId,
  equipmentById: Readonly<Record<string, Equipment>>,
): 1 | 2 | 3 {
  let best: 1 | 2 | 3 = 1
  for (const id of ownedEquipmentIds) {
    const equipment = equipmentById[id]
    if (!equipment || !equipment.componentIds.includes(groupId)) continue
    if (equipment.repairLevel > best) best = equipment.repairLevel
  }
  return best
}

/** `ceil(gradesToClimb / repairLevel)` - the worked examples from
 * sprint26.md decision 7: level 1 climbs 1 grade/slot, level 2 climbs 2,
 * level 3 climbs 3 (always enough for poor -> mint, the maximum possible
 * since scrap is unrepairable). */
export function slotsNeededToClimb(grades: number, repairLevel: 1 | 2 | 3): number {
  if (grades <= 0) return 0
  return Math.ceil(grades / repairLevel)
}

export interface GroupRepairPlan {
  /** Total labor slots to climb every eligible part to `targetBand`. */
  laborSlotsRequired: number
  /** Total yen: sum of `gradesClimbed * stepCostYen` across eligible parts -
   * independent of repair level (decision 7), only of the work itself. */
  costYen: number
  /** Parts that will actually move - excludes scrap (unrepairable) and
   * anything already at or above `targetBand`. Empty means there is nothing
   * to repair in this group right now. */
  partIds: CarPartId[]
}

/**
 * Sprint 26 decisions 5+7+13: what a group-level repair-to-`targetBand`
 * action costs and takes, before any job exists - `jobs.ts`'s `repairJobGate`
 * (pricing) and callers that size a `NewJobSpec.laborSlotsRequired` (staged
 * work, an instant repair click, a bot's own repair decision) all plan
 * through this one function rather than each re-deriving the per-part sum.
 *
 * Sprint 28: `onlyPartId`, when set, restricts the plan to that one part
 * instead of every eligible part in the group - the per-part Repair row's
 * own pricing, reusing the same per-part loop and `repairLevelForGroup`
 * (equipment still covers a whole group, decision 7 - a per-part repair
 * doesn't get its own equipment tier) rather than standing up a parallel
 * single-part planner (directive 4: same concern, extend don't duplicate).
 */
export function planGroupRepair(
  car: CarInstance,
  groupId: ComponentId,
  targetBand: ConditionBand,
  ownedEquipmentIds: readonly string[],
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  equipmentById: Readonly<Record<string, Equipment>>,
  onlyPartId?: CarPartId,
): GroupRepairPlan {
  const repairLevel = repairLevelForGroup(ownedEquipmentIds, groupId, equipmentById)
  let laborSlotsRequired = 0
  let costYen = 0
  const partIds: CarPartId[] = []
  const candidateIds = presentPartIdsInGroup(car, groupId, partIdsByGroup).filter(
    (partId) => !onlyPartId || partId === onlyPartId,
  )
  for (const partId of candidateIds) {
    // candidateIds is already filtered to present slots (presentPartIdsInGroup
    // above), so `installed` is never null here.
    const band = car.parts[partId].installed!.band
    if (!canRepair(band)) continue
    const grades = gradesBetween(band, targetBand)
    if (grades <= 0) continue
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    laborSlotsRequired += slotsNeededToClimb(grades, repairLevel)
    costYen += grades * entry.stepCostYen
    partIds.push(partId)
  }
  return { laborSlotsRequired, costYen, partIds }
}

/**
 * Save-migration mapping (Sprint 26 decision 11): a pre-Sprint-26 0-100
 * condition percent becomes a band via `economy.bands.migrationThresholds`
 * - mint at or above the first breakpoint, descending to poor at or above
 * the last, scrap below that.
 */
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
