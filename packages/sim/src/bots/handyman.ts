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
import type { SimContext } from '../context'
import { equipmentBudget, ensureEquipmentFor } from './equipmentHelpers'
import { availableLaborSlots } from '../laborSlots'
import type { Rng } from '../rng'
import { decideSale } from './sellingHelpers'

const MAX_CONCURRENT_CARS = 2
const MIN_TARGET_BOOK_VALUE_YEN = 150_000
const MAX_TARGET_BOOK_VALUE_YEN = 1_500_000
const FAIR_BID_MULTIPLIER = 1.0
/** Same headroom style as every other bot's cash buffer - equipment purchases use it too. */
const CASH_BUFFER_MULTIPLIER = 1.2
const REPAIRABLE_COMPONENTS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'body',
  'interior',
]
/** Sprint 31 decision 4: accept an offer once it clears this fraction of the
 * car's best-fit valuation, or once it's been for-sale this many days. */
const ACCEPT_FRACTION = 0.85
const MAX_HOLDING_DAYS = 12

/**
 * Sprint 13: the payback-curve archetype the design doc's equipment ladder
 * is meant to reward - "invest fast, harvest the labor-only margin." Buys
 * the cheapest equipment it doesn't yet own, every day it can afford one
 * with headroom to spare, *before* deciding what to do with its cars -
 * equipment is the priority spend, not an afterthought. Once equipped,
 * behaves like a disciplined restorer: fixes the worst component per car
 * (repair, now genuinely free of part cost thanks to the tool already
 * owned) and sells at a fair floor. The harness's payback-curve columns
 * (sprint13.md decision 11) compare this bot's cash/net-worth trajectory
 * against Investor's to check the investment actually pays off.
 */
export function handymanStrategy(state: GameState, context: SimContext, rng: Rng): DayActions {
  const actions: DayActions = emptyDayActions()

  let laborBudget = availableLaborSlots(state)
  const bayBudget = serviceBayBudget(state)
  const equipBudget = equipmentBudget()

  // 1. Continue any in-progress repair job from a prior day.
  for (const job of state.jobs) {
    if (laborBudget <= 0) break
    const need = job.laborSlotsRequired - job.laborSlotsSpent
    if (need <= 0) continue
    if (!claimServiceBay(state, job.carInstanceId, actions, bayBudget)) continue
    const slots = Math.min(need, laborBudget)
    actions.laborAssignments.push({ jobId: job.id, laborSlots: slots })
    laborBudget -= slots
  }

  // 2. Buy the cheapest unowned, affordable, reputation-eligible equipment -
  // the investment priority. One purchase per day: buying everything at once
  // would strand the bot broke on tools with nothing left to run the shop.
  const unowned = context.equipment
    .filter((e) => !state.ownedEquipmentIds.includes(e.id))
    .sort((a, b) => a.priceYen - b.priceYen)
  for (const equipment of unowned) {
    if (
      equipment.componentIds.some((id) =>
        ensureEquipmentFor(state, id, actions, context, equipBudget, CASH_BUFFER_MULTIPLIER),
      )
    ) {
      break
    }
  }

  const jobbedCarIds = new Set(state.jobs.map((job) => job.carInstanceId))

  // 3. Repair the worst repairable component per job-free owned car -
  // ensureEquipmentFor buys the tool here too if step 2 skipped it (e.g. no
  // unowned equipment covered a component this car actually needs).
  for (const car of state.ownedCars) {
    if (laborBudget <= 0) break
    if (jobbedCarIds.has(car.id)) continue
    const isRestored = REPAIRABLE_COMPONENTS.every((id) =>
      isGroupAtLeast(car, id, 'mint', context.partIdsByGroup),
    )
    if (isRestored) continue

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

  // 4. Sell any job-free car that's fully restored, at a fair floor.
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id)) continue
    const isRestored = REPAIRABLE_COMPONENTS.every((id) =>
      isGroupAtLeast(car, id, 'mint', context.partIdsByGroup),
    )
    if (!isRestored) continue
    decideSale(state, car, context, actions, {
      acceptFraction: ACCEPT_FRACTION,
      maxHoldingDays: MAX_HOLDING_DAYS,
    })
  }

  // 5. Join or continue a war on a mid-priced lot if there's room for
  // another car - modest scale, since equipment competes for the same cash
  // (Sprint 20: open bidding - `leadingBidder !== 'player'` covers both a
  // fresh lot and one this bot was outbid on but is still willing to chase
  // under its walk-away target).
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
