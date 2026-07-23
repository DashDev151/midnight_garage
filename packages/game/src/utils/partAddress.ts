import type { CarPartId, ComponentId, StagedAction } from '@midnight-garage/content'

/**
 * A group-level or per-part work address: every `StagedAction`
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
 * starting a job) over something already busy, and to displace an existing
 * staged entry when staging a new, overlapping one.
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

/** The staged kinds that carry a per-part work address. The assembly kinds
 * (`remove-assembly`/`refit-assembly`) address a whole assembly by
 * id instead and never match a per-part address - every address-matching site
 * narrows through this guard first. */
export type AddressedStagedAction = Extract<StagedAction, { kind: 'repair' | 'install' }>

export function hasWorkAddress(action: StagedAction): action is AddressedStagedAction {
  return action.kind === 'repair' || action.kind === 'install'
}

const PIPELINE_KINDS = ['pipeline-stage', 'pipeline-swap-panel', 'pipeline-paint'] as const
type PipelineStagedAction = Extract<StagedAction, { kind: (typeof PIPELINE_KINDS)[number] }>

function isPipelineAction(action: StagedAction): action is PipelineStagedAction {
  return (PIPELINE_KINDS as readonly string[]).includes(action.kind)
}

/**
 * Whether staging `b` displaces already-staged `a` - the staged-
 * action generalisation of `addressesOverlap`. Two per-part actions collide by
 * address overlap exactly as before; an assembly action collides only with the
 * SAME operation on the SAME assembly (a re-stage replaces it), and never with
 * a per-part action - an assembly action has no per-part address to overlap.
 * A body-pipeline action collides only with the SAME op on the SAME zone
 * (`pipeline-stage` additionally matches on its own `stage`) - re-staging the
 * identical op replaces it, but staging a DIFFERENT stage on the same zone
 * (fill-and-sand, then prime, then paint) must coexist as a real sequence.
 */
export function stagedActionsCollide(a: StagedAction, b: StagedAction): boolean {
  if (isPipelineAction(a) || isPipelineAction(b)) {
    if (
      !isPipelineAction(a) ||
      !isPipelineAction(b) ||
      a.kind !== b.kind ||
      a.zoneId !== b.zoneId
    ) {
      return false
    }
    return a.kind === 'pipeline-stage' && b.kind === 'pipeline-stage' ? a.stage === b.stage : true
  }
  if (!hasWorkAddress(a) || !hasWorkAddress(b)) {
    return (
      !hasWorkAddress(a) && !hasWorkAddress(b) && a.kind === b.kind && a.assemblyId === b.assemblyId
    )
  }
  return addressesOverlap(a, b)
}
