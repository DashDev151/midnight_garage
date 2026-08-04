import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { decodeSave, encodeSave } from '../save/saveCodec'
import CostSheetScreen from './CostSheetScreen.vue'

/**
 * The weekly cost sheet, and the constraints progression bible law 4's second
 * amendment attaches to it: it opens only when the player opens it, it holds
 * no state of its own, and it never shows a percentage.
 */
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  // A real (if routeless) router so `useRoute()` resolves - the screen reads
  // `route.query.from` for its back control (`mapBack.ts`) - while
  // `RouterLinkStub` keeps every `<RouterLink>` a plain, inspectable stub as
  // this file always tested them.
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  const wrapper = mount(CostSheetScreen, {
    global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

/** A career with one closed week and one still running, written straight onto
 * the accumulator - the screen's whole input. */
function seedTwoWeeks(game: ReturnType<typeof useGameStore>): void {
  game.gameState = {
    ...game.gameState,
    day: 9,
    financeLedger: {
      '1': {
        incomeYen: 480_000,
        onCarsYen: 260_000,
        stockYen: 31_000,
        runningYen: 19_000,
        investmentYen: 0,
      },
      '2': {
        incomeYen: 0,
        onCarsYen: 12_000,
        stockYen: 0,
        runningYen: 8_000,
        investmentYen: 2_000_000,
      },
    },
  }
}

describe('CostSheetScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('shows every week the shop traded, newest first, with the real yen on each line', () => {
    const game = useGameStore()
    game.newGame(1)
    seedTwoWeeks(game)
    const wrapper = mountScreen()

    const sheets = wrapper.findAll('[data-test^="cost-sheet-week-"]')
    expect(sheets).toHaveLength(2)
    expect(sheets[0]!.attributes('data-test')).toBe('cost-sheet-week-2')

    const first = wrapper.find('[data-test="cost-sheet-week-1"]')
    expect(first.find('[data-test="row-income"]').text()).toContain('480,000')
    expect(first.find('[data-test="row-on-cars"]').text()).toContain('260,000')
    expect(first.find('[data-test="row-stock"]').text()).toContain('31,000')
    expect(first.find('[data-test="row-running"]').text()).toContain('19,000')
    // 480,000 - (260,000 + 31,000 + 19,000)
    expect(first.find('[data-test="row-net"]').text()).toContain('170,000')
  })

  it('marks the week still being played as open, and never the closed ones', () => {
    const game = useGameStore()
    game.newGame(1)
    seedTwoWeeks(game)
    const wrapper = mountScreen()

    expect(wrapper.find('[data-test="cost-sheet-week-2"] [data-test="week-open"]').exists()).toBe(
      true,
    )
    expect(wrapper.find('[data-test="cost-sheet-week-1"] [data-test="week-open"]').exists()).toBe(
      false,
    )
  })

  it('separates a bay from the rent, so the running line stays readable', () => {
    const game = useGameStore()
    game.newGame(1)
    seedTwoWeeks(game)
    const wrapper = mountScreen()
    const openWeek = wrapper.find('[data-test="cost-sheet-week-2"]')

    expect(openWeek.find('[data-test="row-investment"]').text()).toContain('2,000,000')
    expect(openWeek.find('[data-test="row-running"]').text()).toContain('8,000')
    // A week that spent millions on a bay still reports a net loss honestly.
    expect(openWeek.find('[data-test="row-net"]').text()).toContain('-')
  })

  it('says so plainly when nothing has been through the till', () => {
    const game = useGameStore()
    game.newGame(1)
    game.gameState = { ...game.gameState, financeLedger: {} }
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="cost-sheet-empty"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test^="cost-sheet-week-"]')).toHaveLength(0)
  })

  it('is a pure derivation: mounting it changes no state at all', () => {
    const game = useGameStore()
    game.newGame(1)
    seedTwoWeeks(game)
    const before = JSON.stringify(game.gameState)
    mountScreen()
    expect(JSON.stringify(game.gameState)).toBe(before)
  })

  it('carries no percentage anywhere (progression bible law 4)', () => {
    const game = useGameStore()
    game.newGame(1)
    seedTwoWeeks(game)
    expect(mountScreen().text()).not.toContain('%')
  })

  it('survives a save and reload with its figures intact', () => {
    const game = useGameStore()
    game.newGame(1)
    seedTwoWeeks(game)
    const restored = decodeSave(encodeSave(game.gameState))
    expect(restored.financeLedger).toEqual(game.gameState.financeLedger)
  })
})
