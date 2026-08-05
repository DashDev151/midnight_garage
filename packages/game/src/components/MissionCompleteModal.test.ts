import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import MissionCompleteModal from './MissionCompleteModal.vue'

/**
 * Every wrapper is tracked
 * and unmounted after its test, so a component left mounted from a prior test
 * cannot leak its store's pinia into the next (see App/CarDetailScreen).
 */
const mountedWrappers: VueWrapper[] = []
function track<T extends VueWrapper>(wrapper: T): T {
  mountedWrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

describe('MissionCompleteModal', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders nothing when there is no result', () => {
    const wrapper = track(
      mount(MissionCompleteModal, { global: { stubs: { RouterLink: RouterLinkStub } } }),
    )
    expect(wrapper.find('[data-test="mission-complete-modal"]').exists()).toBe(false)
  })

  it('shows the persona line, payout, and reputation for a plain delivery (no tip)', () => {
    const game = useGameStore()
    game.lastMissionResult = {
      personaName: 'Test Customer',
      copy: 'Exactly what I asked for.',
      payoutYen: 500_000,
      tipYen: 0,
      reputationGained: 20,
      profitYen: 50_000,
    }
    const wrapper = track(
      mount(MissionCompleteModal, { global: { stubs: { RouterLink: RouterLinkStub } } }),
    )
    expect(wrapper.find('[data-test="mission-complete-modal"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Test Customer')
    expect(wrapper.text()).toContain('Exactly what I asked for.')
    expect(wrapper.find('[data-test="mission-result-payout"]').text()).toContain('500,000')
    expect(wrapper.text()).toContain('+20')
    expect(wrapper.find('[data-test="mission-result-tip"]').exists()).toBe(false)
  })

  it('shows the tip line only when a tip was actually earned', () => {
    const game = useGameStore()
    game.lastMissionResult = {
      personaName: 'Test Customer',
      copy: 'Better than I could have hoped for.',
      payoutYen: 1_000_000,
      tipYen: 200_000,
      reputationGained: 30,
      profitYen: 100_000,
    }
    const wrapper = track(
      mount(MissionCompleteModal, { global: { stubs: { RouterLink: RouterLinkStub } } }),
    )
    const tipEl = wrapper.find('[data-test="mission-result-tip"]')
    expect(tipEl.exists()).toBe(true)
    expect(tipEl.text()).toContain('200,000')
  })

  it('Continue dismisses the result', async () => {
    const game = useGameStore()
    game.lastMissionResult = {
      personaName: 'Test Customer',
      copy: 'Thanks.',
      payoutYen: 200_000,
      tipYen: 0,
      reputationGained: 10,
      profitYen: 20_000,
    }
    const wrapper = track(
      mount(MissionCompleteModal, { global: { stubs: { RouterLink: RouterLinkStub } } }),
    )
    await wrapper.find('[data-test="mission-result-continue"]').trigger('click')
    expect(game.lastMissionResult).toBeNull()
  })

  it('steers to the cost sheet, explaining the gap between profit and cash, and dismisses on the way', async () => {
    const game = useGameStore()
    game.lastMissionResult = {
      personaName: 'Test Customer',
      copy: 'Thanks.',
      payoutYen: 142_000,
      tipYen: 0,
      reputationGained: 10,
      profitYen: 26_300,
    }
    const wrapper = track(
      mount(MissionCompleteModal, { global: { stubs: { RouterLink: RouterLinkStub } } }),
    )
    const link = wrapper.find('[data-test="mission-result-costs-link"]')
    expect(link.exists()).toBe(true)
    expect(wrapper.text()).toContain('billed to the shop, not the car')
    await link.trigger('click')
    expect(game.lastMissionResult).toBeNull()
  })

  describe('the profit line (Sprint 111 item 4)', () => {
    it('shows a positive profit in green, tabbed alongside payout and tip', () => {
      const game = useGameStore()
      game.lastMissionResult = {
        personaName: 'Test Customer',
        copy: 'Thanks.',
        payoutYen: 148_000,
        tipYen: 0,
        reputationGained: 15,
        profitYen: 10_600,
      }
      const wrapper = track(
        mount(MissionCompleteModal, { global: { stubs: { RouterLink: RouterLinkStub } } }),
      )
      const profitEl = wrapper.find('[data-test="mission-result-profit"]')
      expect(profitEl.exists()).toBe(true)
      expect(profitEl.classes()).toContain('up')
      expect(profitEl.text()).toBe('+¥10,600')
    })

    it('shows a negative profit in red, signed', () => {
      const game = useGameStore()
      game.lastMissionResult = {
        personaName: 'Test Customer',
        copy: 'Thanks.',
        payoutYen: 100_000,
        tipYen: 0,
        reputationGained: 15,
        profitYen: -25_000,
      }
      const wrapper = track(
        mount(MissionCompleteModal, { global: { stubs: { RouterLink: RouterLinkStub } } }),
      )
      const profitEl = wrapper.find('[data-test="mission-result-profit"]')
      expect(profitEl.classes()).toContain('down')
      expect(profitEl.text()).toBe('-¥25,000')
    })
  })
})
