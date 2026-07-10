import { EQUIPMENT, FACILITIES } from '@midnight-garage/content'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import UpgradesScreen from './UpgradesScreen.vue'

/** Ungated per the Sprint 16 ladder — day-1 accessible without reputation. */
const TIRE_MACHINE = EQUIPMENT.find((e) => e.componentIds.includes('wheels'))!
/** Reputation-gated per the Sprint 16 ladder (requires 'known'). */
const WELDER = EQUIPMENT.find((e) => e.componentIds.includes('body'))!

function mountScreen() {
  return mount(UpgradesScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('UpgradesScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders the facilities and equipment sections', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()
    expect(wrapper.text()).toContain('Facilities')
    expect(wrapper.text()).toContain('Equipment')
    expect(wrapper.findAll('.equipment-row')).toHaveLength(EQUIPMENT.length)
  })

  it('buys an ungated equipment item and reflects it as owned', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(TIRE_MACHINE.priceYen)
    const wrapper = mountScreen()
    await wrapper.get(`[data-test="buy-equipment-${TIRE_MACHINE.id}"]`).trigger('click')
    expect(game.hasEquipmentForComponent('wheels')).toBe(true)
  })

  it('shows a reputation hint and a disabled buy button for a gated item not yet reachable', () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(WELDER.priceYen)
    const wrapper = mountScreen()
    const button = wrapper.get(`[data-test="buy-equipment-${WELDER.id}"]`)
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.text()).toContain('needs known reputation')
  })

  it('the gated item becomes buyable once reputation clears the bar', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(WELDER.priceYen)
    game.gameState = { ...game.gameState, reputationTier: 'known' }
    const wrapper = mountScreen()
    await wrapper.get(`[data-test="buy-equipment-${WELDER.id}"]`).trigger('click')
    expect(game.hasEquipmentForComponent('body')).toBe(true)
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
