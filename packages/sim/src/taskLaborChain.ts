import type { CarInstance, CarPartId, ConditionBand, GameState } from '@midnight-garage/content'
import {
  assemblyMachineGateGroup,
  externalBlockersFor,
  removeAssemblyLaborSlotsFor,
} from './assemblies'
import { planPartRepair } from './bands'
import type { SimContext } from './context'
import {
  installLaborSlotsFor,
  machineGateGroupFor,
  machineLaborMultiplier,
  occupiedBlockers,
  removeLaborSlotsFor,
} from './jobs'

/**
 * What a task's target asks of the part currently in `carPartId`'s slot: a
 * `ConditionBand` climbs the part already there (the bench-repair route),
 * `'install'` swaps a fresh one in (the buy-new route) - the same fork
 * `serviceJobCostBreakdown` already makes per task.
 */
export type TaskLaborChainTarget = ConditionBand | 'install'

/**
 * The labour a task's whole physical chain demands, broken into the stages
 * a service job actually walks on the shop floor. `totalPoints` is energy,
 * the unit every primitive this composes already works in;
 * `totalSlots` divides by `economy.energy.pointsPerLabour` for the market
 * labour rate a payout prices against (`serviceJobs.laborRateYen`).
 */
export interface TaskLaborChainBreakdown {
  /** Clearing every occupied slot that blocks access, and putting each one
   * back once the real work is done - removal is charged at that blocker's
   * own gate; the refit-back is free at the shipped `refitUnchangedMember`
   * rate, since the blocker itself never changes here. */
  blockerPoints: number
  /** Pulling the target part off: an assembly pull when it's a member of
   * one of the three sub-assemblies (the whole thing comes off together,
   * matching `resolveRemoveAssembly`), a plain removal otherwise. Zero when
   * the slot is already empty, or when the slot never leaves the car at
   * all (the three fixed body carriers). */
  removalPoints: number
  /** The bench work itself: a repair climb for a repair-route task, the
   * (currently free) bench swap-in for a buy-new part going into an
   * assembly's bench container, or zero for a buy-new part outside an
   * assembly (there is no bench step to charge - the part goes straight
   * into the slot on refit). */
  workPoints: number
  /** Refitting the part so the customer's car actually improves: the
   * slot's own install rate, gated exactly as the real refit/install job
   * would be (an assembly member reads its assembly's own gate, matching
   * `resolveRefitAssembly`'s multiplier; a loose part reads its own
   * 'install' gate). Always charged - a delivered task always improves its
   * slot, never a like-for-like refit. */
  refitPoints: number
  /** blockerPoints + removalPoints + workPoints + refitPoints. */
  totalPoints: number
  /** totalPoints converted to labour slots. */
  totalSlots: number
}

function totals(
  parts: Omit<TaskLaborChainBreakdown, 'totalPoints' | 'totalSlots'>,
  pointsPerLabour: number,
): TaskLaborChainBreakdown {
  const totalPoints =
    parts.blockerPoints + parts.removalPoints + parts.workPoints + parts.refitPoints
  return { ...parts, totalPoints, totalSlots: totalPoints / pointsPerLabour }
}

/**
 * The bench-repair climb on the part currently installed at `carPartId`,
 * always at repair level 1 - the market baseline a customer quote has
 * always priced work at, independent of the shop's own tool tier. Zero when
 * nothing is installed there, or the catalog can't resolve its price
 * (defensive; never happens for real content).
 */
function repairClimbPoints(
  car: CarInstance,
  carPartId: CarPartId,
  targetBand: ConditionBand,
  context: SimContext,
): number {
  const installed = car.parts[carPartId]?.installed
  const entry = context.partsTaxonomyById[carPartId]
  const catalogPart = installed ? context.partsById[installed.partId] : undefined
  if (!installed || !entry || !catalogPart) return 0
  const { repairStepFraction } = context.economy.restoration
  const { energyPerBandStepByToolTier } = context.economy.energy
  return planPartRepair(
    installed.band,
    targetBand,
    1,
    entry,
    catalogPart.priceYen,
    repairStepFraction,
    energyPerBandStepByToolTier,
  ).laborSlotsRequired
}

/**
 * The full labour chain one task's target slot demands: every external
 * blocker cleared and put back, the part (or its whole assembly, when it's
 * a member) pulled, the bench work, and the refit that actually delivers
 * the improvement - composed entirely from the existing per-slot and
 * per-assembly primitives (`jobs.ts`, `assemblies.ts`, `bands.ts`), each
 * charged at its own machine-gate multiplier for the shop `state` describes.
 *
 * `state` is the REAL current shop, not a hypothetical one: a customer pays
 * for the shop they walked into, so every gated step here prices at
 * whatever multiplier that shop actually faces right now
 * (`machineLaborMultiplier`) - base rate with the group's machine owned or
 * hired today, `machineShopAssist.machinelessLaborMultiplier` without it.
 *
 * A member of one of the three sub-assemblies (`assemblies.json`) prices the
 * ASSEMBLY's own pull and refit, since the whole thing comes off the car
 * together, not just its own slot; its external blockers are the
 * assembly's own (`externalBlockersFor`), not just this one member's direct
 * `blockedBy`. A non-member slot prices its own plain removal, install, and
 * direct blockers.
 *
 * A slot with nothing installed has nothing to remove and no blockers worth
 * clearing for it - `serviceJobCostBreakdown` never asks for a repair route
 * on an empty slot, so only a buy-new task ever reaches this branch, and it
 * charges just the fresh part going straight in.
 *
 * The three fixed body carriers (`chassis`, `bodywork`, `paint`,
 * `removable: false`) never leave the car: no blockers, no pull, no refit -
 * just the in-place work itself (a repair climb, or a straight replace for
 * a buy-new task, mirroring `applyJobToCar`'s replace-in-place branch).
 */
export function taskLaborChain(
  car: CarInstance,
  carPartId: CarPartId,
  target: TaskLaborChainTarget,
  context: SimContext,
  state: GameState,
): TaskLaborChainBreakdown {
  const { pointsPerLabour, actionPoints } = context.economy.energy
  const entry = context.partsTaxonomyById[carPartId]
  if (!entry) {
    return totals(
      { blockerPoints: 0, removalPoints: 0, workPoints: 0, refitPoints: 0 },
      pointsPerLabour,
    )
  }

  if (!entry.removable) {
    const workPoints =
      target === 'install'
        ? installLaborSlotsFor(carPartId, context) *
          machineLaborMultiplier(machineGateGroupFor(carPartId, 'install', context), state, context)
        : repairClimbPoints(car, carPartId, target, context)
    return totals(
      { blockerPoints: 0, removalPoints: 0, workPoints, refitPoints: 0 },
      pointsPerLabour,
    )
  }

  const installed = car.parts[carPartId]?.installed ?? null
  const assemblyDef = context.assemblies.find((a) => a.members.includes(carPartId))

  if (!installed) {
    if (target !== 'install') {
      return totals(
        { blockerPoints: 0, removalPoints: 0, workPoints: 0, refitPoints: 0 },
        pointsPerLabour,
      )
    }
    const refitPoints =
      installLaborSlotsFor(carPartId, context) *
      machineLaborMultiplier(machineGateGroupFor(carPartId, 'install', context), state, context)
    return totals(
      { blockerPoints: 0, removalPoints: 0, workPoints: 0, refitPoints },
      pointsPerLabour,
    )
  }

  const blockerIds = assemblyDef
    ? externalBlockersFor(assemblyDef, context).filter((b) => car.parts[b].installed !== null)
    : occupiedBlockers(car, carPartId, context)
  let blockerPoints = 0
  for (const blockerId of blockerIds) {
    blockerPoints +=
      removeLaborSlotsFor(blockerId, context) *
      machineLaborMultiplier(machineGateGroupFor(blockerId, 'remove', context), state, context)
    // Putting a blocker back is always the unchanged-member rate: this
    // chain never alters a blocker itself, only clears it out of the way.
    blockerPoints +=
      actionPoints.refitUnchangedMember *
      machineLaborMultiplier(machineGateGroupFor(blockerId, 'install', context), state, context)
  }

  const removalPoints = assemblyDef
    ? removeAssemblyLaborSlotsFor(car, assemblyDef, context) *
      machineLaborMultiplier(assemblyMachineGateGroup(assemblyDef, context), state, context)
    : removeLaborSlotsFor(carPartId, context) *
      machineLaborMultiplier(machineGateGroupFor(carPartId, 'remove', context), state, context)

  const workPoints =
    target === 'install'
      ? assemblyDef
        ? actionPoints.benchFitMember
        : 0
      : repairClimbPoints(car, carPartId, target, context)

  const refitGateGroup = assemblyDef
    ? assemblyMachineGateGroup(assemblyDef, context)
    : machineGateGroupFor(carPartId, 'install', context)
  const refitPoints =
    installLaborSlotsFor(carPartId, context) *
    machineLaborMultiplier(refitGateGroup, state, context)

  return totals({ blockerPoints, removalPoints, workPoints, refitPoints }, pointsPerLabour)
}
