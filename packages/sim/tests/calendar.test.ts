import { ECONOMY, ReputationTierSchema } from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  currentGameYear,
  dayOfWeek,
  dayOfWeekName,
  isAuctionDay,
  isEndOfWeek,
  isMeetDay,
  isMonthBoundary,
  isPayday,
  isRentDay,
  isStartOfWeek,
  monthIndex,
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
    expect(dayOfWeekName(ECONOMY.calendar.rentDayOfWeek, ECONOMY)).toBe('Monday')
    expect(dayOfWeekName(ECONOMY.calendar.auctionDayOfWeek, ECONOMY)).toBe('Wednesday')
    expect(dayOfWeekName(ECONOMY.calendar.paydayOfWeek, ECONOMY)).toBe('Friday')
    expect(dayOfWeekName(ECONOMY.calendar.meetDayOfWeek, ECONOMY)).toBe('Sunday')
  })

  it('every named landmark fires exactly once per seven-day span, over a 100-day run', () => {
    const { daysPerWeek } = ECONOMY.calendar
    const landmarks: Record<string, (day: number) => boolean> = {
      auction: (day) => isAuctionDay(day, ECONOMY),
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

  it('the four named landmarks land on four different days, so no two bills share a day', () => {
    const { auctionDayOfWeek, meetDayOfWeek, paydayOfWeek, rentDayOfWeek } = ECONOMY.calendar
    const days = [auctionDayOfWeek, meetDayOfWeek, paydayOfWeek, rentDayOfWeek]
    expect(new Set(days).size).toBe(days.length)
  })
})
