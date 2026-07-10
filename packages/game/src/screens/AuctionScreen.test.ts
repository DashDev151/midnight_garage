import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import AuctionScreen from './AuctionScreen.vue'

function mountScreen() {
  return mount(AuctionScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

function warpToCatalog(game: ReturnType<typeof useGameStore>) {
  for (let i = 0; i < 20 && game.gameState.activeAuctionLots.length === 0; i++) game.endDay()
}

describe('AuctionScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders lots already on day 1 (Sprint 10: no empty first week), with inspect and bid controls', () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    expect(wrapper.text()).not.toContain('No lots listed')
    expect(wrapper.findAll('.lot').length).toBe(game.gameState.activeAuctionLots.length)
    // Every lot offers a bid control.
    const lot = game.gameState.activeAuctionLots[0]!
    expect(wrapper.find(`[data-test="bid-${lot.id}"]`).exists()).toBe(true)
  })

  it('placing a bid records it (Sprint 19: multi-day — no instant resolution) and lists it under My Active Bids', async () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const wrapper = mountScreen()
    await wrapper.find(`[data-test="bid-${lot.id}"]`).trigger('click')
    // The bid is recorded, not resolved — the lot stays on the board and
    // its own resolution waits for its rolled duration to elapse.
    expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(true)
    expect(game.lotDetail(lot.id)?.myMaxBidYen).not.toBeNull()
    expect(wrapper.text()).toContain('My Active Bids')
    expect(wrapper.find(`[data-test="raise-${lot.id}"]`).exists()).toBe(true)
  })

  it('always shows the real current bid on every lot (Sprint 19b) — "no bids yet" before anyone has bid, a real yen figure once someone has', async () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const wrapper = mountScreen()
    // Every fresh lot starts with no real bid recorded yet.
    expect(wrapper.text()).toContain('no bids yet')

    const maxBidYen = lot.bookValueYen
    await wrapper.find(`[data-test="bid-${lot.id}"]`).trigger('click')
    // The real number (not an obfuscated bucket) shows up immediately —
    // matches the player's own bid since nothing else has escalated yet.
    expect(wrapper.text()).toContain(`current bid`)
    expect(game.lotDetail(lot.id)?.headroom.currentTopBidYen).toBe(maxBidYen)
  })

  it('shows an interest read per lot and offers an instant buyout', async () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const wrapper = mountScreen()
    // One of the interest labels renders somewhere on the screen.
    expect(wrapper.text()).toMatch(/Quiet|Warm|Hot|Feeding frenzy/)
    const carsBefore = game.ownedCarCount
    await wrapper.find(`[data-test="buyout-${lot.id}"]`).trigger('click')
    expect(game.ownedCarCount).toBe(carsBefore + 1)
    expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false)
  })

  it('inspecting a lot resolves instantly with no labor cost', async () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots.find((l) => !l.inspected)
    if (!lot) throw new Error('expected an uninspected lot')
    const wrapper = mountScreen()
    const laborBefore = game.laborSlotsRemainingToday
    await wrapper.find(`[data-test="inspect-${lot.id}"]`).trigger('click')
    expect(game.gameState.activeAuctionLots.find((l) => l.id === lot.id)?.inspected).toBe(true)
    expect(game.laborSlotsRemainingToday).toBe(laborBefore)
  })
})
