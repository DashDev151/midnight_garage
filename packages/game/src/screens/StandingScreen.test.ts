import { mount, RouterLinkStub } from '@vue/test-utils'
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
    game.devSetReputationTier('local') // sets points to the local threshold (15)
    const wrapper = mountScreen()

    expect(wrapper.find('[data-test="rep-tier"]').text()).toBe('local')
    expect(wrapper.find('[data-test="rep-points"]').text()).toBe(String(game.reputationPoints))
    // Next tier is named with its threshold - not a bar or a percentage.
    const next = wrapper.find('[data-test="rep-next"]').text()
    expect(next).toContain('known')
    expect(next).toContain('50')
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
})
