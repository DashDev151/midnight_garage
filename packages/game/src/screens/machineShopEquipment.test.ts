import { COMPONENT_DISPLAY_NAMES, ECONOMY, TOOL_SHOPS } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { machineShopHasMachinery, machineShopMachinery } from './machineShopEquipment'

/**
 * The machine shop holds one piece of equipment per tool line that has work
 * done at a machine, present or absent by whether the shop covering that line
 * is owned. Nothing about the room gates any of it.
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

  it('names each machine for its line, and credits and prices it to the shop covering that line', () => {
    const game = useGameStore()
    game.newGame(1)
    for (const machine of machineShopMachinery(game.gameState, game.context)) {
      const shop = TOOL_SHOPS.find((shop) => shop.covers.includes(machine.componentId))!
      // A bench is identified by the line it serves, in the same words the
      // Upgrades wall uses; the shop is what brought it, which is a separate
      // fact because the room fills up from more than one purchase.
      expect(machine.displayName).toBe(COMPONENT_DISPLAY_NAMES[machine.componentId])
      expect(machine.shopName).toBe(shop.displayName)
      expect(machine.priceYen).toBe(shop.upgradePriceYen)
      expect(machine.minReputationTier).toBe(shop.minReputationTier)
      expect(machine.worksOn.length).toBeGreaterThan(0)
    }
  })

  /**
   * Rooms and shops are different axes. The machine shop takes every loose-part
   * job in the building, so it holds benches from more than one purchase: the
   * damper and differential work arrives with the chassis shop, not with the
   * shop the room shares a name with.
   */
  it('holds benches from more than one shop, and the room is not named after all of them', () => {
    const game = useGameStore()
    game.newGame(1)
    const machinery = machineShopMachinery(game.gameState, game.context)
    const shopNames = new Set(machinery.map((machine) => machine.shopName))
    expect(shopNames.size).toBeGreaterThan(1)

    const engineShop = TOOL_SHOPS.find((shop) => shop.covers.includes('engine'))!
    const fromElsewhere = machinery.filter((machine) => machine.shopName !== engineShop.displayName)
    expect(fromElsewhere.map((machine) => machine.componentId)).toEqual([
      'drivetrain',
      'suspension',
    ])
  })

  it('is empty on a fresh shop, and each machine turns up on its own line alone', () => {
    const game = useGameStore()
    game.newGame(1)
    expect(machineShopMachinery(game.gameState, game.context).every((m) => !m.present)).toBe(true)
    expect(machineShopHasMachinery(game.gameState, game.context)).toBe(false)

    // The chassis shop, and only the chassis shop: buying one shop never puts
    // a machine on a line it does not cover.
    const chassisShop = TOOL_SHOPS.find((shop) => shop.covers.includes('drivetrain'))!
    game.gameState = { ...game.gameState, toolShopsOwned: [chassisShop.id] }
    const machinery = machineShopMachinery(game.gameState, game.context)
    const present = machinery
      .filter((machine) => machine.present)
      .map((machine) => machine.componentId)
    expect(present).not.toContain('engine')
    for (const componentId of present) {
      expect(chassisShop.covers).toContain(componentId)
    }
    expect(present).toContain('drivetrain')
    expect(machineShopHasMachinery(game.gameState, game.context)).toBe(true)
  })

  it('counts a machine as present on the shop alone, with no standing earned anywhere', () => {
    const game = useGameStore()
    game.newGame(1)
    // The suspension line's one loose-part job carries a scene, and the scene
    // is at none. The machine is still in the room and still works.
    const shop = TOOL_SHOPS.find((shop) => shop.covers.includes('suspension'))!
    game.gameState = { ...game.gameState, toolShopsOwned: [shop.id] }
    expect(game.gameState.sceneStanding.racer).not.toBe('shop')
    const suspension = machineShopMachinery(game.gameState, game.context).find(
      (machine) => machine.componentId === 'suspension',
    )!
    expect(suspension.present).toBe(true)
  })
})
