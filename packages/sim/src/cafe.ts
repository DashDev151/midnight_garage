import type { DayLogEntry, GameState } from '@midnight-garage/content'
import type { SimContext } from './context'
import { bookCashMovements } from './financeLedger'

/**
 * The cafe across the street from the garage: a coffee round buys labour
 * back today for cash instead of waiting for tomorrow's refill. It only
 * refunds points already spent, so it never lifts the pool's own ceiling
 * (`energyMax`, laborSlots.ts) and never advances the day - the same
 * same-day cash-purchase shape `resolveHireDyno` (dyno.ts) and
 * `resolveHireToolLine` (jobs.ts) already use.
 */

/** How many coffee rounds have already been bought today, or 0 on a day with
 * none yet - the count reads as stale (and so as zero) the moment `day` no
 * longer matches `state.day`. */
export function coffeesBoughtToday(state: GameState): number {
  return state.cafeCoffeesBoughtToday?.day === state.day ? state.cafeCoffeesBoughtToday.count : 0
}

/** What today's round costs: the shop buys for the whole crew, so the price
 * scales with every staff member on the payroll, bench or contract alike -
 * the same headcount `applyWeeklyRentAndWages` pays a wage to. */
export function coffeePriceYen(state: GameState, context: SimContext): number {
  const { coffeeBasePriceYen, coffeePerStaffYen } = context.economy.cafe
  return coffeeBasePriceYen + coffeePerStaffYen * state.staff.length
}

export type BuyCoffeeGateReason = 'day-limit' | 'pool-full' | 'no-cash'

/**
 * Why today's round is refused, or `null` when nothing refuses it. Checked
 * in the order a player would run into them: the day's own cap first (no
 * amount of cash buys a round past it), then whether there is any spent
 * labour left to hand back at all (a full pool has nothing to buy back, so
 * a round would spend cash for no benefit), then cash.
 */
export function buyCoffeeGateReason(
  state: GameState,
  context: SimContext,
): BuyCoffeeGateReason | null {
  if (coffeesBoughtToday(state) >= context.economy.cafe.maxPurchasesPerDay) return 'day-limit'
  if (state.energySpentToday <= 0) return 'pool-full'
  return state.cashYen < coffeePriceYen(state, context) ? 'no-cash' : null
}

export interface BuyCoffeeResult {
  state: GameState
  log: DayLogEntry[]
  applied: boolean
}

/**
 * Buys one coffee round: charges the full price and hands back labour
 * against what is actually still spent today, clamped so the pool can never
 * read above its own maximum. Any refusal (`buyCoffeeGateReason`) is a
 * silent no-op with nothing charged, the same shape every other same-day
 * cash purchase in this codebase uses.
 */
export function resolveBuyCoffee(state: GameState, context: SimContext): BuyCoffeeResult {
  if (buyCoffeeGateReason(state, context) !== null) return { state, log: [], applied: false }
  const { coffeeLabourPoints } = context.economy.cafe
  const priceYen = coffeePriceYen(state, context)
  const labourPoints = Math.min(coffeeLabourPoints, state.energySpentToday)
  const log: DayLogEntry[] = [{ type: 'coffee-bought', priceYen, labourPoints }]
  const next: GameState = {
    ...state,
    cashYen: state.cashYen - priceYen,
    energySpentToday: state.energySpentToday - labourPoints,
    cafeCoffeesBoughtToday: { day: state.day, count: coffeesBoughtToday(state) + 1 },
  }
  return { state: bookCashMovements(next, log, context.economy), log, applied: true }
}
