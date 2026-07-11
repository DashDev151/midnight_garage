import type { DayLogEntry, EconomyConfig, GameState } from '@midnight-garage/content'

export interface WeeklyFinancesResult {
  state: GameState
  log: DayLogEntry[]
}

/** Deducts rent + every staff member's wage on 7-day boundaries (GDD 6.2). */
export function applyWeeklyRentAndWages(
  state: GameState,
  economy: EconomyConfig,
): WeeklyFinancesResult {
  if (state.day % 7 !== 0) {
    return { state, log: [] }
  }

  const log: DayLogEntry[] = [{ type: 'rent-paid', amountYen: -economy.WEEKLY_RENT_YEN }]
  let cashYen = state.cashYen - economy.WEEKLY_RENT_YEN

  for (const member of state.staff) {
    cashYen -= member.weeklyWageYen
    log.push({ type: 'wage-paid', staffId: member.id, amountYen: -member.weeklyWageYen })
  }

  return { state: { ...state, cashYen }, log }
}
