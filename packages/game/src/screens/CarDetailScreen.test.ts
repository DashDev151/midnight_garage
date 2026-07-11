import { CARS, PARTS, type ComponentId } from '@midnight-garage/content'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { clearDragSession } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import CarDetailScreen from './CarDetailScreen.vue'

// A minimal router so useRoute/useRouter resolve; garage/parts are stub targets
// (ReplaceDrawer's "visit the parts market" link needs 'parts' to exist).
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'garage', component: { template: '<div>garage</div>' } },
      { path: '/parts', name: 'parts', component: { template: '<div>parts</div>' } },
      { path: '/car/:id', name: 'car', component: CarDetailScreen },
    ],
  })
}

async function mountAt(carId: string) {
  const router = makeRouter()
  router.push({ name: 'car', params: { id: carId } })
  await router.isReady()
  const wrapper = mount(CarDetailScreen, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

/** Drags an element past the composable's movement threshold - pointerdown
 * at the origin, then a pointermove far enough away to count as a drag. */
async function dragPast(
  wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'],
  handleSelector: string,
): Promise<void> {
  await wrapper.get(handleSelector).trigger('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 })
  await wrapper
    .get(handleSelector)
    .trigger('pointermove', { pointerId: 1, clientX: 40, clientY: 0 })
}

async function dropOn(
  wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'],
  zoneSelector: string,
): Promise<void> {
  await wrapper.get(zoneSelector).trigger('pointerup', { pointerId: 1 })
}

describe('CarDetailScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })

  it('renders a granted car: name, radar, components', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id

    const { wrapper } = await mountAt(id)
    expect(wrapper.find('svg.radar').exists()).toBe(true)
    expect(wrapper.text()).toContain(game.carsDetailed[0]!.displayName)
    // Every non-full, non-busy component renders a Repair button (Sprint 18).
    const componentIds: ComponentId[] = [
      'engine',
      'forcedInduction',
      'drivetrain',
      'suspension',
      'brakes',
      'wheels',
      'body',
      'interior',
    ]
    for (const componentId of componentIds) {
      const condition = game.gameState.ownedCars[0]!.components[componentId].condition
      expect(wrapper.find(`[data-test="stage-repair-${componentId}"]`).exists()).toBe(
        condition < 100,
      )
    }
  })

  it('staging a repair, then Confirm, actually creates and labors the job', async () => {
    const game = useGameStore()
    // Sprint 13: repair is gated on owning the matching equipment.
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    game.devGrantCar(CARS[0]!.id)
    const car = game.gameState.ownedCars[0]!
    const id = car.id
    const { wrapper } = await mountAt(id)

    // A dev-granted car lands in parking; move it into the service bay first
    // so the repair job it's about to queue can actually receive labor.
    await wrapper.find('[data-test="toggle-bay"]').trigger('click')
    // 'body' (unlike 'engine', which this seeded car rolls at a full 100)
    // reliably starts below 100, so this test actually exercises repair.
    expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
    expect(wrapper.text()).toContain('Staged work (1)')
    expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-test="confirm-work"]').trigger('click')
    expect(wrapper.text()).toContain('Staged work (0)')
    // Confirm actually spent labor against a real job - either it finished in this
    // same confirm (today's budget covered it) or it's left open, continuable below.
    expect(
      game.gameState.ownedCars[0]!.components.body.condition === 100 ||
        game.gameState.jobs.some((j) => j.componentId === 'body'),
    ).toBe(true)

    // End enough days for the repair to finish (bounded loop).
    for (let i = 0; i < 6 && game.gameState.ownedCars[0]!.components.body.condition < 100; i++) {
      await wrapper.find('[data-test="end-day"]').trigger('click')
      await flushPromises()
    }
    expect(game.gameState.ownedCars[0]!.components.body.condition).toBe(100)
  })

  it('unstaging a repair costs nothing and creates no job', async () => {
    const game = useGameStore()
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id
    const { wrapper } = await mountAt(id)

    await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
    expect(wrapper.text()).toContain('Staged work (1)')
    await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
    expect(wrapper.text()).toContain('Staged work (0)')
    expect(game.gameState.jobs).toHaveLength(0)
  })

  it('disables the Repair button (with a reason in its tooltip) when the equipment is not owned (Sprint 13, tooltip since Sprint 25)', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id
    const { wrapper } = await mountAt(id)

    const button = wrapper.find('[data-test="stage-repair-body"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toContain('Needs')
    expect(wrapper.text()).not.toContain('needs')
  })

  it('redirects to the garage when the car id is not owned', async () => {
    const { router } = await mountAt('ghost-car')
    expect(router.currentRoute.value.name).toBe('garage')
  })

  describe('Replace drawer (Sprint 18, round 2)', () => {
    it('the drawer is closed until Replace is clicked, and no PartCard renders before then', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const part = PARTS.find((p) => p.componentId === 'suspension' && p.requiredTags.length === 0)!
      game.devGrantPart(part.id)

      const { wrapper } = await mountAt(id)
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
      expect(wrapper.find('[data-test^="pick-part-"]').exists()).toBe(false)

      await wrapper.find('[data-test="replace-suspension"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(true)
      expect(wrapper.find('[data-test^="pick-part-"]').exists()).toBe(true)

      // Clicking the same Replace button again closes it.
      await wrapper.find('[data-test="replace-suspension"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
    })

    it('clicking a fitting part in the drawer stages it instantly, without spending anything', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const car = game.gameState.ownedCars[0]!
      const componentId = 'suspension'
      // A part with no required tags always fits.
      const part = PARTS.find((p) => p.componentId === componentId && p.requiredTags.length === 0)!
      game.devGrantPart(part.id)
      const cashBefore = game.cashYen

      const { wrapper } = await mountAt(id)
      await wrapper.find(`[data-test="replace-${componentId}"]`).trigger('click')
      await wrapper.find('.part-card').trigger('click')

      expect(wrapper.text()).toContain('staged:')
      expect(game.cashYen).toBe(cashBefore) // free until Confirm
      expect(car.components[componentId].installed).toBeNull() // not real yet
      // Selecting closes the drawer.
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
    })

    it('dragging a fitting part from the drawer onto the component stages it', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const componentId = 'suspension'
      const part = PARTS.find((p) => p.componentId === componentId && p.requiredTags.length === 0)!
      game.devGrantPart(part.id)

      const { wrapper } = await mountAt(id)
      await wrapper.find(`[data-test="replace-${componentId}"]`).trigger('click')
      await dragPast(wrapper, `[data-test^="pick-part-"]`)
      await dropOn(wrapper, `[data-test="replace-${componentId}"]`)

      expect(wrapper.text()).toContain('staged:')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false) // closed on drop
    })

    it('a non-fitting part is shown but dimmed and inert to click-to-select', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      // A brakes-only part doesn't fit suspension.
      const wrongPart = PARTS.find((p) => p.componentId === 'brakes')!
      game.devGrantPart(wrongPart.id)
      const partInstanceId = game.gameState.partInventory[0]!.id

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="replace-suspension"]').trigger('click')
      expect(wrapper.find('.part-card.no-fit').exists()).toBe(true)

      await wrapper.find('.part-card').trigger('click')
      expect(game.isPartStagedAnywhere(partInstanceId)).toBe(false) // click was a no-op
    })

    it('Confirm actually installs the staged part and removes it from inventory', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const componentId = 'suspension'
      const part = PARTS.find((p) => p.componentId === componentId && p.requiredTags.length === 0)!
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory[0]!.id

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="toggle-bay"]').trigger('click')
      game.stageAction(id, { kind: 'install', componentId, partInstanceId })
      await wrapper.vm.$nextTick()

      await wrapper.find('[data-test="confirm-work"]').trigger('click')
      expect(game.gameState.ownedCars[0]!.components[componentId].installed?.id).toBe(
        partInstanceId,
      )
      expect(game.gameState.partInventory).toHaveLength(0)
    })

    it('a part staged on one car is unavailable to stage on another (decision 3)', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      game.devGrantCar(CARS[1]?.id ?? CARS[0]!.id)
      const [carA, carB] = game.gameState.ownedCars
      const componentId = 'suspension'
      const part = PARTS.find((p) => p.componentId === componentId && p.requiredTags.length === 0)!
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory[0]!.id

      expect(game.stageAction(carA!.id, { kind: 'install', componentId, partInstanceId })).toBe(
        true,
      )
      expect(game.stageAction(carB!.id, { kind: 'install', componentId, partInstanceId })).toBe(
        false,
      )

      const { wrapper } = await mountAt(carB!.id)
      await wrapper.find(`[data-test="replace-${componentId}"]`).trigger('click')
      // Already staged on carA - omitted from carB's own drawer (decision 3).
      expect(wrapper.find(`[data-test="pick-part-${partInstanceId}"]`).exists()).toBe(false)
    })

    it('Sprint 24 fix 1: a picked part that fits the still-open drawer completes on a second Replace click', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const componentId = 'suspension'
      const part = PARTS.find((p) => p.componentId === componentId && p.requiredTags.length === 0)!
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory[0]!.id

      const { wrapper } = await mountAt(id)
      await wrapper.find(`[data-test="replace-${componentId}"]`).trigger('click')
      await wrapper.find(`[data-test="pick-part-${partInstanceId}"]`).trigger('click')
      // Picking doesn't close the drawer, and the drawer's own row still
      // renders - clicking it again (the accessibility-fallback completion
      // path) stages the install.
      await wrapper.find(`[data-test="replace-${componentId}"]`).trigger('click')

      expect(wrapper.text()).toContain('staged:')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
    })

    it('Sprint 24 fix 1: a pick that does not fit the clicked row falls through to opening that drawer, not a silent no-op', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      // Pick a brakes-only part from suspension's drawer (doesn't fit suspension).
      const wrongPart = PARTS.find((p) => p.componentId === 'brakes')!
      game.devGrantPart(wrongPart.id)
      const partInstanceId = game.gameState.partInventory[0]!.id

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="replace-suspension"]').trigger('click')
      await wrapper.find(`[data-test="pick-part-${partInstanceId}"]`).trigger('click')

      // Close suspension's drawer, then click a different, not-yet-open row
      // (brakes) while the pick is still live - before the fix this was a
      // silent no-op (early return); now it opens brakes' own drawer.
      await wrapper.find('[data-test="close-drawer"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
      await wrapper.find('[data-test="replace-brakes"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(true)
    })

    it('Sprint 24 fix 1: shows a "placing" chip while a pick is active, cleared by Escape', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const componentId = 'suspension'
      const part = PARTS.find((p) => p.componentId === componentId && p.requiredTags.length === 0)!
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory[0]!.id

      const { wrapper } = await mountAt(id)
      await wrapper.find(`[data-test="replace-${componentId}"]`).trigger('click')
      expect(wrapper.find('[data-test="pick-chip"]').exists()).toBe(false)

      await wrapper.find(`[data-test="pick-part-${partInstanceId}"]`).trigger('click')
      expect(wrapper.find('[data-test="pick-chip"]').exists()).toBe(true)

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-test="pick-chip"]').exists()).toBe(false)
    })

    it('unstaging frees the part up to stage elsewhere', () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const componentId = 'suspension'
      const part = PARTS.find((p) => p.componentId === componentId && p.requiredTags.length === 0)!
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory[0]!.id

      game.stageAction(id, { kind: 'install', componentId, partInstanceId })
      expect(game.isPartStagedAnywhere(partInstanceId)).toBe(true)
      game.unstageAction(id, componentId)
      expect(game.isPartStagedAnywhere(partInstanceId)).toBe(false)
    })
  })
})
