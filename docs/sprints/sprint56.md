# Sprint 56 - The auction card: grade stamps and the two-panel redesign

**Source:** playtest 2026-07-14 items 2, 3, 4, 5, and 8 (`docs/playtest-notes-2026-07-14.md`),
including the maintainer's rough layout mockup (described in the notes doc). Pure presentation:
no sim or economics change (the numbers on the card keep coming from the same derived sources).

## Confirmed current state (code discovery, 2026-07-14)

- The lot card is inline in `packages/game/src/screens/AuctionScreen.vue:144-225` (no child
  component): `.lot` is a 2-column grid (`160px 1fr`), left cell an empty bordered `.lot-art`
  div (`aspect-ratio: 2/1`, so ~160x80), right cell one flex column holding title/meta, guide
  value, the Sprint 50 grade line (`Grade X - Ext Y - Int Z` + restoration bill, one text
  element), reserve/bid/close status, turnout badge, the per-group `BandChip` row
  (`.lot-bands`), and the bid input + place/raise + buy-now controls.
- "(any bid resets the clock)" is authored in `gameStore.ts:1181` inside `auctionCloseLabel`;
  the template just renders the label. One-line copy edit.
- `computeAuctionGrade` returns `{ overall: 'S'|'6'|'5'|'4.5'|'4'|'3.5'|'3'|'2'|'1'|'R',
  exterior: 'A'..'E', interior: 'A'..'E' }` - `R` is the out-of-band worst (structural defect).
- Design tokens live in `packages/game/src/style.css` (`--mg-danger` #ff6b6b, `--mg-success`
  #4ade80, sodium amber `--mg-neon-violet` #d29a5a, `--mg-yen` gold, etc.). No stepper control
  exists anywhere in the app yet.
- Art bible constraints that bind here (`docs/design/art-direction.md`): rule of glow (at most
  2-3 saturated elements per screen), integer-only scaling around the 96x48 car master,
  diegetic/visceral-UI law (no control may read as a default browser widget; the control
  vocabulary prefers a rotary dial over raw steppers for value selection; status displays may
  be stamped/printed diegetic objects).
- Tests: `AuctionScreen.test.ts` - the "every lot shows its real group bands" test (Sprint 26
  decision 10) targets exactly what item 2 removes; the grade-line test expects one element
  containing all three grades plus the bill; the `.lot-art` placeholder test counts elements.

## Reuse analysis (directive 16)

**New mechanisms:**

- A `GradeStamp` component (the only genuinely new visual primitive) with a red-amber-green
  ink-color mapping.
- A bid stepper control (up/down) - no existing stepper to reuse; styled as physical push
  buttons per the art bible's feedback-stack law.

**Existing mechanisms to reuse:**

- `computeAuctionGrade` and every displayed number (guide value, reserve, bill, close label,
  turnout) - zero new data, zero sim change.
- Existing tokens (`--mg-danger`/`--mg-success`/sodium amber) as the stamp ink ramp - no new
  palette tier.
- The turnout badge, buyout button, and My Active Bids table survive as-is (the shared bids
  table stays a separate panel; the mockup's right-panel info box is per-lot data already on
  the card).
- The bid input keeps its existing store wiring (`placeBid`); steppers just adjust its value.

## Decisions

1. **Grades only (item 2).** The `.lot-bands` per-group chip row is deleted from the auction
   card. This amends Sprint 26 decision 10 / Sprint 27's pre-bid visibility law BY MAINTAINER
   DECISION: the pre-bid condition disclosure is now the grade trio plus the restoration bill
   (which already summarize the same underlying bands); full per-part truth remains on the car
   detail screen after acquisition. The Sprint 26 test is rewritten to assert the grades are
   always visible instead.
2. **Grade stamps (item 3).** A `GradeStamp.vue` component renders each grade as a chunky
   ink-stamp box (thick stamped border, slight rotation jitter per stamp, stamped-ink texture
   feel per the art bible's status-display family). Ink color ramp: green (`S`, `6`, `5` / `A`,
   `B`), sodium amber (`4.5`, `4`, `3.5` / `C`), red (`3`, `2`, `1` / `D`, `E`), with `R` the
   deepest red and visually distinct (it is the structural-defect flag). Rule-of-glow
   compliance: stamps render at muted/ink saturation by default and only reach full saturation
   on the hovered/focused card - several lots x 3 stamps at full neon would violate the bible.
3. **Two-panel card per the mockup (items 4, 5).** `.lot` becomes: LEFT panel - title/spec line,
   turnout badge, the art placeholder doubled to a 320px column (320x160 box; a future 96x48
   sprite renders inside it at 3x = 288x144 with padding, preserving integer scaling), and the
   three grade stamps in a row under the art. RIGHT panel - the info block (guide value,
   reserve, leading bid, restoration bill, close label), the bid amount field flanked by
   up/down stepper buttons, a large BID (place/raise) push button, and buy-now beneath it.
   Stepper increment derives from the lot (next minimum raise step where one exists, else a
   sensible rounded step); typing a value stays possible.
4. **Steppers, not a dial - flagged art-bible exception.** The control vocabulary prefers a
   rotary dial for value selection; the maintainer's mockup explicitly shows steppers. Default
   to the mockup: physical push-button steppers with the required press feedback stack (travel
   animation + state change; foley when audio lands). Recorded for the art bible's decisions
   log once the maintainer confirms on sight.
5. **Copy (item 8).** `auctionCloseLabel` drops the "(any bid resets the clock)" parenthetical;
   the "closes in N days unless bid on" lead-in stays (it still carries the mechanic).
6. **Tests.** Rewrite: group-bands test (now asserts stamps + no `.lot-bands`), grade-line test
   (three stamp elements instead of one text line), placeholder test if the class changes;
   add: stamp color-bucket mapping unit test on `GradeStamp` (including `R`), close-label test
   updated for the removed parenthetical.

## Tasks

**Claude:**

1. `GradeStamp.vue` + color-mapping logic + component test.
2. AuctionScreen card restructure (two-panel grid, 320px art column, stamps row, right-panel
   info/bid stack, stepper buttons wired to the existing bid input state).
3. The close-label copy edit + test updates listed in decision 6.
4. Full gate; no balance harness needed (display-only; Sprint 50 set the precedent) - state
   that explicitly in the Exit.

**User-only (maintainer):**

1. Eyeball the stamp look and the muted-by-default treatment (rule-of-glow tradeoff) on a
   running board; confirm or redirect the steppers-vs-dial exception.

## Definition of done

- No per-group condition chips on any auction card; grade stamps carry the condition read.
- Stamps are a visual feature: stamp-styled, color-ramped red to green, `R` unmistakably worst.
- The art box is 2x its old size and the card reads as the mockup's two-panel structure while
  staying inside the art bible's palette and pixel discipline.
- "(any bid resets the clock)" is gone. Full gate green; tests updated per decision 6.

## Exit

Implemented and committed.

**GradeStamp.vue (decision 2, new component):** renders one grade as a chunky ink-stamp box (thick
`currentColor` border, a fixed per-position rotation jitter so the row of three never lines up
dead-straight, no randomness so it stays snapshot-stable). Ink ramp exactly per decision 2: green
(`S`/`6`/`5` overall, `A`/`B` letter), sodium amber (`4.5`/`4`/`3.5` overall, `C` letter), red
(`3`/`2`/`1` overall, `D`/`E` letter), and `R` gets its own distinct `stamp-defect` tone (deepest
red, never folded into the ordinary red bucket) - unit-tested exhaustively (`GradeStamp.test.ts`,
14 cases) including the R-vs-red distinctness assertion. Rule-of-glow compliance: stamps render at
`saturate(0.5)` by default; `AuctionScreen.vue` reaches into the child's scoped class via `:deep()`
to bring them to full saturation only while that specific card is hovered or has focus inside it
(tabbing into the bid controls counts).

**AuctionScreen.vue two-panel restructure (decisions 1, 3, 4):** `.lot` is now a `320px 1fr` grid.
Left panel: title/spec line, turnout badge, the art placeholder doubled to a 320x160 box (was
160x80 - a future 96x48 sprite still renders inside at integer 3x, 288x144, preserving the pixel
discipline), and the three grade stamps in a row underneath. Right panel: guide value, reserve,
leading bid, restoration bill (its own line now, previously baked into the old grade-line text),
close label, then the bid stack - a raise-to field flanked by `-`/`+` stepper buttons, a large
`primary`-styled Place/Raise button (the `.primary` class already existed in this file's own CSS,
unused until now), and Buy Now beneath it. The old per-group `BandChip` row (`.lot-bands`) is
deleted outright, per decision 1 amending Sprint 26 decision 10/Sprint 27's pre-bid-transparency
law by explicit maintainer decision - full per-part truth stays on the car detail screen after
acquisition; the grade trio is the new pre-bid condition read.

**Steppers (decision 3-4):** `stepYenFor` derives the per-click delta from the lot itself - the
real bid-ladder increment (`nextRaiseYen - currentBidYen`) once a lot has a bid on the board, or a
10,000-yen fallback (the sim's own `AUCTION_BID_INCREMENT_FRACTION` floor) before it has opened and
there's no ladder step yet to read. The down-stepper is clamped at `nextRaiseYen` (a physical
stepper shouldn't let you dial below the real minimum valid raise); typing a custom value into the
field directly still works exactly as before. Steppers get a real CSS press-travel state
(`:active` moves the button down 2px and collapses its drop shadow) per the art bible's feedback-
stack law; the mechanical-sound component of that law is deferred until the audio pipeline exists,
matching the sprint doc's own "foley when audio lands" note - not implemented here. Decision 4's
art-bible exception (steppers instead of a rotary dial, since the maintainer's mockup calls for
steppers) is flagged in-code for maintainer sign-off on sight; not yet recorded in the art bible's
own decisions log pending that confirmation.

**Copy (decision 5):** `auctionCloseLabel`'s "(any bid resets the clock)" parenthetical is gone;
the "closes in N days unless bid on" lead-in is unchanged.

**Tests (decision 6):** the Sprint 26 "every lot shows its real group bands" test is rewritten to
assert the stamps are present and `.lot-bands` is gone (the amendment decision 1 makes explicit,
not a silent regression). The Sprint 50 grade-line test is rewritten to check three separate stamp
elements instead of one text line (`data-test="grade-stamp-overall/ext/int-<lotId>"`). A new test
confirms the close-label parenthetical is gone while the lead-in survives. `GradeStamp.test.ts` is
new (14 cases: every real grade value's tone bucket, plus R's distinctness). The art-placeholder
test needed no change - `.lot-art`'s class name is unchanged, only its CSS size. `LotDetail.groupBands`
itself is untouched in `gameStore.ts` (still exercised directly by `gameStore.market.test.ts`) -
only the auction card's RENDERING of it is removed, per decision 1's precise scope.

**Verification:** full gate green - `pnpm typecheck` (all 3 packages), `pnpm lint`, `pnpm format`,
`pnpm test:coverage` (1018 tests, 78 files; coverage 91.17%/81.41%/91.71%/95.02%, all above the
ratchet floor), `pnpm build`. No balance harness run - this sprint is pure presentation over
existing derived data (guide value, reserve, grade, bill, close label all unchanged sources), per
the sprint doc's own precedent (Sprint 50) and task list item 4.

**Not done by me, flagged per CLAUDE.md's UI-verification directive:** I did not start the dev
server or view the new card in a browser - starting a long-running process is outside what I'm
allowed to run myself. The sprint doc's own "User-only (maintainer)" task already assigns this:
run `pnpm dev` and eyeball the stamp look, the muted-by-default/hover-saturation treatment, and the
steppers-vs-dial exception, confirming or redirecting before this reaches the art bible's decisions
log. Test suites verify the DOM structure and logic (right data-test hooks exist, right classes
apply, right text renders) but not how it actually looks or feels to use.

**Definition of done, checked against the sprint doc:**
- No per-group condition chips on any auction card; grade stamps carry the condition read - yes.
- Stamps are a visual feature: stamp-styled, color-ramped red to green, `R` unmistakably worst -
  yes, and unit-tested.
- The art box is 2x its old size (320x160 vs 160x80) and the card reads as the mockup's two-panel
  structure while staying inside the art bible's palette (reused tokens only, no new colors) and
  pixel discipline (aspect ratio preserved, integer-scaling note kept in the CSS comment) - yes.
- "(any bid resets the clock)" is gone. Full gate green; tests updated per decision 6 - yes.

**Follow-up polish pass (maintainer live feedback against the running dev server):** stamp text
was rendering blurry (rotation angle reduced, stamps enlarged); the +/- steppers and bid input were
too small (enlarged, and the bid-field markup fixed to associate the `<label>` with only the
input, not all three controls); the title/spec line ran onto one wrapping line (`.lot-head` now a
column); the right panel read as top-bunched with everything crammed into one row at the bottom
(current price is now the centered headline, guide/reserve/bill secondary, a real "N days left"
timer chip, and a two-row, centered action block). Full gate re-verified green (374 game tests).
