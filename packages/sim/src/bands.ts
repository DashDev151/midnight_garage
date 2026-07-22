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

/** Degrades `grades` steps toward scrap, floored there - the wear-direction
 * mirror of `climbBand`. Callers that must never actually reach `scrap`
 * (generation-time wear top-up) enforce that by excluding an already-`poor`
 * part from their candidate pool before calling this, rather than relying on
 * this floor - this clamp is a defensive backstop, not the real guard. */
export function degradeBand(from: ConditionBand, grades: number): ConditionBand {
  const nextIndex = Math.max(0, bandIndex(from) - Math.max(0, grades))
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
 * - `scrap`: the class's own `stockReplacementPriceYenByClass`, FLAT (no
 *   repair path to price - a replacement part costs what it costs, at the
 *   class it's actually replacing).
 * - Repairable, non-scrap: `gradesBetween(band, 'mint') * repairStepFraction
 *   * partPriceYen`, rounded - the derived repair economy. `partPriceYen` is
 *   the INSTALLED instance's own catalog `priceYen` (a race turbo repairs at
 *   race prices, a stock damper at stock prices), never the host car's
 *   identity - the structural fix for the donor-car repair arbitrage
 *   tier-scaling allowed.
 * - Non-repairable (a replace-only consumable), non-scrap: `fine`/`mint`
 *   price at 0 (a nearly-new consumable doesn't discount value); anything
 *   below `fine` prices at the FLAT class-scoped stock-replacement price -
 *   there is no repair bill to derive, only a full replacement.
 *
 * Sprint 53: `fitmentClass` selects which class's stock-replacement price
 * applies to the scrap/non-repairable branches - always the INSTALLED
 * part's own class (`catalogPart.fitmentClass`, guaranteed equal to the host
 * car's own class by the fitment gate), never independently derived.
 */
export function costToMintYen(
  band: ConditionBand,
  taxonomyEntry: CarPartTaxonomyEntry,
  partPriceYen: number,
  repairStepFraction: number,
  fitmentClass: PartFitmentClass,
): number {
  return costToBandYen(band, 'mint', taxonomyEntry, partPriceYen, repairStepFraction, fitmentClass)
}

/**
 * Sprint 66 (economy-bible.md law 1 as amended): the same atom as
 * `costToMintYen` (which is now just this with `targetBand = 'mint'`),
 * generalized to any target - what it costs to bring ONE part up to
 * `targetBand`, zero if it is already there or better.
 *
 * This exists so `marketValueYen` can split the restoration bill at the car's
 * tier expectation band and discount the two halves at different rates. The
 * split is exact by construction: `costToBandYen(b, t) + (cost above t) ===
 * costToMintYen(b)` for every band, because both sides come from this one
 * function.
 *
 * The all-or-nothing branches (scrap, and a non-repairable part below `fine`)
 * charge their FULL replacement price toward any target above the part's
 * current band, and nothing above that - you cannot half-replace a part, and
 * the replacement arrives at mint. So that whole spend counts as work below
 * the expectation band: it is what the band costs to reach, not passion spend.
 */
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
 * Sprint 26 decision 6: a scrap PartInstance's sale payout - "pennies on the
 * yen" against its stock-equivalent replacement cost. Sprint 53:
 * `fitmentClass` is the SCRAPPED instance's own catalog class (it's a real
 * part sitting in inventory, so its class is never ambiguous).
 */
export function scrapValueYen(
  taxonomyEntry: CarPartTaxonomyEntry,
  economy: EconomyConfig,
  fitmentClass: PartFitmentClass,
): number {
  return Math.round(
    taxonomyEntry.stockReplacementPriceYenByClass[fitmentClass] * economy.bands.scrapValueFraction,
  )
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
  return carCostToBandYen(car, model, partsById, partsTaxonomyById, economy, 'mint')
}

/**
 * Sprint 66: the whole-car form of `costToBandYen` - what it costs to bring
 * every part of `car` up to `targetBand`. `carCostToMintYen` is this with
 * `'mint'`, so the player-facing "restoration bill remaining" and the value
 * formula's split can never drift apart.
 *
 * A missing slot charges its full stock replacement price toward any target,
 * exactly as it does toward mint - the same all-or-nothing reasoning as
 * `costToBandYen`'s scrap branch.
 */
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
 * Sprint 26 decision 4 - the value shim: a 0-1 mean of every present part's
 * band factor, weighted by that part's own worth (its class-scoped
 * `stockReplacementPriceYenByClass` - a fixed, band-independent figure, not
 * `costToMintYen`). A part with a
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

/**
 * Sprint 26 decision 7: grades climbed per labor slot for a group. Sprint
 * 36 re-sources it: the group's tool-line TIER is the repair level (the
 * same 1|2|3 ladder, read from the persisted `toolTiers` map instead of an
 * ownership scan). Exactly 1, 2, or 3, never an open multiplier.
 */
export function repairLevelForGroup(toolTiers: ToolTiers, groupId: ComponentId): 1 | 2 | 3 {
  return toolTiers[groupId]
}

/**
 * Sprint 94 (the energy bar): the labour ENERGY a repair of `grades` grades
 * costs at `repairLevel` - `grades x energyPerGradeByTier[repairLevel]`, in
 * integer energy points. Replaces `slotsNeededToClimb`'s `ceil(grades /
 * repairLevel)`: the ceil is GONE, so a higher tier is a genuine fraction of
 * the work rather than a rounded-up whole slot (that granularity is exactly why
 * the unit rescaled to `pointsPerLabour`-per-slot points). Tier 1's per-grade
 * cost equals `pointsPerLabour`, so a tier-1 repair costs the same labour it did
 * pre-Sprint-94 (one slot per grade x the scale); tiers 2/3 cost strictly less.
 * `energyPerGradeByTier` is `economy.energy.energyPerGradeByTier` (content law).
 */
export function energyToClimb(
  grades: number,
  repairLevel: 1 | 2 | 3,
  energyPerGradeByTier: EconomyConfig['energy']['energyPerGradeByTier'],
): number {
  if (grades <= 0) return 0
  return grades * energyPerGradeByTier[repairLevel]
}

/**
 * Sprint 93 (the band ceiling - tools cap the finish): the best band a REPAIR
 * can climb a part to at `repairLevel` (the group's own tool tier, since the
 * tier IS the repair level - `repairLevelForGroup`). Tier-1 hand tools cap at
 * `fine`; the tier-2 machine reaches `mint`. Read straight off the content knob
 * `economy.repairBandCeilingByTier`, so retuning the ceiling is a one-line
 * content edit. This gates REPAIR only: buying a mint replacement part and
 * fitting it is untouched at every tier (a bought part is already mint), so mint
 * stays reachable by buying - owning tier-2 just lets you REPAIR to mint instead.
 */
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
  /** Labour ENERGY (Sprint 94) to climb this one part from `band` to
   * `targetBand` at the given repair level - `grades x
   * energyPerGradeByTier[repairLevel]`, or 0 when there is nothing to climb
   * (scrap, or already at/above the target). Named `laborSlotsRequired` for
   * continuity with the `Job` field it sizes; the unit is energy points now,
   * not integer slots. */
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
 *
 * Sprint 93 (the band ceiling): the optional `repairCeiling` caps the
 * achievable REPAIR target - when set, the effective target is clamped down to
 * it (`clampRepairTarget`), so a tier-1 repair of a worn part to `mint` plans
 * only the worn -> `fine` climb and a part already at/above the ceiling yields a
 * zero plan. Omitted, this is the pre-Sprint-93 unbounded repair - the shape
 * the market-rate cost accounting (`serviceJobCostBreakdown`) deliberately
 * keeps, since a customer quote prices the full repair-to-target regardless of
 * the shop's own tier. Callers that ARE gated by the shop's tools (on-car
 * `planGroupRepair`, bench `planReconditionPart`, the wage probe) pass their
 * group's `repairCeilingForLevel`.
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
  /** Total labour ENERGY (Sprint 94) to climb every eligible part to
   * `targetBand` - energy points, not integer slots (see `PartRepairPlan`). */
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
 *
 * Sprint 71 (the teardown game): a `bolt-on`/`buried` part is bench-only -
 * excluded from on-car candidates here, exactly like scrap or a non-
 * repairable consumable. Bench recondition (`jobs.ts`'s
 * `resolveReconditionLabor`, via `planPartRepair` directly) is UNAFFECTED -
 * this exclusion belongs to the on-car path alone, since the whole point of
 * the teardown game is that a pulled part still repairs, just off the car.
 *
 * Sprint 82 (staff II): the optional `crew` context applies the benched crew's
 * live effects to the finished plan - the speed discount cuts
 * `laborSlotsRequired` (decision 2) and a benched perfectionist trims `costYen`
 * (decision 5). Omitted, the plan is exactly the raw restoration cost the bots
 * and coherence probes measure - the crew never touches those. The two effects
 * apply only when the plan has real work (`partIds` non-empty).
 *
 * Sprint 93 (the band ceiling): the optional `repairBandCeilingByTier` caps the
 * achievable REPAIR target at the group's own tool tier - when set, the target
 * is clamped down to `repairBandCeilingByTier[repairLevel]` once (a tier-1 group
 * planning to `mint` plans only to `fine`, so a part already at `fine` drops out
 * of `partIds` with nothing left to climb). Omitted, this is the unbounded
 * band-math the pure reachability/pacing tests still measure. On-car job
 * creation (`repairJobGate`) refuses an explicit above-ceiling target outright
 * (with a `tool-tier` reason) rather than clamping here, so the two never
 * disagree about what a created job climbs to.
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
    // (scrap, a non-repairable consumable, and nothing-to-climb all size to 0
    // energy) - the same inclusion set the pre-Sprint-35 explicit
    // `canRepair`/`grades <= 0` guards produced.
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
 *
 * Sprint 71 (the teardown game): a `bolt-on`/`buried` part is bench-only,
 * excluded here exactly like scrap or a non-repairable consumable - the same
 * dead-action reasoning above, now for a slot `planGroupRepair` would refuse
 * to plan on-car at all rather than one it would merely skip.
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
