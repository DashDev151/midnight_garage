import buyersJson from '../data/buyers.json'
import carsJson from '../data/cars.json'
import componentDisplayNamesJson from '../data/componentDisplayNames.json'
import economyJson from '../data/economy.json'
import facilitiesJson from '../data/facilities.json'
import partsJson from '../data/parts.json'
import partsTaxonomyJson from '../data/parts-taxonomy.json'
import serviceJobCustomerNamesJson from '../data/serviceJobCustomerNames.json'
import serviceJobTemplatesJson from '../data/serviceJobTemplates.json'
import specialtyCopyJson from '../data/specialtyCopy.json'
import toolLinesJson from '../data/toolLines.json'
import traitsJson from '../data/traits.json'
import { BuyersSchema } from './buyer'
import { CarModelsSchema } from './carModel'
import { CarPartTaxonomySchema } from './carPart'
import { ComponentDisplayNamesSchema } from './componentDisplayName'
import { EconomyConfigSchema } from './economy'
import { FacilitiesSchema } from './facilities'
import { PartsSchema } from './part'
import { ServiceJobCustomerNamesSchema, ServiceJobTypesSchema } from './serviceJob'
import { SpecialtyCopySchema } from './specialtyCopy'
import { TraitDefinitionsSchema } from './staff'
import { ToolLinesSchema } from './toolLines'

/**
 * Parsed, schema-validated seed content - the single source of truth for
 * both tests and the game. `packages/content`'s exports map only exposes
 * `src/index.ts`, not `data/*.json` directly, so other packages (sim,
 * game) get the data through here rather than a deep relative import
 * that would reach past the package boundary.
 */
export const CARS = CarModelsSchema.parse(carsJson)
export const PARTS = PartsSchema.parse(partsJson)
export const PARTS_TAXONOMY = CarPartTaxonomySchema.parse(partsTaxonomyJson)
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
