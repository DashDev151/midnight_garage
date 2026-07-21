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

const MAX_CONCURRENT_CARS = 3
const MAX_BIDS_PER_DAY = 2
/**
 * The walk-away ceiling for a buyout, as a multiple of the lot's value
 * anchor. The instant buyout itself is a flat premium over that same anchor
 * (`AUCTION_BUYOUT_PREMIUM`, no cheaper contested path left to win one for
 * less) - a ceiling anchored below the premium would never clear a real
 * buyout, so this sits comfortably above it; the flip's margin still comes
 * from the repair value-add (below), not from buying at a discount.
 */
const BID_FRACTION_OF_BOOK = 1.3
const CASH_BUFFER_MULTIPLIER = 1.3
/** Sprint 36: even a fast flipper only invests in tools at double cover. */
const TOOL_UPGRADE_CASH_BUFFER_MULTIPLIER = 2.0
/** Shitbox-range only - local-yard also carries Common-tier lots (e.g. an
 * EG6 at 650k book) whose much larger absolute swings don't fit a bot
 * that does one cheap repair and flips fast. */
const MAX_TARGET_BOOK_VALUE_YEN = 300_000
/**
 * One cheap repair (the worst zone, fully fixed) before flipping - not a
 * full restoration of the whole car, but enough real value-add to make a
 * flip profitable. Buying near the competitive auction price and reselling
 * the same car instantly, untouched, is structurally a break-even-or-losing
 * trade - no value was added, so there's nothing to sell for more than was
 * paid. GDD 9.0's own first-flip example includes an oil change, not a
 * same-day resale.
 */
const REPAIRABLE_COMPONENTS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'body',
  'interior',
]
/** Sprint 31 decision 4: flip fast means take the FIRST live offer,
 * whatever it is - no price floor, no patience. */
const ACCEPT_FRACTION = 0
const MAX_HOLDING_DAYS = 0

/**
 * Buy rough at a discount, do one quick repair, flip fast (GDD 9.0's
 * "buy it when you see it" fantasy, lightly built rather than restored).
 */
export function flipperStrategy(state: GameState, context: SimContext, rng: Rng): DayActions {
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

  // 2. Start one new repair job (worst zone) per job-free owned car, budget
  // and bay space permitting.
  for (const car of state.ownedCars) {
    if (laborBudget <= 0) break
    if (jobbedCarIds.has(car.id)) continue
    const worstComponent = worstGroup(car, REPAIRABLE_COMPONENTS, context.partIdsByGroup)
    if (isGroupAtLeast(car, worstComponent, 'mint', context.partIdsByGroup)) continue
    if (!claimServiceBay(state, car.id, actions, bayBudget)) continue
    // Sprint 36: consider upgrading the line for speed, but repair proceeds
    // either way - work is always possible at the current tier.
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

  // 3. Sell any car whose repair is done and has no open job.
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id)) continue
    decideSale(state, car, context, actions, {
      acceptFraction: ACCEPT_FRACTION,
      maxHoldingDays: MAX_HOLDING_DAYS,
    })
  }

  // 4. Buy out fresh, cheap local-yard lots if there's room for another car.
  const roomForMoreCars = MAX_CONCURRENT_CARS - state.ownedCars.length
  if (roomForMoreCars > 0) {
    const candidates = [...state.activeAuctionLots]
      .filter((lot) => lot.tier === 'local-yard' && lot.bookValueYen <= MAX_TARGET_BOOK_VALUE_YEN)
      .sort(() => rng.next() - 0.5)

    const acquisitionBudget = auctionAcquisitionBudget()
    const bidCap = Math.min(MAX_BIDS_PER_DAY, roomForMoreCars)
    let acquisitionsQueued = 0
    for (const lot of candidates) {
      if (acquisitionsQueued >= bidCap) break
      const targetYen = walkAwayTargetYen(lot, state, context, BID_FRACTION_OF_BOOK)
      if (
        acquireLot(
          state,
          lot,
          targetYen,
          actions,
          context,
          acquisitionBudget,
          CASH_BUFFER_MULTIPLIER,
        )
      ) {
        acquisitionsQueued += 1
      }
    }
  }

  return actions
}
