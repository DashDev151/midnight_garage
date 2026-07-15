import { CARS, PARTS } from '@midnight-garage/content'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import EndDayButton from './EndDayButton.vue'

describe('EndDayButton (Sprint 24 fix 4)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('an empty cart ends the day immediately, with no dialog', async () => {
    const game = useGameStore()
    const dayBefore = game.gameState.day
    const wrapper = mount(EndDayButton)

    await wrapper.find('[data-test="end-day"]').trigger('click')

    expect(wrapper.find('[data-test="end-day-cart-warning"]').exists()).toBe(false)
    expect(game.gameState.day).toBe(dayBefore + 1)
  })

  it('a non-empty cart shows the warning dialog instead of ending the day', async () => {
    const game = useGameStore()
    const dayBefore = game.gameState.day
    game.addToCart(PARTS[0]!.id)
    const wrapper = mount(EndDayButton)

    await wrapper.find('[data-test="end-day"]').trigger('click')

    expect(wrapper.find('[data-test="end-day-cart-warning"]').exists()).toBe(true)
    expect(game.gameState.day).toBe(dayBefore)
  })

  it('cancel dismisses the dialog without advancing the day', async () => {
    const game = useGameStore()
    const dayBefore = game.gameState.day
    game.addToCart(PARTS[0]!.id)
    const wrapper = mount(EndDayButton)
    await wrapper.find('[data-test="end-day"]').trigger('click')

    await wrapper.find('[data-test="end-day-cart-cancel"]').trigger('click')

    expect(wrapper.find('[data-test="end-day-cart-warning"]').exists()).toBe(false)
    expect(game.gameState.day).toBe(dayBefore)
  })

  it('proceeding from the dialog ends the day anyway', async () => {
    const game = useGameStore()
    const dayBefore = game.gameState.day
    game.addToCart(PARTS[0]!.id)
    const wrapper = mount(EndDayButton)
    await wrapper.find('[data-test="end-day"]').trigger('click')

    await wrapper.find('[data-test="end-day-cart-confirm"]').trigger('click')

    expect(wrapper.find('[data-test="end-day-cart-warning"]').exists()).toBe(false)
    expect(game.gameState.day).toBe(dayBefore + 1)
  })

  describe('the warning stack (Sprint 68 decision 2, playtest item 11)', () => {
    it('warns about planned work that was never confirmed, and does not end the day', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' })
      const dayBefore = game.gameState.day
      const wrapper = mount(EndDayButton)

      await wrapper.find('[data-test="end-day"]').trigger('click')

      const warnings = wrapper.find('[data-test="end-day-warnings"]')
      expect(warnings.exists()).toBe(true)
      expect(warnings.text()).toContain("haven't confirmed it")
      expect(game.gameState.day).toBe(dayBefore)
    })

    it('warns about a finished job nobody handed back', async () => {
      const game = useGameStore()
      game.newGame(1)
      for (let i = 0; i < 20 && game.serviceJobOffers.length === 0; i++) game.endDay()
      const offer = game.serviceJobOffers[0]
      if (!offer) throw new Error('expected an offer on the board')
      game.acceptServiceJob(offer.id)
      game.endDay() // the customer's car arrives

      // Force the job's work genuinely done, rather than hoping a rolled car
      // happens to satisfy its own tasks (it does not - measured). The target
      // band is set to the band the part ALREADY has, so `isServiceTaskDone`
      // is satisfied for real through the normal rule, not a stubbed flag.
      const job = game.gameState.activeServiceJobs.find((j) => j.id === offer.id)
      if (!job) throw new Error('expected the accepted job to be active')
      const band = job.car.parts.panels.installed?.band
      if (!band) throw new Error('expected the rolled car to have panels fitted')
      game.gameState = {
        ...game.gameState,
        activeServiceJobs: game.gameState.activeServiceJobs.map((j) =>
          j.id === offer.id
            ? {
                ...j,
                tasks: [
                  {
                    action: 'repair' as const,
                    carPartId: 'panels' as const,
                    targetBand: band,
                    minToolTier: 1 as const,
                  },
                ],
              }
            : j,
        ),
      }
      // The state really is "finished, still on the ramp" - asserted, not assumed.
      expect(game.finishedJobsAwaitingHandback.map((j) => j.id)).toContain(offer.id)

      const wrapper = mount(EndDayButton)
      await wrapper.find('[data-test="end-day"]').trigger('click')
      expect(wrapper.find('[data-test="end-day-warnings"]').text()).toContain('hand the car back')
    })

    it('stacks every warning into ONE panel rather than a modal each', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' })
      game.addToCart(PARTS[0]!.id)
      const wrapper = mount(EndDayButton)

      await wrapper.find('[data-test="end-day"]').trigger('click')

      expect(wrapper.findAll('[data-test="end-day-cart-warning"]')).toHaveLength(1)
      expect(wrapper.findAll('[data-test="end-day-warnings"] li')).toHaveLength(2)
    })

    it('warns but never blocks - confirming still ends the day', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      game.stageAction(carId, { kind: 'repair', componentId: 'body', targetBand: 'mint' })
      const dayBefore = game.gameState.day
      const wrapper = mount(EndDayButton)

      await wrapper.find('[data-test="end-day"]').trigger('click')
      await wrapper.find('[data-test="end-day-cart-confirm"]').trigger('click')

      expect(game.gameState.day).toBe(dayBefore + 1)
    })
  })

  it('shows the cash total only when show-cash is set', () => {
    const withoutCash = mount(EndDayButton)
    expect(withoutCash.text()).toBe('End Day')

    const withCash = mount(EndDayButton, { props: { showCash: true } })
    expect(withCash.text()).toContain('End Day (')
  })
})
