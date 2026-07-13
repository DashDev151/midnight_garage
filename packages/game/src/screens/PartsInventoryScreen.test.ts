import { PARTS } from '@midnight-garage/content'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearDragSession } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import PartsInventoryScreen from './PartsInventoryScreen.vue'

function mountScreen() {
  return mount(PartsInventoryScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('PartsInventoryScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })

  it('shows the empty-inventory hint with no parts owned', () => {
    const wrapper = mountScreen()
    expect(wrapper.text()).toContain('No unplanned parts on hand')
  })

  it('lists every owned part not currently staged anywhere', () => {
    const game = useGameStore()
    game.devGrantPart(PARTS[0]!.id)
    game.devGrantPart(PARTS[1]!.id)
    const wrapper = mountScreen()
    expect(wrapper.findAll('.part-card')).toHaveLength(2)
  })

  it('omits a part currently staged on a car - the same set CarDetailScreen uses (decision 3)', () => {
    const game = useGameStore()
    game.devGrantPart(PARTS[0]!.id)
    const partInstanceId = game.gameState.partInventory[0]!.id
    game.devGrantCar()
    const carId = game.gameState.ownedCars[0]!.id
    // Sprint 32: every slot starts filled with a stock part by default -
    // empty this one directly (not via removePart, which would drop a
    // second, still-unstaged part into inventory) so the staged install
    // actually has somewhere to land.
    const car = game.gameState.ownedCars[0]!
    const carPartId = PARTS[0]!.carPartId
    game.gameState = {
      ...game.gameState,
      ownedCars: [{ ...car, parts: { ...car.parts, [carPartId]: { installed: null } } }],
    }
    game.stageAction(carId, {
      kind: 'install',
      componentId: game.groupForCarPart(PARTS[0]!.carPartId)!,
      partInstanceId,
    })

    const wrapper = mountScreen()
    expect(wrapper.findAll('.part-card')).toHaveLength(0)
  })
})
