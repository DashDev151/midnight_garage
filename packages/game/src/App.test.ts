import { PARTS } from '@midnight-garage/content'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App.vue'
import { clearDragSession, useDraggable } from './composables/useDragAndDrop'
import { router } from './router'
import { useGameStore } from './stores/gameStore'
import { formatYen } from './utils/formatYen'

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

  it('mounts one floating HUD cluster, the vertical labour bar directly above the End Day button', async () => {
    const wrapper = await mountAppAt('garage')

    const huds = wrapper.findAll('.floating-hud')
    expect(huds).toHaveLength(1)
    const hud = huds[0]!
    // Scoped to the cluster itself - the Garage dashboard has its own
    // horizontal labour readout too, which this task does not touch.
    const bar = hud.get('[data-test="labour-bar"]')
    expect(bar.classes()).toContain('vertical')
    expect(hud.findAll('[data-test="end-day"]')).toHaveLength(1)
    // The End Day control genuinely is app-wide-unique (only EndDayButton.vue
    // renders it).
    expect(wrapper.findAll('[data-test="end-day"]')).toHaveLength(1)

    const children = [...hud.element.children]
    const barIndex = children.findIndex((el) => el.getAttribute('data-test') === 'labour-bar')
    const buttonIndex = children.findIndex((el) => el.getAttribute('data-test') === 'end-day')
    expect(barIndex).toBeGreaterThanOrEqual(0)
    expect(buttonIndex).toBeGreaterThan(barIndex)
  })

  it('renders the same floating HUD cluster, once, on a different gameplay route', async () => {
    const wrapper = await mountAppAt('auctions')
    const huds = wrapper.findAll('.floating-hud')
    expect(huds).toHaveLength(1)
    expect(huds[0]!.findAll('[data-test="labour-bar"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-test="end-day"]')).toHaveLength(1)
  })

  it('mounts one top-right day/cash box, showing the live figures and carrying the tutorial anchor', async () => {
    const game = useGameStore()
    const wrapper = await mountAppAt('garage')

    const boxes = wrapper.findAll('.day-cash-box')
    expect(boxes).toHaveLength(1)
    const dayValues = wrapper.findAll('[data-test="day-value"]')
    expect(dayValues).toHaveLength(1)
    expect(dayValues[0]!.text()).toBe(`Day ${game.day}`)
    expect(boxes[0]!.text()).toContain(formatYen(game.cashYen))
  })

  it('renders the same day/cash box, once, on a different gameplay route', async () => {
    const wrapper = await mountAppAt('auctions')
    const boxes = wrapper.findAll('.day-cash-box')
    expect(boxes).toHaveLength(1)
    expect(wrapper.findAll('[data-test="day-value"]')).toHaveLength(1)
  })

  it('hides the whole chrome (header, nav, End Day, day/cash box) on the full-screen menu (Sprint 65 decision 1)', async () => {
    const wrapper = await mountAppAt('menu')
    expect(wrapper.find('header.chrome').exists()).toBe(false)
    expect(wrapper.find('[data-test="open-menu"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="end-day"]').exists()).toBe(false)
    expect(wrapper.find('.day-cash-box').exists()).toBe(false)
  })

  it('shows "Ran When Parked" exactly once on the menu screen - the menu\'s own, the chrome one gone', async () => {
    const wrapper = await mountAppAt('menu')
    expect(wrapper.findAll('h1').filter((h) => h.text() === 'Ran When Parked')).toHaveLength(1)
  })

  it('the Standing screen is reachable from the nav on a gameplay screen', async () => {
    // The route must be reachable via an explicit nav link; invisible links
    // styled `color: inherit; text-decoration: none` with a panel-edge dotted
    // border don't work on a dark panel.
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
