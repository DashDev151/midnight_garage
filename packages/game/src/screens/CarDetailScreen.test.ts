import { CARS, PARTS, type CarPartId, type ComponentId } from '@midnight-garage/content'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

/**
 * Every wrapper `mountAt` produces, unmounted in `afterEach` below. Pinia's
 * `getActivePinia()` prefers an injected pinia from the current Vue
 * injection context over the module-level "active" one
 * (`hasInjectionContext() && inject(piniaSymbol)`, checked before the
 * `setActivePinia`-set fallback) - a car-detail screen left mounted from a
 * PRIOR test (this file mounts a fresh one per test, never explicitly
 * tearing the old one down) can leave that injection context resolvable
 * later, so the very next test's `beforeEach`-created pinia loses to the
 * stale one. Explicit teardown, not a Pinia workaround: every real app
 * unmounts a screen when navigating away from it too.
 */
const mountedWrappers: VueWrapper[] = []

async function mountAt(carId: string) {
  const router = makeRouter()
  router.push({ name: 'car', params: { id: carId } })
  await router.isReady()
  const wrapper = mount(CarDetailScreen, { global: { plugins: [router] } })
  mountedWrappers.push(wrapper)
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

/** An aftermarket (non-stock) catalog part for this slot - every part fits
 * any car now (Sprint 32 decision 1 drops requiredTags), so this just needs
 * to avoid the stock grade (already occupying every slot by default). */
function untaggedPartFor(carPartId: string) {
  return PARTS.find((p) => p.carPartId === carPartId && p.grade !== 'stock')!
}

/** Whether `componentId`'s group has anything the group's own "Repair all to
 * fine" convenience (or a fresh per-part Repair row) would act on right now -
 * the same `poor`/`worn` gate the component itself uses internally. */
function needsRepair(
  game: ReturnType<typeof useGameStore>,
  carId: string,
  componentId: ComponentId,
): boolean {
  return game
    .partsInGroup(carId, componentId)
    .some((row) => row.band === 'poor' || row.band === 'worn')
}

/** Grants cars (bounded) until `componentId`'s group actually needs repair -
 * band rolls are seeded but not fixed to a single outcome across every seed
 * index `devGrantCar` walks through, so tests that exercise the repair flow
 * retry rather than assume one specific grant always rolls "rough". */
function grantCarNeedingRepair(
  game: ReturnType<typeof useGameStore>,
  componentId: ComponentId,
): string {
  let car = game.gameState.ownedCars.at(-1)
  for (let i = 0; i < 30 && (!car || !needsRepair(game, car.id, componentId)); i++) {
    game.devGrantCar(CARS[0]!.id)
    car = game.gameState.ownedCars.at(-1)!
  }
  if (!car || !needsRepair(game, car.id, componentId)) {
    throw new Error(`could not roll a car needing ${componentId} repair`)
  }
  return car.id
}

describe('CarDetailScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('renders a granted car: name, radar, group rows with expand toggles', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id

    const { wrapper } = await mountAt(id)
    expect(wrapper.find('svg.radar').exists()).toBe(true)
    expect(wrapper.text()).toContain(game.carsDetailed[0]!.displayName)
    const componentIds: ComponentId[] = [
      'engine',
      'drivetrain',
      'suspension',
      'wheels',
      'body',
      'interior',
    ]
    for (const componentId of componentIds) {
      expect(wrapper.find(`[data-test="expand-${componentId}"]`).exists()).toBe(true)
      // Every group with at least one poor/worn part offers the group
      // convenience (Sprint 28: "Repair all to fine", not "to mint").
      expect(wrapper.find(`[data-test="stage-repair-${componentId}"]`).exists()).toBe(
        needsRepair(game, id, componentId),
      )
    }
  })

  it('expanding a group reveals every real part row; collapsing hides them again', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id
    const rows = game.partsInGroup(id, 'suspension')

    const { wrapper } = await mountAt(id)
    expect(wrapper.find('.part-sublist').exists()).toBe(false)

    await wrapper.find('[data-test="expand-suspension"]').trigger('click')
    expect(wrapper.findAll('.sub-part-row')).toHaveLength(rows.length)
    for (const row of rows) expect(wrapper.text()).toContain(row.displayName)

    await wrapper.find('[data-test="expand-suspension"]').trigger('click')
    expect(wrapper.find('.part-sublist').exists()).toBe(false)
  })

  it('staging the group "Repair all to fine" convenience, then Confirm, actually creates and labors the job - settling at fine, not mint', async () => {
    const game = useGameStore()
    // Sprint 13: repair is gated on owning the matching equipment.
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    const id = grantCarNeedingRepair(game, 'body')
    const { wrapper } = await mountAt(id)

    // A dev-granted car lands in parking; move it into the service bay first
    // so the repair job it's about to queue can actually receive labor.
    await wrapper.find('[data-test="toggle-bay"]').trigger('click')
    expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
    expect(wrapper.text()).toContain('Staged work (1)')
    expect(wrapper.text()).toContain('Repair Body to fine')
    expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-test="confirm-work"]').trigger('click')
    expect(wrapper.text()).toContain('Staged work (0)')
    expect(
      game.carDetail(id)!.groupBands.body === 'fine' ||
        game.gameState.jobs.some((j) => j.componentId === 'body'),
    ).toBe(true)

    // End Day is a pure day-boundary tick (Sprint 11) - it never auto-feeds
    // labor into an already-open job. A group repair spanning every part in
    // the group (Sprint 26) can easily need more than one day's labor
    // budget, so the player returns each day and clicks "Continue repair"
    // (the componentBusy branch's instant `continueJob` control,
    // data-test="repair-body") to feed that day's labor into the still-open
    // job - a bounded loop over that real flow.
    for (let i = 0; i < 10 && game.carDetail(id)!.groupBands.body !== 'fine'; i++) {
      await wrapper.find('[data-test="end-day"]').trigger('click')
      await flushPromises()
      if (game.carDetail(id)!.groupBands.body === 'fine') break
      const continueBtn = wrapper.find('[data-test="repair-body"]')
      if (continueBtn.exists()) {
        await continueBtn.trigger('click')
        await flushPromises()
      }
    }
    expect(game.carDetail(id)!.groupBands.body).toBe('fine')
  })

  it('unstaging a group repair costs nothing and creates no job', async () => {
    const game = useGameStore()
    for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
    const id = grantCarNeedingRepair(game, 'body')
    const { wrapper } = await mountAt(id)

    await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
    expect(wrapper.text()).toContain('Staged work (1)')
    await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
    expect(wrapper.text()).toContain('Staged work (0)')
    expect(game.gameState.jobs).toHaveLength(0)
  })

  it('disables the group Repair button (with a reason in its tooltip) when the equipment is not owned (Sprint 13, tooltip since Sprint 25)', async () => {
    const game = useGameStore()
    const id = grantCarNeedingRepair(game, 'body')
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

  describe('per-part drill-down (Sprint 28)', () => {
    it('a group with two non-mint parts lets both be repaired independently, without one displacing the other', async () => {
      const game = useGameStore()
      for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
      const id = grantCarNeedingRepair(game, 'suspension')
      const rows = game
        .partsInGroup(id, 'suspension')
        .filter((r) => r.band !== null && r.band !== 'mint' && r.band !== 'scrap')
      if (rows.length < 2) return // this particular roll only had one part to work with

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-suspension"]').trigger('click')
      await wrapper.find(`[data-test="stage-repair-part-${rows[0]!.partId}"]`).trigger('click')
      await wrapper.find(`[data-test="stage-repair-part-${rows[1]!.partId}"]`).trigger('click')

      expect(wrapper.text()).toContain('Staged work (2)')
      expect(game.stagedActionsFor(id)).toEqual(
        expect.arrayContaining([
          {
            kind: 'repair',
            componentId: 'suspension',
            targetBand: 'mint',
            carPartId: rows[0]!.partId,
          },
          {
            kind: 'repair',
            componentId: 'suspension',
            targetBand: 'mint',
            carPartId: rows[1]!.partId,
          },
        ]),
      )
    })

    it('staging the group convenience displaces an existing per-part stage in the same group', async () => {
      const game = useGameStore()
      for (const item of game.equipmentCatalog) game.devGrantEquipment(item.id)
      const id = grantCarNeedingRepair(game, 'suspension')
      const row = game
        .partsInGroup(id, 'suspension')
        .find((r) => r.band === 'poor' || r.band === 'worn')!

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-suspension"]').trigger('click')
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')
      expect(wrapper.text()).toContain('Staged work (1)')

      await wrapper.find('[data-test="stage-repair-suspension"]').trigger('click')
      expect(wrapper.text()).toContain('Staged work (1)')
      expect(game.stagedActionsFor(id)).toEqual([
        { kind: 'repair', componentId: 'suspension', targetBand: 'fine' },
      ])
    })

    it('a scrap part row offers Replace only - no Repair control at all (Sprint 26 decision 5)', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const car = game.gameState.ownedCars[0]!
      const scrapPart = untaggedPartFor('dampers')
      game.gameState = {
        ...game.gameState,
        ownedCars: [
          {
            ...car,
            parts: {
              ...car.parts,
              dampers: {
                installed: {
                  id: 'test-scrap-dampers',
                  partId: scrapPart.id,
                  band: 'scrap',
                  genuinePeriod: false,
                },
              },
            },
          },
        ],
      }

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-suspension"]').trigger('click')
      expect(wrapper.find('[data-test="stage-repair-part-dampers"]').exists()).toBe(false)
      // Occupied (even by scrap) - Replace is unavailable until it's removed.
      expect(wrapper.find('[data-test="replace-part-dampers"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="remove-part-dampers"]').exists()).toBe(true)
    })

    it('an empty forced-induction slot on an NA car shows "no turbo (NA)" and offers Replace, fitting a turbo kit installs it', async () => {
      // honda-city-e-aa is NA: forcedInduction generates genuinely empty, band irrelevant.
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const turboKit = PARTS.find((p) => p.carPartId === 'forcedInduction' && p.grade !== 'stock')!
      game.devGrantPart(turboKit.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-engine"]').trigger('click')
      expect(wrapper.find('[data-test="stage-repair-part-forcedInduction"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('no turbo (NA)')

      await wrapper.find('[data-test="replace-part-forcedInduction"]').trigger('click')
      await wrapper.find('.part-card').trigger('click')
      expect(wrapper.text()).toContain('staged:')

      await wrapper.find('[data-test="toggle-bay"]').trigger('click')
      await wrapper.find('[data-test="confirm-work"]').trigger('click')
      expect(game.gameState.ownedCars[0]!.parts.forcedInduction.installed?.id).toBe(partInstanceId)
    })

    it('removing an installed part opens the slot back up for Replace, dropping it to inventory', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const car = game.gameState.ownedCars[0]!
      const originalStockPartId = car.parts.dampers.installed?.partId
      expect(originalStockPartId).toBeDefined() // every slot starts stock-filled

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-suspension"]').trigger('click')
      expect(wrapper.find('[data-test="replace-part-dampers"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="remove-part-dampers"]').exists()).toBe(true)

      await wrapper.find('[data-test="remove-part-dampers"]').trigger('click')
      expect(game.gameState.ownedCars[0]!.parts.dampers.installed).toBeNull()
      expect(game.gameState.partInventory.some((pi) => pi.partId === originalStockPartId)).toBe(
        true,
      )
      expect(wrapper.find('[data-test="missing-dampers"]').exists()).toBe(true)
    })
  })

  describe('Replace drawer (Sprint 18, round 2; per-part in Sprint 28)', () => {
    it('the drawer is closed until Replace is clicked, and no PartCard renders before then', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      // Every slot starts stock-filled now (Sprint 32) - empty it first so
      // Replace is actually available to click.
      game.removePart(id, 'dampers')

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-suspension"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
      expect(wrapper.find('[data-test^="pick-part-"]').exists()).toBe(false)

      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(true)
      expect(wrapper.find('[data-test^="pick-part-"]').exists()).toBe(true)

      // Clicking the same Replace button again closes it.
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
    })

    it('clicking a fitting part in the drawer stages it instantly, without spending anything', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      game.removePart(id, 'dampers')
      const car = game.gameState.ownedCars[0]!
      const cashBefore = game.cashYen

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-suspension"]').trigger('click')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      await wrapper.find('.part-card').trigger('click')

      expect(wrapper.text()).toContain('staged:')
      expect(game.cashYen).toBe(cashBefore) // free until Confirm
      expect(car.parts.dampers.installed).toBeNull() // not real yet
      // Selecting closes the drawer.
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
    })

    it('dragging a fitting part from the drawer onto its own part row stages it', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      game.removePart(id, 'dampers')

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-suspension"]').trigger('click')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      await dragPast(wrapper, `[data-test^="pick-part-"]`)
      await dropOn(wrapper, '[data-test="replace-part-dampers"]')

      expect(wrapper.text()).toContain('staged:')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false) // closed on drop
    })

    it('a scrap part instance in inventory never appears in the drawer (Sprint 26 decision 6)', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.removePart(id, 'dampers')
      const goodPart = untaggedPartFor('dampers')
      game.devGrantPart(goodPart.id)
      const goodInstanceId = game.gameState.partInventory.at(-1)!.id
      // Force a second, scrap-band instance of the same part into inventory directly.
      game.gameState = {
        ...game.gameState,
        partInventory: [
          ...game.gameState.partInventory,
          { id: 'scrap-instance', partId: goodPart.id, band: 'scrap', genuinePeriod: false },
        ],
      }

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-suspension"]').trigger('click')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      expect(wrapper.find(`[data-test="pick-part-${goodInstanceId}"]`).exists()).toBe(true)
      expect(wrapper.find('[data-test="pick-part-scrap-instance"]').exists()).toBe(false)
    })

    it('Confirm actually installs the staged part onto its exact slot and removes it from inventory', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.removePart(id, 'dampers')
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="toggle-bay"]').trigger('click')
      game.stageAction(id, {
        kind: 'install',
        componentId: 'suspension',
        carPartId: 'dampers',
        partInstanceId,
      })
      await wrapper.vm.$nextTick()

      await wrapper.find('[data-test="confirm-work"]').trigger('click')
      expect(game.gameState.ownedCars[0]!.parts.dampers.installed?.id).toBe(partInstanceId)
      // Only the displaced stock dampers instance (dropped by removePart
      // above) is left - the confirmed install consumed the granted part.
      expect(game.gameState.partInventory.some((pi) => pi.id === partInstanceId)).toBe(false)
    })

    it('a part staged on one car is unavailable to stage on another (decision 3)', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      game.devGrantCar(CARS[1]?.id ?? CARS[0]!.id)
      const [carA, carB] = game.gameState.ownedCars
      game.removePart(carA!.id, 'dampers')
      game.removePart(carB!.id, 'dampers')
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      expect(
        game.stageAction(carA!.id, {
          kind: 'install',
          componentId: 'suspension',
          carPartId: 'dampers',
          partInstanceId,
        }),
      ).toBe(true)
      expect(
        game.stageAction(carB!.id, {
          kind: 'install',
          componentId: 'suspension',
          carPartId: 'dampers',
          partInstanceId,
        }),
      ).toBe(false)

      const { wrapper } = await mountAt(carB!.id)
      await wrapper.find('[data-test="expand-suspension"]').trigger('click')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      // Already staged on carA - omitted from carB's own drawer (decision 3).
      expect(wrapper.find(`[data-test="pick-part-${partInstanceId}"]`).exists()).toBe(false)
    })

    it('Sprint 24 fix 1: a picked part that fits the still-open drawer completes on a second Replace click', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.removePart(id, 'dampers')
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-suspension"]').trigger('click')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      await wrapper.find(`[data-test="pick-part-${partInstanceId}"]`).trigger('click')
      // Picking doesn't close the drawer, and the drawer's own row still
      // renders - clicking it again (the accessibility-fallback completion
      // path) stages the install.
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')

      expect(wrapper.text()).toContain('staged:')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
    })

    it('Sprint 24 fix 1: a pick that does not fit the clicked row falls through to opening that drawer, not a silent no-op', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.removePart(id, 'dampers')
      // Pick a forced-induction kit from the FI drawer (wrong address - forced
      // induction never fits the dampers slot, regardless of tags).
      const wrongPart = PARTS.find((p) => p.carPartId === 'forcedInduction' && p.grade !== 'stock')!
      game.devGrantPart(wrongPart.id)
      // removePart above also dropped the displaced stock dampers instance
      // into inventory - find the granted forced-induction part specifically.
      const partInstanceId = game.gameState.partInventory.find(
        (pi) => pi.partId === wrongPart.id,
      )!.id

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-engine"]').trigger('click')
      await wrapper.find('[data-test="replace-part-forcedInduction"]').trigger('click')
      await wrapper.find(`[data-test="pick-part-${partInstanceId}"]`).trigger('click')

      // Close the FI drawer, then click a different, not-yet-open row
      // (dampers, in a different group) while the pick is still live - before
      // the fix this was a silent no-op (early return); now it opens
      // dampers' own drawer.
      await wrapper.find('[data-test="close-drawer"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
      await wrapper.find('[data-test="expand-suspension"]').trigger('click')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(true)
    })

    it('Sprint 24 fix 1: shows a "placing" chip while a pick is active, cleared by Escape', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.removePart(id, 'dampers')
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-suspension"]').trigger('click')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
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
      game.removePart(id, 'dampers')
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      game.stageAction(id, {
        kind: 'install',
        componentId: 'suspension',
        carPartId: 'dampers' as CarPartId,
        partInstanceId,
      })
      expect(game.isPartStagedAnywhere(partInstanceId)).toBe(true)
      game.unstageAction(id, 'suspension', 'dampers')
      expect(game.isPartStagedAnywhere(partInstanceId)).toBe(false)
    })
  })
})
