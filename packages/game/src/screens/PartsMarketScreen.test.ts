import { PARTS } from '@midnight-garage/content'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import PartsMarketScreen from './PartsMarketScreen.vue'

function mountScreen() {
  return mount(PartsMarketScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

const cheapest = [...PARTS].sort((a, b) => a.priceYen - b.priceYen)[0]!

describe('PartsMarketScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the parts catalog', () => {
    const wrapper = mountScreen()
    expect(wrapper.findAll('.part').length).toBe(PARTS.length)
    expect(wrapper.text()).toContain(`${cheapest.brand} ${cheapest.name}`)
  })

  it('clicking Buy queues the purchase in the pending plan', async () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    await wrapper.find(`[data-test="buy-${cheapest.id}"]`).trigger('click')
    expect(game.pending.buyParts).toContainEqual({ partId: cheapest.id })
  })
})
