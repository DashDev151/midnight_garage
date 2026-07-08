import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import GarageScreen from './GarageScreen.vue'

function mountScreen() {
  return mount(GarageScreen, { global: { plugins: [createPinia()] } })
}

describe('GarageScreen', () => {
  it('renders the starting day and cash', () => {
    const wrapper = mountScreen()
    expect(wrapper.get('[data-test="day-value"]').text()).toBe('1')
    expect(wrapper.text()).toContain('¥1,500,000')
  })

  it('End Day advances the rendered day counter (the DoD)', async () => {
    const wrapper = mountScreen()
    await wrapper.get('[data-test="end-day"]').trigger('click')
    expect(wrapper.get('[data-test="day-value"]').text()).toBe('2')
  })

  it('shows the empty-log hint before any day passes, then real events after', async () => {
    const wrapper = mountScreen()
    expect(wrapper.text()).toContain('No events yet')
    // Advance a full week so the rent/catalog boundary produces log entries.
    for (let i = 0; i < 7; i++) {
      await wrapper.get('[data-test="end-day"]').trigger('click')
    }
    expect(wrapper.text()).not.toContain('No events yet')
    expect(wrapper.findAll('.log li').length).toBeGreaterThan(0)
  })

  it('New Game resets the day counter back to 1', async () => {
    const wrapper = mountScreen()
    await wrapper.get('[data-test="end-day"]').trigger('click')
    expect(wrapper.get('[data-test="day-value"]').text()).toBe('2')
    await wrapper.get('[data-test="new-game"]').trigger('click')
    expect(wrapper.get('[data-test="day-value"]').text()).toBe('1')
  })
})
