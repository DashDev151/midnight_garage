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

function mountFor(carId: string, extraProps: Record<string, unknown> = {}) {
  return track(
    mount(WorkshopViews, { props: { carId, ...extraProps }, global: { plugins: [pinia] } }),
  )
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

    // `chassis` is a plain part now, carrying no zone of its own - clicking it
    // on the underside emits a part selection and nothing else.
    await openView(wrapper, 'underside')
    await wrapper.get('[data-test="workshop-region-part-chassis"]').trigger('click')
    expect(wrapper.emitted('select')?.[2]).toEqual([{ kind: 'part', partId: 'chassis' }])
    expect(wrapper.find('[data-test="workshop-region-zone-chassis"]').exists()).toBe(false)

    // A trim zone (no metal underneath it) still emits a real zone selection.
    await openView(wrapper, 'body')
    await wrapper.get('[data-test="workshop-region-zone-front-bumper"]').trigger('click')
    expect(wrapper.emitted('select')?.[3]).toEqual([{ kind: 'zone', zoneId: 'front-bumper' }])
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

  it('reads a zone as Missing rather than Scrap when its panel is absent, with the segments in the blocked style', () => {
    const { game, carId } = grantCar()
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    car.zoneState = {
      ...car.zoneState!,
      bonnet: { metal: 2, surface: 1, finish: 3, panelMissing: true, primed: false },
    }
    const wrapper = mountFor(carId)

    const region = wrapper.get('[data-test="workshop-region-zone-bonnet"]')
    // An absent panel is forced to `scrap` internally for pricing (there is
    // no sixth band value to spell "missing"), but the player never reads
    // that word: no band chip at all, whatever the stale metal/surface
    // fields still say - just the Missing tag and all three segments in
    // their broken/alert style.
    expect(region.find('.band-chip').exists()).toBe(false)
    expect(region.text()).toContain('Missing')
    expect(region.text()).not.toContain('scrap')
    for (const id of ['metal', 'prep', 'paint']) {
      expect(wrapper.get(`[data-test="zone-segment-bonnet-${id}"]`).classes(), id).toContain(
        'wv-segment-blocked',
      )
    }
    // A missing panel is also always why `bodywork` reads as bad as it does - it binds.
    expect(region.attributes('aria-label')).toBe('Bonnet: missing, binding')
  })

  it('tags a panel ruined past welding differently from one that is simply off the car, with the same blocked segments', () => {
    // Two states, two words: both force a replacement and both price the same,
    // but one is a panel you can see and one is a hole.
    const { game, carId } = grantCar()
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    car.zoneState = {
      ...car.zoneState!,
      bonnet: { metal: 4, surface: 1, finish: 3, panelMissing: false, primed: false },
    }
    const wrapper = mountFor(carId)

    const region = wrapper.get('[data-test="workshop-region-zone-bonnet"]')
    expect(region.find('.band-chip').exists()).toBe(false)
    expect(region.text()).toContain('past saving')
    expect(region.text()).not.toContain('panel off')
    for (const id of ['metal', 'prep', 'paint']) {
      expect(wrapper.get(`[data-test="zone-segment-bonnet-${id}"]`).classes(), id).toContain(
        'wv-segment-blocked',
      )
    }
    // The panel note is promoted to the label's own primary word once the
    // segment summary drops out for a blocked row, so it is never repeated.
    expect(region.attributes('aria-label')).toBe('Bonnet: past saving, binding')
  })

  it('renders zone regions inert when the car has no zone state, and clicking one emits nothing', async () => {
    const { game, carId } = grantCar()
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    car.zoneState = undefined
    const wrapper = mountFor(carId)

    const bonnet = wrapper.get('[data-test="workshop-region-zone-bonnet"]')
    expect(bonnet.attributes('disabled')).toBeDefined()
    expect(bonnet.text()).toContain('no readings')
    expect(bonnet.findAll('.band-chip')).toHaveLength(0)
    await bonnet.trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()

    // The parts on the same view are unaffected - only the zones went quiet.
    const seats = wrapper.get('[data-test="workshop-region-part-seats"]')
    expect(seats.attributes('disabled')).toBeUndefined()
    await seats.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([{ kind: 'part', partId: 'seats' }])
  })

  it('marks the zone(s) binding the derived bodywork/paint bands, and no others', () => {
    const { game, carId } = grantCar()
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    car.zoneState = {
      // `finish: 1` too, so bonnet is unambiguously the worst zone on BOTH
      // carriers - otherwise every zone ties for the worst (mint) finish and
      // the test could not tell "marked" from "everything ties".
      bonnet: { metal: 2, surface: 0, finish: 1, panelMissing: false, primed: false },
      boot: { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false },
      'left-front': { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false },
      'left-rear': { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false },
      'right-front': { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false },
      'right-rear': { metal: 0, surface: 0, finish: 0, panelMissing: false, primed: false },
      'front-bumper': { finish: 0, panelMissing: false, primed: false },
      'rear-bumper': { finish: 0, panelMissing: false, primed: false },
      skirts: { finish: 0, panelMissing: false, primed: false },
    }
    const wrapper = mountFor(carId)

    expect(wrapper.get('[data-test="workshop-region-zone-bonnet"]').classes()).toContain(
      'wv-binding',
    )
    expect(wrapper.get('[data-test="workshop-region-zone-boot"]').classes()).not.toContain(
      'wv-binding',
    )
  })

  it('marks the region the `selected` prop names, and no other, whether it is a part or a zone', async () => {
    const { carId } = grantCar()
    const wrapper = mountFor(carId, { selected: { kind: 'part', partId: 'seats' } })

    expect(wrapper.get('[data-test="workshop-region-part-seats"]').classes()).toContain(
      'wv-selected',
    )
    expect(wrapper.get('[data-test="workshop-region-zone-bonnet"]').classes()).not.toContain(
      'wv-selected',
    )

    await wrapper.setProps({ selected: { kind: 'zone', zoneId: 'bonnet' } })
    expect(wrapper.get('[data-test="workshop-region-part-seats"]').classes()).not.toContain(
      'wv-selected',
    )
    expect(wrapper.get('[data-test="workshop-region-zone-bonnet"]').classes()).toContain(
      'wv-selected',
    )
  })

  it('reads a beaten-straight bare zone as metal done but paint pending, never a plain Mint band that hides the unpainted coat', () => {
    // The exact lie a lone condition band tells here: a beaten-straight
    // panel that was never sprayed reads "mint" from structure alone.
    const { game, carId } = grantCar()
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    car.zoneState = {
      ...car.zoneState!,
      // Mint structure, straight off a fresh panel - but never painted, so
      // the finish is still bare metal underneath.
      bonnet: { metal: 0, surface: 0, finish: 3, panelMissing: false, primed: false },
    }
    const wrapper = mountFor(carId)

    const region = wrapper.get('[data-test="workshop-region-zone-bonnet"]')
    expect(region.find('.band-chip').exists()).toBe(false)
    expect(wrapper.get('[data-test="zone-segment-bonnet-metal"]').classes()).toContain(
      'wv-segment-done',
    )
    expect(wrapper.get('[data-test="zone-segment-bonnet-paint"]').classes()).toContain(
      'wv-segment-pending',
    )
    expect(region.attributes('aria-label')).toContain('unpainted')
  })

  it('shows all three segments done once metal, prep and paint are all finished', () => {
    const { game, carId } = grantCar()
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    car.zoneState = {
      ...car.zoneState!,
      bonnet: {
        metal: 0,
        surface: 0,
        finish: 0,
        panelMissing: false,
        primed: false,
        colour: 'lime',
      },
    }
    const wrapper = mountFor(carId)

    for (const id of ['metal', 'prep', 'paint']) {
      expect(wrapper.get(`[data-test="zone-segment-bonnet-${id}"]`).classes(), id).toContain(
        'wv-segment-done',
      )
    }
  })

  it('renders the metal/prep/paint segments in fixed order for a mixed-state zone', () => {
    const { game, carId } = grantCar()
    const car = game.gameState.ownedCars.find((c) => c.id === carId)!
    car.zoneState = {
      ...car.zoneState!,
      // Dented (metal pending), filled and primed already (prep done),
      // painted but not polished (paint pending) - three different states
      // at once, so the fixed order is actually being proven, not assumed.
      bonnet: { metal: 1, surface: 0, finish: 1, panelMissing: false, primed: true },
    }
    const wrapper = mountFor(carId)

    const container = wrapper.get('[data-test="zone-segments-bonnet"]')
    const ids = container.findAll('.wv-segment').map((el) => el.attributes('data-test'))
    expect(ids).toEqual([
      'zone-segment-bonnet-metal',
      'zone-segment-bonnet-prep',
      'zone-segment-bonnet-paint',
    ])
    expect(wrapper.get('[data-test="zone-segment-bonnet-metal"]').classes()).toContain(
      'wv-segment-pending',
    )
    expect(wrapper.get('[data-test="zone-segment-bonnet-prep"]').classes()).toContain(
      'wv-segment-done',
    )
    expect(wrapper.get('[data-test="zone-segment-bonnet-paint"]').classes()).toContain(
      'wv-segment-pending',
    )
  })

  it('renders a trim zone metal segment in its own inert style, never green', () => {
    const { carId } = grantCar()
    const wrapper = mountFor(carId)

    // front-bumper carries no metal/surface fields at all - there is no
    // metalwork to beat or fill, so the segment reads muted, not done.
    const metalSegment = wrapper.get('[data-test="zone-segment-front-bumper-metal"]')
    expect(metalSegment.classes()).toContain('wv-segment-trim')
    expect(metalSegment.classes()).not.toContain('wv-segment-done')
  })

  it('keeps a removed part clickable - an empty slot is a work target, not a dead region', async () => {
    const { game, carId } = grantCar()
    // dampers is blockedBy rims and springs - rims comes off through its
    // wheelAssembly (a plain removePart refuses any assembly member), then
    // springs directly, before dampers itself can come off.
    game.removeAssembly(carId, 'wheelAssembly')
    game.removePart(carId, 'springs')
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
