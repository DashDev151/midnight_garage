# Sprint 19b — Auction bidding fixes: first-price, reserve-floor escalation, visible standings

*Source: maintainer feedback on Sprint 19 itself, same day (2026-07-10), before Sprint 19 was committed —
not a new playtest item. Three corrections raised in direct discussion after walking through the
mechanic in detail: (1) second-price payment is unintuitive and unwanted — "you should pay what you
bid;" (2) rival escalation starting from ¥0 wastes early auction days climbing through territory below
the reserve price, worsening the tuning problem already flagged; (3) the real current top bid was
computed (`BidHeadroom.currentTopBidYen`, explicitly commented "not obfuscated") but never actually
surfaced anywhere in the UI — a genuine gap between what was built and what shipped, not a design
choice. Status: **implemented, all checks green, pending review — bundled with Sprint 19, neither yet
committed.**

## Goal

Fix three problems in Sprint 19's multi-day bidding model before it ships: switch resolution from
second-price to first-price (you pay exactly what you bid, no more "won at ¥170k, paid ¥160k"
mismatch), give rival escalation a realistic starting point (the reserve floor, not ¥0, so early days
of a short auction aren't spent climbing through territory that could never have won anyway), and
always show the real current leading bid on every lot — not just an obfuscated qualitative bucket.

## Reuse analysis (directive 15)

### Existing mechanisms that MUST be reused

| Concern | Existing mechanism | How this sprintlet uses it |
|---|---|---|
| Rival bidder ceilings | `buildRivalField` (Sprint 10, untouched by Sprint 19) | Completely unchanged again — only how a rival's *current position* is seeded and interpreted changes, not how their fixed ceiling is generated. |
| Real current-bid tracking | `AuctionLot.rivalEscalatedBidsYen`/`playerMaxBidYen`, `BidHeadroom.currentTopBidYen` (all Sprint 19) | Reused as-is at the data layer — `currentTopBidYen` already existed and was already real (not obfuscated); this sprintlet's UI fix is exposing it, not computing something new. |
| Day-by-day escalation loop | `applyDailyEscalation` (Sprint 19) | Same loop, same per-rival 40%-chance/35%-step shape — only the *starting value* each rival escalates from changes (reserve floor instead of 0). |
| Reserve price | `AUCTION_RESERVE_PRICE_FRACTION` / the `reserveYen` computation already duplicated in `resolveAuction`/`resolveDueAuctionLot` | Reused directly inside `applyDailyEscalation` too — the same formula, not a new constant. |
| Auction resolution entry points | `resolveDueAuctionLot`, `resolveAuction` (calibration surface) | Both still exist, same call sites, same responsibilities — only the shared pure-math core they both call changes its payment rule. |

### Genuinely new mechanisms (and why nothing existing covers them)

None. This is a correction to Sprint 19's own not-yet-committed work, not new scope — no new schema
fields, no new `GameState` shape, no `SAVE_VERSION` bump. Every change is either a formula tweak inside
an existing function or exposing a number that already existed in the data model.

## Definition of Done

- A player (or bot) who wins a lot pays exactly the amount they bid — never a discounted second-price
  number. `resolveAuction`/`resolveDueAuctionLot` reflect this identically (one shared core, as before).
- Rival escalation starts each rival at (their ceiling clamped to) the reserve price, not ¥0, so every
  escalation day that actually happens moves them through territory that could realistically win.
- Every lot — bid on or not — shows its real current leading bid as a plain yen figure, always, in both
  the main catalog list and "My Active Bids." No behavior is gated behind "only shown once you've bid."
- All checks green; the Sprint 19 calibration tests (`bidding.test.ts`'s win-price bell, the interest
  read) are re-verified against the new payment rule, not just left to fail silently or get deleted.

## Decisions

1. **First-price, not second-price.** The winner's `finalPriceYen` is simply their own winning bid
   (still subject to the existing buyout-price cap on every rival ceiling — that cap is unaffected).
   `AUCTION_BID_INCREMENT_YEN` becomes dead once nothing computes a "second-highest + increment" price;
   removed rather than left as unused code (confirmed via grep: no other caller).
2. **Rival escalation starts from `min(ceiling, reserveYen)`, not 0.** A rival whose ceiling never even
   clears reserve behaves exactly as before (they were never a real threat and still aren't — this
   isn't a new rule, it's removing a wasted climb for rivals who *were* always going to be real
   threats). Computed via the same `reserveYen` formula every other resolution function already uses.
3. **The real current top bid is now always shown, on every lot, not just lots the player has bid on.**
   `BidHeadroom` already carried this number; it just wasn't wired into `AuctionScreen.vue`. The
   qualitative headroom bucket (`plenty`/`moderate`/`tight`/`critical`, decision 3 from Sprint 19) is
   kept as a secondary, supplementary label — not deleted, since removing a working, tested feature
   wasn't what was asked for — but the real number is now the primary, unmissable readout.
4. **Not addressed here, flagged honestly instead of silently absorbed:** first-price resolution means
   a winning bot/player no longer gets an automatic second-price discount, so realized acquisition
   costs will trend higher than Sprint 19's own (never-run) expectations. This is a genuine economic
   shift, not a bug — tracked in `TODO.md` as a reason to re-run `pnpm balance:run` once Sprint 19/19b
   ship, alongside the existing un-run-harness follow-up.

## Task breakdown

### Sim (`packages/sim`)

- [x] `bidding.ts`: the shared pure-math core (`resolveSecondPriceAuction`) reworked into
  `resolveTopBidAuction` — top bid wins, pays exactly what it bid. `resolveAuction`/`resolveDueAuctionLot`
  call the renamed core, unchanged at their own call-site level.
- [x] `applyDailyEscalation`: a rival's first successful raise now lands at `reserveYen` (clamped to
  their own ceiling) plus a step from there, instead of climbing from `0` — see Exit deviation 1 for a
  real bug found and fixed mid-implementation (a dominated rival was getting a phantom reserve-floor
  value written even though it never actually escalated).
- [x] `constants.ts`: removed `AUCTION_BID_INCREMENT_YEN` (confirmed dead — no other caller).
- [x] Doc-comment sweep: every "second-price" reference in `bidding.ts`, `advanceDay.ts`,
  `buyoutHelpers.ts`, `flipper.ts`, `auction.ts` (content), `gameStore.market.test.ts` updated.

### Game (`packages/game`)

- [x] `AuctionScreen.vue`: the real current top bid (`headroom.currentTopBidYen`) now renders as a
  plain yen figure ("current bid ¥X" / "no bids yet") on every lot card and in "My Active Bids,"
  unconditionally. The qualitative headroom bucket stays as a secondary label alongside it.

### Testing

- [x] `bidding.test.ts`: rewrote the `resolveAuction` payment test for first-price (winner pays exactly
  their bid); fixed two tests that assumed a "wildly over-market" bid was automatically discounted
  (under first-price it isn't — an unaffordable bid now genuinely forfeits, exposed a real test bug, not
  a production one — see Exit). The win-price bell calibration test needed no re-tuning — verified by
  running it, not assumed.
- [x] Golden masters re-pinned (both hashes moved — the escalation starting-floor fix changes stored
  rival state even for a scripted career that never bids).
- [x] Game: `AuctionScreen.test.ts` extended with a real test asserting "no bids yet" before anyone has
  bid and a real yen figure (matching the exact bid placed) afterward — not just presence of a label.

## Claude-implementable vs user-only

**Claude-implementable:** all of the above — no new dependencies, no data-layer access, no schema
change.

**User-only:** same as Sprint 19 itself — real-browser feel-testing and a `pnpm balance:run` pass are
the maintainer's to run once both 19 and 19b are reviewed together.

## Exit

**Status: implemented, all checks green, not yet committed — bundled with Sprint 19.**

All three fixes shipped as scoped. `resolveTopBidAuction` (renamed from `resolveSecondPriceAuction`)
now pays the winner exactly their own bid; `applyDailyEscalation` seeds a rival's first real move from
the reserve price instead of ¥0; `AuctionScreen.vue` shows the real current top bid on every lot,
always, not gated behind having placed a bid.

**A real bug was found and fixed mid-implementation, not just disclosed:** the first pass at the
reserve-floor fix wrote the reserve-clamped starting value into a rival's stored position on *every*
escalation call touching them — including a rival who was already dominated (their ceiling can no
longer beat the current top bid) and had never actually taken a real turn. That silently promoted a
non-threat to a phantom "already at reserve" position, breaking the existing invariant test "a rival
already beaten by the current top bid never escalates further." Fixed by treating a stored `0` as an
honest "never made a real move" sentinel: a dominated rival stays frozen at whatever it last held (`0`
if untouched), and the reserve floor is only substituted in as the base *at the moment of a rival's
first successful escalation roll*, not written speculatively in advance. Re-verified: the intended
tuning improvement survives this correction (a rival's first successful move now lands past the reserve
floor plus a step, not just a step from zero — the same order-of-magnitude improvement as originally
estimated), and the dominated-rival invariant test passes again untouched.

**Two more real bugs surfaced by first-price, in the test suite, not production code — both honestly
consequences of the mechanic change, not incidental breakage:** `bidding.test.ts`'s "an over-market bid
reliably wins" test used a 5x-book bid against a fixture with ¥10M cash — under the old second-price
model this was always safe (the automatic discount meant the player never actually paid anywhere near
5x book), but under first-price the winner pays their literal bid, and 5x a ¥4.2M book value
(¥21M) exceeds the fixture's cash entirely — the test's own win silently became an unaffordable forfeit.
Fixed by using a 2x-book bid instead (still guaranteed to beat the buyout-capped 1.1x-book rival field,
comfortably affordable). This is a direct, concrete illustration of decision 4's flagged concern: a
"safely oversized" bid is no longer automatically safe once there's no second-price discount — a bot or
player bidding well above their real intent now risks genuinely not being able to afford their own win.

Doc-comment sweep touched `bidding.ts`, `advanceDay.ts`, `buyoutHelpers.ts`, `flipper.ts`,
`content/src/auction.ts`, `gameStore.market.test.ts` — every "second-price" reference either rewritten
or, where the underlying reasoning no longer held (`buyoutHelpers.ts`'s "bots never need to raise
because second-price makes bidding true value once dominant" and `flipper.ts`'s "second-price already
extracts most of a car's value"), replaced with the real, weaker justification: these bots were always
using a fixed heuristic bid multiplier, never genuine per-rival value discovery, so first-price doesn't
change *what* they do — only that a win now costs the bot's full bid, tightening realized margins in a
way that isn't yet re-verified against the balance harness (see decision 4, tracked in `TODO.md`).

No `SAVE_VERSION` bump — confirmed no schema shape changed, only sim logic and UI. Both
`advanceDay.test.ts` golden-master hashes re-pinned (the reserve-floor fix changes stored rival state
even for a career that never bids, since `applyDailyEscalation` runs every day regardless).

307 sim tests / 175 game tests, all passing (up from 305/173 pre-sprintlet — two new game tests
covering the always-visible current-bid figure). All checks green
(`pnpm typecheck`/`lint`/`format`/`test:coverage`/`build`).

**Not yet verified with real play or `pnpm balance:run`** — same standing gap as Sprint 19 itself, both
bundled into the same not-yet-committed working tree and both the maintainer's to run.
