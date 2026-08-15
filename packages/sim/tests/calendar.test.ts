import { ECONOMY, ERA_IDS, SEASON_IDS, type AuctionTier } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  currentGameYear,
  dayOfSeason,
  dayOfWeek,
  dayOfWeekName,
  eraOf,
  isAuctionTierOpen,
  isEndOfWeek,
  isMeetDay,
  isPayday,
  isRentDay,
  isStartOfWeek,
  nextOpenDayForTier,
  seasonOf,
  weekIndex,
} from '../src/calendar'

describe('currentGameYear (sprint204.md: elapsed days, not reputation)', () => {
  it('reads economy.campaignYearCurve, exactly at its authored breakpoints', () => {
    for (const [day, year] of ECONOMY.campaignYearCurve) {
      expect(currentGameYear(day, ECONOMY)).toBe(year)
    }
  })

  it('never regresses: a later day is never an earlier year', () => {
    let previous = currentGameYear(1, ECONOMY)
    for (let day = 2; day <= 320; day += 1) {
      const year = currentGameYear(day, ECONOMY)
      expect(year).toBeGreaterThanOrEqual(previous)
      previous = year
    }
  })

  it('clamps outside the curve rather than extrapolating', () => {
    expect(currentGameYear(0, ECONOMY)).toBe(currentGameYear(1, ECONOMY))
    expect(currentGameYear(10_000, ECONOMY)).toBe(currentGameYear(320, ECONOMY))
  })
})

describe('the calendar (sprint149.md, reshaped 7 -> 5 days by sprint204.md): day 1 is week 1 day 1', () => {
  it('day 1 is position 1 of week 1, and the start of the week', () => {
    expect(dayOfWeek(1, ECONOMY)).toBe(1)
    expect(isStartOfWeek(1, ECONOMY)).toBe(true)
    expect(isEndOfWeek(1, ECONOMY)).toBe(false)
  })

  it('day 5 (daysPerWeek) is the last position of week 1, the end of the week', () => {
    expect(dayOfWeek(5, ECONOMY)).toBe(ECONOMY.calendar.daysPerWeek)
    expect(isEndOfWeek(5, ECONOMY)).toBe(true)
    expect(isStartOfWeek(5, ECONOMY)).toBe(false)
  })

  it('day 6 wraps back around to position 1 of week 2', () => {
    expect(dayOfWeek(6, ECONOMY)).toBe(1)
    expect(isStartOfWeek(6, ECONOMY)).toBe(true)
  })

  it('dayOfWeekName reads back the position for display, never for scheduling', () => {
    // rentDayOfWeek is 5, the same position as meetDayOfWeek - both read
    // 'Friday' by design; see the "share a day" test below.
    expect(dayOfWeekName(ECONOMY.calendar.rentDayOfWeek, ECONOMY)).toBe('Friday')
    expect(dayOfWeekName(ECONOMY.calendar.paydayOfWeek, ECONOMY)).toBe('Thursday')
    expect(dayOfWeekName(ECONOMY.calendar.meetDayOfWeek, ECONOMY)).toBe('Friday')
  })

  it('weekIndex numbers the weeks from 1, changing exactly on a week boundary', () => {
    const { daysPerWeek } = ECONOMY.calendar
    expect(weekIndex(1, ECONOMY)).toBe(1)
    expect(weekIndex(daysPerWeek, ECONOMY)).toBe(1)
    expect(weekIndex(daysPerWeek + 1, ECONOMY)).toBe(2)
    expect(weekIndex(daysPerWeek * 3, ECONOMY)).toBe(3)
    expect(weekIndex(daysPerWeek * 3 + 1, ECONOMY)).toBe(4)
  })

  it('every named landmark fires exactly once per daysPerWeek-day span, over a 100-day run', () => {
    const { daysPerWeek } = ECONOMY.calendar
    const landmarks: Record<string, (day: number) => boolean> = {
      meet: (day) => isMeetDay(day, ECONOMY),
      payday: (day) => isPayday(day, ECONOMY),
      rent: (day) => isRentDay(day, ECONOMY),
      weekEnd: (day) => isEndOfWeek(day, ECONOMY),
    }
    for (const [name, fires] of Object.entries(landmarks)) {
      const hitDays: number[] = []
      for (let day = 1; day <= 100; day++) {
        if (fires(day)) hitDays.push(day)
      }
      // 100 days is 20 full 5-day weeks exactly, so any weekly landmark
      // hits exactly 20 times.
      expect(hitDays.length, name).toBe(100 / daysPerWeek)
      // Consecutive hits are always exactly one week apart - never skipped,
      // never doubled within a week.
      for (let i = 1; i < hitDays.length; i++) {
        expect(hitDays[i]! - hitDays[i - 1]!, name).toBe(daysPerWeek)
      }
    }
  })

  // Rent (a charge) and the meet (a selling-channel draw) deliberately share
  // a day - different mechanisms, so sharing is fine. What must never
  // collide is the two CHARGES finances.ts can levy in the same tick.
  it('the two charges (rent, payday) never share a day', () => {
    const { paydayOfWeek, rentDayOfWeek } = ECONOMY.calendar
    expect(rentDayOfWeek).not.toBe(paydayOfWeek)
  })
})

describe('the season cycle (sprint204.md: fixed, independent of campaignYearCurve)', () => {
  it('a season is always daysPerWeek * weeksPerSeason days: 20', () => {
    const { daysPerWeek, weeksPerSeason } = ECONOMY.calendar
    expect(daysPerWeek * weeksPerSeason).toBe(20)
  })

  it('day 1 opens spring at position 1', () => {
    expect(seasonOf(1, ECONOMY)).toBe('spring')
    expect(dayOfSeason(1, ECONOMY)).toBe(1)
  })

  it('day 20 is the last day of spring; day 21 opens summer at position 1', () => {
    expect(seasonOf(20, ECONOMY)).toBe('spring')
    expect(dayOfSeason(20, ECONOMY)).toBe(20)
    expect(seasonOf(21, ECONOMY)).toBe('summer')
    expect(dayOfSeason(21, ECONOMY)).toBe(1)
  })

  it('cycles spring, summer, autumn, winter, then spring again at the next era', () => {
    expect(seasonOf(1, ECONOMY)).toBe('spring')
    expect(seasonOf(21, ECONOMY)).toBe('summer')
    expect(seasonOf(41, ECONOMY)).toBe('autumn')
    expect(seasonOf(61, ECONOMY)).toBe('winter')
    expect(seasonOf(81, ECONOMY)).toBe('spring')
  })

  it('the whole 320-day campaign is exactly 16 seasons, each recurring exactly four times', () => {
    const seasonIndices = new Set<number>()
    let seasonCount = 0
    let previousSeason = seasonOf(1, ECONOMY)
    seasonIndices.add(0)
    for (let day = 1; day <= 320; day++) {
      const season = seasonOf(day, ECONOMY)
      if (day === 1 || season !== previousSeason) {
        seasonCount++
        previousSeason = season
      }
    }
    expect(seasonCount).toBe(16)
    for (const seasonId of SEASON_IDS) {
      const occurrences = Array.from({ length: 320 }, (_, i) => i + 1).filter(
        (day) => dayOfSeason(day, ECONOMY) === 1 && seasonOf(day, ECONOMY) === seasonId,
      )
      expect(occurrences, seasonId).toHaveLength(4)
    }
  })
})

describe('the era band (sprint204.md: the year-equivalent, never a shown year)', () => {
  it('day 1 opens mid-90s', () => {
    expect(eraOf(1, ECONOMY)).toBe('mid-90s')
  })

  it('era boundaries land exactly where campaignYearCurve says', () => {
    const breakpointDays = ECONOMY.campaignYearCurve.map(([day]) => day)
    // The curve's own opening/closing days bookend the four eras; the two
    // interior breakpoints (81, 161, 241) are each a fresh era's day 1.
    expect(breakpointDays).toEqual([1, 81, 161, 241, 320])
    expect(eraOf(1, ECONOMY)).toBe('mid-90s')
    expect(eraOf(80, ECONOMY)).toBe('mid-90s')
    expect(eraOf(81, ECONOMY)).toBe('late-90s')
    expect(eraOf(160, ECONOMY)).toBe('late-90s')
    expect(eraOf(161, ECONOMY)).toBe('early-2000s')
    expect(eraOf(240, ECONOMY)).toBe('early-2000s')
    expect(eraOf(241, ECONOMY)).toBe('mid-2000s')
    expect(eraOf(320, ECONOMY)).toBe('mid-2000s')
  })

  it('four eras hold across the whole campaign, in ERA_IDS order', () => {
    const seen: string[] = []
    for (let day = 1; day <= 320; day++) {
      const era = eraOf(day, ECONOMY)
      if (!seen.includes(era)) seen.push(era)
    }
    expect(seen).toEqual(ERA_IDS)
  })
})

/**
 * The rooms keep their own hours (sprint150.md), replacing the retired
 * single global auction day. The signed table is written out literally here
 * rather than recomputed from the same content the implementation reads:
 * this block is the pin. Remapped to the five-day week by sprint204.md.
 */
describe('auction cadence: each room keeps its own hours (sprint150.md, remapped by sprint204.md)', () => {
  const SPAN_DAYS = 20

  function openDaysOver(tier: AuctionTier, spanDays = SPAN_DAYS): number[] {
    const days: number[] = []
    for (let day = 1; day <= spanDays; day++) {
      if (isAuctionTierOpen(day, tier, ECONOMY)) days.push(day)
    }
    return days
  }

  it('local-yard sits on days 1, 3 and 5 of every week', () => {
    expect(openDaysOver('local-yard')).toEqual([1, 3, 5, 6, 8, 10, 11, 13, 15, 16, 18, 20])
  })

  it('regional sits on days 2 and 4 of every week', () => {
    expect(openDaysOver('regional')).toEqual([2, 4, 7, 9, 12, 14, 17, 19])
  })

  it('premium sits on day 5 of every week', () => {
    expect(openDaysOver('premium')).toEqual([5, 10, 15, 20])
  })

  it('collector-network sits on day 5 of every SECOND week, fresh each day', () => {
    expect(openDaysOver('collector-network')).toEqual([5, 15])
  })

  it('collector-network opens in weeks 1 and 3 and stays shut through weeks 2 and 4', () => {
    const openWeeks = new Set(
      openDaysOver('collector-network').map((day) => weekIndex(day, ECONOMY)),
    )
    expect([...openWeeks].sort()).toEqual([1, 3])
    // Week 1 is an open week for every room - the fortnightly cadence is
    // never phased later than the first week of a career.
    expect(isAuctionTierOpen(5, 'collector-network', ECONOMY)).toBe(true)
  })

  /**
   * The tutorial bug sprint149.md's Exit and TODO.md both recorded: with one
   * global `auctionDayOfWeek` of 3, a brand-new career's day 1 sent the
   * player to a shuttered auction house, and the tutorial's `find` step
   * anchored on a control that was not on screen. `local-yard`'s cadence
   * fixes it by construction, and this test is what stops it coming back.
   */
  it('day 1 is an auction day at the local yard - the day-1 tutorial bug, closed by construction', () => {
    expect(isAuctionTierOpen(1, 'local-yard', ECONOMY)).toBe(true)
  })

  /**
   * Two rooms open on one day is an explicit ruling, not an accident to
   * tidy up: more than one room per day is desirable, and
   * attending costs no part of the day, so the player may sit at both.
   * Asserted rather than avoided so a later cadence change cannot quietly
   * remove it.
   */
  it('premium and collector-network are BOTH open on day 5 of an open week, deliberately', () => {
    expect(isAuctionTierOpen(5, 'premium', ECONOMY)).toBe(true)
    expect(isAuctionTierOpen(5, 'collector-network', ECONOMY)).toBe(true)
    // ...and on day 5 of a closed collector week, premium sits alone.
    expect(isAuctionTierOpen(10, 'premium', ECONOMY)).toBe(true)
    expect(isAuctionTierOpen(10, 'collector-network', ECONOMY)).toBe(false)
  })

  it('some room is open every single day of a four-week span - the house is never wholly dark', () => {
    const tiers: AuctionTier[] = ['local-yard', 'regional', 'premium', 'collector-network']
    for (let day = 1; day <= SPAN_DAYS; day++) {
      expect(
        tiers.some((tier) => isAuctionTierOpen(day, tier, ECONOMY)),
        `day ${day}`,
      ).toBe(true)
    }
  })

  it('nextOpenDayForTier finds the next sitting, including across a skipped week', () => {
    // Local yard: day 2 is shut, day 3 is the next sitting.
    expect(nextOpenDayForTier(2, 'local-yard', ECONOMY)).toBe(3)
    // Premium: from day 6 the next sitting is day 10.
    expect(nextOpenDayForTier(6, 'premium', ECONOMY)).toBe(10)
    // Collector network: from day 6 (the Monday of a closed week) the next
    // sitting skips the whole of week 2 and lands on day 15.
    expect(nextOpenDayForTier(6, 'collector-network', ECONOMY)).toBe(15)
    // Called on a day the room is already open, it returns that same day.
    expect(nextOpenDayForTier(5, 'premium', ECONOMY)).toBe(5)
  })
})
