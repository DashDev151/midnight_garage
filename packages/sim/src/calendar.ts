import {
  ReputationTierSchema,
  type AuctionTier,
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
 * calendar and never grows leap years or actual dates. The last position
 * is `calendar.meetDayOfWeek`'s weekend, and also `calendar.rentDayOfWeek`:
 * rent and the meet deliberately share a day, one a charge and the other a
 * selling-channel draw. */
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

/**
 * `day`'s 1-indexed week number: days 1 to `daysPerWeek` are week 1, the
 * next `daysPerWeek` days are week 2, and so on. The other half of an
 * auction room's cadence, alongside `dayOfWeek` - a room that sits every
 * second week needs to know WHICH week today is, not just which day.
 */
export function weekIndex(day: number, economy: EconomyConfig): number {
  return Math.floor((day - 1) / economy.calendar.daysPerWeek) + 1
}

/**
 * Whether `tier`'s auction room opens on `day` - the one implementation of
 * "is this room open", read by the auction screen and nothing else derives
 * it (sprint150.md). A room opens when today's position in the week is one
 * of its `openDaysOfWeek` AND today's week satisfies its `weeksBetween`.
 *
 * Week 1 is an open week for every room, so `collector-network`
 * (`weeksBetween` 2) first sits on days 6 and 7 of week 1, then weeks 3, 5
 * and so on. Rooms deliberately overlap - `premium` and `collector-network`
 * are both open on day 6 of an open week, which is desirable rather than a
 * clash - and attending a room costs nothing but the admission, so a player
 * may sit at every room open today.
 */
export function isAuctionTierOpen(day: number, tier: AuctionTier, economy: EconomyConfig): boolean {
  const cadence = economy.auction.cadenceByTier[tier]
  if (!cadence.openDaysOfWeek.includes(dayOfWeek(day, economy))) return false
  return (weekIndex(day, economy) - 1) % cadence.weeksBetween === 0
}

/**
 * The first day at or after `fromDay` that `tier` opens - what the auction
 * screen tells the player when a room is shut. Searches one full cadence
 * cycle (`daysPerWeek * weeksBetween` days), which always contains at least
 * one sitting for any cadence the schema allows, so the `null` is
 * unreachable in practice and exists only so a caller never has to trust
 * that.
 */
export function nextOpenDayForTier(
  fromDay: number,
  tier: AuctionTier,
  economy: EconomyConfig,
): number | null {
  const { weeksBetween } = economy.auction.cadenceByTier[tier]
  const horizonDays = economy.calendar.daysPerWeek * weeksBetween
  for (let day = fromDay; day < fromDay + horizonDays; day++) {
    if (isAuctionTierOpen(day, tier, economy)) return day
  }
  return null
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
 * (`finances.ts`), at the end of the week (restoring the pre-sprint149.md
 * `day % 7 === 0` cadence exactly) rather than its start: a brand-new
 * player's very first End Day must not take rent off their starting cash
 * before they have bought, fixed or sold anything. */
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
