import { PARTS } from '@midnight-garage/content'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearDragSession } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import PartsInventoryScreen from './PartsInventoryScreen.vue'

// Track every mounted
// wrapper and unmount it after each test, so a component left mounted from a
// prior test cannot leak its store's pinia into the next (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(PartsInventoryScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
  mountedWrappers.push(wrapper)
  return wrapper
}

describe('PartsInventoryScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
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
    // devGrantCar() with no id defaults to the first roster model
    // (honda-city-e-aa, 'shitbox' tier) - the staged part must match.
    const shitboxPart = PARTS.find((p) => p.fitmentClass === 'shitbox')!
    game.devGrantPart(shitboxPart.id)
    const partInstanceId = game.gameState.partInventory[0]!.id
    game.devGrantCar()
    const carId = game.gameState.ownedCars[0]!.id
    // Every slot starts filled with a stock part by default -
    // empty this one directly (not via removePart, which would drop a
    // second, still-unstaged part into inventory) so the staged install
    // actually has somewhere to land.
    const car = game.gameState.ownedCars[0]!
    const carPartId = shitboxPart.carPartId
    game.gameState = {
      ...game.gameState,
      ownedCars: [{ ...car, parts: { ...car.parts, [carPartId]: { installed: null } } }],
    }
    game.stageAction(carId, {
      kind: 'install',
      componentId: game.groupForCarPart(shitboxPart.carPartId)!,
      partInstanceId,
    })

    const wrapper = mountScreen()
    expect(wrapper.findAll('.part-card')).toHaveLength(0)
  })
})
