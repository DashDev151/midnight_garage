import { PARTS, type ConditionBand, type PartInstance } from '@midnight-garage/content'
import { makeMarketOrigin } from '@midnight-garage/sim'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { clearDragSession } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import WorkshopFloorScreen from './WorkshopFloorScreen.vue'
import { benchIdleReason } from './workshopFloor'

/**
 * The workshop floor opens on the bench: one part, the rung of repair it is
 * next owed, and the control that does it. Nothing gates the room - putting a
 * part right is the shop's basic work - so the only refusals it ever states
 * are about the part itself or the tools that finish it.
 */

const mountedWrappers: VueWrapper[] = []

function mountScreen() {
  // A real (if routeless) router so `useRoute()` resolves - the screen reads
  // `route.query.from` for its back control (`mapBack.ts`) - while
  // `RouterLinkStub` keeps every `<RouterLink>` a plain, inspectable stub.
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  const wrapper = mount(WorkshopFloorScreen, {
    global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

type Store = ReturnType<typeof useGameStore>

const DAMPER_PART = PARTS.find((part) => part.carPartId === 'dampers')!
const TYRE_PART = PARTS.find((part) => part.carPartId === 'tyres' && part.grade === 'stock')!

/** Puts one loose part in the warehouse at `band`, optionally already on the
 * bench, and hands back its instance id. */
function loosePart(game: Store, partId: string, band: ConditionBand, onBench: boolean) {
  const instance: PartInstance = {
    id: `pi-loose-${partId}`,
    partId,
    band,
    origin: makeMarketOrigin(1),
  }
  game.gameState = {
    ...game.gameState,
    partInventory: [...game.gameState.partInventory, instance],
    workbenchPartId: onBench ? instance.id : game.gameState.workbenchPartId,
  }
  return instance.id
}

describe('WorkshopFloorScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('says the bench is empty when nothing is on it', () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="station-empty-workbench"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="workshop-floor-part"]').exists()).toBe(false)
  })

  it('offers a warehouse part to carry over, and puts the picked one on the bench', async () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = loosePart(game, DAMPER_PART.id, 'worn', false)

    const wrapper = mountScreen()
    await wrapper.find(`[data-test="station-place-workbench-${partInstanceId}"]`).trigger('click')
    await wrapper.vm.$nextTick()

    expect(game.gameState.workbenchPartId).toBe(partInstanceId)
    expect(wrapper.find('[data-test="workshop-floor-part"]').exists()).toBe(true)
  })

  it('carries the part back to the warehouse, leaving it owned and the bench clear', async () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = loosePart(game, DAMPER_PART.id, 'worn', true)

    const wrapper = mountScreen()
    await wrapper.find('[data-test="station-take-workbench"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(game.gameState.workbenchPartId).toBeNull()
    expect(game.gameState.partInventory.some((p) => p.id === partInstanceId)).toBe(true)
    expect(wrapper.find('[data-test="workshop-floor-part"]').exists()).toBe(false)
  })

  it('does not offer a part already on the machine - it has to come back first', () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = loosePart(game, DAMPER_PART.id, 'worn', false)
    game.gameState = { ...game.gameState, machinePartId: partInstanceId }

    const wrapper = mountScreen()
    expect(wrapper.find(`[data-test="station-place-workbench-${partInstanceId}"]`).exists()).toBe(
      false,
    )
  })

  /** The rung is click-per-band, priced and laboured off the real quote, and
   * climbs exactly one band per click - never straight to mint. */
  it('climbs the part on the bench exactly one band per click', async () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = loosePart(game, DAMPER_PART.id, 'poor', true)
    game.devSetToolTier('suspension', 2)

    const wrapper = mountScreen()
    await wrapper.find('[data-test="workshop-floor-repair"]').trigger('click')
    expect(game.gameState.partInventory.find((p) => p.id === partInstanceId)!.band).toBe('worn')

    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="workshop-floor-repair"]').trigger('click')
    expect(game.gameState.partInventory.find((p) => p.id === partInstanceId)!.band).toBe('fine')
  })

  it("disables the rung once today's labour is spent", () => {
    const game = useGameStore()
    game.newGame(1)
    loosePart(game, DAMPER_PART.id, 'worn', true)
    game.gameState = { ...game.gameState, energySpentToday: game.laborSlotsPerDay }

    const wrapper = mountScreen()
    const button = wrapper.find('[data-test="workshop-floor-repair"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toContain('No labour left today')
  })

  it("names the machine that reaches mint once the shop's own tools finish at fine", () => {
    const game = useGameStore()
    game.newGame(1) // nothing upgraded, so suspension repairs cap at fine
    loosePart(game, DAMPER_PART.id, 'fine', true)

    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="workshop-floor-repair"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="workshop-floor-ceiling"]').text()).toContain('reaches mint')
  })

  it('says a mint part needs nothing, and a replace-only part cannot be rebuilt', () => {
    const game = useGameStore()
    game.newGame(1)
    loosePart(game, DAMPER_PART.id, 'mint', true)

    const mint = mountScreen()
    expect(mint.find('[data-test="workshop-floor-repair"]').exists()).toBe(false)
    expect(mint.find('[data-test="workshop-floor-idle"]').text()).toContain('Nothing left to put')

    const tyreId = loosePart(game, TYRE_PART.id, 'worn', false)
    game.gameState = { ...game.gameState, workbenchPartId: tyreId }
    const tyres = mountScreen()
    expect(tyres.find('[data-test="workshop-floor-repair"]').exists()).toBe(false)
    expect(tyres.find('[data-test="workshop-floor-idle"]').text()).toContain(
      'replaced, not repaired',
    )
  })
})

describe('benchIdleReason', () => {
  it.each([
    [{ band: 'scrap' as ConditionBand, repairable: true }, 'scrap'],
    [{ band: 'worn' as ConditionBand, repairable: false }, 'replace-only'],
    [{ band: 'mint' as ConditionBand, repairable: true }, 'mint'],
  ])('reads %o as %s', (input, expected) => {
    expect(benchIdleReason(input)).toBe(expected)
  })

  it('is null while there is a rung left to climb', () => {
    expect(benchIdleReason({ band: 'worn', repairable: true })).toBeNull()
  })

  /** Scrap is stated before the replace-only reading: a scrap consumable is
   * past rebuilding either way, and "past putting right" is the more useful
   * of the two things to say about it. */
  it('calls a scrap replace-only part scrap', () => {
    expect(benchIdleReason({ band: 'scrap', repairable: false })).toBe('scrap')
  })
})
