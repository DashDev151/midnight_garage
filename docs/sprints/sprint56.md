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

Not started.
