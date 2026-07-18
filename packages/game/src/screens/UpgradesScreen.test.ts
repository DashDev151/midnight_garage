import type { ComponentId, ToolTier } from '@midnight-garage/content'
import { FACILITIES, TOOL_LINES } from '@midnight-garage/content'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import UpgradesScreen from './UpgradesScreen.vue'

const WHEELS_T2 = TOOL_LINES.wheels.tiers[1]!

// Sprint 82 decision 7 (Pinia multi-mount isolation): track every mounted
// wrapper and unmount it after each test, so a component left mounted from a
// prior test cannot leak its store's pinia into the next (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(UpgradesScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
  mountedWrappers.push(wrapper)
  return wrapper
}

/** Sprint 52 decision 2: a purchase also needs a live classifieds listing
 * for the exact line+tier - tests that exercise a real purchase must seed
 * one directly, same as they already seed reputation/cash. */
function listingFor(
  game: ReturnType<typeof useGameStore>,
  componentId: ComponentId,
  tier: ToolTier,
) {
  game.gameState = {
    ...game.gameState,
    machineListing: {
      componentId,
      tier,
      priceYen: 1,
      postedOnDay: game.gameState.day,
      expiresOnDay: game.gameState.day + 3,
    },
  }
}

describe('UpgradesScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

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
    listingFor(game, 'wheels', 2)
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
    listingFor(game, 'wheels', 2)
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

    /**
     * Sprint 92 (rental made legible): selecting an unowned tier-2 rung surfaces
     * the machine-shop rental notice; owning that tier-2 removes it.
     */
    it('a tier-2 rung shows the rental fee line until the machine is owned', async () => {
      const game = useGameStore()
      game.newGame(1) // owns every line at tier 1, so tier 2 is unowned
      const wrapper = mountScreen()
      await wrapper.get('[data-test="tier-node-suspension-2"]').trigger('click')
      const line = wrapper.find('[data-test="rental-fee-line"]')
      expect(line.exists()).toBe(true)
      expect(line.text()).toContain('machine shop')

      game.devSetToolTier('suspension', 2)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-test="rental-fee-line"]').exists()).toBe(false)
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

  describe('the classifieds section (Sprint 52 decision 2)', () => {
    it('shows the empty state on a fresh game with no listing', () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="no-listing"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('Nothing in the classifieds this week')
      expect(wrapper.find('[data-test="machine-listing"]').exists()).toBe(false)
    })

    it('shows the live listing (tier, name, price, days left) once one is posted', () => {
      const game = useGameStore()
      game.newGame(1)
      listingFor(game, 'wheels', 2)
      const wrapper = mountScreen()
      const card = wrapper.get('[data-test="machine-listing"]')
      expect(card.text()).toContain(WHEELS_T2.displayName)
      expect(card.text()).toContain('Tier 2')
      expect(wrapper.find('[data-test="no-listing"]').exists()).toBe(false)
    })

    it('an otherwise-eligible rung stays disabled with a classifieds hint until its tier is actually listed', () => {
      const game = useGameStore()
      game.newGame(1)
      game.devGiveCash(999_999_999)
      game.gameState = { ...game.gameState, reputationTier: WHEELS_T2.minReputationTier! }
      const wrapper = mountScreen()
      const button = wrapper.get('[data-test="upgrade-tool-wheels"]')
      expect((button.element as HTMLButtonElement).disabled).toBe(true)
      expect(wrapper.find('[data-test="needs-listing-wheels"]').exists()).toBe(true)
      expect(wrapper.text()).not.toContain(`needs ${WHEELS_T2.minReputationTier} reputation`)
    })
  })

  describe('gate explanations are tooltips, not always-visible sentences (Sprint 65 decision 3)', () => {
    it('a rep-gated rung carries its reason in a HintTooltip, and the old always-visible hint classes are gone', () => {
      const game = useGameStore()
      game.newGame(1) // fresh: unknown reputation, so tier 2 is rep-gated
      game.devGiveCash(999_999_999)
      const wrapper = mountScreen()

      // The retired always-visible gate-sentence classes no longer render.
      expect(wrapper.find('.rep-hint').exists()).toBe(false)
      expect(wrapper.find('.listing-hint').exists()).toBe(false)
      expect(wrapper.find('.tier-rep-req').exists()).toBe(false)

      // The reason lives in a HintTooltip bubble instead (present in the DOM,
      // revealed on hover/focus) - at least one rep gate exists on a fresh game.
      const tips = wrapper.findAll('[data-test^="gate-tip-rep-"]')
      expect(tips.length).toBeGreaterThan(0)
      expect(tips[0]!.find('[role="tooltip"]').text()).toContain('reputation')
    })

    it('a gated facility card dims and explains itself via a tooltip, not a permanent sentence', () => {
      const game = useGameStore()
      game.newGame(1) // unknown rep: bays are rep-gated
      game.devGiveCash(999_999_999)
      const wrapper = mountScreen()

      const gatedCard = wrapper.findAll('.purchase-card').find((c) => c.classes().includes('gated'))
      expect(gatedCard).toBeDefined()
      // The reason is in the tooltip, not an always-visible sentence in the card.
      const tip = gatedCard!.find('[role="tooltip"]')
      expect(tip.exists()).toBe(true)
      expect(tip.text()).toContain('reputation')
    })
  })
})
