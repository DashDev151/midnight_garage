import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
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
    ],
  })
}

async function mountMenu() {
  const router = makeRouter()
  await router.push({ name: 'menu' })
  await router.isReady()
  const wrapper = mount(MenuScreen, { global: { plugins: [router] } })
  return { wrapper, router }
}

describe('MenuScreen (Sprint 40 item 1)', () => {
  beforeEach(() => setActivePinia(createPinia()))

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

  it('loading a valid save code replaces the career and navigates to the garage', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.endDay()
    game.endDay()
    const code = game.exportSaveCode()
    const savedDay = game.day

    game.newGame(2) // simulate a different in-memory career before loading
    const { wrapper, router } = await mountMenu()

    await wrapper.find('[data-test="menu-load-code"]').setValue(code)
    await wrapper.find('[data-test="menu-load"]').trigger('click')
    await flushPromises()

    expect(game.day).toBe(savedDay)
    expect(router.currentRoute.value.name).toBe('garage')
  })

  it('an invalid save code shows an error and never navigates', async () => {
    const { wrapper, router } = await mountMenu()

    await wrapper.find('[data-test="menu-load-code"]').setValue('not a real code')
    await wrapper.find('[data-test="menu-load"]').trigger('click')

    expect(wrapper.text()).toMatch(/save code/i)
    expect(router.currentRoute.value.name).toBe('menu')
  })

  it('the Load button is disabled until something is pasted', async () => {
    const { wrapper } = await mountMenu()
    const button = wrapper.get('[data-test="menu-load"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('[data-test="menu-load-code"]').setValue('abc')
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('Settings is a disabled stub', async () => {
    const { wrapper } = await mountMenu()
    const button = wrapper.get('[data-test="menu-settings"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
  })
})
