import {
  CARS,
  PARTS,
  WORKBENCH,
  type ConditionBand,
  type PartInstance,
} from '@midnight-garage/content'
import { makeMarketOrigin } from '@midnight-garage/sim'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { clearDragSession, useDraggable } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import GarageScreen from './GarageScreen.vue'

const DAMPER_PART = PARTS.find((part) => part.carPartId === 'dampers')!

/** Puts one loose part in the warehouse at `band`, unattached to any
 * station, and hands back its instance id. `suffix` distinguishes a second
 * instance of the same catalogue part. */
function loosePart(
  game: ReturnType<typeof useGameStore>,
  band: ConditionBand,
  suffix = '',
): string {
  const instance: PartInstance = {
    id: `pi-loose-${DAMPER_PART.id}${suffix}`,
    partId: DAMPER_PART.id,
    band,
    origin: makeMarketOrigin(1),
  }
  game.gameState = {
    ...game.gameState,
    partInventory: [...game.gameState.partInventory, instance],
  }
  return instance.id
}

// Track every mounted
// wrapper and unmount it after each test, so a component left mounted from a
// prior test cannot leak its store's pinia into the next (see App/CarDetailScreen).
const mountedWrappers: VueWrapper[] = []

/** A minimal real router: the screen reads `route.query.open` for the
 * station deep link and pushes to the car screen from the body and paint
 * entry, so `useRoute`/`useRouter` have to resolve. `RouterLinkStub` still
 * keeps every `<RouterLink>` a plain, inspectable stub. */
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'garage', component: { render: () => h('div') } },
      { path: '/car/:id', name: 'car', component: { render: () => h('div') } },
      { path: '/body-shop', name: 'body-shop', component: { render: () => h('div') } },
    ],
  })
}

function mountScreen(router = makeRouter()) {
  const wrapper = mount(GarageScreen, {
    global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  return wrapper
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

/** A pointer event carrying just enough for `useDraggable` to track a drag -
 * for a part, which (unlike a car) has no draggable card rendered on this
 * screen, so the composable is driven directly rather than through a DOM
 * `pointerdown`/`pointermove` pair on an origin element. */
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

describe('GarageScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('the reputation line links to the office (sprint209.md)', () => {
    const wrapper = mountScreen()
    const link = wrapper
      .findAllComponents(RouterLinkStub)
      .find((c) => c.attributes('data-test') === 'standing-link')
    expect(link).toBeDefined()
    expect(link!.props('to')).toEqual({ name: 'office' })
  })

  // Event-log coverage lives in `EventLogDrawer.test.ts`, not here. The day
  // counter's own live-update coverage lives in `DayCashBox.test.ts` and
  // `App.test.ts` now that it renders in the floating overlay, not here.

  it('a granted car lands in parking (never straight into a bay)', async () => {
    const game = useGameStore()
    const wrapper = mountScreen()
    // Parking always renders its full capacity as
    // slots (occupied + empty), mirroring service bays - so "empty bay"
    // placeholders (real drop targets) are present from the start.
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
      // it was originally assigned (a genuine position, not "whichever parking row
      // renders first"), so the drop must target carB's occupied slot specifically, not just the
      // first parking `.shop-slot` in DOM order (that could just as easily be an empty one).
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
      // rendered is an empty placeholder, a real drop target.
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

  describe('the garage reads as pairs (sprint211.md task F: layout/grouping only)', () => {
    it('groups service bays with the benches and machine shop in one cluster', () => {
      const wrapper = mountScreen()
      const general = wrapper.get('[data-test="cluster-general"]')

      expect(general.find('[data-test="service-slot-0"]').exists()).toBe(true)
      expect(general.find('[data-test="station-open-bench-engine-bench"]').exists()).toBe(true)
      expect(general.find('[data-test="station-open-machine"]').exists()).toBe(true)
      expect(general.find('[data-test="station-open-body-paint"]').exists()).toBe(false)
    })

    it('groups the body bay with the body shop door in the other cluster', () => {
      const wrapper = mountScreen()
      const body = wrapper.get('[data-test="cluster-body"]')

      expect(body.find('[data-test="body-bay-slot"]').exists()).toBe(true)
      expect(body.find('[data-test="station-open-body-paint"]').exists()).toBe(true)
      expect(body.find('[data-test="station-open-bench-engine-bench"]').exists()).toBe(false)
      expect(body.find('[data-test="service-slot-0"]').exists()).toBe(false)
    })
  })

  describe('work stations (the garage is one building)', () => {
    it('lists the machine shop and body bay status on a fresh game', () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()
      expect(wrapper.get('[data-test="station-status-machine"]').text()).toBe('derelict')
      // The body and paint tile has no derelict reading any more
      // (sprint208.md): the stick welder stands in the room from day one, so
      // its status names the bay's own occupant instead.
      expect(wrapper.get('[data-test="station-status-body-paint"]').text()).toBe('empty')
    })

    // A bench is a room of its own, not a panel that opens here: each of the
    // three tiles is a plain door to the bench route, the same idiom the body
    // shop and office tiles use.
    it('the three bench tiles are plain doors to their own bench route', () => {
      const wrapper = mountScreen()
      for (const bench of WORKBENCH.benches) {
        const link = wrapper
          .findAllComponents(RouterLinkStub)
          .find((c) => c.attributes('data-test') === `station-open-bench-${bench.id}`)
        expect(link, bench.id).toBeDefined()
        expect(link!.props('to')).toEqual({ name: 'bench', params: { benchId: bench.id } })
        expect(link!.text()).toContain(bench.displayName)
      }
    })

    // A bench tile has to say when something is mid-job on it: the garage
    // floor is where a player decides what to walk to next.
    it('a bench tile counts what is waiting on it, and carries no chip when nothing is', async () => {
      const game = useGameStore()
      const first = loosePart(game, 'worn', '-a')
      const second = loosePart(game, 'worn', '-b')
      const wrapper = mountScreen()

      for (const bench of WORKBENCH.benches) {
        expect(wrapper.find(`[data-test="bench-waiting-${bench.id}"]`).exists(), bench.id).toBe(
          false,
        )
      }

      expect(game.placeOnBench(first)).toBe(true)
      await wrapper.vm.$nextTick()
      expect(wrapper.get('[data-test="bench-waiting-chassis-bench"]').text()).toBe('1 waiting')

      // A count, not a flag.
      expect(game.placeOnBench(second)).toBe(true)
      await wrapper.vm.$nextTick()
      expect(wrapper.get('[data-test="bench-waiting-chassis-bench"]').text()).toBe('2 waiting')

      // Dampers are the chassis bench's work, so no other tile claims them.
      expect(wrapper.find('[data-test="bench-waiting-engine-bench"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="bench-waiting-body-trim-bench"]').exists()).toBe(false)

      expect(game.takeOffBench(first)).toBe(true)
      expect(game.takeOffBench(second)).toBe(true)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-test="bench-waiting-chassis-bench"]').exists()).toBe(false)
    })

    it('the old single workbench tile no longer exists - three bench doors replaced it', () => {
      const wrapper = mountScreen()
      expect(wrapper.find('[data-test="station-open-workbench"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="station-status-workbench"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="workbench-panel"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Workbench')
    })

    it('clicking the machine shop opens the machine panel in place, machinery list and all', async () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()

      await wrapper.get('[data-test="station-open-machine"]').trigger('click')
      expect(wrapper.find('[data-test="machine-shop-panel"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="machine-shop-machinery"]').exists()).toBe(true)
    })

    it('arriving with `open=machine` in the query opens the machine panel directly (the car screen door)', async () => {
      const game = useGameStore()
      game.newGame(1)
      const router = makeRouter()
      await router.push({ name: 'garage', query: { open: 'machine' } })
      const wrapper = mountScreen(router)
      expect(wrapper.find('[data-test="machine-shop-panel"]').exists()).toBe(true)
    })

    // The body and paint tile gates nothing (sprint208.md, the verified
    // indictment's item 1): it is a plain door to the body shop room,
    // reachable whether or not a car sits in the bay - the room itself
    // states the empty-bay case.
    it('the body and paint tile is a plain door to the body shop room, always', () => {
      const wrapper = mountScreen()
      const link = wrapper
        .findAllComponents(RouterLinkStub)
        .find((c) => c.attributes('data-test') === 'station-open-body-paint')
      expect(link).toBeDefined()
      expect(link!.props('to')).toEqual({ name: 'body-shop' })
    })

    // The office is a real second room off the garage floor (sprint209.md
    // task B), same plain-door idiom as body and paint: the whole tile is a
    // link, never a togglable panel.
    it('the office tile is a plain door to the office room', () => {
      const game = useGameStore()
      game.newGame(1)
      const wrapper = mountScreen()
      const link = wrapper
        .findAllComponents(RouterLinkStub)
        .find((c) => c.attributes('data-test') === 'station-open-office')
      expect(link).toBeDefined()
      expect(link!.props('to')).toEqual({ name: 'office' })
      expect(wrapper.get('[data-test="station-status-office"]').text()).toContain(
        game.reputationTier,
      )
    })
  })

  describe('the body bay (sprint208.md: the bay is the gate, the room is the surface)', () => {
    it('dragging a parked car onto the body bay moves it there, via the real pointer handlers', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      const wrapper = mountScreen()

      await dragPast(wrapper, '.parking-list .car-card')
      await dropOn(wrapper, '[data-test="body-bay-slot"]')

      expect(game.gameState.bodyBayCarId).toBe(carId)
      expect(game.parkingView.every((c) => c === null)).toBe(true)
    })

    it('pick a parked car, then place it into the body bay - no drag gesture at all', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      const wrapper = mountScreen()

      await wrapper.get(`[data-test="move-service-pick-${carId}"]`).trigger('click')
      await wrapper.get('[data-test="move-parking-place-empty-body-bay"]').trigger('click')

      expect(game.gameState.bodyBayCarId).toBe(carId)
    })

    it("the bay's own occupant links straight to the body shop room, not the car page", async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      expect(game.moveCarToSlot(carId, 'body', 0)).toBe(true)
      const wrapper = mountScreen()
      await wrapper.vm.$nextTick()

      const slot = wrapper.get('[data-test="body-bay-slot"]')
      const link = slot.findComponent(RouterLinkStub)
      expect(link.exists()).toBe(true)
      expect(link.props('to')).toEqual({ name: 'body-shop' })
    })

    it('the body-bay car can move back out to parking via its own move button', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      expect(game.moveCarToSlot(carId, 'body', 0)).toBe(true)
      const wrapper = mountScreen()

      await wrapper.get(`[data-test="move-parking-${carId}"]`).trigger('click')

      expect(game.gameState.bodyBayCarId).toBeNull()
      expect(game.parkingView.some((c) => c?.carId === carId)).toBe(true)
    })

    it('the station tile names the bay occupant once one is parked there', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const carId = game.gameState.ownedCars[0]!.id
      expect(game.moveCarToSlot(carId, 'body', 0)).toBe(true)
      const wrapper = mountScreen()
      await wrapper.vm.$nextTick()

      expect(wrapper.get('[data-test="station-status-body-paint"]').text()).toBe(
        game.carDetail(carId)!.displayName,
      )
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

  /**
   * A part can be dragged straight onto a station's own card without opening
   * its panel first - the same drop primitive `WorkStationTray` uses once a
   * panel is open, applied one level up.
   */
  describe('dragging a part onto a station card', () => {
    it('dragging a warehouse part onto the machine card places it there and opens the panel', async () => {
      const game = useGameStore()
      const partInstanceId = loosePart(game, 'worn')
      const wrapper = mountScreen()

      const draggable = useDraggable(() => partInstanceId)
      draggable.onPointerDown(pointerEvent())
      draggable.onPointerMove(pointerEvent({ clientX: 40 }))
      await wrapper.get('[data-test="station-slot-machine"]').trigger('pointerup', { pointerId: 1 })
      await wrapper.vm.$nextTick()

      expect(game.gameState.machinePartId).toBe(partInstanceId)
      expect(wrapper.find('[data-test="machine-shop-panel"]').exists()).toBe(true)
    })

    it('picking a warehouse part and clicking "Place here" on the machine card places it there', async () => {
      const game = useGameStore()
      const partInstanceId = loosePart(game, 'worn')
      const wrapper = mountScreen()

      useDraggable(() => partInstanceId).togglePick()
      await wrapper.vm.$nextTick()
      await wrapper.get('[data-test="station-place-card-machine"]').trigger('click')
      await wrapper.vm.$nextTick()

      expect(game.gameState.machinePartId).toBe(partInstanceId)
      expect(wrapper.find('[data-test="machine-shop-panel"]').exists()).toBe(true)
    })
  })
})
