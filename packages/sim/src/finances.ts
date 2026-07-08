import type { DayLogEntry, GameState } from '@midnight-garage/content'
import { WEEKLY_RENT_YEN } from './constants'

export interface WeeklyFinancesResult {
  state: GameState
  log: DayLogEntry[]
}

/** Deducts rent + every staff member's wage on 7-day boundaries (GDD 6.2). */
export function applyWeeklyRentAndWages(state: GameState): WeeklyFinancesResult {
  if (state.day % 7 !== 0) {
    return { state, log: [] }
  }

  const log: DayLogEntry[] = [{ type: 'rent-paid', amountYen: -WEEKLY_RENT_YEN }]
  let cashYen = state.cashYen - WEEKLY_RENT_YEN

  for (const member of state.staff) {
    cashYen -= member.weeklyWageYen
    log.push({ type: 'wage-paid', staffId: member.id, amountYen: -member.weeklyWageYen })
  }

  return { state: { ...state, cashYen }, log }
}
