# Sprint 64 - The morning report: wins read as wins, and Buy Now steps back

**Source:** playtest 2026-07-14 pass 2, items 3, 6, 13. Item 13 is the heart of it: the
first thing a player sees after winning an auction is a huge red -¥156,030. Mathematically
correct, emotionally wrong - winning should be a celebration.

## Confirmed current state (code discovery, 2026-07-14)

- **The report is a flat list under a scary number.** `DayReport.vue` shows "Day N complete",
  one headline figure - `formatYenDelta(report.cashDeltaYen)`, red when negative
  (`DayReport.vue:19-29, 75-77`) - then a flat `<ul>` of `describeLogEntry` strings with no
  grouping, ordering, or styling weight.
- **"New local-yard auction catalog: 1 lots"** comes from the `auction-catalog-refreshed`
  case (`dayLogFormat.ts:39-40`); the pluralisation bug is real (no singular branch).
- **The win entry has everything a celebration needs:** `auction-bid-won` carries
  `modelId`, `year`, `finalPriceYen` (`gameState.ts:357-362`).
- **Near-daily noise types:** `market-heat-shift`, `job-progress`, `wage-paid`, `rent-paid`,
  `service-bay-income`, `auction-catalog-refreshed` - one line each, unbatched.
- **Buy Now is one accidental click from firing.** It sits directly beneath the Raise button
  in `.lot-action-buttons` (`AuctionScreen.vue:264-280`), same block, immediate
  `game.buyout(...)`, no confirmation. The audit also found the auction card's disabled
  buttons carry no explanation at all.

## Reuse analysis (directive 16)

**New mechanisms:** report sectioning/celebration presentation and a buyout confirm step -
both presentation-layer only.

**Existing mechanisms to reuse:** the DayLogEntry schemas and sim logging are untouched
(everything needed is already on the entries); `describeLogEntry` stays the single formatter,
extended to classify entries into sections; the two-step confirm pattern (End Day cart
confirm, New Game confirm) carries Buy Now; `formatYen`/`formatYenDelta` as-is.

## Decisions

1. **The report gets sections and a hierarchy.**
   - **Wins first.** When `auction-bid-won` (or a buyout) fired, the report opens with one
     celebratory card per car - model, year, "Won for ¥X" - in accent colour, never red.
     The money spent is framed as the purchase it is, not a loss headline.
   - **Money, honestly split.** The net delta stays but stops being the whole story: one
     compact line derives "earned / spent on cars / bills" from that day's entries (game
     layer only - no sim change).
   - **Then the shop and the market.** Job and delivery lines; auction lines (outbid alerts
     prominent - they are actionable); routine noise (heat shifts, catalogue refreshes,
     rent/wages) aggregated into single quiet lines with correct grammar ("3 lots arrived
     at the local yard" / "1 lot..."), or dropped where they carry no decision value.
2. **Pluralisation fixed** at the formatter, and as a general rule for count lines.
3. **Buy Now demotes and confirms.** It leaves `.lot-action-buttons`: rendered at the
   bottom of the card as a small ghost-style control, visually separated from the bid
   stack, with a two-step confirm ("Buy now ¥X" -> "Confirm buyout ¥X", auto-resetting) per
   the End Day precedent. While demoting it, the card's disabled buttons gain explanations
   (title text) - closing the no-hint gap the audit found.

## Tasks

**Claude:**

1. Game: `DayReport.vue` sectioned layout + celebration card + money split + aggregation
   rules in `dayLogFormat.ts` (formatter classification, pluralisation); component tests
   (win renders as celebration, not red; noise aggregates; "1 lot" grammar).
2. Game: Buy Now relocation + two-step confirm + disabled-state titles on the auction card;
   component tests (no buyout on first click; confirm fires; reset works).
3. Full gate; no balance harness (pure presentation; buyout mechanics untouched - if any
   golden hash moves, treat it as a bug).

**User-only (maintainer):**

- Eyeball the new report and the demoted Buy Now on a live session; flag tone-of-voice
  adjustments.

## Definition of done

- Winning an auction opens the report with a celebration, not a red number; routine lines
  are aggregated, correctly pluralised, and visually quiet.
- Buying out a lot takes two deliberate clicks on a control that no longer sits against
  Raise; disabled auction buttons explain themselves.
- Full gate green; zero sim change.

## Exit

Implemented and committed.

**The sectioned report (decision 1).** A new `classifyDayReport` (`dayLogFormat.ts`) derives the
morning report's structure entirely in the game layer from a day's `DayLogEntry[]` (the sim is
untouched): winning or buying a car produces a `DayReportWin` (model, year, price); the recurring
money is summed into `{ earnedYen, onCarsYen, billsYen }`; the meaningful shop/market lines are
ordered with outbid alerts first (they're actionable); and the pure noise (market-heat drift,
catalogue refreshes, per-tick labour) is aggregated into a couple of grammar-correct quiet lines.
`DayReport.vue` renders it as sections: **win cards first** (accent-coloured, `--mg-success`
border, never red), then the compact money split, then the net delta DEMOTED to a small secondary
line (no longer the scary red headline), then the notable lines, then the dim aggregated noise.
The core item-13 fix: after winning an auction the first thing the player sees is "WON 1987 Honda
City for ¥156,030" in green, not a huge red -¥156,030.

**Pluralisation (decision 2).** A shared `pluralise(count, noun)` helper is the one place count
copy is made grammatical; the `auction-catalog-refreshed` line in `describeLogEntry` (still used by
the garage event log) and the report's aggregated noise lines both go through it, so "1 lots" is
structurally impossible now.

**Buy Now demoted and confirmed (decision 3).** Buy Now left the `.lot-action-buttons` block (which
now holds only Place/Raise) for its own separated `.buyout-row` below the bid stack, styled as a
small ghost control. It takes two clicks: the first arms a per-lot confirm ("Buy now ¥X" ->
"Confirm buyout ¥X"), the second buys - the same two-step pattern as the End Day cart confirm, so a
car can never change hands on a stray click against Raise. Arming one lot disarms any other, so a
stale confirm never lingers. The buyout's disabled state (short on cash) now explains itself in a
`title` tooltip, closing the no-hint gap the audit flagged.

**Testing.** Game: 4 new `DayReport.test.ts` tests (a won car renders as a green celebration card
with the net demoted, not red; routine noise aggregates into correctly-pluralised quiet lines with
"1 lots" proven dead; an outbid alert is first in the notable list) plus the two existing tests
still green; 4 new `AuctionScreen.test.ts` tests (first click only arms, no car changes hands;
second click completes; Buy Now is not in the bid-button block; a disabled Buy Now explains itself)
and a directive-17 rewrite of the one existing test that asserted the old single-click buyout.
`dayLogFormat.test.ts`'s catalog sample (`lotCount: 3`) already reads "3 lots", unaffected.

**Verification.** Full gate green: `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm format`,
`pnpm test:coverage` (1078 tests, 81 files; coverage 91.34%/82.17%/92.86%/95.04%, all above the
ratchet floor), `pnpm build`. No balance harness run - this is pure presentation (report layout,
a game-layer classifier, and a two-step confirm wrapper over the SAME `game.buyout`); buyout
mechanics are untouched and every sim golden hash held (the full test run passed).

**Definition of done, checked against the sprint doc:**
- Winning an auction opens the report with a celebration, not a red number; routine lines are
  aggregated, correctly pluralised, and visually quiet - yes.
- Buying out a lot takes two deliberate clicks on a control that no longer sits against Raise;
  disabled auction buttons explain themselves - yes.
- Full gate green; zero sim change - yes.
