import type { ComponentId, GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { isGroupAtLeast, queueGroupRepair, worstGroup } from './bandHelpers'
import {
  acquireLot,
  activeBidCount,
  auctionAcquisitionBudget,
  walkAwayTargetYen,
} from './buyoutHelpers'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import { currentGameYear } from '../calendar'
import type { SimContext } from '../context'
import { equipmentBudget, ensureEquipmentFor } from './equipmentHelpers'
import { availableLaborSlots } from '../laborSlots'
import type { Rng } from '../rng'
import { bestFitBuyer } from '../selling'
import { valuateCarForBuyer } from '../valuation'

const MAX_CONCURRENT_CARS = 2
/** Mid-range only - not the cheapest shitboxes, not the priciest rares. */
const MIN_TARGET_BOOK_VALUE_YEN = 150_000
const MAX_TARGET_BOOK_VALUE_YEN = 1_500_000
const FAIR_BID_MULTIPLIER = 1.0
const CASH_BUFFER_MULTIPLIER = 1.2
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
 * floor: below this fraction of book value (estimated from the best-fit
 * buyer's valuation, the closest proxy available without previewing the
 * actual walk-in roll), a walk-in offer reads as a lowball and the car
 * goes to a public listing instead of being dumped cheap.
 */
const ACCEPTABLE_WALKIN_FRACTION = 0.85

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

  let laborBudget = availableLaborSlots(state)
  const bayBudget = serviceBayBudget(state)
  const equipBudget = equipmentBudget()

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
    if (
      !ensureEquipmentFor(
        state,
        worstComponent,
        actions,
        context,
        equipBudget,
        CASH_BUFFER_MULTIPLIER,
      )
    )
      continue
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
  // accept the walk-in channel only if the estimated offer clears the
  // "okay" floor, otherwise send it to a public listing instead of
  // dumping it cheap.
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id)) continue
    const model = context.modelsById[car.modelId]
    const heatPercent = state.marketHeat[car.modelId] ?? 100
    const currentYear = currentGameYear(state.reputationTier)
    const buyer = model
      ? bestFitBuyer(
          car,
          model,
          context.buyers,
          context.partsById,
          context.partsTaxonomy,
          context.partsTaxonomyById,
          heatPercent,
          currentYear,
          context.economy,
        )
      : undefined
    const estimatedOfferYen =
      model && buyer
        ? valuateCarForBuyer(
            buyer,
            model,
            car,
            context.partsById,
            context.partsTaxonomy,
            context.partsTaxonomyById,
            heatPercent,
            currentYear,
            context.economy,
          )
        : 0
    if (model && estimatedOfferYen >= model.bookValueYen * ACCEPTABLE_WALKIN_FRACTION) {
      actions.sellViaWalkIn.push({ carInstanceId: car.id })
    } else {
      actions.listForSale.push({ carInstanceId: car.id })
    }
  }

  // 4. Join or continue a bidding war on a mid-priced lot if there's room
  // for another car (Sprint 20: open bidding - `leadingBidder !== 'player'`
  // covers both a fresh lot and one this bot was outbid on but is still
  // willing to chase under its walk-away target).
  const roomForMoreCars = MAX_CONCURRENT_CARS - state.ownedCars.length - activeBidCount(state)
  if (roomForMoreCars > 0) {
    const candidates = state.activeAuctionLots.filter(
      (lot) =>
        lot.bookValueYen >= MIN_TARGET_BOOK_VALUE_YEN &&
        lot.bookValueYen <= MAX_TARGET_BOOK_VALUE_YEN &&
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

  return actions
}
