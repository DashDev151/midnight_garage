import type { EraId, SeasonId } from '@midnight-garage/sim'

/**
 * Player-facing words for the calendar's season and era ids. The sim only
 * ever carries the ids (`seasonOf`, `eraOf`); the copy a player reads lives
 * here, per the split in `campaign-clock-and-events.md` between mechanism
 * and display.
 */
const SEASON_LABELS: Readonly<Record<SeasonId, string>> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
}

const ERA_LABELS: Readonly<Record<EraId, string>> = {
  'mid-90s': 'Mid 90s',
  'late-90s': 'Late 90s',
  'early-2000s': 'Early 2000s',
  'mid-2000s': 'Mid 2000s',
}

export function seasonLabel(season: SeasonId): string {
  return SEASON_LABELS[season]
}

export function eraLabel(era: EraId): string {
  return ERA_LABELS[era]
}

/** Zero-padded two-digit day-within-season, e.g. 7 -> "07". The calendar
 * never shows the absolute campaign day or a year, only where a player
 * stands inside the current season (design law: no year appears anywhere). */
export function seasonDayLabel(dayWithinSeason: number): string {
  return String(dayWithinSeason).padStart(2, '0')
}

/**
 * The season's fixed shape - five days to the week, four weeks to the
 * season - settled in `campaign-clock-and-events.md` section 2a and never
 * elastic (only the era clock stretches). The wall calendar renders exactly
 * this shape rather than reading a content value that does not vary.
 */
export const DAYS_PER_WEEK = 5
export const WEEKS_PER_SEASON = 4
