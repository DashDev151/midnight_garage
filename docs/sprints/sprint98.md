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

- [ ] Sim: remove `fearPremium` (schema + `economy.json` + maths); merge the two
      estimators; `valueLedgerFor` decomposition + sum-equality probe.
- [ ] Store: ledger + two-number view models replacing the five value getters' surface
      roles (the underlying getters survive where other systems consume them).
- [ ] Screens: auction card and car page render the ledger and the two numbers; cause
      lines show deal deltas; sale range replaces ballpark.
- [ ] Copy: all new labels + the walkthrough find-step line (orchestrator-authored).
- [ ] Tests: ledger sum probe; two-number divergence (equal pre-test, diverges
      post-test); fixYen pins replaced (case (a)); probe/golden re-pins disclosed.
- [ ] economy-bible.md amendment paragraph (approval 2026-07-19).

**User-only:**

- [ ] Playtest the readability: can you predict a price change by eye now.

## Exit

- [ ] Ledger sums proven equal to the engine's totals by probe, for the anchor
      inventory.
- [ ] Pre-knowledge equality: room's number === your number on an uninspected lot,
      asserted.
- [ ] Narrow test evidence once per file; the pre-push gate is the full check.
- [ ] Any mission retune forced by decision 7, stated here with before/after numbers.
