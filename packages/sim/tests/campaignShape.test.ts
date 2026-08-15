import { ECONOMY, ERA_IDS, SEASON_IDS } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import { dayOfSeason, eraOf, seasonOf } from '../src/calendar'

/**
 * sprint204.md task C2: one probe pinning the campaign's whole shape, as a
 * single coherent fact rather than scattered across the unit tests
 * `calendar.test.ts` already carries. The shape is settled
 * (docs/design/systems/campaign-clock-and-events.md): 5 days a week, 4
 * weeks a season, 4 seasons an era, 4 eras - 320 days, 16 seasons, 4 eras -
 * and the era boundaries land exactly where `campaignYearCurve` says, since
 * that curve is authored at those same boundaries.
 */
describe('the campaign shape (sprint204.md C2)', () => {
  const CAMPAIGN_LENGTH_DAYS = 320

  it('is 5 days a week, 4 weeks a season, 4 seasons an era, 4 eras: 320 days total', () => {
    const { daysPerWeek, weeksPerSeason, seasonsPerEra } = ECONOMY.calendar
    expect(daysPerWeek).toBe(5)
    expect(weeksPerSeason).toBe(4)
    expect(seasonsPerEra).toBe(4)
    expect(ERA_IDS.length).toBe(4)
    expect(daysPerWeek * weeksPerSeason * seasonsPerEra * ERA_IDS.length).toBe(CAMPAIGN_LENGTH_DAYS)
  })

  it('the campaign carries exactly 16 seasons, four full cycles of the fixed season order', () => {
    const seasonStarts = Array.from({ length: CAMPAIGN_LENGTH_DAYS }, (_, i) => i + 1).filter(
      (day) => dayOfSeason(day, ECONOMY) === 1,
    )
    expect(seasonStarts).toHaveLength(16)
    expect(seasonStarts.map((day) => seasonOf(day, ECONOMY))).toEqual([
      ...SEASON_IDS,
      ...SEASON_IDS,
      ...SEASON_IDS,
      ...SEASON_IDS,
    ])
  })

  it('the campaign carries exactly four eras, in ERA_IDS order, none skipped and none repeated out of order', () => {
    const eraStarts: string[] = []
    let previous: string | null = null
    for (let day = 1; day <= CAMPAIGN_LENGTH_DAYS; day++) {
      const era = eraOf(day, ECONOMY)
      if (era !== previous) {
        eraStarts.push(era)
        previous = era
      }
    }
    expect(eraStarts).toEqual(ERA_IDS)
  })

  it('era boundaries land exactly where campaignYearCurve says (the curve is authored at them)', () => {
    const curveDays = ECONOMY.campaignYearCurve.map(([day]) => day)
    // The curve's five breakpoints are the campaign's opening day, the three
    // interior era-opening days, and the closing day.
    expect(curveDays).toHaveLength(5)
    const [opening, ...rest] = curveDays
    const closing = rest[rest.length - 1]!
    const interiorEraOpenings = rest.slice(0, -1)

    expect(opening).toBe(1)
    expect(closing).toBe(CAMPAIGN_LENGTH_DAYS)

    // Every interior breakpoint is itself the first day of a fresh era, and
    // the day immediately before it is still the previous one.
    for (const day of interiorEraOpenings) {
      expect(dayOfSeason(day, ECONOMY)).toBe(1)
      expect(eraOf(day, ECONOMY)).not.toBe(eraOf(day - 1, ECONOMY))
    }
  })

  it('the campaign is about 21 hours of play at four minutes a day (the design budget)', () => {
    const minutesPerDay = 4
    const totalHours = (CAMPAIGN_LENGTH_DAYS * minutesPerDay) / 60
    expect(totalHours).toBeCloseTo(21.33, 1)
  })
})
