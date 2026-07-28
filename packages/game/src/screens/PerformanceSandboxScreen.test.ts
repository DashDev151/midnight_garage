import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import PerformanceSandboxScreen from './PerformanceSandboxScreen.vue'
import { SLOT_STATES } from './dev/sandboxModel'

/**
 * The sandbox screen drives the live sim, so these assert against what it
 * rendered, never against the model layer directly: a car shows four real lap
 * times, a function-or-fail part at scrap replaces them with the reason and the
 * part responsible, set-all reaches every control, a build code round-trips, and
 * a research entry is told plainly it has no price instead of being shown a
 * zero.
 */

const mountedWrappers: VueWrapper[] = []

/** A car whose lap times are worth reading, and the two ends of the roster the
 * screen has to treat differently. */
const IN_GAME_CAR = 'nissan-skyline-gtr-bnr32'
const RESEARCH_CAR = 'porsche-911-turbo-930'

function mountScreen() {
  const wrapper = mount(PerformanceSandboxScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

async function click(wrapper: VueWrapper, testId: string): Promise<void> {
  const el = wrapper.find(`[data-test="${testId}"]`)
  expect(el.exists(), `no element with data-test="${testId}"`).toBe(true)
  await el.trigger('click')
}

function text(wrapper: VueWrapper, testId: string): string {
  return wrapper.find(`[data-test="${testId}"]`).text()
}

/** The condition and tier every one of the 29 controls is showing, read out of
 * the rendered strips. */
function renderedBuild(wrapper: VueWrapper): Record<string, string> {
  const out: Record<string, string> = {}
  for (const component of wrapper.findAll('[data-test^="component-"]')) {
    const id = component.attributes('data-test')!.replace('component-', '')
    const state = component.find('.strip.condition .seg.on').text()
    const grade = component.find('.strip.grade .seg.on').text()
    out[id] = `${state}/${grade}`
  }
  return out
}

describe('PerformanceSandboxScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('loads a car and shows a real lap time on all four courses', async () => {
    const wrapper = mountScreen()
    const game = useGameStore()

    await click(wrapper, `car-pick-${IN_GAME_CAR}`)
    expect(text(wrapper, 'car-name')).toBe('Nissan Skyline GT-R (BNR32)')

    expect(game.context.courses.length).toBe(4)
    for (const course of game.context.courses) {
      // The sticky summary and the lap table both carry it, and both are a time.
      expect(text(wrapper, `hud-lap-${course.id}`)).toMatch(/\d+\.\ds/)
      expect(text(wrapper, `lap-${course.id}`)).toMatch(/^\d+\.\ds$/)
    }
    expect(wrapper.find('[data-test="hud-blocked"]').exists()).toBe(false)

    // Nothing renders as a hole anywhere on the page.
    const body = wrapper.text()
    for (const token of ['undefined', 'NaN', 'null']) expect(body).not.toContain(token)
  })

  it('a function-or-fail part at scrap replaces the times with the reason and the part', async () => {
    const wrapper = mountScreen()
    const game = useGameStore()
    expect(game.context.partsTaxonomyById.brakePadsDiscs.scrapDisablesCar).toBe(true)

    await click(wrapper, `car-pick-${IN_GAME_CAR}`)
    await click(wrapper, 'slot-state-brakePadsDiscs-scrap')

    const banner = text(wrapper, 'hud-blocked')
    expect(banner).toContain('Cannot be driven')
    expect(banner).toContain('Brake Pads & Discs')
    expect(banner).toContain('scrap')

    const blockers = text(wrapper, 'lap-blockers')
    expect(blockers).toContain('Brake Pads & Discs')
    expect(blockers).toContain('scrap')

    // Every course says so in words rather than going blank or showing a dash.
    for (const course of game.context.courses) {
      expect(text(wrapper, `lap-${course.id}`)).toBe('cannot run')
      expect(wrapper.find(`[data-test="hud-lap-${course.id}"]`).exists()).toBe(false)
    }
    expect(wrapper.find('[data-test="component-brakePadsDiscs"]').attributes('data-tone')).toBe(
      'stops',
    )
  })

  it('set-all reaches every control on both axes, and holds a slot no part fits', async () => {
    const wrapper = mountScreen()

    await click(wrapper, `car-pick-${IN_GAME_CAR}`)
    await click(wrapper, 'set-all-state-fine')

    const components = wrapper.findAll('[data-test^="component-"]')
    expect(components.length).toBe(29)
    for (const component of components) {
      expect(component.find('.strip.condition .seg.on').text()).toBe('fine')
    }

    await click(wrapper, 'set-all-grade-race')
    const build = renderedBuild(wrapper)
    const held = Object.keys(build).filter((id) => build[id] !== 'fine/race')
    // Panels, paint and underbody have no aftermarket SKU at any grade, so
    // set-all leaves them where they are rather than fitting something the
    // catalogue does not have.
    expect(held.sort()).toEqual(['paint', 'panels', 'underbody'])
    for (const id of held) {
      expect(build[id]).toBe('fine/stock')
      expect(wrapper.find(`[data-test="slot-grade-${id}-race"]`).exists()).toBe(false)
    }

    // Per group, not just globally.
    await click(wrapper, 'group-state-engine-worn')
    expect(wrapper.find('[data-test="component-block"] .strip.condition .seg.on').text()).toBe(
      'worn',
    )
    expect(wrapper.find('[data-test="component-dampers"] .strip.condition .seg.on').text()).toBe(
      'fine',
    )

    // Every position on the condition control is reachable, including missing.
    for (const state of SLOT_STATES) {
      await click(wrapper, `slot-state-tyres-${state}`)
      expect(wrapper.find('[data-test="component-tyres"] .strip.condition .seg.on').text()).toBe(
        state,
      )
    }
  })

  it('a build code round-trips the car, the tier and all 29 slots', async () => {
    const wrapper = mountScreen()

    // The flow the maintainer described: everything fine, then brakes worn, then
    // street internals, race intake and cooling, and a race wing.
    await click(wrapper, `car-pick-${IN_GAME_CAR}`)
    await click(wrapper, 'set-all-state-fine')
    await click(wrapper, 'slot-state-brakePadsDiscs-worn')
    await click(wrapper, 'slot-state-brakeCalipersLines-worn')
    await click(wrapper, 'slot-grade-internals-street')
    await click(wrapper, 'slot-grade-intake-race')
    await click(wrapper, 'slot-grade-cooling-race')
    await click(wrapper, 'slot-grade-aero-race')
    await click(wrapper, 'tier-uncommon')

    const code = text(wrapper, 'build-code')
    expect(code.split('|')).toEqual(['v1', IN_GAME_CAR, 'uncommon', expect.any(String)])
    expect(code.split('|')[3]).toHaveLength(29)

    const before = renderedBuild(wrapper)
    const laps = text(wrapper, 'hud')

    // Somewhere else entirely, then back through the code alone.
    await click(wrapper, `car-pick-${RESEARCH_CAR}`)
    expect(renderedBuild(wrapper)).not.toEqual(before)

    await wrapper.find('[data-test="code-input"]').setValue(code)
    await click(wrapper, 'load-code')

    expect(text(wrapper, 'code-note')).toBe('Build loaded.')
    expect(text(wrapper, 'car-name')).toBe('Nissan Skyline GT-R (BNR32)')
    expect(renderedBuild(wrapper)).toEqual(before)
    expect(text(wrapper, 'build-code')).toBe(code)
    expect(text(wrapper, 'hud')).toBe(laps)

    // A string that is not one of our codes is refused rather than half-applied.
    await wrapper.find('[data-test="code-input"]').setValue('v1|nope|rare|AAAA')
    await click(wrapper, 'load-code')
    expect(text(wrapper, 'code-note')).toBe('That is not a build code this screen wrote.')
    expect(renderedBuild(wrapper)).toEqual(before)
  })

  it('a research entry is told it has no price rather than shown a zero', async () => {
    const wrapper = mountScreen()

    await click(wrapper, `car-pick-${RESEARCH_CAR}`)

    expect(text(wrapper, 'hud-value')).toContain('not priced')
    expect(text(wrapper, 'value-not-priced')).toContain('no book value')
    expect(wrapper.find('[data-test="value-figures"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('¥0')

    // It still runs: the physics is the real part of a research entry.
    expect(text(wrapper, 'lap-misaki')).toMatch(/^\d+\.\ds$/)
    expect(wrapper.findAll('.badge').length).toBeGreaterThan(0)

    // And an in-game car does get a figure, so the absence is about the car and
    // not about the screen.
    await click(wrapper, `car-pick-${IN_GAME_CAR}`)
    expect(text(wrapper, 'hud-value')).toMatch(/¥[\d,]+/)
    expect(text(wrapper, 'value-figures')).toMatch(/¥[\d,]+/)
  })
})
