import { ALL_CAR_PART_IDS, ECONOMY, type ConditionBand } from '@midnight-garage/content'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import MachineShopScreen from './MachineShopScreen.vue'

/**
 * The machine shop shows EVERYTHING to begin with: every operation, what it is
 * worth on THIS engine's character, what it costs in originality, labour and
 * reliability, and the five support ratios beside it. That last one is not
 * decoration - an operation bought on a subsystem that was never the weakest
 * changes nothing visible, and without the ratios in view that reads as a bug
 * rather than as the model working.
 */

const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  // A real (if routeless) router so `useRoute()` resolves - the screen reads
  // `route.query.from` for its back control (`mapBack.ts`) - while
  // `RouterLinkStub` keeps every `<RouterLink>` a plain, inspectable stub as
  // this file always tested them.
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  const wrapper = mount(MachineShopScreen, {
    global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

type Store = ReturnType<typeof useGameStore>

/**
 * Grants a turbo car, brings its engine to mint (nobody machines a worn
 * block, so a granted car straight off the block is refused on that alone),
 * puts it on the ramp, and sets the engine line to `engineTier` so the bench
 * is either open or shut.
 */
function carOnTheRamp(game: Store, engineTier: 1 | 2 | 3, band: ConditionBand = 'mint'): string {
  game.devGrantCar('toyota-supra-rz-jza80')
  const car = game.gameState.ownedCars[game.gameState.ownedCars.length - 1]!
  game.moveCar(car.id, 'service')
  const parts = { ...car.parts }
  for (const partId of ALL_CAR_PART_IDS) {
    const installed = parts[partId].installed
    if (installed) parts[partId] = { ...parts[partId], installed: { ...installed, band } }
  }
  game.gameState = {
    ...game.gameState,
    ownedCars: game.gameState.ownedCars.map((owned) =>
      owned.id === car.id ? { ...owned, parts, symptoms: [] } : owned,
    ),
    toolTiers: { ...game.gameState.toolTiers, engine: engineTier },
  }
  return car.id
}

describe('MachineShopScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('says the bench is empty when no car is on the ramp', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="machine-shop-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="machine-shop-support"]').exists()).toBe(false)
  })

  it('lists every operation the shop does, on all four machinable slots', () => {
    const game = useGameStore()
    game.newGame(1)
    carOnTheRamp(game, 3)
    const wrapper = mountScreen()
    for (const operation of ECONOMY.machining.operations) {
      expect(
        wrapper.find(`[data-test="machine-shop-offer-${operation.id}"]`).exists(),
        operation.id,
      ).toBe(true)
    }
    for (const slot of ['block', 'internals', 'headValvetrain', 'camsTiming']) {
      expect(wrapper.find(`[data-test="machine-shop-slot-${slot}"]`).exists(), slot).toBe(true)
    }
  })

  it('shows the five support ratios and flags the weakest', () => {
    const game = useGameStore()
    game.newGame(1)
    carOnTheRamp(game, 3)
    const wrapper = mountScreen()
    for (const subsystem of [
      'cylinderPressure',
      'fuelling',
      'heat',
      'revs',
      'torqueTransmission',
    ]) {
      expect(
        wrapper.find(`[data-test="machine-shop-ratio-${subsystem}"]`).exists(),
        subsystem,
      ).toBe(true)
    }
    expect(wrapper.find('[data-test="machine-shop-weakest"]').exists()).toBe(true)
  })

  it("shows an operation's power on this engine's own character, not a bare fraction", () => {
    const game = useGameStore()
    game.newGame(1)
    carOnTheRamp(game, 3)
    const wrapper = mountScreen()
    // Port and polish is the biggest single operation on a boosted engine and
    // the figure a player should meet first.
    const text = wrapper.find('[data-test="machine-shop-power-port-and-polish"]').text()
    expect(text).toMatch(/\+\d+\.\d PS/)
  })

  it('refuses the work until the engine line owns the tooling, and says so', () => {
    const game = useGameStore()
    game.newGame(1)
    carOnTheRamp(game, 2)
    const wrapper = mountScreen()
    const button = wrapper.find('[data-test="machine-shop-do-bore-and-hone"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toContain('tier 3')
  })

  it('refuses a worn block outright, whatever the tooling', () => {
    const game = useGameStore()
    game.newGame(1)
    carOnTheRamp(game, 3, 'worn')
    const wrapper = mountScreen()
    const button = wrapper.find('[data-test="machine-shop-do-bore-and-hone"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toContain('Rebuild it to mint first')
  })

  it('does the work on click and reports it as done afterwards', async () => {
    const game = useGameStore()
    game.newGame(1)
    carOnTheRamp(game, 3)
    const wrapper = mountScreen()
    await wrapper.find('[data-test="machine-shop-do-bore-and-hone"]').trigger('click')
    await wrapper.vm.$nextTick()

    const car = game.gameState.ownedCars[game.gameState.ownedCars.length - 1]!
    expect(car.parts.block.installed?.machining).toEqual(['bore-and-hone'])
    expect(wrapper.find('[data-test="machine-shop-applied"]').text()).toContain('Bore and hone')
    expect(wrapper.find('[data-test="machine-shop-do-bore-and-hone"]').text()).toBe('Done')
  })

  it('charges labour and no money at all', async () => {
    const game = useGameStore()
    game.newGame(1)
    carOnTheRamp(game, 3)
    const cashBefore = game.gameState.cashYen
    const spentBefore = game.gameState.energySpentToday
    const wrapper = mountScreen()
    await wrapper.find('[data-test="machine-shop-do-bore-and-hone"]').trigger('click')
    expect(game.gameState.cashYen).toBe(cashBefore)
    expect(game.gameState.energySpentToday).toBeGreaterThan(spentBefore)
  })
})
