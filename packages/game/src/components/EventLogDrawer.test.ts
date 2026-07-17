import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import EventLogDrawer from './EventLogDrawer.vue'

/**
 * Sprint 69 (playtest item 20): the event log moved off the garage view into
 * an on-demand drawer.
 *
 * The two behaviour tests below are PORTED from `GarageScreen.test.ts`, not
 * rewritten - the log itself did not change, only where it lives, so its
 * coverage moves with it rather than being deleted along with the section.
 * (Sprint 58 set this precedent when the menu's load panel moved to SaveMenu.)
 */
// Sprint 82 decision 7 (Pinia multi-mount isolation): track every mounted
// wrapper and unmount it after each test, so a component left mounted from a
// prior test cannot leak its store's pinia into the next (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

function mountDrawer() {
  const wrapper = mount(EventLogDrawer)
  mountedWrappers.push(wrapper)
  return wrapper
}

async function open(wrapper: ReturnType<typeof mountDrawer>) {
  await wrapper.find('[data-test="log-toggle"]').trigger('click')
}

describe('EventLogDrawer (Sprint 69 item 20)', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('is closed until asked for - the garage is for the bays and the shop', () => {
    const wrapper = mountDrawer()
    expect(wrapper.find('[data-test="log-drawer"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="log-toggle"]').exists()).toBe(true)
  })

  it('opens and closes from its own control', async () => {
    const wrapper = mountDrawer()
    await open(wrapper)
    expect(wrapper.find('[data-test="log-drawer"]').exists()).toBe(true)
    await wrapper.find('[data-test="log-close"]').trigger('click')
    expect(wrapper.find('[data-test="log-drawer"]').exists()).toBe(false)
  })

  it('shows the empty-log hint before any day passes, then real events after', async () => {
    const game = useGameStore()
    const wrapper = mountDrawer()
    await open(wrapper)
    expect(wrapper.text()).toContain('No events yet')
    // Advance a full week so the rent/catalog boundary produces log entries.
    for (let i = 0; i < 7; i++) {
      game.endDay()
    }
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('No events yet')
    expect(wrapper.findAll('[data-test="log-drawer"] li').length).toBeGreaterThan(0)
  })

  it('Sprint 42: the log shows a realized profit line after a real walk-in sale', async () => {
    const game = useGameStore()
    const wrapper = mountDrawer()

    // Win a car with a known purchase price (a dev grant would read
    // unknown-purchase and never log a profit line at all).
    let guard = 0
    while (game.gameState.activeAuctionLots.length === 0 && guard++ < 20) {
      game.endDay()
    }
    const lot = game.gameState.activeAuctionLots.find((l) => l.tier === 'local-yard')
    if (!lot) throw new Error('expected a local-yard lot after the first catalog')
    // Sprint 81's 25-model pool can put a lot at the local yard whose buyout
    // price exceeds starting cash; affordability is not what this test
    // exercises, so grant the buyout price outright (the Sprint 59 pattern).
    game.devGiveCash(game.lotDetail(lot.id)!.buyoutPriceYen)
    expect(game.buyout(lot.id)).toBe(true)
    const carId = game.gameState.ownedCars.at(-1)!.id

    expect(game.setForSale(carId, true)).toBe(true)
    guard = 0
    while (!game.gameState.pendingOffers.some((o) => o.carInstanceId === carId) && guard++ < 60) {
      game.endDay()
    }
    expect(game.gameState.pendingOffers.some((o) => o.carInstanceId === carId)).toBe(true)
    expect(game.acceptOffer(carId)).toBe(true)

    await open(wrapper)
    const lines = wrapper.findAll('[data-test="log-drawer"] li').map((li) => li.text())
    expect(lines.some((text) => text.includes('Sold') && text.includes('profit'))).toBe(true)
  })
})
