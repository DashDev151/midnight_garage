import { CARS } from '@midnight-garage/content'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import CarDetailScreen from './CarDetailScreen.vue'

// A minimal router so useRoute/useRouter resolve; garage is a stub target.
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'garage', component: { template: '<div>garage</div>' } },
      { path: '/car/:id', name: 'car', component: CarDetailScreen },
    ],
  })
}

async function mountAt(carId: string) {
  const router = makeRouter()
  router.push({ name: 'car', params: { id: carId } })
  await router.isReady()
  const wrapper = mount(CarDetailScreen, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('CarDetailScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders a granted car: name, radar, components', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id

    const { wrapper } = await mountAt(id)
    expect(wrapper.find('svg.radar').exists()).toBe(true)
    expect(wrapper.text()).toContain(game.carsDetailed[0]!.displayName)
    // All 8 components render a Repair control.
    for (const componentId of [
      'engine',
      'forcedInduction',
      'drivetrain',
      'suspension',
      'brakes',
      'wheels',
      'body',
      'interior',
    ]) {
      expect(wrapper.find(`[data-test="repair-${componentId}"]`).exists()).toBe(true)
    }
  })

  it('queuing a repair and ending days lifts the zone bar to 100', async () => {
    const game = useGameStore()
    // Sprint 13: repair is gated on owning the matching equipment.
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    const id = car.id
    const { wrapper } = await mountAt(id)

    // A dev-granted car lands in parking; move it into the service bay first
    // so the repair job it's about to queue can actually receive labor.
    await wrapper.find('[data-test="toggle-bay"]').trigger('click')
    // 'body' (unlike 'engine', which this seeded car rolls at a full 100)
    // reliably starts below 100, so this test actually exercises repair.
    await wrapper.find('[data-test="repair-body"]').trigger('click')
    // End enough days for the repair to finish (bounded loop).
    for (let i = 0; i < 6 && game.gameState.ownedCars[0]!.components.body.condition < 100; i++) {
      await wrapper.find('[data-test="end-day"]').trigger('click')
      await flushPromises()
    }
    expect(game.gameState.ownedCars[0]!.components.body.condition).toBe(100)
  })

  it('disables the repair button (with a reason) when the equipment is not owned (Sprint 13)', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id
    const { wrapper } = await mountAt(id)

    const button = wrapper.find('[data-test="repair-body"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('needs')
  })

  it('redirects to the garage when the car id is not owned', async () => {
    const { router } = await mountAt('ghost-car')
    expect(router.currentRoute.value.name).toBe('garage')
  })
})
