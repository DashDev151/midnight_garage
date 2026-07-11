import type { CarPartId, ComponentId } from '@midnight-garage/content'

/**
 * A group-level or per-part work address (Sprint 28): every `StagedAction`
 * and `Job` addresses either a whole 6-way component group (`carPartId`
 * absent) or one specific part within it (`carPartId` present). Shared by
 * the game store's staging/busy gates and `CarDetailScreen`'s per-row
 * lookups, so "does this address already have something going on" has
 * exactly one definition rather than being re-derived at each call site.
 */
export interface WorkAddress {
  componentId: ComponentId
  carPartId?: CarPartId
}

/**
 * Two addresses collide/overlap when they name the same specific part, or
 * either one is group-level (a group address covers every part in it,
 * including whatever the other address names). Used to gate staging (or
 * starting a job) over something already busy (decision 4, generalized to
 * per-part) and to displace an existing staged entry when staging a new,
 * overlapping one (decision 8, generalized).
 */
export function addressesOverlap(a: WorkAddress, b: WorkAddress): boolean {
  if (a.componentId !== b.componentId) return false
  if (!a.carPartId || !b.carPartId) return true
  return a.carPartId === b.carPartId
}

/**
 * Exact address match (not overlap) - for removing precisely one staged
 * entry (`unstageAction`) without also sweeping away a sibling part's stage
 * in the same group.
 */
export function sameAddress(a: WorkAddress, b: WorkAddress): boolean {
  return a.componentId === b.componentId && a.carPartId === b.carPartId
}
