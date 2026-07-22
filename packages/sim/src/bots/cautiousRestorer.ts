import {
  ComponentIdSchema,
  type AuctionTier,
  type ComponentId,
  type GameState,
} from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { carCostToMintYen } from '../bands'
import { isGroupAtLeast, queueGroupRepair } from './bandHelpers'
import { acquireLot, auctionAcquisitionBudget, walkAwayTargetYen } from './buyoutHelpers'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import { reputationAtLeast } from '../calendar'
import type { SimContext } from '../context'
import { considerToolUpgrade, toolUpgradeBudget } from './toolUpgradeHelpers'
import { energyMax } from '../laborSlots'
import type { Rng } from '../rng'
import { decideSale } from './sellingHelpers'

/** The six real component groups this bot restores and checks, in the
 * canonical ComponentId order - there is no per-group unlock price to sort
 * by, only per-line upgrade prices that never gate work. */
const ALL_GROUPS: readonly ComponentId[] = ComponentIdSchema.options

const MAX_CONCURRENT_CARS = 2
/**
 * The walk-away ceiling for a buyout, as a multiple of the lot's value
 * anchor - a real premium above the instant buyout's own flat markup
 * (`AUCTION_BUYOUT_PREMIUM`), the only acquisition channel left, so this
 * bot clears a real buyout more reliably than the baseline bots. This bot
 * has genuine information (it inspected) that an uninspected bot doesn't
 * get to price in, so paying a bit more for the same lot is earned, not a
 * lowball gamble.
 */
const FAIR_BID_MULTIPLIER = 1.35
/**
 * Empirically (this sprint's balance harness): at 1.4x, even the
 * cheapest regional-tier lot's book value (Y1.1M) needed Y1.54M in cash
 * - more than the Y1.5M starting capital - so the bot inspected every
 * lot it saw, every single day, and never once could afford to bid. A
 * bot that only ever pays fees and never transacts isn't "cautious," it's
 * inert. 1.15 keeps a real safety margin without being unaffordable.
 */
const CASH_BUFFER_MULTIPLIER = 1.15

/**
 * This bot's identity: "only buys cars whose restoration bill is small
 * relative to clean value" - a real selectivity criterion, since both
 * numbers are transparent (`carCostToMintYen` vs `model.bookValueYen *
 * heatFraction`), not a fixed fraction of book value or an inspection gate.
 * Applied only once this bot reaches its real operating tier (`regional`,
 * once `local` reputation is cleared): local-yard/shitbox-tier book values
 * (Y180k-650k) sit well below the fixed per-part step-cost total (~Y524k
 * across all 29 parts at one grade each), so a whole-car ratio filter
 * there would starve the reputation bootstrap this bot needs just to ever
 * see a regional lot. At regional book values (Y1.1M-1.8M) the ratio is
 * meaningful: a car whose bill exceeds
 * `MAX_RESTORATION_TO_CLEAN_VALUE_RATIO` of its clean value reads as a
 * real fixer-upper this cautious bot would rather skip than gamble a
 * fair-price bid on the labor still owed.
 */
const MAX_RESTORATION_TO_CLEAN_VALUE_RATIO = 0.6

/** This bot's whole identity is patience and a fair-price floor (no
 * lowball gamble) - it holds out near full value and tolerates a long
 * wait before holding-cost pressure forces a sale. */
const ACCEPT_FRACTION = 0.95
const MAX_HOLDING_DAYS = 20

/** A cautious double-cover buffer on tool upgrades - this bot only
 * invests in speed when its bankroll comfortably covers it. */
const TOOL_UPGRADE_CASH_BUFFER_MULTIPLIER = 2.0

/**
 * Only buys at-or-above fair price, fully restores every zone before
 * selling via list-publicly for the best price the market offers. Every
 * lot is transparent, so this bot's real edge is patience and a
 * fair-price floor, not information; also a restoration-bill floor once
 * targeting regional tier - see `MAX_RESTORATION_TO_CLEAN_VALUE_RATIO`.
 *
 * Targets regional tier once it can - Premium tier's book values (rare,
 * Y2-6M) are out of reach for a Y1.5M-capital, 2-car bot even at fair
 * price, and widening regional itself to *also* include local-yard
 * permanently was tried and made things worse (more transaction volume
 * just accelerated losses on a strategy whose per-cycle margin isn't
 * reliably positive at this time horizon).
 *
 * Targets `local-yard` instead *only* while reputation is still `unknown`
 * - a temporary bootstrap phase, since a fully-restored, quality sale
 * earns real reputation the same way regardless of which tier the car
 * came from. Once reputation clears `local`, every future inspect/bid
 * targets regional again, as originally designed.
 */
export function cautiousRestorerStrategy(
  state: GameState,
  context: SimContext,
  rng: Rng,
): DayActions {
  const actions: DayActions = emptyDayActions()

  let laborBudget = energyMax(state, context.economy)
  const bayBudget = serviceBayBudget(state)
  const upgradeBudget = toolUpgradeBudget()
  const targetTier: AuctionTier = reputationAtLeast(state.reputationTier, 'local')
    ? 'regional'
    : 'local-yard'

  // 1. Continue any in-progress repair job from a prior day - only if its
  // car is in the service bay.
  for (const job of state.jobs) {
    if (laborBudget <= 0) break
    const need = job.laborSlotsRequired - job.laborSlotsSpent
    if (need <= 0) continue
    if (!claimServiceBay(state, job.carInstanceId, actions, bayBudget)) continue
    const slots = Math.min(need, laborBudget)
    actions.laborAssignments.push({ jobId: job.id, laborSlots: slots })
    laborBudget -= slots
  }

  // 2/3. Buy out a lot of the current target tier, if there's room for
  // another car - every lot is transparent, immediately buyable. Once
  // targeting regional tier, also skips any lot whose restoration bill
  // isn't small relative to its clean value (see
  // `MAX_RESTORATION_TO_CLEAN_VALUE_RATIO`'s own doc comment for why the
  // bootstrap-phase local-yard fallback is exempt).
  if (state.ownedCars.length < MAX_CONCURRENT_CARS) {
    const candidates = state.activeAuctionLots.filter((lot) => {
      if (lot.tier !== targetTier) return false
      if (state.cashYen < lot.bookValueYen * CASH_BUFFER_MULTIPLIER) return false
      if (targetTier !== 'regional') return true
      const model = context.modelsById[lot.modelId]
      if (!model) return false
      const heatPercent = state.marketHeat[lot.modelId] ?? 100
      const cleanValue = model.bookValueYen * (heatPercent / 100)
      if (cleanValue <= 0) return false
      const restorationBill = carCostToMintYen(
        lot.car,
        model,
        context.partsById,
        context.partsTaxonomyById,
        context.economy,
      )
      return restorationBill <= cleanValue * MAX_RESTORATION_TO_CLEAN_VALUE_RATIO
    })
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

  // 4. Repair the first NEEDY component on each owned, job-free car, one
  // zone at a time. Work is always possible at the current tool tier (no
  // ownership gate), so this just picks the first below-mint group,
  // considers upgrading its line for speed (proceeding with the repair
  // either way), and claims a bay only once a real job exists to work.
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

  // 5. Take offers on fully-restored, job-free cars, holding out near full
  // value - "fully restored" means every group's every present part has
  // reached mint.
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

  return actions
}
