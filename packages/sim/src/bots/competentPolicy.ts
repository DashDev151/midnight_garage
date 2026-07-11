import type { AuctionTier, GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import {
  acquireLot,
  activeBidCount,
  auctionAcquisitionBudget,
  walkAwayTargetYen,
} from './buyoutHelpers'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import { reputationAtLeast } from '../calendar'
import { AUCTION_TIER_MIN_REPUTATION, repairLaborSlotsFor } from '../constants'
import type { SimContext } from '../context'
import {
  ASCENDING_EQUIPMENT_COST_COMPONENTS,
  equipmentBudget,
  ensureEquipmentFor,
} from './equipmentHelpers'
import { availableLaborSlots } from '../laborSlots'
import { issueLaborSlots } from '../issues'
import type { Rng } from '../rng'
import { isServiceWorkDone } from '../serviceJobs'

/**
 * One car at a time, deliberately - measurement showed that even 2 (every
 * other bot's default) let this policy start a second restoration before
 * the first one finished, permanently splitting its equipment-buying cash
 * and labor across two needy cars, so NEITHER ever reached a full,
 * issue-free restoration within the measurement horizon and the clean-sale
 * faucet never fired at all. "Patient" (this file's own framing) means
 * finish, sell, then buy the next one.
 */
const MAX_CONCURRENT_CARS = 1
/** Never pays more than the car is genuinely worth (decision 4's own framing) - the
 * walk-away target is the value anchor itself, no premium, no discount. */
const FAIR_BID_MULTIPLIER = 1.0
const CASH_BUFFER_MULTIPLIER = 1.15
const REPAIR_THRESHOLD = 90
const REPAIR_LABOR_SLOTS = 2

const TIER_ORDER: readonly AuctionTier[] = [
  'collector-network',
  'premium',
  'regional',
  'local-yard',
]

/** The highest auction tier this career's current reputation actually unlocks. */
function highestAccessibleTier(state: GameState): AuctionTier {
  for (const tier of TIER_ORDER) {
    if (reputationAtLeast(state.reputationTier, AUCTION_TIER_MIN_REPUTATION[tier])) return tier
  }
  return 'local-yard'
}

/**
 * Sprint 23's measurement instrument - the "competent player" invariant 3
 * (days-to-`local`) and the M1/M3 measurement tasks are read against. This
 * is deliberately NOT a bot archetype (sprint23.md's own framing:
 * "operationalized by the probe policies below, not by bot archetypes") -
 * it lives in `bots/` and matches `BotStrategy`'s shape only because that's
 * the existing, reusable way to run a deterministic day-by-day policy
 * through `runCareer`/`exportCareers.ts`, not because it belongs in the
 * balance harness's roster of playstyle comparisons.
 *
 * The policy, in order: (1) continue open jobs; (2) always inspect before
 * ever bidding - this policy never bids on an uninspected lot, since
 * information is the entire point of Sprint 22; (3) join/continue a war at
 * the value anchor itself (never overpay), walking away from a real severe
 * issue via the shared `acquireLot` risk filter (Sprint 22); (4)/(4b) fully
 * restore every component AND fix every hidden issue, cheapest-to-unlock
 * first (Sprint 23 decision 6's fix); (5) sell restored, issue-free cars
 * for a clean/concours reputation gain (decision 1's faucet); (6) work a
 * service job on whatever labor restoration doesn't use that day - car
 * restoration is the priority, service work is the overflow, matching the
 * doc's own "work service jobs on idle labor" phrasing.
 */
export function competentPolicyStrategy(
  state: GameState,
  context: SimContext,
  rng: Rng,
): DayActions {
  const actions: DayActions = emptyDayActions()

  let laborBudget = availableLaborSlots(state)
  const bayBudget = serviceBayBudget(state)
  const equipBudget = equipmentBudget()
  const targetTier = highestAccessibleTier(state)

  // 1. Continue any in-progress job (repair-zone, install-part, or fix-issue).
  for (const job of state.jobs) {
    if (laborBudget <= 0) break
    const need = job.laborSlotsRequired - job.laborSlotsSpent
    if (need <= 0) continue
    if (!claimServiceBay(state, job.carInstanceId, actions, bayBudget)) continue
    const slots = Math.min(need, laborBudget)
    actions.laborAssignments.push({ jobId: job.id, laborSlots: slots })
    laborBudget -= slots
  }

  // 2/3. Only shop for a car when there's actually room for one (patient -
  // see MAX_CONCURRENT_CARS's own doc comment): inspect one uninspected lot
  // of the current highest-accessible tier, then join or continue a war on
  // an already-inspected lot. `acquireLot` itself refuses a lot whose
  // inspected car carries a real severe issue (Sprint 22's shared risk
  // filter) - this policy never has to duplicate that check.
  const hasRoomToBuy = state.ownedCars.length + activeBidCount(state) < MAX_CONCURRENT_CARS
  if (hasRoomToBuy) {
    const uninspected = state.activeAuctionLots.filter(
      (lot) => !lot.inspected && lot.tier === targetTier,
    )
    if (uninspected.length > 0 && laborBudget > 0) {
      actions.inspectLots.push({ lotId: rng.pick(uninspected).id })
      laborBudget -= 1
    }

    const inspected = state.activeAuctionLots.filter(
      (lot) =>
        lot.inspected &&
        lot.leadingBidder !== 'player' &&
        state.cashYen >= lot.bookValueYen * CASH_BUFFER_MULTIPLIER,
    )
    if (inspected.length > 0) {
      const chosen = rng.pick(inspected)
      const targetYen = walkAwayTargetYen(chosen, state, context, FAIR_BID_MULTIPLIER)
      acquireLot(
        state,
        chosen,
        targetYen,
        actions,
        context,
        auctionAcquisitionBudget(state),
        CASH_BUFFER_MULTIPLIER,
      )
    }
  }

  // 4. Repair the cheapest-to-unlock needy component on each owned,
  // job-free car - tries every needy component in ascending equipment-cost
  // order before giving up on the car, exactly like the Sprint 23-fixed
  // `cautiousRestorerStrategy` (see that file's own doc comment for why the
  // naive "first needy component" version could deadlock permanently).
  const jobbedCarIds = new Set(state.jobs.map((job) => job.carInstanceId))
  const carsGettingJobsToday = new Set<string>()
  for (const car of state.ownedCars) {
    if (laborBudget <= 0) break
    if (jobbedCarIds.has(car.id)) continue

    let componentToRepair: (typeof ASCENDING_EQUIPMENT_COST_COMPONENTS)[number] | undefined
    for (const id of ASCENDING_EQUIPMENT_COST_COMPONENTS) {
      if (car.components[id].condition >= REPAIR_THRESHOLD) continue
      if (ensureEquipmentFor(state, id, actions, context, equipBudget, CASH_BUFFER_MULTIPLIER)) {
        componentToRepair = id
        break
      }
    }
    if (!componentToRepair) continue
    if (!claimServiceBay(state, car.id, actions, bayBudget)) continue

    const jobIndex = actions.createJobs.length
    actions.createJobs.push({
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId: componentToRepair,
      laborSlotsRequired: REPAIR_LABOR_SLOTS,
    })
    const slotsToApply = Math.min(REPAIR_LABOR_SLOTS, laborBudget)
    actions.laborAssignments.push({
      jobId: `job-${state.day}-${jobIndex}`,
      laborSlots: slotsToApply,
    })
    laborBudget -= slotsToApply
    carsGettingJobsToday.add(car.id)
  }

  // 4b. Fix any unrepaired hidden issue on an owned, job-free car - "fully
  // restored" (step 5) requires zero unrepaired issues, not just condition.
  for (const car of state.ownedCars) {
    if (laborBudget <= 0) break
    if (jobbedCarIds.has(car.id) || carsGettingJobsToday.has(car.id)) continue
    const unrepaired = car.hiddenIssues.find((ri) => !ri.repaired)
    if (!unrepaired) continue
    const issue = context.hiddenIssuesById[unrepaired.issueId]
    if (!issue) continue
    if (!claimServiceBay(state, car.id, actions, bayBudget)) continue
    if (
      !ensureEquipmentFor(
        state,
        issue.componentId,
        actions,
        context,
        equipBudget,
        CASH_BUFFER_MULTIPLIER,
      )
    )
      continue

    const laborSlotsRequired = issueLaborSlots(unrepaired.severityPercent, context.economy)
    const jobIndex = actions.createJobs.length
    actions.createJobs.push({
      carInstanceId: car.id,
      kind: 'fix-issue',
      componentId: issue.componentId,
      issueId: unrepaired.issueId,
      laborSlotsRequired,
    })
    const slotsToApply = Math.min(laborSlotsRequired, laborBudget)
    actions.laborAssignments.push({
      jobId: `job-${state.day}-${jobIndex}`,
      laborSlots: slotsToApply,
    })
    laborBudget -= slotsToApply
    carsGettingJobsToday.add(car.id)
  }

  // 4c. Free the service bay from a car that's stalled - sitting in the bay
  // with no active job and nothing new queued for it today (steps 4/4b found
  // no obtainable component or issue to work, typically because the
  // remaining ones need equipment this career can't yet afford or reach).
  // Without this the ONE starting bay stays claimed by an unworkable car
  // forever (nothing else ever moves it out), permanently zeroing out
  // step 6's `bayBudget.free` and starving the service-job faucet even
  // though real idle labor exists - a real deadlock found by measurement
  // (M3), not guessed at: a bootstrapped career froze solid at day 7 with
  // 0 labor spent on any of the next 50+ days once its first few obtainable
  // components ran out.
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id) || carsGettingJobsToday.has(car.id)) continue
    if (state.serviceBayCarIds.includes(car.id)) {
      actions.moveCars.push({ carInstanceId: car.id, to: 'parking' })
      bayBudget.free += 1
    }
  }

  // 5. List fully-restored, issue-free, job-free cars publicly - the
  // clean/concours-eligible "slow, market price" channel (decision 1's
  // reputation faucet actually being reachable is this sprint's whole point).
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id) || carsGettingJobsToday.has(car.id)) continue
    const isRestored = ASCENDING_EQUIPMENT_COST_COMPONENTS.every(
      (id) => car.components[id].condition >= REPAIR_THRESHOLD,
    )
    const hasUnrepairedIssue = car.hiddenIssues.some((ri) => !ri.repaired)
    if (isRestored && !hasUnrepairedIssue) {
      actions.listForSale.push({ carInstanceId: car.id })
    }
  }

  // 6. Work a service job on whatever labor car-restoration didn't use
  // today - restoration is this policy's priority, service work is the
  // overflow (the doc's own "work service jobs on idle labor" phrasing).
  // Mirrors `serviceGrinderStrategy`'s accept/work/release logic exactly.
  if (laborBudget > 0) {
    const jobByCar = new Map(state.jobs.map((job) => [job.carInstanceId, job]))
    for (const serviceJob of state.activeServiceJobs) {
      if (laborBudget <= 0) break
      if (serviceJob.work.kind !== 'repair') continue
      const carId = serviceJob.car.id

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

      if (!existing) {
        const laborSlotsRequired = repairLaborSlotsFor(
          serviceJob.car.components[componentId].condition,
        )
        actions.createJobs.push({
          carInstanceId: carId,
          kind: 'repair-zone',
          componentId,
          laborSlotsRequired,
        })
        const jobId = `job-${state.day}-${actions.createJobs.length - 1}`
        const slots = Math.min(laborSlotsRequired, laborBudget)
        actions.laborAssignments.push({ jobId, laborSlots: slots })
        laborBudget -= slots
        continue
      }

      const need = existing.laborSlotsRequired - existing.laborSlotsSpent
      if (need <= 0) continue
      const slots = Math.min(need, laborBudget)
      actions.laborAssignments.push({ jobId: existing.id, laborSlots: slots })
      laborBudget -= slots
    }

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
  }

  return actions
}
