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

  it('Sprint 42: renders a profit clause on a car-sold entry, via the shared describeLogEntry formatter', async () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mount(DayReport)

    game.lastDayReport = {
      day: 1,
      entries: [
        {
          type: 'car-sold',
          carInstanceId: 'car-1',
          channel: 'walk-in-offer',
          priceYen: 900_000,
          profitYen: 40_000,
        },
      ],
      cashDeltaYen: 900_000,
    }
    game.reportVisible = true
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('profit +¥40,000')
  })
})
