import type {
  Buyer,
  CarModel,
  ComponentId,
  EconomyConfig,
  Equipment,
  Facilities,
  HiddenIssue,
  Part,
  ServiceJobType,
} from '@midnight-garage/content'
import { ECONOMY } from '@midnight-garage/content'
import { groupHiddenIssuesByComponent } from './auctions'

/**
 * Permissive fallback so pre-Sprint-09 call sites (many sim tests) that don't
 * pass a facilities arg keep compiling and still get sane new-game start
 * counts (1 service / 3 parking) — just with no bays purchasable (max ==
 * start). Real gameplay passes content's actual FACILITIES.
 */
const DEFAULT_FACILITIES: Facilities = {
  service: { startCount: 1, maxCount: 1, bayPricesYen: [], minReputationTier: [] },
  parking: { startCount: 3, maxCount: 3, bayPricesYen: [], minReputationTier: [] },
}

/**
 * Static content catalogs advanceDay needs for auction generation and
 * valuation — car models, parts, buyers, hidden issues. Sim has no data
 * loader of its own (packages/content ships JSON, not a database), so
 * the caller builds this once from data/*.json and passes it through.
 * Kept separate from GameState because it's reference data, not
 * evolving game state — bundled into one object rather than threading
 * four separate parameters through advanceDay and every function below it.
 */
export interface SimContext {
  models: readonly CarModel[]
  modelsById: Readonly<Record<string, CarModel>>
  parts: readonly Part[]
  partsById: Readonly<Record<string, Part>>
  buyers: readonly Buyer[]
  hiddenIssuesById: Readonly<Record<string, HiddenIssue>>
  hiddenIssuesByComponent: Readonly<Record<ComponentId, readonly HiddenIssue[]>>
  serviceJobTypes: readonly ServiceJobType[]
  serviceJobCustomerNames: readonly string[]
  facilities: Facilities
  equipment: readonly Equipment[]
  equipmentById: Readonly<Record<string, Equipment>>
  economy: EconomyConfig
}

function indexById<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  const result: Record<string, T> = {}
  for (const item of items) {
    result[item.id] = item
  }
  return result
}

/**
 * `economy` (Sprint 20 step 0) is deliberately the LAST parameter, defaulted
 * to the real parsed `economy.json` (content's `ECONOMY`) — every other
 * `buildSimContext` call site (the ~16 sim test files that call this
 * positionally) keeps compiling and gets the real economy config with no
 * changes, since a trailing default doesn't shift any existing positional
 * argument. Callers that want a different economy (none do yet) pass it
 * explicitly.
 */
export function buildSimContext(
  models: readonly CarModel[],
  parts: readonly Part[],
  buyers: readonly Buyer[],
  hiddenIssues: readonly HiddenIssue[],
  serviceJobTypes: readonly ServiceJobType[] = [],
  facilities: Facilities = DEFAULT_FACILITIES,
  serviceJobCustomerNames: readonly string[] = [],
  equipment: readonly Equipment[] = [],
  economy: EconomyConfig = ECONOMY,
): SimContext {
  return {
    models,
    modelsById: indexById(models),
    parts,
    partsById: indexById(parts),
    buyers,
    hiddenIssuesById: indexById(hiddenIssues),
    hiddenIssuesByComponent: groupHiddenIssuesByComponent(hiddenIssues),
    serviceJobTypes,
    serviceJobCustomerNames,
    facilities,
    equipment,
    equipmentById: indexById(equipment),
    economy,
  }
}
