import {
  ComponentIdSchema,
  type AuctionTier,
  type ComponentId,
  type GameState,
} from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { isGroupAtLeast, queueGroupRepair } from './bandHelpers'
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
import { considerToolUpgrade, toolUpgradeBudget } from './toolUpgradeHelpers'
import { energyMax } from '../laborSlots'
import type { Rng } from '../rng'
import { decideSale } from './sellingHelpers'
import { isServiceWorkDone, toolDeficitSummary } from '../serviceJobs'
import {
  expectedProfitPerLaborSlot,
  MIN_PROFIT_PER_LABOR_SLOT_YEN,
  queueServiceJobTasks,
} from './serviceJobHelpers'

/** The six real component groups, canonical order (Sprint 36: replaces the
 * retired ascending-equipment-cost ordering). */
const ALL_GROUPS: readonly ComponentId[] = ComponentIdSchema.options

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
/**
 * Sprint 31 decision 4: this policy's own sell accept-threshold - the
 * measurement probe the orchestrator's wait-vs-gain balance-report section
 * (sprint31.md decision 3) reads against. Deliberately its own constants,
 * not a re-use of `cautiousRestorerStrategy`'s (sellingHelpers.ts's own
 * doc comment): a future retune of one must never silently drag the other.
 */
const ACCEPT_FRACTION = 0.9
const MAX_HOLDING_DAYS = 15

/** Sprint 36: a competent player's double-cover buffer on tool upgrades -
 * speed is bought when the bankroll comfortably covers it, never before. */
const TOOL_UPGRADE_CASH_BUFFER_MULTIPLIER = 2.0

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

  let laborBudget = energyMax(state, context.economy)
  const bayBudget = serviceBayBudget(state)
  const upgradeBudget = toolUpgradeBudget()
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

  // 4. Repair the first needy component on each owned, job-free car.
  // Sprint 36: work is always possible at the current tool tier (the
  // Sprint 19c/23 reachability-deadlock class is structurally gone), so
  // this picks the first below-mint group, considers upgrading its line for
  // speed, and proceeds with the repair regardless.
  const jobbedCarIds = new Set(state.jobs.map((job) => job.carInstanceId))
  const carsGettingJobsToday = new Set<string>()
  for (const car of state.ownedCars) {
    if (laborBudget <= 0) break
    if (jobbedCarIds.has(car.id)) continue

    const groupToRepair = ALL_GROUPS.find(
      (id) => !isGroupAtLeast(car, id, 'mint', context.partIdsByGroup),
    )
    if (!groupToRepair) continue
    considerToolUpgrade(
      state,
      groupToRepair,
      actions,
      context,
      upgradeBudget,
      TOOL_UPGRADE_CASH_BUFFER_MULTIPLIER,
    )
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

  // 5. Take offers on fully-restored, job-free cars - the clean/concours-
  // eligible sale (decision 1's reputation faucet actually being reachable
  // is this sprint's whole point). Sprint 31: the accept-threshold below is
  // this policy's own measurement probe (see ACCEPT_FRACTION's doc comment).
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id) || carsGettingJobsToday.has(car.id)) continue
    const isRestored = ALL_GROUPS.every((id) =>
      isGroupAtLeast(car, id, 'mint', context.partIdsByGroup),
    )
    if (isRestored) {
      decideSale(state, car, context, actions, {
        acceptFraction: ACCEPT_FRACTION,
        maxHoldingDays: MAX_HOLDING_DAYS,
      })
    }
  }

  // 6. Work a service job on whatever labor car-restoration didn't use
  // today - restoration is this policy's priority, service work is the
  // overflow (the doc's own "work service jobs on idle labor" phrasing).
  // Sprint 29: a job's task list can mix repair and install now
  // (`serviceJobHelpers.ts`'s `queueServiceJobTasks` executes both, unlike
  // `serviceGrinderStrategy`'s deliberately repair-only restriction) - this
  // is the "well-rounded operator" measurement probe, so it takes whatever
  // clears the profit-per-labor-slot floor, not just repair-only offers.
  if (laborBudget > 0) {
    let cashCommitted = 0
    for (const serviceJob of state.activeServiceJobs) {
      if (laborBudget <= 0) break
      const carId = serviceJob.car.id

      if (isServiceWorkDone(serviceJob, context)) {
        if (state.serviceBayCarIds.includes(carId)) {
          actions.moveCars.push({ carInstanceId: carId, to: 'parking' })
          bayBudget.free += 1
        }
        continue
      }

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

    if (laborBudget > 0 && bayBudget.free > 0) {
      // Sprint 36: acceptance is gated by tool-tier deficits, not ownership -
      // this probe only takes offers it can accept outright (zero deficits);
      // chasing an upgrade-hint offer is serviceGrinder's archetype, not the
      // competent baseline's.
      const offer = state.serviceJobOffers.find(
        (o) =>
          expectedProfitPerLaborSlot(o, context) >= MIN_PROFIT_PER_LABOR_SLOT_YEN &&
          toolDeficitSummary(o.tasks, state.toolTiers, context).maxDeficit === 0,
      )
      if (offer) actions.acceptServiceJobs.push({ offerId: offer.id })
    }
  }

  return actions
}
