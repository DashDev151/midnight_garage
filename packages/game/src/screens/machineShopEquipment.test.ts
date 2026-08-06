import { ECONOMY, TOOL_LINES } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { machineShopHasMachinery, machineShopMachinery } from './machineShopEquipment'

/**
 * The machine shop holds one piece of equipment per tool line that has work
 * done at a machine, present or absent by that line's own top rung. Nothing
 * about the room gates any of it.
 */
describe('what the machine shop holds', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('holds a machine for exactly the lines with work done off the car', () => {
    const game = useGameStore()
    game.newGame(1)
    // Derived from the operation table rather than typed in: a line earns a
    // machine by having a loose-part operation, and no other line gets one.
    const linesWithLooseWork = new Set(
      ECONOMY.machining.operations
        .filter((operation) => operation.performedOn === 'loose-part')
        .map((operation) => game.context.partsTaxonomyById[operation.carPartId].group),
    )
    const machinery = machineShopMachinery(game.gameState, game.context)
    expect(new Set(machinery.map((machine) => machine.componentId))).toEqual(linesWithLooseWork)
    expect(machinery.map((machine) => machine.componentId)).toEqual([
      'engine',
      'drivetrain',
      'suspension',
    ])
  })

  it("names each machine and prices it from that line's own top rung", () => {
    const game = useGameStore()
    game.newGame(1)
    for (const machine of machineShopMachinery(game.gameState, game.context)) {
      const rung = TOOL_LINES[machine.componentId].tiers[2]!
      expect(machine.displayName).toBe(rung.displayName)
      expect(machine.priceYen).toBe(rung.upgradePriceYen)
      expect(machine.minReputationTier).toBe(rung.minReputationTier ?? null)
      expect(machine.worksOn.length).toBeGreaterThan(0)
    }
  })

  it('is empty on a fresh shop, and each machine turns up on its own line alone', () => {
    const game = useGameStore()
    game.newGame(1)
    expect(machineShopMachinery(game.gameState, game.context).every((m) => !m.present)).toBe(true)
    expect(machineShopHasMachinery(game.gameState, game.context)).toBe(false)

    // The driveline press, and only the driveline press: buying one line's top
    // rung never puts another line's machine on the floor.
    game.gameState = {
      ...game.gameState,
      toolTiers: { ...game.gameState.toolTiers, drivetrain: 3 },
    }
    const machinery = machineShopMachinery(game.gameState, game.context)
    expect(
      machinery.filter((machine) => machine.present).map((machine) => machine.componentId),
    ).toEqual(['drivetrain'])
    expect(machineShopHasMachinery(game.gameState, game.context)).toBe(true)
  })

  it('counts a machine as present even when its work is still waiting on standing', () => {
    const game = useGameStore()
    game.newGame(1)
    // The alignment lift's one job is a scene operation, so the lift can be
    // standing there with the standing for it not yet earned. That is a
    // machine in the room, not a missing one.
    game.gameState = {
      ...game.gameState,
      toolTiers: { ...game.gameState.toolTiers, suspension: 3 },
    }
    expect(game.gameState.sceneStanding.racer).not.toBe('shop')
    const suspension = machineShopMachinery(game.gameState, game.context).find(
      (machine) => machine.componentId === 'suspension',
    )!
    expect(suspension.present).toBe(true)
  })
})
