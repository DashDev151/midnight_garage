import {
  ECONOMY,
  PARTS,
  TOOL_LINES,
  type CarPartId,
  type ComponentId,
  type ConditionBand,
  type PartInstance,
} from '@midnight-garage/content'
import { makeMarketOrigin } from '@midnight-garage/sim'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import MachineShopScreen from './MachineShopScreen.vue'

/**
 * The machine shop opens on a PART, not on a car: what is on the machine, what
 * has already been done to it, and every operation the shop would quote for it
 * with its full price in support, originality, labour and reliability. A part
 * off the car has no engine of its own, so power is quoted per engine
 * character rather than as one PS figure.
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

const BLOCK_PART = PARTS.find((part) => part.carPartId === 'block')!

/**
 * Puts a loose block in the warehouse and carries it to the machine, at
 * `band` (nobody machines a worn block, so the band is what one refusal test
 * turns on) and with the engine line at `engineTier` so the shop is either
 * open or shut.
 */
function blockOnTheMachine(game: Store, engineTier: 1 | 2 | 3, band: ConditionBand = 'mint') {
  const instance: PartInstance = {
    id: 'pi-loose-block',
    partId: BLOCK_PART.id,
    band,
    origin: makeMarketOrigin(1),
  }
  game.gameState = {
    ...game.gameState,
    partInventory: [...game.gameState.partInventory, instance],
    machinePartId: instance.id,
    toolTiers: { ...game.gameState.toolTiers, engine: engineTier },
  }
  return instance.id
}

const BLOCK_OPERATIONS = ECONOMY.machining.operations.filter((o) => o.carPartId === 'block')

/** Puts a mint loose part for `carPartId` on the machine and leaves every tool
 * line exactly where the caller set it - the shape the two other-line
 * operations are proved on, where the engine line is deliberately short. */
function partOnTheMachine(
  game: Store,
  carPartId: CarPartId,
  toolTiers: Partial<Record<ComponentId, 1 | 2 | 3>>,
) {
  const part = PARTS.find((p) => p.carPartId === carPartId)!
  const instance: PartInstance = {
    id: `pi-loose-${carPartId}`,
    partId: part.id,
    band: 'mint',
    origin: makeMarketOrigin(1),
  }
  game.gameState = {
    ...game.gameState,
    partInventory: [...game.gameState.partInventory, instance],
    machinePartId: instance.id,
    toolTiers: { ...game.gameState.toolTiers, ...toolTiers },
  }
  return instance.id
}

describe('MachineShopScreen', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('says the machine is empty when nothing is on it, and needs no car anywhere', () => {
    const game = useGameStore()
    game.newGame(1)
    expect(game.gameState.serviceBayCarIds.filter((id) => id !== null)).toHaveLength(0)
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="station-empty-machine"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="machine-shop-part"]').exists()).toBe(false)
  })

  it('offers every warehouse part to carry over, and puts the picked one on the machine', async () => {
    const game = useGameStore()
    game.newGame(1)
    game.devGrantPart(BLOCK_PART.id)
    const partInstanceId = game.gameState.partInventory.at(-1)!.id

    const wrapper = mountScreen()
    await wrapper.find(`[data-test="station-place-machine-${partInstanceId}"]`).trigger('click')
    await wrapper.vm.$nextTick()

    expect(game.gameState.machinePartId).toBe(partInstanceId)
    expect(wrapper.find('[data-test="machine-shop-part"]').exists()).toBe(true)
  })

  it('carries the part back to the warehouse, leaving it owned and the machine clear', async () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = blockOnTheMachine(game, 3)

    const wrapper = mountScreen()
    await wrapper.find('[data-test="station-take-machine"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(game.gameState.machinePartId).toBeNull()
    expect(game.gameState.partInventory.some((p) => p.id === partInstanceId)).toBe(true)
    expect(wrapper.find('[data-test="machine-shop-part"]').exists()).toBe(false)
  })

  it('lists every operation the shop does on the part that is actually on the machine', () => {
    const game = useGameStore()
    game.newGame(1)
    blockOnTheMachine(game, 3)
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="machine-shop-part"]').exists()).toBe(true)
    for (const operation of BLOCK_OPERATIONS) {
      expect(
        wrapper.find(`[data-test="machine-shop-offer-${operation.id}"]`).exists(),
        operation.id,
      ).toBe(true)
    }
    // Operations belonging to another slot are not on this sheet - the machine
    // holds one part, not a car's worth of slots.
    for (const operation of ECONOMY.machining.operations.filter((o) => o.carPartId !== 'block')) {
      expect(
        wrapper.find(`[data-test="machine-shop-offer-${operation.id}"]`).exists(),
        operation.id,
      ).toBe(false)
    }
  })

  it('never offers the two setup jobs, which are judged with the car assembled', () => {
    const game = useGameStore()
    game.newGame(1)
    const springs = PARTS.find((part) => part.carPartId === 'springs')!
    const instance: PartInstance = {
      id: 'pi-loose-springs',
      partId: springs.id,
      band: 'mint',
      origin: makeMarketOrigin(1),
    }
    game.gameState = {
      ...game.gameState,
      partInventory: [...game.gameState.partInventory, instance],
      machinePartId: instance.id,
      toolTiers: { ...game.gameState.toolTiers, suspension: 3, engine: 3 },
      sceneStanding: { ...game.gameState.sceneStanding, touge: 'shop' },
    }

    const wrapper = mountScreen()
    // The springs are on the machine and the shop has the line and the
    // standing; corner weighting is still not a job this room does.
    expect(wrapper.find('[data-test="machine-shop-part"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="machine-shop-offer-corner-weighting"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="machine-shop-offer-show-fitment"]').exists()).toBe(false)
    // And it says so rather than leaving an empty list to be read as a bug.
    expect(wrapper.find('[data-test="machine-shop-no-offers"]').exists()).toBe(true)
  })

  it("quotes an operation's power per engine character, since the part is off the car", () => {
    const game = useGameStore()
    game.newGame(1)
    blockOnTheMachine(game, 3)
    const wrapper = mountScreen()
    const text = wrapper.find(`[data-test="machine-shop-power-${BLOCK_OPERATIONS[0]!.id}"]`).text()
    expect(text).toContain('boosted')
    expect(text).toMatch(/\+\d+\.\d\d per cent/)
  })

  it('quotes originality to the precision the operation actually costs', () => {
    const game = useGameStore()
    game.newGame(1)
    blockOnTheMachine(game, 3)
    const wrapper = mountScreen()

    // Costs are fractions of an authenticity point, so the sheet has to carry
    // the fraction rather than rounding it away, and an operation that takes
    // nothing has to read as nothing rather than as a penalty of zero.
    const fractional = BLOCK_OPERATIONS.find((o) => !Number.isInteger(o.authenticityCost))!
    expect(wrapper.find(`[data-test="machine-shop-auth-${fractional.id}"]`).text()).toBe(
      `Originality -${fractional.authenticityCost}`,
    )
    const free = BLOCK_OPERATIONS.find((o) => o.authenticityCost === 0)!
    expect(wrapper.find(`[data-test="machine-shop-auth-${free.id}"]`).text()).toBe(
      'Originality nothing',
    )
  })

  it('refuses the work until the engine line owns the tooling, and says so', () => {
    const game = useGameStore()
    game.newGame(1)
    blockOnTheMachine(game, 2)
    const wrapper = mountScreen()
    const button = wrapper.find('[data-test="machine-shop-do-bore-and-hone"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toContain('tier 3')
  })

  it('refuses a worn block outright, whatever the tooling', () => {
    const game = useGameStore()
    game.newGame(1)
    blockOnTheMachine(game, 3, 'worn')
    const wrapper = mountScreen()
    const button = wrapper.find('[data-test="machine-shop-do-bore-and-hone"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toContain('Rebuild it to mint first')
  })

  it('does the work on click and reports it as done afterwards', async () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = blockOnTheMachine(game, 3)
    const wrapper = mountScreen()
    await wrapper.find('[data-test="machine-shop-do-bore-and-hone"]').trigger('click')
    await wrapper.vm.$nextTick()

    const worked = game.gameState.partInventory.find((p) => p.id === partInstanceId)!
    expect(worked.machining).toEqual(['bore-and-hone'])
    expect(wrapper.find('[data-test="machine-shop-applied"]').text()).toContain('Bore and hone')
    expect(wrapper.find('[data-test="machine-shop-do-bore-and-hone"]').text()).toBe('Done')
  })

  it('charges labour and no money at all', async () => {
    const game = useGameStore()
    game.newGame(1)
    blockOnTheMachine(game, 3)
    const cashBefore = game.gameState.cashYen
    const spentBefore = game.gameState.energySpentToday
    const wrapper = mountScreen()
    await wrapper.find('[data-test="machine-shop-do-bore-and-hone"]').trigger('click')
    expect(game.gameState.cashYen).toBe(cashBefore)
    expect(game.gameState.energySpentToday).toBeGreaterThan(spentBefore)
  })

  /**
   * The two operations belonging to another line entirely. Each answers to its
   * own tool line and to nothing else, so an engine line short of the tooling
   * is not an opinion about dampers or a differential.
   */
  it('does the damper work on suspension tier 3, with the engine line still at 2', async () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = partOnTheMachine(game, 'dampers', { suspension: 3, engine: 2 })
    game.gameState = {
      ...game.gameState,
      sceneStanding: { ...game.gameState.sceneStanding, racer: 'shop' },
    }

    const wrapper = mountScreen()
    const button = wrapper.find('[data-test="machine-shop-do-race-prep"]')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    await wrapper.vm.$nextTick()

    expect(game.gameState.partInventory.find((p) => p.id === partInstanceId)!.machining).toEqual([
      'race-prep',
    ])
  })

  it('does the differential work on drivetrain tier 3, with the engine line still at 2', async () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = partOnTheMachine(game, 'differential', { drivetrain: 3, engine: 2 })
    game.gameState = {
      ...game.gameState,
      sceneStanding: { ...game.gameState.sceneStanding, 'daily-drivers': 'shop' },
    }

    const wrapper = mountScreen()
    const button = wrapper.find('[data-test="machine-shop-do-sorting"]')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    await wrapper.vm.$nextTick()

    expect(game.gameState.partInventory.find((p) => p.id === partInstanceId)!.machining).toEqual([
      'sorting',
    ])
  })

  it('lists the three machines the room can hold, named and priced from content', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()
    for (const componentId of ['engine', 'drivetrain', 'suspension'] as const) {
      const row = wrapper.find(`[data-test="machine-shop-machine-${componentId}"]`)
      expect(row.exists(), componentId).toBe(true)
      expect(row.text()).toContain(TOOL_LINES[componentId].tiers[2]!.displayName)
      expect(row.text()).toContain(TOOL_LINES[componentId].tiers[2]!.minReputationTier)
    }
    // The three lines with no work done at a machine hold no machine either.
    for (const componentId of ['wheels', 'body', 'interior'] as const) {
      expect(
        wrapper.find(`[data-test="machine-shop-machine-${componentId}"]`).exists(),
        componentId,
      ).toBe(false)
    }
  })

  it('shows a bought machine as in-house and drops its price line', async () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="machine-shop-machine-state-engine"]').text()).toBe('Not here')

    game.gameState = { ...game.gameState, toolTiers: { ...game.gameState.toolTiers, engine: 3 } }
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="machine-shop-machine-state-engine"]').text()).toBe('In-house')
    expect(wrapper.find('[data-test="machine-shop-machine-price-engine"]').exists()).toBe(false)
    // Buying the engine tooling puts nothing on the drivetrain's floor.
    expect(wrapper.find('[data-test="machine-shop-machine-state-drivetrain"]').text()).toBe(
      'Not here',
    )
  })
})
