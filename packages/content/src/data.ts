import buyersJson from '../data/buyers.json'
import carsJson from '../data/cars.json'
import economyJson from '../data/economy.json'
import equipmentJson from '../data/equipment.json'
import facilitiesJson from '../data/facilities.json'
import hiddenIssuesJson from '../data/hidden-issues.json'
import partsJson from '../data/parts.json'
import serviceJobCustomerNamesJson from '../data/serviceJobCustomerNames.json'
import serviceJobsJson from '../data/serviceJobs.json'
import traitsJson from '../data/traits.json'
import { BuyersSchema } from './buyer'
import { CarModelsSchema } from './carModel'
import { EconomyConfigSchema } from './economy'
import { EquipmentsSchema } from './equipment'
import { FacilitiesSchema } from './facilities'
import { HiddenIssuesSchema } from './hiddenIssue'
import { PartsSchema } from './part'
import { ServiceJobCustomerNamesSchema, ServiceJobTypesSchema } from './serviceJob'
import { TraitDefinitionsSchema } from './staff'

/**
 * Parsed, schema-validated seed content — the single source of truth for
 * both tests and the game. `packages/content`'s exports map only exposes
 * `src/index.ts`, not `data/*.json` directly, so other packages (sim,
 * game) get the data through here rather than a deep relative import
 * that would reach past the package boundary.
 */
export const CARS = CarModelsSchema.parse(carsJson)
export const PARTS = PartsSchema.parse(partsJson)
export const BUYERS = BuyersSchema.parse(buyersJson)
export const HIDDEN_ISSUES = HiddenIssuesSchema.parse(hiddenIssuesJson)
export const TRAITS = TraitDefinitionsSchema.parse(traitsJson)
export const SERVICE_JOB_TYPES = ServiceJobTypesSchema.parse(serviceJobsJson)
export const SERVICE_JOB_CUSTOMER_NAMES = ServiceJobCustomerNamesSchema.parse(
  serviceJobCustomerNamesJson,
)
export const FACILITIES = FacilitiesSchema.parse(facilitiesJson)
export const EQUIPMENT = EquipmentsSchema.parse(equipmentJson)
export const ECONOMY = EconomyConfigSchema.parse(economyJson)
