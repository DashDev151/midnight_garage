import type { DayLogEntry, EconomyConfig, FinanceWeek, GameState } from '@midnight-garage/content'
import { EMPTY_FINANCE_WEEK, addCashMovement, cashMovementFor } from '@midnight-garage/content'
import { weekIndex } from './calendar'

/**
 * Posts a log's cash movements onto `state.day`'s week in the finance ledger,
 * classified by `cashMovementFor` and nothing else.
 *
 * **Call this exactly where the entries are BUILT, never where a nested
 * result is forwarded.** Every resolver books the entries it constructs
 * itself, and a caller that merely passes a nested log upward books nothing -
 * that rule is what keeps a movement from being counted twice when
 * `advanceDay` drives the same resolver a player's click does. Entries that
 * move no cash are skipped, so calling it on a log that happens to carry none
 * is a free no-op.
 *
 * Week, not day: a week holds exactly one rent charge and exactly one payday,
 * `daysPerMonth` is four clean weeks so a month is four rows, and `weekIndex`
 * is the only week arithmetic anywhere.
 */
export function bookCashMovements(
  state: GameState,
  log: readonly DayLogEntry[],
  economy: EconomyConfig,
): GameState {
  const ledger = state.financeLedger ?? {}
  const key = String(weekIndex(state.day, economy))
  let week: FinanceWeek | null = null
  for (const entry of log) {
    const movement = cashMovementFor(entry)
    if (!movement || movement.amountYen === 0) continue
    week ??= ledger[key] ?? EMPTY_FINANCE_WEEK
    week = addCashMovement(week, movement)
  }
  if (week === null) return state
  return { ...state, financeLedger: { ...ledger, [key]: week } }
}
