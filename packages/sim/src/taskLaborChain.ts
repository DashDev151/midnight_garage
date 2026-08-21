import {
  WORKBENCH,
  type CarInstance,
  type CarPartId,
  type RepairJobKind,
} from '@midnight-garage/content'
import { externalBlockersFor, removeAssemblyLaborSlotsFor } from './assemblies'
import { bodyPartRepairLabourPoints, isBodyDerivedPart } from './bodyPipeline'
import type { SimContext } from './context'
import { installLaborSlotsFor, occupiedBlockers, removeLaborSlotsFor } from './jobs'
import { targetBandFor } from './repairJobs'

/**
 * What a task's target asks of the part currently in `carPartId`'s slot: a
 * `RepairJobKind` works the part already there on the bench (the repair
 * route), `'install'` swaps a fresh one in (the buy-new route) - the same
 * fork `serviceJobCostBreakdown` already makes per task. The job KIND rather
 * than a band, because the bench prices a job's recipe rather than a climb:
 * the caller resolves the band it wants into the smallest job that reaches
 * it (`partFixCostYen`, repairJobs.ts) and passes that job here.
 */
export type TaskLaborChainTarget = RepairJobKind | 'install'

/**
 * The labour a task's whole physical chain demands, broken into the stages
 * a service job actually walks on the shop floor. `totalPoints` is energy,
 * the unit every primitive this composes already works in;
 * `totalSlots` divides by `economy.energy.pointsPerLabour` for the market
 * labour rate a payout prices against (`serviceJobs.laborRateYen`).
 */
export interface TaskLaborChainBreakdown {
  /** Clearing every occupied slot that blocks access, and putting each one
   * back once the real work is done - the blocker's own removal figure plus
   * the shipped `refitUnchangedMember` rate, since the blocker itself never
   * changes here. */
  blockerPoints: number
  /** Pulling the target part off: an assembly pull when it's a member of
   * one of the three sub-assemblies (the whole thing comes off together,
   * matching `resolveRemoveAssembly`), a plain removal otherwise. Zero when
   * the slot is already empty, or when the slot never leaves the car at
   * all (the three fixed body carriers). */
  removalPoints: number
  /** The work itself: the repair job's own recipe steps at
   * `energy.energyPerStepPoints` for a repair-route task, the (paid) bench
   * swap-in for a buy-new part going into an assembly's bench container, or
   * zero for a buy-new part outside an assembly (there is no bench step to
   * charge - the part goes straight into the slot on refit). A repair-route
   * task on a zone-derived body carrier has no bench job at all and prices the
   * body pipeline's own stages instead (`inPlaceRepairPoints`). */
  workPoints: number
  /** Refitting the part so the customer's car actually improves: an
   * assembly member prices the flat `refitAssembly` figure (matching
   * `resolveRefitAssembly` exactly - a customer quote and the player's own
   * refit can never drift); a loose part prices its own class-based install
   * rate. Always charged - a delivered task always improves its slot, never
   * a like-for-like refit. */
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
 * The bench job itself, priced as what a job IS: its recipe's steps at the
 * flat `energy.energyPerStepPoints`, never slog-multiplied - the chain quotes
 * a garage that hires whatever it does not own, and a hired step costs base
 * energy.
 *
 * Zero for a part with no recipe ladder at all (the two zone-derived body
 * carriers): the bench has no job for them, and `inPlaceRepairPoints` below
 * prices their work off the body pipeline instead.
 */
function jobStepPoints(carPartId: CarPartId, kind: RepairJobKind, context: SimContext): number {
  const steps = WORKBENCH.recipes[carPartId]?.[kind]
  return steps ? steps.length * context.economy.energy.energyPerStepPoints : 0
}

/**
 * The in-place work a fixed carrier's repair route asks for, from whichever
 * model actually holds that carrier's work.
 *
 * `chassis` is bench work and prices as a recipe's steps. The two zone-derived
 * carriers have no recipe ladder at all, because the body pipeline works them a
 * STAGE at a time, so they price through the pipeline's own zone walk
 * (`bodyPartRepairLabourPoints`, bodyPipeline.ts) - the sibling of the money
 * bill `bands.ts` already routes them through, off the same walk, so a quote
 * charges for exactly the stages the body bay would work. Only the zones
 * genuinely short of the target band run a stage, so this measures a distance:
 * one dented corner quotes a fraction of a shell needing all nine.
 *
 * The target band is the one the job kind lands on (`targetBandFor`), which is
 * what keeps the caller's chosen job and the stages priced here the same piece
 * of work: `serviceJobCostBreakdown` resolves the band a task asks for into the
 * smallest job reaching it, and this resolves that job straight back.
 *
 * A car not on the zone model has no zones to walk and so no stages to charge.
 * Every generated car carries `zoneState`, so that is the shape a quoted car
 * has rather than a case a quote leans on.
 */
function inPlaceRepairPoints(
  car: CarInstance,
  carPartId: CarPartId,
  kind: RepairJobKind,
  context: SimContext,
): number {
  if (!isBodyDerivedPart(carPartId)) return jobStepPoints(carPartId, kind, context)
  if (!car.zoneState) return 0
  return bodyPartRepairLabourPoints(
    carPartId,
    car.zoneState,
    targetBandFor(kind, context),
    context.economy.energy.bodyStagePoints,
  )
}

/**
 * The full labour chain one task's target slot demands: every external
 * blocker cleared and put back, the part (or its whole assembly, when it's
 * a member) pulled, the bench job, and the refit that actually delivers
 * the improvement - composed entirely from the existing per-slot and
 * per-assembly primitives (`jobs.ts`, `assemblies.ts`) plus the job model's
 * own step count.
 *
 * Every stage is priced at BASE rate, and the chain reads no shop state at
 * all. What a fix costs the market is a fixed assumption - a garage that hires
 * whatever it does not own - so a quote never moves with what is bolted to this
 * shop's wall.
 *
 * The chain is LABOUR and nothing else: it names no yen at all, not even for a
 * buried slot. Depth is a rate rather than a wall, and reaching a buried part
 * with no rig owned and no hire booked costs `toolHire.slogMultiplier` times
 * the labour and no money (`accessRoute`, jobs.ts), so no day has to be bought
 * to get at one. The only day the economy ever names is a step that cannot be
 * worked by hand at all (`forcedHireDayFor`, repairJobs.ts), and that day rides
 * on the bench job's own price rather than on this chain.
 *
 * A member of one of the three sub-assemblies (`assemblies.json`) prices the
 * ASSEMBLY's own pull and refit, since the whole thing comes off the car
 * together, not just its own slot; its external blockers are the
 * assembly's own (`externalBlockersFor`), not just this one member's direct
 * `blockedBy`. A non-member slot prices its own plain removal, install and
 * direct blockers.
 *
 * A slot with nothing installed has nothing to remove and no blockers worth
 * clearing for it - `serviceJobCostBreakdown` never asks for a repair route
 * on an empty slot, so only a buy-new task ever reaches this branch, and it
 * charges just the fresh part going straight in.
 *
 * The three fixed body carriers (`chassis`, `bodywork`, `paint`,
 * `removable: false`) never leave the car: no blockers, no pull, no refit -
 * just the in-place work itself (`inPlaceRepairPoints`: the bench job for
 * `chassis`, the body pipeline's stage walk for the two zone-derived carriers,
 * or a straight replace for a buy-new task, mirroring `applyJobToCar`'s
 * replace-in-place branch).
 */
export function taskLaborChain(
  car: CarInstance,
  carPartId: CarPartId,
  target: TaskLaborChainTarget,
  context: SimContext,
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
        ? installLaborSlotsFor(carPartId, context)
        : inPlaceRepairPoints(car, carPartId, target, context)
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
    return totals(
      {
        blockerPoints: 0,
        removalPoints: 0,
        workPoints: 0,
        refitPoints: installLaborSlotsFor(carPartId, context),
      },
      pointsPerLabour,
    )
  }

  const blockerIds = assemblyDef
    ? externalBlockersFor(assemblyDef, context).filter((b) => car.parts[b].installed !== null)
    : occupiedBlockers(car, carPartId, context)
  let blockerPoints = 0
  for (const blockerId of blockerIds) {
    // Putting a blocker back is always the unchanged-member rate: this
    // chain never alters a blocker itself, only clears it out of the way.
    blockerPoints += removeLaborSlotsFor(blockerId, context) + actionPoints.refitUnchangedMember
  }

  const removalPoints = assemblyDef
    ? removeAssemblyLaborSlotsFor(car, assemblyDef, context)
    : removeLaborSlotsFor(carPartId, context)

  const workPoints =
    target === 'install'
      ? assemblyDef
        ? actionPoints.benchFitMember
        : 0
      : jobStepPoints(carPartId, target, context)

  const refitPoints = assemblyDef
    ? actionPoints.refitAssembly
    : installLaborSlotsFor(carPartId, context)

  return totals({ blockerPoints, removalPoints, workPoints, refitPoints }, pointsPerLabour)
}
