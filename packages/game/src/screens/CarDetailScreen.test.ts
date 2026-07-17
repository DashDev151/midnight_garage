import {
  ALL_CAR_PART_IDS,
  CARS,
  PARTS,
  PARTS_TAXONOMY,
  type CarPartId,
  type ComponentId,
} from '@midnight-garage/content'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { clearDragSession } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import { formatYen, formatYenDelta } from '../utils/formatYen'
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

/**
 * An aftermarket (non-stock) catalog part for this slot - every part fits
 * any car of the right CLASS now (Sprint 32 decision 1 drops requiredTags;
 * Sprint 53 adds the fitment-class check), so this just needs to avoid the
 * stock grade (already occupying every slot by default). Pinned to
 * `shitbox` - every car this file grants (`CARS[0]`/`CARS[1]`) is that tier.
 */
function untaggedPartFor(carPartId: string) {
  return PARTS.find(
    (p) => p.carPartId === carPartId && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
  )!
}

/** Whether `componentId`'s group has anything the group's own "Repair to…"
 * click-per-rung convenience (or a fresh per-part Repair row) would act on
 * right now - the same worst-repairable-band-below-mint gate `nextGroupStep`
 * uses internally (Sprint 41/48: a non-repairable consumable, e.g. tyres,
 * never counts - only Replace ever touches it; `fine` DOES count now, since
 * fine -> mint is a valid one-rung climb same as any other).
 *
 * Sprint 71 (the teardown game): a `bolt-on`/`buried` part is bench-only -
 * `planGroupRepair` (bands.ts) excludes it from on-car repair entirely, so
 * this must too, or it would predict a "Repair to…" control that no longer
 * renders (engine/drivetrain/suspension/wheels are now bench-only whole
 * groups). */
function needsRepair(
  game: ReturnType<typeof useGameStore>,
  carId: string,
  componentId: ComponentId,
): boolean {
  return game
    .partsInGroup(carId, componentId)
    .some(
      (row) =>
        row.band !== null &&
        row.band !== 'mint' &&
        row.band !== 'scrap' &&
        row.repairable &&
        PARTS_TAXONOMY.find((e) => e.id === row.partId)?.depthClass === 'surface',
    )
}

/**
 * Reveals every part row, so a test that expands a group sees all of it
 * (fine/mint rows hide behind the global condition filter by default,
 * Sprint 48). Idempotent - safe to call once per group.
 *
 * Sprint 67: clicks the real `Show all` control rather than ticking `mint` and
 * `fine` by hand. It has to: `absent` (a legitimately-absent slot, e.g. forced
 * induction on an NA car) is a real filter category with NO checkbox of its
 * own, and `Show all` is the only way to reveal it.
 */
async function showAllConditions(
  wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'],
): Promise<void> {
  await wrapper.find('[data-test="filter-show-all"]').trigger('click')
}

async function expandGroup(
  wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'],
  componentId: ComponentId,
): Promise<void> {
  await wrapper.find(`[data-test="expand-${componentId}"]`).trigger('click')
  await showAllConditions(wrapper)
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
      // Every group with at least one repairable part below mint offers the
      // group's own click-per-rung "Repair to…" convenience (Sprint 48).
      expect(wrapper.find(`[data-test="stage-repair-${componentId}"]`).exists()).toBe(
        needsRepair(game, id, componentId),
      )
    }
  })

  it('never renders player-visible "staged" copy anywhere on this screen (Sprint 48 decision 4)', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id
    const part = untaggedPartFor('dampers')
    game.devGrantPart(part.id)
    game.removePart(id, 'dampers')

    const { wrapper } = await mountAt(id)
    await expandGroup(wrapper, 'suspension')
    await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
    await wrapper.find('.part-card').trigger('click')
    if (needsRepair(game, id, 'body'))
      await wrapper.find('[data-test="stage-repair-body"]').trigger('click')

    expect(wrapper.text().toLowerCase()).not.toContain('staged')
  })

  it('expanding a group reveals its attention-needed rows; the condition filter defaults to hiding fine/mint parts and toggling reveals them (Sprint 48)', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id
    const rows = game.partsInGroup(id, 'suspension')
    const hiddenByDefault = rows.filter((r) => r.band === 'fine' || r.band === 'mint')
    const visibleByDefault = rows.filter((r) => !hiddenByDefault.includes(r))

    const { wrapper } = await mountAt(id)
    expect(wrapper.find('.part-sublist').exists()).toBe(false)

    await wrapper.find('[data-test="expand-suspension"]').trigger('click')
    expect(wrapper.findAll('.sub-part-row')).toHaveLength(visibleByDefault.length)
    // Sprint 84: the parts diagram (above the list) now renders every part's
    // name as a rectangle label, so this must scope to the list itself, not the
    // whole screen - the condition filter governs the LIST, and that is what the
    // assertion is about.
    const list = () => wrapper.get('.components').text()
    for (const row of visibleByDefault) expect(list()).toContain(row.displayName)

    if (hiddenByDefault.length > 0) {
      for (const row of hiddenByDefault) expect(list()).not.toContain(row.displayName)

      await showAllConditions(wrapper)
      expect(wrapper.findAll('.sub-part-row')).toHaveLength(rows.length)
      for (const row of hiddenByDefault) expect(list()).toContain(row.displayName)
    }

    await wrapper.find('[data-test="expand-suspension"]').trigger('click')
    expect(wrapper.find('.part-sublist').exists()).toBe(false)
  })

  it('clicking a parts-diagram part lands on that part row in the list; a tile click only navigates (Sprint 84 amendment)', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id

    const { wrapper } = await mountAt(id)
    // The list row is not shown until the diagram click expands its group.
    expect(wrapper.find('[data-part-row="block"]').exists()).toBe(false)

    // Level 1 -> level 2: a TILE click never touches the list (amendment).
    await wrapper.get('[data-test="diagram-tile-engine"]').trigger('click')
    expect(wrapper.find('[data-part-row="block"]').exists()).toBe(false)

    // A PART click selects the list row, as before.
    await wrapper.get('[data-test="diagram-slot-block"]').trigger('click')
    await flushPromises()

    const row = wrapper.find('[data-part-row="block"]')
    expect(row.exists()).toBe(true)
    expect(row.classes()).toContain('diagram-selected')
  })

  it('staging the group repair click-per-rung, then Confirm, actually creates and labors the job - settling one rung up, not mint', async () => {
    const game = useGameStore()
    // Sprint 36: no ownership gate exists - max the tiers so the bounded
    // continue-repair loop below keeps its old all-equipment pacing.
    for (const line of game.toolLineViews) game.devSetToolTier(line.componentId, 3)
    const id = grantCarNeedingRepair(game, 'body')
    const { wrapper } = await mountAt(id)

    // A dev-granted car lands in parking; move it into the service bay first
    // so the repair job it's about to queue can actually receive labor.
    await wrapper.find('[data-test="toggle-bay"]').trigger('click')
    expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeDefined()
    const step = game.nextRepairStep(id, 'body')!
    await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
    expect(wrapper.text()).toContain('Planned work (1)')
    expect(wrapper.text()).toContain(`Repair Body to ${step.targetBand}`)
    expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-test="confirm-work"]').trigger('click')
    expect(wrapper.text()).toContain('Planned work (0)')
    expect(
      game.carDetail(id)!.groupBands.body === step.targetBand ||
        game.gameState.jobs.some((j) => j.componentId === 'body'),
    ).toBe(true)

    // End Day is a pure day-boundary tick (Sprint 11) - it never auto-feeds
    // labor into an already-open job. A group repair spanning every part in
    // the group (Sprint 26) can easily need more than one day's labor
    // budget, so the player returns each day and clicks "Continue repair"
    // (the componentBusy branch's instant `continueJob` control,
    // data-test="repair-body") to feed that day's labor into the still-open
    // job - a bounded loop over that real flow.
    for (let i = 0; i < 10 && game.carDetail(id)!.groupBands.body !== step.targetBand; i++) {
      // Sprint 51: EndDayButton is App.vue's single global mount point now,
      // not rendered on this screen - advance via the store directly.
      game.endDay()
      await flushPromises()
      if (game.carDetail(id)!.groupBands.body === step.targetBand) break
      const continueBtn = wrapper.find('[data-test="repair-body"]')
      if (continueBtn.exists()) {
        await continueBtn.trigger('click')
        await flushPromises()
      }
    }
    expect(game.carDetail(id)!.groupBands.body).toBe(step.targetBand)
  })

  it('clearing a planned group repair costs nothing and creates no job', async () => {
    const game = useGameStore()
    const id = grantCarNeedingRepair(game, 'body')
    const { wrapper } = await mountAt(id)

    await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
    expect(wrapper.text()).toContain('Planned work (1)')
    await wrapper.find('[data-test="unstage-repair-body"]').trigger('click')
    expect(wrapper.text()).toContain('Planned work (0)')
    expect(game.gameState.jobs).toHaveLength(0)
  })

  it('the group Repair button is enabled at tier 1 with nothing upgraded (Sprint 36: the equipment gate is retired)', async () => {
    const game = useGameStore()
    const id = grantCarNeedingRepair(game, 'body')
    const { wrapper } = await mountAt(id)

    const button = wrapper.find('[data-test="stage-repair-body"]')
    expect(button.exists()).toBe(true)
    expect(button.attributes('disabled')).toBeUndefined()
    // Sprint 63: the compact "+" control's own tooltip describes the repair
    // step ("Repair to ...") - it is NOT the retired needs-equipment gate
    // tooltip, which stayed gone.
    expect(button.attributes('title')).toContain('Repair')
    expect(button.attributes('title')).not.toContain('Needs')
  })

  describe('click-per-rung repair (Sprint 48)', () => {
    it('each group click advances the planned target exactly one band, with the real marginal price/labor', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const { wrapper } = await mountAt(id)

      const firstStep = game.nextRepairStep(id, 'body')!
      await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
      expect(game.stagedActionsFor(id)).toEqual([
        { kind: 'repair', componentId: 'body', targetBand: firstStep.targetBand },
      ])

      if (firstStep.targetBand === 'mint') return // already at the ceiling in one click

      const secondStep = game.nextRepairStep(id, 'body')!
      expect(secondStep.targetBand).not.toBe(firstStep.targetBand)
      await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
      expect(game.stagedActionsFor(id)).toEqual([
        { kind: 'repair', componentId: 'body', targetBand: secondStep.targetBand },
      ])
    })

    it('each per-part click advances that part exactly one band', async () => {
      const game = useGameStore()
      // Sprint 71: 'suspension' is entirely bolt-on now (bench-only), so its
      // on-car repair stepper never renders - 'body' stays on-car-repairable.
      const id = grantCarNeedingRepair(game, 'body')
      const row = game
        .partsInGroup(id, 'body')
        .find((r) => r.band !== null && r.band !== 'mint' && r.band !== 'scrap' && r.repairable)!
      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'body')

      const step = game.nextRepairStep(id, 'body', row.partId)!
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')

      expect(game.stagedActionsFor(id)).toEqual([
        {
          kind: 'repair',
          componentId: 'body',
          targetBand: step.targetBand,
          carPartId: row.partId,
        },
      ])
    })
  })

  describe('the condition filter is total (Sprint 67 decision 2, items 18 + 10)', () => {
    it('never shows an NA car\'s empty forced-induction slot under "Missing"', async () => {
      // Item 10, and the half of item 18 that made it unfilterable: the slot
      // used to return a `null` category, which slipped past the filter
      // entirely and rendered no matter what was ticked - including a
      // Missing-only view, where an NA car's FI slot is not a defect at all.
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id) // honda-city-e-aa is naturally aspirated
      const id = game.gameState.ownedCars[0]!.id
      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-engine"]').trigger('click')

      // Default view (worn/poor/scrap/missing) - the FI slot is not in it.
      expect(wrapper.text()).not.toContain('no turbo (NA)')

      // Even with Missing explicitly the ONLY category ticked.
      await wrapper.find('[data-test="filter-hide-all"]').trigger('click')
      await wrapper.find('[data-test="filter-missing"]').trigger('change')
      expect(wrapper.text()).not.toContain('no turbo (NA)')
    })

    it('Show all reveals the absent slot; Hide all empties every group', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="expand-engine"]').trigger('click')

      // `absent` has no checkbox of its own - Show all is the only way in.
      await wrapper.find('[data-test="filter-show-all"]').trigger('click')
      expect(wrapper.text()).toContain('no turbo (NA)')

      await wrapper.find('[data-test="filter-hide-all"]').trigger('click')
      expect(wrapper.text()).not.toContain('no turbo (NA)')
      expect(wrapper.findAll('.sub-part-row')).toHaveLength(0)
    })
  })

  describe('panel controls (Sprint 67 decisions 3 + 4, items 9 + 16)', () => {
    it('Expand all opens every group and Collapse all closes them', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const { wrapper } = await mountAt(id)

      expect(wrapper.findAll('.sub-part-row').length).toBe(0)
      await wrapper.find('[data-test="expand-all"]').trigger('click')
      await wrapper.find('[data-test="filter-show-all"]').trigger('click')
      expect(wrapper.findAll('.sub-part-row').length).toBeGreaterThan(20) // all 6 groups

      await wrapper.find('[data-test="collapse-all"]').trigger('click')
      expect(wrapper.findAll('.sub-part-row').length).toBe(0)
    })

    it('renders component groups in one constant order, whatever their condition (item 16)', async () => {
      // Sprint 41 decision 4 sorted worst-band-first, so the panel reshuffled
      // itself as you repaired it. Retired: order is now positional, forever.
      const EXPECTED = ['engine', 'drivetrain', 'suspension', 'wheels', 'body', 'interior']
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const car = game.gameState.ownedCars[0]!
      // Wreck the LAST group in declared order - under the old sort this
      // would have jumped it to the top.
      for (const partId of ['seats', 'dashGauges'] as const) {
        const installed = car.parts[partId].installed
        if (installed) car.parts[partId] = { installed: { ...installed, band: 'scrap' } }
      }

      const { wrapper } = await mountAt(id)
      const order = wrapper.findAll('.component-row').map((row) => {
        const el = row.find('[data-test^="expand-"]')
        return el.attributes('data-test')!.replace('expand-', '')
      })
      expect(order).toEqual(EXPECTED)
    })
  })

  describe('the reworked repair row and honest Confirm (Sprint 63)', () => {
    it('no repair control is a sentence-button - the group step is a compact "+" and its increment lives in the tooltip (Sprint 63; Sprint 67 decision 1)', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const { wrapper } = await mountAt(id)

      const button = wrapper.find('[data-test="stage-repair-body"]')
      // The button's own visible text is just the "+" glyph, never a sentence.
      expect(button.text()).toBe('+')
      expect(button.text()).not.toContain('Repair to')

      // Sprint 67 decision 1: with nothing planned there is no caption at all.
      // The increment - what ONE more click costs - lives only in the tooltip,
      // so it can never be mistaken for what Confirm will charge.
      expect(wrapper.find('[data-test="planned-cost-body"]').exists()).toBe(false)
      expect(button.attributes('title')).toContain('labour')
      expect(button.attributes('title')).not.toContain('labor ')
    })

    it("the row's caption is the ROW's planned total, not the next rung's increment (Sprint 67 decision 1, item 7)", async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const { wrapper } = await mountAt(id)

      // Two clicks = a two-rung plan. The caption must report BOTH rungs (what
      // Confirm charges), not just the next one - the exact bug item 7 hit.
      await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
      const afterOne = wrapper.find('[data-test="planned-cost-body"]').text()
      expect(afterOne).toContain('labour')

      const second = wrapper.find('[data-test="stage-repair-body"]')
      if (second.exists()) {
        await second.trigger('click')
        const afterTwo = wrapper.find('[data-test="planned-cost-body"]').text()
        expect(afterTwo).not.toBe(afterOne) // the total grew with the plan
      }

      // And it equals what the store says Confirm will charge for that row.
      const step = game.plannedStepFor(id, 'body')!
      expect(wrapper.find('[data-test="planned-cost-body"]').text()).toContain(
        String(step.laborSlots),
      )
    })

    it('shows a current -> planned band preview once a repair is staged, cleared by the x', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const { wrapper } = await mountAt(id)

      expect(wrapper.find('[data-test="plan-preview-body"]').exists()).toBe(false)
      await wrapper.find('[data-test="stage-repair-body"]').trigger('click')

      const preview = wrapper.find('[data-test="plan-preview-body"]')
      expect(preview.exists()).toBe(true)
      // Two band chips (current and planned) with an arrow between them.
      expect(preview.findAll('.band-chip').length).toBe(2)

      await wrapper.find('[data-test="unstage-repair-body"]').trigger('click')
      expect(wrapper.find('[data-test="plan-preview-body"]').exists()).toBe(false)
    })

    it('Confirm shows the PLANNED labour and cost, and it grows as more work is planned', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const { wrapper } = await mountAt(id)

      await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
      const afterOne = game.carDetail(id)!.plannedEstimate!.plannedLaborSlots
      expect(afterOne).toBeGreaterThan(0)
      expect(wrapper.find('[data-test="confirm-cost"]').text()).toContain(`${afterOne} labour`)

      // Plan more work (another group that needs it) - the Confirm figure grows.
      const other = (['engine', 'drivetrain', 'suspension', 'interior'] as const).find((g) =>
        needsRepair(game, id, g),
      )
      if (other) {
        await wrapper.find(`[data-test="stage-repair-${other}"]`).trigger('click')
        const afterTwo = game.carDetail(id)!.plannedEstimate!.plannedLaborSlots
        expect(afterTwo).toBeGreaterThan(afterOne)
        expect(wrapper.find('[data-test="confirm-cost"]').text()).toContain(`${afterTwo} labour`)
      }
    })

    it('the remaining-today figure is a caption that warns (never blocks) when the plan overruns today', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      // Spend every labour slot so nothing is left today.
      game.gameState = { ...game.gameState, laborSlotsSpentToday: game.laborSlotsPerDay }
      expect(game.laborSlotsRemainingToday).toBe(0)

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="stage-repair-body"]').trigger('click')

      const caption = wrapper.find('[data-test="confirm-labour-caption"]')
      expect(caption.exists()).toBe(true)
      expect(caption.classes()).toContain('warn')
      expect(caption.text()).toContain('carries to tomorrow')
      // A warning, not a block: Confirm stays enabled.
      expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeUndefined()
    })
  })

  it('redirects to the garage when the car id is not owned', async () => {
    const { router } = await mountAt('ghost-car')
    expect(router.currentRoute.value.name).toBe('garage')
  })

  describe('Sprint 42: the flip ledger financial panel', () => {
    /** Wins a lot at auction via a guaranteed buyout (not a dev grant) so
     * the resulting car carries a real, known ledger entry - a dev grant
     * bypasses every sim resolver this sprint wired, so it would always
     * read "unknown purchase" and defeat the point of this test. */
    function buyoutACar(game: ReturnType<typeof useGameStore>): string {
      for (let i = 0; i < 20 && game.gameState.activeAuctionLots.length === 0; i++) game.endDay()
      const lot = game.gameState.activeAuctionLots.find((l) => l.tier === 'local-yard')
      if (!lot) throw new Error('expected a local-yard lot after the first catalog')
      // Sprint 81's 25-model pool can put a lot at the local yard whose buyout
      // price exceeds starting cash; affordability is not what this test
      // exercises, so grant the buyout price outright (the Sprint 59 pattern).
      game.devGiveCash(game.lotDetail(lot.id)!.buyoutPriceYen)
      expect(game.buyout(lot.id)).toBe(true)
      return game.gameState.ownedCars.at(-1)!.id
    }

    it('shows purchase, repairs, parts, total spent, guide value, restoration bill, and a projected profit right after a buyout', async () => {
      const game = useGameStore()
      const id = buyoutACar(game)
      const detail = game.carDetail(id)!
      expect(detail.ledger.purchaseYen).not.toBeNull()

      const { wrapper } = await mountAt(id)
      const panel = wrapper.find('[data-test="finance-panel"]')
      expect(panel.exists()).toBe(true)
      expect(panel.find('[data-test="finance-purchase"]').text()).toBe(
        formatYen(detail.ledger.purchaseYen!),
      )
      expect(panel.find('[data-test="finance-repairs"]').text()).toBe(formatYen(0))
      expect(panel.find('[data-test="finance-parts"]').text()).toBe(formatYen(0))
      expect(panel.find('[data-test="finance-total-spent"]').text()).toBe(
        formatYen(detail.ledger.purchaseYen!),
      )
      expect(panel.find('[data-test="finance-guide-value"]').text()).toBe(
        formatYen(detail.guideValueYen),
      )
      expect(panel.find('[data-test="finance-bill-remaining"]').text()).toBe(
        formatYen(detail.totalBillYen),
      )
      const expectedProfit = detail.guideValueYen - detail.ledger.purchaseYen!
      expect(panel.find('[data-test="finance-profit"]').text()).toBe(formatYenDelta(expectedProfit))
    })

    it('shows "-" for purchase on a dev-granted (unknown-purchase) car, with repairs/parts/total still numeric', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const { wrapper } = await mountAt(id)
      const panel = wrapper.find('[data-test="finance-panel"]')
      expect(panel.find('[data-test="finance-purchase"]').text()).toBe('-')
      expect(panel.find('[data-test="finance-total-spent"]').text()).toBe(formatYen(0))
    })

    it('repairing the car updates repairs and total spent immediately, moving projected profit', async () => {
      const game = useGameStore()
      for (const line of game.toolLineViews) game.devSetToolTier(line.componentId, 3)
      // grantCarNeedingRepair (dev grant) has a proven, bounded roll-until
      // loop for "needs repair" - the purchase-price plumbing is already
      // covered by the buyout test above, so a dev-granted (unknown-
      // purchase) car is fine here; this test is about the REPAIR side of
      // the panel updating live.
      const id = grantCarNeedingRepair(game, 'body')

      const before = game.carDetail(id)!
      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="toggle-bay"]').trigger('click')
      await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
      await wrapper.find('[data-test="confirm-work"]').trigger('click')
      await flushPromises()

      const after = game.carDetail(id)!
      expect(after.ledger.repairYen).toBeGreaterThan(before.ledger.repairYen)
      const panel = wrapper.find('[data-test="finance-panel"]')
      expect(panel.find('[data-test="finance-repairs"]').text()).toBe(
        formatYen(after.ledger.repairYen),
      )
      expect(panel.find('[data-test="finance-total-spent"]').text()).toBe(
        formatYen((after.ledger.purchaseYen ?? 0) + after.ledger.repairYen + after.ledger.partsYen),
      )
    })

    it('is not shown for a customer service-job car (never owned, never ledgered)', async () => {
      const game = useGameStore()
      game.newGame(1)
      const offer = game.gameState.serviceJobOffers[0]
      if (!offer) throw new Error('expected a service job offer on day 1')
      expect(game.acceptServiceJob(offer.id)).toBe(true)
      game.endDay() // the customer's car arrives the following morning
      const carId = offer.car.id
      expect(game.carDetail(carId)!.serviceJob).toBeDefined()

      const { wrapper } = await mountAt(carId)
      expect(wrapper.find('[data-test="finance-panel"]').exists()).toBe(false)
    })

    it('names the failing foundation and shows the withheld premium when a foundational part is bad (Sprint 60, law 5)', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id) // honda-city-e-aa (shitbox)
      const id = game.gameState.ownedCars[0]!.id
      const car = game.gameState.ownedCars.find((c) => c.id === id)!
      // Fit a real aftermarket part (a premium to withhold) on a NON-foundation
      // slot, and leave a foundational part (brakes) scrap.
      car.parts.internals = {
        installed: {
          id: 'pi-premium',
          partId: 'shitbox-oni-race-piston-kit',
          band: 'mint',
          genuinePeriod: false,
          origin: { kind: 'market', day: 1 },
        },
      }
      car.parts.brakePadsDiscs = {
        installed: { ...car.parts.brakePadsDiscs.installed!, band: 'scrap' },
      }

      const warning = game.carDetail(id)!.foundationWarning
      expect(warning).not.toBeNull()
      expect(warning!.withheldYen).toBeGreaterThan(0)

      const { wrapper } = await mountAt(id)
      const el = wrapper.find('[data-test="foundation-warning"]')
      expect(el.exists()).toBe(true)
      // Names the failing foundation part (brakes) in plain copy.
      expect(el.text().toLowerCase()).toContain('brake')
    })

    it('tells the player when work on this car stops paying for itself (Sprint 66, law 1 legibility clause)', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id) // honda-city-e-aa (shitbox: expects `worn`, 0.4 beyond)
      const id = game.gameState.ownedCars[0]!.id
      const car = game.gameState.ownedCars.find((c) => c.id === id)!
      // Sound and roadworthy, but not perfect - so there IS a bill above the
      // shitbox expectation band, and it is the losing kind of work.
      for (const partId of ALL_CAR_PART_IDS) {
        const installed = car.parts[partId].installed
        if (installed) car.parts[partId] = { installed: { ...installed, band: 'worn' } }
      }

      const notice = game.carDetail(id)!.passionSpendNotice
      expect(notice).not.toBeNull()
      expect(notice!.band).toBe('worn')
      expect(notice!.returnRate).toBeLessThan(1)

      const { wrapper } = await mountAt(id)
      const el = wrapper.find('[data-test="passion-notice"]')
      expect(el.exists()).toBe(true)
      // Says it in the player's terms, not the schema's.
      expect(el.text().toLowerCase()).toContain('because you want to')
      expect(el.text().toLowerCase()).not.toContain('expectation band')
      expect(el.text().toLowerCase()).not.toContain('discount')
    })

    it('stays silent on a car where work above the band still pays (Sprint 66)', async () => {
      // The uncommon tier's `beyondDiscount` is 1.2 - above 1, so chasing mint
      // is a SMALLER profit, never a loss. Warning here would be a lie.
      const game = useGameStore()
      const uncommon = CARS.find((c) => c.tier === 'uncommon')!
      game.devGrantCar(uncommon.id)
      const id = game.gameState.ownedCars[0]!.id
      const car = game.gameState.ownedCars.find((c) => c.id === id)!
      for (const partId of ALL_CAR_PART_IDS) {
        const installed = car.parts[partId].installed
        if (installed) car.parts[partId] = { installed: { ...installed, band: 'worn' } }
      }

      expect(game.carDetail(id)!.passionSpendNotice).toBeNull()
      const { wrapper } = await mountAt(id)
      expect(wrapper.find('[data-test="passion-notice"]').exists()).toBe(false)
    })

    it('shows no foundation warning when the foundations are sound (Sprint 60)', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const car = game.gameState.ownedCars.find((c) => c.id === id)!
      // A real premium, but every foundational part sound (mint) - nothing to
      // withhold, so no warning.
      car.parts.internals = {
        installed: {
          id: 'pi-premium',
          partId: 'shitbox-oni-race-piston-kit',
          band: 'mint',
          genuinePeriod: false,
          origin: { kind: 'market', day: 1 },
        },
      }
      for (const partId of [
        'brakePadsDiscs',
        'brakeCalipersLines',
        'tyres',
        'steering',
        'chassis',
        'underbody',
      ] as const) {
        const installed = car.parts[partId].installed
        if (installed) car.parts[partId] = { installed: { ...installed, band: 'mint' } }
      }
      expect(game.carDetail(id)!.foundationWarning).toBeNull()

      const { wrapper } = await mountAt(id)
      expect(wrapper.find('[data-test="foundation-warning"]').exists()).toBe(false)
    })
  })

  describe('the service banner no longer offers completion (Sprint 57 decision 1)', () => {
    it('shows the work status but not the Complete/Give Up button - that moved to the jobs screen', async () => {
      const game = useGameStore()
      game.newGame(1)
      const offer = game.gameState.serviceJobOffers[0]
      if (!offer) throw new Error('expected a service job offer on day 1')
      expect(game.acceptServiceJob(offer.id)).toBe(true)
      game.endDay() // the customer's car arrives the following morning
      const carId = offer.car.id

      const { wrapper } = await mountAt(carId)
      expect(wrapper.find('[data-test="complete-service-job"]').exists()).toBe(false)
      const hasStatusLine =
        wrapper.text().includes('Work done') || wrapper.text().includes('Work unfinished')
      expect(hasStatusLine).toBe(true)
    })
  })

  describe('per-part drill-down (Sprint 28)', () => {
    it('a group with two non-mint parts lets both be repaired independently, without one displacing the other', async () => {
      const game = useGameStore()
      // Sprint 71: 'suspension' is entirely bolt-on now (bench-only) - 'body'
      // (chassis/paint/underbody/panels/aero) stays on-car-repairable and
      // has enough real parts to roll two non-mint ones.
      const id = grantCarNeedingRepair(game, 'body')
      const rows = game
        .partsInGroup(id, 'body')
        .filter((r) => r.band !== null && r.band !== 'mint' && r.band !== 'scrap')
      if (rows.length < 2) return // this particular roll only had one part to work with

      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'body')
      const step0 = game.nextRepairStep(id, 'body', rows[0]!.partId)!
      const step1 = game.nextRepairStep(id, 'body', rows[1]!.partId)!
      await wrapper.find(`[data-test="stage-repair-part-${rows[0]!.partId}"]`).trigger('click')
      await wrapper.find(`[data-test="stage-repair-part-${rows[1]!.partId}"]`).trigger('click')

      expect(wrapper.text()).toContain('Planned work (2)')
      expect(game.stagedActionsFor(id)).toEqual(
        expect.arrayContaining([
          {
            kind: 'repair',
            componentId: 'body',
            targetBand: step0.targetBand,
            carPartId: rows[0]!.partId,
          },
          {
            kind: 'repair',
            componentId: 'body',
            targetBand: step1.targetBand,
            carPartId: rows[1]!.partId,
          },
        ]),
      )
    })

    it('staging the group convenience displaces an existing per-part stage in the same group', async () => {
      const game = useGameStore()
      // Sprint 71: 'suspension' is entirely bolt-on now (bench-only) - 'body'
      // stays on-car-repairable.
      const id = grantCarNeedingRepair(game, 'body')
      const row = game
        .partsInGroup(id, 'body')
        .find((r) => r.band !== null && r.band !== 'mint' && r.band !== 'scrap' && r.repairable)!

      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'body')
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')
      expect(wrapper.text()).toContain('Planned work (1)')

      const groupStep = game.nextRepairStep(id, 'body')!
      await wrapper.find('[data-test="stage-repair-body"]').trigger('click')
      expect(wrapper.text()).toContain('Planned work (1)')
      expect(game.stagedActionsFor(id)).toEqual([
        { kind: 'repair', componentId: 'body', targetBand: groupStep.targetBand },
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
                  origin: { kind: 'market', day: 1 },
                },
              },
            },
          },
        ],
      }

      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'suspension')
      expect(wrapper.find('[data-test="stage-repair-part-dampers"]').exists()).toBe(false)
      // Occupied (even by scrap) - Replace is unavailable until it's removed.
      expect(wrapper.find('[data-test="replace-part-dampers"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="remove-part-dampers"]').exists()).toBe(true)
    })

    it('an empty forced-induction slot on an NA car shows "no turbo (NA)" and, once engine tooling is upgraded, fitting a turbo kit installs it', async () => {
      // honda-city-e-aa is NA: forcedInduction generates genuinely empty, band irrelevant.
      // Sprint 37: converting a factory-NA car to forced induction is gated
      // behind engine tier 3 (the bolt-on vs built line) - grant it here to
      // exercise the ALLOWED path; the default-tier-1 BLOCKED path is its
      // own test below.
      const game = useGameStore()
      game.devSetToolTier('engine', 3)
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      // Sprint 71: forcedInduction is blockedBy 'intake' (the symmetric
      // blocker rule) - the default-filled stock intake must come off first,
      // or Confirm refuses the fit even though staging it looks fine.
      game.removePart(id, 'intake')
      // CARS[0] (honda-city-e-aa) is 'shitbox' tier.
      const turboKit = PARTS.find(
        (p) =>
          p.carPartId === 'forcedInduction' && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
      )!
      game.devGrantPart(turboKit.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'engine')
      expect(wrapper.find('[data-test="stage-repair-part-forcedInduction"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('no turbo (NA)')

      await wrapper.find('[data-test="replace-part-forcedInduction"]').trigger('click')
      await wrapper.find('.part-card').trigger('click')
      expect(wrapper.text()).toContain('planned:')

      await wrapper.find('[data-test="toggle-bay"]').trigger('click')
      await wrapper.find('[data-test="confirm-work"]').trigger('click')
      expect(game.gameState.ownedCars[0]!.parts.forcedInduction.installed?.id).toBe(partInstanceId)
    })

    it('a fresh (engine tier 1) shop cannot convert an NA car to forced induction: the turbo kit is dimmed with "Needs Machine-shop tooling" and cannot be selected', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      // CARS[0] (honda-city-e-aa) is 'shitbox' tier.
      const turboKit = PARTS.find(
        (p) =>
          p.carPartId === 'forcedInduction' && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
      )!
      game.devGrantPart(turboKit.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'engine')
      await wrapper.find('[data-test="replace-part-forcedInduction"]').trigger('click')

      expect(wrapper.text()).toContain('Needs Machine-shop tooling')
      await wrapper.find('.part-card').trigger('click')
      expect(wrapper.text()).not.toContain('planned:')
      expect(game.gameState.ownedCars[0]!.parts.forcedInduction.installed?.id).not.toBe(
        partInstanceId,
      )
    })

    it('removing an installed part opens the slot back up for Replace, dropping it to inventory', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const car = game.gameState.ownedCars[0]!
      const originalStockPartId = car.parts.dampers.installed?.partId
      expect(originalStockPartId).toBeDefined() // every slot starts stock-filled

      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'suspension')
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
      await expandGroup(wrapper, 'suspension')
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
      await expandGroup(wrapper, 'suspension')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      await wrapper.find('.part-card').trigger('click')

      expect(wrapper.text()).toContain('planned:')
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
      await expandGroup(wrapper, 'suspension')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      await dragPast(wrapper, `[data-test^="pick-part-"]`)
      await dropOn(wrapper, '[data-test="replace-part-dampers"]')

      expect(wrapper.text()).toContain('planned:')
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
          {
            id: 'scrap-instance',
            partId: goodPart.id,
            band: 'scrap',
            genuinePeriod: false,
            origin: { kind: 'market', day: 1 },
          },
        ],
      }

      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'suspension')
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
      await expandGroup(wrapper, 'suspension')
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
      await expandGroup(wrapper, 'suspension')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      await wrapper.find(`[data-test="pick-part-${partInstanceId}"]`).trigger('click')
      // Picking doesn't close the drawer, and the drawer's own row still
      // renders - clicking it again (the accessibility-fallback completion
      // path) stages the install.
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')

      expect(wrapper.text()).toContain('planned:')
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
      await expandGroup(wrapper, 'engine')
      await wrapper.find('[data-test="replace-part-forcedInduction"]').trigger('click')
      await wrapper.find(`[data-test="pick-part-${partInstanceId}"]`).trigger('click')

      // Close the FI drawer, then click a different, not-yet-open row
      // (dampers, in a different group) while the pick is still live - before
      // the fix this was a silent no-op (early return); now it opens
      // dampers' own drawer.
      await wrapper.find('[data-test="close-drawer"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
      await expandGroup(wrapper, 'suspension')
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
      await expandGroup(wrapper, 'suspension')
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

  describe('the symptom panel and full workup (Sprint 74 decisions 3/5/8)', () => {
    /** Overwrites the car with a real, content-backed symptomatic fixture -
     * `smokes-on-startup`, matching the exact fixture the auction screen's
     * own Sprint 73/74 symptom tests already use. `valve-seals` (the true
     * cause) and `head-gasket` both target `headValvetrain`; `tired-rings`
     * targets `internals`. */
    function injectSymptom(game: ReturnType<typeof useGameStore>, carId: string) {
      const car = game.gameState.ownedCars.find((c) => c.id === carId)!
      const withSymptom = {
        ...car,
        parts: {
          ...car.parts,
          headValvetrain: {
            installed: { ...car.parts.headValvetrain.installed!, band: 'worn' as const },
          },
        },
        symptoms: [
          {
            symptomId: 'smokes-on-startup',
            trueCauseId: 'valve-seals',
            remainingCauseIds: ['valve-seals', 'tired-rings', 'head-gasket'],
            runTestIds: [],
          },
        ],
        apparentBandByPartId: { headValvetrain: 'mint' as const },
      }
      game.gameState = {
        ...game.gameState,
        ownedCars: game.gameState.ownedCars.map((c) => (c.id === carId ? withSymptom : c)),
      }
    }

    it('renders the symptom checklist and a Full workup button on a symptomatic owned car', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      injectSymptom(game, id)

      const { wrapper } = await mountAt(id)
      const panel = wrapper.find('[data-test="car-symptoms"]')
      expect(panel.exists()).toBe(true)
      expect(panel.text()).toContain('Smokes on startup.')
      expect(panel.text()).toContain('Valve seals')
      expect(wrapper.find('[data-test="car-workup"]').exists()).toBe(true)
    })

    it('honest owned cars never render the symptom panel', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id

      const { wrapper } = await mountAt(id)
      expect(wrapper.find('[data-test="car-symptoms"]').exists()).toBe(false)
    })

    it('shows the "?" uncertainty chip on a still-open symptomatic part row, which disappears once Full workup resolves it', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      injectSymptom(game, id)

      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'engine')
      expect(wrapper.find('[data-test="uncertain-headValvetrain"]').exists()).toBe(true)

      await wrapper.find('[data-test="car-workup"]').trigger('click')

      const updatedCar = game.gameState.ownedCars.find((c) => c.id === id)!
      expect(updatedCar.symptoms[0]!.remainingCauseIds).toEqual(['valve-seals'])
      expect(wrapper.find('[data-test="uncertain-headValvetrain"]').exists()).toBe(false)
    })

    it('the on-car "+" button never renders for an uncertain BURIED part (Sprint 71\'s bench-only rule already excludes it from on-car repair, symptom or not)', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      injectSymptom(game, id)

      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'engine')
      expect(wrapper.find('[data-test="stage-repair-part-headValvetrain"]').exists()).toBe(false)
    })

    /**
     * Every Sprint 73 symptom cause targets a bolt-on or buried part (the
     * mechanical groups), so decision 5's repair-cost-preview RANGE
     * (`nextPartStepRange`) never actually fires against real content - no
     * shipped symptom ever produces an uncertain SURFACE part with a live
     * on-car repair step to preview (see the Sprint 74 Exit's disclosed
     * items). This only proves the function's main gate: it stays null,
     * exactly like `displayedBandFor`, once nothing targets the part.
     */
    it('nextPartStepRange returns null for a part nothing targets (the ordinary, reachable case)', () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      expect(game.nextPartStepRange(id, 'body', 'panels')).toBeNull()
    })

    it('Full workup is disabled with a reason once no labour slot remains today', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      injectSymptom(game, id)
      game.gameState = { ...game.gameState, laborSlotsSpentToday: game.laborSlotsPerDay }

      const { wrapper } = await mountAt(id)
      const button = wrapper.find('[data-test="car-workup"]')
      expect((button.element as HTMLButtonElement).disabled).toBe(true)
      expect(button.attributes('title')).toContain('No labour slots left today')
    })
  })
})
