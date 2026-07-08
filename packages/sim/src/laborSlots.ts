import type { GameState } from '@midnight-garage/content'
import { PLAYER_BASE_LABOR_SLOTS, STAFF_HUSTLE_BONUS_THRESHOLD } from './constants'

/** Total labor slots available today: player base + one bonus slot per high-Hustle staff member. */
export function availableLaborSlots(state: GameState): number {
  const staffBonus = state.staff.filter(
    (member) => member.stats.hustle >= STAFF_HUSTLE_BONUS_THRESHOLD,
  ).length
  return PLAYER_BASE_LABOR_SLOTS + staffBonus
}
