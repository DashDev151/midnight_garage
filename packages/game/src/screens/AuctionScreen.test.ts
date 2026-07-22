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

  it('renders lots already on day 1 (Sprint 10: no empty first week), with a buyout control', () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    expect(wrapper.text()).not.toContain('No lots listed')
    expect(wrapper.findAll('.lot').length).toBe(game.gameState.activeAuctionLots.length)
    // Every lot offers an instant buyout.
    const lot = game.gameState.activeAuctionLots[0]!
    expect(wrapper.find(`[data-test="buyout-${lot.id}"]`).exists()).toBe(true)
  })

  it('offers a "Take a seat" link into the live room for every lot', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const wrapper = mountScreen()
    const link = wrapper
      .findAllComponents(RouterLinkStub)
      .find((c) => c.attributes('data-test') === 'take-seat-' + lot.id)
    expect(link).toBeDefined()
    expect(link!.text()).toBe('Take a seat')
    expect(link!.props('to')).toEqual({ name: 'auction-room', params: { lotId: lot.id } })
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

    it('Buy Now lives in its own separated row', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const wrapper = mountScreen()
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
              remainingCauseIds: ['valve-seals', 'gunked-breather', 'head-gasket', 'tired-rings'],
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
        'Gunked breather',
        'Head gasket',
        'Tired rings',
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

    it('the "room says" headline stays a single plain figure until a test actually moves the estimate off it', async () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const withSymptom = makeSymptomaticLot(game, lot.id)
      // The one symptomatic lot is the whole board, so the absent-everywhere
      // assertion below is exactly the absent-on-this-card assertion.
      game.gameState = { ...game.gameState, activeAuctionLots: [withSymptom] }
      expect(game.lotDetail(lot.id)!.playerEstimateYen).toBeNull()

      const wrapper = mountScreen()
      const roomSays = wrapper.find('[data-test="room-says"]')
      expect(roomSays.find('.was').exists()).toBe(false)

      await wrapper.find(`[data-test="inspect-visit-${withSymptom.tier}"]`).trigger('click')
      await wrapper.find(`[data-test="run-test-${lot.id}-0-cold-start-watch"]`).trigger('click')

      // cold-start-watch narrows the doubt (Sprint 111 item 1's precondition:
      // the estimate has genuinely moved off the room's fixed read).
      const detail = game.lotDetail(lot.id)!
      expect(detail.playerEstimateYen).not.toBeNull()
      expect(detail.playerEstimateYen).not.toBe(detail.guideValueYen)

      const movedRoomSays = wrapper.find('[data-test="room-says"]')
      const was = movedRoomSays.find('.was')
      expect(was.exists()).toBe(true)
      expect(was.text()).toBe(formatYen(detail.guideValueYen))
      const trend = movedRoomSays.find(
        detail.playerEstimateYen! > detail.guideValueYen ? '.up' : '.down',
      )
      expect(trend.exists()).toBe(true)
      expect(trend.text()).toBe(formatYen(detail.playerEstimateYen!))
      // The old separate "you say" line is gone - the headline carries it now.
      expect(wrapper.find('[data-test="you-say"]').exists()).toBe(false)
    })

    it('relabels the fear line "Doubt, resolved" once every symptom is narrowed to its one remaining cause', async () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const withSymptom = makeSymptomaticLot(game, lot.id)
      game.gameState = { ...game.gameState, activeAuctionLots: [withSymptom] }

      const wrapper = mountScreen()
      await wrapper.find(`[data-test="inspect-visit-${withSymptom.tier}"]`).trigger('click')
      await wrapper.find(`[data-test="run-test-${lot.id}-0-cold-start-watch"]`).trigger('click')

      // Still two remaining causes (valve-seals, tired-rings) - not resolved yet.
      expect(wrapper.find('[data-test="ledger-line-fear"]').text()).toContain('Doubts, at the odds')

      // overrun-smoke-watch unlocks off cold-start-watch and isolates
      // valve-seals alone, fully resolving the symptom.
      await wrapper.find(`[data-test="run-test-${lot.id}-0-overrun-smoke-watch"]`).trigger('click')
      const updatedCar = game.gameState.activeAuctionLots.find((l) => l.id === lot.id)!.car
      expect(updatedCar.symptoms[0]!.remainingCauseIds).toEqual(['valve-seals'])

      const fearLine = wrapper.find('[data-test="ledger-line-fear"]')
      expect(fearLine.text()).toContain('Doubt, resolved')
      expect(fearLine.text()).not.toContain('at the odds')
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
      expect(symptomEl.find('[data-test="breadcrumb-cold-start-watch"]').text()).toContain(
        'Blue puff on the first start',
      )
      // Head gasket is now struck through (ServiceTaskList's own idiom).
      const causeItems = symptomEl.findAll('.symptom-causes li')
      const headGasketRow = causeItems.find((li) => li.text().includes('Head gasket'))!
      expect(headGasketRow.classes()).toContain('eliminated')
    })

    it('a run test drops out of the fork into the trail, with no re-run button left behind', async () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const withSymptom = makeSymptomaticLot(game, lot.id)
      const wrapper = mountScreen()

      await wrapper.find(`[data-test="inspect-visit-${withSymptom.tier}"]`).trigger('click')
      const runButton = wrapper.find(`[data-test="run-test-${lot.id}-0-cold-start-watch"]`)
      await runButton.trigger('click')

      // The store pre-filters the fork to tests not yet run, so a run test's
      // own button disappears entirely rather than sitting there disabled.
      expect(wrapper.find(`[data-test="run-test-${lot.id}-0-cold-start-watch"]`).exists()).toBe(
        false,
      )
      // It moves into the trail instead, carrying the result line it earned.
      expect(wrapper.find('[data-test="breadcrumb-cold-start-watch"]').exists()).toBe(true)
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
})
