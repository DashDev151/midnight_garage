import assembliesJson from '../data/assemblies.json'
import auctionTierCopyJson from '../data/auctionTierCopy.json'
import buyersJson from '../data/buyers.json'
import carsJson from '../data/cars.json'
import componentDisplayNamesJson from '../data/componentDisplayNames.json'
import diagnosticTestsJson from '../data/diagnosticTests.json'
import economyJson from '../data/economy.json'
import facilitiesJson from '../data/facilities.json'
import failureModesJson from '../data/failureModes.json'
import lapReferencesJson from '../data/lapReferences.json'
import partPricingJson from '../data/partPricing.json'
import partsJson from '../data/parts.json'
import partsTaxonomyJson from '../data/parts-taxonomy.json'
import personasJson from '../data/personas.json'
import provenanceJson from '../data/provenance.json'
import serviceJobCustomerNamesJson from '../data/serviceJobCustomerNames.json'
import serviceJobTemplatesJson from '../data/serviceJobTemplates.json'
import specialtyCopyJson from '../data/specialtyCopy.json'
import staffCandidatesJson from '../data/staffCandidates.json'
import storyMissionsJson from '../data/storyMissions.json'
import symptomsJson from '../data/symptoms.json'
import techniquesJson from '../data/techniques.json'
import toolLinesJson from '../data/toolLines.json'
import traitsJson from '../data/traits.json'
import tutorialLotJson from '../data/tutorialLot.json'
import tutorialStepsJson from '../data/tutorialSteps.json'
import venueNamesJson from '../data/venueNames.json'
import { AssemblyDefsSchema } from './assembly'
import { AuctionTierCopySchema } from './auctionTierCopy'
import { BuyersSchema } from './buyer'
import { CarModelsSchema } from './carModel'
import {
  CarPartTaxonomyContentSchema,
  CarPartTaxonomySchema,
  type CarPartTaxonomyEntry,
} from './carPart'
import { ComponentDisplayNamesSchema } from './componentDisplayName'
import { DiagnosticTestsSchema } from './diagnosticTest'
import { EconomyConfigSchema } from './economy'
import { FacilitiesSchema } from './facilities'
import { FailureModesSchema, type FailureMode } from './failureMode'
import { LapReferencesSchema } from './lapReference'
import { PartCatalogEntriesSchema, PartsSchema, resolvePartsCatalog } from './part'
import { PartPricingSheetSchema } from './partPricing'
import type { PartFitmentClass } from './partFitment'
import type { CarPartId } from './tags'
import { PersonasSchema } from './persona'
import { ProvenancePoolSchema } from './provenance'
import { ServiceJobCustomerNamesSchema, ServiceJobTypesSchema } from './serviceJob'
import { SpecialtyCopySchema } from './specialtyCopy'
import { StoryMissionsSchema, type StoryMission } from './storyMission'
import { resolveSymptomCauses, SymptomsContentSchema, SymptomsSchema } from './symptom'
import { StaffCandidatePoolSchema, TraitDefinitionsSchema } from './staff'
import { TechniquesSchema } from './techniques'
import { ToolLinesSchema } from './toolLines'
import { TutorialLotRecipeSchema, TutorialStepsSchema } from './tutorial'
import { VenueNamesSchema } from './venueNames'

/**
 * Parsed, schema-validated seed content - the single source of truth for
 * both tests and the game. `packages/content`'s exports map only exposes
 * `src/index.ts`, not `data/*.json` directly, so other packages (sim,
 * game) get the data through here rather than a deep relative import
 * that would reach past the package boundary.
 */
export const CARS = CarModelsSchema.parse(carsJson)

/**
 * Every SKU's `priceYen` is resolved once here, at content-load time, from
 * the pricing sheet - never a hand-authored JSON field. `PARTS` keeps the
 * exact shape/name every downstream reader already expects; only where the
 * number comes from changed.
 */
const PART_CATALOG_ENTRIES = PartCatalogEntriesSchema.parse(partsJson)
const PART_PRICING_SHEET = PartPricingSheetSchema.parse(partPricingJson)
export const PARTS = PartsSchema.parse(
  resolvePartsCatalog(PART_CATALOG_ENTRIES, PART_PRICING_SHEET),
)

const FITMENT_CLASSES: readonly PartFitmentClass[] = ['shitbox', 'common', 'uncommon', 'rare']

/**
 * A taxonomy entry's per-class stock-replacement price is simply that class's
 * own stock-grade SKU price - derived from the resolved `PARTS` catalog,
 * never a hand-maintained mirror, so it can never drift from the catalog it
 * describes.
 */
function stockReplacementPricesByClass(carPartId: CarPartId): Record<PartFitmentClass, number> {
  const result = {} as Record<PartFitmentClass, number>
  for (const fitmentClass of FITMENT_CLASSES) {
    const stockPart = PARTS.find(
      (p) => p.carPartId === carPartId && p.grade === 'stock' && p.fitmentClass === fitmentClass,
    )
    if (!stockPart) {
      throw new Error(`no stock-grade "${fitmentClass}" catalog part addresses "${carPartId}"`)
    }
    result[fitmentClass] = stockPart.priceYen
  }
  return result
}

const TAXONOMY_CONTENT = CarPartTaxonomyContentSchema.parse(partsTaxonomyJson)
export const PARTS_TAXONOMY: CarPartTaxonomyEntry[] = CarPartTaxonomySchema.parse(
  TAXONOMY_CONTENT.map((entry) => ({
    ...entry,
    stockReplacementPriceYenByClass: stockReplacementPricesByClass(entry.id),
  })),
)

/**
 * The three sub-assemblies (wheels, engine, gearbox) that come off and go
 * back on as one unit. A pure grouping over the `PARTS_TAXONOMY` members
 * above - the labour and gate machinery it drives lives entirely in
 * `packages/sim/src/assemblies.ts`, built over the existing per-slot resolvers.
 */
export const ASSEMBLIES = AssemblyDefsSchema.parse(assembliesJson)

export const BUYERS = BuyersSchema.parse(buyersJson)
export const TRAITS = TraitDefinitionsSchema.parse(traitsJson)
/**
 * The job-ad candidate name and bio pools the seeded candidate roller
 * (`sim/staff.ts`) draws from.
 */
export const STAFF_CANDIDATES = StaffCandidatePoolSchema.parse(staffCandidatesJson)
export const SERVICE_JOB_TYPES = ServiceJobTypesSchema.parse(serviceJobTemplatesJson)
export const SERVICE_JOB_CUSTOMER_NAMES = ServiceJobCustomerNamesSchema.parse(
  serviceJobCustomerNamesJson,
)
export const FACILITIES = FacilitiesSchema.parse(facilitiesJson)
export const TOOL_LINES = ToolLinesSchema.parse(toolLinesJson)
export const ECONOMY = EconomyConfigSchema.parse(economyJson)
export const COMPONENT_DISPLAY_NAMES = ComponentDisplayNamesSchema.parse(componentDisplayNamesJson)
export const SPECIALTY_COPY = SpecialtyCopySchema.parse(specialtyCopyJson)
export const TECHNIQUES = TechniquesSchema.parse(techniquesJson)

/**
 * The car-history flavour pool (`CarInstance.provenanceNote`).
 */
export const PROVENANCE_POOL = ProvenancePoolSchema.parse(provenanceJson)

/**
 * Each auction tier's venue-name pool - a new save rolls one per tier and
 * stores it, displayed wherever the tier label renders.
 */
export const VENUE_NAMES = VenueNamesSchema.parse(venueNamesJson)

/**
 * The locked-tier guarantor line shown for each auction tier not yet
 * unlocked - `AuctionScreen`'s locked-tier copy.
 */
export const AUCTION_TIER_COPY = AuctionTierCopySchema.parse(auctionTierCopyJson)

/**
 * The shared failure-mode registry each symptom's own `causes` entries
 * reference by `failureModeId`.
 */
export const FAILURE_MODES = FailureModesSchema.parse(failureModesJson)
const FAILURE_MODE_BY_ID = new Map<string, FailureMode>(
  FAILURE_MODES.map((mode) => [mode.id, mode]),
)

/**
 * The symptom/cause pool and the flat diagnostic-test registry (id + minutes)
 * each symptom's own `tests` entries reference by `testId`. `symptoms.json`
 * only ever carries `causes` as registry references (`CauseSchema`); resolved
 * here by joining each reference against `FAILURE_MODES`, so `SYMPTOMS` keeps
 * the exact resolved shape every downstream reader (sim, game) already expects.
 * A dangling `failureModeId` fails loudly at load time rather than surfacing
 * as a missing part downstream.
 */
const SYMPTOMS_CONTENT = SymptomsContentSchema.parse(symptomsJson)
export const SYMPTOMS = SymptomsSchema.parse(
  SYMPTOMS_CONTENT.map((symptom) => resolveSymptomCauses(symptom, FAILURE_MODE_BY_ID)),
)
export const DIAGNOSTIC_TESTS = DiagnosticTestsSchema.parse(diagnosticTestsJson)

/**
 * The hand-authored campaign's customers, and the missions themselves.
 * `budgetCapYen` is each mission's single authored spend ceiling - mirrored
 * here into a matching `budgetCap` requirement appended to `requirements`, so
 * `gradeMissionCar` (sim) never has to read two different fields to grade one
 * concern, and content never carries the same number twice.
 */
export const PERSONAS = PersonasSchema.parse(personasJson)
const STORY_MISSIONS_AUTHORED = StoryMissionsSchema.parse(storyMissionsJson)
export const STORY_MISSIONS: StoryMission[] = STORY_MISSIONS_AUTHORED.map((mission) => ({
  ...mission,
  requirements: [
    ...mission.requirements,
    { kind: 'budgetCap' as const, maxTotalSpendYen: mission.budgetCapYen },
  ],
}))

/**
 * The reference-lap board's fictional comparable pool + the one grip anchor -
 * see `lapReference.ts`'s own doc comment for the anchor/pool discriminated shape.
 */
export const LAP_REFERENCES = LapReferencesSchema.parse(lapReferencesJson)

/**
 * The guided-tutorial script and the one scripted auction lot recipe.
 * `TUTORIAL_STEPS` is the ordered coach beats the overlay renders (all copy
 * orchestrator-swept); `TUTORIAL_LOT` is the fixed shitbox-runabout recipe
 * the sim builds deterministically while the tutorial is live - the
 * satisfiability probe (`packages/sim/tests/tutorialProbe.test.ts`) pins its
 * economics.
 */
export const TUTORIAL_STEPS = TutorialStepsSchema.parse(tutorialStepsJson)
export const TUTORIAL_LOT = TutorialLotRecipeSchema.parse(tutorialLotJson)
