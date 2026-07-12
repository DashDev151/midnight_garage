import type {
  Buyer,
  CarModel,
  CarPartId,
  CarPartTaxonomyEntry,
  ComponentId,
  EconomyConfig,
  Facilities,
  Part,
  ServiceJobType,
  SpecialtyCopy,
  Technique,
  ToolLine,
  ToolLines,
} from '@midnight-garage/content'
import { ECONOMY, SPECIALTY_COPY, TECHNIQUES, TOOL_LINES } from '@midnight-garage/content'

/**
 * Permissive fallback so pre-Sprint-09 call sites (many sim tests) that don't
 * pass a facilities arg keep compiling and still get sane new-game start
 * counts (1 service / 3 parking) - just with no bays purchasable (max ==
 * start). Real gameplay passes content's actual FACILITIES.
 */
const DEFAULT_FACILITIES: Facilities = {
  service: { startCount: 1, maxCount: 1, bayPricesYen: [], minReputationTier: [] },
  parking: { startCount: 3, maxCount: 3, bayPricesYen: [], minReputationTier: [] },
}

/**
 * Static content catalogs advanceDay needs for auction generation and
 * valuation - car models, parts, buyers, hidden issues. Sim has no data
 * loader of its own (packages/content ships JSON, not a database), so
 * the caller builds this once from data/*.json and passes it through.
 * Kept separate from GameState because it's reference data, not
 * evolving game state - bundled into one object rather than threading
 * four separate parameters through advanceDay and every function below it.
 */
export interface SimContext {
  models: readonly CarModel[]
  modelsById: Readonly<Record<string, CarModel>>
  parts: readonly Part[]
  partsById: Readonly<Record<string, Part>>
  /** The one generic, brand-neutral `grade: 'stock'` catalog part per
   * `CarPartId` (Sprint 32 decision 1) - what generation fills a non-empty
   * slot with by default, and what removing an aftermarket part reverts a
   * slot to (`jobs.ts`'s `resolveRemovePart`). Derived once from `parts`
   * rather than filtered on every generation/removal call. */
  stockPartByCarPartId: Readonly<Record<CarPartId, Part>>
  buyers: readonly Buyer[]
  /** The 29-part taxonomy (Sprint 26), indexed by CarPartId - replaces the
   * Sprint 22 hidden-issue catalogs, which are paused and removed. */
  partsTaxonomy: readonly CarPartTaxonomyEntry[]
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>
  /** Every CarPartId belonging to each of the 6 groups, derived once from
   * the taxonomy rather than re-filtered on every call. */
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>
  serviceJobTypes: readonly ServiceJobType[]
  serviceJobCustomerNames: readonly string[]
  facilities: Facilities
  /** The six always-owned tool ladders (Sprint 36 - replaces the equipment
   * catalog), keyed by ComponentId. */
  toolLines: ToolLines
  /** Convenience lookup for one line - `toolLines[componentId]`, named. */
  toolLineFor(componentId: ComponentId): ToolLine
  economy: EconomyConfig
  /** Sprint 38: the word-of-mouth flavor pool a generated offer draws from
   * instead of its template's own `flavorPool` when the in-lane specialty
   * premium applies (`serviceJobs.ts`). */
  specialtyCopy: SpecialtyCopy
  /** Sprint 39: the named-craft catalog gating signature templates
   * (`unlockedTechniques`/`requiresUnmetTechnique`, serviceJobs.ts). */
  techniques: readonly Technique[]
}

function indexById<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  const result: Record<string, T> = {}
  for (const item of items) {
    result[item.id] = item
  }
  return result
}

function groupPartIdsByGroup(
  taxonomy: readonly CarPartTaxonomyEntry[],
): Record<ComponentId, readonly CarPartId[]> {
  const result: Record<string, CarPartId[]> = {}
  for (const entry of taxonomy) {
    ;(result[entry.group] ??= []).push(entry.id)
  }
  return result as Record<ComponentId, readonly CarPartId[]>
}

/** One `grade: 'stock'` catalog part per `CarPartId` (Sprint 32 decision 1
 * guarantees exactly one exists per component). */
function indexStockPartsByCarPartId(parts: readonly Part[]): Record<CarPartId, Part> {
  const result: Record<string, Part> = {}
  for (const part of parts) {
    if (part.grade === 'stock') result[part.carPartId] = part
  }
  return result as Record<CarPartId, Part>
}

/**
 * `economy` (Sprint 20 step 0) is deliberately the LAST parameter, defaulted
 * to the real parsed `economy.json` (content's `ECONOMY`) - every other
 * `buildSimContext` call site (the ~16 sim test files that call this
 * positionally) keeps compiling and gets the real economy config with no
 * changes, since a trailing default doesn't shift any existing positional
 * argument. Callers that want a different economy (none do yet) pass it
 * explicitly.
 *
 * Sprint 26: the 4th positional parameter, previously the (now-paused)
 * hidden-issues catalog, is the 29-part taxonomy instead - same position,
 * same "required" cardinality, so every existing call site's shape stays
 * predictable even though what it means changed.
 *
 * Sprint 36: the 8th positional parameter, previously the (now-retired)
 * equipment catalog, is the tool-lines record instead - defaulted to the
 * real parsed `toolLines.json` (content's `TOOL_LINES`), since every shop
 * always owns all six lines; there is no "no tools" configuration anymore.
 *
 * Sprint 38: `specialtyCopy` is a new 10th (trailing) parameter, same
 * "defaulted, so every existing positional call site keeps compiling"
 * treatment as `economy` right before it.
 *
 * Sprint 39: `techniques` is an 11th (trailing) parameter, same treatment.
 */
export function buildSimContext(
  models: readonly CarModel[],
  parts: readonly Part[],
  buyers: readonly Buyer[],
  partsTaxonomy: readonly CarPartTaxonomyEntry[],
  serviceJobTypes: readonly ServiceJobType[] = [],
  facilities: Facilities = DEFAULT_FACILITIES,
  serviceJobCustomerNames: readonly string[] = [],
  toolLines: ToolLines = TOOL_LINES,
  economy: EconomyConfig = ECONOMY,
  specialtyCopy: SpecialtyCopy = SPECIALTY_COPY,
  techniques: readonly Technique[] = TECHNIQUES,
): SimContext {
  return {
    models,
    modelsById: indexById(models),
    parts,
    partsById: indexById(parts),
    stockPartByCarPartId: indexStockPartsByCarPartId(parts),
    buyers,
    partsTaxonomy,
    partsTaxonomyById: indexById(partsTaxonomy) as Record<CarPartId, CarPartTaxonomyEntry>,
    partIdsByGroup: groupPartIdsByGroup(partsTaxonomy),
    serviceJobTypes,
    serviceJobCustomerNames,
    facilities,
    toolLines,
    toolLineFor: (componentId) => toolLines[componentId],
    economy,
    specialtyCopy,
    techniques,
  }
}
