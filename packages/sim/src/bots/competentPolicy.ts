import type { AuctionTier, GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { isGroupAtLeast, queueGroupRepair } from './bandHelpers'
import { planGroupRepair } from '../bands'
import {
  acquireLot,
  activeBidCount,
  auctionAcquisitionBudget,
  walkAwayTargetYen,
} from './buyoutHelpers'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import { reputationAtLeast } from '../calendar'
import { AUCTION_TIER_MIN_REPUTATION } from '../constants'
import type { SimContext } from '../context'
import {
  ASCENDING_EQUIPMENT_COST_COMPONENTS,
  equipmentBudget,
  ensureEquipmentFor,
} from './equipmentHelpers'
import { availableLaborSlots } from '../laborSlots'
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
 * The policy, in order: (1) continue open jobs; (2/3) join/continue a war at
 * the value anchor itself (never overpay) on a lot of the current
 * highest-accessible tier - lots are transparent (Sprint 26), so there is no
 * separate inspect step anymore; (4) fully restore every group to mint,
 * cheapest-to-unlock first (Sprint 23 decision 6's fix); (5) sell restored
 * cars for a clean/concours reputation gain (decision 1's faucet); (6) work
 * a service job on whatever labor restoration doesn't use that day - car
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

  // 1. Continue any in-progress job (repair-zone or install-part).
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
  // see MAX_CONCURRENT_CARS's own doc comment): join or continue a war on a
  // lot of the current highest-accessible tier (Sprint 26: lots are
  // transparent now, no separate inspect step).
  const hasRoomToBuy = state.ownedCars.length + activeBidCount(state) < MAX_CONCURRENT_CARS
  if (hasRoomToBuy) {
    const candidates = state.activeAuctionLots.filter(
      (lot) =>
        lot.tier === targetTier &&
        lot.leadingBidder !== 'player' &&
        state.cashYen >= lot.bookValueYen * CASH_BUFFER_MULTIPLIER,
    )
    if (candidates.length > 0) {
      const chosen = rng.pick(candidates)
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

    let groupToRepair: (typeof ASCENDING_EQUIPMENT_COST_COMPONENTS)[number] | undefined
    for (const id of ASCENDING_EQUIPMENT_COST_COMPONENTS) {
      if (isGroupAtLeast(car, id, 'mint', context.partIdsByGroup)) continue
      if (ensureEquipmentFor(state, id, actions, context, equipBudget, CASH_BUFFER_MULTIPLIER)) {
        groupToRepair = id
        break
      }
    }
    if (!groupToRepair) continue
    if (!claimServiceBay(state, car.id, actions, bayBudget)) continue

    const slotsToApply = queueGroupRepair(
      state,
      car.id,
      groupToRepair,
      car,
      actions,
      context,
      laborBudget,
    )
    laborBudget -= slotsToApply
    carsGettingJobsToday.add(car.id)
  }

  // 4b. Free the service bay from a car that's stalled - sitting in the bay
  // with no active job and nothing new queued for it today (step 4 found no
  // obtainable group to work, typically because the remaining ones need
  // equipment this career can't yet afford or reach).
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

  // 5. List fully-restored, job-free cars publicly - the clean/concours-
  // eligible "slow, market price" channel (decision 1's reputation faucet
  // actually being reachable is this sprint's whole point).
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id) || carsGettingJobsToday.has(car.id)) continue
    const isRestored = ASCENDING_EQUIPMENT_COST_COMPONENTS.every((id) =>
      isGroupAtLeast(car, id, 'mint', context.partIdsByGroup),
    )
    if (isRestored) {
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

      if (isServiceWorkDone(serviceJob, context)) {
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
        const plan = planGroupRepair(
          serviceJob.car,
          componentId,
          'mint',
          state.ownedEquipmentIds,
          context.partIdsByGroup,
          context.partsTaxonomyById,
          context.equipmentById,
        )
        if (plan.partIds.length === 0) continue
        actions.createJobs.push({
          carInstanceId: carId,
          kind: 'repair-zone',
          componentId,
          targetBand: 'mint',
          laborSlotsRequired: plan.laborSlotsRequired,
        })
        const jobId = `job-${state.day}-${actions.createJobs.length - 1}`
        const slots = Math.min(plan.laborSlotsRequired, laborBudget)
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
