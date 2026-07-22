import { ComponentIdSchema, type ComponentId, type GameState } from '@midnight-garage/content'
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
const MIN_TARGET_BOOK_VALUE_YEN = 150_000
const MAX_TARGET_BOOK_VALUE_YEN = 1_500_000
/** The walk-away ceiling for a buyout, as a multiple of the lot's value
 * anchor - set above the instant buyout's own flat premium
 * (`AUCTION_BUYOUT_PREMIUM`), the only acquisition channel left, so this
 * bot can actually clear a real buyout rather than walking away from every
 * lot on principle. */
const FAIR_BID_MULTIPLIER = 1.3
/** Same headroom style as every other bot's cash buffer (auction spends). */
const CASH_BUFFER_MULTIPLIER = 1.2
/** This archetype upgrades at a bare 1.0 buffer - invest fast is its
 * whole identity; the harness's payback-curve columns measure whether
 * that pays off against Investor's never-upgrade control. */
const TOOL_UPGRADE_CASH_BUFFER_MULTIPLIER = 1.0
const REPAIRABLE_COMPONENTS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'body',
  'interior',
]
/** Accept an offer once it clears this fraction of the car's best-fit
 * valuation, or once it's been for-sale this many days. */
const ACCEPT_FRACTION = 0.85
const MAX_HOLDING_DAYS = 12

/**
 * The tier-payback archetype: "invest fast, harvest the labor-efficiency
 * margin." Each day it queues the CHEAPEST next-tier tool upgrade across
 * all six lines it can buffer, *before* deciding what to do with its cars
 * - capability is the priority spend, not an afterthought. Otherwise a
 * disciplined restorer: fixes the worst component per car (always
 * possible now, just faster at higher tiers) and sells at a fair floor.
 * The harness's payback-curve columns compare this bot's cash/net-worth
 * trajectory against Investor's to check the investment actually pays off.
 */
export function handymanStrategy(state: GameState, context: SimContext, rng: Rng): DayActions {
  const actions: DayActions = emptyDayActions()

  let laborBudget = energyMax(state, context.economy)
  const bayBudget = serviceBayBudget(state)
  const upgradeBudget = toolUpgradeBudget()

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

  // 2. Upgrade the cheapest affordable next tier across all lines - the
  // investment priority. One upgrade per day: buying everything at once
  // would strand the bot broke on tools with nothing left to run the shop.
  const linesByNextTierPrice = ComponentIdSchema.options
    .filter((id) => state.toolTiers[id] < 3)
    .sort(
      (a, b) =>
        context.toolLines[a].tiers[state.toolTiers[a]]!.upgradePriceYen -
        context.toolLines[b].tiers[state.toolTiers[b]]!.upgradePriceYen,
    )
  for (const componentId of linesByNextTierPrice) {
    if (
      considerToolUpgrade(
        state,
        componentId,
        actions,
        context,
        upgradeBudget,
        TOOL_UPGRADE_CASH_BUFFER_MULTIPLIER,
      )
    ) {
      break
    }
  }

  const jobbedCarIds = new Set(state.jobs.map((job) => job.carInstanceId))

  // 3. Repair the worst repairable component per job-free owned car - work
  // is always possible at the current tier, so no gate here.
  for (const car of state.ownedCars) {
    if (laborBudget <= 0) break
    if (jobbedCarIds.has(car.id)) continue
    const isRestored = REPAIRABLE_COMPONENTS.every((id) =>
      isGroupAtLeast(car, id, 'mint', context.partIdsByGroup),
    )
    if (isRestored) continue

    const worstComponent = worstGroup(car, REPAIRABLE_COMPONENTS, context.partIdsByGroup)
    if (!claimServiceBay(state, car.id, actions, bayBudget)) continue

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

  // 5. Buy out a mid-priced lot if there's room for another car - modest
  // scale, since equipment competes for the same cash.
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
