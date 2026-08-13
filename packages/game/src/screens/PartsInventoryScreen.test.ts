import { PARTS } from '@midnight-garage/content'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { clearDragSession } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import PartsInventoryScreen from './PartsInventoryScreen.vue'

// Track every mounted
// wrapper and unmount it after each test, so a component left mounted from a
// prior test cannot leak its store's pinia into the next (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  // A real (if routeless) router so `useRoute()` resolves - the screen reads
  // `route.query.from` for its back control (`mapBack.ts`) - while
  // `RouterLinkStub` keeps every `<RouterLink>` a plain, inspectable stub as
  // this file always tested them.
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  const wrapper = mount(PartsInventoryScreen, {
    global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
  })
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

  it('lists every owned part', () => {
    const game = useGameStore()
    game.devGrantPart(PARTS[0]!.id)
    game.devGrantPart(PARTS[1]!.id)
    const wrapper = mountScreen()
    expect(wrapper.findAll('.part-card')).toHaveLength(2)
  })

  /**
   * A part out on a station is still owned, so the warehouse still lists it -
   * it just says where it is, so the player can go and find it. Storage lists
   * and hands over; it never offers the work itself.
   */
  it('keeps a part that is out on the bench listed, marked with where it is', () => {
    const game = useGameStore()
    game.devGrantPart(PARTS[0]!.id)
    const partInstanceId = game.gameState.partInventory[0]!.id
    game.gameState = { ...game.gameState, workbenchPartId: partInstanceId }

    const wrapper = mountScreen()
    expect(wrapper.findAll('.part-card')).toHaveLength(1)
    expect(wrapper.find(`[data-test="part-station-${partInstanceId}"]`).text()).toBe('on the bench')
    expect(wrapper.find(`[data-test="recondition-part-${partInstanceId}"]`).exists()).toBe(false)
  })

  it('drops a part from the list the instant it is fitted onto a car - installs are direct, nothing sits in between (Sprint 202)', () => {
    const game = useGameStore()
    game.devGrantCar()
    const carId = game.gameState.ownedCars[0]!.id
    // dampers is a plain suspension slot with no blockedBy dependents (the
    // same fixture proven safe elsewhere in this codebase's real-resolver
    // tests) - `entry` fitment matches devGrantCar()'s default model
    // (honda-city-e-aa).
    const fitting = PARTS.find(
      (p) => p.carPartId === 'dampers' && p.grade !== 'stock' && p.fitmentClass === 'entry',
    )!
    game.devGrantPart(fitting.id)
    const partInstanceId = game.gameState.partInventory[0]!.id
    // Empty the slot directly (not via removePart, which would drop a
    // second part into inventory) so the install actually has somewhere to
    // land.
    const car = game.gameState.ownedCars[0]!
    game.gameState = {
      ...game.gameState,
      ownedCars: [{ ...car, parts: { ...car.parts, dampers: { installed: null } } }],
    }
    // Labour only actually applies (and the job completes) once the car is
    // in a service bay - unlike the old staging path, a direct install runs
    // through the real job/labour system immediately. dampers is a
    // suspension signature slot: hire the line so the install completes at
    // base rate rather than the machine-less multiplier.
    game.moveCar(carId, 'service')
    game.hireMachineLine('suspension')
    game.install(carId, 'suspension', partInstanceId)

    const wrapper = mountScreen()
    expect(wrapper.findAll('.part-card')).toHaveLength(0)
  })
})
