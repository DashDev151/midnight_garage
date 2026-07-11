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

  it('adding to cart spends nothing (Sprint 14 misclick safeguard)', async () => {
    const game = useGameStore()
    const cashBefore = game.cashYen
    const wrapper = mountScreen()
    await wrapper.find(`[data-test="add-to-cart-${cheapest.id}"]`).trigger('click')
    expect(game.cashYen).toBe(cashBefore)
    expect(game.gameState.partInventory).toHaveLength(0)
    expect(game.cartItems).toHaveLength(1)
    expect(wrapper.find('[data-test="cart-panel"]').text()).toContain(cheapest.name)
  })

  it('checkout at standard delivery deducts sticker price and orders, not buys, the part', async () => {
    const game = useGameStore()
    const cashBefore = game.cashYen
    const wrapper = mountScreen()
    await wrapper.find(`[data-test="add-to-cart-${cheapest.id}"]`).trigger('click')
    await wrapper.find('[data-test="delivery-standard"]').setValue(true)
    await wrapper.find('[data-test="checkout"]').trigger('click')

    expect(game.cashYen).toBe(cashBefore - cheapest.priceYen)
    expect(game.gameState.partInventory).toHaveLength(0)
    expect(game.gameState.pendingPartOrders).toHaveLength(1)
    expect(game.cartItems).toHaveLength(0)
  })

  it('checkout at express delivery buys instantly at the surcharged price', async () => {
    const game = useGameStore()
    const cashBefore = game.cashYen
    const wrapper = mountScreen()
    await wrapper.find(`[data-test="add-to-cart-${cheapest.id}"]`).trigger('click')
    await wrapper.find('[data-test="delivery-express"]').setValue(true)
    await wrapper.find('[data-test="checkout"]').trigger('click')

    expect(game.gameState.partInventory.some((pi) => pi.partId === cheapest.id)).toBe(true)
    expect(game.cashYen).toBeLessThan(cashBefore - cheapest.priceYen) // surcharge on top
    expect(game.cartItems).toHaveLength(0)
  })

  it('removing a cart item costs nothing and clears it from the cart', async () => {
    const game = useGameStore()
    const cashBefore = game.cashYen
    const wrapper = mountScreen()
    await wrapper.find(`[data-test="add-to-cart-${cheapest.id}"]`).trigger('click')
    await wrapper.find(`[data-test="remove-from-cart-${cheapest.id}"]`).trigger('click')
    expect(game.cartItems).toHaveLength(0)
    expect(game.cashYen).toBe(cashBefore)
  })

  it('filters the catalog by part', async () => {
    const wrapper = mountScreen()
    const ignitionEcuOnly = PARTS.filter((p) => p.carPartId === 'ignitionEcu')
    await wrapper.find('[data-test="filter-component"]').setValue('ignitionEcu')
    expect(wrapper.findAll('.part').length).toBe(ignitionEcuOnly.length)
  })
})
