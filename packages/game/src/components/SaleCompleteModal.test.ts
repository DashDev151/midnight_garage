import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import SaleCompleteModal from './SaleCompleteModal.vue'

/**
 * Every wrapper is tracked and unmounted after its test, so a component left
 * mounted from a prior test cannot leak its store's pinia into the next (see
 * JobCompleteModal.test.ts).
 */
const mountedWrappers: VueWrapper[] = []
function track<T extends VueWrapper>(wrapper: T): T {
  mountedWrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

const BASE_RESULT = {
  displayName: 'Test Car',
  priceYen: 500_000,
  purchaseYen: 300_000,
  repairYen: 0,
  partsYen: 0,
  totalSpentYen: 300_000,
  profitYen: 200_000,
}

describe('SaleCompleteModal', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders nothing when there is no result', () => {
    const wrapper = track(mount(SaleCompleteModal))
    expect(wrapper.find('[data-test="sale-complete-modal"]').exists()).toBe(false)
  })

  /**
   * The word-of-mouth close line (progression bible law 4: diegetic, no
   * numbers, no rep figure) shows only for a matched sale.
   */
  it('shows the matched-sale close line, byte-verbatim, when matchedSale is true', () => {
    const game = useGameStore()
    game.lastSaleResult = { ...BASE_RESULT, matchedSale: true }
    const wrapper = track(mount(SaleCompleteModal))
    const closeLine = wrapper.find('[data-test="matched-sale-close"]')
    expect(closeLine.exists()).toBe(true)
    expect(closeLine.text()).toBe(
      'Sold to someone who wanted exactly this. People like that tell their friends.',
    )
  })

  it('omits the matched-sale close line entirely for an unmatched sale', () => {
    const game = useGameStore()
    game.lastSaleResult = { ...BASE_RESULT, matchedSale: false }
    const wrapper = track(mount(SaleCompleteModal))
    expect(wrapper.find('[data-test="matched-sale-close"]').exists()).toBe(false)
  })
})
