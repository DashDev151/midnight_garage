import type {
  CarInstance,
  CarModel,
  CarPartId,
  CarPartTaxonomyEntry,
  ComponentId,
  ConditionBand,
  EconomyConfig,
  Part,
  ToolTiers,
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

/**
 * Sprint 26 decision 5 (scrap is terminal, under any equipment or skill) +
 * Sprint 41 decision 2 (a non-repairable consumable - tyres, brakePadsDiscs,
 * clutch - is replace-only at every band, not just scrap). The ONE
 * repairability predicate: every planner (`planPartRepair`/`planGroupRepair`
 * below, the bench recondition resolver, service-job costing) calls this
 * rather than re-deriving either check locally.
 */
export function canRepair(band: ConditionBand, taxonomyEntry: CarPartTaxonomyEntry): boolean {
  return band !== 'scrap' && taxonomyEntry.repairable
}

/**
 * Every band strictly BELOW `target`, excluding scrap (Sprint 40's
 * generation-forcing step, `serviceJobs.ts`'s `forceTasksOutstanding`): a
 * forced repair task must land on a band with real work left to climb, and
 * scrap is terminal - never a valid "still needs repair" roll. Empty when
 * `target` is `poor` (nothing valid below it once scrap is excluded) or
 * `scrap` itself.
 */
export function bandsBelowExcludingScrap(target: ConditionBand): ConditionBand[] {
  const targetIndex = bandIndex(target)
  return BAND_ORDER.filter((band, i) => band !== 'scrap' && i < targetIndex)
}

/**
 * Sprint 26 decision 5 + Sprint 44 decision 1 (revert of Sprint 41's
 * tier-scaling): the one atom valuation (decision 4), Sprint 27 pricing, and
 * Sprint 29 job payouts all reuse.
 *
 * - `scrap`: `stockReplacementPriceYen`, FLAT (no repair path to price - a
 *   replacement part costs what it costs).
 * - Repairable, non-scrap: `gradesBetween(band, 'mint') * repairStepFraction
 *   * partPriceYen`, rounded - the derived repair economy. `partPriceYen` is
 *   the INSTALLED instance's own catalog `priceYen` (a race turbo repairs at
 *   race prices, a stock damper at stock prices), never the host car's
 *   identity - the structural fix for the donor-car repair arbitrage
 *   tier-scaling allowed.
 * - Non-repairable (a replace-only consumable), non-scrap: `fine`/`mint`
 *   price at 0 (a nearly-new consumable doesn't discount value); anything
 *   below `fine` prices at the FLAT `stockReplacementPriceYen` - there is no
 *   repair bill to derive, only a full replacement.
 */
export function costToMintYen(
  band: ConditionBand,
  taxonomyEntry: CarPartTaxonomyEntry,
  partPriceYen: number,
  repairStepFraction: number,
): number {
  if (band === 'scrap') return taxonomyEntry.stockReplacementPriceYen
  if (!taxonomyEntry.repairable) {
    return bandIndex(band) >= bandIndex('fine') ? 0 : taxonomyEntry.stockReplacementPriceYen
  }
  return Math.round(gradesBetween(band, 'mint') * repairStepFraction * partPriceYen)
}

/**
 * Sprint 47 decision 3: the per-part atom for the VALUATION bill - distinct
 * from `costToMintYen`'s mint-referenced restoration bill (still shown to
 * the player as "what full restoration costs"). A buyer prices roadworthy
 * (fine), not showroom (mint): the to-fine portion counts at full weight,
 * the fine-to-mint remainder at `mintGapWeight` (worn->fine is the real
 * money play; fine->mint stays primarily the reputation/clean-sale play).
 * Scrap/missing and non-repairable-below-fine still price at the flat
 * `stockReplacementPriceYen` - a replacement resolves the defect completely
 * regardless of which reference band you're pricing against, so there is no
 * separate fine/mint split for those cases.
 */
export function costToValuationYen(
  band: ConditionBand,
  taxonomyEntry: CarPartTaxonomyEntry,
  partPriceYen: number,
  repairStepFraction: number,
  mintGapWeight: number,
): number {
  if (band === 'scrap') return taxonomyEntry.stockReplacementPriceYen
  if (!taxonomyEntry.repairable) {
    return bandIndex(band) >= bandIndex('fine') ? 0 : taxonomyEntry.stockReplacementPriceYen
  }
  const toFineGrades = gradesBetween(band, 'fine')
  const mintRemainderGrades = gradesBetween(band, 'mint') - toFineGrades
  return Math.round(
    repairStepFraction * partPriceYen * (toFineGrades + mintGapWeight * mintRemainderGrades),
  )
}

/** Sum of `costToValuationYen` across every part on `car` - the bill
 * `marketValueYen` deducts from clean value (Sprint 47, replaces the
 * mint-referenced `carCostToMintYen` for valuation purposes only; the
 * player-facing restoration bill still targets mint via `carCostToMintYen`).
 * Same present/missing/absent handling as `carCostToMintYen`. */
export function carValuationBillYen(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const { repairStepFraction } = economy.restoration
  const { mintGapWeight } = economy.valuation
  let total = 0
  for (const partId of Object.keys(car.parts) as CarPartId[]) {
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    const installed = car.parts[partId].installed
    if (installed) {
      const catalogPart = partsById[installed.partId]
      if (!catalogPart) continue
      total += costToValuationYen(
        installed.band,
        entry,
        catalogPart.priceYen,
        repairStepFraction,
        mintGapWeight,
      )
    } else if (isPartMissing(car, model, partId)) {
      total += entry.stockReplacementPriceYen
    }
  }
  return total
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
 * Sprint 26. Sprint 44: resolves each installed instance's own catalog part
 * (`partsById`) so `costToMintYen` can price its repair off that part's real
 * `priceYen` - a missing slot stays FLAT regardless (buying a replacement,
 * not a repair). An installed instance whose catalog part can't be resolved
 * (never happens for real content) contributes nothing rather than crash,
 * matching this file's other defensive `if (!entry) continue` guards.
 */
export function carCostToMintYen(
  car: CarInstance,
  model: CarModel,
  partsById: Readonly<Record<string, Part>>,
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>,
  economy: EconomyConfig,
): number {
  const { repairStepFraction } = economy.restoration
  let total = 0
  for (const partId of Object.keys(car.parts) as CarPartId[]) {
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    const installed = car.parts[partId].installed
    if (installed) {
      const catalogPart = partsById[installed.partId]
      if (!catalogPart) continue
      total += costToMintYen(installed.band, entry, catalogPart.priceYen, repairStepFraction)
    } else if (isPartMissing(car, model, partId)) {
      total += entry.stockReplacementPriceYen
    }
  }
  return total
}

/** Sum of `costToMintYen` across one group only - what a group-level repair
 * job (Sprint 26 decision 13's "bridge") actually costs to fully mint, on
 * the same present/missing/absent basis as `carCostToMintYen` above,
 * scoped to `groupId`. Sprint 44: same per-instance catalog-part resolution
 * as `carCostToMintYen`. */
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
  let total = 0
  for (const partId of partIdsByGroup[groupId]) {
    const entry = partsTaxonomyById[partId]
    if (!entry) continue
    const installed = car.parts[partId].installed
    if (installed) {
      const catalogPart = partsById[installed.partId]
      if (!catalogPart) continue
      total += costToMintYen(installed.band, entry, catalogPart.priceYen, repairStepFraction)
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
 * Sprint 26 decision 7: grades climbed per labor slot for a group. Sprint
 * 36 re-sources it: the group's tool-line TIER is the repair level (the
 * same 1|2|3 ladder, read from the persisted `toolTiers` map instead of an
 * ownership scan). Exactly 1, 2, or 3, never an open multiplier.
 */
export function repairLevelForGroup(toolTiers: ToolTiers, groupId: ComponentId): 1 | 2 | 3 {
  return toolTiers[groupId]
}

/** `ceil(gradesToClimb / repairLevel)` - the worked examples from
 * sprint26.md decision 7: level 1 climbs 1 grade/slot, level 2 climbs 2,
 * level 3 climbs 3 (always enough for poor -> mint, the maximum possible
 * since scrap is unrepairable). */
export function slotsNeededToClimb(grades: number, repairLevel: 1 | 2 | 3): number {
  if (grades <= 0) return 0
  return Math.ceil(grades / repairLevel)
}

export interface PartRepairPlan {
  /** Labor slots to climb this one part from `band` to `targetBand` at the
   * given repair level - `ceil(grades / repairLevel)`, or 0 when there is
   * nothing to climb (scrap, or already at/above the target). */
  laborSlotsRequired: number
  /** Yen: `gradesClimbed * repairStepFraction * partPriceYen` - independent
   * of repair level (decision 7), only of the work itself; 0 when nothing
   * climbs. */
  costYen: number
}

/**
 * Sprint 35: the per-part repair atom - the single source of the repair
 * cost/labor formula (Sprint 26 decisions 5+7; Sprint 41 decision 2 adds the
 * non-repairable check; Sprint 44 decision 1 replaces the tier `factor` with
 * `partPriceYen` - the part's OWN catalog price, never the host car's
 * identity). Climbing one part from `band` to `targetBand` at `repairLevel`
 * costs `round(grades * repairStepFraction * partPriceYen)` and takes
 * `ceil(grades / repairLevel)` labor slots; scrap (unrepairable), a
 * non-repairable consumable (`canRepair` covers both), or a part already
 * at/above the target yields a zero plan. Shared, so on-car group repair
 * (`planGroupRepair` below, per group part) and in-inventory reconditioning
 * (`jobs.ts`'s recondition resolver, one loose part) price and size work
 * through the exact same formula, off the exact same part's own price - ONE
 * repair economy, never two, and never a car-dependent discount either way
 * (the arbitrage this sprint exists to close).
 */
export function planPartRepair(
  band: ConditionBand,
  targetBand: ConditionBand,
  repairLevel: 1 | 2 | 3,
  taxonomyEntry: CarPartTaxonomyEntry,
  partPriceYen: number,
  repairStepFraction: number,
): PartRepairPlan {
  if (!canRepair(band, taxonomyEntry)) return { laborSlotsRequired: 0, costYen: 0 }
  const grades = gradesBetween(band, targetBand)
  return {
    laborSlotsRequired: slotsNeededToClimb(grades, repairLevel),
    costYen: Math.round(grades * repairStepFraction * partPriceYen),
  }
}

export interface GroupRepairPlan {
  /** Total labor slots to climb every eligible part to `targetBand`. */
  laborSlotsRequired: number
  /** Total yen: sum of `gradesClimbed * repairStepFraction * partPriceYen`
   * across eligible parts - independent of repair level (decision 7), only
   * of the work itself. */
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
 * (a tool line still covers a whole group, decision 7 - a per-part repair
 * doesn't get its own tier) rather than standing up a parallel
 * single-part planner (directive 4: same concern, extend don't duplicate).
 *
 * Sprint 44: `repairStepFraction` (`economy.restoration.repairStepFraction`)
 * threads straight into `planPartRepair` alongside each candidate part's own
 * resolved catalog `priceYen` (`partsById[installed.partId]`) - never a
 * car/model-derived factor. A candidate whose catalog part can't be resolved
 * (never happens for real content) is skipped rather than crashing. A
 * non-repairable consumable is excluded from `partIds` exactly like scrap
 * (`canRepair` covers both), so it never enters the plan.
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
  onlyPartId?: CarPartId,
): GroupRepairPlan {
  const repairLevel = repairLevelForGroup(toolTiers, groupId)
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
    const catalogPart = partsById[installed.partId]
    if (!catalogPart) continue
    const plan = planPartRepair(
      installed.band,
      targetBand,
      repairLevel,
      entry,
      catalogPart.priceYen,
      repairStepFraction,
    )
    // `laborSlotsRequired > 0` is exactly "repairable and below the target"
    // (scrap, a non-repairable consumable, and nothing-to-climb all size to 0
    // slots) - the same inclusion set the pre-Sprint-35 explicit
    // `canRepair`/`grades <= 0` guards produced.
    if (plan.laborSlotsRequired === 0) continue
    laborSlotsRequired += plan.laborSlotsRequired
    costYen += plan.costYen
    partIds.push(partId)
  }
  return { laborSlotsRequired, costYen, partIds }
}

/**
 * Sprint 41 (coordinator follow-up on Sprint 40's `BandPicker`): the worst
 * REPAIRABLE, sub-mint present-part band within `groupId` - the group
 * "Repair all" control's own floor. Distinct from the group's worst-band
 * DISPLAY chip (`gameStore.ts`'s `groupBandsForCar`), which correctly
 * includes scrap and non-repairable parts in what it reports as the group's
 * worst condition - that's real information. Feeding that same value into
 * `BandPicker`'s `currentBand`, though, let a group with a scrap part sitting
 * next to a merely-worn one offer `poor` as a selectable repair target: a
 * dead action, since `planGroupRepair` skips the scrap part and finds
 * nothing repairable below `poor`, producing an empty plan that silently
 * no-ops on Confirm. This is the fix - the picker's floor is the worst band
 * a repair action could ACTUALLY move, never scrap or a replace-only
 * consumable. Null when nothing in the group is both repairable and below
 * mint - the signal the group repair control should not render at all.
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
    if (!entry || !canRepair(installed.band, entry)) continue
    if (bandIndex(installed.band) >= bandIndex('mint')) continue
    if (worst === null || bandIndex(installed.band) < bandIndex(worst)) worst = installed.band
  }
  return worst
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
