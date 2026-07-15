import { PARTS } from '@midnight-garage/content'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App.vue'
import { clearDragSession, useDraggable } from './composables/useDragAndDrop'
import { router } from './router'
import { useGameStore } from './stores/gameStore'

/**
 * Every wrapper `mountAppAt` produces, unmounted in `afterEach` below - App
 * registers a real `window` keydown listener in `onMounted`; a wrapper left
 * mounted from a prior test would leave that listener live, so the NEXT
 * test's Escape dispatch fires both the stale listener (reading the
 * previous test's now-torn-down pinia/router state) and the current one on
 * the same event. Same reasoning as `CarDetailScreen.test.ts`'s identical
 * teardown comment.
 */
const mountedWrappers: VueWrapper[] = []

async function mountAppAt(routeName: string) {
  await router.push({ name: routeName })
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [router] } })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

async function escape(): Promise<void> {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await flushPromises()
}

describe('App (Sprint 51: chrome)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })

  afterEach(async () => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
    clearDragSession()
    await router.push({ name: 'garage' })
  })

  it('shows the chrome (header + menu control + one End Day button) on a gameplay screen', async () => {
    const wrapper = await mountAppAt('garage')
    expect(wrapper.find('header.chrome').exists()).toBe(true)
    expect(wrapper.find('[data-test="open-menu"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="end-day"]')).toHaveLength(1)
  })

  it('hides the whole chrome (header, nav, End Day) on the full-screen menu (Sprint 65 decision 1)', async () => {
    const wrapper = await mountAppAt('menu')
    expect(wrapper.find('header.chrome').exists()).toBe(false)
    expect(wrapper.find('[data-test="open-menu"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="end-day"]').exists()).toBe(false)
  })

  it('shows "MIDNIGHT GARAGE" exactly once on the menu screen - the menu\'s own, the chrome one gone', async () => {
    const wrapper = await mountAppAt('menu')
    expect(wrapper.findAll('h1').filter((h) => h.text() === 'MIDNIGHT GARAGE')).toHaveLength(1)
  })

  it('the Standing screen is reachable from the nav on a gameplay screen', async () => {
    // Regression: the route existed from Sprint 62 but the only ways in were
    // two links styled `color: inherit; text-decoration: none` with a
    // panel-edge dotted border - invisible on a dark panel. The screen was
    // effectively unreachable. A real nav entry is the fix.
    const wrapper = await mountAppAt('garage')
    const link = wrapper.find('[data-test="nav-standing"]')
    expect(link.exists()).toBe(true)
    // Wired to the real route (memory history still resolves an href).
    expect(link.attributes('href')).toBe('/standing')
    // And the route genuinely renders the screen.
    await router.push({ name: 'standing' })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('standing')
    expect(wrapper.text()).toContain('Your standing')
  })

  it('the header menu control opens the full-screen menu', async () => {
    const wrapper = await mountAppAt('garage')
    await wrapper.find('[data-test="open-menu"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('menu')
  })

  it('Escape opens the menu from a gameplay screen, and Escape again returns to that same screen (pause-menu toggle)', async () => {
    await mountAppAt('auctions')
    await escape()
    expect(router.currentRoute.value.name).toBe('menu')
    await escape()
    // Back to where we were, not the garage default.
    expect(router.currentRoute.value.name).toBe('auctions')
  })

  it('Escape defers to an in-progress pick session rather than navigating (existing CarDetail behavior)', async () => {
    await mountAppAt('garage')
    useDraggable(() => 'some-part-id').togglePick()
    await escape()
    expect(router.currentRoute.value.name).toBe('garage')
  })

  it('Escape is ignored while focus is inside a text field', async () => {
    const wrapper = await mountAppAt('garage')
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    await escape()
    expect(router.currentRoute.value.name).toBe('garage')
    document.body.removeChild(input)
    void wrapper
  })

  it("Escape closes the End Day cart-confirm modal instead of navigating, and the button's own confirm flow still fires", async () => {
    const game = useGameStore()
    game.addToCart(PARTS[0]!.id)
    const wrapper = await mountAppAt('garage')

    await wrapper.find('[data-test="end-day"]').trigger('click')
    expect(wrapper.find('[data-test="end-day-cart-warning"]').exists()).toBe(true)

    await escape()
    expect(router.currentRoute.value.name).toBe('garage') // didn't navigate away
    expect(wrapper.find('[data-test="end-day-cart-warning"]').exists()).toBe(false)

    // The confirm button underneath still works normally.
    const dayBefore = game.gameState.day
    await wrapper.find('[data-test="end-day"]').trigger('click')
    await wrapper.find('[data-test="end-day-cart-confirm"]').trigger('click')
    expect(game.gameState.day).toBe(dayBefore + 1)
  })
})
