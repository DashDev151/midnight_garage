import { CARS, ECONOMY, PAINT_COLOURS, type ZoneId, type ZoneState } from '@midnight-garage/content'
import { PANEL_ZONE_IDS } from '@midnight-garage/sim'
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
import { useUiStore } from '../stores/uiStore'
import { formatYen } from '../utils/formatYen'
import BodyShopScreen from './BodyShopScreen.vue'

/**
 * The body shop room (sprint208.md, rebuilt sprint220.md): the zone diagram
 * and the one zone action panel. The room always works whichever car is in
 * the body bay - there is no route param - so every fixture below grants a
 * car and moves it into the bay before mounting.
 */

const PIPELINE_STEP_IDS = ['beatWeld', 'fillAndSand', 'prime', 'paint', 'polish'] as const

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'garage', component: { render: () => h('div') } },
      { path: '/parts', name: 'parts', component: { render: () => h('div') } },
      { path: '/body-shop', name: 'body-shop', component: BodyShopScreen },
    ],
  })
}

const mountedWrappers: VueWrapper[] = []

async function mountAt() {
  const router = makeRouter()
  router.push({ name: 'body-shop' })
  await router.isReady()
  const wrapper = mount(BodyShopScreen, { global: { plugins: [router] } })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

function viewIdCarrying(
  what: string,
  matches: (region: WorkshopRegion) => boolean,
): WorkshopViewId {
  for (const view of Object.values(WORKSHOP_VIEWS)) {
    if (view.regions.some(matches)) return view.id
  }
  throw new Error(`no workshop view carries ${what}`)
}

function regionSelector(base: string): string {
  return `[data-test="${base}"], [data-test="${base}-0"]`
}

async function selectZone(
  wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'],
  zoneId: ZoneId,
): Promise<void> {
  const viewId = viewIdCarrying(zoneId, (r) => r.kind === 'zone' && r.zoneId === zoneId)
  await wrapper.get(`[data-test="workshop-view-tab-${viewId}"]`).trigger('click')
  await wrapper.get(regionSelector(`workshop-region-zone-${zoneId}`)).trigger('click')
  await flushPromises()
}

function setZone(
  game: ReturnType<typeof useGameStore>,
  carId: string,
  zoneId: ZoneId,
  zone: ZoneState,
): void {
  const car = game.gameState.ownedCars.find((c) => c.id === carId)!
  car.zoneState = { ...car.zoneState!, [zoneId]: zone }
}

/** Every zone at once, to the same state - the whole-body header tests need
 * a fully known body rather than whatever the car generator rolled. */
function setAllZones(game: ReturnType<typeof useGameStore>, carId: string, zone: ZoneState): void {
  const car = game.gameState.ownedCars.find((c) => c.id === carId)!
  const zoneState = { ...car.zoneState! }
  for (const zoneId of PANEL_ZONE_IDS) (zoneState as Record<string, ZoneState>)[zoneId] = zone
  car.zoneState = zoneState
}

function setFactoryColour(
  game: ReturnType<typeof useGameStore>,
  carId: string,
  factoryColour: string,
): void {
  const car = game.gameState.ownedCars.find((c) => c.id === carId)!
  car.factoryColour = factoryColour
}

/** Grants a car and moves it straight into the body bay - the fixture every
 * test in this file starts from, since the room only ever works the bay's
 * own occupant. `.at(-1)` (never `[0]`): a test that docks more than one car
 * in turn (the state walk) grants several, and the bay's next occupant is
 * always the one just granted, not the first ever. */
function grantCarInBay(game: ReturnType<typeof useGameStore>): string {
  game.devGrantCar(CARS[0]!.id)
  const id = game.gameState.ownedCars.at(-1)!.id
  expect(game.moveCarToSlot(id, 'body', 0)).toBe(true)
  return id
}

const DENTED: ZoneState = {
  metal: 1,
  surface: 1,
  finish: 2,
  panelMissing: false,
  primed: false,
}
const BARE: ZoneState = { metal: 0, surface: 0, finish: 3, panelMissing: false, primed: false }
const PRIMED: ZoneState = {
  metal: 0,
  surface: 0,
  finish: 3,
  panelMissing: false,
  primed: true,
}
const MINT: ZoneState = { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false }
// finish 2 (dull), never 1: at finish 1 a tier-1 shop is already at its
// polish floor (`planSharedPipelineStage`'s capability gate) and the step
// refuses structurally regardless of stock - finish 2 leaves genuine room to
// polish, so a bare shelf is the ONLY thing blocking it.
const NEEDS_POLISH: ZoneState = {
  metal: 0,
  surface: 0,
  finish: 2,
  panelMissing: false,
  primed: false,
  colour: 'white',
}

async function grantAndDock(zoneId: ZoneId, zone: ZoneState) {
  const game = useGameStore()
  const id = grantCarInBay(game)
  setZone(game, id, zoneId, zone)
  const { wrapper } = await mountAt()
  await selectZone(wrapper, zoneId)
  return { game, id, wrapper }
}

/** The five pipeline buttons' own data-test ids, in DOM order - every fixed-
 * layout test reads this rather than indexing by hand. */
function pipelineButtonIds(wrapper: VueWrapper): string[] {
  return wrapper
    .findAll('[data-test^="pipeline-btn-"]')
    .map((b) => b.attributes('data-test')!.replace('pipeline-btn-', ''))
}

describe('BodyShopScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDragSession()
  })

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('says there is no car in the bay, with a link back, when the bay is empty', async () => {
    const { wrapper } = await mountAt()
    const empty = wrapper.get('[data-test="body-shop-empty"]')
    expect(empty.text()).toContain('No car in the bay')
    expect(wrapper.find('[data-test="zone-action-panel"]').exists()).toBe(false)
  })

  it('shows the bay car, the whole-body header and the diagram once one is parked there', async () => {
    const game = useGameStore()
    const id = grantCarInBay(game)
    const { wrapper } = await mountAt()
    expect(wrapper.find('[data-test="body-shop-empty"]').exists()).toBe(false)
    expect(wrapper.get('.car-name').text()).toBe(game.carDetail(id)!.displayName)
    expect(wrapper.find('[data-test="workshop-stage"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="body-header"]').exists()).toBe(true)
  })

  describe('the five pipeline buttons: always present, in fixed order', () => {
    const cases: Array<[string, ZoneId, ZoneState]> = [
      ['a fresh dented zone', 'bonnet', DENTED],
      ['a zone mid-pipeline (primed, ready to paint)', 'bonnet', PRIMED],
      ['a fully finished zone', 'bonnet', MINT],
      ['a trim zone', 'front-bumper', { finish: 2, panelMissing: false, primed: false }],
      ['a zone with the panel off', 'bonnet', { ...DENTED, panelMissing: true }],
    ]

    it.each(cases)('renders all five, in order, for %s', async (_label, zoneId, zone) => {
      const { wrapper } = await grantAndDock(zoneId, zone)
      expect(pipelineButtonIds(wrapper)).toEqual([...PIPELINE_STEP_IDS])
    })

    it.each(cases)('has exactly the next step enabled for %s', async (_label, zoneId, zone) => {
      const { wrapper } = await grantAndDock(zoneId, zone)
      const buttons = PIPELINE_STEP_IDS.map((id) => wrapper.get(`[data-test="pipeline-btn-${id}"]`))
      const enabledCount = buttons.filter((b) => b.attributes('disabled') === undefined).length
      expect(enabledCount).toBeLessThanOrEqual(1)
    })
  })

  it('beat is next and enabled on a dented zone; the guidance line and figures agree', async () => {
    const { game, wrapper } = await grantAndDock('bonnet', DENTED)
    const button = wrapper.get('[data-test="pipeline-btn-beatWeld"]')
    expect(button.text()).toBe('Beat')
    expect(button.attributes('disabled')).toBeUndefined()

    const plan = game.pipelineActionPlan(game.gameState.ownedCars[0]!, {
      kind: 'pipeline-stage',
      stage: 'beat',
      zoneId: 'bonnet',
    })!
    expect(wrapper.get('[data-test="pipeline-figures-beatWeld"]').text()).toBe(
      `${formatYen(plan.costYen)} · ${plan.laborSlots} labour`,
    )
    expect(wrapper.get('[data-test="zone-guidance"]').text()).toBe(
      `Next: Beat (${formatYen(plan.costYen)}, ${plan.laborSlots} labour)`,
    )
  })

  it('clicking the next button runs the stage immediately', async () => {
    const { game, id, wrapper } = await grantAndDock('bonnet', DENTED)
    await wrapper.get('[data-test="pipeline-btn-beatWeld"]').trigger('click')
    const zone = game.gameState.ownedCars.find((c) => c.id === id)!.zoneState!.bonnet
    expect(zone.metal).toBe(0)
  })

  it('weld at the metal ceiling, never locked', async () => {
    const { wrapper } = await grantAndDock('bonnet', { ...MINT, metal: 3 })
    const button = wrapper.get('[data-test="pipeline-btn-beatWeld"]')
    expect(button.text()).toBe('Weld')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('names weld by hand while the body line is unowned, in a fixed slot under the row', async () => {
    const { wrapper } = await grantAndDock('bonnet', { ...MINT, metal: 3 })
    const disclosure = wrapper.get('[data-test="weld-disclosure"]')
    expect(disclosure.text()).toContain('By hand with the stick welder')
  })

  it('the weld disclosure slot is empty whenever weld is not the next step', async () => {
    const { wrapper } = await grantAndDock('bonnet', DENTED)
    expect(wrapper.get('[data-test="weld-disclosure"]').text()).toBe('')
  })

  it('a trim zone reads beat/weld and fill-and-sand as not needed, and steps off finish alone', async () => {
    const { game, wrapper } = await grantAndDock('front-bumper', {
      finish: 2,
      panelMissing: false,
      primed: false,
    })
    // Tier 2 (`unlocked`) so polish reads as a genuine out-of-stock case
    // rather than the tool-tier lock this fixture would otherwise hit first
    // (sprint222.md: polish now needs the body line unlocked) - that gate is
    // its own describe block below; this test is about the trim/metal split.
    game.devSetToolTier('body', 2)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-test="pipeline-btn-beatWeld"]').text()).toBe('Beat')
    expect(wrapper.get('[data-test="pipeline-caption-beatWeld"]').text()).toContain('Trim panel')
    expect(wrapper.get('[data-test="pipeline-caption-fillAndSand"]').text()).toContain('Trim panel')
    // Polish is genuinely the next step here (a fresh shop owns no polish
    // tin, so it reads disabled - the "out of stock" tests below cover that
    // gating on its own); what this test proves is that beat/weld and
    // fill-and-sand read as not-needed rather than pretending to be next.
    expect(wrapper.get('[data-test="zone-guidance"]').text()).toContain('Next: Polish')
    expect(wrapper.get('[data-test="pipeline-caption-polish"]').text()).toContain('Out of')
  })

  it('a fully done zone shows every step as done or trim, and the guidance line says so', async () => {
    const { wrapper } = await grantAndDock('bonnet', MINT)
    for (const id of PIPELINE_STEP_IDS) {
      expect(wrapper.get(`[data-test="pipeline-btn-${id}"]`).attributes('disabled')).toBeDefined()
    }
    expect(wrapper.get('[data-test="zone-guidance"]').text()).toBe('This panel is done.')
  })

  it('a missing panel locks every pipeline step, names it in the guidance line, and offers only Fit', async () => {
    const { wrapper } = await grantAndDock('bonnet', { ...DENTED, panelMissing: true })
    for (const id of PIPELINE_STEP_IDS) {
      const btn = wrapper.get(`[data-test="pipeline-btn-${id}"]`)
      expect(btn.attributes('disabled')).toBeDefined()
      expect(wrapper.get(`[data-test="pipeline-caption-${id}"]`).text()).toContain(
        'No panel fitted',
      )
    }
    expect(wrapper.get('[data-test="zone-guidance"]').text()).toBe('No panel fitted')
    expect(wrapper.get('[data-test="panel-take-off"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="panel-fit"]').attributes('disabled')).toBeUndefined()
  })

  describe('the status strip', () => {
    it('reads metal, prep and paint off the real zone fields', async () => {
      const { wrapper } = await grantAndDock('bonnet', DENTED)
      expect(wrapper.get('[data-test="zone-status-metal"]').text()).toContain('dented')
      expect(wrapper.get('[data-test="zone-status-prep"]').text()).toContain('rough')
      expect(wrapper.get('[data-test="zone-status-paint"]').text()).toContain('painted')
    })

    it('never hides the paint state behind a structure-only band - a bare panel still reads unpainted', async () => {
      const { wrapper } = await grantAndDock('bonnet', BARE)
      expect(wrapper.get('[data-test="zone-status-paint"]').text()).toContain('unpainted')
    })

    it('reads missing on all three rows once the panel is off', async () => {
      const { wrapper } = await grantAndDock('bonnet', { ...DENTED, panelMissing: true })
      expect(wrapper.get('[data-test="zone-status-metal"]').text()).toContain('missing')
      expect(wrapper.get('[data-test="zone-status-prep"]').text()).toContain('missing')
      expect(wrapper.get('[data-test="zone-status-paint"]').text()).toContain('missing')
    })

    it('shows a colour swatch beside the paint row once a colour is on', async () => {
      const { wrapper } = await grantAndDock('bonnet', NEEDS_POLISH)
      expect(wrapper.find('[data-test="zone-status-paint"] .status-swatch').exists()).toBe(true)
    })
  })

  describe('out-of-stock: an inline buy control that re-enables the step once bought', () => {
    it('shows the missing tin and a buy control, disabled while cash is short', async () => {
      const { game, wrapper } = await grantAndDock('bonnet', NEEDS_POLISH)
      // Tier 2 so polish is structurally ready and the only thing standing
      // between the player and the step is the bare shelf.
      game.devSetToolTier('body', 2)
      game.gameState.cashYen = 0
      await wrapper.vm.$nextTick()
      const button = wrapper.get('[data-test="pipeline-btn-polish"]')
      expect(button.attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-test="pipeline-caption-polish"]').text()).toContain('Out of')
      const buy = wrapper.get('[data-test="pipeline-buy-polish"]')
      expect(buy.text()).toContain('Buy a tin')
      expect(buy.attributes('disabled')).toBeDefined()
    })

    it('buying the tin re-enables the step', async () => {
      const { game, wrapper } = await grantAndDock('bonnet', NEEDS_POLISH)
      game.devSetToolTier('body', 2)
      game.devGiveCash(1_000_000)
      await wrapper.vm.$nextTick()
      const buy = wrapper.get('[data-test="pipeline-buy-polish"]')
      expect(buy.attributes('disabled')).toBeUndefined()

      await buy.trigger('click')
      const button = wrapper.get('[data-test="pipeline-btn-polish"]')
      expect(button.attributes('disabled')).toBeUndefined()
      expect(wrapper.get('[data-test="pipeline-caption-polish"]').text()).toBe('')
    })

    it('lists every missing tin for fill-and-sand, each with its own buy control', async () => {
      const { wrapper } = await grantAndDock('bonnet', {
        metal: 0,
        surface: 1,
        finish: 2,
        panelMissing: false,
        primed: false,
      })
      const caption = wrapper.get('[data-test="pipeline-caption-fillAndSand"]')
      expect(caption.text()).toContain('Out of Body filler tin')
      expect(caption.text()).toContain('Out of Sanding paper pack')
      const fillerBuy = wrapper.get('[data-test="pipeline-buy-fillAndSand-filler"]')
      const paperBuy = wrapper.get('[data-test="pipeline-buy-fillAndSand-paper"]')
      expect(fillerBuy.text()).toContain('Buy a tin')
      expect(paperBuy.text()).toContain('Buy a tin')
      expect(wrapper.get('[data-test="pipeline-karagawa-fillAndSand"]').text()).toContain(
        'Karagawa Express',
      )
    })
  })

  it('captions polish with the tool-tier lock and its hire fee while the body line is unowned', async () => {
    const { wrapper } = await grantAndDock('bonnet', NEEDS_POLISH)
    expect(wrapper.get('[data-test="pipeline-caption-polish"]').text()).toBe(
      `Needs the body line: tier 2 tools or a day's hire (${formatYen(ECONOMY.machineShopAssist.feeYenByGroup.body)})`,
    )
  })

  describe('Karagawa Express: the brand strapline beside every inline buy control', () => {
    it('rotates through exactly the three lines by in-game day, next to the polish shortfall', async () => {
      const { game, wrapper } = await grantAndDock('bonnet', NEEDS_POLISH)
      game.devSetToolTier('body', 2)
      await wrapper.vm.$nextTick()
      const linesByDay = [
        'Karagawa Express: on your shelf before the kettle boils.',
        "Karagawa Express: don't ask how. K.",
        'Karagawa Express: same-day is for amateurs.',
      ]
      for (let day = 0; day < 6; day++) {
        game.gameState.day = day
        await wrapper.vm.$nextTick()
        expect(wrapper.get('[data-test="pipeline-karagawa-polish"]').text()).toBe(
          linesByDay[day % 3],
        )
      }
    })
  })

  describe('the respray row: fixed under the whole-body header, tier 3', () => {
    it('always renders, locked by the booth tier by default', async () => {
      const { wrapper } = await grantAndDock('bonnet', PRIMED)
      const button = wrapper.get('[data-test="respray-button"]')
      expect(button.attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-test="respray-caption"]').text()).toContain(
        `Needs the booth: the body-and-trim shop, or a day's hire (${formatYen(ECONOMY.machineShopAssist.feeYenByGroup.body)})`,
      )
    })

    it('names how many panels are primed once the tier gate clears', async () => {
      const { game, wrapper } = await grantAndDock('bonnet', PRIMED)
      game.devSetToolShopOwned('body-and-trim-shop', true)
      await wrapper.vm.$nextTick()
      expect(wrapper.get('[data-test="respray-button"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-test="respray-caption"]').text()).toContain(
        'Prime at least two panels first: covers 1 primed panel',
      )
    })

    it('shows a stock shortfall with its own buy control and the Karagawa strapline once two panels are primed', async () => {
      const { game, id, wrapper } = await grantAndDock('bonnet', PRIMED)
      game.devSetToolShopOwned('body-and-trim-shop', true)
      setZone(game, id, 'front-bumper', PRIMED)
      await wrapper.vm.$nextTick()

      expect(wrapper.get('[data-test="respray-button"]').attributes('disabled')).toBeDefined()
      const caption = wrapper.get('[data-test="respray-caption"]')
      expect(caption.text()).toContain('Needs 2 uses of')
      expect(caption.text()).toContain('0 on the shelf')
      expect(wrapper.get('[data-test="respray-buy"]').text()).toContain('Buy a tin')
      expect(wrapper.get('[data-test="respray-karagawa"]').text()).toContain('Karagawa Express')
    })

    it('enables once stocked, and clicking it resprays every currently primed zone at once', async () => {
      const { game, id, wrapper } = await grantAndDock('bonnet', PRIMED)
      game.devSetToolShopOwned('body-and-trim-shop', true)
      setZone(game, id, 'front-bumper', PRIMED)
      setFactoryColour(game, id, 'lime')
      game.devGiveCash(1_000_000)
      game.buyPaintTin('solid', 'small', 'lime')
      await wrapper.vm.$nextTick()

      const colourName = PAINT_COLOURS.find((c) => c.id === 'lime')!.name
      const button = wrapper.get('[data-test="respray-button"]')
      expect(button.text()).toContain(colourName)
      expect(button.attributes('disabled')).toBeUndefined()
      expect(wrapper.get('[data-test="respray-figures"]').text()).toBe(`${formatYen(0)} · 2 labour`)

      await button.trigger('click')
      const car = game.gameState.ownedCars.find((c) => c.id === id)!
      expect(car.zoneState!.bonnet.finish).toBe(1)
      expect(car.zoneState!.bonnet.primed).toBe(false)
      expect(car.zoneState!.bonnet.colour).toBe('lime')
      expect(car.zoneState!['front-bumper'].finish).toBe(1)
      expect(car.zoneState!['front-bumper'].colour).toBe('lime')
    })
  })

  describe('the panel row: take it off, fit one, strip back', () => {
    it('offers a fitted panel to take off, priced beside it, its purpose always stated', async () => {
      const { game, id, wrapper } = await grantAndDock('bonnet', DENTED)
      const takeOff = wrapper.get('[data-test="panel-take-off"]')
      expect(takeOff.attributes('disabled')).toBeUndefined()
      expect(takeOff.text()).toBe('Take it off')
      expect(wrapper.get('[data-test="panel-take-off-caption"]').text()).toContain('Comes off')

      await takeOff.trigger('click')
      expect(
        game.gameState.ownedCars.find((c) => c.id === id)!.zoneState!.bonnet.panelMissing,
      ).toBe(true)
    })

    it('Fit a panel is disabled while a panel is on, and opens the Warehouse once it is off', async () => {
      const { wrapper } = await grantAndDock('bonnet', DENTED)
      expect(wrapper.get('[data-test="panel-fit"]').attributes('disabled')).toBeDefined()
    })

    it('a missing panel opens the Warehouse scoped to this zone via Fit a panel', async () => {
      const { id, wrapper } = await grantAndDock('bonnet', { ...DENTED, panelMissing: true })
      const ui = useUiStore()
      const fitButton = wrapper.get('[data-test="panel-fit"]')
      await fitButton.trigger('click')
      expect(ui.warehouseFit).toEqual({ kind: 'zone', carId: id, zoneId: 'bonnet' })
      await fitButton.trigger('click')
      expect(ui.warehouseFit).toBeNull()
    })

    it('round-trips a panel through the shelf: remove puts it in inventory, install clears the zone', async () => {
      const game = useGameStore()
      const id = grantCarInBay(game)
      const inventoryBefore = game.gameState.partInventory.length

      const { wrapper } = await mountAt()
      await selectZone(wrapper, 'bonnet')
      await wrapper.get('[data-test="panel-take-off"]').trigger('click')

      expect(game.gameState.ownedCars[0]!.zoneState!.bonnet.panelMissing).toBe(true)
      expect(game.gameState.partInventory.length).toBe(inventoryBefore + 1)
      const shelved = game.gameState.partInventory.at(-1)!

      game.installPanel(id, 'bonnet', shelved.id)
      expect(game.gameState.ownedCars[0]!.zoneState!.bonnet.panelMissing).toBe(false)
      expect(game.gameState.partInventory.some((p) => p.id === shelved.id)).toBe(false)
    })

    it('strip back is disabled on a bare, unprimed panel', async () => {
      const { wrapper } = await grantAndDock('bonnet', BARE)
      const stripBack = wrapper.get('[data-test="panel-strip-back"]')
      expect(stripBack.attributes('disabled')).toBeDefined()
    })

    it('strip back is enabled once primed, and runs stripPrep on click', async () => {
      const { game, id, wrapper } = await grantAndDock('bonnet', PRIMED)
      const stripBack = wrapper.get('[data-test="panel-strip-back"]')
      expect(stripBack.attributes('disabled')).toBeUndefined()
      expect(wrapper.get('[data-test="panel-strip-back-caption"]').text()).toContain(
        'Strips to bare metal',
      )

      await stripBack.trigger('click')
      const zone = game.gameState.ownedCars.find((c) => c.id === id)!.zoneState!.bonnet
      expect(zone.primed).toBe(false)
    })

    it('strip back is enabled once any coat is on, even unprimed', async () => {
      const { wrapper } = await grantAndDock('bonnet', NEEDS_POLISH)
      expect(wrapper.get('[data-test="panel-strip-back"]').attributes('disabled')).toBeUndefined()
    })

    it('strip back is disabled while the panel is off', async () => {
      const { wrapper } = await grantAndDock('bonnet', { ...PRIMED, panelMissing: true })
      expect(wrapper.get('[data-test="panel-strip-back"]').attributes('disabled')).toBeDefined()
    })
  })

  describe('the paint swatch row', () => {
    it('reserves its row but shows nothing while paint is not yet the coming step', async () => {
      const { wrapper } = await grantAndDock('bonnet', DENTED)
      expect(wrapper.find('[data-test="paint-swatch-row"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="paint-swatch-factory"]').exists()).toBe(false)
    })

    it('shows the factory colour first, greyed with its price and a buy control when not owned', async () => {
      const { game, id, wrapper } = await grantAndDock('bonnet', PRIMED)
      setFactoryColour(game, id, 'lime')
      await selectZone(wrapper, 'bonnet')

      const swatches = wrapper.findAll(
        '[data-test="paint-swatch-factory"], [data-test^="paint-tin-"]',
      )
      expect(swatches[0]!.attributes('data-test')).toBe('paint-swatch-factory')
      expect(wrapper.get('[data-test="paint-swatch-factory-label"]').text()).toContain(
        'at the parts shop',
      )
      expect(wrapper.find('[data-test="paint-buy-factory"]').exists()).toBe(true)
      expect(wrapper.get('[data-test="paint-karagawa-factory"]').text()).toContain(
        'Karagawa Express',
      )
    })

    it('picks an owned tin as the selected swatch, and the Paint button paints it on click', async () => {
      const { game, id, wrapper } = await grantAndDock('bonnet', PRIMED)
      setFactoryColour(game, id, 'lime')
      const colour = PAINT_COLOURS.find((c) => c.id !== 'lime')!
      game.devGiveCash(1_000_000)
      game.buyPaintTin('solid', 'small', colour.id)
      await selectZone(wrapper, 'bonnet')

      await wrapper.get(`[data-test="paint-tin-solid-${colour.id}"]`).trigger('click')
      const paintButton = wrapper.get('[data-test="pipeline-btn-paint"]')
      expect(paintButton.text()).toContain(colour.name)
      expect(paintButton.attributes('disabled')).toBeUndefined()

      await paintButton.trigger('click')
      const zone = game.gameState.ownedCars.find((c) => c.id === id)!.zoneState!.bonnet
      expect(zone.colour).toBe(colour.id)
      expect(zone.primed).toBe(false)
    })

    it('buying the factory tin makes it selectable and paintable', async () => {
      const { game, id, wrapper } = await grantAndDock('bonnet', PRIMED)
      const factoryColourId = game.gameState.ownedCars.find((c) => c.id === id)!.factoryColour
      game.devGiveCash(1_000_000)

      await wrapper.get('[data-test="paint-buy-factory"]').trigger('click')
      const paintButton = wrapper.get('[data-test="pipeline-btn-paint"]')
      expect(paintButton.attributes('disabled')).toBeUndefined()

      await paintButton.trigger('click')
      const zone = game.gameState.ownedCars.find((c) => c.id === id)!.zoneState!.bonnet
      expect(zone.colour).toBe(factoryColourId)
    })

    it('captions why paint is still locked visibly, not title-only, while prime is the coming step', async () => {
      const { game, id, wrapper } = await grantAndDock('bonnet', BARE)
      setFactoryColour(game, id, 'lime')
      game.devGiveCash(1_000_000)
      game.buyPaintTin('solid', 'small', 'lime')
      await selectZone(wrapper, 'bonnet')

      // Prime is next, not paint - the swatch row is still shown (paint is
      // the coming step) but the Paint button itself must say why it cannot
      // fire yet, on the surface rather than only in a title.
      const paintButton = wrapper.get('[data-test="pipeline-btn-paint"]')
      expect(paintButton.attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-test="pipeline-caption-paint"]').text()).toBe('After primer')
    })
  })

  it('carries no priced sentence inside a plain verb button - buy controls are the one deliberate exception', async () => {
    const { wrapper } = await grantAndDock('bonnet', PRIMED)
    const panel = wrapper.get('[data-test="zone-action-panel"]')
    for (const button of panel.findAll('button')) {
      if (button.attributes('data-test')?.startsWith('pipeline-buy-')) continue
      if (button.attributes('data-test') === 'paint-buy-factory') continue
      expect(button.text()).not.toMatch(/¥/)
      expect(button.text()).not.toMatch(/labour/)
    }
  })

  describe('the whole-body header', () => {
    it('counts finished panels and names the next one to work', async () => {
      const game = useGameStore()
      const id = grantCarInBay(game)
      setAllZones(game, id, MINT)
      setZone(game, id, 'bonnet', DENTED)
      const { wrapper } = await mountAt()

      expect(wrapper.get('[data-test="body-header-count"]').text()).toBe(
        `${PANEL_ZONE_IDS.length - 1} of ${PANEL_ZONE_IDS.length} panels finished`,
      )
      expect(wrapper.get('[data-test="body-header-next"]').text()).toBe('Next panel: Bonnet')
    })

    it('reads all panels done once every zone is finished', async () => {
      const game = useGameStore()
      const id = grantCarInBay(game)
      setAllZones(game, id, MINT)
      const { wrapper } = await mountAt()

      expect(wrapper.get('[data-test="body-header-count"]').text()).toBe(
        `${PANEL_ZONE_IDS.length} of ${PANEL_ZONE_IDS.length} panels finished`,
      )
      expect(wrapper.get('[data-test="body-header-next"]').text()).toBe(
        'Next panel: All panels done',
      )
    })

    it('shows the two real carrier bands', async () => {
      const game = useGameStore()
      const id = grantCarInBay(game)
      setAllZones(game, id, MINT)
      const { wrapper } = await mountAt()
      const car = game.gameState.ownedCars.find((c) => c.id === id)!
      expect(wrapper.get('[data-test="body-header-bodywork"]').text()).toBe(
        car.parts.bodywork.installed!.band,
      )
      expect(wrapper.get('[data-test="body-header-paint"]').text()).toBe(
        car.parts.paint.installed!.band,
      )
    })
  })

  it('a part click docks a part panel - repair, take it off, fit - and replaces whatever the zone panel showed', async () => {
    const { wrapper } = await grantAndDock('bonnet', DENTED)
    expect(wrapper.find('[data-test="panel-name"]').text()).toBe('Bonnet')

    await wrapper.get('[data-test="workshop-region-part-seats"]').trigger('click')

    const name = wrapper.get('[data-test="panel-name"]')
    expect(name.text()).not.toBe('Bonnet')
    expect(wrapper.find('[data-test="zone-status-strip"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="part-remove"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="part-fit"]').exists()).toBe(true)

    expect(wrapper.get('[data-test="workshop-region-part-seats"]').classes()).toContain(
      'wv-selected',
    )
    expect(wrapper.get('[data-test="workshop-region-zone-bonnet"]').classes()).not.toContain(
      'wv-selected',
    )
  })

  it('take it off on a part removes exactly the part the panel is showing, never a stale target', async () => {
    const game = useGameStore()
    const id = grantCarInBay(game)
    const { wrapper } = await mountAt()

    await wrapper.get('[data-test="workshop-region-part-seats"]').trigger('click')
    await wrapper.get('[data-test="part-remove"]').trigger('click')

    expect(game.gameState.ownedCars.find((c) => c.id === id)!.parts.seats.installed).toBeNull()
  })
})
