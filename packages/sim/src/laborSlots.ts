import type { EconomyConfig, GameState } from '@midnight-garage/content'

/**
 * The shop's daily labour pool in energy points (Sprint 94 - the energy bar):
 * the content base (`economy.energy.basePoolPoints`) plus every BENCH-assigned
 * member's own contribution (`laborSlotsPerDay x economy.energy.pointsPerLabour`
 * - a pair of hands is a pair of hands, no hustle threshold). Staff loosen the
 * day by RAISING this ceiling, per the maintainer ruling; the tool tier loosens
 * it from the other side by making each repair cost fewer points (`bands.ts`).
 * Contract-assigned members are busy on the fleet retainer and add nothing here.
 * Reads the effective `assignment`, so a reassignment scheduled today only
 * shifts the pool from tomorrow (`commitPendingStaffAssignments`).
 *
 * Pre-Sprint-94 this was `availableLaborSlots`, an integer slot count; the unit
 * is now fine-grained integer points (1 old slot = `pointsPerLabour`), which is
 * what lets a tier be a genuine fraction of a slot's work while every quantity
 * stays an integer (determinism - no floats in sim).
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
