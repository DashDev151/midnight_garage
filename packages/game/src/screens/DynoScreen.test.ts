import { CARS, ECONOMY, PARTS, PARTS_TAXONOMY, SubsystemSchema } from '@midnight-garage/content'
import {
  computeDerivedStats,
  effectiveDisplacementCcOf,
  supportRatios,
  supportVerdict,
} from '@midnight-garage/sim'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import DynoScreen from './DynoScreen.vue'

const PARTS_BY_ID = Object.fromEntries(PARTS.map((part) => [part.id, part]))
const FD = CARS.find((c) => c.id === 'mazda-rx7-fd3s')!

// Every mounted wrapper is unmounted after its test, so a component left
// mounted cannot leak its store's pinia into the next.
const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  const wrapper = mount(DynoScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
  mountedWrappers.push(wrapper)
  return wrapper
}

type Store = ReturnType<typeof useGameStore>

/** Grants `modelId`, puts it in the service bay and runs a session on it. */
function runSessionOn(game: Store, modelId: string): string {
  game.devGrantCar(modelId)
  const car = game.gameState.ownedCars[game.gameState.ownedCars.length - 1]!
  game.moveCar(car.id, 'service')
  expect(game.runDynoSession(car.id)).toBe(true)
  return car.id
}

describe('DynoScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('says the rollers are empty when nothing is on them', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="dyno-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="dyno-power"]').exists()).toBe(false)
  })

  it('reports the sim its own figures, so the display cannot drift', () => {
    const game = useGameStore()
    game.newGame(1)
    const carId = runSessionOn(game, FD.id)
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    const ratios = supportRatios(car, FD, PARTS_BY_ID, ECONOMY)
    const verdict = supportVerdict(car, FD, PARTS_BY_ID, ECONOMY)
    const stats = computeDerivedStats(FD, car, PARTS_BY_ID, PARTS_TAXONOMY, ECONOMY)

    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="dyno-power-measured"]').text()).toBe(`${stats.power} PS`)
    for (const subsystem of SubsystemSchema.options) {
      const shown = wrapper.find(`[data-test="dyno-ratio-value-${subsystem}"]`).text()
      expect(shown).toBe(ratios[subsystem].toFixed(2))
    }
    expect(wrapper.find('[data-test="dyno-band"]').text()).toContain(verdict.headline.toFixed(2))
    expect(wrapper.find('[data-test="dyno-reliability-value"]').text()).toBe(
      `${stats.reliability} out of ${FD.spec.reliabilityBase}`,
    )
    // The weakest link is marked, and it is the one the verdict names.
    expect(wrapper.find(`[data-test="dyno-ratio-${verdict.subsystem}"]`).classes()).toContain(
      'weakest',
    )
    expect(wrapper.find('[data-test="dyno-weakest-flag"]').exists()).toBe(true)
  })

  it('shows the rotary equivalency rather than applying it behind the figure', () => {
    const game = useGameStore()
    game.newGame(1)
    runSessionOn(game, FD.id)
    const wrapper = mountScreen()

    const note = wrapper.find('[data-test="dyno-rotary-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('equivalent')
    // Both capacities are on the page: what the paperwork says, and what the
    // figure is actually measured against.
    expect(note.text()).toContain((FD.spec.displacementCc! / 1000).toFixed(1))
    expect(note.text()).toContain((effectiveDisplacementCcOf(FD)! / 1000).toFixed(1))
    expect(wrapper.find('[data-test="dyno-specific-output"]').text()).toContain('per litre')
  })

  it('names no shortfall on a car with nothing over-asked', () => {
    const game = useGameStore()
    game.newGame(1)
    const carId = runSessionOn(game, FD.id)
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    const wrapper = mountScreen()
    const hasShortfall = supportVerdict(car, FD, PARTS_BY_ID, ECONOMY).band !== 'adequate'
    expect(wrapper.find('[data-test="dyno-shortfall"]').exists()).toBe(hasShortfall)
    expect(wrapper.find('[data-test="dyno-shortfall-none"]').exists()).toBe(!hasShortfall)
  })

  it('breaks the reliability down into wear, the build, and the power itself', () => {
    const game = useGameStore()
    game.newGame(1)
    runSessionOn(game, FD.id)
    const wrapper = mountScreen()
    for (const line of ['condition', 'coherence', 'power']) {
      expect(wrapper.find(`[data-test="dyno-cost-${line}"]`).exists()).toBe(true)
    }
  })
})
