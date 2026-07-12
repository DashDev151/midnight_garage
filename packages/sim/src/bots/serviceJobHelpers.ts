import type {
  ComponentId,
  GameState,
  Job,
  ServiceJob,
  ServiceJobTask,
} from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { planGroupRepair } from '../bands'
import { INSTALL_LABOR_SLOTS } from '../constants'
import type { SimContext } from '../context'
import { gradeAtLeast, partFitsCar } from '../parts'
import { isServiceTaskDone, serviceJobCostBreakdown } from '../serviceJobs'
import { ensureEquipmentFor, type EquipmentBudget } from './equipmentHelpers'

/**
 * Sprint 29: shared bot-side helpers for the multi-task service-job
 * framework - every bot that touches service jobs used to work a single
 * repair-only `work` per job; now a job carries a themed list of tasks that
 * can mix repair and install, so "is this offer worth taking" and "advance
 * every unfinished task" are worth one shared implementation instead of two
 * near-identical ones (`serviceGrinder.ts`, `competentPolicy.ts`).
 */

/** First-pass floor for the accept decision below - deliberately modest:
 * the profitability invariant (`serviceJobs.ts`'s `deriveServiceJobPayoutYen`
 * doc comment) already guarantees a real margin on every generated offer, so
 * this mostly filters out the rare degenerate case rather than doing the
 * real profitability work itself. Openly tunable once real balance-harness
 * numbers exist, same as every other bot policy constant in this directory. */
export const MIN_PROFIT_PER_LABOR_SLOT_YEN = 3000

/**
 * Expected profit per labor slot for an offer still on the board - payout
 * minus material cost (the same `serviceJobCostBreakdown` an offer's own
 * payout derives from), divided by the labor its task list nominally takes.
 * The bots' accept threshold (Sprint 29 DoD: "accept if expected profit per
 * labor slot clears a threshold").
 */
export function expectedProfitPerLaborSlot(offer: ServiceJob, context: SimContext): number {
  const model = context.modelsById[offer.car.modelId]
  if (!model) return 0
  const { taskCostYen, laborSlots } = serviceJobCostBreakdown(
    offer.tasks,
    offer.car,
    model,
    context,
  )
  return (offer.payoutYen - taskCostYen) / Math.max(1, laborSlots)
}

/** Every repair task's group, deduplicated - the equipment a bot would need
 * to own (or queue buying this same tick) before it could actually accept
 * this offer (`resolveAcceptServiceJob`'s own gate, mirrored here for the
 * bot's own decision of whether to bother trying). */
function repairGroupsNeeded(tasks: readonly ServiceJobTask[], context: SimContext): ComponentId[] {
  const groups = new Set<ComponentId>()
  for (const task of tasks) {
    if (task.action !== 'repair') continue
    const group = context.partsTaxonomyById[task.carPartId]?.group
    if (group) groups.add(group)
  }
  return [...groups]
}

/**
 * Whether a bot can accept `offer` right now - every repair task's group is
 * either already equipped or gets queued this same tick (Sprint 13's
 * equipment-buy-then-accept pattern, extended across a multi-task offer's
 * whole task list instead of one single group). An install-only offer
 * always passes trivially (replace never needs equipment).
 */
export function canEquipForOffer(
  state: GameState,
  offer: ServiceJob,
  actions: DayActions,
  context: SimContext,
  equipBudget: EquipmentBudget,
  cashBufferMultiplier: number,
): boolean {
  return repairGroupsNeeded(offer.tasks, context).every((group) =>
    ensureEquipmentFor(state, group, actions, context, equipBudget, cashBufferMultiplier),
  )
}

export interface ServiceJobWorkResult {
  laborSlotsUsed: number
  cashCommittedYen: number
}

/** An open job matching one specific task (car + kind + exact carPartId) -
 * a multi-task service job can have several tasks in progress at once now,
 * unlike the old single-`work` model's "one job per car." */
function findExistingTaskJob(
  state: GameState,
  carId: string,
  task: ServiceJobTask,
): Job | undefined {
  const kind = task.action === 'repair' ? 'repair-zone' : 'install-part'
  return state.jobs.find(
    (job) => job.carInstanceId === carId && job.kind === kind && job.carPartId === task.carPartId,
  )
}

/**
 * Queues whatever's needed to advance every not-yet-done task on one active
 * service job's car, against a shared per-tick labor/cash budget (Sprint 29:
 * extends the repair-only bot loop to also buy-and-install).
 *
 * An install task's part purchase and its install job are DELIBERATELY split
 * across two different ticks, never queued the same day: `advanceDay`
 * resolves `createJobs` (step 1) BEFORE `buyParts` (step 1b), so a job
 * created this same tick, referencing a partInstanceId this same tick's
 * `buyParts` hasn't resolved yet, would fail `installFitGate`'s inventory
 * lookup every time (`state.partInventory` doesn't have it yet) - a real,
 * previously-undiscovered bug in `investor.ts`'s own "predict the id"
 * approach (that file's own doc comment describes the id prediction but
 * never actually verifies the same-tick job succeeds; it doesn't - see
 * `serviceJobHelpers.test.ts`'s regression coverage). Fixed here by
 * checking `state.partInventory` FIRST for an already-owned, still-uninstalled
 * fitting part (bought on a PRIOR tick, genuinely present in this snapshot)
 * and only creating the install job against that; if nothing fits yet, this
 * call buys the cheapest fitting part that clears `minGrade` (`gradeAtLeast`)
 * and stops there for this task - the install job itself queues on
 * whichever later tick finds that purchase sitting in inventory.
 */
export function queueServiceJobTasks(
  state: GameState,
  serviceJob: ServiceJob,
  actions: DayActions,
  context: SimContext,
  laborBudget: number,
  cashCommittedYen: number,
  cashBufferMultiplier: number,
): ServiceJobWorkResult {
  const car = serviceJob.car
  const model = context.modelsById[car.modelId]
  let remainingLabor = laborBudget
  let cashCommitted = cashCommittedYen

  for (const task of serviceJob.tasks) {
    if (remainingLabor <= 0) break
    if (isServiceTaskDone(car, task, context.partsById)) continue

    const existing = findExistingTaskJob(state, car.id, task)
    if (existing) {
      const need = existing.laborSlotsRequired - existing.laborSlotsSpent
      if (need <= 0) continue
      const slots = Math.min(need, remainingLabor)
      actions.laborAssignments.push({ jobId: existing.id, laborSlots: slots })
      remainingLabor -= slots
      continue
    }

    const group = context.partsTaxonomyById[task.carPartId]?.group
    if (!group) continue

    if (task.action === 'repair') {
      const plan = planGroupRepair(
        car,
        group,
        task.targetBand,
        state.ownedEquipmentIds,
        context.partIdsByGroup,
        context.partsTaxonomyById,
        context.equipmentById,
        task.carPartId,
      )
      if (plan.partIds.length === 0) continue
      const jobIndex = actions.createJobs.length
      actions.createJobs.push({
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: group,
        targetBand: task.targetBand,
        carPartId: task.carPartId,
        laborSlotsRequired: plan.laborSlotsRequired,
      })
      const slots = Math.min(plan.laborSlotsRequired, remainingLabor)
      actions.laborAssignments.push({ jobId: `job-${state.day}-${jobIndex}`, laborSlots: slots })
      remainingLabor -= slots
      continue
    }

    if (!model) continue

    // Sprint 32's stock-baseline model fills every real slot by default, so
    // an install task's target is usually occupied (by the stock part, or
    // anything else that didn't already satisfy `isServiceTaskDone` above) -
    // `installFitGate` refuses to install over an occupied slot (by design,
    // never a silent overwrite), so this queues the same remove-first step
    // the player's own UI requires (Remove, then Replace) and stops there
    // for today; the buy/install steps below only ever run once the slot is
    // genuinely empty.
    if (car.parts[task.carPartId].installed !== null) {
      actions.removeParts.push({ carInstanceId: car.id, carPartId: task.carPartId })
      continue
    }

    // A part bought on a PRIOR tick is genuinely sitting in this snapshot's
    // inventory - install it now (real id, passes installFitGate cleanly).
    const ownedFitting = state.partInventory.find((instance) => {
      if (instance.band === 'scrap') return false
      const catalogPart = context.partsById[instance.partId]
      return (
        !!catalogPart &&
        partFitsCar(catalogPart, model, group, context.partsTaxonomyById, task.carPartId) &&
        gradeAtLeast(catalogPart.grade, task.minGrade)
      )
    })
    if (ownedFitting) {
      const jobIndex = actions.createJobs.length
      actions.createJobs.push({
        carInstanceId: car.id,
        kind: 'install-part',
        componentId: group,
        partInstanceId: ownedFitting.id,
        carPartId: task.carPartId,
        laborSlotsRequired: INSTALL_LABOR_SLOTS,
      })
      const slots = Math.min(INSTALL_LABOR_SLOTS, remainingLabor)
      actions.laborAssignments.push({ jobId: `job-${state.day}-${jobIndex}`, laborSlots: slots })
      remainingLabor -= slots
      continue
    }

    // Nothing owned yet that fits - buy the cheapest option; the install
    // itself queues on a later tick, once this purchase has actually landed.
    const fitting = context.parts
      .filter(
        (part) =>
          partFitsCar(part, model, group, context.partsTaxonomyById, task.carPartId) &&
          gradeAtLeast(part.grade, task.minGrade),
      )
      .sort((a, b) => a.priceYen - b.priceYen)
    const part = fitting[0]
    if (!part || state.cashYen < (cashCommitted + part.priceYen) * cashBufferMultiplier) continue
    actions.buyParts.push({ partId: part.id, deliverySpeed: 'express' })
    cashCommitted += part.priceYen
  }

  return {
    laborSlotsUsed: laborBudget - remainingLabor,
    cashCommittedYen: cashCommitted,
  }
}
