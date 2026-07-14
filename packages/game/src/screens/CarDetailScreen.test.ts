import { CARS, PARTS, type CarPartId, type ComponentId } from '@midnight-garage/content'
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
 * fine -> mint is a valid one-rung climb same as any other). */
function needsRepair(
  game: ReturnType<typeof useGameStore>,
  carId: string,
  componentId: ComponentId,
): boolean {
  return game
    .partsInGroup(carId, componentId)
    .some(
      (row) => row.band !== null && row.band !== 'mint' && row.band !== 'scrap' && row.repairable,
    )
}

/**
 * Sprint 48: fine/mint part rows collapse behind the global condition filter
 * by default - reveals them too (idempotent - safe to call once per group in
 * a test that expands more than one), so every real part row is visible,
 * matching every pre-Sprint-48 test's assumption that one expand click
 * reveals the whole group. The default-hidden behavior itself gets its own
 * dedicated test below.
 */
async function showAllConditions(
  wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'],
): Promise<void> {
  for (const option of ['mint', 'fine']) {
    const checkbox = wrapper.find<HTMLInputElement>(`[data-test="filter-${option}"]`)
    if (checkbox.exists() && !checkbox.element.checked) await checkbox.trigger('change')
  }
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
    for (const row of visibleByDefault) expect(wrapper.text()).toContain(row.displayName)

    if (hiddenByDefault.length > 0) {
      for (const row of hiddenByDefault) expect(wrapper.text()).not.toContain(row.displayName)

      await showAllConditions(wrapper)
      expect(wrapper.findAll('.sub-part-row')).toHaveLength(rows.length)
      for (const row of hiddenByDefault) expect(wrapper.text()).toContain(row.displayName)
    }

    await wrapper.find('[data-test="expand-suspension"]').trigger('click')
    expect(wrapper.find('.part-sublist').exists()).toBe(false)
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
    // The old needs-equipment tooltip is gone with the gate itself.
    expect(button.attributes('title')).toBeUndefined()
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
      const id = grantCarNeedingRepair(game, 'suspension')
      const row = game
        .partsInGroup(id, 'suspension')
        .find((r) => r.band !== null && r.band !== 'mint' && r.band !== 'scrap' && r.repairable)!
      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'suspension')

      const step = game.nextRepairStep(id, 'suspension', row.partId)!
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')

      expect(game.stagedActionsFor(id)).toEqual([
        {
          kind: 'repair',
          componentId: 'suspension',
          targetBand: step.targetBand,
          carPartId: row.partId,
        },
      ])
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
      const id = grantCarNeedingRepair(game, 'suspension')
      const rows = game
        .partsInGroup(id, 'suspension')
        .filter((r) => r.band !== null && r.band !== 'mint' && r.band !== 'scrap')
      if (rows.length < 2) return // this particular roll only had one part to work with

      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'suspension')
      const step0 = game.nextRepairStep(id, 'suspension', rows[0]!.partId)!
      const step1 = game.nextRepairStep(id, 'suspension', rows[1]!.partId)!
      await wrapper.find(`[data-test="stage-repair-part-${rows[0]!.partId}"]`).trigger('click')
      await wrapper.find(`[data-test="stage-repair-part-${rows[1]!.partId}"]`).trigger('click')

      expect(wrapper.text()).toContain('Planned work (2)')
      expect(game.stagedActionsFor(id)).toEqual(
        expect.arrayContaining([
          {
            kind: 'repair',
            componentId: 'suspension',
            targetBand: step0.targetBand,
            carPartId: rows[0]!.partId,
          },
          {
            kind: 'repair',
            componentId: 'suspension',
            targetBand: step1.targetBand,
            carPartId: rows[1]!.partId,
          },
        ]),
      )
    })

    it('staging the group convenience displaces an existing per-part stage in the same group', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'suspension')
      const row = game
        .partsInGroup(id, 'suspension')
        .find((r) => r.band !== null && r.band !== 'mint' && r.band !== 'scrap' && r.repairable)!

      const { wrapper } = await mountAt(id)
      await expandGroup(wrapper, 'suspension')
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')
      expect(wrapper.text()).toContain('Planned work (1)')

      const groupStep = game.nextRepairStep(id, 'suspension')!
      await wrapper.find('[data-test="stage-repair-suspension"]').trigger('click')
      expect(wrapper.text()).toContain('Planned work (1)')
      expect(game.stagedActionsFor(id)).toEqual([
        { kind: 'repair', componentId: 'suspension', targetBand: groupStep.targetBand },
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
          { id: 'scrap-instance', partId: goodPart.id, band: 'scrap', genuinePeriod: false },
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
})
