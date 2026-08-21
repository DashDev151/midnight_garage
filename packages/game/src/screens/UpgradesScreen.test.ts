import { ECONOMY, FACILITIES, TOOL_LINES, TOOL_SHOPS } from '@midnight-garage/content'
import { toolLevelsFor } from '@midnight-garage/sim'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import UpgradesScreen from './UpgradesScreen.vue'

const WHEELS_T2 = TOOL_LINES.wheels.tiers[1]!
const CHASSIS_SHOP = TOOL_SHOPS.find((shop) => shop.covers.includes('drivetrain'))!

// Track every mounted
// wrapper and unmount it after each test, so a component left mounted from a
// prior test cannot leak its store's pinia into the next (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  // A real (if routeless) router so `useRoute()` resolves - the screen reads
  // `route.query.from` for its back control (`mapBack.ts`) - while
  // `RouterLinkStub` keeps every `<RouterLink>` a plain, inspectable stub as
  // this file always tested them.
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  const wrapper = mount(UpgradesScreen, {
    global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

describe('UpgradesScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('renders the three sections in the doc order: Benches, then the bay, then Rooms', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()
    expect(wrapper.text()).toContain('Facilities')
    expect(wrapper.text()).toContain('Benches')
    expect(wrapper.text()).toContain('The bay')
    expect(wrapper.text()).toContain('Rooms')
    const order = wrapper
      .findAll('[data-test="garage-benches"], [data-test="garage-bay"], [data-test="garage-rooms"]')
      .map((section) => section.attributes('data-test'))
    expect(order).toEqual(['garage-benches', 'garage-bay', 'garage-rooms'])
  })

  it('each bench lists exactly its own tool lines, with a line naming its rungs', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()

    const engineBench = wrapper.get('[data-test="bench-group-engine-bench"]')
    expect(engineBench.findAll('.tool-line').map((line) => line.attributes('data-test'))).toEqual([
      'tool-line-engine',
    ])

    const chassisBench = wrapper.get('[data-test="bench-group-chassis-bench"]')
    expect(chassisBench.findAll('.tool-line').map((line) => line.attributes('data-test'))).toEqual([
      'tool-line-drivetrain',
      'tool-line-suspension',
      'tool-line-wheels',
    ])

    const bodyTrimBench = wrapper.get('[data-test="bench-group-body-trim-bench"]')
    expect(bodyTrimBench.findAll('.tool-line').map((line) => line.attributes('data-test'))).toEqual(
      ['tool-line-body', 'tool-line-interior'],
    )

    // A fresh game shows every line at its named tier-1 kit with the next
    // tier offered by name and price - never a raw component id.
    const wheelsLine = chassisBench.get('[data-test="tool-line-wheels"]')
    expect(wheelsLine.text()).toContain(TOOL_LINES.wheels.tiers[0]!.displayName)
    expect(wheelsLine.text()).toContain(WHEELS_T2.displayName)
    expect(wheelsLine.text()).toContain(formatYen(WHEELS_T2.upgradePriceYen))
  })

  it('gates the rolling road on reputation, then buys it and drops the hire line', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(ECONOMY.dyno.purchasePriceYen)
    const gated = mountScreen()
    expect(gated.find('[data-test="buy-dyno"]').attributes('disabled')).toBeDefined()
    expect(gated.find('[data-test="gate-tip-dyno"]').exists()).toBe(true)

    game.devSetReputationTier(ECONOMY.dyno.minReputationTier)
    const wrapper = mountScreen()
    await wrapper.get('[data-test="buy-dyno"]').trigger('click')
    expect(game.dynoOwned).toBe(true)
    expect(wrapper.find('[data-test="buy-dyno"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="dyno-hire-line"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="dyno-row"]').classes()).toContain('owned')
  })

  it('the lift row buys through buyLift and enforces its reputation and cash gates', async () => {
    const game = useGameStore()
    game.newGame(1) // fresh: reputationTier is 'unknown', below the lift's 'local' gate
    game.devGiveCash(ECONOMY.lift.purchasePriceYen)
    const repGated = mountScreen()
    expect(repGated.get('[data-test="buy-lift"]').attributes('disabled')).toBeDefined()
    expect(repGated.get('[data-test="gate-tip-lift"]').text()).toContain(
      `needs ${ECONOMY.lift.minReputationTier} reputation`,
    )

    game.devSetReputationTier(ECONOMY.lift.minReputationTier)
    game.gameState = { ...game.gameState, cashYen: 0 }
    const cashGated = mountScreen()
    expect(cashGated.get('[data-test="buy-lift"]').attributes('disabled')).toBeDefined()
    expect(cashGated.find('[data-test="gate-tip-lift"]').exists()).toBe(false)

    game.devGiveCash(ECONOMY.lift.purchasePriceYen)
    const wrapper = mountScreen()
    await wrapper.get('[data-test="buy-lift"]').trigger('click')
    expect(game.liftOwned).toBe(true)
    expect(wrapper.find('[data-test="buy-lift"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="hire-lift-upgrades"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="lift-chip"]').text()).toBe('In-house')
  })

  it('the lift row hires through hireLift', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(ECONOMY.lift.hireFeeYen)
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="hire-lift-upgrades"]').exists()).toBe(true)

    await wrapper.get('[data-test="hire-lift-upgrades"]').trigger('click')
    expect(game.liftAvailableToday).toBe(true)
    expect(game.liftOwned).toBe(false)
    expect(wrapper.get('[data-test="lift-chip"]').text()).toBe('Hired today')
    expect(wrapper.find('[data-test="hire-lift-upgrades"]').exists()).toBe(false)
  })

  it('clicking a ladder upgrade buys the next tier and re-renders it as current, on reputation and cash alone', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(WHEELS_T2.upgradePriceYen)
    game.gameState = { ...game.gameState, reputationTier: WHEELS_T2.minReputationTier! }
    const wrapper = mountScreen()
    await wrapper.get('[data-test="upgrade-tool-wheels"]').trigger('click')
    expect(game.gameState.toolTiers.wheels).toBe(2)
    const wheelsTierTwo = wrapper.get('[data-test="tier-node-wheels-2"]')
    expect(wheelsTierTwo.classes()).toContain('owned')
    expect(wheelsTierTwo.get('.tier-name').text()).toBe(WHEELS_T2.displayName)
  })

  /**
   * Tools gate on cash AND reputation, tiers 2/3 only.
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

  it('a line with both rungs bought says so and offers no further upgrade button', () => {
    const game = useGameStore()
    game.newGame(1)
    game.devSetToolTier('wheels', 2)
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="upgrade-tool-wheels"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Both rungs owned')
  })

  describe('the shops at the top of the ladder', () => {
    it('renders one card per shop, naming every line it covers', () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()
      expect(wrapper.findAll('.shop-card')).toHaveLength(TOOL_SHOPS.length)
      expect(TOOL_SHOPS).toHaveLength(3)
      for (const shop of TOOL_SHOPS) {
        const card = wrapper.get(`[data-test="tool-shop-${shop.id}"]`)
        expect(card.text()).toContain(shop.displayName)
        expect(card.text()).toContain(formatYen(shop.upgradePriceYen))
        // The coverage is spelled out on the card, so a player never has to
        // deduce which lines one purchase lifts.
        const covers = wrapper.get(`[data-test="tool-shop-covers-${shop.id}"]`).text()
        for (const componentId of shop.covers) {
          expect(covers, componentId).toContain(game.componentLabel(componentId))
        }
      }
    })

    it('is gated on standing, with the reason in a tooltip, then buys on reputation and cash alone', async () => {
      const game = useGameStore()
      game.newGame(1)
      game.devGiveCash(999_999_999)
      const wrapper = mountScreen()
      const button = wrapper.get(`[data-test="buy-tool-shop-${CHASSIS_SHOP.id}"]`)
      expect((button.element as HTMLButtonElement).disabled).toBe(true)
      expect(wrapper.get(`[data-test="gate-tip-shop-${CHASSIS_SHOP.id}"]`).text()).toContain(
        `needs ${CHASSIS_SHOP.minReputationTier} reputation`,
      )

      game.devSetReputationTier(CHASSIS_SHOP.minReputationTier)
      await wrapper.vm.$nextTick()
      expect(wrapper.find(`[data-test="gate-tip-shop-${CHASSIS_SHOP.id}"]`).exists()).toBe(false)
      expect(
        (wrapper.get(`[data-test="buy-tool-shop-${CHASSIS_SHOP.id}"]`).element as HTMLButtonElement)
          .disabled,
      ).toBe(false)
    })

    /**
     * The whole point of a shop: one purchase, several lines. Levels are read
     * through sim's own `toolLevelsFor` rather than off the rungs, because a
     * shop moves no rung - it is the ladder's top, not a third step on it. A
     * line whose covering shop is owned shows the shared Shop chip instead of
     * a rung-2 buy button, since the room already grants the kit.
     */
    it('a line whose covering shop is owned shows the Shop chip and no rung 2 buy button', async () => {
      const game = useGameStore()
      game.newGame(1)
      game.devGiveCash(CHASSIS_SHOP.upgradePriceYen)
      game.devSetReputationTier(CHASSIS_SHOP.minReputationTier)
      const wrapper = mountScreen()

      await wrapper.get(`[data-test="buy-tool-shop-${CHASSIS_SHOP.id}"]`).trigger('click')

      expect(game.gameState.toolShopsOwned).toContain(CHASSIS_SHOP.id)
      const levels = toolLevelsFor(game.gameState, game.context)
      for (const componentId of CHASSIS_SHOP.covers) {
        expect(levels[componentId], componentId).toBe(3)
        // Bought whole: not one of those lines climbed a rung to get there.
        expect(game.gameState.toolTiers[componentId], componentId).toBe(1)
        expect(wrapper.get(`[data-test="line-shop-chip-${componentId}"]`).text(), componentId).toBe(
          'Shop',
        )
        expect(
          wrapper.find(`[data-test="upgrade-tool-${componentId}"]`).exists(),
          componentId,
        ).toBe(false)
      }
      for (const componentId of ['engine', 'body', 'interior'] as const) {
        expect(levels[componentId], componentId).toBe(1)
      }
      expect(wrapper.find(`[data-test="tool-shop-owned-${CHASSIS_SHOP.id}"]`).text()).toBe(
        'Fitted out',
      )
      expect(wrapper.find(`[data-test="buy-tool-shop-${CHASSIS_SHOP.id}"]`).exists()).toBe(false)
    })

    it('opens the info box on the shop, headed by what it covers', async () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()
      await wrapper.get(`[data-test="tool-shop-${CHASSIS_SHOP.id}"]`).trigger('click')
      const box = wrapper.get('[data-test="tool-info-box"]')
      expect(box.text()).toContain(CHASSIS_SHOP.displayName)
      expect(box.text()).toContain('covers')
      expect(box.text()).toContain('labour per grade')
      // Same toggle the rungs have.
      await wrapper.get(`[data-test="tool-shop-${CHASSIS_SHOP.id}"]`).trigger('click')
      expect(wrapper.find('[data-test="tool-info-box"]').exists()).toBe(false)
    })
  })

  it('the rooms show their coverage sublines', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()
    expect(game.toolShopViews.length).toBeGreaterThan(0)
    for (const shop of game.toolShopViews) {
      const restore = wrapper.get(`[data-test="tool-shop-restore-${shop.id}"]`)
      expect(restore.text()).toBe(
        `Restore work for ${shop.coversLabels.join(', ')} happens in here.`,
      )
    }
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
      await wrapper.get('[data-test="tier-node-engine-2"]').trigger('click')
      const box = wrapper.get('[data-test="tool-info-box"]')
      expect(box.text()).toContain('labour per grade')
      await wrapper.get('[data-test="tier-node-engine-2"]').trigger('click')
      expect(wrapper.find('[data-test="tool-info-box"]').exists()).toBe(false)
    })

    it('the NA-to-turbo conversion belongs to the shop covering the engine line, not to a rung', () => {
      const game = useGameStore()
      game.newGame(1)
      const shop = game.toolShopViews.find((s) => s.covers.includes('engine'))!
      expect(game.toolShopInfo(shop.id).unlocksNaToTurboConversion).toBe(true)
      expect(game.toolTierInfo('engine', 2).unlocksNaToTurboConversion).toBe(false)
    })

    /**
     * Selecting an unowned tier-2 rung surfaces
     * the machine-shop rental notice; owning that tier-2 removes it.
     */
    it('a tier-2 rung shows the rental fee line until the machine is owned', async () => {
      const game = useGameStore()
      game.newGame(1) // owns every line at tier 1, so tier 2 is unowned
      const wrapper = mountScreen()
      await wrapper.get('[data-test="tier-node-suspension-2"]').trigger('click')
      const line = wrapper.find('[data-test="rental-fee-line"]')
      expect(line.exists()).toBe(true)
      expect(line.text()).toContain('hired for the day')

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

  it('a tool line buys on reputation and cash alone, with no listing state anywhere in play', () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGiveCash(999_999_999)
    game.gameState = { ...game.gameState, reputationTier: WHEELS_T2.minReputationTier! }
    const wrapper = mountScreen()
    const button = wrapper.get('[data-test="upgrade-tool-wheels"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
    expect(wrapper.find('[data-test="machine-listing"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="no-listing"]').exists()).toBe(false)
  })

  describe('gate explanations are tooltips, not always-visible sentences (Sprint 65 decision 3)', () => {
    it('a reputation-gated row still shows its existing tooltip copy, and the old always-visible hint classes are gone', () => {
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
