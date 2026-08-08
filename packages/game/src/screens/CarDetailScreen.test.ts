import {
  ALL_CAR_PART_IDS,
  CARS,
  ECONOMY,
  PAINT_COLOURS,
  PARTS,
  PARTS_TAXONOMY,
  TOOL_LINES,
  fitmentClassForTier,
  type CarPartId,
  type ComponentId,
  type ZoneId,
  type ZoneState,
} from '@midnight-garage/content'
import { foundationWithheldYen } from '@midnight-garage/sim'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import {
  WORKSHOP_VIEWS,
  type WorkshopRegion,
  type WorkshopViewId,
} from '../components/workshopViewLayout'
import { clearDragSession } from '../composables/useDragAndDrop'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import CarDetailScreen from './CarDetailScreen.vue'

/**
 * The Components list, its drill-down and its condition filter are gone - the
 * workshop views plus the docked info/action panel are the single repair
 * surface, for parts and body zones alike. Every test that drove an earlier
 * surface was re-targeted here under directive 17 case (a) (the surface was
 * intentionally replaced), preserving the behavioural assertions: repair
 * staging, the replace flow, remove gating, and the confirm totals.
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
      { path: '/dyno', name: 'dyno', component: { render: () => h('div') } },
      { path: '/machine-shop', name: 'machine-shop', component: { render: () => h('div') } },
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
 * Which of the three views carries a region, read from the live layout - a
 * hardcoded mapping would let a layout change silently pass a test that claims
 * to drive the real surface.
 */
function viewIdCarrying(
  what: string,
  matches: (region: WorkshopRegion) => boolean,
): WorkshopViewId {
  for (const view of Object.values(WORKSHOP_VIEWS)) {
    if (view.regions.some(matches)) return view.id
  }
  throw new Error(`no workshop view carries ${what}`)
}

/** A region's click target. A region owns a SET of rects, each its own button:
 * a single-rect region owns the stem, a multi-rect one suffixes the index. */
function regionSelector(base: string): string {
  return `[data-test="${base}"], [data-test="${base}-0"]`
}

/**
 * The one interaction that reaches a part's actions now - open the view its
 * region lives on, then click the region, which docks the info/action panel on
 * that part.
 */
async function selectPart(
  wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'],
  partId: CarPartId,
): Promise<void> {
  const viewId = viewIdCarrying(partId, (r) => r.kind === 'part' && r.partId === partId)
  await wrapper.get(`[data-test="workshop-view-tab-${viewId}"]`).trigger('click')
  await wrapper.get(regionSelector(`workshop-region-part-${partId}`)).trigger('click')
  await flushPromises()
}

/** The same route to a body zone's actions - the views select, the one docked
 * panel acts, whichever kind of region was pointed at. */
async function selectZone(
  wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'],
  zoneId: ZoneId,
): Promise<void> {
  const viewId = viewIdCarrying(zoneId, (r) => r.kind === 'zone' && r.zoneId === zoneId)
  await wrapper.get(`[data-test="workshop-view-tab-${viewId}"]`).trigger('click')
  await wrapper.get(regionSelector(`workshop-region-zone-${zoneId}`)).trigger('click')
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
 * An aftermarket (non-stock) catalog part for this slot, pinned to `entry` -
 * every car this file grants (`CARS[0]`/`CARS[1]`) is that tier.
 */
function untaggedPartFor(carPartId: string) {
  return PARTS.find(
    (p) => p.carPartId === carPartId && p.grade !== 'stock' && p.fitmentClass === 'entry',
  )!
}

/** The rows in `componentId` an on-car per-part repair step exists for -
 * a repairable, below-mint part that never comes off (every removable part is
 * bench work, so none of them grows an on-car repair button). */
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
      // Only a row the on-car "+" can act on right now. At tier 1 a `fine`
      // part has no further rung (mint needs the group's tier-2 machine owned),
      // so its stage button never renders. This gate is tier-aware: at tier 2/3
      // a below-mint part still steps.
      game.nextRepairStep(carId, componentId, row.partId) !== null &&
      PARTS_TAXONOMY.find((e) => e.id === row.partId)?.removable === false,
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

/**
 * Drops this car's chassis to `scrap` and puts a fresh shell of the car's own
 * fitment class in the parts bin. Returns that instance's id.
 */
function scrapChassisWithSpare(game: ReturnType<typeof useGameStore>, carId: string): string {
  const car = game.gameState.ownedCars.find((c) => c.id === carId)!
  car.parts.chassis = { installed: { ...car.parts.chassis.installed!, band: 'scrap' } }
  const model = game.context.modelsById[car.modelId]!
  const spare = game.context.stockPartByCarPartId[fitmentClassForTier(model.tier)].chassis
  game.devGrantPart(spare.id)
  return game.gameState.partInventory.at(-1)!.id
}

/** Owns the shop covering `componentId` - what puts that line at the level
 * a level-3 capability needs, read from real content rather than a
 * hard-coded shop id. */
function grantShopFor(game: ReturnType<typeof useGameStore>, componentId: ComponentId): void {
  const shop = game.toolShopViews.find((s) => s.covers.includes(componentId))!
  game.devSetToolShopOwned(shop.id, true)
}

describe('CarDetailScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('renders a granted car: name, radar, the three workshop views, and an empty action panel', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id

    const { wrapper } = await mountAt(id)
    expect(wrapper.find('svg.radar').exists()).toBe(true)
    expect(wrapper.text()).toContain(game.carsDetailed[0]!.displayName)
    for (const viewId of Object.keys(WORKSHOP_VIEWS) as WorkshopViewId[]) {
      expect(wrapper.find(`[data-test="workshop-view-tab-${viewId}"]`).exists()).toBe(true)
    }
    // The body schematic opens first, with its own regions on the stage.
    expect(wrapper.find('[data-test="workshop-region-zone-bonnet"]').exists()).toBe(true)
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
    await selectPart(wrapper, 'dampers')
    await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
    await wrapper.find('.part-card').trigger('click')
    if (needsRepair(game, id, 'body')) {
      const row = bodyRepairRow(game, id)
      await selectPart(wrapper, row.partId)
      await wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`).trigger('click')
    }

    expect(wrapper.text().toLowerCase()).not.toContain('staged')
  })

  /**
   * The machine-line gate reason is previewed exactly where the operation is
   * gated - the install/replace and on-car per-part repair of a suspension/
   * body/interior signature slot. Owning the tier-2 machine, or hiring the
   * line for today, both clear the preview - access is a gate now, never a
   * fee.
   */
  it('previews the machine-line gate reason on repair/install of a signature slot at tier 1, and hides it once owned or hired', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id) // honda-city-e-aa, an entry-tier car at tier-1 tools
    const id = game.gameState.ownedCars[0]!.id
    const car = game.gameState.ownedCars.find((c) => c.id === id)!
    // chassis: an installed body signature slot below mint, and the one
    // signature slot an on-car per-part repair still reaches (every removable
    // part is bench work now, and `bodywork`/`paint` are derived body value
    // carriers with no on-car repair affordance at all, `bodyPipeline.ts`).
    // dampers: an empty suspension signature slot (installing one is gated).
    const model = game.context.modelsById[car.modelId]!
    const fitmentClass = fitmentClassForTier(model.tier)
    const chassisInstalled = car.parts.chassis.installed
    car.parts.chassis = {
      installed: chassisInstalled
        ? { ...chassisInstalled, band: 'poor' }
        : {
            id: 'signature-gate-test-chassis',
            partId: game.context.stockPartByCarPartId[fitmentClass].chassis.id,
            band: 'poor',
            origin: { kind: 'market', day: 1 },
          },
    }
    car.parts.dampers = { installed: null }

    const suspensionMachine = TOOL_LINES.suspension.tiers[1]!.displayName
    const bodyMachine = TOOL_LINES.body.tiers[1]!.displayName

    const { wrapper } = await mountAt(id)

    // Install/replace affordance of a signature slot: gate reason present at
    // tier 1, neither owned nor hired.
    await selectPart(wrapper, 'dampers')
    const installCap = wrapper.find('[data-test="assist-fee-dampers"]')
    expect(installCap.exists()).toBe(true)
    expect(installCap.text()).toContain(suspensionMachine)

    // On-car per-part repair of a signature slot: gate reason present. The
    // shell never comes off, so there is no removal here to gate at all - and
    // the Replace it does offer wants the same line.
    await selectPart(wrapper, 'chassis')
    const repairCap = wrapper.find('[data-test="assist-fee-repair-chassis"]')
    expect(repairCap.exists()).toBe(true)
    expect(repairCap.text()).toContain(bodyMachine)
    expect(wrapper.find('[data-test="remove-part-chassis"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="assist-fee-chassis"]').text()).toContain(bodyMachine)

    // Owning the tier-2 machines drops every preview.
    game.devSetToolTier('suspension', 2)
    game.devSetToolTier('body', 2)
    const owned = await mountAt(id)
    await selectPart(owned.wrapper, 'dampers')
    expect(owned.wrapper.find('[data-test="assist-fee-dampers"]').exists()).toBe(false)
    await selectPart(owned.wrapper, 'chassis')
    expect(owned.wrapper.find('[data-test="assist-fee-repair-chassis"]').exists()).toBe(false)
    expect(owned.wrapper.find('[data-test="assist-fee-chassis"]').exists()).toBe(false)
  })

  it('also hides the machine-line gate reason once the line is hired for the day, still at tier 1 (not owned)', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id
    const car = game.gameState.ownedCars.find((c) => c.id === id)!
    car.parts.chassis = { installed: { ...car.parts.chassis.installed!, band: 'poor' } }
    car.parts.dampers = { installed: null }
    game.gameState = {
      ...game.gameState,
      machineHirePaidDayByGroup: { suspension: game.gameState.day, body: game.gameState.day },
    }

    const { wrapper } = await mountAt(id)
    await selectPart(wrapper, 'dampers')
    expect(wrapper.find('[data-test="assist-fee-dampers"]').exists()).toBe(false)
    await selectPart(wrapper, 'chassis')
    expect(wrapper.find('[data-test="assist-fee-repair-chassis"]').exists()).toBe(false)
  })

  /**
   * The on-car per-part repair affordance shows a
   * caption at tier 1 naming the group's tier-2 machine - the constraint at the
   * point of the action (why the repair finishes at fine, and which machine
   * reaches mint). It is absent once that machine is owned (no cap at tier 2).
   */
  it('shows the tier-1 repair-ceiling caption naming the group tier-2 machine, and drops it once the machine is owned', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id) // honda-city-e-aa, an entry-tier car at tier-1 tools
    const id = game.gameState.ownedCars[0]!.id
    const car = game.gameState.ownedCars.find((c) => c.id === id)!
    // chassis: an installed, repairable slot below mint that never comes off -
    // the on-car repair "+" (and this ceiling caption) applies. `seats` no
    // longer serves this purpose (it is removable, so it is bench work), and
    // neither does `bodywork`: a derived body value carrier with no on-car
    // repair affordance at all (`bodyPipeline.ts`).
    car.parts.chassis = { installed: { ...car.parts.chassis.installed!, band: 'worn' } }
    const bodyMachine = TOOL_LINES.body.tiers[1]!.displayName

    const { wrapper } = await mountAt(id)
    await selectPart(wrapper, 'chassis')
    const cap = wrapper.find('[data-test="repair-ceiling-chassis"]')
    expect(cap.exists()).toBe(true)
    expect(cap.text()).toBe(`Your tools finish at fine. The ${bodyMachine} reaches mint.`)

    // Owning the tier-2 machine lifts the ceiling to mint - the caption drops.
    game.devSetToolTier('body', 2)
    const owned = await mountAt(id)
    await selectPart(owned.wrapper, 'chassis')
    expect(owned.wrapper.find('[data-test="repair-ceiling-chassis"]').exists()).toBe(false)
  })

  it('a view tab only navigates; a region click docks that part in the action panel (Sprint 88 decision 1)', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id

    const { wrapper } = await mountAt(id)
    // Switching views is navigation, not selection - the panel stays empty.
    await wrapper.get('[data-test="workshop-view-tab-engineBay"]').trigger('click')
    expect(wrapper.find('[data-test="panel-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="panel-name"]').exists()).toBe(false)

    // A region click selects the part into the panel.
    await wrapper.get('[data-test="workshop-region-part-block"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="panel-empty"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="panel-name"]').text()).toBe(game.carPartLabel('block'))
  })

  it('names what the selected part sits under, straight from the taxonomy (panel blocker line)', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id

    const { wrapper } = await mountAt(id)
    await selectPart(wrapper, 'brakePadsDiscs')
    const line = wrapper.get('[data-test="panel-sits-under"]')
    expect(line.text()).toBe(`Sits under: ${game.carPartLabel('rims')}`)
  })

  it('staging a per-part repair, then Confirm, actually creates and labours the job - settling one rung up, not mint', async () => {
    const game = useGameStore()
    for (const shop of game.toolShopViews) game.devSetToolShopOwned(shop.id, true)
    const id = grantCarNeedingRepair(game, 'body')
    const row = bodyRepairRow(game, id)
    const { wrapper } = await mountAt(id)

    // A dev-granted car lands in parking; move it into the service bay first.
    await wrapper.find('[data-test="toggle-bay"]').trigger('click')
    expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeDefined()

    const step = game.nextRepairStep(id, 'body', row.partId)!
    await selectPart(wrapper, row.partId)
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

    await selectPart(wrapper, row.partId)
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
    await selectPart(wrapper, row.partId)

    const button = wrapper.find(`[data-test="stage-repair-part-${row.partId}"]`)
    expect(button.exists()).toBe(true)
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.text()).toContain('Repair')
    expect(button.attributes('title')).not.toContain('Needs')
  })

  /**
   * Storage stops doing work and so does the car screen: a part that comes off
   * is put right at the workshop floor's bench, so only the carriers that never
   * come off (the chassis and the two body carriers) keep an on-car repair
   * affordance at all. The dash is removable and pinned below mint here, and
   * still offers nothing but the pull.
   */
  it('a removable part below mint offers no on-car repair - only the way off the car', async () => {
    const game = useGameStore()
    game.devGrantCar(CARS[0]!.id)
    const id = game.gameState.ownedCars[0]!.id
    const car = game.gameState.ownedCars[0]!
    const fitted = car.parts.dashGauges.installed!
    game.gameState = {
      ...game.gameState,
      ownedCars: [
        {
          ...car,
          parts: { ...car.parts, dashGauges: { installed: { ...fitted, band: 'worn' } } },
        },
      ],
    }

    const { wrapper } = await mountAt(id)
    await selectPart(wrapper, 'dashGauges')
    expect(wrapper.find('[data-test="stage-repair-part-dashGauges"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="remove-part-dashGauges"]').exists()).toBe(true)
  })

  describe('click-per-rung repair (Sprint 48, per-part since Sprint 88)', () => {
    it('each click advances the planned target exactly one band, with the real marginal price', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const row = bodyRepairRow(game, id)
      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, row.partId)

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
      await selectPart(wrapper, row.partId)

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
      await selectPart(wrapper, row.partId)

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
      await selectPart(wrapper, row.partId)

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

      await selectPart(wrapper, rows[0]!.partId)
      await wrapper.find(`[data-test="stage-repair-part-${rows[0]!.partId}"]`).trigger('click')
      const afterOne = game.carDetail(id)!.plannedEstimate!.plannedLaborSlots
      expect(afterOne).toBeGreaterThan(0)
      expect(wrapper.find('[data-test="confirm-cost"]').text()).toContain(`${afterOne} labour`)

      // Plan more work - a second repairable surface part, in body or another
      // group, whichever this roll actually produced.
      const secondBody = rows[1]
      const other = (['drivetrain', 'interior'] as const)
        .map((group) => repairableSurfaceRows(game, id, group))
        .find((groupRows) => groupRows.length > 0)
      if (secondBody) {
        await selectPart(wrapper, secondBody.partId)
        await wrapper.find(`[data-test="stage-repair-part-${secondBody.partId}"]`).trigger('click')
      } else if (other) {
        await selectPart(wrapper, other[0]!.partId)
        await wrapper.find(`[data-test="stage-repair-part-${other[0]!.partId}"]`).trigger('click')
      }
      if (secondBody || other) {
        const afterTwo = game.carDetail(id)!.plannedEstimate!.plannedLaborSlots
        expect(afterTwo).toBeGreaterThan(afterOne)
        expect(wrapper.find('[data-test="confirm-cost"]').text()).toContain(`${afterTwo} labour`)
      }
    })

    it('an overrun caption warns (never blocks) when the plan needs more labour than remains today', async () => {
      const game = useGameStore()
      const id = grantCarNeedingRepair(game, 'body')
      const row = bodyRepairRow(game, id)
      // The rolled row may land on a body signature slot (bodywork/underbody) -
      // hire the line so only the labour-overrun concern under test can
      // possibly disable Confirm.
      game.hireMachineLine('body')
      game.gameState = { ...game.gameState, energySpentToday: game.laborSlotsPerDay }
      expect(game.laborSlotsRemainingToday).toBe(0)

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, row.partId)
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

    it('shows purchase, repairs, parts, total spent, the value ledger, You say, and the sale range right after a buyout', async () => {
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
      // The value ledger renders line by line above the money-in rows, its
      // labels mapped from the sim's own ids.
      const bookLine = panel.find('[data-test="ledger-line-book"]')
      expect(bookLine.exists()).toBe(true)
      expect(bookLine.text()).toContain('Book')
      expect(bookLine.text()).toContain(formatYen(detail.valueLedger.lines[0]!.yen))
      expect(panel.find('[data-test="ledger-line-wear"]').exists()).toBe(true)
      // An owned car's receipt is honest - never a fear line.
      expect(panel.find('[data-test="ledger-line-fear"]').exists()).toBe(false)
      expect(panel.find('[data-test="you-say"]').text()).toBe(formatYen(detail.yourNumberYen))
      // The restoration-bill-remaining and projected-profit rows are gone.
      expect(panel.find('[data-test="finance-bill-remaining"]').exists()).toBe(false)
      expect(panel.find('[data-test="finance-profit"]').exists()).toBe(false)

      const range = wrapper.find('[data-test="sale-range"]')
      expect(range.text().replace(/\s+/g, ' ')).toBe(
        `Expect ${formatYen(detail.saleRangeYen.lowYen)} to ${formatYen(detail.saleRangeYen.highYen)}, depending who bites.`,
      )
    })

    it('the Finances block is a closed-by-default disclosure; the Sell section stays visible regardless', async () => {
      const game = useGameStore()
      const id = buyoutACar(game)
      const { wrapper } = await mountAt(id)

      const panel = wrapper.find('[data-test="finance-panel"]')
      expect(panel.exists()).toBe(true)
      expect(panel.element.tagName).toBe('DETAILS')
      expect(panel.attributes('open')).toBeUndefined()
      expect(wrapper.find('[data-test="finance-summary"]').text()).toBe('Finances')

      // The Sell section is never nested inside the collapsed disclosure.
      expect(wrapper.find('[data-test="finance-panel"] [data-test="sale-range"]').exists()).toBe(
        false,
      )
      expect(wrapper.find('[data-test="sale-range"]').exists()).toBe(true)
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

    it('repairing the car updates repairs and total spent immediately', async () => {
      const game = useGameStore()
      for (const shop of game.toolShopViews) game.devSetToolShopOwned(shop.id, true)
      const id = grantCarNeedingRepair(game, 'body')
      const row = bodyRepairRow(game, id)

      const before = game.carDetail(id)!
      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="toggle-bay"]').trigger('click')
      await selectPart(wrapper, row.partId)
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
      // The radial-offer gate keeps a fresh tutorial career's board Yuki-only,
      // so the offer is obtained post-skip at the next generation point rather
      // than assumed on day 1.
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
          origin: { kind: 'market', day: 1 },
        },
      }
      car.parts.brakePadsDiscs = {
        installed: { ...car.parts.brakePadsDiscs.installed!, band: 'scrap' },
      }

      const warning = game.carDetail(id)!.foundationWarning
      expect(warning).not.toBeNull()
      expect(warning!.withheldYen).toBeGreaterThan(0)
      // The panel computes no yen figure of its own: it quotes sim's own
      // withheld term, which `sim/tests/foundationWithheld.test.ts` holds to
      // the exact delta a sound foundation makes to `marketValueYen`.
      const model = CARS.find((c) => c.id === car.modelId)!
      const partsById = Object.fromEntries(PARTS.map((part) => [part.id, part]))
      expect(warning!.withheldYen).toBe(foundationWithheldYen(model, car, partsById, ECONOMY))

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
      // The market expects `fine` of an entry car now, so an all-`worn` one is
      // BELOW the bar and the notice names the bar itself: everything past
      // `fine` is the passion spend, at this tier's 0.4 return.
      expect(notice!.band).toBe('fine')
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
      const enthusiast = CARS.find((c) => c.tier === 'enthusiast')!
      game.devGrantCar(enthusiast.id)
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
          origin: { kind: 'market', day: 1 },
        },
      }
      // Every foundation slot is FILLED as well as mint. A missing slot reads
      // as the `missing` state, which is itself below 1 in
      // `valuation.foundation.factorByState`, so a fixture that only lifted
      // the bands of slots that happened to be occupied was asserting "the
      // foundations are sound" on a car that might have none in one corner.
      // It held while an entry car's generated missing-slot chance was low and
      // stopped holding once culture made those cars likelier to be neglected.
      const model = game.context.modelsById[car.modelId]!
      const fitmentClass = fitmentClassForTier(model.tier)
      for (const partId of [
        'brakePadsDiscs',
        'brakeCalipersLines',
        'tyres',
        'steering',
        'chassis',
      ] as const) {
        const installed = car.parts[partId].installed
        car.parts[partId] = {
          installed: installed
            ? { ...installed, band: 'mint' }
            : {
                id: `foundation-test-${partId}`,
                partId: game.context.stockPartByCarPartId[fitmentClass][partId].id,
                band: 'mint',
                origin: { kind: 'market', day: 1 },
              },
        }
      }
      expect(game.carDetail(id)!.foundationWarning).toBeNull()

      const { wrapper } = await mountAt(id)
      expect(wrapper.find('[data-test="foundation-warning"]').exists()).toBe(false)
    })
  })

  describe('Sprint 136: the support-ratio readout', () => {
    /** Resets every slot on `carId` to the model's own stock part, mint -
     * generated auction condition is randomised, and this test needs a known
     * clean baseline to build a specific support ratio on top of. */
    function resetToStockMint(game: ReturnType<typeof useGameStore>, carId: string): void {
      const car = game.gameState.ownedCars.find((c) => c.id === carId)!
      const model = game.context.modelsById[car.modelId]!
      const fitmentClass = fitmentClassForTier(model.tier)
      for (const partId of ALL_CAR_PART_IDS) {
        const stockPart = game.context.stockPartByCarPartId[fitmentClass][partId]
        car.parts[partId] = {
          installed: {
            id: `readout-test-${partId}`,
            partId: stockPart.id,
            band: 'mint',
            origin: { kind: 'market', day: 1 },
          },
        }
      }
    }

    function fit(
      game: ReturnType<typeof useGameStore>,
      carId: string,
      partId: CarPartId,
      grade: 'street' | 'sport' | 'race',
    ): void {
      const car = game.gameState.ownedCars.find((c) => c.id === carId)!
      const model = game.context.modelsById[car.modelId]!
      const fitmentClass = fitmentClassForTier(model.tier)
      const part = game.context.aftermarketPartByCarPartId[fitmentClass][partId]?.[grade]
      if (!part) throw new Error(`no ${grade} ${partId} SKU for fitment class ${fitmentClass}`)
      car.parts[partId] = {
        installed: {
          id: `readout-test-${partId}-${grade}`,
          partId: part.id,
          band: 'mint',
          origin: { kind: 'market', day: 1 },
        },
      }
    }

    it('is absent at adequate (a stock car)', async () => {
      const game = useGameStore()
      game.devGrantCar('nissan-180sx-rps13')
      const id = game.gameState.ownedCars[0]!.id
      resetToStockMint(game, id)

      expect(game.carDetail(id)!.supportReadout).toBeNull()
      const { wrapper } = await mountAt(id)
      expect(wrapper.find('[data-test="support-readout"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="support-readout-listing"]').exists()).toBe(false)
    })

    it('names the shortfall at strained, restated in the sell section, with no numeric figure anywhere', async () => {
      const game = useGameStore()
      game.devGrantCar('nissan-180sx-rps13')
      const id = game.gameState.ownedCars[0]!.id
      resetToStockMint(game, id)
      fit(game, id, 'intake', 'sport')
      fit(game, id, 'exhaust', 'sport')
      // The race-grade ECU (rather than sport) is what keeps this build
      // under the `adequate` line: the proportional support margin gives a
      // sport-only version of this build (headline 0.906) just enough
      // headroom to read as adequate instead.
      fit(game, id, 'ignitionEcu', 'race')

      const readout = game.carDetail(id)!.supportReadout
      expect(readout).not.toBeNull()
      expect(readout!.band).toBe('strained')

      const { wrapper } = await mountAt(id)
      const el = wrapper.find('[data-test="support-readout"]')
      expect(el.exists()).toBe(true)
      expect(el.text()).toContain('It will do, but it is')
      expect(el.text()).not.toMatch(/\d/)

      const listing = wrapper.find('[data-test="support-readout-listing"]')
      expect(listing.exists()).toBe(true)
      expect(listing.text()).toBe(el.text())
    })

    // The proportional support-headroom margin puts a floor under every
    // headline of `margin + (1 - margin) / demand`. At the current margin a
    // bare race turbo on a stock bottom end reads `dangerous` (headline
    // 0.699): the pure demand/support imbalance is enough on its own,
    // without needing a broken part.
    it('names cylinder pressure at dangerous for a race turbo on a stock bottom end, with no numeric figure', async () => {
      const game = useGameStore()
      game.devGrantCar('nissan-180sx-rps13')
      const id = game.gameState.ownedCars[0]!.id
      resetToStockMint(game, id)
      fit(game, id, 'forcedInduction', 'race')

      const readout = game.carDetail(id)!.supportReadout
      expect(readout).not.toBeNull()
      expect(readout!.band).toBe('dangerous')
      expect(readout!.copy.toLowerCase()).toContain('bottom end')

      const { wrapper } = await mountAt(id)
      const el = wrapper.find('[data-test="support-readout"]')
      expect(el.exists()).toBe(true)
      expect(el.text()).toContain('This is')
      expect(el.text()).not.toMatch(/\d/)
    })
  })

  describe('the unpainted-panel note', () => {
    /** Every zone straight, sound and wearing one colour: a car with nothing
     * for the note to report. A granted car's zones are rolled, so a test
     * about what fitting a kit DOES has to start from a known finish. */
    function paintEveryZone(game: ReturnType<typeof useGameStore>, carId: string): void {
      const car = game.gameState.ownedCars.find((c) => c.id === carId)!
      const painted: ZoneState = {
        metal: 0,
        surface: 0,
        finish: 0,
        panelMissing: false,
        primed: false,
        colour: PAINT_COLOURS[0]!.id,
      }
      const zones = { ...car.zoneState! }
      for (const zoneId of Object.keys(zones) as ZoneId[]) zones[zoneId] = { ...painted }
      car.zoneState = zones
    }

    it('is silent on a car that is all in colour, and names the cost once a fresh panel arrives bare', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.moveCar(id, 'service')
      // Fitting body panels is gated on the welder and panel tools, which is
      // the shop's affair rather than this note's.
      game.devSetToolTier('body', 2)
      paintEveryZone(game, id)

      expect(game.carDetail(id)!.unpaintedPanelsNote).toBeNull()
      const before = await mountAt(id)
      expect(before.wrapper.find('[data-test="unpainted-panels-note"]').exists()).toBe(false)

      // The real remove/install path, not a hand-written zone state: every
      // aftermarket panel SKU now addresses one zone (`zoneId`), so fitting a
      // kit is pulling the bonnet's panel and fitting a fresh one, which
      // leaves exactly that zone in bare metal (`planInstallPanel`,
      // sim/bodyPipeline.ts) - not the whole shell at once, unlike the
      // retired whole-car body kit.
      game.stageAction(id, { kind: 'pipeline-remove-panel', zoneId: 'bonnet' })
      game.confirmCarWork(id)
      const model = game.context.modelsById[game.gameState.ownedCars[0]!.modelId]!
      const fitmentClass = fitmentClassForTier(model.tier)
      const kit = PARTS.find(
        (p) => p.zoneId === 'bonnet' && p.grade === 'sport' && p.fitmentClass === fitmentClass,
      )!
      game.devGrantPart(kit.id)
      const granted = game.gameState.partInventory.find((pi) => pi.partId === kit.id)!
      game.stageAction(id, {
        kind: 'pipeline-install-panel',
        zoneId: 'bonnet',
        partInstanceId: granted.id,
      })
      game.confirmCarWork(id)

      expect(game.carDetail(id)!.unpaintedPanelsNote).toContain('One panel is still unpainted.')
      // The note explains a drop that has already happened and moves nothing:
      // the `paint` carrier derives off that one bare zone, and it is that
      // band that drags the style and authenticity condition factors down.
      expect(game.gameState.ownedCars[0]!.parts.paint.installed!.band).toBe('poor')

      const { wrapper } = await mountAt(id)
      const note = wrapper.find('[data-test="unpainted-panels-note"]')
      expect(note.exists()).toBe(true)
      expect(note.text()).toContain('Style and authenticity read low')
    })
  })

  describe('Sprint 114: the selling rework (channel picker + want-line)', () => {
    /** The channels a career starts with - the two premium ones are opened by
     * a named story mission (sprint156.md), so a fresh shop cannot see them.
     * `collectorNetwork` names no unlocking mission of its own (no mission in
     * this content names `collector-network` on the buying side either), so
     * it is open from day one along with the others rather than gated. */
    const DAY_ONE_CHANNEL_IDS = [
      'shopFront',
      'freeAdsPaper',
      'tradeNetwork',
      'collectorNetwork',
    ] as const

    it('renders the day-one channel options with real fee text, defaulting the armed choice to shopFront', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const { wrapper } = await mountAt(id)

      const picker = wrapper.find('[data-test="channel-picker"]')
      expect(picker.exists()).toBe(true)
      for (const channelId of DAY_ONE_CHANNEL_IDS) {
        const option = picker.find(`[data-test="channel-option-${channelId}"]`)
        expect(option.exists()).toBe(true)
        const feeYen = game.context.economy.sellingChannels[channelId].feeYen
        expect(option.text()).toContain(feeYen === 0 ? 'Free' : formatYen(feeYen))
      }
      expect(picker.find('[data-test="channel-option-shopFront"]').classes()).toContain('selected')
    })

    it('shows who each channel draws, so the fee is never the only thing separating two of them', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const { wrapper } = await mountAt(id)

      // The shop front's pool is flat across every archetype, so it says so in
      // words rather than listing all six; the paper names the people who
      // actually read it. The trade network has no persona at all and shows no
      // audience line.
      expect(wrapper.find('[data-test="channel-option-shopFront"]').text()).toContain(
        'Everyone who walks past',
      )
      expect(wrapper.find('[data-test="channel-option-freeAdsPaper"]').text()).toContain(
        'Daily Drivers',
      )
      const trade = wrapper.find('[data-test="channel-option-tradeNetwork"]')
      expect(trade.find('[data-test="channel-audience"]').exists()).toBe(false)
    })

    it('does not offer a channel no one has put the shop forward for, and grows the list when they do', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const beforeMount = await mountAt(id)

      // Law 4: the list changing shape IS the signal; nothing announces it.
      for (const channelId of ['tunerMagazine', 'weekendMeet'] as const) {
        expect(
          beforeMount.wrapper.find(`[data-test="channel-option-${channelId}"]`).exists(),
          channelId,
        ).toBe(false)
      }

      game.gameState = {
        ...game.gameState,
        storyMissions: [{ missionId: 'low-and-loud', status: 'delivered', acceptedOnDay: 1 }],
      }
      const afterMount = await mountAt(id)
      expect(afterMount.wrapper.find('[data-test="channel-option-weekendMeet"]').exists()).toBe(
        true,
      )
      expect(afterMount.wrapper.find('[data-test="channel-option-tunerMagazine"]').exists()).toBe(
        false,
      )
    })

    it('lists the car on the armed channel and shows it as the active channel', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const { wrapper } = await mountAt(id)

      await wrapper.find('[data-test="channel-option-freeAdsPaper"]').trigger('click')
      await wrapper.find('[data-test="list-on-channel"]').trigger('click')

      expect(game.listingChannelId(id)).toBe('freeAdsPaper')
      const activeLine = wrapper.find('[data-test="active-channel"]')
      expect(activeLine.exists()).toBe(true)
      expect(activeLine.text()).toContain('Free ads paper')
    })

    it("re-listing on a different channel re-charges that channel's own fee", async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const { wrapper } = await mountAt(id)

      // shopFront first (free), then armed on freeAdsPaper (not free).
      await wrapper.find('[data-test="list-on-channel"]').trigger('click')
      expect(game.listingChannelId(id)).toBe('shopFront')
      const cashBefore = game.cashYen
      const feeYen = game.context.economy.sellingChannels.freeAdsPaper.feeYen

      await wrapper.find('[data-test="channel-option-freeAdsPaper"]').trigger('click')
      await wrapper.find('[data-test="list-on-channel"]').trigger('click')

      expect(game.listingChannelId(id)).toBe('freeAdsPaper')
      expect(game.cashYen).toBe(cashBefore - feeYen)
    })

    it('stops taking offers via the dedicated button', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const { wrapper } = await mountAt(id)

      await wrapper.find('[data-test="list-on-channel"]').trigger('click')
      expect(game.isForSale(id)).toBe(true)
      await wrapper.find('[data-test="stop-for-sale"]').trigger('click')
      expect(game.isForSale(id)).toBe(false)
      expect(wrapper.find('[data-test="stop-for-sale"]').exists()).toBe(false)
    })

    it('disables a channel option whose fee exceeds cash, with a real title reason', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const feeYen = game.context.economy.sellingChannels.freeAdsPaper.feeYen
      game.gameState = { ...game.gameState, cashYen: feeYen - 1 }
      const { wrapper } = await mountAt(id)

      const option = wrapper.find('[data-test="channel-option-freeAdsPaper"]')
      expect(option.attributes('disabled')).toBeDefined()
      expect(option.attributes('title')).toContain('Not enough cash')
    })

    it("shows the buyer's displayName and authored want-line alongside a live offer", async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.gameState = {
        ...game.gameState,
        carsForSale: [
          {
            carInstanceId: id,
            offersSeen: 0,
            channelId: 'shopFront',
            weekendMeetPending: false,
          },
        ],
        pendingOffers: [{ carInstanceId: id, buyerId: 'daily-drivers', priceYen: 400_000 }],
      }
      const { wrapper } = await mountAt(id)

      const wantLine = wrapper.find('[data-test="offer-want-line"]')
      expect(wantLine.exists()).toBe(true)
      expect(wantLine.text()).toContain('Daily Drivers')
      expect(wantLine.text()).toContain(
        'Needs it to start every cold morning without eating the budget. A service history beats a spoiler.',
      )
    })
  })

  describe('the service banner no longer offers completion (Sprint 57 decision 1)', () => {
    it('shows the work status but not the Complete/Give Up button - that moved to the jobs screen', async () => {
      const game = useGameStore()
      game.newGame(1)
      // Same post-skip offer setup as the finance-panel customer-car test
      // above - day-1 offers are gated.
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
      await selectPart(wrapper, rows[0]!.partId)
      await wrapper.find(`[data-test="stage-repair-part-${rows[0]!.partId}"]`).trigger('click')
      await selectPart(wrapper, rows[1]!.partId)
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
                  origin: { kind: 'market', day: 1 },
                },
              },
            },
          },
        ],
      }

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'dampers')
      expect(wrapper.find('[data-test="stage-repair-part-dampers"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="replace-part-dampers"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="remove-part-dampers"]').exists()).toBe(true)
    })

    it('an empty forced-induction slot on an NA car reads "no turbo (NA)" and, once engine tooling is upgraded, fitting a turbo kit installs it', async () => {
      const game = useGameStore()
      grantShopFor(game, 'engine')
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      // forcedInduction is blockedBy 'intake' - it must come off first, or
      // Confirm refuses the fit even though staging looks fine.
      game.removePart(id, 'intake')
      const turboKit = PARTS.find(
        (p) =>
          p.carPartId === 'forcedInduction' && p.grade !== 'stock' && p.fitmentClass === 'entry',
      )!
      game.devGrantPart(turboKit.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'forcedInduction')
      expect(wrapper.find('[data-test="stage-repair-part-forcedInduction"]').exists()).toBe(false)
      expect(wrapper.get('[data-test="part-action-panel"]').text()).toContain('no turbo (NA)')

      await wrapper.find('[data-test="replace-part-forcedInduction"]').trigger('click')
      await wrapper.find('.part-card').trigger('click')
      expect(wrapper.text()).toContain('planned:')

      await wrapper.find('[data-test="toggle-bay"]').trigger('click')
      await wrapper.find('[data-test="confirm-work"]').trigger('click')
      expect(game.gameState.ownedCars[0]!.parts.forcedInduction.installed?.id).toBe(partInstanceId)
    })

    it('a garage without the machine shop cannot convert an NA car to forced induction: the turbo kit is dimmed with the shop it needs', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const turboKit = PARTS.find(
        (p) =>
          p.carPartId === 'forcedInduction' && p.grade !== 'stock' && p.fitmentClass === 'entry',
      )!
      game.devGrantPart(turboKit.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'forcedInduction')
      await wrapper.find('[data-test="replace-part-forcedInduction"]').trigger('click')

      const machineShop = game.toolShopViews.find((s) => s.covers.includes('engine'))!
      expect(wrapper.text()).toContain(`Needs ${machineShop.displayName}`)
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
      await selectPart(wrapper, 'dampers')
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

    it('a body value carrier offers Replace while it is occupied, and never Take it off', async () => {
      const game = useGameStore()
      grantShopFor(game, 'body')
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const originalInstalledId = game.gameState.ownedCars[0]!.parts.bodywork.installed?.id
      // Every real aftermarket `bodywork` SKU now carries a `zoneId` (it fits
      // one zone through the pipeline's own install, never the whole-car slot -
      // `partFitsCar` refuses a zone-scoped part here by design), so this is
      // the whole catalogue's own honest "sport panels" reach: a real part,
      // for this exact address, that still doesn't fit here.
      const kit = PARTS.find(
        (p) => p.carPartId === 'bodywork' && p.grade === 'sport' && p.fitmentClass === 'entry',
      )!
      expect(kit.zoneId).toBeDefined()
      game.devGrantPart(kit.id)

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'bodywork')
      // The shell is never pulled, so the slot is never empty - Replace stands
      // in for the remove-then-fit two-step every other slot uses.
      expect(wrapper.find('[data-test="remove-part-bodywork"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="replace-part-bodywork"]').exists()).toBe(true)

      await wrapper.find('[data-test="toggle-bay"]').trigger('click')
      await wrapper.find('[data-test="replace-part-bodywork"]').trigger('click')
      const card = wrapper.get('[data-test="replace-drawer"] .part-card')
      expect(card.classes()).toContain('no-fit')
      await card.trigger('click')
      // A no-fit card's click is a no-op - the shell is exactly as generated.
      expect(game.gameState.ownedCars[0]!.parts.bodywork.installed?.id).toBe(originalInstalledId)
    })

    /**
     * A chassis at `scrap` is a state the generator really produces (four
     * authored failure modes set it outright). It never comes off and it can
     * never be repaired, so Replace is the only way out of it - and the sim
     * has always permitted that install (`replacesOccupiedSlot`).
     */
    it('a scrap chassis offers Replace and nothing else, with the body line named', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      scrapChassisWithSpare(game, id)

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'chassis')
      // Nothing to repair and no ceiling caption at scrap: without Replace the
      // row is a band chip over an empty action list.
      expect(wrapper.find('[data-test="stage-repair-part-chassis"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="repair-ceiling-chassis"]').exists()).toBe(false)
      // The shell is never pulled, so there is no Take it off either.
      expect(wrapper.find('[data-test="remove-part-chassis"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="replace-part-chassis"]').exists()).toBe(true)
      expect(wrapper.get('[data-test="assist-fee-chassis"]').text()).toContain(
        TOOL_LINES.body.tiers[1]!.displayName,
      )
    })

    it('a shop without the body line cannot swap a scrap chassis: Confirm stays shut, and the sim refuses it too', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      scrapChassisWithSpare(game, id)

      const { wrapper } = await mountAt(id)
      await wrapper.get('[data-test="toggle-bay"]').trigger('click')
      await selectPart(wrapper, 'chassis')
      await wrapper.get('[data-test="replace-part-chassis"]').trigger('click')
      await wrapper.get('[data-test="replace-drawer"] .part-card').trigger('click')
      await flushPromises()

      // The swap plans, and the lever the plan hangs on is shut.
      expect(wrapper.get('[data-test="confirm-work"]').attributes('disabled')).toBeDefined()
      expect(game.gameState.ownedCars[0]!.parts.chassis.installed!.band).toBe('scrap')

      // The refusal is the sim's, not the screen's: driving Confirm directly
      // leaves the shell alone and logs the line it wants.
      game.confirmCarWork(id)
      expect(game.gameState.ownedCars[0]!.parts.chassis.installed!.band).toBe('scrap')
      expect(game.dayLog.some((e) => e.type === 'job-blocked' && e.reason === 'machine-line')).toBe(
        true,
      )
    })

    it('with the body line, a scrap chassis is replaced in place and reliability recovers', async () => {
      const game = useGameStore()
      grantShopFor(game, 'body')
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const spareInstanceId = scrapChassisWithSpare(game, id)
      const reliabilityAtScrap = game.carDetail(id)!.stats.reliability

      const { wrapper } = await mountAt(id)
      await wrapper.get('[data-test="toggle-bay"]').trigger('click')
      await selectPart(wrapper, 'chassis')
      // The line is covered, so nothing is dimmed and no gate caption shows.
      expect(wrapper.find('[data-test="assist-fee-chassis"]').exists()).toBe(false)
      await wrapper.get('[data-test="replace-part-chassis"]').trigger('click')
      const card = wrapper.get('[data-test="replace-drawer"] .part-card')
      expect(card.classes()).not.toContain('no-fit')
      await card.trigger('click')
      await wrapper.get('[data-test="confirm-work"]').trigger('click')
      await flushPromises()

      const chassis = game.gameState.ownedCars[0]!.parts.chassis.installed!
      expect(chassis.id).toBe(spareInstanceId)
      expect(chassis.band).toBe('mint')
      // The old shell is not harvested - it never left the car.
      expect(game.gameState.partInventory.some((pi) => pi.id === spareInstanceId)).toBe(false)
      expect(game.carDetail(id)!.stats.reliability).toBeGreaterThan(reliabilityAtScrap)
    })
  })

  describe('assemblies through the panel (Sprint 87 verbs, Sprint 88 surface)', () => {
    it('an assembly member offers no per-part actions - the panel says it comes off with the assembly and offers the assembly ops', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'rims')
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
      await selectPart(wrapper, 'rims')
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
     * the exact click path that reaches the bench dead end. */
    async function benchTyres(game: ReturnType<typeof useGameStore>) {
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      // The tutorial scenario exactly: scrap tyres (never reconditionable),
      // so the empty-state's below-serviceable gate is genuinely met.
      const car = game.gameState.ownedCars[0]!
      car.parts.tyres = { installed: { ...car.parts.tyres.installed!, band: 'scrap' } }
      const { wrapper, router } = await mountAt(id)
      await selectPart(wrapper, 'rims')
      await wrapper.find('[data-test="remove-assembly-wheelAssembly"]').trigger('click')
      await flushPromises()
      await wrapper.find('[data-test="bench-member-tyres"]').trigger('click')
      await flushPromises()
      return { id, wrapper, router }
    }

    it('a stuck member names the gap, and Replace stands ready with the machine-line gate beside it', async () => {
      const game = useGameStore()
      const { wrapper } = await benchTyres(game)

      // Scrap tyres cannot be reconditioned and the bin holds no replacement:
      // the panel says so and where the shop is, while Replace (the
      // pick-from-your-parts drawer) and the gate it leads to stay visible.
      // The wheels line is neither owned nor hired at a fresh game start.
      const empty = wrapper.find('[data-test="bench-empty-tyres"]')
      expect(empty.exists()).toBe(true)
      expect(empty.text()).toContain('No replacement tyres on hand')
      expect(empty.text()).toContain('parts shop')
      expect(wrapper.find('[data-test="bench-replace-tyres"]').exists()).toBe(true)
      const gate = wrapper.find('[data-test="bench-swap-gate-tyres"]')
      expect(gate.exists()).toBe(true)
      expect(gate.text()).toContain(TOOL_LINES.wheels.tiers[1]!.displayName)
    })

    it('picking a part is inert while the wheels line is neither owned nor hired today', async () => {
      const game = useGameStore()
      const tyresPart = PARTS.find((p) => p.carPartId === 'tyres' && p.fitmentClass === 'entry')!
      game.devGrantPart(tyresPart.id)
      const { wrapper } = await benchTyres(game)
      const stuckMemberId = game.gameState.assemblyInventory![0]!.members.tyres!.id

      await wrapper.find('[data-test="bench-replace-tyres"]').trigger('click')
      await flushPromises()
      await wrapper.find('.part-card').trigger('click')
      await flushPromises()

      // Dimmed and inert: the click lands nowhere, the drawer stays open, and
      // the stuck (scrap) member stays exactly where it was.
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(true)
      expect(game.gameState.assemblyInventory![0]!.members.tyres!.id).toBe(stuckMemberId)
    })

    it('Replace opens the inventory drawer scoped to the slot; picking a part fits it into the member once the wheels line is hired', async () => {
      const game = useGameStore()
      const tyresPart = PARTS.find((p) => p.carPartId === 'tyres' && p.fitmentClass === 'entry')!
      game.devGrantPart(tyresPart.id)
      const { wrapper } = await benchTyres(game)

      await wrapper.find('[data-test="bench-replace-tyres"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(true)

      // Fitting a tyre needs the wheels line for the day - hire it, then the
      // candidate card stops being dimmed and the click lands.
      game.hireMachineLine('wheels')
      await flushPromises()
      await wrapper.find('.part-card').trigger('click')
      await flushPromises()
      expect(game.gameState.assemblyInventory![0]!.members.tyres?.partId).toBe(tyresPart.id)
      // The displaced scrap tyres land in the bin; the drawer closes.
      expect(game.gameState.partInventory.some((p) => p.band === 'scrap')).toBe(true)
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
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

    it('a freshly fitted member shows no empty-state, and Take it off returns', async () => {
      const game = useGameStore()
      const tyresPart = PARTS.find((p) => p.carPartId === 'tyres' && p.fitmentClass === 'entry')!
      game.devGrantPart(tyresPart.id)
      const { wrapper } = await benchTyres(game)

      await wrapper.find('[data-test="bench-replace-tyres"]').trigger('click')
      await flushPromises()
      game.hireMachineLine('wheels')
      await flushPromises()
      await wrapper.find('.part-card').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-test="bench-empty-tyres"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="bench-remove-tyres"]').exists()).toBe(true)
    })

    it('a below-mint member on a stand offers no repair of its own: that work happens at the bench', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      // Pin rims below mint - a stand is not a bench, so even a member with a
      // rung left to climb offers no recondition here; it comes out into the
      // warehouse and goes onto the workshop floor first. The inventory holds
      // no replacement rims either way, so the empty-state guidance stands.
      const car = game.gameState.ownedCars[0]!
      car.parts.rims = { installed: { ...car.parts.rims.installed!, band: 'worn' } }

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'rims')
      await wrapper.find('[data-test="remove-assembly-wheelAssembly"]').trigger('click')
      await flushPromises()
      await wrapper.find('[data-test="bench-member-rims"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-test="bench-recondition-rims"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="bench-empty-rims"]').exists()).toBe(true)
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
      await selectPart(wrapper, 'dampers')
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
      await selectPart(wrapper, 'dampers')
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
      await selectPart(wrapper, 'dampers')
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
            origin: { kind: 'market', day: 1 },
          },
        ],
      }

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'dampers')
      await wrapper.find('[data-test="replace-part-dampers"]').trigger('click')
      expect(wrapper.find(`[data-test="pick-part-${goodInstanceId}"]`).exists()).toBe(true)
      expect(wrapper.find('[data-test="pick-part-scrap-instance"]').exists()).toBe(false)
    })

    /**
     * Two refusals, told apart. A race part is on hand, fits the car, and only
     * wants a tool line the shop has not climbed yet, so the drawer keeps it in
     * view and names that tool. A part of the wrong fitment class can never go
     * on whatever is bought, so it names nothing.
     */
    describe('a part the shop cannot fit yet', () => {
      /** The entry-class race damper - the one SKU the signed grade ladder
       * puts above a fresh shop's suspension line. */
      const raceCoilovers = PARTS.find(
        (p) => p.carPartId === 'dampers' && p.grade === 'race' && p.fitmentClass === 'entry',
      )!

      /** Grants a car with its dampers slot open and the race coilovers on the
       * shelf, returning the car and that instance. */
      function shopWithRaceCoilovers(game: ReturnType<typeof useGameStore>) {
        game.devGrantCar(CARS[0]!.id)
        const carId = game.gameState.ownedCars[0]!.id
        game.devGrantPart(raceCoilovers.id)
        const partInstanceId = game.gameState.partInventory.at(-1)!.id
        game.removePart(carId, 'dampers')
        return { carId, partInstanceId }
      }

      it('renders in the picker, refused, naming the rung that would fit it', async () => {
        const game = useGameStore()
        const { carId, partInstanceId } = shopWithRaceCoilovers(game)

        const { wrapper } = await mountAt(carId)
        await selectPart(wrapper, 'dampers')
        await wrapper.get('[data-test="replace-part-dampers"]').trigger('click')

        const card = wrapper.get(`[data-test="part-card-${partInstanceId}"]`)
        expect(card.classes()).toContain('no-fit')
        expect(card.text()).toContain(`Needs ${TOOL_LINES.suspension.tiers[1]!.displayName}`)

        await card.trigger('click')
        expect(wrapper.text()).not.toContain('planned:')
      })

      it('fits once the suspension line stands on the rung it named', async () => {
        const game = useGameStore()
        const { carId, partInstanceId } = shopWithRaceCoilovers(game)
        game.devSetToolTier('suspension', 2)

        const { wrapper } = await mountAt(carId)
        await selectPart(wrapper, 'dampers')
        await wrapper.get('[data-test="replace-part-dampers"]').trigger('click')

        const card = wrapper.get(`[data-test="part-card-${partInstanceId}"]`)
        expect(card.classes()).not.toContain('no-fit')
        expect(card.text()).not.toContain('Needs')

        await card.trigger('click')
        expect(wrapper.text()).toContain('planned:')
      })

      it('refuses the drag exactly as it refuses the click', async () => {
        const game = useGameStore()
        const { carId, partInstanceId } = shopWithRaceCoilovers(game)

        const { wrapper } = await mountAt(carId)
        await selectPart(wrapper, 'dampers')
        await wrapper.get('[data-test="replace-part-dampers"]').trigger('click')
        await dragPast(wrapper, `[data-test="pick-part-${partInstanceId}"]`)
        await dropOn(wrapper, '[data-test="replace-part-dampers"]')

        expect(wrapper.text()).not.toContain('planned:')
        expect(game.stagedActionsFor(carId)).toEqual([])
      })

      it('names no tool for a part that will never fit, and sorts it below the ones that could', async () => {
        const game = useGameStore()
        // Granted before the fitting parts, so DOM order can only be the
        // drawer's own ranking rather than the order they arrived in.
        const wrongClass = PARTS.find(
          (p) => p.carPartId === 'dampers' && p.grade === 'race' && p.fitmentClass === 'flagship',
        )!
        game.devGrantPart(wrongClass.id)
        const wrongInstanceId = game.gameState.partInventory.at(-1)!.id
        const { carId, partInstanceId } = shopWithRaceCoilovers(game)
        // `removePart` above dropped the car's own stock damper on the shelf:
        // the one candidate here that goes straight back on.
        const stockInstanceId = game.gameState.partInventory.at(-1)!.id

        const { wrapper } = await mountAt(carId)
        await selectPart(wrapper, 'dampers')
        await wrapper.get('[data-test="replace-part-dampers"]').trigger('click')

        const wrongCard = wrapper.get(`[data-test="part-card-${wrongInstanceId}"]`)
        expect(wrongCard.classes()).toContain('no-fit')
        expect(wrongCard.text()).toContain("doesn't fit here")
        expect(wrongCard.text()).not.toContain('Needs')

        expect(
          wrapper.findAll('[data-test^="part-card-"]').map((c) => c.attributes('data-test')),
        ).toEqual([
          `part-card-${stockInstanceId}`,
          `part-card-${partInstanceId}`,
          `part-card-${wrongInstanceId}`,
        ])
      })
    })

    it('Confirm actually installs the staged part onto its exact slot and removes it from inventory', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.removePart(id, 'dampers')
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id
      // dampers is a suspension signature slot - the install needs the line
      // hired for today (a fresh shop owns nothing at tier 2).
      game.hireMachineLine('suspension')

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
      await selectPart(wrapper, 'dampers')
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
      await selectPart(wrapper, 'dampers')
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
      await selectPart(wrapper, 'forcedInduction')
      await wrapper.find('[data-test="replace-part-forcedInduction"]').trigger('click')
      await wrapper.find(`[data-test="pick-part-${partInstanceId}"]`).trigger('click')

      await wrapper.find('[data-test="close-drawer"]').trigger('click')
      expect(wrapper.find('[data-test="replace-drawer"]').exists()).toBe(false)
      await selectPart(wrapper, 'dampers')
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
      await selectPart(wrapper, 'dampers')
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

    it('a free refit (the exact removed part back into its own slot) executes immediately - no stagedCarWork entry', () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.moveCar(id, 'service') // labour only progresses jobs in the bay
      // antiRollBars is a plain bolt-on suspension slot - never machine-gated
      // (dampers/springs are the group's signature slots), so a matching
      // refit is free at every tool tier.
      const removedInstanceId = game.gameState.ownedCars.find((c) => c.id === id)!.parts
        .antiRollBars.installed!.id
      game.removePart(id, 'antiRollBars')
      expect(
        game.gameState.ownedCars.find((c) => c.id === id)!.parts.antiRollBars.installed,
      ).toBeNull()

      const staged = game.stageAction(id, {
        kind: 'install',
        componentId: 'suspension',
        carPartId: 'antiRollBars',
        partInstanceId: removedInstanceId,
      })
      expect(staged).toBe(true)
      expect(
        game.gameState.ownedCars.find((c) => c.id === id)!.parts.antiRollBars.installed?.id,
      ).toBe(removedInstanceId)
      expect(game.gameState.stagedCarWork[id]).toBeUndefined()
    })

    it('a costed install (a different part than the vacated slot held) still stages, not executed immediately', () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.removePart(id, 'dampers')
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      const staged = game.stageAction(id, {
        kind: 'install',
        componentId: 'suspension',
        carPartId: 'dampers' as CarPartId,
        partInstanceId,
      })
      expect(staged).toBe(true)
      expect(game.gameState.stagedCarWork[id]).toEqual([
        { kind: 'install', componentId: 'suspension', carPartId: 'dampers', partInstanceId },
      ])
      // Not applied to the car yet - Confirm is still required for costed work.
      expect(game.gameState.ownedCars.find((c) => c.id === id)!.parts.dampers.installed).toBeNull()
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
      // The zone roll (`bodyPipeline.ts`) now consumes extra seeded draws
      // ahead of symptom rolling, so a fixed grant no longer reliably lands
      // on an honest car - retry until one does.
      let id: string | null = null
      for (let i = 0; i < 30 && !id; i++) {
        game.devGrantCar(CARS[0]!.id)
        const car = game.gameState.ownedCars.at(-1)!
        if (car.symptoms.length === 0) id = car.id
      }
      if (!id) throw new Error('expected an honest granted car within 30 tries')

      const { wrapper } = await mountAt(id)
      expect(wrapper.find('[data-test="car-symptoms"]').exists()).toBe(false)
    })

    it('shows the "?" uncertainty chip in the panel for a still-open symptomatic part, which disappears once Full workup resolves it', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      injectSymptom(game, id)

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'headValvetrain')
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
      await selectPart(wrapper, 'headValvetrain')
      expect(wrapper.find('[data-test="stage-repair-part-headValvetrain"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="panel-assembly-note"]').exists()).toBe(true)
    })

    it('nextPartStepRange returns null for a part nothing targets (the ordinary, reachable case)', () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      expect(game.nextPartStepRange(id, 'body', 'bodywork')).toBeNull()
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

    it('hides the Full workup button entirely once every symptom has narrowed to a single remaining cause (already resolved)', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      injectSymptom(game, id)
      game.gameState = {
        ...game.gameState,
        ownedCars: game.gameState.ownedCars.map((c) =>
          c.id === id
            ? { ...c, symptoms: [{ ...c.symptoms[0]!, remainingCauseIds: ['valve-seals'] }] }
            : c,
        ),
      }

      const { wrapper } = await mountAt(id)
      // The checklist still shows - only the workup button hides.
      expect(wrapper.find('[data-test="car-symptoms"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="car-workup"]').exists()).toBe(false)
    })
  })

  describe("the panel's zone mode (the views select, the one panel acts)", () => {
    /** A zone pinned to a known state. A granted car's zones are rolled, and
     * every stage in the pipeline is gated on the one before it, so a test
     * that wants a specific control live has to say what the metal looks
     * like. */
    function setZone(
      game: ReturnType<typeof useGameStore>,
      carId: string,
      zoneId: ZoneId,
      zone: ZoneState,
    ): void {
      const car = game.gameState.ownedCars.find((c) => c.id === carId)!
      car.zoneState = { ...car.zoneState!, [zoneId]: zone }
    }

    /** Pins the generated car to a known factory colour - a solid palette id,
     * or two joined with `+` for a two-tone - so a test can control which
     * colour is "right" without depending on the generation roll. */
    function setFactoryColour(
      game: ReturnType<typeof useGameStore>,
      carId: string,
      factoryColour: string,
    ): void {
      const car = game.gameState.ownedCars.find((c) => c.id === carId)!
      car.factoryColour = factoryColour
    }

    const ROUGH: ZoneState = {
      metal: 1,
      surface: 1,
      finish: 2,
      panelMissing: false,
      primed: false,
    }
    /** Ready for its colour coat: straight metal, sound surface, primed. */
    const PRIMED: ZoneState = {
      metal: 0,
      surface: 0,
      finish: 2,
      panelMissing: false,
      primed: true,
    }

    async function grantAndDock(zoneId: ZoneId, zone: ZoneState) {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      setZone(game, id, zoneId, zone)
      const { wrapper } = await mountAt(id)
      await selectZone(wrapper, zoneId)
      return { game, id, wrapper }
    }

    it('docks the action panel on a zone region, with its readout and its six stage controls', async () => {
      const { wrapper } = await grantAndDock('bonnet', ROUGH)

      expect(wrapper.find('[data-test="panel-empty"]').exists()).toBe(false)
      expect(wrapper.get('[data-test="panel-name"]').text()).toBe('Bonnet')
      expect(wrapper.get('[data-test="zone-severity-bonnet"]').text()).toBe(
        'metal 1 of 4, surface 1 of 2, finish 2 of 3',
      )
      for (const stage of ['stripPrep', 'beat', 'weld', 'fillAndSand', 'prime', 'polish']) {
        expect(
          wrapper.find(`[data-test="pipeline-${stage}-bonnet"]`).exists(),
          `${stage} control`,
        ).toBe(true)
      }
    })

    it('stages a zone stage from the panel, priced inline, and it lands in Planned work', async () => {
      const { game, id, wrapper } = await grantAndDock('bonnet', ROUGH)

      const plan = game.pipelineActionPlan(game.gameState.ownedCars[0]!, {
        kind: 'pipeline-stage',
        stage: 'stripPrep',
        zoneId: 'bonnet',
      })!
      const button = wrapper.get('[data-test="pipeline-stripPrep-bonnet"]')
      // The price is on the control, never on hover.
      expect(button.attributes('disabled')).toBeUndefined()
      expect(button.text()).toBe(
        `Strip & prep · ${formatYen(plan.costYen)} · ${plan.laborSlots} labour`,
      )

      await button.trigger('click')
      expect(game.stagedActionsFor(id)).toEqual([
        { kind: 'pipeline-stage', stage: 'stripPrep', zoneId: 'bonnet' },
      ])
      expect(wrapper.text()).toContain('Planned work (1)')
      expect(
        wrapper.get('[data-test="staged-row-pipeline-stage:bonnet:stripPrep"]').text(),
      ).toContain('Strip & prep: Bonnet')
    })

    it('a stage whose prerequisite is not met stays disabled and states no total', async () => {
      // Straight, sound metal: there is nothing to beat out.
      const { wrapper } = await grantAndDock('bonnet', PRIMED)

      const beat = wrapper.get('[data-test="pipeline-beat-bonnet"]')
      expect(beat.attributes('disabled')).toBeDefined()
      expect(beat.text()).toBe('Beat')
    })

    it('arms a colour and a finish from the controls, and paints the zone with both', async () => {
      const { game, id, wrapper } = await grantAndDock('bonnet', PRIMED)
      setFactoryColour(game, id, 'lime')
      const colour = PAINT_COLOURS[0]! // 'white' - not this car's factory colour

      // Every tin is a real button with the colour's name as its accessible
      // name - the swatch fill alone is never the only reading.
      const swatch = wrapper.get(`[data-test="paint-swatch-bonnet-${colour.id}"]`)
      expect(swatch.element.tagName).toBe('BUTTON')
      expect(swatch.attributes('aria-label')).toBe(colour.name)
      expect(swatch.attributes('aria-pressed')).toBe('false')
      expect(wrapper.get('[data-test="paint-colour-name"]').text()).toBe('no tin picked yet')
      // No tin picked yet, so there is nothing to plan.
      expect(
        wrapper.get('[data-test="pipeline-paint-bonnet"]').attributes('disabled'),
      ).toBeDefined()

      await swatch.trigger('click')
      expect(
        wrapper.get(`[data-test="paint-swatch-bonnet-${colour.id}"]`).attributes('aria-pressed'),
      ).toBe('true')
      expect(wrapper.get('[data-test="paint-colour-name"]').text()).toBe(colour.name)

      // Stock is refused in a colour this car never wore - the button carries
      // no plan rather than a click that would land on a refusal.
      expect(
        wrapper.get('[data-test="paint-grade-bonnet-stock"]').attributes('disabled'),
      ).toBeDefined()
      const street = wrapper.get('[data-test="paint-grade-bonnet-street"]')
      expect(street.attributes('disabled')).toBeUndefined()
      await street.trigger('click')

      const paint = wrapper.get('[data-test="pipeline-paint-bonnet"]')
      expect(paint.attributes('disabled')).toBeUndefined()
      expect(paint.text()).toContain('Paint · ')
      await paint.trigger('click')

      expect(game.stagedActionsFor(id)).toEqual([
        { kind: 'pipeline-paint', zoneId: 'bonnet', colour: colour.id, grade: 'street' },
      ])
      expect(wrapper.text()).toContain(`Paint (${colour.name}, street): Bonnet`)
    })

    it('marks the factory colour and names it where the car has an iconic one', async () => {
      const game = useGameStore()
      game.devGrantCar('nissan-skyline-gtr-bnr32')
      const id = game.gameState.ownedCars[0]!.id
      setZone(game, id, 'bonnet', PRIMED)
      setFactoryColour(game, id, 'gunmetal')
      const { wrapper } = await mountAt(id)
      await selectZone(wrapper, 'bonnet')

      // The marker is on the swatch itself, and only the factory one carries it.
      expect(wrapper.get('[data-test="paint-swatch-bonnet-gunmetal"]').classes()).toContain(
        'factory',
      )
      expect(wrapper.get('[data-test="paint-swatch-bonnet-white"]').classes()).not.toContain(
        'factory',
      )
      // The BNR32's own gunmetal carries a real manufacturer's name.
      expect(wrapper.get('[data-test="factory-colour-bonnet"]').text()).toContain(
        'Gun Grey Metallic (KH2)',
      )

      // A colour this car never wore: stock is off the table, street is not.
      await wrapper.get('[data-test="paint-swatch-bonnet-white"]').trigger('click')
      expect(
        wrapper.get('[data-test="paint-grade-bonnet-stock"]').attributes('disabled'),
      ).toBeDefined()
      expect(
        wrapper.get('[data-test="paint-grade-bonnet-street"]').attributes('disabled'),
      ).toBeUndefined()

      // Its own colour: stock is back on the table, and the tin reads by its
      // iconic name rather than the plain palette one.
      await wrapper.get('[data-test="paint-swatch-bonnet-gunmetal"]').trigger('click')
      expect(
        wrapper.get('[data-test="paint-grade-bonnet-stock"]').attributes('disabled'),
      ).toBeUndefined()
      expect(wrapper.get('[data-test="paint-colour-name"]').text()).toBe('Gun Grey Metallic (KH2)')
    })

    it('handles a two-tone factory colour by marking both halves and naming the whole scheme', async () => {
      const game = useGameStore()
      game.devGrantCar('toyota-sprinter-trueno-ae86')
      const id = game.gameState.ownedCars[0]!.id
      setZone(game, id, 'bonnet', PRIMED)
      setFactoryColour(game, id, 'white+black')
      const { wrapper } = await mountAt(id)
      await selectZone(wrapper, 'bonnet')

      expect(wrapper.get('[data-test="paint-swatch-bonnet-white"]').classes()).toContain('factory')
      expect(wrapper.get('[data-test="paint-swatch-bonnet-black"]').classes()).toContain('factory')
      expect(wrapper.get('[data-test="factory-colour-bonnet"]').text()).toContain(
        'High-Tech Two-Tone (2T7)',
      )

      // Either half of the factory scheme legitimately arms the stock grade.
      await wrapper.get('[data-test="paint-swatch-bonnet-black"]').trigger('click')
      expect(
        wrapper.get('[data-test="paint-grade-bonnet-stock"]').attributes('disabled'),
      ).toBeUndefined()
    })

    it('offers a fitted panel to take off, priced inline, never an install list beside it', async () => {
      const { game, id, wrapper } = await grantAndDock('bonnet', ROUGH)

      expect(wrapper.find('[data-test^="pipeline-install-panel-bonnet-"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="no-panels-bonnet"]').exists()).toBe(false)
      const remove = wrapper.get('[data-test="pipeline-remove-panel-bonnet"]')
      expect(remove.attributes('disabled')).toBeUndefined()
      expect(remove.text()).toContain('Take it off · ')

      await remove.trigger('click')
      expect(game.stagedActionsFor(id)).toEqual([
        { kind: 'pipeline-remove-panel', zoneId: 'bonnet' },
      ])
      expect(wrapper.text()).toContain('Remove panel: Bonnet')
    })

    it('lists the panels on hand as real buttons and stages the install from one', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      setZone(game, id, 'bonnet', { ...ROUGH, panelMissing: true })
      const panelPart = PARTS.find((p) => p.zoneId === 'bonnet' && p.fitmentClass === 'entry')!
      game.devGrantPart(panelPart.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id

      const { wrapper } = await mountAt(id)
      await selectZone(wrapper, 'bonnet')

      // An empty zone offers install only - no "take it off" for nothing there.
      expect(wrapper.find('[data-test="pipeline-remove-panel-bonnet"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="no-panels-bonnet"]').exists()).toBe(false)
      const option = wrapper.get(`[data-test="pipeline-install-panel-bonnet-${partInstanceId}"]`)
      expect(option.element.tagName).toBe('BUTTON')
      expect(option.text()).toContain(game.partName(panelPart.id))

      await option.trigger('click')
      expect(game.stagedActionsFor(id)).toEqual([
        { kind: 'pipeline-install-panel', zoneId: 'bonnet', partInstanceId },
      ])
      expect(wrapper.text()).toContain(`Install panel (${game.partName(panelPart.id)}): Bonnet`)
    })

    it('says where the panels are when none is on hand, rather than showing an empty control', async () => {
      const { wrapper } = await grantAndDock('bonnet', { ...ROUGH, panelMissing: true })
      const empty = wrapper.get('[data-test="no-panels-bonnet"]')
      expect(empty.text()).toContain('No panel for this zone on hand')
      expect(empty.text()).toContain('parts shop')
    })

    it('round-trips a panel through the shelf: remove puts it in inventory, install takes it back off', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const inventoryBefore = game.gameState.partInventory.length

      const { wrapper } = await mountAt(id)
      await selectZone(wrapper, 'bonnet')
      await wrapper.get('[data-test="pipeline-remove-panel-bonnet"]').trigger('click')
      await wrapper.get('[data-test="confirm-work"]').trigger('click')

      expect(game.gameState.ownedCars[0]!.zoneState!.bonnet.panelMissing).toBe(true)
      expect(game.gameState.partInventory.length).toBe(inventoryBefore + 1)
      const shelved = game.gameState.partInventory.at(-1)!

      await selectZone(wrapper, 'bonnet')
      await wrapper
        .get(`[data-test="pipeline-install-panel-bonnet-${shelved.id}"]`)
        .trigger('click')
      await wrapper.get('[data-test="confirm-work"]').trigger('click')

      expect(game.gameState.ownedCars[0]!.zoneState!.bonnet.panelMissing).toBe(false)
      expect(game.gameState.partInventory.some((p) => p.id === shelved.id)).toBe(false)
    })

    it("a trim zone (bumpers, skirts) offers no metal work - beat, weld and fill-and-sand don't render at all", async () => {
      const { wrapper } = await grantAndDock('front-bumper', {
        finish: 2,
        panelMissing: false,
        primed: false,
      })

      expect(wrapper.get('[data-test="panel-name"]').text()).toBe('Front bumper')
      expect(wrapper.get('[data-test="zone-severity-front-bumper"]').text()).toBe('finish 2 of 3')
      for (const stage of ['stripPrep', 'prime', 'polish']) {
        expect(
          wrapper.find(`[data-test="pipeline-${stage}-front-bumper"]`).exists(),
          `${stage} control`,
        ).toBe(true)
      }
      for (const stage of ['beat', 'weld', 'fillAndSand']) {
        expect(
          wrapper.find(`[data-test="pipeline-${stage}-front-bumper"]`).exists(),
          `${stage} control must not render on trim`,
        ).toBe(false)
      }
    })

    it('says a panel is past saving and disables every stage, rather than offering dead buttons', async () => {
      const { wrapper } = await grantAndDock('bonnet', { ...ROUGH, metal: 4 })

      expect(wrapper.get('[data-test="zone-needs-panel-bonnet"]').text()).toContain('past saving')
      // Beat and weld are the two the metal state itself shuts; nothing on the
      // list offers a total, because none of it would do anything.
      for (const stage of ['beat', 'weld']) {
        expect(
          wrapper.get(`[data-test="pipeline-${stage}-bonnet"]`).attributes('disabled'),
          `${stage} control`,
        ).toBeDefined()
      }
    })

    it('says a panel is off the car and shuts the whole zone pipeline until one is fitted', async () => {
      const { wrapper } = await grantAndDock('bonnet', { ...ROUGH, panelMissing: true })

      expect(wrapper.get('[data-test="zone-needs-panel-bonnet"]').text()).toContain('off the car')
      for (const stage of ['stripPrep', 'beat', 'weld', 'fillAndSand', 'prime', 'polish']) {
        expect(
          wrapper.get(`[data-test="pipeline-${stage}-bonnet"]`).attributes('disabled'),
          `${stage} control`,
        ).toBeDefined()
      }
      expect(
        wrapper.get('[data-test="pipeline-paint-bonnet"]').attributes('disabled'),
      ).toBeDefined()
    })

    it('carries none of the three retired controls: no dropdown, no free-text colour, no hover-only cost', async () => {
      const { wrapper } = await grantAndDock('bonnet', PRIMED)

      const panel = wrapper.get('[data-test="part-action-panel"]')
      expect(panel.findAll('select')).toHaveLength(0)
      expect(panel.findAll('input')).toHaveLength(0)
      for (const testId of ['pipeline-stripPrep-bonnet', 'pipeline-paint-bonnet']) {
        expect(wrapper.get(`[data-test="${testId}"]`).attributes('title'), testId).toBeUndefined()
      }
    })
  })

  describe('the Machine hire panel', () => {
    it('shows In-house for an owned line, Hired today for a line hired this day, and a priced Hire button for everything else', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.devSetToolTier('engine', 2)
      game.hireMachineLine('body')

      const { wrapper } = await mountAt(id)
      expect(wrapper.find('[data-test="machine-hire-chip-engine"]').text()).toBe('In-house')
      expect(wrapper.find('[data-test="machine-hire-chip-body"]').text()).toBe('Hired today')
      expect(wrapper.find('[data-test="hire-machine-suspension"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="hire-machine-suspension"]').text()).toBe(
        `Hire for the day (${formatYen(ECONOMY.machineShopAssist.feeYenByGroup.suspension)})`,
      )
      // A line already owned or hired shows no button at all.
      expect(wrapper.find('[data-test="hire-machine-engine"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="hire-machine-body"]').exists()).toBe(false)
    })

    it('clicking Hire charges the fee once and flips the row to Hired today', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      const cashBefore = game.cashYen

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="hire-machine-suspension"]').trigger('click')
      await flushPromises()

      expect(game.cashYen).toBe(cashBefore - ECONOMY.machineShopAssist.feeYenByGroup.suspension)
      expect(wrapper.find('[data-test="machine-hire-chip-suspension"]').text()).toBe('Hired today')
      expect(wrapper.find('[data-test="hire-machine-suspension"]').exists()).toBe(false)
    })

    it('carries the rolling road as one more row, hired and run the same way', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.moveCar(id, 'service')
      const cashBefore = game.cashYen

      const { wrapper } = await mountAt(id)
      const row = wrapper.find('[data-test="machine-hire-row-dyno"]')
      expect(row.exists()).toBe(true)
      expect(row.text()).toContain(formatYen(ECONOMY.dyno.hireFeeYen))

      await wrapper.find('[data-test="run-dyno-session"]').trigger('click')
      await flushPromises()

      expect(game.cashYen).toBe(cashBefore - ECONOMY.dyno.hireFeeYen)
      expect(game.dynoSessionCarId).toBe(id)
      expect(wrapper.find('[data-test="machine-hire-chip-dyno"]').text()).toBe('Hired today')
      // With the car on the rollers the row offers the sheet, not another run.
      expect(wrapper.find('[data-test="dyno-read-sheet"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="run-dyno-session"]').exists()).toBe(false)
    })

    it('disables the rolling road for a car that is not in a service bay', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.moveCar(id, 'parking')

      const { wrapper } = await mountAt(id)
      const button = wrapper.find('[data-test="run-dyno-session"]')
      expect(button.attributes('disabled')).toBeDefined()
      expect(button.attributes('title')).toBe('Needs to be in a service bay')
    })
  })

  describe('the staged-work machine-line gate', () => {
    it('shows the gate reason on a staged row needing an unhired line, and disables Confirm', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.removePart(id, 'dampers')
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id
      game.stageAction(id, { kind: 'install', componentId: 'suspension', partInstanceId })

      const { wrapper } = await mountAt(id)
      const gateRow = wrapper.find('[data-test="staged-gate-suspension"]')
      expect(gateRow.exists()).toBe(true)
      expect(gateRow.text()).toBe(
        `Needs the ${TOOL_LINES.suspension.tiers[1]!.displayName} for today. Hire it for the day, or buy your own.`,
      )
      expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeDefined()
    })

    it('hiring the line clears the gate reason and re-enables Confirm', async () => {
      const game = useGameStore()
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.removePart(id, 'dampers')
      const part = untaggedPartFor('dampers')
      game.devGrantPart(part.id)
      const partInstanceId = game.gameState.partInventory.at(-1)!.id
      game.stageAction(id, { kind: 'install', componentId: 'suspension', partInstanceId })

      const { wrapper } = await mountAt(id)
      await wrapper.find('[data-test="hire-machine-suspension"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-test="staged-gate-suspension"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="confirm-work"]').attributes('disabled')).toBeUndefined()
    })
  })

  /**
   * Setup work: corner weighting on the springs, show fitment on the rims and
   * underglow on the chassis. None can be judged with the part off the car, so
   * the car's own screen is where they are offered and the machine shop never
   * sees them.
   */
  describe('setup work on the car', () => {
    /** A granted car rolled into a service bay, with `carPartId` fitted mint so
     * the only thing left to refuse is the tools or the standing. */
    function carReadyForSetup(game: ReturnType<typeof useGameStore>, carPartId: CarPartId): string {
      game.devGrantCar(CARS[0]!.id)
      const id = game.gameState.ownedCars[0]!.id
      game.moveCar(id, 'service')
      const car = game.gameState.ownedCars.find((c) => c.id === id)!
      const fitted = car.parts[carPartId].installed!
      game.gameState = {
        ...game.gameState,
        ownedCars: [
          {
            ...car,
            parts: { ...car.parts, [carPartId]: { installed: { ...fitted, band: 'mint' } } },
          },
        ],
      }
      return id
    }

    /** The chassis shop owned, which is what puts the suspension line at the
     * level corner weighting needs. Scene standing is deliberately left where
     * a fresh career puts it: no operation reads it. */
    function withChassisShop(game: ReturnType<typeof useGameStore>): void {
      grantShopFor(game, 'suspension')
    }

    it('offers corner weighting on the springs and show fitment on the rims, each on its own slot', async () => {
      const game = useGameStore()
      const id = carReadyForSetup(game, 'springs')
      withChassisShop(game)

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'springs')
      expect(wrapper.find('[data-test="setup-offer-corner-weighting"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="setup-offer-show-fitment"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="setup-figures-corner-weighting"]').text()).toContain(
        '5 labour',
      )

      await selectPart(wrapper, 'rims')
      expect(wrapper.find('[data-test="setup-offer-show-fitment"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="setup-offer-corner-weighting"]').exists()).toBe(false)

      // A slot with no setup work says nothing about it at all.
      await selectPart(wrapper, 'dampers')
      expect(wrapper.find('[data-test="setup-offer-corner-weighting"]').exists()).toBe(false)
    })

    it('offers underglow on the chassis, and answers to the body line', async () => {
      const game = useGameStore()
      const id = carReadyForSetup(game, 'chassis')
      grantShopFor(game, 'engine')

      const refused = await mountAt(id)
      await selectPart(refused.wrapper, 'chassis')
      expect(refused.wrapper.find('[data-test="setup-offer-underglow"]').exists()).toBe(true)
      expect(
        refused.wrapper.find('[data-test="setup-do-underglow"]').attributes('disabled'),
      ).toBeDefined()

      grantShopFor(game, 'body')
      const allowed = await mountAt(id)
      await selectPart(allowed.wrapper, 'chassis')
      expect(allowed.wrapper.find('[data-test="setup-refusal-underglow"]').exists()).toBe(false)
      expect(allowed.wrapper.find('[data-test="setup-figures-underglow"]').text()).toContain(
        'Style +6',
      )
      await allowed.wrapper.find('[data-test="setup-do-underglow"]').trigger('click')
      await flushPromises()
      expect(
        game.gameState.ownedCars.find((c) => c.id === id)!.parts.chassis.installed!.machining,
      ).toEqual(['underglow'])
    })

    it('does the work on click, writing it onto the part fitted to the car', async () => {
      const game = useGameStore()
      const id = carReadyForSetup(game, 'springs')
      withChassisShop(game)

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'springs')
      const cashBefore = game.gameState.cashYen
      await wrapper.find('[data-test="setup-do-corner-weighting"]').trigger('click')
      await flushPromises()

      const car = game.gameState.ownedCars.find((c) => c.id === id)!
      expect(car.parts.springs.installed!.machining).toEqual(['corner-weighting'])
      expect(game.gameState.cashYen, 'labour, and no money at all').toBe(cashBefore)
      expect(wrapper.find('[data-test="setup-do-corner-weighting"]').text()).toBe('Done')
    })

    it('answers to the suspension line rather than the engine, and says why it refuses', async () => {
      const game = useGameStore()
      const id = carReadyForSetup(game, 'springs')
      grantShopFor(game, 'engine')

      const { wrapper } = await mountAt(id)
      await selectPart(wrapper, 'springs')
      const button = wrapper.find('[data-test="setup-do-corner-weighting"]')
      expect(button.attributes('disabled')).toBeDefined()
      expect(wrapper.find('[data-test="setup-refusal-corner-weighting"]').text()).toContain('shop')
    })

    it('is offered with every scene at none, and refuses a car sitting in parking', async () => {
      const game = useGameStore()
      const id = carReadyForSetup(game, 'springs')
      withChassisShop(game)
      expect(game.gameState.sceneStanding.touge, 'nothing was ever earned').toBe('none')

      const noStanding = await mountAt(id)
      await selectPart(noStanding.wrapper, 'springs')
      expect(noStanding.wrapper.find('[data-test="setup-refusal-corner-weighting"]').exists()).toBe(
        false,
      )

      game.moveCar(id, 'parking')
      const parked = await mountAt(id)
      await selectPart(parked.wrapper, 'springs')
      expect(parked.wrapper.find('[data-test="setup-refusal-corner-weighting"]').text()).toBe(
        'Roll it into a service bay first - this is done to the whole car.',
      )
    })

    /** Swaps the SKU in the springs slot, leaving its condition alone - what
     * decides whether the cut has any originality to take. */
    function fitSprings(game: ReturnType<typeof useGameStore>, id: string, partId: string): void {
      game.gameState = {
        ...game.gameState,
        ownedCars: game.gameState.ownedCars.map((car) =>
          car.id === id
            ? {
                ...car,
                parts: {
                  ...car.parts,
                  springs: { installed: { ...car.parts.springs.installed!, partId } },
                },
              }
            : car,
        ),
      }
    }

    it('states the originality cost as the fraction it is, and as nothing where there is none', async () => {
      const game = useGameStore()
      const id = carReadyForSetup(game, 'springs')
      withChassisShop(game)
      const operation = ECONOMY.machining.operations.find((o) => o.id === 'corner-weighting')!
      expect(operation.authenticityCost, 'the cut costs a fraction of a point').toBeGreaterThan(0)

      fitSprings(game, id, PARTS.find((p) => p.carPartId === 'springs' && p.grade === 'stock')!.id)
      const onStock = await mountAt(id)
      await selectPart(onStock.wrapper, 'springs')
      expect(onStock.wrapper.find('[data-test="setup-figures-corner-weighting"]').text()).toContain(
        `Originality -${operation.authenticityCost}`,
      )

      // An aftermarket slot spent its originality the moment the part went on,
      // so the cut takes nothing more - and says nothing rather than showing a
      // penalty of zero.
      fitSprings(game, id, PARTS.find((p) => p.carPartId === 'springs' && p.grade === 'race')!.id)
      const onAftermarket = await mountAt(id)
      await selectPart(onAftermarket.wrapper, 'springs')
      expect(
        onAftermarket.wrapper.find('[data-test="setup-figures-corner-weighting"]').text(),
      ).toContain('Originality nothing')
    })
  })
})
