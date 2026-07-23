import type { GameState, Job, ServiceJob, ServiceJobTask } from '@midnight-garage/content'
import type { DayActions } from '../actions'
import { planGroupRepair } from '../bands'
import type { SimContext } from '../context'
import { installLaborSlotsFor } from '../jobs'
import { gradeAtLeast, partFitsCar } from '../parts'
import { isServiceTaskDone, serviceJobCostBreakdown } from '../serviceJobs'

/**
 * Shared bot-side helpers for the multi-task service-job framework: a job
 * carries a themed list of tasks that can mix repair and install, so "is
 * this offer worth taking" and "advance every unfinished task" are one
 * shared implementation rather than two near-identical ones
 * (`serviceGrinder.ts`, `competentPolicy.ts`).
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
 * payout derives from), divided by the labor its task list nominally
 * takes. The bots' accept threshold: accept if this clears
 * `MIN_PROFIT_PER_LABOR_SLOT_YEN`.
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

export interface ServiceJobWorkResult {
  laborSlotsUsed: number
  cashCommittedYen: number
}

/** An open job matching one specific task (car + kind + exact carPartId) -
 * a multi-task service job can have several tasks in progress at once now,
 * unlike the old single-`work` model's "one job per car." A grade-requirement
 * task (formerly `install`) resolves via the buy/install route; a band-only
 * task (formerly `repair`) resolves via the bench-repair route. */
function findExistingTaskJob(
  state: GameState,
  carId: string,
  task: ServiceJobTask,
): Job | undefined {
  const kind = task.requirement.minGrade ? 'install-part' : 'repair-zone'
  return state.jobs.find(
    (job) =>
      job.carInstanceId === carId &&
      job.kind === kind &&
      job.carPartId === task.requirement.carPartId,
  )
}

/**
 * Queues whatever's needed to advance every not-yet-done task on one
 * active service job's car, against a shared per-tick labor/cash budget.
 *
 * An install task's part purchase and its install job are DELIBERATELY
 * split across two different ticks, never queued the same day:
 * `advanceDay` resolves `createJobs` before `buyParts`, so a job created
 * this same tick, referencing a partInstanceId this same tick's
 * `buyParts` hasn't resolved yet, would fail `installFitGate`'s inventory
 * lookup (`state.partInventory` doesn't have it yet). This checks
 * `state.partInventory` FIRST for an already-owned, still-uninstalled
 * fitting part (bought on a PRIOR tick) and only creates the install job
 * against that; if nothing fits yet, this call buys the cheapest fitting
 * part that clears `minGrade` (`gradeAtLeast`) and stops there for this
 * task - the install job itself queues on whichever later tick finds
 * that purchase sitting in inventory.
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
    if (isServiceTaskDone(car, task, context)) continue

    const existing = findExistingTaskJob(state, car.id, task)
    if (existing) {
      const need = existing.laborSlotsRequired - existing.laborSlotsSpent
      if (need <= 0) continue
      const slots = Math.min(need, remainingLabor)
      actions.laborAssignments.push({ jobId: existing.id, laborSlots: slots })
      remainingLabor -= slots
      continue
    }

    const { carPartId, minBand, minGrade } = task.requirement
    const group = context.partsTaxonomyById[carPartId]?.group
    if (!group) continue
    if (!model) continue

    if (!minGrade) {
      const plan = planGroupRepair(
        car,
        group,
        minBand,
        state.toolTiers,
        context.partIdsByGroup,
        context.partsById,
        context.partsTaxonomyById,
        context.economy.restoration.repairStepFraction,
        context.economy.energy.energyPerBandStepByToolTier,
        carPartId,
      )
      if (plan.partIds.length === 0) continue
      const jobIndex = actions.createJobs.length
      actions.createJobs.push({
        carInstanceId: car.id,
        kind: 'repair-zone',
        componentId: group,
        targetBand: minBand,
        carPartId,
        laborSlotsRequired: plan.laborSlotsRequired,
      })
      const slots = Math.min(plan.laborSlotsRequired, remainingLabor)
      actions.laborAssignments.push({ jobId: `job-${state.day}-${jobIndex}`, laborSlots: slots })
      remainingLabor -= slots
      continue
    }

    // The stock-baseline model fills every real slot by default, so a
    // grade-requirement task's target is usually occupied (by the stock
    // part, or anything else that didn't already satisfy `isServiceTaskDone`
    // above) - `installFitGate` refuses to install over an occupied slot (by
    // design, never a silent overwrite), so this queues the same
    // remove-first step the player's own UI requires (Remove, then Replace)
    // and stops there for today; the buy/install steps below only ever run
    // once the slot is genuinely empty.
    if (car.parts[carPartId].installed !== null) {
      actions.removeParts.push({ carInstanceId: car.id, carPartId })
      continue
    }

    // A part bought on a PRIOR tick is genuinely sitting in this snapshot's
    // inventory - install it now (real id, passes installFitGate cleanly).
    const ownedFitting = state.partInventory.find((instance) => {
      if (instance.band === 'scrap') return false
      const catalogPart = context.partsById[instance.partId]
      return (
        !!catalogPart &&
        partFitsCar(catalogPart, model, group, context.partsTaxonomyById, carPartId) &&
        gradeAtLeast(catalogPart.grade, minGrade)
      )
    })
    if (ownedFitting) {
      const jobIndex = actions.createJobs.length
      actions.createJobs.push({
        carInstanceId: car.id,
        kind: 'install-part',
        componentId: group,
        partInstanceId: ownedFitting.id,
        carPartId,
        laborSlotsRequired: installLaborSlotsFor(carPartId, context),
      })
      const slots = Math.min(installLaborSlotsFor(carPartId, context), remainingLabor)
      actions.laborAssignments.push({ jobId: `job-${state.day}-${jobIndex}`, laborSlots: slots })
      remainingLabor -= slots
      continue
    }

    // Nothing owned yet that fits - buy the cheapest option; the install
    // itself queues on a later tick, once this purchase has actually landed.
    const fitting = context.parts
      .filter(
        (part) =>
          partFitsCar(part, model, group, context.partsTaxonomyById, carPartId) &&
          gradeAtLeast(part.grade, minGrade),
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
