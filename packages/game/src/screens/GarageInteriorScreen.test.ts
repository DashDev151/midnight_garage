import { flushPromises, mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import GarageInteriorScreen from './GarageInteriorScreen.vue'

/**
 * The garage interior's own decisions: which room a tab shows, which of the
 * two scenes a room with a pair draws, and what each room's action leads to.
 *
 * The room art is a Pixi canvas, which happy-dom has no renderer for, so both
 * the application and the scene builder are stubbed. That leaves exactly what
 * this screen decides: `buildGarageRoomScene`'s first argument IS the scene
 * choice, asserted directly rather than through a canvas nobody can read.
 */
const { buildSceneSpy } = vi.hoisted(() => ({ buildSceneSpy: vi.fn() }))

vi.mock('pixi.js', () => {
  class Container {
    addChild(): void {}
    destroy(): void {}
  }
  class Application {
    stage = new Container()
    canvas = document.createElement('canvas')
    init(): Promise<void> {
      return Promise.resolve()
    }
    destroy(): void {}
  }
  return { Application, Container }
})

vi.mock('../pixi/garage/rooms', () => ({
  SCENE_WIDTH: 960,
  SCENE_HEIGHT: 540,
  buildGarageRoomScene: (...args: unknown[]) => {
    buildSceneSpy(...args)
    return { destroy: () => {} }
  },
}))

const ROUTES: RouteRecordRaw[] = [
  'garage',
  'garage-interior',
  'overworld',
  'inventory',
  'workshop-floor',
  'machine-shop',
  'jobs',
  'costs',
].map((name) => ({ path: `/${name}`, name, component: { render: () => h('div') } }))

const mountedWrappers: VueWrapper[] = []

async function mountScreen() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES })
  await router.push({ name: 'garage-interior' })
  await router.isReady()
  const wrapper = mount(GarageInteriorScreen, {
    global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

/** The scene id the room art was last built with. */
function lastScene(): string {
  return String(buildSceneSpy.mock.calls.at(-1)?.[0])
}

describe('GarageInteriorScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    buildSceneSpy.mockClear()
  })
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('lets a fresh shop walk into the machine shop, with nothing refusing them at the door', async () => {
    const game = useGameStore()
    game.newGame(1)
    expect(game.gameState.toolTiers.engine).toBe(1)

    const { wrapper } = await mountScreen()
    await wrapper.find('[data-test="room-tab-machine-shop"]').trigger('click')

    expect(wrapper.find('[data-test="machine-shop-enter"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="machine-shop-refusal"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="room-tab-machine-shop-derelict-flag"]').exists()).toBe(false)
  })

  it('opens the machine shop from the room, marking the room to come back to', async () => {
    const game = useGameStore()
    game.newGame(1)

    const { wrapper, router } = await mountScreen()
    await wrapper.find('[data-test="room-tab-machine-shop"]').trigger('click')
    await wrapper.find('[data-test="machine-shop-enter"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('machine-shop')
    expect(router.currentRoute.value.query.from).toBe('machine-shop')
  })

  it('draws the empty room until any machining line owns its machine', async () => {
    const game = useGameStore()
    game.newGame(1)

    const { wrapper } = await mountScreen()
    await wrapper.find('[data-test="room-tab-machine-shop"]').trigger('click')
    await flushPromises()
    expect(lastScene()).toBe('machine-shop-derelict')

    // Not the engine line: a shop with the driveline press and no engine
    // tooling is a shop with a machine in it.
    game.gameState = {
      ...game.gameState,
      toolTiers: { ...game.gameState.toolTiers, drivetrain: 3 },
    }
    await flushPromises()
    expect(lastScene()).toBe('machine-shop-open')
  })

  it('says what an empty machine shop is missing rather than leaving a bare room', async () => {
    const game = useGameStore()
    game.newGame(1)

    const { wrapper } = await mountScreen()
    await wrapper.find('[data-test="room-tab-machine-shop"]').trigger('click')
    expect(wrapper.find('[data-test="machine-shop-empty-hint"]').exists()).toBe(true)

    game.gameState = {
      ...game.gameState,
      toolTiers: { ...game.gameState.toolTiers, suspension: 3 },
    }
    await flushPromises()
    expect(wrapper.find('[data-test="machine-shop-empty-hint"]').exists()).toBe(false)
  })

  it('still shuts the body and paint room until the body line is owned', async () => {
    const game = useGameStore()
    game.newGame(1)

    const { wrapper } = await mountScreen()
    await wrapper.find('[data-test="room-tab-body-paint"]').trigger('click')
    await flushPromises()
    expect(lastScene()).toBe('body-paint-derelict')
    expect(wrapper.find('[data-test="body-paint-refusal"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="room-tab-body-paint-derelict-flag"]').exists()).toBe(true)

    game.gameState = { ...game.gameState, toolTiers: { ...game.gameState.toolTiers, body: 2 } }
    await flushPromises()
    expect(lastScene()).toBe('body-paint-open')
    expect(wrapper.find('[data-test="body-paint-refusal"]').exists()).toBe(false)
  })
})
