import { mount, RouterLinkStub } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearDragSession, useDraggable } from '../composables/useDragAndDrop'
import type { ShopCarView } from '../stores/gameStore'
import ShopSlot from './ShopSlot.vue'

const car: ShopCarView = {
  carId: 'car-1',
  displayName: 'Test Civic',
  isCustomerCar: false,
  arrivingTomorrow: false,
  hasOffer: false,
}

function baseProps() {
  return {
    car: null as ShopCarView | null,
    accepts: () => true,
    moveLabel: 'Move to service',
    moveDisabled: false,
    testIdPrefix: 'slot-',
    emptySlotId: 'empty-parking-0',
  }
}

describe('ShopSlot (Sprint 24 fix 5)', () => {
  beforeEach(() => clearDragSession())

  it('renders the car card when a car is provided', () => {
    const wrapper = mount(ShopSlot, {
      props: { ...baseProps(), car },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.text()).toContain('Test Civic')
    expect(wrapper.find('.slot-empty').exists()).toBe(false)
  })

  it('renders the empty-bay placeholder when car is null', () => {
    const wrapper = mount(ShopSlot, {
      props: baseProps(),
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.find('.slot-empty').text()).toBe('empty bay')
    expect(wrapper.text()).not.toContain('Test Civic')
  })

  it('an empty slot exposes its own emptySlotId in the Place-here data-test once a pick is active', async () => {
    const wrapper = mount(ShopSlot, {
      props: baseProps(),
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.find('[data-test^="slot-place-"]').exists()).toBe(false)

    useDraggable(() => 'picked-car-id').togglePick()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="slot-place-empty-parking-0"]').exists()).toBe(true)
  })

  it('clicking Place here on an active target emits drop with the picked payload', async () => {
    const wrapper = mount(ShopSlot, {
      props: baseProps(),
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    useDraggable(() => 'picked-car-id').togglePick()
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-test="slot-place-empty-parking-0"]').trigger('click')

    expect(wrapper.emitted('drop')).toEqual([['picked-car-id']])
  })

  it('an occupied slot exposes the picked car id in its own Place-here data-test', async () => {
    const wrapper = mount(ShopSlot, {
      props: { ...baseProps(), car },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    useDraggable(() => 'other-car-id').togglePick()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="slot-place-car-1"]').exists()).toBe(true)
  })

  it('clicking the move button emits move with the car id', async () => {
    const wrapper = mount(ShopSlot, {
      props: { ...baseProps(), car },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    await wrapper.find('[data-test="slot-car-1"]').trigger('click')
    expect(wrapper.emitted('move')).toEqual([['car-1']])
  })

  it('the move button is disabled when moveDisabled is true', () => {
    const wrapper = mount(ShopSlot, {
      props: { ...baseProps(), car, moveDisabled: true },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.find('[data-test="slot-car-1"]').attributes('disabled')).toBeDefined()
  })

  /**
   * Sprint 25 task 2: a customer's car still in transit occupies its slot
   * but isn't there yet - nothing to grab, drag, or move.
   */
  it('an in-transit car shows "arriving tomorrow", hides the grab-handle, and disables the move button', () => {
    const arriving: ShopCarView = { ...car, isCustomerCar: true, arrivingTomorrow: true }
    const wrapper = mount(ShopSlot, {
      props: { ...baseProps(), car: arriving },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.text()).toContain('arriving tomorrow')
    expect(wrapper.find(`[data-test="slot-pick-${arriving.carId}"]`).exists()).toBe(false)
    expect(
      wrapper.find(`[data-test="slot-${arriving.carId}"]`).attributes('disabled'),
    ).toBeDefined()
  })

  /** Sprint 68 decision 4 (playtest item 22): money waiting on a car should be
   * visible from the garage, without opening it. */
  it('badges a car that has a live offer today', () => {
    const withOffer: ShopCarView = { ...car, hasOffer: true }
    const wrapper = mount(ShopSlot, {
      props: { ...baseProps(), car: withOffer },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.find(`[data-test="slot-offer-badge-${car.carId}"]`).exists()).toBe(true)
    expect(wrapper.text()).toContain('offer today')
  })

  it('shows no offer badge when there is nothing to answer', () => {
    const wrapper = mount(ShopSlot, {
      props: baseProps(),
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.find(`[data-test="slot-offer-badge-${car.carId}"]`).exists()).toBe(false)
  })
})
