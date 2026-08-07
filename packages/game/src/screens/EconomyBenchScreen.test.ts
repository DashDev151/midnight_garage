import { CARS, ECONOMY, ReputationTierSchema } from '@midnight-garage/content'
import { currentGameYear, generatedYearRangeFor } from '@midnight-garage/sim'
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

function input(wrapper: VueWrapper, testId: string): HTMLInputElement {
  const el = wrapper.find(`[data-test="${testId}"]`)
  expect(el.exists(), `no element with data-test="${testId}"`).toBe(true)
  return el.element as HTMLInputElement
}

/** Types into a control the way a user does: the box takes the text, then the
 * control commits it. */
async function type(wrapper: VueWrapper, testId: string, value: number): Promise<HTMLInputElement> {
  const el = wrapper.find(`[data-test="${testId}"]`)
  expect(el.exists(), `no element with data-test="${testId}"`).toBe(true)
  ;(el.element as HTMLInputElement).value = String(value)
  await el.trigger('input')
  await el.trigger('change')
  return el.element as HTMLInputElement
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

  it('never lets an edited input be read as the figure below it', async () => {
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="bench-stale"]').exists()).toBe(false)
    const before = text(wrapper, 'bench-total')

    await type(wrapper, 'bench-mileage', 250_000)

    // The headline has NOT moved, which is exactly the point: it still
    // describes the car on the bench. What has changed is that the screen now
    // says so, rather than leaving the figure to be read as an answer about the
    // mileage in the box.
    expect(text(wrapper, 'bench-total')).toBe(before)
    expect(wrapper.find('[data-test="bench-stale"]').exists()).toBe(true)

    await click(wrapper, 'bench-rebuild')

    expect(wrapper.find('[data-test="bench-stale"]').exists()).toBe(false)
    expect(text(wrapper, 'bench-total')).not.toBe(before)
  })

  it('keeps the running log across a builder edit, and clears it only on a rebuild', async () => {
    const wrapper = mountScreen()
    await click(wrapper, 'bench-remove')
    expect(wrapper.find('[data-test="log-line-0"]').exists()).toBe(true)

    // A measured delta belongs to the car it was measured on, so typing must
    // not quietly rebuild that car out from under the log.
    await type(wrapper, 'bench-mileage', 90_000)
    expect(wrapper.find('[data-test="log-line-0"]').exists()).toBe(true)

    await click(wrapper, 'bench-rebuild')
    expect(wrapper.find('[data-test="log-line-0"]').exists()).toBe(false)
  })

  it('bounds the year box by the car own production window', async () => {
    const wrapper = mountScreen()
    // A model with a genuinely wide window, so the two ends of the clamp are
    // different years and the test can tell them apart.
    const openingYear = currentGameYear('unknown')
    const roomy = [...CARS].sort((a, b) => {
      const width = (car: (typeof CARS)[number]): number => {
        const [oldest, youngest] = generatedYearRangeFor(car, openingYear, ECONOMY)
        return youngest - oldest
      }
      return width(b) - width(a)
    })[0]!
    const [oldest, youngest] = generatedYearRangeFor(roomy, openingYear, ECONOMY)
    expect(youngest).toBeGreaterThan(oldest)

    await wrapper.find('[data-test="bench-model"]').setValue(roomy.id)
    const year = input(wrapper, 'bench-year')
    expect(Number(year.min)).toBe(oldest)
    expect(Number(year.max)).toBe(youngest)

    expect((await type(wrapper, 'bench-year', youngest + 25)).value).toBe(String(youngest))
    // Again, from a spec that is ALREADY at the bound: the clamp has to write
    // the box back itself, since nothing reactive moves to do it for us.
    expect((await type(wrapper, 'bench-year', youngest + 25)).value).toBe(String(youngest))
    expect((await type(wrapper, 'bench-year', oldest - 25)).value).toBe(String(oldest))
  })

  it('says which campaign year and tier a generated lot rolls at', async () => {
    const wrapper = mountScreen()
    const tiers = ReputationTierSchema.options
    const opening = tiers[0]!
    const top = tiers[tiers.length - 1]!
    expect(currentGameYear(top)).not.toBe(currentGameYear(opening))

    expect(text(wrapper, 'bench-generated-note')).toContain(String(currentGameYear(opening)))
    expect(text(wrapper, 'bench-generated-note')).toContain(opening)

    await wrapper.find('[data-test="bench-shop-reputation"]').setValue(top)

    expect(text(wrapper, 'bench-generated-note')).toContain(String(currentGameYear(top)))
    expect(text(wrapper, 'bench-generated-note')).toContain(top)
  })

  it('says where mileage stops adding value', () => {
    const wrapper = mountScreen()
    const note = text(wrapper, 'bench-mileage-note')
    const neutralKm = ECONOMY.valuation.mileageFactorCurve.find(([, factor]) => factor === 1)![0]
    expect(note).toContain(ECONOMY.valuation.mileageFactorCurve[0]![0].toLocaleString('en-US'))
    expect(note).toContain(`passes 1.00 at ${neutralKm.toLocaleString('en-US')} km`)
    expect(text(wrapper, 'bench-fresh-lot-note')).toContain(String(ECONOMY.AUCTION_MIN_AGE_YEARS))
  })
})
