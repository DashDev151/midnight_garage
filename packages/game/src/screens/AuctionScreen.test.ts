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

  it('renders lots already on day 1 (Sprint 10: no empty first week), with bid controls', () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    expect(wrapper.text()).not.toContain('No lots listed')
    expect(wrapper.findAll('.lot').length).toBe(game.gameState.activeAuctionLots.length)
    // Every lot offers a bid control.
    const lot = game.gameState.activeAuctionLots[0]!
    expect(wrapper.find(`[data-test="bid-${lot.id}"]`).exists()).toBe(true)
  })

  it('placing a bid opens (or raises) it and never resolves the lot instantly (Sprint 20)', async () => {
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
  })

  describe('Buy Now is demoted and takes two clicks (Sprint 64 item 3)', () => {
    it('the first click only arms a confirm - no car changes hands', async () => {
      const game = useGameStore()
      game.devGiveCash(5_000_000) // comfortably afford any buyout
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const wrapper = mountScreen()

      const button = wrapper.find(`[data-test="buyout-${lot.id}"]`)
      expect(button.text()).toContain('Buy now')
      const carsBefore = game.ownedCarCount

      await button.trigger('click')
      // Still owned by nobody - the first click only armed the confirm.
      expect(game.ownedCarCount).toBe(carsBefore)
      expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(true)
      expect(wrapper.find(`[data-test="buyout-${lot.id}"]`).text()).toContain('Confirm buyout')
    })

    it('the second click completes the buyout', async () => {
      const game = useGameStore()
      game.devGiveCash(5_000_000)
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const wrapper = mountScreen()
      const carsBefore = game.ownedCarCount

      await wrapper.find(`[data-test="buyout-${lot.id}"]`).trigger('click')
      await wrapper.find(`[data-test="buyout-${lot.id}"]`).trigger('click')

      expect(game.ownedCarCount).toBe(carsBefore + 1)
      expect(game.gameState.activeAuctionLots.some((l) => l.id === lot.id)).toBe(false)
    })

    it("Buy Now no longer sits in the same button block as Place/Raise (can't be hit by a stray click)", () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const wrapper = mountScreen()
      // The bid action block holds only the bid button; Buy Now lives in its
      // own separated row.
      const bidBlock = wrapper.find('.lot-action-buttons')
      expect(bidBlock.find(`[data-test="buyout-${lot.id}"]`).exists()).toBe(false)
      expect(wrapper.find('.buyout-row').find(`[data-test="buyout-${lot.id}"]`).exists()).toBe(true)
    })

    it('a disabled Buy Now (short on cash) explains itself in a tooltip', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      // Drain cash so no buyout is affordable.
      game.gameState = { ...game.gameState, cashYen: 1 }
      const wrapper = mountScreen()
      const button = wrapper.find(`[data-test="buyout-${lot.id}"]`)
      expect((button.element as HTMLButtonElement).disabled).toBe(true)
      expect(button.attributes('title')).toContain('Not enough cash')
    })
  })

  it('shows grade stamps instead of per-group bands on the auction card (Sprint 56 - amends Sprint 26 decision 10)', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const wrapper = mountScreen()
    // The per-group BandChip row is gone entirely from the auction card -
    // full per-part truth now lives on the car detail screen after
    // acquisition; the grade trio is the pre-bid condition read.
    expect(wrapper.find('.lot-bands').exists()).toBe(false)
    expect(wrapper.find(`[data-test="grade-stamp-overall-${lot.id}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-test="grade-stamp-ext-${lot.id}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-test="grade-stamp-int-${lot.id}"]`).exists()).toBe(true)
  })

  describe('the close-label backstop fix (Sprint 46 - playtest 2026-07-13 regression)', () => {
    /**
     * Real repro: a lot's expiry backstop hammers when `day >= expiresOnDay`
     * (bidding.ts), but the badge used to compute `expiresOnDay - day` (no
     * +1), so it showed "final call" a full day before the backstop could
     * actually close the lot - a led lot would survive a quiet night despite
     * the promise, closing only the following day.
     */
    it('does NOT show final call one day before the backstop can fire, but DOES show it the day it fires', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      // Give the lot breathing room on the quiet-days arm so only the
      // backstop arm is under test.
      const withBid = {
        ...lot,
        currentBidYen: lot.currentBidYen || 1,
        leadingBidder: 'player' as const,
        playerHasBid: true,
        quietDays: 0,
        expiresOnDay: game.gameState.day + 1,
      }
      game.gameState = {
        ...game.gameState,
        activeAuctionLots: game.gameState.activeAuctionLots.map((l) =>
          l.id === lot.id ? withBid : l,
        ),
      }
      // Today is expiresOnDay - 1: the backstop cannot fire tonight.
      expect(game.lotDetail(lot.id)!.closeLabel).not.toContain('final call')

      game.gameState = { ...game.gameState, day: withBid.expiresOnDay }
      // Today is expiresOnDay: the backstop fires tonight - the badge must say so.
      expect(game.lotDetail(lot.id)!.closeLabel).toContain('final call')
    })

    it('no longer shows the "(any bid resets the clock)" parenthetical (Sprint 56 decision 5)', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      // Force the plain "closes in N days" branch: a real bid on the board,
      // plenty of quiet-day and backstop headroom so it's neither "no bids
      // yet" nor "final call".
      const withBid = {
        ...lot,
        currentBidYen: lot.currentBidYen || 1,
        leadingBidder: 'player' as const,
        playerHasBid: true,
        quietDays: 0,
        expiresOnDay: game.gameState.day + 10,
      }
      game.gameState = {
        ...game.gameState,
        activeAuctionLots: game.gameState.activeAuctionLots.map((l) =>
          l.id === lot.id ? withBid : l,
        ),
      }
      const detail = game.lotDetail(lot.id)!
      expect(detail.closeLabel).toContain('closes in')
      expect(detail.closeLabel).toContain('unless bid on')
      expect(detail.closeLabel).not.toContain('resets the clock')
      // Bounded by the quiet-days arm (3), tighter here than the 10-day
      // backstop headroom.
      expect(detail.closeNightsLeft).toBe(3)
    })

    it('closeNightsLeft is null when there is no meaningful count to show (no bid yet, or final call)', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      // Fresh lot: no bid yet.
      expect(game.lotDetail(lot.id)!.closeNightsLeft).toBeNull()

      const finalCall = { ...lot, currentBidYen: 1, quietDays: 0, expiresOnDay: game.gameState.day }
      game.gameState = {
        ...game.gameState,
        activeAuctionLots: game.gameState.activeAuctionLots.map((l) =>
          l.id === lot.id ? finalCall : l,
        ),
      }
      expect(game.lotDetail(lot.id)!.closeLabel).toContain('final call')
      expect(game.lotDetail(lot.id)!.closeNightsLeft).toBeNull()
    })
  })

  describe('the capacity cascade warning (Sprint 45)', () => {
    it('shows neither warning while the shop still has real capacity', () => {
      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="double-park-warning"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="lost-warning"]').exists()).toBe(false)
    })

    it('warns about double-parking (not loss) once the shop is full but the grace slot is still free', () => {
      const game = useGameStore()
      game.gameState = {
        ...game.gameState,
        parkingBayCount: 0,
        parkingCarIds: [],
        serviceBayCount: 0,
        serviceBayCarIds: [],
      }
      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="double-park-warning"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="lost-warning"]').exists()).toBe(false)
    })

    it('warns about genuine loss only once the shop AND the grace slot are both full', () => {
      const game = useGameStore()
      game.gameState = {
        ...game.gameState,
        parkingBayCount: 0,
        parkingCarIds: [],
        serviceBayCount: 0,
        serviceBayCarIds: [],
        graceParkingCarId: 'someone-elses-car',
      }
      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="lost-warning"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="double-park-warning"]').exists()).toBe(false)
    })
  })

  describe('the auction-grade stamps (Sprint 56: replaces the Sprint 50 grade-line text)', () => {
    it('shows three grade stamps per lot, matching computeAuctionGrade for that car - no toggle needed', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const detail = game.lotDetail(lot.id)!
      const wrapper = mountScreen()

      const overall = wrapper.find(`[data-test="grade-stamp-overall-${lot.id}"]`)
      const ext = wrapper.find(`[data-test="grade-stamp-ext-${lot.id}"]`)
      const int = wrapper.find(`[data-test="grade-stamp-int-${lot.id}"]`)
      expect(overall.exists()).toBe(true)
      expect(ext.exists()).toBe(true)
      expect(int.exists()).toBe(true)
      expect(overall.text()).toContain(detail.auctionGrade.overall)
      expect(ext.text()).toContain(detail.auctionGrade.exterior)
      expect(int.text()).toContain(detail.auctionGrade.interior)

      // The restoration bill still shows, shortened to "bill" now.
      expect(wrapper.text()).toContain('bill ¥')

      // The old expandable report is gone entirely.
      expect(wrapper.find(`[data-test="toggle-detail-${lot.id}"]`).exists()).toBe(false)
      expect(wrapper.find('.condition-groups').exists()).toBe(false)
    })
  })

  describe('symptom disclosure (Sprint 73 decision 7)', () => {
    it("shows a symptomatic lot's card line and its still-fully-open cause checklist with per-cause value deltas", () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const withSymptom = {
        ...lot,
        car: {
          ...lot.car,
          parts: {
            ...lot.car.parts,
            headValvetrain: {
              installed: { ...lot.car.parts.headValvetrain.installed!, band: 'worn' as const },
            },
          },
          symptoms: [
            {
              symptomId: 'smokes-on-startup',
              trueCauseId: 'valve-seals',
              remainingCauseIds: ['valve-seals', 'tired-rings', 'head-gasket'],
            },
          ],
          apparentBandByPartId: { headValvetrain: 'mint' as const },
        },
      }
      game.gameState = {
        ...game.gameState,
        activeAuctionLots: game.gameState.activeAuctionLots.map((l) =>
          l.id === lot.id ? withSymptom : l,
        ),
      }
      const detail = game.lotDetail(lot.id)!
      expect(detail.symptoms).toHaveLength(1)
      expect(detail.symptoms[0]!.line).toBe('Smokes on startup.')
      expect(detail.symptoms[0]!.causes.map((c) => c.label)).toEqual([
        'Valve seals',
        'Tired rings',
        'Head gasket',
      ])
      // Every cause worsens value relative to the apparent view (they're all
      // real damage, never an improvement).
      for (const cause of detail.symptoms[0]!.causes) {
        expect(cause.deltaYen).toBeLessThanOrEqual(0)
      }
      // Sprint 73 decision 7: the grade/bands/bill all read the APPARENT
      // band (mint), never the true one (worn) - the engine group's chip
      // must not leak the truth next to the sheet's own fear-priced guide.
      expect(detail.groupBands.engine).toBe('mint')

      const wrapper = mountScreen()
      const symptomEl = wrapper.find(`[data-test="symptom-${lot.id}"]`)
      expect(symptomEl.exists()).toBe(true)
      expect(symptomEl.text()).toContain('Smokes on startup.')
      expect(symptomEl.text()).toContain('Valve seals')
      expect(symptomEl.text()).toContain("if it's this: about")
    })

    it('honest lots (no symptoms) never render a symptom block', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots.find((l) => l.car.symptoms.length === 0)
      if (!lot) return // every lot happened to roll a symptom this seed - nothing to assert
      const wrapper = mountScreen()
      expect(wrapper.find(`[data-test="symptom-${lot.id}"]`).exists()).toBe(false)
    })

    it('labels the guide value "guide (as graded)" on every lot card', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const wrapper = mountScreen()
      expect(wrapper.text()).toContain('guide (as graded)')
    })
  })

  describe('the art placeholder (Sprint 50 decision 1)', () => {
    it('renders one placeholder block per lot card', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const wrapper = mountScreen()
      expect(wrapper.findAll('.lot-art').length).toBe(game.gameState.activeAuctionLots.length)
    })
  })

  describe('board filters', () => {
    /** Every lot's entry price - what `matchesFilters` actually filters on. */
    function entryPrices(game: ReturnType<typeof useGameStore>): number[] {
      return game.auctionLotsByTier
        .flatMap((g) => g.lots)
        .map((l) => game.lotDetail(l.id)!.nextRaiseYen)
    }

    /**
     * Drives a slider and returns the value it ACTUALLY holds afterwards.
     *
     * A `type=range` snaps to its `step` and clamps to its bounds in a real
     * browser; happy-dom does not. Asserting against the value we asked for
     * would pass here and describe something that cannot happen on screen, so
     * every assertion below reads the applied value back instead.
     */
    async function setSlider(
      wrapper: ReturnType<typeof mountScreen>,
      test: string,
      value: number,
    ): Promise<number> {
      const input = wrapper.find(`[data-test="${test}"]`)
      await input.setValue(value)
      return Number((input.element as HTMLInputElement).value)
    }

    it('My active lots shows only lots the player has bid on - winning or not', async () => {
      const game = useGameStore()
      game.newGame(1)
      warpToCatalog(game)
      const wrapper = mountScreen()
      const total = wrapper.findAll('.lot').length
      expect(total).toBeGreaterThan(1)

      const lot = game.gameState.activeAuctionLots[0]!
      await wrapper.find(`[data-test="bid-${lot.id}"]`).trigger('click')
      await wrapper.find('[data-test="filter-my-lots"]').setValue(true)

      expect(wrapper.findAll('.lot').length).toBe(1)
      expect(wrapper.text()).toContain(game.lotDetail(lot.id)!.displayName)
    })

    it('keeps a lot in My active lots after a rival takes the lead - skin in it, not leading', async () => {
      // The old My Active Bids table listed outbid lots too; the filter has to
      // as well, or being outbid would make the lot vanish from the one view
      // you would go looking for it in.
      const game = useGameStore()
      game.newGame(1)
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      game.placeBid(lot.id, game.lotDetail(lot.id)!.nextRaiseYen)

      let guard = 0
      while (game.lotDetail(lot.id)?.leadingBidder === 'player' && guard++ < 15) game.endDay()
      const detail = game.lotDetail(lot.id)
      if (!detail || detail.leadingBidder !== 'rival') return // never contested; nothing to assert

      const wrapper = mountScreen()
      await wrapper.find('[data-test="filter-my-lots"]').setValue(true)
      expect(wrapper.text()).toContain(detail.displayName)
    })

    it('badges how many lots the player has money riding on', async () => {
      const game = useGameStore()
      game.newGame(1)
      warpToCatalog(game)
      const wrapper = mountScreen()
      expect(wrapper.find('.filter-badge').exists()).toBe(false)

      const lot = game.gameState.activeAuctionLots[0]!
      await wrapper.find(`[data-test="bid-${lot.id}"]`).trigger('click')
      expect(wrapper.find('.filter-badge').text()).toBe('1')
    })

    it('Affordable hides every lot the player cannot afford to bid on', async () => {
      const game = useGameStore()
      game.newGame(1)
      warpToCatalog(game)
      const prices = entryPrices(game)
      expect(prices.length).toBeGreaterThan(1)

      // Set cash so SOME lots are affordable and some are not - a filter that
      // hides everything (or nothing) proves nothing.
      const sorted = [...prices].sort((a, b) => a - b)
      game.gameState = { ...game.gameState, cashYen: sorted[0]! }

      const wrapper = mountScreen()
      const before = wrapper.findAll('.lot').length
      await wrapper.find('[data-test="filter-affordable"]').setValue(true)
      const after = wrapper.findAll('.lot').length

      expect(after).toBeLessThan(before)
      expect(after).toBe(prices.filter((p) => p <= game.cashYen).length)
    })

    it('the price range shows only lots between min and max', async () => {
      const game = useGameStore()
      game.newGame(1)
      warpToCatalog(game)
      const prices = entryPrices(game)
      const sorted = [...prices].sort((a, b) => a - b)
      const min = sorted[0]!
      const max = sorted[Math.floor(sorted.length / 2)]!

      const wrapper = mountScreen()
      await wrapper.find('[data-test="filter-min-price"]').setValue(min)
      await wrapper.find('[data-test="filter-max-price"]').setValue(max)

      expect(wrapper.findAll('.lot').length).toBe(prices.filter((p) => p >= min && p <= max).length)
    })

    it('says the filters hid everything, rather than pretending the board is empty', async () => {
      const game = useGameStore()
      game.newGame(1)
      warpToCatalog(game)
      const wrapper = mountScreen()

      await setSlider(wrapper, 'filter-max-price', 0)

      expect(wrapper.findAll('.lot').length).toBe(0)
      // The board is NOT empty - that is a different fact and a different fix.
      const filtered = wrapper.find('[data-test="all-filtered"]')
      expect(filtered.exists()).toBe(true)
      expect(filtered.text()).toContain('none matching your filters')
    })

    it('the handles cannot cross - dragging min past max pins it, and vice versa', async () => {
      // The one thing a two-handle range can actually get wrong: an inverted
      // range silently matches nothing and looks like a broken board.
      const game = useGameStore()
      game.newGame(1)
      warpToCatalog(game)
      const wrapper = mountScreen()

      const ceiling = Number(
        (wrapper.find('[data-test="filter-max-price"]').element as HTMLInputElement).max,
      )
      await setSlider(wrapper, 'filter-max-price', ceiling / 2)
      // Shove min far past max.
      const appliedMin = await setSlider(wrapper, 'filter-min-price', ceiling)
      expect(appliedMin).toBeLessThanOrEqual(ceiling / 2)

      // ...and max back below min.
      await setSlider(wrapper, 'filter-min-price', ceiling / 2)
      const appliedMax = await setSlider(wrapper, 'filter-max-price', 0)
      expect(appliedMax).toBeGreaterThanOrEqual(ceiling / 2)
    })

    it('reads out the live range in yen', async () => {
      const game = useGameStore()
      game.newGame(1)
      warpToCatalog(game)
      const wrapper = mountScreen()

      const readout = () => wrapper.find('[data-test="filter-price-readout"]').text()
      expect(readout()).toContain('¥0')
      await setSlider(wrapper, 'filter-min-price', 10_000)
      expect(readout()).toContain('¥10,000')
    })

    it('Clear restores the whole board', async () => {
      const game = useGameStore()
      game.newGame(1)
      warpToCatalog(game)
      const wrapper = mountScreen()
      const before = wrapper.findAll('.lot').length

      await setSlider(wrapper, 'filter-max-price', 0)
      expect(wrapper.findAll('.lot').length).toBe(0)
      await wrapper.find('[data-test="filter-clear"]').trigger('click')

      expect(wrapper.findAll('.lot').length).toBe(before)
      expect(wrapper.find('[data-test="filter-clear"]').exists()).toBe(false)
    })

    it('counts what is shown against what exists', async () => {
      const game = useGameStore()
      game.newGame(1)
      warpToCatalog(game)
      const total = entryPrices(game).length
      const wrapper = mountScreen()

      expect(wrapper.find('[data-test="filter-count"]').text()).toBe(`${total}/${total} lots`)
      await setSlider(wrapper, 'filter-max-price', 0)
      expect(wrapper.find('[data-test="filter-count"]').text()).toBe(`0/${total} lots`)
    })
  })
})
