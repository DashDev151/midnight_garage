import type { CarInstance, ComponentId, ConditionBand, GameState } from '@midnight-garage/content'
import type { DayActions } from '../actions'
import {
  bandIndex,
  clampRepairTarget,
  planGroupRepair,
  presentPartIdsInGroup,
  repairCeilingForLevel,
  repairLevelForGroup,
} from '../bands'
import type { SimContext } from '../context'

/**
 * Sprint 26: shared bot-side helpers for the banded parts model's
 * group-level "bridge" (decision 13) - every bot used to read a single
 * `car.components[id].condition` number per zone; now a "zone" is a group
 * of several real parts, so "how repaired is this group" and "repair it"
 * are worth one shared implementation instead of six near-identical ones.
 */

function minBandIndexInGroup(
  car: CarInstance,
  groupId: ComponentId,
  partIdsByGroup: SimContext['partIdsByGroup'],
): number {
  const parts = presentPartIdsInGroup(car, groupId, partIdsByGroup)
  if (parts.length === 0) return bandIndex('mint')
  // presentPartIdsInGroup already filters to installed !== null.
  return Math.min(...parts.map((id) => bandIndex(car.parts[id].installed!.band)))
}

/** Whether every present part in `groupId` is at or above `minBand` - the
 * bot-side "is this zone good enough" check, replacing the old flat
 * `condition >= REPAIR_THRESHOLD`. `'mint'` is the exact equivalent of the
 * old `>= 90` (economy.json's own migration threshold for `mint` is 90). */
export function isGroupAtLeast(
  car: CarInstance,
  groupId: ComponentId,
  minBand: ConditionBand,
  partIdsByGroup: SimContext['partIdsByGroup'],
): boolean {
  const minIndex = bandIndex(minBand)
  return presentPartIdsInGroup(car, groupId, partIdsByGroup).every(
    (id) => bandIndex(car.parts[id].installed!.band) >= minIndex,
  )
}

/** The group among `groupIds` with the worst (lowest-band) present part -
 * mirrors the old `.reduce` "pick the worst component" pattern. */
export function worstGroup(
  car: CarInstance,
  groupIds: readonly ComponentId[],
  partIdsByGroup: SimContext['partIdsByGroup'],
): ComponentId {
  return groupIds.reduce((worst, id) =>
    minBandIndexInGroup(car, id, partIdsByGroup) < minBandIndexInGroup(car, worst, partIdsByGroup)
      ? id
      : worst,
  )
}

/**
 * Queues a group repair-to-mint job for `carId`+`groupId`, sized for real by
 * `planGroupRepair` (bands.ts) - the labor AND yen cost the group's actual
 * work needs, not a flat per-bot constant. A no-op (returns 0 slots used)
 * when there is nothing left to repair in the group (already mint, or every
 * present part is scrap) - the caller's existing "nothing to do, try
 * something else" fallback handles that exactly like any other blocked
 * action. Predicts the job id the same way every bot already does
 * (`job-${day}-${index}`).
 */
export function queueGroupRepair(
  state: GameState,
  carId: string,
  groupId: ComponentId,
  car: CarInstance,
  actions: DayActions,
  context: SimContext,
  laborBudget: number,
): number {
  // Sprint 93 (the band ceiling): repair only climbs to the group's own
  // tool-tier ceiling, so target the clamped band (fine at tier-1, mint once the
  // tier-2 machine is owned) rather than an unconditional `mint`. This keeps the
  // sizing plan, the queued spec, and the eventual `repairJobGate` all agreeing
  // on the same target - an unclamped `mint` spec would simply be refused
  // (`tool-tier`) at a tier-1 group and waste the action.
  const targetBand = clampRepairTarget(
    'mint',
    repairCeilingForLevel(repairLevelForGroup(state.toolTiers, groupId), context.economy),
  )
  const plan = planGroupRepair(
    car,
    groupId,
    targetBand,
    state.toolTiers,
    context.partIdsByGroup,
    context.partsById,
    context.partsTaxonomyById,
    context.economy.restoration.repairStepFraction,
  )
  if (plan.partIds.length === 0) return 0
  const jobIndex = actions.createJobs.length
  actions.createJobs.push({
    carInstanceId: carId,
    kind: 'repair-zone',
    componentId: groupId,
    targetBand,
    laborSlotsRequired: plan.laborSlotsRequired,
  })
  const slots = Math.min(plan.laborSlotsRequired, laborBudget)
  actions.laborAssignments.push({ jobId: `job-${state.day}-${jobIndex}`, laborSlots: slots })
  return slots
}
