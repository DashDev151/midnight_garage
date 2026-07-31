import {
  ReputationTierSchema,
  type EconomyConfig,
  type ReputationTier,
} from '@midnight-garage/content'

/** GDD 2.2: "starting in 1995." */
const CALENDAR_START_YEAR = 1995

/** GDD 2.2: "the calendar advances ~2 in-game years per reputation tier." */
const YEARS_PER_REPUTATION_TIER = 2

/**
 * The in-game calendar year for a reputation tier (GDD 2.2: "1995 -> 2005
 * over a full campaign, ~2 years per tier"). Gates which car model years can
 * plausibly appear at auction or as a service-job customer's car - a
 * first-pass formula, explicitly tunable like every other constant here.
 *
 * Reads reputation, not elapsed time - R1 in sale-value-implementation-plan.md
 * has already settled that the campaign year moves onto a `campaignYearCurve`
 * driven by elapsed days instead, in a later sprint. This sprint (149) builds
 * the calendar's day/week/month primitives around this function without
 * touching what it reads.
 */
export function currentGameYear(reputationTier: ReputationTier): number {
  return (
    CALENDAR_START_YEAR +
    YEARS_PER_REPUTATION_TIER * ReputationTierSchema.options.indexOf(reputationTier)
  )
}

/** Weekday names for `dayOfWeek`'s 1-indexed positions - a repeating
 * 7-day week labelled for display only (sprint149.md); not a real 1995
 * calendar and never grows leap years or actual dates. Position 1 is
 * `calendar.rentDayOfWeek`'s "start of the week"; the last position is
 * `calendar.meetDayOfWeek`'s weekend. */
const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

/**
 * `calendar.ts` is the ONLY place `state.day` is ever turned into a day of
 * the week or a month - every other module calls these derivations instead
 * of keeping a private `% 7` (sprint149.md; guarded by
 * `packages/content/tests/calendarOwnershipGuard.test.ts`).
 *
 * `day`'s 1-indexed position within its `calendar.daysPerWeek`-long week:
 * day 1 is position 1, day `daysPerWeek` is the last position, day
 * `daysPerWeek + 1` is position 1 again.
 */
export function dayOfWeek(day: number, economy: EconomyConfig): number {
  return ((day - 1) % economy.calendar.daysPerWeek) + 1
}

/** `dayOfWeek`'s display name - only used for copy (`DayCashBox.vue`,
 * `DayReport.vue`), never for scheduling logic. Falls back to the bare
 * number if `daysPerWeek` is ever tuned longer than the named list, so a
 * content change can't produce `undefined` in player-facing text. */
export function dayOfWeekName(day: number, economy: EconomyConfig): string {
  const position = dayOfWeek(day, economy)
  return WEEKDAY_NAMES[position - 1] ?? `day ${position}`
}

/** Whether `day` is the first day of its week. */
export function isStartOfWeek(day: number, economy: EconomyConfig): boolean {
  return dayOfWeek(day, economy) === 1
}

/** Whether `day` is the last day of its week - the exact days the retired
 * `day % 7 === 0` literal used to fire on, kept for the two cadences
 * (market-heat drift, the staff-ad refresh) sprint149.md does not move to a
 * named landmark. */
export function isEndOfWeek(day: number, economy: EconomyConfig): boolean {
  return dayOfWeek(day, economy) === economy.calendar.daysPerWeek
}

/** Whether `day` is `calendar.auctionDayOfWeek` - the one day the auction
 * catalogue is open (`AuctionScreen.vue`). */
export function isAuctionDay(day: number, economy: EconomyConfig): boolean {
  return dayOfWeek(day, economy) === economy.calendar.auctionDayOfWeek
}

/** Whether `day` is `calendar.meetDayOfWeek` - the weekend meet's one
 * guaranteed draw only resolves on this day (`selling.ts`'s
 * `drawOfferForChannel`), never on the next End Day regardless of what day
 * that happens to be. */
export function isMeetDay(day: number, economy: EconomyConfig): boolean {
  return dayOfWeek(day, economy) === economy.calendar.meetDayOfWeek
}

/** Whether `day` is `calendar.paydayOfWeek` - staff wages fall here
 * (`finances.ts`), separated from the rent bill so the two never land as
 * one undifferentiated weekly subtraction. */
export function isPayday(day: number, economy: EconomyConfig): boolean {
  return dayOfWeek(day, economy) === economy.calendar.paydayOfWeek
}

/** Whether `day` is `calendar.rentDayOfWeek` - the rent bill falls here
 * (`finances.ts`), at the start of the week so a new week opens with its
 * fixed cost visible. */
export function isRentDay(day: number, economy: EconomyConfig): boolean {
  return dayOfWeek(day, economy) === economy.calendar.rentDayOfWeek
}

/**
 * The 1-indexed game month `day` falls in - a game month, not a Gregorian
 * one: `floor((day - 1) / daysPerMonth) + 1`. Day 1 is month 1; day
 * `daysPerMonth` is the last day of month 1; day `daysPerMonth + 1` opens
 * month 2. `daysPerMonth` is chosen (28) as four clean weeks, so a month
 * boundary always lands on a week boundary too.
 */
export function monthIndex(day: number, economy: EconomyConfig): number {
  return Math.floor((day - 1) / economy.calendar.daysPerMonth) + 1
}

/** Whether `day` is the first day of a new month - the primitive later
 * sprints hang a monthly event on (the fixer's appetite, the container's
 * departure); nothing is hung on it yet (sprint149.md). */
export function isMonthBoundary(day: number, economy: EconomyConfig): boolean {
  return (day - 1) % economy.calendar.daysPerMonth === 0
}
