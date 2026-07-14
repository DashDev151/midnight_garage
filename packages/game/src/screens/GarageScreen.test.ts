import { CARS } from '@midnight-garage/content'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearDragSession } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import GarageScreen from './GarageScreen.vue'

function mountScreen() {
  // Relies on the active pinia from beforeEach; RouterLink is stubbed since
  // these tests don't exercise navigation, only rendering.
  return mount(GarageScreen, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

/** Drags an element past the composable's movement threshold - pointerdown
 * at the origin, then a pointermove far enough away to count as a drag. */
async function dragPast(
  wrapper: ReturnType<typeof mountScreen>,
  handleSelector: string,
): Promise<void> {
  await wrapper.get(handleSelector).trigger('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 })
  await wrapper
    .get(handleSelector)
    .trigger('pointermove', { pointerId: 1, clientX: 40, clientY: 0 })
}

async function dropOn(
  wrapper: ReturnType<typeof mountScreen>,
  zoneSelector: string,
): Promise<void> {
  await wrapper.get(zoneSelector).trigger('pointerup', { pointerId: 1 })
}

/** Same as `dragPast`, but targets the Nth match - for tests with two occupied cards in the
 * same list, where a plain selector would otherwise grab the same element for both source and target. */
async function dragPastAt(
  wrapper: ReturnType<typeof mountScreen>,
  handleSelector: string,
  index: number,
): Promise<void> {
  const handle = wrapper.findAll(handleSelector)[index]!
  await handle.trigger('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 })
  await handle.trigger('pointermove', { pointerId: 1, clientX: 40, clientY: 0 })
}

async function dropOnAt(
  wrapper: ReturnType<typeof mountScreen>,
  zoneSelector: string,
  index: number,
): Promise<void> {
  const zone = wrapper.findAll(zoneSelector)[index]!
  await zone.trigger('pointerup', { pointerId: 1 })
}

describe('GarageScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })

  it('renders the starting day and cash', () => {
    const wrapper = mountScreen()
    expect(wrapper.get('[data-test="day-value"]').text()).toBe('1')
    // Sprint 59: STARTING_CASH_YEN retuned 1,500,000 -> 300,000 (derived from
    // roster medians, see economy.ts's own schema doc comment).
    expect(wrapper.text()).toContain('¥300,000')
  })

  it('shows no shop title on a fresh game, and shows it in plain copy once specialty clears the threshold (Sprint 39)', async () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="shop-title"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="reputation-value"]').text()).toBe('unknown')

    game.gameState = {
      ...game.gameState,
      specialty: { engine: 100, drivetrain: 0, suspension: 0, wheels: 0, body: 0, interior: 0 },
    }
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="shop-title"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="reputation-value"]').text()).toContain('the engine house')
  })

  it('End Day advances the rendered day counter (the DoD)', async () => {
    // Sprint 51: EndDayButton is now App.vue's single global mount point,
    // not rendered on this screen - advance via the store directly, the
    // same action the button itself calls.
    const game = useGameStore()
    const wrapper = mountScreen()
    game.endDay()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-test="day-value"]').text()).toBe('2')
  })

  it('shows the empty-log hint before any day passes, then real events after', async () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    expect(wrapper.text()).toContain('No events yet')
    // Advance a full week so the rent/catalog boundary produces log entries.
    for (let i = 0; i < 7; i++) {
      game.endDay()
    }
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('No events yet')
    expect(wrapper.findAll('.log li').length).toBeGreaterThan(0)
  })

  it('Sprint 42: the recent-activity log shows a realized profit line after a real walk-in sale', async () => {
    const game = useGameStore()
    const wrapper = mountScreen()

    // Win a car with a known purchase price (a dev grant would read
    // unknown-purchase and never log a profit line at all).
    let guard = 0
    while (game.gameState.activeAuctionLots.length === 0 && guard++ < 20) {
      game.endDay()
    }
    const lot = game.gameState.activeAuctionLots.find((l) => l.tier === 'local-yard')
    if (!lot) throw new Error('expected a local-yard lot after the first catalog')
    expect(game.buyout(lot.id)).toBe(true)
    const carId = game.gameState.ownedCars.at(-1)!.id

    expect(game.setForSale(carId, true)).toBe(true)
    guard = 0
    while (!game.gameState.pendingOffers.some((o) => o.carInstanceId === carId) && guard++ < 60) {
      game.endDay()
    }
    expect(game.gameState.pendingOffers.some((o) => o.carInstanceId === carId)).toBe(true)
    expect(game.acceptOffer(carId)).toBe(true)
    await wrapper.vm.$nextTick()

    const lines = wrapper.findAll('.log li').map((li) => li.text())
    expect(lines.some((text) => text.includes('Sold') && text.includes('profit'))).toBe(true)
  })

  it('a granted car lands in parking (never straight into a bay)', async () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    // Sprint 17 playtest fix: parking always renders its full capacity as
    // slots (occupied + empty), mirroring service bays - so "empty bay"
    // placeholders (real drop targets now) are present from the start.
    expect(wrapper.findAll('.parking-list .car-card')).toHaveLength(0)
    expect(wrapper.text()).toContain('empty bay')

    game.devGrantCar(CARS[0]!.id)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.parking-list .car-card')).toHaveLength(1)
    expect(wrapper.text()).toContain(game.carsDetailed[0]!.displayName)
  })

  describe('the double-parking grace slot (Sprint 45)', () => {
    it('renders nothing when no car is double-parked', () => {
      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="grace-parking"]').exists()).toBe(false)
    })

    it('shows the red double-parked warning with the car name and daily fine once a car occupies the grace slot', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      game.gameState = {
        ...game.gameState,
        parkingCarIds: [],
        graceParkingCarId: carId,
      }
      const wrapper = mountScreen()

      const grace = wrapper.get('[data-test="grace-parking"]')
      expect(grace.text()).toContain(game.carsDetailed[0]!.displayName)
      expect(grace.text()).toContain('DOUBLE PARKED')
      expect(grace.text()).toContain(formatYen(game.doubleParkingFineYen))
    })
  })

  it('moving a parked car into the service bay updates both lists', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const carId = game.gameState.ownedCars[0]!.id
    const wrapper = mountScreen()

    await wrapper.get(`[data-test="move-service-${carId}"]`).trigger('click')
    expect(wrapper.findAll('.parking-list .car-card')).toHaveLength(0)
    expect(wrapper.findAll('.bay-slots .car-card')).toHaveLength(1)
    expect(wrapper.find(`[data-test="move-parking-${carId}"]`).exists()).toBe(true)
  })

  it('the removed swap dropdown/button markup is gone (Sprint 17: replaced by drag-and-drop)', () => {
    const wrapper = mountScreen()
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('[data-test^="swap-"]').exists()).toBe(false)
  })

  it("a car's RouterLink never natively drags (real bug: browsers auto-drag anchors, hijacking the pointer gesture before useDraggable sees it)", async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const wrapper = mountScreen()
    await wrapper.vm.$nextTick()
    const link = wrapper.get('.slot-car')
    expect(link.attributes('draggable')).toBe('false')
  })

  describe('drag-and-drop (Sprint 17)', () => {
    it('dragging a parked car onto the empty service bay moves it, via the real pointer handlers', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      const wrapper = mountScreen()

      await dragPast(wrapper, '.parking-list .car-card')
      await dropOn(wrapper, '.bay-slots .shop-slot')

      expect(game.serviceBaysView.some((s) => s?.carId === carId)).toBe(true)
      expect(game.parkingView.every((c) => c === null)).toBe(true)
    })

    it('dragging a service-bay car onto an occupied parking row swaps them, when the shop is exactly full', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      game.devGrantCar(CARS[1]?.id ?? CARS[0]!.id)
      const [carA, carB] = game.gameState.ownedCars
      game.moveCar(carA!.id, 'service') // fills the sole starting service bay
      const wrapper = mountScreen()

      // carA is in the (only) service slot, carB sits in parking - at whichever real slot index
      // it was originally assigned (Sprint 17: a genuine position, not "whichever parking row
      // renders first"), so the drop must target carB's occupied slot specifically, not just the
      // first parking `.shop-slot` in DOM order (that could just as easily be an empty one now).
      await dragPast(wrapper, '.bay-slots .car-card')
      await dropOn(wrapper, '.parking-list .shop-slot:has(.car-card)')

      expect(game.serviceBaysView.some((s) => s?.carId === carB!.id)).toBe(true)
      expect(game.parkingView.some((c) => c?.carId === carA!.id)).toBe(true)
    })

    it('dragging a service-bay car onto an empty parking slot moves it (not just swap) - the reported bug', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      game.moveCar(carId, 'service')
      const wrapper = mountScreen()

      // Parking is entirely empty at this point - every parking-list slot
      // rendered is an empty placeholder, a real drop target since the
      // playtest fix (parking used to render zero slots when nothing was
      // parked, leaving nothing to drop onto).
      await dragPast(wrapper, '.bay-slots .car-card')
      await dropOn(wrapper, '.parking-list .shop-slot')

      expect(game.parkingView.some((c) => c?.carId === carId)).toBe(true)
      expect(game.serviceBaysView.every((s) => s === null)).toBe(true)
    })

    /**
     * Real bug reported from manual testing: same-section drops (service→
     * service, parking→parking) were outright *refused* - the drop target
     * never highlighted and the gesture visibly failed, even though slot
     * position carries no gameplay meaning and the "right" outcome is just
     * "nothing changes." A refused drop and an accepted no-op look
     * identical in terms of final game state, but very different to a
     * player mid-drag - these lock in that same-section drops are now
     * *accepted* (the target highlights, the gesture completes cleanly),
     * not silently rejected.
     */
    describe('same-section drops (previously refused - the reported bug)', () => {
      it('occupied service onto an empty service slot completes cleanly and changes nothing', async () => {
        const game = useGameStore()
        game.devGrantBay('service') // a second bay, so there's an empty slot alongside the occupied one
        game.devGrantCar(CARS[0]!.id)
        const carId = game.gameState.ownedCars[0]!.id
        game.moveCar(carId, 'service')
        const wrapper = mountScreen()

        await dragPast(wrapper, '.bay-slots .car-card')
        await dropOn(wrapper, '.bay-slots .shop-slot:not(:has(.car-card))')

        expect(game.serviceBaysView.some((s) => s?.carId === carId)).toBe(true)
        expect(game.parkingView.every((c) => c === null)).toBe(true)
      })

      it('occupied parking onto an empty parking slot completes cleanly and changes nothing', async () => {
        const game = useGameStore()
        game.devGrantCar(CARS[0]!.id)
        const carId = game.gameState.ownedCars[0]!.id
        const wrapper = mountScreen()

        await dragPast(wrapper, '.parking-list .car-card')
        await dropOn(wrapper, '.parking-list .shop-slot:not(:has(.car-card))')

        expect(game.parkingView.some((c) => c?.carId === carId)).toBe(true)
        expect(game.serviceBaysView.every((s) => s === null)).toBe(true)
      })

      it('occupied service onto another occupied service car completes cleanly and changes nothing', async () => {
        const game = useGameStore()
        game.devGrantBay('service')
        game.devGrantCar(CARS[0]!.id)
        game.devGrantCar(CARS[1]?.id ?? CARS[0]!.id)
        const [carA, carB] = game.gameState.ownedCars
        game.moveCar(carA!.id, 'service')
        game.moveCar(carB!.id, 'service')
        const wrapper = mountScreen()

        // Two distinct occupied service cards - drag the first, drop on the second.
        await dragPastAt(wrapper, '.bay-slots .car-card', 0)
        await dropOnAt(wrapper, '.bay-slots .shop-slot:has(.car-card)', 1)

        expect(game.serviceBaysView.some((s) => s?.carId === carA!.id)).toBe(true)
        expect(game.serviceBaysView.some((s) => s?.carId === carB!.id)).toBe(true)
        expect(game.parkingView.every((c) => c === null)).toBe(true)
      })

      it('occupied parking onto another occupied parking car completes cleanly and changes nothing', async () => {
        const game = useGameStore()
        game.devGrantCar(CARS[0]!.id)
        game.devGrantCar(CARS[1]?.id ?? CARS[0]!.id)
        const [carA, carB] = game.gameState.ownedCars
        const wrapper = mountScreen()

        // Two distinct occupied parking cards - drag the first, drop on the second.
        await dragPastAt(wrapper, '.parking-list .car-card', 0)
        await dropOnAt(wrapper, '.parking-list .shop-slot:has(.car-card)', 1)

        expect(game.parkingView.some((c) => c?.carId === carA!.id)).toBe(true)
        expect(game.parkingView.some((c) => c?.carId === carB!.id)).toBe(true)
        expect(game.serviceBaysView.every((s) => s === null)).toBe(true)
      })
    })
  })

  describe('click-based accessibility fallback (Sprint 17 decision 2)', () => {
    it('pick a parked car, then place it on the service bay - no drag gesture at all', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      const wrapper = mountScreen()

      await wrapper.get(`[data-test="move-service-pick-${carId}"]`).trigger('click')
      await wrapper.get('[data-test="move-parking-place-empty-0"]').trigger('click')

      expect(game.serviceBaysView.some((s) => s?.carId === carId)).toBe(true)
      expect(game.parkingView.every((c) => c === null)).toBe(true)
    })

    it('clicking "move…" again on the same car cancels the pick', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      const wrapper = mountScreen()

      await wrapper.get(`[data-test="move-service-pick-${carId}"]`).trigger('click')
      expect(wrapper.find('[data-test^="move-parking-place-"]').exists()).toBe(true)

      await wrapper.get(`[data-test="move-service-pick-${carId}"]`).trigger('click')
      expect(wrapper.find('[data-test^="move-parking-place-"]').exists()).toBe(false)
    })
  })
})
