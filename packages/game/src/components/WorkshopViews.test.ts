import { CARS } from '@midnight-garage/content'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { WORKSHOP_VIEWS, type WorkshopRegion, type WorkshopViewId } from './workshopViewLayout'
import WorkshopViews from './WorkshopViews.vue'

/**
 * The views' component test. Real pinia, real store, real content - no mocks,
 * so what is asserted is what the game actually renders.
 *
 * Every expected region and count is derived from `WORKSHOP_VIEWS` at runtime.
 * Hardcoding them would mean a layout change silently passing a test that
 * claims to cover the view.
 */

let pinia: Pinia

const mountedWrappers: VueWrapper[] = []
function track<T extends VueWrapper>(wrapper: T): T {
  mountedWrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

const VIEW_IDS: readonly WorkshopViewId[] = ['body', 'engineBay', 'underside']

function grantCar(modelId?: string) {
  const game = useGameStore()
  game.devGrantCar(modelId ?? CARS[0]!.id)
  return { game, carId: game.gameState.ownedCars.at(-1)!.id }
}

function mountFor(carId: string) {
  return track(mount(WorkshopViews, { props: { carId }, global: { plugins: [pinia] } }))
}

/** The `data-test` ids one region should render - the component's own naming
 * rule (a single-rect region owns its stem; a multi-rect one suffixes the rect
 * index), applied to the live layout. */
function testIdsFor(region: WorkshopRegion): string[] {
  const base =
    region.kind === 'part'
      ? `workshop-region-part-${region.partId}`
      : `workshop-region-zone-${region.zoneId}`
  return region.rects.length === 1 ? [base] : region.rects.map((_, index) => `${base}-${index}`)
}

function renderedRegionIds(wrapper: VueWrapper): string[] {
  return wrapper
    .findAll('[data-test^="workshop-region-"]')
    .map((el) => el.attributes('data-test') ?? '')
}

function rectCount(viewId: WorkshopViewId): number {
  return WORKSHOP_VIEWS[viewId].regions.reduce((total, region) => total + region.rects.length, 0)
}

async function openView(wrapper: VueWrapper, viewId: WorkshopViewId): Promise<void> {
  await wrapper.get(`[data-test="workshop-view-tab-${viewId}"]`).trigger('click')
}

describe('WorkshopViews', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('renders all three tabs, opens on the body view, and swaps the region set on a tab click', async () => {
    const { carId } = grantCar()
    const wrapper = mountFor(carId)

    for (const viewId of VIEW_IDS) {
      expect(wrapper.find(`[data-test="workshop-view-tab-${viewId}"]`).exists()).toBe(true)
    }
    // A real pressed state, not a tint: the active tab announces itself.
    expect(wrapper.get('[data-test="workshop-view-tab-body"]').attributes('aria-pressed')).toBe(
      'true',
    )
    expect(
      wrapper.get('[data-test="workshop-view-tab-engineBay"]').attributes('aria-pressed'),
    ).toBe('false')

    // Default view: the body schematic's regions, and none of the engine bay's.
    expect(renderedRegionIds(wrapper).sort()).toEqual(
      WORKSHOP_VIEWS.body.regions.flatMap(testIdsFor).sort(),
    )
    expect(wrapper.find('[data-test="workshop-region-part-block"]').exists()).toBe(false)

    await openView(wrapper, 'engineBay')
    expect(renderedRegionIds(wrapper).sort()).toEqual(
      WORKSHOP_VIEWS.engineBay.regions.flatMap(testIdsFor).sort(),
    )
    expect(wrapper.find('[data-test="workshop-region-zone-bonnet"]').exists()).toBe(false)
    expect(
      wrapper.get('[data-test="workshop-view-tab-engineBay"]').attributes('aria-pressed'),
    ).toBe('true')
  })

  it('gives every region in every view at least one clickable rect, counted from the layout', async () => {
    const { carId } = grantCar()
    const wrapper = mountFor(carId)

    for (const viewId of VIEW_IDS) {
      await openView(wrapper, viewId)
      expect(wrapper.findAll('.wv-region'), `${viewId} rect count`).toHaveLength(rectCount(viewId))

      for (const region of WORKSHOP_VIEWS[viewId].regions) {
        const ids = testIdsFor(region)
        expect(ids.length, `${viewId}: a region with no rect`).toBeGreaterThan(0)
        for (const id of ids) {
          const el = wrapper.get(`[data-test="${id}"]`)
          // Real button semantics with an accessible name, per the art bible's
          // "diegetic skin over standard semantics".
          expect(el.element.tagName, id).toBe('BUTTON')
          expect(el.attributes('aria-label'), id).toBeTruthy()
          expect(el.attributes('disabled'), id).toBeUndefined()
        }
      }
    }
  })

  it('emits a discriminated selection: a part region carries its part id, a zone region its zone id', async () => {
    const { carId } = grantCar()
    const wrapper = mountFor(carId)

    await wrapper.get('[data-test="workshop-region-part-seats"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([{ kind: 'part', partId: 'seats' }])

    await wrapper.get('[data-test="workshop-region-zone-bonnet"]').trigger('click')
    expect(wrapper.emitted('select')?.[1]).toEqual([{ kind: 'zone', zoneId: 'bonnet' }])

    // The underside carries `chassis` as BOTH a part and a zone: the payloads
    // must not collapse into each other.
    await openView(wrapper, 'underside')
    await wrapper.get('[data-test="workshop-region-part-chassis"]').trigger('click')
    expect(wrapper.emitted('select')?.[2]).toEqual([{ kind: 'part', partId: 'chassis' }])
    await wrapper.get('[data-test="workshop-region-zone-chassis"]').trigger('click')
    expect(wrapper.emitted('select')?.[3]).toEqual([{ kind: 'zone', zoneId: 'chassis' }])
  })

  it('law: no region carries a z-index, in any view', async () => {
    const { carId } = grantCar()
    const wrapper = mountFor(carId)

    // The regression test for the whole bug class. Overlapping hit areas that
    // settle their conflicts with a z-index shuffle leave a removed part's
    // empty rectangle able to swallow a click meant for what sits under it.
    // These rects are pairwise disjoint (`workshopViewLayout.test.ts` proves
    // that), so stacking order has nothing to decide and any z-index would be
    // the bug creeping back. happy-dom runs no layout and cannot hit-test, so
    // the rendered style is the honest DOM-level proof available.
    for (const viewId of VIEW_IDS) {
      await openView(wrapper, viewId)
      for (const el of wrapper.findAll('.wv-region')) {
        const style = (el.element as HTMLElement).style
        expect(style.zIndex, `${viewId}: ${el.attributes('data-test')} has a z-index`).toBe('')
        // The rect is still really positioned - the assertion above is not
        // passing because nothing got styled at all.
        expect(style.left, `${el.attributes('data-test')} left`).not.toBe('')
        expect(style.width, `${el.attributes('data-test')} width`).not.toBe('')
      }
    }
  })

  it('law: the art layer paints behind the regions and never becomes a click target', async () => {
    const { carId } = grantCar()
    const wrapper = mountFor(carId)

    const stage = wrapper.get('[data-test="workshop-stage"]')
    const art = wrapper.get('[data-test="workshop-art-layer"]')

    // With no z-index anywhere on the stage, DOM order is the whole of the
    // stacking story: the backdrop has to come first to sit behind the
    // regions. Moving it after them would put a decoration over the hit map.
    expect(stage.element.firstElementChild).toBe(art.element)

    // Decoration only. Not a button, not announced, and carrying none of the
    // region naming, so nothing can dispatch it as a selection.
    expect(art.element.tagName).toBe('DIV')
    expect(art.attributes('aria-hidden')).toBe('true')
    expect(art.classes()).not.toContain('wv-region')
    expect(art.attributes('data-test')).not.toMatch(/^workshop-region-/)

    // The backdrop is bound for real. happy-dom has no canvas 2D context, so
    // the raster itself is empty here and only the binding can be proven.
    for (const viewId of VIEW_IDS) {
      await openView(wrapper, viewId)
      expect((art.element as HTMLElement).style.backgroundImage, viewId).toMatch(/^url\(/)
    }

    // Adding it left the hit map exactly as it was: every rect is a region.
    expect(wrapper.findAll('.wv-region')).toHaveLength(rectCount('underside'))
  })

  it('reads a zone as three layer severities, as pip counts rather than colour alone', () => {
    const { game, carId } = grantCar()
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    car.zoneState = {
      ...car.zoneState!,
      bonnet: { metal: 2, surface: 1, finish: 3, panelMissing: true, primed: false },
    }
    const wrapper = mountFor(carId)

    const layers = wrapper.get('[data-test="workshop-zone-layers-bonnet"]')
    // metal 2 of 3, surface 1 of 2, finish 3 of 3 - eight pips, six filled.
    expect(layers.findAll('.wv-pip')).toHaveLength(8)
    expect(layers.findAll('.wv-pip-on')).toHaveLength(6)

    const region = wrapper.get('[data-test="workshop-region-zone-bonnet"]')
    expect(region.attributes('aria-label')).toBe(
      'Bonnet: metal 2 of 3, surface 1 of 2, finish 3 of 3, panel off',
    )
    expect(region.text()).toContain('panel off')
  })

  it('renders zone regions inert when the car has no zone state, and clicking one emits nothing', async () => {
    const { game, carId } = grantCar()
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    car.zoneState = undefined
    const wrapper = mountFor(carId)

    const bonnet = wrapper.get('[data-test="workshop-region-zone-bonnet"]')
    expect(bonnet.attributes('disabled')).toBeDefined()
    expect(bonnet.text()).toContain('no readings')
    expect(bonnet.findAll('.wv-pip')).toHaveLength(0)
    await bonnet.trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()

    // The parts on the same view are unaffected - only the zones went quiet.
    const seats = wrapper.get('[data-test="workshop-region-part-seats"]')
    expect(seats.attributes('disabled')).toBeUndefined()
    await seats.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([{ kind: 'part', partId: 'seats' }])
  })

  it('keeps a removed part clickable - an empty slot is a work target, not a dead region', async () => {
    const { game, carId } = grantCar()
    expect(game.removePart(carId, 'dampers')).toBe(true)
    const wrapper = mountFor(carId)

    await openView(wrapper, 'underside')
    const dampers = wrapper.get('[data-test="workshop-region-part-dampers"]')
    expect(dampers.classes()).toContain('wv-missing')
    expect(dampers.text()).toContain('missing')
    expect(dampers.attributes('disabled')).toBeUndefined()

    await dampers.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([{ kind: 'part', partId: 'dampers' }])
  })
})
