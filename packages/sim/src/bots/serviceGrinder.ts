import type { GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import type { SimContext } from '../context'
import { repairLaborSlotsFor } from '../constants'
import { equipmentBudget, ensureEquipmentFor } from './equipmentHelpers'
import { availableLaborSlots } from '../laborSlots'
import { isServiceWorkDone } from '../serviceJobs'

/** No other spend competes for cash, so a light margin is enough to stay solvent. */
const CASH_BUFFER_MULTIPLIER = 1.1

/**
 * Takes repair-only service jobs and actually works them - the player-hands
 * version of the Act 1 floor (never buys a car, never touches the parts
 * market). A customer's car sits in the shop; the bot moves it into the
 * (starting: one) service bay, creates a repair job on it, feeds it labor,
 * and - once the work is done - moves it back out to free the bay for the
 * next one. It never clicks "Complete Job" (that's a store-only, player-hands
 * action); a finished car just waits in the shop until the deadline backstop
 * pays out and sends it home, matching how a real headless bot has no click
 * to make. Exists so the balance harness can check that a broke player can
 * survive on jobs alone.
 *
 * Sprint 13: repair-only service jobs now require owning the matching
 * equipment (both to *accept* the offer and to actually work it) - without
 * equipment-purchase logic, this bot would have gone fully inert the moment
 * that shipped, since repair-only offers are its entire reason to exist.
 * Buying equipment is a deliberate, necessary exception to "never touches
 * the parts market" above (that line is about buying *parts*, not tools -
 * the tools are what make this bot's whole premise possible under the new
 * gate). Ignores the `rng` arg of BotStrategy (fewer params satisfies the
 * type) but now needs `context` for the equipment catalog.
 */
export function serviceGrinderStrategy(state: GameState, context: SimContext): DayActions {
  const actions = emptyDayActions()
  let laborBudget = availableLaborSlots(state)
  const bayBudget = serviceBayBudget(state)
  const equipBudget = equipmentBudget()

  const jobByCar = new Map(state.jobs.map((job) => [job.carInstanceId, job]))

  for (const serviceJob of state.activeServiceJobs) {
    if (serviceJob.work.kind !== 'repair') continue

    const carId = serviceJob.car.id

    // Finished? Free the bay for the next car - the deadline backstop pays
    // out and sends this one home once its due day arrives.
    if (isServiceWorkDone(serviceJob)) {
      if (state.serviceBayCarIds.includes(carId)) {
        actions.moveCars.push({ carInstanceId: carId, to: 'parking' })
        bayBudget.free += 1
      }
      continue
    }

    if (!claimServiceBay(state, carId, actions, bayBudget)) continue

    const componentId = serviceJob.work.componentId
    const existing = jobByCar.get(carId)

    // Ensure a repair job exists on the customer's car, then feed it labor.
    if (!existing) {
      if (laborBudget <= 0) continue
      const laborSlotsRequired = repairLaborSlotsFor(
        serviceJob.car.components[componentId].condition,
      )
      actions.createJobs.push({
        carInstanceId: carId,
        kind: 'repair-zone',
        componentId,
        laborSlotsRequired,
      })
      const slots = Math.min(laborSlotsRequired, laborBudget)
      // A job created this tick isn't in state.jobs yet; the sim assigns it
      // `job-${day}-${index}` in creation order, so mirror that id here.
      const jobId = `job-${state.day}-${actions.createJobs.length - 1}`
      actions.laborAssignments.push({ jobId, laborSlots: slots })
      laborBudget -= slots
      continue
    }

    if (laborBudget <= 0) continue
    const need = existing.laborSlotsRequired - existing.laborSlotsSpent
    if (need <= 0) continue
    const slots = Math.min(need, laborBudget)
    actions.laborAssignments.push({ jobId: existing.id, laborSlots: slots })
    laborBudget -= slots
  }

  // Spare labor and an empty bay (after this tick's moves)? Bring the next
  // repair-only car into the shop - it moves into the bay and starts work
  // from the following day, once it's actually a real active job. Sprint 13:
  // accepting now requires owning the offer's equipment (resolveAcceptServiceJob
  // refuses otherwise) - buy it first if affordable (equipment purchases
  // resolve before accepts in advanceDay's step order, so a same-tick buy
  // really does unlock this same-tick accept), else look for a different
  // offer this bot can actually equip for rather than wasting the day on one
  // it can't.
  if (laborBudget > 0 && bayBudget.free > 0) {
    const offer = state.serviceJobOffers.find(
      (o) =>
        o.work.kind === 'repair' &&
        ensureEquipmentFor(
          state,
          o.work.componentId,
          actions,
          context,
          equipBudget,
          CASH_BUFFER_MULTIPLIER,
        ),
    )
    if (offer) actions.acceptServiceJobs.push({ offerId: offer.id })
  }

  return actions
}
