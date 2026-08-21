import {
  BenchZoneSchema,
  PARTS,
  TOOL_SHOPS,
  WORKBENCH,
  type ConditionBand,
  type PartInstance,
} from '@midnight-garage/content'
import { makeMarketOrigin } from '@midnight-garage/sim'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import BenchScreen from './BenchScreen.vue'

/**
 * The bench screen (sprint229.md task 5): the shadow board, the surface, the
 * job tabs and the step strip, for the one bench that puts every relevant
 * tool tier in easy reach - the engine bench.
 *
 * `block` (engine, all-tier-1 Service, all-tier-2 Rebuild, shop-tier Restore)
 * and `exhaust` (engine, Rebuild's first step a machine tool borrowed from
 * the body-trim bench) are the two fixtures used throughout.
 */

const BLOCK_PART = PARTS.find((part) => part.carPartId === 'block')!
const EXHAUST_PART = PARTS.find((part) => part.carPartId === 'exhaust')!
const ENGINE_BENCH = WORKBENCH.benches.find((bench) => bench.id === 'engine-bench')!
const MACHINE_SHOP = TOOL_SHOPS.find((shop) => shop.id === 'machine-shop')!

const mountedWrappers: VueWrapper[] = []

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'garage', component: { render: () => h('div') } },
      { path: '/bench/:benchId', name: 'bench', component: BenchScreen },
    ],
  })
}

async function mountAt(benchId: string) {
  const router = makeRouter()
  router.push({ name: 'bench', params: { benchId } })
  await router.isReady()
  const wrapper = mount(BenchScreen, { global: { plugins: [router] } })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

/** Puts one loose part instance in the warehouse at `band`, unattached to any
 * bench, and hands back its instance id - the same direct-construction idiom
 * `GarageScreen.test.ts`'s `loosePart` uses. */
function loosePart(
  game: ReturnType<typeof useGameStore>,
  partId: string,
  band: ConditionBand,
  suffix = '',
): string {
  const instance: PartInstance = {
    id: `pi-${partId}${suffix}`,
    partId,
    band,
    origin: makeMarketOrigin(game.gameState.day),
  }
  game.gameState = {
    ...game.gameState,
    partInventory: [...game.gameState.partInventory, instance],
  }
  return instance.id
}

/** Every tool id engine-bench's own board carries, in the fixed zone/tier
 * order the store promises: `BenchZoneSchema.options`, tier 1 then tier 2,
 * shop tools excluded (they never appear on the board itself). Derived from
 * content rather than hand-listed, so this never drifts from the data. */
function boardToolIds(): string[] {
  return BenchZoneSchema.options.flatMap((zone) => {
    const shelves = ENGINE_BENCH.zones[zone]!
    return [...shelves.tier1, ...shelves.tier2].map((tool) => tool.id)
  })
}

function shopToolIds(): string[] {
  return BenchZoneSchema.options.flatMap((zone) => ENGINE_BENCH.zones[zone]!.shop.map((t) => t.id))
}

describe('BenchScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('renders all five zones and every tool of the bench, with correct chip states at tier 1, tier 2, hired and shop', async () => {
    const game = useGameStore()
    const { wrapper } = await mountAt('engine-bench')

    // Fixed zone order and locked headings, scoped to the board (not the room strip).
    const headings = wrapper
      .findAll('[data-test="shadow-board"] .zone-heading')
      .map((h) => h.text())
    expect(headings).toEqual(['Clean', 'Fit', 'Cut', 'Join', 'Measure'])

    // Every board tool, in tier1-then-tier2 content order, nothing added or missing.
    const rendered = wrapper
      .findAll('[data-test="shadow-board"] [data-test^="bench-tool-"]')
      .map((el) => el.attributes('data-test'))
    expect(rendered).toEqual(boardToolIds().map((id) => `bench-tool-${id}`))

    // Fresh game: tier 1 owned, tier 2 outline, shop tools not rendered at all.
    expect(wrapper.get('[data-test="bench-tool-degreaser-tin"]').classes()).toContain(
      'bench-tool-owned',
    )
    expect(wrapper.get('[data-test="bench-tool-parts-washer"]').classes()).toContain(
      'bench-tool-outline',
    )
    expect(wrapper.find('[data-test="bench-tool-hot-tank"]').exists()).toBe(false)

    // Hiring the engine line for the day: tier 2 reads 'hired' with its tag.
    expect(game.hireToolLine('engine')).toBe(true)
    await flushPromises()
    expect(wrapper.get('[data-test="bench-tool-parts-washer"]').classes()).toContain(
      'bench-tool-hired',
    )
    expect(wrapper.get('[data-test="bench-tool-tag-parts-washer"]').text()).toBe('hired')

    // Owning the tier 2 rung outright: 'owned', tag gone.
    game.devSetToolTier('engine', 2)
    await flushPromises()
    expect(wrapper.get('[data-test="bench-tool-parts-washer"]').classes()).toContain(
      'bench-tool-owned',
    )
    expect(wrapper.find('[data-test="bench-tool-tag-parts-washer"]').exists()).toBe(false)

    // Buying the covering shop: the shop tool appears in the room, at 'room'.
    game.devSetToolShopOwned(MACHINE_SHOP.id, true)
    await flushPromises()
    expect(wrapper.get('[data-test="bench-tool-hot-tank"]').classes()).toContain('bench-tool-room')
  })

  it('renders the room strip only when the covering shop is owned', async () => {
    const game = useGameStore()
    const { wrapper } = await mountAt('engine-bench')

    expect(wrapper.find('[data-test="bench-room-strip"]').exists()).toBe(false)

    game.devSetToolShopOwned(MACHINE_SHOP.id, true)
    await flushPromises()

    const strip = wrapper.get('[data-test="bench-room-strip"]')
    expect(strip.get('.zone-heading').text()).toBe('The room')
    const stripTools = strip
      .findAll('[data-test^="bench-tool-"]')
      .map((el) => el.attributes('data-test'))
    expect(stripTools).toEqual(shopToolIds().map((id) => `bench-tool-${id}`))
  })

  it('a part goes onto the surface and comes back off through the store, round trip', async () => {
    const game = useGameStore()
    const id = loosePart(game, BLOCK_PART.id, 'poor')
    const { wrapper } = await mountAt('engine-bench')

    expect(wrapper.find('[data-test="bench-empty"]').exists()).toBe(true)

    expect(game.placeOnBench(id)).toBe(true)
    await flushPromises()
    expect(wrapper.find('[data-test="bench-empty"]').exists()).toBe(false)
    const row = wrapper.get(`[data-test="bench-part-${id}"]`)
    expect(row.text()).toContain('poor')
    expect(game.benchView('engine-bench')!.surface.map((p) => p.instanceId)).toContain(id)

    await wrapper.get(`[data-test="bench-return-${id}"]`).trigger('click')
    expect(game.benchView('engine-bench')!.surface.some((p) => p.instanceId === id)).toBe(false)
    expect(wrapper.find('[data-test="bench-empty"]').exists()).toBe(true)
    // Still in the warehouse - a bench is a location, never a second inventory.
    expect(game.gameState.partInventory.some((p) => p.id === id)).toBe(true)
  })

  it('defaults to the first offered kind in ladder order, and an in-progress job wins over it', async () => {
    const game = useGameStore()
    // Worn already meets Service's target, so Service is refused here -
    // proving the default is "first OFFERED", not just "first".
    const wornId = loosePart(game, BLOCK_PART.id, 'worn', '-worn')
    game.placeOnBench(wornId)
    // A second, independent part to prove in-progress beats ladder order.
    const poorId = loosePart(game, BLOCK_PART.id, 'poor', '-poor')
    game.placeOnBench(poorId)

    const { wrapper } = await mountAt('engine-bench')

    await wrapper.get(`[data-test="bench-part-${wornId}"]`).trigger('click')
    expect(wrapper.get('[data-test="bench-job-service"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="bench-job-rebuild"]').classes()).toContain('job-tab-on')

    await wrapper.get(`[data-test="bench-part-${poorId}"]`).trigger('click')
    // Poor is below both targets, so Service (first in ladder) is offered and defaults.
    expect(wrapper.get('[data-test="bench-job-service"]').classes()).toContain('job-tab-on')

    // Step the Rebuild job directly through the store - real progress, not a fixture.
    expect(game.runRepairStep({ kind: 'loose', partInstanceId: poorId }, 'rebuild')).toBe('stepped')
    await flushPromises()
    expect(wrapper.get('[data-test="bench-job-rebuild"]').classes()).toContain('job-tab-on')
    expect(wrapper.get('[data-test="bench-job-service"]').classes()).not.toContain('job-tab-on')
  })

  it('the job card panel above the tabs carries the all-in cost and route figures, and the tabs still just select (sprint230 task 1)', async () => {
    const game = useGameStore()
    const id = loosePart(game, BLOCK_PART.id, 'poor')
    game.placeOnBench(id)
    const { wrapper } = await mountAt('engine-bench')
    await wrapper.get(`[data-test="bench-part-${id}"]`).trigger('click')

    // Every job kind gets its own price-list row, whichever tab is current -
    // the panel is the price list for all three, not a display for the one
    // selected.
    expect(wrapper.findAll('.job-card')).toHaveLength(3)

    const serviceCard = game
      .benchView('engine-bench')!
      .surface.find((p) => p.instanceId === id)!
      .cards.find((c) => c.kind === 'service')!
    const energy = serviceCard.energyPoints + serviceCard.removalEnergyPoints
    const yen = serviceCard.partsYen + (serviceCard.hireFeeYen ?? 0)
    expect(wrapper.get('[data-test="job-card-cost-service"]').text()).toBe(
      `${energy} energy · ${formatYen(yen)}`,
    )
    // Service, all tier 1, everything owned at a fresh start.
    expect(wrapper.get('[data-test="job-card-route-service"]').text()).toBe('own')

    // The tabs remain the selector: clicking Rebuild still swaps the current
    // step and the strip, and the panel above keeps listing all three jobs
    // unfiltered.
    await wrapper.get('[data-test="bench-job-rebuild"]').trigger('click')
    expect(wrapper.get('[data-test="bench-job-rebuild"]').classes()).toContain('job-tab-on')
    expect(wrapper.findAll('.job-card')).toHaveLength(3)
  })

  it('clicking the glowing tool advances the step and the strip ticks', async () => {
    const game = useGameStore()
    const id = loosePart(game, BLOCK_PART.id, 'poor')
    game.placeOnBench(id)
    const { wrapper } = await mountAt('engine-bench')
    await wrapper.get(`[data-test="bench-part-${id}"]`).trigger('click')

    // Service, all tier 1: [degreaser-tin, spanner-roll], both always owned.
    expect(wrapper.get('[data-test="bench-job-service"]').classes()).toContain('job-tab-on')
    expect(wrapper.get('[data-test="step-0"]').text()).toContain('Degrease it in the bay')
    expect(wrapper.get('[data-test="bench-tool-degreaser-tin"]').classes()).toContain(
      'bench-tool-glow',
    )

    const energyBefore = game.gameState.energySpentToday
    await wrapper.get('[data-test="bench-tool-degreaser-tin"]').trigger('click')
    expect(game.gameState.energySpentToday).toBeGreaterThan(energyBefore)

    // The strip ticks: step-0 is gone, step-1 (spanner-roll) is now current and glowing.
    expect(wrapper.find('[data-test="step-0"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="step-1"]').text()).toContain('Chase the threads')
    expect(wrapper.get('[data-test="bench-tool-spanner-roll"]').classes()).toContain(
      'bench-tool-glow',
    )

    // Finishing the last step completes the job and climbs the part's band.
    await wrapper.get('[data-test="bench-tool-spanner-roll"]').trigger('click')
    expect(wrapper.get(`[data-test="bench-part-${id}"]`).text()).toContain('worn')
  })

  it('clicking a non-glowing tool mutates nothing at all', async () => {
    const game = useGameStore()
    const id = loosePart(game, BLOCK_PART.id, 'poor')
    game.placeOnBench(id)
    const { wrapper } = await mountAt('engine-bench')
    await wrapper.get(`[data-test="bench-part-${id}"]`).trigger('click')

    // Current step is degreaser-tin (Service). spanner-roll is on the board
    // but is not the current step's tool.
    expect(wrapper.get('[data-test="bench-tool-spanner-roll"]').classes()).not.toContain(
      'bench-tool-glow',
    )

    const before = game.gameState
    await wrapper.get('[data-test="bench-tool-spanner-roll"]').trigger('click')
    expect(game.gameState).toBe(before)
  })

  it('the slog stand-in appears exactly when the route slogs, and running it spends three times the energy', async () => {
    const game = useGameStore()
    const id = loosePart(game, BLOCK_PART.id, 'poor')
    game.placeOnBench(id)
    const { wrapper } = await mountAt('engine-bench')
    await wrapper.get(`[data-test="bench-part-${id}"]`).trigger('click')
    await wrapper.get('[data-test="bench-job-rebuild"]').trigger('click')

    // Rebuild, all tier 2, none requiresMachine, tier 2 not owned/hired: slog.
    expect(wrapper.get('[data-test="bench-job-rebuild"]').classes()).toContain('job-tab-on')
    expect(wrapper.get('[data-test="bench-tool-parts-washer"]').classes()).toContain(
      'bench-tool-outline',
    )
    expect(wrapper.get('[data-test="bench-tool-parts-washer"]').classes()).not.toContain(
      'bench-tool-glow',
    )
    const standIn = wrapper.get('[data-test="bench-slog-parts-washer"]')
    expect(standIn.text()).toBe('make do')

    const base = game.context.economy.energy.energyPerStepPoints
    const slogMultiplier = game.context.economy.toolHire.slogMultiplier
    expect(wrapper.get('[data-test="step-energy"]').text()).toBe(
      `${base * slogMultiplier} energy x3, no proper tool`,
    )

    const energyBefore = game.gameState.energySpentToday
    await standIn.trigger('click')
    expect(game.gameState.energySpentToday - energyBefore).toBe(base * slogMultiplier)
  })

  it('each refusal renders its locked copy verbatim', async () => {
    const game = useGameStore()
    const id = loosePart(game, BLOCK_PART.id, 'poor')
    game.placeOnBench(id)
    const { wrapper } = await mountAt('engine-bench')
    await wrapper.get(`[data-test="bench-part-${id}"]`).trigger('click')

    // no-energy: the day has nothing left for even one tier-1 step.
    game.gameState = { ...game.gameState, energySpentToday: 999_999 }
    await flushPromises()
    await wrapper.get('[data-test="bench-tool-degreaser-tin"]').trigger('click')
    expect(wrapper.get('[data-test="bench-refusal"]').text()).toBe('Not enough left in the day.')
    game.gameState = { ...game.gameState, energySpentToday: 0 }
    await flushPromises()

    // no-cash: the day has energy, but no cash for the parts bill.
    const card = game
      .benchView('engine-bench')!
      .surface.find((p) => p.instanceId === id)!
      .cards.find((c) => c.kind === 'service')!
    expect(card.partsYen).toBeGreaterThan(0)
    game.gameState = { ...game.gameState, cashYen: 0 }
    await flushPromises()
    await wrapper.get('[data-test="bench-tool-degreaser-tin"]').trigger('click')
    expect(wrapper.get('[data-test="bench-refusal"]').text()).toBe(
      `The parts bill wants ${formatYen(card.partsYen)} you don't have.`,
    )

    // needs-shop and needs-machine: both reasons have locked copy
    // (`BenchScreen.vue`'s `refusalNote`), but neither is reachable by
    // clicking anything in the mounted screen with any of the game's real
    // recipes - verified below and explained in the accompanying report.
    // Restore is the only kind whose recipes ever reach a shop-tier tool,
    // and the shop-restore rule refuses the whole CARD before any step is
    // inspected, so its tab can never be selected without owning the shop
    // (at which point every step reads 'owned', never locked). The one
    // tier-2 `requiresMachine` step that lives on its own bench with no
    // override (chassis's Rebuild) sits on a `removable: false` part, which
    // the location gate refuses at the card level too, before the step is
    // ever reached; the other three `requiresMachine` steps in the game are
    // either shop-tier or, for `exhaust`'s Rebuild, borrow a tool from a
    // DIFFERENT bench than the one the part is laid out on, so no chip for
    // it ever renders on the part's own bench screen. What IS verified here
    // is that the store's own classification - the one the screen trusts
    // verbatim - is correct for both reasons, using the exact call
    // `onRunStep` makes:
    expect(game.runRepairStep({ kind: 'loose', partInstanceId: id }, 'restore')).toEqual({
      refused: 'needs-shop',
    })

    const exhaustId = loosePart(game, EXHAUST_PART.id, 'poor', '-exhaust')
    game.placeOnBench(exhaustId)
    expect(game.runRepairStep({ kind: 'loose', partInstanceId: exhaustId }, 'rebuild')).toEqual({
      refused: 'needs-machine',
    })
  })

  it('shows the locked empty-surface copy when nothing is on the bench', async () => {
    const { wrapper } = await mountAt('engine-bench')
    expect(wrapper.find('[data-test="bench-surface"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="bench-empty"]').text()).toBe(
      'Nothing on the bench. Bring a part over from the warehouse.',
    )
  })
})
