import type { BayKind, DayLogEntry, EconomyConfig, GameState } from '@midnight-garage/content'
import { bayCountsByKind } from './facilities'

export interface WeeklyFinancesResult {
  state: GameState
  log: DayLogEntry[]
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
 * (`exportCareers.ts`'s manifest).
 */
export function computeWeeklyRentYen(
  bayCounts: Record<BayKind, number>,
  economy: EconomyConfig,
): number {
  const { baseWeeklyYen, perBayWeeklyYen } = economy.rent
  return (
    baseWeeklyYen +
    bayCounts.service * perBayWeeklyYen.service +
    bayCounts.parking * perBayWeeklyYen.parking +
    bayCounts.forecourt * perBayWeeklyYen.forecourt
  )
}

/** Deducts rent + every staff member's wage on 7-day boundaries (GDD 6.2). */
export function applyWeeklyRentAndWages(
  state: GameState,
  economy: EconomyConfig,
): WeeklyFinancesResult {
  if (state.day % 7 !== 0) {
    return { state, log: [] }
  }

  const rentYen = computeWeeklyRentYen(bayCountsByKind(state), economy)
  const log: DayLogEntry[] = [{ type: 'rent-paid', amountYen: -rentYen }]
  let cashYen = state.cashYen - rentYen

  for (const member of state.staff) {
    cashYen -= member.weeklyWageYen
    log.push({ type: 'wage-paid', staffId: member.id, amountYen: -member.weeklyWageYen })
  }

  return { state: { ...state, cashYen }, log }
}
