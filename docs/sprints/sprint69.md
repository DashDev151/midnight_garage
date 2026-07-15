# Sprint 69 - The standing pass, a longer ladder, and the small cuts

**Source:** playtest 2026-07-15, items 24, 1, 2, 3, 4, 5, 6b, 14, 20, plus the maintainer's
follow-up on 2026-07-15 after actually seeing the Standing screen (see Decisions 1-3).

## Confirmed current state (code discovery, 2026-07-15)

- **The Standing screen exists and is now reachable.** Sprint 62 shipped `StandingScreen.vue` at
  `/standing` with exact reputation points, the named next tier and threshold, all six disciplines'
  points, and each named technique. It was **effectively unreachable** - both entry links were
  styled `color: inherit; text-decoration: none; border-bottom: 1px dotted var(--mg-panel-edge)`,
  i.e. plain-coloured un-underlined text with a near-black border on a near-black panel. Fixed
  ahead of this sprint (commit `8d6a8ee`): a real **Standing** nav entry plus both links restyled
  as visible links, with an `App.test.ts` regression test pinning that the nav link resolves to
  `/standing` AND that the route renders. The screen has no visuals - it is deliberately prose and
  tables per Sprint 62's Law 4 amendment.
- **The reputation ladder is hardcoded in the SIM, not content.** `REPUTATION_TIER_THRESHOLDS`
  (`packages/sim/src/constants.ts:132-138`) = `{unknown: 0, local: 15, known: 50, respected: 120,
  legend: 300}`. This breaks engineering law 2 (the content law: every designer-tunable number
  lives in JSON under `packages/content`). Its own doc comment concedes the point - "first-pass,
  openly adjustable... not claimed correct - the shape (each tier meaningfully harder than the
  last) is what any future retune preserves, once real harness/playtest data exists". This sprint
  is that retune, so the numbers must move to content first.
- **Measured pacing** (competent-policy probe, latest harness run): rep accrues roughly 1 point/day
  early. `local` (15) at **p10 10 / p50 16 / p90 41**, reached by 942/1000 careers. `known` (50) at
  p50 49 (772/1000). `respected` (120) at p50 83 (371/1000). `legend` (300) never reaches the
  table inside the 100-day window.
- **The hard gate on `local`.** `invariants.py` hard-gates days-to-`local` p50 in **[10, 35]**.
  At ~1 rep/day this ties the `local` threshold almost 1:1 to the measured day - a threshold of 25
  lands ~p50 25, a threshold of 40 breaks the gate. **`local` cannot be raised freely; the upper
  rungs can.**
- **Item 1/2 (End Day).** `EndDayButton.vue:45`: `End Day<template v-if="showCash"> ({{
  formatYen(game.cashYen) }})</template>`; App.vue passes `show-cash`. Its `.primary` CSS is a flat
  pink block. The tactile pattern the maintainer likes is `AuctionScreen.vue`'s `.stepper`
  (:630-650): `box-shadow: 0 2px 0 var(--mg-panel-edge)` plus
  `:active { transform: translateY(2px); box-shadow: 0 0 0 ... }`.
- **Item 3 ("YOU LEAD" x3).** `bidStateLabel` renders it in the My Active Bids table (:149, a
  different card - legitimate), the per-lot turnout badge (:195-201, `you lead`/`outbid`), and the
  per-lot current-price headline (:232-237, `you lead at ¥X`). The redundancy is the badge and the
  headline on the SAME card.
- **Item 4 (tool wall).** `.tool-wall { grid-template-columns: repeat(6, minmax(120px, 1fr));
  overflow-x: auto }` - six columns that cannot shrink below 120px overflow their container, so the
  scrollbar is structural. Sprint 65's `min-height: 2.4em` on `.tool-column h4` reserves two lines.
- **Item 5.** Built in `classifyDayReport` itself (dayLogFormat.ts:263):
  `if (refreshedLots > 0) noise.push(\`${pluralise(refreshedLots, 'new lot')} at the auctions\`)`.
- **Item 6b.** Sprint 64 already renders wins FIRST as `.win-card` cards (DayReport.vue:40-47) with
  a `Won`/`Bought` banner. Still not landing - a weight problem, not a missing feature.
- **Item 14.** `PartsMarketScreen.vue:317-320` renders grade as plain text. `BandChip.vue` is the
  established colour-coded chip pattern.
- **Item 20.** GarageScreen's `.log` section (:191-199) renders `dayLog.slice(-40).reverse()`.

## Reuse analysis (directive 16)

**New mechanisms:** progress-bar visuals, a content home for the rep ladder, a log drawer.

**Existing mechanisms to reuse:** `game.standingView` (Sprint 62) already computes points, the next
tier AND its threshold - the bars are a re-presentation of data that already exists, no new
derivation. `StandingScreen.vue` stays where it is; only its rendering changes. `economy.json`'s
existing top-level `reputation` block takes the ladder (so the anchor-audit test is unaffected).
`deriveReputationTier`/`nextBayMinReputationTier`/`standingView` all read the thresholds through
one exported table - moving that table to content is a single indirection, not a rewrite.
`BandChip`'s chip pattern carries the grade chip; `.stepper`'s press CSS carries the End Day
button; `DayReport`'s `.win-card` exists and just needs weight.

## Decisions

1. **The Standing screen STAYS at `/standing` - my proposed move to Upgrades is CANCELLED.**
   The maintainer's explicit call after seeing it: *"The standing page is fine, don't move it to
   upgrades."* The previous draft of this sprint proposed folding it into `UpgradesScreen` on the
   reasoning that progression belongs where it is gated; that reasoning is overruled by the person
   who has now used the screen. The nav tab added in the reachability fix (`8d6a8ee`) is its
   permanent home and way in. Recorded so no future sprint re-litigates it.
2. **Real progress bars (item 24).** The maintainer, having seen the prose version:
   *"Make the mastery progress bars. Like 19/120 to next level. Same with Rep."*
   - **Reputation:** a bar of `points` against the NEXT tier's threshold, labelled
     `32 / 50` with the current and next tier named at each end. At `legend` (no next tier) the bar
     reads full with a "top of the ladder" label rather than an empty rail.
   - **Specialty:** one bar per discipline, `points` against its technique threshold (120),
     labelled `19 / 120` with the named technique beneath, and marked earned when cleared.
   Both are pure functions of `standingView`, which already carries every number. (The maintainer's
   word "mastery" is their shorthand: shipped copy still says *specialty*/*discipline*, never
   mastery/XP/level - the progression bible's banned vocabulary is untouched.)
3. **Progression bible Law 4 needs its second amendment.** Sprint 62's amendment permitted exact
   numbers on one dedicated pull-not-push screen but explicitly kept "no bar, no percentage". The
   maintainer has now asked for exactly bars. **Proposed amendment:** the ban on AMBIENT meters,
   toasts and floating numbers during play stands unchanged everywhere it already stands - nothing
   follows the player around, nothing pops up mid-job. The one Standing screen the player opens on
   purpose may use progress bars against named thresholds, because a shop owner can absolutely read
   their own ledger. *This sprint's approval is the recorded sign-off.*
4. **A much longer ladder, calibrated to REAL play (maintainer: "Rep levels are climbed too
   quickly. Raise the rep level needed for every rep rung... just raise the requirements across the
   board").** The ladder moves to content (`economy.json`'s `reputation.tierThresholds`, fixing the
   content-law violation above) so it is dialable without a code change, and every rung rises ~4x:

   | Tier | Now | New | Ratio | ~Day at the real observed rate |
   | --- | --- | --- | --- | --- |
   | unknown | 0 | 0 | - | - |
   | local | 15 | **60** | 4.0x | ~12 |
   | known | 50 | **200** | 4.0x | ~40 |
   | respected | 120 | **500** | 4.2x | ~80-100 |
   | legend | 300 | **1400** | 4.7x | a real long-game chase |

   **Calibrated against the maintainer's own session, not the bot.** The playtest reached 32 rep
   and the `local` rung by **day 6** - roughly **5 rep/day**. The harness's competent-policy probe
   earns roughly **1 rep/day** and takes until p50 day 16. The old ladder was scaled to the bot, so
   it collapses under real play: at 5/day the current `local` (15) falls on day 3. These numbers
   target the real rate.
5. **The days-to-`local` gate gets re-based; the maintainer's instruction is the approval.** The
   hard gate (p50 in [10, 35]) is calibrated against the ~1 rep/day bot, so a 4x ladder puts it at
   roughly p50 60 - outside the band by construction. The maintainer has explicitly overruled the
   collision ("I don't care. Just raise the requirements across the board"), which is the recorded
   approval the Sprint 29 precedent requires for a band move. The band is re-based against the new
   ladder and the real measured figure is disclosed in the Exit, NOT force-passed. The deeper
   finding - that this invariant has been measuring **bot patience rather than game pacing** for
   its whole life, because the probe bot earns rep 5x slower than a real player - is recorded in
   `TODO.md` alongside the other harness-realism gaps; re-basing the band is the honest short-term
   move, fixing the probe is a bigger job than this sprint.
6. **Consequences to disclose, not paper over.** `known` at 200 gates tool tier 3 and the upper
   bays, so mid-game capability arrives materially later for the bots (and later, but far less so,
   for a real player at 5/day). `respected`/`legend` will fall outside the 100-day harness window
   entirely. Sprint 23's informational pacing targets (known day 50-70, respected day 90-120) were
   written against the old ladder and are retired rather than silently missed. Whether the harness
   window should grow past 100 days to measure the upper rungs at all is flagged for the
   maintainer, not decided here. Every figure lands in the Exit.
7. **End Day: one word, real travel (items 1, 2).** The `showCash` prop and its call site are
   deleted - the button says `End Day`, nothing else (cash already lives in the garage tiles and
   every screen header). It adopts `.stepper`'s press physics: a 2px bottom shadow that collapses
   under `:active` with a matching translate.
8. **One lead indicator per card (item 3).** The per-lot turnout badge drops its
   `you lead`/`outbid` span; the `current-price` headline keeps `you lead at ¥X` - the fact
   attached to the number it is a fact about. The My Active Bids table keeps its own.
9. **A tool wall that fits (item 4).** `grid-template-columns: repeat(6, minmax(0, 1fr))` so
   columns can actually shrink, and `overflow-x` drops to `visible` - the scrollbar was a symptom
   of the 120px floor.
10. **The auction-catalogue line is deleted (item 5).** One line out of `classifyDayReport`. The
    sim keeps logging the entry (the day log and the harness read it); the morning report simply
    stops reporting inventory churn the player can go look at.
11. **A win you cannot miss (item 6b).** `.win-card` gets real weight: the car's name at headline
    size, `WON` as a large accent banner, the price beneath, boxed in the accent colour at full
    width above everything else - and the report's heading leads with it ("Day 12 - you won the
    Wagon R") instead of a neutral "Day 12 complete". `DayReportWin` already carries model, year
    and price.
12. **Grade is a chip (item 14).** New `GradeChip.vue` following `BandChip`'s exact shape,
    colour-ramped stock -> street -> sport -> race, in the parts-market row and anywhere else a
    bare grade string renders (the Replace drawer's `PartCard` meta line).
13. **The log moves off the garage (item 20).** A collapsible drawer opened from a small control in
    the app chrome, rendering the same `describeLogEntry` list. The garage keeps the bays and the
    shop.

## Tasks

**Claude:**

1. Content: `reputation.tierThresholds` in `economy.json` + schema + doc comment recording the
   ladder's derivation and the days-to-`local` interlock; delete `REPUTATION_TIER_THRESHOLDS` from
   `sim/constants.ts` and thread the content value through its readers
   (`deriveReputationTier`, `standingView`, the bay/tool gates, the dev console). Content test.
2. Game: the reputation bar + the six specialty bars on `StandingScreen.vue` (decision 2); tests
   (a bar renders points/threshold; the legend case has no next tier; banned vocabulary absent).
3. Docs: the progression-bible Law 4 second amendment (decision 3), recorded with date and
   rationale; record decision 1's cancellation of the proposed move.
4. Game: End Day button (1, 2); auction lead badge (3); tool wall (4); day-report line deletion +
   win weight (5, 6b); `GradeChip.vue` + call sites (14); the log drawer (20). Component tests.
5. Full gate; **balance harness + invariant check** (the ladder change moves days-to-`local`
   directly): confirm the gate still passes at the new `local`, and disclose the full days-to-tier
   table before/after, the reachability counts, and decision 5's consequences in the Exit. If
   days-to-`local` leaves [10, 35], STOP and bring the numbers to the maintainer.

**User-only (maintainer):**

- Approving this sprint doc is the recorded approval Law 4's second amendment requires.
- Rule on the proposed ladder once the harness numbers are in - especially whether `known` at 110
  arriving near day 90+ is the intended mid-game pace, and whether the 100-day harness window
  should grow to measure the upper rungs at all.

## Definition of done

- The Standing screen stays at `/standing`, reachable from the nav, and shows real progress bars
  for reputation (against the next tier) and all six disciplines (against the technique threshold);
  Law 4's second amendment recorded.
- Every reputation rung costs more than it did; the ladder lives in content, not sim constants;
  days-to-`local` still passes its hard gate (or a band move is recorded), and every pacing
  consequence is disclosed.
- End Day says "End Day" and presses like a lever; one lead indicator per auction card; the tool
  wall has no scrollbar; the day report never mentions lot churn and a win is the loudest thing on
  it; part grade reads as a colour-coded chip; the event log is off the main garage view.
- Full gate green.

## Exit

Not started.
