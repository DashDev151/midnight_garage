import { ECONOMY, ReputationTierSchema, type AuctionTier } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  currentGameYear,
  dayOfWeek,
  dayOfWeekName,
  isAuctionTierOpen,
  isEndOfWeek,
  isMeetDay,
  isMonthBoundary,
  isPayday,
  isRentDay,
  isStartOfWeek,
  monthIndex,
  nextOpenDayForTier,
  weekIndex,
} from '../src/calendar'

describe('currentGameYear', () => {
  it('starts the campaign in 1995 at unknown reputation (GDD 2.2)', () => {
    expect(currentGameYear('unknown')).toBe(1995)
  })

  it('advances 2 years per reputation tier, in tier order', () => {
    const tiers = ReputationTierSchema.options
    const years = tiers.map((tier) => currentGameYear(tier))
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBe(years[i - 1]! + 2)
    }
    expect(currentGameYear('legend')).toBe(1995 + 2 * (tiers.length - 1))
  })
})

describe('the calendar (sprint149.md): day 1 is week 1 day 1 and month 1', () => {
  it('day 1 is position 1 of week 1, and the start of the week', () => {
    expect(dayOfWeek(1, ECONOMY)).toBe(1)
    expect(isStartOfWeek(1, ECONOMY)).toBe(true)
    expect(isEndOfWeek(1, ECONOMY)).toBe(false)
  })

  it('day 7 (daysPerWeek) is the last position of week 1, the end of the week', () => {
    expect(dayOfWeek(7, ECONOMY)).toBe(ECONOMY.calendar.daysPerWeek)
    expect(isEndOfWeek(7, ECONOMY)).toBe(true)
    expect(isStartOfWeek(7, ECONOMY)).toBe(false)
  })

  it('day 8 wraps back around to position 1 of week 2', () => {
    expect(dayOfWeek(8, ECONOMY)).toBe(1)
    expect(isStartOfWeek(8, ECONOMY)).toBe(true)
  })

  it('day 1 is month 1; day 28 (daysPerMonth) is the last day of month 1; day 29 opens month 2', () => {
    expect(monthIndex(1, ECONOMY)).toBe(1)
    expect(monthIndex(ECONOMY.calendar.daysPerMonth, ECONOMY)).toBe(1)
    expect(isMonthBoundary(ECONOMY.calendar.daysPerMonth, ECONOMY)).toBe(false)
    expect(monthIndex(ECONOMY.calendar.daysPerMonth + 1, ECONOMY)).toBe(2)
    expect(isMonthBoundary(ECONOMY.calendar.daysPerMonth + 1, ECONOMY)).toBe(true)
  })

  it('a month boundary always lands on a week boundary too (daysPerMonth is four clean weeks)', () => {
    expect(ECONOMY.calendar.daysPerMonth % ECONOMY.calendar.daysPerWeek).toBe(0)
  })

  it('dayOfWeekName reads back the position for display, never for scheduling', () => {
    // rentDayOfWeek is 7, the same position as meetDayOfWeek - both read
    // 'Sunday' by design; see the "share a day" test below.
    expect(dayOfWeekName(ECONOMY.calendar.rentDayOfWeek, ECONOMY)).toBe('Sunday')
    expect(dayOfWeekName(ECONOMY.calendar.paydayOfWeek, ECONOMY)).toBe('Friday')
    expect(dayOfWeekName(ECONOMY.calendar.meetDayOfWeek, ECONOMY)).toBe('Sunday')
  })

  it('weekIndex numbers the weeks from 1, changing exactly on a week boundary', () => {
    const { daysPerWeek } = ECONOMY.calendar
    expect(weekIndex(1, ECONOMY)).toBe(1)
    expect(weekIndex(daysPerWeek, ECONOMY)).toBe(1)
    expect(weekIndex(daysPerWeek + 1, ECONOMY)).toBe(2)
    expect(weekIndex(daysPerWeek * 3, ECONOMY)).toBe(3)
    expect(weekIndex(daysPerWeek * 3 + 1, ECONOMY)).toBe(4)
  })

  it('every named landmark fires exactly once per seven-day span, over a 100-day run', () => {
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
      // 100 days is 14 full weeks plus 2 extra days, so any weekly
      // landmark hits 14 or 15 times depending on phase alone.
      expect(hitDays.length, name).toBeGreaterThanOrEqual(14)
      expect(hitDays.length, name).toBeLessThanOrEqual(15)
      // Consecutive hits are always exactly one week apart - never skipped,
      // never doubled within a week.
      for (let i = 1; i < hitDays.length; i++) {
        expect(hitDays[i]! - hitDays[i - 1]!, name).toBe(daysPerWeek)
      }
    }
  })

  // Was "the four named landmarks land on four different days" until
  // rentDayOfWeek moved back to 7, the same position as meetDayOfWeek, on
  // purpose: rent (a charge) and the meet (a selling-channel draw) are
  // different mechanisms, so sharing a day is fine. Directive 17 case (a) -
  // the old invariant was wrong, not the implementation: what must actually
  // never collide is the two CHARGES finances.ts can levy in the same tick,
  // since sprint149.md's whole point was that rent and wages stop landing as
  // one undifferentiated subtraction. A non-charge landmark (the meet) is
  // free to share a day with either.
  it('the two charges (rent, payday) never share a day', () => {
    const { paydayOfWeek, rentDayOfWeek } = ECONOMY.calendar
    expect(rentDayOfWeek).not.toBe(paydayOfWeek)
  })
})

/**
 * The rooms keep their own hours (sprint150.md), replacing the retired
 * single global auction day. The signed table is written out literally here
 * rather than recomputed from the same content the implementation reads:
 * this block is the pin.
 */
describe('auction cadence: each room keeps its own hours (sprint150.md)', () => {
  const SPAN_DAYS = 28

  function openDaysOver(tier: AuctionTier, spanDays = SPAN_DAYS): number[] {
    const days: number[] = []
    for (let day = 1; day <= spanDays; day++) {
      if (isAuctionTierOpen(day, tier, ECONOMY)) days.push(day)
    }
    return days
  }

  it('local-yard sits on days 1, 3, 5 and 7 of every week', () => {
    expect(openDaysOver('local-yard')).toEqual([
      1, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 21, 22, 24, 26, 28,
    ])
  })

  it('regional sits on days 2 and 4 of every week', () => {
    expect(openDaysOver('regional')).toEqual([2, 4, 9, 11, 16, 18, 23, 25])
  })

  it('premium sits on day 6 of every week', () => {
    expect(openDaysOver('premium')).toEqual([6, 13, 20, 27])
  })

  it('collector-network sits on days 6 and 7 of every SECOND week, fresh each day', () => {
    expect(openDaysOver('collector-network')).toEqual([6, 7, 20, 21])
  })

  it('collector-network opens in weeks 1 and 3 and stays shut through weeks 2 and 4', () => {
    const openWeeks = new Set(
      openDaysOver('collector-network').map((day) => weekIndex(day, ECONOMY)),
    )
    expect([...openWeeks].sort()).toEqual([1, 3])
    // Week 1 is an open week for every room - the fortnightly cadence is
    // never phased later than the first week of a career.
    expect(isAuctionTierOpen(6, 'collector-network', ECONOMY)).toBe(true)
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
  it('premium and collector-network are BOTH open on day 6 of an open week, deliberately', () => {
    expect(isAuctionTierOpen(6, 'premium', ECONOMY)).toBe(true)
    expect(isAuctionTierOpen(6, 'collector-network', ECONOMY)).toBe(true)
    // ...and on day 6 of a closed collector week, premium sits alone.
    expect(isAuctionTierOpen(13, 'premium', ECONOMY)).toBe(true)
    expect(isAuctionTierOpen(13, 'collector-network', ECONOMY)).toBe(false)
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
    // Premium: from day 7 the next Saturday is day 13.
    expect(nextOpenDayForTier(7, 'premium', ECONOMY)).toBe(13)
    // Collector network: from day 8 (the Monday of a closed week) the next
    // sitting skips the whole of week 2 and lands on day 20.
    expect(nextOpenDayForTier(8, 'collector-network', ECONOMY)).toBe(20)
    // Called on a day the room is already open, it returns that same day.
    expect(nextOpenDayForTier(6, 'premium', ECONOMY)).toBe(6)
  })
})
