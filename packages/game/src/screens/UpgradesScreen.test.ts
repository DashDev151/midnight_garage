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
    expect(wrapper.findAll('.tool-row')).toHaveLength(6)
    // A fresh game shows every line at its named tier-1 kit with the next
    // tier offered by name and price - never a raw component id.
    expect(wrapper.text()).toContain(TOOL_LINES.wheels.tiers[0]!.displayName)
    expect(wrapper.text()).toContain(WHEELS_T2.displayName)
  })

  it('clicking a ladder upgrade buys the next tier and re-renders it as current', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(WHEELS_T2.upgradePriceYen)
    const wrapper = mountScreen()
    await wrapper.get('[data-test="upgrade-tool-wheels"]').trigger('click')
    expect(game.gameState.toolTiers.wheels).toBe(2)
    expect(wrapper.text()).toContain(`${WHEELS_T2.displayName} (tier 2)`)
  })

  it('the upgrade button is disabled on cash alone - no reputation hint exists for tools', () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(-game.cashYen) // drain to zero
    const wrapper = mountScreen()
    const button = wrapper.get('[data-test="upgrade-tool-wheels"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    // Tools are never reputation-gated (Sprint 36) - the only hint style on
    // this screen belongs to bays.
    expect(wrapper.find('.tools .rep-hint').exists()).toBe(false)
  })

  it('a maxed line shows Fully equipped instead of an upgrade button', () => {
    const game = useGameStore()
    game.newGame(1)
    game.devSetToolTier('wheels', 3)
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="upgrade-tool-wheels"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Fully equipped')
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
