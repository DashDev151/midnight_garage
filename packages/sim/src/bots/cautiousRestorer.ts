import type { ComponentId, GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { acquireLot, activeBidCount, auctionAcquisitionBudget } from './buyoutHelpers'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
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
const REPAIRABLE_COMPONENTS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'body',
  'interior',
]

/**
 * Always inspects before bidding, only buys at-or-above fair price, fully
 * restores every zone before selling via list-publicly for the best
 * price the market offers (Sprint 03 decision 2).
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

  // 1. Inspect one uninspected regional lot per day. Premium tier's book
  // values (rare, Y2-6M) are out of reach for a Y1.5M-capital, 2-car bot
  // even at fair price — restricting to regional keeps trades affordable.
  // (Widening to include local-yard was tried and made things worse —
  // more transaction volume just accelerated losses on a strategy whose
  // per-cycle margin isn't reliably positive at this time horizon; see
  // the sprint doc's note on this bot's known limitation.)
  const uninspected = state.activeAuctionLots.filter(
    (lot) => !lot.inspected && lot.tier === 'regional',
  )
  if (uninspected.length > 0 && laborBudget > 0) {
    actions.inspectLots.push({ lotId: rng.pick(uninspected).id })
    laborBudget -= 1
  }

  // 2. Bid fair value on an already-inspected lot, if there's room for another car.
  if (state.ownedCars.length + activeBidCount(state) < MAX_CONCURRENT_CARS) {
    const inspected = state.activeAuctionLots.filter(
      (lot) =>
        lot.inspected &&
        lot.playerMaxBidYen === null &&
        state.cashYen >= lot.bookValueYen * CASH_BUFFER_MULTIPLIER,
    )
    if (inspected.length > 0) {
      const chosen = rng.pick(inspected)
      const model = context.modelsById[chosen.modelId]
      const maxBidYen = Math.round(chosen.bookValueYen * FAIR_BID_MULTIPLIER)
      acquireLot(
        state,
        chosen,
        model,
        maxBidYen,
        actions,
        context,
        auctionAcquisitionBudget(state),
        CASH_BUFFER_MULTIPLIER,
      )
    }
  }

  // 3. Repair every owned, job-free car one zone at a time.
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

  // 4. List fully-restored, job-free cars publicly for the best price.
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
