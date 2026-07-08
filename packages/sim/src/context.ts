import type { Buyer, CarModel, HiddenIssue, Part, Zone } from '@midnight-garage/content'
import { groupHiddenIssuesByZone } from './auctions'

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
  hiddenIssuesByZone: Readonly<Record<Zone, readonly HiddenIssue[]>>
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
): SimContext {
  return {
    models,
    modelsById: indexById(models),
    parts,
    partsById: indexById(parts),
    buyers,
    hiddenIssuesById: indexById(hiddenIssues),
    hiddenIssuesByZone: groupHiddenIssuesByZone(hiddenIssues),
  }
}
