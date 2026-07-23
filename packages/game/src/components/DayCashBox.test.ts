import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import DayCashBox from './DayCashBox.vue'

const mountedWrappers: VueWrapper[] = []
function track<T extends VueWrapper>(wrapper: T): T {
  mountedWrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

describe('DayCashBox', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the live day and cash figures, day carrying the tutorial anchor', () => {
    const game = useGameStore()
    const wrapper = track(mount(DayCashBox))

    const dayEl = wrapper.get('[data-test="day-value"]')
    expect(dayEl.text()).toBe(`Day ${game.day}`)
    expect(wrapper.get('.cash').text()).toBe(formatYen(game.cashYen))
  })

  it('carries a live aria-label naming both figures', () => {
    const game = useGameStore()
    const wrapper = track(mount(DayCashBox))
    expect(wrapper.get('.day-cash-box').attributes('aria-label')).toBe(
      `Day ${game.day}; cash ${formatYen(game.cashYen)}`,
    )
  })

  it('updates live as the day advances and cash changes', async () => {
    const game = useGameStore()
    const wrapper = track(mount(DayCashBox))

    game.endDay()
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-test="day-value"]').text()).toBe(`Day ${game.day}`)
    expect(wrapper.get('.day-cash-box').attributes('aria-label')).toBe(
      `Day ${game.day}; cash ${formatYen(game.cashYen)}`,
    )
  })
})
