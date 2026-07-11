# Sprint 30: Living auctions: instance-honest values, daily bidder interest, staggered arrivals

*Source: maintainer playtest 2026-07-11 (`docs/playtest-notes-2026-07-11.md`, notes 6, 14
(principled fix), 17-auctions-half). Status: **designed, ready to implement.** Depends on
Sprints 26-27 (valuation runs on the banded model and the transparent deduction formula).
Single Sonnet implementation agent; read `CLAUDE.md` first; no em dashes.*

## Why (verified diagnosis)

The "book ¥180,000" on a lot card is `model.bookValueYen`, a static per-model constant;
mileage is rolled (30k-180k) and shown but read by nothing; age is not in the value model at
all. The buy-now price is `anchor * 1.25` where the anchor already stacks condition (floor
0.35) x heat (0.70-1.40) x model risk discount (up to 0.75), which is how a 180k-book lot
shows a 91k buyout with no explanation. Rival bidding is a single demand ceiling seeded once
per lot id: below reserve means zero bids forever while the badge can still read "PACKED
TURNOUT" (Sprint 25 patched the worst of this; the model itself is still not a market). New
lots arrive as a weekly dump.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse:**

- Sprint 27's transparent `instanceValue` (clean value minus restoration bill) and the
  heat-applies-once law; the pre-bid parts display as the public information surface.
- The lot lifecycle (reserve, increments, quiet-days hammer, expiry backstop, parking/cash
  gates on wins) in `bidding.ts`: the redesign replaces the interest model, not the auction
  plumbing.
- The auction telemetry already in the balance harness (`auctionWins.csv`,
  `auctionFieldSizes.csv`, calibration report section).
- Reputation-gated tiers and `AUCTION_LOTS_PER_TIER` as the volume dials.

**Genuinely new mechanisms:**

- Age and mileage factors in the value model (content curves).
- A public per-instance guide value on the lot card as the headline number (book value is
  never shown, per Sprint 25).
- A daily bidder-interest process replacing the one-shot demand ceiling.
- Staggered lot arrivals (per-tier daily spawn) replacing the weekly batch.

## Design decisions (locked)

1. **Value model gains age and mileage inside clean value:**
   `cleanValue = bookValueYen * ageFactor(regYear) * mileageFactor(km) * heat`; Sprint 27's
   deduction (restoration bill, hassle factor, floor) then applies unchanged on top. Factors
   as content curves (piecewise; propose age: gentle to 10 years then flatter for
   future-classic tiers; mileage: 1.0 at 60k falling to ~0.75 at 180k). The Naming Layer is
   untouched; this is spec-side.
2. **The card is honest:** headline is the guide value: the same transparent
   `instanceValue` everyone prices from (conditions are public per Sprint 27; there are no
   estimates), now age/mileage-aware. Book value is never displayed anywhere (maintainer
   decision 2026-07-11, applied in Sprint 25); `model.bookValueYen` survives only as the
   internal anchor inside the formulas. Reserve and buyout derive from guide value:
   `reserve = guideValue * reserveFraction (0.5)`, `buyout = guideValue * buyoutPremium
   (1.15-1.30 rolled)`, floored above the current bid as today. A rough car's cheap buyout
   now reads as exactly that.
3. **Bidders, not a ceiling:** each overnight, rival bids arrive as a seeded draw:
   `expectedBids = interestBase(tier) * valueGapFactor(currentBid vs guideValue) *
   turnoutFactor` with turnout rolled per lot at creation (thin/steady/packed now MEANS
   bidder count band). 0-2 increments applied per night while below each rival cohort's
   private walk-away (drawn around guideValue). Quiet-days hammer and expiry backstop stay.
   Consequences the tests must prove: a packed lot cannot sit bidless while priced under its
   walk-away band; a reserve snipe on the backstop day only succeeds when turnout was
   genuinely thin; player wins above guide value become rarer as turnout rises.
4. **Staggered arrivals (note 17):** replace the `day % 7` dump with per-tier daily spawn
   probabilities calibrated to preserve current expected weekly volume (tunable up: the
   maintainer wants MORE lots than a player can chase); day-1 seed keeps a full opening
   board. The "next weekly catalog" hint is removed from `AuctionScreen.vue`.
5. **Sprint 25's interim patches** (daily ceiling re-seed, badge honesty) are superseded and
   deleted by this model.

## Definition of Done

- Value factors, pricing, bidder process, arrivals all content-tunable; no authored number in
  code (content law).
- Test suite covering decisions 1-4 including the three behavioral proofs in decision 3, all
  seeded-deterministic; goldens updated.
- Balance harness: bidder-process telemetry added (bids per lot, days-open, win price vs
  guide value) and the auction calibration section re-rendered; invariant check re-run
  (buyout share invariant re-tuned against the new buyout definition); deltas documented in
  Exit.
- Full gate green; AuctionScreen updated (est. value headline, clean book secondary, badge
  semantics, no weekly hint).

## Tasks (Claude-implementable)

- [ ] Content: age/mileage curves, pricing fractions, interest/turnout tunables.
- [ ] Sim: value factors, pricing derivation, bidder process, arrivals; remove Sprint 25
  interim code; Dexie bump if lot shape changes + goldens.
- [ ] Game: lot card and detail rework per decision 2.
- [ ] Balance telemetry + re-run; tests per DoD; Exit.

## User-only tasks

- [ ] Playtest an auction week: does the board feel alive, do buyouts read fairly, is
  sniping still possible but earned? Tune curves in JSON.

## Exit

*(Filled at implementation.)*
