import { CARS } from '@midnight-garage/content'
import { lapTimeSecondsFor } from '@midnight-garage/sim'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import TestTrackScreen from './TestTrackScreen.vue'

/**
 * The player-facing test track: only cars the player actually owns are on
 * offer (never the sandbox's whole roster), and the time shown is the same
 * locked model the dev sandbox reads, for whichever car and course are
 * picked.
 */

const mountedWrappers: VueWrapper[] = []

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/overworld', name: 'overworld', component: { template: '<div />' } },
      { path: '/test-track', name: 'test-track', component: { template: '<div />' } },
    ],
  })
}

async function mountScreen(query: Record<string, string> = {}) {
  const router = makeRouter()
  await router.push({ name: 'test-track', query })
  await router.isReady()
  const wrapper = mount(TestTrackScreen, { global: { plugins: [router] } })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('TestTrackScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('says there is nothing to drive when the player owns no car', async () => {
    const wrapper = await mountScreen()
    expect(wrapper.find('[data-test="test-track-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="test-track-car-select"]').exists()).toBe(false)
  })

  it('offers exactly the cars the player owns, never the wider roster', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGrantCar(CARS[0]!.id)
    game.devGrantCar(CARS[1]?.id ?? CARS[0]!.id)

    const wrapper = await mountScreen()
    const options = wrapper.findAll('[data-test="test-track-car-select"] option')
    expect(options).toHaveLength(game.gameState.ownedCars.length)
    expect(options).toHaveLength(2)
  })

  it('shows the same lap time the locked performance model computes for the picked car and course', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGrantCar(CARS[0]!.id)

    const wrapper = await mountScreen()
    const ownedCar = game.gameState.ownedCars[0]!
    const model = game.context.modelsById[ownedCar.modelId]!
    const courseId = game.context.courses[0]!.id

    await wrapper.find('[data-test="test-track-course-select"]').setValue(courseId)

    const expected = lapTimeSecondsFor(ownedCar, model, game.context, courseId)
    expect(expected).not.toBeNull()
    expect(wrapper.find('[data-test="test-track-time"]').text()).toBe(`${expected!.toFixed(2)}s`)
  })

  it('preselects the course an overworld hotspot asked for', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGrantCar(CARS[0]!.id)

    const wrapper = await mountScreen({ course: 'wangan' })
    const select = wrapper.find('[data-test="test-track-course-select"]')
      .element as HTMLSelectElement
    expect(select.value).toBe('wangan')
  })

  it('falls back to the first course when the query names one that does not exist', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGrantCar(CARS[0]!.id)

    const wrapper = await mountScreen({ course: 'not-a-real-course' })
    const select = wrapper.find('[data-test="test-track-course-select"]')
      .element as HTMLSelectElement
    expect(select.value).toBe(game.context.courses[0]!.id)
  })
})
