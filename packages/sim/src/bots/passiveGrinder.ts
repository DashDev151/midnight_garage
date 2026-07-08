import { emptyDayActions, type DayActions } from '../actions'

/**
 * The do-nothing control group (Sprint 03 decision 2): never buys, never
 * repairs, never sells. Exists to prove rent pressure is real — if a
 * Passive Grinder doesn't visibly bleed cash toward the debt spiral,
 * nothing else in the economy actually matters.
 */
export function passiveGrinderStrategy(): DayActions {
  return emptyDayActions()
}
