import type { BayKind, DayLogEntry, EconomyConfig, GameState } from '@midnight-garage/content'
import { BayKindSchema } from '@midnight-garage/content'
import { isPayday, isRentDay } from './calendar'
import { bayCountsByKind } from './facilities'
import { bookCashMovements } from './financeLedger'

/** This resolver only ever logs its own two entry kinds - narrower than the
 * full `DayLogEntry` union so a caller (or a test summing `amountYen`) never
 * needs to guard against the entry kinds every OTHER resolver can produce. */
export type WeeklyFinanceLogEntry = Extract<DayLogEntry, { type: 'rent-paid' | 'wage-paid' }>

export interface WeeklyFinancesResult {
  state: GameState
  log: WeeklyFinanceLogEntry[]
}

/**
 * Weekly rent: a base plus every owned bay's own per-kind rate, summed
 * (sprint148.md) - `economy.rent.baseWeeklyYen + sum over kinds of
 * (bayCount[kind] * perBayWeeklyYen[kind])`. Replaces the flat constant this
 * used to be: a one-off bay purchase used to be free to hold
 * forever, so unused capacity cost nothing and there was never a reason to
 * sell quickly rather than hold. Takes plain bay counts rather than a
 * `GameState` so it works equally for a live career (`bayCountsByKind`) and
 * a fresh day-1 game the caller has not yet built a full state for
 * (`exportCareers.ts`'s manifest). Sums over `BayKindSchema.options` rather
 * than naming each kind, so the set of kinds has one source: a new kind
 * added to the schema is charged automatically instead of silently going
 * unrented.
 */
export function computeWeeklyRentYen(
  bayCounts: Record<BayKind, number>,
  economy: EconomyConfig,
): number {
  const { baseWeeklyYen, perBayWeeklyYen } = economy.rent
  return BayKindSchema.options.reduce(
    (totalYen, kind) => totalYen + bayCounts[kind] * perBayWeeklyYen[kind],
    baseWeeklyYen,
  )
}

/**
 * Deducts rent and every staff member's wage on their own named days
 * (GDD 6.2; sprint149.md) - `calendar.rentDayOfWeek` and
 * `calendar.paydayOfWeek`, separately, rather than the single 7-day
 * boundary both used to share. Each still falls exactly once per
 * `calendar.daysPerWeek`-day span, so the amount charged per week is
 * unchanged; only which day it lands on differs, and rent/wages no longer
 * land as one undifferentiated subtraction.
 */
export function applyWeeklyRentAndWages(
  state: GameState,
  economy: EconomyConfig,
): WeeklyFinancesResult {
  const log: WeeklyFinanceLogEntry[] = []
  let cashYen = state.cashYen

  if (isRentDay(state.day, economy)) {
    const rentYen = computeWeeklyRentYen(bayCountsByKind(state), economy)
    cashYen -= rentYen
    log.push({ type: 'rent-paid', amountYen: -rentYen })
  }

  if (isPayday(state.day, economy)) {
    for (const member of state.staff) {
      cashYen -= member.weeklyWageYen
      log.push({ type: 'wage-paid', staffId: member.id, amountYen: -member.weeklyWageYen })
    }
  }

  if (log.length === 0) {
    return { state, log: [] }
  }

  return { state: bookCashMovements({ ...state, cashYen }, log, economy), log }
}
