import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { ECONOMY } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { photoCountForReputationTier } from './officeDisplay'
import StandingScreen from './StandingScreen.vue'

// Track every mounted
// wrapper and unmount it after each test, so a component left mounted from a
// prior test cannot leak its store's pinia into the next (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(StandingScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
  mountedWrappers.push(wrapper)
  return wrapper
}

describe('StandingScreen (Sprint 62 item 17)', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

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
        expect(text, `"${banned}" reached the Standing screen`).not.toContain(banned)
      }
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
})
