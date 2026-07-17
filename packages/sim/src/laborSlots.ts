import type { GameState } from '@midnight-garage/content'
import { PLAYER_BASE_LABOR_SLOTS } from './constants'

/**
 * Total labour slots available today (Sprint 80 crew model, R3): the player's
 * base plus every BENCH-assigned member's own `laborSlotsPerDay` (1 or 2). A
 * pair of hands is a pair of hands - no hustle threshold. Contract-assigned
 * members are busy on the fleet retainer and add nothing here. Reads the
 * effective `assignment`, so a reassignment scheduled today only shifts the
 * pool from tomorrow (`commitPendingStaffAssignments`).
 */
export function availableLaborSlots(state: GameState): number {
  const benchSlots = state.staff.reduce(
    (sum, member) => (member.assignment === 'bench' ? sum + member.laborSlotsPerDay : sum),
    0,
  )
  return PLAYER_BASE_LABOR_SLOTS + benchSlots
}
