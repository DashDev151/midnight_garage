import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dayOfSeason, eraOf, seasonOf } from '@midnight-garage/sim'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import { eraLabel, seasonDayLabel, seasonLabel } from '../utils/calendarLabels'
import DayCashBox from './DayCashBox.vue'

const mountedWrappers: VueWrapper[] = []
function track<T extends VueWrapper>(wrapper: T): T {
  mountedWrappers.push(wrapper)
  return wrapper
}
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

/** The live stamp's three pieces, computed the same way the component does -
 * never a hardcoded day, season or era, since the fixture's starting day is
 * not this test's concern. */
function expectedStamp(
  day: number,
  economy: ReturnType<typeof useGameStore>['context']['economy'],
) {
  return {
    seasonDay: seasonDayLabel(dayOfSeason(day, economy)),
    season: seasonLabel(seasonOf(day, economy)),
    era: eraLabel(eraOf(day, economy)),
  }
}

describe('DayCashBox', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows the live stamp - day within season, season, era - and cash, day carrying the tutorial anchor', () => {
    const game = useGameStore()
    const wrapper = track(mount(DayCashBox))

    const stamp = expectedStamp(game.day, game.context.economy)
    const dayEl = wrapper.get('[data-test="day-value"]')
    expect(dayEl.text()).toBe(`Day ${stamp.seasonDay} - ${stamp.season}`)
    expect(wrapper.get('[data-test="era-value"]').text()).toBe(stamp.era)
    expect(wrapper.get('.cash').text()).toBe(formatYen(game.cashYen))
  })

  it('carries a live aria-label naming the day, season, era and cash', () => {
    const game = useGameStore()
    const wrapper = track(mount(DayCashBox))
    const stamp = expectedStamp(game.day, game.context.economy)
    expect(wrapper.get('.day-cash-box').attributes('aria-label')).toBe(
      `Day ${stamp.seasonDay}, ${stamp.season}, ${stamp.era}; cash ${formatYen(game.cashYen)}`,
    )
  })

  it('updates live as the day advances and cash changes', async () => {
    const game = useGameStore()
    const wrapper = track(mount(DayCashBox))

    game.endDay()
    await wrapper.vm.$nextTick()

    const stamp = expectedStamp(game.day, game.context.economy)
    expect(wrapper.get('[data-test="day-value"]').text()).toBe(
      `Day ${stamp.seasonDay} - ${stamp.season}`,
    )
    expect(wrapper.get('[data-test="era-value"]').text()).toBe(stamp.era)
    expect(wrapper.get('.day-cash-box').attributes('aria-label')).toBe(
      `Day ${stamp.seasonDay}, ${stamp.season}, ${stamp.era}; cash ${formatYen(game.cashYen)}`,
    )
  })

  it('never shows a four-digit year anywhere in the box', () => {
    const wrapper = track(mount(DayCashBox))
    expect(wrapper.text()).not.toMatch(/\b(19|20)\d{2}\b/)
    expect(wrapper.get('.day-cash-box').attributes('aria-label')).not.toMatch(/\b(19|20)\d{2}\b/)
  })
})
