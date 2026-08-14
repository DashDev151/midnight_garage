import type { CashBucket, DayLogEntry, EconomyConfig } from '@midnight-garage/content'
import { CASH_BUCKETS, cashMovementFor } from '@midnight-garage/content'
import { weekIndex } from './calendar'

/** One day's cash movement, broken out into the same five buckets
 * `cashMovementFor` (content/cashLedger.ts) classifies every DayLogEntry
 * into - the flow meter's per-day row. Every bucket is a magnitude summed
 * over the day, never a signed delta, matching `FinanceWeek`'s own shape. */
export type DayFlowRow = { day: number } & Record<CashBucket, number>

function emptyFlowRow(day: number): DayFlowRow {
  return { day, income: 0, onCars: 0, stock: 0, running: 0, investment: 0 }
}

/** Classifies one day's whole log - every entry any resolver produced that
 * day, not only `advanceDay`'s own return - into the five buckets via
 * `cashMovementFor` and nothing else, so this can never drift from the
 * weekly cost sheet's own classification law. */
export function dayFlowFor(day: number, log: readonly DayLogEntry[]): DayFlowRow {
  const row = emptyFlowRow(day)
  for (const entry of log) {
    const movement = cashMovementFor(entry)
    if (!movement) continue
    row[movement.bucket] += movement.amountYen
  }
  return row
}

export type FlowSeries = readonly DayFlowRow[]

/** One week's totals across all five buckets - `FinanceWeek`'s own shape,
 * reused here rather than a second one, since this is the exact figure the
 * reconciliation test proves the series agrees with. */
export type WeeklyFlow = Record<CashBucket, number>

function emptyWeeklyFlow(): WeeklyFlow {
  return { income: 0, onCars: 0, stock: 0, running: 0, investment: 0 }
}

/** Rolls a day-by-day flow series up to `financeLedger`'s own weekly grain
 * (`weekIndex`, the only week arithmetic anywhere), keyed the same way
 * `GameState.financeLedger` is - a plain string of the week number - so a
 * caller can compare the two maps entry for entry. A week with no cash
 * movement at all gets no entry here, matching `bookCashMovements`'s own
 * "a week with no entry simply had no money move in it" rule - an idle day
 * (or ten) must never manufacture a zeroed week `financeLedger` never
 * bothered to record. */
export function weeklyFlowFor(
  series: FlowSeries,
  economy: EconomyConfig,
): Record<string, WeeklyFlow> {
  const weeks: Record<string, WeeklyFlow> = {}
  for (const row of series) {
    if (CASH_BUCKETS.every((bucket) => row[bucket] === 0)) continue
    const key = String(weekIndex(row.day, economy))
    const week = (weeks[key] ??= emptyWeeklyFlow())
    for (const bucket of CASH_BUCKETS) {
      week[bucket] += row[bucket]
    }
  }
  return weeks
}
