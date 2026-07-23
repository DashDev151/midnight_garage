import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import {
  ALL_CAR_PART_IDS,
  CARS,
  fitmentClassForTier,
  type CarInstance,
} from '@midnight-garage/content'
import { useGameStore } from '../stores/gameStore'
import { AUCTION_TIER_LABELS, venueLabelFor } from '../utils/auctionTierLabels'
import { formatYen } from '../utils/formatYen'
import AuctionScreen from './AuctionScreen.vue'

// Track every mounted wrapper and unmount it after each test, so a component
// left mounted from a prior test cannot leak its store's pinia into the next
// (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

/** A real router so `useRouter()`/`<RouterLink>` resolve (the "Take a seat"
 * control navigates via `router.push`) - destination screens are render-stub
 * targets, this file never asserts anything about their content. */
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'garage', component: { render: () => h('div') } },
      { path: '/auctions', name: 'auctions', component: { render: () => h('div') } },
      {
        path: '/auctions/:lotId/room',
        name: 'auction-room',
        component: { render: () => h('div') },
      },
    ],
  })
}

function mountScreen() {
  const wrapper = mount(AuctionScreen, { global: { plugins: [makeRouter()] } })
  mountedWrappers.push(wrapper)
  return wrapper
}

/** Same as `mountScreen`, plus the router instance itself - for the one test
 * that asserts a real navigation actually happened. */
function mountScreenWithRouter(): { wrapper: VueWrapper; router: Router } {
  const router = makeRouter()
  const wrapper = mount(AuctionScreen, { global: { plugins: [router] } })
  mountedWrappers.push(wrapper)
  return { wrapper, router }
}

function warpToCatalog(game: ReturnType<typeof useGameStore>) {
  for (let i = 0; i < 20 && game.gameState.activeAuctionLots.length === 0; i++) game.endDay()
}

/** A synthetic owned car, every slot stock-and-fine, with NO ledger entry -
 * `evaluateBudgetCap` reads a missing ledger as a 0 purchase (the same
 * "accepted, unpriced" convention `storyMissionProbes.test.ts`'s probes
 * rely on), so this always clears a guarantor mission's budget cap
 * regardless of what a real, randomly-rolled auction lot would have cost.
 * Reliability only reads band factors, so 'fine' everywhere clears any
 * guarantor mission's reliability floor too. Returns the owned car's id. */
function giveReliableOwnedCar(game: ReturnType<typeof useGameStore>): string {
  const model = CARS.find((c) => c.id === 'honda-crx-sir-ef8')!
  const fitmentClass = fitmentClassForTier(model.tier)
  const parts = {} as CarInstance['parts']
  for (const partId of ALL_CAR_PART_IDS) {
    const stockPart = game.context.stockPartByCarPartId[fitmentClass][partId]
    parts[partId] = {
      installed: {
        id: `test-reliable-${partId}`,
        partId: stockPart.id,
        band: 'fine',
        genuinePeriod: false,
        origin: { kind: 'market', day: 1 },
      },
    }
  }
  const car: CarInstance = {
    id: 'test-reliable-car',
    modelId: model.id,
    year: 1990,
    mileageKm: 120_000,
    color: 'White',
    provenanceNote: '',
    authenticityPercent: 80,
    symptoms: [],
    apparentBandByPartId: null,
    parts,
  }
  game.gameState = { ...game.gameState, ownedCars: [...game.gameState.ownedCars, car] }
  return car.id
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

  it('renders lots already on day 1 with a buyout control, with no empty first week', () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    expect(wrapper.text()).not.toContain('No lots listed')
    expect(wrapper.findAll('.lot').length).toBe(game.gameState.activeAuctionLots.length)
    // Every lot offers an instant buyout.
    const lot = game.gameState.activeAuctionLots[0]!
    expect(wrapper.find(`[data-test="buyout-${lot.id}"]`).exists()).toBe(true)
  })

  it('offers a "Take a seat" control into the live room for every lot, enabled under the real, zero-fee content', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const wrapper = mountScreen()
    const button = wrapper.find(`[data-test="take-seat-${lot.id}"]`)
    expect(button.exists()).toBe(true)
    expect(button.text()).toBe('Take a seat')
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('"Take a seat" navigates into the live room for that exact lot', async () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const { wrapper, router } = mountScreenWithRouter()

    await wrapper.find(`[data-test="take-seat-${lot.id}"]`).trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('auction-room')
    expect(router.currentRoute.value.params.lotId).toBe(lot.id)
  })

  it('a disabled "Take a seat" (short on cash, admission tuned above zero) explains itself in a tooltip', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    game.context = {
      ...game.context,
      economy: {
        ...game.context.economy,
        auctionRoom: {
          ...game.context.economy.auctionRoom,
          attendanceFeeYenByTier: {
            'local-yard': 5_000,
            regional: 5_000,
            premium: 5_000,
            'collector-network': 5_000,
          },
        },
      },
    }
    game.gameState = { ...game.gameState, cashYen: 0 }
    const wrapper = mountScreen()
    const button = wrapper.find(`[data-test="take-seat-${lot.id}"]`)
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(button.attributes('title')).toContain('Not enough cash')
  })

  it('shows a turnout read per lot and offers an always-visible instant buyout', async () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const wrapper = mountScreen()
    // One of the turnout labels renders somewhere on the screen - flavor only,
    // not a numeric gauge.
    expect(wrapper.text()).toMatch(/Thin turnout|Steady turnout|Packed turnout/)
    // Buy Now is offered on every lot, bid on or not.
    expect(wrapper.find(`[data-test="buyout-${lot.id}"]`).exists()).toBe(true)
  })

  describe('Buy Now is demoted and takes two clicks', () => {
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

  it('shows grade stamps instead of per-group bands on the auction card', () => {
    const game = useGameStore()
    warpToCatalog(game)
    const lot = game.gameState.activeAuctionLots[0]!
    const wrapper = mountScreen()
    // The per-group BandChip row is gone entirely from the auction card -
    // full per-part truth now lives on the car detail screen after
    // acquisition; the grade trio is the pre-bid condition read.
    expect(wrapper.find('.lot-bands').exists()).toBe(false)
    expect(wrapper.find(`[data-test="grade-stamp-overall-${lot.id}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-test="grade-stamp-mech-${lot.id}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-test="grade-stamp-ext-${lot.id}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-test="grade-stamp-int-${lot.id}"]`).exists()).toBe(true)
  })

  describe('the capacity cascade warning', () => {
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

  describe('the auction-grade stamps', () => {
    it('shows four grade stamps per lot, matching computeAuctionGrade for that car - no toggle needed', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const detail = game.lotDetail(lot.id)!
      const wrapper = mountScreen()

      const overall = wrapper.find(`[data-test="grade-stamp-overall-${lot.id}"]`)
      const mech = wrapper.find(`[data-test="grade-stamp-mech-${lot.id}"]`)
      const ext = wrapper.find(`[data-test="grade-stamp-ext-${lot.id}"]`)
      const int = wrapper.find(`[data-test="grade-stamp-int-${lot.id}"]`)
      expect(overall.exists()).toBe(true)
      expect(mech.exists()).toBe(true)
      expect(ext.exists()).toBe(true)
      expect(int.exists()).toBe(true)
      expect(overall.text()).toContain(detail.auctionGrade.overall)
      expect(mech.text()).toContain(detail.auctionGrade.mechanical)
      expect(ext.text()).toContain(detail.auctionGrade.exterior)
      expect(int.text()).toContain(detail.auctionGrade.interior)

      // The old expandable report is gone entirely.
      expect(wrapper.find(`[data-test="toggle-detail-${lot.id}"]`).exists()).toBe(false)
      expect(wrapper.find('.condition-groups').exists()).toBe(false)
    })
  })

  describe('symptom disclosure', () => {
    it("shows a symptomatic lot's card line and its still-fully-open cause checklist with per-cause value deltas", () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      // Every OTHER engine-group part is forced to mint (true band) so the
      // group's apparent chip below is deterministic regardless of what
      // generation happened to roll for this specific seed/lot. The
      // aftermarket-at-generation roll shifts the RNG sequence, so a
      // hardcoded "the rest of the engine group happens to be mint"
      // assumption is no longer safe to rely on incidentally.
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
      // The grade/bands/bill all read the APPARENT band (mint), never the true
      // one (worn) - the engine group's chip must not leak the truth next to
      // the sheet's own fear-priced guide.
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

      // cold-start-watch narrows the doubt; the estimate has genuinely moved
      // off the room's fixed read.
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

  describe('the yard visit and diagnostic tests', () => {
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
      // A visit spends one labour's worth of the day's energy (pointsPerLabour).
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

  describe('tier display labels and the inspect control', () => {
    /**
     * The tier heading/visit panel render through `venueLabelFor`, which
     * prefers the save's own rolled `venueNameByTier` name and falls back to
     * the plain tier label - every `useGameStore()` career rolls real venue
     * names (`createInitialGameState`), so this asserts against
     * `venueLabelFor`'s own output rather than the bare `AUCTION_TIER_LABELS`
     * map, and the two dedicated tests below cover the rolled-name and
     * no-venue-names cases explicitly.
     */
    it('tier headings and the visit panel show the venue label, never the raw enum slug', async () => {
      const game = useGameStore()
      warpToCatalog(game)
      const tiers = new Set(game.gameState.activeAuctionLots.map((l) => l.tier))
      const wrapper = mountScreen()

      const headings = wrapper.findAll('.tier-head h3').map((h) => h.text())
      for (const tier of tiers) {
        expect(headings).toContain(venueLabelFor(tier, game.gameState.venueNameByTier))
      }
      // Slugs live in data-test attributes only - never in rendered text.
      expect(wrapper.text()).not.toContain('local-yard')
      expect(wrapper.text()).not.toContain('collector-network')

      // The active-visit panel names the yard through the same seam.
      const tier = game.gameState.activeAuctionLots[0]!.tier
      await wrapper.find(`[data-test="inspect-visit-${tier}"]`).trigger('click')
      expect(wrapper.text()).toContain(
        `At the yard (${venueLabelFor(tier, game.gameState.venueNameByTier)})`,
      )
    })

    it("renders the save's own rolled venue name literally on the tier heading (Sprint 114)", () => {
      const game = useGameStore()
      warpToCatalog(game)
      const tier = game.gameState.activeAuctionLots[0]!.tier
      game.gameState = {
        ...game.gameState,
        venueNameByTier: {
          'local-yard': 'Test Yard Alpha',
          regional: 'Test Regional Beta',
          premium: 'Test Premium Gamma',
          'collector-network': 'Test Collector Delta',
        },
      }
      const wrapper = mountScreen()
      const rolledName = game.gameState.venueNameByTier![tier]
      expect(wrapper.findAll('.tier-head h3').map((h) => h.text())).toContain(rolledName)
    })

    it('falls back to the plain tier label when the save has no rolled venue names (Sprint 114)', () => {
      const game = useGameStore()
      warpToCatalog(game)
      game.gameState = { ...game.gameState, venueNameByTier: undefined }
      const tier = game.gameState.activeAuctionLots[0]!.tier
      const wrapper = mountScreen()
      expect(wrapper.findAll('.tier-head h3').map((h) => h.text())).toContain(
        AUCTION_TIER_LABELS[tier],
      )
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

  describe('the art placeholder', () => {
    it('renders one placeholder block per lot card', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const wrapper = mountScreen()
      expect(wrapper.findAll('.lot-art').length).toBe(game.gameState.activeAuctionLots.length)
    })
  })

  describe('the master inspector send control (Sprint 116)', () => {
    /** Hires and benches a `master-inspector` directly on `gameState.staff` -
     * a plain state poke, matching this file's own idiom (cashYen,
     * parkingBayCount, ...) rather than the full ad-roll/hire flow. */
    function hireMasterInspector(game: ReturnType<typeof useGameStore>, displayName = 'Rie') {
      game.gameState = {
        ...game.gameState,
        staff: [
          {
            id: 'inspector-1',
            displayName,
            stats: { engine: 1, chassis: 1, body: 1 },
            laborSlotsPerDay: 1,
            assignment: 'bench',
            pendingAssignment: null,
            weeklyWageYen: 5000,
            trait: 'master-inspector',
          },
        ],
      }
    }

    it('stays hidden during an active visit on a symptomatic lot when no master-inspector is benched', async () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const withSymptom = makeSymptomaticLot(game, lot.id)
      const wrapper = mountScreen()
      await wrapper.find(`[data-test="inspect-visit-${withSymptom.tier}"]`).trigger('click')
      expect(wrapper.find(`[data-test="send-inspector-${lot.id}"]`).exists()).toBe(false)
    })

    it('stays hidden with a benched inspector but no active visit', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      makeSymptomaticLot(game, lot.id)
      hireMasterInspector(game)
      const wrapper = mountScreen()
      expect(wrapper.find(`[data-test="send-inspector-${lot.id}"]`).exists()).toBe(false)
    })

    it("shows the send control naming the inspector's own real display name once every gate clears", async () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const withSymptom = makeSymptomaticLot(game, lot.id)
      hireMasterInspector(game, 'Rie')
      const wrapper = mountScreen()
      await wrapper.find(`[data-test="inspect-visit-${withSymptom.tier}"]`).trigger('click')
      const button = wrapper.find(`[data-test="send-inspector-${lot.id}"]`)
      expect(button.exists()).toBe(true)
      expect(button.text()).toBe('Send Rie to listen')
    })

    it('running the send control charges real minutes, fills the real trail, and shows the byte-verbatim done line naming the inspector', async () => {
      const game = useGameStore()
      warpToCatalog(game)
      const lot = game.gameState.activeAuctionLots[0]!
      const withSymptom = makeSymptomaticLot(game, lot.id)
      hireMasterInspector(game, 'Rie')
      const wrapper = mountScreen()
      await wrapper.find(`[data-test="inspect-visit-${withSymptom.tier}"]`).trigger('click')
      const minutesBefore = game.inspectionVisit!.minutesLeft

      await wrapper.find(`[data-test="send-inspector-${lot.id}"]`).trigger('click')

      const updatedCar = game.gameState.activeAuctionLots.find((l) => l.id === lot.id)!.car
      expect(updatedCar.symptoms[0]!.runTestIds.length).toBeGreaterThan(0)
      expect(game.inspectionVisit!.minutesLeft).toBeLessThan(minutesBefore)

      const symptomEl = wrapper.find(`[data-test="symptom-${lot.id}"]`)
      expect(symptomEl.find('.symptom-trail').exists()).toBe(true)

      const doneLine = wrapper.find(`[data-test="inspector-done-${lot.id}"]`)
      expect(doneLine.exists()).toBe(true)
      expect(doneLine.text()).toBe('Rie hands the sheet back without a word.')
    })
  })

  describe('locked-tier guarantor copy (Sprint 115)', () => {
    it('renders the byte-verbatim guarantor line for every locked tier, with no inspect control', () => {
      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="locked-tier-regional"]').text()).toBe(
        'Members only. Somebody has to vouch for you, and nobody does. Yet.',
      )
      expect(wrapper.find('[data-test="locked-tier-premium"]').text()).toBe(
        "The book at the door is full of names. Yours needs a sponsor's beside it.",
      )
      expect(wrapper.find('[data-test="locked-tier-collector-network"]').text()).toBe(
        'Invitation only, and invitations start with a name they trust. No one is offering yours.',
      )
      for (const tier of ['regional', 'premium', 'collector-network']) {
        expect(wrapper.find(`[data-test="inspect-visit-${tier}"]`).exists()).toBe(false)
      }
    })

    it('shows the plain tier label (never the rolled venue name) on a locked tier heading', () => {
      const game = useGameStore()
      const wrapper = mountScreen()
      const headings = wrapper.findAll('.tier-head h3').map((h) => h.text())
      expect(headings).toContain(AUCTION_TIER_LABELS.regional)
      expect(headings).not.toContain(game.gameState.venueNameByTier?.regional)
    })

    it('never shows the locked line for local-yard - it is open from day one', () => {
      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="locked-tier-local-yard"]').exists()).toBe(false)
    })

    it('delivering the-fleet-spare flips regional to its real board (rolled venue name, no locked line), leaving premium/collector-network locked', () => {
      const game = useGameStore()
      warpToCatalog(game)
      const carId = giveReliableOwnedCar(game)
      game.gameState = {
        ...game.gameState,
        storyMissions: [
          { missionId: 'the-fleet-spare', status: 'active', acceptedOnDay: game.gameState.day },
        ],
      }

      const before = mountScreen()
      expect(before.find('[data-test="locked-tier-regional"]').exists()).toBe(true)

      const grade = game.gradeMission(carId)
      expect(grade.pass, JSON.stringify(grade.lines)).toBe(true)
      expect(game.deliverMission(carId)).toBe(true)

      const after = mountScreen()
      expect(after.find('[data-test="locked-tier-regional"]').exists()).toBe(false)
      expect(after.find('[data-test="locked-tier-premium"]').exists()).toBe(true)
      expect(after.find('[data-test="locked-tier-collector-network"]').exists()).toBe(true)

      const regionalVenue = venueLabelFor('regional', game.gameState.venueNameByTier)
      expect(after.findAll('.tier-head h3').map((h) => h.text())).toContain(regionalVenue)
      // The local-yard heading stays exactly what it always was.
      const localVenue = venueLabelFor('local-yard', game.gameState.venueNameByTier)
      expect(after.findAll('.tier-head h3').map((h) => h.text())).toContain(localVenue)
    })
  })
})
