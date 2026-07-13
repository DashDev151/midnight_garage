import { FACILITIES, TOOL_LINES } from '@midnight-garage/content'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import UpgradesScreen from './UpgradesScreen.vue'

const WHEELS_T2 = TOOL_LINES.wheels.tiers[1]!

function mountScreen() {
  return mount(UpgradesScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('UpgradesScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the facilities section and all six tool-line ladders', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()
    expect(wrapper.text()).toContain('Facilities')
    expect(wrapper.text()).toContain('Tools')
    expect(wrapper.findAll('.tool-column')).toHaveLength(6)
    expect(wrapper.findAll('.tier-node')).toHaveLength(18) // 6 lines x 3 tiers
    // A fresh game shows every line at its named tier-1 kit with the next
    // tier offered by name and price - never a raw component id.
    expect(wrapper.text()).toContain(TOOL_LINES.wheels.tiers[0]!.displayName)
    expect(wrapper.text()).toContain(WHEELS_T2.displayName)
  })

  it('clicking a ladder upgrade buys the next tier and re-renders it as current, once reputation clears the gate', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(WHEELS_T2.upgradePriceYen)
    game.gameState = { ...game.gameState, reputationTier: WHEELS_T2.minReputationTier! }
    const wrapper = mountScreen()
    await wrapper.get('[data-test="upgrade-tool-wheels"]').trigger('click')
    expect(game.gameState.toolTiers.wheels).toBe(2)
    const wheelsColumn = wrapper.findAll('.tool-column').find((c) => c.text().includes('Wheels'))!
    expect(wheelsColumn.find('.tier-node.owned .tier-name').text()).toBe(WHEELS_T2.displayName)
  })

  /**
   * Sprint 43 (maintainer decision, 2026-07-13): tools now gate on cash AND
   * reputation, tiers 2/3 only - inverts the old "tools are never
   * reputation-gated" assertion this test used to make.
   */
  it("refuses (with a reputation hint) below wheels tier 2's rep floor even with unlimited cash, and succeeds once reputation clears it", async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(999_999_999)
    const wrapper = mountScreen()
    const button = wrapper.get('[data-test="upgrade-tool-wheels"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.text()).toContain(`needs ${WHEELS_T2.minReputationTier} reputation`)

    game.gameState = { ...game.gameState, reputationTier: WHEELS_T2.minReputationTier! }
    await wrapper.vm.$nextTick()
    expect(
      (wrapper.get('[data-test="upgrade-tool-wheels"]').element as HTMLButtonElement).disabled,
    ).toBe(false)
    await wrapper.get('[data-test="upgrade-tool-wheels"]').trigger('click')
    expect(game.gameState.toolTiers.wheels).toBe(2)
  })

  it('a maxed line shows Fully equipped and no rung offers an upgrade button', () => {
    const game = useGameStore()
    game.newGame(1)
    game.devSetToolTier('wheels', 3)
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="upgrade-tool-wheels"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Fully equipped')
  })

  describe('the tool-wall info box (Sprint 43)', () => {
    it('is hidden until a rung is selected', () => {
      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="tool-info-box"]').exists()).toBe(false)
    })

    it('shows real content on selection, and hides again on a second click (toggle)', async () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()
      await wrapper.get('[data-test="tier-node-engine-3"]').trigger('click')
      const box = wrapper.get('[data-test="tool-info-box"]')
      // Engine tier 3 is the one real own-car capability ceiling.
      expect(box.text()).toContain('NA-to-turbo conversion')
      await wrapper.get('[data-test="tier-node-engine-3"]').trigger('click')
      expect(wrapper.find('[data-test="tool-info-box"]').exists()).toBe(false)
    })
  })

  it('the service bay purchase button is disabled and hinted at a fresh, unranked game', () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(FACILITIES.service.bayPricesYen[0]!)
    const wrapper = mountScreen()
    const button = wrapper.get('[data-test="buy-service-bay"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.text()).toContain(`needs ${FACILITIES.service.minReputationTier[0]} reputation`)
  })

  it('buying a service bay succeeds once reputation and cash both clear the gate', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(FACILITIES.service.bayPricesYen[0]!)
    game.gameState = {
      ...game.gameState,
      reputationTier: FACILITIES.service.minReputationTier[0]!,
    }
    const startingCount = game.serviceBayCount
    const wrapper = mountScreen()
    await wrapper.get('[data-test="buy-service-bay"]').trigger('click')
    expect(game.serviceBayCount).toBe(startingCount + 1)
  })
})
