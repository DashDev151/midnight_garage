import {
  ALL_CAR_PART_IDS,
  CARS,
  ECONOMY,
  PARTS,
  PARTS_TAXONOMY,
  TOOL_LINES,
  type CarPartId,
  type ComponentId,
} from '@midnight-garage/content'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { clearDragSession } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import { formatYen, formatYenDelta } from '../utils/formatYen'
import CarDetailScreen from './CarDetailScreen.vue'

/**
 * Sprint 88 (the diagram is the page): the Components list, its drill-down and
 * its condition filter are gone - the diagram plus the docked info/action panel
 * is the single repair surface. Every test that drove the old list was
 * re-targeted here under directive 17 case (a) (the surface was intentionally
 * replaced), preserving the behavioural assertions: repair staging, the replace
 * flow, remove gating, and the confirm totals.
 */

// A minimal router so useRoute/useRouter resolve; garage/parts are stub
// targets (ReplaceDrawer's "visit the parts market" link needs 'parts' to
// exist). Render-function stubs, not templates - a host-rendered stub
// below actually renders them and this environment has no runtime compiler.
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'garage', component: { render: () => h('div') } },
      { path: '/parts', name: 'parts', component: { render: () => h('div') } },
      { path: '/car/:id', name: 'car', component: CarDetailScreen },
    ],
  })
}

/**
 * Every wrapper `mountAt` produces, unmounted in `afterEach` below. Pinia's
 * `getActivePinia()` prefers an injected pinia from the current Vue injection
 * context over the module-level "active" one, so a screen left mounted from a
 * prior test can leak its pinia into the next test's lookups. Explicit
 * teardown, not a Pinia workaround.
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

/**
 * Sprint 88: the one interaction that reaches a part's actions now - open the
 * part's group tile (level 2), then click its diagram block, which docks the
 * info/action panel on that part. Handles already being inside another group's
 * level-2 view by backing out first.
 */
async function selectPart(
  wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'],
  componentId: ComponentId,
  partId: CarPartId,
): Promise<void> {
  const tile = wrapper.find(`[data-test="diagram-tile-${componentId}"]`)
  if (tile.exists()) {
    await tile.trigger('click')
  } else {
    await wrapper.get('[data-test="diagram-back"]').trigger('click')
    await wrapper.get(`[data-test="diagram-tile-${componentId}"]`).trigger('click')
  }
  await wrapper.get(`[data-test="diagram-slot-${partId}"]`).trigger('click')
  await flushPromises()
}

/** Drags an element past the composable's movement threshold. */
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
 * An aftermarket (non-stock) catalog part for this slot, pinned to `shitbox` -
 * every car this file grants (`CARS[0]`/`CARS[1]`) is that tier.
 */
function untaggedPartFor(carPartId: string) {
  return PARTS.find(
    (p) => p.carPartId === carPartId && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
  )!
}

/** The rows in `componentId` an on-car per-part repair step exists for -
 * a repairable SURFACE part below mint (Sprint 71: bolt-on/buried parts are
 * bench-only, so they never grow an on-car repair button). */
function repairableSurfaceRows(
  game: ReturnType<typeof useGameStore>,
  carId: string,
  componentId: ComponentId,
) {
  return game.partsInGroup(carId, componentId).filter(
    (row) =>
      row.band !== null &&
      row.band !== 'mint' &&
      row.band !== 'scrap' &&
      row.repairable &&
      // Sprint 93 (the band ceiling): only a row the on-car "+" can act on
      // right now. At tier 1 a `fine` part has no further rung (mint needs
      // the group's tier-2 machine owned), so its stage button never renders
      // - select it and the tests below click a control that is not there.
      // This gate is tier-aware: at tier 2/3 a below-mint part still steps.
      game.nextRepairStep(carId, componentId, row.partId) !== null &&
      PARTS_TAXONOMY.find((e) => e.id === row.partId)?.depthClass === 'surface',
  )
}

/** Whether `componentId` has anything an on-car repair control would act on. */
function needsRepair(
  game: ReturnType<typeof useGameStore>,
  carId: string,
  componentId: ComponentId,
): boolean {
  return repairableSurfaceRows(game, carId, componentId).length > 0
}

/** Grants cars (bounded) until `componentId`'s group actually needs repair. */
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

/** The first body-group row the panel offers an on-car repair step for. */
function bodyRepairRow(game: ReturnType<typeof useGameStore>, carId: string) {
  return repairableSurfaceRows(game, carId, 'body')[0]!
}

describe('CarDetailScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('renders a granted car: name, radar, the six diagram tiles, and an empty action panel', async () => {
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
      expect(wrapper.find(`[data-test="diagram-tile-${componentId}"]`).exists()).toBe(true)
    }
    // Nothing selected yet - the docked panel shows its empty prompt.
    expect(wrapper.find('[data-test="panel-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="panel-name"]').exists()).toBe(false)
  })

  it('never renders player-visible "staged" copy anywhere on this screen (Sprint 48 decision 4)', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id
    const part = untaggedPartFor('dampers')
    game.devGrantPart(part.id)
    game.removePart(id, 'dampers')

    const { wrapper } = await mountAt(id)
    await selectPart(wrapper, 'suspension', 'dampers')
    await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
    await wrapper.find('.part-card').trigger('click')
    if (needsRepair(game, id, 'body')) {
      const row = bodyRepairRow(game, id)
      await selectPart(wrapper, 'body', row.partId)
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')
    }

    expect(wrapper.text().toLowerCase()).not.toContain('staged')
  })

  /**
   * Sprint 92 (rental made legible): the `machine shop assist +<fee>` caption is
   * previewed exactly where a signature-op fee is charged - the install/replace
   * and on-car per-part repair of a suspension/body/interior signature slot - and
   * never on a removal (removal is free for these groups). Owning the tier-2
   * machine removes the preview, matching the fee dropping to 0.
   */
  it('previews the signature-op assist fee on repair/install of a signature slot at tier 1, never on removal, and hides it once the tier-2 machine is owned', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id) // honda-city-e-aa, a shitbox at tier-1 tools
    const id = game.gameState.ownedCars[0]!.id
    const car = game.gameState.ownedCars.find((c) => c.id === id)!
    // panels: an installed body signature slot below mint (on-car per-part repair
    // charges the body fee, and its removal must charge nothing). dampers: an
    // empty suspension signature slot (installing one charges the suspension fee).
    car.parts.panels = { installed: { ...car.parts.panels.installed!, band: 'poor' } }
    car.parts.dampers = { installed: null }

    const suspensionFee = formatYen(ECONOMY.machineShopAssist.feeYenByGroup.suspension)
    const bodyFee = formatYen(ECONOMY.machineShopAssist.feeYenByGroup.body)

    const { wrapper } = await mountAt(id)

    // Install/replace affordance of a signature slot: caption present at tier 1.
    await selectPart(wrapper, 'suspension', 'dampers')
    const installCap = wrapper.find('[data-test="assist-fee-dampers"]')
    expect(installCap.exists()).toBe(true)
    expect(installCap.text()).toContain(suspensionFee)

    // On-car per-part repair of a signature slot: caption present; the SAME
    // installed slot's removal shows no fee (removal is free for these groups).
    await selectPart(wrapper, 'body', 'panels')
    const repairCap = wrapper.find('[data-test="assist-fee-repair-panels"]')
    expect(repairCap.exists()).toBe(true)
    expect(repairCap.text()).toContain(bodyFee)
    expect(wrapper.find('[data-test="assist-fee-panels"]').exists()).toBe(false)

    // Owning the tier-2 machines drops both previews (the fee is now 0).
    game.devSetToolTier('suspension', 2)
    game.devSetToolTier('body', 2)
    const owned = await mountAt(id)
    await selectPart(owned.wrapper, 'suspension', 'dampers')
    expect(owned.wrapper.find('[data-test="assist-fee-dampers"]').exists()).toBe(false)
    await selectPart(owned.wrapper, 'body', 'panels')
    expect(owned.wrapper.find('[data-test="assist-fee-repair-panels"]').exists()).toBe(false)
  })

  /**
   * Sprint 93 (the band ceiling): the on-car per-part repair affordance shows a
   * caption at tier 1 naming the group's tier-2 machine - the constraint at the
   * point of the action (why the repair finishes at fine, and which machine
   * reaches mint). It is absent once that machine is owned (no cap at tier 2).
   */
  it('shows the tier-1 repair-ceiling caption naming the group tier-2 machine, and drops it once the machine is owned', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id) // honda-city-e-aa, a shitbox at tier-1 tools
    const id = game.gameState.ownedCars[0]!.id
    const car = game.gameState.ownedCars.find((c) => c.id === id)!
    // panels: an installed, repairable body SURFACE slot below mint - the on-car
    // repair "+" (and this ceiling caption) applies.
    car.parts.panels = { installed: { ...car.parts.panels.installed!, band: 'worn' } }
    const bodyMachine = TOOL_LINES.body.tiers[1]!.displayName

    const { wrapper } = await mountAt(id)
    await selectPart(wrapper, 'body', 'panels')
    const cap = wrapper.find('[data-test="repair-ceiling-panels"]')
    expect(cap.exists()).toBe(true)
    expect(cap.text()).toBe(`Your tools finish at fine. The ${bodyMachine} reaches mint.`)

    // Owning the tier-2 machine lifts the ceiling to mint - the caption drops.
    game.devSetToolTier('body', 2)
    const owned = await mountAt(id)
    await selectPart(owned.wrapper, 'body', 'panels')
    expect(owned.wrapper.find('[data-test="repair-ceiling-panels"]').exists()).toBe(false)
  })

  it('a tile click only navigates; a block click docks that part in the action panel (Sprint 88 decision 1)', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id

    const { wrapper } = await mountAt(id)
    // Level 1 -> level 2: the panel stays empty - navigation is not selection.
    await wrapper.get('[data-test="diagram-tile-engine"]').trigger('click')
    expect(wrapper.find('[data-test="panel-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="panel-name"]').exists()).toBe(false)

    // A block click selects the part into the panel.
    await wrapper.get('[data-test="diagram-slot-block"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="panel-empty"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="panel-name"]').text()).toBe(game.carPartLabel('block'))
  })

  it('names what the selected part sits under, straight from the taxonomy (panel blocker line)', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id

    const { wrapper } = await mountAt(id)
    await selectPart(wrapper, 'suspension', 'brakePadsDiscs')
    const line = wrapper.get('[data-test="panel-sits-under"]')
    expect(line.text()).toBe(`Sits under: ${game.carPartLabel('rims')}`)
  })

  it('staging a per-part repair, then Confirm, actually creates and labours the job - settling one rung up, not mint', async () => {
    const game = useGameStore()
    for (const line of game.toolLineViews) game.devSetToolTier(line.componentId, 3)
    const id = grantCarNeedingRepair(game, 'body')
    const row = bodyRepairRow(game, id)
    const { wrapper } = await mountAt(id)

    // A dev-granted car lands in parking; move it into the service bay first.
    await wrapper.find('[data-test="toggle-bay"]').trigger('click')
    expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeDefined()

    const step = game.nextRepairStep(id, 'body', row.partId)!
    await selectPart(wrapper, 'body', row.partId)
    await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')
    expect(wrapper.text()).toContain('Planned work (1)')
    expect(wrapper.text()).toContain(`Repair ${row.displayName} to ${step.targetBand}`)
    expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('[data-test="confirm-work"]').trigger('click')
    expect(wrapper.text()).toContain('Planned work (0)')
    const bandOf = () => game.partsInGroup(id, 'body').find((r) => r.partId === row.partId)!.band
    expect(
      bandOf() === step.targetBand || game.gameState.jobs.some((j) => j.componentId === 'body'),
    ).toBe(true)

    // End Day never auto-feeds labour into an open job - the player returns
    // and clicks Continue (the busy branch of the panel, which stays docked
    // on the selected part) until the job settles at the planned rung.
    for (let i = 0; i < 10 && bandOf() !== step.targetBand; i++) {
      game.endDay()
      await flushPromises()
      if (bandOf() === step.targetBand) break
      const continueBtn = wrapper.find(`[data-test="repair-part-${row.partId}"]`)
      if (continueBtn.exists()) {
        await continueBtn.trigger('click')
        await flushPromises()
      }
    }
    expect(bandOf()).toBe(step.targetBand)
  })

  it('clearing a planned repair costs nothing and creates no job', async () => {
    const game = useGameStore()
    const id = grantCarNeedingRepair(game, 'body')
    const row = bodyRepairRow(game, id)
    const { wrapper } = await mountAt(id)

    await selectPart(wrapper, 'body', row.partId)
    await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')
    expect(wrapper.text()).toContain('Planned work (1)')
    await wrapper.find(`[data-test="unstage-repair-part-${row.partId}"]`).trigger('click')
    expect(wrapper.text()).toContain('Planned work (0)')
    expect(game.gameState.jobs).toHaveLength(0)
  })

  it('the repair button is enabled at tier 1 with nothing upgraded (Sprint 36: the equipment gate stayed retired)', async () => {
    const game = useGameStore()
    const id = grantCarNeedingRepair(game, 'body')
    const row = bodyRepairRow(game, id)
    const { wrapper } = await mountAt(id)
    await selectPart(wrapper, 'body', row.partId)

    const button = wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`)
    expect(button.exists()).toBe(true)
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.text()).toContain('Repair')
    expect(button.attributes('title')).not.toContain('Needs')
  })

  describe('click-per-rung repair (Sprint 48, per-part since Sprint 88)', () => {
    it('each click advances the planned target exactly one band, with the real marginal price', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const row = bodyRepairRow(game, id)
      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'body', row.partId)

      const firstStep = game.nextRepairStep(id, 'body', row.partId)!
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')
      expect(game.stagedActionsFor(id)).toEqual([
        {
          kind: 'repair',
          componentId: 'body',
          targetBand: firstStep.targetBand,
          carPartId: row.partId,
        },
      ])

      if (firstStep.targetBand === 'fine') return // already at the tier-1 ceiling in one click

      const secondStep = game.nextRepairStep(id, 'body', row.partId)!
      expect(secondStep.targetBand).not.toBe(firstStep.targetBand)
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')
      expect(game.stagedActionsFor(id)).toEqual([
        {
          kind: 'repair',
          componentId: 'body',
          targetBand: secondStep.targetBand,
          carPartId: row.partId,
        },
      ])
    })
  })

  describe('labour made loud (Sprint 88 decision 3)', () => {
    it('the repair button carries the full swept format inline - band, yen, and slots, never hover-only', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const row = bodyRepairRow(game, id)
      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'body', row.partId)

      const step = game.nextRepairStep(id, 'body', row.partId)!
      const button = wrapper.get(`[data-test="stage-repair-part-${row.partId}"]`)
      expect(button.text()).toBe(
        `Repair to ${step.targetBand} · ${formatYen(step.costYen)} · ${step.laborSlotsRequired} labour`,
      )
    })

    it("each staged item lists its own yen and slots in the confirm bar, matching the store's own figure and growing with the plan", async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const row = bodyRepairRow(game, id)
      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'body', row.partId)

      const attrSelector = `[data-test="staged-attr-body:${row.partId}"]`
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')
      const afterOne = wrapper.get(attrSelector).text()
      const planned = game.plannedStepFor(id, 'body', row.partId)!
      expect(afterOne).toBe(`${formatYen(planned.costYen)} · ${planned.laborSlots} labour`)

      const second = wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`)
      if (second.exists()) {
        await second.trigger('click')
        const afterTwo = wrapper.get(attrSelector).text()
        expect(afterTwo).not.toBe(afterOne) // the item's own total grew with the plan
        const replanned = game.plannedStepFor(id, 'body', row.partId)!
        expect(afterTwo).toBe(`${formatYen(replanned.costYen)} · ${replanned.laborSlots} labour`)
      }
    })

    it('shows a current -> planned band preview once a repair is staged, cleared by the x', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const row = bodyRepairRow(game, id)
      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'body', row.partId)

      expect(wrapper.find('[data-test="panel-plan-preview"]').exists()).toBe(false)
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')

      const preview = wrapper.find('[data-test="panel-plan-preview"]')
      expect(preview.exists()).toBe(true)
      expect(preview.findAll('.band-chip').length).toBe(2)

      await wrapper.find(`[data-test="unstage-repair-part-${row.partId}"]`).trigger('click')
      expect(wrapper.find('[data-test="panel-plan-preview"]').exists()).toBe(false)
    })

    it('Confirm shows the PLANNED labour and cost, and it grows as more work is planned', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const rows = repairableSurfaceRows(game, id, 'body')
      const { wrapper } = await mountAt(id)

      await selectPart(wrapper, 'body', rows[0]!.partId)
      await wrapper.find(`[data-test="stage-repair-part-${rows[0]!.partId}"]`).trigger('click')
      const afterOne = game.carDetail(id)!.plannedEstimate!.plannedLaborSlots
      expect(afterOne).toBeGreaterThan(0)
      expect(wrapper.find('[data-test="confirm-cost"]').text()).toContain(`${afterOne} labour`)

      // Plan more work - a second repairable surface part, in body or another
      // group, whichever this roll actually produced.
      const secondBody = rows[1]
      const other = (['drivetrain', 'interior'] as const)
        .map((g) => ({ g, rows: repairableSurfaceRows(game, id, g) }))
        .find(({ rows: r }) => r.length > 0)
      if (secondBody) {
        await selectPart(wrapper, 'body', secondBody.partId)
        await wrapper.find(`[data-test="stage-repair-part-${secondBody.partId}"]`).trigger('click')
      } else if (other) {
        await selectPart(wrapper, other.g, other.rows[0]!.partId)
        await wrapper
          .find(`[data-test="stage-repair-part-${other.rows[0]!.partId}"]`)
          .trigger('click')
      }
      if (secondBody || other) {
        const afterTwo = game.carDetail(id)!.plannedEstimate!.plannedLaborSlots
        expect(afterTwo).toBeGreaterThan(afterOne)
        expect(wrapper.find('[data-test="confirm-cost"]').text()).toContain(`${afterTwo} labour`)
      }
    })

    it('the remaining-today figure is a caption that warns (never blocks) when the plan overruns today', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const row = bodyRepairRow(game, id)
      game.gameState = { ...game.gameState, energySpentToday: game.laborSlotsPerDay }
      expect(game.laborSlotsRemainingToday).toBe(0)

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'body', row.partId)
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')

      const caption = wrapper.find('[data-test="confirm-labour-caption"]')
      expect(caption.exists()).toBe(true)
      expect(caption.classes()).toContain('warn')
      expect(caption.text()).toContain('carries to tomorrow')
      expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeUndefined()
    })
  })

  it('redirects to the garage when the car id is not owned', async () => {
    const { router } = await mountAt('ghost-car')
    expect(router.currentRoute.value.name).toBe('garage')
  })

  describe('Sprint 42: the flip ledger financial panel', () => {
    /** Wins a lot at auction via a guaranteed buyout so the resulting car
     * carries a real, known ledger entry. */
    function buyoutACar(game: ReturnType<typeof useGameStore>): string {
      for (let i = 0; i < 20 && game.gameState.activeAuctionLots.length === 0; i++) game.endDay()
      const lot = game.gameState.activeAuctionLots.find((l) => l.tier === 'local-yard')
      if (!lot) throw new Error('expected a local-yard lot after the first catalog')
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
      const id = grantCarNeedingRepair(game, 'body')
      const row = bodyRepairRow(game, id)

      const before = game.carDetail(id)!
      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="toggle-bay"]').trigger('click')
      await selectPart(wrapper, 'body', row.partId)
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')
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
      // Sprint 95 (directive 17 case (a)): the radial-offer gate keeps a fresh
      // tutorial career's board Yuki-only, so the offer is obtained post-skip
      // at the next generation point rather than assumed on day 1.
      game.skipTutorial()
      for (let i = 0; i < 20 && game.gameState.serviceJobOffers.length === 0; i++) game.endDay()
      const offer = game.gameState.serviceJobOffers[0]
      if (!offer) throw new Error('expected an offer once the tutorial gate lifted')
      expect(game.acceptServiceJob(offer.id)).toBe(true)
      game.endDay() // the customer's car arrives the following morning
      const carId = offer.car.id
      expect(game.carDetail(carId)!.serviceJob).toBeDefined()

      const { wrapper } = await mountAt(carId)
      expect(wrapper.find('[data-test="finance-panel"]').exists()).toBe(false)
    })

    it('names the failing foundation and shows the withheld premium when a foundational part is bad (Sprint 60, law 5)', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const car = game.gameState.ownedCars.find((c) => c.id === id)!
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
      expect(el.text().toLowerCase()).toContain('brake')
    })

    it('tells the player when work on this car stops paying for itself (Sprint 66, law 1 legibility clause)', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const car = game.gameState.ownedCars.find((c) => c.id === id)!
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
      expect(el.text().toLowerCase()).toContain('because you want to')
      expect(el.text().toLowerCase()).not.toContain('expectation band')
      expect(el.text().toLowerCase()).not.toContain('discount')
    })

    it('stays silent on a car where work above the band still pays (Sprint 66)', async () => {
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
      // Sprint 95 (directive 17 case (a)): same post-skip offer setup as the
      // finance-panel customer-car test above - day-1 offers are gated now.
      game.skipTutorial()
      for (let i = 0; i < 20 && game.gameState.serviceJobOffers.length === 0; i++) game.endDay()
      const offer = game.gameState.serviceJobOffers[0]
      if (!offer) throw new Error('expected an offer once the tutorial gate lifted')
      expect(game.acceptServiceJob(offer.id)).toBe(true)
      game.endDay()
      const carId = offer.car.id

      const { wrapper } = await mountAt(carId)
      expect(wrapper.find('[data-test="complete-service-job"]').exists()).toBe(false)
      const hasStatusLine =
        wrapper.text().includes('Work done') || wrapper.text().includes('Work unfinished')
      expect(hasStatusLine).toBe(true)
    })
  })

  describe('per-part actions through the panel (Sprint 28 assertions, Sprint 88 surface)', () => {
    it('two non-mint parts can be repaired independently, without one displacing the other', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const rows = repairableSurfaceRows(game, id, 'body')
      if (rows.length < 2) return // this particular roll only had one part to work with

      const { wrapper } = await mountAt(id)
      const step0 = game.nextRepairStep(id, 'body', rows[0]!.partId)!
      const step1 = game.nextRepairStep(id, 'body', rows[1]!.partId)!
      await selectPart(wrapper, 'body', rows[0]!.partId)
      await wrapper.find(`[data-test="stage-repair-part-${rows[0]!.partId}"]`).trigger('click')
      await selectPart(wrapper, 'body', rows[1]!.partId)
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

    it('a scrap part offers Remove only - no Repair control, no Replace while occupied (Sprint 26 decision 5)', async () => {
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
      await selectPart(wrapper, 'suspension', 'dampers')
      expect(wrapper.find('[data-test="stage-repair-part-dampers"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="replace-part-dampers"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="remove-part-dampers"]').exists()).toBe(true)
    })

    it('an empty forced-induction slot on an NA car reads "no turbo (NA)" and, once engine tooling is upgraded, fitting a turbo kit installs it', async () => {
      const game = useGameStore()
      game.devSetToolTier('engine', 3)
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      // Sprint 71: forcedInduction is blockedBy 'intake' - it must come off
      // first, or Confirm refuses the fit even though staging looks fine.
      game.removePart(id, 'intake')
      const turboKit = PARTS.find(
        (p) =>
          p.carPartId === 'forcedInduction' && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
      )!
      game.devGrantPart(turboKit.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'engine', 'forcedInduction')
      expect(wrapper.find('[data-test="stage-repair-part-forcedInduction"]').exists()).toBe(false)
      expect(wrapper.get('[data-test="part-action-panel"]').text()).toContain('no turbo (NA)')

      await wrapper.find('[data-test="replace-part-forcedInduction"]').trigger('click')
      await wrapper.find('.part-card').trigger('click')
      expect(wrapper.text()).toContain('planned:')

      await wrapper.find('[data-test="toggle-bay"]').trigger('click')
      await wrapper.find('[data-test="confirm-work"]').trigger('click')
      expect(game.gameState.ownedCars[0]!.parts.forcedInduction.installed?.id).toBe(partInstanceId)
    })

    it('a fresh (engine tier 1) shop cannot convert an NA car to forced induction: the turbo kit is dimmed with "Needs Machine-shop tooling"', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const turboKit = PARTS.find(
        (p) =>
          p.carPartId === 'forcedInduction' && p.grade !== 'stock' && p.fitmentClass === 'shitbox',
      )!
      game.devGrantPart(turboKit.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'engine', 'forcedInduction')
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
      expect(originalStockPartId).toBeDefined()

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'suspension', 'dampers')
      expect(wrapper.find('[data-test="replace-part-dampers"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="remove-part-dampers"]').exists()).toBe(true)

      await wrapper.find('[data-test="remove-part-dampers"]').trigger('click')
      expect(game.gameState.ownedCars[0]!.parts.dampers.installed).toBeNull()
      expect(game.gameState.partInventory.some((pi) => pi.partId === originalStockPartId)).toBe(
        true,
      )
      // The docked panel updates in place: the slot is a real defect now, and
      // Replace becomes available on it.
      expect(wrapper.find('[data-test="panel-missing"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="replace-part-dampers"]').exists()).toBe(true)
    })
  })

  describe('assemblies through the panel (Sprint 87 verbs, Sprint 88 surface)', () => {
    it('an assembly member offers no per-part actions - the panel says it comes off with the assembly and offers the assembly ops', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'wheels', 'rims')
      expect(wrapper.find('[data-test="panel-assembly-note"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="stage-repair-part-rims"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="remove-part-rims"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="remove-assembly-wheelAssembly"]').exists()).toBe(true)
    })

    it('Remove assembly benches it; a bench block selects into the panel; Refit assembly dissolves the bench', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'wheels', 'rims')
      await wrapper.find('[data-test="remove-assembly-wheelAssembly"]').trigger('click')
      await flushPromises()
      expect(game.gameState.assemblyInventory).toHaveLength(1)

      // The bench strip shows the container's members as blocks.
      expect(wrapper.find('[data-test="bench-panel"]').exists()).toBe(true)
      await wrapper.find('[data-test="bench-member-tyres"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('[data-test="panel-name"]').text()).toBe(game.carPartLabel('tyres'))

      // The same panel offers the refit; the container dissolves back.
      await wrapper.find('[data-test="refit-assembly-wheelAssembly"]').trigger('click')
      await flushPromises()
      expect(game.gameState.assemblyInventory).toHaveLength(0)
      expect(game.gameState.ownedCars[0]!.parts.rims.installed).not.toBeNull()
    })
  })

  describe('the bench dead end (Sprint 96 decision 1)', () => {
    /** Benches the wheel assembly and docks the panel on its tyres member -
     * the exact click path of the measured playtest defect (item 13). */
    async function benchTyres(game: ReturnType<typeof useGameStore>) {
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      // The tutorial scenario exactly: scrap tyres (never reconditionable),
      // so the empty-state's below-serviceable gate is genuinely met.
      const car = game.gameState.ownedCars[0]!
      car.parts.tyres = { installed: { ...car.parts.tyres.installed!, band: 'scrap' } }
      const { wrapper, router } = await mountAt(id)
      await selectPart(wrapper, 'wheels', 'rims')
      await wrapper.find('[data-test="remove-assembly-wheelAssembly"]').trigger('click')
      await flushPromises()
      await wrapper.find('[data-test="bench-member-tyres"]').trigger('click')
      await flushPromises()
      return { id, wrapper, router }
    }

    it('with nothing to recondition and nothing to fit, the panel names the gap and where the shop is, with no dangling fee caption', async () => {
      const game = useGameStore()
      const { wrapper } = await benchTyres(game)

      // Scrap-or-not, tyres are never reconditionable and the inventory holds
      // no replacement - previously this panel offered only Refit assembly.
      // The maintainer scrapped the one-off Shop deep-link button the same
      // day it landed: the panel states the situation, the player navigates
      // the parts market themselves (the walkthrough teaches that trip).
      const empty = wrapper.find('[data-test="bench-empty-tyres"]')
      expect(empty.exists()).toBe(true)
      expect(empty.text()).toContain('No replacement tyres on hand')
      expect(empty.text()).toContain('parts shop')
      expect(wrapper.find('[data-test="bench-shop-tyres"]').exists()).toBe(false)
      // The swap-fee caption prices a Fit button that is not on screen - it
      // must never dangle alone.
      expect(wrapper.find('[data-test="bench-swap-fee-tyres"]').exists()).toBe(false)
    })

    it('with a replacement on hand, the Fit button and its fee caption render and the empty-state does not', async () => {
      const game = useGameStore()
      const tyresPart = PARTS.find((p) => p.carPartId === 'tyres')!
      game.devGrantPart(tyresPart.id)
      const { wrapper } = await benchTyres(game)

      expect(wrapper.find('[data-test^="bench-swap-tyres-"]').exists()).toBe(true)
      // At tier-1 wheels tooling the tyre swap owes the fitting-shop fee, and
      // with a Fit button present the caption is back in its actionable context.
      expect(wrapper.find('[data-test="bench-swap-fee-tyres"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="bench-empty-tyres"]').exists()).toBe(false)
    })

    it('Take it off pulls the mounted member into the bin and the slot reads empty (playtest item 25)', async () => {
      const game = useGameStore()
      const { wrapper } = await benchTyres(game)

      await wrapper.find('[data-test="bench-remove-tyres"]').trigger('click')
      await flushPromises()

      expect(game.gameState.partInventory.some((p) => p.band === 'scrap')).toBe(true)
      expect(game.gameState.assemblyInventory![0]!.members.tyres).toBeNull()
      // Nothing mounted any more: no second Take it off, and the empty-state
      // guidance stays until stock arrives.
      expect(wrapper.find('[data-test="bench-remove-tyres"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="bench-empty-tyres"]').exists()).toBe(true)
    })

    it('a freshly fitted member shows neither the empty-state nor a dangling fee (playtest item 19)', async () => {
      const game = useGameStore()
      const tyresPart = PARTS.find((p) => p.carPartId === 'tyres')!
      game.devGrantPart(tyresPart.id)
      const { wrapper } = await benchTyres(game)

      await wrapper.find('[data-test^="bench-swap-tyres-"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-test="bench-empty-tyres"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="bench-swap-fee-tyres"]').exists()).toBe(false)
    })

    it('a member with a recondition step never shows the empty-state, even with nothing to fit', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      // Pin rims below mint so the benched member offers a recondition step;
      // the inventory holds no replacement rims either way.
      const car = game.gameState.ownedCars[0]!
      car.parts.rims = { installed: { ...car.parts.rims.installed!, band: 'worn' } }

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'wheels', 'rims')
      await wrapper.find('[data-test="remove-assembly-wheelAssembly"]').trigger('click')
      await flushPromises()
      await wrapper.find('[data-test="bench-member-rims"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-test="bench-recondition-rims"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="bench-empty-rims"]').exists()).toBe(false)
    })
  })

  describe('Replace drawer (Sprint 18, round 2; per-part in Sprint 28)', () => {
    it('the drawer is closed until Replace is clicked, and no PartCard renders before then', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      game.removePart(id, 'dampers')

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'suspension', 'dampers')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
      expect(wrapper.find('[data-test^="pick-part-"]').exists()).toBe(false)

      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(true)
      expect(wrapper.find('[data-test^="pick-part-"]').exists()).toBe(true)

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
      await selectPart(wrapper, 'suspension', 'dampers')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      await wrapper.find('.part-card').trigger('click')

      expect(wrapper.text()).toContain('planned:')
      expect(game.cashYen).toBe(cashBefore) // free until Confirm
      expect(car.parts.dampers.installed).toBeNull() // not real yet
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
    })

    it('dragging a fitting part from the drawer onto its own Replace button stages it', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      game.removePart(id, 'dampers')

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'suspension', 'dampers')
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
      await selectPart(wrapper, 'suspension', 'dampers')
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
      await selectPart(wrapper, 'suspension', 'dampers')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
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
      await selectPart(wrapper, 'suspension', 'dampers')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      await wrapper.find(`[data-test="pick-part-${partInstanceId}"]`).trigger('click')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')

      expect(wrapper.text()).toContain('planned:')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
    })

    it('Sprint 24 fix 1: a pick that does not fit the clicked slot falls through to opening that drawer, not a silent no-op', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.removePart(id, 'dampers')
      const wrongPart = PARTS.find((p) => p.carPartId === 'forcedInduction' && p.grade !== 'stock')!
      game.devGrantPart(wrongPart.id)
      const partInstanceId = game.gameState.partInventory.find(
        (pi) => pi.partId === wrongPart.id,
      )!.id

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'engine', 'forcedInduction')
      await wrapper.find('[data-test="replace-part-forcedInduction"]').trigger('click')
      await wrapper.find(`[data-test="pick-part-${partInstanceId}"]`).trigger('click')

      await wrapper.find('[data-test="close-drawer"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
      await selectPart(wrapper, 'suspension', 'dampers')
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
      await selectPart(wrapper, 'suspension', 'dampers')
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
     * `smokes-on-startup`, the same fixture the auction screen's own tests
     * use. `valve-seals` (the true cause) targets `headValvetrain`. */
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

    it('shows the "?" uncertainty chip in the panel for a still-open symptomatic part, which disappears once Full workup resolves it', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      injectSymptom(game, id)

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'engine', 'headValvetrain')
      expect(wrapper.find('[data-test="panel-uncertain"]').exists()).toBe(true)

      await wrapper.find('[data-test="car-workup"]').trigger('click')
      await flushPromises()

      const updatedCar = game.gameState.ownedCars.find((c) => c.id === id)!
      expect(updatedCar.symptoms[0]!.remainingCauseIds).toEqual(['valve-seals'])
      expect(wrapper.find('[data-test="panel-uncertain"]').exists()).toBe(false)
    })

    it('an uncertain assembly member never offers an on-car repair step - it comes off with the assembly', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      injectSymptom(game, id)

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'engine', 'headValvetrain')
      expect(wrapper.find('[data-test="stage-repair-part-headValvetrain"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="panel-assembly-note"]').exists()).toBe(true)
    })

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
      game.gameState = { ...game.gameState, energySpentToday: game.laborSlotsPerDay }

      const { wrapper } = await mountAt(id)
      const button = wrapper.find('[data-test="car-workup"]')
      expect((button.element as HTMLButtonElement).disabled).toBe(true)
      expect(button.attributes('title')).toContain('No labour left today')
    })
  })
})
