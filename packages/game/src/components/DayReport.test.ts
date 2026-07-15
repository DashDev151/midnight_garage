import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import DayReport from './DayReport.vue'

describe('DayReport', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('is hidden until a day ends, then shows the day and dismisses', async () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mount(DayReport)
    expect(wrapper.find('[data-test="day-report"]').exists()).toBe(false)

    game.endDay()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="day-report"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Day 1 complete')

    await wrapper.find('[data-test="report-continue"]').trigger('click')
    expect(wrapper.find('[data-test="day-report"]').exists()).toBe(false)
  })

  it('Sprint 42: renders a profit clause on a car-sold entry, via the shared describeLogEntry formatter', async () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mount(DayReport)

    game.lastDayReport = {
      day: 1,
      entries: [
        {
          type: 'car-sold',
          carInstanceId: 'car-1',
          channel: 'walk-in-offer',
          priceYen: 900_000,
          profitYen: 40_000,
        },
      ],
      cashDeltaYen: 900_000,
    }
    game.reportVisible = true
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('profit +¥40,000')
  })

  it('Sprint 64: a won car opens the report as a celebration card, not a red loss', async () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mount(DayReport)

    game.lastDayReport = {
      day: 3,
      entries: [
        {
          type: 'auction-bid-won',
          lotId: 'lot-1',
          finalPriceYen: 156_030,
          modelId: 'honda-city-e-aa',
          year: 1987,
        },
      ],
      cashDeltaYen: -156_030, // the money left the wallet, but this is a WIN
    }
    game.reportVisible = true
    await wrapper.vm.$nextTick()

    const wins = wrapper.find('[data-test="report-wins"]')
    expect(wins.exists()).toBe(true)
    expect(wins.text()).toContain('Won')
    expect(wins.text()).toContain('1987')
    expect(wins.text()).toContain(formatYen(156_030))
    // The scary red net is demoted to a secondary line, never the win card.
    expect(wins.classes()).not.toContain('down')
    // The purchase is framed as spend "on cars", not a raw loss headline.
    expect(wrapper.find('[data-test="report-money"]').text()).toContain('Bought cars')
  })

  it('Sprint 64: routine noise is aggregated into quiet, correctly-pluralised lines', async () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mount(DayReport)

    game.lastDayReport = {
      day: 5,
      entries: [
        { type: 'auction-catalog-refreshed', tier: 'local-yard', lotCount: 1 },
        { type: 'auction-catalog-refreshed', tier: 'regional', lotCount: 2 },
        { type: 'market-heat-shift', modelId: 'honda-city-e-aa', deltaPercent: 3 },
        { type: 'job-progress', jobId: 'job-1', laborSlotsSpent: 2 },
      ],
      cashDeltaYen: 0,
    }
    game.reportVisible = true
    await wrapper.vm.$nextTick()

    const noise = wrapper.find('[data-test="report-noise"]')
    expect(noise.exists()).toBe(true)
    // 1 + 2 lots aggregate into one line, pluralised correctly.
    // Sprint 69 item 5: the auction-catalogue line is GONE. The maintainer
    // does not want the morning report narrating inventory churn they can go
    // and look at, so both refresh entries above now produce no line at all -
    // the sim still logs them, the report just swallows them.
    expect(noise.text()).not.toContain('at the auctions')
    expect(noise.text()).not.toContain('new lot')
    expect(noise.text()).toContain('Market prices moved on 1 car')
    expect(noise.text()).not.toContain('1 lots') // the pluralisation bug is dead
    // The four noisy entries collapse to at most two quiet lines now.
    expect(noise.findAll('li').length).toBeLessThanOrEqual(2)
  })

  it('Sprint 64: an outbid alert is prominent - first in the notable list', async () => {
    const game = useGameStore()
    game.newGame(1)
    const wrapper = mount(DayReport)

    game.lastDayReport = {
      day: 6,
      entries: [
        {
          type: 'part-delivered',
          orderId: 'order-1',
          partId: 'stock-block',
          partInstanceId: 'pi-1',
        },
        {
          type: 'auction-outbid',
          lotId: 'lot-1',
          newBidYen: 200_000,
          modelId: 'honda-city-e-aa',
          year: 1987,
        },
      ],
      cashDeltaYen: 0,
    }
    game.reportVisible = true
    await wrapper.vm.$nextTick()

    const items = wrapper.find('[data-test="report-notable"]').findAll('li')
    expect(items[0]!.text()).toContain('Outbid')
  })
})
