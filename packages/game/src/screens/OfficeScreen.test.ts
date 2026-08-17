import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { ECONOMY } from '@midnight-garage/content'
import { dayOfSeason, eraOf, seasonOf } from '@midnight-garage/sim'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { decodeSave, encodeSave } from '../save/saveCodec'
import { eraLabel, seasonLabel } from '../utils/calendarLabels'
import { SELLING_CHANNEL_LABELS } from '../utils/sellingChannelLabels'
import { photoCountForReputationTier } from './officeDisplay'
import OfficeScreen from './OfficeScreen.vue'

// Track every mounted wrapper and unmount it after each test, so a component
// left mounted from a prior test cannot leak its store's pinia into the next
// (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(OfficeScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
  mountedWrappers.push(wrapper)
  return wrapper
}

/** A career with one closed week and one still running, written straight onto
 * the accumulator - the cash register block's own input. */
function seedTwoWeeks(game: ReturnType<typeof useGameStore>): void {
  game.gameState = {
    ...game.gameState,
    day: 9,
    financeLedger: {
      '1': {
        incomeYen: 480_000,
        onCarsYen: 260_000,
        stockYen: 31_000,
        runningYen: 19_000,
        investmentYen: 0,
      },
      '2': {
        incomeYen: 0,
        onCarsYen: 12_000,
        stockYen: 0,
        runningYen: 8_000,
        investmentYen: 2_000_000,
      },
    },
  }
}

describe('OfficeScreen (sprint209.md task B: the office)', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('links back to the garage', () => {
    const wrapper = mountScreen()
    const link = wrapper
      .findAllComponents(RouterLinkStub)
      .find((c) => c.attributes('data-test') === 'office-back')
    expect(link).toBeDefined()
    expect(link!.props('to')).toEqual({ name: 'garage' })
  })

  describe('the phone block', () => {
    it('is a door to the jobs board', () => {
      const wrapper = mountScreen()
      const link = wrapper
        .findAllComponents(RouterLinkStub)
        .find((c) => c.attributes('data-test') === 'phone-link')
      expect(link).toBeDefined()
      expect(link!.props('to')).toEqual({ name: 'jobs' })
    })
  })

  describe('reputation', () => {
    it('shows the current reputation tier and exact points, and names the next tier', () => {
      const game = useGameStore()
      game.newGame(1)
      game.devSetReputationTier('local') // sets points to the local threshold
      const wrapper = mountScreen()

      expect(wrapper.find('[data-test="rep-tier"]').text()).toBe('local')
      expect(wrapper.find('[data-test="rep-points"]').text()).toBe(String(game.reputationPoints))
      // The next tier is named with its real threshold, read from content
      // (`economy.json`'s reputation ladder) - never a number this
      // test hardcodes.
      const next = wrapper.find('[data-test="rep-next"]').text()
      expect(next).toContain('known')
      expect(next).toContain(String(ECONOMY.reputation.tierThresholds.known))
    })

    it('at the top tier, says there is nowhere higher rather than naming a next tier', () => {
      const game = useGameStore()
      game.newGame(1)
      game.devSetReputationTier('legend')
      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="rep-next"]').text().toLowerCase()).toContain('top')
    })

    describe('progress bars (Sprint 69, playtest item 24)', () => {
      it("shows reputation as points against the NEXT tier's real threshold", () => {
        const game = useGameStore()
        game.newGame(1)
        game.devSetReputationTier('local')
        const wrapper = mountScreen()

        const bar = wrapper.find('[data-test="rep-bar"]')
        expect(bar.exists()).toBe(true)
        // "60 / 200" - the progress-bar readout format, e.g. "19/120 to next level", for rep.
        expect(bar.find('[data-test="progress-readout"]').text()).toBe(
          `${game.reputationPoints} / ${ECONOMY.reputation.tierThresholds.known}`,
        )
        expect(bar.text()).toContain('to known')
      })

      it('reads FULL at the top of the ladder, never an empty rail', () => {
        // An empty bar at legend would read as failure, which is the opposite
        // of the truth - there is simply nothing left to climb.
        const game = useGameStore()
        game.newGame(1)
        game.devSetReputationTier('legend')
        const wrapper = mountScreen()

        const bar = wrapper.find('[data-test="rep-bar"]')
        expect(bar.find('[data-test="progress-fill"]').attributes('style')).toContain('width: 100%')
        expect(bar.text()).toContain('top of the ladder')
        // No "N / M" against a threshold that does not exist.
        expect(bar.find('[data-test="progress-readout"]').text()).not.toContain('/')
      })

      it('the bars introduce no banned progression vocabulary', () => {
        const game = useGameStore()
        game.newGame(1)
        game.devSetReputationTier('local')
        const text = mountScreen().text().toLowerCase()
        for (const banned of ['xp', 'mastery', 'level', 'prestige', '%']) {
          expect(text, `"${banned}" reached the office screen`).not.toContain(banned)
        }
      })
    })
  })

  describe('scenes panel (scene-standing-arc.md step 4)', () => {
    it('lists all six scenes with their stage stated in words, never a number', () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()

      const scenes = ['collector', 'tuner', 'show-crowd', 'racer', 'daily-drivers', 'touge']
      for (const scene of scenes) {
        const stage = wrapper.find(`[data-test="scene-stage-${scene}"]`)
        expect(stage.exists()).toBe(true)
        // A fresh shop is unknown everywhere - the words, not a "0", say so.
        expect(stage.text().length).toBeGreaterThan(0)
        expect(stage.text()).not.toMatch(/\d/)
      }
    })

    it('shows a scene with no deliveries as empty, not a zero', () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="scene-daily-drivers"]').text()).toContain(
        'Nothing delivered here yet.',
      )
    })

    it('lists a real delivered car under its own scene, and no other scene', () => {
      const game = useGameStore()
      game.newGame(1)
      game.gameState = {
        ...game.gameState,
        sceneStanding: { ...game.gameState.sceneStanding, 'daily-drivers': 'known' },
        sceneLedger: {
          collector: [],
          tuner: [],
          'show-crowd': [],
          racer: [],
          'daily-drivers': [
            {
              carInstanceId: 'car-1',
              modelId: 'honda-civic-sir2-eg6',
              priceYen: 250_000,
              day: 4,
            },
          ],
          touge: [],
        },
      }
      const wrapper = mountScreen()

      const dailyDrivers = wrapper.find('[data-test="scene-cars-daily-drivers"]')
      expect(dailyDrivers.exists()).toBe(true)
      expect(dailyDrivers.text()).toContain('¥250,000')
      // Filterable by scene: the same car never leaks into another scene's list.
      expect(wrapper.find('[data-test="scene-cars-tuner"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="scene-tuner"]').text()).toContain(
        'Nothing delivered here yet.',
      )
    })
  })

  describe('office wall', () => {
    it('pins up the photo count for the current reputation tier', () => {
      const game = useGameStore()
      game.newGame(1)
      game.devSetReputationTier('local')
      const wrapper = mountScreen()

      // The photo wall is the diegetic reputation display: the count comes
      // from officeDisplay's own scaling of the tier, never a number this
      // test hardcodes.
      expect(wrapper.find('[data-test="office-photo-count"]').text()).toBe(
        `${photoCountForReputationTier('local')} photographs pinned up, local reputation`,
      )
    })

    it('shows an empty corkboard and no certificates for a fresh shop', () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()

      expect(wrapper.find('[data-test="office-card-count"]').text()).toBe('0 cars listed')
      expect(wrapper.find('[data-test="office-certificate-count"]').text()).toBe('none earned yet')
    })
  })

  describe('wall calendar (Sprint 204 item B2)', () => {
    it("names the current season and era, matching the sim's own calendar functions", () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()

      const economy = game.context.economy
      expect(wrapper.find('[data-test="wall-calendar-season"]').text()).toBe(
        seasonLabel(seasonOf(game.day, economy)),
      )
      expect(wrapper.find('[data-test="wall-calendar-era"]').text()).toBe(
        eraLabel(eraOf(game.day, economy)),
      )
    })

    it('lays the season out as four weeks of five days', () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()

      const weeks = [0, 1, 2, 3].map((i) => wrapper.find(`[data-test="wall-calendar-week-${i}"]`))
      expect(weeks.every((week) => week.exists())).toBe(true)
      expect(wrapper.find('[data-test="wall-calendar-week-4"]').exists()).toBe(false)

      const allDays = wrapper
        .find('[data-test="wall-calendar-grid"]')
        .findAll('.wall-calendar-cell')
      expect(allDays).toHaveLength(20)
      expect(allDays.map((cell) => cell.text())).toEqual(
        Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')),
      )
    })

    it("marks exactly today's cell, at the current day-within-season", () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()

      const economy = game.context.economy
      const today = dayOfSeason(game.day, economy)
      const marked = wrapper.findAll('.wall-calendar-cell.today')
      expect(marked).toHaveLength(1)
      expect(marked[0]!.text()).toBe(String(today).padStart(2, '0'))
      expect(wrapper.find('[data-test="wall-calendar-today"]').text()).toBe(
        String(today).padStart(2, '0'),
      )
    })

    it('never shows a four-digit year anywhere on the office screen', () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()
      expect(wrapper.text()).not.toMatch(/\b(19|20)\d{2}\b/)
    })
  })

  describe('the listing channels block (sprint209.md task D)', () => {
    it('names every channel currently open, and none the shop has not earned', () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()

      const list = wrapper.find('[data-test="channels-list"]')
      expect(list.exists()).toBe(true)
      expect(list.text()).toContain(SELLING_CHANNEL_LABELS.shopFront)
      expect(list.text()).not.toContain(SELLING_CHANNEL_LABELS.tradeNetwork)
    })
  })

  describe('the cash register block', () => {
    it('shows every week the shop traded, newest first, with the real yen on each line', () => {
      const game = useGameStore()
      game.newGame(1)
      seedTwoWeeks(game)
      const wrapper = mountScreen()

      const sheets = wrapper.findAll('[data-test^="cost-sheet-week-"]')
      expect(sheets).toHaveLength(2)
      expect(sheets[0]!.attributes('data-test')).toBe('cost-sheet-week-2')

      const first = wrapper.find('[data-test="cost-sheet-week-1"]')
      expect(first.find('[data-test="row-income"]').text()).toContain('480,000')
      expect(first.find('[data-test="row-on-cars"]').text()).toContain('260,000')
      expect(first.find('[data-test="row-stock"]').text()).toContain('31,000')
      expect(first.find('[data-test="row-running"]').text()).toContain('19,000')
      // 480,000 - (260,000 + 31,000 + 19,000)
      expect(first.find('[data-test="row-net"]').text()).toContain('170,000')
    })

    it('marks the week still being played as open, and never the closed ones', () => {
      const game = useGameStore()
      game.newGame(1)
      seedTwoWeeks(game)
      const wrapper = mountScreen()

      expect(wrapper.find('[data-test="cost-sheet-week-2"] [data-test="week-open"]').exists()).toBe(
        true,
      )
      expect(wrapper.find('[data-test="cost-sheet-week-1"] [data-test="week-open"]').exists()).toBe(
        false,
      )
    })

    it('separates a bay from the rent, so the running line stays readable', () => {
      const game = useGameStore()
      game.newGame(1)
      seedTwoWeeks(game)
      const wrapper = mountScreen()
      const openWeek = wrapper.find('[data-test="cost-sheet-week-2"]')

      expect(openWeek.find('[data-test="row-investment"]').text()).toContain('2,000,000')
      expect(openWeek.find('[data-test="row-running"]').text()).toContain('8,000')
      // A week that spent millions on a bay still reports a net loss honestly.
      expect(openWeek.find('[data-test="row-net"]').text()).toContain('-')
    })

    it('says so plainly when nothing has been through the till', () => {
      const game = useGameStore()
      game.newGame(1)
      game.gameState = { ...game.gameState, financeLedger: {} }
      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="cost-sheet-empty"]').exists()).toBe(true)
      expect(wrapper.findAll('[data-test^="cost-sheet-week-"]')).toHaveLength(0)
    })

    it('is a pure derivation: mounting it changes no state at all', () => {
      const game = useGameStore()
      game.newGame(1)
      seedTwoWeeks(game)
      const before = JSON.stringify(game.gameState)
      mountScreen()
      expect(JSON.stringify(game.gameState)).toBe(before)
    })

    it('carries no percentage anywhere (progression bible law 4)', () => {
      const game = useGameStore()
      game.newGame(1)
      seedTwoWeeks(game)
      expect(mountScreen().text()).not.toContain('%')
    })

    it('survives a save and reload with its figures intact', () => {
      const game = useGameStore()
      game.newGame(1)
      seedTwoWeeks(game)
      const restored = decodeSave(encodeSave(game.gameState))
      expect(restored.financeLedger).toEqual(game.gameState.financeLedger)
    })
  })
})
