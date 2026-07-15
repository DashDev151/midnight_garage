import { mount, RouterLinkStub } from '@vue/test-utils'
import { ECONOMY } from '@midnight-garage/content'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import StandingScreen from './StandingScreen.vue'

function mountScreen() {
  return mount(StandingScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('StandingScreen (Sprint 62 item 17)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the current reputation tier and exact points, and names the next tier', () => {
    const game = useGameStore()
    game.newGame(1)
    game.devSetReputationTier('local') // sets points to the local threshold
    const wrapper = mountScreen()

    expect(wrapper.find('[data-test="rep-tier"]').text()).toBe('local')
    expect(wrapper.find('[data-test="rep-points"]').text()).toBe(String(game.reputationPoints))
    // The next tier is named with its real threshold, read from content
    // (Sprint 69 moved the ladder into `economy.json`) - never a number this
    // test hardcodes, which is exactly what made it stale when the ladder
    // moved.
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

  it('lists all six specialty disciplines with points and a named technique', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()

    const groups = ['engine', 'drivetrain', 'suspension', 'wheels', 'body', 'interior']
    for (const group of groups) {
      const row = wrapper.find(`[data-test="specialty-${group}"]`)
      expect(row.exists()).toBe(true)
      // Named technique shown even when locked (progression bible law 5).
      expect(row.text()).toContain('unlocks at 120 pts')
    }
    // The discipline display names render (not raw ids).
    expect(wrapper.text()).toContain(game.componentLabel('engine'))
    // Banned progression-bible vocabulary never appears in the copy.
    const text = wrapper.text().toLowerCase()
    for (const banned of ['xp', 'mastery', 'level', 'prestige']) {
      expect(text).not.toContain(banned)
    }
  })

  it('shows an earned technique as earned once the discipline clears the threshold', () => {
    const game = useGameStore()
    game.newGame(1)
    game.gameState = {
      ...game.gameState,
      specialty: { ...game.gameState.specialty, engine: 130 },
    }
    const wrapper = mountScreen()
    const engineRow = wrapper.find('[data-test="specialty-engine"]')
    expect(engineRow.text()).toContain('Earned')
    expect(engineRow.find('.technique.earned').exists()).toBe(true)
  })

  describe('progress bars (Sprint 69, playtest item 24)', () => {
    it("shows reputation as points against the NEXT tier's real threshold", () => {
      const game = useGameStore()
      game.newGame(1)
      game.devSetReputationTier('local')
      const wrapper = mountScreen()

      const bar = wrapper.find('[data-test="rep-bar"]')
      expect(bar.exists()).toBe(true)
      // "60 / 200" - the maintainer's "19/120 to next level", for rep.
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

    it('shows one bar per discipline, against its technique threshold', () => {
      const game = useGameStore()
      game.newGame(1)
      game.gameState = { ...game.gameState, specialty: { ...game.gameState.specialty, engine: 19 } }
      const wrapper = mountScreen()

      expect(wrapper.findAll('[data-test^="specialty-bar-"]')).toHaveLength(6)
      const engine = wrapper.find('[data-test="specialty-bar-engine"]')
      // The maintainer's own example, literally: "like 19/120 to next level".
      expect(engine.find('[data-test="progress-readout"]').text()).toBe('19 / 120')
    })

    it('marks a cleared discipline complete and fills its bar', () => {
      const game = useGameStore()
      game.newGame(1)
      game.gameState = {
        ...game.gameState,
        specialty: { ...game.gameState.specialty, engine: 130 },
      }
      const wrapper = mountScreen()

      const engine = wrapper.find('[data-test="specialty-bar-engine"]')
      expect(engine.find('.rail.complete').exists()).toBe(true)
      expect(engine.find('[data-test="progress-fill"]').attributes('style')).toContain(
        'width: 100%',
      )
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
})
