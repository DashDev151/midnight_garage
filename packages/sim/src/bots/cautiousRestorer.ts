import type { AuctionTier, ComponentId, GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import {
  acquireLot,
  activeBidCount,
  auctionAcquisitionBudget,
  walkAwayTargetYen,
} from './buyoutHelpers'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import { reputationAtLeast } from '../calendar'
import type { SimContext } from '../context'
import { equipmentBudget, ensureEquipmentFor } from './equipmentHelpers'
import { availableLaborSlots } from '../laborSlots'
import type { Rng } from '../rng'

const MAX_CONCURRENT_CARS = 2
/**
 * Never lowballs, pays a modest premium over book — avoiding the
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
 * — more than the Y1.5M starting capital — so the bot inspected every
 * lot it saw, every single day, and never once could afford to bid. A
 * bot that only ever pays fees and never transacts isn't "cautious," it's
 * inert. 1.15 keeps a real safety margin without being unaffordable.
 */
const CASH_BUFFER_MULTIPLIER = 1.15
const REPAIR_THRESHOLD = 90
const REPAIR_LABOR_SLOTS = 2
/**
 * Ordered by ascending equipment price (equipment.json: upholstery-bench
 * Y350k, suspension-press Y400k, welder Y700k, transmission-bench Y900k,
 * engine-crane Y1.5M — more than this bot's entire starting capital on its
 * own), not the arbitrary engine-first order used elsewhere. Sprint 19c
 * harness finding: step 3 below repairs only the *first* needy component in
 * this list and gives up on the whole car for the day if that one
 * component's equipment is unaffordable — with the old engine-first order,
 * any car needing engine work (a plurality, given the 30-90 baseline roll)
 * permanently deadlocked this bot the instant it owned a car: it could never
 * afford the single most expensive tool in the game, first, every time,
 * verified via a real day-by-day trace (0 equipment ever bought, 0 repairs
 * ever started, across every seed checked). Cheapest-first gives it a real
 * shot at unlocking *something* with whatever cash survived acquisition.
 */
const REPAIRABLE_COMPONENTS: readonly ComponentId[] = [
  'interior',
  'suspension',
  'body',
  'drivetrain',
  'engine',
]

/**
 * Always inspects before bidding, only buys at-or-above fair price, fully
 * restores every zone before selling via list-publicly for the best
 * price the market offers (Sprint 03 decision 2).
 *
 * Targets regional tier once it can — Premium tier's book values (rare,
 * Y2-6M) are out of reach for a Y1.5M-capital, 2-car bot even at fair price,
 * and widening regional itself to *also* include local-yard permanently was
 * tried and made things worse (more transaction volume just accelerated
 * losses on a strategy whose per-cycle margin isn't reliably positive at
 * this time horizon).
 *
 * Sprint 19c harness finding: Sprint 16 gated `regional` behind `local`
 * reputation, and this strategy never did anything that earns reputation
 * (no service jobs; it can't sell a car it never owns) — a catch-22 that
 * left it permanently stuck at `unknown`, unable to ever see a regional lot,
 * completely inert across 1000 real harness seeds (0 cars owned, ever). The
 * fix targets `local-yard` instead *only* while reputation is still
 * `unknown` — a temporary bootstrap phase, not the permanent widening that
 * was already tried and rejected above — since a fully-restored, quality
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

  // 1. Continue any in-progress repair job from a prior day — only if its
  // car is in the service bay. Sprint 19c harness finding: this step was
  // missing entirely — step 4 (repair) only ever started a *new* job on a
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

  // 2. Inspect one uninspected lot of the current target tier per day.
  const uninspected = state.activeAuctionLots.filter(
    (lot) => !lot.inspected && lot.tier === targetTier,
  )
  if (uninspected.length > 0 && laborBudget > 0) {
    actions.inspectLots.push({ lotId: rng.pick(uninspected).id })
    laborBudget -= 1
  }

  // 3. Join or continue a war on an already-inspected lot, if there's room
  // for another car (Sprint 20: open bidding — `leadingBidder !== 'player'`
  // covers both a fresh lot and one this bot was outbid on but is still
  // willing to chase under its walk-away target).
  if (state.ownedCars.length + activeBidCount(state) < MAX_CONCURRENT_CARS) {
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

  // 4. Repair every owned, job-free car one zone at a time.
  const jobbedCarIds = new Set(state.jobs.map((job) => job.carInstanceId))
  const carsGettingJobsToday = new Set<string>()
  for (const car of state.ownedCars) {
    if (laborBudget <= 0) break
    if (jobbedCarIds.has(car.id)) continue
    const componentId = REPAIRABLE_COMPONENTS.find(
      (id) => car.components[id].condition < REPAIR_THRESHOLD,
    )
    if (!componentId) continue
    if (!claimServiceBay(state, car.id, actions, bayBudget)) continue
    if (
      !ensureEquipmentFor(state, componentId, actions, context, equipBudget, CASH_BUFFER_MULTIPLIER)
    )
      continue

    const jobIndex = actions.createJobs.length
    actions.createJobs.push({
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId,
      laborSlotsRequired: REPAIR_LABOR_SLOTS,
    })
    const slotsToApply = Math.min(REPAIR_LABOR_SLOTS, laborBudget)
    // Matches advanceDay's job-id scheme exactly: `job-${day}-${index}`.
    actions.laborAssignments.push({
      jobId: `job-${state.day}-${jobIndex}`,
      laborSlots: slotsToApply,
    })
    laborBudget -= slotsToApply
    carsGettingJobsToday.add(car.id)
  }

  // 5. List fully-restored, job-free cars publicly for the best price.
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id) || carsGettingJobsToday.has(car.id)) continue
    const isRestored = REPAIRABLE_COMPONENTS.every(
      (id) => car.components[id].condition >= REPAIR_THRESHOLD,
    )
    if (isRestored) {
      actions.listForSale.push({ carInstanceId: car.id })
    }
  }

  return actions
}
