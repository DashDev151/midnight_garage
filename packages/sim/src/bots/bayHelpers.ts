import type { GameState } from '@midnight-garage/content'
import type { DayActions } from '../actions'

/**
 * Mutable free-service-bay counter a bot threads through a batch of cars in
 * one day's decision, so each car's claim on a bay is accounted for before
 * the next car is considered (the bay is a shared, scarce resource across
 * every job the bot might want to work today).
 */
export interface ServiceBayBudget {
  free: number
}

export function serviceBayBudget(state: GameState): ServiceBayBudget {
  // `serviceBayCarIds` is a fixed-length indexed array (one entry per
  // physical bay, `null` = empty); free slots are a null count.
  return { free: state.serviceBayCarIds.filter((id) => id === null).length }
}

/**
 * If `carId` isn't already in the service bay, queues a move for it when
 * there's room left in `budget`. Returns whether the car is (or will be) in
 * the bay this tick - a bot only queues labor for a car this returns true
 * for, since a job on a parked car makes no progress (advanceDay's labor
 * step gates on service-bay membership). Shared by every repair-driven bot
 * so "respect bay capacity" is one implementation, not five that can drift.
 */
export function claimServiceBay(
  state: GameState,
  carId: string,
  actions: DayActions,
  budget: ServiceBayBudget,
): boolean {
  if (state.serviceBayCarIds.includes(carId)) return true
  if (budget.free <= 0) return false
  actions.moveCars.push({ carInstanceId: carId, to: 'service' })
  budget.free -= 1
  return true
}
