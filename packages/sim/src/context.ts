import type {
  Buyer,
  CarModel,
  ComponentId,
  Equipment,
  Facilities,
  HiddenIssue,
  Part,
  ServiceJobType,
} from '@midnight-garage/content'
import { groupHiddenIssuesByComponent } from './auctions'

/**
 * Permissive fallback so pre-Sprint-09 call sites (many sim tests) that don't
 * pass a facilities arg keep compiling and still get sane new-game start
 * counts (1 service / 3 parking) — just with no bays purchasable (max ==
 * start). Real gameplay passes content's actual FACILITIES.
 */
const DEFAULT_FACILITIES: Facilities = {
  service: { startCount: 1, maxCount: 1, bayPricesYen: [] },
  parking: { startCount: 3, maxCount: 3, bayPricesYen: [] },
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
}

function indexById<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  const result: Record<string, T> = {}
  for (const item of items) {
    result[item.id] = item
  }
  return result
}

export function buildSimContext(
  models: readonly CarModel[],
  parts: readonly Part[],
  buyers: readonly Buyer[],
  hiddenIssues: readonly HiddenIssue[],
  serviceJobTypes: readonly ServiceJobType[] = [],
  facilities: Facilities = DEFAULT_FACILITIES,
  serviceJobCustomerNames: readonly string[] = [],
  equipment: readonly Equipment[] = [],
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
  }
}
