import {
  ERA_IDS,
  SEASON_IDS,
  type AuctionTier,
  type EconomyConfig,
  type EraId,
  type SeasonId,
} from '@midnight-garage/content'
import { interpolateCurve } from './marketValue'

// Re-exported so `@midnight-garage/game` can import the id types straight
// from `@midnight-garage/sim` (display labels live there, per the split in
// campaign-clock-and-events.md) rather than reaching into
// `@midnight-garage/content` for a sim-shaped id.
export type { EraId, SeasonId }

/**
 * The in-game calendar year at `day` elapsed days into the campaign
 * (sprint204.md; R1, sale-value-implementation-plan.md). Reads
 * `economy.campaignYearCurve` through the same `interpolateCurve`
 * `marketValue.ts` uses for `mileageFactorCurve`, then rounds to the nearest
 * whole year - every reader wants a year, never a fraction of one. Gates
 * which car model years can plausibly appear at auction or as a service-job
 * customer's car.
 *
 * INTERNAL ONLY: no UI ever renders this figure
 * (docs/design/systems/campaign-clock-and-events.md section 2a) - a
 * player-facing surface reads `eraOf` instead. Takes elapsed days, not
 * reputation: R1's guard G1 deletes the old reputation-tier argument rather
 * than leaving it ignored, since a low-standing player must not be frozen at
 * the campaign's opening year forever.
 */
export function currentGameYear(day: number, economy: EconomyConfig): number {
  return Math.round(interpolateCurve(economy.campaignYearCurve, day))
}

/** Weekday names for `dayOfWeek`'s 1-indexed positions - a repeating
 * `calendar.daysPerWeek`-day week labelled for display only (sprint149.md,
 * shortened to five names in sprint204.md); not a real 1995 calendar and
 * never grows leap years or actual dates. The last position is
 * `calendar.meetDayOfWeek`'s weekend, and also `calendar.rentDayOfWeek`:
 * rent and the meet deliberately share a day, one a charge and the other a
 * selling-channel draw. */
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const

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
 * (`finances.ts`), at the end of the week (the pre-sprint149.md
 * `day % daysPerWeek === 0` cadence, restored deliberately) rather than its
 * start: a brand-new player's very first End Day must not take rent off
 * their starting cash before they have bought, fixed or sold anything. */
export function isRentDay(day: number, economy: EconomyConfig): boolean {
  return dayOfWeek(day, economy) === economy.calendar.rentDayOfWeek
}

/** A season's length in days: always `daysPerWeek * weeksPerSeason`,
 * whatever `campaignYearCurve` does (sprint204.md, R1's third bullet - the
 * season cycle is fixed, independent of the elastic year). */
function seasonLengthDays(economy: EconomyConfig): number {
  return economy.calendar.daysPerWeek * economy.calendar.weeksPerSeason
}

/** `day`'s 0-indexed overall season number since the campaign began: the
 * first `seasonLengthDays` days are season 0, the next span is season 1, and
 * so on - the shared index `seasonOf` and `eraOf` both derive from, so the
 * two can never disagree about where one season ends and the next begins. */
function overallSeasonIndex(day: number, economy: EconomyConfig): number {
  return Math.floor((day - 1) / seasonLengthDays(economy))
}

/**
 * `day`'s season, cycling `SEASON_IDS` in order every `seasonsPerEra`
 * seasons - spring, summer, autumn, winter, then spring again at the next
 * era's opening day. Runs on the fixed season cycle, never on
 * `campaignYearCurve` (sprint204.md, R1's third bullet): tying the season to
 * the compressed year would make winter an arbitrary length, and "thin in
 * winter" would mean nothing.
 */
export function seasonOf(day: number, economy: EconomyConfig): SeasonId {
  const index = overallSeasonIndex(day, economy) % SEASON_IDS.length
  return SEASON_IDS[index]!
}

/** `day`'s 1-indexed position within its own season: day 1 of a season is
 * position 1, the last day of a `seasonLengthDays`-long season is the last
 * position, and the next day wraps to position 1 of the next season. */
export function dayOfSeason(day: number, economy: EconomyConfig): number {
  return ((day - 1) % seasonLengthDays(economy)) + 1
}

/**
 * `day`'s era, cycling `ERA_IDS` in order every `seasonsPerEra` seasons - the
 * year-equivalent a player actually sees, since no specific year is ever
 * rendered (docs/design/systems/campaign-clock-and-events.md section 2a).
 * Runs on the same fixed season cycle `seasonOf` does, never on
 * `campaignYearCurve`: the two curves answer different questions
 * (`campaign-clock-and-events.md` section 2, "two clocks, not one") and only
 * `currentGameYear` reads the elastic one.
 */
export function eraOf(day: number, economy: EconomyConfig): EraId {
  const eraIndex = Math.floor(overallSeasonIndex(day, economy) / economy.calendar.seasonsPerEra)
  return ERA_IDS[Math.min(eraIndex, ERA_IDS.length - 1)]!
}
