import { normalizedPowerScore } from '@midnight-garage/sim'
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
 * part responsible, set-all reaches every control, a build code round-trips, the
 * two value inputs move the value and nothing else, power reads on both its
 * scales, and a research entry is told plainly it has no price instead of being
 * shown a zero.
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

/** A rendered yen figure as a number, so two of them can be compared. */
function yen(wrapper: VueWrapper, testId: string): number {
  const rendered = text(wrapper, testId)
  const digits = rendered.replace(/[^0-9]/g, '')
  expect(digits.length, `no yen figure in "${rendered}"`).toBeGreaterThan(0)
  return Number(digits)
}

/** Everything a value input must leave exactly where it found it: the four lap
 * times, all six stat readings and the physical figures the lap runs on. */
function physicsReadings(wrapper: VueWrapper): Record<string, string> {
  const out: Record<string, string> = {}
  for (const cell of wrapper.findAll('[data-test^="lap-"], [data-test^="stat-"]')) {
    out[cell.attributes('data-test')!] = cell.text()
  }
  for (const cell of wrapper.findAll('[data-test^="physical-"]')) {
    out[cell.attributes('data-test')!] = cell.text()
  }
  return out
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

  it('set-all reaches every control on both axes, leaving no slot behind', async () => {
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
    // Every one of the 29 slots carries an aftermarket ladder, so set-all
    // reaches all of them and holds nothing back. A slot listed here has no
    // race SKU in the catalogue, which is a content gap rather than a
    // misbehaving control.
    expect(held.sort()).toEqual([])

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

    // A representative build flow: everything fine, then brakes worn, then street
    // internals, race intake and cooling, and a race wing.
    await click(wrapper, `car-pick-${IN_GAME_CAR}`)
    await click(wrapper, 'set-all-state-fine')
    await click(wrapper, 'slot-state-brakePadsDiscs-worn')
    await click(wrapper, 'slot-state-brakeCalipersLines-worn')
    await click(wrapper, 'slot-grade-internals-street')
    await click(wrapper, 'slot-grade-intake-race')
    await click(wrapper, 'slot-grade-cooling-race')
    await click(wrapper, 'slot-grade-aero-race')
    await click(wrapper, 'tier-enthusiast')

    const code = text(wrapper, 'build-code')
    expect(code.split('|')).toEqual(['v1', IN_GAME_CAR, 'enthusiast', expect.any(String)])
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

  it('mileage and market heat move the value, and move nothing else at all', async () => {
    const wrapper = mountScreen()

    await click(wrapper, `car-pick-${IN_GAME_CAR}`)
    const physics = physicsReadings(wrapper)
    const atDefault = yen(wrapper, 'value-current')
    expect(Object.keys(physics).length).toBeGreaterThan(10)

    // A car with a life behind it is worth less, and the stock-and-mint figure
    // it is compared against moves with it, because that is the same car.
    const stockAtDefault = yen(wrapper, 'value-stock')
    await wrapper.find('[data-test="mileage-slider"]').setValue('250000')
    expect(yen(wrapper, 'value-current')).toBeLessThan(atDefault)
    expect(yen(wrapper, 'value-stock')).toBeLessThan(stockAtDefault)
    expect(text(wrapper, 'value-note')).toContain('250,000km')
    expect(physicsReadings(wrapper)).toEqual(physics)

    // The number box says the same thing as the slider, and clamps.
    await wrapper.find('[data-test="mileage-number"]').setValue('900000')
    expect(text(wrapper, 'value-note')).toContain('250,000km')

    await click(wrapper, 'mileage-default')
    expect(yen(wrapper, 'value-current')).toBe(atDefault)

    // Heat is the market, not the car: 100 is neutral, and either side of it
    // reprices the same car without touching what the car is.
    await wrapper.find('[data-test="heat-slider"]').setValue('150')
    expect(yen(wrapper, 'value-current')).toBeGreaterThan(atDefault)
    expect(text(wrapper, 'value-note')).toContain('market heat 150')
    expect(physicsReadings(wrapper)).toEqual(physics)

    await wrapper.find('[data-test="heat-number"]').setValue('50')
    expect(yen(wrapper, 'value-current')).toBeLessThan(atDefault)
    expect(physicsReadings(wrapper)).toEqual(physics)
  })

  it('power reads in PS and on the same 0 to 100 scale as the other stats', async () => {
    const wrapper = mountScreen()
    const game = useGameStore()

    await click(wrapper, `car-pick-${IN_GAME_CAR}`)
    const ps = Number(text(wrapper, 'stat-power'))
    expect(ps).toBeGreaterThan(0)

    // The sim's own normalisation, as a percentage: the screen never invents a
    // second one.
    expect(Number(text(wrapper, 'stat-powerScore'))).toBeCloseTo(
      normalizedPowerScore(ps, game.context.economy) * 100,
      1,
    )

    // Both readings are on screen, and the PS figure is the one the physics
    // consumes rather than being replaced by the normalised one.
    const stats = text(wrapper, 'stats-table')
    expect(stats).toContain('PS')
    expect(stats).toContain('0 to 100')
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
