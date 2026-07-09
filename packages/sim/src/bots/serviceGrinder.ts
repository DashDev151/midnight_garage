import type { GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { repairLaborSlotsFor } from '../constants'
import { availableLaborSlots } from '../laborSlots'
import { isServiceWorkDone } from '../serviceJobs'

/**
 * Takes repair-only service jobs and actually works them — the player-hands
 * version of the Act 1 floor (never buys a car, never touches the parts
 * market). A customer's car sits in the shop; the bot creates a repair job on
 * it, feeds it labor, and clicks "Complete Job" once the zone is fixed. Exists
 * so the balance harness can check that a broke player can survive on jobs
 * alone. Ignores the context/rng args of BotStrategy (fewer params satisfies
 * the type).
 */
export function serviceGrinderStrategy(state: GameState): DayActions {
  const actions = emptyDayActions()
  let laborBudget = availableLaborSlots(state)

  const jobByCar = new Map(state.jobs.map((job) => [job.carInstanceId, job]))

  for (const serviceJob of state.activeServiceJobs) {
    if (serviceJob.work.kind !== 'repair') continue

    // Finished? Leave it — the deadline backstop hands it back and pays out.
    // (The interactive game collects instantly on the player's click; the
    // headless bot has no click, so it lets the deadline resolve done jobs.)
    if (isServiceWorkDone(serviceJob)) continue

    const zone = serviceJob.work.zone
    const existing = jobByCar.get(serviceJob.car.id)

    // Ensure a repair job exists on the customer's car, then feed it labor.
    if (!existing) {
      if (laborBudget <= 0) continue
      const laborSlotsRequired = repairLaborSlotsFor(serviceJob.car.condition[zone])
      actions.createJobs.push({
        carInstanceId: serviceJob.car.id,
        kind: 'repair-zone',
        zone,
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

  // Spare labor and no work in hand? Bring a fresh repair-only car into the shop.
  if (laborBudget > 0) {
    const offer = state.serviceJobOffers.find((o) => o.work.kind === 'repair')
    if (offer) actions.acceptServiceJobs.push({ offerId: offer.id })
  }

  return actions
}
