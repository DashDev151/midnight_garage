import type { CarPartId, ComponentId } from '@midnight-garage/content'

/**
 * A group-level or per-part work address: every `Job` addresses either a
 * whole 6-way component group (`carPartId` absent) or one specific part
 * within it (`carPartId` present). Shared by the game store's busy gates and
 * `CarDetailScreen`'s per-row lookups, so "does this address already have an
 * open job on it" has exactly one definition rather than being re-derived at
 * each call site.
 */
export interface WorkAddress {
  componentId: ComponentId
  carPartId?: CarPartId
}

/**
 * Two addresses collide/overlap when they name the same specific part, or
 * either one is group-level (a group address covers every part in it,
 * including whatever the other address names). Used to read whether a job
 * is already open over an address a player is about to click.
 */
export function addressesOverlap(a: WorkAddress, b: WorkAddress): boolean {
  if (a.componentId !== b.componentId) return false
  if (!a.carPartId || !b.carPartId) return true
  return a.carPartId === b.carPartId
}
