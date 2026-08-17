import { CARS, PAINT_COLOURS, type ZoneId, type ZoneState } from '@midnight-garage/content'
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
 * The body shop room (sprint208.md): the zone diagram and the one zone
 * action panel, moved here from `CarDetailScreen.vue`. The room always
 * works whichever car is in the body bay - there is no route param - so
 * every fixture below grants a car and moves it into the bay before
 * mounting.
 */

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
 * in turn (the ladder walk) grants several, and the bay's next occupant is
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
const PRIMED: ZoneState = {
  metal: 0,
  surface: 0,
  finish: 3,
  panelMissing: false,
  primed: true,
}
const MINT: ZoneState = { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false }

async function grantAndDock(zoneId: ZoneId, zone: ZoneState) {
  const game = useGameStore()
  const id = grantCarInBay(game)
  setZone(game, id, zoneId, zone)
  const { wrapper } = await mountAt()
  await selectZone(wrapper, zoneId)
  return { game, id, wrapper }
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

  it('shows the bay car and the diagram once one is parked there', async () => {
    const game = useGameStore()
    const id = grantCarInBay(game)
    const { wrapper } = await mountAt()
    expect(wrapper.find('[data-test="body-shop-empty"]').exists()).toBe(false)
    expect(wrapper.get('.car-name').text()).toBe(game.carDetail(id)!.displayName)
    expect(wrapper.find('[data-test="workshop-stage"]').exists()).toBe(true)
  })

  it('docks the action panel on a zone region, with its own band, its why chips and its single next action', async () => {
    const { wrapper } = await grantAndDock('bonnet', DENTED)

    expect(wrapper.find('[data-test="panel-empty"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="panel-name"]').text()).toBe('Bonnet')
    expect(wrapper.get('[data-test="zone-band-bonnet"]').text()).toBe('fine')
    expect(wrapper.get('[data-test="zone-why-bonnet"]').text()).toContain('dent')
    expect(wrapper.get('[data-test="zone-why-bonnet"]').text()).toContain('rot')
    const next = wrapper.get('[data-test="zone-next-action-bonnet"]')
    expect(next.text()).toBe('Beat')
    expect(next.attributes('disabled')).toBeUndefined()
  })

  it('runs the next action from the panel immediately - the verb alone in the button, the price beside it', async () => {
    const { game, id, wrapper } = await grantAndDock('bonnet', DENTED)

    const plan = game.pipelineActionPlan(game.gameState.ownedCars[0]!, {
      kind: 'pipeline-stage',
      stage: 'beat',
      zoneId: 'bonnet',
    })!
    const button = wrapper.get('[data-test="zone-next-action-bonnet"]')
    expect(button.text()).toBe('Beat')
    const figures = wrapper.get('[data-test="zone-next-action-figures-bonnet"]')
    expect(figures.text()).toBe(`${formatYen(plan.costYen)} · ${plan.laborSlots} labour`)

    await button.trigger('click')
    const zone = game.gameState.ownedCars.find((c) => c.id === id)!.zoneState!.bonnet
    expect(zone.metal).toBe(0)
  })

  it('walks the whole ladder: weld at the ceiling, fill and sand once metal is clear, prime once bare, and no button once mint', async () => {
    const weld = await grantAndDock('bonnet', { ...MINT, metal: 3 })
    expect(weld.wrapper.get('[data-test="zone-next-action-bonnet"]').text()).toBe('Weld')

    const fill = await grantAndDock('bonnet', { ...MINT, surface: 1 })
    expect(fill.wrapper.get('[data-test="zone-next-action-bonnet"]').text()).toBe('Fill and sand')

    const prime = await grantAndDock('bonnet', { ...MINT, finish: 3 })
    expect(prime.wrapper.get('[data-test="zone-next-action-bonnet"]').text()).toBe('Prime')

    const polish = await grantAndDock('bonnet', { ...MINT, finish: 1 })
    expect(polish.wrapper.get('[data-test="zone-next-action-bonnet"]').text()).toBe('Polish')

    const mint = await grantAndDock('bonnet', MINT)
    expect(mint.wrapper.find('[data-test="zone-next-action-bonnet"]').exists()).toBe(false)
  })

  it('names weld even while the body line is unowned - the button itself carries the disabled state, never a silent wall', async () => {
    const { wrapper } = await grantAndDock('bonnet', { ...MINT, metal: 3 })
    // A fresh shop owns no tool tier - weld names itself regardless
    // (zoneNextStep is structural), and the by-hand disclosure explains why
    // it may be slower rather than presenting a wall with no reason.
    const disclosure = wrapper.get('[data-test="weld-disclosure-bonnet"]')
    expect(disclosure.text()).toContain('By hand with the stick welder')
  })

  it('a trim zone reads and steps off its finish alone - no metal-only next action ever names itself there', async () => {
    const { wrapper } = await grantAndDock('front-bumper', {
      finish: 2,
      panelMissing: false,
      primed: false,
    })

    expect(wrapper.get('[data-test="panel-name"]').text()).toBe('Front bumper')
    expect(wrapper.get('[data-test="zone-band-front-bumper"]').text()).toBe('worn')
    const next = wrapper.get('[data-test="zone-next-action-front-bumper"]')
    expect(next.text()).toBe('Polish')
  })

  it('the discretionary Prep control shows only once there is a coat to strip, and stays a one-word button', async () => {
    const bare = await grantAndDock('bonnet', MINT)
    expect(bare.wrapper.find('[data-test="pipeline-stripPrep-bonnet"]').exists()).toBe(false)

    const { game, id, wrapper } = await grantAndDock('bonnet', PRIMED)
    const prep = wrapper.get('[data-test="pipeline-stripPrep-bonnet"]')
    expect(prep.text()).toBe('Prep')
    expect(prep.attributes('disabled')).toBeUndefined()

    await prep.trigger('click')
    const zone = game.gameState.ownedCars.find((c) => c.id === id)!.zoneState!.bonnet
    expect(zone.primed).toBe(false)
  })

  it('offers a fitted panel to take off, priced beside it, never an install list at the same time', async () => {
    const { game, id, wrapper } = await grantAndDock('bonnet', DENTED)

    expect(wrapper.find('[data-test^="pipeline-install-panel-bonnet-"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="no-panels-bonnet"]').exists()).toBe(false)
    const remove = wrapper.get('[data-test="pipeline-remove-panel-bonnet"]')
    expect(remove.attributes('disabled')).toBeUndefined()
    expect(remove.text()).toBe('Take it off')

    await remove.trigger('click')
    expect(game.gameState.ownedCars.find((c) => c.id === id)!.zoneState!.bonnet.panelMissing).toBe(
      true,
    )
  })

  it('a missing panel offers the standard Fit control, which opens the Warehouse scoped to this zone', async () => {
    const { id, wrapper } = await grantAndDock('bonnet', { ...DENTED, panelMissing: true })
    const ui = useUiStore()

    expect(wrapper.find('[data-test="pipeline-remove-panel-bonnet"]').exists()).toBe(false)
    const fitButton = wrapper.get('[data-test="zone-fit-bonnet"]')
    expect(fitButton.text()).toBe('Fit')

    await fitButton.trigger('click')
    expect(ui.warehouseFit).toEqual({ kind: 'zone', carId: id, zoneId: 'bonnet' })

    // Clicking again while already scoped to this exact zone closes it - the
    // same open/close toggle every other Fit control in the game carries.
    await fitButton.trigger('click')
    expect(ui.warehouseFit).toBeNull()
  })

  it('round-trips a panel through the shelf: remove puts it in inventory, a fresh one installs through the standard Fit flow', async () => {
    const game = useGameStore()
    const id = grantCarInBay(game)
    const inventoryBefore = game.gameState.partInventory.length

    const { wrapper } = await mountAt()
    await selectZone(wrapper, 'bonnet')
    await wrapper.get('[data-test="pipeline-remove-panel-bonnet"]').trigger('click')

    expect(game.gameState.ownedCars[0]!.zoneState!.bonnet.panelMissing).toBe(true)
    expect(game.gameState.partInventory.length).toBe(inventoryBefore + 1)
    const shelved = game.gameState.partInventory.at(-1)!

    // The install itself is the Warehouse's own zone-fit branch
    // (`WarehouseDrawer.test.ts` covers that end to end) - here it is enough
    // to prove the resolver it calls through actually clears the zone.
    game.installPanel(id, 'bonnet', shelved.id)
    expect(game.gameState.ownedCars[0]!.zoneState!.bonnet.panelMissing).toBe(false)
    expect(game.gameState.partInventory.some((p) => p.id === shelved.id)).toBe(false)
  })

  it('a panel past saving still just comes off - the take-off control, never a swap verb', async () => {
    const { wrapper } = await grantAndDock('bonnet', { ...DENTED, metal: 4 })

    expect(wrapper.find('[data-test="zone-next-action-bonnet"]').exists()).toBe(false)
    const remove = wrapper.get('[data-test="pipeline-remove-panel-bonnet"]')
    expect(remove.text()).toBe('Take it off')
    expect(remove.attributes('disabled')).toBeUndefined()
  })

  it('says the panel is Missing with a short tag, never Scrap, and offers only the install picker', async () => {
    const { wrapper } = await grantAndDock('bonnet', { ...DENTED, panelMissing: true })

    expect(wrapper.get('[data-test="zone-panel-off"]').text()).toBe('Missing')
    expect(wrapper.find('[data-test="zone-band-bonnet"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="zone-next-action-bonnet"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="pipeline-remove-panel-bonnet"]').exists()).toBe(false)
  })

  it('picks paint from an owned physical tin, never a colour palette that still needs a purchase', async () => {
    const { game, id, wrapper } = await grantAndDock('bonnet', PRIMED)
    setFactoryColour(game, id, 'lime')
    const colour = PAINT_COLOURS.find((c) => c.id !== 'lime')!

    const empty = wrapper.get('[data-test="no-paint-tins"]')
    expect(empty.text()).toContain('No paint in stock')
    expect(empty.find('a').exists()).toBe(true)

    game.devGiveCash(1_000_000)
    game.buyPaintTin('solid', 'small', colour.id)
    await selectZone(wrapper, 'bonnet')

    const tin = wrapper.get(`[data-test="pipeline-paint-bonnet-solid-${colour.id}"]`)
    expect(tin.element.tagName).toBe('BUTTON')
    expect(tin.attributes('aria-label')).toBe(colour.name)
    expect(tin.attributes('disabled')).toBeUndefined()

    await tin.trigger('click')
    const zone = game.gameState.ownedCars.find((c) => c.id === id)!.zoneState!.bonnet
    expect(zone.colour).toBe(colour.id)
    expect(zone.primed).toBe(false)
  })

  it('paints in a colour this car never wore just as readily as its own - the grade is resolved silently', async () => {
    const game = useGameStore()
    game.devGrantCar('nissan-skyline-gtr-bnr32')
    const id = game.gameState.ownedCars[0]!.id
    expect(game.moveCarToSlot(id, 'body', 0)).toBe(true)
    setZone(game, id, 'bonnet', PRIMED)
    setFactoryColour(game, id, 'gunmetal')
    game.devGiveCash(1_000_000)
    const other = PAINT_COLOURS.find((c) => c.id !== 'gunmetal')!
    game.buyPaintTin('solid', 'small', 'gunmetal')
    game.buyPaintTin('solid', 'small', other.id)

    const { wrapper } = await mountAt()
    await selectZone(wrapper, 'bonnet')

    expect(wrapper.get('[data-test="factory-colour-bonnet"]').text()).toContain(
      'Gun Grey Metallic (KH2)',
    )

    const factoryTin = wrapper.get('[data-test="pipeline-paint-bonnet-solid-gunmetal"]')
    expect(factoryTin.attributes('disabled')).toBeUndefined()
    const otherTin = wrapper.get(`[data-test="pipeline-paint-bonnet-solid-${other.id}"]`)
    expect(otherTin.attributes('disabled')).toBeUndefined()

    await otherTin.trigger('click')
    expect(game.gameState.ownedCars.find((c) => c.id === id)!.zoneState!.bonnet.colour).toBe(
      other.id,
    )
  })

  it('carries no priced sentence inside a button - every figure sits in its own element beside it', async () => {
    const { wrapper } = await grantAndDock('bonnet', PRIMED)

    const panel = wrapper.get('[data-test="zone-action-panel"]')
    for (const button of panel.findAll('button')) {
      expect(button.text()).not.toMatch(/¥/)
      expect(button.text()).not.toMatch(/labour/)
    }
    expect(panel.findAll('select')).toHaveLength(0)
    expect(panel.findAll('input')).toHaveLength(0)
  })

  it('shows the structure band and the finish position together, and the whole remaining ladder, not just the next verb', async () => {
    const { wrapper } = await grantAndDock('bonnet', DENTED)

    expect(wrapper.get('[data-test="zone-band-bonnet"]').text()).toBe('fine')
    // DENTED is unprimed with finish 2 (part-painted, not yet polished) -
    // structure and finish disagree, so both facts have to show.
    expect(wrapper.get('[data-test="zone-finish-bonnet"]').text()).toBe('painted')
    const steps = wrapper.get('[data-test="zone-remaining-bonnet"]').findAll('li')
    expect(steps.map((s) => s.text())).toEqual(['Beat', 'Fill and sand', 'Polish'])
  })

  it('collapses to a plain band chip with no finish tag once structure and finish are both actually done', async () => {
    const { wrapper } = await grantAndDock('bonnet', MINT)
    expect(wrapper.get('[data-test="zone-band-bonnet"]').text()).toBe('mint')
    expect(wrapper.find('[data-test="zone-finish-bonnet"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="zone-remaining-bonnet"]').exists()).toBe(false)
  })

  it('the Take-off control always states its purpose, whether or not it is disabled', async () => {
    const { wrapper } = await grantAndDock('bonnet', DENTED)
    expect(wrapper.get('[data-test="pipeline-remove-panel-purpose"]').text()).toContain('Comes off')
  })

  it('captions a disabled paint swatch with the real structural reason - not primed yet - rather than nothing', async () => {
    const { game, id, wrapper } = await grantAndDock('bonnet', {
      ...MINT,
      finish: 3,
      primed: false,
    })
    setFactoryColour(game, id, 'lime')
    const colour = PAINT_COLOURS.find((c) => c.id !== 'lime')!
    game.devGiveCash(1_000_000)
    game.buyPaintTin('solid', 'small', colour.id)
    await selectZone(wrapper, 'bonnet')

    const tin = wrapper.get(`[data-test="pipeline-paint-bonnet-solid-${colour.id}"]`)
    expect(tin.attributes('disabled')).toBeDefined()
    expect(tin.attributes('title')).toBe('Needs priming first.')
    const groupCaption = wrapper.get('[data-test="pipeline-paint-caption-bonnet-solid"]')
    expect(groupCaption.text()).toBe('Needs priming first.')
  })

  it('a part click docks a part panel - repair, take it off, fit - and replaces whatever the zone panel showed', async () => {
    const { wrapper } = await grantAndDock('bonnet', DENTED)
    expect(wrapper.find('[data-test="panel-name"]').text()).toBe('Bonnet')

    await wrapper.get('[data-test="workshop-region-part-seats"]').trigger('click')

    const name = wrapper.get('[data-test="panel-name"]')
    expect(name.text()).not.toBe('Bonnet')
    expect(wrapper.find('[data-test="zone-band-bonnet"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="part-remove"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="part-fit"]').exists()).toBe(true)

    // Selecting anything replaces the dock outright - the seats region now
    // carries the selected outline, and the stale bonnet zone region no
    // longer does (sprint211.md task A: the root cause this whole sprint
    // traces back to).
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
