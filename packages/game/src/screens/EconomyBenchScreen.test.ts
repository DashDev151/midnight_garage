import {
  CARS,
  COURSES,
  ECONOMY,
  PAINT_COLOURS,
  ReputationTierSchema,
  StatKeySchema,
  ZoneIdSchema,
  type CarInstance,
  type CarModel,
  type GameState,
} from '@midnight-garage/content'
import {
  BEYOND_REPAIR_METAL,
  MAX_REPAIRABLE_METAL,
  currentGameYear,
  factoryColourSet,
  generatedYearRangeFor,
  mileageRangeForAge,
  type SimContext,
} from '@midnight-garage/sim'
import { mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import EconomyBenchScreen from './EconomyBenchScreen.vue'
import {
  benchCarInstance,
  benchGameState,
  defaultCarSpec,
  defaultShopSpec,
} from './dev/economyBench'
import { bandPricedChannelsFor, statsPanelFor } from './dev/economyBenchReadout'
import { benchPreviewFor, benchValueSummaryFor } from './dev/economyBenchPreview'
import { useGameStore } from '../stores/gameStore'
import { formatYen, formatYenDelta } from '../utils/formatYen'

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

/** The same context, the same car and the same world the screen opens on, so a
 * figure recomputed here is a figure about the car actually on the bench. */
function benchContext(): SimContext {
  return useGameStore().context
}
function benchModel(): CarModel {
  return benchContext().models[0]!
}
function benchDefaultCar(): CarInstance {
  const context = benchContext()
  const model = benchModel()
  return benchCarInstance(defaultCarSpec(model, defaultShopSpec(context), context), model, context)
}
function benchState(): GameState {
  const context = benchContext()
  return benchGameState(defaultShopSpec(context), benchDefaultCar(), context)
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

  it('says where mileage starts taking value away', () => {
    const wrapper = mountScreen()
    const note = text(wrapper, 'bench-mileage-note')
    const flatBand = ECONOMY.valuation.mileageFactorCurve.filter(([, factor]) => factor === 1)
    const discountFromKm = flatBand[flatBand.length - 1]![0]
    expect(note).toContain(ECONOMY.valuation.mileageFactorCurve[0]![0].toLocaleString('en-US'))
    expect(note).toContain(`flat at 1.00 up to ${discountFromKm.toLocaleString('en-US')} km`)
    expect(text(wrapper, 'bench-fresh-lot-note')).toContain(String(ECONOMY.AUCTION_MIN_AGE_YEARS))
  })

  it('quotes no figure of its own in the fresh-lot note', () => {
    // The note used to name a mileage range in prose beside the range it
    // rendered, and the two disagreed. Every number in the sentence has to be
    // one the sim answered.
    const wrapper = mountScreen()
    const [min, max] = mileageRangeForAge(ECONOMY.AUCTION_MIN_AGE_YEARS, ECONOMY)
    const allowed = [
      String(ECONOMY.AUCTION_MIN_AGE_YEARS),
      min.toLocaleString('en-US'),
      max.toLocaleString('en-US'),
    ]
    const note = text(wrapper, 'bench-fresh-lot-note')
    expect(note).toContain(min.toLocaleString('en-US'))
    expect(note).toContain(max.toLocaleString('en-US'))
    for (const figure of note.match(/[\d][\d,]*/g) ?? []) {
      expect(allowed, `"${figure}" in the fresh-lot note is the screen's own figure`).toContain(
        figure,
      )
    }
  })

  it('says that a buyer valuation is not the offer a channel would make', () => {
    const wrapper = mountScreen()
    expect(text(wrapper, 'bench-buyer-price-caveat')).toContain('scene standing')
    // The staleness and calendar terms behind the odds, which a bare percentage
    // hides.
    expect(text(wrapper, 'bench-channel-basis')).toContain('offers seen')
  })

  it('shows the five stats, the four laps and the support verdict behind them', () => {
    const wrapper = mountScreen()
    for (const stat of StatKeySchema.options) {
      expect(wrapper.find(`[data-test="stat-${stat}"]`).exists()).toBe(true)
    }
    expect(wrapper.findAll('[data-test^="lap-"]')).toHaveLength(COURSES.length)
    expect(text(wrapper, 'bench-support')).toMatch(/adequate|strained|dangerous/)
  })

  it('quotes no figure of its own in the support verdict', () => {
    // The bug this screen keeps producing is a correct number beside a sentence
    // that says something else, so every figure in the sentence has to be one
    // the sim answered about this exact car.
    const wrapper = mountScreen()
    const panel = statsPanelFor(benchDefaultCar(), benchModel(), benchContext())
    const allowed = [panel.support.headline.toFixed(3), panel.coherenceFactor.toFixed(3)]

    const sentence = text(wrapper, 'bench-support')
    expect(sentence).toContain(allowed[0])
    expect(sentence).toContain(allowed[1])
    for (const figure of sentence.match(/\d[\d,]*(\.\d+)?/g) ?? []) {
      expect(allowed, `"${figure}" in the support verdict is the screen's own figure`).toContain(
        figure,
      )
    }
  })

  it('quotes no figure of its own in the no-pool channel table', () => {
    const wrapper = mountScreen()
    const context = benchContext()
    const ranges = bandPricedChannelsFor(benchDefaultCar(), benchModel(), benchState(), context)
    expect(ranges.length).toBeGreaterThan(0)
    for (const range of ranges) {
      const row = text(wrapper, `band-channel-${range.channelId}`)
      expect(row).toContain(formatYen(range.minYen))
      expect(row).toContain(formatYen(range.maxYen))
    }
  })

  it('measures every stat and a lap on each action, beside the yen', async () => {
    const wrapper = mountScreen()
    await click(wrapper, 'bench-remove')
    for (const stat of StatKeySchema.options) {
      expect(wrapper.find(`[data-test="log-0-${stat}"]`).exists()).toBe(true)
    }
    expect(wrapper.find('[data-test="log-0-lap"]').exists()).toBe(true)
    // Pulling a part cannot leave all five stats where they were.
    const moved = StatKeySchema.options.filter((stat) => text(wrapper, `log-0-${stat}`) !== '-')
    expect(moved.length).toBeGreaterThan(0)
  })

  it('prices the buyers through a chosen channel, not only through the standard band', () => {
    const wrapper = mountScreen()
    expect(wrapper.findAll('[data-test^="channel-price-"]').length).toBeGreaterThan(0)
    expect(text(wrapper, 'bench-channel-price-note')).toContain('scene-standing dials')
  })

  it('offers the real draw and refuses to take an offer that does not exist', () => {
    const wrapper = mountScreen()
    expect(wrapper.find('[data-test="bench-draw-offers"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="bench-accept-offer"]').attributes('disabled')).toBeDefined()
    expect(text(wrapper, 'bench-pending-offer')).toContain('No live offer')
  })
})

describe("EconomyBenchScreen's pinned preview", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  /** Every group of digits in a rendered sentence. */
  function figuresIn(sentence: string): string[] {
    return sentence.match(/\d[\d,]*(\.\d+)?/g) ?? []
  }

  it('prices the car on the bench before anything is edited, and says so', () => {
    const wrapper = mountScreen()
    const live = benchValueSummaryFor(benchDefaultCar(), benchModel(), benchState(), benchContext())

    expect(text(wrapper, 'preview-value-now')).toBe(formatYen(live.valueYen))
    // Nothing is pending, so no cell carries an "if rebuilt" figure at all.
    for (const key of ['cost', 'value', 'profit']) {
      expect(wrapper.find(`[data-test="preview-${key}-pending"]`).exists()).toBe(false)
    }
    // No purchase price is recorded on a car the bench simply seated, so there
    // is no book cost and no profit measured against one. Both read as a dash
    // rather than a zero, and neither cell prints a figure of any kind.
    expect(text(wrapper, 'preview-cost-now')).toBe('-')
    expect(text(wrapper, 'preview-profit-now')).toBe('-')
    expect(figuresIn(text(wrapper, 'preview-cost'))).toEqual([])
    expect(figuresIn(text(wrapper, 'preview-profit'))).toEqual([])
    // And the one input that would measure them is in the bar itself.
    expect(wrapper.find('[data-test="preview-cost"] [data-test="bench-purchase"]').exists()).toBe(
      true,
    )
  })

  it('keeps the three figures to one arithmetic: value less cost is the profit', async () => {
    const wrapper = mountScreen()
    await type(wrapper, 'bench-purchase', 400_000)
    await click(wrapper, 'bench-rebuild')

    // The yen sign and the thousands separators come off; a leading minus stays.
    const yen = (testId: string): number => Number(text(wrapper, testId).replace(/[^\d-]/g, ''))

    // The bar's own claim, which is the whole of what the labels promise: the
    // profit is the value less the book cost, to the yen.
    expect(yen('preview-value-now') - yen('preview-cost-now')).toBe(yen('preview-profit-now'))
  })

  it('THE GUARD: a previewed figure is exactly what a rebuild then produces', async () => {
    const wrapper = mountScreen()
    await type(wrapper, 'bench-mileage', 250_000)

    const previewed = text(wrapper, 'preview-value-pending')
    expect(previewed).toMatch(/¥[\d,]+/)

    await click(wrapper, 'bench-rebuild')

    // The car really was rebuilt from that spec, and it is worth what the panel
    // said it would be. A preview that could differ from the rebuild would be a
    // second implementation of the price.
    expect(wrapper.find('[data-test="preview-value-pending"]').exists()).toBe(false)
    expect(text(wrapper, 'preview-value-now')).toBe(previewed)
    expect(text(wrapper, 'bench-total')).toContain(previewed)
  })

  it('quotes no figure of its own in the value sentence', async () => {
    const context = benchContext()
    const model = benchModel()
    const shop = defaultShopSpec(context)
    const live = benchValueSummaryFor(benchDefaultCar(), model, benchState(), context)
    const pending = benchPreviewFor(
      { ...defaultCarSpec(model, shop, context), mileageKm: 250_000 },
      shop,
      model,
      context,
    )
    const allowed = [
      live.valueYen,
      pending.summary.valueYen,
      pending.summary.valueYen - live.valueYen,
    ].map((yen) => Math.abs(Math.round(yen)).toLocaleString('en-US'))

    const wrapper = mountScreen()
    await type(wrapper, 'bench-mileage', 250_000)

    const sentence = text(wrapper, 'preview-value')
    expect(figuresIn(sentence).length).toBe(3)
    for (const figure of figuresIn(sentence)) {
      expect(allowed, `"${figure}" in the value sentence is the screen's own figure`).toContain(
        figure,
      )
    }
  })

  it('shows which ledger line moved, and leaves the unmoved ones below it', async () => {
    const wrapper = mountScreen()
    await type(wrapper, 'bench-mileage', 250_000)

    const context = benchContext()
    const model = benchModel()
    const shop = defaultShopSpec(context)
    const pending = benchPreviewFor(
      { ...defaultCarSpec(model, shop, context), mileageKm: 250_000 },
      shop,
      model,
      context,
    )
    const live = benchValueSummaryFor(benchDefaultCar(), model, benchState(), context)

    const mileageBefore = live.lines.find((line) => line.id === 'mileage')?.yen ?? 0
    const mileageAfter = pending.summary.lines.find((line) => line.id === 'mileage')?.yen ?? 0
    expect(mileageAfter).not.toBe(mileageBefore)

    const row = text(wrapper, 'preview-why-mileage')
    expect(row).toContain(formatYenDelta(mileageBefore))
    expect(row).toContain(formatYenDelta(mileageAfter))
    expect(row).toContain(formatYenDelta(mileageAfter - mileageBefore))
    // The moved line is in the row that is always on screen.
    expect(
      wrapper.find('[data-test="preview-why"] [data-test="preview-why-mileage"]').exists(),
    ).toBe(true)

    // Book value cannot move with mileage, and it is still there saying so,
    // below the fold with the rest of the lines that did not move.
    const bookYen = live.lines.find((line) => line.id === 'book')?.yen ?? 0
    const book = text(wrapper, 'preview-why-book')
    expect(book).toContain(formatYenDelta(bookYen))
    expect(book).toContain('¥0')
    expect(wrapper.find('details.rest [data-test="preview-why-book"]').exists()).toBe(true)
  })

  it('measures the pending build the same way an action is measured', async () => {
    const wrapper = mountScreen()
    await type(wrapper, 'bench-mileage', 250_000)

    for (const stat of StatKeySchema.options) {
      expect(wrapper.find(`[data-test="preview-stat-${stat}"]`).exists()).toBe(true)
    }
    for (const course of COURSES) {
      expect(wrapper.find(`[data-test="preview-lap-${course.id}"]`).exists()).toBe(true)
    }
    // Mileage reaches no stat and no lap, so every one of them reads as unmoved.
    for (const stat of StatKeySchema.options) {
      expect(text(wrapper, `preview-stat-${stat}`).split(/\s+/).pop()).toBe('-')
    }
    for (const course of COURSES) {
      expect(text(wrapper, `preview-lap-${course.id}`).split(/\s+/).pop()).toBe('-')
    }
  })

  it('measures profit once a purchase price is recorded, and dashes it before then', async () => {
    const wrapper = mountScreen()
    await type(wrapper, 'bench-purchase', 400_000)

    const context = benchContext()
    const model = benchModel()
    const shop = { ...defaultShopSpec(context), purchaseYen: 400_000 }
    const built = benchPreviewFor(defaultCarSpec(model, shop, context), shop, model, context)
    expect(built.summary.bookCostYen).toBe(400_000)
    expect(built.summary.profitAtValueYen).not.toBeNull()

    // Pending only: the car on the bench still has no recorded purchase, so its
    // own cost and profit stay dashed and neither change can be measured.
    expect(text(wrapper, 'preview-cost-now')).toBe('-')
    expect(text(wrapper, 'preview-profit-now')).toBe('-')
    expect(text(wrapper, 'preview-cost-pending')).toBe(formatYen(400_000))
    expect(text(wrapper, 'preview-profit-pending')).toBe(
      formatYen(built.summary.profitAtValueYen ?? 0),
    )
    expect(text(wrapper, 'preview-cost-delta')).toBe('-')
    expect(text(wrapper, 'preview-profit-delta')).toBe('-')

    await click(wrapper, 'bench-rebuild')

    expect(text(wrapper, 'preview-cost-now')).toBe(formatYen(400_000))
    expect(text(wrapper, 'preview-profit-now')).toBe(formatYen(built.summary.profitAtValueYen ?? 0))
  })

  it('leaves the running log and the car alone while a change is pending', async () => {
    const wrapper = mountScreen()
    await click(wrapper, 'bench-remove')
    const total = text(wrapper, 'bench-total')

    await type(wrapper, 'bench-mileage', 250_000)

    expect(wrapper.find('[data-test="log-line-0"]').exists()).toBe(true)
    expect(text(wrapper, 'bench-total')).toBe(total)
    expect(text(wrapper, 'bench-stale')).toContain('not the settings above it')
  })
})

describe("EconomyBenchScreen's zone table", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('says which way the three severities run, and that they are a chain', () => {
    const wrapper = mountScreen()
    const axis = text(wrapper, 'zone-axis-note')
    expect(axis).toContain('Lower is better')
    expect(axis).toContain(String(BEYOND_REPAIR_METAL))

    const chain = text(wrapper, 'zone-chain-note')
    expect(chain).toContain(String(MAX_REPAIRABLE_METAL))
    expect(chain).toContain('refuses until')
    // The two axes that carry no metal at all.
    expect(chain).toContain('trim zones')
  })

  it('offers the palette rather than a text box, and marks the factory set', () => {
    const wrapper = mountScreen()
    const select = wrapper.find('[data-test="zone-colour-bonnet"]')
    expect(select.element.tagName).toBe('SELECT')

    const context = benchContext()
    const model = benchModel()
    const factory = factoryColourSet(
      defaultCarSpec(model, defaultShopSpec(context), context).factoryColour,
    )
    expect(factory.size).toBeGreaterThan(0)

    const options = select.findAll('option')
    const values = options.map((option) => option.attributes('value') ?? '')
    // Every offer is a real palette id, or the empty one meaning bare.
    for (const value of values) {
      if (value === '') continue
      expect(PAINT_COLOURS.some((colour) => colour.id === value)).toBe(true)
    }
    for (const colour of PAINT_COLOURS) {
      expect(values).toContain(colour.id)
    }
    for (const option of options) {
      const value = option.attributes('value') ?? ''
      if (value === '') continue
      expect(option.text().includes('(factory)')).toBe(factory.has(value))
    }
  })

  it('deals a factory two-tone across the zones rather than writing the joined token', async () => {
    const twoTone = CARS.find((car) => car.spec.factoryColours[0]?.includes('+'))
    expect(twoTone, 'no roster car ships a two-tone as its first factory colour').toBeDefined()
    const halves = twoTone!.spec.factoryColours[0]!.split('+')

    const wrapper = mountScreen()
    await wrapper.find('[data-test="bench-model"]').setValue(twoTone!.id)

    const worn = new Set<string>()
    for (const zoneId of ZoneIdSchema.options) {
      const value = (
        wrapper.find(`[data-test="zone-colour-${zoneId}"]`).element as HTMLSelectElement
      ).value
      // The joined token is not a colour any tin holds, so no zone may wear it.
      expect(value).not.toContain('+')
      expect(PAINT_COLOURS.some((colour) => colour.id === value)).toBe(true)
      worn.add(value)
    }
    expect([...worn].sort()).toEqual([...halves].sort())
    expect(text(wrapper, 'zone-two-tone-note')).toContain('two palette ids joined')
  })
})
