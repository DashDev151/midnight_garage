import { PARTS } from '@midnight-garage/content'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import PartsMarketScreen from './PartsMarketScreen.vue'

// Sprint 82 decision 7 (Pinia multi-mount isolation): track every mounted
// wrapper and unmount it after each test, so a component left mounted from a
// prior test cannot leak its store's pinia into the next (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(PartsMarketScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
  mountedWrappers.push(wrapper)
  return wrapper
}

const cheapest = [...PARTS].sort((a, b) => a.priceYen - b.priceYen)[0]!

describe('PartsMarketScreen', () => {
  // happy-dom ships no 2D canvas context, so partSprites' rasteriser bails to ''.
  // A no-op context lets the real module reach toDataURL, which happy-dom returns
  // as a data: URL - enough to assert the catalogue card wires the sprite in.
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      imageSmoothingEnabled: false,
      fillStyle: '',
      fillRect: () => {},
    } as unknown as never)
  })
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('shows six department hero cards and no parts list by default (Sprint 49 decision 1)', () => {
    const wrapper = mountScreen()
    expect(wrapper.findAll('.hero-card')).toHaveLength(6)
    expect(wrapper.find('[data-test="hero-engine"]').exists()).toBe(true)
    expect(wrapper.findAll('.part')).toHaveLength(0)
    expect(wrapper.find('[data-test="browse-everything"]').exists()).toBe(true)
  })

  it('"Browse everything" shows the full flat catalog', async () => {
    const wrapper = mountScreen()
    await wrapper.find('[data-test="browse-everything"]').trigger('click')
    expect(wrapper.findAll('.part').length).toBe(PARTS.length)
    expect(wrapper.text()).toContain(`${cheapest.brand} ${cheapest.name}`)
  })

  it('renders each catalogue card with its slot sprite thumbnail (Sprint 88 decision 7)', async () => {
    const wrapper = mountScreen()
    await wrapper.find('[data-test="browse-everything"]').trigger('click')
    const sprite = wrapper.find(`[data-test="part-sprite-${cheapest.id}"]`)
    expect(sprite.exists()).toBe(true)
    expect(sprite.attributes('src')).toMatch(/^data:image\/png/)
    // Decorative: the part name is the accessible label, the sprite is hidden.
    expect(sprite.attributes('aria-hidden')).toBe('true')
  })

  it('the breadcrumb root returns from browse-everything back to the six heroes', async () => {
    const wrapper = mountScreen()
    await wrapper.find('[data-test="browse-everything"]').trigger('click')
    expect(wrapper.findAll('.hero-card')).toHaveLength(0)

    await wrapper.find('[data-test="breadcrumb-root"]').trigger('click')
    expect(wrapper.findAll('.hero-card')).toHaveLength(6)
    expect(wrapper.findAll('.part')).toHaveLength(0)
  })

  it('clicking a hero enters that department: breadcrumb, chips, and a scoped list, no other hero visible', async () => {
    const wrapper = mountScreen()
    await wrapper.find('[data-test="hero-engine"]').trigger('click')

    expect(wrapper.find('[data-test="breadcrumb-root"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Engine')
    expect(wrapper.find('[data-test="catalog-part-ignitionEcu"]').exists()).toBe(true)
    expect(wrapper.findAll('.hero-card')).toHaveLength(0)

    const suspensionPart = PARTS.find((p) => p.carPartId === 'dampers')!
    expect(wrapper.text()).not.toContain(`${suspensionPart.brand} ${suspensionPart.name}`)
  })

  it('drills down group -> sub-part to filter the catalog (Sprint 33 decision 3), then leaves the department via the breadcrumb', async () => {
    const wrapper = mountScreen()
    const ignitionEcuOnly = PARTS.filter((p) => p.carPartId === 'ignitionEcu')

    await wrapper.find('[data-test="hero-engine"]').trigger('click')
    await wrapper.find('[data-test="catalog-part-ignitionEcu"]').trigger('click')
    expect(wrapper.findAll('.part').length).toBe(ignitionEcuOnly.length)

    // Leaving a department is via the breadcrumb root (Sprint 49 decision 2) -
    // back to the six heroes, not a flat "all parts" tile inside the catalog.
    await wrapper.find('[data-test="breadcrumb-root"]').trigger('click')
    expect(wrapper.findAll('.hero-card')).toHaveLength(6)
  })

  it('grade/sort filters persist while browsing within a department', async () => {
    const wrapper = mountScreen()
    await wrapper.find('[data-test="hero-engine"]').trigger('click')
    await wrapper.find('[data-test="filter-grade"]').setValue('race')
    await wrapper.find('[data-test="catalog-part-ignitionEcu"]').trigger('click')

    expect((wrapper.find('[data-test="filter-grade"]').element as HTMLSelectElement).value).toBe(
      'race',
    )
  })

  it('adding to cart spends nothing (Sprint 14 misclick safeguard)', async () => {
    const game = useGameStore()
    const cashBefore = game.cashYen
    const wrapper = mountScreen()
    await wrapper.find('[data-test="browse-everything"]').trigger('click')
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
    await wrapper.find('[data-test="browse-everything"]').trigger('click')
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
    await wrapper.find('[data-test="browse-everything"]').trigger('click')
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
    await wrapper.find('[data-test="browse-everything"]').trigger('click')
    await wrapper.find(`[data-test="add-to-cart-${cheapest.id}"]`).trigger('click')
    await wrapper.find(`[data-test="remove-from-cart-${cheapest.id}"]`).trigger('click')
    expect(game.cartItems).toHaveLength(0)
    expect(game.cashYen).toBe(cashBefore)
  })

  it('the cart rail (and On order, once populated) render beside the list, not gated behind entering a department first for cart contents to survive navigation', async () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    await wrapper.find('[data-test="browse-everything"]').trigger('click')
    await wrapper.find(`[data-test="add-to-cart-${cheapest.id}"]`).trigger('click')
    expect(game.cartItems).toHaveLength(1)

    // Navigating home and back into a (different) department doesn't lose
    // the cart's real state - it's store-backed, not view-local.
    await wrapper.find('[data-test="breadcrumb-root"]').trigger('click')
    await wrapper.find('[data-test="hero-engine"]').trigger('click')
    expect(wrapper.find('[data-test="cart-panel"]').text()).toContain(cheapest.name)
  })

  it('the cart rail is visible on the home view too, not only inside a department (Sprint 58 decision 3)', async () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    expect(wrapper.findAll('.hero-card')).toHaveLength(6) // still the home view
    expect(wrapper.find('[data-test="cart-panel"]').exists()).toBe(true)

    await wrapper.find('[data-test="browse-everything"]').trigger('click')
    await wrapper.find(`[data-test="add-to-cart-${cheapest.id}"]`).trigger('click')
    await wrapper.find('[data-test="breadcrumb-root"]').trigger('click')

    expect(wrapper.findAll('.hero-card')).toHaveLength(6) // back on home
    expect(game.cartItems).toHaveLength(1)
    expect(wrapper.find('[data-test="cart-panel"]').text()).toContain(cheapest.name)
  })

  it('a Back button exits a department without hunting the breadcrumb (Sprint 58 decision 5)', async () => {
    const wrapper = mountScreen()
    await wrapper.find('[data-test="hero-engine"]').trigger('click')
    expect(wrapper.findAll('.hero-card')).toHaveLength(0)

    await wrapper.find('[data-test="market-back"]').trigger('click')
    expect(wrapper.findAll('.hero-card')).toHaveLength(6)
  })

  it('the "fits this vehicle" filter lists an accepted (inbound) customer service-job car (Sprint 61 item 10)', async () => {
    const game = useGameStore()
    game.newGame(1)
    const offer = game.serviceJobOffers[0]
    if (!offer) throw new Error('expected a service job offer on day 1')
    expect(game.acceptServiceJob(offer.id)).toBe(true)
    // The car is still inbound (arrives tomorrow), yet must already be a
    // fit-filter option so the player can order parts for it today.
    const customerCarId = offer.car.id
    const option = game.partsFitVehicleOptions.find((v) => v.id === customerCarId)
    expect(option).toBeDefined()
    expect(option!.label).toContain('customer')
    expect(option!.fitmentClass).not.toBeNull()

    // Selecting it in the DOM sets the class filter to the car's own class.
    const wrapper = mountScreen()
    await wrapper.find('[data-test="browse-everything"]').trigger('click')
    const select = wrapper.find('[data-test="filter-vehicle"]')
    expect(select.findAll('option').some((o) => o.element.value === customerCarId)).toBe(true)
    await select.setValue(customerCarId)
    expect((wrapper.find('[data-test="filter-class"]').element as HTMLSelectElement).value).toBe(
      option!.fitmentClass,
    )
  })
})
