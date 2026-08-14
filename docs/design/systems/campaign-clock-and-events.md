# The campaign clock and recurring events

Design of record for making time cost something. Builds on ruling **R1**
(`sale-value-implementation-plan.md`, settled 2026-07-30, unbuilt), which already decided
the clock's shape. Design only, no lever moves.

## 1. The problem, stated mechanically

`currentGameYear(reputationTier) = 1995 + 2 x tierIndex`. The world advances with
progress, not with time, so day 5 and day 50 are mechanically identical worlds. Nothing
decays, nothing arrives, nothing closes. A day therefore costs nothing, and **any
mechanic that spends labour is free**, which is why no labour sink built so far has ever
bitten. Adding more things to spend labour on cannot fix this; spending is free when the
currency never expires.

## 2. Two clocks, not one

R1's own two bullets separate cleanly, and the separation is the design:

| Clock | Runs on | Governs | Elastic? |
| --- | --- | --- | --- |
| **The era clock** | elapsed days through `campaignYearCurve` | what the world OFFERS: model eligibility, the age floor, the age-to-mileage curve, era flavour | yes, campaign length is one signed lever |
| **The season cycle** | its own fixed period | WHEN things happen: recurring events, demand rhythms, weather later | no, fixed so "spring" always means the same span |

Era events (a model arrives, the scene shifts) pin to a **year**. Recurring events (the
show, the meet) pin to a point in the **season cycle**. Tying recurrence to the elastic
year would let events cluster or drift as campaign length is tuned; tying the world's
contents to the fixed cycle would strand the decade. Each clock gets the job it can hold.

## 2a. The year is never shown (settled by the maintainer)

**No specific year appears anywhere in the game.** The date stamp is
`Day 14, Spring, Mid 90s`. The sim keeps its year internally, because generation needs
it; the UI renders an era band instead. That is the whole implementation cost: one
mapping, no mechanic change.

Three reasons it earns its place, only the first of which is cosmetic:

1. **The compression becomes unfalsifiable.** A player who never sees a year can never
   notice that one lasted twice as long as another, so the curve is free to bend as
   hard as the pacing needs.
2. **It is the anti-repetition mechanism.** Cycle count is not what makes a decade
   repetitive; identical cycles are. Bands force the world to visibly move between them,
   so the third spring show happens in a different world from the first rather than the
   same one with a bigger number on it.
3. **It makes precision valuable.** The narrative's climax turns on a record carrying an
   exact figure. In a game that never shows you a number of that kind, the one document
   that does becomes an event by itself.

**Shape, settled: 5 / 4 / 4 / 4.** Five days to the week, four weeks to the season, four
seasons to the era, four eras (mid 90s, late 90s, early 2000s, mid 2000s). **320 days**,
about **21 hours** at four minutes a day. There is no "year" concept at all: the era is
the year-equivalent, which is what lets the year never be spoken.

The reason: **320 End Day clicks instead of 672.** The day is an interaction with a cost,
and a calendar that ignores that is designing on paper.

Two consequences that follow from the shape: the campaign holds 16 seasons, so each
seasonal event recurs exactly four times, each in a different era; and rent moves, see
below.

**A knock-on worth having:** deadlines stop being absolute day numbers and become
seasonal. "Before winter" is how a person plans; "by day 340" is how a spreadsheet does.

**A knock-on to make deliberate rather than accidental:** rent and wages are charged per
WEEK. Shortening the week from seven days to five raises the daily cost of time by about
40 per cent (base rent alone goes from roughly Y2,857 to Y4,000 a day) with no lever
touched. That serves this document's whole purpose, but it should be a decision rather
than a side effect, and the golden careers should measure it.

**Calendar levers that must move together**, since several are expressed in days-of-week
and would become invalid: `calendar.daysPerWeek` (7 to 5), `rentDayOfWeek` (7, out of
range once the week is five days), `meetDayOfWeek` (same), `paydayOfWeek`, the seven-name
weekday array in `calendar.ts`, `daysPerMonth` (28, superseded by the season), plus a
re-read of anything counted in weeks: `marketPressure.WAVE_PERIOD_WEEKS` (24 weeks is 120
days at a five-day week rather than 168) and `sceneStandingProgress.rollingWindowDays`.

## 3. Recurring events: the anatomy

An event is a **prize with a date**, never a door.

- **Pinned and announced.** It sits at a fixed point in the season cycle and appears on
  the calendar well ahead. An unannounced deadline is a trap; a visible one is a plan.
- **Entry is a car, by the day.** The criteria are the existing requirement vocabulary
  (band floors, stat thresholds, and the `deadline` requirement kind that already
  exists), so an entry is mechanically a mission delivery with a hard date.
- **The criteria must be unbuyable.** The car has to be YOUR build (provenance already
  records who did the work) and of a given character (sourcing is part of the task).
  Otherwise a rich player buys a mint car and the event becomes a cheque.
- **Missing it costs a year, not a run.** It returns next cycle. No progression is
  gated behind it, ever, which is what lets it be sharp without being cruel.
- **The reward is standing and identity**, never a payout. A plaque on the office wall,
  the scene remembering you were at the '98 show. Payout rewards would make it a farm to
  be optimised; identity rewards make it a thing you wanted.
- **It moves the market whether or not you enter.** Show week brings buyers to town:
  demand shifts for that week. So the date matters to every player, including the one
  who never enters, and the calendar acquires texture beyond its deadlines.

## 4. Why this prices labour (the crux)

Money is unbounded over time: you can always earn more, later. Labour is hard-capped per
day. The two are incommensurable until something fixes the number of days available, and
a deadline does exactly that. **The exchange rate appears on its own:**

- Three weeks to the show: harvest a donor, recondition by hand, spend days not yen.
- Three days to the show: buy the parts, fit them, spend yen not days.

That is the balance the design has been missing, and it is a consequence of the deadline
rather than a thing that needs tuning into existence. Every other pressure in this
document is secondary to it.

## 5. What it reuses, what is new

**Reused (directive 16):** the requirement vocabulary including its existing `deadline`
kind; the mission delivery flow, since an entry IS a delivery; the `expiresOnDay` idiom
(three independent copies exist already, so a fourth is idiomatic even if unifying them
is a separate cleanup); `monthIndex`/`isMonthBoundary`, which exist in `calendar.ts` with
nothing hung on them yet; `interpolateCurve` for the year curve, exactly as R1 specifies;
scene standing and reputation as reward sinks; provenance for the "your build" test.

**New:** the `campaignYearCurve` content entry (R1, unbuilt); the fixed season cycle (R1,
unbuilt); an events content file; and per-occurrence event state on `GameState`, which is
genuinely absent today (no year-like or season-like field exists anywhere).

**Rewiring cost is small and contained:** `currentGameYear` has nine consumers, all
generation-side (model eligibility for auctions and service jobs, the generated-year
range, the age-to-mileage chain, plus two dev-bench readers). Its reputation argument is
deleted rather than ignored, per R1.

## 6. Implications

1. **This unblocks Workstream E.** Reputation is currently the campaign clock, which is
   the single biggest obstacle to deciding whether reputation survives as a visible
   mechanic. Rehoming the clock onto elapsed time removes that entanglement for free.
2. **It fixes R1's own stated motivation.** A low-standing player was frozen in 1995
   permanently, which punished exactly the player already struggling.
3. **Generation becomes day-dependent**, so the golden careers must pin it. The
   instrument for that now exists, which is the right order for once.
4. **Campaign length becomes one signed number** (the curve), not a code change.
5. **Risk: the treadmill.** Many events would turn a calendar into a chore list. Few,
   well spaced, and each one memorable.
6. **Risk: mandatory income.** If an event's reward becomes the efficient play, it stops
   being voluntary. Identity rewards, not yen, is the guard.

## 7. Open questions for the maintainer

1. **Campaign length.** How many real days should the decade take? This is R1's one
   signed lever and everything else scales off it.
2. **How many events per cycle, and which?** The period-correct candidates that fit the
   cast and channels: a new-year first-run, a spring show (Dai-chan), a summer mountain
   meet (the Night Nurse), an autumn track day (Reiko). One per season is the obvious
   shape and may already be one too many.
3. **Does entry cost money directly** (an entry fee) or only indirectly through the
   build? A fee is the simplest way to guarantee both currencies are spent, at the cost
   of a little elegance.
