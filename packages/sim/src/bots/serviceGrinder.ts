import type { GameState, ServiceJobTask } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import type { SimContext } from '../context'
import { equipmentBudget } from './equipmentHelpers'
import { availableLaborSlots } from '../laborSlots'
import { isServiceWorkDone } from '../serviceJobs'
import {
  canEquipForOffer,
  expectedProfitPerLaborSlot,
  MIN_PROFIT_PER_LABOR_SLOT_YEN,
  queueServiceJobTasks,
} from './serviceJobHelpers'

/** No other spend competes for cash, so a light margin is enough to stay solvent. */
const CASH_BUFFER_MULTIPLIER = 1.1

/**
 * Single-discipline: every task the same kind, never a mixed repair+install
 * job - keeps this bot distinct from a generalist. Repair-only was the whole
 * story pre-Sprint-33; install-only is now ALSO accepted because Sprint 33
 * decision 9's stricter equipment tiering (only the tire machine is ownable
 * at `unknown` reputation) means no tier-1 repair-only template is
 * completable with zero reputation - the sprint's own intended bootstrap
 * path is Replace-only work (decision 9's own text: "the job board's
 * actionable-or-one-purchase-away rule then follows naturally from what the
 * player can actually do with that single machine plus Replace-only work").
 * Without this, Service Grinder never earns its first point of reputation
 * and stays permanently inert - the exact Sprint 16 catch-22, reintroduced
 * by decision 9's stricter tiering unless mirrored here.
 */
function isSingleDisciplineJob(tasks: readonly ServiceJobTask[]): boolean {
  return (
    tasks.every((task) => task.action === 'repair') ||
    tasks.every((task) => task.action === 'install')
  )
}

/**
 * Takes single-discipline (repair-only or install-only) service jobs and
 * actually works them - the player-hands version of the Act 1 floor (never
 * buys a car, never speculatively buys parts inventory). A customer's car
 * sits in the shop; the bot moves it into the (starting: one) service bay,
 * works every task on it, and - once all of them are done - moves it back
 * out to free the bay for the next one. It never clicks "Complete Job"
 * (that's a store-only, player-hands action); a finished car just waits in
 * the shop until the deadline backstop pays out and sends it home, matching
 * how a real headless bot has no click to make. Exists so the balance
 * harness can check that a broke player can survive on jobs alone.
 *
 * Sprint 29: a job is now a themed list of tasks that can mix repair and
 * install (`serviceJobHelpers.ts`'s `queueServiceJobTasks` executes both
 * kinds) - this bot filters to `isSingleDisciplineJob` rather than working
 * around a mixed offer. Sprint 13: repair-only service jobs still require
 * owning the matching equipment (both to *accept* the offer and to actually
 * work it) - without equipment-purchase logic, this bot would have gone
 * fully inert the moment that shipped, since repair-only offers used to be
 * its only reason to exist. Buying equipment (never speculative parts
 * inventory) stays in scope for the same reason it always was.
 * Ignores the `rng` arg of BotStrategy (fewer params satisfies the type) but
 * now needs `context` for the equipment catalog.
 */
export function serviceGrinderStrategy(state: GameState, context: SimContext): DayActions {
  const actions = emptyDayActions()
  let laborBudget = availableLaborSlots(state)
  const bayBudget = serviceBayBudget(state)
  const equipBudget = equipmentBudget()
  let cashCommitted = 0

  for (const serviceJob of state.activeServiceJobs) {
    if (!isSingleDisciplineJob(serviceJob.tasks)) continue

    const carId = serviceJob.car.id

    // Finished? Free the bay for the next car - the deadline backstop pays
    // out and sends this one home once its due day arrives.
    if (isServiceWorkDone(serviceJob, context)) {
      if (state.serviceBayCarIds.includes(carId)) {
        actions.moveCars.push({ carInstanceId: carId, to: 'parking' })
        bayBudget.free += 1
      }
      continue
    }

    if (laborBudget <= 0) continue
    if (!claimServiceBay(state, carId, actions, bayBudget)) continue

    const result = queueServiceJobTasks(
      state,
      serviceJob,
      actions,
      context,
      laborBudget,
      cashCommitted,
      CASH_BUFFER_MULTIPLIER,
    )
    laborBudget -= result.laborSlotsUsed
    cashCommitted = result.cashCommittedYen
  }

  // Spare labor and an empty bay (after this tick's moves)? Bring the next
  // single-discipline car into the shop - it moves into the bay and starts
  // work from the following day, once it's actually a real active job.
  // Sprint 13: accepting now requires owning the offer's equipment
  // (resolveAcceptServiceJob refuses otherwise) - buy it first if affordable
  // (equipment purchases resolve before accepts in advanceDay's step order,
  // so a same-tick buy really does unlock this same-tick accept), else look
  // for a different offer this bot can actually equip for rather than
  // wasting the day on one it can't; an install-only offer trivially passes
  // (`canEquipForOffer` needs nothing for it). Sprint 29: additionally
  // requires a real expected profit per labor slot (the accept threshold
  // DoD, `serviceJobHelpers.ts`).
  if (laborBudget > 0 && bayBudget.free > 0) {
    const offer = state.serviceJobOffers.find(
      (o) =>
        isSingleDisciplineJob(o.tasks) &&
        expectedProfitPerLaborSlot(o, context) >= MIN_PROFIT_PER_LABOR_SLOT_YEN &&
        canEquipForOffer(state, o, actions, context, equipBudget, CASH_BUFFER_MULTIPLIER),
    )
    if (offer) actions.acceptServiceJobs.push({ offerId: offer.id })
  }

  return actions
}
