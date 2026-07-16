import buyersJson from '../data/buyers.json'
import carsJson from '../data/cars.json'
import componentDisplayNamesJson from '../data/componentDisplayNames.json'
import diagnosticTestsJson from '../data/diagnosticTests.json'
import economyJson from '../data/economy.json'
import facilitiesJson from '../data/facilities.json'
import partPricingJson from '../data/partPricing.json'
import partsJson from '../data/parts.json'
import partsTaxonomyJson from '../data/parts-taxonomy.json'
import personasJson from '../data/personas.json'
import provenanceJson from '../data/provenance.json'
import serviceJobCustomerNamesJson from '../data/serviceJobCustomerNames.json'
import serviceJobTemplatesJson from '../data/serviceJobTemplates.json'
import specialtyCopyJson from '../data/specialtyCopy.json'
import storyMissionsJson from '../data/storyMissions.json'
import symptomsJson from '../data/symptoms.json'
import techniquesJson from '../data/techniques.json'
import toolLinesJson from '../data/toolLines.json'
import traitsJson from '../data/traits.json'
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
import { PartCatalogEntriesSchema, PartsSchema, resolvePartsCatalog } from './part'
import { PartPricingSheetSchema } from './partPricing'
import type { PartFitmentClass } from './partFitment'
import type { CarPartId } from './tags'
import { PersonasSchema } from './persona'
import { ProvenancePoolSchema } from './provenance'
import { ServiceJobCustomerNamesSchema, ServiceJobTypesSchema } from './serviceJob'
import { SpecialtyCopySchema } from './specialtyCopy'
import { StoryMissionsSchema, type StoryMission } from './storyMission'
import { SymptomsSchema } from './symptom'
import { TraitDefinitionsSchema } from './staff'
import { TechniquesSchema } from './techniques'
import { ToolLinesSchema } from './toolLines'

/**
 * Parsed, schema-validated seed content - the single source of truth for
 * both tests and the game. `packages/content`'s exports map only exposes
 * `src/index.ts`, not `data/*.json` directly, so other packages (sim,
 * game) get the data through here rather than a deep relative import
 * that would reach past the package boundary.
 */
export const CARS = CarModelsSchema.parse(carsJson)

/**
 * Sprint 53 (economy-bible.md): every SKU's `priceYen` is resolved once here,
 * at content-load time, from the pricing sheet - never a hand-authored JSON
 * field. `PARTS` keeps the exact shape/name every downstream reader already
 * expects; only where the number comes from changed.
 */
const PART_CATALOG_ENTRIES = PartCatalogEntriesSchema.parse(partsJson)
const PART_PRICING_SHEET = PartPricingSheetSchema.parse(partPricingJson)
export const PARTS = PartsSchema.parse(
  resolvePartsCatalog(PART_CATALOG_ENTRIES, PART_PRICING_SHEET),
)

const FITMENT_CLASSES: readonly PartFitmentClass[] = ['shitbox', 'common', 'uncommon', 'rare']

/**
 * Sprint 53: a taxonomy entry's per-class stock-replacement price is simply
 * that class's own stock-grade SKU price - derived from the resolved `PARTS`
 * catalog, never a hand-maintained mirror, so it can never drift from the
 * catalog it describes.
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

export const BUYERS = BuyersSchema.parse(buyersJson)
export const TRAITS = TraitDefinitionsSchema.parse(traitsJson)
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
 * Sprint 70: the car-history flavour pool (`CarInstance.provenanceNote`),
 * relocated from `packages/sim/src/auctions.ts`'s `PROVENANCE_POOL` constant -
 * the content law now covers it too.
 */
export const PROVENANCE_POOL = ProvenancePoolSchema.parse(provenanceJson)

/**
 * Sprint 73 (diagnosis I): the symptom/cause pool and the flat diagnostic-
 * test registry (id + minutes) each symptom's own `tests` entries reference
 * by `testId`.
 */
export const SYMPTOMS = SymptomsSchema.parse(symptomsJson)
export const DIAGNOSTIC_TESTS = DiagnosticTestsSchema.parse(diagnosticTestsJson)

/**
 * Sprint 76 (story missions I): the hand-authored campaign's customers, and
 * the missions themselves. `budgetCapYen` is each mission's single authored
 * spend ceiling - mirrored here into a matching `budgetCap` requirement
 * appended to `requirements`, so `gradeMissionCar` (sim) never has to read
 * two different fields to grade one concern, and content never carries the
 * same number twice (`storyMission.ts`'s own doc comment).
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
