import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import EconomyBenchScreen from './EconomyBenchScreen.vue'

/**
 * The bench is a reading instrument, so these assert against what it RENDERED:
 * the opening block prints a real market value, an action appends a line to the
 * running log with a measured delta, and the baseline resets. The figures
 * themselves are held to the sim in `dev/economyBench.test.ts`; this is the
 * wiring.
 */

const mountedWrappers: VueWrapper[] = []

function mountScreen(): VueWrapper {
  const wrapper = mount(EconomyBenchScreen, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

function text(wrapper: VueWrapper, testId: string): string {
  const el = wrapper.find(`[data-test="${testId}"]`)
  expect(el.exists(), `no element with data-test="${testId}"`).toBe(true)
  return el.text()
}

async function click(wrapper: VueWrapper, testId: string): Promise<void> {
  const el = wrapper.find(`[data-test="${testId}"]`)
  expect(el.exists(), `no element with data-test="${testId}"`).toBe(true)
  await el.trigger('click')
}

describe('EconomyBenchScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('opens on a real market value and the sim ledger behind it', () => {
    const wrapper = mountScreen()
    expect(text(wrapper, 'bench-total')).toMatch(/¥[\d,]+/)
    expect(wrapper.find('[data-test="ledger-book"]').exists()).toBe(true)
    expect(text(wrapper, 'bench-foundation')).toMatch(/¥/)
  })

  it('shows every buyer and every channel, with the single-day caveat', () => {
    const wrapper = mountScreen()
    expect(wrapper.findAll('[data-test^="buyer-"]').length).toBeGreaterThan(0)
    expect(wrapper.findAll('[data-test^="channel-"]').length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('SINGLE-DAY')
  })

  it('appends a measured line to the running log when an action runs', async () => {
    const wrapper = mountScreen()
    const before = text(wrapper, 'bench-total')

    await click(wrapper, 'bench-remove')

    expect(wrapper.find('[data-test="log-line-0"]').exists()).toBe(true)
    expect(text(wrapper, 'bench-running-total')).toMatch(/[+-]?¥/)
    // The car really changed, so the headline figure moved with it.
    expect(text(wrapper, 'bench-total')).not.toBe(before)
  })

  it('resets the baseline without touching the car', async () => {
    const wrapper = mountScreen()
    await click(wrapper, 'bench-remove')
    const afterAction = text(wrapper, 'bench-total')

    await click(wrapper, 'bench-reset-baseline')

    expect(wrapper.find('[data-test="log-line-0"]').exists()).toBe(false)
    expect(text(wrapper, 'bench-total')).toBe(afterAction)
  })

  it('prices the room as floor, band and ceiling on every turnout', () => {
    const wrapper = mountScreen()
    expect(text(wrapper, 'bench-room-read')).toMatch(/¥/)
    expect(wrapper.findAll('[data-test^="turnout-"]').length).toBeGreaterThan(0)
  })
})
