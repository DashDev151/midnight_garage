# Sprint 204: the calendar

**Status: APPROVED, implementing.** Implements ruling **R1**
(`sale-value-implementation-plan.md`, settled 2026-07-30, unbuilt) and the shape settled
2026-08-14 in `docs/design/systems/campaign-clock-and-events.md`.

**Levers (directive 22 as amended):** this sprint moves calendar values under
behaviour-first governance. The felt behaviour is stated below, the values are chosen
here, and the guard re-pins with that statement recorded.

**The felt behaviour:** a career runs **320 days**: five-day weeks, four weeks to a
season, four seasons to an era, four eras (mid 90s, late 90s, early 2000s, mid 2000s).
About 21 hours of play. **A day now costs something**, in two ways that must both be
true: the world moves on the calendar rather than on the player's reputation, so
dawdling means the era changes around you; and rent and wages, charged per week, cost
about 40 per cent more per day than on a seven-day week (roughly Y4,000 against Y2,857
of base rent) because the same weekly charge now falls across fewer days.

## Why

`currentGameYear(reputationTier) = 1995 + 2 x tierIndex`. The world advances with
progress, not time, so day 5 and day 50 are mechanically identical and every labour cost
is free. R1's own motivation: a low-standing player was frozen in 1995 permanently.

## Reuse analysis (directive 16)

**Reused:** `interpolateCurve` (`marketValue.ts`) for the year curve, exactly as R1
specifies; `calendar.ts`'s existing day arithmetic and its `monthIndex`/`isMonthBoundary`
pair, which exist with nothing hung on them; `DayCashBox.vue`, the shipped top-right box,
which gains the stamp rather than being replaced; the Standing screen's office-wall
section (the garage interior and its room scenes were deleted in Sprint 201, so the wall
is where office fiction lives now); the career harness to measure the result.

**New:** the season and era concepts, the `campaignYearCurve` content entry, and the era
band labels. No new save state: day already exists and everything else derives.

## The API contract

Both halves build to this, so they can proceed in parallel. Exported from
`packages/sim/src/calendar.ts`:

- `seasonOf(day, economy): SeasonId` where `SeasonId` is `'spring' | 'summer' | 'autumn' | 'winter'`
- `dayOfSeason(day, economy): number`, 1-based within the season
- `eraOf(day, economy): EraId` where `EraId` is `'mid-90s' | 'late-90s' | 'early-2000s' | 'mid-2000s'`
- `currentGameYear(day, economy): number`, **internal only, never rendered**
- Display labels for both id types live in `packages/game`, not in sim.

## Tasks

### A. The clock (sim and content)

- A1. `campaignYearCurve` in `economy.json` mapping elapsed days to an in-game year, the
  same shape as `mileageFactorCurve`, read through `interpolateCurve`. Four eras across
  320 days.
- A2. `currentGameYear` takes `day` and drops its `reputationTier` argument entirely
  rather than ignoring it (R1's guard G1). Update its nine consumers: model eligibility
  in `auctions.ts` and `serviceJobs.ts`, `generatedYearRangeFor`, the age-to-mileage
  chain, `catalogs.ts` (two sites), `newGame.ts`, `advanceDay.ts`, and the two dev-bench
  readers.
- A3. Calendar structure: `daysPerWeek` 7 to 5, plus season and era lengths in content.
  The day-of-week fields must move with it or they fall out of range: `rentDayOfWeek` 7,
  `meetDayOfWeek` 7, `paydayOfWeek` 5. The seven-name weekday array shortens to five.
  `daysPerMonth` is superseded by the season and goes.
- A4. Seasons run on their own fixed cycle, independent of the year curve (R1's third
  bullet), so a season is always 20 days whatever the curve does.
- A5. Re-read anything counted in weeks now that a week is shorter:
  `marketPressure.WAVE_PERIOD_WEEKS` (24 weeks was 168 days, now 120) and
  `sceneStandingProgress.rollingWindowDays`. Decide each deliberately and record the
  reasoning; do not let them drift silently.
- A6. Guard re-pin with the felt-behaviour statement recorded in the header.

### B. The UI

- B1. `DayCashBox.vue` (top right, already shipped) shows the full stamp: the day, the
  season, the era. **No year, ever, anywhere.**
- B2. A wall calendar in the Standing screen's office-wall section, beside the
  photographs and certificates: the current season laid out as its four weeks of five
  days, the current day marked. It reads as a thing on a wall, not a data table.
- B3. Every player-facing surface that names a date or a deadline uses the season, never
  an absolute day number. Sweep for existing "day N" copy.

### C. Measurement

- C1. The smoke career replays under the new calendar; the golden-career report shows
  the rent-per-day change rather than leaving it to be discovered later.
- C2. A probe pinning the campaign shape: 320 days, four eras, 16 seasons, and the era
  boundaries landing where the curve says.

## Definition of done

- The world advances on elapsed days; `currentGameYear` has no reputation argument.
- 5 / 4 / 4 / 4 holds, with every dependent calendar lever moved and none left invalid.
- The top-right box and the office wall both read day, season and era; no year appears
  anywhere in the game.
- Weekly-counted values were re-decided deliberately, with reasoning recorded.
- `pnpm typecheck` before reporting (an exported signature changes); narrowest tests
  once; the pre-push gate is the evidence.

## Exit

**Implemented 2026-08-14 by two agents against the API contract, then verified together.**

- **The clock.** `currentGameYear(day, economy)` reads a new `campaignYearCurve` through
  the reused `interpolateCurve`; the reputation argument is deleted, per R1's guard G1.
  Curve authored as `[[1,1995],[81,1998],[161,2000],[241,2003],[320,2005]]`: era openings
  at days 1, 81, 161 and 241, spans of 80/80/80/79 days covering 3/2/3/2 years, so the
  decade is spanned end to end and the compression is invisible because the year is never
  rendered. All nine consumers updated.
- **The shape.** `daysPerWeek` 5, `weeksPerSeason` 4, `seasonsPerEra` 4, four eras, 320
  days. `daysPerMonth` retired with `monthIndex`/`isMonthBoundary`, which nothing used.
  `rentDayOfWeek` and `meetDayOfWeek` land on 5 (the week's last day), `paydayOfWeek` on
  4. Auction `openDaysOfWeek` remapped into the shorter week, which was forced rather than
  optional: the old literals 6 and 7 fell outside the schema's own `[1, daysPerWeek]`
  bound and would have shut the premium and collector rooms permanently.
- **The two week-counted decisions, made deliberately.** `WAVE_PERIOD_WEEKS` stays at 24
  because it is denominated in weeks and sits beside rent, payday and auction cadence,
  which are too; the accepted consequence is a 120-day period, about 2.7 market cycles
  across a campaign. `rollingWindowDays` rescales 14 to 10 because it is denominated in
  days, and leaving it would have quietly turned "the trailing two weeks" into 2.8 weeks.
- **A pre-existing bug found and fixed:** `marketHeat.ts` derived its week index from a
  hardcoded `Math.floor(day / 7)` rather than `calendar.ts`'s `weekIndex`. Invisible while
  the week was seven days; wrong the moment it was not.
- **The UI.** The top-right box carries the stamp on two lines, `Day 07, Winter` over a
  dimmer `Early 2000s`, since the era moves every 80 days and the day moves daily. The
  Standing screen's office wall carries a season planner: four rows of five, today marked,
  resetting to 01 each season. No year appears on any player-facing surface, guarded by
  tests on both. Absolute day references in copy were re-expressed relatively where
  precision survived (parts delivery, staff ads) and left alone where it would not (the
  cost sheet's own weekly record, the day report's headline).
- **Measurement.** The career report now prints rent per week and per day directly rather
  than leaving the 40 per cent shift to be discovered. `campaignShape.test.ts` pins 320
  days, four eras, sixteen seasons and the era boundaries landing on the curve's own
  breakpoints.

**Evidence:** sim 2,843, content 625, game 1,149, all green; `pnpm typecheck` clean across
all three packages. Fallout was wide and entirely directive 17 case (a): golden hashes
re-derived from real runs, week-scaffolded tests rebuilt on `daysPerWeek`, and the
bench's year control now driven by shop day rather than reputation tier.

**Flagged, not actioned:** `economy-bible.md`'s anchor inventory table is stale on several
pre-existing points (it still names retired keys and misses current ones). It is a locked
bible, so amending it needs its own sign-off; logged in `TODO.md`.

**Open for the maintainer's walk:** day 5 now carries rent, the meet and the premium room
at once. That reads as a weekend where the scene happens and the bills land, but it is a
real change in the week's rhythm and wants a feel check rather than a probe.
