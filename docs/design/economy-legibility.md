# Economy legibility redesign (approved 2026-07-19)

**Status:** approved by the maintainer 2026-07-19 ("agreed... this looks like a very good
foundation"), following the full pipeline walkthrough recorded in
`docs/playtest_notes/playtest-notes-2026-07-19.md` items 26-28 and the chat design
session of the same day. Implementation staged as Sprints 98-101. The maintainer tunes
numbers further through playtesting; this document fixes the STRUCTURE.

**Thesis:** keep the maths, print the ledger, and make knowledge the only thing that
separates the player's number from the market's.

The diagnosis triad (hidden truth, public fear, private knowledge) is the design's crown
jewel and is untouched. The changes remove stacked invisible multipliers, collapse five
player-facing value surfaces to two, and move auction drama from an invisible overnight
simulation to a visible room.

## Plank 1: every price is a visible ledger

The value engine's structure survives (clean value, expectation-band bill split,
aftermarket premium with foundation gate). What changes is presentation: every surface
that shows a price derives it from a shared LEDGER view: an ordered list of labelled
line items summing to the total, e.g.

    Book               ¥220,000
    Wear (to worn)     -¥15,000     (¥10,000 of work; buyers knock off 1.5x)
    Polish shortfall   -¥16,000
    The tick           -¥28,500     (the room's odds on its causes)
    The room says      ¥176,500

The 1.5 `marketRepairDiscount` keeps exactly one job, now stated on screen: it is the
margin the market pays whoever does the work. No formula changes in this plank; the
ledger is a decomposition of the existing arithmetic.

## Plank 2: two numbers, and knowledge is the only wedge

- `diagnosis.fearPremium` (1.1) is REMOVED. The cause-weighted expected damage already
  is the fear; the premium was a second thumb on the scale. Consequence, by
  construction: `sheetGuideValueYen === expectedTrueValueYen` before any narrowing, so
  the two functions collapse into one estimator parameterised by the cause set
  (all causes = the room's read; remaining causes = the player's read).
- Every surface shows at most two prices: **the room's number** (apparent + all-cause
  fear, never moves) and **your number** (remaining-cause estimate, moves only when the
  player learns something). Pre-knowledge the two are equal; the moment of divergence IS
  the gameplay.
- Per-cause figures on symptom checklists are DEAL deltas ("if it's this: -¥X off her
  value"), because the decision at the block is a deal decision. Wrench costs live on
  the bench buttons where they are charged. (This supersedes the same-day "fix about"
  metric once the ledger lands; the fix figure's job is done better by the deal delta
  plus honest bench pricing.)
- Retired as separate concepts: "guide (as graded)" (becomes the room's number),
  "ballpark value" (becomes your number with the taste range: "expect ¥A-¥B depending
  who bites"), "projected profit" (your number minus the ledger's spend lines).

## Plank 3: the auction is a room, not an overnight simulation

The deferred live-bidding investigation (TODO, 2026-07-12) is the correct instinct and
becomes the plan of record:

- A lot lists with visible interest ("3 dealers circling" - turnout, now shown).
- Entering the room resolves the contest in ONE sitting: an open raise ladder, each
  dealer visibly raising or dropping out, the player choosing raise or pass each turn.
  No timers, no reflex input; decision-paced throughout (accessibility law).
- Dealer ceilings stay anchored to the room's number with a turnout-dependent wobble;
  the player now watches ceilings break instead of inferring them.
- Deleted with the overnight model, once the demo is accepted: per-night raise chances,
  the value-gap eagerness curve, competitive-pressure exponentiation, quiet-day
  counters, anti-snipe, `maxIncrementsPerNight`, `AUCTION_WHOLESALE_FRACTION` (folds
  into the wobble). Survivors: turnout weights, wobble spreads, the increment ladder.
- Gate: a throwaway one-screen demo FIRST (the maintainer's own 2026-07-12 ruling),
  coexisting with the current system; the replacement proceeds only on their verdict.

## Plank 4: fewer constants, one job each

| Constant | Fate | Job |
|---|---|---|
| marketRepairDiscount 1.5 | keeps | the margin engine, printed on the ledger |
| expectationByTier table | keeps | tier norms (kei = worn is normal) |
| partsRetention 0.55, genuinePeriodMultiplier 1.25 | keep | aftermarket law |
| foundation gate table | keeps | foundation law |
| tasteSpread 0.12 | keeps | the only place stats/authenticity price in |
| reserve 0.6, buyout 1.25 | keep | room entry/exit prices |
| turnout weights + wobble spreads + increment | keep | all remaining auction texture |
| fearPremium 1.1 | REMOVED (Sprint 98) | none - the odds already carry the fear |
| wholesale 0.97 | REMOVED (Sprint 100) | folds into the wobble |
| per-night bid machinery (chances, curves, quiet days, snipe) | REMOVED (Sprint 100) | replaced by the visible room |
| mileageFactorCurve | maintainer option (Sprint 101) | replaced by mileage-correlated generation: the odometer becomes a hint about condition, not a second tax on it |

## Staging

- **Sprint 98 - the ledger and the two numbers.** Fear premium out, estimator collapse,
  ledger view, surface collapse, deal-delta cause lines, copy. Maths barely moves;
  legibility transforms. Ships alone.
- **Sprint 99 - the live room demo.** Throwaway screen, sample lot, real ceilings.
  Maintainer verdict gates Sprint 100.
- **Sprint 100 - the room replaces the overnight sim.** Deletes the knob farm; lot
  lifecycle simplifies; probes re-pinned.
- **Sprint 101 (optional) - mileage into generation.** High-km lots roll worse bands;
  the value curve flattens toward removal.

## Governance and risks

- economy-bible.md amendment required at Sprint 98 (fear premium removal; the ledger
  presentation law; the two-number surface law) - the maintainer's 2026-07-19 approval
  is recorded here and gets recorded in the bible with the amendment.
- Removing the premium raises sheet values slightly (the discount shrinks), so reserves
  rise: the tutorial probe's spend/profit bounds and the coherence probes re-derive;
  Yuki's mission economics stay under Sprint 91's near-break-even ruling (retune payout
  only if the bounds genuinely break, and say so).
- Golden-master hashes move wherever sheet-derived state moves; re-pins are value moves,
  disclosed per test law.
- The walkthrough's "the room has priced that noise as if it were the worst thing it
  could be" line becomes untrue without the premium (the room prices the odds); the
  tutorial copy adjusts in Sprint 98.
