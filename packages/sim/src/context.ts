import type {
  AssemblyDef,
  AssemblyId,
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
  StaffCandidatePool,
  StoryMission,
  Symptom,
  Technique,
  ToolLine,
  ToolLines,
  VenueNames,
} from '@midnight-garage/content'
import {
  ASSEMBLIES,
  DIAGNOSTIC_TESTS,
  ECONOMY,
  LAP_REFERENCES,
  PERSONAS,
  PROVENANCE_POOL,
  SPECIALTY_COPY,
  STAFF_CANDIDATES,
  STORY_MISSIONS,
  SYMPTOMS,
  TECHNIQUES,
  TOOL_LINES,
  VENUE_NAMES,
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
   * `CarPartId`, PER FITMENT CLASS - what generation fills a non-empty slot
   * with by default, and what removing an aftermarket part reverts a slot
   * to (`jobs.ts`'s `resolveRemovePart`). Derived once from `parts` rather
   * than filtered on every generation/removal call.
   */
  stockPartByCarPartId: Readonly<Record<PartFitmentClass, Readonly<Record<CarPartId, Part>>>>
  /**
   * The catalog's `street`/`sport`/`race` entry for each `CarPartId`, per
   * fitment class - what the aftermarket-at-generation roll
   * (`generateAuctionCarInstance`, auctions.ts) fits instead of the stock
   * default. A `Partial` value since a future content change could ship a
   * part missing one grade.
   */
  aftermarketPartByCarPartId: Readonly<
    Record<PartFitmentClass, Readonly<Record<CarPartId, Readonly<Partial<Record<Grade, Part>>>>>>
  >
  buyers: readonly Buyer[]
  /** The 29-part taxonomy, indexed by CarPartId. */
  partsTaxonomy: readonly CarPartTaxonomyEntry[]
  partsTaxonomyById: Readonly<Record<CarPartId, CarPartTaxonomyEntry>>
  /** Every CarPartId belonging to each of the 6 groups, derived once from
   * the taxonomy rather than re-filtered on every call. */
  partIdsByGroup: Readonly<Record<ComponentId, readonly CarPartId[]>>
  /** The three sub-assemblies (wheels, engine, gearbox) removed/refitted as
   * a unit - `packages/sim/src/assemblies.ts`'s resolvers key off these. */
  assemblies: readonly AssemblyDef[]
  assembliesById: Readonly<Record<AssemblyId, AssemblyDef>>
  serviceJobTypes: readonly ServiceJobType[]
  serviceJobCustomerNames: readonly string[]
  facilities: Facilities
  /** The six always-owned tool ladders, keyed by ComponentId. */
  toolLines: ToolLines
  /** Convenience lookup for one line - `toolLines[componentId]`, named. */
  toolLineFor(componentId: ComponentId): ToolLine
  economy: EconomyConfig
  /** The word-of-mouth flavor pool a generated offer draws from instead of
   * its template's own `flavorPool` when the in-lane specialty premium
   * applies (`serviceJobs.ts`). */
  specialtyCopy: SpecialtyCopy
  /** The named-craft catalog gating signature templates
   * (`unlockedTechniques`/`requiresUnmetTechnique`, serviceJobs.ts). */
  techniques: readonly Technique[]
  /** The car-history flavour pool (`CarInstance.provenanceNote`) -
   * `auctions.ts` reads it from here. */
  provenancePool: ProvenancePool
  /** The symptom/cause pool `generateAuctionCarInstance` rolls from, and
   * the flat diagnostic-test registry a symptom's own `tests` entries
   * reference by id. */
  symptoms: readonly Symptom[]
  symptomsById: Readonly<Record<string, Symptom>>
  diagnosticTests: readonly DiagnosticTest[]
  diagnosticTestsById: Readonly<Record<string, DiagnosticTest>>
  /** The hand-authored campaign, sorted by `gateReputationPoints` (the
   * strictly linear order `missions.ts`'s `advanceDay` hook walks), and its
   * customers. */
  storyMissions: readonly StoryMission[]
  storyMissionsById: Readonly<Record<string, StoryMission>>
  personas: readonly Persona[]
  personasById: Readonly<Record<string, Persona>>
  /** The fictional comparable pool `lapModel.ts`'s `selectBoardRows`
   * straddles, and the one grip anchor rendered once per tyre grade -
   * pre-split from the raw `lapReferences.json` list once here, so no
   * caller re-filters it. */
  lapReferencePool: readonly Extract<LapReferenceEntry, { anchor: false }>[]
  lapReferenceAnchor: Extract<LapReferenceEntry, { anchor: true }>
  /** The job-ad candidate name/bio pools the seeded candidate roller
   * (`staff.ts`'s `rollStaffCandidate`) draws from. */
  staffCandidates: StaffCandidatePool
  /** Each auction tier's venue-name pool - `newGame.ts` rolls one per tier
   * from here at career start. */
  venueNames: VenueNames
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

/** One `grade: 'stock'` catalog part per `CarPartId`, per fitment class -
 * the resolved catalog guarantees exactly one exists per component per
 * class. */
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

/** The catalog's non-stock (`street`/`sport`/`race`) entry per `CarPartId`,
 * per fitment class - `aftermarketPartByCarPartId`'s builder, mirroring
 * `indexStockPartsByCarPartId` above exactly. */
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
 * Every parameter after `partsTaxonomy` is optional, trailing, and defaults
 * to the real parsed content - so every existing positional call site (the
 * ~16 sim test files that call this positionally) keeps compiling and gets
 * the real config, since a trailing default never shifts an existing
 * positional argument. Callers that want something different pass it
 * explicitly.
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
  staffCandidates: StaffCandidatePool = STAFF_CANDIDATES,
  assemblies: readonly AssemblyDef[] = ASSEMBLIES,
  venueNames: VenueNames = VENUE_NAMES,
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
    assemblies,
    assembliesById: indexById(assemblies) as Record<AssemblyId, AssemblyDef>,
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
    staffCandidates,
    venueNames,
  }
}
