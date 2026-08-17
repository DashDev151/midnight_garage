import { CARS, PARTS } from '@midnight-garage/content'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  beforeEach(() => setActivePinia(createPinia()))

  describe('the tab', () => {
    it('shows the holding count and toggles the drawer open and closed', async () => {
      const game = useGameStore()
      const part = PARTS.find((p) => p.grade !== 'stock')!
      game.devGrantPart(part.id)

      const wrapper = mountDrawer()
      expect(wrapper.get('[data-test="warehouse-count"]').text()).toBe('1')
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
      ui.openWarehouse({ carId, carPartId: 'dampers' })
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
      ui.openWarehouse({ carId, carPartId: 'dampers' })
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
      ui.openWarehouse({ carId, carPartId: 'dampers' })
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
      ui.openWarehouse({ carId, carPartId: 'dampers' })
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.part-card').exists()).toBe(false)
      expect(wrapper.text()).toContain('No parts on hand')
      const link = wrapper.findComponent(RouterLinkStub)
      expect(link.props('to')).toEqual({ name: 'parts' })
    })
  })
})
