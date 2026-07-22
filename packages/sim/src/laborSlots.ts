import type { EconomyConfig, GameState } from '@midnight-garage/content'

/**
 * The shop's daily labour pool in energy points: the content base
 * (`economy.energy.basePoolPoints`) plus every BENCH-assigned member's
 * own contribution (`laborSlotsPerDay x economy.energy.pointsPerLabour`
 * - a pair of hands is a pair of hands, no hustle threshold). Staff
 * loosen the day by RAISING this ceiling; the tool tier loosens it from
 * the other side by making each repair cost fewer points (`bands.ts`).
 * Contract-assigned members are busy on the fleet retainer and add
 * nothing here. Reads the effective `assignment`, so a reassignment
 * scheduled today only shifts the pool from tomorrow
 * (`commitPendingStaffAssignments`).
 *
 * The unit is fine-grained integer points, not a flat slot count - this
 * lets a tool tier be a genuine fraction of a slot's work while every
 * quantity stays an integer (determinism - no floats in sim).
 */
export function energyMax(state: GameState, economy: EconomyConfig): number {
  const { basePoolPoints, pointsPerLabour } = economy.energy
  const benchPoints = state.staff.reduce(
    (sum, member) =>
      member.assignment === 'bench' ? sum + member.laborSlotsPerDay * pointsPerLabour : sum,
    0,
  )
  return basePoolPoints + benchPoints
}
