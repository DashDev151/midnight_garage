import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import DayReport from './DayReport.vue'

describe('DayReport', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('is hidden until a day ends, then shows the day and dismisses', async () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mount(DayReport)
    expect(wrapper.find('[data-test="day-report"]').exists()).toBe(false)

    game.endDay()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="day-report"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Day 1 complete')

    await wrapper.find('[data-test="report-continue"]').trigger('click')
    expect(wrapper.find('[data-test="day-report"]').exists()).toBe(false)
  })
})
