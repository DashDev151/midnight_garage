import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import MenuScreen from './MenuScreen.vue'

// A minimal router so useRouter() resolves and navigations away from /menu
// are observable, without pulling in every real screen.
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'garage', component: { template: '<div>garage</div>' } },
      { path: '/menu', name: 'menu', component: MenuScreen },
      { path: '/settings', name: 'settings', component: { template: '<div>settings</div>' } },
    ],
  })
}

// Sprint 82 decision 7 (Pinia multi-mount isolation): track every mounted
// wrapper and unmount it after each test, so a component left mounted from a
// prior test cannot leak its store's pinia into the next (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

async function mountMenu() {
  const router = makeRouter()
  await router.push({ name: 'menu' })
  await router.isReady()
  const wrapper = mount(MenuScreen, { global: { plugins: [router] } })
  mountedWrappers.push(wrapper)
  return { wrapper, router }
}

describe('MenuScreen (Sprint 40 item 1)', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('hides Continue and skips the confirm step when there is no existing save', async () => {
    const game = useGameStore()
    game.newGame(1)
    expect(game.hasExistingSave).toBe(false)
    const { wrapper, router } = await mountMenu()

    expect(wrapper.find('[data-test="menu-continue"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="menu-new-game-confirm"]').exists()).toBe(false)

    const dayBefore = game.day
    game.endDay() // move off day 1 so a fresh newGame() is observable
    expect(game.day).toBeGreaterThan(dayBefore)

    await wrapper.find('[data-test="menu-new-game"]').trigger('click')
    await flushPromises()
    expect(game.day).toBe(1) // newGame() ran immediately, no confirm needed
    expect(router.currentRoute.value.name).toBe('garage')
  })

  it('shows Continue when a save exists, and it navigates without touching the career', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.hasExistingSave = true
    const { wrapper, router } = await mountMenu()

    expect(wrapper.find('[data-test="menu-continue"]').exists()).toBe(true)
    const dayBefore = game.day
    await wrapper.find('[data-test="menu-continue"]').trigger('click')
    await flushPromises()

    expect(game.day).toBe(dayBefore)
    expect(router.currentRoute.value.name).toBe('garage')
  })

  it('New Game requires confirmation when a save exists; Cancel leaves the career untouched', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.hasExistingSave = true
    game.endDay()
    const dayBefore = game.day
    const { wrapper, router } = await mountMenu()

    await wrapper.find('[data-test="menu-new-game"]').trigger('click')
    expect(wrapper.text()).toContain('This overwrites your current garage')
    expect(game.day).toBe(dayBefore) // nothing happened yet

    await wrapper.find('[data-test="menu-new-game-cancel"]').trigger('click')
    expect(wrapper.find('[data-test="menu-new-game-confirm"]').exists()).toBe(false)
    expect(game.day).toBe(dayBefore)
    expect(router.currentRoute.value.name).toBe('menu') // never navigated away

    await wrapper.find('[data-test="menu-new-game"]').trigger('click')
    await wrapper.find('[data-test="menu-new-game-confirm"]').trigger('click')
    await flushPromises()
    expect(game.day).toBe(1) // a fresh career
    expect(router.currentRoute.value.name).toBe('garage')
  })

  it('renders exactly one Save surface (SaveMenu), inline, no toggle and no second load panel', async () => {
    const { wrapper } = await mountMenu()
    // Sprint 65: SaveMenu's controls render inline (no toggle-and-popover);
    // exactly one copy-save control, one load-reveal, and no leftover inline
    // menu load panel from the pre-Sprint-58 era.
    expect(wrapper.findAll('[data-test="copy-save"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-test="reveal-load"]')).toHaveLength(1)
    expect(wrapper.find('[data-test="save-toggle"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="menu-load-code"]').exists()).toBe(false)
  })

  it('Settings navigates to the settings screen', async () => {
    const { wrapper, router } = await mountMenu()
    const button = wrapper.get('[data-test="menu-settings"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(false)

    await button.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('settings')
  })
})
