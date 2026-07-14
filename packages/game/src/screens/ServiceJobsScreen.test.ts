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

  /**
   * Sprint 40 item 2: the board must never read "work done - hand back" (or
   * even "work outstanding") while the customer's car is still in transit -
   * only "car arriving tomorrow." Board gating keys off `inTransit`, not
   * `workDone` alone (the pre-fix bug: a rolled car could vacuously satisfy
   * a task before it ever arrived).
   */
  it('shows "car arriving tomorrow" for an in-transit job; the normal work-state line only appears once it arrives', async () => {
    const game = useGameStore()
    game.newGame(1)
    warpToOffers(game)
    const offer = game.serviceJobOffers[0]
    if (!offer) throw new Error('expected an offer on the board')
    game.acceptServiceJob(offer.id)
    const job = game.activeServiceJobs.find((j) => j.id === offer.id)!
    expect(job.arrivesOnDay).not.toBeNull() // still in transit

    const wrapper = mountScreen()
    expect(wrapper.text()).toContain('car arriving tomorrow')
    expect(wrapper.text()).not.toContain('work done - hand back')
    expect(wrapper.text()).not.toContain('work outstanding')

    // Once it arrives, the normal work-state line takes over.
    game.endDay()
    const wrapperAfterArrival = mountScreen()
    expect(wrapperAfterArrival.text()).not.toContain('car arriving tomorrow')
    const hasWorkStateLine =
      wrapperAfterArrival.text().includes('work done - hand back') ||
      wrapperAfterArrival.text().includes('work outstanding')
    expect(hasWorkStateLine).toBe(true)
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

  /**
   * Sprint 57 decision 1: completion moves to this screen - one place to
   * accept, one and the same place to complete. Clicking the button here
   * (not the car page, which no longer offers it) resolves the job.
   */
  it('completes (or gives up) a job right from this screen, once the car has arrived', async () => {
    const game = useGameStore()
    game.newGame(1)
    warpToOffers(game)
    const offer = game.serviceJobOffers[0]
    if (!offer) throw new Error('expected an offer on the board')
    game.acceptServiceJob(offer.id)
    game.endDay() // the customer's car actually arrives

    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="complete-service-job"]').exists()).toBe(true)
    await wrapper.find('[data-test="complete-service-job"]').trigger('click')
    // No real work was done, so this reads as "Give Up Job" - the job
    // resolves (fails) and leaves the active list either way.
    expect(game.activeServiceJobs.some((j) => j.id === offer.id)).toBe(false)
    expect(game.lastJobResult?.outcome).toBe('failed')
  })

  it('the rep figure links to the Standing screen (Sprint 62 item 17)', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()
    const link = wrapper
      .findAllComponents(RouterLinkStub)
      .find((c) => c.attributes('data-test') === 'standing-link')
    expect(link).toBeDefined()
    expect(link!.props('to')).toEqual({ name: 'standing' })
  })

  it('shows a fitment-class chip on each offer card (Sprint 61 item 15)', () => {
    const game = useGameStore()
    game.newGame(1)
    const offer = game.serviceJobOfferViews[0]
    if (!offer) throw new Error('expected an offer on the board')
    expect(offer.fitmentClass).not.toBeNull()
    const wrapper = mountScreen()
    const chip = wrapper.find(`[data-test="class-${offer.id}"]`)
    expect(chip.exists()).toBe(true)
    // Renders the class display name (e.g. "Kei & Compact"), not the raw enum.
    expect(chip.text()).toBe(game.fitmentClassLabel(offer.fitmentClass!))
    expect(chip.text()).not.toBe(offer.fitmentClass)
  })
})
