import { CARS } from '@midnight-garage/content'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import GarageScreen from './GarageScreen.vue'

function mountScreen() {
  // Relies on the active pinia from beforeEach; RouterLink is stubbed since
  // these tests don't exercise navigation, only rendering.
  return mount(GarageScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('GarageScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))

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

  it('renders a card per owned car once one is granted', async () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    expect(wrapper.text()).toContain('No cars yet')

    game.devGrantCar(CARS[0]!.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('No cars yet')
    expect(wrapper.findAll('.car-card')).toHaveLength(1)
    expect(wrapper.text()).toContain(game.carsDetailed[0]!.displayName)
  })
})
