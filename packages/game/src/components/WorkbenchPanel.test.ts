import { PARTS, type ConditionBand, type PartInstance } from '@midnight-garage/content'
import { makeMarketOrigin } from '@midnight-garage/sim'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearDragSession, useDraggable } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import { benchIdleReason } from '../screens/workshopFloor'
import WorkbenchPanel from './WorkbenchPanel.vue'

/**
 * The workbench panel opens on the bench: one part, the rung of repair it is
 * next owed, and the control that does it. Nothing gates the bench - putting a
 * part right is the shop's basic work - so the only refusals it ever states
 * are about the part itself or the tools that finish it.
 */

const mountedWrappers: VueWrapper[] = []

function mountPanel() {
  // The panel reads no route of its own (it renders in place on the garage
  // screen), so only `RouterLinkStub` is needed to keep every `<RouterLink>`
  // a plain, inspectable stub.
  const wrapper = mount(WorkbenchPanel, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

/** A pointer event carrying just enough for `useDraggable` to track a drag -
 * mirrors the same minimal stub `useDragAndDrop.test.ts` and
 * `GarageScreen.test.ts` use for the identical composable. */
function pointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  const event = new Event('pointer') as unknown as {
    pointerId: number
    clientX: number
    clientY: number
    pointerType: string
    button: number
  }
  event.pointerId = 1
  event.clientX = 0
  event.clientY = 0
  event.pointerType = 'mouse'
  event.button = 0
  Object.assign(event, overrides)
  return event as unknown as PointerEvent
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

describe('WorkbenchPanel', () => {
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
    const wrapper = mountPanel()
    expect(wrapper.find('[data-test="station-empty-workbench"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="workshop-floor-part"]').exists()).toBe(false)
  })

  it('dragging a warehouse part onto the tray places it on the bench', async () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = loosePart(game, DAMPER_PART.id, 'worn', false)
    const wrapper = mountPanel()

    const draggable = useDraggable(() => partInstanceId)
    draggable.onPointerDown(pointerEvent())
    draggable.onPointerMove(pointerEvent({ clientX: 40 }))
    await wrapper
      .find('[data-test="station-tray-workbench"]')
      .trigger('pointerup', { pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(game.gameState.workbenchPartId).toBe(partInstanceId)
    expect(wrapper.find('[data-test="workshop-floor-part"]').exists()).toBe(true)
  })

  it('picking a warehouse part and clicking "Place here" puts it on the bench (accessibility fallback)', async () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = loosePart(game, DAMPER_PART.id, 'worn', false)
    const wrapper = mountPanel()

    useDraggable(() => partInstanceId).togglePick()
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="station-place-workbench"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(game.gameState.workbenchPartId).toBe(partInstanceId)
    expect(wrapper.find('[data-test="workshop-floor-part"]').exists()).toBe(true)
  })

  it('the tray shows no duplicate parts list - the Warehouse is the only list', () => {
    const game = useGameStore()
    game.newGame(1)
    loosePart(game, DAMPER_PART.id, 'worn', false)
    const wrapper = mountPanel()
    expect(wrapper.find('.candidates').exists()).toBe(false)
    expect(wrapper.findAll('li.candidate')).toHaveLength(0)
  })

  it('a zone panel on the bench refuses in words: body work belongs to the body shop', () => {
    const game = useGameStore()
    game.newGame(1)
    const panel = PARTS.find((p) => p.zoneId != null)!
    loosePart(game, panel.id, 'worn', true)
    const wrapper = mountPanel()
    expect(wrapper.get('[data-test="workshop-floor-body-work"]').text()).toContain('body shop')
    expect(wrapper.get('[data-test="workshop-floor-repair"]').attributes('disabled')).toBeDefined()
  })

  it('carries the part back to the warehouse, leaving it owned and the bench clear', async () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = loosePart(game, DAMPER_PART.id, 'worn', true)

    const wrapper = mountPanel()
    await wrapper.find('[data-test="station-take-workbench"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(game.gameState.workbenchPartId).toBeNull()
    expect(game.gameState.partInventory.some((p) => p.id === partInstanceId)).toBe(true)
    expect(wrapper.find('[data-test="workshop-floor-part"]').exists()).toBe(false)
  })

  it('does not accept a part already on the machine - it has to come back first', async () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = loosePart(game, DAMPER_PART.id, 'worn', false)
    game.gameState = { ...game.gameState, machinePartId: partInstanceId }

    const wrapper = mountPanel()
    const draggable = useDraggable(() => partInstanceId)
    draggable.onPointerDown(pointerEvent())
    draggable.onPointerMove(pointerEvent({ clientX: 40 }))
    await wrapper
      .find('[data-test="station-tray-workbench"]')
      .trigger('pointerup', { pointerId: 1 })
    await wrapper.vm.$nextTick()

    expect(game.gameState.workbenchPartId).toBeNull()
  })

  /** The rung is click-per-band, priced and laboured off the real quote, and
   * climbs exactly one band per click - never straight to mint. */
  it('climbs the part on the bench exactly one band per click', async () => {
    const game = useGameStore()
    game.newGame(1)
    const partInstanceId = loosePart(game, DAMPER_PART.id, 'poor', true)
    game.devSetToolTier('suspension', 2)

    const wrapper = mountPanel()
    await wrapper.find('[data-test="workshop-floor-repair"]').trigger('click')
    expect(game.gameState.partInventory.find((p) => p.id === partInstanceId)!.band).toBe('worn')

    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="workshop-floor-repair"]').trigger('click')
    expect(game.gameState.partInventory.find((p) => p.id === partInstanceId)!.band).toBe('fine')
  })

  /** The control is a fixture: fixed short label, target band as a
   * separate chip beside it - never a composed sentence, never gone. */
  it('the repair control is a fixed short label with the target band as a separate chip', () => {
    const game = useGameStore()
    game.newGame(1)
    loosePart(game, DAMPER_PART.id, 'poor', true)
    game.devSetToolTier('suspension', 2)

    const wrapper = mountPanel()
    expect(wrapper.find('[data-test="workshop-floor-repair"]').text()).toBe('Repair')
    expect(wrapper.find('[data-test="workshop-floor-target-band"]').text()).toBe('worn')
  })

  it("disables the rung once today's labour is spent", () => {
    const game = useGameStore()
    game.newGame(1)
    loosePart(game, DAMPER_PART.id, 'worn', true)
    game.gameState = { ...game.gameState, energySpentToday: game.laborSlotsPerDay }

    const wrapper = mountPanel()
    const button = wrapper.find('[data-test="workshop-floor-repair"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toContain('No labour left today')
  })

  /**
   * The design law: the repair control never disappears or gets swapped for
   * different UI when there is nothing to do - it stays in place, keeps its
   * "Repair" label, and disables with the reason instead.
   */
  it("names the machine that reaches mint once the shop's own tools finish at fine", () => {
    const game = useGameStore()
    game.newGame(1) // nothing upgraded, so suspension repairs cap at fine
    loosePart(game, DAMPER_PART.id, 'fine', true)

    const wrapper = mountPanel()
    const button = wrapper.find('[data-test="workshop-floor-repair"]')
    expect(button.text()).toBe('Repair')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toContain('reaches mint')
    expect(wrapper.find('[data-test="workshop-floor-ceiling"]').text()).toContain('reaches mint')
  })

  it('says a mint part needs nothing, and a replace-only part cannot be rebuilt', () => {
    const game = useGameStore()
    game.newGame(1)
    loosePart(game, DAMPER_PART.id, 'mint', true)

    const mint = mountPanel()
    const mintButton = mint.find('[data-test="workshop-floor-repair"]')
    expect(mintButton.text()).toBe('Repair')
    expect(mintButton.attributes('disabled')).toBeDefined()
    expect(mintButton.attributes('title')).toContain('Nothing left to put')
    expect(mint.find('[data-test="workshop-floor-idle"]').text()).toContain('Nothing left to put')

    const tyreId = loosePart(game, TYRE_PART.id, 'worn', false)
    game.gameState = { ...game.gameState, workbenchPartId: tyreId }
    const tyres = mountPanel()
    const tyresButton = tyres.find('[data-test="workshop-floor-repair"]')
    expect(tyresButton.text()).toBe('Repair')
    expect(tyresButton.attributes('disabled')).toBeDefined()
    expect(tyres.find('[data-test="workshop-floor-idle"]').text()).toContain(
      'Take it off and fit a new one',
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
