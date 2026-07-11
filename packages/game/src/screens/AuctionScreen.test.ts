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

  it('placing a bid opens (or raises) it, never resolves the lot instantly, and lists it under My Active Bids (Sprint 20)', async () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const wrapper = mountScreen()
    await wrapper.find(`[data-test="bid-${lot.id}"]`).trigger('click')
    // The bid lands on the board - it doesn't resolve the lot outright; the
    // lot stays active until it hammers (quiet-day close or backstop).
    expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(true)
    expect(game.lotDetail(lot.id)?.playerHasBid).toBe(true)
    expect(game.lotDetail(lot.id)?.leadingBidder).toBe('player')
    expect(wrapper.text()).toContain('My Active Bids')
    // The catalog card's own control switches from "bid" to "raise" once
    // the player already holds a position on this lot.
    expect(wrapper.find(`[data-test="raise-${lot.id}"]`).exists()).toBe(true)
  })

  it('always shows the real current bid and who holds it (Sprint 20 open bidding) - "no bids yet" before anyone has bid, "you lead" once the player has', async () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const wrapper = mountScreen()
    // Every fresh lot starts with no real bid recorded yet.
    expect(wrapper.text()).toContain('no bids yet')

    const openingBidYen = game.lotDetail(lot.id)!.nextRaiseYen
    await wrapper.find(`[data-test="bid-${lot.id}"]`).trigger('click')
    // The real number (never an obfuscated bucket) shows up immediately,
    // along with who's holding it.
    expect(wrapper.text()).toContain('you lead')
    expect(game.lotDetail(lot.id)?.currentBidYen).toBe(openingBidYen)
  })

  it('shows a turnout read per lot and offers an always-visible instant buyout', async () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const wrapper = mountScreen()
    // One of the turnout labels renders somewhere on the screen - flavor
    // only (maintainer decision 3), not a numeric gauge.
    expect(wrapper.text()).toMatch(/Thin turnout|Steady turnout|Packed turnout/)
    // Buy Now is offered on every lot, bid on or not (maintainer decision 2).
    expect(wrapper.find(`[data-test="buyout-${lot.id}"]`).exists()).toBe(true)
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
