import { CARS } from '@midnight-garage/content'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import MarketScreen from './MarketScreen.vue'

/**
 * The stand's weekly sheet: reachable only from the overworld, reports
 * movement rather than the raw heat figure, and never prints a forecast or
 * a calendar year. The mover list is driven by `game.marketMovers`
 * (`gameStore.ts`), which reads `state.marketHeatLastShift` - the sim's
 * per-model delta from the most recent weekly update.
 * `marketMovers.test.ts` covers the selection and formatting logic directly
 * against fixture data; these tests cover the screen wired to real store
 * state, including the quiet-week state a fresh career starts in (no update
 * has run yet).
 */

const mountedWrappers: VueWrapper[] = []

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/overworld', name: 'overworld', component: { template: '<div />' } },
      { path: '/market', name: 'market', component: { template: '<div />' } },
    ],
  })
}

async function mountScreen() {
  const router = makeRouter()
  await router.push({ name: 'market' })
  await router.isReady()
  const wrapper = mount(MarketScreen, { global: { plugins: [router] } })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('MarketScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('carries a masthead and a way back to the street', async () => {
    const game = useGameStore()
    game.newGame(1)

    const wrapper = await mountScreen()
    expect(wrapper.find('[data-test="market-masthead"]').text()).toBe('The trade sheet')
    expect(wrapper.find('[data-test="market-back"]').exists()).toBe(true)
  })

  it('shows a quiet-week state on each side before any weekly update has run', async () => {
    const game = useGameStore()
    game.newGame(1)

    const wrapper = await mountScreen()
    expect(wrapper.find('[data-test="market-risers-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="market-fallers-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="market-risers"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="market-fallers"]').exists()).toBe(false)
  })

  it('never prints a four-digit year anywhere on the page', async () => {
    const game = useGameStore()
    game.newGame(1)

    const wrapper = await mountScreen()
    expect(wrapper.text()).not.toMatch(/\b(19|20)\d{2}\b/)
  })

  it('reports a riser and a faller as movement, tagging the player-owned and the player-sold model, with no raw heat figure', async () => {
    const game = useGameStore()
    game.newGame(1)
    const risingModel = CARS[0]!
    const fallingModel = CARS[1]!
    game.devGrantCar(risingModel.id)
    game.gameState = {
      ...game.gameState,
      marketHeatLastShift: { [risingModel.id]: 4, [fallingModel.id]: -6 },
      marketLedger: { ...game.gameState.marketLedger, playerSales: { [fallingModel.id]: 1 } },
    }

    const wrapper = await mountScreen()
    const text = wrapper.text()

    expect(text).toContain(game.resolveModelName(risingModel.id))
    expect(text).toContain('Up 4 this week')
    expect(text).toContain(game.resolveModelName(fallingModel.id))
    expect(text).toContain('Down 6 this week')
    expect(wrapper.findAll('[data-test="market-mover-tag"]')).toHaveLength(2)
    expect(text).toContain('yours')
    expect(text).toContain("you've been selling these")
    expect(wrapper.find('[data-test="market-risers-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="market-fallers-empty"]').exists()).toBe(false)
  })
})
