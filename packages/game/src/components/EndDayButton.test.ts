import { PARTS } from '@midnight-garage/content'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import EndDayButton from './EndDayButton.vue'

describe('EndDayButton (Sprint 24 fix 4)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('an empty cart ends the day immediately, with no dialog', async () => {
    const game = useGameStore()
    const dayBefore = game.gameState.day
    const wrapper = mount(EndDayButton)

    await wrapper.find('[data-test="end-day"]').trigger('click')

    expect(wrapper.find('[data-test="end-day-cart-warning"]').exists()).toBe(false)
    expect(game.gameState.day).toBe(dayBefore + 1)
  })

  it('a non-empty cart shows the warning dialog instead of ending the day', async () => {
    const game = useGameStore()
    const dayBefore = game.gameState.day
    game.addToCart(PARTS[0]!.id)
    const wrapper = mount(EndDayButton)

    await wrapper.find('[data-test="end-day"]').trigger('click')

    expect(wrapper.find('[data-test="end-day-cart-warning"]').exists()).toBe(true)
    expect(game.gameState.day).toBe(dayBefore)
  })

  it('cancel dismisses the dialog without advancing the day', async () => {
    const game = useGameStore()
    const dayBefore = game.gameState.day
    game.addToCart(PARTS[0]!.id)
    const wrapper = mount(EndDayButton)
    await wrapper.find('[data-test="end-day"]').trigger('click')

    await wrapper.find('[data-test="end-day-cart-cancel"]').trigger('click')

    expect(wrapper.find('[data-test="end-day-cart-warning"]').exists()).toBe(false)
    expect(game.gameState.day).toBe(dayBefore)
  })

  it('proceeding from the dialog ends the day anyway', async () => {
    const game = useGameStore()
    const dayBefore = game.gameState.day
    game.addToCart(PARTS[0]!.id)
    const wrapper = mount(EndDayButton)
    await wrapper.find('[data-test="end-day"]').trigger('click')

    await wrapper.find('[data-test="end-day-cart-confirm"]').trigger('click')

    expect(wrapper.find('[data-test="end-day-cart-warning"]').exists()).toBe(false)
    expect(game.gameState.day).toBe(dayBefore + 1)
  })

  it('shows the cash total only when show-cash is set', () => {
    const withoutCash = mount(EndDayButton)
    expect(withoutCash.text()).toBe('End Day')

    const withCash = mount(EndDayButton, { props: { showCash: true } })
    expect(withCash.text()).toContain('End Day (')
  })
})
