# Sprint 19c — Auction economics: higher hit-rate, real ceilings, dynamic buyout

*Source: maintainer decisions, same day (2026-07-10), continuing directly from Sprint 19b — three
more corrections to Sprint 19's auction rework before it ships, driven by the maintainer's own
real-data analysis requests (a synthetic-ratio escalation sweep that got corrected into a real-data
one, then a "why are rival ceilings so low" question that traced to the bidder-discipline formula).
Status: **implemented, all checks green, pending review — bundled with Sprint 19/19b, none yet
committed.**

## Goal

Three explicit maintainer decisions, verified against real data before implementing rather than
hand-waved:

1. Raise `AUCTION_ESCALATION_DAILY_CHANCE` 0.4 → 0.6 (validated in the Sprint 19b-era real-lot sweep:
   roughly halves "steal" share in standard-length auctions without flattening flash's deliberately
   steal-prone character).
2. Rival ceilings should typically land around 0.8-1.1x book value, not the 0.6-0.8x band the old
   `AUCTION_BIDDER_DISCIPLINE` (0.7) produced — "adjust whatever you need to."
3. Bids can now exceed book value and the old fixed buyout price; when a real (revealed) bid clears
   the buyout price, buyout itself rises to match it — "the buyout price then increases to the max
   bid."

## Reuse analysis (directive 15)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprintlet uses it |
|---|---|---|
| Rival valuation formula | `valuateCarForBuyer` (Sprint 03) | Completely unchanged — only the disciplined-fraction multiplier applied on top of it (`AUCTION_BIDDER_DISCIPLINE`) is retuned. |
| Rival ceiling generation | `buildRivalField` (Sprint 10) | Same field-size bell curve, same noise range, same per-bidder archetype draw — only the artificial `Math.min(rawBid, cap)` clamp is removed. |
| Live standings tracking | `BidHeadroom`/`leadingBidYen`-equivalent logic already inside `computeBidHeadroom` (Sprint 19) | The dynamic buyout price reuses the exact same "player bid vs. highest rival escalated position" computation, factored into one shared private helper so both agree on the same number — not a second, parallel notion of "current price." |
| Steal/mid/frenzy calibration convention | `bidding.test.ts`'s existing `(price - reserve) / (buyout - reserve)` bucketing (Sprint 10) | Reused as the verification yardstick throughout this sprintlet's own analysis — not a new metric invented for this change. |

### Genuinely new mechanisms (and why nothing existing covers them)

1. **A dynamic, state-aware buyout price.** Every prior sprint's buyout price was a pure function of
   book value alone. Nothing existing represents "the guaranteed-win price, which can rise if the
   auction gets competitive" — this is a genuinely new relationship between live bidding state and the
   buyout mechanic, not a retune of an existing number.

## Decisions (as given, verified empirically before implementing)

1. **`AUCTION_ESCALATION_DAILY_CHANCE`: 0.4 → 0.6.** Carried over from the Sprint 19b-era analysis
   session (see that conversation's real-lot sweep, not repeated here) — confirmed again after the
   discipline/cap changes below didn't invalidate it.
2. **`AUCTION_BIDDER_DISCIPLINE`: 0.7 → 0.95.** Verified via a real (buyer, car) valuation sample
   (12,000 pairs, actual roster and buyer archetypes, actual `valuateCarForBuyer` output, actual noise
   range): at 0.7 the resulting bid distribution centered at p25=0.59x/median=0.65x/p75=0.73x book — the
   0.6-0.8x band the maintainer flagged as too low. At 0.95: p25=0.80x/median=0.89x/p75=0.99x/p90=1.09x
   — the requested 0.8-1.1x band, with a real (not artificially capped) tail above it (15.3% of raw
   bids exceed 1.0x book, 8.7% exceed 1.1x, before noise/order-statistics effects that push the
   *winning* bid even higher).
3. **`buildRivalField`'s `Math.min(rawBid, cap)` clamp removed entirely.** Ceilings are now purely
   `valuation × discipline × noise`, uncapped — the direct enabler of decision 2's upper tail and the
   maintainer's explicit "bids can now go higher than book price."
4. **Buyout price is now dynamic**, via a new exported `computeBuyoutPriceYen(lot)`:
   `max(bookValue × 1.1, currentLeadingBidYen)`, where the leading bid is the same "player's committed
   max vs. highest rival escalated position" figure the headroom gauge already surfaces — reusing
   Sprint 19b's "always show the real number" infrastructure rather than inventing a second one. Only
   reacts to *revealed* bids (never a hidden ceiling nobody has actually bid yet), so it never leaks
   information escalation itself hasn't already surfaced. Threaded through every real call site:
   `resolveBuyoutInstant` (the actual charge), `buyoutHelpers.ts`'s `shouldBuyout`/`acquireLot` (bot
   decision-making), and `gameStore.ts`'s `lotDetail` (the UI's "Buy now" price).

## Task breakdown

### Sim (`packages/sim`)

- [x] `constants.ts`: `AUCTION_ESCALATION_DAILY_CHANCE` 0.4→0.6, `AUCTION_BIDDER_DISCIPLINE` 0.7→0.95,
  both with real-data-verified rationale in their own doc comments (not just the bare numbers).
- [x] `bidding.ts`: removed the buyout-price clamp in `buildRivalField`; added `baseBuyoutPriceYen`
  (private, the old pure book-value formula, kept as the *floor*) and exported `computeBuyoutPriceYen`
  (the real, dynamic price); factored the shared "leading bid" computation out of `computeBidHeadroom`
  and `applyDailyEscalation` into one private `leadingBidYen` helper (DRY — it existed inline, twice,
  before this).
- [x] `resolveBuyoutInstant`: charges `computeBuyoutPriceYen`, not the static formula.
- [x] `buyoutHelpers.ts`: `shouldBuyout`/`acquireLot` both use `computeBuyoutPriceYen` — a bot can now
  correctly reason about a lot where a rival is already leading above the static floor.

### Game (`packages/game`)

- [x] `gameStore.ts`: `lotDetail.buyoutPriceYen` now calls `computeBuyoutPriceYen(lot)` — no other
  game-layer change needed; `AuctionScreen.vue` already just displays whatever `lotDetail` provides.

### Testing

- [x] `buyoutHelpers.test.ts`: two tests that hardcoded a specific "quiet" seed (assuming
  `shouldBuyout` would read `false`) broke, because the retuned discipline made that specific seed
  genuinely hot now — not a bug, a real behavior shift. Fixed by adding a `findQuietSeed` helper that
  searches for a qualifying seed (mirroring the file's own existing pattern for finding a *true* seed),
  so the test is robust to future retuning instead of depending on one magic number.
- [x] `bidding.test.ts`: replaced "no rival bid ever exceeds buyout" (a now-false invariant, by design)
  with two new tests — one confirming rivals genuinely can exceed the static buyout floor, one
  confirming buyout still always guarantees a win by rising to match any revealed leading bid.
  Recalibrated "the win-price distribution is a bell": `resolveAuction` (complete information, no
  escalation) now legitimately produces ~90%+ frenzy for this file's most-desired fixture car — verified
  via a real sweep, not assumed — so a new test asserts *that* directly instead of chasing an outdated
  low-frenzy target. A second, new test measures the *real* player-facing distribution (through the
  actual `applyDailyEscalation`, at a realistic 3-day duration) and keeps the original bell-shape
  assertion there, where it's actually meaningful.
- [x] Golden masters re-pinned (both hashes moved — the retuned constants change RNG-independent rival
  values and RNG-consumption shape).
- [x] Game: no test changes needed — the dynamic buyout price flows through existing
  `AuctionScreen.test.ts`/`gameStore.market.test.ts` coverage unchanged.

## Claude-implementable vs user-only

**Claude-implementable:** all of the above.

**User-only:** real-browser feel-testing and `pnpm balance:run`, same standing item as Sprint 19/19b —
now with a third reason to re-run it (bidder discipline directly changes realized acquisition costs
across every bot).

## Exit

**Status: implemented, all checks green, not yet committed — bundled with Sprint 19/19b.**

All three decisions shipped as given, each grounded in real data before implementation rather than
estimated:

1. **Escalation chance** — carried over from the prior real-lot sweep, unaffected by the discipline/cap
   changes below (re-verified after implementing everything: standard-duration steal share stays low).
2. **Bidder discipline retune (0.7 → 0.95)** — grounded in an actual 12,000-pair real (buyer, car)
   valuation sample, not an assumed average. Chose 0.95 over the more aggressive 1.0 specifically to
   preserve *some* of the "dealer needs resale margin" concept `auctionBidValueFor`'s own docstring
   describes, while still landing squarely in the requested 0.8-1.1x band.
3. **Dynamic buyout** — a genuinely new mechanism (not in Sprint 19's original design), implemented as
   a pure function of already-tracked state, reusing Sprint 19b's "leading bid" concept rather than
   adding a second source of truth.

**A real, structural finding surfaced verifying decision 2 against decision 1, not assumed away:**
raising bidder discipline this much means `resolveAuction`'s "complete information, no escalation"
calibration surface now produces frenzy on the strong majority of its own resolutions for a
strongly-desired car — verified at ~90-95% via a real sweep, not estimated. This is *correct*, not a
regression: escalation is what throttles real player-facing prices down from that theoretical ceiling,
and a real multi-day sweep (using the actual `applyDailyEscalation`, not a reimplementation) confirms
the throttled, real distribution is well-shaped — near-zero frenzy for 1-2 day auctions, mid clearly
dominant through the standard 2-4 day range, frenzy climbing to a meaningful-but-not-overwhelming
minority by the top of that range, and only becoming the norm for the long (7-10 day) auctions
explicitly reserved for legend-tier/rare cars, where sustained bidding wars are thematically the point.
`bidding.test.ts`'s calibration tests were split in two to reflect this honestly: one asserting the
complete-information surface's real (frenzy-dominant) shape, one asserting the real escalated
experience's (mid-dominant) shape — rather than one test quietly measuring the wrong surface.

**A real bug was found and fixed in the verification tooling itself, not the production code — disclosed
because it could have produced a false "everything's fine" reading otherwise:** an early version of the
real-data verification script called `generateAuctionCatalog` with `count=1` inside a loop, varying only
the RNG seed — but a lot's id (which is what actually seeds its rival field) is built from the in-batch
index, not the RNG seed, so every "sample" in that loop silently reused the identical frozen rival field.
Caught by cross-checking the script's numbers against the real `bidding.test.ts` test's own (correct,
genuinely-varied-id) result and finding they disagreed; fixed by generating one real batch per tier
(`count > 1`, genuinely distinct ids) instead of looping single-lot calls — the same pattern the
project's very first, valid escalation sweep already used correctly, and the same pattern
`bidding.test.ts`'s own `statLots` helper already used.

No `SAVE_VERSION` bump — no schema shape changed, only sim constants/logic and one UI-facing derived
number. Both `advanceDay.test.ts` golden-master hashes re-pinned. 309 sim tests / 176 game tests, all
passing. All checks green (`pnpm typecheck`/`lint`/`format`/`test:coverage`/`build`).

**Not yet verified with real play or `pnpm balance:run`** — same standing gap as Sprint 19/19b, now
compounded: bidder discipline directly changes every bot's realized acquisition cost (no more automatic
second-price-style headroom, and now a materially higher ceiling to bid against), so the balance
harness re-run already tracked in `TODO.md` is more load-bearing than before, not just a nice-to-have.
