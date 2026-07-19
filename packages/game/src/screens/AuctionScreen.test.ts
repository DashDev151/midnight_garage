import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { AUCTION_TIER_LABELS } from '../utils/auctionTierLabels'
import { formatYen } from '../utils/formatYen'
import AuctionScreen from './AuctionScreen.vue'

// Sprint 82 decision 7 (Pinia multi-mount isolation): track every mounted
// wrapper and unmount it after each test, so a component left mounted from a
// prior test cannot leak its store's pinia into the next (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(AuctionScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
  mountedWrappers.push(wrapper)
  return wrapper
}

function warpToCatalog(game: ReturnType<typeof useGameStore>) {
  for (let i = 0; i < 20 && game.gameState.activeAuctionLots.length === 0; i++) game.endDay()
}

/** Overwrites `lotId`'s car with a real, content-backed symptomatic fixture -
 * `smokes-on-startup` (tests: `cold-start-watch`, `compression-test`), a worn
 * head behind a mint apparent band, every cause still open. */
function makeSymptomaticLot(game: ReturnType<typeof useGameStore>, lotId: string) {
  const lot = game.gameState.activeAuctionLots.find((l) => l.id === lotId)!
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
          runTestIds: [],
        },
      ],
      apparentBandByPartId: { headValvetrain: 'mint' as const },
    },
  }
  game.gameState = {
    ...game.gameState,
    activeAuctionLots: game.gameState.activeAuctionLots.map((l) =>
      l.id === lotId ? withSymptom : l,
    ),
  }
  return withSymptom
}

describe('AuctionScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

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
      // Every OTHER engine-group part is forced to mint (true band) so the
      // group's apparent chip below is deterministic regardless of what
      // generation happened to roll for this specific seed/lot (Sprint 75:
      // the aftermarket-at-generation roll shifts the RNG sequence, so a
      // hardcoded "the rest of the engine group happens to be mint"
      // assumption is no longer safe to rely on incidentally).
      const ENGINE_GROUP_PART_IDS = [
        'block',
        'internals',
        'headValvetrain',
        'camsTiming',
        'intake',
        'exhaust',
        'fuelSystem',
        'ignitionEcu',
        'cooling',
        'forcedInduction',
      ] as const
      const mintedEngineParts = Object.fromEntries(
        ENGINE_GROUP_PART_IDS.map((partId) => [
          partId,
          {
            installed: lot.car.parts[partId].installed
              ? { ...lot.car.parts[partId].installed!, band: 'mint' as const }
              : null,
          },
        ]),
      )
      const withSymptom = {
        ...lot,
        car: {
          ...lot.car,
          parts: {
            ...lot.car.parts,
            ...mintedEngineParts,
            headValvetrain: {
              installed: { ...lot.car.parts.headValvetrain.installed!, band: 'worn' as const },
            },
          },
          symptoms: [
            {
              symptomId: 'smokes-on-startup',
              trueCauseId: 'valve-seals',
              remainingCauseIds: ['valve-seals', 'tired-rings', 'head-gasket'],
              runTestIds: [],
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
      // Every cause prices real damage below the band the sheet shows, so
      // its honest deal impact - what the value moves if it turns out true -
      // is negative.
      for (const cause of detail.symptoms[0]!.causes) {
        expect(cause.dealDeltaYen).toBeLessThan(0)
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
      expect(symptomEl.text()).toContain('if true')
    })

    it('honest lots (no symptoms) never render a symptom block', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots.find((l) => l.car.symptoms.length === 0)
      if (!lot) return // every lot happened to roll a symptom this seed - nothing to assert
      const wrapper = mountScreen()
      expect(wrapper.find(`[data-test="symptom-${lot.id}"]`).exists()).toBe(false)
    })

    it('shows "the room says" as every card\'s value headline', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const wrapper = mountScreen()
      const roomSays = wrapper.findAll('[data-test="room-says"]')
      expect(roomSays.length).toBe(game.gameState.activeAuctionLots.length)
      for (const el of roomSays) expect(el.text()).toContain('the room says')
      expect(wrapper.text()).not.toContain('guide (as graded)')
    })
  })

  describe('the two numbers and the ledger', () => {
    it('renders the compact ledger on every card, the fear line last on a symptomatic lot', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      makeSymptomaticLot(game, lot.id)

      const detail = game.lotDetail(lot.id)!
      const fearLine = detail.ledger.lines.at(-1)!
      expect(fearLine.id).toBe('fear')
      expect(fearLine.yen).toBeLessThan(0)

      const wrapper = mountScreen()
      expect(wrapper.findAll('[data-test="ledger-line-book"]').length).toBe(
        game.gameState.activeAuctionLots.length,
      )
      const fearEls = wrapper.findAll('[data-test="ledger-line-fear"]')
      expect(fearEls.length).toBeGreaterThanOrEqual(1)
      expect(fearEls[0]!.text()).toContain('Doubts, at the odds')
    })

    it('shows "you say" only once a test has narrowed something - absent on an untested lot, present after', async () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const withSymptom = makeSymptomaticLot(game, lot.id)
      // The one symptomatic lot is the whole board, so the absent-everywhere
      // assertion below is exactly the absent-on-this-card assertion.
      game.gameState = { ...game.gameState, activeAuctionLots: [withSymptom] }
      expect(game.lotDetail(lot.id)!.playerEstimateYen).toBeNull()

      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="you-say"]').exists()).toBe(false)

      await wrapper.find(`[data-test="inspect-visit-${withSymptom.tier}"]`).trigger('click')
      await wrapper.find(`[data-test="run-test-${lot.id}-0-cold-start-watch"]`).trigger('click')

      const youSay = wrapper.find('[data-test="you-say"]')
      expect(youSay.exists()).toBe(true)
      expect(youSay.text()).toContain('you say')
      expect(youSay.text()).toContain(formatYen(game.lotDetail(lot.id)!.playerEstimateYen!))
    })
  })

  describe('the yard visit and diagnostic tests (Sprint 74 decisions 1-2/7)', () => {
    it('offers a per-tier "Inspect here" button that starts a visit: spends cash and a labour slot, and shows the fixed "At the yard" panel', async () => {
      const game = useGameStore()
      warpToCatalog(game)
      const tier = game.gameState.activeAuctionLots[0]!.tier
      const wrapper = mountScreen()
      const cashBefore = game.cashYen
      const laborBefore = game.laborSlotsRemainingToday

      const button = wrapper.find(`[data-test="inspect-visit-${tier}"]`)
      expect(button.exists()).toBe(true)
      await button.trigger('click')

      expect(game.inspectionVisit?.tier).toBe(tier)
      expect(game.cashYen).toBeLessThan(cashBefore)
      // Sprint 94: a visit spends one labour's worth of the day's energy (pointsPerLabour).
      expect(game.laborSlotsRemainingToday).toBe(laborBefore - game.pointsPerLabour)
      expect(wrapper.text()).toContain('At the yard')
      // The now-active tier's own button is redundant with the fixed panel.
      expect(wrapper.find(`[data-test="inspect-visit-${tier}"]`).exists()).toBe(false)
    })

    it('a disabled Inspect button (short on cash) explains itself in a tooltip', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const tier = game.gameState.activeAuctionLots[0]!.tier
      game.gameState = { ...game.gameState, cashYen: 0 }
      const wrapper = mountScreen()
      const button = wrapper.find(`[data-test="inspect-visit-${tier}"]`)
      expect((button.element as HTMLButtonElement).disabled).toBe(true)
      expect(button.attributes('title')).toContain('Not enough cash')
    })

    it("running a diagnostic test narrows the symptom's cause checklist, strikes through the eliminated cause, and shows the result copy inline", async () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const withSymptom = makeSymptomaticLot(game, lot.id)
      const wrapper = mountScreen()

      await wrapper.find(`[data-test="inspect-visit-${withSymptom.tier}"]`).trigger('click')
      const runButton = wrapper.find(`[data-test="run-test-${lot.id}-0-cold-start-watch"]`)
      expect(runButton.exists()).toBe(true)
      await runButton.trigger('click')

      // cold-start-watch's partition puts the true cause (valve-seals) with
      // tired-rings in one group, head-gasket alone in the other - so
      // head-gasket is eliminated, valve-seals/tired-rings remain.
      const updatedCar = game.gameState.activeAuctionLots.find((l) => l.id === lot.id)!.car
      expect(updatedCar.symptoms[0]!.remainingCauseIds.sort()).toEqual(
        ['tired-rings', 'valve-seals'].sort(),
      )
      expect(updatedCar.symptoms[0]!.runTestIds).toEqual(['cold-start-watch'])

      const symptomEl = wrapper.find(`[data-test="symptom-${lot.id}"]`)
      expect(symptomEl.find(`[data-test="test-result-${lot.id}-0"]`).text()).toContain(
        'Smoke clears within a few seconds',
      )
      // Head gasket is now struck through (ServiceTaskList's own idiom).
      const causeItems = symptomEl.findAll('.symptom-causes li')
      const headGasketRow = causeItems.find((li) => li.text().includes('Head gasket'))!
      expect(headGasketRow.classes()).toContain('eliminated')
    })

    it('an already-run test button is disabled and explains itself', async () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const withSymptom = makeSymptomaticLot(game, lot.id)
      const wrapper = mountScreen()

      await wrapper.find(`[data-test="inspect-visit-${withSymptom.tier}"]`).trigger('click')
      const runButton = wrapper.find(`[data-test="run-test-${lot.id}-0-cold-start-watch"]`)
      await runButton.trigger('click')

      const repeatButton = wrapper.find(`[data-test="run-test-${lot.id}-0-cold-start-watch"]`)
      expect((repeatButton.element as HTMLButtonElement).disabled).toBe(true)
      expect(repeatButton.attributes('title')).toContain('Already run')
    })
  })

  describe('tier display labels and the inspect control (Sprint 95 decisions 6-7)', () => {
    it('tier headings and the visit panel show the display label, never the raw enum slug', async () => {
      const game = useGameStore()
      warpToCatalog(game)
      const tiers = new Set(game.gameState.activeAuctionLots.map((l) => l.tier))
      const wrapper = mountScreen()

      const headings = wrapper.findAll('.tier-head h3').map((h) => h.text())
      for (const tier of tiers) expect(headings).toContain(AUCTION_TIER_LABELS[tier])
      // Slugs live in data-test attributes only - never in rendered text.
      expect(wrapper.text()).not.toContain('local-yard')
      expect(wrapper.text()).not.toContain('collector-network')

      // The active-visit panel names the yard through the same map.
      const tier = game.gameState.activeAuctionLots[0]!.tier
      await wrapper.find(`[data-test="inspect-visit-${tier}"]`).trigger('click')
      expect(wrapper.text()).toContain(`At the yard (${AUCTION_TIER_LABELS[tier]})`)
    })

    it('the inspect control carries its per-tier data-test anchor for the tutorial spotlight', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const tier = game.gameState.activeAuctionLots[0]!.tier
      const wrapper = mountScreen()
      const button = wrapper.find(`[data-test="inspect-visit-${tier}"]`)
      expect(button.exists()).toBe(true)
      expect(button.classes()).toContain('inspect-visit')
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
