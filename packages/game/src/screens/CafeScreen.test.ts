import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import CafeScreen from './CafeScreen.vue'

/**
 * The cafe's interior (sprint209.md task C): a menu list, today one item,
 * that reuses the sim's own `buyCoffee` resolver and gate reasons wholesale
 * (`cafe.ts`) - this file checks the presentation states, not the coffee
 * mechanic itself (already covered at the sim and `gameStore` level).
 */

const mountedWrappers: VueWrapper[] = []

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/overworld', name: 'overworld', component: { render: () => h('div') } },
      { path: '/cafe', name: 'cafe', component: { render: () => h('div') } },
    ],
  })
}

function mountScreen(): VueWrapper {
  const wrapper = mount(CafeScreen, { global: { plugins: [makeRouter()] } })
  mountedWrappers.push(wrapper)
  return wrapper
}

/** Spends some labour and clears the day's cap/cash gates, so the round is
 * genuinely available to order - the sim's own `buyCoffeeGateReason` order
 * (day-limit, then pool-full, then cash) means all three must clear at
 * once. */
function makeRoundAvailable(game: ReturnType<typeof useGameStore>): void {
  game.gameState = {
    ...game.gameState,
    energySpentToday: 50,
    cashYen: 1_000_000,
    cafeCoffeesBoughtToday: undefined,
  }
}

describe('CafeScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('carries a masthead and a way back to the street', () => {
    const wrapper = mountScreen()
    expect(wrapper.find('h2').text()).toBe('Cafe')
    expect(wrapper.find('[data-test="cafe-back"]').exists()).toBe(true)
  })

  it("lists today's menu as a list, one item: coffee, priced by headcount", () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    const item = wrapper.find('[data-test="menu-item-coffee"]')
    expect(item.exists()).toBe(true)
    expect(item.find('.menu-name').text()).toBe('Coffee')
    expect(item.find('.menu-price').text()).toBe(formatYen(game.coffeePriceYen))
  })

  it('a fresh day with nothing spent yet shows the pool-full state, order disabled', () => {
    const game = useGameStore()
    expect(game.coffeeGateReason).toBe('pool-full')
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="menu-state-coffee"]').text()).toBe(
      'Nothing to buy back yet. Come and see us when the day has worn you down a bit.',
    )
    const button = wrapper.find('[data-test="order-coffee"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the available state and orders a real round on click', async () => {
    const game = useGameStore()
    makeRoundAvailable(game)
    expect(game.coffeeGateReason).toBeNull()
    const wrapper = mountScreen()
    const state = wrapper.find('[data-test="menu-state-coffee"]')
    expect(state.text()).toBe(`Coffee all round, ${game.coffeePriceYen.toLocaleString()} yen.`)

    const cashBefore = game.cashYen
    const button = wrapper.find('[data-test="order-coffee"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
    await button.trigger('click')

    expect(game.cashYen).toBeLessThan(cashBefore)
  })

  it('once bought today, shows the day-limit state and disables the order button', async () => {
    const game = useGameStore()
    makeRoundAvailable(game)
    const wrapper = mountScreen()
    await wrapper.find('[data-test="order-coffee"]').trigger('click')

    expect(game.coffeeGateReason).toBe('day-limit')
    expect(wrapper.find('[data-test="menu-state-coffee"]').text()).toBe(
      'You have had your round today. Any more and nobody does any work.',
    )
    expect((wrapper.find('[data-test="order-coffee"]').element as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('short of cash shows the no-cash state, order disabled', () => {
    const game = useGameStore()
    game.gameState = { ...game.gameState, energySpentToday: 50, cashYen: 0 }
    expect(game.coffeeGateReason).toBe('no-cash')
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="menu-state-coffee"]').text()).toBe(
      `A round is ${game.coffeePriceYen.toLocaleString()} yen and the till says otherwise.`,
    )
    expect((wrapper.find('[data-test="order-coffee"]').element as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})
