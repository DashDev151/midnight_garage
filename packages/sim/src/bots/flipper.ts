import type { ComponentId, GameState } from '@midnight-garage/content'
import { emptyDayActions, type DayActions } from '../actions'
import { claimServiceBay, serviceBayBudget } from './bayHelpers'
import type { SimContext } from '../context'
import type { Rng } from '../rng'

const MAX_CONCURRENT_CARS = 3
const MAX_BIDS_PER_DAY = 2
const PLAYER_LABOR_SLOTS = 2 // flipper never hires staff
/**
 * Bid book value itself, not a lowball fraction of it. Empirically (this
 * sprint's balance harness), lowballing toward the reserve floor never
 * wins against the AI bidder pool — the second-price auction already
 * extracts most of a car's value at auction time, so a bid needs to be
 * competitive to win at all; the flip's margin comes from the repair
 * value-add (below), not from buying at an artificial discount.
 */
const BID_FRACTION_OF_BOOK = 1.0
const CASH_BUFFER_MULTIPLIER = 1.3
/** Shitbox-range only — local-yard also carries Common-tier lots (e.g. an
 * EG6 at 650k book) whose much larger absolute swings don't fit a bot
 * that does one cheap repair and flips fast. */
const MAX_TARGET_BOOK_VALUE_YEN = 300_000
/**
 * One cheap repair (the worst zone) before flipping — not a full
 * restoration, but enough real value-add to make a flip profitable.
 * Buying near the competitive auction price and reselling the same car
 * instantly, untouched, is structurally a break-even-or-losing trade —
 * no value was added, so there's nothing to sell for more than was
 * paid. GDD 9.0's own first-flip example includes an oil change, not a
 * same-day resale.
 */
const QUICK_REPAIR_LABOR_SLOTS = 2
const REPAIRABLE_COMPONENTS: readonly ComponentId[] = [
  'engine',
  'drivetrain',
  'suspension',
  'body',
  'interior',
]

/**
 * Buy rough at a discount, do one quick repair, flip fast (GDD 9.0's
 * "buy it when you see it" fantasy, lightly built rather than restored).
 */
export function flipperStrategy(state: GameState, _context: SimContext, rng: Rng): DayActions {
  const actions: DayActions = emptyDayActions()

  let laborBudget = PLAYER_LABOR_SLOTS
  const bayBudget = serviceBayBudget(state)

  // 1. Continue any in-progress repair job from a prior day — only if its
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
    const worstComponent = REPAIRABLE_COMPONENTS.reduce((worst, id) =>
      car.components[id].condition < car.components[worst].condition ? id : worst,
    )
    if (car.components[worstComponent].condition >= 90) continue
    if (!claimServiceBay(state, car.id, actions, bayBudget)) continue

    const jobIndex = actions.createJobs.length
    actions.createJobs.push({
      carInstanceId: car.id,
      kind: 'repair-zone',
      componentId: worstComponent,
      laborSlotsRequired: QUICK_REPAIR_LABOR_SLOTS,
    })
    const slots = Math.min(QUICK_REPAIR_LABOR_SLOTS, laborBudget)
    actions.laborAssignments.push({ jobId: `job-${state.day}-${jobIndex}`, laborSlots: slots })
    laborBudget -= slots
    jobbedCarIds.add(car.id)
  }

  // 3. Sell any car whose repair is done and has no open job.
  for (const car of state.ownedCars) {
    if (jobbedCarIds.has(car.id)) continue
    actions.sellViaWalkIn.push({ carInstanceId: car.id })
  }

  // 4. Bid on fresh, cheap local-yard lots if there's room for another car.
  const roomForMoreCars = MAX_CONCURRENT_CARS - state.ownedCars.length
  if (roomForMoreCars > 0) {
    const candidates = [...state.activeAuctionLots]
      .filter((lot) => lot.tier === 'local-yard' && lot.bookValueYen <= MAX_TARGET_BOOK_VALUE_YEN)
      .sort(() => rng.next() - 0.5)

    let cashCommitted = 0
    const bidCap = Math.min(MAX_BIDS_PER_DAY, roomForMoreCars)
    for (const lot of candidates) {
      if (actions.bidsOnLots.length >= bidCap) break
      const maxBidYen = Math.round(lot.bookValueYen * BID_FRACTION_OF_BOOK)
      if (state.cashYen < (cashCommitted + maxBidYen) * CASH_BUFFER_MULTIPLIER) continue
      actions.bidsOnLots.push({ lotId: lot.id, maxBidYen })
      cashCommitted += maxBidYen
    }
  }

  return actions
}
