import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import ServiceJobsScreen from './ServiceJobsScreen.vue'

function mountScreen() {
  return mount(ServiceJobsScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

function warpToOffers(game: ReturnType<typeof useGameStore>) {
  for (let i = 0; i < 20 && game.serviceJobOffers.length === 0; i++) game.endDay()
}

describe('ServiceJobsScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the job board with offers already on it on day 1 (Sprint 10)', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()
    expect(wrapper.text()).not.toContain('No jobs on the board')
    expect(wrapper.findAll('.offer').length).toBe(game.serviceJobOffers.length)
  })

  it('accepting a job brings the car into the shop instantly (Sprint 11)', async () => {
    const game = useGameStore()
    game.newGame(1)
    // Sprint 36: nothing gates acceptance at tier 1 - every shipped template
    // defaults to minToolTier 1.
    warpToOffers(game)
    const offer = game.serviceJobOffers[0]
    if (!offer) throw new Error('expected an offer on the board')
    const wrapper = mountScreen()
    await wrapper.find(`[data-test="accept-${offer.id}"]`).trigger('click')
    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(true)
    expect(game.serviceJobOffers.some((o) => o.id === offer.id)).toBe(false)
  })

  it('an offer one tool tier short disables Accept, with the upgrade hint as its tooltip (Sprint 36)', () => {
    const game = useGameStore()
    game.newGame(1)
    warpToOffers(game)
    const offer = game.gameState.serviceJobOffers[0]
    if (!offer) throw new Error('expected an offer on the board')
    // Raise every task's tier ceiling one above the shop's all-tier-1 start -
    // the shipped content is all-default-1, so a deficit has to be injected.
    game.gameState = {
      ...game.gameState,
      serviceJobOffers: game.gameState.serviceJobOffers.map((o) =>
        o.id === offer.id
          ? { ...o, tasks: o.tasks.map((t) => ({ ...t, minToolTier: 2 as const })) }
          : o,
      ),
    }
    const wrapper = mountScreen()
    const button = wrapper.get(`[data-test="accept-${offer.id}"]`)
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(button.attributes('title')).toContain('needs')
  })
})
