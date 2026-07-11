import type { AuctionTier, GameState } from '@midnight-garage/content'
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
import type { SimContext } from '../context'
import {
  ASCENDING_EQUIPMENT_COST_COMPONENTS,
  equipmentBudget,
  ensureEquipmentFor,
} from './equipmentHelpers'
import { availableLaborSlots } from '../laborSlots'
import type { Rng } from '../rng'

const MAX_CONCURRENT_CARS = 2
/**
 * Never lowballs, pays a modest premium over book - avoiding the
 * lemon-gamble entirely (inspection removes the uncertainty a lowball
 * bid would be compensating for) and, empirically, bidding exactly book
 * value lost almost every contested regional-tier auction by a small
 * margin (valuations can exceed book for a good-condition, well-matched
 * car since Sprint 03's valuation fix). This bot has genuine information
 * (it inspected) that an uninspected AI bidder doesn't get to price in.
 */
const FAIR_BID_MULTIPLIER = 1.1
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
 * Only buys at-or-above fair price, fully restores every zone before
 * selling via list-publicly for the best price the market offers (Sprint 03
 * decision 2). Sprint 26: the inspect-before-bidding step it used to run is
 * gone with the paused hidden-issue/inspection system - every lot is
 * transparent now, so this bot's real edge is patience and a fair-price
 * floor, not information.
 *
 * Targets regional tier once it can - Premium tier's book values (rare,
 * Y2-6M) are out of reach for a Y1.5M-capital, 2-car bot even at fair price,
 * and widening regional itself to *also* include local-yard permanently was
 * tried and made things worse (more transaction volume just accelerated
 * losses on a strategy whose per-cycle margin isn't reliably positive at
 * this time horizon).
 *
 * Sprint 19c harness finding: Sprint 16 gated `regional` behind `local`
 * reputation, and this strategy never did anything that earns reputation
 * (no service jobs; it can't sell a car it never owns) - a catch-22 that
 * left it permanently stuck at `unknown`, unable to ever see a regional lot,
 * completely inert across 1000 real harness seeds (0 cars owned, ever). The
 * fix targets `local-yard` instead *only* while reputation is still
 * `unknown` - a temporary bootstrap phase, not the permanent widening that
 * was already tried and rejected above - since a fully-restored, quality
 * sale (Sprint 15's `saleReputationDeltaFor`) earns real reputation the same
 * way regardless of which tier the car came from. Once reputation clears
 * `local`, every future inspect/bid targets regional again, as originally
 * designed; the same catch-22 Sprint 16 already found and fixed for Service
 * Grinder's equipment access, applied to this bot's auction access instead.
 */
export function cautiousRestorerStrategy(
  state: GameState,
  context: SimContext,
  rng: Rng,
): DayActions {
  const actions: DayActions = emptyDayActions()

  let laborBudget = availableLaborSlots(state)
  const bayBudget = serviceBayBudget(state)
  const equipBudget = equipmentBudget()
  const targetTier: AuctionTier = reputationAtLeast(state.reputationTier, 'local')
    ? 'regional'
    : 'local-yard'

  // 1. Continue any in-progress repair job from a prior day - only if its
  // car is in the service bay. Sprint 19c harness finding: this step was
  // missing entirely - step 4 (repair) only ever started a *new* job on a
  // job-free car; a job that didn't finish the same day it was created
  // (e.g. inspection already spent labor that day, leaving less than
  // REPAIR_LABOR_SLOTS free) sat open forever with no way to ever receive
  // the rest of its labor. Verified via a real day-by-day trace: a job
  // opened at 1/2 labor slots spent, then never touched again for the rest
  // of a 100-day career. Every other bot already has this step; this one
  // just never did.
  for (const job of state.jobs) {
    if (laborBudget <= 0) break
    const need = job.laborSlotsRequired - job.laborSlotsSpent
    if (need <= 0) continue
    if (!claimServiceBay(state, job.carInstanceId, actions, bayBudget)) continue
    const slots = Math.min(need, laborBudget)
    actions.laborAssignments.push({ jobId: job.id, laborSlots: slots })
    laborBudget -= slots
  }

  // 2/3. Join or continue a war on a lot of the current target tier, if
  // there's room for another car (Sprint 26 decision 10/12: lots are
  // transparent now - no separate inspect step, every lot is immediately
  // biddable). Sprint 20: open bidding - `leadingBidder !== 'player'` covers
  // both a fresh lot and one this bot was outbid on but is still willing to
  // chase under its walk-away target.
  if (state.ownedCars.length + activeBidCount(state) < MAX_CONCURRENT_CARS) {
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

  // 4. Repair the cheapest-to-unlock NEEDY component on each owned, job-free
  // car, one zone at a time - tries every needy component in ascending
  // equipment-cost order instead of stopping at the first needy one and
  // giving up on the whole car if THAT component's equipment isn't
  // reachable yet (Sprint 23 fix, real bug found by real measurement, not
  // guessed at). Sprint 19c's original fix reordered the list cheapest-first
  // but still only ever tried the SINGLE first-needy entry via `.find()` -
  // with Sprint 16's reputation-gated equipment ladder (suspension-press
  // needs `local`, welder/transmission-bench need `known`+, per this
  // sprint's own decision 3), a car whose first needy component in the list
  // happened to be reputation-gated deadlocked permanently even when a
  // cheaper, already-reachable component on the SAME car also needed work -
  // and it claimed the shop's only starting service bay while doing it,
  // starving every other owned car too. Now: check obtainability for every
  // needy component (cheapest-first) BEFORE claiming a bay, and only claim
  // one once a real, reachable job is actually found.
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

  // 5. List fully-restored, job-free cars publicly for the best price -
  // "fully restored" means every group's every present part has reached
  // mint (Sprint 26: the old hidden-issue "and issue-free" clause is gone
  // with the paused system).
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id) || carsGettingJobsToday.has(car.id)) continue
    const isRestored = ASCENDING_EQUIPMENT_COST_COMPONENTS.every((id) =>
      isGroupAtLeast(car, id, 'mint', context.partIdsByGroup),
    )
    if (isRestored) {
      actions.listForSale.push({ carInstanceId: car.id })
    }
  }

  return actions
}
