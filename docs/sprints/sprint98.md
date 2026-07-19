# Sprint 98: The ledger and the two numbers (economy legibility, stage 1)

**Date:** 2026-07-19
**Source:** `docs/design/economy-legibility.md` (approved 2026-07-19), planks 1, 2 and 4.
Playtest 2026-07-19 items 26-28 are the origin. Sprints 99-101 carry planks 3 and the
mileage option.

**Goal:** the same economy, readable. One additive ledger behind every price; exactly two
player-facing numbers (the room's, yours); the fear premium gone so the two are equal
until the player learns something; per-cause figures stated in deal terms.

## Reuse analysis (directive 16)

**Existing mechanisms reused (nothing about the value engine is rebuilt):**

- `marketValueYen` and its atoms (`instanceBaseValueYen`, `carCostToBandYen`,
  `costToBandYen`, `installedPartsValueYen`, `foundationFactor`, `expectationByTier`):
  unchanged. The ledger is a DECOMPOSITION of this function, never a second value
  computation (the split at the expectation band is already exact by construction,
  `bands.ts`).
- `symptomDiscountYen` and its cause-weighted averaging: unchanged machinery; it simply
  stops being multiplied by a premium.
- `expectedTrueValueYen` / `playerEstimateYen`: become two entry points of ONE estimator
  parameterised by cause set (all vs remaining) - a merge, not new maths.
- The per-cause deal delta REUSES the pre-2026-07-19 `deltaYen` computation
  (marketValue with the cause applied minus apparent) - restored under an honest label.
- `estimatedSaleValue` / `valuateCarForBuyer` / `tasteSpread`: unchanged; the sale
  surface presents their existing min/max as a range.
- `anchorValueYen` stays the single seam every auction price routes through.
- Content law: the ledger's labels are copy; every number stays a derivation of
  `economy.json` knobs.

**Genuinely new mechanisms:**

1. `valueLedgerFor` - a sim-side decomposition returning ordered labelled line items
   (book, mileage, heat when active, wear-to-expectation, polish shortfall, aftermarket
   premium after gates, fear) that PROVABLY sum to the existing total (a probe asserts
   ledger sum === marketValueYen / room value for every roster worst-case).
2. The two-number surface contract: "the room says" / "you say", and the rule that
   "you say" renders only once it differs (the divergence moment is the reveal).
3. Removal of `diagnosis.fearPremium` from schema, content and maths.

## Decisions

1. **Fear premium removed** (`economy.json` `diagnosis.fearPremium`, its schema field,
   and the multiplier in `sheetGuideValueYen`). The room's read becomes exactly the
   cause-weighted expectation. `sheetGuideValueYen` and `expectedTrueValueYen` collapse
   into one function (working name `estimateValueYen(car, model, state, context,
   causeSet)`); `carGuideValueYen`/`anchorValueYen` route through it with the all-cause
   set, `playerEstimateYen` with the remaining set. Economy-bible amendment recorded in
   the bible with the maintainer's 2026-07-19 approval.
2. **The ledger is sim-derived, exact, and probed.** `valueLedgerFor` lives in
   `packages/sim` (pure decomposition beside `marketValueYen`); a Vitest probe asserts
   line-item sums equal the totals for the anchor inventory and worst-case rolled cars.
   The UI renders lines verbatim; it never computes a yen figure of its own.
3. **Surface collapse.** Auction card: room's number + ledger (compact, the fear line
   included) + "you say ¥Y" once diverged. Car page: your number + ledger + the sale
   range ("expect ¥A-¥B depending who bites" from the existing taste bounds); the
   separate "Guide value", "Ballpark value" and "Projected profit" rows are replaced (
   profit shows as "your number - spent so far", derived from the same two sources it
   always was).
4. **Per-cause lines in deal terms**: "if it's this: -¥X" via the restored value-delta
   computation. The same-day "fix about ¥X" metric is superseded (its job - connecting
   the card to later costs - is done by the deal delta at the block plus the honest
   prices on the bench buttons). Directive 17 case (a) for every test that pinned
   `fixYen`.
5. **Copy (orchestrator-personal, tone law):** ledger line labels, "the room says" /
   "you say" phrasing, the sale-range line, and the walkthrough fix: the find step's
   "priced that noise as if it were the worst thing it could be" becomes odds-true (the
   room prices the tick at the odds; certainty is what the stethoscope buys you).
6. **Out of scope:** anything auction-flow (Sprint 99/100), the mileage curve
   (Sprint 101), rival behaviour, mission economics EXCEPT as the probes force
   (decision 7).
7. **Probe re-derivation is expected and disclosed.** Removing the premium shrinks the
   fear discount, so sheets and reserves rise slightly: `tutorialProbe` and
   `storyMissionProbes` re-derive; if Yuki's spend/profit bounds break, the payout
   retunes to keep Sprint 91's near-break-even ruling and the change is stated in this
   doc's Exit. `valueModelProbes` and golden masters re-pin as value moves.

## Tasks

**Claude-implementable:**

- [x] Sim: `fearPremium` removed (schema + `economy.json` + `sheetGuideValueYen`); one
      estimator body behind the three exported names; `valueLedgerFor`/`roomLedgerFor`
      built from the engine's own cumulative checkpoints (exact by construction, no
      tolerance); `packages/sim/tests/valueLedger.test.ts`.
- [x] Store: `lotDetail.ledger` (room variant), `carDetail.yourNumberYen` (the player's
      estimate while a symptom is live, the honest value otherwise), `carDetail.
      valueLedger`, `carDetail.saleRangeYen` from the taste spread; `dealDeltaYen`
      restored on cause lines, the fix-fee plumbing removed.
- [x] Screens: "the room says" + compact ledger on every lot card; "you say" at the
      divergence moment; the car page's ledger block, "You say" row, sale range
      ("Expect A to B, depending who bites"), and deal-delta cause lines.
- [x] Copy: ledger labels (`utils/ledgerLabels.ts`), the ledger HelpHint, and the
      walkthrough find step re-anchored to odds-truth ("the room can only price that
      noise at the odds") - all orchestrator-authored and swept in situ.
- [x] Tests: ledger sums exact for every roster worst-case and generated lots across
      heats; sheet === expected === estimate pre-knowledge asserted; you-say absent
      before a test and present after; fixYen pins replaced (case (a)).
- [x] economy-bible.md: audit-table row updated and the 2026-07-19 amendment logged
      with the maintainer's approval.

**User-only:**

- [ ] Playtest the readability: can you predict a price change by eye now.

## Exit

- [x] Ledger sums proven equal to the engine's totals: per roster model worst-case and
      guard-softened cars at heats 100/83, plus five generated lots at heats
      100/91/117, all exact; the tutorial lot's room ledger sums to its guide with one
      negative fear line last.
- [x] Pre-knowledge equality asserted on the untested tutorial lot.
- [x] No mission retune was needed: with the premium gone the reserve rose, and the
      tutorial probe's bounds all held unchanged (spend + one mistake within the
      envelope; profit small-positive; reserve a genuine bargain against honest value).
- [x] Value re-pins, disclosed: advanceDay golden hashes 7916de2b -> f3260a34 and
      8bf7a06b -> 9d907164 (symptomatic lots reprice premium-free); three
      premium-arithmetic test pins rewritten to the new truth (equality pre-knowledge,
      divergence after narrowing).
- [x] Narrow evidence once per file: sim slice 177 + 74 + 15, surface slice 91, guards
      14 + copy guard 1 - all green. The pre-push hook on this sprint's push is the
      full gate. NOT yet committed: awaiting maintainer review per the sprint workflow.
