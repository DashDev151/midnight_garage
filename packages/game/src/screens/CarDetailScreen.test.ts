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

  it('renders a granted car: name, radar, condition zones, build sheet', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id

    const { wrapper } = await mountAt(id)
    expect(wrapper.find('svg.radar').exists()).toBe(true)
    expect(wrapper.text()).toContain(game.carsDetailed[0]!.displayName)
    // All five condition zones render a Repair control.
    for (const zone of ['engine', 'drivetrain', 'suspension', 'body', 'interior']) {
      expect(wrapper.find(`[data-test="repair-${zone}"]`).exists()).toBe(true)
    }
  })

  it('queuing a repair and ending days lifts the zone bar to 100', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    const id = car.id
    const { wrapper } = await mountAt(id)

    await wrapper.find('[data-test="repair-engine"]').trigger('click')
    // End enough days for the repair to finish (bounded loop).
    for (let i = 0; i < 6 && game.gameState.ownedCars[0]!.condition.engine < 100; i++) {
      await wrapper.find('[data-test="end-day"]').trigger('click')
      await flushPromises()
    }
    expect(game.gameState.ownedCars[0]!.condition.engine).toBe(100)
  })

  it('redirects to the garage when the car id is not owned', async () => {
    const { router } = await mountAt('ghost-car')
    expect(router.currentRoute.value.name).toBe('garage')
  })
})
