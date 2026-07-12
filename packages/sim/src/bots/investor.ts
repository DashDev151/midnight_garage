import type { ComponentId, GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { worstGroup } from './bandHelpers'
import { presentPartIdsInGroup } from '../bands'
import {
  acquireLot,
  activeBidCount,
  auctionAcquisitionBudget,
  walkAwayTargetYen,
} from './buyoutHelpers'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import type { SimContext } from '../context'
import { INSTALL_LABOR_SLOTS } from '../constants'
import { availableLaborSlots } from '../laborSlots'
import type { Rng } from '../rng'
import { decideSale } from './sellingHelpers'

const MAX_CONCURRENT_CARS = 2
const MIN_TARGET_BOOK_VALUE_YEN = 150_000
const MAX_TARGET_BOOK_VALUE_YEN = 1_500_000
const FAIR_BID_MULTIPLIER = 1.0
const CASH_BUFFER_MULTIPLIER = 1.2
/** Sprint 31 decision 4: accept an offer once it clears this fraction of the
 * car's best-fit valuation, or once it's been for-sale this many days. */
const ACCEPT_FRACTION = 0.85
const MAX_HOLDING_DAYS = 12

/** Sprint 26: the 6 real component groups (`forcedInduction` folded into
 * `engine`, `brakes` folded into `suspension`). */
const ALL_COMPONENTS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'wheels',
  'body',
  'interior',
]

/**
 * Sprint 13: the control for the payback-curve question - never buys
 * equipment, ever, and restores cars entirely through Replace (buy a
 * catalog part, install it) instead of Repair. Every component is fair game
 * (not just the 5 that feed stat formulas), since Replace was always
 * available everywhere and Investor's whole premise is "skip the
 * investment, pay per-job instead." Should end up *worse* than Handyman
 * post-investment (paying full part price every time beats no restoration
 * at all, but loses to labor-only repair once the tool's paid for) - the
 * harness's payback-curve columns (sprint13.md decision 11) are what turn
 * that "should" into a measured fact.
 *
 * The one piece of real complexity: an install-part job needs a real
 * `partInstanceId` that only exists once `resolveBuyPart`'s queued purchase
 * resolves - but bots decide their whole day from one immutable state
 * snapshot, and `buyParts` resolves *after* `createJobs` in advanceDay's
 * step order. So the id is predicted the same way bots already predict
 * `job-${day}-${i}` ids: `resolveBuyPart` assigns `part-${day}-${index}`,
 * `index` starting at `state.partInventory.length` and counting up once per
 * part this bot queues this same tick.
 */
export function investorStrategy(state: GameState, context: SimContext, rng: Rng): DayActions {
  const actions: DayActions = emptyDayActions()

  let laborBudget = availableLaborSlots(state)
  const bayBudget = serviceBayBudget(state)
  let nextPartIndex = state.partInventory.length
  // Tracks cash already committed to a part queued earlier *this same tick*
  // - without it, two cars each independently checking the same undiminished
  // `state.cashYen` could both queue a purchase the shop can't actually
  // afford both of, leaving the second install job referencing a part that
  // never lands in inventory (a hard crash in applyJobToCar, not a graceful
  // no-op - resolveBuyPart's own affordability check happens later, at
  // resolution time, using whichever cash is left by then).
  let cashCommitted = 0

  // 1. Continue any in-progress install job from a prior day.
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

  // 2. Replace one empty component per job-free owned car: buy the cheapest
  // fitting catalog part, install it. A component with nothing installed is
  // the only thing Investor can act on - an occupied-but-worn component
  // would need Repair, which this bot refuses to ever do.
  for (const car of state.ownedCars) {
    if (laborBudget <= 0) break
    if (jobbedCarIds.has(car.id)) continue
    const model = context.modelsById[car.modelId]
    if (!model) continue

    const emptyComponents = ALL_COMPONENTS.filter((id) =>
      presentPartIdsInGroup(car, id, context.partIdsByGroup).some(
        (partId) => !car.parts[partId].installed,
      ),
    )
    if (emptyComponents.length === 0) continue
    const worstEmpty = worstGroup(car, emptyComponents, context.partIdsByGroup)

    const fitting = context.parts
      .filter(
        (p) =>
          context.partsTaxonomyById[p.carPartId]?.group === worstEmpty &&
          p.requiredTags.every((t) => model.tags.includes(t)),
      )
      .sort((a, b) => a.priceYen - b.priceYen)
    const part = fitting[0]
    if (!part || state.cashYen < (cashCommitted + part.priceYen) * CASH_BUFFER_MULTIPLIER) continue

    if (!claimServiceBay(state, car.id, actions, bayBudget)) continue

    // Sprint 14: pinned to express, not a policy choice. The predicted
    // partInstanceId below is referenced by this same tick's install job -
    // only an express (same-day) purchase actually creates that PartInstance
    // in time; a standard order wouldn't land until a later day's delivery
    // step, and the install job would crash looking for a part that doesn't
    // exist yet. Thematically apt anyway: Investor pays full retail for
    // speed just as readily as it skips investing in equipment.
    actions.buyParts.push({ partId: part.id, deliverySpeed: 'express' })
    cashCommitted += part.priceYen
    const partInstanceId = `part-${state.day}-${nextPartIndex}`
    nextPartIndex += 1

    const jobIndex = actions.createJobs.length
    actions.createJobs.push({
      carInstanceId: car.id,
      kind: 'install-part',
      componentId: worstEmpty,
      partInstanceId,
      laborSlotsRequired: INSTALL_LABOR_SLOTS,
    })
    const slots = Math.min(INSTALL_LABOR_SLOTS, laborBudget)
    actions.laborAssignments.push({ jobId: `job-${state.day}-${jobIndex}`, laborSlots: slots })
    laborBudget -= slots
    jobbedCarIds.add(car.id)
  }

  // 3. Sell any job-free car with nothing left worth replacing cheaply -
  // "good enough" for Investor means every component has *something*
  // installed, not that every condition is high (it never repairs).
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id)) continue
    const isBuilt = ALL_COMPONENTS.every((id) =>
      presentPartIdsInGroup(car, id, context.partIdsByGroup).every(
        (partId) => car.parts[partId].installed !== null,
      ),
    )
    if (!isBuilt) continue
    decideSale(state, car, context, actions, {
      acceptFraction: ACCEPT_FRACTION,
      maxHoldingDays: MAX_HOLDING_DAYS,
    })
  }

  // 4. Join or continue a war on a mid-priced lot if there's room for
  // another car (Sprint 20: open bidding - `leadingBidder !== 'player'`
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
