import { PARTS } from '@midnight-garage/content'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import FloatingHud from './FloatingHud.vue'

const mountedWrappers: VueWrapper[] = []
function track<T extends VueWrapper>(wrapper: T): T {
  mountedWrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

describe('FloatingHud', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the vertical labour bar directly above the End Day button, both exactly once', () => {
    const wrapper = track(mount(FloatingHud))

    const bars = wrapper.findAll('[data-test="labour-bar"]')
    const buttons = wrapper.findAll('[data-test="end-day"]')
    expect(bars).toHaveLength(1)
    expect(buttons).toHaveLength(1)
    expect(bars[0]!.classes()).toContain('vertical')

    // "Directly above" - the bar precedes the button in DOM order, which is
    // also the visual order under the cluster's column layout.
    const children = [...wrapper.get('.floating-hud').element.children]
    const barIndex = children.findIndex((el) => el.getAttribute('data-test') === 'labour-bar')
    const buttonIndex = children.findIndex((el) => el.getAttribute('data-test') === 'end-day')
    expect(barIndex).toBeGreaterThanOrEqual(0)
    expect(buttonIndex).toBeGreaterThan(barIndex)
  })

  it('feeds the live labour figures to the bar', () => {
    const game = useGameStore()
    const wrapper = track(mount(FloatingHud))

    const bar = wrapper.get('[data-test="labour-bar"]')
    expect(bar.attributes('aria-label')).toBe(
      `Labour remaining: ${game.laborSlotsRemainingToday} of ${game.laborSlotsPerDay}`,
    )
  })

  it('forwards the wrapped End Day button state through confirming/cancel, for the app root Escape handler', async () => {
    const game = useGameStore()
    game.addToCart(PARTS[0]!.id)
    const wrapper = track(mount(FloatingHud))
    // The exposed pair is consumed dynamically via a template ref in App.vue
    // (`floatingHud.value?.confirming`/`.cancel()`), not through a typed
    // props/emits contract - cast rather than fight the generic `vm` type.
    const hud = wrapper.vm as unknown as { confirming: boolean; cancel: () => void }

    expect(hud.confirming).toBe(false)

    await wrapper.find('[data-test="end-day"]').trigger('click')
    expect(wrapper.find('[data-test="end-day-cart-warning"]').exists()).toBe(true)
    expect(hud.confirming).toBe(true)

    hud.cancel()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="end-day-cart-warning"]').exists()).toBe(false)
    expect(hud.confirming).toBe(false)
  })
})
