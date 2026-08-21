import type { GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import type { SimContext } from '../context'
import { considerToolUpgrade, toolUpgradeBudget } from './toolUpgradeHelpers'
import { energyMax } from '../laborSlots'
import { isServiceWorkDone, toolGateSummary } from '../serviceJobs'
import { toolLevelsFor } from '../toolLines'
import {
  expectedProfitPerLaborSlot,
  MIN_PROFIT_PER_LABOR_SLOT_YEN,
  queueServiceJobTasks,
} from './serviceJobHelpers'

/** No other spend competes for cash, so a light margin is enough to stay solvent. */
const CASH_BUFFER_MULTIPLIER = 1.1

/** This bot invests in a tool line exactly when a profitable offer on
 * the board needs the next tier - a purposeful, job-driven upgrade,
 * buffered lighter than the car-flipping bots since jobs are its only
 * draw on cash beyond parts. */
const TOOL_UPGRADE_CASH_BUFFER_MULTIPLIER = 1.5

/**
 * Takes service jobs and actually works them - the player-hands version of
 * the Act 1 floor (never buys a car, never speculatively buys parts
 * inventory). A customer's car sits in the shop; the bot moves it into the
 * (starting: one) service bay, works every task on it, and - once all of
 * them are done - moves it back out to free the bay for the next one. It
 * never clicks "Complete Job" (that's a store-only, player-hands action); a
 * finished car just waits in the shop until the deadline backstop pays out
 * and sends it home, matching how a real headless bot has no click to make.
 * Exists so the balance harness can check that a broke player can survive
 * on jobs alone.
 *
 * Acceptance rule: an offer with no blocked task is accepted outright; a
 * blocked offer (some task needs a shop this garage doesn't own yet)
 * triggers a same-tick `considerToolUpgrade` toward its first blocked
 * task's group - upgrades resolve before accepts in advanceDay's step
 * order, so a buffered upgrade really does unlock the same-tick accept.
 * Ignores the `rng` arg of BotStrategy (fewer params satisfies the type).
 */
export function serviceGrinderStrategy(state: GameState, context: SimContext): DayActions {
  const actions = emptyDayActions()
  let laborBudget = energyMax(state, context.economy)
  const bayBudget = serviceBayBudget(state)
  const upgradeBudget = toolUpgradeBudget()
  let cashCommitted = 0

  for (const serviceJob of state.activeServiceJobs) {
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
  // profitable car into the shop - it moves into the bay and starts work
  // from the following day, once it's actually a real active job. An
  // unblocked offer is accepted outright; a blocked-on-a-shop offer is
  // accepted only when the upgrade itself gets queued this same tick (it
  // resolves before the accept in advanceDay's order) - otherwise the bot
  // looks at the next profitable offer rather than wasting the day on one
  // it can't take yet.
  if (laborBudget > 0 && bayBudget.free > 0) {
    for (const offer of state.serviceJobOffers) {
      if (expectedProfitPerLaborSlot(offer, context) < MIN_PROFIT_PER_LABOR_SLOT_YEN) continue
      const gate = toolGateSummary(offer.tasks, toolLevelsFor(state, context), context)
      let canAcceptNow = !gate.blocked
      if (!canAcceptNow) {
        const group = gate.blockedGroups[0]
        if (group) {
          canAcceptNow = considerToolUpgrade(
            state,
            group,
            actions,
            context,
            upgradeBudget,
            TOOL_UPGRADE_CASH_BUFFER_MULTIPLIER,
          )
        }
      }
      if (canAcceptNow) {
        actions.acceptServiceJobs.push({ offerId: offer.id })
        break
      }
    }
  }

  return actions
}
