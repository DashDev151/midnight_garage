import type { ComponentId, GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { isGroupAtLeast, queueGroupRepair, worstGroup } from './bandHelpers'
import { acquireLot, auctionAcquisitionBudget, walkAwayTargetYen } from './buyoutHelpers'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import type { SimContext } from '../context'
import { considerToolUpgrade, toolUpgradeBudget } from './toolUpgradeHelpers'
import { energyMax } from '../laborSlots'
import type { Rng } from '../rng'
import { decideSale } from './sellingHelpers'

const MAX_CONCURRENT_CARS = 2
/** Mid-range only - not the cheapest shitboxes, not the priciest rares. */
const MIN_TARGET_BOOK_VALUE_YEN = 150_000
const MAX_TARGET_BOOK_VALUE_YEN = 1_500_000
/** The walk-away ceiling for a buyout, as a multiple of the lot's value
 * anchor - set above the instant buyout's own flat premium
 * (`AUCTION_BUYOUT_PREMIUM`), the only acquisition channel left, so this
 * bot can actually clear a real buyout rather than walking away from every
 * lot on principle. */
const FAIR_BID_MULTIPLIER = 1.3
const CASH_BUFFER_MULTIPLIER = 1.2
/** An average player's double-cover buffer on tool upgrades. */
const TOOL_UPGRADE_CASH_BUFFER_MULTIPLIER = 2.0
/** "A few of the most critical repairs," not a full restoration. */
const CRITICAL_REPAIR_ZONE_COUNT = 2
const REPAIRABLE_COMPONENTS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'body',
  'interior',
]
/**
 * "First okay offer," not "first offer, period." A mid player still has a
 * floor: below this fraction of the car's best-fit valuation, a live
 * offer reads as a lowball and gets left on the table - unless
 * holding-cost pressure (`MAX_HOLDING_DAYS`) forces a sale anyway.
 */
const ACCEPT_FRACTION = 0.85
const MAX_HOLDING_DAYS = 12

/**
 * A completely average decision-maker (user-requested, sitting between
 * Flipper and Cautious Restorer): targets mid-priced cars rather than
 * either extreme, fixes the two worst zones rather than fully restoring
 * or doing nothing, and accepts the first walk-in offer that's actually
 * decent rather than either blindly taking anything or holding out for
 * the best possible public-listing price.
 */
export function balancedPlayerStrategy(
  state: GameState,
  context: SimContext,
  rng: Rng,
): DayActions {
  const actions: DayActions = emptyDayActions()

  let laborBudget = energyMax(state, context.economy)
  const bayBudget = serviceBayBudget(state)
  const upgradeBudget = toolUpgradeBudget()

  // 1. Continue any in-progress repair job from a prior day - only if its
  // car is in the service bay (moved in first, if there's room today).
  for (const job of state.jobs) {
    if (laborBudget <= 0) break
    const need = job.laborSlotsRequired - job.laborSlotsSpent
    if (need <= 0) continue
    if (!claimServiceBay(state, job.carInstanceId, actions, bayBudget)) continue
    const slots = Math.min(need, laborBudget)
    actions.laborAssignments.push({ jobId: job.id, laborSlots: slots })
    laborBudget -= slots
  }

  const jobbedCarIds = new Set(state.jobs.map((job) => job.carInstanceId))

  // 2. Fix the worst zone per job-free owned car, up to two critical repairs
  // total, bay space permitting.
  for (const car of state.ownedCars) {
    if (laborBudget <= 0) break
    if (jobbedCarIds.has(car.id)) continue
    const repairedCount = REPAIRABLE_COMPONENTS.filter((id) =>
      isGroupAtLeast(car, id, 'mint', context.partIdsByGroup),
    ).length
    if (repairedCount >= CRITICAL_REPAIR_ZONE_COUNT) continue

    const worstComponent = worstGroup(car, REPAIRABLE_COMPONENTS, context.partIdsByGroup)
    if (!claimServiceBay(state, car.id, actions, bayBudget)) continue
    // Consider upgrading the line for speed, but repair proceeds either
    // way - work is always possible at the current tier.
    considerToolUpgrade(
      state,
      worstComponent,
      actions,
      context,
      upgradeBudget,
      TOOL_UPGRADE_CASH_BUFFER_MULTIPLIER,
    )
    const slots = queueGroupRepair(
      state,
      car.id,
      worstComponent,
      car,
      actions,
      context,
      laborBudget,
    )
    laborBudget -= slots
    jobbedCarIds.add(car.id)
  }

  // 3. Sell any car whose critical repairs are done and has no open job:
  // accept a live offer once it clears the "okay" floor (or holding-cost
  // pressure forces the issue), otherwise leave it on the table and wait.
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id)) continue
    decideSale(state, car, context, actions, {
      acceptFraction: ACCEPT_FRACTION,
      maxHoldingDays: MAX_HOLDING_DAYS,
    })
  }

  // 4. Buy out a mid-priced lot if there's room for another car.
  const roomForMoreCars = MAX_CONCURRENT_CARS - state.ownedCars.length
  if (roomForMoreCars > 0) {
    const candidates = state.activeAuctionLots.filter(
      (lot) =>
        lot.bookValueYen >= MIN_TARGET_BOOK_VALUE_YEN &&
        lot.bookValueYen <= MAX_TARGET_BOOK_VALUE_YEN &&
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
        auctionAcquisitionBudget(),
        CASH_BUFFER_MULTIPLIER,
      )
    }
  }

  return actions
}
