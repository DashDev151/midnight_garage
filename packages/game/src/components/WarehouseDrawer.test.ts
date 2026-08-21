import { CARS, PARTS, fitmentClassForTier } from '@midnight-garage/content'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearDragSession } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import { useUiStore } from '../stores/uiStore'
import WarehouseDrawer from './WarehouseDrawer.vue'

/**
 * Every wrapper is tracked and unmounted after its test, so a component left
 * mounted from a prior test cannot leak its store's pinia into the next
 * (see App/CarDetailScreen).
 */
const mountedWrappers: VueWrapper[] = []
function mountDrawer() {
  const wrapper = mount(WarehouseDrawer, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

describe('WarehouseDrawer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })

  describe('the tab', () => {
    it('shows the holding count and toggles the drawer open and closed', async () => {
      const game = useGameStore()
      const part = PARTS.find((p) => p.grade !== 'stock')!
      game.devGrantPart(part.id)

      const wrapper = mountDrawer()
      expect(wrapper.get('[data-test="warehouse-count"]').text()).toBe('1/1')
      expect(wrapper.find('[data-test="warehouse-drawer"]').exists()).toBe(false)

      await wrapper.get('[data-test="warehouse-tab"]').trigger('click')
      expect(wrapper.find('[data-test="warehouse-drawer"]').exists()).toBe(true)

      await wrapper.get('[data-test="warehouse-tab"]').trigger('click')
      expect(wrapper.find('[data-test="warehouse-drawer"]').exists()).toBe(false)
    })
  })

  describe('browse mode', () => {
    it('lists every owned part, searchable by name', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      const all = PARTS.filter((p) => p.grade !== 'stock')
      const a = all[0]!
      // A catalogue name recurs across grades of the same product line, so
      // the second part must be one whose whole searchable haystack (brand,
      // name, slot label) cannot match the first one's name.
      const needle = a.name.toLowerCase()
      const b = all.find(
        (p) =>
          !`${p.brand} ${p.name} ${game.carPartLabel(p.carPartId)}`.toLowerCase().includes(needle),
      )!
      game.devGrantPart(a.id)
      game.devGrantPart(b.id)

      const wrapper = mountDrawer()
      ui.openWarehouse()
      await wrapper.vm.$nextTick()
      expect(wrapper.findAll('.part-card')).toHaveLength(2)

      await wrapper.get('[data-test="warehouse-search"]').setValue(a.name)
      expect(wrapper.findAll('.part-card')).toHaveLength(1)
      expect(wrapper.text()).toContain(a.name)
    })

    it('filters to one section and sorts by condition, best band first', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      const damper = PARTS.find((p) => p.carPartId === 'dampers' && p.grade !== 'stock')!
      const ecu = PARTS.find((p) => p.carPartId === 'ignitionEcu' && p.grade !== 'stock')!
      game.devGrantPart(damper.id)
      game.devGrantPart(ecu.id)
      // Force distinct bands so the condition sort has something to order.
      game.gameState = {
        ...game.gameState,
        partInventory: game.gameState.partInventory.map((instance, i) => ({
          ...instance,
          band: i === 0 ? 'worn' : 'mint',
        })),
      }

      const wrapper = mountDrawer()
      ui.openWarehouse()
      await wrapper.vm.$nextTick()

      const section = game.groupForCarPart('dampers')!
      await wrapper.get('[data-test="warehouse-section"]').setValue(section)
      expect(wrapper.findAll('.part-card')).toHaveLength(1)
      expect(wrapper.text()).toContain(damper.name)

      await wrapper.get('[data-test="warehouse-section"]').setValue('all')
      await wrapper.get('[data-test="warehouse-sort"]').setValue('condition')
      const cards = wrapper.findAll('.part-card')
      expect(cards[0]!.text()).toContain('mint')
      expect(cards[1]!.text()).toContain('worn')
    })
  })

  describe('sending a part to the bench', () => {
    it('shows the send button for a repairable part, and clicking it carries the part to its bench and drops it from the browse list', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      const damper = PARTS.find((p) => p.carPartId === 'dampers' && p.grade !== 'stock')!
      game.devGrantPart(damper.id)
      const instanceId = game.gameState.partInventory[0]!.id

      const wrapper = mountDrawer()
      ui.openWarehouse()
      await wrapper.vm.$nextTick()

      const button = wrapper.get(`[data-test="bench-send-${instanceId}"]`)
      expect(button.text()).toBe('To the Chassis bench')
      expect(game.warehouseBenchTargets(instanceId)).toBe('chassis-bench')

      await button.trigger('click')
      await wrapper.vm.$nextTick()

      expect(
        game.benchView('chassis-bench')?.surface.some((p) => p.instanceId === instanceId),
      ).toBe(true)
      expect(wrapper.find(`[data-test="part-card-${instanceId}"]`).exists()).toBe(false)
      expect(wrapper.find(`[data-test="bench-send-${instanceId}"]`).exists()).toBe(false)
    })

    it("never offers the send button for a body-pipeline carrier part (bodywork/paint are the body shop's own work, not the bench's)", async () => {
      const game = useGameStore()
      const ui = useUiStore()
      const bonnet = PARTS.find((p) => p.carPartId === 'bodywork' && p.grade !== 'stock')!
      game.devGrantPart(bonnet.id)
      const instanceId = game.gameState.partInventory[0]!.id

      const wrapper = mountDrawer()
      ui.openWarehouse()
      await wrapper.vm.$nextTick()

      expect(game.warehouseBenchTargets(instanceId)).toBeNull()
      expect(wrapper.find(`[data-test="part-card-${instanceId}"]`).exists()).toBe(true)
      expect(wrapper.find(`[data-test="bench-send-${instanceId}"]`).exists()).toBe(false)
    })

    it('never offers the send button for a non-repairable, replace-only part (a clutch, at any band)', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      const clutch = PARTS.find((p) => p.carPartId === 'clutch' && p.grade !== 'stock')!
      game.devGrantPart(clutch.id)
      const instanceId = game.gameState.partInventory[0]!.id

      const wrapper = mountDrawer()
      ui.openWarehouse()
      await wrapper.vm.$nextTick()

      expect(game.warehouseBenchTargets(instanceId)).toBeNull()
      expect(wrapper.find(`[data-test="part-card-${instanceId}"]`).exists()).toBe(true)
      expect(wrapper.find(`[data-test="bench-send-${instanceId}"]`).exists()).toBe(false)
    })

    // The button names where the part lands, so a player sending a gearbox and
    // a seat off the same list can tell the two walks apart before clicking.
    it("names each part's own destination bench, so two parts bound for different benches read differently", async () => {
      const game = useGameStore()
      const ui = useUiStore()
      const damper = PARTS.find((p) => p.carPartId === 'dampers' && p.grade !== 'stock')!
      const seat = PARTS.find((p) => p.carPartId === 'seats' && p.grade !== 'stock')!
      game.devGrantPart(damper.id)
      game.devGrantPart(seat.id)
      const damperId = game.gameState.partInventory.find((p) => p.partId === damper.id)!.id
      const seatId = game.gameState.partInventory.find((p) => p.partId === seat.id)!.id

      const wrapper = mountDrawer()
      ui.openWarehouse()
      await wrapper.vm.$nextTick()

      expect(game.warehouseBenchTargets(damperId)).toBe('chassis-bench')
      expect(wrapper.get(`[data-test="bench-send-${damperId}"]`).text()).toBe(
        'To the Chassis bench',
      )
      expect(game.warehouseBenchTargets(seatId)).toBe('body-trim-bench')
      expect(wrapper.get(`[data-test="bench-send-${seatId}"]`).text()).toBe(
        'To the Body & trim corner',
      )
    })

    it('excludes a part already on a bench from the browse list entirely, not just its button', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      const damper = PARTS.find((p) => p.carPartId === 'dampers' && p.grade !== 'stock')!
      game.devGrantPart(damper.id)
      const instanceId = game.gameState.partInventory[0]!.id
      expect(game.placeOnBench(instanceId)).toBe(true)

      const wrapper = mountDrawer()
      ui.openWarehouse()
      await wrapper.vm.$nextTick()

      expect(wrapper.find(`[data-test="part-card-${instanceId}"]`).exists()).toBe(false)
      expect(wrapper.find(`[data-test="bench-send-${instanceId}"]`).exists()).toBe(false)
      expect(wrapper.get('[data-test="warehouse-empty"]').text()).toContain('No parts on hand')
    })
  })

  describe('fit mode (opened by a Fit control)', () => {
    it('shows only parts addressed to the fit slot; an occupied slot flags every entry as not-fitting', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      // CARS[0] (honda-city-e-aa) is 'entry' tier; dampers starts stock-filled.
      const fitting = PARTS.find(
        (p) => p.carPartId === 'dampers' && p.grade !== 'stock' && p.fitmentClass === 'entry',
      )!
      const wrongAddress = PARTS.find((p) => p.carPartId === 'ignitionEcu')!
      game.devGrantPart(fitting.id)
      game.devGrantPart(wrongAddress.id)

      const wrapper = mountDrawer()
      ui.openWarehouse({ kind: 'part', carId, carPartId: 'dampers' })
      await wrapper.vm.$nextTick()

      expect(wrapper.findAll('.part-card')).toHaveLength(1)
      expect(wrapper.findAll('.part-card.no-fit')).toHaveLength(1)
      expect(wrapper.text()).not.toContain(wrongAddress.name)
    })

    it('clicking a fitting part fits it immediately and closes the drawer', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      const fitting = PARTS.find(
        (p) => p.carPartId === 'dampers' && p.grade !== 'stock' && p.fitmentClass === 'entry',
      )!
      game.devGrantPart(fitting.id)
      const partInstanceId = game.gameState.partInventory[0]!.id
      // Empty the slot directly (bypassing removePart's own inventory side
      // effect) so this test's inventory holds exactly the one granted part.
      // dampers is now blockedBy rims and springs, so those are emptied the
      // same direct way rather than through removePart (which would add
      // them to inventory too).
      const car = game.gameState.ownedCars[0]!
      game.gameState = {
        ...game.gameState,
        ownedCars: [
          {
            ...car,
            parts: {
              ...car.parts,
              dampers: { installed: null },
              rims: { installed: null },
              springs: { installed: null },
            },
          },
        ],
      }
      // Labour only applies (and the job completes) once the car is in a
      // service bay - a direct install runs through the real job/labour system.
      game.moveCar(carId, 'service')

      const wrapper = mountDrawer()
      ui.openWarehouse({ kind: 'part', carId, carPartId: 'dampers' })
      await wrapper.vm.$nextTick()
      await wrapper.get('.part-card').trigger('click')

      expect(game.gameState.ownedCars[0]!.parts.dampers.installed?.id).toBe(partInstanceId)
      expect(game.gameState.partInventory.some((p) => p.id === partInstanceId)).toBe(false)
      expect(ui.warehouseOpen).toBe(false)
      expect(ui.warehouseFit).toBeNull()
    })

    it('clicking a non-fitting part (its slot is already occupied) fits nothing and stays open', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      const nonFitting = PARTS.find(
        (p) => p.carPartId === 'dampers' && p.grade !== 'stock' && p.fitmentClass === 'entry',
      )!
      game.devGrantPart(nonFitting.id)
      const partInstanceId = game.gameState.partInventory[0]!.id

      const wrapper = mountDrawer()
      ui.openWarehouse({ kind: 'part', carId, carPartId: 'dampers' })
      await wrapper.vm.$nextTick()
      await wrapper.get('.part-card').trigger('click')

      expect(game.gameState.partInventory.some((p) => p.id === partInstanceId)).toBe(true)
      expect(ui.warehouseOpen).toBe(true)
    })

    it('excludes scrap in fit mode, and the empty state links to the parts market', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      game.removePart(carId, 'dampers')
      const fitting = PARTS.find(
        (p) => p.carPartId === 'dampers' && p.grade !== 'stock' && p.fitmentClass === 'entry',
      )!
      game.devGrantPart(fitting.id)
      const instance = game.gameState.partInventory.at(-1)!
      game.gameState = {
        ...game.gameState,
        partInventory: [{ ...instance, band: 'scrap' }],
      }

      const wrapper = mountDrawer()
      ui.openWarehouse({ kind: 'part', carId, carPartId: 'dampers' })
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.part-card').exists()).toBe(false)
      expect(wrapper.text()).toContain('No parts on hand')
      const link = wrapper.findComponent(RouterLinkStub)
      expect(link.props('to')).toEqual({ name: 'parts' })
    })
  })

  describe("zone fit mode (opened by the body shop's own Fit control, sprint211.md task D)", () => {
    it("shows only panels addressed to that exact zone at the car's own fitment class, and fits one on a click", async () => {
      const game = useGameStore()
      const ui = useUiStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      // `installPanel` (like every body-pipeline action) only resolves for
      // the body bay's own car.
      expect(game.moveCarToSlot(carId, 'body', 0)).toBe(true)
      const model = game.context.modelsById[game.gameState.ownedCars[0]!.modelId]!
      const fitClass = fitmentClassForTier(model.tier)
      const car = game.gameState.ownedCars.find((c) => c.id === carId)!
      car.zoneState = {
        ...car.zoneState!,
        bonnet: { ...car.zoneState!.bonnet, panelMissing: true },
      }

      const fitting = PARTS.find((p) => p.zoneId === 'bonnet' && p.fitmentClass === fitClass)!
      const wrongZone = PARTS.find((p) => p.zoneId === 'boot' && p.fitmentClass === fitClass)!
      game.devGrantPart(fitting.id)
      game.devGrantPart(wrongZone.id)
      const partInstanceId = game.gameState.partInventory.find((p) => p.partId === fitting.id)!.id

      const wrapper = mountDrawer()
      ui.openWarehouse({ kind: 'zone', carId, zoneId: 'bonnet' })
      await wrapper.vm.$nextTick()

      expect(wrapper.findAll('.part-card')).toHaveLength(1)
      expect(wrapper.text()).not.toContain(game.partName(wrongZone.id))

      await wrapper.get('.part-card').trigger('click')

      expect(
        game.gameState.ownedCars.find((c) => c.id === carId)!.zoneState!.bonnet.panelMissing,
      ).toBe(false)
      expect(game.gameState.partInventory.some((p) => p.id === partInstanceId)).toBe(false)
      expect(ui.warehouseOpen).toBe(false)
      expect(ui.warehouseFit).toBeNull()
    })
  })

  describe('pin (sprint211.md task G)', () => {
    it('keeps the drawer from tucking away during a drag once pinned, and tucks again once unpinned', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      const part = PARTS.find((p) => p.grade !== 'stock')!
      game.devGrantPart(part.id)
      const instanceId = game.gameState.partInventory[0]!.id

      const wrapper = mountDrawer()
      ui.openWarehouse()
      await wrapper.vm.$nextTick()

      await wrapper.get('[data-test="warehouse-pin"]').trigger('click')
      expect(wrapper.get('[data-test="warehouse-pin"]').attributes('aria-pressed')).toBe('true')

      await wrapper.get(`[data-test="pick-part-${instanceId}"]`).trigger('click')
      expect(wrapper.get('.warehouse').classes()).not.toContain('tucked')

      await wrapper.get('[data-test="warehouse-pin"]').trigger('click')
      expect(wrapper.get('.warehouse').classes()).toContain('tucked')
    })
  })

  describe('condition slicer and the stale-section-filter reset (sprint211.md task G)', () => {
    it('slices the list down to one condition band', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      const parts = PARTS.filter((p) => p.grade !== 'stock').slice(0, 2)
      game.devGrantPart(parts[0]!.id)
      game.devGrantPart(parts[1]!.id)
      game.gameState = {
        ...game.gameState,
        partInventory: game.gameState.partInventory.map((instance, i) => ({
          ...instance,
          band: i === 0 ? 'worn' : 'mint',
        })),
      }

      const wrapper = mountDrawer()
      ui.openWarehouse()
      await wrapper.vm.$nextTick()
      expect(wrapper.findAll('.part-card')).toHaveLength(2)

      await wrapper.get('[data-test="warehouse-condition"]').setValue('mint')
      expect(wrapper.findAll('.part-card')).toHaveLength(1)
      expect(wrapper.get('[data-test="warehouse-count"]').text()).toBe('1/2')
    })

    it('resets an armed section filter to "all" once its section leaves the shelf, and the badge always matches the visible count', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      const damper = PARTS.find((p) => p.carPartId === 'dampers' && p.grade !== 'stock')!
      game.devGrantPart(damper.id)
      const section = game.groupForCarPart('dampers')!

      const wrapper = mountDrawer()
      ui.openWarehouse()
      await wrapper.vm.$nextTick()
      await wrapper.get('[data-test="warehouse-section"]').setValue(section)
      expect(wrapper.findAll('.part-card')).toHaveLength(1)

      // The only part in that section leaves the shelf.
      game.gameState = { ...game.gameState, partInventory: [] }
      await wrapper.vm.$nextTick()

      expect(
        (wrapper.get('[data-test="warehouse-section"]').element as HTMLSelectElement).value,
      ).toBe('all')
      expect(wrapper.get('[data-test="warehouse-count"]').text()).toBe('0/0')
      expect(wrapper.get('[data-test="warehouse-visible-count"]').text()).toContain('0/0')
    })
  })

  describe('the bench-fit tyre caption (sprint230 task 4)', () => {
    it('shows the locked triple-labour caption when picking for a benched member and the wheels line is neither owned nor hired', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id

      const wrapper = mountDrawer()
      ui.openWarehouse({
        kind: 'part',
        carId,
        carPartId: 'tyres',
        benchContainerId: 'wheelAssembly-0',
      })
      await wrapper.vm.$nextTick()

      expect(wrapper.get('[data-test="bench-machine-note"]').text()).toBe(
        'By hand with levers: triple the labour.',
      )
    })

    it('the caption disappears once the wheels line is hired for the day', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id

      const wrapper = mountDrawer()
      ui.openWarehouse({
        kind: 'part',
        carId,
        carPartId: 'tyres',
        benchContainerId: 'wheelAssembly-0',
      })
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-test="bench-machine-note"]').exists()).toBe(true)

      game.hireToolLine('wheels')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-test="bench-machine-note"]').exists()).toBe(false)
    })

    it('the caption disappears once the wheels line is owned outright', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id

      const wrapper = mountDrawer()
      ui.openWarehouse({
        kind: 'part',
        carId,
        carPartId: 'tyres',
        benchContainerId: 'wheelAssembly-0',
      })
      await wrapper.vm.$nextTick()

      game.devSetToolTier('wheels', 2)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-test="bench-machine-note"]').exists()).toBe(false)
    })

    it('never shows the caption for a plain on-car fit slot (no benchContainerId), even with the line neither owned nor hired', async () => {
      const game = useGameStore()
      const ui = useUiStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id

      const wrapper = mountDrawer()
      ui.openWarehouse({ kind: 'part', carId, carPartId: 'tyres' })
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-test="bench-machine-note"]').exists()).toBe(false)
    })
  })
})
