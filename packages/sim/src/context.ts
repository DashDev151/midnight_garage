import type {
  Buyer,
  CarModel,
  CarPartId,
  CarPartTaxonomyEntry,
  ComponentId,
  DiagnosticTest,
  EconomyConfig,
  Facilities,
  Grade,
  LapReferenceEntry,
  Part,
  PartFitmentClass,
  Persona,
  ProvenancePool,
  ServiceJobType,
  SpecialtyCopy,
  StoryMission,
  Symptom,
  Technique,
  ToolLine,
  ToolLines,
} from '@midnight-garage/content'
import {
  DIAGNOSTIC_TESTS,
  ECONOMY,
  LAP_REFERENCES,
  PERSONAS,
  PROVENANCE_POOL,
  SPECIALTY_COPY,
  STORY_MISSIONS,
  SYMPTOMS,
  TECHNIQUES,
  TOOL_LINES,
} from '@midnight-garage/content'

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
  /**
   * The one generic, brand-neutral `grade: 'stock'` catalog part per
   * `CarPartId`, PER FITMENT CLASS (Sprint 32 decision 1; Sprint 53 adds the
   * class dimension) - what generation fills a non-empty slot with by
   * default, and what removing an aftermarket part reverts a slot to
   * (`jobs.ts`'s `resolveRemovePart`). Derived once from `parts` rather than
   * filtered on every generation/removal call.
   */
  stockPartByCarPartId: Readonly<Record<PartFitmentClass, Readonly<Record<CarPartId, Part>>>>
  /**
   * Sprint 75 decision 1: the catalog's `street`/`sport`/`race` entry for
   * each `CarPartId`, per fitment class - what the aftermarket-at-generation
   * roll (`generateAuctionCarInstance`, auctions.ts) fits instead of the
   * stock default. Derived once from `parts`, same reasoning as
   * `stockPartByCarPartId` above; a `Partial` value since a future content
   * change could ship a part missing one grade (today's catalog always has
   * all three).
   */
  aftermarketPartByCarPartId: Readonly<
    Record<PartFitmentClass, Readonly<Record<CarPartId, Readonly<Partial<Record<Grade, Part>>>>>>
  >
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
  /** Sprint 70: the car-history flavour pool (`CarInstance.provenanceNote`),
   * relocated from `auctions.ts`'s hardcoded `PROVENANCE_POOL` into content -
   * `auctions.ts` reads it from here instead of a local constant. */
  provenancePool: ProvenancePool
  /** Sprint 73 (diagnosis I): the symptom/cause pool `generateAuctionCarInstance`
   * rolls from, and the flat diagnostic-test registry a symptom's own `tests`
   * entries reference by id. */
  symptoms: readonly Symptom[]
  symptomsById: Readonly<Record<string, Symptom>>
  diagnosticTests: readonly DiagnosticTest[]
  diagnosticTestsById: Readonly<Record<string, DiagnosticTest>>
  /** Sprint 76 (story missions I): the hand-authored campaign, sorted by
   * `gateReputationPoints` (the strictly linear order `missions.ts`'s
   * `advanceDay` hook walks), and its customers. */
  storyMissions: readonly StoryMission[]
  storyMissionsById: Readonly<Record<string, StoryMission>>
  personas: readonly Persona[]
  personasById: Readonly<Record<string, Persona>>
  /** Sprint 77 (story missions II, the reference-lap board): the fictional
   * comparable pool `lapModel.ts`'s `selectBoardRows` straddles, and the one
   * grip anchor rendered once per tyre grade - pre-split from the raw
   * `lapReferences.json` list once here, so no caller re-filters it. */
  lapReferencePool: readonly Extract<LapReferenceEntry, { anchor: false }>[]
  lapReferenceAnchor: Extract<LapReferenceEntry, { anchor: true }>
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

const FITMENT_CLASSES: readonly PartFitmentClass[] = ['shitbox', 'common', 'uncommon', 'rare']

/** One `grade: 'stock'` catalog part per `CarPartId`, per fitment class
 * (Sprint 32 decision 1 + Sprint 53's class dimension - the resolved catalog
 * guarantees exactly one exists per component per class). */
function indexStockPartsByCarPartId(
  parts: readonly Part[],
): Record<PartFitmentClass, Record<CarPartId, Part>> {
  const result = {} as Record<PartFitmentClass, Record<CarPartId, Part>>
  for (const fitmentClass of FITMENT_CLASSES) {
    const byCarPartId: Record<string, Part> = {}
    for (const part of parts) {
      if (part.grade === 'stock' && part.fitmentClass === fitmentClass) {
        byCarPartId[part.carPartId] = part
      }
    }
    result[fitmentClass] = byCarPartId as Record<CarPartId, Part>
  }
  return result
}

/** Sprint 75 decision 1: the catalog's non-stock (`street`/`sport`/`race`)
 * entry per `CarPartId`, per fitment class - `aftermarketPartByCarPartId`'s
 * builder, mirroring `indexStockPartsByCarPartId` above exactly. */
function indexAftermarketPartsByCarPartId(
  parts: readonly Part[],
): Record<PartFitmentClass, Record<CarPartId, Partial<Record<Grade, Part>>>> {
  const result = {} as Record<PartFitmentClass, Record<CarPartId, Partial<Record<Grade, Part>>>>
  for (const fitmentClass of FITMENT_CLASSES) {
    const byCarPartId: Record<string, Partial<Record<Grade, Part>>> = {}
    for (const part of parts) {
      if (part.grade !== 'stock' && part.fitmentClass === fitmentClass) {
        ;(byCarPartId[part.carPartId] ??= {})[part.grade] = part
      }
    }
    result[fitmentClass] = byCarPartId as Record<CarPartId, Partial<Record<Grade, Part>>>
  }
  return result
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
 *
 * Sprint 70: `provenancePool` is a 12th (trailing) parameter, same treatment.
 *
 * Sprint 73: `symptoms`/`diagnosticTests` are 13th/14th (trailing)
 * parameters, same treatment.
 *
 * Sprint 76: `storyMissions`/`personas` are 15th/16th (trailing) parameters,
 * same treatment.
 *
 * Sprint 77: `lapReferences` is a 17th (trailing) parameter, same treatment.
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
  provenancePool: ProvenancePool = PROVENANCE_POOL,
  symptoms: readonly Symptom[] = SYMPTOMS,
  diagnosticTests: readonly DiagnosticTest[] = DIAGNOSTIC_TESTS,
  storyMissions: readonly StoryMission[] = STORY_MISSIONS,
  personas: readonly Persona[] = PERSONAS,
  lapReferences: readonly LapReferenceEntry[] = LAP_REFERENCES,
): SimContext {
  const sortedStoryMissions = [...storyMissions].sort(
    (a, b) => a.gateReputationPoints - b.gateReputationPoints,
  )
  const lapReferencePool = lapReferences.filter(
    (entry): entry is Extract<LapReferenceEntry, { anchor: false }> => !entry.anchor,
  )
  const lapReferenceAnchor = lapReferences.find(
    (entry): entry is Extract<LapReferenceEntry, { anchor: true }> => entry.anchor,
  )
  if (!lapReferenceAnchor) {
    throw new Error('lapReferences content has no anchor: true entry')
  }
  return {
    models,
    modelsById: indexById(models),
    parts,
    partsById: indexById(parts),
    stockPartByCarPartId: indexStockPartsByCarPartId(parts),
    aftermarketPartByCarPartId: indexAftermarketPartsByCarPartId(parts),
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
    provenancePool,
    symptoms,
    symptomsById: indexById(symptoms),
    diagnosticTests,
    diagnosticTestsById: indexById(diagnosticTests),
    storyMissions: sortedStoryMissions,
    storyMissionsById: indexById(sortedStoryMissions),
    personas,
    personasById: indexById(personas),
    lapReferencePool,
    lapReferenceAnchor,
  }
}
