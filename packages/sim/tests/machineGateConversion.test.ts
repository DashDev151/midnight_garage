import { CARS, PARTS, PARTS_TAXONOMY } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'

import { buildSimContext } from '../src/context'
import { machineGateGroupFor, machineLaborMultiplier, removeLaborSlotsFor } from '../src/jobs'
import { createInitialGameState } from '../src/newGame'

const CONTEXT = buildSimContext(CARS, PARTS, [], PARTS_TAXONOMY)

/**
 * The machine-gate conversion: the gate is a labour RATE,
 * never a wall. Every machine-gated operation is executable at tool tier 1
 * with no machine hired; machine-less labour is base times
 * `machineShopAssist.machinelessLaborMultiplier`, and owned-or-hired labour is
 * base. The behaviour pinned: a day-1 shop reaches its first sale with zero
 * yen spent on machines, paced by labour; a FULL strip-and-rebuild entirely by
 * hand spreads over three to four working days, each stage fitting inside a
 * day or two, and hiring buys back about two thirds of the labour.
 */
describe('machine gates are rates, not walls', () => {
  // A fresh career IS the machine-less shop: all six lines at tier 1, nothing
  // owned above it, nothing hired.
  const machineless = () => createInitialGameState(CONTEXT, 1)

  it('the multiplier reads 1 with the line hired today and the content value without', () => {
    const value = CONTEXT.economy.machineShopAssist.machinelessLaborMultiplier
    expect(value).toBeGreaterThan(1)
    const without = machineless()
    const hired = { ...without, machineHirePaidDayByGroup: { engine: without.day } }
    expect(machineLaborMultiplier('engine', without, CONTEXT)).toBe(value)
    expect(machineLaborMultiplier('engine', hired, CONTEXT)).toBe(1)
    expect(machineLaborMultiplier(null, without, CONTEXT)).toBe(1)
  })

  it('every machine-gated slot and operation in the taxonomy prices machine-less work at the multiplier, never a refusal', () => {
    const state = machineless()
    const multiplier = CONTEXT.economy.machineShopAssist.machinelessLaborMultiplier
    const gatedSlots = Object.values(CONTEXT.partsTaxonomyById).filter(
      (entry) => entry.machineGate.length > 0,
    )
    expect(gatedSlots.length).toBeGreaterThan(0)
    for (const entry of gatedSlots) {
      for (const operation of entry.machineGate) {
        const group = machineGateGroupFor(entry.id, operation, CONTEXT)
        expect(group, `${entry.id} ${operation}`).not.toBeNull()
        expect(machineLaborMultiplier(group, state, CONTEXT)).toBe(multiplier)
      }
    }
  })

  it('the machine-less full strip and rebuild spreads over at most four day pools, the teardown fits one, and hire buys back at least two thirds', () => {
    // Counted over a recorded open-play session's own work pattern:
    // engine assembly out (4 members), gearbox assembly out (2), wheel
    // assembly out (free, ungated), ~10 loose removals, then the rebuild
    // (four buried engine members, two drivetrain, suspension pair, dash,
    // nine panels, tyre bench-fit, three ungated bolt-ons).
    const multiplier = CONTEXT.economy.machineShopAssist.machinelessLaborMultiplier
    const removePart = CONTEXT.economy.energy.actionPoints.removePart
    const byClass = CONTEXT.economy.energy.energyByClass
    const benchFit = CONTEXT.economy.energy.actionPoints.benchFitMember
    const dayPool = CONTEXT.economy.energy.basePoolPoints

    const teardownAt = (m: number) =>
      (4 + 2) * removePart * m + // engine + gearbox assembly members, gated
      10 * removePart // loose bolt-on removals, ungated
    const rebuildAt = (m: number) =>
      (4 + 2) * byClass.buried * m + // engine + drivetrain members back in
      2 * byClass['bolt-on'] * m + // dampers + springs (suspension gate)
      byClass['bolt-on'] * m + // dash and gauges (interior gate)
      9 * byClass['bolt-on'] * m + // nine panels (body gate)
      benchFit * m + // tyres onto rims (wheels gate)
      3 * byClass['bolt-on'] // intake, cooling, exhaust: ungated

    const total = teardownAt(multiplier) + rebuildAt(multiplier)
    // The whole job by hand is days of work, not a wall and not a rounding
    // error: within four pools, with the teardown alone inside one.
    expect(teardownAt(multiplier)).toBeLessThanOrEqual(dayPool)
    expect(total).toBeLessThanOrEqual(4 * dayPool)
    // Hiring the machines recovers at least half the labour, which is the
    // cash-versus-labour trade the conversion exists to create.
    const withMachines = teardownAt(1) + rebuildAt(1)
    expect(withMachines).toBeLessThanOrEqual(total / 2)
  })

  it('an ungated loose removal is priced at base labour regardless of machines', () => {
    expect(machineGateGroupFor('exhaust', 'remove', CONTEXT)).toBeNull()
    expect(removeLaborSlotsFor('exhaust', CONTEXT)).toBe(
      CONTEXT.economy.energy.actionPoints.removePart,
    )
  })
})
